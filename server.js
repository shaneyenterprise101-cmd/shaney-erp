import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

let activeSessions = {}; // { username: timestamp }
const LOG_FILE = './office_logs.json';

// 🟢 Load existing logs from file on startup so data is never lost
let officeLogs = [];
if (fs.existsSync(LOG_FILE)) {
    try {
        officeLogs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    } catch (e) {
        officeLogs = [];
    }
}

// Helper to save logs permanently to disk
const saveLogsToFile = () => {
    try {
        fs.writeFileSync(LOG_FILE, JSON.stringify(officeLogs, null, 2));
    } catch (e) {
        console.error("Error saving logs to file:", e);
    }
};

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

// 3. Get Live Office Feed Logs (with optional date & staff filters)
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

// 4. Post New Office Live Log (Saves permanently with Date & Staff tracking)
app.post('/api/logs', (req, res) => {
    const { action, staff } = req.body;
    if (action) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-GB'); // Format: DD/MM/YYYY
        const timeStr = now.toLocaleTimeString();

        // Extract staff name from action string if formatted as "STAFF: action" or passed separately
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
        
        // Keep up to 10,000 logs safely stored on disk for long-term daily history
        if (officeLogs.length > 10000) officeLogs.pop(); 
        
        saveLogsToFile();
    }
    res.json({ success: true, logs: officeLogs });
});

// Server listen on all network interfaces (Port 5000)
app.listen(5000, '0.0.0.0', () => {
    console.log('🖥️ Daily Persistent Backend Server running on port 5000');
});