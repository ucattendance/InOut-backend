const User = require('../models/User');
const Attendance = require('../models/Attendance');
const AttendanceReminderLog = require('../models/AttendanceReminderLog');
const transporter = require('../config/emailConfig');
const {
  URLS,
  buildCheckInReminderHtml,
  buildCheckoutReminderHtml,
} = require('../utils/attendanceReminderEmails');

const TIMEZONE = 'Asia/Kolkata';
const SENDER = 'InOut Portal <admin@urbancode.in>';

const REMINDER_TYPES = {
  CHECKIN_10AM: 'checkin-10am',
  CHECKOUT_6PM: 'checkout-6pm',
  CHECKOUT_7PM: 'checkout-7pm',
};

const getIstDateKey = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const getTodayBoundsUtc = (now = new Date()) => {
  const dateKey = getIstDateKey(now);
  const start = new Date(`${dateKey}T00:00:00+05:30`);
  const end = new Date(`${dateKey}T23:59:59.999+05:30`);
  return { start, end, dateKey };
};

const isDirectorUser = (user) => {
  const values = [user?.position];
  if (Array.isArray(user?.works)) {
    for (const work of user.works) {
      if (work?.position) values.push(work.position);
    }
  }
  return values.some((value) => String(value || '').trim().toLowerCase() === 'director');
};

const hasUsableEmail = (user) =>
  typeof user?.email === 'string' && user.email.trim().length > 0;

/**
 * Active employees eligible for reminders (excludes Directors, admins, inactive).
 */
const getEligibleEmployees = async () => {
  const users = await User.find({
    role: 'employee',
    isActive: { $ne: false },
    email: { $exists: true, $nin: [null, ''] },
  })
    .select('_id name email position works role isActive')
    .lean();

  return users.filter((user) => hasUsableEmail(user) && !isDirectorUser(user));
};

/**
 * Build today's check-in / check-out sets from Attendance.
 * Handles ObjectId and string user refs.
 */
const getTodayAttendanceSets = async (now = new Date()) => {
  const { start, end, dateKey } = getTodayBoundsUtc(now);
  const rows = await Attendance.find({
    timestamp: { $gte: start, $lte: end },
    type: { $in: ['check-in', 'check-out'] },
  })
    .select('user type')
    .lean();

  const checkedIn = new Set();
  const checkedOut = new Set();

  for (const row of rows) {
    if (row.user == null) continue;
    const id = String(row.user);
    if (row.type === 'check-in') checkedIn.add(id);
    if (row.type === 'check-out') checkedOut.add(id);
  }

  return { checkedIn, checkedOut, dateKey, start, end };
};

const alreadySent = async (userId, reminderType, dateKey) => {
  const existing = await AttendanceReminderLog.findOne({
    user: userId,
    reminderType,
    dateKey,
    status: 'sent',
  })
    .select('_id')
    .lean();
  return Boolean(existing);
};

/**
 * Reserve a unique send slot. Returns false if already successfully sent.
 * Failed prior attempts can be retried the same day.
 */
const claimReminderSlot = async ({ userId, email, reminderType, dateKey }) => {
  const existing = await AttendanceReminderLog.findOne({
    user: userId,
    reminderType,
    dateKey,
  });

  if (existing && existing.status === 'sent') {
    return false;
  }

  if (existing) {
    existing.email = email;
    existing.status = 'sent';
    existing.errorMessage = '';
    existing.sentAt = new Date();
    await existing.save();
    return true;
  }

  try {
    await AttendanceReminderLog.create({
      user: userId,
      email,
      reminderType,
      dateKey,
      status: 'sent',
      sentAt: new Date(),
    });
    return true;
  } catch (err) {
    // Race: another worker claimed the unique slot
    if (err && (err.code === 11000 || err.code === '11000')) {
      return false;
    }
    throw err;
  }
};

const markReminderFailed = async ({ userId, reminderType, dateKey, errorMessage }) => {
  await AttendanceReminderLog.findOneAndUpdate(
    { user: userId, reminderType, dateKey },
    {
      $set: {
        status: 'failed',
        errorMessage: String(errorMessage || '').slice(0, 500),
      },
    }
  );
};

