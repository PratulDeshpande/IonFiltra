const pool = require('./database');
const bcrypt = require('bcrypt');

const args = process.argv.slice(2);

if (args.length < 3) {
    console.log("❌ Usage: node create_user.js <username> <password> <role>");
    console.log("Roles: 'admin' or 'operator'");
    console.log("Example: node create_user.js john securePass123 operator");
    process.exit(1);
}

const username = args[0];
const password = args[1];
const role = args[2];

async function createUser() {
    try {
        console.log(`🔨 Creating user '${username}'...`);

        // Check if user already exists
        const existing = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
            console.log("❌ User already exists!");
            process.exit(1);
        }

        // Get default organization (Organization 1)
        const orgRes = await pool.query('SELECT id FROM organizations LIMIT 1');
        if (orgRes.rows.length === 0) {
            console.log("❌ No organizations found! Run setup_db.js first.");
            process.exit(1);
        }
        const orgId = orgRes.rows[0].id;

        // Hash the password securely
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        // Insert into database
        await pool.query(
            `INSERT INTO users (username, email, password_hash, organization_id, role) 
             VALUES ($1, $2, $3, $4, $5)`,
            [username, `${username}@gmail.com`, hash, orgId, role]
        );

        console.log("✅ User created successfully!");
        console.log(`- Username: ${username}`);
        console.log(`- Password: ${password}`);
        console.log(`- Role: ${role}`);
        console.log(`- Organization ID: ${orgId}`);
        process.exit(0);
    } catch (err) {
        console.error("❌ Failed to create user:", err.message);
        process.exit(1);
    }
}

createUser();
