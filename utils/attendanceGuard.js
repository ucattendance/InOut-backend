const Attendance = require('../models/Attendance');
const { userIdFilters } = require('./attendanceQuery');

const TIMEZONE = 'Asia/Kolkata';

const getIstDayBounds = (now = new Date()) => {
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const start = new Date(`${dateKey}T00:00:00+05:30`);
  const end = new Date(`${dateKey}T23:59:59.999+05:30`);
  return { start, end, dateKey };
};

const getTodayRecordsForUser = async (userId, now = new Date()) => {
  const { start, end } = getIstDayBounds(now);
  const filters = userIdFilters(userId);
  if (!filters.length) return [];

  return Attendance.find({
    $or: filters,
    timestamp: { $gte: start, $lte: end },
    type: { $in: ['check-in', 'check-out'] },
  })
    .sort({ timestamp: 1, _id: 1 })
    .select('type timestamp')
    .lean();
};

const reject = (status, code, message) => ({ ok: false, status, code, message });

/**
 * Prevent duplicate or invalid check-in / check-out for the IST calendar day.
 * Matches the frontend attendance flow (one check-in, then one check-out per day).
 */
const validateMarkAttendance = async (userId, type, now = new Date()) => {
  const attendanceType = String(type || '').trim();
  if (!['check-in', 'check-out'].includes(attendanceType)) {
    return reject(400, 'INVALID_TYPE', 'Invalid attendance type');
  }

  const records = await getTodayRecordsForUser(userId, now);
  const hasCheckIn = records.some((row) => row.type === 'check-in');
  const hasCheckOut = records.some((row) => row.type === 'check-out');

  if (attendanceType === 'check-in') {
    if (hasCheckOut) {
      return reject(
        409,
        'ATTENDANCE_DAY_COMPLETE',
        'Check-in and check-out are already complete for today.'
      );
    }
    if (hasCheckIn) {
      return reject(
        409,
        'DUPLICATE_CHECK_IN',
        'You have already checked in today.'
      );
    }
    return { ok: true };
  }

  if (!hasCheckIn) {
    return reject(
      409,
      'CHECKOUT_WITHOUT_CHECKIN',
      'You must check in before checking out.'
    );
  }
  if (hasCheckOut) {
    return reject(
      409,
      'DUPLICATE_CHECK_OUT',
      'You have already checked out today.'
    );
  }

  return { ok: true };
};

module.exports = {
  TIMEZONE,
  getIstDayBounds,
  getTodayRecordsForUser,
  validateMarkAttendance,
};
