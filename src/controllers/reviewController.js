import Review from '../models/Review.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Service from '../models/Service.js';
import { createAuditLog } from '../services/auditLogService.js';
import { notificationDispatcher } from '../services/notification/notificationDispatcher.js';
import { NOTIFICATION_EVENTS } from '../services/notification/notificationEvents.js';

/**
 * Recalculates and updates the provider's overall rating and review count.
 */
const recalculateProviderRating = async (providerId) => {
  try {
    const reviews = await Review.find({ provider: providerId, isPublished: true });
    const totalCount = reviews.length;
    if (totalCount === 0) {
      await User.findByIdAndUpdate(providerId, {
        'providerDetails.rating': 5.0,
        'providerDetails.reviewsCount': 0
      });
      return { rating: 5.0, reviewsCount: 0 };
    }

    const sumRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = Math.round((sumRating / totalCount) * 10) / 10;

    await User.findByIdAndUpdate(providerId, {
      'providerDetails.rating': avgRating,
      'providerDetails.reviewsCount': totalCount
    });

    return { rating: avgRating, reviewsCount: totalCount };
  } catch (error) {
    console.error('Error updating provider rating aggregate:', error);
  }
};

/**
 * POST /api/reviews
 * Submit a customer rating and review for a completed order.
 */
export const submitReview = async (req, res, next) => {
  try {
    const { orderRef, rating, comment, tags, customerName, customerPhone } = req.body;

    if (!orderRef || !rating) {
      return res.status(400).json({ success: false, message: 'Order reference and rating (1-5) are required.' });
    }

    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be a number between 1 and 5.' });
    }

    const formattedOrderRef = orderRef.trim().toUpperCase();
    const order = await Order.findOne({ orderRef: formattedOrderRef });

    if (!order) {
      return res.status(404).json({ success: false, message: `Order #${formattedOrderRef} not found.` });
    }

    if (!order.provider) {
      return res.status(400).json({ success: false, message: 'This order does not have an assigned service provider.' });
    }

    // Check if order already has a review
    const existingReview = await Review.findOne({ order: order._id });
    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: 'A review has already been submitted for this order.',
        data: existingReview
      });
    }

    const review = await Review.create({
      order: order._id,
      orderRef: order.orderRef,
      provider: order.provider,
      customer: req.user?._id || order.customer || null,
      customerName: customerName || req.user?.fullName || order.customerName || 'Verified Customer',
      customerPhone: customerPhone || order.customerPhone || '',
      rating: numRating,
      comment: comment?.trim() || '',
      tags: Array.isArray(tags) ? tags : []
    });

    // Update aggregate rating for provider
    const stats = await recalculateProviderRating(order.provider);

    // Audit log
    await createAuditLog({
      req,
      user: req.user || null,
      action: 'Review Submitted',
      details: `Customer submitted a ${numRating}-star review for order #${order.orderRef}.`,
      status: 'Success',
      category: 'Provider'
    });

    // Dispatch Provider Notification for customer review update
    const providerUser = await User.findById(order.provider);
    if (providerUser) {
      notificationDispatcher.dispatch(
        NOTIFICATION_EVENTS.PROVIDER_RATING_UPDATED,
        {
          review,
          provider: providerUser
        }
      );
    }

    res.status(201).json({
      success: true,
      message: 'Thank you! Your feedback has been submitted successfully.',
      data: review,
      providerStats: stats
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A review has already been submitted for this order.' });
    }
    next(error);
  }
};

/**
 * GET /api/reviews/provider
 * Cleaner portal endpoint to fetch authenticated cleaner's reviews & statistics.
 */
