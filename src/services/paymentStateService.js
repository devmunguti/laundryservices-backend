import Payment from '../models/Payment.js';
import Order from '../models/Order.js';
import { createAuditLog } from './auditLogService.js';
import { checkPaymentStatus, normalizePayHeroPaymentStatus } from './payheroService.js';
import { notificationDispatcher } from './notification/notificationDispatcher.js';
import { NOTIFICATION_EVENTS } from './notification/notificationEvents.js';

/**
 * Terminal States Policy Matrix:
 * 'paid', 'failed', 'cancelled', 'expired' are terminal.
 * Terminal states can NEVER be overwritten except by explicit refund workflows.
 */
const TERMINAL_STATES = new Set(['paid', 'Paid', 'failed', 'Failed', 'cancelled', 'Cancelled', 'expired', 'Expired', 'refunded', 'Refunded']);

/**
 * Valid state transitions table
 */
const VALID_TRANSITIONS = {
  pending: ['processing', 'paid', 'failed', 'cancelled', 'expired'],
  processing: ['paid', 'failed', 'cancelled', 'expired'],
  failed: ['processing', 'paid'], // Allow retry creating new processing state
  cancelled: ['processing', 'paid'], // Allow retry
  expired: ['processing', 'paid'], // Allow retry
  paid: ['refunded', 'partially_refunded']
};

/**
 * Checks whether transitioning from currentState to nextState is allowed.
 */
export const canTransitionPaymentState = (currentState, nextState) => {
  const current = String(currentState || 'pending').toLowerCase();
  const next = String(nextState || '').toLowerCase();

  if (current === next) return true;
  if (TERMINAL_STATES.has(current) && current === 'paid' && next !== 'refunded' && next !== 'partially_refunded') {
    return false; // Protect paid state
  }

  const allowed = VALID_TRANSITIONS[current] || [];
  return allowed.includes(next);
};

/**
 * Finalizes a successful payment idempotently with decimal-safe amount verification.
 */
export const finalizeSuccessfulPayment = async ({ payment, mpesaCode, confirmedAmount, providerResponse = {}, req = null }) => {
  if (!payment) throw new Error('Payment document is required for finalization.');

  // Idempotency check
  const currentStatus = String(payment.status || '').toLowerCase();
  if (currentStatus === 'paid') {
    return { success: true, message: 'Payment already finalized and paid.', payment };
  }

  // 1. Load Order and perform Decimal-Safe Amount Verification
  const order = await Order.findById(payment.order);
  if (!order) {
    throw new Error(`Associated order ${payment.order} not found.`);
  }

  const expectedAmount = Number(order.pricing?.grandTotal || payment.amount || 0);
  const receivedAmount = confirmedAmount !== undefined && confirmedAmount !== null ? Number(confirmedAmount) : expectedAmount;

  // Decimal-safe comparison (tolerance 0.01)
  if (Math.abs(expectedAmount - receivedAmount) > 0.01) {
    payment.status = 'failed';
    payment.failureReason = `Payment amount verification failed. Expected KES ${expectedAmount}, received KES ${receivedAmount}.`;
    payment.failedAt = new Date();
    await payment.save();

    await Order.findByIdAndUpdate(payment.order, { paymentStatus: 'Failed' });

    await createAuditLog({
      req,
      user: { role: 'Security', fullName: 'Payment Amount Verification Engine' },
      action: 'PAYMENT_AMOUNT_MISMATCH',
      details: `SECURITY ALERT: Amount mismatch on Order ${order.orderRef}. Expected ${expectedAmount}, Received ${receivedAmount}.`,
      status: 'Failed',
      category: 'Security',
      metadata: { paymentId: payment._id, orderId: order.orderRef, expectedAmount, receivedAmount }
    });

    return { success: false, message: 'Payment amount mismatch verification failed.', payment };
  }

  // 2. Update Payment Document
  payment.status = 'paid';
  payment.paidAt = new Date();
  if (mpesaCode) {
    payment.transactionId = mpesaCode;
    payment.gatewayMeta = { ...payment.gatewayMeta, mpesaReceiptNumber: mpesaCode, providerResponse };
  }
  payment.callbackProcessedAt = new Date();
  await payment.save();

  // 3. Update Order Document — 'Pending' is the first valid enum state (paid, awaiting provider)
  order.status = 'Pending';
  order.paymentStatus = 'Paid';
  await order.save();

  // 4. Create Audit Log
  await createAuditLog({
    req,
    user: { role: 'System', fullName: 'Payment Settlement Engine' },
    action: 'PAYMENT_SUCCESSFUL',
    details: `Payment confirmed of KES ${payment.amount} for Order ${order.orderRef} (M-Pesa Code: ${mpesaCode || 'N/A'})`,
    status: 'Success',
    category: 'Payment',
    metadata: {
      paymentId: payment._id,
      orderId: order.orderRef,
      mpesaCode,
      amount: payment.amount
    }
  });

  // 5. Dispatch Admin Notification for provider commission action
  notificationDispatcher.dispatch(
    NOTIFICATION_EVENTS.ADMIN_PROVIDER_COMMISSION_REQUESTED,
    { payment, order }
  );

  // 6. Dispatch Provider Notification for new confirmed & paid order
  notificationDispatcher.dispatch(
    NOTIFICATION_EVENTS.PROVIDER_ORDER_PAYMENT_CONFIRMED,
    { payment, order }
  );

  return { success: true, message: 'Payment finalized successfully.', payment, order };
};

