const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Schedule = require('../models/Schedule');
const Holiday = require('../models/Holiday');
const LeaveRequest = require('../models/LeaveRequest');
const Payslip = require('../models/Payslip');
const MonthlyReportLog = require('../models/MonthlyReportLog');
const transporter = require('../config/emailConfig');
const { buildMonthlyReportHtml } = require('../utils/monthlyReportEmails');
const {
  TIMEZONE,
  getSenderFromAddress,
  getEligibleEmployees,
} = require('./attendanceReminderService');

/** Previous calendar month in IST relative to `now`. */
const getPreviousMonthMeta = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === 'year').value);
  const month = Number(parts.find((p) => p.type === 'month').value); // 1-12
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const monthKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
  const monthStart = new Date(`${monthKey}-01T00:00:00+05:30`);
  const daysInMonth = new Date(prevYear, prevMonth, 0).getDate();
  const monthEnd = new Date(
    `${monthKey}-${String(daysInMonth).padStart(2, '0')}T23:59:59.999+05:30`
  );

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    month: 'long',
    year: 'numeric',
  }).format(monthStart);

  return {
    year: prevYear,
    month: prevMonth,
    monthKey,
    monthLabel,
    monthStart,
    monthEnd,
    daysInMonth,
  };
};

const formatTimeIst = (date) => {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
};

const formatDateLabel = (date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);

const toDateKeyIst = (date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const holidayDateKeys = (holidays) => {
  const set = new Set();
  for (const h of holidays) {
    if (!h?.date) continue;
    set.add(toDateKeyIst(new Date(h.date)));
  }
  return set;
};

const leaveCoversDate = (leaves, dateObj) => {
  const key = toDateKeyIst(dateObj);
  const dayStart = new Date(`${key}T00:00:00+05:30`);
  const dayEnd = new Date(`${key}T23:59:59.999+05:30`);
  return leaves.some((leave) => {
    const from = new Date(leave.fromDate);
    const to = new Date(leave.toDate);
    return from <= dayEnd && to >= dayStart;
  });
};

const DEFAULT_WEEKLY_SCHEDULE = {
  Monday: { start: '09:00', end: '18:00', isLeave: false },
  Tuesday: { start: '09:00', end: '18:00', isLeave: false },
  Wednesday: { start: '09:00', end: '18:00', isLeave: false },
  Thursday: { start: '09:00', end: '18:00', isLeave: false },
  Friday: { start: '09:00', end: '18:00', isLeave: false },
  Saturday: { start: '09:00', end: '18:00', isLeave: true },
  Sunday: { start: '09:00', end: '18:00', isLeave: true },
};

/**
 * Build per-day attendance for one employee for a given month.
 * Aligns with frontend PayslipGenerator rules (weekends / scheduled off / late / half-day).
 */
const buildEmployeeAttendance = ({
  logs,
  weeklySchedule,
  holidayKeys,
  approvedLeaves,
  monthMeta,
}) => {
  const { year, month, daysInMonth, monthLabel } = monthMeta;
  const schedule =
    weeklySchedule && Object.keys(weeklySchedule).length > 0
      ? weeklySchedule
      : DEFAULT_WEEKLY_SCHEDULE;
  const grouped = {};

  for (const log of logs) {
    const ts = new Date(log.timestamp);
    const key = toDateKeyIst(ts);
    if (!grouped[key]) grouped[key] = { checkIn: null, checkOut: null };
    if (log.type === 'check-in') {
      if (!grouped[key].checkIn || ts < new Date(grouped[key].checkIn.timestamp)) {
        grouped[key].checkIn = log;
      }
    }
    if (log.type === 'check-out') {
      if (!grouped[key].checkOut || ts > new Date(grouped[key].checkOut.timestamp)) {
        grouped[key].checkOut = log;
      }
    }
  }

  let workingDays = 0;
  let presentDays = 0;
  let leaveDays = 0;
  let lateDays = 0;
  let halfDays = 0;
  let offDays = 0;
  const days = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dateObj = new Date(`${dateKey}T12:00:00+05:30`);
    const dayName = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      weekday: 'long',
    }).format(dateObj);
    const scheduled = schedule?.[dayName];
    const isWeekend = dayName === 'Saturday' || dayName === 'Sunday';
    const isHoliday = holidayKeys.has(dateKey);
    const onLeave = leaveCoversDate(approvedLeaves, dateObj);
    const attendance = grouped[dateKey];

    let status = 'Off';
    let checkIn = '';
    let checkOut = '';

    if (!scheduled || scheduled.isLeave || isWeekend || isHoliday) {
      if (scheduled?.isLeave && !isWeekend && !isHoliday) {
        leaveDays++;
        status = 'Leave';
      } else if (onLeave) {
        leaveDays++;
        status = 'Leave';
      } else if (isHoliday) {
        offDays++;
        status = 'Holiday';
      } else {
        offDays++;
        status = isWeekend ? 'Weekend' : 'Weekly Off';
      }
    } else if (onLeave && !attendance?.checkIn) {
      leaveDays++;
      status = 'Leave';
    } else {
      workingDays++;
      if (attendance?.checkIn) {
        presentDays++;
        checkIn = formatTimeIst(new Date(attendance.checkIn.timestamp));
        checkOut = attendance.checkOut
          ? formatTimeIst(new Date(attendance.checkOut.timestamp))
          : '';
        status = 'Present';

        if (scheduled?.start) {
          const [h, m] = String(scheduled.start).split(':').map(Number);
          let eh = h || 0;
          let em = (m || 0) + 10;
          if (em >= 60) {
            eh += Math.floor(em / 60);
            em %= 60;
          }
          const expectedFixed = new Date(
            `${dateKey}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00+05:30`
          );
          const actual = new Date(attendance.checkIn.timestamp);
          const diffMinutes = (actual - expectedFixed) / 60000;
          if (diffMinutes >= 60) {
            halfDays++;
            status = 'Half Day';
          } else if (diffMinutes > 0) {
            lateDays++;
            status = 'Late';
          }
        }
      } else {
        status = 'Absent';
      }
    }

    days.push({
      dateKey,
      dateLabel: formatDateLabel(dateObj),
      dayName,
      status,
      checkIn,
      checkOut,
    });
  }

  return {
    monthLabel,
    summary: {
      totalDays: daysInMonth,
      workingDays,
      presentDays,
      absentDays: Math.max(0, workingDays - presentDays),
      leaveDays,
      lateDays,
      halfDays,
      offDays,
    },
    days,
  };
};

