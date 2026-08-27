require('dotenv').config({ override: true });
const { getNewUserWebhookUrl } = require('../services/birthdayWishService');

const url = getNewUserWebhookUrl();
const match = String(url).match(/[?&]token=([^&]*)/);
const token = match && match[1] ? match[1] : '';
console.log('token_len=' + token.length);
if (token.length < 40) {
  console.log('BAD: new-user webhook token missing/cut. Set NEW_USER_CHAT_WEBHOOK_URL in .env.');
  process.exit(1);
}
console.log('OK: new-user webhook token length looks complete.');
