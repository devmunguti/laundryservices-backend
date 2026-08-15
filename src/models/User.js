import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, required: true },
    city: { type: String, required: true, default: 'Nairobi' },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [36.8219, -1.2921] // Default coordinates (Nairobi center)
      }
    },
    instructions: { type: String, default: '' },
    isDefault: { type: Boolean, default: false }
  },
  { _id: true }
);

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      trim: true
    },
    lastName: {
      type: String,
      trim: true
    },
    fullName: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      select: false // Exclude from query results by default
    },
    role: {
      type: String,
      enum: ['user', 'customer', 'driver', 'provider', 'admin'],
      default: 'user',
      index: true
    },
    status: {
      type: String,
      enum: ['Pending', 'Active', 'Suspended', 'Rejected'],
      default: 'Active',
      index: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    mustChangePassword: {
      type: Boolean,
      default: false
    },
    passwordChangedAt: {
      type: Date,
      default: null
    },
    lastLogin: {
      type: Date
    },
    addresses: [addressSchema],
    providerDetails: {
      businessName: { type: String, default: '' },
      commissionRate: { type: Number, default: 15 },
      isApproved: { type: Boolean, default: false },
      rating: { type: Number, default: 5.0, min: 0, max: 5 },
      reviewsCount: { type: Number, default: 0 },
      tillNumber: { type: String, default: '8995354', trim: true },
      isPromoted: { type: Boolean, default: false },
      promotedUntil: { type: Date, default: null },
      promotionTagline: { type: String, default: '' },
      promotionPackage: { type: String, default: '' },
      paymentChannels: [
        {
          type: { type: String, enum: ['mpesa', 'bank', 'cash'], default: 'mpesa' },
          title: { type: String, default: 'M-Pesa' },
          subtitle: { type: String, default: 'Paybill / Till' },
          accountName: { type: String, default: '' },
          businessNo: { type: String, default: '' },
          accountNo: { type: String, default: '' },
          branch: { type: String, default: '' },
          instructions: { type: String, default: '' },
          isDefault: { type: Boolean, default: false },
          isVerified: { type: Boolean, default: true }
        }
      ]
    },
    driverDetails: {
      vehicleType: { type: String, default: 'Motorcycle' },
      licensePlate: { type: String, default: '' },
      isAvailable: { type: Boolean, default: true },
      currentLocation: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point'
        },
        coordinates: {
          type: [Number], // [longitude, latitude]
          default: [36.8219, -1.2921]
        }
      }
    }
  },
  {
    timestamps: true
  }
);

// Indexes
userSchema.index({ 'addresses.location': '2dsphere' });
userSchema.index({ 'driverDetails.currentLocation': '2dsphere' });

// Pre-save hook to hash password if modified and derive fullName if needed
userSchema.pre('save', async function () {
  if (this.firstName || this.lastName) {
    this.fullName = `${this.firstName || ''} ${this.lastName || ''}`.trim();
  }
  if (!this.isModified('passwordHash')) return;
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

// Method to verify password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;

