const axios = require('axios');
const User = require('../models/User');
const BirthdayWishLog = require('../models/BirthdayWishLog');
const { TIMEZONE, getIstDateKey } = require('./attendanceReminderService');
const { buildBirthdayWishText } = require('../utils/birthdayWishMessage');

const getCalendarMonthDay = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(date));
  return {
    month: Number(parts.find((p) => p.type === 'month').value),
    day: Number(parts.find((p) => p.type === 'day').value),
  };
};

const isLeapYear = (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * HTML date inputs store as UTC midnight. IST-midnight values are 18:30 UTC.
 * Use UTC calendar date for UTC midnight; otherwise Asia/Kolkata.
 */
const getDobMonthDay = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const utcMidnight =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  if (utcMidnight) {
    return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
  return getCalendarMonthDay(d, TIMEZONE);
};

const getIstYearMonthDay = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return {
    year: Number(parts.find((p) => p.type === 'year').value),
    month: Number(parts.find((p) => p.type === 'month').value),
    day: Number(parts.find((p) => p.type === 'day').value),
  };
};

const isBirthdayToday = (dateOfBirth, now = new Date()) => {
  const birth = getDobMonthDay(dateOfBirth);
  if (!birth) return false;
  const today = getIstYearMonthDay(now);
  if (birth.month === today.month && birth.day === today.day) return true;
  if (
    !isLeapYear(today.year) &&
    today.month === 2 &&
    today.day === 28 &&
    birth.month === 2 &&
    birth.day === 29
  ) {
    return true;
  }
  return false;
};

const isSystemAdminUser = (user) =>
  String(user?.name || '').trim() === 'Admin' || String(user?.role || '') === 'admin';

const getWebhookUrl = () =>
  String(process.env.BIRTHDAY_CHAT_WEBHOOK_URL || '')
    .replace(/[\s\r\n]+/g, '')
    .replace(/^['"]+|['"]+$/g, '');

const chatErrorDetail = (data) => {
  if (!data) return '';
  if (typeof data === 'string') return data;
  return data.error?.message || data.message || JSON.stringify(data);
};

const postJsonToWebhook = async (url, payload) => {
  const body = JSON.stringify(payload);
  return axios.post(url, body, {
    timeout: 15000,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    transformRequest: [(data) => data],
    validateStatus: () => true,
    maxContentLength: 1024 * 1024,
    maxBodyLength: 1024 * 1024,
  });
};

const toCardHtml = (plain) =>
  String(plain || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

/**
 * Active users with a DOB. System admin account excluded.
 */
const getActiveUsersWithDob = async () => {
  const users = await User.find({
    isActive: { $ne: false },
    name: { $ne: 'Admin' },
    role: { $ne: 'admin' },
    dateOfBirth: { $exists: true, $nin: [null, ''] },
  })
    .select('_id name email position company employeeId role isActive dateOfBirth dateOfRelieving')
    .lean();

  return users.filter((user) => user?.dateOfBirth && !isSystemAdminUser(user));
};

const getTodaysBirthdayUsers = async (now = new Date()) => {
  const users = await getActiveUsersWithDob();
  return users.filter((user) => isBirthdayToday(user.dateOfBirth, now));
};

const alreadySent = async (userId, dateKey) => {
  const existing = await BirthdayWishLog.findOne({
    user: userId,
    dateKey,
    status: 'sent',
  })
    .select('_id')
    .lean();
  return Boolean(existing);
};

const claimWishSlot = async ({ userId, name, dateKey }) => {
  const existing = await BirthdayWishLog.findOne({ user: userId, dateKey });

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
    await BirthdayWishLog.create({
      user: userId,
      name,
      dateKey,
      status: 'sent',
    });
    return true;
  } catch (err) {
    if (err && err.code === 11000) return false;
    throw err;
  }
};

const markWishFailed = async ({ userId, dateKey, errorMessage }) => {
  await BirthdayWishLog.updateOne(
    { user: userId, dateKey },
    { $set: { status: 'failed', errorMessage: String(errorMessage || '').slice(0, 500) } }
  );
};

const postChatWebhook = async (text) => {
  const url = getWebhookUrl();
  if (!url) {
    throw new Error('BIRTHDAY_CHAT_WEBHOOK_URL is not configured');
  }
  if (!/^https:\/\//i.test(url)) {
    throw new Error('BIRTHDAY_CHAT_WEBHOOK_URL must start with https://');
  }

  const message = String(text || '').trim();
  const textRes = await postJsonToWebhook(url, { text: message });
  if (textRes.status >= 200 && textRes.status < 300) return textRes.data;

  const cardRes = await postJsonToWebhook(url, {
    cardsV2: [
      {
        cardId: 'birthday-wish',
        card: {
          sections: [
            {
              widgets: [{ textParagraph: { text: toCardHtml(message) } }],
            },
          ],
        },
      },
    ],
  });
  if (cardRes.status >= 200 && cardRes.status < 300) return cardRes.data;

  const detail = chatErrorDetail(cardRes.data) || chatErrorDetail(textRes.data) || 'Bad Request';
  throw new Error(`Google Chat webhook failed (${cardRes.status}): ${String(detail).slice(0, 400)}`);
};

const sendWishForUser = async (user, { dateKey, dryRun = false, force = false } = {}) => {
  const userId = user._id;
  const text = buildBirthdayWishText(user);

  if (!force && (await alreadySent(userId, dateKey))) {
    return { status: 'skipped_duplicate', userId: String(userId), name: user.name, text };
  }

  if (dryRun) {
    return { status: 'dry_run', userId: String(userId), name: user.name, text };
  }

  const claimed = force ? true : await claimWishSlot({ userId, name: user.name, dateKey });
  if (!claimed) {
    return { status: 'skipped_duplicate', userId: String(userId), name: user.name, text };
  }

  try {
    await postChatWebhook(text);
    if (force) {
      await BirthdayWishLog.findOneAndUpdate(
        { user: userId, dateKey },
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
    await markWishFailed({
      userId,
      dateKey,
      errorMessage: err.message,
    });
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
 * Post one chat wish per active user whose birthday is today (IST).
 */
const runBirthdayWishes = async ({ now = new Date(), dryRun = false, force = false } = {}) => {
  const dateKey = getIstDateKey(now);
  const webhookUrl = getWebhookUrl();

  if (!webhookUrl && !dryRun) {
    console.log('[BirthdayWish] Skipped: BIRTHDAY_CHAT_WEBHOOK_URL is empty');
    return {
      dateKey,
      candidateCount: 0,
      skippedReason: 'missing_webhook',
      results: [],
    };
  }

  const candidates = await getTodaysBirthdayUsers(now);
  const results = [];
  for (const user of candidates) {
    results.push(await sendWishForUser(user, { dateKey, dryRun, force }));
  }

  return {
    dateKey,
    candidateCount: candidates.length,
    results,
  };
};

module.exports = {
  TIMEZONE,
  getDobMonthDay,
  getIstYearMonthDay,
  isLeapYear,
  isBirthdayToday,
  getWebhookUrl,
  getActiveUsersWithDob,
  getTodaysBirthdayUsers,
  alreadySent,
  claimWishSlot,
  buildBirthdayWishText,
  runBirthdayWishes,
};
