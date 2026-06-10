const mongoose = require('mongoose');
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
  const raw = String(userRef).trim();
  return maps.byId.get(raw) || maps.byEmpId.get(raw) || null;
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
  const parts = String(dateStr || '').trim().split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [year, month, day] = parts;
  return {
    start: new Date(year, month - 1, day, 0, 0, 0, 0),
    end: new Date(year, month - 1, day, 23, 59, 59, 999),
  };
};

module.exports = {
  userIdFilters,
  loadEmployeeMaps,
  resolveEmployee,
  joinAttendanceToEmployees,
  serializeAttendanceRows,
  parseDateRange,
  clearEmployeeMapsCache: () => {
    employeeMapsCache = null;
    employeeMapsCacheTime = 0;
  },
};
