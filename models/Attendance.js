//server/models/Attendance.js
const mongoose = require('mongoose');
const AttendanceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['check-in', 'check-out'] },
  location: String,
  isInOffice: { type: Boolean, default: true },
  officeName: String,
  image: String,
  timestamp: Date,
});

AttendanceSchema.index({ timestamp: -1 });
AttendanceSchema.index({ user: 1 });
AttendanceSchema.index({ type: 1 });
AttendanceSchema.index({ isInOffice: 1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);