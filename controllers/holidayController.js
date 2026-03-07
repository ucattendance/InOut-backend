// -----------------------------
// 📁 controllers/holidayController.js
// -----------------------------
const Holiday = require('../models/Holiday');

const holidayController = {
  getAllHolidays: async (req, res) => {
    try {
      const holidays = await Holiday.find().sort({ date: 1 });
      res.json(holidays);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch holidays' });
    }
  },
  getHolidays:async(req,res)=>{
  try {
      const { year, month } = req.query;
      let filter = {};
      if (year && month) {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0, 23, 59, 59);
        filter.date = { $gte: start, $lte: end };
      }
      const holidays = await Holiday.find(filter);
      res.json(holidays);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  updateHoliday: async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Holiday.findByIdAndUpdate(id, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: 'Holiday not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update holiday' });
  }
},

deleteHoliday: async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Holiday.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'Holiday not found' });
    res.json({ message: 'Holiday deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
},


  createHoliday: async (req, res) => {
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
  }
};

module.exports = holidayController;
