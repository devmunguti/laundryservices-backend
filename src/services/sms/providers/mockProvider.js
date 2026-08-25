import { logger } from '../../../utils/logger.js';
import { maskPhoneNumber } from '../../../utils/phoneUtils.js';

/**
 * Mock SMS Provider for local development, testing, and fallback.
 * Safely simulates SMS delivery without making external API calls or logging sensitive content.
 */
export const sendMockSms = async ({ to, message, from = 'AURA', metadata = {} }) => {
  const maskedTo = maskPhoneNumber(to);
  const simulatedMessageId = `MOCK-SMS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  logger.info(`[SMS MockProvider] SMS simulated for ${maskedTo} [Sender: ${from}] (MsgID: ${simulatedMessageId})`);

  return {
    success: true,
    provider: 'mock',
    messageId: simulatedMessageId,
    status: 'sent',
    recipient: to,
    maskedRecipient: maskedTo,
    cost: '0.00',
    simulated: true
  };
};

export default {
  sendSms: sendMockSms
};
