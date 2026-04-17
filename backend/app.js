const express = require('express');
const cors = require('cors');
const pool = require('./database');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_ionfiltra_key'; 
const HARDWARE_TOKEN = process.env.HARDWARE_TOKEN || 'ion_sensor_hw_token_2026_never_expires';

// Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Ensure uploads folder exists for Permanent Storage Logic
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

app.use(cors({ origin: true, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json());

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
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username && password === 'admin') {
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '12h' });
        res.json({ success: true, token, user: { name: username } });
    } else {
        res.status(401).json({ success: false, error: 'Invalid Credentials' });
    }
});

const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token;
    const token = (authHeader && authHeader.split(' ')[1]) || queryToken;

    if (!token) return res.status(403).json({ error: 'No authentication token provided' });

    if (token === HARDWARE_TOKEN) {
        req.user = { name: 'hardware_sensor' };
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Token is invalid or expired!' });
        req.user = decoded;
        next();
    });
};

// --- SSE SETUP ---
let clients = [];
app.get('/api/stream', verifyToken, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const clientId = Date.now();
    clients.push({ id: clientId, res });
    
    req.on('close', () => {
        clients = clients.filter(c => c.id !== clientId);
    });
});

function broadcastData(data) {
    clients.forEach(c => c.res.write(`data: ${JSON.stringify(data)}\n\n`));
}
setInterval(() => clients.forEach(c => c.res.write('data: {"ping":true}\n\n')), 30000);

