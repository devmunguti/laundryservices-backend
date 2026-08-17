import crypto from 'crypto';
import { NOTIFICATION_EVENTS } from './notificationEvents.js';
import { sendTemplatedEmail } from '../email/emailService.js';
import { getOrInitSettings } from '../systemSettingsService.js';
import { emailConfig } from '../../config/emailConfig.js';
import User from '../../models/User.js';
import Order from '../../models/Order.js';
import { logger } from '../../utils/logger.js';

/**
 * Computes a deterministic SHA-256 hash for notification idempotency.
 */
export const computeIdempotencyKey = ({ event, entityId, recipient, statusVersion = '1' }) => {
  const raw = `${event}:${String(entityId || '')}:${String(recipient || '').toLowerCase().trim()}:${statusVersion}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
};

/**
 * Resolves the primary administrator email address for alert delivery.
 * Prioritizes the email configured in the Admin Dashboard (SystemSetting),
 * followed by EMAIL_ADMIN_ALERTS_TO in .env, and finally the active admin user account.
 */
export const resolveAdminRecipient = async () => {
  try {
    const settings = await getOrInitSettings();
    if (settings?.general?.adminAlertEmail && settings.general.adminAlertEmail.includes('@')) {
      return settings.general.adminAlertEmail.trim();
    }
    if (settings?.general?.supportEmail && settings.general.supportEmail.includes('@')) {
      return settings.general.supportEmail.trim();
    }
  } catch (err) {
    // Fallback if settings query fails
  }

  if (emailConfig.adminAlertsTo && emailConfig.adminAlertsTo.includes('@')) {
    return emailConfig.adminAlertsTo.trim();
  }

  // Fallback to first active admin in database
  try {
    const adminUser = await User.findOne({ role: 'admin', isActive: true }).select('email');
    if (adminUser?.email) {
      return adminUser.email.trim();
    }
  } catch (dbErr) {
    // Ignore
  }

  return 'admin@auralaundry.co.ke';
};

/**
 * Notification Service orchestrator: handles preference check, recipient resolution, and sending.
 */
export const handleNotification = async (event, payload = {}) => {
  const settings = await getOrInitSettings();
  const notificationPrefs = settings?.notifications || {};

  switch (event) {
    // ── ADMIN NOTIFICATION 1: New Provider Registration ───────────────────────
    case NOTIFICATION_EVENTS.ADMIN_PROVIDER_REGISTRATION_PENDING: {
      if (notificationPrefs.providerRegistration === false || notificationPrefs.newCleanerRegistrations === false) {
        logger.info(`[NotificationService] Admin provider registration alerts disabled in settings. Skipping.`);
        return { status: 'suppressed', reason: 'Preference disabled' };
      }

      const adminEmail = await resolveAdminRecipient();
      const provider = payload.provider || {};
      const providerId = provider._id || provider.id || payload.providerId;

      const idempotencyKey = computeIdempotencyKey({
        event,
        entityId: providerId,
        recipient: adminEmail,
        statusVersion: 'pending'
      });

      return await sendTemplatedEmail({
        to: adminEmail,
        templateId: 'admin.provider-registration-pending',
        event,
        idempotencyKey,
        recipientUser: providerId,
        variables: {
          providerId: String(providerId),
          providerName: provider.fullName || `${provider.firstName || ''} ${provider.lastName || ''}`.trim() || 'Provider',
          businessName: provider.providerDetails?.businessName || provider.fullName || 'Laundry Provider',
          email: provider.email || 'N/A',
          phone: provider.phone || 'N/A',
          registeredAt: new Date(provider.createdAt || Date.now()).toLocaleString(),
          status: provider.status || 'Pending',
          adminReviewUrl: `${emailConfig.adminPortalUrl}?tab=cleaners&search=${encodeURIComponent(provider.email || '')}`
        }
      });
    }

    // ── ADMIN NOTIFICATION 2: Payment Completed & Commission Action ──────────
    case NOTIFICATION_EVENTS.ADMIN_PROVIDER_COMMISSION_REQUESTED: {
      if (notificationPrefs.providerCommission === false) {
        logger.info(`[NotificationService] Admin provider commission alerts disabled in settings. Skipping.`);
        return { status: 'suppressed', reason: 'Preference disabled' };
      }

      const adminEmail = await resolveAdminRecipient();
      const payment = payload.payment || {};
      const order = payload.order || {};
      const paymentId = payment._id || payment.id || payload.paymentId;
      const orderRef = order.orderRef || payment.orderId || payload.orderRef || 'ORDER';

      const idempotencyKey = computeIdempotencyKey({
        event,
        entityId: paymentId,
        recipient: adminEmail,
        statusVersion: String(payment.status || 'paid').toLowerCase()
      });

      return await sendTemplatedEmail({
        to: adminEmail,
        templateId: 'admin.provider-commission-requested',
        event,
        idempotencyKey,
        relatedOrder: order._id || payment.order || null,
        relatedPayment: paymentId,
        variables: {
          orderRef: String(orderRef),
          customerName: payment.customerName || order.customer?.fullName || 'Customer',
          providerName: payment.providerName || order.provider?.fullName || 'Assigned Provider',
          orderAmount: payment.amount || order.pricing?.grandTotal || 0,
          transactionId: payment.transactionId || 'M-Pesa Verified',
          commissionRate: String(payment.commissionRate || 15),
          commissionAmount: payment.commissionAmount || 0,
          providerPayoutAmount: payment.providerPayoutAmount || 0,
          paidAt: new Date(payment.paidAt || Date.now()).toLocaleString(),
          adminPaymentUrl: `${emailConfig.adminPortalUrl}?tab=payments&search=${encodeURIComponent(orderRef)}`
        }
      });
    }

    // ── ADMIN NOTIFICATION 3: Malicious / Security Threat Detected ───────────
    case NOTIFICATION_EVENTS.ADMIN_MALICIOUS_ACTIVITY_DETECTED: {
      if (notificationPrefs.securityAlerts === false) {
        logger.info(`[NotificationService] Admin security alerts disabled in settings. Skipping.`);
        return { status: 'suppressed', reason: 'Preference disabled' };
      }

      const adminEmail = await resolveAdminRecipient();
      const log = payload.log || payload;
      const logId = log._id || log.id || `SEC-${Date.now()}`;

      const idempotencyKey = computeIdempotencyKey({
        event,
        entityId: logId,
        recipient: adminEmail,
        statusVersion: 'detected'
      });

      return await sendTemplatedEmail({
        to: adminEmail,
        templateId: 'admin.malicious-activity-alert',
        event,
        idempotencyKey,
        variables: {
          severity: log.severity || (log.status === 'Failed' ? 'HIGH' : 'MEDIUM'),
          action: log.action || 'Suspicious Activity Detected',
          details: log.details || 'A potentially unauthorized security incident was logged.',
          timestamp: new Date(log.createdAt || Date.now()).toLocaleString(),
          ipAddress: log.ipAddress || 'Unknown IP',
          userAgent: log.userAgent || 'Not captured',
          userEmail: log.userEmail || (typeof log.user === 'object' ? log.user?.email : null) || 'Unauthenticated',
          adminAuditUrl: `${emailConfig.adminPortalUrl}?tab=audit-logs`
        }
      });
    }

    // ── ADMIN NOTIFICATION 4: Promotion Approval Request ──────────────────────
    case NOTIFICATION_EVENTS.ADMIN_PROMOTION_APPROVAL_REQUESTED: {
      if (notificationPrefs.promotionRequests === false) {
        logger.info(`[NotificationService] Admin promotion alerts disabled in settings. Skipping.`);
        return { status: 'suppressed', reason: 'Preference disabled' };
      }

      const adminEmail = await resolveAdminRecipient();
      const promo = payload.promotion || payload;
      const promoId = promo._id || promo.id;

      const idempotencyKey = computeIdempotencyKey({
        event,
        entityId: promoId,
        recipient: adminEmail,
        statusVersion: 'submitted'
      });

      return await sendTemplatedEmail({
        to: adminEmail,
        templateId: 'admin.promotion-approval-requested',
        event,
        idempotencyKey,
        relatedPromotion: promoId,
        variables: {
          providerName: promo.providerName || 'Service Provider',
          businessName: promo.providerName || 'Laundry Provider',
          packageName: promo.packageName || '7 Days Featured Placement',
          durationDays: String(promo.durationDays || 7),
          amount: promo.amount || 1000,
          mpesaTransactionCode: promo.mpesaTransactionCode || 'PENDING',
          submittedAt: new Date(promo.createdAt || Date.now()).toLocaleString(),
          tagline: promo.tagline || '',
          adminReviewUrl: `${emailConfig.adminPortalUrl}?tab=promotions`
        }
      });
    }

    // ── PROVIDER NOTIFICATION 0: New Paid Order Confirmed ───────────────────
    case NOTIFICATION_EVENTS.PROVIDER_ORDER_PAYMENT_CONFIRMED: {
      if (notificationPrefs.providerNewOrders === false) {
        return { status: 'suppressed', reason: 'Preference disabled' };
      }

      let order = payload.order;
      const payment = payload.payment || {};
      const orderId = order?._id || order?.id || payload.orderId || payment.order;

      // If full order details not pre-populated, query from DB
      if (!order?.items || !order?.customer || typeof order.customer !== 'object') {
        if (orderId) {
          order = await Order.findById(orderId)
            .populate('customer', 'fullName email phone')
            .populate('provider', 'fullName email phone providerDetails')
            .populate('items.service', 'name');
        }
      }

      if (!order) {
        return { status: 'suppressed', reason: 'Order not found' };
      }

      // Resolve provider
      let provider = payload.provider || order.provider;
      if (!provider?.email && order.provider) {
        provider = await User.findById(order.provider);
      }

      if (!provider?.email) {
        logger.warn(`[NotificationService] Provider order payment confirmed email skipped — provider has no email.`);
        return { status: 'suppressed', reason: 'Provider email missing' };
      }

      // Resolve customer / client details
      let customer = order.customer;
      if (!customer?.fullName && typeof customer === 'string') {
        customer = await User.findById(customer).select('fullName email phone');
      }

      const orderRef = order.orderRef || payment.orderId || 'ORDER';
      const grandTotal = order.pricing?.grandTotal || payment.amount || 0;
      const mpesaCode = payment.transactionId || payment.gatewayMeta?.mpesaReceiptNumber || 'M-Pesa Verified';

      const idempotencyKey = computeIdempotencyKey({
        event,
        entityId: order._id || orderId,
        recipient: provider.email,
        statusVersion: 'paid'
      });

      // Format pickup & delivery addresses
      const pickupAddressStr = order.pickupAddress?.street 
        ? `${order.pickupAddress.street}${order.pickupAddress.city ? ', ' + order.pickupAddress.city : ''}`
        : 'Nairobi (Scheduled Pickup)';
      
      const deliveryAddressStr = order.deliveryAddress?.street
        ? `${order.deliveryAddress.street}${order.deliveryAddress.city ? ', ' + order.deliveryAddress.city : ''}`
        : pickupAddressStr;

      // Format pickup slot
      let pickupSlotStr = 'Standard Pickup';
      if (order.pickupSlot?.date) {
        const slotDate = new Date(order.pickupSlot.date).toLocaleDateString();
        const start = order.pickupSlot.windowStart || '09:00';
        const end = order.pickupSlot.windowEnd || '11:00';
        pickupSlotStr = `${slotDate} (${start} - ${end})`;
      }

      const serviceName = order.items?.[0]?.name || order.items?.[0]?.service?.name || 'Laundry Service';
      const itemCount = `${order.items?.length || 1} item(s)`;

      return await sendTemplatedEmail({
        to: provider.email,
        templateId: 'provider.order-payment-confirmed',
        event,
        idempotencyKey,
        recipientUser: provider._id,
        relatedOrder: order._id,
        relatedPayment: payment._id || null,
        variables: {
          providerName: provider.fullName || provider.providerDetails?.businessName || 'Cleaner',
          businessName: provider.providerDetails?.businessName || provider.fullName || 'Cleaner',
          orderRef: String(orderRef),
          orderAmount: grandTotal,
          transactionId: String(mpesaCode),
          paidAt: new Date(payment.paidAt || Date.now()).toLocaleString(),
          paymentMethod: payment.method === 'cod' ? 'Cash on Delivery' : 'M-Pesa Express',
          customerName: customer?.fullName || payment.customerName || 'Verified Customer',
          customerPhone: customer?.phone || payment.phoneNumber || 'N/A',
          customerEmail: customer?.email || 'N/A',
          pickupAddress: pickupAddressStr,
          deliveryAddress: deliveryAddressStr,
          pickupSlot: pickupSlotStr,
          notes: order.notes || 'None',
          serviceName,
          itemCount,
          providerOrdersUrl: `${emailConfig.providerPortalUrl}?tab=orders&search=${encodeURIComponent(orderRef)}`
        }
      });
    }

    // ── PROVIDER NOTIFICATION 1: Paid Unreviewed Orders Digest ────────────────
    case NOTIFICATION_EVENTS.PROVIDER_PAID_ORDERS_UNREVIEWED: {
      if (notificationPrefs.providerOrderDigest === false) {
        return { status: 'suppressed', reason: 'Preference disabled' };
      }

      const provider = payload.provider;
      if (!provider?.email) {
        return { status: 'suppressed', reason: 'Provider email missing' };
      }

      const unreviewedOrders = payload.orders || [];
      if (unreviewedOrders.length === 0) {
        return { status: 'suppressed', reason: 'No unreviewed orders' };
      }

      // Daily digest idempotency key based on date
      const todayDateStr = new Date().toISOString().slice(0, 10);
      const idempotencyKey = computeIdempotencyKey({
        event,
        entityId: provider._id || provider.id,
        recipient: provider.email,
        statusVersion: todayDateStr
      });

      const orderSummaryList = unreviewedOrders.map(o => ({
        orderRef: o.orderRef,
        serviceName: o.items?.[0]?.name || 'Laundry Service',
        amount: o.pricing?.grandTotal || 0,
        status: o.status || 'Pending'
      }));

      return await sendTemplatedEmail({
        to: provider.email,
        templateId: 'provider.paid-orders-unreviewed',
        event,
        idempotencyKey,
        recipientUser: provider._id,
        variables: {
          providerName: provider.providerDetails?.businessName || provider.fullName || 'Cleaner',
          unreviewedCount: String(unreviewedOrders.length),
          orderSummaryList,
          providerDashboardUrl: `${emailConfig.providerPortalUrl}?tab=orders`
        }
      });
    }

    // ── PROVIDER NOTIFICATION 2: Customer Rating / Review Received ────────────
    case NOTIFICATION_EVENTS.PROVIDER_RATING_UPDATED: {
      if (notificationPrefs.providerReviews === false) {
        return { status: 'suppressed', reason: 'Preference disabled' };
      }

      const review = payload.review || payload;
      const provider = payload.provider || (review.provider ? await User.findById(review.provider) : null);

      if (!provider?.email) {
        logger.warn(`[NotificationService] Provider review notification skipped — provider has no email.`);
        return { status: 'suppressed', reason: 'Provider email missing' };
      }

      const reviewId = review._id || review.id || `REV-${Date.now()}`;
      const idempotencyKey = computeIdempotencyKey({
        event,
        entityId: reviewId,
        recipient: provider.email,
        statusVersion: 'published'
      });

      return await sendTemplatedEmail({
        to: provider.email,
        templateId: 'provider.rating-updated',
        event,
        idempotencyKey,
        recipientUser: provider._id,
        relatedOrder: review.order || null,
        variables: {
          providerName: provider.fullName || 'Cleaner',
          businessName: provider.providerDetails?.businessName || provider.fullName || 'Cleaner Profile',
          orderRef: review.orderRef || 'ORDER',
          rating: review.rating || 5,
          comment: review.comment || 'Great service!',
          customerName: review.customerName || 'Verified Customer',
          reviewDate: new Date(review.createdAt || Date.now()).toLocaleDateString(),
          updatedAverageRating: String(provider.providerDetails?.rating || review.rating || '5.0'),
          totalReviewsCount: String(provider.providerDetails?.reviewsCount || 1),
          providerReviewsUrl: `${emailConfig.providerPortalUrl}?tab=reviews`
        }
      });
    }

    // ── PROVIDER NOTIFICATION 3: Promotion Payment Receipt on Activation ─────
    case NOTIFICATION_EVENTS.PROVIDER_PROMOTION_PAYMENT_RECEIPT: {
      if (notificationPrefs.promotionReceipts === false) {
        return { status: 'suppressed', reason: 'Preference disabled' };
      }

      const promo = payload.promotion || payload;
      const provider = payload.provider || (promo.provider ? await User.findById(promo.provider) : null);

      if (!provider?.email) {
        return { status: 'suppressed', reason: 'Provider email missing' };
      }

      const promoId = promo._id || promo.id;
      const idempotencyKey = computeIdempotencyKey({
        event,
        entityId: promoId,
        recipient: provider.email,
        statusVersion: 'approved_active'
      });

      return await sendTemplatedEmail({
        to: provider.email,
        templateId: 'provider.promotion-payment-receipt',
        event,
        idempotencyKey,
        recipientUser: provider._id,
        relatedPromotion: promoId,
        variables: {
          providerName: provider.fullName || 'Cleaner',
          businessName: provider.providerDetails?.businessName || provider.fullName || 'Cleaner Profile',
          packageName: promo.packageName || 'Featured Placement',
          amount: promo.amount || 1000,
          mpesaTransactionCode: promo.mpesaTransactionCode || 'VERIFIED',
          durationDays: String(promo.durationDays || 7),
          startsAt: new Date(promo.startsAt || Date.now()).toLocaleDateString(),
          expiresAt: new Date(promo.expiresAt || (Date.now() + 7 * 86400000)).toLocaleDateString(),
          receiptNumber: `RCP-${promo.mpesaTransactionCode || Date.now()}`,
          providerDashboardUrl: `${emailConfig.providerPortalUrl}?tab=boost`
        }
      });
    }

    // ── PROVIDER NOTIFICATION 4: Promotion Expiry Reminders (30, 14, 7 Days) ──
    case NOTIFICATION_EVENTS.PROVIDER_PROMOTION_EXPIRY_30_DAYS:
    case NOTIFICATION_EVENTS.PROVIDER_PROMOTION_EXPIRY_14_DAYS:
    case NOTIFICATION_EVENTS.PROVIDER_PROMOTION_EXPIRY_7_DAYS: {
      if (notificationPrefs.promotionExpiryReminders === false) {
        return { status: 'suppressed', reason: 'Preference disabled' };
      }

      const promo = payload.promotion;
      const provider = payload.provider || (promo?.provider ? await User.findById(promo.provider) : null);
      const daysRemaining = payload.daysRemaining || (event.includes('30') ? 30 : event.includes('14') ? 14 : 7);

      if (!provider?.email) {
        return { status: 'suppressed', reason: 'Provider email missing' };
      }

      const promoId = promo._id || promo.id;
      const idempotencyKey = computeIdempotencyKey({
        event,
        entityId: promoId,
        recipient: provider.email,
        statusVersion: `days_${daysRemaining}`
      });

      return await sendTemplatedEmail({
        to: provider.email,
        templateId: 'provider.promotion-expiry-reminder',
        event,
        idempotencyKey,
        recipientUser: provider._id,
        relatedPromotion: promoId,
        variables: {
          providerName: provider.fullName || 'Cleaner',
          businessName: provider.providerDetails?.businessName || provider.fullName || 'Cleaner Profile',
          packageName: promo.packageName || promo.promotionPackage || 'Featured Boost',
          daysRemaining: String(daysRemaining),
          expiresAt: new Date(promo.expiresAt || promo.providerDetails?.promotedUntil || Date.now()).toLocaleDateString(),
          renewalUrl: `${emailConfig.providerPortalUrl}?tab=boost`
        }
      });
    }

    // ── PROVIDER NOTIFICATION 5: Payout Settlement Invoice ────────────────────
    case NOTIFICATION_EVENTS.PROVIDER_PAYOUT_INVOICE_SENT: {
      const payment = payload.payment;
      const provider = payload.provider || (payment?.provider ? await User.findById(payment.provider) : null);

      if (!provider?.email) {
        return { status: 'suppressed', reason: 'Provider email missing' };
      }

      const invoiceNumber = payload.invoiceNumber || payment.invoiceReference || `INV-PAY-${(payment._id || Date.now()).toString().slice(-6).toUpperCase()}`;
      const grossAmount = payload.grossAmount ?? payment.amount ?? 0;
      const commissionAmount = payload.commissionAmount ?? payment.commissionAmount ?? 0;
      const commissionRate = payload.commissionRate ?? payment.commissionRate ?? 15;
      const netPayoutAmount = payload.netPayoutAmount ?? payment.providerPayoutAmount ?? (grossAmount - commissionAmount);
      const payoutReference = payload.payoutReference || payment.payoutReference || 'M-Pesa B2C Payout';
      const orderRef = payload.orderRef || payment.orderId || 'Direct Settlement';

      const idempotencyKey = computeIdempotencyKey({
        event,
        entityId: payment._id || payment.id,
        recipient: provider.email,
        statusVersion: invoiceNumber
      });

      return await sendTemplatedEmail({
        to: provider.email,
        templateId: 'provider.payout-invoice',
        event,
        idempotencyKey,
        recipientUser: provider._id,
        relatedPayment: payment._id,
        variables: {
          providerName: provider.fullName || provider.providerDetails?.businessName || 'Valued Cleaner Partner',
          businessName: provider.providerDetails?.businessName || provider.fullName || 'Cleaner Business',
          invoiceNumber,
          invoiceDate: new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' }),
          orderRef,
          grossAmount,
          commissionRate,
          commissionAmount,
          netPayoutAmount,
          payoutReference,
          payoutMethod: provider.providerDetails?.payoutMethod === 'bank' ? 'Bank Account Transfer' : 'M-Pesa Mobile Money',
          payoutRecipient: provider.providerDetails?.payoutName || provider.fullName,
          payoutPhoneNumber: provider.providerDetails?.payoutPhoneNumber || provider.phone || 'Registered Account',
          providerPortalUrl: `${emailConfig.providerPortalUrl}?tab=earnings`
        }
      });
    }

    default: {
      logger.warn(`[NotificationService] Unhandled notification event: ${event}`);
      return { status: 'unhandled', event };
    }
  }
};

export default {
  computeIdempotencyKey,
  resolveAdminRecipient,
  handleNotification
};
