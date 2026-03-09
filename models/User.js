const mongoose = require('mongoose');

// Define BankDetails as a sub-schema
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
}, { _id: false }); // Prevents creation of an _id for this sub-doc

// Main User schema
const UserSchema = new mongoose.Schema({
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
  // Date when the user was relieved/left the company. If absent => currently working
  dateOfRelieving: {
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
  ,
  // Sequential employee identifier (e.g. UC0001, JZ0001)
  employeeId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  // Stored letter copies uploaded for this user (PDFs)
  letterCopies: {
    type: [
      {
        url: { type: String },
        filename: { type: String },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        uploadedAt: { type: Date, default: Date.now }
      }
    ],
    default: []
  }

}, {
  timestamps: true
});

// Generate sequential employeeId if not present using a Counter collection.
// Format: <PREFIX><4-digit seq>, e.g. UC0001, JZ0001
UserSchema.pre('save', async function (next) {
  try {
    if (this.employeeId) return next();

    // decide prefix based on company
    const company = (this.company || '').toLowerCase();
    let prefix = 'UC';
    if (company.includes('urbancode')) prefix = 'UC';
    else if (company.includes('jobzenter')) prefix = 'JZ';
    else {
      // fallback: first two letters of company or UC
      const letters = (this.company || 'UC').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
      prefix = letters.length === 2 ? letters : 'UC';
    }

    const Counter = require('./Counter');
    const counter = await Counter.findOneAndUpdate(
      { _id: prefix },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    ).exec();

    const seq = counter.seq || 1;
    const padded = String(seq).padStart(4, '0');
    this.employeeId = `${prefix}${padded}`;

    return next();
  } catch (err) {
    return next(err);
  }
});

module.exports = mongoose.model('User', UserSchema);
