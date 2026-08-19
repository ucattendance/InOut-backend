/**
 * Birthday chat-wish tests / manual trigger.
 *
 * Unit only (no DB/webhook):
 *   node scripts/testBirthdayWishes.js
 *
 * Dry-run against DB (no chat post):
 *   node scripts/testBirthdayWishes.js --dry-run
 *
 * Send for real (today's birthdays):
 *   node scripts/testBirthdayWishes.js --send
 *
 * Force re-send even if already logged:
 *   node scripts/testBirthdayWishes.js --send --force
 */
require('dotenv').config({ override: true });
const assert = require('assert');
const cron = require('node-cron');
const {
  getDobMonthDay,
  isLeapYear,
  isBirthdayToday,
  getIstYearMonthDay,
} = require('../services/birthdayWishService');
const {
  DEFAULT_WISH_TEXT,
  buildBirthdayWishText,
  unescapeEnvText,
} = require('../utils/birthdayWishMessage');

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
    assert.deepStrictEqual(getDobMonthDay(new Date('1990-05-05T00:00:00.000Z')), {
      month: 5,
      day: 5,
    });
    assert.deepStrictEqual(getDobMonthDay(new Date('1990-05-04T18:30:00.000Z')), {
      month: 5,
      day: 5,
    });
    pass('unit: DOB month/day from UTC midnight and IST midnight');
  } catch (e) {
    fail('unit: DOB month/day from UTC midnight and IST midnight', e);
  }

  try {
    const now = new Date('2026-08-19T03:30:00.000Z'); // 09:00 IST Aug 19
    assert.strictEqual(isBirthdayToday(new Date('1998-08-19T00:00:00.000Z'), now), true);
    assert.strictEqual(isBirthdayToday(new Date('1998-08-18T00:00:00.000Z'), now), false);
    pass('unit: birthday match uses month/day only (ignores year)');
  } catch (e) {
    fail('unit: birthday match uses month/day only (ignores year)', e);
  }

  try {
    assert.strictEqual(isLeapYear(2024), true);
    assert.strictEqual(isLeapYear(2026), false);
    const feb28_2026 = new Date('2026-02-27T18:30:00.000Z'); // Feb 28 00:00 IST
    assert.strictEqual(isBirthdayToday(new Date('2000-02-29T00:00:00.000Z'), feb28_2026), true);
    const feb28_2024 = new Date('2024-02-27T18:30:00.000Z');
    assert.strictEqual(isBirthdayToday(new Date('2000-02-29T00:00:00.000Z'), feb28_2024), false);
    pass('unit: Feb 29 observed on Feb 28 in non-leap years');
  } catch (e) {
    fail('unit: Feb 29 observed on Feb 28 in non-leap years', e);
  }

  try {
    const today = getIstYearMonthDay(new Date('2026-08-19T03:30:00.000Z'));
    assert.strictEqual(today.year, 2026);
    assert.strictEqual(today.month, 8);
    assert.strictEqual(today.day, 19);
    pass('unit: IST year/month/day');
  } catch (e) {
    fail('unit: IST year/month/day', e);
  }

  try {
    const text = buildBirthdayWishText(
      { name: 'Ram Kumar', position: 'Developer', company: 'Urbancode', employeeId: 'UC0001' },
      DEFAULT_WISH_TEXT
    );
    assert.ok(text.includes('Dear Ram Kumar,'));
    assert.ok(text.includes('Wishing you a very Happy Birthday!'));
    assert.ok(text.includes('Team Urbancode Edutech'));
    assert.ok(text.includes('Together We Always Learn to Grow'));
    assert.ok(!text.includes('{name}'));
    pass('unit: default wish replaces {name}');
  } catch (e) {
    fail('unit: default wish replaces {name}', e);
  }

  try {
    const custom = unescapeEnvText('Happy Birthday {firstName}!\\nFrom {company}');
    const text = buildBirthdayWishText(
      { name: 'Priya Sharma', company: 'Urbancode' },
      custom
    );
    assert.strictEqual(text, 'Happy Birthday Priya!\nFrom Urbancode');
    pass('unit: custom env template with {firstName} and newlines');
  } catch (e) {
    fail('unit: custom env template with {firstName} and newlines', e);
  }

  try {
    assert.ok(cron.validate('0 9 * * *'));
    pass('unit: 09:00 IST cron expression valid');
  } catch (e) {
    fail('unit: 09:00 IST cron expression valid', e);
  }

  try {
    const { getWebhookUrl } = require('../services/birthdayWishService');
    const prev = process.env.BIRTHDAY_CHAT_WEBHOOK_URL;
    process.env.BIRTHDAY_CHAT_WEBHOOK_URL =
      ' https://chat.googleapis.com/v1/spaces/AAA/messages?key=KEY&\n token=ABCDEFGHIJKLMNOPQRST ';
    assert.strictEqual(
      getWebhookUrl(),
      'https://chat.googleapis.com/v1/spaces/AAA/messages?key=KEY&token=ABCDEFGHIJKLMNOPQRST'
    );
    if (prev == null) delete process.env.BIRTHDAY_CHAT_WEBHOOK_URL;
    else process.env.BIRTHDAY_CHAT_WEBHOOK_URL = prev;
    pass('unit: webhook URL strips whitespace/newlines');
  } catch (e) {
    fail('unit: webhook URL strips whitespace/newlines', e);
  }
}

async function runDb() {
  if (!process.env.MONGO_URI) {
    console.error('Missing MONGO_URI');
    process.exit(1);
  }
  const mongoose = require('mongoose');
  const { runBirthdayWishes } = require('../services/birthdayWishService');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');

  const report = await runBirthdayWishes({
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
