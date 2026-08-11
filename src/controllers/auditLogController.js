import AuditLog from '../models/AuditLog.js';

/**
 * GET /api/audit-logs
 * Retrieves paginated audit logs with search, status, category, action, and date filtering.
 */
export const getAuditLogs = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const { search, status, category, action, timeRange, date, startDate, endDate } = req.query;

    const query = {};

    // Status filter
    if (status && status !== 'All') {
      query.status = status;
    }

    // Category filter
    if (category && category !== 'All') {
      query.category = category;
    }

    // Action filter
    if (action) {
      query.action = action;
    }

    // Search filter across userName, role, action, details, ipAddress
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { userName: searchRegex },
        { role: searchRegex },
        { action: searchRegex },
        { details: searchRegex },
        { ipAddress: searchRegex }
      ];
    }

    // Date / Time Range filtering
    if (date) {
      // Specific single date filter (EAT / Local day conversion)
      const targetDate = new Date(date);
      if (!isNaN(targetDate.getTime())) {
        const startOfDay = new Date(targetDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setUTCHours(23, 59, 59, 999);
        query.createdAt = { $gte: startOfDay, $lte: endOfDay };
      }
    } else if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    } else if (timeRange) {
      const now = new Date();
      if (timeRange === 'Today') {
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        query.createdAt = { $gte: startOfDay };
      } else if (timeRange === '7d') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query.createdAt = { $gte: sevenDaysAgo };
      } else if (timeRange === '30d') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        query.createdAt = { $gte: thirtyDaysAgo };
      }
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        logs,
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
 * GET /api/audit-logs/metrics
 * Returns real audit log summary metrics from MongoDB
 */
export const getAuditMetrics = async (req, res, next) => {
  try {
    const now = new Date();

    // 1. Total Events Today
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const totalEventsToday = await AuditLog.countDocuments({
      createdAt: { $gte: startOfToday }
    });

    // 2. Failed Login Attempts (Last 24 hours)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const failedLoginAttempts = await AuditLog.countDocuments({
      action: 'Failed Login',
      status: 'Failed',
      createdAt: { $gte: twentyFourHoursAgo }
    });

    // 3. Critical Actions (Requires Review)
    const criticalActionsList = [
      'Failed Login',
      'User Deleted',
      'User Disabled',
      'Role Changed',
      'Refund Processed',
      'Account Deactivated',
      'Security Event',
      'Provider Suspended'
    ];
    const criticalActions = await AuditLog.countDocuments({
      $or: [
        { action: { $in: criticalActionsList } },
        { status: 'Failed' }
      ],
      createdAt: { $gte: twentyFourHoursAgo }
    });

    return res.status(200).json({
      success: true,
      data: {
        totalEventsToday,
        failedLoginAttempts,
        criticalActions
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/audit-logs/export
 * Exports filtered audit logs to CSV
 */
export const exportAuditLogs = async (req, res, next) => {
  try {
    const { search, status, category, action, timeRange, date, startDate, endDate } = req.query;

    const query = {};

    if (status && status !== 'All') query.status = status;
    if (category && category !== 'All') query.category = category;
    if (action) query.action = action;

    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { userName: searchRegex },
        { role: searchRegex },
        { action: searchRegex },
        { details: searchRegex },
        { ipAddress: searchRegex }
      ];
    }

    if (date) {
      const targetDate = new Date(date);
      if (!isNaN(targetDate.getTime())) {
        const startOfDay = new Date(targetDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setUTCHours(23, 59, 59, 999);
        query.createdAt = { $gte: startOfDay, $lte: endOfDay };
      }
    } else if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    } else if (timeRange) {
      const now = new Date();
      if (timeRange === 'Today') {
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        query.createdAt = { $gte: startOfDay };
      } else if (timeRange === '7d') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        query.createdAt = { $gte: sevenDaysAgo };
      } else if (timeRange === '30d') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        query.createdAt = { $gte: thirtyDaysAgo };
      }
    }

    const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(5000).lean();

    const headers = ['Timestamp', 'User', 'Role', 'Action', 'Details', 'IP Address', 'Status', 'Category'];
    
    const rows = logs.map((log) => {
      const formattedDate = log.createdAt
        ? new Date(log.createdAt).toISOString().replace('T', ' ').substring(0, 19)
        : '';
      return [
        `"${formattedDate}"`,
        `"${(log.userName || '').replace(/"/g, '""')}"`,
        `"${(log.role || '').replace(/"/g, '""')}"`,
        `"${(log.action || '').replace(/"/g, '""')}"`,
        `"${(log.details || '').replace(/"/g, '""')}"`,
        `"${(log.ipAddress || '').replace(/"/g, '""')}"`,
        `"${(log.status || '').replace(/"/g, '""')}"`,
        `"${(log.category || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=Aura_Laundry_System_Logs.csv');
    return res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
};
