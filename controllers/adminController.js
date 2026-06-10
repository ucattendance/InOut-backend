// -----------------------------
// 📁 controllers/adminController.js
// -----------------------------
const User = require('../models/User');
const PendingUser = require('../models/PendingUser');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const {
  joinAttendanceToEmployees,
  serializeAttendanceRows,
  parseDateRange,
  resolveEmployee,
  loadEmployeeMaps,
  fetchAttendanceInRange,
} = require('../utils/attendanceQuery');

let cachedAttendance = null;
let cacheTimestamp = null;
const CACHE_TTL = 15 * 1000;
let cachedRecentAttendance = null;
let cacheRecentAttendanceTime = null;
const ATTENDANCE_CACHE_TTL = 60 * 1000;

const fetchAttendanceRecords = async ({ days, date } = {}) => {
  if (date) {
    const range = parseDateRange(date);
    if (range) {
      const rows = await fetchAttendanceInRange(range.start, range.end);
      return rows.sort((a, b) => {
        const ta = new Date(a.timestamp || 0).getTime();
        const tb = new Date(b.timestamp || 0).getTime();
        return tb - ta || String(b._id).localeCompare(String(a._id));
      });
    }
  }

  const query = {};
  const effectiveDays = Number.isFinite(days) && days > 0 ? days : 730;
  const start = new Date();
  start.setDate(start.getDate() - effectiveDays);
  start.setHours(0, 0, 0, 0);
  query.timestamp = { $gte: start };

  return Attendance.find(query).sort({ timestamp: -1, _id: -1 }).limit(2000).lean();
};

const adminController = {
  getAdminSummary: async (req, res) => {
    try {
      const maps = await loadEmployeeMaps();
      const totalEmployees = maps.byId.size;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const todayRecords = await fetchAttendanceInRange(todayStart, todayEnd);
      const presentIds = new Set();
      for (const row of todayRecords) {
        if (row.type !== 'check-in') continue;
        const user = resolveEmployee(row.user, maps);
        if (user) presentIds.add(String(user._id));
      }

      const presentToday = presentIds.size;
      const absentToday = Math.max(0, totalEmployees - presentToday);

      res.json({ totalEmployees, presentToday, absentToday });
    } catch (error) {
      console.error('Error fetching summary:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getRecentAttendanceDashboard: async (req, res) => {
    try {
      const now = Date.now();
      const date = req.query.date;
      const days = Number.parseInt(req.query.days, 10);
      const cacheKey = date || (Number.isFinite(days) ? `days-${days}` : 'all');

      if (
        !date &&
        cachedAttendance &&
        cacheTimestamp &&
        now - cacheTimestamp < CACHE_TTL &&
        cachedAttendance._key === cacheKey
      ) {
        return res.json(cachedAttendance.data);
      }

      const records = await fetchAttendanceRecords({
        date,
        days: Number.isFinite(days) && days > 0 ? days : undefined,
      });
      const joined = await joinAttendanceToEmployees(records);
      const enriched = serializeAttendanceRows(joined);

      if (!date) {
        cachedAttendance = { _key: cacheKey, data: enriched };
        cacheTimestamp = now;
      }

      return res.json(enriched);
    } catch (err) {
      console.error('Error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  },

  getRecentAttendance: async (req, res) => {
    try {
      const now = Date.now();

      if (
        cachedRecentAttendance &&
        cacheRecentAttendanceTime &&
        now - cacheRecentAttendanceTime < ATTENDANCE_CACHE_TTL
      ) {
        return res.json(cachedRecentAttendance);
      }

      const records = await Attendance.find({}).sort({ timestamp: -1, _id: -1 }).lean();
      const joined = await joinAttendanceToEmployees(records);
      const enriched = serializeAttendanceRows(joined);

      cachedRecentAttendance = enriched;
      cacheRecentAttendanceTime = now;

      res.json(enriched);
    } catch (error) {
      console.error('Error fetching recent logs:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getPendingUsers: async (req, res) => {
    try {
      const pendingUsers = await PendingUser.find();
      res.json(pendingUsers);
    } catch (error) {
      console.error('Error fetching pending users:', error);
      res.status(500).json({ error: 'Failed to fetch pending users' });
    }
  },

  approveUser: async (req, res) => {
    try {
      const pending = await PendingUser.findById(req.params.id);
      if (!pending) return res.status(404).json({ error: 'Pending user not found' });

      const user = new User({
        name: pending.name,
        email: pending.email,
        password: pending.password,
        phone: pending.phone,
        position: pending.position,
        company: pending.company,
        role: 'employee',
        salary: pending.salary,
        department: pending.department,
        qualification: pending.qualification,
        dateOfJoining: pending.dateOfJoining,
        dateOfBirth: pending.dateOfBirth,
        employeeId: pending.employeeId,
        rolesAndResponsibility: pending.rolesAndResponsibility,
        skills: pending.skills,
        profilePic: pending.profilePic,
        bloodGroup: pending.bloodGroup,
        address: pending.address,
        bankDetails: pending.bankDetails,
        schedule: pending.schedule,
      });
      await user.save();

      if (pending.schedule) {
        const userSchedule = new Schedule({
          user: user._id,
          weeklySchedule: pending.schedule,
        });
        await userSchedule.save();
      }

      await PendingUser.findByIdAndDelete(pending._id);

      res.json({ message: 'User approved and created successfully.' });
    } catch (error) {
      console.error('Approval error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  rejectUser: async (req, res) => {
    try {
      const deletedUser = await PendingUser.findByIdAndDelete(req.params.id);
      if (!deletedUser) return res.status(404).json({ error: 'User not found' });

      res.status(200).json({ message: 'Pending user rejected and removed' });
    } catch (err) {
      console.error('Error rejecting user:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getAllLetters: async (req, res) => {
    try {
      const letters = await User.aggregate([
        { $unwind: { path: '$letterCopies', preserveNullAndEmptyArrays: false } },
        {
          $project: {
            _id: 0,
            userId: '$_id',
            userName: '$name',
            userEmail: '$email',
            filename: '$letterCopies.filename',
            url: '$letterCopies.url',
            uploadedBy: '$letterCopies.uploadedBy',
            uploadedAt: '$letterCopies.uploadedAt',
          },
        },
        { $sort: { uploadedAt: -1 } },
      ]);

      res.json(letters);
    } catch (err) {
      console.error('Error fetching all letters:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

module.exports = adminController;
