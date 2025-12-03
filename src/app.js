const express = require('express');
const cors = require('cors');
const dataRoutes = require('./routes/dataRoutes');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable Cross-Origin Requests
app.use(express.json()); // Parse JSON request bodies

app.use(express.static('public'));
// Routes
app.use('/api/data', dataRoutes);

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ 
    message: 'IoT Server is running!',
    endpoints: {
      saveData: 'POST /api/data',
      getData: 'GET /api/data'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`API endpoints available at http://localhost:${PORT}/api/data`);
});

module.exports = app;