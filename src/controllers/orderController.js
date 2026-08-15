import Order from '../models/Order.js';
import Service from '../models/Service.js';
import User from '../models/User.js';
import Payment from '../models/Payment.js';
import { getOrInitSettings } from '../services/systemSettingsService.js';
import { createAuditLog } from '../services/auditLogService.js';

// Order Status Transitions Rule Matrix
const VALID_TRANSITIONS = {
  Pending: ['Pickup_Scheduled', 'Cancelled'],
  Pickup_Scheduled: ['Picked_Up', 'Cancelled'],
  Picked_Up: ['In_Wash', 'Cancelled'],
  In_Wash: ['Ready_For_Delivery'],
  Ready_For_Delivery: ['Out_For_Delivery'],
  Out_For_Delivery: ['Delivered'],
  Delivered: [],
  Cancelled: []
};

/**
 * POST /api/orders
 * Create new customer order, validate services server-side, calculate totals & payment snapshot.
 */
export const createOrder = async (req, res, next) => {
  try {
    const { items, pickupAddress, deliveryAddress, pickupSlot, deliverySlot, notes, providerId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Order items are required.' });
    }

    // Validate services from MongoDB & calculate authoritative unit prices
    let assignedProvider = null;

    const processedItems = [];
    for (const item of items) {
      const targetServiceId = item.serviceId || item.service;
      if (!targetServiceId || !targetServiceId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid service ID provided. Please select a valid service from the catalog.'
        });
      }

      const dbService = await Service.findById(targetServiceId);

      if (!dbService || !dbService.isActive) {
        return res.status(400).json({
          success: false,
          message: `This service ('${item.name || targetServiceId}') is currently unavailable or inactive.`
        });
      }

      // Automatically derive provider from selected service unless explicitly overridden by active provider
      if (!assignedProvider && dbService.provider) {
        assignedProvider = dbService.provider;
      }

      // Set delivery fee from selected service
      let serviceDeliveryFee = typeof dbService.deliveryFee === 'number' ? dbService.deliveryFee : 200;

      processedItems.push({
        service: dbService._id,
        name: dbService.name,
        pricingType: dbService.pricingType,
        unitPrice: dbService.basePrice,
        quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
        addOns: item.addOns || [],
        notes: item.notes || ''
      });

      var calculatedDeliveryFee = serviceDeliveryFee;
    }

    // Validate assigned provider if provided explicitly
    if (providerId) {
      const pUser = await User.findOne({ _id: providerId, role: 'provider' });
      if (pUser && pUser.status === 'Active') {
        assignedProvider = pUser._id;
      }
    }

    const customerId = req.user?.id || req.user?._id || null;

    const newOrder = new Order({
      customer: customerId,
      provider: assignedProvider,
      items: processedItems,
      pickupAddress: pickupAddress || { street: 'Nairobi', city: 'Nairobi' },
      deliveryAddress: deliveryAddress || { street: 'Nairobi', city: 'Nairobi' },
      pickupSlot: pickupSlot || { date: new Date(), windowStart: '09:00', windowEnd: '11:00' },
      deliverySlot: deliverySlot || { date: new Date(Date.now() + 86400000), windowStart: '14:00', windowEnd: '16:00' },
      pricing: {
        deliveryFee: calculatedDeliveryFee !== undefined ? calculatedDeliveryFee : 200
      },
      notes: notes || ''
    });

    await newOrder.save();

    // Create initial Payment record with 'pending' status awaiting M-Pesa STK Push / COD confirmation
    const payment = await Payment.create({
      order: newOrder._id,
      orderId: newOrder.orderRef,
      customer: customerId,
      provider: assignedProvider,
      amount: newOrder.pricing.grandTotal,
      status: 'pending',
      payoutStatus: 'Pending',
      method: 'mpesa'
    });

    // Check system settings for high-value alerts
    const settings = await getOrInitSettings();
    if (newOrder.pricing.grandTotal >= 10000 && settings?.notifications?.highValueOrders) {
      await createAuditLog({
        req,
        user: req.user,
        action: 'High Value Order Created',
        details: `Alert: High-value order ${newOrder.orderRef} created (KES ${newOrder.pricing.grandTotal}).`,
        status: 'Success',
        category: 'Order'
      });
    }

    await createAuditLog({
      req,
      user: req.user,
      action: 'Order Created',
      details: `Customer created order ${newOrder.orderRef} total KES ${newOrder.pricing.grandTotal}`,
      status: 'Success',
      category: 'Order'
    });

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: { order: newOrder, payment }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/orders
 * Role-based order list (Customer: own orders; Provider: assigned orders; Admin: all with filters)
 */
