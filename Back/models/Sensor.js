const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, default: 'SIM-AWG-01' },
  waterLevel: { type: Number, required: true },
  humidity: { type: Number, required: true },
  temp: { type: Number, required: true },
  waterTemp: { type: Number, required: true },
  tds: { type: Number, required: true },
  flowRate: { type: Number, required: true },
  battery: { type: Number, required: true },
  trend: { type: String, default: 'increasing' },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Sensor', sensorSchema);
