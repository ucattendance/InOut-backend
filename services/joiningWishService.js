const User = require('../models/User');
const JoiningWishLog = require('../models/JoiningWishLog');
const { getIstDateKey } = require('./attendanceReminderService');
const {
  TIMEZONE,
  getDobMonthDay,
  getIstYearMonthDay,
  isLeapYear,
  getJoiningWebhookUrl,
  postChatWebhook,
} = require('./birthdayWishService');
const { buildJoiningWishText } = require('../utils/joiningWishMessage');

const isSystemAdminUser = (user) =>
  String(user?.name || '').trim() === 'Admin' || String(user?.role || '') === 'admin';

const getJoiningYear = (dateOfJoining) => {
  const d = new Date(dateOfJoining);
  if (Number.isNaN(d.getTime())) return null;
  const utcMidnight =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  if (utcMidnight) return d.getUTCFullYear();
  return getIstYearMonthDay(d).year;
};

/**
 * Anniversary of dateOfJoining (month + day). Skips the joining year itself
 * (yearsOfService must be >= 1).
 */
const getYearsOfServiceToday = (dateOfJoining, now = new Date()) => {
  const joined = getDobMonthDay(dateOfJoining);
  if (!joined) return 0;
  const today = getIstYearMonthDay(now);
  const joiningYear = getJoiningYear(dateOfJoining);
  if (joiningYear == null) return 0;

  let monthDayMatch = joined.month === today.month && joined.day === today.day;
  if (
    !monthDayMatch &&
    !isLeapYear(today.year) &&
    today.month === 2 &&
    today.day === 28 &&
    joined.month === 2 &&
    joined.day === 29
  ) {
    monthDayMatch = true;
  }
  if (!monthDayMatch) return 0;

  const years = today.year - joiningYear;
  return years >= 1 ? years : 0;
};

const isJoiningAnniversaryToday = (dateOfJoining, now = new Date()) =>
  getYearsOfServiceToday(dateOfJoining, now) >= 1;

const getActiveUsersWithJoiningDate = async () => {
  const users = await User.find({
    isActive: { $ne: false },
    name: { $ne: 'Admin' },
    role: { $ne: 'admin' },
    dateOfJoining: { $exists: true, $nin: [null, ''] },
  })
    .select('_id name email position company employeeId role isActive dateOfJoining dateOfRelieving')
    .lean();

  return users.filter((user) => user?.dateOfJoining && !isSystemAdminUser(user));
};

const getTodaysJoiningAnniversaryUsers = async (now = new Date()) => {
  const users = await getActiveUsersWithJoiningDate();
  return users
    .map((user) => ({
      user,
      yearsOfService: getYearsOfServiceToday(user.dateOfJoining, now),
    }))
    .filter((row) => row.yearsOfService >= 1);
};

const alreadySent = async (userId, dateKey) => {
  const existing = await JoiningWishLog.findOne({
    user: userId,
    dateKey,
    status: 'sent',
  })
    .select('_id')
    .lean();
  return Boolean(existing);
};

const claimWishSlot = async ({ userId, name, dateKey, yearsOfService }) => {
  const existing = await JoiningWishLog.findOne({ user: userId, dateKey });

  if (existing && existing.status === 'sent') {
    return false;
  }

  if (existing) {
    existing.name = name;
    existing.yearsOfService = yearsOfService;
    existing.status = 'sent';
    existing.errorMessage = '';
    existing.sentAt = new Date();
    await existing.save();
    return true;
  }

  try {
    await JoiningWishLog.create({
      user: userId,
      name,
      dateKey,
      yearsOfService,
      status: 'sent',
    });
    return true;
  } catch (err) {
    if (err && err.code === 11000) return false;
    throw err;
  }
};

const markWishFailed = async ({ userId, dateKey, errorMessage }) => {
  await JoiningWishLog.updateOne(
    { user: userId, dateKey },
    { $set: { status: 'failed', errorMessage: String(errorMessage || '').slice(0, 500) } }
  );
};

const sendWishForUser = async (
  user,
  yearsOfService,
  { dateKey, dryRun = false, force = false } = {}
) => {
  const userId = user._id;
  const text = buildJoiningWishText(user, yearsOfService);

  if (!force && (await alreadySent(userId, dateKey))) {
    return {
      status: 'skipped_duplicate',
      userId: String(userId),
      name: user.name,
      yearsOfService,
      text,
    };
  }

  if (dryRun) {
    return { status: 'dry_run', userId: String(userId), name: user.name, yearsOfService, text };
  }

  const claimed = force
    ? true
    : await claimWishSlot({ userId, name: user.name, dateKey, yearsOfService });
  if (!claimed) {
    return {
      status: 'skipped_duplicate',
      userId: String(userId),
      name: user.name,
      yearsOfService,
      text,
    };
  }

  try {
    await postChatWebhook(text, getJoiningWebhookUrl());
    if (force) {
      await JoiningWishLog.findOneAndUpdate(
        { user: userId, dateKey },
        {
          $set: {
            name: user.name,
            yearsOfService,
            status: 'sent',
            errorMessage: '',
            sentAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
    return { status: 'sent', userId: String(userId), name: user.name, yearsOfService, text };
  } catch (err) {
    await markWishFailed({
      userId,
      dateKey,
      errorMessage: err.message,
    });
    return {
      status: 'failed',
      userId: String(userId),
      name: user.name,
      yearsOfService,
      text,
      error: err.message,
    };
  }
};

/**
 * Post one chat wish per active user whose joining anniversary is today (IST).
 * Uses JOINING_CHAT_WEBHOOK_URL when set (so Chat shows a separate webhook name).
 */
const runJoiningWishes = async ({ now = new Date(), dryRun = false, force = false } = {}) => {
  const dateKey = getIstDateKey(now);
  const webhookUrl = getJoiningWebhookUrl();

  if (!webhookUrl && !dryRun) {
    console.log('[JoiningWish] Skipped: JOINING_CHAT_WEBHOOK_URL / BIRTHDAY_CHAT_WEBHOOK_URL is empty');
    return {
      dateKey,
      candidateCount: 0,
      skippedReason: 'missing_webhook',
      results: [],
    };
  }

  const candidates = await getTodaysJoiningAnniversaryUsers(now);
  const results = [];
  for (const { user, yearsOfService } of candidates) {
    results.push(await sendWishForUser(user, yearsOfService, { dateKey, dryRun, force }));
  }

  return {
    dateKey,
    candidateCount: candidates.length,
    results,
  };
};

module.exports = {
  TIMEZONE,
  getYearsOfServiceToday,
  isJoiningAnniversaryToday,
  getActiveUsersWithJoiningDate,
  getTodaysJoiningAnniversaryUsers,
  buildJoiningWishText,
  runJoiningWishes,
};
