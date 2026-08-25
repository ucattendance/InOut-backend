const mongoose = require('mongoose');

/**
 * One welcome chat wish per user for their entire lifetime.
 * Existing employees are never scanned — only newly created users are posted.
 */
const NewUserWishLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      default: '',
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

module.exports = mongoose.model('NewUserWishLog', NewUserWishLogSchema);
