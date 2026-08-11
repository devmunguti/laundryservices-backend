import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    userName: {
      type: String,
      default: 'Unknown User',
      trim: true
    },
    role: {
      type: String,
      default: 'Unauthenticated',
      trim: true
    },
    action: {
      type: String,
      required: true,
      trim: true
    },
    details: {
      type: String,
      required: true,
      trim: true
    },
    ipAddress: {
      type: String,
      default: 'Unknown',
      trim: true
    },
    status: {
      type: String,
      enum: ['Success', 'Failed'],
      required: true
    },
    category: {
      type: String,
      enum: [
        'Authentication',
        'User Management',
        'Order',
        'Payment',
        'Provider',
        'Driver',
        'System',
        'Security',
        'Backup',
        'Other'
      ],
      default: 'Other'
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    userAgent: {
      type: String,
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false
  }
);

// Indexes optimized for date ranges, filtering, & searching
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ status: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });
auditLogSchema.index({ ipAddress: 1, createdAt: -1 });

// Text index for fast multi-field searching
auditLogSchema.index({
  userName: 'text',
  role: 'text',
  action: 'text',
  details: 'text',
  ipAddress: 'text'
});

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
