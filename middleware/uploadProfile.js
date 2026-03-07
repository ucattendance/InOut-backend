const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// Use a dynamic folder per user (requires auth to run before multer)
const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const userId = (req.user && req.user._id) ? String(req.user._id) : 'anonymous';
    return {
      folder: `profile_pictures/${userId}`,
      allowed_formats: ['jpg', 'jpeg', 'png'],
      transformation: [{ width: 800, height: 800, crop: 'limit' }]
    };
  }
});

const upload = multer({ storage });

module.exports = upload;
