const NewUserWishLog = require('../models/NewUserWishLog');
const User = require('../models/User');
const {
  getNewUserWebhookUrl,
  postChatWebhook,
} = require('./birthdayWishService');
const {
  addApprovedUserToWelcomeSpace,
  autoInviteEnabled,
  getMemberMembership,
  getWelcomeSpaceId,
  hasMembershipCredentials,
  isMembershipJoined,
  membershipEnabled,
} = require('./googleChatMembershipService');
const { buildNewUserWishText } = require('../utils/newUserWishMessage');

const isSystemAdminUser = (user) =>
  String(user?.name || '').trim() === 'Admin' || String(user?.role || '') === 'admin';

const wishesEnabled = () => process.env.NEW_USER_WISHES_ENABLED !== 'false';

const pendingCheckMinutes = () => {
  const value = Number.parseInt(process.env.NEW_USER_WELCOME_CHECK_MINUTES, 10);
  return Number.isFinite(value) && value > 0 ? value : 3;
};

const alreadySent = async (userId) => {
  const existing = await NewUserWishLog.findOne({
    user: userId,
    status: 'sent',
  })
    .select('_id')
    .lean();
  return Boolean(existing);
};

const getPendingLog = async (userId) =>
  NewUserWishLog.findOne({ user: userId, status: 'pending_join' }).lean();

