import mongoose from 'mongoose';

const otpTokenSchema = new mongoose.Schema(
  {
    identifier: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    otpHash: {
      type: String,
      required: true
    },
    purpose: {
      type: String,
      enum: ['login', 'registration', 'verification', 'password_reset'],
      default: 'login',
      index: true
    },
    attempts: {
      type: Number,
      default: 0
    },
    maxAttempts: {
      type: Number,
      default: 5
    },
    lastSentAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 } // Automatic MongoDB TTL cleanup
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

otpTokenSchema.index({ identifier: 1, purpose: 1 });

const OtpToken = mongoose.models.OtpToken || mongoose.model('OtpToken', otpTokenSchema);

export default OtpToken;
