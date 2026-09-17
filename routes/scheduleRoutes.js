const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const scheduleController = require('../controllers/scheduleController');

router.get('/', auth, role('admin'), scheduleController.getAllSchedules);
router.put('/:id', auth, role('admin'), scheduleController.updateUserSchedule);

module.exports = router;
