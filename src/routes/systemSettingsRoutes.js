import { Router } from 'express';
import {
  getSystemSettings,
  updateSystemSettings,
  revealSecretKey,
  getPublicSettings,
  getAdminOverviewMetrics,
  getCampusLocations,
  addCampusLocation,
  updateCampusLocation,
  deleteCampusLocation
} from '../controllers/systemSettingsController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';

const router = Router();

// Public configuration endpoint (No auth required)
router.get('/public', getPublicSettings);
router.get('/campus-locations', getCampusLocations);

// Protect all admin system settings endpoints with authentication & admin authorization
router.get('/overview-metrics', authenticate, authorizeRoles('admin'), getAdminOverviewMetrics);
router.get('/', authenticate, authorizeRoles('admin'), getSystemSettings);
router.put('/', authenticate, authorizeRoles('admin'), updateSystemSettings);
router.post('/reveal-key', authenticate, authorizeRoles('admin'), revealSecretKey);

// Campus Locations Admin CRUD
router.post('/campus-locations', authenticate, authorizeRoles('admin'), addCampusLocation);
router.put('/campus-locations/:locationId', authenticate, authorizeRoles('admin'), updateCampusLocation);
router.delete('/campus-locations/:locationId', authenticate, authorizeRoles('admin'), deleteCampusLocation);

export default router;

