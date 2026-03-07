// -----------------------------
// 📁 controllers/adminController.js
// -----------------------------
const User = require('../models/User');
const PendingUser = require('../models/PendingUser');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');

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

      // 2️⃣ Calculate last 30 days
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);

      // 3️⃣ Run your aggregation
      const logs = await Attendance.aggregate([
        {
          $match: { timestamp: { $gte: start, $lt: end } }
        },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "userData"
          }
        },
        { $unwind: "$userData" },
        {
          $match: {
            "userData.role": "employee",
            "userData.isActive": true
          }
        },
        {
          $project: {
            _id: 0,
            employeeName: "$userData.name",
            userId: "$userData._id",
            role: "$userData.role",
            position: "$userData.position",
            department: "$userData.department",
            company: "$userData.company",
            type: 1,
            timestamp: 1,
            officeName: { $ifNull: ["$officeName", "Outside Office"] },
            image: { $ifNull: ["$image", ""] }
          }
        },
        { $sort: { timestamp: -1 } },
        { $limit: 1500 }
      ]);

      // 4️⃣ Save to cache
      cachedAttendance = logs;
      cacheTimestamp = now;

      return res.json(logs);

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

      // 2️⃣ Fetch from database (optimized version)
      const logs = await Attendance.aggregate([
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "userData"
          }
        },
        { $unwind: "$userData" },
        {
          $match: {
            "userData.role": "employee",
            "userData.isActive": true
          }
        },
        {
          $project: {
            _id: 0,
            employeeName: "$userData.name",
            userId: "$userData._id",
            role: "$userData.role",
            position: "$userData.position",
            department: "$userData.department",
            company: "$userData.company",
            dateOfJoining: "$userData.dateOfJoining",
            bankingName: "$userData.bankDetails.bankingName",
            accountNumber: "$userData.bankDetails.bankAccountNumber",
            type: 1,
            timestamp: 1,
            officeName: { $ifNull: ["$officeName", "Outside Office"] },
            image: { $ifNull: ["$image", ""] }
          }
        },
        { $sort: { timestamp: -1 } }
      ]);

      // 3️⃣ Save to cache
      cachedRecentAttendance = logs;
      cacheRecentAttendanceTime = now;

      // 4️⃣ Send response
      res.json(logs);

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
};

module.exports = adminController;