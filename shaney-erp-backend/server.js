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

// 🟢 Exact-Match Professional A4 Preview Route for WhatsApp Links
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
        const items = foundDoc.itemsData ? JSON.parse(foundDoc.itemsData) : null;

        if (isCert) {
            // --- CERTIFICATE A4 EXACT HTML RENDERER ---
            let tableRowsHTML = '';
            if (items && items.items) {
                Object.entries(items.items).forEach(([cat, rows]) => {
                    const validRows = (rows || []).filter(r => r.cap || r.qty);
                    if (validRows.length > 0) {
                        const capStr = validRows.map(r => r.cap).filter(Boolean).join(', ');
                        const qtyStr = validRows.map(r => r.qty).filter(Boolean).join(' + ');
                        tableRowsHTML += `
                            <tr>
                                <td style="text-align:left; padding:6px 10px; border:1px solid #000; font-style:italic; font-weight:500;">${cat}</td>
                                <td style="padding:6px 10px; border:1px solid #000; font-weight:bold;">${capStr}</td>
                                <td style="padding:6px 10px; border:1px solid #000; font-weight:bold;">${qtyStr}</td>
                            </tr>
                        `;
                    }
                });
            }

            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Certificate - ${foundDoc.vendor || 'Shaney Enterprise'}</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { background: #cbd5e1; margin: 0; padding: 20px; display: flex; justify-content: center; font-family: 'Georgia', serif; }
                        .a4-page { background: #ffffff; width: 794px; min-height: 1123px; padding: 40px; box-sizing: border-box; position: relative; box-shadow: 0 15px 35px rgba(0,0,0,0.2); display: flex; flex-direction: column; }
                        .content-row { display: flex; flex-direction: row; height: 100%; flex-grow: 1; position: relative; z-index: 10; }
                        .cert-sidebar { width: 70px; min-width: 70px; display: flex; flex-direction: column; align-items: center; padding-top: 80px; }
                        .cert-char { font-size: 42px; font-weight: 900; color: #dc2626; margin-bottom: 8px; line-height: 1; font-family: 'Georgia', serif; }
                        .main-body { flex-grow: 1; display: flex; flex-direction: column; padding-left: 10px; }
                        .header-box { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #00a67e; padding-bottom: 15px; margin-bottom: 25px; margin-top: 20px; }
                        .firm-title { font-size: 32px; font-weight: 900; text-transform: uppercase; font-family: 'Arial', sans-serif; color: #0f172a; margin: 0; line-height: 1; }
                        .firm-sub { font-size: 14px; font-weight: 900; color: #dc2626; margin-top: 6px; letter-spacing: 0.05em; }
                        .meta-box { text-align: right; font-size: 14px; font-family: 'Georgia', serif; }
                        .party-box { margin-bottom: 25px; font-size: 15.5px; line-height: 1.6; }
                        .party-val { font-family: 'Caveat', cursive, Georgia, serif; font-size: 20px; font-weight: bold; text-transform: uppercase; margin-left: 10px; }
                        .cert-text { text-align: center; font-size: 15.5px; line-height: 1.6; margin-bottom: 25px; font-style: italic; }
                        .cert-table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-bottom: 30px; }
                        .cert-table th { padding: 6px; text-align: center; border: 1px solid #000; font-size: 13px; font-weight: bold; background: transparent; }
                        .cert-table td { padding: 6px; text-align: center; border: 1px solid #000; font-size: 12px; background: transparent; }
                        .footer-box { margin-top: auto; padding-top: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
                        .footer-addr { font-size: 10px; font-family: monospace; color: #64748b; line-height: 1.4; }
                        .sign-box { text-align: center; min-width: 220px; font-family: 'Arial', sans-serif; }
                        .sign-title { font-size: 14px; font-weight: bold; }
                        .sign-space { height: 50px; }
                    </style>
                </head>
                <body>
                    <div class="a4-page">
                        <div class="content-row">
                            <div class="cert-sidebar">
                                <div class="cert-char">C</div>
                                <div class="cert-char">E</div>
                                <div class="cert-char">R</div>
                                <div class="cert-char">T</div>
                                <div class="cert-char">I</div>
                                <div class="cert-char">F</div>
                                <div class="cert-char">I</div>
                                <div class="cert-char">C</div>
                                <div class="cert-char">A</div>
                                <div class="cert-char">T</div>
                                <div class="cert-char">E</div>
                            </div>
                            <div class="main-body">
                                <div class="header-box">
                                    <div>
                                        <h1 class="firm-title">${foundDoc.vendor || 'COMPANY ENTERPRISE'}</h1>
                                        <div class="firm-sub">Fire And Safety</div>
                                    </div>
                                    <div class="meta-box">
                                        <div>Date :- <span>${foundDoc.date || 'DD-MM-YYYY'}</span></div>
                                        <div style="margin-top: 4px;">SR.No :- <span>${foundDoc.ref || '-----'}</span></div>
                                    </div>
                                </div>

                                <div class="party-box">
                                    <div>Certified M/s:- <span class="party-val">${foundDoc.party || 'CUSTOMER NAME'}</span></div>
                                    <div style="margin-top: 8px;">Address :- <span class="party-val">Address</span></div>
                                </div>

                                <div class="cert-text">
                                    <div>We certify that the fire extinguishers mentioned below</div>
                                    <div>Are tested and refilled as per the relevant Indian standard.</div>
                                    <div style="margin-top: 6px;">This extinguishers are refilled on Date :- <span style="color:#dc2626; font-family:monospace;">${foundDoc.date || 'DD-MM-YYYY'}</span></div>
                                    <div>And Warranty will stand valid up to Date :- <span style="color:#dc2626; font-family:monospace;">${foundDoc.validDate || 'DD-MM-YYYY'}</span></div>
                                    <div>Provided the seal is unbroken and in satisfactory condition.</div>
                                </div>

                                <table class="cert-table">
                                    <thead>
                                        <tr>
                                            <th style="width: 45%;">Extinguisher Type</th>
                                            <th style="width: 30%;">Capacity</th>
                                            <th style="width: 25%;">Qty</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td style="text-align:left; padding:6px 10px; border:1px solid #000; font-style:italic; font-weight:bold;">Hy. Test</td>
                                            <td colspan="2" style="border:1px solid #000; font-weight:bold;">${items?.hyTest || 'Pass'}</td>
                                        </tr>
                                        <tr>
                                            <td style="text-align:left; padding:6px 10px; border:1px solid #000; font-style:italic; font-weight:bold;">Parts</td>
                                            <td colspan="2" style="border:1px solid #000; font-weight:bold;">${items?.parts || 'COMPLETE'}</td>
                                        </tr>
                                        <tr>
                                            <td style="text-align:left; padding:6px 10px; border:1px solid #000; font-style:italic; font-weight:bold;">Remark</td>
                                            <td colspan="2" style="border:1px solid #000; font-weight:bold;">${items?.remark || 'OK'}</td>
                                        </tr>
                                        ${tableRowsHTML}
                                    </tbody>
                                </table>

                                <div class="footer-box">
                                    <div class="footer-addr">
                                        <div>112, Royal Plaza, Near Sai baba Temple, Zanzarda Road, Junagadh-362001.</div>
                                        <div>+91 97263 50101 | +91 97264 50101</div>
                                    </div>
                                    <div class="sign-box">
                                        <div class="sign-title">For ${foundDoc.vendor || 'COMPANY ENTERPRISE'}</div>
                                        <div class="sign-space"></div>
                                        <div class="sign-title">Authorised Signature</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `);
        } else {
            // --- QUOTATION A4 EXACT HTML RENDERER ---
            const quoteItems = items && Array.isArray(items) ? items : [];
            const gross = quoteItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);
            const gstRate = quoteItems.length > 0 && quoteItems[0].gst !== undefined ? Number(quoteItems[0].gst) : 18;
            const cgst = (gross * (gstRate / 2)) / 100;
            const sgst = (gross * (gstRate / 2)) / 100;
            const grandTotal = Math.round(gross + cgst + sgst);

            let qRowsHTML = quoteItems.map((it, idx) => `
                <tr>
                    <td style="padding:10px; border-bottom:1px solid #f1f5f9; text-align:center;">${idx + 1}</td>
                    <td style="padding:10px; border-bottom:1px solid #f1f5f9; text-align:left; font-weight:bold;">${it.desc || ''}</td>
                    <td style="padding:10px; border-bottom:1px solid #f1f5f9; text-align:center;">${it.hsn || '8424'}</td>
                    <td style="padding:10px; border-bottom:1px solid #f1f5f9; text-align:center;">${it.gst ?? 18}%</td>
                    <td style="padding:10px; border-bottom:1px solid #f1f5f9; text-align:center;">${it.qty || 0}</td>
                    <td style="padding:10px; border-bottom:1px solid #f1f5f9; text-align:center;">${it.rate || 0}</td>
                    <td style="padding:10px; border-bottom:1px solid #f1f5f9; text-align:right; font-family:monospace; font-weight:bold;">${Number(it.amount || 0).toFixed(2)}</td>
                </tr>
            `).join('');

            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Quotation - ${foundDoc.vendor || 'Shaney Enterprise'}</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { background: #cbd5e1; margin: 0; padding: 20px; display: flex; justify-content: center; font-family: 'Arial', sans-serif; }
                        .a4-page { background: #ffffff; width: 794px; min-height: 1123px; padding: 50px; box-sizing: border-box; position: relative; box-shadow: 0 15px 35px rgba(0,0,0,0.2); display: flex; flex-direction: column; }
                        .top-bar { position: absolute; top: 0; left: 0; right: 0; height: 8px; background: #1e40af; }
                        .q-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e40af; padding-bottom: 20px; margin-bottom: 25px; }
                        .q-title { font-size: 32px; font-weight: 900; color: #1e40af; text-transform: uppercase; margin: 0 0 5px 0; }
                        .firm-name { font-size: 24px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin: 0; }
                        .billing-box { display: flex; justify-content: space-between; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 25px; }
                        .q-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 13px; }
                        .q-table th { background: #f1f5f9; color: #1e40af; padding: 12px 10px; text-transform: uppercase; font-size: 11px; font-weight: 800; border-bottom: 2px solid #1e40af; text-align: center; }
                        .totals-box { width: 320px; margin-left: auto; display: flex; flex-direction: column; gap: 8px; font-size: 13px; border-top: 2px solid #cbd5e1; padding-top: 15px; }
                        .total-row { display: flex; justify-content: space-between; font-weight: bold; color: #475569; }
                        .grand-total { display: flex; justify-content: space-between; font-size: 18px; font-weight: 900; color: #0f172a; background: #f1f5f9; padding: 10px; border-radius: 6px; font-family: monospace; }
                        .footer-box { margin-top: auto; padding-top: 30px; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #e2e8f0; }
                    </style>
                </head>
                <body>
                    <div class="a4-page">
                        <div class="top-bar"></div>
                        <div class="q-header">
                            <div>
                                <h1 class="q-title">Quotation</h1>
                                <h2 class="firm-name">${foundDoc.vendor || 'FIRM NAME'}</h2>
                            </div>
                            <div style="text-align: right; font-size: 14px;">
                                <div><strong>Quote Ref:</strong> ${foundDoc.ref || ''}</div>
                                <div style="margin-top: 5px;"><strong>Date:</strong> ${foundDoc.date || ''}</div>
                            </div>
                        </div>

                        <div class="billing-box">
                            <div>
                                <div style="font-size: 10px; font-weight: 900; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">Billed To</div>
                                <div style="font-size: 15px; font-weight: 900; text-transform: uppercase; color: #0f172a;">${foundDoc.party || ''}</div>
                            </div>
                        </div>

                        <table class="q-table">
                            <thead>
                                <tr>
                                    <th style="width: 6%;">Sr.</th>
                                    <th style="width: 40%; text-align: left;">Item Description</th>
                                    <th style="width: 12%;">HSN</th>
                                    <th style="width: 10%;">GST</th>
                                    <th style="width: 10%;">Qty</th>
                                    <th style="width: 12%;">Rate</th>
                                    <th style="width: 10%; text-align: right;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${qRowsHTML}
                            </tbody>
                        </table>

                        <div class="totals-box">
                            <div class="total-row"><span>Gross Taxable:</span><span>₹${gross.toFixed(2)}</span></div>
                            <div class="total-row"><span>CGST (${gstRate / 2}%):</span><span>₹${cgst.toFixed(2)}</span></div>
                            <div class="total-row" style="padding-bottom: 8px; border-bottom: 1px solid #cbd5e1;"><span>SGST (${gstRate / 2}%):</span><span>₹${sgst.toFixed(2)}</span></div>
                            <div class="grand-total"><span>Grand Total:</span><span>₹${grandTotal.toFixed(2)}</span></div>
                        </div>

                        <div class="footer-box">
                            <div style="font-size: 11px; color: #64748b;">* Terms & Conditions: Validity 30 days. E. & O.E.</div>
                            <div style="text-align: center; min-width: 200px;">
                                <div style="font-weight: bold; font-size: 14px;">For ${foundDoc.vendor || 'FIRM NAME'}</div>
                                <div style="height: 45px;"></div>
                                <div style="font-size: 13px; font-weight: bold;">Authorised Signature</div>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `);
        }
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