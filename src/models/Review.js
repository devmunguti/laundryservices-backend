import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true
    },
    orderRef: {
      type: String,
      required: true,
      index: true
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    customerName: {
      type: String,
      required: true,
      trim: true
    },
    customerPhone: {
      type: String,
      default: ''
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000
    },
    tags: {
      type: [String],
      default: []
    },
    reply: {
      text: { type: String, default: null },
      repliedAt: { type: Date, default: null }
    },
    isPublished: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Compound index for provider rating queries
reviewSchema.index({ provider: 1, createdAt: -1 });

const Review = mongoose.model('Review', reviewSchema);

export default Review;
