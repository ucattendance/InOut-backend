const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const holidayController = require('../controllers/holidayController');

router.get('/', auth, holidayController.getAllHolidays);
router.post('/', auth, role('admin'), holidayController.createHoliday);
router.get('/filter', auth, holidayController.getHolidays);
router.delete('/delete/:id',auth,holidayController.deleteHoliday);
router.put('/update/:id',auth,holidayController.updateHoliday);
module.exports = router;