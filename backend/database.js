const { Pool, types } = require('pg');
require('dotenv').config();

// Fix Timezone (Force UTC) to ensure charts match data time
types.setTypeParser(1114, str => new Date(str + '+0000'));

// Parse bigint (timestamp) as number instead of string
types.setTypeParser(20, val => parseInt(val, 10));

// Safely handle Supabase / Render connection formats which use exact connection strings + SSL
const connectionString = process.env.DB_URL || process.env.DATABASE_URL;

const poolConfig = connectionString 
? {
    connectionString,
    ssl: { rejectUnauthorized: false }, // Critical for external cloud Postgres connections (Supabase)
    max: 20,
    idleTimeoutMillis: 30000
  }
: {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'sensor_db',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

const pool = new Pool(poolConfig);

pool.on('connect', () => {
    // Silent connection tracker
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err.message);
});

// Test connection on startup and auto-build tables if they are empty
pool.query('SELECT NOW()', async (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('💡 Ensure your connection string or .env credentials are correct.');
  } else {
    console.log('✅ Connected to Postgres Core Engine - Time:', res.rows[0].now);
    
    try {
        // Auto-build Telemetry table for empty Supabase instances
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sensor_readings (
                id SERIAL PRIMARY KEY,
                node_id INTEGER NOT NULL,
                dp NUMERIC DEFAULT 0,
                t_in NUMERIC DEFAULT 0,
                t_out NUMERIC DEFAULT 0,
                p_header NUMERIC DEFAULT 0,
                pm NUMERIC DEFAULT 0,
                cleaning BOOLEAN DEFAULT FALSE,
                rssi INTEGER DEFAULT 0,
                snr NUMERIC DEFAULT 0,
                timestamp BIGINT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('📈 Core Telemetry Table ready.');

        // Auto-build Gemini AI context table
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
        console.log('📂 Knowledge Base Table ready.');
    } catch(dbErr) {
        console.error('❌ Failed executing startup DB builder:', dbErr.message);
    }
  }
});

process.on('SIGINT', async () => {
  console.log('🔄 Closing database connections...');
  await pool.end();
  console.log('✅ Database connections closed');
  process.exit(0);
});

module.exports = pool;