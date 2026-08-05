import express from 'express';
import cors from 'cors';
import fs from 'fs';
import http from 'http';
import { Server } from 'socket.io';
import { default as makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode';

const app = express();
app.use(cors());

// 🟢 Increased body payload limit to 50MB to prevent 413 Payload Too Large errors on large templates/images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

let activeSessions = {}; // { username: timestamp }
const LOG_FILE = './office_logs.json';
const DATA_FILE = './master_state.json';

// WhatsApp Baileys State Variables
let waSock = null;
let waStatus = 'Disconnected';
let currentQrCode = '';
let connectedPhoneNumber = '';
let waLogsList = [];

// Request logging middleware for debugging on Render
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Load existing logs from file on startup
let officeLogs = [];
if (fs.existsSync(LOG_FILE)) {
    try {
        officeLogs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    } catch (e) {
        officeLogs = [];
    }
}

const saveLogsToFile = () => {
    try {
        fs.writeFileSync(LOG_FILE, JSON.stringify(officeLogs, null, 2));
    } catch (e) {}
};

// Load Master State Data from file
let masterState = {};
if (fs.existsSync(DATA_FILE)) {
    try {
        masterState = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        masterState = {};
    }
}

const saveMasterStateToFile = () => {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(masterState, null, 2));
    } catch (e) {}
};

// ==================== WHATSAPP BAILEYS LOGIC ====================
async function startWhatsApp(phoneNumber = '') {
    try {
        if (waSock) {
            try { await waSock.logout(); } catch(e){}
            waSock = null;
        }

        waStatus = 'Scanning';
        currentQrCode = '';

        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        waSock = makeWASocket({
            auth: state,
            printQRInTerminal: true
        });

        waSock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                try {
                    currentQrCode = await qrcode.toDataURL(qr);
                    waStatus = 'Scanning';
                    console.log("📲 New WhatsApp QR Code Generated!");
                } catch (err) {
                    console.error("QR generation error:", err);
                }
            }

            if (connection === 'open') {
                waStatus = 'Connected';
                currentQrCode = '';
                connectedPhoneNumber = phoneNumber || 'Linked Device';
                console.log('✅ WhatsApp Connected Successfully!');
            }

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
                if (shouldReconnect) {
                    startWhatsApp(phoneNumber);
                } else {
                    waStatus = 'Disconnected';
                    currentQrCode = '';
                    connectedPhoneNumber = '';
                }
            }
        });

        waSock.ev.on('creds.update', saveCreds);
    } catch (err) {
        console.error("Start WhatsApp error:", err);
        waStatus = 'Disconnected';
    }
}

// ==================== API ROUTES ====================

app.get('/', (req, res) => {
    res.send('Shaney ERP Backend with WhatsApp Baileys is Live and Running!');
});

// WhatsApp API Endpoints
app.get('/api/whatsapp/status', (req, res) => {
    res.json({
        success: true,
        status: waStatus,
        qr: currentQrCode,
        phone: connectedPhoneNumber
    });
});

