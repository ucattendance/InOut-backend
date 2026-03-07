const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const adminController = require('../controllers/adminController');

router.get('/summary', auth, role('admin'), adminController.getAdminSummary);
router.get('/recent-attendance', auth, role('admin'), adminController.getRecentAttendance);
router.get('/recent-dashboard',auth,role('admin'),adminController.getRecentAttendanceDashboard)
router.get('/pending-users', auth, role('admin'), adminController.getPendingUsers);
router.post('/approve/:id', auth, role('admin'), adminController.approveUser);
router.delete('/reject/:id', auth, role('admin'), adminController.rejectUser);

module.exports = router;