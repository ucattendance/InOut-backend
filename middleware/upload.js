const multer = require('multer');
const cloudinary = require('../config/cloudinary');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

/**
 * Parse the selfie in-memory. Never wait on Cloudinary during the HTTP request.
 */
const optionalAttendanceImage = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('Attendance image parse failed:', err.message || err);
      req.file = undefined;
    }
    next();
  });
};

const uploadAttendanceImageBuffer = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'attendance_images', resource_type: 'image' },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
  });

/** Check-in/out already saved — attach Cloudinary URL later if upload works. */
const saveAttendanceImageInBackground = (attendanceId, buffer) => {
  if (!attendanceId || !buffer) return;
  setImmediate(async () => {
    try {
      const Attendance = require('../models/Attendance');
      const result = await uploadAttendanceImageBuffer(buffer);
      const url = result?.secure_url || '';
      if (!url) return;
      await Attendance.findByIdAndUpdate(attendanceId, { image: url });
    } catch (err) {
      console.error('Background attendance image upload failed:', err.message);
    }
  });
};

module.exports = upload;
module.exports.optionalAttendanceImage = optionalAttendanceImage;
module.exports.saveAttendanceImageInBackground = saveAttendanceImageInBackground;
