// Force IPv4 for external connections (Fixes Render Nodemailer ENETUNREACH IPv6 bug)
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const cors = require('cors');
const pool = require('./database');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const { GoogleGenAI } = require('@google/genai');
const { checkAndSendAlerts } = require('./src/services/alerting');
const { runPredictiveAnalysis } = require('./src/services/predictive');
const { enforceDataRetention } = require('./src/services/dataRetention');
const { rateLimit } = require('./src/middleware/rateLimiter');
const { toBool, toNum } = require('./src/helpers');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const HARDWARE_TOKEN = process.env.HARDWARE_TOKEN;

if (!JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET environment variable is required.');
    process.exit(1);
}
if (!HARDWARE_TOKEN) {
    console.error('❌ FATAL: HARDWARE_TOKEN environment variable is required.');
    process.exit(1);
}

// --- ERROR RESPONSE HELPER ---
const sendError = (res, status, message, details = null) => {
    const response = {
        success: false,
        error: message,
        ...(details && process.env.NODE_ENV !== 'production' && { details })
    };
    return res.status(status).json(response);
};

// Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Ensure uploads folder exists for Permanent Storage Logic
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

app.use(cors({ origin: true, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json());
app.use(cookieParser());

// --- MULTER UPLOAD SETUP ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_'));
    }
});
const upload = multer({ storage: storage });

// --- AUTHENTICATION ---
app.post('/api/login', rateLimit('login', 5, 60000), async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(401).json({ success: false, error: 'User not found' });
        
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ success: false, error: 'Invalid Credentials' });
        
        const token = jwt.sign({ username: user.username, role: user.role, org_id: user.organization_id }, JWT_SECRET, { expiresIn: '12h' });
        
        // Secure HttpOnly cookie configured for Cross-Origin (Vercel -> Render)
        res.cookie('ion_auth', token, { 
            httpOnly: true, 
            secure: true, 
            sameSite: 'none', 
            maxAge: 12 * 60 * 60 * 1000 
        });
        res.json({ success: true, token, user: { name: user.username, role: user.role, org_id: user.organization_id } });
    } catch (e) {
        sendError(res, 500, 'Internal server error', e.message);
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('ion_auth');
    res.json({ success: true });
});

const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token;
    const cookieToken = req.cookies ? req.cookies.ion_auth : null;
    const token = cookieToken || (authHeader && authHeader.split(' ')[1]) || queryToken;

    if (!token) return res.status(403).json({ error: 'No authentication token provided' });

    if (token === HARDWARE_TOKEN) {
        req.user = { name: 'hardware_sensor', role: 'hardware', org_id: 1 }; // Default hardware to org 1
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Token is invalid or expired!' });
        req.user = decoded;
        next();
    });
};

app.get('/api/me', verifyToken, (req, res) => {
    res.json({ success: true, user: req.user });
});

// --- SSE SETUP ---
let clients = [];
app.get('/api/stream', verifyToken, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const clientId = Date.now();
    clients.push({ id: clientId, res, org_id: req.user.org_id });

    req.on('close', () => {
        clients = clients.filter(c => c.id !== clientId);
    });
});

