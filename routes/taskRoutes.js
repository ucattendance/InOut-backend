const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const taskController = require('../controllers/taskController');

router.get('/:date', auth, taskController.getTasksByDate);
router.post('/', auth, taskController.createTask);
router.patch('/:id', auth, taskController.updateTaskStatus);
router.delete('/:id', auth, taskController.deleteTask);
router.put('/:id', auth, taskController.updateFullTask);
router.get('/month/:year/:month', auth, taskController.getTasksByMonth);
router.get('/summary', auth, taskController.getTaskSummary);

module.exports = router;