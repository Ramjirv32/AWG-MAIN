const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const router = express.Router();

// MongoDB Schema for Simulation Data
const SimulationSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  sensors: {
    temp: Number,
    humidity: Number,
    battery: Number,
    tds: Number,
    water_level: Number,
    mcu_temp: Number,
    flow: Number,
    rgb_state: Number
  },
  decision: {
    mode: Number,
    name: String,
    source: String,
    conf: Number
  }
}, { collection: 'simulation_data' });

const Simulation = mongoose.model('Simulation', SimulationSchema);

// Load and store simulation data from JSON
router.post('/load', async (req, res) => {
  try {
    const jsonPath = path.join(__dirname, '../ai/results/simulation_summary_colab.json');
    
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: 'Simulation file not found' });
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Clear existing data
    await Simulation.deleteMany({});
    
    // Store hourly summary data
    if (data.hourly_summary && Array.isArray(data.hourly_summary)) {
      const docs = data.hourly_summary.map(hour => ({
        timestamp: new Date(),
        sensors: {
          temp: hour.temperature?.avg || 0,
          humidity: hour.humidity?.avg || 0,
          battery: 85,
          tds: 250,
          water_level: hour.water_level?.avg || 0,
          mcu_temp: 35,
          flow: hour.extraction_efficiency || 0,
          rgb_state: 0
        },
        decision: {
          mode: 0,
          name: 'SIMULATED',
          source: 'SIMULATION',
          conf: 1.0
        }
      }));
      
      await Simulation.insertMany(docs);
    }

    res.json({ 
      success: true, 
      message: 'Simulation data loaded into MongoDB',
      count: data.hourly_summary?.length || 0
    });
  } catch (error) {
    console.error('Error loading simulation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get simulation data
router.get('/', async (req, res) => {
  try {
    const data = await Simulation.find().sort({ timestamp: -1 }).limit(24);
    
    if (data.length === 0) {
      return res.json({ 
        status: 'offline',
        message: 'No simulation data. Load data first via POST /api/simulation/load'
      });
    }

    // Format for frontend
    const formatted = data.map(d => ({
      temperature: d.sensors.temp,
      humidity: d.sensors.humidity,
      water_level: d.sensors.water_level,
      flow: d.sensors.flow,
      battery: d.sensors.battery,
      mode: d.decision.name,
      timestamp: d.timestamp
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching simulation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get latest reading
router.get('/latest', async (req, res) => {
  try {
    const latest = await Simulation.findOne().sort({ timestamp: -1 });
    
    if (!latest) {
      return res.json({ 
        status: 'offline',
        message: 'No simulation data'
      });
    }

    res.json({
      temperature: latest.sensors.temp,
      humidity: latest.sensors.humidity,
      water_level: latest.sensors.water_level,
      flow: latest.sensors.flow,
      battery: latest.sensors.battery,
      mode: latest.decision.name
    });
  } catch (error) {
    console.error('Error fetching latest:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

// Auto-load function for server startup
async function loadSimulationOnStartup() {
  try {
    const jsonPath = path.join(__dirname, '../ai/results/simulation_summary_colab.json');
    
    if (!fs.existsSync(jsonPath)) {
      console.log('⚠️  Simulation file not found, skipping auto-load');
      return;
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Check if data already exists
    const existingCount = await Simulation.countDocuments();
    if (existingCount > 0) {
      console.log('✅ Simulation data already exists in MongoDB');
      return;
    }
    
    // Clear and load data
    await Simulation.deleteMany({});
    
    if (data.hourly_summary && Array.isArray(data.hourly_summary)) {
      const docs = data.hourly_summary.map(hour => ({
        timestamp: new Date(),
        sensors: {
          temp: hour.temperature?.avg || 0,
          humidity: hour.humidity?.avg || 0,
          battery: 85,
          tds: 250,
          water_level: hour.water_level?.avg || 0,
          mcu_temp: 35,
          flow: hour.extraction_efficiency || 0,
          rgb_state: 0
        },
        decision: {
          mode: 0,
          name: 'SIMULATED',
          source: 'SIMULATION',
          conf: 1.0
        }
      }));
      
      await Simulation.insertMany(docs);
      console.log(`✅ Loaded ${docs.length} simulation records into MongoDB`);
    }
  } catch (error) {
    console.error('❌ Error auto-loading simulation:', error.message);
  }
}
