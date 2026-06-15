const pool = require('../../database');

async function enforceDataRetention() {
    try {
        console.log("🧹 Running data retention job (7 days)...");
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const result = await pool.query(
            'DELETE FROM sensor_readings WHERE created_at < $1 RETURNING id',
            [sevenDaysAgo]
        );
        
        console.log(`✅ Data retention complete: deleted ${result.rowCount} old records.`);
    } catch (err) {
        console.error("❌ Data retention failed:", err.message);
    }
}

module.exports = { enforceDataRetention };
