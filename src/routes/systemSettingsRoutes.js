import { Router } from 'express';
import {
  getSystemSettings,
  updateSystemSettings,
  revealSecretKey
} from '../controllers/systemSettingsController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';

const router = Router();

// Protect all system settings endpoints with authentication & admin authorization
router.use(authenticate, authorizeRoles('admin'));

router.get('/', getSystemSettings);
router.put('/', updateSystemSettings);
router.post('/reveal-key', revealSecretKey);

export default router;
