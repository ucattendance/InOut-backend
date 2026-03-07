const mongoose = require('mongoose');
const BankDetailsSchema = new mongoose.Schema({
  bankingName: {
    type: String
  },
  bankAccountNumber: {
    type: String
  },
  ifscCode: {
    type: String
  },
  upiId: {
    type: String
  }
}, { _id: false });
const PendingUserSchema = new mongoose.Schema({
 name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: { 
    type: String, 
    required: true 
  },
  phone: {
    type: String,
    required: true
  },
  bloodGroup: {
    type: String
  },
  address: {
    type: String
  },
  position: {
    type: String,
    required: true
  },
  company: {
    type: String,
    required: true
  },
  salary: {
    type: Number,
    default: 0
  },
  role: { 
    type: String, 
    enum: ['employee', 'admin', 'other'], 
    default: 'employee' 
  },

  // Additional fields
  profilePic: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  department: {
    type: String
  },
  qualification: {
    type: String
  },
  dateOfJoining: {
    type: Date
  },
  rolesAndResponsibility: {
    type: [String],
    default: []
  },
  skills: {
    type: [String],
    default: []
  },
  bankDetails: BankDetailsSchema

}, {
  timestamps: true
});


module.exports = mongoose.model('PendingUser', PendingUserSchema);
