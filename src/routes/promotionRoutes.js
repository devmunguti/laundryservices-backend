import express from 'express';
import {
  getPromotionSettings,
  requestPromotion,
  getMyPromotionRequests,
  getFeaturedProviders,
  getAdminPromotions,
  approvePromotion,
  rejectPromotion,
  updatePromotionSettings
} from '../controllers/promotionController.js';
import { authenticate, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public Endpoints
router.get('/settings', getPromotionSettings);
router.get('/featured', getFeaturedProviders);

// Provider Authenticated Endpoints
router.post('/request', authenticate, authorizeRoles('provider', 'cleaner', 'admin'), requestPromotion);
router.get('/my-requests', authenticate, authorizeRoles('provider', 'cleaner', 'admin'), getMyPromotionRequests);

// Admin Management Endpoints
router.get('/admin', authenticate, authorizeRoles('admin'), getAdminPromotions);
router.patch('/admin/:id/approve', authenticate, authorizeRoles('admin'), approvePromotion);
router.patch('/admin/:id/reject', authenticate, authorizeRoles('admin'), rejectPromotion);
router.put('/admin/settings', authenticate, authorizeRoles('admin'), updatePromotionSettings);

export default router;