app.post('/api/whatsapp/connect', async (req, res) => {
    const { phone } = req.body;
    try {
        await startWhatsApp(phone);
        res.json({ success: true, status: waStatus, qr: currentQrCode });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/whatsapp/refresh', async (req, res) => {
    try {
        if (!waSock) {
            await startWhatsApp(connectedPhoneNumber);
        }
        res.json({ success: true, qr: currentQrCode, status: waStatus });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/whatsapp/logout', async (req, res) => {
    try {
        if (waSock) {
            await waSock.logout();
            waSock = null;
        }
        if (fs.existsSync('./auth_info_baileys')) {
            fs.rmSync('./auth_info_baileys', { recursive: true, force: true });
        }
        waStatus = 'Disconnected';
        currentQrCode = '';
        connectedPhoneNumber = '';
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/whatsapp/logs', (req, res) => {
    res.json(waLogsList);
});

// Heartbeat & Office Logs
app.post('/api/heartbeat', (req, res) => {
    const username = req.body.username || req.body.user;
    if (username) {
        activeSessions[username.toLowerCase()] = Date.now();
    }
    res.json({ success: true });
});

app.get('/api/sessions', (req, res) => {
    const now = Date.now();
    let onlineUsers = {};
    for (let [user, time] of Object.entries(activeSessions)) {
        if (now - time < 90000) { 
            onlineUsers[user] = true;
        }
    }
    res.json(onlineUsers);
});

app.get('/api/logs', (req, res) => {
    const { staff, date } = req.query;
    let filtered = officeLogs;
    if (staff && staff !== 'ALL') {
        filtered = filtered.filter(l => l.staff && l.staff.toUpperCase() === staff.toUpperCase());
    }
    if (date) {
        filtered = filtered.filter(l => l.date === date);
    }
    res.json(filtered);
});

app.post('/api/logs', (req, res) => {
    const { action, staff } = req.body;
    if (action) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-GB'); 
        const timeStr = now.toLocaleTimeString();

        let staffName = staff || 'ADMIN';
        let cleanAction = action;

        if (action.includes(':')) {
            const parts = action.split(':');
            staffName = parts[0].trim();
            cleanAction = parts.slice(1).join(':').trim();
        }

        const newLog = {
            id: Date.now(),
            staff: staffName.toUpperCase(),
            action: cleanAction,
            date: dateStr,
            time: timeStr
        };

        officeLogs.unshift(newLog);
        if (officeLogs.length > 10000) officeLogs.pop(); 
        saveLogsToFile();
    }
    res.json({ success: true, logs: officeLogs });
});

// Master State Data APIs
app.get('/api/data', (req, res) => {
    const { key } = req.query;
    if (!key) {
        return res.json(masterState);
    }
    const data = masterState[key] || [];
    res.json({ success: true, data });
});

app.post('/api/data', (req, res) => {
    const storageKey = req.body.key || req.body.type;
    const itemToSave = req.body.item || req.body.data;

    if (!storageKey || !itemToSave) {
        return res.status(400).json({ success: false, error: 'Key/Type and Item/Data required' });
    }

    if (!masterState[storageKey]) {
        masterState[storageKey] = [];
    }

    let list = masterState[storageKey];
    
    // Check if list is an array, if not (like objects/templates), overwrite directly
    if (Array.isArray(list)) {
        const index = list.findIndex(i => String(i.id) === String(itemToSave.id));
        if (index !== -1) {
            list[index] = itemToSave;
        } else {
            list.push(itemToSave);
        }
    } else {
        masterState[storageKey] = itemToSave;
    }

    saveMasterStateToFile();
    res.json({ success: true });
});

app.post('/api/data/delete', (req, res) => {
    const { key, itemId } = req.body;
    if (!key || !itemId) {
        return res.status(400).json({ success: false, error: 'Key and itemId required' });
    }

    if (masterState[key] && Array.isArray(masterState[key])) {
        masterState[key] = masterState[key].filter(i => String(i.id) !== String(itemId));
        saveMasterStateToFile();
    }

    res.json({ success: true });
});

app.delete('/api/data/:id', (req, res) => {
    const targetId = req.params.id;
    let deleted = false;

    for (const [key, list] of Object.entries(masterState)) {
        if (Array.isArray(list)) {
            const initialLen = list.length;
            masterState[key] = list.filter(i => String(i.id) !== String(targetId));
            if (masterState[key].length < initialLen) {
                deleted = true;
            }
        }
    }

    if (deleted) {
        saveMasterStateToFile();
    }

    res.json({ success: true, deleted });
});

app.get('/api/document/:id', (req, res) => {
    const docId = req.params.id;
    let foundDoc = null;

    for (const [key, list] of Object.entries(masterState)) {
        if (Array.isArray(list)) {
            const match = list.find(item => String(item.id) === String(docId));
            if (match) {
                const isQuote = key.includes('quotation') || match.type === 'quotation';
                foundDoc = {
                    type: isQuote ? 'quotation' : 'certificate',
                    data: match
                };
                break;
            }
        }
    }

    if (foundDoc) {
        res.json(foundDoc);
    } else {
        res.status(404).json({ success: false, error: 'Document not found' });
    }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Shaney ERP Backend Server running on port ${PORT}`);
});