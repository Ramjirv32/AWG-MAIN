const Sensor = require('../models/Sensor');
const History = require('../models/History');
const Alert = require('../models/Alert');

// AI Chat endpoint - provides intelligent responses based on all data
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

    // Calculate statistics
    const stats = calculateStats(latestSensor, recentReadings, history);
    
    // Generate AI response based on message intent
    const response = generateResponse(message.toLowerCase(), latestSensor, stats, history, alerts);

    res.json({
      response: response.text,
      data: response.data,
      timestamp: new Date()
    });
  } catch (err) {
    console.error('AI Chat error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
};

// Get all data for AI context
const getAIContext = async (req, res) => {
  try {
    const [latestSensor, recentReadings, history, alerts, allSensors] = await Promise.all([
      Sensor.findOne().sort({ timestamp: -1 }),
      Sensor.find().sort({ timestamp: -1 }).limit(50),
      History.find().sort({ date: -1 }).limit(20),
      Alert.find().sort({ timestamp: -1 }).limit(30),
      Sensor.countDocuments()
    ]);

    // Calculate comprehensive statistics
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
        temp: recentReadings.length > 0 
          ? (recentReadings.reduce((s, r) => s + r.temp, 0) / recentReadings.length).toFixed(1)
          : 0,
      },
      trends: {
        waterLevelTrend: recentReadings.length >= 10 
          ? recentReadings[0].waterLevel - recentReadings[9].waterLevel
          : 0,
        humidityTrend: recentReadings.length >= 10 
          ? recentReadings[0].humidity - recentReadings[9].humidity
          : 0,
      },
      history: {
        totalSessions: history.length,
        avgFillDuration: history.length > 0 
          ? Math.round(history.reduce((s, h) => s + h.fillDuration, 0) / history.length)
          : 0,
        totalWaterProduced: history.length * 100, // Each session = 100%
      },
      alerts: {
        total: alerts.length,
        critical: alerts.filter(a => a.level === 'critical').length,
        warnings: alerts.filter(a => a.level === 'low').length,
      },
      totalReadings: allSensors
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

// Calculate statistics helper
function calculateStats(latest, readings, history) {
  if (!latest || readings.length === 0) {
    return {
      avgFlowRate: 0,
      avgHumidity: 0,
      avgTDS: 0,
      waterTrend: 0,
      totalSessions: history.length
    };
  }

  return {
    current: {
      waterLevel: latest.waterLevel,
      humidity: latest.humidity,
      flowRate: latest.flowRate,
      tds: latest.tds,
      battery: latest.battery,
      temp: latest.temp
    },
    avgFlowRate: (readings.reduce((s, r) => s + r.flowRate, 0) / readings.length).toFixed(2),
    avgHumidity: Math.round(readings.reduce((s, r) => s + r.humidity, 0) / readings.length),
    avgTDS: Math.round(readings.reduce((s, r) => s + r.tds, 0) / readings.length),
    waterTrend: readings.length >= 5 ? readings[0].waterLevel - readings[4].waterLevel : 0,
    humidityTrend: readings.length >= 5 ? readings[0].humidity - readings[4].humidity : 0,
    totalSessions: history.length,
    lastSession: history.length > 0 ? history[0] : null
  };
}

// Generate intelligent response
function generateResponse(message, latest, stats, history, alerts) {
  const msg = message.toLowerCase();
  
  // System identity prefix (only for first-time/help queries)
  const identity = "I'm the AWG Assistant, here to help you monitor and optimize your Atmospheric Water Generator. ";

  // Contextual queries - "what to do", "help", "fix"
  if (msg.includes('what') && (msg.includes('do') || msg.includes('fix')) || 
      msg.includes('how to fix') || msg.includes('solution') || msg.includes('resolve') ||
      msg.includes('why') && (msg.includes('alert') || msg.includes('low') || msg.includes('problem'))) {
    
    const recommendations = [];
    const waterLevel = latest?.waterLevel || 0;
    const humidity = latest?.humidity || 0;
    const tds = latest?.tds || 0;
    const flowRate = latest?.flowRate || 0;
    const battery = latest?.battery || 0;
    const criticalAlerts = alerts.filter(a => a.level === 'critical');
    
    // Check all conditions and provide specific solutions
    if (waterLevel < 10) {
      recommendations.push('💧 **Water Level Critical (<10%)**:\n   - System is running normally, just needs time to fill\n   - If humidity is good (>60%), expect faster production\n   - Drink button will enable at 1%\n   - Current rate: ' + flowRate.toFixed(2) + ' L/min');
    }
    if (waterLevel < 30 && waterLevel >= 10) {
      recommendations.push('💧 **Low Water Level (' + Math.round(waterLevel) + '%)**:\n   - This is normal during filling process\n   - Be patient, system is working\n   - Check back in 10-15 minutes');
    }
    if (humidity < 50) {
      recommendations.push('💨 **Low Humidity (' + humidity + '%)**:\n   - Move device to more humid area (bathroom, kitchen)\n   - Production will be slower in dry conditions\n   - Consider using during night when humidity is higher');
    }
    if (tds > 100) {
      recommendations.push('⚠️ **High TDS (' + tds + ' ppm)**:\n   - Replace water filters soon\n   - Clean condensation chamber\n   - Check for mineral buildup');
    }
    if (flowRate < 0.3) {
      recommendations.push('⚠️ **Low Flow Rate (' + flowRate.toFixed(2) + ' L/min)**:\n   - Check device vents are not blocked\n   - Ensure fan is running properly\n   - Verify humidity sensor is working');
    }
    if (battery < 30) {
      recommendations.push('🔋 **Low Battery (' + battery + '%)**:\n   - Connect charger immediately\n   - System may shut down below 10%\n   - Charge to 100% for best performance');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('✅ **System Status: Excellent**\n   - All metrics within normal range\n   - No action required\n   - Keep up the good maintenance!');
    }

    return {
      text: `🔧 **Action Plan:**\n\n${recommendations.join('\n\n')}\n\n📊 **Current Status:**\n- Water: ${Math.round(waterLevel)}%\n- Humidity: ${humidity}%\n- Flow: ${flowRate.toFixed(2)} L/min\n- TDS: ${tds} ppm\n- Battery: ${battery}%${
        criticalAlerts.length > 0 ? '\n\n🚨 Priority: Address ' + criticalAlerts.length + ' critical alerts first!' : ''
      }`,
      data: { recommendations, currentStatus: latest, criticalCount: criticalAlerts.length }
    };
  }

  // Water level queries
  if (msg.includes('water level') || msg.includes('how much water')) {
    return {
      text: `Current water level is **${latest?.waterLevel || 0}%**. ${
        latest?.waterLevel >= 90 ? 'Almost full! Ready to drink.' :
        latest?.waterLevel >= 50 ? 'Filling nicely. More than halfway there.' :
        latest?.waterLevel >= 20 ? 'Still filling. Be patient!' :
        'Just started. Give it some time.'
      }`,
      data: { waterLevel: latest?.waterLevel, trend: stats.waterTrend }
    };
  }

  // Fill time queries
  if (msg.includes('when') || msg.includes('how long') || msg.includes('fill') || msg.includes('ready')) {
    const remaining = 100 - (latest?.waterLevel || 0);
    const flowRate = latest?.flowRate || 0.5;
    const estimatedMinutes = Math.round(remaining / flowRate);
    const hours = Math.floor(estimatedMinutes / 60);
    const mins = estimatedMinutes % 60;
    
    return {
      text: `Estimated time to full: **${hours > 0 ? `${hours}h ${mins}m` : `${mins} minutes`}**. Current flow rate: ${flowRate.toFixed(2)} L/min. ${
        flowRate < 0.3 ? 'Flow is slow - consider moving to a more humid location.' :
        flowRate >= 0.6 ? 'Excellent flow rate! Production is optimal.' :
        'Flow rate is good.'
      }`,
      data: { estimatedMinutes, flowRate, remaining }
    };
  }

  // Water quality queries
  if (msg.includes('quality') || msg.includes('safe') || msg.includes('drink') || msg.includes('tds')) {
    const tds = latest?.tds || 0;
    return {
      text: `Water quality (TDS): **${tds} ppm**. ${
        tds <= 50 ? '✅ Excellent quality! Perfect for drinking.' :
        tds <= 100 ? '✅ Safe to drink. Good quality water.' :
        tds <= 150 ? '⚠️ Acceptable but not ideal. Consider filtration.' :
        '❌ Unsafe! TDS too high. Do not drink.'
      } Average TDS over last 30 readings: ${stats.avgTDS} ppm.`,
      data: { tds, avgTDS: stats.avgTDS, safe: tds <= 100 }
    };
  }

  // Humidity queries
  if (msg.includes('humidity') || msg.includes('humid')) {
    const humidity = latest?.humidity || 0;
    return {
      text: `Current humidity: **${humidity}%**. Average: ${stats.avgHumidity}%. ${
        humidity >= 70 ? '✅ Excellent! High humidity = better water production.' :
        humidity >= 50 ? '✓ Good humidity level for water generation.' :
        humidity >= 30 ? '⚠️ Low humidity affects production. Consider relocating device.' :
        '❌ Very low humidity! Production will be slow.'
      } Trend: ${stats.humidityTrend > 0 ? `Rising (+${stats.humidityTrend.toFixed(1)}%)` : stats.humidityTrend < 0 ? `Falling (${stats.humidityTrend.toFixed(1)}%)` : 'Stable'}.`,
      data: { humidity, avgHumidity: stats.avgHumidity, trend: stats.humidityTrend }
    };
  }

  // Performance queries
  if (msg.includes('performance') || msg.includes('efficiency') || msg.includes('how') && msg.includes('doing')) {
    const flowRate = parseFloat(stats.avgFlowRate);
    const efficiency = flowRate >= 0.6 ? 'Excellent' : flowRate >= 0.4 ? 'Good' : flowRate >= 0.2 ? 'Fair' : 'Poor';
    
    return {
      text: `System performance: **${efficiency}**\n\n📊 **Statistics:**\n- Avg Flow Rate: ${stats.avgFlowRate} L/min\n- Avg Humidity: ${stats.avgHumidity}%\n- Avg TDS: ${stats.avgTDS} ppm\n- Water Trend: ${stats.waterTrend > 0 ? `↑ Rising (+${stats.waterTrend.toFixed(1)}%)` : stats.waterTrend < 0 ? `↓ Falling (${stats.waterTrend.toFixed(1)}%)` : '→ Stable'}\n- Total Sessions: ${stats.totalSessions}`,
      data: stats
    };
  }

  // History queries
  if (msg.includes('history') || msg.includes('past') || msg.includes('previous')) {
    const totalSessions = history.length;
    const totalWater = totalSessions * 2; // Assuming 2L per bottle
    const avgDuration = history.length > 0 
      ? Math.round(history.reduce((s, h) => s + h.fillDuration, 0) / history.length)
      : 0;
    
    return {
      text: `📊 **Production History:**\n- Total Sessions: ${totalSessions}\n- Total Water Generated: ~${totalWater}L\n- Avg Fill Duration: ${Math.floor(avgDuration / 60)}h ${avgDuration % 60}m\n- Last Session: ${history.length > 0 ? `${history[0].fillDuration} min (${new Date(history[0].date).toLocaleDateString()})` : 'None yet'}`,
      data: { totalSessions, totalWater, avgDuration, recentHistory: history.slice(0, 5) }
    };
  }

  // Alert/problem queries
  if (msg.includes('alert') || msg.includes('problem') || msg.includes('issue') || msg.includes('warning')) {
    const recentAlerts = alerts.slice(0, 5);
    const criticalCount = alerts.filter(a => a.level === 'critical').length;
    
    // Provide immediate action advice
    let actionAdvice = '';
    if (criticalCount > 0) {
      actionAdvice = '\n\n💡 **What to do:**\n';
      if (alerts.some(a => a.message.includes('low') && a.message.includes('water'))) {
        actionAdvice += '- Water level is low but this is NORMAL during filling\n- System is working fine, just needs time\n- Production rate depends on humidity (currently ' + (latest?.humidity || 0) + '%)\n- Drink button enables at 1% water level';
      } else if (alerts.some(a => a.message.includes('battery'))) {
        actionAdvice += '- Connect charger immediately to prevent shutdown\n- System needs power to continue production';
      } else if (alerts.some(a => a.message.includes('tds') || a.message.includes('quality'))) {
        actionAdvice += '- Check and replace water filters\n- Clean condensation chamber\n- Verify no contamination';
      }
    }
    
    return {
      text: `⚠️ **Recent Alerts:**${recentAlerts.length > 0 ? `\n${recentAlerts.map(a => `- ${a.message} (${new Date(a.timestamp).toLocaleString()})`).join('\n')}` : '\n✅ No recent alerts. System running smoothly!'}${
        criticalCount > 0 ? `\n\n🚨 ${criticalCount} critical alerts detected` : ''
      }${actionAdvice}`,
      data: { alerts: recentAlerts, criticalCount }
    };
  }

  // Battery queries
  if (msg.includes('battery') || msg.includes('power') || msg.includes('charge')) {
    const battery = latest?.battery || 0;
    return {
      text: `🔋 Battery level: **${battery}%**. ${
        battery >= 80 ? '✅ Fully charged and healthy.' :
        battery >= 50 ? '✓ Good battery level.' :
        battery >= 25 ? '⚠️ Battery getting low. Charge soon.' :
        '❌ Critical! Charge immediately.'
      }`,
      data: { battery }
    };
  }

  // Status/overview queries
  if (msg.includes('status') || msg.includes('overview') || msg.includes('summary') || msg.includes('hello') || msg.includes('hi')) {
    return {
      text: `👋 **AWG System Status:**\n\n💧 Water Level: ${latest?.waterLevel || 0}%\n🌊 Flow Rate: ${latest?.flowRate || 0} L/min\n💨 Humidity: ${latest?.humidity || 0}%\n✨ Water Quality: ${latest?.tds || 0} ppm (${latest?.tds <= 100 ? 'Safe' : 'Check quality'})\n🔋 Battery: ${latest?.battery || 0}%\n🌡️ Temperature: ${latest?.temp || 0}°C\n\n📊 Total Sessions: ${stats.totalSessions}\n⚡ Avg Flow: ${stats.avgFlowRate} L/min\n\nAsk me anything about your system!`,
      data: { ...stats.current, stats }
    };
  }

  // Temperature queries
  if (msg.includes('temperature') || msg.includes('temp') || msg.includes('hot') || msg.includes('cold')) {
    const temp = latest?.temp || 0;
    const waterTemp = latest?.waterTemp || 0;
    return {
      text: `🌡️ **Temperature:**\n- Ambient: ${temp}°C\n- Water: ${waterTemp}°C\n\n${
        temp > 35 ? '🔥 Hot environment - may affect efficiency.' :
        temp > 25 ? '✓ Good temperature range.' :
        temp > 15 ? '❄️ Cool environment.' :
        '🥶 Very cold - production may be slower.'
      }`,
      data: { temp, waterTemp }
    };
  }

  // Recommendation queries
  if (msg.includes('recommend') || msg.includes('suggest') || msg.includes('improve') || msg.includes('tip')) {
    const recommendations = [];
    
    if ((latest?.humidity || 0) < 50) {
      recommendations.push('💡 Move device to a more humid location (near plants, bathroom, or use humidifier)');
    }
    if ((latest?.flowRate || 0) < 0.3) {
      recommendations.push('💡 Low flow rate detected - check device placement and humidity levels');
    }
    if ((latest?.tds || 0) > 100) {
      recommendations.push('⚠️ High TDS - consider replacing filters or checking water source');
    }
    if ((latest?.battery || 0) < 30) {
      recommendations.push('🔋 Charge battery to maintain continuous operation');
    }
    if ((latest?.waterLevel || 0) >= 95) {
      recommendations.push('✅ Water almost full - time to drink and reset!');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('✨ System running optimally! No recommendations at this time.');
    }

    return {
      text: `💡 **Recommendations:**\n${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
      data: { recommendations }
    };
  }

  // Default response with help
  return {
    text: `${identity}I can help you with:\n\n💧 **Water Info**: "How much water?", "When will it be full?"\n✨ **Quality**: "Is water safe?", "Water quality?"\n📊 **Performance**: "How's it doing?", "System performance?"\n💨 **Environment**: "Humidity level?", "Temperature?"\n📈 **History**: "Show history", "Past production?"\n⚠️ **Alerts**: "Any problems?", "Recent alerts?"\n💡 **Tips**: "Recommendations?", "How to improve?"\n🔋 **Battery**: "Battery status?"\n\nWhat would you like to know?`,
    data: { helpMenu: true }
  };
}

module.exports = { aiChat, getAIContext };
