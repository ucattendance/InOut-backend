const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');

const uploadsDir = path.join(__dirname, '..', 'uploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const optionalAttendanceImage = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('Attendance image parse failed:', err.message || err);
      req.file = undefined;
    }
    next();
  });
};

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(label || 'upload timed out')), ms)
    ),
  ]);

const saveLocalAttendanceImage = (buffer) => {
  if (!buffer?.length) return '';
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const name = `attendance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  fs.writeFileSync(path.join(uploadsDir, name), buffer);
  return `/uploads/${name}`;
};

const uploadToCloudinary = async (buffer) => {
  const dataUri = `data:image/jpeg;base64,${Buffer.from(buffer).toString('base64')}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'attendance_images',
    resource_type: 'image',
  });
  return result?.secure_url || '';
};

/**
 * Prefer Cloudinary; if it fails/times out, save on disk so Image (Out) still shows.
 */
const uploadAttendanceImageNow = async (buffer) => {
  if (!buffer?.length) {
    console.error('Attendance image missing buffer');
    return '';
  }

  try {
    const url = await withTimeout(uploadToCloudinary(buffer), 10000, 'Cloudinary upload timed out');
    if (url) return url;
  } catch (err) {
    console.error('Attendance Cloudinary upload failed:', err.message);
  }

  try {
    const localPath = saveLocalAttendanceImage(buffer);
    if (localPath) console.log('Attendance image saved locally:', localPath);
    return localPath;
  } catch (err) {
    console.error('Attendance local image save failed:', err.message);
    return '';
  }
};

const saveAttendanceImageInBackground = (attendanceId, buffer) => {
  if (!attendanceId || !buffer?.length) return;
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
