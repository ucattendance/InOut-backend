const mongoose = require('mongoose');

/**
 * One monthly report email per employee per monthKey (YYYY-MM).
 * Prevents duplicate sends across process restarts.
 */
const MonthlyReportLogSchema = new mongoose.Schema(
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
    /** Calendar month in Asia/Kolkata, format YYYY-MM */
    monthKey: {
      type: String,
      required: true,
      index: true,
    },
    monthLabel: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['sent', 'failed', 'skipped'],
      default: 'sent',
    },
    hasPayslip: {
      type: Boolean,
      default: false,
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

MonthlyReportLogSchema.index({ user: 1, monthKey: 1 }, { unique: true });

module.exports = mongoose.model('MonthlyReportLog', MonthlyReportLogSchema);
