import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order reference is required'],
      index: true
    },
    orderId: {
      type: String,
      trim: true,
      index: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    customerName: {
      type: String,
      default: '',
      trim: true
    },
    providerName: {
      type: String,
      default: '',
      trim: true
    },
    method: {
      type: String,
      enum: ['card', 'mpesa', 'cod'],
      default: 'mpesa'
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'Pending', 'Processing', 'Paid', 'Failed', 'Refunded'],
      default: 'pending',
      index: true
    },
    payoutStatus: {
      type: String,
      enum: ['Pending', 'Processing', 'Completed', 'Failed'],
      default: 'Pending',
      index: true
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: 0
    },
    commissionRate: {
      type: Number,
      default: 15,
      min: 0
    },
    commissionAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    providerPayoutAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    currency: {
      type: String,
      default: 'KES'
    },
    transactionId: {
      type: String,
      sparse: true
    },
    payheroReference: {
      type: String,
      sparse: true,
      index: true
    },
    phoneNumber: {
      type: String,
      default: '',
      trim: true
    },
    failureReason: {
      type: String,
      default: null
    },
    initiatedAt: {
      type: Date,
      default: Date.now
    },
    payoutReference: {
      type: String,
      default: null
    },
    payoutProcessedAt: {
      type: Date,
      default: null
    },
    payoutProcessedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    gatewayMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    paidAt: {
      type: Date,
      default: null
    },
    failedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

import { getOrInitSettings } from '../services/systemSettingsService.js';

// Calculate commission and provider payout automatically before saving
paymentSchema.pre('save', async function () {
  // Always query SystemSetting on NEW payment creation to snapshot the current rate set by admin
  if (this.isNew || typeof this.commissionRate !== 'number') {
    try {
      const setting = await getOrInitSettings();
      if (setting && setting.financial && typeof setting.financial.commissionRate === 'number') {
        this.commissionRate = setting.financial.commissionRate;
      }
    } catch (e) {
      // Fallback if SystemSetting fails
    }
  }

  const rate = typeof this.commissionRate === 'number' ? this.commissionRate : Number(process.env.PLATFORM_COMMISSION_RATE || 15);
  this.commissionRate = rate;
  this.commissionAmount = Math.round((this.amount * (rate / 100)) * 100) / 100;
  this.providerPayoutAmount = Math.round((this.amount - this.commissionAmount) * 100) / 100;
});


// Indexes for fast lookup & reporting
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ payoutStatus: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
export default Payment;
