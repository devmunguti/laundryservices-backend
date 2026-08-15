import User from '../../models/User.js';
import Order from '../../models/Order.js';
import PromotionRequest from '../../models/PromotionRequest.js';
import { NOTIFICATION_EVENTS } from './notificationEvents.js';
import { notificationDispatcher } from './notificationDispatcher.js';
import { logger } from '../../utils/logger.js';

let schedulerInterval = null;

/**
 * Checks for active promotions that are 30, 14, or 7 days away from expiration and dispatches reminders.
 */
export const checkPromotionExpiries = async () => {
  try {
    const now = new Date();
    // Look ahead 31 days
    const maxDate = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);

    const activePromotions = await PromotionRequest.find({
      status: 'Approved',
      expiresAt: { $gt: now, $lte: maxDate }
    }).populate('provider');

    for (const promo of activePromotions) {
      if (!promo.provider || !promo.provider.email) continue;

      const diffMs = new Date(promo.expiresAt).getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

      let targetEvent = null;
      if (diffDays === 30 && promo.durationDays >= 30) {
        targetEvent = NOTIFICATION_EVENTS.PROVIDER_PROMOTION_EXPIRY_30_DAYS;
      } else if (diffDays === 14 && promo.durationDays >= 14) {
        targetEvent = NOTIFICATION_EVENTS.PROVIDER_PROMOTION_EXPIRY_14_DAYS;
      } else if (diffDays <= 7 && diffDays > 0) {
        targetEvent = NOTIFICATION_EVENTS.PROVIDER_PROMOTION_EXPIRY_7_DAYS;
      }

      if (targetEvent) {
        notificationDispatcher.dispatch(targetEvent, {
          promotion: promo,
          provider: promo.provider,
          daysRemaining: diffDays
        });
      }
    }
  } catch (error) {
    logger.error(`[NotificationScheduler] Error during promotion expiry check: ${error.message}`);
  }
};

/**
 * Checks for paid orders that have not yet been completed/reviewed and groups them by provider for a daily digest.
 */
export const checkPaidUnreviewedOrders = async () => {
  try {
    // Find orders that are Paid but still in early processing (Pending / Pickup_Scheduled / Picked_Up)
    const pendingPaidOrders = await Order.find({
      paymentStatus: 'Paid',
      status: { $in: ['Pending', 'Pickup_Scheduled', 'Picked_Up', 'In_Wash'] },
      provider: { $ne: null }
    }).populate('provider');

    // Group orders by provider
    const ordersByProvider = new Map();
    for (const order of pendingPaidOrders) {
      if (!order.provider || !order.provider.email) continue;
      const pid = order.provider._id.toString();
      if (!ordersByProvider.has(pid)) {
        ordersByProvider.set(pid, {
          provider: order.provider,
          orders: []
        });
      }
      ordersByProvider.get(pid).orders.push(order);
    }

    // Dispatch digest notification for each provider
    for (const { provider, orders } of ordersByProvider.values()) {
      notificationDispatcher.dispatch(NOTIFICATION_EVENTS.PROVIDER_PAID_ORDERS_UNREVIEWED, {
        provider,
        orders
      });
    }
  } catch (error) {
    logger.error(`[NotificationScheduler] Error during paid unreviewed orders check: ${error.message}`);
  }
};

/**
 * Runs all scheduled notification tasks immediately.
 */
export const runScheduledNotificationChecks = async () => {
  await Promise.all([
    checkPromotionExpiries(),
    checkPaidUnreviewedOrders()
  ]);
};

/**
 * Starts the notification background interval timer (runs once every 6 hours in background).
 */
export const startNotificationScheduler = (intervalMs = 6 * 60 * 60 * 1000) => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  // Run initial check after 10s server warmup
  setTimeout(() => {
    runScheduledNotificationChecks().catch((err) => logger.error(`Initial scheduler check error: ${err.message}`));
  }, 10000);

  // Set recurring interval
  schedulerInterval = setInterval(() => {
    runScheduledNotificationChecks().catch((err) => logger.error(`Recurring scheduler check error: ${err.message}`));
  }, intervalMs);

  logger.info(`[NotificationScheduler] Started background notification scheduler (Interval: ${Math.round(intervalMs / 60000)}m)`);
};

export const stopNotificationScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
};

export default {
  checkPromotionExpiries,
  checkPaidUnreviewedOrders,
  runScheduledNotificationChecks,
  startNotificationScheduler,
  stopNotificationScheduler
};
