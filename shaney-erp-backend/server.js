import express from 'express';
import cors from 'cors';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const app = express();
app.use(cors());
app.use(express.json());

// Initialize AWS DynamoDB Client
const ddbClient = new DynamoDBClient({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});
const dynamo = DynamoDBDocumentClient.from(ddbClient);
const TABLE_NAME = "ShaneyERP_MasterState";

let activeSessions = {}; // { username: timestamp }
let officeLogs = [];

// Request logging middleware
app.use((req, res, next) => {
    console.log(`📥 [${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// 0. Root Route
app.get('/', (req, res) => {
    try {
        res.send('🚀 Shaney ERP Backend with AWS DynamoDB is Live!');
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// Backend Login Authentication Route
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: "Email/User ID and Password are required" });
        }

        const cleanEmail = email.trim().toLowerCase();

        // 1. Check Master Admin Credentials
        if ((cleanEmail === 'shaneyenterprise101@gmail.com' || cleanEmail === 'admin') && (password === 'Shaney@123' || password === 'admin123')) {
            return res.json({
                success: true,
                user: {
                    userid: cleanEmail,
                    name: 'Shaney Enterprise',
                    role: 'ADMIN',
                    permissions: { Dashboard: true, Certificate: true, Quotation: true, CRM: true, Export: true }
                }
            });
        }

        // 2. Check Staff Accounts from DynamoDB
        const staffGet = await dynamo.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { id: 'staff_accounts' }
        }));

        let staffList = staffGet.Item && Array.isArray(staffGet.Item.data) ? staffGet.Item.data : [];
        const foundStaff = staffList.find(s => String(s.userid).toLowerCase() === cleanEmail || String(s.name).toLowerCase() === cleanEmail);

        if (foundStaff && String(foundStaff.password) === String(password)) {
            return res.json({
                success: true,
                user: {
                    userid: foundStaff.userid,
                    name: foundStaff.name,
                    role: 'STAFF',
                    phone: foundStaff.phone || '',
                    permissions: foundStaff.permissions || { Dashboard: true, Certificate: true, Quotation: true, CRM: true, Export: true }
                }
            });
        }

        res.status(401).json({ success: false, error: "Invalid Admin Email or Staff User ID / Password!" });
    } catch (err) {
        console.error("POST /api/login error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 1. Heartbeat API
app.post('/api/heartbeat', (req, res) => {
    try {
        const username = req.body.username || req.body.user;
        if (username) {
            activeSessions[username.toLowerCase()] = Date.now();
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Get All Active Online Users
app.get('/api/sessions', (req, res) => {
    try {
        const now = Date.now();
        let onlineUsers = {};
        for (let [user, time] of Object.entries(activeSessions)) {
            if (now - time < 90000) { 
                onlineUsers[user] = true;
            }
        }
        res.json(onlineUsers);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Get Live Office Feed Logs
app.get('/api/logs', (req, res) => {
    try {
        res.json(officeLogs);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Post New Office Live Log (Strictly Capped to 50 logs in RAM)
app.post('/api/logs', (req, res) => {
    try {
        const { action, staff } = req.body;
        if (action) {
            const now = new Date();
            const newLog = {
                id: Date.now().toString(),
                staff: (staff || 'ADMIN').toUpperCase(),
                action,
                date: now.toLocaleDateString('en-GB'),
                time: now.toLocaleTimeString()
            };
            officeLogs.unshift(newLog);
            if (officeLogs.length > 50) officeLogs.pop();
        }
        res.json({ success: true, logs: officeLogs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. Get Data from DynamoDB
app.get('/api/data', async (req, res) => {
    try {
        const { key } = req.query;
        if (!key) {
            const scanResult = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME }));
            let masterState = {};
            scanResult.Items.forEach(item => {
                masterState[item.id] = item.data;
            });
            return res.json(masterState);
        }

        const getResult = await dynamo.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { id: key }
        }));

        res.json({ success: true, data: getResult.Item ? getResult.Item.data : [] });
    } catch (err) {
        console.error("GET /api/data error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. Save Data to DynamoDB
app.post('/api/data', async (req, res) => {
    try {
        const key = req.body.key || req.body.type || 'general';
        let item = req.body.item || req.body.data || req.body;

        const existing = await dynamo.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { id: key }
        }));

        let list = existing.Item && Array.isArray(existing.Item.data) ? existing.Item.data : [];

        if (item && item.id) {
            const index = list.findIndex(i => String(i.id) === String(item.id));
            if (index !== -1) {
                list[index] = item;
            } else {
                list.push(item);
            }
        } else if (Array.isArray(item)) {
            list = item;
        } else {
            list.push(item);
        }

        await dynamo.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                id: key,
                data: list,
                updatedAt: new Date().toISOString()
            }
        }));

        res.json({ success: true });
    } catch (err) {
        console.error("POST /api/data error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🖥️ Shaney ERP Backend connected to AWS DynamoDB on port ${PORT}`);
});