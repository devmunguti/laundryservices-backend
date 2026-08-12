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

/**
 * POST /api/payments/request-payout
 * Endpoint for cleaners/providers to request payout settlement subject to system minimum threshold
 */
export const requestProviderPayout = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const requestedAmount = parseFloat(amount);

    if (isNaN(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid payout amount requested.' });
    }

    const { getOrInitSettings } = await import('../services/systemSettingsService.js');
    const settings = await getOrInitSettings();
    const minThreshold = settings?.financial?.minimumPayoutThreshold ?? 5000;

    if (requestedAmount < minThreshold) {
      return res.status(400).json({
        success: false,
        message: `Minimum payout threshold is KES ${minThreshold.toLocaleString()}.`
      });
    }

    await createAuditLog({
      req,
      user: req.user,
      action: 'Payout Requested',
      details: `Provider requested payout of KES ${requestedAmount}.`,
      status: 'Success',
      category: 'Payment'
    });

    return res.status(200).json({
      success: true,
      message: `Payout request of KES ${requestedAmount.toLocaleString()} submitted successfully.`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payments/checkout
 * Initiate customer payment for an order via PayHero STK push or COD
 */
export const checkoutOrderPayment = async (req, res, next) => {
  try {
    const { orderId, paymentMethod = 'mpesa', phoneNumber } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'orderId is required.' });
    }

    const order = await Order.findById(orderId).populate('customer').populate('provider');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // Customer authorization check (IDOR safety when logged in)
    if (req.user && req.user.role === 'customer' && order.customer && order.customer._id.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You are not authorized to pay for this order.' });
    }

    // Authoritative total calculation server-side (Never trust frontend amount)
    const payableAmount = order.pricing?.grandTotal || 0;
    if (payableAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid order payable amount.' });
    }

    // Check if an existing payment is already paid
    const paidPayment = await Payment.findOne({ order: order._id, status: { $in: ['Paid', 'paid'] } });
    if (paidPayment) {
      return res.status(400).json({ success: false, message: 'This order has already been paid for.' });
    }

    // Unique internal reference
    const internalReference = `AURA-PAY-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (paymentMethod === 'cod') {
      let payment = await Payment.findOne({ order: order._id, status: { $in: ['pending', 'processing', 'Pending', 'Processing'] } });
      if (!payment) {
        payment = new Payment({ order: order._id });
      }
      payment.orderId = order.orderRef;
      payment.customer = order.customer?._id || null;
      payment.provider = order.provider?._id || null;
      payment.customerName = order.customer?.fullName || 'Customer';
      payment.providerName = order.provider?.fullName || order.provider?.providerDetails?.businessName || 'Provider';
      payment.method = 'cod';
      payment.status = 'pending';
      payment.payoutStatus = 'Pending';
      payment.amount = payableAmount;
      payment.transactionId = internalReference;
      await payment.save();

      await createAuditLog({
        req,
        user: req.user,
        action: 'Payment Initiated',
        details: `Cash on Delivery selected for Order ${order.orderRef} (KES ${payableAmount})`,
        status: 'Success',
        category: 'Payment'
      });

      return res.status(200).json({
        success: true,
        message: 'Cash on Delivery selected successfully',
        data: {
          paymentId: payment._id,
          status: 'pending',
          method: 'cod'
        }
      });
    }

    // M-Pesa / PayHero path
    const { normalizePhoneNumber, initiateMpesaPayment } = await import('../services/payheroService.js');
    const normalizedPhone = normalizePhoneNumber(phoneNumber || req.user?.phone);

    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid Kenyan M-Pesa phone number (e.g. 07XXXXXXXX or 01XXXXXXXX).'
      });
    }

    // Reuse or create payment record with 'processing' status
    let payment = await Payment.findOne({ order: order._id, status: { $in: ['pending', 'processing', 'Pending', 'Processing'] } });
    if (!payment) {
      payment = new Payment({ order: order._id });
    }
    payment.orderId = order.orderRef;
    payment.customer = order.customer?._id || null;
    payment.provider = order.provider?._id || null;
    payment.customerName = order.customer?.fullName || 'Customer';
    payment.providerName = order.provider?.fullName || order.provider?.providerDetails?.businessName || 'Provider';
    payment.method = 'mpesa';
    payment.status = 'processing';
    payment.payoutStatus = 'Pending';
    payment.amount = payableAmount;
    payment.transactionId = internalReference;
    payment.phoneNumber = normalizedPhone;
    payment.initiatedAt = new Date();
    await payment.save();

    let payheroRes;
    try {
      payheroRes = await initiateMpesaPayment({
        amount: payableAmount,
        phoneNumber: normalizedPhone,
        reference: internalReference,
        description: `Order ${order.orderRef} Laundry Payment`
      });
    } catch (payheroErr) {
      payment.status = 'failed';
      payment.failureReason = payheroErr.message;
      payment.failedAt = new Date();
      await payment.save();

      await createAuditLog({
        req,
        user: req.user,
        action: 'Payment Failed',
        details: `PayHero STK push failed for Order ${order.orderRef}: ${payheroErr.message}`,
        status: 'Failed',
        category: 'Payment'
      });

      return res.status(500).json({
        success: false,
        message: payheroErr.message || 'Failed to initiate M-Pesa payment with PayHero.'
      });
    }

    payment.payheroReference = payheroRes.payheroReference;
    await payment.save();

    await createAuditLog({
      req,
      user: req.user,
      action: 'Payment Initiated',
      details: `M-Pesa STK Push initiated for Order ${order.orderRef} (KES ${payableAmount})`,
      status: 'Success',
      category: 'Payment',
      metadata: {
        paymentId: payment._id,
        payheroReference: payheroRes.payheroReference,
        phoneNumber: normalizedPhone
      }
    });

    return res.status(200).json({
      success: true,
      message: 'M-Pesa payment initiated. Please check your phone for the M-Pesa PIN prompt.',
      data: {
        paymentId: payment._id,
        status: 'processing',
        payheroReference: payheroRes.payheroReference
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/payments/:paymentId/status
 * Check payment status for polling by Customer frontend
 */
export const getPaymentStatus = async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    // Access control: customer owner or admin or assigned provider when logged in
    if (req.user && req.user.role === 'customer' && payment.customer && payment.customer.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    return res.status(200).json({
      success: true,
      data: {
        paymentId: payment._id,
        orderId: payment.orderId,
        status: payment.status,
        amount: payment.amount,
        paidAt: payment.paidAt,
        failureReason: payment.failureReason
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payments/confirm-manual
 * Confirm manual M-Pesa Till transaction code submitted by customer
 */
export const confirmManualPayment = async (req, res, next) => {
  try {
    const { orderId, transactionCode } = req.body;

    if (!orderId || !transactionCode) {
      return res.status(400).json({ success: false, message: 'orderId and transactionCode are required.' });
    }

    const cleanCode = transactionCode.trim().toUpperCase();
    if (cleanCode.length < 6) {
      return res.status(400).json({ success: false, message: 'Invalid M-Pesa transaction code format.' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // Find or create payment record
    let payment = await Payment.findOne({ order: order._id });
    if (!payment) {
      payment = new Payment({
        order: order._id,
        orderId: order.orderRef,
        customer: order.customer || null,
        provider: order.provider || null,
        amount: order.pricing?.grandTotal || 0
      });
    }

    payment.transactionId = cleanCode;
    payment.status = 'Paid';
    payment.method = 'mpesa';
    payment.paidAt = new Date();
    payment.gatewayMeta = { ...payment.gatewayMeta, mpesaReceiptNumber: cleanCode, verificationMode: 'Manual Till Confirmation' };
    await payment.save();

    // Update order status to Placed and paymentStatus to Paid
    order.status = 'Placed';
    order.paymentStatus = 'Paid';
    await order.save();

    // Audit Log for manual payment verification
    await createAuditLog({
      req,
      user: req.user || { role: 'Customer', fullName: 'Guest Customer' },
      action: 'Manual Payment Confirmed',
      details: `Manual Till payment confirmed for Order ${order.orderRef} with transaction code ${cleanCode} (Amount: KES ${order.pricing?.grandTotal})`,
      status: 'Success',
      category: 'Payment',
      metadata: {
        paymentId: payment._id,
        orderId: order.orderRef,
        transactionCode: cleanCode,
        amount: order.pricing?.grandTotal
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Manual M-Pesa payment confirmed successfully.',
      data: {
        paymentId: payment._id,
        orderId: order._id,
        orderRef: order.orderRef,
        transactionCode: cleanCode,
        status: 'Paid'
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payments/payhero/callback
 * PayHero Webhook Callback Handler (Idempotent & Secure)
 */
export const handlePayHeroCallback = async (req, res, next) => {
  try {
    const { verifyPayHeroCallback } = await import('../services/payheroService.js');
    const parsed = verifyPayHeroCallback(req);

    if (!parsed.isValid) {
      return res.status(400).json({ success: false, message: 'Invalid callback payload signature' });
    }

    // Locate payment by internal reference or PayHero reference
    const queryConditions = [];
    if (parsed.externalReference) queryConditions.push({ transactionId: parsed.externalReference });
    if (parsed.payheroReference) queryConditions.push({ payheroReference: parsed.payheroReference });

    const payment = await Payment.findOne({ $or: queryConditions });

    if (!payment) {
      console.warn('⚠️ Callback received for unknown payment reference:', parsed.externalReference || parsed.payheroReference);
      return res.status(200).json({ success: true, message: 'Payment reference not found in system.' });
    }

    // Idempotency check: If already marked Paid, return 200 without duplicate processing
    if (payment.status === 'Paid' || payment.status === 'paid') {
      return res.status(200).json({ success: true, message: 'Payment already processed and paid.' });
    }

    if (parsed.isSuccess) {
      payment.status = 'Paid';
      payment.paidAt = new Date();
      if (parsed.mpesaCode) {
        payment.transactionId = parsed.mpesaCode;
        payment.gatewayMeta = { ...payment.gatewayMeta, mpesaReceiptNumber: parsed.mpesaCode };
      }
      await payment.save();

      // Update associated Order status & paymentStatus
      await Order.findByIdAndUpdate(payment.order, { 
        status: 'Placed', 
        paymentStatus: 'Paid' 
      });

      // Audit Log for successful payment
      await createAuditLog({
        req,
        user: { role: 'Bot', fullName: 'PayHero Webhook Engine' },
        action: 'Payment Successful',
        details: `M-Pesa STK Push confirmed payment of KES ${payment.amount} for Order ${payment.orderId} (Receipt: ${parsed.mpesaCode || 'N/A'})`,
        status: 'Success',
        category: 'Payment',
        metadata: {
          paymentId: payment._id,
          orderId: payment.orderId,
          mpesaCode: parsed.mpesaCode,
          amount: payment.amount
        }
      });
    } else {
      payment.status = 'failed';
      payment.failureReason = parsed.failureReason || 'M-Pesa payment failed, cancelled by user, or PIN timeout.';
      payment.failedAt = new Date();
      await payment.save();

      // Update associated Order status
      await Order.findByIdAndUpdate(payment.order, { paymentStatus: 'Failed' });

      // Audit Log for failed / cancelled payment
      await createAuditLog({
        req,
        user: { role: 'Bot', fullName: 'PayHero Webhook Engine' },
        action: 'Payment Failed',
        details: `Payment attempt failed/cancelled for Order ${payment.orderId}: ${payment.failureReason}`,
        status: 'Failed',
        category: 'Payment',
        metadata: {
          paymentId: payment._id,
          orderId: payment.orderId,
          failureReason: payment.failureReason
        }
      });
    }

    return res.status(200).json({ success: true, message: 'Callback processed successfully.' });
  } catch (error) {
    console.error('❌ Error handling PayHero callback:', error);
    return res.status(200).json({ success: false, message: 'Error processing callback.' });
  }
};

/**
 * POST /api/payments/:id/retry
 * Allow Customer to retry payment for a failed attempt
 */
export const retryOrderPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { phoneNumber } = req.body;

    const oldPayment = await Payment.findById(id);
    if (!oldPayment) {
      return res.status(404).json({ success: false, message: 'Original payment record not found.' });
    }

    if (req.user.role === 'customer' && oldPayment.customer.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    req.body.orderId = oldPayment.order.toString();
    req.body.phoneNumber = phoneNumber || oldPayment.phoneNumber;

    return checkoutOrderPayment(req, res, next);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/payments/my-payments
 * Customer view of their own payment history
 */
export const getMyPayments = async (req, res, next) => {
  try {
    const payments = await Payment.find({ customer: req.user.id }).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, data: payments });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/payments/provider
 * Provider view of their own gross earnings, commission, net payout, and payout status
 */
export const getProviderPayments = async (req, res, next) => {
  try {
    const providerId = req.user.id;
    const payments = await Payment.find({ provider: providerId, status: { $in: ['Paid', 'paid'] } })
      .sort({ createdAt: -1 })
      .lean();

    const totals = payments.reduce(
      (acc, p) => {
        acc.gross += p.amount || 0;
        acc.commission += p.commissionAmount || 0;
        acc.net += p.providerPayoutAmount || 0;
        return acc;
      },
      { gross: 0, commission: 0, net: 0 }
    );

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          grossRevenue: Math.round(totals.gross * 100) / 100,
          platformCommission: Math.round(totals.commission * 100) / 100,
          netEarnings: Math.round(totals.net * 100) / 100
        },
        payments
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/payments/provider/payout-settings
 * Provider configures their M-Pesa payout destination number and account name
 */
export const updateProviderPayoutSettings = async (req, res, next) => {
  try {
    const { payoutMethod = 'mpesa', payoutPhoneNumber, payoutName } = req.body;
    const { normalizePhoneNumber } = await import('../services/payheroService.js');

    const normalizedPhone = normalizePhoneNumber(payoutPhoneNumber);
    if (!normalizedPhone) {
      return res.status(400).json({ success: false, message: 'Invalid payout M-Pesa phone number.' });
    }

    const user = await User.findById(req.user.id);
    if (!user || (user.role !== 'provider' && user.role !== 'cleaner')) {
      return res.status(403).json({ success: false, message: 'Only cleaner/provider accounts can configure payout destination.' });
    }

    user.providerDetails = user.providerDetails || {};
    user.providerDetails.payoutMethod = payoutMethod;
    user.providerDetails.payoutPhoneNumber = normalizedPhone;
    user.providerDetails.payoutName = payoutName || user.fullName;
    await user.save();

    await createAuditLog({
      req,
      user: req.user,
      action: 'Provider Payout Destination Updated',
      details: `Provider updated payout number to ${normalizedPhone}`,
      status: 'Success',
      category: 'Provider'
    });

    return res.status(200).json({
      success: true,
      message: 'Payout destination updated successfully.',
      data: user.providerDetails
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/payments/channels
 * Fetch logged-in provider's payment channels
 */
export const getProviderPaymentChannels = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const channels = user.providerDetails?.paymentChannels || [];
    return res.status(200).json({ success: true, data: channels });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payments/channels
 * Add a new payment channel for provider
 */
export const addPaymentChannel = async (req, res, next) => {
  try {
    const { type, title, subtitle, accountName, businessNo, accountNo, branch, instructions, isDefault } = req.body;
    if (!accountName) {
      return res.status(400).json({ success: false, message: 'Account Name is required.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.providerDetails = user.providerDetails || {};
    user.providerDetails.paymentChannels = user.providerDetails.paymentChannels || [];

    if (isDefault) {
      user.providerDetails.paymentChannels.forEach(ch => { ch.isDefault = false; });
    }

    // Extract till number if Paybill / Till is provided
    if (businessNo && businessNo.trim() !== '') {
      user.providerDetails.tillNumber = businessNo.trim();
    }

    const newChannel = {
      type: type || 'mpesa',
      title: title || (type === 'mpesa' ? 'M-Pesa Paybill' : type === 'bank' ? 'Bank Account' : 'Cash Payment'),
      subtitle: subtitle || (type === 'mpesa' ? 'Paybill' : 'Account'),
      accountName,
      businessNo: businessNo || '',
      accountNo: accountNo || '',
      branch: branch || '',
      instructions: instructions || '',
      isDefault: Boolean(isDefault) || user.providerDetails.paymentChannels.length === 0,
      isVerified: true
    };

    user.providerDetails.paymentChannels.push(newChannel);
    await user.save();

    await createAuditLog({
      req,
      user: req.user,
      action: 'Payment Channel Added',
      details: `Provider added ${type} channel: ${accountName}`,
      status: 'Success',
      category: 'Provider'
    });

    return res.status(201).json({
      success: true,
      message: 'Payment channel added successfully.',
      data: user.providerDetails.paymentChannels
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/payments/channels/:channelId
 * Remove a payment channel for provider
 */
export const deletePaymentChannel = async (req, res, next) => {
  try {
    const { channelId } = req.params;
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.providerDetails = user.providerDetails || {};
    user.providerDetails.paymentChannels = (user.providerDetails.paymentChannels || []).filter(
      ch => ch._id.toString() !== channelId
    );

    await user.save();

    await createAuditLog({
      req,
      user: req.user,
      action: 'Payment Channel Deleted',
      details: `Provider deleted channel ${channelId}`,
      status: 'Success',
      category: 'Provider'
    });

    return res.status(200).json({
      success: true,
      message: 'Payment channel deleted successfully.',
      data: user.providerDetails.paymentChannels
    });
  } catch (error) {
    next(error);
  }
};


