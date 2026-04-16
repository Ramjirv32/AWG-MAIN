const express = require('express');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
require('dotenv').config();

const router = express.Router();

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const docClient = DynamoDBDocumentClient.from(client);

// Get latest sensor data
router.get('/latest', async (req, res) => {
  try {
    const params = {
      TableName: "sensor_data",
      KeyConditionExpression: "device_id = :d",
      ExpressionAttributeValues: {
        ":d": "esp32_01",
      },
      ScanIndexForward: false,
      Limit: 1,
    };

    const data = await docClient.send(new QueryCommand(params));
    
    if (!data.Items || data.Items.length === 0) {
      return res.json({ 
        sensor: null,
        alerts: [],
        status: "offline"
      });
    }
    
    res.json({ 
      sensor: data.Items[0],
      alerts: [],
      status: "online"
    });
  } catch (error) {
    console.error("AWS DynamoDB Error:", error);
    res.status(500).json({ 
      error: "Failed to fetch data from AWS",
      status: "error"
    });
  }
});

// Get fill time prediction (mock)
router.get('/predict/fillTime', async (req, res) => {
  try {
    const params = {
      TableName: "sensor_data",
      KeyConditionExpression: "device_id = :d",
      ExpressionAttributeValues: {
        ":d": "esp32_01",
      },
      ScanIndexForward: false,
      Limit: 1,
    };

    const data = await docClient.send(new QueryCommand(params));
    
    if (!data.Items || data.Items.length === 0) {
      return res.json({ 
        msg: 'ESP32 device offline',
        time: -1, 
        status: 'offline'
      });
    }
    
    const latest = data.Items[0];
    const waterLevel = latest.water_level || 0;
    
    if (waterLevel >= 100) {
      return res.json({ 
        msg: 'Bottle Full', 
        time: 0, 
        status: 'full'
      });
    }
    
    // Mock prediction based on current level
    const remaining = 100 - waterLevel;
    const mockFlowRate = 0.5; // L/min
    const mins = Math.floor(remaining / mockFlowRate);
    
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    
    res.json({ 
      msg: hrs > 0 ? `${hrs} hr ${m} min` : `${m} min`,
      time: mins,
      status: 'filling'
    });
  } catch (error) {
    console.error("AWS DynamoDB Error:", error);
    res.status(500).json({ 
      msg: 'Error fetching prediction',
      time: -1, 
      status: 'error'
    });
  }
});

// Get readings
router.get('/readings', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const params = {
      TableName: "sensor_data",
      KeyConditionExpression: "device_id = :d",
      ExpressionAttributeValues: {
        ":d": "esp32_01",
      },
      ScanIndexForward: false,
      Limit: limit,
    };

    const data = await docClient.send(new QueryCommand(params));
    res.json(data.Items || []);
  } catch (error) {
    console.error("AWS DynamoDB Error:", error);
    res.status(500).json({ 
      error: "Failed to fetch data from AWS"
    });
  }
});

// Drink water (mock)
router.post('/drink', async (req, res) => {
  try {
    const { remainingLevel } = req.body;
    
    if (remainingLevel === undefined || remainingLevel < 0 || remainingLevel > 100) {
      return res.status(400).json({ error: 'Invalid remaining level (0-100)' });
    }

    res.json({ 
      success: true, 
      message: `Water level set to ${remainingLevel}%`,
      newLevel: remainingLevel 
    });
  } catch (err) {
    console.error('Drink error:', err.message);
    res.status(500).json({ error: 'Failed to update water level' });
  }
});

// Get history (mock - not available in AWS setup)
router.get('/history', async (req, res) => {
  try {
    res.json([]); // Empty array since history is not stored in AWS
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// AI context (mock)
router.get('/ai/context', async (req, res) => {
  try {
    res.json({
      deviceStatus: "online",
      lastUpdate: new Date().toISOString(),
      systemInfo: "AWS DynamoDB Integration"
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get AI context' });
  }
});

module.exports = router;
