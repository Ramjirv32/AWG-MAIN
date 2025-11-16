const Sensor = require('../models/Sensor');
const History = require('../models/History');
const Alert = require('../models/Alert');

const rand = (min, max) => Math.random() * (max - min) + min;

let sessionStart = null;
let lastGoodValues = {
  waterLevel: 0,
  humidity: 65,
  temp: 25,
  waterTemp: 20,
  tds: 50,
  flowRate: 0.5,
  battery: 80
};

const validate = (val, min, max, lastGood) => {
  if (val < min || val > max || isNaN(val)) {
    return lastGood;
  }
  return val;
};

const smoothData = async () => {
  try {
    const recent = await Sensor.find().sort({ timestamp: -1 }).limit(5);
    if (recent.length < 3) return null;

    return {
      flowRate: parseFloat((recent.reduce((s, r) => s + r.flowRate, 0) / recent.length).toFixed(2)),
      humidity: Math.floor(recent.reduce((s, r) => s + r.humidity, 0) / recent.length),
      temp: Math.floor(recent.reduce((s, r) => s + r.temp, 0) / recent.length)
    };
  } catch {
    return null;
  }
};

const genData = async () => {
  try {
    const prev = await Sensor.findOne().sort({ timestamp: -1 });
    
    let newLevel = 0;
    let trend = 'increasing';
    
    if (!prev) {
      newLevel = Math.floor(rand(1, 5));
      sessionStart = new Date();
      console.log('🆕 New session started');
    } else {
      const increase = Math.floor(rand(1, 4));
      newLevel = prev.waterLevel + increase;
      
      if (newLevel >= 100) {
        newLevel = 100;
        trend = 'full';
        
        const sensor = new Sensor({
          deviceId: 'SIM-AWG-01',
          waterLevel: 100,
          humidity: validate(Math.floor(rand(50, 85)), 10, 100, lastGoodValues.humidity),
          temp: validate(Math.floor(rand(20, 35)), -10, 60, lastGoodValues.temp),
          waterTemp: validate(Math.floor(rand(15, 30)), 0, 50, lastGoodValues.waterTemp),
          tds: validate(Math.floor(rand(20, 90)), 0, 500, lastGoodValues.tds),
          flowRate: validate(parseFloat(rand(0.2, 1.0).toFixed(2)), 0, 5, lastGoodValues.flowRate),
          battery: validate(Math.floor(rand(40, 100)), 0, 100, lastGoodValues.battery),
          trend: 'full'
        });
        await sensor.save();
        
        console.log('💧 100% (full)');
        await saveHistory();
        await Sensor.deleteMany({});
        sessionStart = null;
        console.log('✅ Bottle Full! History saved, starting new session...');
        return;
      } else {
        trend = 'increasing';
      }
    }

    let rawHumidity = Math.floor(rand(50, 85));
    let rawTemp = Math.floor(rand(20, 35));
    let rawWaterTemp = Math.floor(rand(15, 30));
    let rawTds = Math.floor(rand(20, 90));
    let rawFlowRate = parseFloat(rand(0.2, 1.0).toFixed(2));
    let rawBattery = Math.floor(rand(40, 100));

    const smoothed = await smoothData();
    if (smoothed) {
      rawFlowRate = smoothed.flowRate;
      rawHumidity = smoothed.humidity;
      rawTemp = smoothed.temp;
    }

    const validHumidity = validate(rawHumidity, 10, 100, lastGoodValues.humidity);
    const validTemp = validate(rawTemp, -10, 60, lastGoodValues.temp);
    const validWaterTemp = validate(rawWaterTemp, 0, 50, lastGoodValues.waterTemp);
    const validTds = validate(rawTds, 0, 500, lastGoodValues.tds);
    const validFlowRate = validate(rawFlowRate, 0, 5, lastGoodValues.flowRate);
    const validBattery = validate(rawBattery, 0, 100, lastGoodValues.battery);

    lastGoodValues = {
      waterLevel: newLevel,
      humidity: validHumidity,
      temp: validTemp,
      waterTemp: validWaterTemp,
      tds: validTds,
      flowRate: validFlowRate,
      battery: validBattery
    };

    const data = {
      deviceId: 'SIM-AWG-01',
      waterLevel: newLevel,
      humidity: validHumidity,
      temp: validTemp,
      waterTemp: validWaterTemp,
      tds: validTds,
      flowRate: parseFloat(validFlowRate.toFixed(2)),
      battery: validBattery,
      trend
    };

    const sensor = new Sensor(data);
    await sensor.save();
    
    console.log(`💧 ${data.waterLevel}% (${trend}) | Flow: ${data.flowRate} L/min | Hum: ${data.humidity}%`);

    await checkAlerts(data);
  } catch (err) {
    console.error('Gen error:', err.message);
  }
};

