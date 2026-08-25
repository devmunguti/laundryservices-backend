import Service from '../models/Service.js';
import User from '../models/User.js';
import { createAuditLog } from '../services/auditLogService.js';

/**
 * GET /api/services
 * Get services list. Public/customer gets active services; providers/admins can filter.
 */
export const getServices = async (req, res, next) => {
  try {
    const { category, providerId, activeOnly, myServices, search } = req.query;
    const query = {};

    // 1. Determine provider filtering scope
    if (myServices === 'true') {
      // Provider portal dashboard requesting own uploaded services
      const pId = req.user?.id || providerId;
      if (pId) query.provider = pId;
      if (activeOnly === 'true') query.isActive = true;
    } else if (providerId) {
      // Cleaner Storefront: STICK TO ONLY THIS SPECIFIC CLEANER'S UPLOADED SERVICES
      query.provider = providerId;
      if (activeOnly !== 'false') {
        query.isActive = true;
      }
    } else {
      // Public Homepage Directory: Load services across all approved active cleaners
      if (activeOnly !== 'false') {
        query.isActive = true;
      }

      const activeProviders = await User.find({
        role: { $in: ['provider', 'cleaner'] },
        isActive: true,
        status: 'Active',
        'providerDetails.isApproved': true
      }).select('_id');

      const activeProviderIds = activeProviders.map(p => p._id);
      query.provider = { $in: activeProviderIds };
    }

    if (category) {
      query.category = category;
    }

    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ name: searchRegex }, { category: searchRegex }];
    }

    const services = await Service.find(query)
      .populate('provider', 'fullName email phone providerDetails')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: services.length, data: services });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/services/:id
 */
export const getServiceById = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id).populate('provider', 'fullName providerDetails');
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    res.status(200).json({ success: true, data: service });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/services
 * Create service (Admin or Provider)
 */
export const createService = async (req, res, next) => {
  try {
    const { name, category, description, pricingType, basePrice, deliveryFee, addOns } = req.body;

    if (!name || !category || !pricingType || basePrice === undefined) {
      return res.status(400).json({ success: false, message: 'Name, category, pricingType, and basePrice are required.' });
    }

    const isProvider = req.user && (req.user.role === 'provider' || req.user.role === 'cleaner');
    const providerId = isProvider ? req.user.id : (req.body.providerId || null);

    const service = await Service.create({
      name,
      category,
      description: description || '',
      pricingType,
      basePrice: parseFloat(basePrice),
      deliveryFee: deliveryFee !== undefined ? parseFloat(deliveryFee) : 200,
      addOns: addOns || [],
      provider: providerId,
      isActive: true
    });

    await createAuditLog({
      req,
      user: req.user,
      action: 'Service Created',
      details: `Created service '${name}' (Category: ${category}, Price: KES ${basePrice})`,
      status: 'Success',
      category: 'System'
    });

    res.status(201).json({ success: true, data: service, message: 'Service created successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/services/:id
 * Update service
 */
export const updateService = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    // Strict multi-tenant ownership check for providers
    const isProvider = req.user && (req.user.role === 'provider' || req.user.role === 'cleaner');
    if (isProvider && req.user.role !== 'admin' && service.provider && service.provider.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You do not have permission to edit this service.' });
    }

    const updated = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

    await createAuditLog({
      req,
      user: req.user,
      action: 'Service Updated',
      details: `Updated service '${updated.name}'`,
      status: 'Success',
      category: 'System'
    });

    res.status(200).json({ success: true, data: updated, message: 'Service updated successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/services/:id/status
 * Toggle service active/inactive status
 */
export const toggleServiceStatus = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const isProvider = req.user && (req.user.role === 'provider' || req.user.role === 'cleaner');
    if (isProvider && req.user.role !== 'admin' && service.provider && service.provider.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    service.isActive = req.body.isActive !== undefined ? !!req.body.isActive : !service.isActive;
    await service.save();

    res.status(200).json({ success: true, data: service, message: `Service ${service.isActive ? 'activated' : 'deactivated'} successfully` });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/services/:id
 */
export const deleteService = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const isProvider = req.user && (req.user.role === 'provider' || req.user.role === 'cleaner');
    if (isProvider && req.user.role !== 'admin' && service.provider && service.provider.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await Service.findByIdAndDelete(req.params.id);

    await createAuditLog({
      req,
      user: req.user,
      action: 'Service Deleted',
      details: `Deleted service '${service.name}'`,
      status: 'Success',
      category: 'System'
    });

    res.status(200).json({ success: true, message: 'Service deleted successfully' });
  } catch (error) {
    next(error);
  }
};
