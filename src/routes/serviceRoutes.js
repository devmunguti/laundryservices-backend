import { Router } from 'express';
import {
  getServices,
  getServiceById,
  createService,
  updateService,
  toggleServiceStatus,
  deleteService
} from '../controllers/serviceController.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';

const router = Router();

// Public route: customers & visitors browse services (optionalAuth attaches req.user if logged in)
router.get('/', optionalAuthenticate, getServices);
router.get('/:id', optionalAuthenticate, getServiceById);

// Protected routes: Admin & Provider service management
router.post('/', authenticate, authorizeRoles('admin', 'provider', 'cleaner'), createService);
router.put('/:id', authenticate, authorizeRoles('admin', 'provider', 'cleaner'), updateService);
router.patch('/:id/status', authenticate, authorizeRoles('admin', 'provider', 'cleaner'), toggleServiceStatus);
router.delete('/:id', authenticate, authorizeRoles('admin', 'provider', 'cleaner'), deleteService);

export default router;
