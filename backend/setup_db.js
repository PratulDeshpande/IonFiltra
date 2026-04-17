const pool = require('./database');

async function setup() {
    console.log("🔨 SETTING UP DATABASE...");

    try {
        // Drop and recreate table with proper schema
        const createTableSQL = `
            DROP TABLE IF EXISTS sensor_readings;
            
            CREATE TABLE sensor_readings (
                id SERIAL PRIMARY KEY,
                node_id INTEGER NOT NULL,
                dp FLOAT,
                t_in FLOAT,
                t_out FLOAT,
                p_header FLOAT,
                pm FLOAT,
                cleaning BOOLEAN DEFAULT FALSE,
                rssi INTEGER,
                snr FLOAT,
                timestamp BIGINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await pool.query(createTableSQL);
        console.log("✅ Table 'sensor_readings' created.");

        // Create indexes
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_node_id ON sensor_readings(node_id);
            CREATE INDEX IF NOT EXISTS idx_created_at ON sensor_readings(created_at DESC);
        `);
        console.log("✅ Indexes created.");

        // Insert test data
        const insertTestSQL = `
            INSERT INTO sensor_readings 
            (node_id, dp, t_in, t_out, p_header, pm, cleaning, rssi, snr, timestamp)
            VALUES 
            (6, 12.5, 24.8, 19.2, 105.3, 32.1, false, -65, 7.2, 1737760000),
            (6, 13.2, 25.1, 19.5, 106.2, 31.8, true, -67, 7.5, 1737760600),
            (7, 14.1, 26.3, 20.1, 107.5, 29.5, false, -62, 8.1, 1737761200)
        `;
        
        await pool.query(insertTestSQL);
        console.log("✅ Test data inserted.");

        // Verify
        const result = await pool.query('SELECT COUNT(*) as count FROM sensor_readings');
        console.log(`📊 Total records: ${result.rows[0].count}`);
        
        const sampleData = await pool.query('SELECT * FROM sensor_readings ORDER BY created_at DESC LIMIT 1');
        console.log("📋 Sample record:", JSON.stringify(sampleData.rows[0], null, 2));
        
        console.log("🚀 DATABASE SETUP COMPLETE!");
        process.exit(0);
    } catch (err) {
        console.error("❌ SETUP FAILED:", err.message);
        console.error("Full error:", err);
        process.exit(1);
    }
}

setup();