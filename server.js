import express from 'express';
import cors from 'cors';
import fs from 'fs';

const app = express();
app.use(cors());
app.use(express.json());

let activeSessions = {}; // { username: timestamp }
const LOG_FILE = './office_logs.json';
const DATA_FILE = './master_state.json';

// 🟢 Load existing logs from file on startup
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
    } catch (e) {
        console.error("Error saving logs to file:", e);
    }
};

// 🟢 Load Master State Data from file (Replaces Firebase database storage)
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
    } catch (e) {
        console.error("Error saving master state to file:", e);
    }
};

// 0. Root Route (Fixes "Cannot GET /" error on browser)
app.get('/', (req, res) => {
    res.send('🚀 Shaney ERP Backend is Live and Running!');
});

// 1. Heartbeat API for Online/Offline Status
app.post('/api/heartbeat', (req, res) => {
    const username = req.body.username || req.body.user;
    if (username) {
        activeSessions[username.toLowerCase()] = Date.now();
    }
    res.json({ success: true });
});

// 2. Get All Active Online Users (filters out offline > 90 seconds)
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

// 3. Get Live Office Feed Logs
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

// 4. Post New Office Live Log
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

// 5. Get Master State Data API (For SyncManager sync)
app.get('/api/data', (req, res) => {
    const { key } = req.query;
    if (!key) {
        return res.status(400).json({ error: 'Storage key required' });
    }
    const data = masterState[key] || [];
    res.json({ success: true, data });
});

// 6. Save Data API (For SyncManager saveData)
app.post('/api/data', (req, res) => {
    const { key, item } = req.body;
    if (!key || !item) {
        return res.status(400).json({ error: 'Key and item required' });
    }

    if (!masterState[key]) {
        masterState[key] = [];
    }

    let list = masterState[key];
    const index = list.findIndex(i => String(i.id) === String(item.id));
    if (index !== -1) {
        list[index] = item;
    } else {
        list.push(item);
    }

    saveMasterStateToFile();
    res.json({ success: true });
});

// 7. Delete Data API (For SyncManager deleteData)
app.post('/api/data/delete', (req, res) => {
    const { key, itemId } = req.body;
    if (!key || !itemId) {
        return res.status(400).json({ error: 'Key and itemId required' });
    }

    if (masterState[key]) {
        masterState[key] = masterState[key].filter(i => String(i.id) !== String(itemId));
        saveMasterStateToFile();
    }

    res.json({ success: true });
});

// 8. Public Document Preview API
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
        res.status(404).json({ error: 'Document not found' });
    }
});

// Server listen on Render PORT or default 5000
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🖥️ Shaney ERP Backend Server running on port ${PORT}`);
});