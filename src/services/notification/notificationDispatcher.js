import { handleNotification } from './notificationService.js';
import { logger } from '../../utils/logger.js';

/**
 * Asynchronously dispatches a business notification event in a detached, non-blocking promise.
 * Ensures business transactions (payments, orders, registrations, etc.) NEVER wait on SMTP or fail due to network errors.
 * 
 * @param {string} event - Notification event constant from NOTIFICATION_EVENTS
 * @param {Object} payload - Business entity data
 */
export const dispatchNotification = (event, payload = {}) => {
  // Execute in detached microtask / promise
  Promise.resolve()
    .then(async () => {
      try {
        const result = await handleNotification(event, payload);
        return result;
      } catch (error) {
        logger.error(`[NotificationDispatcher] Background error executing '${event}': ${error.message}`);
      }
    })
    .catch((unhandledErr) => {
      logger.error(`[NotificationDispatcher] Unhandled promise rejection for '${event}': ${unhandledErr.message}`);
    });
};

export const notificationDispatcher = {
  dispatch: dispatchNotification
};

export default notificationDispatcher;
