import { notificationConfig } from '../../config/notificationConfig.js';
import { normalizePhoneNumber, maskPhoneNumber, isValidPhoneNumber } from '../../utils/phoneUtils.js';
import { logger } from '../../utils/logger.js';
import mockProvider from './providers/mockProvider.js';
import africasTalkingProvider from './providers/africasTalkingProvider.js';
import twilioProvider from './providers/twilioProvider.js';

const PROVIDER_MAP = {
  africastalking: africasTalkingProvider,
  at: africasTalkingProvider,
  twilio: twilioProvider,
  mock: mockProvider
};

/**
 * Resolves the configured SMS provider instance based on environment / config.
 */
export const getSmsProvider = (providerName = null) => {
  const selected = (providerName || notificationConfig.sms.provider || 'mock').toLowerCase().trim();
  return PROVIDER_MAP[selected] || mockProvider;
};

/**
 * Central SMS sending method.
 * Validates, normalizes E.164 phone numbers, checks enabled status, and sends via adapter.
 * Failures will NEVER throw unhandled exceptions to callers.
 * 
 * @param {Object} options
 * @param {string} options.to - Recipient phone number (local Kenyan or international)
 * @param {string} options.message - Text message content
 * @param {string} [options.from] - Optional sender ID
 * @param {string} [options.userId] - Optional User ID
 * @param {string} [options.type] - Notification event type
 * @param {string} [options.provider] - Explicit provider override
 * @param {Object} [options.metadata] - Extra metadata
 * @returns {Promise<Object>} Delivery result { success, status, messageId, maskedRecipient, provider }
 */
export const sendSMS = async ({
  to,
  message,
  from = null,
  userId = null,
  type = 'GENERAL',
  provider = null,
  metadata = {}
}) => {
  try {
    if (!to || typeof to !== 'string') {
      logger.warn(`[SMSService] Attempted to send SMS with invalid phone target: '${to}'`);
      return { success: false, status: 'suppressed', reason: 'Invalid phone number' };
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      logger.warn(`[SMSService] Attempted to send empty SMS to ${maskPhoneNumber(to)}`);
      return { success: false, status: 'suppressed', reason: 'Empty message body' };
    }

    // 1. Normalize phone to E.164
    const normalizedPhone = normalizePhoneNumber(to);
    const maskedPhone = maskPhoneNumber(to);

    if (!normalizedPhone || !isValidPhoneNumber(normalizedPhone)) {
      logger.warn(`[SMSService] Phone number '${maskedPhone}' could not be normalized to E.164. Suppressed.`);
      return { success: false, status: 'suppressed', reason: 'Phone normalization failed' };
    }

    // 2. Check if SMS is globally disabled in config
    if (!notificationConfig.sms.enabled) {
      logger.info(`[SMSService] SMS disabled (SMS_ENABLED=false) — notification would have been sent to ${maskedPhone}`);
      return {
        success: true,
        status: 'suppressed',
        simulated: true,
        reason: 'SMS disabled by configuration',
        maskedRecipient: maskedPhone,
        messageId: `DEV-DISABLED-${Date.now()}`
      };
    }

    // 3. Resolve SMS Provider Adapter
    const adapter = getSmsProvider(provider);
    const resolvedProviderName = provider || notificationConfig.sms.provider || 'mock';

    // 4. Dispatch SMS through selected provider adapter
    const result = await adapter.sendSms({
      to: normalizedPhone,
      message: message.trim(),
      from,
      metadata: { ...metadata, userId, type }
    });

    return {
      ...result,
      provider: resolvedProviderName,
      maskedRecipient: maskedPhone
    };
  } catch (err) {
    logger.error(`[SMSService] Unexpected error in SMS service: ${err.message}`);
    return {
      success: false,
      status: 'failed',
      error: err.message,
      maskedRecipient: maskPhoneNumber(to)
    };
  }
};

export const smsService = {
  sendSMS,
  getSmsProvider
};

export default smsService;
