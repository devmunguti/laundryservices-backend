import { sendTransportMail } from './emailProvider.js';
import { renderTemplate } from './templateEngine.js';
import { emailConfig } from '../../config/emailConfig.js';
import EmailNotificationLog from '../../models/EmailNotificationLog.js';
import { logger } from '../../utils/logger.js';

// Auto-register all email templates by importing them
import './templates/admin/newProviderRegistration.js';
import './templates/admin/newOrderPlaced.js';
import './templates/admin/providerCommissionRequest.js';
import './templates/admin/maliciousActivityAlert.js';
import './templates/admin/promotionApprovalRequest.js';
import './templates/provider/paidUnreviewedOrders.js';
import './templates/provider/ratingUpdate.js';
import './templates/provider/promotionPaymentReceipt.js';
import './templates/provider/promotionExpiryReminder.js';
import './templates/provider/orderPaymentConfirmed.js';
import './templates/provider/payoutInvoice.js';

/**
 * Sends an email based on a registered template and tracks execution in EmailNotificationLog.
 * 
 * @param {Object} options
 * @param {string} options.to - Target email address
 * @param {string} options.templateId - Registered template ID
 * @param {Object} options.variables - Data variables for template rendering
 * @param {string} options.event - Business event constant
 * @param {string} options.idempotencyKey - Unique deterministic key
 * @param {string} [options.recipientUser] - Optional MongoDB User ID
 * @param {string} [options.relatedOrder] - Optional MongoDB Order ID
 * @param {string} [options.relatedPayment] - Optional MongoDB Payment ID
 * @param {string} [options.relatedPromotion] - Optional MongoDB Promotion ID
 * @param {Object} [options.metadata] - Optional arbitrary metadata
 */
export const sendTemplatedEmail = async ({
  to,
  templateId,
  variables = {},
  event,
  idempotencyKey,
  recipientUser = null,
  relatedOrder = null,
  relatedPayment = null,
  relatedPromotion = null,
  metadata = {}
}) => {
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    logger.warn(`[EmailService] Invalid recipient email address provided: '${to}'. Suppressing delivery.`);
    return { success: false, status: 'suppressed', reason: 'Invalid recipient email' };
  }

  const cleanRecipient = to.toLowerCase().trim();

  // 1. Check Idempotency in EmailNotificationLog
  let logRecord = null;
  if (idempotencyKey) {
    const existingLog = await EmailNotificationLog.findOne({ idempotencyKey });
    if (existingLog) {
      if (existingLog.status === 'sent' || existingLog.status === 'queued') {
        logger.info(`[EmailService] Duplicate notification suppressed for key: ${idempotencyKey}`);
        return {
          success: true,
          status: 'suppressed',
          message: 'Duplicate notification suppressed by idempotency guard.',
          logId: existingLog._id
        };
      }
      logRecord = existingLog;
    }
  }

  // 2. Render Template
  let rendered;
  try {
    rendered = renderTemplate(templateId, variables);
  } catch (renderErr) {
    logger.error(`[EmailService] Template render error for '${templateId}': ${renderErr.message}`);

    // Create failed log record
    if (!logRecord) {
      try {
        await EmailNotificationLog.create({
          event: event || 'UNKNOWN_EVENT',
          recipient: cleanRecipient,
          recipientUser,
          idempotencyKey: idempotencyKey || `ERR-${Date.now()}-${Math.random()}`,
          subject: `Template Error: ${templateId}`,
          templateId,
          relatedOrder,
          relatedPayment,
          relatedPromotion,
          status: 'failed',
          lastError: `Template render failed: ${renderErr.message}`,
          metadata
        });
      } catch (dbErr) {
        // Ignore DB logging failure to protect business flow
      }
    }
    return { success: false, status: 'failed', error: renderErr.message };
  }

  // 3. Create or update queued log record
  if (!logRecord) {
    try {
      logRecord = await EmailNotificationLog.create({
        event: event || 'UNKNOWN_EVENT',
        recipient: cleanRecipient,
        recipientUser,
        idempotencyKey: idempotencyKey || `AUTO-${Date.now()}-${Math.random()}`,
        subject: rendered.subject,
        templateId,
        relatedOrder,
        relatedPayment,
        relatedPromotion,
        status: 'queued',
        metadata
      });
    } catch (createErr) {
      // If idempotency collision occurs at DB level
      if (createErr.code === 11000) {
        logger.info(`[EmailService] DB unique constraint prevented duplicate for key: ${idempotencyKey}`);
        return { success: true, status: 'suppressed', message: 'Suppressed concurrent duplicate' };
      }
      logger.error(`[EmailService] Error creating notification log: ${createErr.message}`);
    }
  }

  // 4. Check if email sending is disabled via global config
  if (!emailConfig.enabled) {
    logger.info(`[EmailService] EMAIL_ENABLED=false. Skipping network delivery for '${rendered.subject}' to ${cleanRecipient}.`);
    if (logRecord) {
      logRecord.status = 'sent';
      logRecord.sentAt = new Date();
      logRecord.messageId = `DEV-MOCK-${Date.now()}`;
      await logRecord.save();
    }
    return { success: true, status: 'sent', messageId: `DEV-MOCK-${Date.now()}` };
  }

  // 5. Transmit Email via Provider
  try {
    const sendResult = await sendTransportMail({
      to: cleanRecipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text
    });

    const messageId = sendResult?.messageId || `MSG-${Date.now()}`;

    if (logRecord) {
      logRecord.status = 'sent';
      logRecord.messageId = messageId;
      logRecord.sentAt = new Date();
      logRecord.lastError = null;
      await logRecord.save();
    }

    logger.info(`[EmailService] Email sent successfully to ${cleanRecipient} [${templateId}] (MsgID: ${messageId})`);
    return { success: true, status: 'sent', messageId };
  } catch (sendErr) {
    logger.error(`[EmailService] Email delivery failed to ${cleanRecipient} via ${emailConfig.provider}: ${sendErr.message}`);

    if (logRecord) {
      logRecord.status = 'failed';
      logRecord.lastError = sendErr.message;
      logRecord.attemptCount = (logRecord.attemptCount || 1) + 1;
      await logRecord.save();
    }

    return { success: false, status: 'failed', error: sendErr.message };
  }
};

export default {
  sendTemplatedEmail
};
