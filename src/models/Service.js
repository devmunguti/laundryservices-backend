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
      enum: [
        'Wash & Fold',
        'Dry Cleaning',
        'Ironing & Pressing',
        'Express Delivery',
        'Shoe Cleaning',
        'Bedding & Linens',
        'Specialty Care'
      ]
    },
    description: {
      type: String,
      default: ''
    },
    pricingType: {
      type: String,
      required: [true, 'Pricing type is required'],
      enum: ['per_kg', 'per_item', 'flat']
    },
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: 0
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

const Service = mongoose.models.Service || mongoose.model('Service', serviceSchema);
export default Service;
