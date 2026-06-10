const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { enrichAttendanceLogs, getAttendanceTimestamp } = require('./officeMatch');

/** Match attendance rows when `user` is stored as string or ObjectId. */
const userIdFilters = (userId) => {
  const id = String(userId);
  const filters = [{ user: id }];
  if (mongoose.Types.ObjectId.isValid(id)) {
    filters.push({ user: new mongoose.Types.ObjectId(id) });
  }
  return filters;
};

let employeeMapsCache = null;
let employeeMapsCacheTime = 0;
const EMPLOYEE_MAPS_TTL = 30 * 1000;

const loadEmployeeMaps = async () => {
  const now = Date.now();
  if (employeeMapsCache && now - employeeMapsCacheTime < EMPLOYEE_MAPS_TTL) {
    return employeeMapsCache;
  }

  const users = await User.find({
    role: 'employee',
    isActive: { $ne: false },
  }).lean();

  const byId = new Map();
  const byEmpId = new Map();

  for (const user of users) {
    byId.set(String(user._id), user);
    if (user.employeeId) {
      byEmpId.set(String(user.employeeId).trim(), user);
    }
  }

  employeeMapsCache = { byId, byEmpId };
  employeeMapsCacheTime = now;
  return employeeMapsCache;
};

/** Resolve employee from attendance.user (ObjectId, id string, or employeeId like UC0031). */
const resolveEmployee = (userRef, maps) => {
  if (userRef == null || !maps) return null;

  let raw;
  if (userRef instanceof mongoose.Types.ObjectId) {
    raw = String(userRef);
  } else if (typeof userRef === 'object' && userRef._id != null) {
    // Do not recurse: ObjectId._id can point to itself and blow the stack.
    raw = String(userRef._id);
  } else {
    raw = String(userRef).trim();
  }

  if (!raw || raw === '[object Object]') return null;

  const direct = maps.byId.get(raw) || maps.byEmpId.get(raw);
  if (direct) return direct;

  if (mongoose.Types.ObjectId.isValid(raw)) {
    const byOid = maps.byId.get(String(new mongoose.Types.ObjectId(raw)));
    if (byOid) return byOid;
  }

  const lower = raw.toLowerCase();
  for (const [empId, user] of maps.byEmpId) {
    if (String(empId).toLowerCase() === lower) return user;
  }

  return null;
};

const formatAttendanceRow = (record, user) => ({
  _id: record._id,
  employeeName: user.name || 'Unknown',
  name: user.name || 'Unknown',
  userId: user._id,
  employeeId: user.employeeId || '',
  role: user.role,
  position: user.position || '',
  department: user.department || '',
  company: user.company || '',
  dateOfRelieving: user.dateOfRelieving || null,
  userBranch: user.branch || user.bankDetails?.officeBranch || user.address || '',
  type: record.type,
  timestamp: record.timestamp,
  location: record.location,
  isInOffice: record.isInOffice,
  officeName: record.officeName || 'Outside Office',
  image: record.image || '',
  comment: record.comment || '',
});

/** Join attendance records to employees in Node (handles all legacy user field formats). */
const joinAttendanceToEmployees = async (records) => {
  const maps = await loadEmployeeMaps();
  const rows = [];

  for (const record of records || []) {
    const user = resolveEmployee(record.user, maps);
    if (!user) continue;
    rows.push(formatAttendanceRow(record, user));
  }

  return rows;
};

const serializeAttendanceRows = (logs) =>
  enrichAttendanceLogs(logs).map((row) => {
    const ts = getAttendanceTimestamp(row);
    return {
      ...row,
      _id: row._id ? String(row._id) : row._id,
      userId: row.userId ? String(row.userId) : row.userId,
      employeeName: row.employeeName || row.name || 'Unknown',
      name: row.name || row.employeeName || 'Unknown',
      timestamp: ts ? ts.toISOString() : null,
    };
  });

const parseDateRange = (dateStr) => {
  const raw = String(dateStr || '').trim();
  if (!raw) return null;

  let year;
  let month;
  let day;

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) {
    [year, month, day] = raw.split('-').map(Number);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    [month, day, year] = raw.split('/').map(Number);
  } else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(raw)) {
    [month, day, year] = raw.split('-').map(Number);
  } else {
    return null;
  }

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return {
    start: new Date(year, month - 1, day, 0, 0, 0, 0),
    end: new Date(year, month - 1, day, 23, 59, 59, 999),
  };
};

/** Fetch attendance for a calendar day, including legacy rows that only have ObjectId time. */
const fetchAttendanceInRange = async (start, end) => {
  const byId = new Map();

  const dated = await Attendance.find({
    timestamp: { $gte: start, $lte: end },
  })
    .sort({ timestamp: 1, _id: 1 })
    .lean();

  for (const row of dated) {
    byId.set(String(row._id), row);
  }

  const startSeconds = Math.floor(start.getTime() / 1000);
  const endSeconds = Math.floor(end.getTime() / 1000);
  const minOid = mongoose.Types.ObjectId.createFromTime(startSeconds);
  const maxOid = mongoose.Types.ObjectId.createFromTime(endSeconds);

  const legacy = await Attendance.find({
    $or: [{ timestamp: null }, { timestamp: { $exists: false } }],
    _id: { $gte: minOid, $lte: maxOid },
  }).lean();

  for (const row of legacy) {
    byId.set(String(row._id), row);
  }

  return [...byId.values()].sort((a, b) => {
    const ta = getAttendanceTimestamp(a)?.getTime() || 0;
    const tb = getAttendanceTimestamp(b)?.getTime() || 0;
    return ta - tb || String(a._id).localeCompare(String(b._id));
  });
};

module.exports = {
  userIdFilters,
  loadEmployeeMaps,
  resolveEmployee,
  joinAttendanceToEmployees,
  serializeAttendanceRows,
  parseDateRange,
  fetchAttendanceInRange,
  clearEmployeeMapsCache: () => {
    employeeMapsCache = null;
    employeeMapsCacheTime = 0;
  },
};
