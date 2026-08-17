const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'attendance_images',
    allowed_formats: ['jpg', 'jpeg', 'png'],
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
});

/**
 * Upload selfie to Cloudinary, but never block check-in/out if Cloudinary fails
 * (quota, timeout, invalid format). Attendance still saves without image.
 */
const optionalAttendanceImage = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('Attendance image upload failed:', err.message || err);
      req.file = undefined;
    }
    next();
  });
};

module.exports = upload;
module.exports.optionalAttendanceImage = optionalAttendanceImage;
