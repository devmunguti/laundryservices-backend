import SystemSetting from '../models/SystemSetting.js';
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
    const { general, financial, notifications, api, operations } = req.body;

    const changesTracked = [];

    // 1. General Settings
    if (general) {
      if (general.platformName !== undefined) settings.general.platformName = general.platformName;
      if (general.supportEmail !== undefined) settings.general.supportEmail = general.supportEmail;
      if (general.supportPhone !== undefined) settings.general.supportPhone = general.supportPhone;
      if (general.logoUrl !== undefined) settings.general.logoUrl = general.logoUrl;
      changesTracked.push('Platform Identity');
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
        platformName: settings.general?.platformName || 'Aura Laundry',
        supportEmail: settings.general?.supportEmail || 'support@auralaundry.co.ke',
        supportPhone: settings.general?.supportPhone || '+254 700 000 000',
        logoUrl: settings.general?.logoUrl || '',
        commissionRate: settings.financial?.commissionRate ?? 15,
        minimumPayoutThreshold: settings.financial?.minimumPayoutThreshold ?? 5000,
        maintenanceMode: settings.operations?.maintenanceMode ?? false
      }
    });
  } catch (error) {
    next(error);
  }
};

