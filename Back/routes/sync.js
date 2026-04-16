const express = require('express');
const { fetchFromAWSAndStore, manualSync } = require('../controller/awsSyncController');

const router = express.Router();

// Manual sync trigger
router.post('/manual', manualSync);

// Get sync status
router.get('/status', async (req, res) => {
  try {
    const Sensor = require('../models/Sensor');
    const latest = await Sensor.findOne().sort({ timestamp: -1 });
    const count = await Sensor.countDocuments();
    
    res.json({
      status: 'active',
      lastSync: latest ? latest.timestamp : null,
      totalRecords: count,
      latestData: latest
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

module.exports = router;
