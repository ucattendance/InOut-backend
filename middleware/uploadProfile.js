const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const { createMulter, withUploadValidation } = require('./uploadValidation');

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

const upload = createMulter('profileImage', storage);

/** Validated profile pic middleware: JPG/PNG, max 2MB */
const uploadProfilePic = withUploadValidation(
  upload.single('profilePic'),
  'profileImage'
);

module.exports = upload;
module.exports.uploadProfilePic = uploadProfilePic;
module.exports.storage = storage;
