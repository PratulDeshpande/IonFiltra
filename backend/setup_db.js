const pool = require('./database');
const bcrypt = require('bcrypt');

async function setup() {
    console.log("🔨 SETTING UP DATABASE WITH RBAC...");

    try {
        const dropSQL = `
            DROP TABLE IF EXISTS sensor_readings CASCADE;
            DROP TABLE IF EXISTS knowledge_files CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
            DROP TABLE IF EXISTS organizations CASCADE;
        `;
        await pool.query(dropSQL);
        
        const createOrgsSQL = `
            CREATE TABLE IF NOT EXISTS organizations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await pool.query(createOrgsSQL);

        const createUsersSQL = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255),
                password_hash VARCHAR(255) NOT NULL,
                organization_id INTEGER REFERENCES organizations(id),
                role VARCHAR(50) DEFAULT 'operator',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await pool.query(createUsersSQL);

        const createSensorSQL = `
            CREATE TABLE IF NOT EXISTS sensor_readings (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
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
                rssi INTEGER DEFAULT 0,
                snr FLOAT,
                timestamp BIGINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await pool.query(createSensorSQL);

        const createKnowledgeSQL = `
            CREATE TABLE IF NOT EXISTS knowledge_files (
                id SERIAL PRIMARY KEY,
                organization_id INTEGER REFERENCES organizations(id),
                original_name TEXT,
                local_path TEXT,
                mime_type TEXT,
                gemini_uri TEXT,
                uploaded_at BIGINT
            );
        `;
        await pool.query(createKnowledgeSQL);

        console.log("✅ Tables created.");

        // Create indexes
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_org_id ON sensor_readings(organization_id);
            CREATE INDEX IF NOT EXISTS idx_node_id ON sensor_readings(node_id);
            CREATE INDEX IF NOT EXISTS idx_created_at ON sensor_readings(created_at DESC);
        `);
        console.log("✅ Indexes created.");

        // Insert Default Org & Admin
        const defaultOrg = await pool.query(`INSERT INTO organizations (name) VALUES ('Global Industries') RETURNING id`);
        const orgId = defaultOrg.rows[0].id;

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash('admin', salt);
        
        await pool.query(`INSERT INTO users (username, email, password_hash, organization_id, role) VALUES ($1, $2, $3, $4, $5)`, ['admin', 'admin@globalindustries.com', hash, orgId, 'admin']);
        console.log("✅ Default Admin User created (admin / admin / admin@globalindustries.com).");

        console.log("🚀 DATABASE SETUP COMPLETE!");
        process.exit(0);
    } catch (err) {
        console.error("❌ SETUP FAILED:", err.message);
        console.error("Full error:", err);
        process.exit(1);
    }
}

setup();