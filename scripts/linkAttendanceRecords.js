/**
 * Fix legacy attendance rows where `user` was stored as employeeId (UC0031)
 * instead of MongoDB User _id. Run once on production DB:
 *   node scripts/linkAttendanceRecords.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const User = require('../models/User');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set MONGO_URI in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const users = await User.find({ employeeId: { $exists: true, $ne: '' } }).select(
    '_id employeeId name email'
  );
  const byEmployeeId = new Map(users.map((u) => [String(u.employeeId), u]));

  const all = await Attendance.find({}).select('user _id');
  let linked = 0;
  let skipped = 0;

  for (const row of all) {
    const raw = row.user;
    if (!raw) {
      skipped++;
      continue;
    }

    const rawStr = String(raw);
    const match = byEmployeeId.get(rawStr);
    if (!match) continue;

    if (String(match._id) !== rawStr) {
      await Attendance.updateOne({ _id: row._id }, { $set: { user: match._id } });
      linked++;
      console.log(`Linked ${row._id} → ${match.name} (${match.employeeId})`);
    }
  }

  console.log(`Done. Linked ${linked} records, skipped ${skipped} without user field.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
