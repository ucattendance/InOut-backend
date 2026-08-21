require('dotenv').config({ override: true });
const { getJoiningWebhookUrl } = require('../services/birthdayWishService');

const url = getJoiningWebhookUrl();
const match = String(url).match(/[?&]token=([^&]*)/);
const token = match && match[1] ? match[1] : '';
console.log('token_len=' + token.length);
if (token.length < 40) {
  console.log('BAD: joining webhook token missing/cut. Set JOINING_CHAT_WEBHOOK_URL in .env.');
  process.exit(1);
}
console.log('OK: joining webhook token length looks complete.');
