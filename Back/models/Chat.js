const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deviceId: { type: String, default: 'SIM-AWG-01' },
  userMsg: { type: String, required: true },
  aiReply: { type: String, required: true },
  context: { type: Object },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Chat', chatSchema);
