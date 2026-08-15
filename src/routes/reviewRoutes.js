import express from 'express';
import {
  submitReview,
  getProviderReviews,
  replyToReview,
  getReviewByOrderRef,
  getPublicProviderReviews,
  getProviderRankingsAndDirectory
} from '../controllers/reviewController.js';
import { authenticate, optionalAuthenticate, authorizeRoles } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public Customer-Facing Directory & Cleaner Rankings
router.get('/directory', getProviderRankingsAndDirectory);

// Public / Customer review submission
router.post('/', optionalAuthenticate, submitReview);

// Check if order has been reviewed
router.get('/order/:orderRef', getReviewByOrderRef);

// Public provider reviews
router.get('/public/:providerId', getPublicProviderReviews);

// Cleaner portal routes (Authenticated Provider/Cleaner only)
router.get('/provider', authenticate, authorizeRoles('provider', 'cleaner'), getProviderReviews);
router.post('/:id/reply', authenticate, authorizeRoles('provider', 'cleaner'), replyToReview);

export default router;
