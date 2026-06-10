const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const officeLocation = require('../config/officeLocation');
const {
  parseLocationCoords,
  branchToOfficeName,
  matchOfficeWithPairing,
  enrichAttendanceLogs,
  getAttendanceTimestamp,
} = require('../utils/officeMatch');
const {
  userIdFilters,
  joinAttendanceToEmployees,
  serializeAttendanceRows,
  parseDateRange,
} = require('../utils/attendanceQuery');

const resolveAttendanceUserIds = async (userId) => {
  const user = await User.findById(userId).select('email employeeId phone name');
  if (!user) return [String(userId)];

  const orUsers = [{ _id: user._id }];
  if (user.email) orUsers.push({ email: user.email });
  if (user.employeeId) orUsers.push({ employeeId: user.employeeId });
  if (user.phone) orUsers.push({ phone: user.phone });

  const related = await User.find({ $or: orUsers }).select('_id employeeId');
  const ids = new Set(related.map((u) => String(u._id)));
  ids.add(String(userId));
  return [...ids];
};

const addRows = (map, rows) => {
  for (const row of rows || []) {
    map.set(String(row._id), row);
  }
};

const findAttendanceForUser = async (userId) => {
  const primary = await User.findById(userId).select('employeeId email phone name');
  const userIds = await resolveAttendanceUserIds(userId);
  const filters = [];

  for (const id of userIds) {
    filters.push(...userIdFilters(id));
  }

  if (primary?.employeeId) {
    filters.push({ user: primary.employeeId });
    filters.push({ user: String(primary.employeeId) });
  }

  const unique = new Map();

  if (filters.length) {
    const rows = await Attendance.find({ $or: filters })
      .sort({ timestamp: -1, _id: -1 })
      .populate('user', 'name email')
      .lean();
    addRows(unique, rows);
  }

  if (primary?.employeeId) {
    const legacy = await Attendance.find({
      $expr: { $eq: [{ $toString: '$user' }, String(primary.employeeId)] },
    })
      .sort({ timestamp: -1, _id: -1 })
      .lean();
    addRows(unique, legacy);
  }

  return [...unique.values()].sort((a, b) => {
    const ta = getAttendanceTimestamp(a)?.getTime() || 0;
    const tb = getAttendanceTimestamp(b)?.getTime() || 0;
    return tb - ta;
  });
};

const serializeAttendanceList = (records) =>
  enrichAttendanceLogs(records).map((row) => {
    const ts = getAttendanceTimestamp(row);
    return {
      ...row,
      _id: row._id ? String(row._id) : row._id,
      type: String(row.type || '').trim(),
      user: row.user
        ? { ...row.user, _id: row.user._id ? String(row.user._id) : row.user._id }
        : row.user,
      timestamp: ts ? ts.toISOString() : null,
    };
  });

exports.markAttendance = async (req, res) => {
  try {
    if (!req.body.location || !req.body.location.includes(',')) {
      return res.status(400).json({ error: 'Invalid location format' });
    }

    if (!['check-in', 'check-out'].includes(req.body.type)) {
      return res.status(400).json({ error: 'Invalid attendance type' });
    }

    const coords = parseLocationCoords(req.body.location);
    if (!coords) {
      return res.status(400).json({ error: 'Invalid location format' });
    }

    const user = await User.findById(req.user._id).select('branch address bankDetails');
    const preferredOfficeName = branchToOfficeName(user);

    let pairedCheckIn = null;
    if (req.body.type === 'check-out') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      pairedCheckIn = await Attendance.findOne({
        $or: userIdFilters(req.user._id),
        type: 'check-in',
        timestamp: { $gte: todayStart },
      }).sort({ timestamp: -1 });
    }

    const match = matchOfficeWithPairing(coords.lat, coords.lon, officeLocation, {
      preferredOfficeName,
      pairedCheckIn,
    });
    const isInOffice = match.isInOffice;
    const matchedOfficeName = match.isInOffice ? match.officeName : null;

    const attendance = new Attendance({
      user: req.user._id,
      type: req.body.type,
      location: req.body.location,
      comment: req.body.comment || '',
      image: req.file?.path || '',
      isInOffice,
      officeName: matchedOfficeName || 'Outside Office',
      timestamp: new Date(),
    });

    await attendance.save();
    res.json({
      message: 'Attendance marked',
      isInOffice,
      office: matchedOfficeName,
      type: attendance.type,
      timestamp: attendance.timestamp,
    });
  } catch (err) {
    console.error('Mark attendance error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getAllAttendance = async (req, res) => {
  try {
    const records = await Attendance.find().populate('user', 'name email');
    res.json(records);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getLastAttendance = async (req, res) => {
  try {
    const lastRecord = await Attendance.findOne({ $or: userIdFilters(req.user._id) })
      .sort({ timestamp: -1, _id: -1 })
      .select('type timestamp');
    if (!lastRecord) return res.status(200).json({ type: null, timestamp: null });
    res.json({ type: lastRecord.type, timestamp: lastRecord.timestamp });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch last attendance' });
  }
};

exports.getUserSummary = async (req, res) => {
  const { userId, year, month } = req.params;
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  try {
    const allDays = new Set();
    const records = await Attendance.find({
      $or: userIdFilters(userId),
      timestamp: { $gte: startDate, $lte: endDate },
      type: 'check-in',
    });

    records.forEach((r) => {
      const ts = getAttendanceTimestamp(r);
      if (ts) allDays.add(ts.toISOString().split('T')[0]);
    });

    const totalDays = endDate.getDate();
    res.json({ present: allDays.size, absent: totalDays - allDays.size });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance summary' });
  }
};

exports.getUserLastAttendance = async (req, res) => {
  try {
    const lastRecord = await Attendance.findOne({ $or: userIdFilters(req.params.userId) })
      .sort({ timestamp: -1, _id: -1 })
      .select('type timestamp');
    res.json(lastRecord || { type: 'None', timestamp: null });
  } catch (err) {
    console.error('Last user attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch last record' });
  }
};

exports.getAttendanceByUser = async (req, res) => {
  try {
    const records = await findAttendanceForUser(req.params.userId);
    res.json(serializeAttendanceList(records));
  } catch (error) {
    console.error('Error fetching attendance records by user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getMyAttendance = async (req, res) => {
  try {
    const records = await findAttendanceForUser(req.user._id);
    res.json(serializeAttendanceList(records));
  } catch (error) {
    console.error('Error fetching my attendance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getAttendanceByDate = async (req, res) => {
  try {
    const range = parseDateRange(req.params.date);
    if (!range) {
      return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
    }

    const records = await Attendance.find({
      timestamp: { $gte: range.start, $lte: range.end },
    })
      .sort({ timestamp: 1, _id: 1 })
      .lean();

    const joined = await joinAttendanceToEmployees(records);
    res.json(serializeAttendanceRows(joined));
  } catch (error) {
    console.error('Error fetching attendance by date:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