const saveHistory = async () => {
  const all = await Sensor.find().sort({ timestamp: 1 });
  
  if (all.length === 0) return;

  const avgFlow = all.reduce((s, r) => s + r.flowRate, 0) / all.length;
  const avgHum = all.reduce((s, r) => s + r.humidity, 0) / all.length;
  const avgTemp = all.reduce((s, r) => s + r.temp, 0) / all.length;
  const avgTDS = all.reduce((s, r) => s + r.tds, 0) / all.length;
  
  const start = all[0].timestamp;
  const end = all[all.length - 1].timestamp;
  const duration = Math.floor((end - start) / 1000 / 60);

  const history = new History({
    deviceId: 'SIM-AWG-01',
    startTime: start,
    endTime: end,
    totalWater: 100,
    avgFlowRate: parseFloat(avgFlow.toFixed(2)),
    avgHumidity: Math.floor(avgHum),
    avgTemp: Math.floor(avgTemp),
    avgTDS: Math.floor(avgTDS),
    fillDuration: duration,
    totalReadings: all.length
  });

  await history.save();
};

const checkAlerts = async (data) => {
  const alerts = [];

  // Water level alerts
  if (data.waterLevel >= 100) {
    alerts.push({
      deviceId: data.deviceId,
      type: 'water_level',
      level: 'success',
      message: '✅ Bottle is FULL - Ready to drink!',
      value: data.waterLevel
    });
  } else if (data.waterLevel <= 10) {
    alerts.push({
      deviceId: data.deviceId,
      type: 'water_level',
      level: 'critical',
      message: '❌ Water level critically low',
      value: data.waterLevel
    });
  } else if (data.waterLevel <= 20) {
    alerts.push({
      deviceId: data.deviceId,
      type: 'water_level',
      level: 'low',
      message: '⚠️ Water level low',
      value: data.waterLevel
    });
  } else if (data.waterLevel >= 95) {
    alerts.push({
      deviceId: data.deviceId,
      type: 'water_level',
      level: 'high',
      message: '🔔 Water level almost full',
      value: data.waterLevel
    });
  }

  if (data.humidity < 55) {
    alerts.push({
      deviceId: data.deviceId,
      type: 'humidity',
      level: 'low',
      message: '🔔 Low humidity affects production',
      value: data.humidity
    });
  }

  if (data.tds > 100) {
    alerts.push({
      deviceId: data.deviceId,
      type: 'water_quality',
      level: 'critical',
      message: 'Water quality unsafe - High TDS',
      value: data.tds
    });
  }

  if (data.battery <= 15) {
    alerts.push({
      deviceId: data.deviceId,
      type: 'battery',
      level: 'critical',
      message: 'Battery critically low',
      value: data.battery
    });
  } else if (data.battery <= 25) {
    alerts.push({
      deviceId: data.deviceId,
      type: 'battery',
      level: 'low',
      message: 'Battery low - charge recommended',
      value: data.battery
    });
  }

  if (alerts.length > 0) {
    await Alert.insertMany(alerts);
  }
};

