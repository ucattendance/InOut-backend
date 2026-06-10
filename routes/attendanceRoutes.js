const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const upload = require('../middleware/upload'); // ⬅️ We'll create this file next

const uploadAttendanceImage = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('Attendance image upload failed (continuing without photo):', err.message);
    }
    next();
  });
};

router.post('/', auth, uploadAttendanceImage, attendanceController.markAttendance);
router.get('/all', auth, role('admin', 'user'), attendanceController.getAllAttendance);
router.get('/last', auth, attendanceController.getLastAttendance);
router.get('/user/:userId/summary/:year/:month', auth, role('admin'), attendanceController.getUserSummary);
router.get('/user/:userId/last', auth, role('admin'), attendanceController.getUserLastAttendance);
router.get('/user/:userId', auth, role('admin'), attendanceController.getAttendanceByUser);
router.get('/me', auth, attendanceController.getMyAttendance);
router.get('/date/:date', auth, role('admin'), attendanceController.getAttendanceByDate);
module.exports = router;
