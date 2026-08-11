import mongoose from 'mongoose';

const ticketMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const ticketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      unique: true,
      index: true
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true
    },
    messages: [ticketMessageSchema],
    status: {
      type: String,
      enum: ['Open', 'In_Progress', 'Resolved', 'Closed'],
      default: 'Open',
      index: true
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium'
    },
    assignedAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound Index for triage queries
ticketSchema.index({ status: 1, priority: -1 });

// Pre-save hook: auto-generate ticketId if missing
ticketSchema.pre('save', function () {
  if (!this.ticketId) {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    this.ticketId = `TCK-${randomNum}`;
  }
});

const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
export default Ticket;
