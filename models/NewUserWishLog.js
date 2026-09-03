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
    email: {
      type: String,
      default: '',
      index: true,
    },
    spaceId: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending_join', 'sent', 'failed'],
      default: 'pending_join',
    },
    membershipState: {
      type: String,
      default: '',
    },
    errorMessage: {
      type: String,
      default: '',
    },
    invitedAt: {
      type: Date,
    },
    joinedAt: {
      type: Date,
    },
    lastCheckedAt: {
      type: Date,
    },
    sentAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NewUserWishLog', NewUserWishLogSchema);
