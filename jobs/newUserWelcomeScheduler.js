const cron = require('node-cron');
const { TIMEZONE } = require('../services/attendanceReminderService');
const {
  pendingCheckMinutes,
  processPendingWelcomeWishes,
} = require('../services/newUserWishService');

let started = false;

const summarize = (report) => {
  if (!report) return;
  if (report.status === 'skipped_disabled') {
    console.log('[NewUserWish] scheduler skipped: wishes disabled');
    return;
  }
  if (report.status === 'skipped_no_credentials') {
    return;
  }
  const sent = (report.results || []).filter((r) => r.status === 'sent').length;
  const waiting = (report.results || []).filter((r) => r.status === 'waiting_for_join').length;
  const failed = (report.results || []).filter((r) => r.status === 'failed').length;
  if (report.processed > 0) {
    console.log(
      `[NewUserWish] pending check processed=${report.processed} sent=${sent} waiting=${waiting} failed=${failed}`
    );
  }
};

const safeRun = async () => {
  try {
    const report = await processPendingWelcomeWishes();
    summarize(report);
    return report;
  } catch (err) {
    console.error('[NewUserWish] pending join check failed:', err.message);
    return null;
  }
};

/**
 * Poll users who were invited to UC_JZ_Team and send welcome only after they join.
 */
const startNewUserWelcomeScheduler = () => {
  if (process.env.NEW_USER_WISHES_ENABLED === 'false') {
    console.log('[NewUserWish] Scheduler disabled (NEW_USER_WISHES_ENABLED=false)');
    return { started: false };
  }

  if (started) {
    console.log('[NewUserWish] Scheduler already running');
    return { started: true };
  }

  const minutes = pendingCheckMinutes();
  const cronExpr = minutes === 1 ? '* * * * *' : `*/${minutes} * * * *`;

  cron.schedule(
    cronExpr,
    () => {
      safeRun();
    },
    { timezone: TIMEZONE }
  );

  started = true;
  console.log(`[NewUserWish] Join-wait scheduler started (every ${minutes} min, ${TIMEZONE})`);
  return { started: true };
};

module.exports = {
  startNewUserWelcomeScheduler,
  safeRun,
};
