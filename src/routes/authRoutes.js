import { Router } from 'express';
import {
  register,
  login,
  logout,
  getCurrentUser,
  getProfile,
  getProviders,
  getProviderStats,
  getProviderById,
  createProvider,
  updateProvider,
  updateProviderStatus,
  deleteProvider,
  changeInitialPassword,
  resetProviderPassword,
  deactivateMyAccount,
  getPublicProviderProfile
} from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { authorizeRoles } from '../middleware/roleMiddleware.js';
import { loginLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Public Cleaner Profile Endpoint
router.get('/public/providers/:id', getPublicProviderProfile);

// Core Authentication Endpoints
router.post('/register', register);
router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', authenticate, getCurrentUser);
router.get('/profile', authenticate, getProfile);
router.post('/change-initial-password', authenticate, changeInitialPassword);
router.post('/deactivate-account', authenticate, deactivateMyAccount);

// Provider Management Endpoints
router.get('/providers', authenticate, authorizeRoles('admin'), getProviders);
router.get('/providers/stats', authenticate, authorizeRoles('admin'), getProviderStats);
router.get('/providers/:id', authenticate, authorizeRoles('admin'), getProviderById);
router.post('/providers', authenticate, authorizeRoles('admin'), createProvider);
router.patch('/providers/:id', authenticate, authorizeRoles('admin'), updateProvider);
router.patch('/providers/:id/status', authenticate, authorizeRoles('admin'), updateProviderStatus);
router.patch('/providers/:id/reset-password', authenticate, authorizeRoles('admin'), resetProviderPassword);
router.delete('/providers/:id', authenticate, authorizeRoles('admin'), deleteProvider);

export default router;
