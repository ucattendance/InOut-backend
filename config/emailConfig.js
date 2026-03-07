// config/emailConfig.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', // or your preferred SMTP service
  auth: {
    user: process.env.NOTIFY_EMAIL,
    pass: process.env.NOTIFY_PASSWORD,
  },
});

module.exports = transporter;
