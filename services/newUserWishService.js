const NewUserWishLog = require('../models/NewUserWishLog');
const {
  getNewUserWebhookUrl,
  postChatWebhook,
} = require('./birthdayWishService');
const { buildNewUserWishText } = require('../utils/newUserWishMessage');

const isSystemAdminUser = (user) =>
  String(user?.name || '').trim() === 'Admin' || String(user?.role || '') === 'admin';

const wishesEnabled = () => process.env.NEW_USER_WISHES_ENABLED !== 'false';

const alreadySent = async (userId) => {
  const existing = await NewUserWishLog.findOne({
    user: userId,
    status: 'sent',
  })
    .select('_id')
    .lean();
  return Boolean(existing);
};

const claimWishSlot = async ({ userId, name }) => {
  const existing = await NewUserWishLog.findOne({ user: userId });

  if (existing && existing.status === 'sent') {
    return false;
  }

  if (existing) {
    existing.name = name;
    existing.status = 'sent';
    existing.errorMessage = '';
    existing.sentAt = new Date();
    await existing.save();
    return true;
  }

  try {
    await NewUserWishLog.create({
      user: userId,
      name,
      status: 'sent',
    });
    return true;
  } catch (err) {
    if (err && err.code === 11000) return false;
    throw err;
  }
};

const markWishFailed = async ({ userId, errorMessage }) => {
  await NewUserWishLog.updateOne(
    { user: userId },
    { $set: { status: 'failed', errorMessage: String(errorMessage || '').slice(0, 500) } }
  );
};

const sendWishForUser = async (user, { dryRun = false, force = false } = {}) => {
  const userId = user._id;
  const text = buildNewUserWishText(user);

  if (!userId) {
    return { status: 'failed', name: user.name, text, error: 'Missing user id' };
  }

  if (isSystemAdminUser(user)) {
    return { status: 'skipped_admin', userId: String(userId), name: user.name, text };
  }

  if (!force && (await alreadySent(userId))) {
    return {
      status: 'skipped_duplicate',
      userId: String(userId),
      name: user.name,
      text,
    };
  }

  if (dryRun) {
    return { status: 'dry_run', userId: String(userId), name: user.name, text };
  }

  const claimed = force ? true : await claimWishSlot({ userId, name: user.name });
  if (!claimed) {
    return {
      status: 'skipped_duplicate',
      userId: String(userId),
      name: user.name,
      text,
    };
  }

  try {
    await postChatWebhook(text, getNewUserWebhookUrl());
    if (force) {
      await NewUserWishLog.findOneAndUpdate(
        { user: userId },
        {
          $set: {
            name: user.name,
            status: 'sent',
            errorMessage: '',
            sentAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
    return { status: 'sent', userId: String(userId), name: user.name, text };
  } catch (err) {
    await markWishFailed({ userId, errorMessage: err.message });
    return {
      status: 'failed',
      userId: String(userId),
      name: user.name,
      text,
      error: err.message,
    };
  }
};

/**
 * Fire-and-forget welcome wish when a brand-new employee is created
 * (admin approval). Existing users are never scanned.
 */
const notifyNewUserJoined = async (user, { dryRun = false, force = false } = {}) => {
  if (!wishesEnabled()) {
    console.log('[NewUserWish] Skipped: NEW_USER_WISHES_ENABLED=false');
    return { status: 'skipped_disabled' };
  }

  const webhookUrl = getNewUserWebhookUrl();
  if (!webhookUrl && !dryRun) {
    console.log('[NewUserWish] Skipped: NEW_USER_CHAT_WEBHOOK_URL is empty');
    return { status: 'skipped_missing_webhook' };
  }

  const result = await sendWishForUser(user, { dryRun, force });
  if (result.status === 'sent') {
    console.log(`[NewUserWish] sent name=${result.name} userId=${result.userId}`);
  } else if (result.status === 'failed') {
    console.error(`[NewUserWish] failed name=${result.name}: ${result.error}`);
  } else {
    console.log(`[NewUserWish] ${result.status} name=${result.name || ''}`);
  }
  return result;
};

const notifyNewUserJoinedSafe = (user) => {
  notifyNewUserJoined(user).catch((err) => {
    console.error('[NewUserWish] unexpected error:', err.message);
  });
};

module.exports = {
  wishesEnabled,
  isSystemAdminUser,
  alreadySent,
  buildNewUserWishText,
  sendWishForUser,
  notifyNewUserJoined,
  notifyNewUserJoinedSafe,
};
