const pool = require('./database');
const bcrypt = require('bcrypt');

async function setup() {
    console.log("🔨 SETTING UP DATABASE WITH RBAC...");

    try {
        await pool.query('DROP TABLE IF EXISTS sensor_readings CASCADE');
        await pool.query('DROP TABLE IF EXISTS knowledge_files CASCADE');
        await pool.query('DROP TABLE IF EXISTS users CASCADE');
        await pool.query('DROP TABLE IF EXISTS facilities CASCADE');
        await pool.query('DROP TABLE IF EXISTS organizations CASCADE');
        
        const createOrgsSQL = `
            CREATE TABLE IF NOT EXISTS organizations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await pool.query(createOrgsSQL);

        const createFacilitiesSQL = `
            CREATE TABLE IF NOT EXISTS facilities (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                status VARCHAR(50) DEFAULT 'offline',
                organization_id INTEGER REFERENCES organizations(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await pool.query(createFacilitiesSQL);

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
                uploaded_at BIGINT,
                file_data BYTEA
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

        await pool.query(`INSERT INTO facilities (name, status, organization_id) VALUES ('Pune HQ', 'online', $1), ('Mumbai Plant', 'offline', $1), ('Nashik Hub', 'offline', $1)`, [orgId]);

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