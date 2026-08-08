const FRONTEND_BASE = 'https://inout.urbancode.tech';

const URLS = {
  checkIn: `${FRONTEND_BASE}/attendance?action=checkin`,
  checkOut: `${FRONTEND_BASE}/attendance?action=checkout`,
  applyLeave: `${FRONTEND_BASE}/apply-leave`,
};

const brandHeader = `
  <tr>
    <td style="background-color:#0b2d67;padding:20px 24px;border-radius:12px 12px 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-family:Segoe UI,Arial,sans-serif;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.3px;">
            Urbancode
          </td>
          <td align="right" style="font-family:Segoe UI,Arial,sans-serif;color:#c7d7f5;font-size:12px;">
            InOut Attendance
          </td>
        </tr>
      </table>
    </td>
  </tr>
`;

const footer = `
  <tr>
    <td style="padding:20px 24px 8px 24px;border-top:1px solid #e5e7eb;">
      <p style="margin:0 0 8px 0;font-family:Segoe UI,Arial,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;text-align:center;">
        This is an automated email from<br/>
        <strong style="color:#374151;">Urbancode InOut Attendance System</strong><br/>
        Please do not reply to this email.
      </p>
      <p style="margin:0;font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#9ca3af;text-align:center;">
        &copy; Urbancode
      </p>
    </td>
  </tr>
`;

const wrapEmail = (title, bodyHtml) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
          ${brandHeader}
          <tr>
            <td style="padding:28px 24px 8px 24px;font-family:Segoe UI,Arial,sans-serif;color:#111827;">
              ${bodyHtml}
            </td>
          </tr>
          ${footer}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const primaryButton = (label, href) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px 0;">
    <tr>
      <td align="center" bgcolor="#0b2d67" style="border-radius:8px;">
        <a href="${href}" target="_blank"
           style="display:inline-block;padding:12px 22px;font-family:Segoe UI,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>
`;

const secondaryButton = (label, href) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">
    <tr>
      <td align="center" bgcolor="#eef2ff" style="border-radius:8px;border:1px solid #c7d2fe;">
        <a href="${href}" target="_blank"
           style="display:inline-block;padding:11px 20px;font-family:Segoe UI,Arial,sans-serif;font-size:14px;font-weight:600;color:#0b2d67;text-decoration:none;border-radius:8px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>
`;

const buildCheckInReminderHtml = (employeeName) =>
  wrapEmail(
    'Reminder: Please Complete Your Check-In',
    `
      <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:#0b2d67;">
        Reminder: Please Complete Your Check-In
      </h1>
      <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">
        Dear ${employeeName || 'Team Member'},
      </p>
      <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">
        Our records indicate that you have not completed your Check-In for today.
      </p>
      <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#374151;">
        Please complete your Check-In at your earliest convenience.
      </p>
      ${primaryButton('Check In Now', URLS.checkIn)}
      <p style="margin:18px 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">
        If you are on leave or unable to attend work today, you can submit a leave request.
      </p>
      ${secondaryButton('Apply Leave', URLS.applyLeave)}
      <p style="margin:22px 0 0 0;font-size:15px;line-height:1.6;color:#374151;">
        Regards,<br/>
        <strong>HR Team</strong><br/>
        Urbancode
      </p>
    `
  );

const buildCheckoutReminderHtml = (employeeName, { finalReminder = false } = {}) => {
  const title = finalReminder
    ? 'Final Reminder: Pending Check-Out'
    : 'Reminder: Please Complete Your Check-Out';
  const intro = finalReminder
    ? 'Our records indicate that your Check-Out has not yet been completed today.'
    : 'Our records indicate that your Check-Out for today is still pending.';
  const ask = finalReminder
    ? 'Please complete your Check-Out as soon as possible.'
    : 'Please complete your Check-Out before leaving for the day.';

  return wrapEmail(
    title,
    `
      <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:#0b2d67;">
        ${title}
      </h1>
      <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">
        Dear ${employeeName || 'Team Member'},
      </p>
      <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">
        ${intro}
      </p>
      <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#374151;">
        ${ask}
      </p>
      ${primaryButton('Complete Check-Out', URLS.checkOut)}
      <p style="margin:22px 0 0 0;font-size:15px;line-height:1.6;color:#374151;">
        Regards,<br/>
        <strong>HR Team</strong><br/>
        Urbancode
      </p>
    `
  );
};

const buildMeetingCallReminderHtml = (
  employeeName,
  { title, whenLabel, callName, detail }
) =>
  wrapEmail(
    title,
    `
      <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:#0b2d67;">
        ${title}
      </h1>
      <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">
        Dear ${employeeName || 'Team Member'},
      </p>
      <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#374151;">
        This is a reminder that the <strong>${callName}</strong> is scheduled for
        <strong>${whenLabel}</strong> today.
      </p>
      <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#374151;">
        ${detail}
      </p>
      <p style="margin:22px 0 0 0;font-size:15px;line-height:1.6;color:#374151;">
        Regards,<br/>
        <strong>HR Team</strong><br/>
        Urbancode
      </p>
    `
  );

const buildItStatusCallReminderHtml = (employeeName) =>
  buildMeetingCallReminderHtml(employeeName, {
    title: 'Reminder: IT Status Call at 12:00 PM',
    whenLabel: '12:00 PM IST',
    callName: 'IT Status Call',
    detail: 'Please join the IT Status Call on time and be ready with your updates.',
  });

const buildConsultancyCallReminderHtml = (employeeName) =>
  buildMeetingCallReminderHtml(employeeName, {
    title: 'Reminder: Consultancy Call at 3:00 PM',
    whenLabel: '3:00 PM IST',
    callName: 'Consultancy Call',
    detail: 'Please join the Consultancy Call on time.',
  });

module.exports = {
  FRONTEND_BASE,
  URLS,
  buildCheckInReminderHtml,
  buildCheckoutReminderHtml,
  buildItStatusCallReminderHtml,
  buildConsultancyCallReminderHtml,
};
