import mongoose from 'mongoose';

const emailNotificationLogSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      required: true,
      index: true
    },
    recipient: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    recipientUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    subject: {
      type: String,
      required: true,
      trim: true
    },
    templateId: {
      type: String,
      required: true,
      index: true
    },
    relatedOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      index: true
    },
    relatedPayment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
      index: true
    },
    relatedPromotion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PromotionRequest',
      default: null,
      index: true
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed', 'suppressed'],
      default: 'queued',
      index: true
    },
    messageId: {
      type: String,
      default: null
    },
    attemptCount: {
      type: Number,
      default: 1
    },
    lastError: {
      type: String,
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    sentAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Indexes
emailNotificationLogSchema.index({ recipient: 1, createdAt: -1 });
emailNotificationLogSchema.index({ status: 1, createdAt: -1 });
emailNotificationLogSchema.index({ event: 1, createdAt: -1 });

const EmailNotificationLog =
  mongoose.models.EmailNotificationLog ||
  mongoose.model('EmailNotificationLog', emailNotificationLogSchema);

export default EmailNotificationLog;
