/**
 * Preview who would get attendance reminder emails (no send).
 * Run: node scripts/previewAttendanceReminders.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const {
  runCheckInReminder,
  runCheckout6pmReminder,
  runCheckout8pmReminder,
} = require('../services/attendanceReminderService');

const printReport = (label, report) => {
  const results = report.results || [];
  console.log(`\n=== ${label} ===`);
  console.log(`date: ${report.dateKey}`);
  console.log(`would send: ${report.candidateCount}`);
  results.forEach((row, i) => {
    console.log(`  ${i + 1}. ${row.email} (${row.status})`);
  });
};

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI missing');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 12000 });

  const checkIn = await runCheckInReminder({ dryRun: true });
  const checkout6 = await runCheckout6pmReminder({ dryRun: true });
  const checkout8 = await runCheckout8pmReminder({ dryRun: true });

  printReport('10:00 AM Check-In reminder (not checked in today)', checkIn);
  printReport('6:00 PM Check-Out reminder (checked in, no check-out)', checkout6);
  printReport('8:00 PM Final Check-Out reminder', checkout8);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
