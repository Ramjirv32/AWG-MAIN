const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const Sensor = require('../models/Sensor');

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const docClient = DynamoDBDocumentClient.from(client);

const fetchFromAWSAndStore = async () => {
  try {
    console.log('🔄 Fetching data from AWS DynamoDB...');
    
    // Fetch latest data from AWS
    const params = {
      TableName: "sensor_data",
      KeyConditionExpression: "device_id = :d",
      ExpressionAttributeValues: {
        ":d": "esp32_01",
      },
      ScanIndexForward: false,
      Limit: 5, // Get latest 5 records
    };

    const data = await docClient.send(new QueryCommand(params));
    
    if (!data.Items || data.Items.length === 0) {
      console.log('❌ No data found in AWS DynamoDB');
      return;
    }

    console.log(`📊 Found ${data.Items.length} records in AWS`);

    // Store each record in local MongoDB
    for (const item of data.Items) {
      try {
        // Map AWS fields to local schema
        const sensorData = {
          deviceId: item.device_id || 'esp32_01',
          waterLevel: item.water_level || 0,
          humidity: item.humidity || 0,
          temp: item.temperature || 0,
          waterTemp: item.water_temp || 20,
          flowRate: item.flow_rate || 0.5,
          battery: item.battery || 80,
          trend: item.trend || 'stable',
          timestamp: new Date(item.timestamp) || new Date()
        };

        // Check if this record already exists
        const existing = await Sensor.findOne({ 
          deviceId: sensorData.deviceId,
          timestamp: sensorData.timestamp
        });

        if (!existing) {
          const sensor = new Sensor(sensorData);
          await sensor.save();
          console.log(`💾 Stored new record: ${sensorData.waterLevel}% | ${sensorData.humidity}% humidity | ${sensorData.temp}°C`);
        } else {
          console.log(`⏭️  Record already exists, skipping...`);
        }
      } catch (saveError) {
        console.error('❌ Error saving individual record:', saveError.message);
      }
    }

    console.log('✅ AWS sync completed');
  } catch (error) {
    console.error('❌ Error fetching from AWS:', error.message);
  }
};

// Also provide a manual trigger endpoint
const manualSync = async (req, res) => {
  try {
    await fetchFromAWSAndStore();
    res.json({ message: 'Manual sync completed successfully' });
  } catch (error) {
    console.error('Manual sync error:', error);
    res.status(500).json({ error: 'Manual sync failed' });
  }
};

module.exports = { fetchFromAWSAndStore, manualSync };
