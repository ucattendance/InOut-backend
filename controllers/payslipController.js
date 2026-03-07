// controllers/payslipController.js
const Payslip = require("../models/Payslip");

// @desc Create new payslip
const createPayslip = async (req, res) => {
  try {
    const {
      userId,
      employeeId,
      employeeDetails,
      attendanceSummary,
      incomes,
      deductions,
      totalIncome,
      totalDeductions,
      netPay,
      month,
      year,
    } = req.body;

    if (!userId || !employeeId || !month || !year) {
      return res.status(400).json({ message: "userId, employeeId, month, and year are required" });
    }

    // fallback calculations (in case frontend didn’t send totals)
    const calcTotalIncome = incomes ? Object.values(incomes).reduce((a, b) => a + b, 0) : 0;
    const calcTotalDeductions = deductions ? Object.values(deductions).reduce((a, b) => a + b, 0) : 0;
    const calcNetPay = calcTotalIncome - calcTotalDeductions;

    const payslip = new Payslip({
      userId,
      employeeId,
      employeeDetails,
      attendanceSummary,
      incomes,
      deductions,
      totalIncome: totalIncome ?? calcTotalIncome,
      totalDeductions: totalDeductions ?? calcTotalDeductions,
      netPay: netPay ?? calcNetPay,
      month,
      year,
    });

    await payslip.save();
    res.status(201).json(payslip);
  } catch (error) {
    console.error("Error creating payslip:", error);
    res.status(500).json({ message: "Error saving payslip", error: error.message });
  }
};

// @desc Get all payslips
const getPayslips = async (req, res) => {
  try {
    const payslips = await Payslip.find().sort({ createdAt: -1 });
    res.json(payslips);
  } catch (error) {
    res.status(500).json({ message: "Error fetching payslips", error });
  }
};

module.exports = {
  createPayslip,
  getPayslips,
};
