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
const {
  extractSpaceIdFromWebhookUrl,
  isMembershipJoined,
  normalizeMembershipState,
} = require('../services/googleChatMembershipService');

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
    const user = {
      name: 'Vishnu Potter',
      email: 'vishnu@urbancode.in',
      position: 'Developer',
      company: 'Urbancode',
      employeeId: 'UC0001',
    };
    const text = buildNewUserWishText(user, DEFAULT_WISH_TEXT);
    assert.ok(text.includes('Welcome to Urbancode Edutech Solutions Pvt. Ltd.!'));
    assert.ok(text.includes('Vishnu Potter'));
    assert.ok(!text.includes('<users/'));
    assert.ok(!text.includes('vishnu@urbancode.in'));
    assert.ok(text.includes('Urbancode family'));
    assert.ok(text.includes('Team Urbancode Edutech Solutions Pvt. Ltd.'));
    assert.ok(!text.includes('{name}'));
    pass('unit: default welcome copy uses InOut user name');
  } catch (e) {
    fail('unit: default welcome copy uses InOut user name', e);
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

  try {
    const url =
      'https://chat.googleapis.com/v1/spaces/AAAA8WZ8dFM/messages?key=KEY&token=TOKEN';
    assert.strictEqual(extractSpaceIdFromWebhookUrl(url), 'AAAA8WZ8dFM');
    pass('unit: extract Chat space id from webhook URL');
  } catch (e) {
    fail('unit: extract Chat space id from webhook URL', e);
  }

  try {
    assert.strictEqual(normalizeMembershipState('joined'), 'JOINED');
    assert.strictEqual(isMembershipJoined('INVITED'), false);
    assert.strictEqual(isMembershipJoined('JOINED'), true);
    pass('unit: membership state helpers');
  } catch (e) {
    fail('unit: membership state helpers', e);
  }
}

async function sendPreview() {
  const { getNewUserWebhookUrl, postChatWebhook } = require('../services/birthdayWishService');
  const sample = {
    name: 'Ram Kumar',
    email: 'ram.kumar@urbancode.in',
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
