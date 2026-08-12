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

    // Role Enforcement
    if (req.user.role === 'customer' || req.user.role === 'user') {
      query.customer = req.user.id;
    } else if (req.user.role === 'provider') {
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

    const [orders, total] = await Promise.all([
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
 * GET /api/orders/:id
 */
export const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id)
      .populate('customer', 'fullName email phone')
      .populate('provider', 'fullName email phone providerDetails')
      .populate('driver', 'fullName phone')
      .populate('items.service');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // IDOR Security Check
    if (req.user.role === 'customer' && order.customer._id.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied to this order.' });
    }
    if (req.user.role === 'provider' && order.provider && order.provider._id.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied to this order.' });
    }

    return res.status(200).json({ success: true, data: order });
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

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // Role ownership check
    if (req.user.role === 'provider' && order.provider && order.provider.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only update your assigned orders.' });
    }

    const oldStatus = order.status;

    // Validate Transition unless Admin override
    if (req.user.role !== 'admin' && VALID_TRANSITIONS[oldStatus]) {
      if (!VALID_TRANSITIONS[oldStatus].includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status transition from '${oldStatus}' to '${status}'.`
        });
      }
    }

    order.status = status;
    await order.save();

    await createAuditLog({
      req,
      user: req.user,
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
