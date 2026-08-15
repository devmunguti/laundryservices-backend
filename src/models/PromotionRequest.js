import mongoose from 'mongoose';

const promotionRequestSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    providerName: {
      type: String,
      required: true,
      trim: true
    },
    tagline: {
      type: String,
      default: 'Top rated laundry service with fast pickup and delivery.',
      trim: true
    },
    packageId: {
      type: String,
      enum: ['7_Days', '14_Days', '30_Days'],
      default: '7_Days'
    },
    packageName: {
      type: String,
      default: '7 Days Featured Placement'
    },
    durationDays: {
      type: Number,
      default: 7,
      min: 1
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    mpesaTransactionCode: {
      type: String,
      required: [true, 'M-Pesa transaction code is required'],
      trim: true,
      uppercase: true,
      index: true
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Expired'],
      default: 'Pending',
      index: true
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    rejectionReason: {
      type: String,
      default: ''
    },
    adminNotes: {
      type: String,
      default: ''
    },
    startsAt: {
      type: Date,
      default: null
    },
    expiresAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

const PromotionRequest = mongoose.models.PromotionRequest || mongoose.model('PromotionRequest', promotionRequestSchema);
export default PromotionRequest;
