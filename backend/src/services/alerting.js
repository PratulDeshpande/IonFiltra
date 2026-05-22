const nodemailer = require('nodemailer');
const pool = require('../../database');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: 465,
    secure: true, // Use SSL/TLS out of the box
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

async function checkAndSendAlerts(data) {
    let faultMessages = [];

    if (data.sys_ok === false) {
        faultMessages.push("🚨 CRITICAL: System OK is FALSE. Controller may be powered off or in fault state.");
    }
    if (data.plc_interlock_stat) faultMessages.push("⚠️ PLC Interlock Tripped");
    if (data.dp_interlock_stat) faultMessages.push("⚠️ DP Interlock Tripped");
    if (data.ip3_interlock_stat) faultMessages.push("⚠️ IP3 Interlock Tripped");

    // Bitmap checks
    if (data.ch_open_1_16 > 0 || data.ch_open_17_32 > 0 || data.ch_open_33_48 > 0) {
        faultMessages.push(`⚠️ Open Circuit Fault Detected! (Bitmaps: [${data.ch_open_1_16}, ${data.ch_open_17_32}, ${data.ch_open_33_48}])`);
    }
    if (data.ch_short_1_16 > 0) {
        faultMessages.push(`⚠️ Short Circuit Fault Detected! (Bitmap: ${data.ch_short_1_16})`);
    }

    if (faultMessages.length === 0) return; // No faults

    console.log(`[ALERT ENGINE] Fault detected for Node ${data.node_id}. Initiating webhook sequence...`);

    try {
        // Find all users with emails for this org (admins & operators)
        const r = await pool.query(`SELECT email FROM users WHERE organization_id = $1 AND email IS NOT NULL`, [data.organization_id]);
        if (r.rows.length === 0) return console.log(`[ALERT ENGINE] No users with emails found for Org ${data.organization_id}.`);

        const emailList = r.rows.map(u => u.email).filter(e => e).join(', ');
        if (!emailList) return console.log(`[ALERT ENGINE] Admins found, but no emails registered.`);

        const mailOptions = {
            from: process.env.SMTP_USER || '"Ion Filtra Alerts" <alerts@ionfiltra.com>',
            to: emailList,
            subject: `🚨 Ion Filtra Alert: Node ${data.node_id} Fault Detected`,
            text: `Attention Admin,\n\nFaults have been detected on Node ${data.node_id} (Timer Slave ${data.timer_slave_id}).\n\nDetails:\n${faultMessages.join('\n')}\n\nPlease check the dashboard immediately.\n\nTimestamp: ${new Date(data.created_at).toISOString()}`
        };

        if (!process.env.SMTP_USER) {
            console.log(`[ALERT ENGINE] Development Mode - Email payload that would be sent to [${emailList}]:\n\n${mailOptions.text}\n`);
        } else {
            await transporter.sendMail(mailOptions);
            console.log(`[ALERT ENGINE] Alert successfully emailed to: ${emailList}`);
        }
    } catch (e) {
        console.error(`[ALERT ENGINE] Failed to process alerts:`, e);
    }
}

module.exports = { checkAndSendAlerts };