const markPendingJoin = async ({ user, spaceId, membershipState = 'INVITED' }) => {
  const now = new Date();
  const payload = {
    name: user.name,
    email: String(user.email || '').trim().toLowerCase(),
    spaceId,
    status: 'pending_join',
    membershipState,
    errorMessage: '',
    invitedAt: now,
    lastCheckedAt: now,
  };

  return NewUserWishLog.findOneAndUpdate(
    { user: user._id },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const markWishSent = async ({ userId, name, membershipState = 'JOINED' }) => {
  const now = new Date();
  await NewUserWishLog.findOneAndUpdate(
    { user: userId },
    {
      $set: {
        name,
        status: 'sent',
        membershipState,
        errorMessage: '',
        joinedAt: now,
        sentAt: now,
        lastCheckedAt: now,
      },
    },
    { upsert: true }
  );
};

const markWishFailed = async ({ userId, errorMessage, membershipState = '' }) => {
  await NewUserWishLog.updateOne(
    { user: userId },
    {
      $set: {
        status: 'failed',
        errorMessage: String(errorMessage || '').slice(0, 500),
        membershipState,
        lastCheckedAt: new Date(),
      },
    }
  );
};

const sendWelcomeMessage = async (user, { dryRun = false, force = false } = {}) => {
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

  const webhookUrl = getNewUserWebhookUrl();
  if (!webhookUrl) {
    return { status: 'skipped_missing_webhook', userId: String(userId), name: user.name, text };
  }

  try {
    await postChatWebhook(text, webhookUrl);
    await markWishSent({ userId, name: user.name, membershipState: 'JOINED' });
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

const membershipLooksJoined = (membershipResult) => {
  if (membershipResult?.joined) return true;
  return isMembershipJoined(membershipResult?.state);
};

const checkUserJoinedWelcomeSpace = async (user, spaceId) => {
  const membership = await getMemberMembership(spaceId, user.email);
  await NewUserWishLog.updateOne(
    { user: user._id },
    {
      $set: {
        membershipState: membership.state || '',
        lastCheckedAt: new Date(),
      },
    }
  );
  return membership;
};

const trySendWelcomeAfterJoin = async (user, { dryRun = false, force = false } = {}) => {
  if (!wishesEnabled()) {
    return { status: 'skipped_disabled' };
  }

  if (!membershipEnabled() || !hasMembershipCredentials()) {
    return { status: 'skipped_no_credentials', userId: String(user._id), name: user.name };
  }

  const spaceId = getWelcomeSpaceId();
  const membership = await checkUserJoinedWelcomeSpace(user, spaceId);
  if (!membershipLooksJoined(membership)) {
    return {
      status: 'waiting_for_join',
      userId: String(user._id),
      name: user.name,
      membershipState: membership.state || 'INVITED',
    };
  }

  return sendWelcomeMessage(user, { dryRun, force });
};

/**
 * After InOut approval, wait until the user joins UC_JZ_Team (invited manually by team).
 * Welcome is sent only after JOINED — InOut does not send Chat invites.
 */
const notifyNewUserApproved = async (user, { dryRun = false, force = false } = {}) => {
  if (!wishesEnabled()) {
    console.log('[NewUserWish] Skipped: NEW_USER_WISHES_ENABLED=false');
    return { status: 'skipped_disabled' };
  }

  if (isSystemAdminUser(user)) {
    return { status: 'skipped_admin', userId: String(user._id), name: user.name };
  }

  if (!force && (await alreadySent(user._id))) {
    return { status: 'skipped_duplicate', userId: String(user._id), name: user.name };
  }

  if (dryRun) {
    const text = buildNewUserWishText(user);
    return { status: 'dry_run', userId: String(user._id), name: user.name, text };
  }

  const spaceId = getWelcomeSpaceId();

  if (!membershipEnabled() || !hasMembershipCredentials()) {
    console.warn(
      '[NewUserWish] Chat join-check credentials missing; welcome will not post until configured.'
    );
    await markPendingJoin({ user, spaceId, membershipState: 'PENDING_SETUP' });
    return { status: 'waiting_for_credentials', userId: String(user._id), name: user.name };
  }

  if (autoInviteEnabled()) {
    const inviteResult = await addApprovedUserToWelcomeSpace(user);
    if (inviteResult.status === 'failed') {
      await markWishFailed({
        userId: user._id,
        errorMessage: inviteResult.error || 'Failed to invite user to Chat space',
      });
      return { status: 'skipped_membership_failed', membership: inviteResult };
    }
  }

  await markPendingJoin({
    user,
    spaceId,
    membershipState: 'WAITING_FOR_JOIN',
  });

  const membership = await checkUserJoinedWelcomeSpace(user, spaceId);
  if (membershipLooksJoined(membership)) {
    const welcomeResult = await sendWelcomeMessage(user, { force });
    return { ...welcomeResult, membership };
  }

  console.log(
    `[NewUserWish] waiting_for_join name=${user.name} email=${user.email} space=${spaceId} (team invites manually)`
  );
  return {
    status: 'waiting_for_join',
    userId: String(user._id),
    name: user.name,
    membership,
  };
};

const processPendingWelcomeWishes = async () => {
  if (!wishesEnabled()) {
    return { status: 'skipped_disabled', processed: 0, results: [] };
  }

  if (!membershipEnabled() || !hasMembershipCredentials()) {
    return { status: 'skipped_no_credentials', processed: 0, results: [] };
  }

  const pendingLogs = await NewUserWishLog.find({ status: 'pending_join' })
    .sort({ invitedAt: 1 })
    .limit(50)
    .lean();

  const results = [];
  for (const log of pendingLogs) {
    const user = await User.findById(log.user).lean();
    if (!user) {
      await markWishFailed({
        userId: log.user,
        errorMessage: 'User record not found',
        membershipState: log.membershipState,
      });
      results.push({ userId: String(log.user), status: 'failed', error: 'User not found' });
      continue;
    }

    const result = await trySendWelcomeAfterJoin(user);
    results.push(result);
    if (result.status === 'sent') {
      console.log(`[NewUserWish] sent after join name=${result.name} userId=${result.userId}`);
    }
  }

  return {
    status: 'ok',
    processed: results.length,
    results,
  };
};

/**
 * Legacy direct send (used by preview scripts).
 */
const notifyNewUserJoined = async (user, options = {}) => {
  if (!wishesEnabled()) {
    return { status: 'skipped_disabled' };
  }
  return sendWelcomeMessage(user, options);
};

const notifyNewUserJoinedSafe = (user) => {
  notifyNewUserJoined(user).catch((err) => {
    console.error('[NewUserWish] unexpected error:', err.message);
  });
};

const notifyNewUserApprovedSafe = (user) => {
  notifyNewUserApproved(user).catch((err) => {
    console.error('[NewUserWish] unexpected approval flow error:', err.message);
  });
};

module.exports = {
  wishesEnabled,
  pendingCheckMinutes,
  isSystemAdminUser,
  alreadySent,
  buildNewUserWishText,
  sendWelcomeMessage,
  trySendWelcomeAfterJoin,
  notifyNewUserApproved,
  notifyNewUserApprovedSafe,
  processPendingWelcomeWishes,
  notifyNewUserJoined,
  notifyNewUserJoinedSafe,
};
