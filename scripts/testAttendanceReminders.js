/**
 * Attendance reminder email system tests (no live SMTP required).
 * Run: node scripts/testAttendanceReminders.js
 */
require('dotenv').config();
const assert = require('assert');
const {
  isDirectorUser,
  getIstDateKey,
  getTodayBoundsUtc,
  REMINDER_TYPES,
  URLS,
} = require('../services/attendanceReminderService');
const {
  buildCheckInReminderHtml,
  buildCheckoutReminderHtml,
} = require('../utils/attendanceReminderEmails');

const results = [];
const pass = (name) => {
  results.push({ name, ok: true });
  console.log(`PASS  ${name}`);
};
const fail = (name, err) => {
  results.push({ name, ok: false, err: String(err && err.message ? err.message : err) });
  console.error(`FAIL  ${name}:`, err && err.message ? err.message : err);
};

function runUnit() {
  try {
    assert.strictEqual(isDirectorUser({ position: 'Director' }), true);
    assert.strictEqual(isDirectorUser({ position: 'director' }), true);
    assert.strictEqual(isDirectorUser({ position: 'Developer' }), false);
    assert.strictEqual(
      isDirectorUser({ position: 'Engineer', works: [{ position: 'Director' }] }),
      true
    );
    pass('unit: Director exclusion by position');
  } catch (e) {
    fail('unit: Director exclusion by position', e);
  }

  try {
    const key = getIstDateKey(new Date('2026-08-06T04:30:00.000Z')); // IST 10:00
    assert.strictEqual(key, '2026-08-06');
    const { start, end, dateKey } = getTodayBoundsUtc(new Date('2026-08-06T04:30:00.000Z'));
    assert.strictEqual(dateKey, '2026-08-06');
    assert.ok(start instanceof Date && end instanceof Date);
    assert.ok(end.getTime() > start.getTime());
    pass('unit: IST date key and day bounds');
  } catch (e) {
    fail('unit: IST date key and day bounds', e);
  }

  try {
    assert.strictEqual(URLS.checkIn, 'https://inout.urbancode.tech/attendance?action=checkin');
    assert.strictEqual(URLS.checkOut, 'https://inout.urbancode.tech/attendance?action=checkout');
    assert.strictEqual(URLS.applyLeave, 'https://inout.urbancode.tech/apply-leave');
    pass('unit: reminder deep-link URLs');
  } catch (e) {
    fail('unit: reminder deep-link URLs', e);
  }

  try {
    const html = buildCheckInReminderHtml('Test User');
    assert.ok(html.includes('Reminder: Please Complete Your Check-In'));
    assert.ok(html.includes('Dear Test User'));
    assert.ok(html.includes('Check In Now'));
    assert.ok(html.includes(URLS.checkIn));
    assert.ok(html.includes('Apply Leave'));
    assert.ok(html.includes(URLS.applyLeave));
    assert.ok(html.includes('Urbancode InOut Attendance System'));
    assert.ok(html.includes('Please do not reply to this email'));
    pass('unit: 10:00 AM check-in HTML template');
  } catch (e) {
    fail('unit: 10:00 AM check-in HTML template', e);
  }

  try {
    const html6 = buildCheckoutReminderHtml('Test User', { finalReminder: false });
    assert.ok(html6.includes('Reminder: Please Complete Your Check-Out'));
    assert.ok(html6.includes('Complete Check-Out'));
    assert.ok(html6.includes(URLS.checkOut));
    assert.ok(!html6.includes('Final Reminder'));

    const html7 = buildCheckoutReminderHtml('Test User', { finalReminder: true });
    assert.ok(html7.includes('Final Reminder: Pending Check-Out'));
    assert.ok(html7.includes(URLS.checkOut));
    pass('unit: 6PM / 7PM check-out HTML templates');
  } catch (e) {
    fail('unit: 6PM / 7PM check-out HTML templates', e);
  }

  try {
    assert.strictEqual(REMINDER_TYPES.CHECKIN_10AM, 'checkin-10am');
    assert.strictEqual(REMINDER_TYPES.CHECKOUT_6PM, 'checkout-6pm');
    assert.strictEqual(REMINDER_TYPES.CHECKOUT_7PM, 'checkout-7pm');
    pass('unit: reminder type constants');
  } catch (e) {
    fail('unit: reminder type constants', e);
  }

  // Recipient selection logic (pure)
  try {
    const employees = [
      { _id: '1', email: 'a@x.com', position: 'Developer' },
      { _id: '2', email: 'b@x.com', position: 'Director' },
      { _id: '3', email: 'c@x.com', position: 'QA' },
    ].filter((u) => !isDirectorUser(u));

    const checkedIn = new Set(['1']);
    const checkedOut = new Set();

    const amRecipients = employees.filter((u) => !checkedIn.has(String(u._id)));
    assert.deepStrictEqual(
      amRecipients.map((u) => u._id),
      ['3']
    );

    const pmRecipients = employees.filter((u) => {
      const id = String(u._id);
      return checkedIn.has(id) && !checkedOut.has(id);
    });
    assert.deepStrictEqual(
      pmRecipients.map((u) => u._id),
      ['1']
    );

    // Case: checked in before 10 AM => not in AM list
    assert.ok(!amRecipients.find((u) => u._id === '1'));
    // Director never included
    assert.ok(!employees.find((u) => u._id === '2'));
    pass('unit: recipient selection (AM/PM + director skip)');
  } catch (e) {
    fail('unit: recipient selection (AM/PM + director skip)', e);
  }

  // Duplicate protection contract
  try {
    const cron = require('node-cron');
    assert.strictEqual(typeof cron.schedule, 'function');
    assert.ok(cron.validate('0 10 * * *'));
    assert.ok(cron.validate('0 18 * * *'));
    assert.ok(cron.validate('0 19 * * *'));
    pass('unit: node-cron schedules valid');
  } catch (e) {
    fail('unit: node-cron schedules valid', e);
  }

  // Leave email architecture untouched (module still loads)
  try {
    const transporter = require('../config/emailConfig');
    assert.ok(transporter);
    assert.strictEqual(typeof transporter.sendMail, 'function');
    const leaveController = require('../controllers/leaveController');
    assert.strictEqual(typeof leaveController.applyLeave, 'function');
    pass('unit: existing emailConfig + leaveController intact');
  } catch (e) {
    fail('unit: existing emailConfig + leaveController intact', e);
  }
}

