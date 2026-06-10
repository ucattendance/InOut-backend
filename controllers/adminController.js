// -----------------------------
// 📁 controllers/adminController.js
// -----------------------------
const User = require('../models/User');
const PendingUser = require('../models/PendingUser');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const { enrichAttendanceLogs, getAttendanceTimestamp } = require('../utils/officeMatch');

/** Join users even when legacy attendance rows stored `user` as a string id. */
const attendanceUserLookupStages = () => [
  {
    $addFields: {
      userObjId: {
        $cond: {
          if: { $eq: [{ $type: '$user' }, 'objectId'] },
          then: '$user',
          else: {
            $convert: { input: '$user', to: 'objectId', onError: null, onNull: null },
          },
        },
      },
    },
  },
  {
    $lookup: {
      from: 'users',
      localField: 'userObjId',
      foreignField: '_id',
      as: 'userData',
    },
  },
  { $unwind: '$userData' },
  {
    $match: {
      'userData.role': 'employee',
      'userData.isActive': true,
    },
  },
];

const attendanceProjectStage = {
  $project: {
    _id: 1,
    employeeName: '$userData.name',
    userId: '$userData._id',
    role: '$userData.role',
    employeeId: '$userData.employeeId',
    position: '$userData.position',
    department: '$userData.department',
    company: '$userData.company',
    dateOfRelieving: '$userData.dateOfRelieving',
    userBranch: {
      $ifNull: [
        '$userData.branch',
        { $ifNull: ['$userData.bankDetails.officeBranch', '$userData.address'] },
      ],
    },
    type: 1,
    timestamp: 1,
    location: 1,
    isInOffice: 1,
    officeName: { $ifNull: ['$officeName', 'Outside Office'] },
    image: { $ifNull: ['$image', ''] },
    comment: { $ifNull: ['$comment', ''] },
  },
};

const serializeAdminAttendance = (logs) =>
  enrichAttendanceLogs(logs).map((row) => {
    const ts = getAttendanceTimestamp(row);
    return {
      ...row,
      _id: row._id ? String(row._id) : row._id,
      userId: row.userId ? String(row.userId) : row.userId,
      timestamp: ts ? ts.toISOString() : null,
    };
  });

let cachedAttendance = null;
let cacheTimestamp = null;
const CACHE_TTL = 15 * 1000;
let cachedRecentAttendance = null;
let cacheRecentAttendanceTime = null;
const ATTENDANCE_CACHE_TTL = 60 * 1000; // 15 seconds


const adminController = {
  getAdminSummary: async (req, res) => {
    try {
      // Count only active employees
      const totalEmployees = await User.countDocuments({ role: 'employee', isActive: true });

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // Get distinct user ids who checked in today
      const todayAttendanceUserIds = await Attendance.find({
        timestamp: { $gte: todayStart, $lte: todayEnd },
        type: 'check-in'
      }).distinct('user');

      // Only count those users who are active employees
      const presentToday = await User.countDocuments({
        _id: { $in: todayAttendanceUserIds },
        role: 'employee',
        isActive: true
      });

      const absentToday = totalEmployees - presentToday;

      res.json({ totalEmployees, presentToday, absentToday });
    } catch (error) {
      console.error('Error fetching summary:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getRecentAttendanceDashboard: async (req, res) => {
    try {
      const now = Date.now();

      // 1️⃣ Check if cache exists AND is not expired
      if (cachedAttendance && cacheTimestamp && now - cacheTimestamp < CACHE_TTL) {
        console.log("📦 Returning cached attendance");
        return res.json(cachedAttendance);
      }

      console.log("🆕 Cache expired → Fetching from DB");

      const days = Number.parseInt(req.query.days, 10);
      const pipeline = [...attendanceUserLookupStages(), attendanceProjectStage];

      if (Number.isFinite(days) && days > 0) {
        const start = new Date();
        start.setDate(start.getDate() - days);
        pipeline.unshift({ $match: { timestamp: { $gte: start } } });
      }

      pipeline.push({ $sort: { timestamp: -1, _id: -1 } });

      const logs = await Attendance.aggregate(pipeline);
      const enriched = serializeAdminAttendance(logs);

      // 4️⃣ Save to cache
      cachedAttendance = enriched;
      cacheTimestamp = now;

      return res.json(enriched);

    } catch (err) {
      console.error("Error:", err);
      res.status(500).json({ error: "Server error" });
    }
  },






  getRecentAttendance: async (req, res) => {
    try {
      const now = Date.now();

      // 1️⃣ If cache available and not expired → return cached response
      if (
        cachedRecentAttendance &&
        cacheRecentAttendanceTime &&
        now - cacheRecentAttendanceTime < ATTENDANCE_CACHE_TTL
      ) {
        console.log("📦 Returning cached RECENT ATTENDANCE");
        return res.json(cachedRecentAttendance);
      }

      console.log("🆕 Cache expired → Fetching RECENT ATTENDANCE from DB");

      const logs = await Attendance.aggregate([
        ...attendanceUserLookupStages(),
        {
          $project: {
            ...attendanceProjectStage.$project,
            dateOfJoining: '$userData.dateOfJoining',
            dateOfBirth: '$userData.dateOfBirth',
            bankingName: '$userData.bankDetails.bankingName',
            accountNumber: '$userData.bankDetails.bankAccountNumber',
          },
        },
        { $sort: { timestamp: -1, _id: -1 } },
      ]);

      const enriched = serializeAdminAttendance(logs);

      // 3️⃣ Save to cache
      cachedRecentAttendance = enriched;
      cacheRecentAttendanceTime = now;

      // 4️⃣ Send response
      res.json(enriched);

    } catch (error) {
      console.error("Error fetching recent logs:", error);
      res.status(500).json({ error: "Internal server error" });
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
        schedule: pending.schedule
      });
      await user.save();

      if (pending.schedule) {
        const userSchedule = new Schedule({
          user: user._id,
          weeklySchedule: pending.schedule
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
  }
,

  // GET all uploaded letter copies across users (for admin)
  getAllLetters: async (req, res) => {
    try {
      // unwind letterCopies and include user basic info
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
            uploadedAt: '$letterCopies.uploadedAt'
          }
        },
        { $sort: { uploadedAt: -1 } }
      ]);

      res.json(letters);
    } catch (err) {
      console.error('Error fetching all letters:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = adminController;