const cron = require('node-cron');
const { TIMEZONE, runBirthdayWishes } = require('../services/birthdayWishService');

let started = false;

const summarize = (report) => {
  if (!report) return;
  if (report.skippedReason) {
    console.log(`[BirthdayWish] skipped reason=${report.skippedReason} date=${report.dateKey}`);
    return;
  }
  const sent = (report.results || []).filter((r) => r.status === 'sent').length;
  const skipped = (report.results || []).filter((r) => r.status === 'skipped_duplicate').length;
  const failed = (report.results || []).filter((r) => r.status === 'failed').length;
  console.log(
    `[BirthdayWish] date=${report.dateKey} candidates=${report.candidateCount} sent=${sent} skipped=${skipped} failed=${failed}`
  );
};

const safeRun = async () => {
  try {
    const report = await runBirthdayWishes();
    summarize(report);
    return report;
  } catch (err) {
    console.error('[BirthdayWish] run failed:', err.message);
    return null;
  }
};

/**
 * Every day at 9:00 AM IST — birthday wishes to the configured chat webhook.
 */
const startBirthdayWishScheduler = () => {
  if (process.env.BIRTHDAY_WISHES_ENABLED === 'false') {
    console.log('[BirthdayWish] Scheduler disabled (BIRTHDAY_WISHES_ENABLED=false)');
    return { started: false };
  }

  if (started) {
    console.log('[BirthdayWish] Scheduler already running');
    return { started: true };
  }

  cron.schedule(
    '0 9 * * *',
    () => {
      safeRun();
    },
    { timezone: TIMEZONE }
  );

  started = true;
  console.log('[BirthdayWish] Scheduler started (Asia/Kolkata: 09:00)');
  return { started: true };
};

module.exports = {
  startBirthdayWishScheduler,
  safeRun,
};