async function runDbIfPossible() {
  if (!process.env.MONGO_URI) {
    console.log('SKIP  live DB reminder tests (no MONGO_URI)');
    return;
  }

  const mongoose = require('mongoose');
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  } catch (e) {
    console.log(`SKIP  live DB reminder tests (Mongo unreachable: ${e.message})`);
    return;
  }

  const AttendanceReminderLog = require('../models/AttendanceReminderLog');
  const { claimReminderSlot, alreadySent } = require('../services/attendanceReminderService');
  const stamp = Date.now();
  const fakeUserId = new mongoose.Types.ObjectId();
  const dateKey = getIstDateKey();
  const reminderType = REMINDER_TYPES.CHECKIN_10AM;

  try {
    const first = await claimReminderSlot({
      userId: fakeUserId,
      email: `reminder.test.${stamp}@example.com`,
      reminderType,
      dateKey,
    });
    assert.strictEqual(first, true);
    assert.strictEqual(await alreadySent(fakeUserId, reminderType, dateKey), true);

    const second = await claimReminderSlot({
      userId: fakeUserId,
      email: `reminder.test.${stamp}@example.com`,
      reminderType,
      dateKey,
    });
    assert.strictEqual(second, false);
    pass('live: duplicate reminder slot blocked (restart-safe)');
  } catch (e) {
    fail('live: duplicate reminder slot blocked (restart-safe)', e);
  } finally {
    await AttendanceReminderLog.deleteMany({ user: fakeUserId });
    await mongoose.disconnect().catch(() => {});
  }
}

async function main() {
  runUnit();
  await runDbIfPossible();

  const failed = results.filter((r) => !r.ok);
  console.log('\n--- Summary ---');
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  if (failed.length) failed.forEach((f) => console.log(`  - ${f.name}: ${f.err}`));
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
