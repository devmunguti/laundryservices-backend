import mongoose from 'mongoose';

const systemSettingSchema = new mongoose.Schema(
  {
    general: {
      platformName: { type: String, default: 'Aura Laundry', trim: true },
      supportEmail: { type: String, default: 'support@auralaundry.co.ke', trim: true },
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
      systemErrorReports: { type: Boolean, default: false }
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