const sendMail = async ({ to, subject, html }) => {
  if (!process.env.NOTIFY_EMAIL || !process.env.NOTIFY_PASSWORD) {
    throw new Error('NOTIFY_EMAIL / NOTIFY_PASSWORD not configured');
  }
  return transporter.sendMail({
    from: SENDER,
    to,
    subject,
    html,
  });
};

const sendOneReminder = async ({
  user,
  reminderType,
  dateKey,
  subject,
  html,
  dryRun = false,
}) => {
  const userId = user._id;

  if (await alreadySent(userId, reminderType, dateKey)) {
    return { status: 'skipped_duplicate', userId: String(userId), email: user.email };
  }

  if (dryRun) {
    return { status: 'dry_run', userId: String(userId), email: user.email };
  }

  const claimed = await claimReminderSlot({
    userId,
    email: user.email,
    reminderType,
    dateKey,
  });
  if (!claimed) {
    return { status: 'skipped_duplicate', userId: String(userId), email: user.email };
  }

  try {
    await sendMail({ to: user.email, subject, html });
    return { status: 'sent', userId: String(userId), email: user.email };
  } catch (err) {
    await markReminderFailed({
      userId,
      reminderType,
      dateKey,
      errorMessage: err.message,
    });
    return {
      status: 'failed',
      userId: String(userId),
      email: user.email,
      error: err.message,
    };
  }
};

/**
 * Reminder #1 — 10:00 AM IST
 * Active employees, not directors, no check-in today.
 */
const runCheckInReminder = async ({ now = new Date(), dryRun = false } = {}) => {
  const employees = await getEligibleEmployees();
  const { checkedIn, dateKey } = await getTodayAttendanceSets(now);
  const recipients = employees.filter((u) => !checkedIn.has(String(u._id)));

  const results = [];
  for (const user of recipients) {
    const result = await sendOneReminder({
      user,
      reminderType: REMINDER_TYPES.CHECKIN_10AM,
      dateKey,
      subject: 'Reminder: Please Complete Your Check-In',
      html: buildCheckInReminderHtml(user.name),
      dryRun,
    });
    results.push(result);
  }

  return {
    reminderType: REMINDER_TYPES.CHECKIN_10AM,
    dateKey,
    candidateCount: recipients.length,
    results,
  };
};

/**
 * Reminder #2 / #3 — checked in, not checked out, not directors.
 */
const runCheckoutReminder = async (
  reminderType,
  { now = new Date(), dryRun = false, finalReminder = false } = {}
) => {
  const employees = await getEligibleEmployees();
  const { checkedIn, checkedOut, dateKey } = await getTodayAttendanceSets(now);

  const recipients = employees.filter((u) => {
    const id = String(u._id);
    return checkedIn.has(id) && !checkedOut.has(id);
  });

  const subject = finalReminder
    ? 'Final Reminder: Pending Check-Out'
    : 'Reminder: Please Complete Your Check-Out';

  const results = [];
  for (const user of recipients) {
    const result = await sendOneReminder({
      user,
      reminderType,
      dateKey,
      subject,
      html: buildCheckoutReminderHtml(user.name, { finalReminder }),
      dryRun,
    });
    results.push(result);
  }

  return {
    reminderType,
    dateKey,
    candidateCount: recipients.length,
    results,
  };
};

const runCheckout6pmReminder = (opts) =>
  runCheckoutReminder(REMINDER_TYPES.CHECKOUT_6PM, {
    ...opts,
    finalReminder: false,
  });

const runCheckout7pmReminder = (opts) =>
  runCheckoutReminder(REMINDER_TYPES.CHECKOUT_7PM, {
    ...opts,
    finalReminder: true,
  });

module.exports = {
  TIMEZONE,
  SENDER,
  REMINDER_TYPES,
  URLS,
  getIstDateKey,
  getTodayBoundsUtc,
  isDirectorUser,
  getEligibleEmployees,
  getTodayAttendanceSets,
  alreadySent,
  claimReminderSlot,
  runCheckInReminder,
  runCheckout6pmReminder,
  runCheckout7pmReminder,
};
