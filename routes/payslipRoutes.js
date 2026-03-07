// routes/payslipRoutes.js
const express = require("express");
const { createPayslip, getPayslips } = require("../controllers/payslipController");

const router = express.Router();

// POST → create payslip
router.post("/", createPayslip);

// GET → fetch all payslips
router.get("/", getPayslips);

module.exports = router;
