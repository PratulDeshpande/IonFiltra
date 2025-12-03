const { Pool, types } = require('pg'); // <-- 1. Import 'types'
require('dotenv').config();

// --- FIX: Force all timestamps to be parsed as UTC ---
// This ensures the database stores and returns time in a universal format.
// Your dashboard's JavaScript will then correctly convert this UTC time to local IST.
types.setTypeParser(1114, function(stringValue) {
  return new Date(stringValue + '+0000');
});
// --- END OF FIX ---

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

module.exports = pool;