// --- INGEST ---
app.post('/api/ingest', verifyToken, async (req, res) => {
    const { node_id, dp, t_in, t_out, p_header, pm, cleaning, rssi, snr, timestamp } = req.body;
    try {
        const q = `INSERT INTO sensor_readings (node_id, dp, t_in, t_out, p_header, pm, cleaning, rssi, snr, timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`;
        const v = [Number(node_id), Number(dp)||0, Number(t_in)||0, Number(t_out)||0, Number(p_header)||0, Number(pm)||0, Boolean(cleaning)||false, Number(rssi)||0, Number(snr)||0, Number(timestamp)||Math.floor(Date.now()/1000)];
        const r = await pool.query(q, v);
        const saved = r.rows[0];
        broadcastData({ ...saved, device_id: `Node-${saved.node_id}`, diff_pressure: saved.dp, inlet_temp: saved.t_in, outlet_temp: saved.t_out, header_pressure: saved.p_header, pm_level: saved.pm, cleaning_status: saved.cleaning, timestamp: saved.created_at });
        res.json({ success: true, id: saved.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- DATA FETCH ---
app.get('/api/data', verifyToken, async (req, res) => {
    try {
        const r = await pool.query(`SELECT * FROM sensor_readings ORDER BY created_at DESC LIMIT 500`);
        const d = r.rows.map(row => ({ ...row, device_id: `Node-${row.node_id}`, diff_pressure: row.dp, inlet_temp: row.t_in, outlet_temp: row.t_out, header_pressure: row.p_header, pm_level: row.pm, cleaning_status: row.cleaning, timestamp: row.created_at }));
        res.json({ success: true, data: d });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/export/:nodeId', verifyToken, async (req, res) => {
    try {
        const nodeId = req.params.nodeId.replace('Node-', '');
        const r = await pool.query(`SELECT * FROM sensor_readings WHERE node_id = $1 ORDER BY created_at DESC LIMIT 5000`, [Number(nodeId)]);
        let csv = 'Timestamp,DeviceID,DiffPressure,InletTemp,OutletTemp,HeaderPressure,PM,Cleaning,RSSI,SNR\n';
        r.rows.forEach(d => {
            csv += `${new Date(d.created_at).toISOString()},Node-${d.node_id},${d.dp},${d.t_in},${d.t_out},${d.p_header},${d.pm},${d.cleaning},${d.rssi},${d.snr}\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="LOG_Node-${nodeId}_${Date.now()}.csv"`);
        res.send(csv);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- RAG KNOWLEDGE BASE UPLOAD ---
// Permanently stores the file in DB + uploads to Gemini
app.post('/api/upload_knowledge', verifyToken, upload.single('document'), async (req, res) => {
    try {
        if (!req.file) throw new Error("No file received");
        
        const localPath = path.join(__dirname, req.file.path);
        const mimeType = req.file.mimetype || 'application/pdf';
        
        console.log(`📤 Uploading ${req.file.originalname} to Gemini AI...`);
        const uploadResult = await ai.files.upload({
            file: localPath,
            mimeType: mimeType,
            config: { displayName: req.file.originalname }
        });
        console.log(`✅ Uploaded to Gemini: ${uploadResult.uri}`);

        const insertQ = `INSERT INTO knowledge_files (original_name, local_path, mime_type, gemini_uri, uploaded_at) VALUES ($1, $2, $3, $4, $5) RETURNING id, original_name`;
        const uploadedAt = Math.floor(Date.now() / 1000);
        
        await pool.query(insertQ, [req.file.originalname, localPath, mimeType, uploadResult.uri, uploadedAt]);

        res.json({ success: true, message: 'Document added to AI context successfully!' });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: e.message }); 
    }
});

// --- GET KNOWLEDGE BASE FILES ---
app.get('/api/knowledge', verifyToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT original_name, uploaded_at FROM knowledge_files ORDER BY uploaded_at DESC');
        res.json({ success: true, files: r.rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- HYBRID AI ENDPOINT (GEMINI) ---
app.post('/api/chat', verifyToken, async (req, res) => {
    const { message, contextData } = req.body;
    const lowerMsg = message.toLowerCase();

    // 0. GREETING PATH
    if (/^(hello|hi|hey|good\s*(morning|afternoon|evening))/i.test(lowerMsg)) {
        return res.json({ reply: "👋 Hello! I am Ion Assist (Gemini Powered).\n\nI am currently monitoring the plant sensors and analyzing uploaded datasheets. How can I help?" });
    }

    // 1. DEEP PATH (Gemini)
    try {
         const kbResult = await pool.query('SELECT * FROM knowledge_files');
         
         const nowStamp = Math.floor(Date.now() / 1000);
         const EXPIRY_SECONDS = 40 * 3600; // Auto-renew Gemini URIs older than 40 hours
         
         let fileParts = [];
         
         for (let row of kbResult.rows) {
             let activeUri = row.gemini_uri;
             
             // Refresh Permanent File if Gemini URI is expiring
             if ((nowStamp - row.uploaded_at) > EXPIRY_SECONDS) {
                 if (fs.existsSync(row.local_path)) {
                     console.log(`🔄 Refreshing expiring Gemini URI for ${row.original_name}...`);
                     const newUpload = await ai.files.upload({ file: row.local_path, mimeType: row.mime_type });
                     activeUri = newUpload.uri;
                     await pool.query('UPDATE knowledge_files SET gemini_uri = $1, uploaded_at = $2 WHERE id = $3', [activeUri, nowStamp, row.id]);
                 }
             }
             
             fileParts.push({
                 fileData: { fileUri: activeUri, mimeType: row.mime_type }
             });
         }
         
         const systemPrompt = `
         You are a specialized Industrial IoT Assistant named "Ion Assist".
         1. You are given real-time JSON context telemetry data directly below.
         2. You are also given physical uploaded PDF documents (datasheets, filters, manuals).
         3. Analyze the user's query utilizing BOTH the live telemetry AND the context from the PDFs.
         4. Never invent data. Keep it concise.
         
         REAL-TIME SENSOR DATA:
         ${JSON.stringify(contextData)}
         `;

         console.log('🤖 Sending context to Gemini 2.5 Flash...');
         
         const contentsArr = [
             { role: 'user', parts: [
                 { text: systemPrompt },
                 ...fileParts,
                 { text: `USER QUERY: ${message}` }
             ]}
         ];
         
         const response = await ai.models.generateContent({
             model: 'gemini-2.5-flash',
             contents: contentsArr
         });
         
         res.json({ reply: response.text });

    } catch(err) {
        console.error("Gemini Error:", err);
        res.status(500).json({ reply: "⚠️ Gemini Edge AI Error: " + err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on ${PORT}`));