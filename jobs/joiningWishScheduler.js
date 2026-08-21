const cron = require('node-cron');
const { TIMEZONE, runJoiningWishes } = require('../services/joiningWishService');

let started = false;

const summarize = (report) => {
  if (!report) return;
  if (report.skippedReason) {
    console.log(`[JoiningWish] skipped reason=${report.skippedReason} date=${report.dateKey}`);
    return;
  }
  const sent = (report.results || []).filter((r) => r.status === 'sent').length;
  const skipped = (report.results || []).filter((r) => r.status === 'skipped_duplicate').length;
  const failed = (report.results || []).filter((r) => r.status === 'failed').length;
  console.log(
    `[JoiningWish] date=${report.dateKey} candidates=${report.candidateCount} sent=${sent} skipped=${skipped} failed=${failed}`
  );
};

const safeRun = async () => {
  try {
    const report = await runJoiningWishes();
    summarize(report);
    return report;
  } catch (err) {
    console.error('[JoiningWish] run failed:', err.message);
    return null;
  }
};

/**
 * Every day at 9:05 AM IST — work anniversary wishes (same chat webhook as birthday).
 * Offset by 5 minutes so birthday posts finish first if both fire the same morning.
 */
const startJoiningWishScheduler = () => {
  if (process.env.JOINING_WISHES_ENABLED === 'false') {
    console.log('[JoiningWish] Scheduler disabled (JOINING_WISHES_ENABLED=false)');
    return { started: false };
  }

  if (started) {
    console.log('[JoiningWish] Scheduler already running');
    return { started: true };
  }

  cron.schedule(
    '5 9 * * *',
    () => {
      safeRun();
    },
    { timezone: TIMEZONE }
  );

  started = true;
  console.log('[JoiningWish] Scheduler started (Asia/Kolkata: 09:05)');
  return { started: true };
};

module.exports = {
  startJoiningWishScheduler,
  safeRun,
};
