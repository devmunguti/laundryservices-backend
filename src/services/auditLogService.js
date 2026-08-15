import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import { notificationDispatcher } from './notification/notificationDispatcher.js';
import { NOTIFICATION_EVENTS } from './notification/notificationEvents.js';

/**
 * Extracts originating IP address safely from Express request
 */
export const getClientIp = (req) => {
  if (!req) return 'Unknown';
  const xForwardedFor = req.headers && req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'Unknown';
};

/**
 * Centralized service to create audit log records
 */
export const createAuditLog = async ({
  req,
  user,
  action,
  details,
  status = 'Success',
  category = 'Other',
  metadata = {}
}) => {
  try {
    let userId = null;
    let userName = 'Unknown User';
    let userRole = 'Unauthenticated';

    if (user) {
      userId = user._id || user.id || null;
      userName = user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'User';
      userRole = user.role || 'user';
    } else if (req && req.user) {
      userId = req.user.id || req.user._id || null;
      userRole = req.user.role || 'user';

      // Try fetching user name if only ID is in req.user
      try {
        const fullUser = await User.findById(userId).select('fullName firstName lastName email role');
        if (fullUser) {
          userName = fullUser.fullName || `${fullUser.firstName || ''} ${fullUser.lastName || ''}`.trim() || fullUser.email;
          userRole = fullUser.role || userRole;
        }
      } catch (e) {
        // Fallback gracefully
      }
    }

    const ipAddress = getClientIp(req);
    const userAgent = req?.headers?.['user-agent'] || null;

    const logEntry = await AuditLog.create({
      user: userId,
      userName,
      role: userRole,
      action,
      details,
      ipAddress,
      status,
      category,
      metadata,
      userAgent,
      createdAt: new Date()
    });

    // Detect Security / Malicious Incidents
    const isSecurityIncident =
      category === 'Security' ||
      action.includes('PAYMENT_AMOUNT_MISMATCH') ||
      action.includes('Login Blocked') ||
      (status === 'Failed' && action.includes('Password Reset'));

    if (isSecurityIncident) {
      notificationDispatcher.dispatch(
        NOTIFICATION_EVENTS.ADMIN_MALICIOUS_ACTIVITY_DETECTED,
        {
          log: logEntry,
          severity: category === 'Security' || action.includes('MISMATCH') ? 'CRITICAL' : 'HIGH',
          userEmail: user?.email || (typeof user === 'string' ? user : userName)
        }
      );
    }

    return logEntry;
  } catch (error) {
    console.error('⚠️ Failed to create audit log entry:', error);
    return null;
  }
};
