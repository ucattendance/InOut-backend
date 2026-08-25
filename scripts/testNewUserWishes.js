/**
 * New-employee chat-wish tests / manual trigger.
 *
 * Unit only:
 *   node scripts/testNewUserWishes.js
 *
 * Preview text for a sample name (no chat post):
 *   node scripts/testNewUserWishes.js --preview
 *
 * Send a one-off preview to the webhook (does not touch existing users):
 *   node scripts/testNewUserWishes.js --send-preview
 */
require('dotenv').config({ override: true });
const assert = require('assert');
const {
  DEFAULT_WISH_TEXT,
  buildNewUserWishText,
} = require('../utils/newUserWishMessage');
const { unescapeEnvText } = require('../utils/birthdayWishMessage');
const { isSystemAdminUser } = require('../services/newUserWishService');

const args = process.argv.slice(2);
const wantPreview = args.includes('--preview');
const wantSendPreview = args.includes('--send-preview');

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
    const text = buildNewUserWishText(
      { name: 'Ram Kumar', position: 'Developer', company: 'Urbancode', employeeId: 'UC0001' },
      DEFAULT_WISH_TEXT
    );
    assert.ok(text.includes('Welcome to Urbancode Edutech Solutions Pvt. Ltd.!'));
    assert.ok(text.includes('Urbancode family'));
    assert.ok(text.includes('Team Urbancode Edutech Solutions Pvt. Ltd.'));
    assert.ok(!text.includes('{name}'));
    assert.ok(!text.includes('{position}'));
    pass('unit: default new-user welcome copy');
  } catch (e) {
    fail('unit: default new-user welcome copy', e);
  }

  try {
    const custom = unescapeEnvText('Welcome {firstName}!\\nFrom {company}');
    const text = buildNewUserWishText({ name: 'Priya Sharma', company: 'Urbancode' }, custom);
    assert.strictEqual(text, 'Welcome Priya!\nFrom Urbancode');
    pass('unit: custom env template with {firstName} and newlines');
  } catch (e) {
    fail('unit: custom env template with {firstName} and newlines', e);
  }

  try {
    assert.strictEqual(isSystemAdminUser({ name: 'Admin', role: 'employee' }), true);
    assert.strictEqual(isSystemAdminUser({ name: 'Ram', role: 'admin' }), true);
    assert.strictEqual(isSystemAdminUser({ name: 'Ram', role: 'employee' }), false);
    pass('unit: system admin users are skipped');
  } catch (e) {
    fail('unit: system admin users are skipped', e);
  }
}

async function sendPreview() {
  const { getNewUserWebhookUrl, postChatWebhook } = require('../services/birthdayWishService');
  const sample = {
    name: 'Ram Kumar',
    position: 'Developer',
    company: 'Urbancode',
    employeeId: 'UC0001',
  };
  const text = buildNewUserWishText(sample);
  console.log('--- preview text ---');
  console.log(text);
  console.log('--------------------');

  if (!wantSendPreview) return;

  const url = getNewUserWebhookUrl();
  if (!url) {
    console.error('NEW_USER_CHAT_WEBHOOK_URL is not set');
    process.exit(1);
  }
  await postChatWebhook(text, url);
  console.log('Preview posted to Google Chat.');
}

(async () => {
  runUnit();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUnit: ${results.length - failed}/${results.length} passed`);

  if (wantPreview || wantSendPreview) {
    await sendPreview();
  }

  if (failed > 0) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
