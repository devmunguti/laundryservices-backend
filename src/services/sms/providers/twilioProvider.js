import axios from 'axios';
import querystring from 'querystring';
import { notificationConfig } from '../../../config/notificationConfig.js';
import { logger } from '../../../utils/logger.js';
import { maskPhoneNumber } from '../../../utils/phoneUtils.js';

/**
 * Twilio SMS Provider Adapter.
 * Integrates natively via Twilio Programmable Messaging REST API.
 */
export const sendTwilioSms = async ({ to, message, from }) => {
  const twilioConfig = notificationConfig.sms.twilio;
  const accountSid = twilioConfig.accountSid;
  const authToken = twilioConfig.authToken;
  const fromNumber = from || twilioConfig.fromNumber;

  const maskedTo = maskPhoneNumber(to);

  if (!accountSid || !authToken || !fromNumber) {
    logger.warn(`[TwilioProvider] Twilio credentials missing. Falling back to mock delivery for ${maskedTo}.`);
    return {
      success: true,
      provider: 'twilio-mock',
      messageId: `TW-MOCK-${Date.now()}`,
      status: 'sent',
      recipient: to,
      maskedRecipient: maskedTo
    };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;

  const payload = {
    To: to,
    From: fromNumber,
    Body: message
  };

  try {
    const response = await axios.post(endpoint, querystring.stringify(payload), {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 10000
    });

    const data = response.data;
    logger.info(`[TwilioProvider] SMS sent to ${maskedTo} (SID: ${data.sid})`);
    return {
      success: true,
      provider: 'twilio',
      messageId: data.sid,
      status: data.status === 'failed' || data.status === 'undelivered' ? 'failed' : 'sent',
      recipient: to,
      maskedRecipient: maskedTo
    };
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    logger.error(`[TwilioProvider] HTTP Error sending to ${maskedTo}: ${errorMsg}`);
    return {
      success: false,
      provider: 'twilio',
      status: 'failed',
      error: errorMsg,
      recipient: to,
      maskedRecipient: maskedTo
    };
  }
};

export default {
  sendSms: sendTwilioSms
};