function broadcastData(data, org_id) {
    clients.forEach(c => {
        if (c.org_id === org_id || !c.org_id) { // Broadcast to matching orgs
            c.res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
    });
}
setInterval(() => clients.forEach(c => c.res.write('data: {"ping":true}\n\n')), 30000);

// --- INGEST ---
app.post('/api/ingest', rateLimit('ingest', 120, 60000), verifyToken, async (req, res) => {
    try {
        const payloads = Array.isArray(req.body) ? req.body : [req.body];
        if (payloads.length === 0) return sendError(res, 400, 'Empty payload');
        if (payloads.length > 50) return sendError(res, 400, 'Batch size exceeds maximum of 50');

        for (const p of payloads) {
            if (p.node_id === undefined || p.node_id === null) {
                return sendError(res, 400, 'node_id is required for each reading');
            }
        }

        const org_id = req.user.org_id || payloads[0].organization_id || 1;
        let insertedIds = [];
        
        for (const p of payloads) {
            const { node_id, timer_slave_id, relay_no, ch_status, svf_rly_stat, sys_ok, system_on, plc_interlock, dp_interlock, ip3_interlock, plc_interlock_stat, dp_interlock_stat, ip3_interlock_stat, parallel_purge_mode, ch_open_1_16, ch_open_17_32, ch_open_33_48, ch_short_1_16, baud_rate, reserved, on_time_unit, on_time_lower_limit, on_time_higher_limit, off_time_unit, off_time_lower_limit, off_time_higher_limit, pause_time_unit, pause_time_lower_limit, pause_time_higher_limit, differential_pressure, temp_in, temp_out, pressure_header, particulate_matter, cleaning_status, rssi, snr, timestamp, hardware_time } = p;
            
            // Calculate true absolute time for offline buffered data
            let actualTime = new Date();
            if (hardware_time !== undefined && timestamp !== undefined) {
                const ageSeconds = hardware_time - timestamp;
                if (ageSeconds >= 0) {
                    actualTime = new Date(Date.now() - (ageSeconds * 1000));
                }
            }
            
            // Store the reconstructed Unix timestamp (not firmware boot-relative)
            const actualUnixTimestamp = Math.floor(actualTime.getTime() / 1000);
            
            const q = `INSERT INTO sensor_readings (organization_id, facility_id, node_id, timer_slave_id, relay_no, ch_status, svf_rly_stat, sys_ok, system_on, plc_interlock, dp_interlock, ip3_interlock, plc_interlock_stat, dp_interlock_stat, ip3_interlock_stat, parallel_purge_mode, ch_open_1_16, ch_open_17_32, ch_open_33_48, ch_short_1_16, baud_rate, reserved, on_time_unit, on_time_lower_limit, on_time_higher_limit, off_time_unit, off_time_lower_limit, off_time_higher_limit, pause_time_unit, pause_time_lower_limit, pause_time_higher_limit, differential_pressure, temp_in, temp_out, pressure_header, particulate_matter, cleaning_status, rssi, snr, timestamp, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41) RETURNING *`;
            
            const v = [
                org_id,
                toNum(p.facility_id, 1),
                toNum(node_id),
                toNum(timer_slave_id, 1),
                toNum(relay_no, 0),
                toNum(ch_status, 0),
                toBool(svf_rly_stat), toBool(sys_ok), toBool(system_on),
                toBool(plc_interlock), toBool(dp_interlock), toBool(ip3_interlock),
                toBool(plc_interlock_stat), toBool(dp_interlock_stat), toBool(ip3_interlock_stat),
                toBool(parallel_purge_mode),
                toNum(ch_open_1_16, 0), toNum(ch_open_17_32, 0), toNum(ch_open_33_48, 0), toNum(ch_short_1_16, 0),
                toNum(baud_rate, 9600), toNum(reserved, 0),
                toNum(on_time_unit, 0), toNum(on_time_lower_limit, 0), toNum(on_time_higher_limit, 0),
                toNum(off_time_unit, 0), toNum(off_time_lower_limit, 0), toNum(off_time_higher_limit, 0),
                toNum(pause_time_unit, 0), toNum(pause_time_lower_limit, 0), toNum(pause_time_higher_limit, 0),
                toNum(differential_pressure, 0), toNum(temp_in, 0), toNum(temp_out, 0),
                toNum(pressure_header, 0), toNum(particulate_matter, 0), toNum(cleaning_status, 0),
                toNum(rssi, 0), toNum(snr, 0), actualUnixTimestamp,
                actualTime
            ];
            
            const r = await pool.query(q, v);
            const saved = r.rows[0];
            insertedIds.push(saved.id);
            
            // Only trigger real-time features if data is recent (within last 5 minutes)
            const isFresh = (new Date() - actualTime) <= (5 * 60 * 1000);
            
            if (isFresh) {
                broadcastData({ ...saved, device_id: `Node-${saved.node_id}` }, saved.organization_id);
                // Fire and forget the alert engine with a global catch wrapper
                checkAndSendAlerts(saved).catch(err => console.error("[CRITICAL] Unhandled Alert Engine Error:", err));
            }
        }
        res.json({ success: true, count: insertedIds.length, ids: insertedIds });
    } catch (e) { sendError(res, 500, 'Internal server error', e.message); }
});

// --- EMERGENCY HOLD (Event Logging Only) ---
app.post('/api/emergency-hold', rateLimit('emergency', 10, 60000), verifyToken, async (req, res) => {
    try {
        const { node_id } = req.body;
        const user = req.user;

        if (!node_id) return sendError(res, 400, 'node_id is required');

        console.log(`🚨 [EMERGENCY HOLD] User: ${user.username} | Node: ${node_id} | Org: ${user.org_id} | Time: ${new Date().toISOString()}`);

        res.json({ success: true, message: 'Emergency hold event logged.' });
    } catch (e) {
        sendError(res, 500, 'Internal server error', e.message);
    }
});

// --- FACILITIES ENDPOINTS ---
app.get('/api/facilities', verifyToken, async (req, res) => {
    try {
        const facilities = await pool.query('SELECT * FROM facilities WHERE organization_id = $1 ORDER BY id', [req.user.org_id || 1]);
        res.json({ success: true, facilities: facilities.rows });
    } catch (e) { sendError(res, 500, 'Internal server error', e.message); }
});

// --- ADMIN ENDPOINTS ---
app.get('/api/admin/users', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return sendError(res, 403, 'Admin access required');
    try {
        const users = await pool.query('SELECT id, username, email, role, organization_id FROM users WHERE organization_id = $1', [req.user.org_id]);
        res.json({ success: true, users: users.rows });
    } catch (e) { sendError(res, 500, 'Internal server error', e.message); }
});

