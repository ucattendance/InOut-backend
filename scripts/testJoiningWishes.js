/**
 * Work-anniversary (dateOfJoining) chat-wish tests / manual trigger.
 *
 * Unit only:
 *   node scripts/testJoiningWishes.js
 *
 * Dry-run against DB (no chat post):
 *   node scripts/testJoiningWishes.js --dry-run
 *
 * Send for real (today's anniversaries):
 *   node scripts/testJoiningWishes.js --send
 *
 * Force re-send:
 *   node scripts/testJoiningWishes.js --send --force
 */
require('dotenv').config({ override: true });
const assert = require('assert');
const cron = require('node-cron');
const {
  getYearsOfServiceToday,
  isJoiningAnniversaryToday,
} = require('../services/joiningWishService');
const {
  DEFAULT_WISH_TEXT,
  buildJoiningWishText,
} = require('../utils/joiningWishMessage');

const args = process.argv.slice(2);
const wantDryRun = args.includes('--dry-run');
const wantSend = args.includes('--send');
const wantForce = args.includes('--force');

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
    const now = new Date('2026-08-21T03:30:00.000Z'); // 09:00 IST Aug 21
    assert.strictEqual(getYearsOfServiceToday(new Date('2024-08-21T00:00:00.000Z'), now), 2);
    assert.strictEqual(isJoiningAnniversaryToday(new Date('2024-08-21T00:00:00.000Z'), now), true);
    assert.strictEqual(isJoiningAnniversaryToday(new Date('2026-08-21T00:00:00.000Z'), now), false);
    assert.strictEqual(isJoiningAnniversaryToday(new Date('2024-08-20T00:00:00.000Z'), now), false);
    pass('unit: anniversary needs full year(s); same-year join skipped');
  } catch (e) {
    fail('unit: anniversary needs full year(s); same-year join skipped', e);
  }

  try {
    const feb28 = new Date('2026-02-27T18:30:00.000Z'); // Feb 28 00:00 IST
    assert.strictEqual(getYearsOfServiceToday(new Date('2024-02-29T00:00:00.000Z'), feb28), 2);
    pass('unit: Feb 29 joining observed on Feb 28 in non-leap years');
  } catch (e) {
    fail('unit: Feb 29 joining observed on Feb 28 in non-leap years', e);
  }

  try {
    const text = buildJoiningWishText(
      { name: 'Ram Kumar', position: 'Developer', company: 'Urbancode' },
      3,
      DEFAULT_WISH_TEXT
    );
    assert.ok(text.includes('Dear Ram Kumar,'));
    assert.ok(text.includes('completing 3 year(s)'));
    assert.ok(text.includes('Team Urbancode Edutech'));
    assert.ok(!text.includes('{name}'));
    assert.ok(!text.includes('{years}'));
    pass('unit: default joining wish replaces {name} and {years}');
  } catch (e) {
    fail('unit: default joining wish replaces {name} and {years}', e);
  }

  try {
    assert.ok(cron.validate('5 9 * * *'));
    pass('unit: 09:05 IST cron expression valid');
  } catch (e) {
    fail('unit: 09:05 IST cron expression valid', e);
  }
}

async function runDb() {
  if (!process.env.MONGO_URI) {
    console.error('Missing MONGO_URI');
    process.exit(1);
  }
  const mongoose = require('mongoose');
  const { runJoiningWishes } = require('../services/joiningWishService');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');

  const report = await runJoiningWishes({
    dryRun: wantDryRun || !wantSend,
    force: wantForce,
  });

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

(async () => {
  runUnit();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUnit: ${results.length - failed}/${results.length} passed`);

  if (wantDryRun || wantSend) {
    await runDb();
  }

  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
