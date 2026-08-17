const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cloudinary = require('../config/cloudinary');

const uploadsDir = path.join(__dirname, '..', 'uploads');
const PUBLIC_API = (process.env.PUBLIC_API_URL || 'https://api.inout.urbancode.tech').replace(/\/$/, '');

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

const publicUploadUrl = (filename) => `${PUBLIC_API}/uploads/${filename}`;

const saveLocalAttendanceImage = (buffer) => {
  if (!buffer?.length) return '';
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const name = `attendance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  fs.writeFileSync(path.join(uploadsDir, name), buffer);
  return publicUploadUrl(name);
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
 * Always save locally first (dashboard can show it), then try Cloudinary.
 */
const uploadAttendanceImageNow = async (buffer) => {
  if (!buffer?.length) {
    console.error('Attendance image missing buffer');
    return '';
  }

  let localUrl = '';
  try {
    localUrl = saveLocalAttendanceImage(buffer);
  } catch (err) {
    console.error('Attendance local image save failed:', err.message);
  }

  try {
    const url = await withTimeout(uploadToCloudinary(buffer), 8000, 'Cloudinary upload timed out');
    if (url) return url;
  } catch (err) {
    console.error('Attendance Cloudinary upload failed:', err.message);
  }

  return localUrl;
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
