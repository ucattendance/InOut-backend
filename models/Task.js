const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD format
  task: { type: String, required: true },
  done: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Task', TaskSchema);
