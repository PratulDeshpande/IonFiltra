const pool = require('../config/database');

// Save sensor data to database
const saveData = async (req, res) => {
  try {
    console.log('Received data:', req.body);
    
    const { device_id, temperature, humidity, pressure } = req.body;
    
    // Input validation
    if (!device_id) {
      return res.status(400).json({
        success: false,
        message: 'Device ID is required'
      });
    }
    
    // Insert data into database
    const query = `
      INSERT INTO sensor_data (device_id, temperature, humidity, pressure)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    
    const values = [device_id, temperature, humidity, pressure];
    const result = await pool.query(query, values);
    
    console.log('Data saved to database:', result.rows[0]);
    
    res.status(201).json({
      success: true,
      message: 'Data saved successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error: ' + error.message
    });
  }
};

// Get data for dashboard
const getData = async (req, res) => {
  try {
    const { hours = 24, device_id } = req.query;
    
    let query = `
      SELECT * FROM sensor_data 
      WHERE timestamp >= NOW() - INTERVAL '${hours} hours'
    `;
    let values = [];
    
    if (device_id) {
      query += ' AND device_id = $1';
      values.push(device_id);
    }
    
    query += ' ORDER BY timestamp DESC';
    
    const result = await pool.query(query, values);
    
    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching data: ' + error.message
    });
  }
};

module.exports = { saveData, getData };