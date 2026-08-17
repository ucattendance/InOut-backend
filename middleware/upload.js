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

const uploadAttendanceImageBuffer = (buffer, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Cloudinary upload timed out')), timeoutMs);
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'attendance_images', resource_type: 'image' },
      (error, result) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });

/** Try to get a Cloudinary URL now; never throw — checkout/check-in must still save. */
const uploadAttendanceImageNow = async (buffer) => {
  if (!buffer) return '';
  try {
    const result = await uploadAttendanceImageBuffer(buffer);
    return result?.secure_url || '';
  } catch (err) {
    console.error('Attendance image upload failed:', err.message);
    return '';
  }
};

/** Fallback if the request already returned — attach URL later. */
const saveAttendanceImageInBackground = (attendanceId, buffer) => {
  if (!attendanceId || !buffer) return;
  setImmediate(async () => {
    try {
      const Attendance = require('../models/Attendance');
      const url = await uploadAttendanceImageNow(buffer);
      if (!url) return;
      await Attendance.findByIdAndUpdate(attendanceId, { image: url });
    } catch (err) {
      console.error('Background attendance image upload failed:', err.message);
    }
  });
};

module.exports = upload;
module.exports.optionalAttendanceImage = optionalAttendanceImage;
module.exports.uploadAttendanceImageNow = uploadAttendanceImageNow;
module.exports.saveAttendanceImageInBackground = saveAttendanceImageInBackground;
