const Attendance = require('../models/Attendance');
const User = require('../models/User');
const officeLocation = require('../config/officeLocation');
const {
  parseLocationCoords,
  branchToOfficeName,
  matchOfficeWithPairing,
  enrichAttendanceLogs,
} = require('../utils/officeMatch');

exports.markAttendance = async (req, res) => {
  try {
    if (!req.body.location || !req.body.location.includes(',')) {
      return res.status(400).json({ error: 'Invalid location format' });
    }

    if (!['check-in', 'check-out'].includes(req.body.type)) {
      return res.status(400).json({ error: 'Invalid attendance type' });
    }

    const coords = parseLocationCoords(req.body.location);
    if (!coords) {
      return res.status(400).json({ error: 'Invalid location format' });
    }

    const user = await User.findById(req.user._id).select('branch address bankDetails');
    const preferredOfficeName = branchToOfficeName(user);

    let pairedCheckIn = null;
    if (req.body.type === 'check-out') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      pairedCheckIn = await Attendance.findOne({
        user: req.user._id,
        type: 'check-in',
        timestamp: { $gte: todayStart },
      }).sort({ timestamp: -1 });
    }

    const match = matchOfficeWithPairing(coords.lat, coords.lon, officeLocation, {
      preferredOfficeName,
      pairedCheckIn,
    });
    const isInOffice = match.isInOffice;
    const matchedOfficeName = match.isInOffice ? match.officeName : null;

    const attendance = new Attendance({
      user: req.user._id,
      type: req.body.type,
      location: req.body.location,
      comment: req.body.comment || '',
      image: req.file?.path || '',
      isInOffice,
      officeName: matchedOfficeName || 'Outside Office',
      timestamp: new Date(),
    });

    await attendance.save();
    res.json({ message: 'Attendance marked', isInOffice, office: matchedOfficeName });
  } catch (err) {
    console.error('Mark attendance error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getAllAttendance = async (req, res) => {
  try {
    const records = await Attendance.find().populate('user', 'name email');
    res.json(records);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getLastAttendance = async (req, res) => {
  try {
    const lastRecord = await Attendance.findOne({ user: req.user._id }).sort({ timestamp: -1 });
    if (!lastRecord) return res.status(200).json({ type: null });
    res.json({ type: lastRecord.type });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch last attendance' });
  }
};

exports.getUserSummary = async (req, res) => {
  const { userId, year, month } = req.params;
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  try {
    const allDays = new Set();
    const records = await Attendance.find({
      user: userId,
      timestamp: { $gte: startDate, $lte: endDate },
      type: 'check-in'
    });

    records.forEach(r => allDays.add(r.timestamp.toISOString().split('T')[0]));

    const totalDays = endDate.getDate();
    res.json({ present: allDays.size, absent: totalDays - allDays.size });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance summary' });
  }
};

exports.getUserLastAttendance = async (req, res) => {
  try {
    const lastRecord = await Attendance.findOne({ user: req.params.userId })
      .sort({ timestamp: -1 })
      .select('type timestamp');
    res.json(lastRecord || { type: 'None', timestamp: null });
  } catch (err) {
    console.error('Last user attendance error:', err);
    res.status(500).json({ error: 'Failed to fetch last record' });
  }
};

exports.getAttendanceByUser = async (req, res) => {
  try {
    const records = await Attendance.find({ user: req.params.userId })
      .populate('user', 'name email');
    res.json(enrichAttendanceLogs(records));
  } catch (error) {
    console.error('Error fetching attendance records by user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getMyAttendance = async (req, res) => {
  try {
    const records = await Attendance.find({ user: req.user._id })
      .populate('user', 'name email');
    res.json(enrichAttendanceLogs(records));
  } catch (error) {
    console.error('Error fetching my attendance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getAttendanceByDate = async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const records = await Attendance.find({
      timestamp: {
        $gte: new Date(date.setHours(0, 0, 0)),
        $lt: new Date(date.setHours(23, 59, 59))
      }
    }).populate('user', 'name email');
    res.json(records);
  } catch (error) {
    console.error('Error fetching attendance by date:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
