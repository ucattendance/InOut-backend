// config/emailConfig.js
const nodemailer = require('nodemailer');

// Port 465 (SSL) — Linode often times out on Gmail 587/STARTTLS.
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE !== 'false',
  pool: true,
  maxConnections: 3,
  connectionTimeout: 45000,
  greetingTimeout: 20000,
  socketTimeout: 45000,
  auth: {
    user: process.env.NOTIFY_EMAIL,
    pass: process.env.NOTIFY_PASSWORD,
  },
});

module.exports = transporter;
