const fs = require('fs');
const path = require('path');
const https = require('https');
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

const sanitizeWebhookUrl = (value) =>
  String(value || '')
    .replace(/[\s\r\n]+/g, '')
    .replace(/^['"]+|['"]+$/g, '');

const webhookTokenLen = (url) => {
  const match = String(url).match(/[?&]token=([^&]*)/);
  return match && match[1] ? match[1].length : 0;
};

const readWebhookUrlFromEnvFile = (envKey = 'BIRTHDAY_CHAT_WEBHOOK_URL') => {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const keyPattern = new RegExp(`^\\s*${envKey}\\s*=`);
    const rows = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (let i = 0; i < rows.length; i += 1) {
      if (!keyPattern.test(rows[i])) continue;
      let value = rows[i].replace(new RegExp(`^\\s*${envKey}\\s*=\\s*`), '');
      const quote = value[0] === '"' || value[0] === "'" ? value[0] : '';
      if (quote && value.length >= 2 && value.endsWith(quote)) {
        return sanitizeWebhookUrl(value);
      }
      if (quote) {
        while (i + 1 < rows.length && !value.endsWith(quote)) {
          i += 1;
          value += rows[i];
        }
        return sanitizeWebhookUrl(value);
      }
      while (
        i + 1 < rows.length &&
        rows[i + 1] &&
        !/^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(rows[i + 1])
      ) {
        i += 1;
        value += rows[i];
      }
      return sanitizeWebhookUrl(value);
    }
    return '';
  } catch (_) {
    return '';
  }
};

const pickWebhookUrl = (fromEnv, fromFile) => {
  const envUrl = sanitizeWebhookUrl(fromEnv);
  const fileUrl = sanitizeWebhookUrl(fromFile);
  const envLen = webhookTokenLen(envUrl);
  const fileLen = webhookTokenLen(fileUrl);
  if (fileLen > envLen) return fileUrl;
  if (envLen > fileLen) return envUrl;
  return envUrl || fileUrl;
};

const getWebhookUrl = () =>
  pickWebhookUrl(process.env.BIRTHDAY_CHAT_WEBHOOK_URL, readWebhookUrlFromEnvFile('BIRTHDAY_CHAT_WEBHOOK_URL'));

/** Prefer JOINING_CHAT_WEBHOOK_URL; fall back to birthday webhook if unset. */
const getJoiningWebhookUrl = () => {
  const joining = pickWebhookUrl(
    process.env.JOINING_CHAT_WEBHOOK_URL,
    readWebhookUrlFromEnvFile('JOINING_CHAT_WEBHOOK_URL')
  );
  if (webhookTokenLen(joining) >= 40) return joining;
  return getWebhookUrl();
};

/** Separate Incoming Webhook for new-employee welcome (do not fall back). */
const getNewUserWebhookUrl = () => {
  const url = pickWebhookUrl(
    process.env.NEW_USER_CHAT_WEBHOOK_URL,
    readWebhookUrlFromEnvFile('NEW_USER_CHAT_WEBHOOK_URL')
  );
  return webhookTokenLen(url) >= 40 ? url : '';
};

const chatErrorDetail = (data) => {
  if (!data) return '';
  if (typeof data === 'string') return data;
  return data.error?.message || data.message || JSON.stringify(data);
};

const postJsonToWebhook = (url, payload) =>
  new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const withoutProto = String(url).replace(/^https:\/\//i, '');
    const slash = withoutProto.indexOf('/');
    if (slash < 0) {
      reject(new Error('Invalid webhook URL'));
      return;
    }
    const hostname = withoutProto.slice(0, slash);
    const requestPath = withoutProto.slice(slash);

    const req = https.request(
      {
        protocol: 'https:',
        hostname,
        path: requestPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 15000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = raw;
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch (_) {
            data = raw;
          }
          resolve({ status: res.statusCode, data });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Google Chat webhook timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

const toCardHtml = (plain) =>
  String(plain || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

/**
 * Public HTTPS URL for the birthday poster shown in Google Chat.
 * Incoming webhooks cannot upload files — image must be reachable by Google's servers.
 */
const getBirthdayPosterImageUrl = () => {
  const raw = String(process.env.BIRTHDAY_POSTER_IMAGE_URL || '').trim();
  if (!raw) return '';
  if (!/^https:\/\//i.test(raw)) {
    throw new Error('BIRTHDAY_POSTER_IMAGE_URL must be a public https:// URL');
  }
  return raw;
};

/**
 * Google Chat cardsV2 payload: optional poster image + wish text.
 * @see https://developers.google.com/workspace/chat/api/guides/message-formats/cards
 */
const buildBirthdayChatPayload = (text, { imageUrl, userName } = {}) => {
  const message = String(text || '').trim();
  const widgets = [];

  if (imageUrl) {
    widgets.push({
      image: {
        imageUrl,
        altText: `Happy Birthday ${userName || ''}`.trim() || 'Birthday poster',
      },
    });
  }

  if (message) {
    widgets.push({ textParagraph: { text: toCardHtml(message) } });
  }

  return {
    cardsV2: [
      {
        cardId: 'birthday-wish',
        card: {
          header: {
            title: 'Happy Birthday! 🎂',
            subtitle: userName ? String(userName) : 'Urbancode',
          },
          sections: [{ widgets }],
        },
      },
    ],
  };
};

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

const postChatWebhook = async (text, webhookUrl, { imageUrl, userName } = {}) => {
  const url = webhookUrl || getWebhookUrl();
  if (!url) {
    throw new Error('Chat webhook URL is not configured');
  }
  if (!/^https:\/\//i.test(url)) {
    throw new Error('Chat webhook URL must start with https://');
  }
  if (webhookTokenLen(url) < 40) {
    throw new Error(
      `Webhook token missing or truncated (token_len=${webhookTokenLen(url)}). Put the full URL in quotes on one line in .env`
    );
  }

  const message = String(text || '').trim();
  const posterUrl = imageUrl || '';

  // Prefer card with image (and text) when a public poster URL is configured.
  if (posterUrl) {
    const cardPayload = buildBirthdayChatPayload(message, {
      imageUrl: posterUrl,
      userName,
    });
    const cardRes = await postJsonToWebhook(url, cardPayload);
    if (cardRes.status >= 200 && cardRes.status < 300) return cardRes.data;

    const detail = chatErrorDetail(cardRes.data) || 'Bad Request';
    throw new Error(
      `Google Chat webhook failed (${cardRes.status}) with image card: ${String(detail).slice(0, 400)}`
    );
  }

  const textRes = await postJsonToWebhook(url, { text: message });
  if (textRes.status >= 200 && textRes.status < 300) return textRes.data;

  const cardRes = await postJsonToWebhook(url, buildBirthdayChatPayload(message, { userName }));
  if (cardRes.status >= 200 && cardRes.status < 300) return cardRes.data;

  const detail = chatErrorDetail(cardRes.data) || chatErrorDetail(textRes.data) || 'Bad Request';
  throw new Error(`Google Chat webhook failed (${cardRes.status}): ${String(detail).slice(0, 400)}`);
};

const sendWishForUser = async (user, { dateKey, dryRun = false, force = false } = {}) => {
  const userId = user._id;
  const text = buildBirthdayWishText(user);
  let imageUrl = '';
  try {
    imageUrl = getBirthdayPosterImageUrl();
  } catch (err) {
    return {
      status: 'failed',
      userId: String(userId),
      name: user.name,
      text,
      error: err.message,
    };
  }

  if (!force && (await alreadySent(userId, dateKey))) {
    return {
      status: 'skipped_duplicate',
      userId: String(userId),
      name: user.name,
      text,
      imageUrl: imageUrl || undefined,
    };
  }

  if (dryRun) {
    return {
      status: 'dry_run',
      userId: String(userId),
      name: user.name,
      text,
      imageUrl: imageUrl || undefined,
    };
  }

  const claimed = force ? true : await claimWishSlot({ userId, name: user.name, dateKey });
  if (!claimed) {
    return {
      status: 'skipped_duplicate',
      userId: String(userId),
      name: user.name,
      text,
      imageUrl: imageUrl || undefined,
    };
  }

  try {
    await postChatWebhook(text, undefined, { imageUrl, userName: user.name });
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
    return {
      status: 'sent',
      userId: String(userId),
      name: user.name,
      text,
      imageUrl: imageUrl || undefined,
    };
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
      imageUrl: imageUrl || undefined,
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
  getJoiningWebhookUrl,
  getNewUserWebhookUrl,
  getBirthdayPosterImageUrl,
  buildBirthdayChatPayload,
  pickWebhookUrl,
  postChatWebhook,
  getActiveUsersWithDob,
  getTodaysBirthdayUsers,
  alreadySent,
  claimWishSlot,
  buildBirthdayWishText,
  runBirthdayWishes,
};
