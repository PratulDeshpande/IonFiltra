const pool = require('./database');

const args = process.argv.slice(2);

if (args.length < 2) {
    console.log("❌ Usage: node update_email.js <username> <new_email>");
    console.log("Example: node update_email.js admin my.real.email@gmail.com");
    process.exit(1);
}

const username = args[0];
const newEmail = args[1];

async function updateEmail() {
    try {
        console.log(`🔨 Updating email for user '${username}'...`);

        // Check if user exists
        const existing = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (existing.rows.length === 0) {
            console.log("❌ User not found!");
            process.exit(1);
        }

        // Update email
        await pool.query(
            `UPDATE users SET email = $1 WHERE username = $2`,
            [newEmail, username]
        );

        console.log("✅ Email updated successfully!");
        console.log(`- Username: ${username}`);
        console.log(`- New Email: ${newEmail}`);
        
        process.exit(0);
    } catch (err) {
        console.error("❌ Failed to update email:", err.message);
        process.exit(1);
    }
}

updateEmail();
