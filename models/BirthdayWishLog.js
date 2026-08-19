const mongoose = require('mongoose');

/**
 * One birthday chat wish per user per calendar day (IST).
 * Unique index prevents duplicates across process restarts.
 */
const BirthdayWishLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      default: '',
    },
    /** Calendar day in Asia/Kolkata, format YYYY-MM-DD */
    dateKey: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['sent', 'failed'],
      default: 'sent',
    },
    errorMessage: {
      type: String,
      default: '',
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

BirthdayWishLogSchema.index({ user: 1, dateKey: 1 }, { unique: true });

module.exports = mongoose.model('BirthdayWishLog', BirthdayWishLogSchema);
