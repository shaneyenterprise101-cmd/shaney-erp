import express from 'express';
import cors from 'cors';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const app = express();
app.use(cors());

// Increased body payload limit to 50MB to completely eliminate Status 413 errors
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// 5. Get Data from DynamoDB & Public Document Endpoint Support
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

// Public JSON Document Fetch Endpoint
app.get('/api/document/:id', async (req, res) => {
    try {
        const docId = req.params.id;
        const scanResult = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME }));
        
        let foundDocument = null;
        for (const record of scanResult.Items) {
            if (record.data && Array.isArray(record.data)) {
                const match = record.data.find(i => String(i.id) === String(docId));
                if (match) {
                    foundDocument = match;
                    break;
                }
            }
        }

        if (!foundDocument) {
            return res.status(404).json({ success: false, error: "Document not found" });
        }

        res.json({ success: true, data: foundDocument });
    } catch (err) {
        console.error("GET /api/document/:id error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 🟢 Public HTML Preview Route for WhatsApp Links (Direct Browser Rendering)
app.get('/preview/:id', async (req, res) => {
    try {
        const docId = req.params.id;
        const scanResult = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME }));
        
        let foundDoc = null;
        for (const record of scanResult.Items) {
            if (record.data && Array.isArray(record.data)) {
                const match = record.data.find(i => String(i.id) === String(docId));
                if (match) {
                    foundDoc = match;
                    break;
                }
            }
        }

        if (!foundDoc) {
            return res.send(`
                <html>
                    <head><title>Document Not Found</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                    <body style="font-family:sans-serif; text-align:center; padding:50px; background:#f8fafc;">
                        <h2 style="color:#dc2626;">Document Not Found</h2>
                        <p style="color:#64748b;">The link might be expired or the document does not exist.</p>
                    </body>
                </html>
            `);
        }

        const isCert = foundDoc.docType === 'certificate' || foundDoc.ref;
        const title = isCert ? "Fire Safety Certificate" : "Quotation";
        const items = foundDoc.itemsData ? JSON.parse(foundDoc.itemsData) : null;

        let itemsHTML = '';
        if (isCert && items && items.items) {
            itemsHTML = `
                <table style="width:100%; border-collapse:collapse; margin-top:20px; font-size:14px;">
                    <tr style="background:#f1f5f9;"><th style="border:1px solid #cbd5e1; padding:8px;">Type</th><th style="border:1px solid #cbd5e1; padding:8px;" colspan="2">Details</th></tr>
                    <tr><td style="border:1px solid #cbd5e1; padding:8px;">Hy. Test</td><td colspan="2" style="border:1px solid #cbd5e1; padding:8px; text-align:center; font-weight:bold;">${items.hyTest || '-'}</td></tr>
                    <tr><td style="border:1px solid #cbd5e1; padding:8px;">Parts</td><td colspan="2" style="border:1px solid #cbd5e1; padding:8px; text-align:center; font-weight:bold;">${items.parts || '-'}</td></tr>
                    <tr><td style="border:1px solid #cbd5e1; padding:8px;">Remark</td><td colspan="2" style="border:1px solid #cbd5e1; padding:8px; text-align:center; font-weight:bold;">${items.remark || '-'}</td></tr>
                </table>
            `;
        } else if (!isCert && items) {
            let rows = Array.isArray(items) ? items : [];
            itemsHTML = `
                <table style="width:100%; border-collapse:collapse; margin-top:20px; font-size:14px;">
                    <tr style="background:#f1f5f9;"><th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Description</th><th style="border:1px solid #cbd5e1; padding:8px;">Qty</th><th style="border:1px solid #cbd5e1; padding:8px;">Rate</th><th style="border:1px solid #cbd5e1; padding:8px;">Amount</th></tr>
                    ${rows.map(it => `<tr><td style="border:1px solid #cbd5e1; padding:8px;">${it.desc || ''}</td><td style="border:1px solid #cbd5e1; padding:8px; text-align:center;">${it.qty || 0}</td><td style="border:1px solid #cbd5e1; padding:8px; text-align:center;">₹${it.rate || 0}</td><td style="border:1px solid #cbd5e1; padding:8px; text-align:right;">₹${Number(it.amount||0).toFixed(2)}</td></tr>`).join('')}
                </table>
            `;
        }

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${title} - ${foundDoc.vendor || 'Shaney Enterprise'}</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #e2e8f0; margin: 0; padding: 20px; display: flex; justify-content: center; }
                    .card { background: #ffffff; width: 100%; max-width: 750px; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); }
                    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #00a67e; padding-bottom: 20px; margin-bottom: 20px; }
                    .firm-name { font-size: 22px; font-weight: 900; text-transform: uppercase; color: #0f172a; margin: 0; }
                    .doc-title { font-size: 14px; font-weight: bold; color: #dc2626; margin-top: 5px; }
                    .meta { text-align: right; font-size: 13px; color: #475569; }
                    .details { font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 20px; }
                    .total { text-align: right; font-size: 18px; font-weight: 900; color: #0f172a; margin-top: 20px; font-family: monospace; }
                    .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="header">
                        <div>
                            <h1 class="firm-name">${foundDoc.vendor || 'Shaney Enterprise'}</h1>
                            <div class="doc-title">${title}</div>
                        </div>
                        <div class="meta">
                            <div><strong>Date:</strong> ${foundDoc.date || ''}</div>
                            <div><strong>Ref No:</strong> ${foundDoc.ref || ''}</div>
                        </div>
                    </div>
                    <div class="details">
                        <p><strong>Billed To / Certified M/s:</strong> ${foundDoc.party || ''}</p>
                        ${foundDoc.validDate ? `<p><strong>Valid Upto:</strong> ${foundDoc.validDate}</p>` : ''}
                    </div>
                    ${itemsHTML}
                    <div class="total">Grand Total: ₹${Number(foundDoc.total || 0).toFixed(2)}</div>
                    <div class="footer">For ${foundDoc.vendor || 'Shaney Enterprise'} &bull; Verified Digital Document</div>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error("GET /preview/:id error:", err);
        res.status(500).send("Internal Server Error");
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

// 7. Delete Record from DynamoDB (Matches Frontend DELETE Requests)
app.delete('/api/data/:id', async (updatedReq, res) => {
    try {
        const targetId = updatedReq.params.id;
        const scanResult = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME }));
        let deleted = false;

        for (const record of scanResult.Items) {
            if (record.data && Array.isArray(record.data)) {
                const initialLen = record.data.length;
                const filteredData = record.data.filter(i => String(i.id) !== String(targetId));
                if (filteredData.length < initialLen) {
                    await dynamo.send(new PutCommand({
                        TableName: TABLE_NAME,
                        Item: {
                            id: record.id,
                            data: filteredData,
                            updatedAt: new Date().toISOString()
                        }
                    }));
                    deleted = true;
                }
            }
        }

        res.json({ success: true, deleted });
    } catch (err) {
        console.error("DELETE /api/data/:id error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🖥️ Shaney ERP Backend connected to AWS DynamoDB on port ${PORT}`);
});