const mongoose = require('mongoose');

const supportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, default: 'open' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Support', supportSchema);
