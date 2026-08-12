import { Router } from 'express';
import {
  getServices,
  getServiceById,
  createService,
  updateService,
  toggleServiceStatus,
  deleteService
} from '../controllers/serviceController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';

const router = Router();

// Public route: customers & visitors browse services
router.get('/', getServices);
router.get('/:id', getServiceById);

// Protected routes: Admin & Provider service management
router.post('/', authenticate, authorizeRoles('admin', 'provider'), createService);
router.put('/:id', authenticate, authorizeRoles('admin', 'provider'), updateService);
router.patch('/:id/status', authenticate, authorizeRoles('admin', 'provider'), toggleServiceStatus);
router.delete('/:id', authenticate, authorizeRoles('admin', 'provider'), deleteService);

export default router;
