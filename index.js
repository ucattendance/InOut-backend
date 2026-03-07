// index.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const authMiddleware = require('./middleware/auth');
const app = express();

// Middleware
app.use(cors({
  origin: ['https://inout.urbancode.tech', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Static uploads folder
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res, filePath) => {
    const mime = require('mime');
    res.setHeader('Content-Type', mime.getType(filePath));
  }
}));

// Ping Route
app.get('/ping', (req, res) => res.send('pong'));

// Route Mounts 
app.use('/attendance', require('./routes/attendanceRoutes'));
app.use('/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/users', require('./routes/userRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/leaves', require('./routes/leaveRoutes'));
app.use('/api/holidays', require('./routes/holidayRoutes'));
app.use('/schedules', require('./routes/scheduleRoutes'));
app.use("/api/payslips", require("./routes/payslipRoutes"));
// Default Admin Setup
const User = require('./models/User');
const bcrypt = require('bcryptjs');
async function setupAdmin() {
  const existing = await User.findOne({ email: 'admin@urbancode.in' });
  if (!existing) {
    const hashed = await bcrypt.hash('12345678', 10);
    await User.create({
      name: 'Admin',
      email: 'admin@urbancode.in',
      password: hashed,
      role: 'admin',
      phone: '9876543210',
      position: 'Admin',
      company: 'Urbancode'
    });
    console.log('Admin created: admin@urbancode.in / 12345678');
  }
}
setupAdmin();

app.get('/employeesAttendance',authMiddleware, async (req, res) => {
   try {
    const users = await User.find({ role: 'employee', isActive:'true' }, '_id name email role company position');
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
})

// Start server
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
    
    app.listen(process.env.PORT ||5000, () => console.log('Server running on port 5000'));
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
}
startServer();
