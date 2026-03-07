// File:index.js (Node.js/Express Backend)
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config();
const haversine = require('haversine-distance');
const officeLocation = require('./config/officeLocation');
const PendingUser = require('./models/PendingUser');
const Holiday = require('./models/Holiday');
const LeaveRequest = require('./models/LeaveRequest');
const Task = require('./models/Task');
const attendanceRoutes = require('./routes/attendanceRoutes');
const transporter = require('./config/emailConfig');

const app = express();
app.use(cors({
    origin: ['https://inout.urbancode.tech','http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // 🔥 Allow cross-origin image loading
  next();
}, express.static(uploadsPath, {
  setHeaders: (res, filePath) => {
    const mime = require('mime');
    res.setHeader('Content-Type', mime.getType(filePath));
  }
}));
app.use('/attendance', attendanceRoutes);
// MongoDB Models
const User = require('./models/User');
const Schedule = require('./models/Schedule');
const Attendance = require('./models/Attendance');

// Middleware
const authMiddleware = require('./middleware/auth');
const roleMiddleware = require('./middleware/role');

// Multer setup for image upload
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});


const upload = multer({ storage });










/**************************************************************************************************/
//------------------- Routes----------------------------------------------------------------------//
/**************************************************************************************************/
app.get('/ping', (req, res) => res.send('pong'));
app.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, position, company, schedule } = req.body;

    // Validate required fields
    if (!name || !email || !password || !phone || !position || !company) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if already exists in either collection
    const existingUser = await User.findOne({ email });
    const existingPending = await PendingUser.findOne({ email });


    if (existingUser || existingPending) {
      return res.status(400).json({ error: 'Email already in use or pending approval' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const pending = new PendingUser({
      name,
      email,
      password: hashedPassword,
      phone,
      position,
      company,
      schedule
    });

    await pending.save();

    const mailOptions = {
  from: process.env.NOTIFY_EMAIL,
  to: [process.env.NOTIFY_EMAIL, 'admin@urbancode.in','krithika@urbancode.in','savitha.saviy@gmail.com'],// your email
  subject: '🚀 New User Registration Alert for INOUT!',
  html: `
    <div style="font-family: Arial, sans-serif; border: 1px solid #e0e0e0; border-radius: 10px; padding: 20px; background: #f9f9ff;">
      <h2 style="color: #6366f1;">👤 New Registration Received for InOut</h2>
      <p><strong>👨‍💼 Name:</strong> ${pending.name}</p>
      <p><strong>📧 Email:</strong> ${pending.email}</p>
      <p><strong>📱 Phone:</strong> ${pending.phone || 'N/A'}</p>
      <p><strong>🎓 Role:</strong> ${pending.position} - ${pending.company}</p>
      <hr style="margin: 20px 0;" />
      <p style="font-size: 14px;">🔐 <strong>Action Needed:</strong> Please login to the <a href="https://inout.urbancode.tech/" style="color: #4f46e5;">Admin Panel</a> to approve this user.</p>
      <p style="font-size: 13px; color: #999;">📅 ${new Date().toLocaleString()}</p>
    </div>
  `
};
await transporter.sendMail(mailOptions);
    res.status(201).json({
      message: 'Registration submitted and pending admin approval'
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// **********************************************************************************************************
// 📝 Daily Task APIs
// **********************************************************************************************************
// ✅ GET tasks by date (e.g., /api/tasks/2025-06-11)
app.get('/api/tasks/:date', authMiddleware, async (req, res) => {
  try {
    const tasks = await Task.find({
      user: req.user._id,
      date: req.params.date,
    }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    console.error('Fetch task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ POST new task
app.post('/api/tasks', authMiddleware, async (req, res) => {
  const { task, date } = req.body;
  if (!task || !date) return res.status(400).json({ error: 'Task and date are required' });

  try {
    const newTask = new Task({ user: req.user._id, task, date });
    await newTask.save();
    res.status(201).json(newTask);
  } catch (error) {
    console.error('Add task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ PATCH update task status
app.patch('/api/tasks/:id', authMiddleware, async (req, res) => {
  const { done } = req.body;
  try {
    const updated = await Task.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { done },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Task not found' });
    res.json(updated);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ DELETE /api/tasks/:id - Delete a task
app.delete('/api/tasks/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await Task.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/tasks/:id', authMiddleware, async (req, res) => {
  const { task, date } = req.body;
  if (!task || !date) return res.status(400).json({ error: 'Task and date are required' });

  try {
    const updated = await Task.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { task, date },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Task not found' });
    res.json(updated);
  } catch (error) {
    console.error('Update full task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

 

app.get('/api/tasks/month/:year/:month', authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.params;
    const start = new Date(`${year}-${month}-01`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);

    const tasks = await Task.find({
      user: req.user._id,
      date: { $gte: start.toISOString().split('T')[0], $lt: end.toISOString().split('T')[0] },
    });

    res.json(tasks);
  } catch (err) {
    console.error('Fetch monthly tasks error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ✅ Updated summary endpoint to support filtering by date
app.get('/api/tasks/summary', authMiddleware, async (req, res) => {
  try {
    const { date } = req.query;
    const filter = { user: req.user._id };

    if (date) {
      filter.date = date; // e.g., 2025-06-11
    }

    const total = await Task.countDocuments(filter);
    const done = await Task.countDocuments({ ...filter, done: true });
    const pending = total - done;

    res.json({ total, done, pending });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// **************************************************************************************************************
// 📝 Daily Task APIs Ends here
// **************************************************************************************************************


// **************************************************************************************************************
// User Approval APIs
// **************************************************************************************************************

app.post('/admin/approve/:id', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const pending = await PendingUser.findById(req.params.id);
    if (!pending) return res.status(404).json({ error: 'Pending user not found' });

    // Move to User collection
    const user = new User({
      name: pending.name,
      email: pending.email,
      password: pending.password,
      phone: pending.phone,
      position: pending.position,
      company: pending.company,
      role: 'employee'
    });
    await user.save();

    // Create schedule if exists
    if (pending.schedule) {
      const userSchedule = new Schedule({
        user: user._id,
        weeklySchedule: pending.schedule
      });
      await userSchedule.save();
    }

    // Delete from pending
    await PendingUser.findByIdAndDelete(pending._id);

    res.json({ message: 'User approved and created successfully.' });
  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/admin/pending-users', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const pendingUsers = await PendingUser.find();
    res.json(pendingUsers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending users' });
  }
});

app.delete('/admin/reject/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedUser = await PendingUser.findByIdAndDelete(id);
    if (!deletedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ message: 'Pending user rejected and removed' });
  } catch (err) {
    console.error('Error rejecting user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// **************************************************************************************************************
// User Approval APIs Ends here
// **************************************************************************************************************

// **************************************************************************************************************
// Leave APIs
// **************************************************************************************************************


// Apply for leave (employee)
app.post('/api/leaves/apply', authMiddleware, async (req, res) => {
  try {
    const { fromDate, toDate, reason, leaveType } = req.body;
    if (!fromDate || !toDate || !reason) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const user = req.user;
    const leave = new LeaveRequest({
      user: req.user._id,
      fromDate,
      toDate,
      reason,
      leaveType
    });

    await leave.save();
    const mailOptions = {
  from: process.env.NOTIFY_EMAIL,
  to: [process.env.NOTIFY_EMAIL, 'admin@urbancode.in', 'krithika@urbancode.in', 'savitha.saviy@gmail.com'],
  subject: '🌴 New Leave Request Submitted – INOUT Portal',
  html: `
    <div style="font-family: Arial, sans-serif; border: 1px solid #e0e0e0; border-radius: 10px; padding: 20px; background: #f0faff;">
      <h2 style="color: #1d4ed8;">📅 New Leave Request Submitted</h2>
      <p><strong>👤 Name:</strong> ${user.name}</p>
      <p><strong>✉️ Email:</strong> ${user.email}</p>
      <p><strong>🏢 Role:</strong> ${user.position} - ${user.company}</p>
      <p><strong>🛫 Leave From:</strong> ${new Date(fromDate).toLocaleDateString()}</p>
      <p><strong>🛬 Leave To:</strong> ${new Date(toDate).toLocaleDateString()}</p>
      <p><strong>📝 Type:</strong> ${leaveType || 'N/A'}</p>
      <p><strong>📌 Reason:</strong> ${reason}</p>

      <hr style="margin: 20px 0;" />
      <p style="font-size: 14px;">🔐 <strong>Action Required:</strong> Please log in to the <a href="https://inout.urbancode.tech/" style="color: #1d4ed8;">Admin Panel</a> to review and approve this leave.</p>
      <p style="font-size: 13px; color: #666;">🕒 Submitted on: ${new Date().toLocaleString()}</p>
    </div>
  `
};

await transporter.sendMail(mailOptions);
    res.status(201).json({ message: 'Leave request submitted' });
  } catch (err) {
    console.error('Leave apply error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all leave requests (admin)
app.get('/api/leaves/all', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const requests = await LeaveRequest.find().populate('user', 'name email');
    res.json(requests);
  } catch (err) {
    console.error('Fetch leave requests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update leave request status (admin)
app.patch('/api/leaves/:id', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updated = await LeaveRequest.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    res.json({ message: `Leave ${status.toLowerCase()}`, request: updated });
  } catch (err) {
    console.error('Update leave error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get logged-in user's leave requests
app.get('/api/leaves/me', authMiddleware, async (req, res) => {
  try {
    const leaves = await LeaveRequest.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(leaves);
  } catch (err) {
    console.error('Fetch my leaves error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// **************************************************************************************************************
// Leave APIs Ends here
// **************************************************************************************************************

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        userId: user._id, 
        role: user.role,
        name: user.name 
      }, 
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ 
      token,
      userId: user._id,
      role: user.role,
      name: user.name
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});



// // Get all users (admin only)
// app.get('/users', async (req, res) => {
//   try {
//     const users = await User.find({}, 'name email role phone position company');
//     res.json(users);
//   } catch (error) {
//     console.error('Error fetching users:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// });

// app.get('/users', authMiddleware, async (req, res) => {
//   const users = await User.find({}, 'name email role phone position company');
//   res.json(users);
// });
// If you're using roleMiddleware somewhere else on `/users`, REMOVE IT:
app.get('/users', authMiddleware, async (req, res) => {
  try {
    const users = await User.find({}, {
      name: 1,
      email: 1,
      role: 1,
      phone: 1,
      position: 1,
      company: 1,
      salary: 1,
      department: 1,
      qualification: 1,
      dateOfJoining: 1,
      isActive: 1,
      profilePic: 1,
      skills: 1,
      rolesAndResponsibility: 1,
      bankDetails: 1,
      createdAt: 1,
      updatedAt: 1
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});


// **************************************************************************************************************
// Holiday APIs
// **************************************************************************************************************

// GET all holidays
app.get('/api/holidays', authMiddleware, async (req, res) => {
  try {
    const holidays = await Holiday.find().sort({ date: 1 });
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

// POST new holiday (admin only)
app.post('/api/holidays', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const { date, name } = req.body;

    if (!date || !name) {
      return res.status(400).json({ error: 'Date and name are required' });
    }

    const existing = await Holiday.findOne({ date: new Date(date) });
    if (existing) {
      return res.status(409).json({ error: 'Holiday already exists for this date' });
    }

    const holiday = new Holiday({ date, name });
    await holiday.save();
    res.status(201).json(holiday);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add holiday' });
  }
});

// **************************************************************************************************************
// Holiday APIs ends here
// **************************************************************************************************************


// Get single user
app.get('/users/:id', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password'); // Exclude password for safety

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      position: user.position,
      company: user.company,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's schedule
app.get('/schedules/user/:userId', authMiddleware, async (req, res) => {
  try {
    const schedule = await Schedule.findOne({ user: req.params.userId });
    res.json(schedule || {});
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add this to your backend routes
app.get('/users/me', authMiddleware, async (req, res) => {
  try {
    // Get user ID from the authenticated request (added by authMiddleware)
    const userId = req.user._id;
    
    // Find user by ID and exclude the password field
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user
app.put('/users/:id', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const { name, email, password, phone, position, company, schedule } = req.body;
    const updateData = { name, email, phone, position, company };

    // Only update password if provided
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }

    // Update user
    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update or create schedule
    if (schedule) {
      await Schedule.findOneAndUpdate(
        { user: req.params.id },
        { weeklySchedule: schedule },
        { upsert: true, new: true }
      );
    }

    res.json({ 
      message: 'User updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        position: user.position,
        company: user.company,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/api/admin/summary', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const totalEmployees = await User.countDocuments({ role: 'employee' });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayAttendance = await Attendance.find({
      timestamp: { $gte: todayStart, $lte: todayEnd },
      type: 'check-in'
    }).distinct('user'); // unique check-ins

    const presentToday = todayAttendance.length;
    const absentToday = totalEmployees - presentToday;

    res.json({
      totalEmployees,
      presentToday,
      absentToday
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// routes/attendanceRoutes.js or directly in your index.js

app.get('/api/admin/recent-attendance', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const logs = await Attendance.find()
      .sort({ timestamp: -1 })
      .populate({
        path: 'user',
        match: { role: 'employee' }, // ✅ Filter by employee role
        select: 'name email role'    // ✅ Include role for clarity (optional)
      });

    // Filter out logs where user is null (because populate didn't match)
    const filteredLogs = logs.filter(log => log.user !== null);

    const formatted = filteredLogs.map(log => ({
      employeeName: log.user.name,
      userId: log.user._id,
      role: log.user.role,               // ✅ Included for frontend filtering/debugging
      type: log.type,
      timestamp: log.timestamp,
      officeName: log.officeName || 'Outside Office',
      image: log.image || '',
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching recent logs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/employeesAttendance',authMiddleware, async (req, res) => {
   try {
    const users = await User.find({ role: 'employee' }, '_id name email role');
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
})
// PUT: Update salary for a user (admin only)
app.put('/users/:id/salary', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const { salary } = req.body;

    if (!salary || isNaN(salary)) {
      return res.status(400).json({ error: 'Invalid salary value' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { salary },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Salary updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Error updating salary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



async function setupAdmin() {
  const existing = await User.findOne({ email: 'admin@urbancode.in' });
  if (!existing) {
    const hashed = await bcrypt.hash('12345678', 10);
    await User.create({
      name: 'Admin',
      email: 'admin@urbancode.in',
      password: hashed,
      role: 'admin',
      phone: '6374129515',       // ← required
      position: 'Admin',         // ← required
      company: 'Urbancode'       // ← required
    });
    console.log('Admin created: admin@urbancode.in / 12345678');
  }
}

setupAdmin();

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    app.listen(5000, () => console.log('Server running on port 5000'));
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
}

startServer();