export const getProviderReviews = async (req, res, next) => {
  try {
    const providerId = req.user.id;
    const { search, rating } = req.query;

    const query = { provider: providerId, isPublished: true };

    if (rating && rating !== 'all') {
      const parsedRating = parseInt(rating, 10);
      if (!isNaN(parsedRating)) {
        query.rating = parsedRating;
      }
    }

    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { comment: { $regex: search, $options: 'i' } },
        { orderRef: { $regex: search, $options: 'i' } }
      ];
    }

    const reviews = await Review.find(query)
      .sort({ createdAt: -1 })
      .populate('order', 'orderRef service pricing status paymentStatus createdAt');

    // Aggregate overall metrics
    const allProviderReviews = await Review.find({ provider: providerId, isPublished: true });
    const totalCount = allProviderReviews.length;
    const sumRating = allProviderReviews.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = totalCount > 0 ? Math.round((sumRating / totalCount) * 10) / 10 : 5.0;

    const distribution = {
      5: allProviderReviews.filter(r => r.rating === 5).length,
      4: allProviderReviews.filter(r => r.rating === 4).length,
      3: allProviderReviews.filter(r => r.rating === 3).length,
      2: allProviderReviews.filter(r => r.rating === 2).length,
      1: allProviderReviews.filter(r => r.rating === 1).length
    };

    res.status(200).json({
      success: true,
      data: reviews,
      metrics: {
        totalReviews: totalCount,
        averageRating: avgRating,
        distribution,
        percentages: {
          5: totalCount > 0 ? Math.round((distribution[5] / totalCount) * 100) : 0,
          4: totalCount > 0 ? Math.round((distribution[4] / totalCount) * 100) : 0,
          3: totalCount > 0 ? Math.round((distribution[3] / totalCount) * 100) : 0,
          2: totalCount > 0 ? Math.round((distribution[2] / totalCount) * 100) : 0,
          1: totalCount > 0 ? Math.round((distribution[1] / totalCount) * 100) : 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/reviews/:id/reply
 * Cleaner posts a response to a customer review.
 */
export const replyToReview = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const providerId = req.user.id;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Reply text cannot be empty.' });
    }

    const review = await Review.findOne({ _id: id, provider: providerId });
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found or does not belong to your account.' });
    }

    review.reply = {
      text: text.trim(),
      repliedAt: new Date()
    };

    await review.save();

    res.status(200).json({
      success: true,
      message: 'Response posted successfully.',
      data: review
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reviews/order/:orderRef
 * Check if a review already exists for this order.
 */
export const getReviewByOrderRef = async (req, res, next) => {
  try {
    const { orderRef } = req.params;
    const formattedOrderRef = orderRef.trim().toUpperCase();

    const review = await Review.findOne({ orderRef: formattedOrderRef });

    res.status(200).json({
      success: true,
      hasReviewed: !!review,
      data: review || null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reviews/public/:providerId
 * Public endpoint to fetch customer reviews for a cleaner profile.
 */
export const getPublicProviderReviews = async (req, res, next) => {
  try {
    const { providerId } = req.params;
    const reviews = await Review.find({ provider: providerId, isPublished: true })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('customerName rating comment tags reply createdAt');

    res.status(200).json({
      success: true,
      data: reviews
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reviews/directory
 * Public customer-facing directory of cleaners, their ranking, real reviews, price metrics, and services offered.
 */
export const getProviderRankingsAndDirectory = async (req, res, next) => {
  try {
    const { category, minRating, priceMax, priceMin, search, sort = 'rating_desc' } = req.query;

    const query = {
      role: { $in: ['provider', 'cleaner'] },
      status: 'Active',
      isActive: true,
      'providerDetails.isApproved': true
    };

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { fullName: searchRegex },
        { 'providerDetails.businessName': searchRegex },
        { 'addresses.street': searchRegex },
        { 'addresses.city': searchRegex }
      ];
    }

    const providers = await User.find(query)
      .select('fullName email phone avatar addresses providerDetails createdAt')
      .lean();

    const providerIds = providers.map(p => p._id);

    const services = await Service.find({
      provider: { $in: providerIds },
      isActive: true
    }).lean();

    const reviews = await Review.find({
      provider: { $in: providerIds },
      isPublished: true
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const servicesByProvider = {};
    services.forEach(s => {
      const pid = s.provider.toString();
      if (!servicesByProvider[pid]) servicesByProvider[pid] = [];
      servicesByProvider[pid].push(s);
    });

    const reviewsByProvider = {};
    reviews.forEach(r => {
      const pid = r.provider.toString();
      if (!reviewsByProvider[pid]) reviewsByProvider[pid] = [];
      reviewsByProvider[pid].push(r);
    });

    let directory = providers.map((p) => {
      const pid = p._id.toString();
      const pServices = servicesByProvider[pid] || [];
      const pReviews = reviewsByProvider[pid] || [];

      const prices = pServices.map(s => typeof s.basePrice === 'number' ? s.basePrice : 0);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

      return {
        id: p._id,
        name: p.providerDetails?.businessName || p.fullName || 'Professional Cleaner',
        ownerName: p.fullName,
        email: p.email,
        phone: p.phone,
        location: p.addresses?.[0]?.street || p.addresses?.[0]?.city || 'Nairobi, Kenya',
        rating: Number(p.providerDetails?.rating || 5.0),
        reviewsCount: p.providerDetails?.reviewsCount || pReviews.length,
        minPrice,
        maxPrice,
        startingPriceFormatted: minPrice > 0 ? `From KES ${minPrice.toLocaleString()}` : 'Pricing on request',
        isPromoted: Boolean(p.providerDetails?.isPromoted && p.providerDetails?.promotedUntil && new Date(p.providerDetails.promotedUntil) > new Date()),
        promotionTagline: p.providerDetails?.promotionTagline || '',
        tillNumber: p.providerDetails?.tillNumber || '8995354',
        services: pServices,
        reviews: pReviews.slice(0, 6),
        totalServicesCount: pServices.length
      };
    });

    // 1. Filter by Category
    if (category && category !== 'All') {
      directory = directory.filter(d =>
        d.services.some(s => s.category?.toLowerCase() === category.toLowerCase())
      );
    }

    // 2. Filter by Minimum Rating
    if (minRating && minRating !== 'All') {
      const minRatingNum = Number(minRating);
      if (!isNaN(minRatingNum)) {
        directory = directory.filter(d => d.rating >= minRatingNum);
      }
    }

    // 3. Filter by Price Ceiling (e.g. Cheap / Budget filter)
    if (priceMax) {
      const maxP = Number(priceMax);
      if (!isNaN(maxP) && maxP > 0) {
        directory = directory.filter(d => d.minPrice > 0 && d.minPrice <= maxP);
      }
    }

    // 4. Filter by Price Floor
    if (priceMin) {
      const minP = Number(priceMin);
      if (!isNaN(minP) && minP > 0) {
        directory = directory.filter(d => d.minPrice >= minP);
      }
    }

    // 5. Dynamic Sorting (5-Star first down to lowest rating, Cheapest first, Most Reviewed, etc.)
    switch (sort) {
      case 'price_asc':
      case 'cheap':
      case 'cheapest':
        // Sort lowest starting price to highest
        directory.sort((a, b) => {
          if (a.minPrice === 0 && b.minPrice > 0) return 1;
          if (b.minPrice === 0 && a.minPrice > 0) return -1;
          if (a.minPrice !== b.minPrice) return a.minPrice - b.minPrice;
          return b.rating - a.rating;
        });
        break;

      case 'price_desc':
      case 'expensive':
        directory.sort((a, b) => {
          if (b.minPrice !== a.minPrice) return b.minPrice - a.minPrice;
          return b.rating - a.rating;
        });
        break;

      case 'reviews_desc':
      case 'most_reviewed':
        directory.sort((a, b) => {
          if (b.reviewsCount !== a.reviewsCount) return b.reviewsCount - a.reviewsCount;
          return b.rating - a.rating;
        });
        break;

      case 'rating_asc':
        directory.sort((a, b) => a.rating - b.rating);
        break;

      case 'rating_desc':
      case 'highest_rated':
      default:
        // Arranged strictly from 5-star to lowest rating, prioritized by reviews count
        directory.sort((a, b) => {
          if (b.rating !== a.rating) return b.rating - a.rating;
          if (b.reviewsCount !== a.reviewsCount) return b.reviewsCount - a.reviewsCount;
          return (b.isPromoted ? 1 : 0) - (a.isPromoted ? 1 : 0);
        });
        break;
    }

    // Attach dynamic 1-indexed rank based on sorted order
    const rankedDirectory = directory.map((d, index) => ({
      ...d,
      rank: index + 1
    }));

    res.status(200).json({
      success: true,
      count: rankedDirectory.length,
      data: rankedDirectory
    });
  } catch (error) {
    next(error);
  }
};