const findPayslipForMonth = async (userId, monthLabel, year) => {
  return Payslip.findOne({
    userId,
    month: monthLabel,
  })
    .sort({ createdAt: -1 })
    .lean();
};

const alreadySent = async (userId, monthKey) => {
  const existing = await MonthlyReportLog.findOne({
    user: userId,
    monthKey,
    status: 'sent',
  })
    .select('_id')
    .lean();
  return Boolean(existing);
};

const claimSlot = async ({ userId, email, monthKey, monthLabel, hasPayslip }) => {
  const existing = await MonthlyReportLog.findOne({ user: userId, monthKey });
  if (existing && existing.status === 'sent') return false;

  if (existing) {
    existing.email = email;
    existing.monthLabel = monthLabel;
    existing.hasPayslip = hasPayslip;
    existing.status = 'sent';
    existing.errorMessage = '';
    existing.sentAt = new Date();
    await existing.save();
    return true;
  }

  try {
    await MonthlyReportLog.create({
      user: userId,
      email,
      monthKey,
      monthLabel,
      hasPayslip,
      status: 'sent',
      sentAt: new Date(),
    });
    return true;
  } catch (err) {
    if (err && (err.code === 11000 || err.code === '11000')) return false;
    throw err;
  }
};

const markFailed = async ({ userId, monthKey, errorMessage }) => {
  await MonthlyReportLog.findOneAndUpdate(
    { user: userId, monthKey },
    {
      $set: {
        status: 'failed',
        errorMessage: String(errorMessage || '').slice(0, 500),
      },
    },
    { upsert: true }
  );
};

const sendMail = async ({ to, subject, html }) => {
  if (!process.env.NOTIFY_EMAIL || !process.env.NOTIFY_PASSWORD) {
    throw new Error('NOTIFY_EMAIL / NOTIFY_PASSWORD not configured');
  }
  return transporter.sendMail({
    from: getSenderFromAddress(),
    to,
    subject,
    html,
  });
};

/**
 * Send monthly attendance + payslip emails for previous IST month.
 * @param {{ now?: Date, dryRun?: boolean, force?: boolean, userId?: string }} opts
 */
