const express = require('express');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");
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

router.get('/', async (req, res) => {
  try {
    const params = {
      TableName: "sensor_data",
      KeyConditionExpression: "device_id = :d",
      ExpressionAttributeValues: {
        ":d": "esp32_01",
      },
      ScanIndexForward: false, // latest first
      Limit: 20,
    };

    const data = await docClient.send(new QueryCommand(params));
    
    if (!data.Items || data.Items.length === 0) {
      return res.json({ 
        message: "ESP32 device is offline or no data available",
        status: "offline"
      });
    }
    
    res.json(data.Items);
  } catch (error) {
    console.error("AWS DynamoDB Error:", error);
    if (error.name === 'ResourceNotFoundException') {
      res.status(404).json({ 
        error: "Table 'sensor_data' not found. Please check AWS configuration.",
        status: "error"
      });
    } else if (error.name === 'AccessDeniedException') {
      res.status(403).json({ 
        error: "Access denied. Check AWS credentials and permissions.",
        status: "error"
      });
    } else {
      res.status(500).json({ 
        error: "Failed to fetch data from AWS",
        status: "error",
        details: error.message
      });
    }
  }
});

module.exports = router;