export const getOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const { status, providerId, customerId, search } = req.query;
    const query = {};

    // Role Enforcement - Strict Provider & Customer Isolation
    if (req.user.role === 'customer' || req.user.role === 'user') {
      query.customer = req.user.id;
    } else if (req.user.role === 'provider' || req.user.role === 'cleaner') {
      query.provider = req.user.id;
    } else if (req.user.role === 'admin') {
      if (providerId) query.provider = providerId;
      if (customerId) query.customer = customerId;
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ orderRef: searchRegex }];
    }

    const [rawOrders, total] = await Promise.all([
      Order.find(query)
        .populate('customer', 'fullName email phone')
        .populate('provider', 'fullName email phone providerDetails')
        .populate('driver', 'fullName phone')
        .populate('items.service', 'name category basePrice')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(query)
    ]);

    // Attach payment records and transactionId to each order
    const orderIds = rawOrders.map(o => o._id);
    const payments = await Payment.find({ order: { $in: orderIds } })
      .select('order transactionId status method paidAt amount gatewayMeta')
      .lean();

    const paymentMap = {};
    payments.forEach(p => {
      paymentMap[p.order.toString()] = p;
    });

    const orders = rawOrders.map(o => {
      const p = paymentMap[o._id.toString()];
      return {
        ...o,
        payment: p || null,
        transactionId: p?.transactionId || p?.gatewayMeta?.mpesaReceiptNumber || null
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      count: orders.length,
      data: {
        orders,
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
 * GET /api/orders/metrics
 * Computes live order statistics (Today's orders, pending pickups, ready for delivery, weekly revenue, etc.)
 */
export const getOrderMetrics = async (req, res, next) => {
  try {
    const query = {};

    // Role Enforcement - Strict Provider & Customer Isolation for Metrics
    if (req.user && (req.user.role === 'provider' || req.user.role === 'cleaner')) {
      query.provider = req.user.id;
    } else if (req.user && (req.user.role === 'customer' || req.user.role === 'user')) {
      query.customer = req.user.id;
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const endOfYesterday = new Date(startOfToday);
    endOfYesterday.setMilliseconds(-1);

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    // Start of current week (Monday)
    const now = new Date();
    const startOfWeek = new Date(now);
    const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Monday, 6 = Sunday
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    // Start of previous week
    const startOfPrevWeek = new Date(startOfWeek);
    startOfPrevWeek.setDate(startOfPrevWeek.getDate() - 7);

    const [
      totalOrders,
      todayOrders,
      yesterdayOrders,
      pendingPickups,
      urgentPickups,
      inWash,
      readyForDelivery,
      outForDelivery,
      delivered,
      cancelled,
      weeklyOrders,
      prevWeeklyOrders
    ] = await Promise.all([
      Order.countDocuments(query),
      Order.countDocuments({ ...query, createdAt: { $gte: startOfToday } }),
      Order.countDocuments({ ...query, createdAt: { $gte: startOfYesterday, $lte: endOfYesterday } }),
      Order.countDocuments({ ...query, status: { $in: ['Pending', 'Pickup_Scheduled'] } }),
      Order.countDocuments({ ...query, status: { $in: ['Pending', 'Pickup_Scheduled'] }, createdAt: { $lte: twoHoursAgo } }),
      Order.countDocuments({ ...query, status: 'In_Wash' }),
      Order.countDocuments({ ...query, status: 'Ready_For_Delivery' }),
      Order.countDocuments({ ...query, status: 'Out_For_Delivery' }),
      Order.countDocuments({ ...query, status: 'Delivered' }),
      Order.countDocuments({ ...query, status: 'Cancelled' }),
      Order.find({ ...query, createdAt: { $gte: startOfWeek } }).select('pricing.grandTotal createdAt').lean(),
      Order.find({ ...query, createdAt: { $gte: startOfPrevWeek, $lt: startOfWeek } }).select('pricing.grandTotal createdAt').lean()
    ]);

    // Calculate daily revenue for current week (Mon-Sun)
    const currentWeekDaily = [0, 0, 0, 0, 0, 0, 0];
    let currentWeekTotal = 0;
    weeklyOrders.forEach(o => {
      const d = new Date(o.createdAt);
      const dIdx = (d.getDay() + 6) % 7;
      const amt = o.pricing?.grandTotal || 0;
      if (dIdx >= 0 && dIdx < 7) {
        currentWeekDaily[dIdx] += amt;
      }
      currentWeekTotal += amt;
    });

    // Calculate daily revenue for previous week
    const prevWeekDaily = [0, 0, 0, 0, 0, 0, 0];
    let prevWeekTotal = 0;
    prevWeeklyOrders.forEach(o => {
      const d = new Date(o.createdAt);
      const dIdx = (d.getDay() + 6) % 7;
      const amt = o.pricing?.grandTotal || 0;
      if (dIdx >= 0 && dIdx < 7) {
        prevWeekDaily[dIdx] += amt;
      }
      prevWeekTotal += amt;
    });

    let growthFormatted = '+0%';
    let isPositiveGrowth = true;

    if (yesterdayOrders === 0) {
      if (todayOrders > 0) {
        growthFormatted = `+${todayOrders * 100}%`;
        isPositiveGrowth = true;
      } else {
        growthFormatted = '0%';
        isPositiveGrowth = true;
      }
    } else {
      const diff = Math.round(((todayOrders - yesterdayOrders) / yesterdayOrders) * 100);
      growthFormatted = `${diff >= 0 ? '+' : ''}${diff}%`;
      isPositiveGrowth = diff >= 0;
    }

    // Revenue growth %
    let revenueGrowth = '+0%';
    if (prevWeekTotal === 0) {
      revenueGrowth = currentWeekTotal > 0 ? '+100%' : '0%';
    } else {
      const rDiff = Math.round(((currentWeekTotal - prevWeekTotal) / prevWeekTotal) * 100);
      revenueGrowth = `${rDiff >= 0 ? '+' : ''}${rDiff}%`;
    }

    return res.status(200).json({
      success: true,
      data: {
        todayOrders,
        yesterdayOrders,
        growthFormatted,
        isPositiveGrowth,
        pendingPickups,
        urgentPickups,
        inWash,
        readyForDelivery,
        outForDelivery,
        delivered,
        cancelled,
        totalOrders,
        currentWeekTotal,
        prevWeekTotal,
        revenueGrowth,
        currentWeekDaily,
        prevWeekDaily
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/orders/:id
 */
export const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id)
      .populate('customer', 'fullName email phone')
      .populate('provider', 'fullName email phone providerDetails')
      .populate('driver', 'fullName phone')
      .populate('items.service')
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // IDOR Security Check - Multi-tenancy enforcement
    if (req.user.role === 'customer' && order.customer && order.customer._id.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied to this order.' });
    }
    if ((req.user.role === 'provider' || req.user.role === 'cleaner') && order.provider && order.provider._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied to this order.' });
    }

    // Attach payment info
    const payment = await Payment.findOne({ order: order._id }).lean();
    const enrichedOrder = {
      ...order,
      payment: payment || null,
      transactionId: payment?.transactionId || payment?.gatewayMeta?.mpesaReceiptNumber || null
    };

    return res.status(200).json({ success: true, data: enrichedOrder });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/orders/:id/assign-provider
 * Admin endpoint to assign an order to an active cleaner/provider
 */
export const assignOrderProvider = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { providerId } = req.body;

    if (!providerId) {
      return res.status(400).json({ success: false, message: 'Provider ID is required.' });
    }

    const provider = await User.findOne({ _id: providerId, role: 'provider' });
    if (!provider || provider.status !== 'Active') {
      return res.status(400).json({
        success: false,
        message: 'Selected provider is invalid or not active.'
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    order.provider = provider._id;
    if (order.status === 'Pending') {
      order.status = 'Pickup_Scheduled';
    }
    await order.save();

    // Sync Payment provider reference
    await Payment.findOneAndUpdate({ order: order._id }, { provider: provider._id });

    await createAuditLog({
      req,
      user: req.user,
      action: 'Order Provider Assigned',
      details: `Assigned Order ${order.orderRef} to provider '${provider.fullName}' (${provider.providerDetails?.businessName || provider.email})`,
      status: 'Success',
      category: 'Order'
    });

    return res.status(200).json({
      success: true,
      message: `Order assigned to ${provider.fullName} successfully.`,
      data: order
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/orders/:id/status
 * Controlled order status updates (Provider or Admin)
 */
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = [
      'Pending',
      'Pickup_Scheduled',
      'Picked_Up',
      'In_Wash',
      'Ready_For_Delivery',
      'Out_For_Delivery',
      'Delivered',
      'Cancelled'
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status '${status}'. Must be one of: ${allowedStatuses.join(', ')}`
      });
    }

    let order = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      order = await Order.findById(id);
    }
    if (!order) {
      order = await Order.findOne({ orderRef: id });
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // Role ownership check for provider/cleaner
    if (req.user && (req.user.role === 'provider' || req.user.role === 'cleaner')) {
      if (order.provider && order.provider.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'You can only update your assigned orders.' });
      }
      // If order was unassigned, assign this provider when they take action
      if (!order.provider) {
        order.provider = req.user.id;
        await Payment.findOneAndUpdate({ order: order._id }, { provider: req.user.id });
      }
    }

    const oldStatus = order.status;
    order.status = status;
    await order.save();

    await createAuditLog({
      req,
      user: req.user || { role: 'System', fullName: 'Order Manager' },
      action: 'Order Status Changed',
      details: `Order ${order.orderRef} status updated from '${oldStatus}' to '${status}'`,
      status: 'Success',
      category: 'Order'
    });

    return res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: order
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/orders/track/:orderRef
 * Purpose-built order tracking endpoint for customer, provider, and guest tracking.
 * Returns order tracking DTO with safe customer and payment status.
 */
export const getOrderTracking = async (req, res, next) => {
  try {
    const { orderRef } = req.params;
    const cleanRef = (orderRef || '').trim();

    // 1. First try finding directly by orderRef or _id
    let order = await Order.findOne({
      $or: [
        { orderRef: cleanRef },
        { orderRef: `ORD-${cleanRef.replace(/^ORD-/i, '')}` },
        ...(cleanRef.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: cleanRef }] : [])
      ]
    })
      .populate('customer', 'fullName email phone')
      .populate('provider', 'fullName providerDetails.businessName providerDetails.tillNumber')
      .populate('items.service', 'name category')
      .lean();

    // 2. If not found by orderRef, search by Payment transactionId (M-Pesa Receipt Code)
    if (!order) {
      const paymentByCode = await Payment.findOne({
        $or: [
          { transactionId: { $regex: new RegExp(`^${cleanRef}$`, 'i') } },
          { 'gatewayMeta.mpesaReceiptNumber': { $regex: new RegExp(`^${cleanRef}$`, 'i') } }
        ]
      }).lean();

      if (paymentByCode && paymentByCode.order) {
        order = await Order.findById(paymentByCode.order)
          .populate('customer', 'fullName email phone')
          .populate('provider', 'fullName providerDetails.businessName providerDetails.tillNumber')
          .populate('items.service', 'name category')
          .lean();
      }
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found. Please verify your order number or M-Pesa transaction code.' });
    }

    const userId = req.user?.id;
    const userRole = req.user?.role;
    const isAdmin = userRole === 'admin';
    const isOwnerCustomer = userRole === 'customer' && order.customer && order.customer._id?.toString() === userId;
    const isAssignedProvider = (userRole === 'provider' || userRole === 'cleaner') && order.provider && order.provider._id?.toString() === userId;

    // ── Fetch associated payment record ───────────────────────────────────────
    const payment = await Payment.findOne({ order: order._id })
      .select('status method transactionId paidAt amount failureReason')
      .lean();

    // ── Build the tracking DTO ────────────────────────────────────────────────
    const providerInfo = order.provider ? {
      name: order.provider.providerDetails?.businessName || order.provider.fullName || 'Assigned Provider',
      tillNumber: isAdmin ? (order.provider.providerDetails?.tillNumber || null) : undefined
    } : null;

    const customerInfo = (isAdmin || isOwnerCustomer) ? (order.customer ? {
      name: order.customer.fullName || 'Customer',
      phone: isAdmin ? order.customer.phone : undefined,
      email: isAdmin ? order.customer.email : undefined
    } : { name: 'Guest Customer' }) : {
      name: order.customer?.fullName ? order.customer.fullName.split(' ')[0] + ' ***' : 'Customer'
    };

    const trackingDto = {
      orderRef: order.orderRef,
      status: order.status,
      paymentStatus: order.paymentStatus || 'Pending',
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      service: {
        name: order.items?.[0]?.name || 'Laundry Service',
        category: order.items?.[0]?.service?.category || null,
        quantity: order.items?.[0]?.quantity || 1
      },
      pricing: {
        grandTotal: order.pricing?.grandTotal || 0,
        deliveryFee: order.pricing?.deliveryFee || 0,
        subtotal: order.pricing?.subtotal || 0
      },
      provider: providerInfo,
      customer: customerInfo,
      pickupAddress: order.pickupAddress || null,
      deliveryAddress: order.deliveryAddress || null,
      payment: payment ? {
        status: payment.status,
        method: payment.method || 'mpesa',
        transactionId: payment.transactionId || null,
        paidAt: payment.paidAt || null,
        amount: payment.amount || 0,
        failureReason: (isAdmin || isOwnerCustomer) ? (payment.failureReason || null) : undefined
      } : null
    };

    return res.status(200).json({
      success: true,
      data: trackingDto
    });
  } catch (error) {
    next(error);
  }
};

