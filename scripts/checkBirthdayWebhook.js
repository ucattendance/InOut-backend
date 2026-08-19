require('dotenv').config({ override: true });
const { getWebhookUrl } = require('../services/birthdayWishService');

const url = getWebhookUrl();
const match = String(url).match(/[?&]token=([^&]*)/);
const token = match && match[1] ? match[1] : '';
console.log('token_len=' + token.length);
if (token.length < 40) {
  console.log('BAD: token is missing or cut. Put the full webhook URL in .env on one line, inside quotes.');
  process.exit(1);
}
console.log('OK: token length looks complete.');
