// config/emailConfig.js
const nodemailer = require('nodemailer');

/**
 * Build SMTP options.
 * Priority:
 * 1) SENDGRID_API_KEY → smtp.sendgrid.net (recommended on Linode; Gmail often times out)
 * 2) SMTP_HOST (+ SMTP_USER / SMTP_PASS) → any relay (Mailgun, SES SMTP, Hostinger, …)
 * 3) Gmail via NOTIFY_EMAIL / NOTIFY_PASSWORD (force IPv4 — Linode IPv6→Gmail timeouts are common)
 */
const buildTransportOptions = () => {
  const sendgridKey = String(process.env.SENDGRID_API_KEY || '').trim();
  if (sendgridKey) {
    const port = Number(process.env.SMTP_PORT) || 587;
    return {
      provider: 'sendgrid',
      host: 'smtp.sendgrid.net',
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      requireTLS: port === 587,
      pool: true,
      maxConnections: 3,
      connectionTimeout: 45000,
      greetingTimeout: 20000,
      socketTimeout: 45000,
      auth: {
        user: 'apikey',
        pass: sendgridKey,
      },
    };
  }

  const customHost = String(process.env.SMTP_HOST || '').trim();
  if (customHost) {
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = String(process.env.SMTP_USER || process.env.NOTIFY_EMAIL || '').trim();
    const pass = String(process.env.SMTP_PASS || process.env.NOTIFY_PASSWORD || '').trim();
    return {
      provider: 'custom',
      host: customHost,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      requireTLS: port === 587,
      pool: true,
      maxConnections: 3,
      connectionTimeout: 45000,
      greetingTimeout: 20000,
      socketTimeout: 45000,
      auth: user && pass ? { user, pass } : undefined,
    };
  }

  // Default: Gmail. family:4 avoids IPv6 connect stalls from many VPS hosts.
  const port = Number(process.env.SMTP_PORT) || 465;
  return {
    provider: 'gmail',
    host: 'smtp.gmail.com',
    port,
    secure: process.env.SMTP_SECURE !== 'false',
    // Prefer IPv4 — Linode → Gmail over IPv6 often hangs until "Connection timeout"
    family: 4,
    pool: true,
    maxConnections: 3,
    connectionTimeout: 45000,
    greetingTimeout: 20000,
    socketTimeout: 45000,
    auth: {
      user: process.env.NOTIFY_EMAIL,
      pass: process.env.NOTIFY_PASSWORD,
    },
  };
};

const transportOptions = buildTransportOptions();
const { provider: emailProvider, ...nodemailerOptions } = transportOptions;

const transporter = nodemailer.createTransport(nodemailerOptions);

/** From header: "Name <email>" using SENDER_* with NOTIFY_EMAIL fallback. */
const getSenderFromAddress = () => {
  const email = String(
    process.env.SENDER_EMAIL || process.env.NOTIFY_EMAIL || ''
  ).trim();
  if (!email) {
    throw new Error('SENDER_EMAIL / NOTIFY_EMAIL is not configured');
  }
  const name = String(process.env.SENDER_NAME || 'InOut Portal').trim() || 'InOut Portal';
  return `${name} <${email}>`;
};

const isEmailConfigured = () => {
  if (String(process.env.SENDGRID_API_KEY || '').trim()) return true;
  if (String(process.env.SMTP_HOST || '').trim()) {
    const user = String(process.env.SMTP_USER || process.env.NOTIFY_EMAIL || '').trim();
    const pass = String(process.env.SMTP_PASS || process.env.NOTIFY_PASSWORD || '').trim();
    return Boolean(user && pass);
  }
  return Boolean(
    String(process.env.NOTIFY_EMAIL || '').trim() &&
      String(process.env.NOTIFY_PASSWORD || '').trim()
  );
};

const assertEmailConfigured = () => {
  if (!isEmailConfigured()) {
    throw new Error(
      'Email not configured. Set SENDGRID_API_KEY, or SMTP_HOST+SMTP_USER+SMTP_PASS, or NOTIFY_EMAIL+NOTIFY_PASSWORD'
    );
  }
};

const getEmailProviderInfo = () => ({
  provider: emailProvider,
  host: nodemailerOptions.host,
  port: nodemailerOptions.port,
  secure: Boolean(nodemailerOptions.secure),
});

// Default export stays the nodemailer transporter (sendMail / verify).
// Attach helpers as own properties — do NOT set .transporter = itself (circular).
transporter.getSenderFromAddress = getSenderFromAddress;
transporter.isEmailConfigured = isEmailConfigured;
transporter.assertEmailConfigured = assertEmailConfigured;
transporter.getEmailProviderInfo = getEmailProviderInfo;
transporter.buildTransportOptions = buildTransportOptions;

module.exports = transporter;
