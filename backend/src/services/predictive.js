const nodemailer = require('nodemailer');
const pool = require('../../database');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: 465,
    secure: true, // Use SSL/TLS out of the box
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

async function runPredictiveAnalysis() {
    console.log("[PREDICTIVE AI] Starting 24h cron analysis...");
    try {
        const orgsResult = await pool.query('SELECT id, name FROM organizations');
        
        for (const org of orgsResult.rows) {
            console.log(`[PREDICTIVE AI] Analyzing Org: ${org.name}...`);
            
            // Get data from last 24 hours
            const timeLimit = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const dataResult = await pool.query(
                `SELECT * FROM sensor_readings WHERE organization_id = $1 AND created_at >= $2 ORDER BY created_at ASC`,
                [org.id, timeLimit]
            );

            if (dataResult.rows.length === 0) {
                console.log(`[PREDICTIVE AI] No data in last 24h for ${org.name}.`);
                continue;
            }

            // Sub-sample to avoid token limits (take every Nth reading, max 100 points)
            let samples = dataResult.rows;
            if (samples.length > 100) {
                const step = Math.ceil(samples.length / 100);
                samples = samples.filter((_, idx) => idx % step === 0);
            }

            const prompt = `
                You are an expert industrial IoT AI assistant monitoring a Bag Filter Controller.
                Below is a sampled 24-hour telemetry dataset for an organization.
                Analyze the data for slow degradation, recurring faults, intermittent connectivity drops, or pending failures.
                
                Respond ONLY with a valid JSON object matching this schema:
                {
                    "needsAlert": boolean, 
                    "summary": "String explaining the findings",
                    "recommendation": "String detailing what operators should check today"
                }
                
                Set needsAlert to true ONLY if you see actionable degradation or persistent faults (e.g., constant relay tripping, frequent sys_ok drops).
                
                Telemetry Data:
                ${JSON.stringify(samples.map(s => ({
                    time: s.created_at, node: s.node_id, sys_ok: s.sys_ok, 
                    rssi: s.rssi, faults: [s.ch_open_1_16, s.ch_open_17_32, s.ch_open_33_48, s.ch_short_1_16]
                })))}
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { responseMimeType: "application/json" }
            });

            const resultStr = response.text;
            let analysis;
            try {
                analysis = JSON.parse(resultStr);
            } catch (e) {
                console.error(`[PREDICTIVE AI] Failed to parse Gemini response for ${org.name}:`, resultStr);
                continue;
            }

            if (analysis.needsAlert) {
                console.log(`[PREDICTIVE AI] Anomalies detected for ${org.name}. Initiating reporting...`);
                
                const adminsResult = await pool.query(`SELECT email FROM users WHERE organization_id = $1 AND email IS NOT NULL`, [org.id]);
                const emailList = adminsResult.rows.map(u => u.email).filter(e => e).join(', ');
                
                if (!emailList) continue;

                const mailOptions = {
                    from: process.env.SMTP_USER || '"Ion Filtra AI" <ai@ionfiltra.com>',
                    to: emailList,
                    subject: `🧠 Predictive Maintenance Report: ${org.name}`,
                    text: `Daily AI Diagnostic Report\n\nOrganization: ${org.name}\nRecords Analyzed: ${dataResult.rows.length}\n\n⚠️ AI Summary:\n${analysis.summary}\n\n🔧 Recommendation:\n${analysis.recommendation}\n\nLog in to your dashboard to review the historical charts.`
                };

                if (!process.env.SMTP_USER) {
                    console.log(`[PREDICTIVE AI] Dev Mode Payload -> [${emailList}]:\n\n${mailOptions.text}\n`);
                } else {
                    await transporter.sendMail(mailOptions);
                    console.log(`[PREDICTIVE AI] Report emailed to ${emailList}`);
                }
            } else {
                console.log(`[PREDICTIVE AI] System healthy for ${org.name}. No alert needed.`);
            }
        }
    } catch (e) {
        console.error("[PREDICTIVE AI] Engine error:", e);
    }
}

module.exports = { runPredictiveAnalysis };
