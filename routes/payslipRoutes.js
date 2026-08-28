// routes/payslipRoutes.js
const express = require("express");
const auth = require("../middleware/auth");
const role = require("../middleware/role");
const { createPayslip, getPayslips } = require("../controllers/payslipController");

const router = express.Router();

// POST → create payslip (admin / HR only)
router.post("/", auth, role("admin"), createPayslip);

// GET → admin: all payslips; employee: own payslips only
router.get("/", auth, getPayslips);

module.exports = router;
