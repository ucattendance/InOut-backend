const mongoose = require('mongoose');

/**
 * Persists one sent reminder per user per calendar day (IST) per type.
 * Unique index prevents duplicates across process restarts.
 */
const AttendanceReminderLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
    },
    reminderType: {
      type: String,
      enum: [
        'checkin-10am',
        'checkout-6pm',
        'checkout-7pm',
        'checkout-8pm',
        'it-status-12pm',
        'consultancy-3pm',
      ],
      required: true,
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

AttendanceReminderLogSchema.index(
  { user: 1, reminderType: 1, dateKey: 1 },
  { unique: true }
);

module.exports = mongoose.model('AttendanceReminderLog', AttendanceReminderLogSchema);
