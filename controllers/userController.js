// -----------------------------
// 📁 controllers/userController.js
// -----------------------------
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Schedule = require('../models/Schedule');


const userController = {
  getAllUsers: async (req, res) => {
    try {
  const users = await User.find( { name: { $ne: "Admin" } },{
         
        name: 1,
        email: 1,
        role: 1,
        phone: 1,
        position: 1,
        company: 1,
        salary: 1,
        department: 1,
        qualification: 1,
        dateOfJoining: 1,
    dateOfRelieving: 1,
  address: 1,
  bloodGroup:  1,
        isActive: 1,
    profilePic: 1,
    letterCopies: 1,
        skills: 1,
        rolesAndResponsibility: 1,
        bankDetails: 1,
        adminComments: 1,
        employeeId: 1,
        createdAt: 1,
        updatedAt: 1
      }).sort({name: 1});

      res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  },

  getSingleUser: async (req, res) => {
    try {
      const user = await User.findById(req.params.id).select('-password');

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
  getProfile: async (req, res) => {
    try {
      // auth middleware sets req.user
      const userId = (req.user && req.user._id) || null;

      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const user = await User.findById(userId).select('-password');

      if (!user) return res.status(404).json({ message: 'User not found' });

      res.json(user);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  updateProfile: async (req, res) => {
    try {
      const userId = (req.user && req.user._id) || null;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      // Only allow a whitelist of updatable fields to avoid mass assignment
      const {
        name,
        email,
        password,
        phone,
        position,
        company,
        salary,
        address,
        bloodGroup,
        department,
        qualification,
        dateOfJoining,
        dateOfRelieving,
        skills,
        rolesAndResponsibility,
        profilePic,
        bankDetails,
        isActive
      } = req.body;

      const updateData = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (phone) updateData.phone = phone;
      if (position) updateData.position = position;
      if (company) updateData.company = company;
      if (salary !== undefined && salary !== null && salary !== '') updateData.salary = Number(salary);
      if (address) updateData.address = address;
      if (bloodGroup) updateData.bloodGroup = bloodGroup;
      if (department) updateData.department = department;
      if (qualification) updateData.qualification = qualification;
      if (profilePic) updateData.profilePic = profilePic;
      if (Array.isArray(skills)) updateData.skills = skills;
      if (Array.isArray(rolesAndResponsibility)) updateData.rolesAndResponsibility = rolesAndResponsibility;
      if (bankDetails && typeof bankDetails === 'object') updateData.bankDetails = bankDetails;
      if (dateOfJoining) updateData.dateOfJoining = new Date(dateOfJoining);
  if (dateOfRelieving) updateData.dateOfRelieving = new Date(dateOfRelieving);
      if (password) updateData.password = await bcrypt.hash(password, 10);
      if (isActive !== undefined) updateData.isActive = isActive;

      const updated = await User.findByIdAndUpdate(userId, updateData, { new: true }).select('-password');

      if (!updated) return res.status(404).json({ message: 'User not found' });

      res.json(updated);
    } catch (error) {
      console.error('Error in updateProfile:', error);
      res.status(500).json({ message: error.message });
    }
  },

  getLoggedInUser: async (req, res) => {
    try {
      const user = await User.findById(req.user._id).select('-password');
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  updateUser: async (req, res) => {
  try {
    console.log("Entering update user");
    const {
      name,
      email,
      password,
      phone,
      position,
      company,
      salary,
      address,
      bloodGroup,
      department,
      qualification,
      dateOfJoining,
      dateOfRelieving,
      skills,
      rolesAndResponsibility,
      profilePic,
      bankDetails,
      isActive,
      employeeId
      ,
      adminComments
    } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (position) updateData.position = position;
    if (company) updateData.company = company;
    if (salary !== undefined) updateData.salary = salary;
    if (department) updateData.department = department;
    if (qualification) updateData.qualification = qualification;
    if (profilePic) updateData.profilePic = profilePic;
  if (address) updateData.address = address;
  if (bloodGroup) updateData.bloodGroup = bloodGroup;
    if (Array.isArray(skills)) updateData.skills = skills;
    if (Array.isArray(rolesAndResponsibility)) updateData.rolesAndResponsibility = rolesAndResponsibility;
    if (bankDetails && typeof bankDetails === 'object') updateData.bankDetails = bankDetails;
    if (dateOfJoining) updateData.dateOfJoining = new Date(dateOfJoining);
  if (dateOfRelieving) updateData.dateOfRelieving = new Date(dateOfRelieving);
    if (password) updateData.password = await bcrypt.hash(password, 10);
    
    // Add isActive field
    if (isActive !== undefined) updateData.isActive = isActive;
  // allow admin to set/update employeeId when updating a user
  if (employeeId) updateData.employeeId = employeeId;
    // adminComments can be empty string; allow explicit set (including empty)
    if (adminComments !== undefined) updateData.adminComments = adminComments;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).select('-password');

    if (!updatedUser) return res.status(404).json({ error: 'User not found' });

    res.json({ message: 'User updated successfully', user: updatedUser });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
},

  updateSalary: async (req, res) => {
    try {
      const { salary } = req.body;
      if (!salary || isNaN(salary)) return res.status(400).json({ error: 'Invalid salary value' });

      const updatedUser = await User.findByIdAndUpdate(
        req.params.id,
        { salary },
        { new: true }
      ).select('-password');

      if (!updatedUser) return res.status(404).json({ error: 'User not found' });

      res.json({ message: 'Salary updated successfully', user: updatedUser });
    } catch (error) {
      console.error('Error updating salary:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getEmployeesForAttendance: async (req, res) => {
    try {
      const users = await User.find({ role: 'employee' }, '_id name email role employeeId');
      res.json(users);
    } catch (err) {
      console.error('Error fetching users:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Upload profile picture and save URL to user.profilePic
  uploadProfilePic: async (req, res) => {
    try {
      const userId = (req.user && req.user._id) || null;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      // multer-storage-cloudinary sets file.path to the uploaded image URL
      const imageUrl = req.file && (req.file.path || req.file.location || req.file.url);
      if (!imageUrl) return res.status(400).json({ message: 'No image uploaded' });

      const updated = await User.findByIdAndUpdate(userId, { profilePic: imageUrl }, { new: true }).select('-password');
      if (!updated) return res.status(404).json({ message: 'User not found' });

      res.json(updated);
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      res.status(500).json({ message: error.message });
    }
  },

  // Upload a generated letter PDF and attach it to the candidate's user record
  uploadLetter: async (req, res) => {
    try {
      const uploaderId = (req.user && req.user._id) || null;
      if (!uploaderId) return res.status(401).json({ message: 'Unauthorized' });

      // multer memory storage puts file buffer in req.file.buffer
      const file = req.file;
      if (!file || !file.buffer) return res.status(400).json({ message: 'No file uploaded' });

  let candidateId = req.body.candidateId;
  // if caller doesn't provide a candidateId, attach to uploader's own record
  if (!candidateId) candidateId = uploaderId;
  if (!candidateId) return res.status(400).json({ message: 'candidateId is required' });

      const cloudinary = require('../config/cloudinary');

      // upload buffer to Cloudinary using upload_stream (resource_type raw for PDFs)
      const streamUpload = (buffer, options) => new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
          if (result) resolve(result);
          else reject(error);
        });
        // create readable stream from buffer
        const { Readable } = require('stream');
        const readable = new Readable();
        readable._read = () => {}; // _read is required but we push manually
        readable.push(buffer);
        readable.push(null);
        readable.pipe(stream);
      });

      const folder = `letter_copies/${candidateId}`;
      const opts = { folder, resource_type: 'raw' };
      const result = await streamUpload(file.buffer, opts);

      const fileUrl = result.secure_url || result.url;
      const filename = result.original_filename || result.public_id || file.originalname || 'letter.pdf';

      // push metadata into candidate's record
      const updated = await User.findByIdAndUpdate(candidateId, { $push: { letterCopies: { url: fileUrl, filename, uploadedBy: uploaderId, uploadedAt: new Date() } } }, { new: true }).select('-password');
      if (!updated) return res.status(404).json({ message: 'Candidate not found' });

      res.json({ message: 'Uploaded', url: fileUrl, user: updated });
    } catch (error) {
      console.error('Error uploading letter:', error);
      res.status(500).json({ message: error.message });
    }
  },

};

module.exports = userController;
