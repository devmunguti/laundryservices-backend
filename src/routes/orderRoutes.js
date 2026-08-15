import { Router } from 'express';
import {
  createOrder,
  getOrders,
  getOrderById,
  getOrderMetrics,
  assignOrderProvider,
  updateOrderStatus,
  getOrderTracking
} from '../controllers/orderController.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';
import { requirePasswordChangeCompleted } from '../middleware/passwordChangeMiddleware.js';

const router = Router();

// Public order tracking — accessible to logged-in users and guests
// Must be before the authenticate middleware block
router.get('/track/:orderRef', optionalAuthenticate, getOrderTracking);

// Guest/Unauthenticated Checkout route for order placement
router.post('/', optionalAuthenticate, createOrder);

// Authenticated order management endpoints
router.use(authenticate, requirePasswordChangeCompleted);

router.get('/metrics', getOrderMetrics);
router.get('/', getOrders);
router.get('/:id', getOrderById);
router.patch('/:id/assign-provider', authorizeRoles('admin'), assignOrderProvider);
router.patch('/:id/status', updateOrderStatus);

export default router;

