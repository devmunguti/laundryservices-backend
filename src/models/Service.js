import mongoose from 'mongoose';

const addOnSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    description: { type: String, default: '' }
  },
  { _id: true }
);

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    pricingType: {
      type: String,
      required: [true, 'Pricing type is required'],
      trim: true
    },
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: 0
    },
    minQuantity: {
      type: Number,
      default: 1,
      min: 1
    },
    maxQuantity: {
      type: Number,
      default: 100,
      min: 1
    },
    turnaroundTime: {
      type: String,
      default: '24-48 hours'
    },
    deliveryFee: {
      type: Number,
      default: 200,
      min: 0
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    addOns: [addOnSchema],
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Text Index for searching service catalog by name and category
serviceSchema.index({ name: 'text', category: 'text' });
serviceSchema.index({ provider: 1, isActive: 1 });

const Service = mongoose.models.Service || mongoose.model('Service', serviceSchema);
export default Service;