const runMonthlyReports = async ({
  now = new Date(),
  dryRun = false,
  force = false,
  userId = null,
} = {}) => {
  const monthMeta = getPreviousMonthMeta(now);
  const { monthKey, monthLabel, monthStart, monthEnd } = monthMeta;

  let employees = await getEligibleEmployees();
  if (userId) {
    employees = employees.filter((u) => String(u._id) === String(userId));
  }

  const fullUsers = await User.find({
    _id: { $in: employees.map((e) => e._id) },
  })
    .select(
      '_id name email position works role isActive company department employeeId dateOfJoining bankDetails salary phone'
    )
    .lean();

  const userIds = fullUsers.map((u) => u._id);

  const [schedules, holidays, leaves, allLogs] = await Promise.all([
    Schedule.find({ user: { $in: userIds } }).lean(),
    Holiday.find({
      date: { $gte: monthStart, $lte: monthEnd },
    }).lean(),
    LeaveRequest.find({
      user: { $in: userIds },
      status: 'Approved',
      fromDate: { $lte: monthEnd },
      toDate: { $gte: monthStart },
    }).lean(),
    Attendance.find({
      user: { $in: userIds },
      timestamp: { $gte: monthStart, $lte: monthEnd },
      type: { $in: ['check-in', 'check-out'] },
    })
      .select('user type timestamp')
      .lean(),
  ]);

  const scheduleByUser = new Map(
    schedules.map((s) => [String(s.user), s.weeklySchedule || {}])
  );
  const holidayKeys = holidayDateKeys(holidays);
  const leavesByUser = new Map();
  for (const leave of leaves) {
    const id = String(leave.user);
    if (!leavesByUser.has(id)) leavesByUser.set(id, []);
    leavesByUser.get(id).push(leave);
  }
  const logsByUser = new Map();
  for (const log of allLogs) {
    if (log.user == null) continue;
    const id = String(log.user);
    if (!logsByUser.has(id)) logsByUser.set(id, []);
    logsByUser.get(id).push(log);
  }

  const results = [];

  for (const user of fullUsers) {
    const id = String(user._id);

    if (!force && (await alreadySent(user._id, monthKey))) {
      results.push({
        status: 'skipped_duplicate',
        userId: id,
        email: user.email,
        monthKey,
      });
      continue;
    }

    const attendance = buildEmployeeAttendance({
      logs: logsByUser.get(id) || [],
      weeklySchedule: scheduleByUser.get(id) || {},
      holidayKeys,
      approvedLeaves: leavesByUser.get(id) || [],
      monthMeta,
    });

    const payslip = await findPayslipForMonth(user._id, monthLabel, monthMeta.year);
    const html = buildMonthlyReportHtml({
      name: user.name,
      monthLabel,
      attendance,
      payslip,
    });
    const subject = `Monthly Report — ${monthLabel} | Attendance & Payslip`;

    if (dryRun) {
      results.push({
        status: 'dry_run',
        userId: id,
        email: user.email,
        monthKey,
        hasPayslip: Boolean(payslip),
        summary: attendance.summary,
      });
      continue;
    }

    if (!force) {
      const claimed = await claimSlot({
        userId: user._id,
        email: user.email,
        monthKey,
        monthLabel,
        hasPayslip: Boolean(payslip),
      });
      if (!claimed) {
        results.push({
          status: 'skipped_duplicate',
          userId: id,
          email: user.email,
          monthKey,
        });
        continue;
      }
    } else {
      await MonthlyReportLog.findOneAndUpdate(
        { user: user._id, monthKey },
        {
          $set: {
            email: user.email,
            monthLabel,
            hasPayslip: Boolean(payslip),
            status: 'sent',
            errorMessage: '',
            sentAt: new Date(),
          },
        },
        { upsert: true }
      );
    }

    try {
      await sendMail({ to: user.email, subject, html });
      results.push({
        status: 'sent',
        userId: id,
        email: user.email,
        monthKey,
        hasPayslip: Boolean(payslip),
      });
    } catch (err) {
      await markFailed({
        userId: user._id,
        monthKey,
        errorMessage: err.message,
      });
      results.push({
        status: 'failed',
        userId: id,
        email: user.email,
        monthKey,
        error: err.message,
      });
    }
  }

  return {
    monthKey,
    monthLabel,
    candidateCount: fullUsers.length,
    results,
  };
};

module.exports = {
  TIMEZONE,
  getPreviousMonthMeta,
  buildEmployeeAttendance,
  findPayslipForMonth,
  runMonthlyReports,
};
