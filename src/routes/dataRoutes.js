const express = require('express');
const router = express.Router();
const { saveData, getData } = require('../controllers/dataController');

// POST /api/data - Save sensor data from ESP32
router.post('/', saveData);

// GET /api/data - Get data for dashboard
router.get('/', getData);

module.exports = router;