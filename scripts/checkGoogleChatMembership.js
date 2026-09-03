require('dotenv').config({ override: true });
const {
  membershipEnabled,
  autoInviteEnabled,
  hasMembershipCredentials,
  getWelcomeSpaceId,
} = require('../services/googleChatMembershipService');
const { getNewUserWebhookUrl } = require('../services/birthdayWishService');

const spaceName = String(process.env.GOOGLE_CHAT_WELCOME_SPACE_NAME || 'UC_JZ_Team').trim();
const spaceId = getWelcomeSpaceId();
const webhook = getNewUserWebhookUrl();

console.log(`Join check enabled: ${membershipEnabled()}`);
console.log(`Auto invite from InOut: ${autoInviteEnabled()}`);
console.log(`Credentials configured: ${hasMembershipCredentials()}`);
console.log(`Welcome space name: ${spaceName}`);
console.log(`Welcome space id: ${spaceId || '(missing)'}`);
console.log(`Welcome webhook set: ${webhook ? 'yes' : 'no'}`);

if (!membershipEnabled()) {
  console.log('INFO: GOOGLE_CHAT_JOIN_CHECK_ENABLED=false — join wait is off.');
  process.exit(0);
}

if (!hasMembershipCredentials()) {
  console.log('WARN: Set GOOGLE_CHAT_SERVICE_ACCOUNT_PATH and GOOGLE_CHAT_ADMIN_EMAIL.');
  console.log('      Welcome will NOT post until join-check credentials are configured.');
  process.exit(1);
}

if (!spaceId) {
  console.log('WARN: Set GOOGLE_CHAT_WELCOME_SPACE_ID or NEW_USER_CHAT_WEBHOOK_URL.');
  process.exit(1);
}

if (!webhook) {
  console.log('WARN: NEW_USER_CHAT_WEBHOOK_URL is missing — welcome message cannot post.');
  process.exit(1);
}

console.log('OK: Team invites manually; welcome posts after user joins UC_JZ_Team.');
