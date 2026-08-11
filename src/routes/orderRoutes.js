import { Router } from 'express';
import { createOrder, getOrders, getOrderById, updateOrderStatus } from '../controllers/orderController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requirePasswordChangeCompleted } from '../middleware/passwordChangeMiddleware.js';

const router = Router();

router.use(authenticate, requirePasswordChangeCompleted);

router.post('/', createOrder);
router.get('/', getOrders);
router.get('/:id', getOrderById);
router.patch('/:id/status', updateOrderStatus);

export default router;