app.post('/api/admin/users', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return sendError(res, 403, 'Admin access required');
    const { username, email, password, role } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        await pool.query('INSERT INTO users (username, email, password_hash, organization_id, role) VALUES ($1, $2, $3, $4, $5)', [username, email, hash, req.user.org_id, role || 'operator']);
        res.json({ success: true, message: 'User created' });
    } catch (e) { sendError(res, 500, 'Internal server error', e.message); }
});

// --- PREDICTIVE CRON ENDPOINT ---
app.get('/api/cron/predict', async (req, res) => {
    const secret = req.query.secret;
    const CRON_SECRET = process.env.CRON_SECRET || 'ion_cron_secret_2026';
    
    if (secret !== CRON_SECRET) {
        return res.status(403).json({ error: "Unauthorized cron execution" });
    }

    // Run asynchronously, don't block the request. Wrap in catch to prevent unhandled rejections.
    runPredictiveAnalysis().catch(err => console.error("[CRITICAL] Unhandled Predictive Engine Error:", err));
    enforceDataRetention().catch(err => console.error("[CRITICAL] Unhandled Data Retention Error:", err));
    
    res.json({ success: true, message: "Predictive analysis sequence initiated" });
});

// --- DATA FETCH ---
app.get('/api/data', verifyToken, async (req, res) => {
    try {
        const org_id = req.user.org_id || 1;
        const r = await pool.query(`SELECT * FROM sensor_readings WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 500`, [org_id]);
        const d = r.rows.map(row => ({ ...row, device_id: `Node-${row.node_id}` }));
        res.json({ success: true, data: d });
    } catch (e) { sendError(res, 500, 'Internal server error', e.message); }
});

