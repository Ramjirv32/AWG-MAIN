const Groq = require('groq-sdk');
const Sensor = require('../models/Sensor');
const Chat = require('../models/Chat');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const chat = async (req, res) => {
  try {
    const { msg } = req.body;

    const latest = await Sensor.findOne().sort({ timestamp: -1 });
    const recent = await Sensor.find().sort({ timestamp: -1 }).limit(10);
    const pastChats = await Chat.find().sort({ timestamp: -1 }).limit(5);

    if (!latest) {
      return res.json({ reply: 'No sensor data available yet. System initializing...' });
    }

    const avg = {
      water: Math.floor(recent.reduce((s, r) => s + r.waterLevel, 0) / recent.length),
      hum: Math.floor(recent.reduce((s, r) => s + r.humidity, 0) / recent.length),
      tds: Math.floor(recent.reduce((s, r) => s + r.tds, 0) / recent.length),
      flow: parseFloat((recent.reduce((s, r) => s + r.flowRate, 0) / recent.length).toFixed(2)),
      temp: Math.floor(recent.reduce((s, r) => s + r.temp, 0) / recent.length)
    };

    const humTrend = recent.length >= 5 ? recent[0].humidity - recent[4].humidity : 0;
    const waterTrend = recent.length >= 5 ? recent[0].waterLevel - recent[4].waterLevel : 0;

    let chatHistory = '';
    if (pastChats.length > 0) {
      chatHistory = '\n\nRecent conversation summary:\n';
      pastChats.reverse().forEach(c => {
        chatHistory += `User asked: "${c.userMsg.substring(0, 50)}..."\n`;
      });
    }

    const context = `You are an AI assistant for a Smart Atmospheric Water Generator bottle. Be conversational and helpful.

Current sensor data:
- Water Level: ${latest.waterLevel}% (${latest.trend})
- Humidity: ${latest.humidity}%
- Temperature: ${latest.temp}°C
- Water Temperature: ${latest.waterTemp}°C
- TDS (water quality): ${latest.tds} ppm
- Flow Rate: ${latest.flowRate} L/min
- Battery: ${latest.battery}%

Recent trends (last 10 readings):
- Avg Water Level: ${avg.water}%
- Avg Humidity: ${avg.hum}% (${humTrend > 0 ? 'rising' : humTrend < 0 ? 'falling' : 'stable'})
- Avg Temperature: ${avg.temp}°C
- Avg TDS: ${avg.tds} ppm
- Avg Flow Rate: ${avg.flow} L/min
- Water increasing: ${waterTrend > 0 ? `+${waterTrend}% recently` : 'slowly'}

${chatHistory}

Smart insights:
${latest.humidity < 55 ? '- Low humidity is affecting production efficiency\n' : ''}
${latest.tds > 100 ? '- Water quality is unsafe due to high TDS\n' : ''}
${latest.battery < 25 ? '- Battery needs charging soon\n' : ''}
${latest.flowRate < 0.2 ? '- Production rate is very low\n' : ''}
${humTrend > 5 ? '- Humidity is rising, production should improve\n' : ''}
${humTrend < -5 ? '- Humidity is falling, production may slow down\n' : ''}

Guidelines:
- Answer naturally and conversationally
- Use exact values from data above
- Provide actionable advice when relevant
- Be encouraging and positive
- Keep answers concise (2-3 sentences max)
- If user asks about trends, mention the trend data
- Remember context from recent conversation

User question: ${msg}`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: context }],
      temperature: 0.7,
      max_tokens: 300,
      top_p: 1,
      stream: false
    });

    const reply = completion.choices[0]?.message?.content || 'Sorry, I could not process that.';

    const chatLog = new Chat({
      userId: req.user?.id,
      deviceId: latest.deviceId,
      userMsg: msg,
      aiReply: reply,
      context: {
        waterLevel: latest.waterLevel,
        humidity: latest.humidity,
        tds: latest.tds,
        battery: latest.battery,
        trend: latest.trend
      }
    });
    await chatLog.save();

    res.json({ reply, context: { waterLevel: latest.waterLevel, trend: latest.trend } });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ msg: 'AI temporarily unavailable. Please try again.' });
  }
};

const logConversation = async (req, res) => {
  try {
    const { userMsg, aiReply, context, deviceId } = req.body;

    if (!userMsg || !aiReply) {
      return res.status(400).json({ msg: 'userMsg and aiReply are required' });
    }

    const entry = new Chat({
      userId: req.user?.id,
      deviceId: deviceId || 'SIM-AWG-01',
      userMsg,
      aiReply,
      context
    });

    await entry.save();

    res.json({ status: 'saved' });
  } catch (err) {
    console.error('Chat log error:', err);
    res.status(500).json({ msg: 'Failed to store chat conversation' });
  }
};

const getChatHistory = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const chats = await Chat.find().sort({ timestamp: -1 }).limit(limit);
    res.json(chats);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
};

module.exports = { chat, getChatHistory, logConversation };
