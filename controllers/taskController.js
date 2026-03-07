// -----------------------------
// 📁 controllers/taskController.js
// -----------------------------
const Task = require('../models/Task');

const taskController = {
  getTasksByDate: async (req, res) => {
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
  },

  createTask: async (req, res) => {
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
  },

  updateTaskStatus: async (req, res) => {
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
  },

  deleteTask: async (req, res) => {
    try {
      const deleted = await Task.findOneAndDelete({ _id: req.params.id, user: req.user._id });
      if (!deleted) return res.status(404).json({ error: 'Task not found' });
      res.json({ message: 'Task deleted successfully' });
    } catch (error) {
      console.error('Delete task error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  updateFullTask: async (req, res) => {
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
  },

  getTasksByMonth: async (req, res) => {
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
  },

  getTaskSummary: async (req, res) => {
    try {
      const { date } = req.query;
      const filter = { user: req.user._id };

      if (date) {
        filter.date = date;
      }

      const total = await Task.countDocuments(filter);
      const done = await Task.countDocuments({ ...filter, done: true });
      const pending = total - done;

      res.json({ total, done, pending });
    } catch (error) {
      console.error('Summary error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = taskController;