app.get('/api/export/:nodeId', rateLimit('export', 10, 60000), verifyToken, async (req, res) => {
    try {
        const org_id = req.user.org_id || 1;
        const nodeId = req.params.nodeId.replace('Node-', '');
        const r = await pool.query(`SELECT * FROM sensor_readings WHERE node_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT 5000`, [Number(nodeId), org_id]);
        let csv = 'Timestamp,DeviceID,TimerSlaveID,RelayNo,ChStatus,SysOK,SystemON,PLCInterlock,DPInterlock,IP3Interlock,RSSI,SNR\n';
        r.rows.forEach(d => {
            csv += `${new Date(d.created_at).toISOString()},Node-${d.node_id},${d.timer_slave_id},${d.relay_no},${d.ch_status},${d.sys_ok},${d.system_on},${d.plc_interlock_stat},${d.dp_interlock_stat},${d.ip3_interlock_stat},${d.rssi},${d.snr}\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="LOG_Node-${nodeId}_${Date.now()}.csv"`);
        res.send(csv);
    } catch (e) { sendError(res, 500, 'Internal server error', e.message); }
});

// --- RAG KNOWLEDGE BASE UPLOAD ---
app.post('/api/upload_knowledge', rateLimit('upload', 5, 60000), verifyToken, upload.single('document'), async (req, res) => {
    try {
        if (!req.file) throw new Error("No file received");
        const org_id = req.user.org_id || 1;

        const localPath = path.join(__dirname, req.file.path);
        const mimeType = req.file.mimetype || 'application/pdf';

        console.log(`📤 Uploading ${req.file.originalname} to Gemini AI...`);
        const uploadResult = await ai.files.upload({
            file: localPath,
            mimeType: mimeType,
            config: { displayName: req.file.originalname }
        });
        console.log(`✅ Uploaded to Gemini: ${uploadResult.uri}`);

        const fileBuffer = fs.readFileSync(localPath);
        const insertQ = `INSERT INTO knowledge_files (organization_id, original_name, local_path, mime_type, gemini_uri, uploaded_at, file_data) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, original_name`;
        const uploadedAt = Math.floor(Date.now() / 1000);

        await pool.query(insertQ, [org_id, req.file.originalname, localPath, mimeType, uploadResult.uri, uploadedAt, fileBuffer]);

        res.json({ success: true, message: 'Document added to AI context successfully!' });
    } catch (e) {
        console.error(e);
        sendError(res, 500, 'Internal server error', e.message);
    }
});

// --- GET KNOWLEDGE BASE FILES ---
app.get('/api/knowledge', verifyToken, async (req, res) => {
    try {
        const org_id = req.user.org_id || 1;
        const r = await pool.query('SELECT original_name, uploaded_at FROM knowledge_files WHERE organization_id = $1 ORDER BY uploaded_at DESC', [org_id]);
        res.json({ success: true, files: r.rows });
    } catch (e) { sendError(res, 500, 'Internal server error', e.message); }
});

// --- HYBRID AI ENDPOINT (GEMINI) ---
app.post('/api/chat', rateLimit('chat', 20, 60000), verifyToken, async (req, res) => {
    const { message, contextData } = req.body;
    const safeMessage = message || '';
    const lowerMsg = safeMessage.toLowerCase();
    const org_id = req.user.org_id || 1;

    // 0. GREETING PATH
    if (/^(hello|hi|hey|good\s*(morning|afternoon|evening))/i.test(lowerMsg)) {
        return res.json({ reply: "👋 Hello! I am Ion Assist (Gemini Powered).\n\nI am currently monitoring the plant sensors and analyzing uploaded datasheets. How can I help?" });
    }

    // 1. DEEP PATH (Gemini)
    try {
        const kbResult = await pool.query('SELECT * FROM knowledge_files WHERE organization_id = $1', [org_id]);

        const nowStamp = Math.floor(Date.now() / 1000);
        const EXPIRY_SECONDS = 40 * 3600;

        let fileParts = [];

        for (let row of kbResult.rows) {
            let activeUri = row.gemini_uri;

            if ((nowStamp - row.uploaded_at) > EXPIRY_SECONDS) {
                if (!fs.existsSync(row.local_path) && row.file_data) {
                    const dir = path.dirname(row.local_path);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(row.local_path, row.file_data);
                }

                if (fs.existsSync(row.local_path)) {
                    console.log(`🔄 Refreshing expiring Gemini URI for ${row.original_name}...`);
                    try {
                        const newUpload = await ai.files.upload({ file: row.local_path, mimeType: row.mime_type });
                        activeUri = newUpload.uri;
                        await pool.query('UPDATE knowledge_files SET gemini_uri = $1, uploaded_at = $2 WHERE id = $3', [activeUri, nowStamp, row.id]);
                    } catch (e) {
                        console.error(`❌ Failed to re-upload ${row.original_name}:`, e.message);
                        continue;
                    }
                } else {
                    console.warn(`⚠️ File ${row.original_name} is missing. Skipping.`);
                    continue;
                }
            }

            fileParts.push({
                fileData: { fileUri: activeUri, mimeType: row.mime_type }
            });
        }

        const systemPrompt = `
         You are a specialized Industrial IoT Assistant named "Ion Assist" monitoring a Pulse Jet Bag Filter Controller.
         1. You are given real-time JSON context telemetry data directly below.
         2. You are also given physical uploaded PDF documents (datasheets, filters, manuals).
         3. Analyze the user's query utilizing BOTH the live telemetry (check system_ok, interlocks, and channel fault bitmaps) AND the context from the PDFs.
         4. Never invent data. Keep it concise.
         
         REAL-TIME SENSOR DATA:
         ${JSON.stringify(contextData)}
         `;

        console.log('🤖 Sending context to Gemini 2.5 Flash...');

        const contentsArr = [
            {
                role: 'user', parts: [
                    { text: systemPrompt },
                    ...fileParts,
                    { text: `USER QUERY: ${message}` }
                ]
            }
        ];

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contentsArr
        });

        res.json({ reply: response.text });

    } catch (err) {
        console.error("Gemini Error:", err);
        res.status(500).json({ reply: "⚠️ Gemini Edge AI Error: " + err.message });
    }
});

// --- HEALTH CHECK ---
app.get('/api/health', async (req, res) => {
    try {
        const dbResult = await pool.query('SELECT NOW()');
        res.json({
            success: true,
            status: 'healthy',
            timestamp: dbResult.rows[0].now,
            uptime: process.uptime(),
            version: require('./package.json').version
        });
    } catch (e) {
        sendError(res, 503, 'Database connection failed', e.message);
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on ${PORT}`));