import { Router } from 'express';
import {
  getPaymentRecords,
  getPaymentMetrics,
  getPaymentById,
  settlePaymentPayout,
  processBulkPayouts,
  exportPaymentRecords,
  requestProviderPayout,
  checkoutOrderPayment,
  getPaymentStatus,
  handlePayHeroCallback,
  retryOrderPayment,
  getMyPayments,
  getProviderPayments,
  updateProviderPayoutSettings,
  getProviderPaymentChannels,
  addPaymentChannel,
  deletePaymentChannel,
  confirmManualPayment,
  verifyManualPayment,
  sendPaymentPayoutInvoice,
  sendBulkPayoutInvoices
} from '../controllers/paymentController.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';

const router = Router();

// Public Webhook callback from PayHero (Unauthenticated as PayHero sends HTTP callbacks)
router.post('/payhero/callback', handlePayHeroCallback);

// Customer Checkout & Status Polling (Supports Guest Customers without requiring login)
router.post('/checkout', optionalAuthenticate, checkoutOrderPayment);
router.post('/confirm-manual', optionalAuthenticate, confirmManualPayment);
router.post('/verify-manual', optionalAuthenticate, verifyManualPayment);
router.get('/:paymentId/status', optionalAuthenticate, getPaymentStatus);
router.post('/:id/retry', optionalAuthenticate, retryOrderPayment);
router.get('/my-payments', authenticate, authorizeRoles('customer', 'user'), getMyPayments);

// Provider Earnings & Payout Settings
router.get('/provider', authenticate, authorizeRoles('provider', 'cleaner', 'admin'), getProviderPayments);
router.put('/provider/payout-settings', authenticate, authorizeRoles('provider', 'cleaner'), updateProviderPayoutSettings);
router.post('/request-payout', authenticate, authorizeRoles('provider', 'cleaner', 'admin'), requestProviderPayout);

// Provider Payment Channels Management
router.get('/channels', authenticate, authorizeRoles('provider', 'cleaner', 'user', 'admin'), getProviderPaymentChannels);
router.post('/channels', authenticate, authorizeRoles('provider', 'cleaner', 'user', 'admin'), addPaymentChannel);
router.delete('/channels/:channelId', authenticate, authorizeRoles('provider', 'cleaner', 'user', 'admin'), deletePaymentChannel);

// Admin payment ledger endpoints
router.get('/', authenticate, authorizeRoles('admin'), getPaymentRecords);
router.get('/metrics', authenticate, authorizeRoles('admin'), getPaymentMetrics);
router.get('/export', authenticate, authorizeRoles('admin'), exportPaymentRecords);
router.post('/process-payouts', authenticate, authorizeRoles('admin'), processBulkPayouts);
router.post('/bulk-send-invoices', authenticate, authorizeRoles('admin'), sendBulkPayoutInvoices);
router.get('/:id', authenticate, authorizeRoles('admin'), getPaymentById);
router.post('/:id/settle-payout', authenticate, authorizeRoles('admin'), settlePaymentPayout);
router.post('/:id/send-payout-invoice', authenticate, authorizeRoles('admin'), sendPaymentPayoutInvoice);

export default router;


