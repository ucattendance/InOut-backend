const mongoose = require("mongoose");

const PayslipSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  employeeId: String,
  employeeDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
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
  viewModelSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
});

module.exports = mongoose.model("Payslip", PayslipSchema);