/**
 * Reconciles a processing/pending payment with PayHero Gateway API or timeout policy
 */
export const reconcilePayment = async (paymentId, req = null) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) return null;

  const currentStatus = String(payment.status || '').toLowerCase();
  if (TERMINAL_STATES.has(currentStatus)) {
    return {
      status: currentStatus,
      isTerminal: true,
      payment
    };
  }

  // Check configurable payment timeout (Default: 1 minute for prompt timeout)
  const timeoutMinutes = parseInt(process.env.PAYMENT_TIMEOUT_MINUTES, 10) || 1;
  const ageMs = Date.now() - new Date(payment.initiatedAt || payment.createdAt).getTime();
  const isTimedOut = ageMs > timeoutMinutes * 60 * 1000;

  // 1. Query PayHero API if reference is present
  if (payment.payheroReference || payment.transactionId) {
    const ref = payment.payheroReference || payment.transactionId;
    const statusResult = await checkPaymentStatus(ref);

    if (statusResult && statusResult.raw) {
      const normalized = normalizePayHeroPaymentStatus(statusResult.raw);
      payment.lastCheckedAt = new Date();
      payment.providerResultCode = String(normalized.resultCode || '');
      payment.providerResultDescription = String(normalized.resultDesc || '');

      if (normalized.normalizedStatus === 'paid') {
        return await finalizeSuccessfulPayment({
          payment,
          mpesaCode: statusResult.raw.mpesa_code || statusResult.raw.MpesaReceiptNumber || ref,
          confirmedAmount: statusResult.raw.amount,
          providerResponse: statusResult.raw,
          req
        });
      } else if (normalized.isTerminal) {
        payment.status = normalized.normalizedStatus;
        payment.failureReason = normalized.failureReason;
        payment.failedAt = new Date();
        await payment.save();

        await Order.findByIdAndUpdate(payment.order, { paymentStatus: 'Failed' });

        await createAuditLog({
          req,
          user: { role: 'System', fullName: 'Payment Reconciliation Worker' },
          action: `PAYMENT_${normalized.normalizedStatus.toUpperCase()}`,
          details: `Reconciliation determined ${normalized.normalizedStatus} for Order ${payment.orderId}: ${normalized.failureReason}`,
          status: 'Failed',
          category: 'Payment',
          metadata: { paymentId: payment._id, orderId: payment.orderId, status: normalized.normalizedStatus }
        });

        return { status: normalized.normalizedStatus, isTerminal: true, payment };
      }
    }
  }

  // 2. If PayHero API status query is unavailable or processing, check timeout
  if (isTimedOut) {
    payment.status = 'expired';
    payment.failureReason = `Payment request expired after ${timeoutMinutes} minutes window elapsed.`;
    payment.expiredAt = new Date();
    await payment.save();

    await Order.findByIdAndUpdate(payment.order, { paymentStatus: 'Failed' });

    await createAuditLog({
      req,
      user: { role: 'System', fullName: 'Payment Timeout Reconciliation Worker' },
      action: 'PAYMENT_EXPIRED',
      details: `Payment for Order ${payment.orderId} marked expired after ${timeoutMinutes} min timeout.`,
      status: 'Failed',
      category: 'Payment',
      metadata: { paymentId: payment._id, orderId: payment.orderId }
    });

    return { status: 'expired', isTerminal: true, payment };
  }

  return { status: 'processing', isTerminal: false, payment };
};
