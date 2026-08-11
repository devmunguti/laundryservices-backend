import Order from '../models/Order.js';

export const createOrder = async (req, res, next) => {
  try {
    const { items, pickupAddress, deliveryAddress, pickupSlot, deliverySlot, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Order items are required.' });
    }

    const newOrder = await Order.create({
      customer: req.user ? req.user.id : undefined,
      items,
      pickupAddress,
      deliveryAddress,
      pickupSlot,
      deliverySlot,
      notes
    });

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: newOrder
    });
  } catch (error) {
    next(error);
  }
};

export const getOrders = async (req, res, next) => {
  try {
    const filter = req.user ? { customer: req.user.id } : {};
    const userOrders = await Order.find(filter)
      .populate('customer', 'fullName email phone')
      .populate('provider', 'fullName')
      .populate('driver', 'fullName phone')
      .populate('items.service', 'name category basePrice');

    res.status(200).json({
      success: true,
      count: userOrders.length,
      data: userOrders
    });
  } catch (error) {
    next(error);
  }
};

export const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id)
      .populate('customer', 'fullName email phone')
      .populate('provider', 'fullName')
      .populate('driver', 'fullName phone')
      .populate('items.service');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

export const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const order = await Order.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    res.status(200).json({ success: true, data: order, message: 'Order status updated successfully' });
  } catch (error) {
    next(error);
  }
};


