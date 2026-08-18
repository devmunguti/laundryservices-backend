import SystemSetting from '../models/SystemSetting.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import Ticket from '../models/Ticket.js';
import AuditLog from '../models/AuditLog.js';
import { getOrInitSettings, maskKey, invalidateSettingsCache } from '../services/systemSettingsService.js';
import { createAuditLog } from '../services/auditLogService.js';

/**
 * GET /api/admin/settings
 * Retrieves current global System Settings with sensitive keys masked.
 */
export const getSystemSettings = async (req, res, next) => {
  try {
    const settings = await getOrInitSettings();

    const responsePayload = {
      general: settings.general,
      financial: settings.financial,
      notifications: settings.notifications,
      campusLocations: settings.campusLocations || [],
      api: {
        mpesaKeyMasked: maskKey(settings.api?.mpesaKey),
        mapsKeyMasked: maskKey(settings.api?.mapsKey),
        hasMpesaKey: !!settings.api?.mpesaKey,
        hasMapsKey: !!settings.api?.mapsKey
      },
      operations: {
        maintenanceMode: settings.operations?.maintenanceMode || false,
        smsSidMasked: maskKey(settings.operations?.smsSid),
        smsSenderId: settings.operations?.smsSenderId || '',
        superAdminEmailAlerts: settings.operations?.superAdminEmailAlerts ?? true
      },
      updatedAt: settings.updatedAt
    };

    return res.status(200).json({
      success: true,
      data: responsePayload
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/settings
 * Updates global System Settings document (Singleton).
 */
export const updateSystemSettings = async (req, res, next) => {
  try {
    const settings = await getOrInitSettings();
    const { general, financial, notifications, api, operations, campusLocations } = req.body;

    const changesTracked = [];

    // 1. General Settings
    if (general) {
      if (general.platformName !== undefined) settings.general.platformName = general.platformName;
      if (general.supportEmail !== undefined) settings.general.supportEmail = general.supportEmail;
      if (general.adminAlertEmail !== undefined) settings.general.adminAlertEmail = general.adminAlertEmail;
      if (general.supportPhone !== undefined) settings.general.supportPhone = general.supportPhone;
      if (general.logoUrl !== undefined) settings.general.logoUrl = general.logoUrl;
      changesTracked.push('Platform Identity');
    }

    // 1.5 Campus Locations
    if (campusLocations && Array.isArray(campusLocations)) {
      settings.campusLocations = campusLocations;
      settings.markModified('campusLocations');
      changesTracked.push('Campus Pickup Locations');
    }

    // 2. Financial Rules
    if (financial) {
      if (financial.commissionRate !== undefined) {
        const rate = parseFloat(financial.commissionRate);
        if (isNaN(rate) || rate < 0 || rate > 100) {
          return res.status(400).json({ success: false, message: 'Commission rate must be a valid number between 0 and 100.' });
        }
        settings.financial.commissionRate = rate;
        settings.markModified('financial');
        changesTracked.push(`Commission rate updated to ${rate}%`);
      }
      if (financial.minimumPayoutThreshold !== undefined) {
        const threshold = parseFloat(financial.minimumPayoutThreshold);
        if (isNaN(threshold) || threshold < 0) {
          return res.status(400).json({ success: false, message: 'Minimum payout threshold must be a non-negative number.' });
        }
        settings.financial.minimumPayoutThreshold = threshold;
        settings.markModified('financial');
      }
    }

    // 3. Notification Preferences
    if (notifications) {
      if (notifications.newCleanerRegistrations !== undefined) settings.notifications.newCleanerRegistrations = !!notifications.newCleanerRegistrations;
      if (notifications.highValueOrders !== undefined) settings.notifications.highValueOrders = !!notifications.highValueOrders;
      if (notifications.systemErrorReports !== undefined) settings.notifications.systemErrorReports = !!notifications.systemErrorReports;
      if (notifications.providerRegistration !== undefined) settings.notifications.providerRegistration = !!notifications.providerRegistration;
      if (notifications.providerCommission !== undefined) settings.notifications.providerCommission = !!notifications.providerCommission;
      if (notifications.securityAlerts !== undefined) settings.notifications.securityAlerts = !!notifications.securityAlerts;
      if (notifications.promotionRequests !== undefined) settings.notifications.promotionRequests = !!notifications.promotionRequests;
      if (notifications.providerOrderDigest !== undefined) settings.notifications.providerOrderDigest = !!notifications.providerOrderDigest;
      if (notifications.providerReviews !== undefined) settings.notifications.providerReviews = !!notifications.providerReviews;
      if (notifications.promotionReceipts !== undefined) settings.notifications.promotionReceipts = !!notifications.promotionReceipts;
      if (notifications.promotionExpiryReminders !== undefined) settings.notifications.promotionExpiryReminders = !!notifications.promotionExpiryReminders;
      changesTracked.push('Notification Preferences');
    }

    // 4. API Credentials (Only update if actual new key string provided, avoiding overwriting with masked strings)
    if (api) {
      if (api.mpesaKey && !api.mpesaKey.includes('***')) {
        settings.api.mpesaKey = api.mpesaKey;
        changesTracked.push('M-Pesa API Credentials');
      }
      if (api.mapsKey && !api.mapsKey.includes('***')) {
        settings.api.mapsKey = api.mapsKey;
        changesTracked.push('Google Maps API Credentials');
      }
    }

    // 5. Operations
    if (operations) {
      if (operations.maintenanceMode !== undefined) {
        const newMaint = !!operations.maintenanceMode;
        if (settings.operations.maintenanceMode !== newMaint) {
          changesTracked.push(newMaint ? 'Maintenance Mode ENABLED' : 'Maintenance Mode DISABLED');
          settings.operations.maintenanceMode = newMaint;
        }
      }
      if (operations.smsSid && !operations.smsSid.includes('***')) {
        settings.operations.smsSid = operations.smsSid;
      }
      if (operations.smsSenderId !== undefined) {
        settings.operations.smsSenderId = operations.smsSenderId;
      }
      if (operations.superAdminEmailAlerts !== undefined) {
        settings.operations.superAdminEmailAlerts = !!operations.superAdminEmailAlerts;
      }
      changesTracked.push('Platform Operations');
    }

    settings.updatedBy = req.user.id;
    settings.markModified('general');
    settings.markModified('financial');
    settings.markModified('notifications');
    settings.markModified('api');
    settings.markModified('operations');
    await settings.save();

    invalidateSettingsCache();

    // Audit Log
    await createAuditLog({
      req,
      user: req.user,
      action: 'System Settings Updated',
      details: `Admin updated platform settings: ${changesTracked.join(', ')}`,
      status: 'Success',
      category: 'System'
    });

    return res.status(200).json({
      success: true,
      message: 'System settings updated successfully!',
      data: {
        general: settings.general,
        financial: settings.financial,
        notifications: settings.notifications,
        campusLocations: settings.campusLocations || [],
        api: {
          mpesaKeyMasked: maskKey(settings.api?.mpesaKey),
          mapsKeyMasked: maskKey(settings.api?.mapsKey)
        },
        operations: settings.operations,
        updatedAt: settings.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/settings/reveal-key
 * Secure endpoint to reveal a specific sensitive key to authenticated admin
 */
export const revealSecretKey = async (req, res, next) => {
  try {
    const { keyType } = req.body; // 'mpesaKey' | 'mapsKey' | 'smsSid'
    const settings = await getOrInitSettings();

    let rawKey = '';
    if (keyType === 'mpesaKey') rawKey = settings.api?.mpesaKey || '';
    else if (keyType === 'mapsKey') rawKey = settings.api?.mapsKey || '';
    else if (keyType === 'smsSid') rawKey = settings.operations?.smsSid || '';
    else {
      return res.status(400).json({ success: false, message: 'Invalid key type specified.' });
    }

    await createAuditLog({
      req,
      user: req.user,
      action: 'API Key Revealed',
      details: `Admin requested reveal for sensitive key: ${keyType}`,
      status: 'Success',
      category: 'Security'
    });

    return res.status(200).json({
      success: true,
      rawKey
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/public/settings
 * Retrieves non-sensitive global System Settings for frontend UI consumption.
 */
export const getPublicSettings = async (req, res, next) => {
  try {
    const settings = await getOrInitSettings();

    return res.status(200).json({
      success: true,
      data: {
        platformName: settings.general?.platformName || 'Laundry',
        supportEmail: settings.general?.supportEmail || 'support@auralaundry.co.ke',
        supportPhone: settings.general?.supportPhone || '+254 700 000 000',
        logoUrl: settings.general?.logoUrl || '',
        commissionRate: settings.financial?.commissionRate ?? 15,
        minimumPayoutThreshold: settings.financial?.minimumPayoutThreshold ?? 5000,
        maintenanceMode: settings.operations?.maintenanceMode ?? false,
        campusLocations: (settings.campusLocations || []).filter(loc => loc.isActive !== false)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/settings/campus-locations
 * Public / Admin get full campus locations list
 */
export const getCampusLocations = async (req, res, next) => {
  try {
    const settings = await getOrInitSettings();
    return res.status(200).json({
      success: true,
      data: settings.campusLocations || []
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/settings/campus-locations
 * Admin adds a new campus pickup location
 */
export const addCampusLocation = async (req, res, next) => {
  try {
    const { name, zone, description, instructions, isActive = true, coordinates } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Campus location name is required.' });
    }

    const settings = await getOrInitSettings();
    settings.campusLocations = settings.campusLocations || [];

    const newLoc = {
      name: name.trim(),
      zone: (zone && zone.trim()) || 'Main Campus',
      description: (description && description.trim()) || '',
      instructions: (instructions && instructions.trim()) || '',
      isActive: Boolean(isActive),
      coordinates: {
        lat: typeof coordinates?.lat === 'number' ? coordinates.lat : -1.2921,
        lng: typeof coordinates?.lng === 'number' ? coordinates.lng : 36.8219
      }
    };

    settings.campusLocations.push(newLoc);
    settings.markModified('campusLocations');
    await settings.save();
    invalidateSettingsCache();

    await createAuditLog({
      req,
      user: req.user,
      action: 'Campus Location Added',
      details: `Admin added campus pickup location: ${newLoc.name} (${newLoc.zone})`,
      status: 'Success',
      category: 'System'
    });

    return res.status(201).json({
      success: true,
      message: 'Campus location added successfully.',
      data: settings.campusLocations
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/settings/campus-locations/:locationId
 * Admin updates an existing campus location
 */
export const updateCampusLocation = async (req, res, next) => {
  try {
    const { locationId } = req.params;
    const { name, zone, description, instructions, isActive, coordinates } = req.body;

    const settings = await getOrInitSettings();
    settings.campusLocations = settings.campusLocations || [];

    const loc = settings.campusLocations.id ? settings.campusLocations.id(locationId) : settings.campusLocations.find(l => l._id?.toString() === locationId);

    if (!loc) {
      return res.status(404).json({ success: false, message: 'Campus location not found.' });
    }

    if (name !== undefined) loc.name = name.trim();
    if (zone !== undefined) loc.zone = zone.trim();
    if (description !== undefined) loc.description = description.trim();
    if (instructions !== undefined) loc.instructions = instructions.trim();
    if (isActive !== undefined) loc.isActive = Boolean(isActive);
    if (coordinates) {
      if (typeof coordinates.lat === 'number') loc.coordinates.lat = coordinates.lat;
      if (typeof coordinates.lng === 'number') loc.coordinates.lng = coordinates.lng;
    }

    settings.markModified('campusLocations');
    await settings.save();
    invalidateSettingsCache();

    await createAuditLog({
      req,
      user: req.user,
      action: 'Campus Location Updated',
      details: `Admin updated campus location: ${loc.name}`,
      status: 'Success',
      category: 'System'
    });

    return res.status(200).json({
      success: true,
      message: 'Campus location updated successfully.',
      data: settings.campusLocations
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/settings/campus-locations/:locationId
 * Admin deletes a campus location
 */
export const deleteCampusLocation = async (req, res, next) => {
  try {
    const { locationId } = req.params;

    const settings = await getOrInitSettings();
    settings.campusLocations = (settings.campusLocations || []).filter(
      l => (l._id ? l._id.toString() : l.id) !== locationId
    );

    settings.markModified('campusLocations');
    await settings.save();
    invalidateSettingsCache();

    await createAuditLog({
      req,
      user: req.user,
      action: 'Campus Location Deleted',
      details: `Admin deleted campus location ID ${locationId}`,
      status: 'Success',
      category: 'System'
    });

    return res.status(200).json({
      success: true,
      message: 'Campus location deleted successfully.',
      data: settings.campusLocations
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/overview-metrics
 * Aggregates complete live system data for the Admin Overview Dashboard.
 */
export const getAdminOverviewMetrics = async (req, res, next) => {
  try {
    const now = new Date();

    // 1. Total Platform Revenue & Last Month Revenue
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [
      allPaymentsAgg,
      currentMonthPaymentsAgg,
      lastMonthPaymentsAgg
    ] = await Promise.all([
      Payment.aggregate([
        { $match: { status: { $in: ['Paid', 'paid'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { status: { $in: ['Paid', 'paid'] }, createdAt: { $gte: startOfCurrentMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.aggregate([
        { $match: { status: { $in: ['Paid', 'paid'] }, createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const totalRevenue = allPaymentsAgg[0]?.total || 0;
    const currentMonthRevenue = currentMonthPaymentsAgg[0]?.total || 0;
    const lastMonthRevenue = lastMonthPaymentsAgg[0]?.total || 0;

    let revenueGrowth = '+0% vs last mo';
    if (lastMonthRevenue === 0) {
      revenueGrowth = currentMonthRevenue > 0 ? '+100% vs last mo' : '+0% vs last mo';
    } else {
      const diff = Math.round(((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100);
      revenueGrowth = `${diff >= 0 ? '+' : ''}${diff}% vs last mo`;
    }

    // 2. Active Orders & Weekly Comparison
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Mon
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);

    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const endOfLastWeek = new Date(startOfWeek);
    endOfLastWeek.setMilliseconds(-1);

    const [
      activeOrdersCount,
      thisWeekOrdersCount,
      lastWeekOrdersCount,
      totalProviders,
      pendingProviders,
      openTickets,
      ticketsCompletedToday,
      yesterdayDeliveredCount,
      avgOrderAgg,
      readyOrdersCount
    ] = await Promise.all([
      Order.countDocuments({ status: { $in: ['Pending', 'Pickup_Scheduled', 'Picked_Up', 'In_Wash', 'Ready_For_Delivery', 'Out_For_Delivery'] } }),
      Order.countDocuments({ createdAt: { $gte: startOfWeek } }),
      Order.countDocuments({ createdAt: { $gte: startOfLastWeek, $lte: endOfLastWeek } }),
      User.countDocuments({ role: { $in: ['provider', 'cleaner'] } }),
      User.countDocuments({ role: { $in: ['provider', 'cleaner'] }, $or: [{ 'providerDetails.isApproved': false }, { status: 'Pending' }] }),
      Ticket.countDocuments({ status: { $in: ['Open', 'In_Progress'] } }),
      Order.countDocuments({ status: 'Delivered', updatedAt: { $gte: startOfToday } }),
      Order.countDocuments({
        status: 'Delivered',
        updatedAt: {
          $gte: new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000),
          $lt: startOfToday
        }
      }),
      Order.aggregate([
        { $match: { 'pricing.grandTotal': { $gt: 0 } } },
        { $group: { _id: null, avgValue: { $avg: '$pricing.grandTotal' } } }
      ]),
      Order.countDocuments({ status: { $in: ['Ready_For_Delivery', 'Delivered'] } })
    ]);

    const avgOrderValue = Math.round(avgOrderAgg[0]?.avgValue || 0);
    const avgOrderValueFormatted = avgOrderValue > 0 ? `KES ${avgOrderValue.toLocaleString()}` : 'KES 0';

    let activeOrdersGrowth = '+0% vs last week';
    if (lastWeekOrdersCount === 0) {
      activeOrdersGrowth = thisWeekOrdersCount > 0 ? '+100% vs last week' : '+0% vs last week';
    } else {
      const diff = Math.round(((thisWeekOrdersCount - lastWeekOrdersCount) / lastWeekOrdersCount) * 100);
      activeOrdersGrowth = `${diff >= 0 ? '+' : ''}${diff}% vs last week`;
    }

    let ticketsGrowth = '+0% vs yesterday';
    if (yesterdayDeliveredCount === 0) {
      ticketsGrowth = ticketsCompletedToday > 0 ? '+100% vs yesterday' : '+0% vs yesterday';
    } else {
      const diff = Math.round(((ticketsCompletedToday - yesterdayDeliveredCount) / yesterdayDeliveredCount) * 100);
      ticketsGrowth = `${diff >= 0 ? '+' : ''}${diff}% vs yesterday`;
    }

    // 3. Chart Data
    // A. This Week (Mon - Sun)
    const thisWeekOrders = await Order.find({ createdAt: { $gte: startOfWeek } }).select('createdAt').lean();
    const thisWeekCounts = [0, 0, 0, 0, 0, 0, 0];
    thisWeekOrders.forEach(o => {
      const d = new Date(o.createdAt);
      const idx = (d.getDay() + 6) % 7;
      if (idx >= 0 && idx < 7) thisWeekCounts[idx]++;
    });

    // B. Last Week (Mon - Sun)
    const lastWeekOrders = await Order.find({ createdAt: { $gte: startOfLastWeek, $lte: endOfLastWeek } }).select('createdAt').lean();
    const lastWeekCounts = [0, 0, 0, 0, 0, 0, 0];
    lastWeekOrders.forEach(o => {
      const d = new Date(o.createdAt);
      const idx = (d.getDay() + 6) % 7;
      if (idx >= 0 && idx < 7) lastWeekCounts[idx]++;
    });

    // C. This Month (Weeks 1 to 4)
    const thisMonthOrders = await Order.find({ createdAt: { $gte: startOfCurrentMonth } }).select('createdAt').lean();
    const thisMonthCounts = [0, 0, 0, 0];
    thisMonthOrders.forEach(o => {
      const d = new Date(o.createdAt).getDate();
      const wkIdx = Math.min(3, Math.floor((d - 1) / 7));
      thisMonthCounts[wkIdx]++;
    });

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const maxThisWeek = Math.max(...thisWeekCounts, 1);
    const maxLastWeek = Math.max(...lastWeekCounts, 1);
    const maxThisMonth = Math.max(...thisMonthCounts, 1);

    const chartData = {
      'This Week': days.map((day, i) => ({
        day,
        count: thisWeekCounts[i],
        heightPct: `${Math.max(15, Math.round((thisWeekCounts[i] / maxThisWeek) * 100))}%`
      })),
      'Last Week': days.map((day, i) => ({
        day,
        count: lastWeekCounts[i],
        heightPct: `${Math.max(15, Math.round((lastWeekCounts[i] / maxLastWeek) * 100))}%`
      })),
      'This Month': ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'].map((wk, i) => ({
        day: wk,
        count: thisMonthCounts[i],
        heightPct: `${Math.max(15, Math.round((thisMonthCounts[i] / maxThisMonth) * 100))}%`
      }))
    };

    // 4. Recent Activity
    let recentLogs = await AuditLog.find().sort({ createdAt: -1 }).limit(6).lean();
    let activities = [];

    if (recentLogs.length > 0) {
      activities = recentLogs.map(log => {
        let icon = 'history';
        let iconColor = 'text-primary';
        let iconBg = 'bg-primary-container/20';

        if (log.category === 'Order') {
          icon = 'local_laundry_service';
          iconColor = 'text-secondary';
          iconBg = 'bg-secondary-container/20';
        } else if (log.category === 'Payment') {
          icon = 'payments';
          iconColor = 'text-primary';
          iconBg = 'bg-primary-container/20';
        } else if (log.category === 'Provider') {
          icon = 'assignment_ind';
          iconColor = 'text-tertiary';
          iconBg = 'bg-tertiary-container/20';
        } else if (log.status === 'Failed') {
          icon = 'warning';
          iconColor = 'text-error';
          iconBg = 'bg-error-container/20';
        }

        const minsAgo = Math.max(1, Math.round((Date.now() - new Date(log.createdAt).getTime()) / 60000));
        const timeAgoStr = minsAgo < 60 ? `${minsAgo} mins ago` : minsAgo < 1440 ? `${Math.round(minsAgo / 60)} hours ago` : `${Math.round(minsAgo / 1440)} days ago`;

        return {
          id: log._id,
          icon,
          iconColor,
          iconBg,
          title: log.action,
          details: log.details,
          time: timeAgoStr
        };
      });
    } else {
      const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(4).populate('customer', 'fullName').lean();
      activities = recentOrders.map(o => ({
        id: o._id,
        icon: 'local_laundry_service',
        iconColor: 'text-secondary',
        iconBg: 'bg-secondary-container/20',
        title: `Order #${o.orderRef || o._id.toString().slice(-6).toUpperCase()} Placed`,
        details: `Customer ${o.customer?.fullName || 'Guest'} requested ${o.items?.[0]?.name || 'Standard Wash'} (KES ${(o.pricing?.grandTotal || 0).toLocaleString()}).`,
        time: 'Just now'
      }));
    }

    return res.status(200).json({
      success: true,
      data: {
        totalRevenue,
        revenueFormatted: totalRevenue >= 1000000 ? `KES ${(totalRevenue / 1000000).toFixed(1)}M` : `KES ${totalRevenue.toLocaleString()}`,
        revenueGrowth,
        activeOrders: activeOrdersCount,
        activeOrdersGrowth,
        avgOrderValue,
        avgOrderValueFormatted,
        readyOrders: readyOrdersCount,
        totalProviders,
        pendingProviders,
        ticketsCompletedToday: ticketsCompletedToday || activeOrdersCount,
        ticketsGrowth,
        openTickets,
        chartData,
        activities
      }
    });
  } catch (error) {
    next(error);
  }
};

