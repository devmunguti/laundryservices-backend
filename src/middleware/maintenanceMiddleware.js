import { getOrInitSettings } from '../services/systemSettingsService.js';

/**
 * Middleware to enforce platform Maintenance Mode for customer operations.
 * Allows Admin routes, auth routes, and health checks to proceed uninterrupted.
 */
export const maintenanceMiddleware = async (req, res, next) => {
  try {
    const settings = await getOrInitSettings();

    if (settings?.operations?.maintenanceMode) {
      // Allow admin users or admin route calls
      if (req.user && req.user.role === 'admin') {
        return next();
      }

      // Block non-admin customer operational requests (e.g. order creation, payments)
      return res.status(503).json({
        success: false,
        code: 'MAINTENANCE_MODE',
        message: 'Laundry is currently undergoing scheduled system maintenance. Please try again shortly.'
      });
    }

    next();
  } catch (error) {
    // If settings check fails, default to allowing request to prevent breaking system
    next();
  }
};
