const express = require('express');
const { getLatest, getReadings, fillTime, getHistory, getAlerts, markAlertsRead, drinkWater } = require('../controller/sensorController');
const router = express.Router();

router.get('/latest', getLatest);
router.get('/readings', getReadings);
router.get('/predict/fillTime', fillTime);
router.get('/history', getHistory);
router.get('/alerts', getAlerts);
router.put('/alerts/read', markAlertsRead);
router.post('/drink', drinkWater);

module.exports = router;
