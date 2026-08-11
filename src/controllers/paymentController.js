import Payment from '../models/Payment.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { createAuditLog } from '../services/auditLogService.js';

/**
 * GET /api/payments
 * Get paginated payment ledger with filters for payoutStatus, status, and search
 */
export const getPaymentRecords = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const { search, payoutStatus, paymentStatus, startDate, endDate } = req.query;

    const query = {};

    // Filter by payout status (Pending / Completed)
    if (payoutStatus && payoutStatus !== 'All') {
      query.payoutStatus = payoutStatus;
    }

    // Filter by customer payment status
    if (paymentStatus && paymentStatus !== 'All') {
      query.status = paymentStatus;
    }

    // Date range filtering
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Search by orderId, customerName, providerName
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { orderId: searchRegex },
        { customerName: searchRegex },
        { providerName: searchRegex },
        { transactionId: searchRegex }
      ];
    }

    const [rawPayments, total] = await Promise.all([
      Payment.find(query)
        .populate('order', 'orderRef status pricing')
        .populate('customer', 'fullName email')
        .populate('provider', 'fullName providerDetails')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payment.countDocuments(query)
    ]);

    // Format fields for frontend display
    const payments = rawPayments.map((p) => {
      const oId = p.orderId || p.order?.orderRef || `#ORD-${p._id.toString().substring(18, 24).toUpperCase()}`;
      const cName = p.customerName || p.customer?.fullName || 'Customer';
      const pName = p.providerName || p.provider?.fullName || p.provider?.providerDetails?.businessName || 'Provider';

      return {
        _id: p._id,
        id: oId,
        date: p.createdAt,
        cleaners: pName,
        customer: cName,
        amount: p.amount,
        comm: p.commissionAmount,
        commissionRate: p.commissionRate,
        providerPayoutAmount: p.providerPayoutAmount,
        status: p.payoutStatus || 'Pending',
        paymentStatus: p.status || 'Paid',
        method: p.method || 'mpesa',
        transactionId: p.transactionId || null,
        payoutReference: p.payoutReference || null,
        payoutProcessedAt: p.payoutProcessedAt || null
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        payments,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/payments/metrics
 * Computes financial ledger metrics using MongoDB aggregation
 */
export const getPaymentMetrics = async (req, res, next) => {
  try {
    const [totalsAgg, pendingAgg] = await Promise.all([
      // Aggregation for Total Revenue & Total Commissions on Paid transactions
      Payment.aggregate([
        { $match: { status: 'Paid' } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$amount' },
            totalCommissions: { $sum: '$commissionAmount' }
          }
        }
      ]),
      // Aggregation for Pending Provider Payouts
      Payment.aggregate([
        { $match: { status: 'Paid', payoutStatus: 'Pending' } },
        {
          $group: {
            _id: null,
            pendingCommissionPayouts: { $sum: '$providerPayoutAmount' },
            pendingCount: { $sum: 1 }
          }
        }
      ])
    ]);

    const totalRevenue = totalsAgg[0]?.totalRevenue || 0;
    const totalCommissions = totalsAgg[0]?.totalCommissions || 0;
    const pendingCommissionPayouts = pendingAgg[0]?.pendingCommissionPayouts || 0;
    const pendingCount = pendingAgg[0]?.pendingCount || 0;

    return res.status(200).json({
      success: true,
      data: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCommissions: Math.round(totalCommissions * 100) / 100,
        pendingCommissionPayouts: Math.round(pendingCommissionPayouts * 100) / 100,
        pendingCount
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/payments/:id
 * Retrieve full detail payload for a single payment record
 */
export const getPaymentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payment = await Payment.findById(id)
      .populate('order')
      .populate('customer', 'fullName email phone')
      .populate('provider', 'fullName email phone providerDetails')
      .lean();

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    return res.status(200).json({ success: true, data: payment });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payments/:id/settle-payout
 * Settles a single pending payout to provider
 */
export const settlePaymentPayout = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payment = await Payment.findById(id);

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    if (payment.payoutStatus === 'Completed') {
      return res.status(400).json({
        success: false,
        message: `Payout for order ${payment.orderId || id} has already been settled.`
      });
    }

    const payoutRef = `B2C-PAY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    payment.payoutStatus = 'Completed';
    payment.payoutReference = payoutRef;
    payment.payoutProcessedAt = new Date();
    payment.payoutProcessedBy = req.user.id;
    await payment.save();

    // Create Audit Log
    await createAuditLog({
      req,
      user: req.user,
      action: 'Payout Completed',
      details: `Settled provider payout of KES ${payment.providerPayoutAmount} for Order ${payment.orderId || payment._id}`,
      status: 'Success',
      category: 'Payment',
      metadata: {
        paymentId: payment._id,
        payoutReference: payoutRef,
        amount: payment.providerPayoutAmount
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Provider payout settled successfully.',
      data: payment
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payments/process-payouts
 * Bulk settles all pending payouts
 */
export const processBulkPayouts = async (req, res, next) => {
  try {
    const pendingPayments = await Payment.find({ payoutStatus: 'Pending' });

    if (pendingPayments.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No pending payouts to process.',
        data: { processed: 0, totalAmount: 0 }
      });
    }

    let processedCount = 0;
    let totalPayoutAmount = 0;

    for (const payment of pendingPayments) {
      const payoutRef = `B2C-BULK-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      payment.payoutStatus = 'Completed';
      payment.payoutReference = payoutRef;
      payment.payoutProcessedAt = new Date();
      payment.payoutProcessedBy = req.user.id;
      await payment.save();

      processedCount++;
      totalPayoutAmount += payment.providerPayoutAmount || (payment.amount - payment.commissionAmount);
    }

    // Audit Log
    await createAuditLog({
      req,
      user: req.user,
      action: 'Bulk Payouts Processed',
      details: `Processed ${processedCount} pending payouts totaling KES ${totalPayoutAmount}.`,
      status: 'Success',
      category: 'Payment',
      metadata: {
        processedCount,
        totalPayoutAmount
      }
    });

    return res.status(200).json({
      success: true,
      message: `Successfully processed ${processedCount} payouts.`,
      data: {
        processed: processedCount,
        totalAmount: Math.round(totalPayoutAmount * 100) / 100
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/payments/export
 * Export filtered payment ledger to CSV file
 */
export const exportPaymentRecords = async (req, res, next) => {
  try {
    const { search, payoutStatus, paymentStatus, startDate, endDate } = req.query;

    const query = {};
    if (payoutStatus && payoutStatus !== 'All') query.payoutStatus = payoutStatus;
    if (paymentStatus && paymentStatus !== 'All') query.status = paymentStatus;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { orderId: searchRegex },
        { customerName: searchRegex },
        { providerName: searchRegex }
      ];
    }

    const payments = await Payment.find(query).sort({ createdAt: -1 }).lean();

    const headers = ['Order ID', 'Date', 'Cleaner', 'Customer', 'Amount (KES)', 'Commission (KES)', 'Payout Status', 'Payment Method', 'Transaction Ref', 'Payout Ref'];

    const rows = payments.map((p) => {
      const formattedDate = p.createdAt
        ? new Date(p.createdAt).toISOString().replace('T', ' ').substring(0, 16)
        : '';
      return [
        `"${p.orderId || p._id}"`,
        `"${formattedDate}"`,
        `"${(p.providerName || 'Provider').replace(/"/g, '""')}"`,
        `"${(p.customerName || 'Customer').replace(/"/g, '""')}"`,
        p.amount || 0,
        p.commissionAmount || 0,
        `"${p.payoutStatus || 'Pending'}"`,
        `"${p.method || 'M-Pesa'}"`,
        `"${p.transactionId || ''}"`,
        `"${p.payoutReference || ''}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Aura_Laundry_Payment_Records.csv');
    return res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};
