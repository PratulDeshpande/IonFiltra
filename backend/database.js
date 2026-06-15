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
      // Auto-build Organizations table
      await pool.query(`
            CREATE TABLE IF NOT EXISTS organizations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
      `);

      // Auto-build Facilities table
      await pool.query(`
            CREATE TABLE IF NOT EXISTS facilities (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                status VARCHAR(50) DEFAULT 'offline',
                organization_id INTEGER REFERENCES organizations(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
      `);

      // Auto-build Users table
      await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255),
                password_hash VARCHAR(255) NOT NULL,
                organization_id INTEGER REFERENCES organizations(id),
                role VARCHAR(50) DEFAULT 'operator',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
      `);

      // Auto-build Telemetry table for empty Supabase instances
      await pool.query(`
            CREATE TABLE IF NOT EXISTS sensor_readings (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                facility_id INTEGER REFERENCES facilities(id),
                node_id INTEGER NOT NULL,
                timer_slave_id INTEGER,
                relay_no INTEGER,
                ch_status INTEGER,
                svf_rly_stat BOOLEAN,
                sys_ok BOOLEAN,
                system_on BOOLEAN,
                plc_interlock BOOLEAN,
                dp_interlock BOOLEAN,
                ip3_interlock BOOLEAN,
                plc_interlock_stat BOOLEAN,
                dp_interlock_stat BOOLEAN,
                ip3_interlock_stat BOOLEAN,
                parallel_purge_mode BOOLEAN,
                ch_open_1_16 INTEGER,
                ch_open_17_32 INTEGER,
                ch_open_33_48 INTEGER,
                ch_short_1_16 INTEGER,
                baud_rate INTEGER,
                reserved INTEGER,
                on_time_unit INTEGER,
                on_time_lower_limit INTEGER,
                on_time_higher_limit INTEGER,
                off_time_unit INTEGER,
                off_time_lower_limit INTEGER,
                off_time_higher_limit INTEGER,
                pause_time_unit INTEGER,
                pause_time_lower_limit INTEGER,
                pause_time_higher_limit INTEGER,
                differential_pressure NUMERIC DEFAULT 0,
                temp_in NUMERIC DEFAULT 0,
                temp_out NUMERIC DEFAULT 0,
                pressure_header NUMERIC DEFAULT 0,
                particulate_matter NUMERIC DEFAULT 0,
                cleaning_status INTEGER DEFAULT 0,
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
                organization_id INTEGER REFERENCES organizations(id),
                original_name TEXT,
                local_path TEXT,
                mime_type TEXT,
                gemini_uri TEXT,
                uploaded_at BIGINT,
                file_data BYTEA
            );
        `);
      console.log('📂 Knowledge Base Table ready.');
    } catch (dbErr) {
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