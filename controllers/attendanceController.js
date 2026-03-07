const Attendance = require('../models/Attendance');
const officeLocation = require('../config/officeLocation');
const haversine = require('haversine-distance');

exports.markAttendance = async (req, res) => {
  try {
    if (!req.body.location || !req.body.location.includes(',')) {
      return res.status(400).json({ error: 'Invalid location format' });
    }

    const [lat, lon] = req.body.location.split(',').map(parseFloat);
    const userLocation = { latitude: lat, longitude: lon };

    let isInOffice = false;
    let matchedOfficeName = null;

    for (const office of officeLocation) {
      const officeCoords = { latitude: office.latitude, longitude: office.longitude };
      const distance = haversine(userLocation, officeCoords); // in meters

      if (distance <= office.radiusMeters) {
        isInOffice = true;
        matchedOfficeName = office.name;
        break;
      }
    }

    const attendance = new Attendance({
      user: req.user._id,
      type: req.body.type,
      location: req.body.location,
      image: req.file?.path || '', // Cloudinary URL or fallback
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
    res.json(records);
  } catch (error) {
    console.error('Error fetching attendance records by user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getMyAttendance = async (req, res) => {
  try {
    const records = await Attendance.find({ user: req.user._id })
      .populate('user', 'name email');
    res.json(records);
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
