const { Pool, types } = require('pg');
require('dotenv').config();

// Fix Timezone (Force UTC) to ensure charts match data time
types.setTypeParser(1114, str => new Date(str + '+0000'));

// Parse bigint (timestamp) as number instead of string
types.setTypeParser(20, val => parseInt(val, 10));

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'sensor_db',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
  max: 20, // maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Database connection established');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err.message);
});

// Test connection on startup
pool.query('SELECT NOW()', async (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('💡 Check your .env file and ensure PostgreSQL is running');
  } else {
    console.log('✅ Database connected successfully');
    console.log('📅 Database time:', res.rows[0].now);
    
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS knowledge_files (
                id SERIAL PRIMARY KEY,
                original_name TEXT,
                local_path TEXT,
                mime_type TEXT,
                gemini_uri TEXT,
                uploaded_at BIGINT
            );
        `);
        console.log('📂 Knowledge files table verified.');
    } catch(dbErr) {
        console.error('❌ Failed to verify knowledge_files table:', dbErr.message);
    }
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Closing database connections...');
  await pool.end();
  console.log('✅ Database connections closed');
  process.exit(0);
});

module.exports = pool;