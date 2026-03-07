const mongoose = require("mongoose");

const PayslipSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  employeeId: String,
  employeeDetails: {
    name: String,
    designation: String,
    department: String,
    company: String,
    dateOfJoining: { type: Date },
    bankAccountName: String,
    bankAccountNumber: String,
  },
  attendanceSummary: {
    totalDays: Number,
    workingDays: Number,
    presentDays: Number,
    absentDays: Number,
    leaveDays: Number,
    lateDays: Number,
    halfDays: Number,
  },
  incomes: { type: Map, of: Number },
  deductions: { type: Map, of: Number },
  totalIncome: Number,
  totalDeductions: Number,
  netPay: Number,
  month: String,
  year: Number,
});

module.exports = mongoose.model("Payslip", PayslipSchema);
