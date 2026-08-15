import mongoose from 'mongoose';

const systemSettingSchema = new mongoose.Schema(
  {
    general: {
      platformName: { type: String, default: 'Aura Laundry', trim: true },
      supportEmail: { type: String, default: 'support@auralaundry.co.ke', trim: true },
      adminAlertEmail: { type: String, default: 'admin@auralaundry.co.ke', trim: true },
      supportPhone: { type: String, default: '+254 700 000 000', trim: true },
      logoUrl: { type: String, default: '' }
    },
    financial: {
      commissionRate: { type: Number, default: 15.0, min: 0, max: 100 },
      minimumPayoutThreshold: { type: Number, default: 5000, min: 0 }
    },
    notifications: {
      newCleanerRegistrations: { type: Boolean, default: true },
      highValueOrders: { type: Boolean, default: true },
      systemErrorReports: { type: Boolean, default: false },
      providerRegistration: { type: Boolean, default: true },
      providerCommission: { type: Boolean, default: true },
      securityAlerts: { type: Boolean, default: true },
      promotionRequests: { type: Boolean, default: true },
      providerOrderDigest: { type: Boolean, default: true },
      providerReviews: { type: Boolean, default: true },
      promotionReceipts: { type: Boolean, default: true },
      promotionExpiryReminders: { type: Boolean, default: true }
    },
    api: {
      mpesaKey: { type: String, default: 'ck_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a' },
      mapsKey: { type: String, default: 'AIzaSyA_bCDeFgHiJkLmNoPqRsTuVwXyZ' }
    },
    operations: {
      maintenanceMode: { type: Boolean, default: false },
      smsSid: { type: String, default: '' },
      smsSenderId: { type: String, default: '' },
      superAdminEmailAlerts: { type: Boolean, default: true }
    },
    promotions: {
      channelType: { type: String, enum: ['paybill', 'till', 'phone'], default: 'paybill' },
      paybillNumber: { type: String, default: '522522', trim: true },
      accountNumber: { type: String, default: 'AURA-PROMO', trim: true },
      tillNumber: { type: String, default: '8995354', trim: true },
      phoneNumber: { type: String, default: '0712345678', trim: true },
      recipientName: { type: String, default: 'Aura Laundry Admin', trim: true },
      businessName: { type: String, default: 'Aura Laundry Platform', trim: true },
      instructions: { type: String, default: 'Pay the promotion fee using the M-Pesa details above, then submit your M-Pesa transaction code for Admin verification.' },
      packages: {
        type: [
          {
            id: { type: String },
            name: { type: String },
            days: { type: Number },
            price: { type: Number },
            description: { type: String }
          }
        ],
        default: [
          { id: '7_Days', name: '7 Days Featured Placement', days: 7, price: 1000, description: 'Top ranking and Featured Promoted badge for 1 week' },
          { id: '14_Days', name: '14 Days Growth Boost', days: 14, price: 1800, description: 'Top ranking and Featured Promoted badge for 2 weeks' },
          { id: '30_Days', name: '30 Days Premium Dominance', days: 30, price: 3500, description: 'Priority placement across platform for a full month' }
        ]
      }
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

const SystemSetting = mongoose.models.SystemSetting || mongoose.model('SystemSetting', systemSettingSchema);
export default SystemSetting;
