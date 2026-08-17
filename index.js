// index.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const authMiddleware = require('./middleware/auth');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const app = express();

// Middleware
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (origin === 'https://inout.urbancode.tech') return callback(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
  credentials: true,
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

// Swagger API docs
try {
  const swaggerDocument = YAML.load(path.join(__dirname, 'swagger', 'openapi.yaml'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customSiteTitle: 'UC Attendance API',
  }));
  app.get('/api-docs.json', (req, res) => res.json(swaggerDocument));
  console.log('Swagger UI ready at /api-docs');
} catch (err) {
  console.error('Swagger setup failed:', err.message);
}

// Ping Route
app.get('/ping', (req, res) => res.send('pong'));
app.get('/version', (req, res) => res.json({ build: 'backend-deploy-v19-checkout-image-local' }));

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
  const users = await User.find(
    { role: 'employee', isActive: { $ne: false } },
    '_id name email role company position employeeId dateOfRelieving branch bankDetails address'
  );
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
})

// Start server
async function startServer() {
  try {
    if (!process.env.MONGO_URI) {
      console.error('Missing MONGO_URI. Copy .env.example to .env and set your MongoDB connection string.');
      process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    // Reminder emails (10:00 / 12:00 / 15:00 / 18:00 / 20:00 Asia/Kolkata)
    try {
      const { startAttendanceReminderScheduler } = require('./jobs/attendanceReminderScheduler');
      startAttendanceReminderScheduler();
    } catch (schedErr) {
      console.error('Attendance reminder scheduler failed to start:', schedErr.message);
    }

    // Monthly attendance + payslip emails (1st of month 10:00 Asia/Kolkata)
    try {
      const { startMonthlyReportScheduler } = require('./jobs/monthlyReportScheduler');
      startMonthlyReportScheduler();
    } catch (schedErr) {
      console.error('Monthly report scheduler failed to start:', schedErr.message);
    }

    const port = process.env.PORT || 5000;
    app.listen(port, () => console.log(`Server running on port ${port}`));
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
}
startServer();