const getLatest = async (req, res) => {
  try {
    const data = await Sensor.findOne().sort({ timestamp: -1 });
    const alerts = await Alert.find({ isRead: false }).sort({ timestamp: -1 }).limit(5);
    res.json({ sensor: data, alerts });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

const getReadings = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const data = await Sensor.find().sort({ timestamp: -1 }).limit(limit);
    res.json(data);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

const fillTime = async (req, res) => {
  try {
    const data = await Sensor.findOne().sort({ timestamp: -1 });
    
    if (!data) {
      return res.json({ msg: 'No data available', time: -1, status: 'no_data' });
    }

    const remaining = 100 - data.waterLevel;
    
    if (remaining <= 0) {
      return res.json({ msg: 'Bottle Full', time: 0, status: 'full' });
    }

    if (data.flowRate <= 0.001) {
      return res.json({ msg: 'Not Filling / Very Low Production', time: -1, status: 'not_filling' });
    }

    const mins = Math.floor(remaining / data.flowRate);
    
    if (mins > 720) {
      return res.json({ 
        msg: '> 12 hrs (Try changing location)', 
        time: mins,
        status: 'slow',
        suggestion: 'Low efficiency detected. Consider moving device to area with higher humidity.'
      });
    }

    const recent = await Sensor.find().sort({ timestamp: -1 }).limit(10);
    if (recent.length >= 5) {
      const humidityTrend = recent[0].humidity - recent[4].humidity;
      const avgFlow = recent.reduce((s, r) => s + r.flowRate, 0) / recent.length;
      
      let prediction = '';
      if (humidityTrend > 5) {
        prediction = `Production likely increasing (Humidity rising to ${recent[0].humidity}%)`;
      } else if (humidityTrend < -5) {
        prediction = `Production may slow down (Humidity dropping to ${recent[0].humidity}%)`;
      }

      const hrs = Math.floor(mins / 60);
      const m = mins % 60;
      
      return res.json({ 
        msg: hrs > 0 ? `${hrs} hr ${m} min` : `${m} min`,
        time: mins,
        status: 'filling',
        avgFlowRate: parseFloat(avgFlow.toFixed(2)),
        prediction: prediction || 'Production stable'
      });
    }

    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    
    res.json({ 
      msg: hrs > 0 ? `${hrs} hr ${m} min` : `${m} min`,
      time: mins,
      status: 'filling'
    });
  } catch (err) {
    console.error('Fill time error:', err);
    res.status(500).json({ msg: 'Sensor error - recalibrating', time: -1, status: 'error' });
  }
};

const getHistory = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const history = await History.find().sort({ date: -1 }).limit(limit);
    res.json(history);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

const getAlerts = async (req, res) => {
  try {
    const alerts = await Alert.find().sort({ timestamp: -1 }).limit(50);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

const markAlertsRead = async (req, res) => {
  try {
    await Alert.updateMany({ isRead: false }, { isRead: true });
    res.json({ msg: 'Alerts marked as read' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

const drinkWater = async (req, res) => {
  try {
    const { remainingLevel } = req.body;
    
    if (remainingLevel === undefined || remainingLevel < 0 || remainingLevel > 100) {
      return res.status(400).json({ error: 'Invalid remaining level (0-100)' });
    }

    const latest = await Sensor.findOne().sort({ timestamp: -1 });
    if (!latest) return res.status(404).json({ error: 'No sensor data' });

    // Update water level to user's specified remaining amount
    latest.waterLevel = remainingLevel;
    latest.trend = remainingLevel >= 100 ? 'full' : 'stable';
    await latest.save();

    console.log(`🥤 User drank water. Remaining: ${remainingLevel}%`);

    res.json({ 
      success: true, 
      message: `Water level set to ${remainingLevel}%`,
      newLevel: remainingLevel 
    });
  } catch (err) {
    console.error('Drink error:', err.message);
    res.status(500).json({ error: 'Failed to update water level' });
  }
};

module.exports = { genData, getLatest, getReadings, fillTime, getHistory, getAlerts, markAlertsRead, drinkWater };

