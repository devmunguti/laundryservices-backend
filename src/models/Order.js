import mongoose from 'mongoose';

const orderItemAddOnSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true
    },
    name: { type: String, required: true },
    category: {
      type: String,
      default: 'Wash & Fold',
      trim: true
    },
    pricingType: {
      type: String,
      default: 'per_kg',
      trim: true
    },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 0.1, default: 1 },
    subtotal: { type: Number, default: 0, min: 0 },
    addOns: [orderItemAddOnSchema],
    notes: { type: String, default: '' }
  },
  { _id: true }
);

const timeSlotSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    windowStart: { type: String, required: true }, // e.g. "09:00"
    windowEnd: { type: String, required: true }    // e.g. "11:00"
  },
  { _id: false }
);

const addressSnapshotSchema = new mongoose.Schema(
  {
    street: { type: String, required: true },
    city: { type: String, default: 'Nairobi' },
    campusLocation: { type: String, default: '' },
    houseNumber: { type: String, default: '' },
    instructions: { type: String, default: '' },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracy: { type: Number, default: null }
    },
    liveLocationUrl: { type: String, default: '' },
    locationUpdatedAt: { type: Date, default: null }
  },
  { _id: false }
);

const customerDetailsSchema = new mongoose.Schema(
  {
    fullName: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true }
  },
  { _id: false }
);

const providerLiveLocationSchema = new mongoose.Schema(
  {
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracy: { type: Number, default: null },
      heading: { type: Number, default: null },
      speed: { type: Number, default: null }
    },
    updatedAt: { type: Date, default: null },
    isNavigating: { type: Boolean, default: false },
    currentLeg: { type: String, enum: ['pickup', 'delivery'], default: 'pickup' }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderRef: {
      type: String,
      unique: true,
      index: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    customerDetails: {
      type: customerDetailsSchema,
      default: () => ({})
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    providerLiveLocation: {
      type: providerLiveLocationSchema,
      default: () => ({})
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    items: [orderItemSchema],
    status: {
      type: String,
      enum: [
        'Pending',
        'Pickup_Scheduled',
        'Picked_Up',
        'In_Wash',
        'Ready_For_Delivery',
        'Out_For_Delivery',
        'Delivered',
        'Cancelled'
      ],
      default: 'Pending',
      index: true
    },
    pickupSlot: timeSlotSchema,
    deliverySlot: timeSlotSchema,
    pickupAddress: addressSnapshotSchema,
    deliveryAddress: addressSnapshotSchema,
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
      default: 'Pending',
      index: true
    },
    confirmedWeight: { type: Number, default: 0 },
    confirmedCount: { type: Number, default: 0 },
    pricing: {
      subtotal: { type: Number, default: 0, min: 0 },
      deliveryFee: { type: Number, default: 0, min: 0 },
      addOnsTotal: { type: Number, default: 0, min: 0 },
      discount: { type: Number, default: 0, min: 0 },
      tax: { type: Number, default: 0, min: 0 },
      grandTotal: { type: Number, default: 0, min: 0 }
    }
  },
  {
    timestamps: true
  }
);

// Compound Indexes for fast queries
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ driver: 1, status: 1 });

/**
 * Calculates the next sequential order reference number (e.g. ORD-001, ORD-002, ...)
 * based on previous orders stored in MongoDB.
 */
export async function generateNextOrderRef() {
  try {
    const OrderModel = mongoose.models.Order || mongoose.model('Order');

    // Find all orders to determine highest sequence number
    const latestOrder = await OrderModel.findOne({
      orderRef: { $regex: /^ORD-\d+$/i }
    }).sort({ createdAt: -1 });

    let nextNum = 1;
    if (latestOrder && latestOrder.orderRef) {
      const match = latestOrder.orderRef.match(/^ORD-(\d+)$/i);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    } else {
      const count = await OrderModel.countDocuments();
      nextNum = count + 1;
    }

    return `ORD-${String(nextNum).padStart(3, '0')}`;
  } catch (err) {
    return `ORD-${Date.now().toString().slice(-6)}`;
  }
}

// Pre-save hook: calculate totals and generate sequential orderRef if not set
orderSchema.pre('save', async function () {
  // Generate sequential orderRef if new
  if (!this.orderRef) {
    this.orderRef = await generateNextOrderRef();
  }

  // Calculate pricing components
  let subtotal = 0;
  let addOnsTotal = 0;

  if (this.items && this.items.length > 0) {
    this.items.forEach((item) => {
      item.subtotal = Math.round((item.unitPrice * item.quantity) * 100) / 100;
      subtotal += item.subtotal;
      if (item.addOns && item.addOns.length > 0) {
        item.addOns.forEach((addOn) => {
          addOnsTotal += addOn.price * item.quantity;
        });
      }
    });
  }

  this.pricing.subtotal = subtotal;
  this.pricing.addOnsTotal = addOnsTotal;

  const rawTotal =
    (this.pricing.subtotal || 0) +
    (this.pricing.deliveryFee || 0) +
    (this.pricing.addOnsTotal || 0) +
    (this.pricing.tax || 0) -
    (this.pricing.discount || 0);

  this.pricing.grandTotal = Math.max(0, rawTotal);
});

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
export default Order;
