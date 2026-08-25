import axios from 'axios';
import querystring from 'querystring';
import { notificationConfig } from '../../../config/notificationConfig.js';
import { logger } from '../../../utils/logger.js';
import { maskPhoneNumber } from '../../../utils/phoneUtils.js';

/**
 * Africa's Talking SMS Provider Adapter.
 * Integrates natively via Africa's Talking Messaging REST API.
 */
export const sendAfricasTalkingSms = async ({ to, message, from }) => {
  const atConfig = notificationConfig.sms.africasTalking;
  const username = atConfig.username || 'sandbox';
  const apiKey = atConfig.apiKey;
  const senderId = from || atConfig.senderId;

  const maskedTo = maskPhoneNumber(to);

  if (!apiKey) {
    logger.warn(`[AfricasTalkingProvider] AT_API_KEY missing. Falling back to mock delivery for ${maskedTo}.`);
    return {
      success: true,
      provider: 'africastalking-mock',
      messageId: `AT-MOCK-${Date.now()}`,
      status: 'sent',
      recipient: to,
      maskedRecipient: maskedTo
    };
  }

  const isSandbox = username.toLowerCase() === 'sandbox';
  const endpoint = isSandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';

  const payload = {
    username,
    to,
    message,
    ...(senderId && !isSandbox ? { from: senderId } : {})
  };

  try {
    const response = await axios.post(
      endpoint,
      querystring.stringify(payload),
      {
        headers: {
          apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000 // 10s timeout
      }
    );

    const data = response.data?.SMSMessageData;
    const recipientData = data?.Recipients?.[0];

    if (recipientData && (recipientData.status === 'Success' || recipientData.statusCode === 101)) {
      logger.info(`[AfricasTalkingProvider] SMS sent to ${maskedTo} (MsgID: ${recipientData.messageId})`);
      return {
        success: true,
        provider: 'africastalking',
        messageId: recipientData.messageId,
        status: 'sent',
        cost: recipientData.cost,
        recipient: to,
        maskedRecipient: maskedTo
      };
    }

    // Provider returned error inside 200 response
    const statusDesc = recipientData?.status || data?.Message || 'Unknown delivery failure';
    logger.error(`[AfricasTalkingProvider] Failed delivery to ${maskedTo}: ${statusDesc}`);
    return {
      success: false,
      provider: 'africastalking',
      status: 'failed',
      error: statusDesc,
      recipient: to,
      maskedRecipient: maskedTo
    };
  } catch (error) {
    const errorMsg = error.response?.data?.SMSMessageData?.Message || error.message;
    logger.error(`[AfricasTalkingProvider] HTTP Error sending to ${maskedTo}: ${errorMsg}`);
    return {
      success: false,
      provider: 'africastalking',
      status: 'failed',
      error: errorMsg,
      recipient: to,
      maskedRecipient: maskedTo
    };
  }
};

export default {
  sendSms: sendAfricasTalkingSms
};
