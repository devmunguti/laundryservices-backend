import { Router } from 'express';
import {
  createOrder,
  getOrders,
  getOrderById,
  assignOrderProvider,
  updateOrderStatus
} from '../controllers/orderController.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';
import { requirePasswordChangeCompleted } from '../middleware/passwordChangeMiddleware.js';

const router = Router();

// Guest/Unauthenticated Checkout route for order placement
router.post('/', optionalAuthenticate, createOrder);

// Authenticated order management endpoints
router.use(authenticate, requirePasswordChangeCompleted);

router.get('/', getOrders);
router.get('/:id', getOrderById);
router.patch('/:id/assign-provider', authorizeRoles('admin'), assignOrderProvider);
router.patch('/:id/status', updateOrderStatus);

export default router;
