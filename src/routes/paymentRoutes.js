import { Router } from 'express';
import {
  getPaymentRecords,
  getPaymentMetrics,
  getPaymentById,
  settlePaymentPayout,
  processBulkPayouts,
  exportPaymentRecords
} from '../controllers/paymentController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';

const router = Router();

// Protect all admin payment ledger endpoints
router.use(authenticate, authorizeRoles('admin'));

router.get('/', getPaymentRecords);
router.get('/metrics', getPaymentMetrics);
router.get('/export', exportPaymentRecords);
router.post('/process-payouts', processBulkPayouts);
router.get('/:id', getPaymentById);
router.post('/:id/settle-payout', settlePaymentPayout);

export default router;
