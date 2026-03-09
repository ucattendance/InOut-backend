const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const uploadProfile = require('../middleware/uploadProfile');
const multer = require('multer');
const upload = multer(); // memory storage for letter uploads
const userController = require('../controllers/userController');

// ✅ GET all users
router.get('/', auth, userController.getAllUsers);

// ✅ GET my profile (logged in user)
router.get('/me', auth, userController.getLoggedInUser);


router.get('/profile',auth,userController.getProfile);

// Upload profile picture (stores image in Cloudinary under profile_pictures/<userId>)
router.post('/profile/upload', auth, uploadProfile.single('profilePic'), userController.uploadProfilePic);

// Upload generated letter PDF and store in Cloudinary under letter_copies/<candidateId>
router.post('/letters/upload', auth, upload.single('letter'), userController.uploadLetter);

router.put('/profile',auth, userController.updateProfile);
// ✅ GET schedules for admin

// ✅ GET user by ID
router.get('/:id', auth, role('admin'), userController.getSingleUser);

// ✅ UPDATE user
router.put('/:id', auth, role('admin'), userController.updateUser);


// ✅ DELETE user
// router.delete('/:id', auth, role('admin'), userController.deleteUser);

// ✅ UPDATE salary
router.put('/:id/salary', auth, role('admin'), userController.updateSalary);

module.exports = router;