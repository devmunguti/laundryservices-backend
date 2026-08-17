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
    campusLocations: {
      type: [
        {
          name: { type: String, required: true, trim: true },
          zone: { type: String, default: 'Main Campus', trim: true },
          description: { type: String, default: '', trim: true },
          instructions: { type: String, default: '', trim: true },
          isActive: { type: Boolean, default: true },
          coordinates: {
            lat: { type: Number, default: -1.2921 },
            lng: { type: Number, default: 36.8219 }
          }
        }
      ],
      default: [
        {
          name: 'Main Campus Gate A (Main Gate)',
          zone: 'Main Campus',
          description: 'Security Desk / Concierge Station',
          instructions: 'Drop off or collect at the laundry pickup desk near Gate A security office.',
          isActive: true,
          coordinates: { lat: -1.2795, lng: 36.8165 }
        },
        {
          name: 'Hostel Block B (Ladies Residence)',
          zone: 'Hostel Zone',
          description: 'Hostel Block B Main Entrance Foyer',
          instructions: 'Leave laundry bag with room caretaker or at Block B ground floor desk.',
          isActive: true,
          coordinates: { lat: -1.2801, lng: 36.8172 }
        },
        {
          name: 'Hostel Block D (Men Residence)',
          zone: 'Hostel Zone',
          description: 'Block D Reception & Porter Desk',
          instructions: 'Direct handover at Block D reception area.',
          isActive: true,
          coordinates: { lat: -1.2808, lng: 36.8178 }
        },
        {
          name: 'Student Center Hub',
          zone: 'Student Center',
          description: 'Student Center Cafeteria Entrance',
          instructions: 'Meet cleaner/rider outside the Student Union Hub near the main benches.',
          isActive: true,
          coordinates: { lat: -1.2789, lng: 36.8159 }
        },
        {
          name: 'Engineering & Technology Complex',
          zone: 'Academic Blocks',
          description: 'Engineering Block Plaza Roundabout',
          instructions: 'Pickup at the parking lot pickup bay outside Engineering Wing A.',
          isActive: true,
          coordinates: { lat: -1.2815, lng: 36.8148 }
        }
      ]
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
