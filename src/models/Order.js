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
    pricingType: {
      type: String,
      enum: ['per_kg', 'per_item', 'flat'],
      required: true
    },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, default: 1 },
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
    city: { type: String, required: true },
    instructions: { type: String, default: '' }
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
      required: [true, 'Customer is required'],
      index: true
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
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

// Pre-save hook: calculate totals and generate orderRef if not set
orderSchema.pre('save', function () {
  // Generate orderRef if new
  if (!this.orderRef) {
    const randomCode = Math.floor(100000 + Math.random() * 900000);
    this.orderRef = `ORD-${randomCode}`;
  }

  // Calculate pricing components
  let subtotal = 0;
  let addOnsTotal = 0;

  if (this.items && this.items.length > 0) {
    this.items.forEach((item) => {
      subtotal += item.unitPrice * item.quantity;
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
