/**
 * Verify SMTP connectivity (SendGrid / custom / Gmail).
 * Usage:
 *   node scripts/verifySmtp.js
 *   node scripts/verifySmtp.js --send you@example.com
 */
require('dotenv').config();
const transporter = require('../config/emailConfig');
const {
  getEmailProviderInfo,
  getSenderFromAddress,
  isEmailConfigured,
  assertEmailConfigured,
} = require('../config/emailConfig');

const args = process.argv.slice(2);
const sendIdx = args.indexOf('--send');
const sendTo = sendIdx >= 0 ? args[sendIdx + 1] : null;

async function main() {
  const info = getEmailProviderInfo();
  console.log('Provider:', info.provider);
  console.log('Host:', info.host);
  console.log('Port:', info.port, 'secure:', info.secure);
  console.log('Configured:', isEmailConfigured());

  assertEmailConfigured();

  console.log('\nVerifying SMTP connection…');
  const start = Date.now();
  await transporter.verify();
  console.log(`OK — verify passed in ${Date.now() - start}ms`);

  if (sendTo) {
    const from = getSenderFromAddress();
    console.log(`\nSending test mail to ${sendTo} from ${from}…`);
    const result = await transporter.sendMail({
      from,
      to: sendTo,
      subject: 'InOut SMTP test',
      text: `SMTP test OK via ${info.provider} (${info.host}:${info.port}) at ${new Date().toISOString()}`,
    });
    console.log('Sent. messageId:', result.messageId || '(none)');
  } else {
    console.log('\nTip: node scripts/verifySmtp.js --send you@example.com');
  }
}

main().catch((err) => {
  console.error('\nFAIL:', err.message);
  process.exit(1);
});
