const Groq = require('groq-sdk');
const Sensor = require('../models/Sensor');
const History = require('../models/History');
const Alert = require('../models/Alert');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// AI Chat endpoint - Smart Groq-powered responses
const aiChat = async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Fetch all necessary data
    const [latestSensor, recentReadings, history, alerts] = await Promise.all([
      Sensor.findOne().sort({ timestamp: -1 }),
      Sensor.find().sort({ timestamp: -1 }).limit(30),
      History.find().sort({ date: -1 }).limit(10),
      Alert.find().sort({ timestamp: -1 }).limit(20)
    ]);

    if (!latestSensor) {
      return res.json({ 
        response: 'No sensor data available yet. System is initializing...',
        data: {},
        timestamp: new Date()
      });
    }

    // Calculate statistics
    const avgFlowRate = (recentReadings.reduce((s, r) => s + r.flowRate, 0) / recentReadings.length).toFixed(2);
    const avgHumidity = Math.round(recentReadings.reduce((s, r) => s + r.humidity, 0) / recentReadings.length);
    const avgTDS = Math.round(recentReadings.reduce((s, r) => s + r.tds, 0) / recentReadings.length);
    const waterTrend = recentReadings.length >= 5 ? recentReadings[0].waterLevel - recentReadings[4].waterLevel : 0;
    const humidityTrend = recentReadings.length >= 5 ? recentReadings[0].humidity - recentReadings[4].humidity : 0;
    
    const criticalAlerts = alerts.filter(a => a.level === 'critical');
    const recentAlerts = alerts.slice(0, 5);

    const contextData = {
      sensor: {
        waterLevel: latestSensor.waterLevel,
        trend: latestSensor.trend,
        humidity: latestSensor.humidity,
        temperature: latestSensor.temp,
        waterTemperature: latestSensor.waterTemp,
        tds: latestSensor.tds,
        flowRate: latestSensor.flowRate,
        battery: latestSensor.battery,
        timestamp: latestSensor.timestamp
      },
      averages: {
        flowRate: Number(avgFlowRate),
        humidity: avgHumidity,
        tds: avgTDS
      },
      trends: {
        water: waterTrend,
        humidity: humidityTrend
      },
      history: history.map(entry => ({
        date: entry.date,
        fillDuration: entry.fillDuration,
        liters: entry.liters
      })),
      alerts: recentAlerts.map(alert => ({
        message: alert.message,
        level: alert.level,
        timestamp: alert.timestamp
      })),
      criticalAlertCount: criticalAlerts.length
    };

    // Call Groq API
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: JSON.stringify(contextData) },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 400,
      top_p: 1,
      stream: false
    });

    const responseText = completion.choices[0]?.message?.content || 'Sorry, I could not process that request.';

    res.json({
      response: responseText,
      data: {
        current: {
          waterLevel: latestSensor.waterLevel,
          humidity: latestSensor.humidity,
          flowRate: latestSensor.flowRate,
          tds: latestSensor.tds,
          battery: latestSensor.battery,
          temp: latestSensor.temp,
          trend: latestSensor.trend
        },
        averages: {
          flowRate: avgFlowRate,
          humidity: avgHumidity,
          tds: avgTDS
        },
        trends: {
          water: waterTrend,
          humidity: humidityTrend
        },
        alerts: {
          total: alerts.length,
          critical: criticalAlerts.length,
          recent: recentAlerts.length
        }
      },
      timestamp: new Date()
    });
  } catch (err) {
    console.error('AI Chat error:', err);
    res.status(500).json({ 
      error: 'AI temporarily unavailable. Please try again.',
      response: 'Sorry, I\'m having trouble connecting right now. Please try again in a moment.',
      timestamp: new Date()
    });
  }
};

// Get all data for AI context
const getAIContext = async (req, res) => {
  try {
    const [latestSensor, recentReadings, history, alerts] = await Promise.all([
      Sensor.findOne().sort({ timestamp: -1 }),
      Sensor.find().sort({ timestamp: -1 }).limit(50),
      History.find().sort({ date: -1 }).limit(20),
      Alert.find().sort({ timestamp: -1 }).limit(30)
    ]);

    const stats = {
      current: latestSensor || {},
      averages: {
        flowRate: recentReadings.length > 0 
          ? (recentReadings.reduce((s, r) => s + r.flowRate, 0) / recentReadings.length).toFixed(2)
          : 0,
        humidity: recentReadings.length > 0 
          ? Math.round(recentReadings.reduce((s, r) => s + r.humidity, 0) / recentReadings.length)
          : 0,
        tds: recentReadings.length > 0 
          ? Math.round(recentReadings.reduce((s, r) => s + r.tds, 0) / recentReadings.length)
          : 0,
      },
      history: {
        totalSessions: history.length,
        recentSessions: history.slice(0, 5)
      },
      alerts: {
        total: alerts.length,
        critical: alerts.filter(a => a.level === 'critical').length,
        recent: alerts.slice(0, 10)
      }
    };

    res.json({
      current: latestSensor,
      recentReadings: recentReadings.slice(0, 20),
      history: history.slice(0, 10),
      alerts: alerts.slice(0, 15),
      stats
    });
  } catch (err) {
    console.error('AI Context error:', err);
    res.status(500).json({ error: 'Failed to fetch context' });
  }
};

module.exports = { aiChat, getAIContext };
