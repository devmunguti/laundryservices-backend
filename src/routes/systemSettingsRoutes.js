import { Router } from 'express';
import {
  getSystemSettings,
  updateSystemSettings,
  revealSecretKey,
  getPublicSettings
} from '../controllers/systemSettingsController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';

const router = Router();

// Public configuration endpoint (No auth required)
router.get('/public', getPublicSettings);

// Protect all admin system settings endpoints with authentication & admin authorization
router.get('/', authenticate, authorizeRoles('admin'), getSystemSettings);
router.put('/', authenticate, authorizeRoles('admin'), updateSystemSettings);
router.post('/reveal-key', authenticate, authorizeRoles('admin'), revealSecretKey);

export default router;

