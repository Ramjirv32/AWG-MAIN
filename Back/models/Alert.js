const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  type: { type: String, required: true },
  level: { type: String, enum: ['low', 'high', 'critical'], required: true },
  message: { type: String, required: true },
  value: { type: Number },
  isRead: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Alert', alertSchema);
