/**
 * Verify Google Chat service account + domain-wide delegation.
 * Run after placing JSON at GOOGLE_CHAT_SERVICE_ACCOUNT_PATH.
 *
 *   node scripts/verifyGoogleChatServiceAccount.js
 *   node scripts/verifyGoogleChatServiceAccount.js user@urbancode.in
 */
require('dotenv').config({ override: true });
const {
  hasMembershipCredentials,
  getWelcomeSpaceId,
  getMemberMembership,
} = require('../services/googleChatMembershipService');

const adminEmail = String(process.env.GOOGLE_CHAT_ADMIN_EMAIL || '').trim();
const testEmail = String(process.argv[2] || adminEmail).trim().toLowerCase();
const spaceId = getWelcomeSpaceId();

async function main() {
  console.log('--- Google Chat service account check ---');
  console.log(`Admin email: ${adminEmail || '(missing)'}`);
  console.log(`Space id: ${spaceId || '(missing)'}`);
  console.log(`Credentials file: ${hasMembershipCredentials() ? 'found' : 'missing'}`);

  if (!hasMembershipCredentials()) {
    console.error('\nFAIL: Set GOOGLE_CHAT_ADMIN_EMAIL and GOOGLE_CHAT_SERVICE_ACCOUNT_PATH.');
    process.exit(1);
  }

  if (!spaceId) {
    console.error('\nFAIL: Set NEW_USER_CHAT_WEBHOOK_URL or GOOGLE_CHAT_WELCOME_SPACE_ID.');
    process.exit(1);
  }

  try {
    const membership = await getMemberMembership(spaceId, testEmail);
    console.log(`\nTest lookup for: ${testEmail}`);
    console.log(`Result: ${membership.status}`);
    console.log(`State: ${membership.state || '(n/a)'}`);
    if (membership.joined) console.log('Joined: yes');

    if (membership.status === 'failed') {
      console.error(`Error: ${membership.error}`);
      console.error('\nCommon fixes:');
      console.error('1. Enable Google Chat API in Google Cloud');
      console.error('2. Domain-wide delegation for service account Client ID');
      console.error('3. Scope: https://www.googleapis.com/auth/chat.memberships');
      console.error('4. GOOGLE_CHAT_ADMIN_EMAIL must be a Workspace user in your domain');
      process.exit(1);
    }

    // found / not_found both mean API auth + memberships access works
    console.log('\nOK: Service account can read UC_JZ_Team membership.');
    console.log('Join-check + welcome flow is ready.');
    if (membership.status === 'not_found') {
      console.log('(User is not currently a member of the space — that is fine for this check.)');
    }
  } catch (err) {
    console.error('\nFAIL:', err.message);
    console.error('\nCommon fixes:');
    console.error('1. Enable Google Chat API in Google Cloud');
    console.error('2. Domain-wide delegation for service account Client ID');
    console.error('3. Scope: https://www.googleapis.com/auth/chat.memberships');
    console.error('4. GOOGLE_CHAT_ADMIN_EMAIL must be a Workspace user in your domain');
    process.exit(1);
  }
}

main();
