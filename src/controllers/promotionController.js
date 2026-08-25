import PromotionRequest from '../models/PromotionRequest.js';
import User from '../models/User.js';
import Service from '../models/Service.js';
import SystemSetting from '../models/SystemSetting.js';
import { getOrInitSettings } from '../services/systemSettingsService.js';
import { createAuditLog } from '../services/auditLogService.js';
import { notificationDispatcher } from '../services/notification/notificationDispatcher.js';
import { NOTIFICATION_EVENTS } from '../services/notification/notificationEvents.js';

/**
 * GET /api/promotions/settings
 * Returns the active promotion Paybill, Account number, instructions, and package tiers.
 */
export const getPromotionSettings = async (req, res, next) => {
  try {
    const settings = await getOrInitSettings();
    const promoSettings = settings.promotions || {
      channelType: 'paybill',
      paybillNumber: '522522',
      accountNumber: 'AURA-PROMO',
      tillNumber: '8995354',
      phoneNumber: '0712345678',
      recipientName: 'Laundry Admin',
      businessName: 'Laundry Platform',
      instructions: 'Pay the promotion fee using the M-Pesa details above, then submit your M-Pesa transaction code for Admin verification.',
      packages: [
        { id: '7_Days', name: '7 Days Featured Placement', days: 7, price: 1000, description: 'Top ranking and Featured Promoted badge for 1 week' },
        { id: '14_Days', name: '14 Days Growth Boost', days: 14, price: 1800, description: 'Top ranking and Featured Promoted badge for 2 weeks' },
        { id: '30_Days', name: '30 Days Premium Dominance', days: 30, price: 3500, description: 'Priority placement across platform for a full month' }
      ]
    };

    return res.status(200).json({
      success: true,
      data: promoSettings
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/promotions/request
 * Provider submits a manual M-Pesa payment claim for a promotion slot.
 */
export const requestPromotion = async (req, res, next) => {
  try {
    const { packageId, mpesaTransactionCode, tagline } = req.body;

    if (!packageId || !mpesaTransactionCode) {
      return res.status(400).json({
        success: false,
        message: 'packageId and mpesaTransactionCode are required.'
      });
    }

    const cleanCode = mpesaTransactionCode.trim().toUpperCase();
    if (cleanCode.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Invalid M-Pesa transaction code format.'
      });
    }

    const settings = await getOrInitSettings();
    const packages = settings.promotions?.packages || [
      { id: '7_Days', name: '7 Days Featured Placement', days: 7, price: 1000 },
      { id: '14_Days', name: '14 Days Growth Boost', days: 14, price: 1800 },
      { id: '30_Days', name: '30 Days Premium Dominance', days: 30, price: 3500 }
    ];

    const selectedPkg = packages.find(p => p.id === packageId) || packages[0];

    // Check if this M-Pesa code was already used for a promotion
    const existingReq = await PromotionRequest.findOne({
      mpesaTransactionCode: cleanCode,
      status: { $in: ['Approved', 'Pending'] }
    });

    if (existingReq) {
      return res.status(400).json({
        success: false,
        message: 'This M-Pesa transaction code has already been submitted for a promotion request.'
      });
    }

    const providerUser = await User.findById(req.user.id);
    if (!providerUser) {
      return res.status(404).json({ success: false, message: 'Provider account not found.' });
    }

    const providerName = providerUser.providerDetails?.businessName || providerUser.fullName || 'Service Provider';

    const newRequest = new PromotionRequest({
      provider: providerUser._id,
      providerName: providerName,
      tagline: tagline?.trim() || `Top-rated care by ${providerName}. Same-day pickup & delivery.`,
      packageId: selectedPkg.id,
      packageName: selectedPkg.name,
      durationDays: selectedPkg.days,
      amount: selectedPkg.price,
      mpesaTransactionCode: cleanCode,
      status: 'Pending'
    });

    await newRequest.save();

    // Create Audit Log
    await createAuditLog({
      req,
      user: req.user,
      action: 'Promotion Request Submitted',
      details: `Provider ${providerName} submitted promotion request for ${selectedPkg.name} (KES ${selectedPkg.price}) with M-Pesa Code ${cleanCode}`,
      status: 'Success',
      category: 'Provider'
    });

    // Dispatch Admin Notification for promotion approval request
    notificationDispatcher.dispatch(
      NOTIFICATION_EVENTS.ADMIN_PROMOTION_APPROVAL_REQUESTED,
      { promotion: newRequest, provider: providerUser }
    );

    return res.status(201).json({
      success: true,
      message: 'Promotion request submitted successfully. Admin will verify your payment and activate your featured spot.',
      data: newRequest
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/promotions/my-requests
 * Returns logged-in provider's promotion claims and current active promotion status.
 */
export const getMyPromotionRequests = async (req, res, next) => {
  try {
    const providerUser = await User.findById(req.user.id).select('providerDetails');

    const requests = await PromotionRequest.find({ provider: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    const isCurrentlyPromoted = Boolean(
      providerUser?.providerDetails?.isPromoted &&
      providerUser?.providerDetails?.promotedUntil &&
      new Date(providerUser.providerDetails.promotedUntil) > new Date()
    );

    return res.status(200).json({
      success: true,
      data: {
        isCurrentlyPromoted,
        promotedUntil: providerUser?.providerDetails?.promotedUntil || null,
        promotionTagline: providerUser?.providerDetails?.promotionTagline || '',
        promotionPackage: providerUser?.providerDetails?.promotionPackage || '',
        requests
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/promotions/featured
 * Public endpoint to fetch currently approved, active featured providers for the homepage.
 * Prioritizes '30 Days Premium Dominance' packages, supports multiple featured cleaners,
 * and falls back to the highest-rated active provider if no cleaner has paid for a promotion.
 */
export const getFeaturedProviders = async (req, res, next) => {
  try {
    const now = new Date();

    // Find all active providers whose promotion has not expired
    const activePromotedUsers = await User.find({
      role: { $in: ['provider', 'cleaner'] },
      status: 'Active',
      'providerDetails.isPromoted': true,
      'providerDetails.promotedUntil': { $gt: now }
    })
      .select('fullName email phone providerDetails')
      .lean();

    if (activePromotedUsers.length > 0) {
      // Sort with '30 Days Premium Dominance' at the top, then by rating, then expiry date
      const sortedPromoted = activePromotedUsers.sort((a, b) => {
        const pkgA = (a.providerDetails?.promotionPackage || '').toLowerCase();
        const pkgB = (b.providerDetails?.promotionPackage || '').toLowerCase();
        const is30A = pkgA.includes('30') || pkgA.includes('dominance');
        const is30B = pkgB.includes('30') || pkgB.includes('dominance');

        if (is30A && !is30B) return -1;
        if (!is30A && is30B) return 1;

        const ratingA = Number(a.providerDetails?.rating ?? 5.0);
        const ratingB = Number(b.providerDetails?.rating ?? 5.0);
        if (ratingB !== ratingA) return ratingB - ratingA;

        const expA = new Date(a.providerDetails?.promotedUntil || 0).getTime();
        const expB = new Date(b.providerDetails?.promotedUntil || 0).getTime();
        return expB - expA;
      });

      // Format all active promoted cleaners with their service and package info
      const formattedList = await Promise.all(
        sortedPromoted.map(async (u) => {
          const topService = await Service.findOne({
            provider: u._id,
            isActive: true
          }).lean();

          const pkgName = u.providerDetails?.promotionPackage || '30 Days Premium Dominance';
          const is30Days = pkgName.toLowerCase().includes('30') || pkgName.toLowerCase().includes('dominance');

          return {
            _id: u._id,
            provider: u,
            businessName: u.providerDetails?.businessName || u.fullName || 'Featured Cleaner',
            tagline: u.providerDetails?.promotionTagline || (is30Days ? '30 Days Premium Dominance Partner • Express pickup and premium fabric treatment.' : 'Exclusive Featured Laundry Partner. Same-day express care.'),
            tillNumber: u.providerDetails?.tillNumber || '8995354',
            rating: Number(u.providerDetails?.rating ?? 5.0),
            reviewsCount: Number(u.providerDetails?.reviewsCount ?? 0),
            packageName: pkgName,
            is30DaysPremium: is30Days,
            promotedUntil: u.providerDetails?.promotedUntil,
            featuredService: topService || null
          };
        })
      );

      return res.status(200).json({
        success: true,
        isSponsored: true,
        data: {
          featuredProvider: formattedList[0],
          featuredProviders: formattedList,
          count: formattedList.length
        }
      });
    }

    // Fallback: If NO cleaner has paid for a promotion package, display the cleaner with the highest rating
    const fallbackProvider = await User.findOne({
      role: { $in: ['provider', 'cleaner'] },
      status: 'Active'
    })
      .select('fullName email phone providerDetails')
      .sort({ 'providerDetails.rating': -1, 'providerDetails.reviewsCount': -1 })
      .lean();

    if (fallbackProvider) {
      const topService = await Service.findOne({
        provider: fallbackProvider._id,
        isActive: true
      }).lean();

      const formattedFallback = {
        _id: fallbackProvider._id,
        provider: fallbackProvider,
        businessName: fallbackProvider.providerDetails?.businessName || fallbackProvider.fullName || 'Top Rated Partner Cleaner',
        tagline: fallbackProvider.providerDetails?.promotionTagline || 'Highest rated laundry provider with 5-star verified service excellence.',
        tillNumber: fallbackProvider.providerDetails?.tillNumber || '8995354',
        rating: Number(fallbackProvider.providerDetails?.rating ?? 5.0),
        reviewsCount: Number(fallbackProvider.providerDetails?.reviewsCount ?? 0),
        packageName: 'Highest Rated Cleaner (5★)',
        is30DaysPremium: false,
        featuredService: topService || null
      };

      return res.status(200).json({
        success: true,
        isSponsored: false,
        data: {
          featuredProvider: formattedFallback,
          featuredProviders: [formattedFallback],
          count: 1
        }
      });
    }

    return res.status(200).json({
      success: true,
      isSponsored: false,
      data: null
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/promotions
 * Admin endpoint to list all provider promotion requests with pagination and filters.
 */
export const getAdminPromotions = async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const query = {};

    if (status && status !== 'All') {
      query.status = status;
    }

    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { providerName: searchRegex },
        { mpesaTransactionCode: searchRegex }
      ];
    }

    const requests = await PromotionRequest.find(query)
      .populate('provider', 'fullName email phone providerDetails')
      .populate('reviewedBy', 'fullName')
      .sort({ createdAt: -1 })
      .lean();

    const pendingCount = await PromotionRequest.countDocuments({ status: 'Pending' });
    const approvedCount = await PromotionRequest.countDocuments({ status: 'Approved' });
    const totalRevenueAgg = await PromotionRequest.aggregate([
      { $match: { status: 'Approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalRevenue = totalRevenueAgg[0]?.total || 0;

    return res.status(200).json({
      success: true,
      data: {
        requests,
        metrics: {
          pendingCount,
          approvedCount,
          totalRevenue
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/promotions/:id/approve
 * Admin approves a promotion payment request and activates provider promotion spot.
 */
export const approvePromotion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    const request = await PromotionRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Promotion request not found.' });
    }

    if (request.status === 'Approved') {
      return res.status(400).json({ success: false, message: 'This request is already approved.' });
    }

    const now = new Date();
    const durationDays = request.durationDays || 7;
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    request.status = 'Approved';
    request.reviewedBy = req.user.id;
    request.reviewedAt = now;
    request.startsAt = now;
    request.expiresAt = expiresAt;
    if (adminNotes) request.adminNotes = adminNotes;
    await request.save();

    // Activate provider promotion in User collection
    await User.findByIdAndUpdate(request.provider, {
      $set: {
        'providerDetails.isPromoted': true,
        'providerDetails.promotedUntil': expiresAt,
        'providerDetails.promotionTagline': request.tagline,
        'providerDetails.promotionPackage': request.packageName
      }
    });

    // Create Audit Log
    await createAuditLog({
      req,
      user: req.user,
      action: 'Promotion Approved',
      details: `Admin approved promotion for ${request.providerName} (${request.packageName}) with M-Pesa Code ${request.mpesaTransactionCode} until ${expiresAt.toLocaleDateString()}`,
      status: 'Success',
      category: 'Admin'
    });

    // Dispatch Provider Notification: Payment Receipt & Activation
    const updatedProviderUser = await User.findById(request.provider);
    if (updatedProviderUser) {
      notificationDispatcher.dispatch(
        NOTIFICATION_EVENTS.PROVIDER_PROMOTION_PAYMENT_RECEIPT,
        { promotion: request, provider: updatedProviderUser }
      );
    }

    return res.status(200).json({
      success: true,
      message: `Promotion approved successfully! ${request.providerName} is now featured until ${expiresAt.toLocaleDateString()}.`,
      data: request
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/promotions/:id/reject
 * Admin rejects a promotion request (e.g. invalid code or unpaid).
 */
export const rejectPromotion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, adminNotes } = req.body;

    const request = await PromotionRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Promotion request not found.' });
    }

    request.status = 'Rejected';
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    request.rejectionReason = reason || 'Payment could not be verified.';
    if (adminNotes) request.adminNotes = adminNotes;
    await request.save();

    // Create Audit Log
    await createAuditLog({
      req,
      user: req.user,
      action: 'Promotion Rejected',
      details: `Admin rejected promotion request for ${request.providerName} (M-Pesa Code: ${request.mpesaTransactionCode}). Reason: ${request.rejectionReason}`,
      status: 'Success',
      category: 'Admin'
    });

    return res.status(200).json({
      success: true,
      message: 'Promotion request marked as rejected.',
      data: request
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/settings/promotions
 * Admin updates promotion receiving Paybill, Account number, and package rates.
 */
export const updatePromotionSettings = async (req, res, next) => {
  try {
    const {
      channelType,
      paybillNumber,
      accountNumber,
      tillNumber,
      phoneNumber,
      recipientName,
      businessName,
      instructions,
      packages
    } = req.body;

    let settings = await SystemSetting.findOne();
    if (!settings) {
      settings = new SystemSetting();
    }

    if (!settings.promotions) {
      settings.promotions = {};
    }

    if (channelType !== undefined) settings.promotions.channelType = channelType;
    if (paybillNumber !== undefined) settings.promotions.paybillNumber = paybillNumber.trim();
    if (accountNumber !== undefined) settings.promotions.accountNumber = accountNumber.trim();
    if (tillNumber !== undefined) settings.promotions.tillNumber = tillNumber.trim();
    if (phoneNumber !== undefined) settings.promotions.phoneNumber = phoneNumber.trim();
    if (recipientName !== undefined) settings.promotions.recipientName = recipientName.trim();
    if (businessName !== undefined) settings.promotions.businessName = businessName.trim();
    if (instructions !== undefined) settings.promotions.instructions = instructions.trim();
    if (Array.isArray(packages)) settings.promotions.packages = packages;

    settings.updatedBy = req.user.id;
    await settings.save();

    // Create Audit Log
    const channelLabel = settings.promotions.channelType === 'till'
      ? `Buy Goods Till ${settings.promotions.tillNumber}`
      : settings.promotions.channelType === 'phone'
        ? `Phone ${settings.promotions.phoneNumber}`
        : `Paybill ${settings.promotions.paybillNumber}`;

    await createAuditLog({
      req,
      user: req.user,
      action: 'Promotion Settings Updated',
      details: `Admin updated promotion payment channel to ${channelLabel}`,
      status: 'Success',
      category: 'Settings'
    });

    return res.status(200).json({
      success: true,
      message: 'Promotion payment settings updated successfully.',
      data: settings.promotions
    });
  } catch (error) {
    next(error);
  }
};
