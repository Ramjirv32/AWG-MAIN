const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  date: { type: Date, default: Date.now },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  totalWater: { type: Number, required: true },
  avgFlowRate: { type: Number, required: true },
  avgHumidity: { type: Number, required: true },
  avgTemp: { type: Number, required: true },
  avgTDS: { type: Number, required: true },
  fillDuration: { type: Number, required: true },
  totalReadings: { type: Number, required: true }
});

module.exports = mongoose.model('History', historySchema);
