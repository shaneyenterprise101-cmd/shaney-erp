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

// 🟢 Pixel-Perfect Exact A4 Certificate Preview Route for WhatsApp Links
app.get('/preview/:id', async (req, res) => {
    try {
        const docId = req.params.id;
        const scanResult = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME }));
        
        let foundDoc = null;
        scanResult.Items.forEach(item => {
            if (item.data && Array.isArray(item.data)) {
                const match = item.data.find(i => String(i.id) === String(docId));
                if (match) foundDoc = match;
            }
        });

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
            let tableRowsHTML = '';
            if (items && items.items) {
                Object.entries(items.items).forEach(([cat, rows]) => {
                    const validRows = (rows || []).filter(r => (r.cap && String(r.cap).trim() !== '') || (r.qty && String(r.qty).trim() !== ''));
                    if (validRows.length > 0) {
                        const capStr = validRows.map(r => r.cap).filter(Boolean).join(', ');
                        const qtyStr = validRows.map(r => r.qty).filter(Boolean).join(' + ');
                        tableRowsHTML += `
                            <tr>
                                <td style="text-align:left; padding:5px 10px; border:1px solid #000; font-style:italic; font-weight:500;">${cat}</td>
                                <td style="padding:5px 10px; border:1px solid #000; font-weight:bold;">${capStr}</td>
                                <td style="padding:5px 10px; border:1px solid #000; font-weight:bold;">${qtyStr}</td>
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
                        .a4-page { background: #ffffff; width: 794px; min-height: 1123px; padding: 30px 40px; box-sizing: border-box; position: relative; box-shadow: 0 15px 35px rgba(0,0,0,0.2); display: flex; flex-direction: column; overflow: hidden; }
                        
                        /* Top & Bottom Branded Gradient Waves */
                        .top-wave { position: absolute; top: 0; left: 0; width: 100%; height: 75px; background: linear-gradient(135deg, #ff7e1d 0%, #f97316 40%, #e11d48 100%); clip-path: ellipse(75% 100% at 50% 0%); z-index: 1; }
                        .bottom-wave { position: absolute; bottom: 0; left: 0; width: 100%; height: 35px; background: linear-gradient(135deg, #e11d48 0%, #f97316 60%, #ff7e1d 100%); z-index: 1; }

                        .content-wrapper { position: relative; z-index: 10; display: flex; flex-direction: column; flex-grow: 1; }
                        .content-row { display: flex; flex-direction: row; flex-grow: 1; }
                        
                        .cert-sidebar { width: 55px; min-width: 55px; display: flex; flex-direction: column; align-items: center; padding-top: 30px; }
                        .cert-char { font-size: 38px; font-weight: 900; color: #dc2626; margin-bottom: 3px; line-height: 1; font-family: 'Georgia', serif; }
                        
                        .main-body { flex-grow: 1; display: flex; flex-direction: column; padding-left: 10px; }
                        
                        /* Exact Logo & Banner Layout */
                        .header-box { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #00a67e; padding-bottom: 10px; margin-bottom: 18px; margin-top: 22px; }
                        .logo-container { display: flex; align-items: center; gap: 15px; }
                        .logo-emblem { width: 75px; height: 75px; object-fit: contain; }
                        .cylinder-graphic { width: 42px; height: 75px; object-fit: contain; }
                        .firm-title { font-size: 28px; font-weight: 900; text-transform: uppercase; font-family: 'Arial', sans-serif; color: #0f172a; margin: 0; line-height: 1.1; letter-spacing: 0.5px; }
                        .firm-sub { font-size: 13px; font-weight: bold; color: #dc2626; margin-top: 4px; letter-spacing: 0.08em; }
                        .meta-box { text-align: right; font-size: 13.5px; font-family: 'Georgia', serif; padding-bottom: 2px; }
                        
                        .party-box { margin-bottom: 18px; font-size: 14.5px; line-height: 1.5; }
                        .party-val { font-family: 'Georgia', serif; font-size: 17px; font-weight: bold; text-transform: uppercase; margin-left: 8px; color: #111; }
                        
                        .cert-text { text-align: center; font-size: 14px; line-height: 1.5; margin-bottom: 18px; font-style: italic; }
                        
                        .cert-table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-bottom: 18px; }
                        .cert-table th { padding: 5px; text-align: center; border: 1px solid #000; font-size: 12px; font-weight: bold; background: #f8fafc; }
                        .cert-table td { padding: 5px; text-align: center; border: 1px solid #000; font-size: 11px; }
                        
                        .footer-box { margin-top: auto; padding-top: 12px; padding-bottom: 15px; border-top: 2px solid #00a67e; display: flex; justify-content: space-between; align-items: flex-end; }
                        .badges-row { display: flex; gap: 12px; align-items: center; font-size: 9px; font-weight: bold; color: #0369a1; margin-bottom: 4px; }
                        .footer-addr { font-size: 9px; font-family: monospace; color: #64748b; line-height: 1.3; }
                        
                        .sign-box { text-align: center; min-width: 190px; font-family: 'Arial', sans-serif; position: relative; }
                        .sign-title { font-size: 12.5px; font-weight: bold; }
                        .stamp-svg { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%) rotate(-7deg); width: 105px; opacity: 0.88; pointer-events: none; }
                        .sign-space { height: 45px; }
                    </style>
                </head>
                <body>
                    <div class="a4-page">
                        <div class="top-wave"></div>
                        <div class="bottom-wave"></div>
                        
                        <div class="content-wrapper">
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
                                        <div class="logo-container">
                                            <!-- Exact Shield & Fire Extinguisher Graphical Representation Matching App Header -->
                                            <svg width="60" height="60" viewBox="0 0 100 100" style="flex-shrink:0;">
                                                <path d="M50 5 L90 20 L90 55 C90 75 70 90 50 95 C30 90 10 75 10 55 L10 20 Z" fill="#ff7e1d" stroke="#e11d48" stroke-width="4"/>
                                                <path d="M50 15 L80 27 L80 52 C80 68 65 80 50 85 C35 80 20 68 20 52 L20 27 Z" fill="#ffffff"/>
                                                <path d="M50 25 Q60 45 45 60 Q55 50 50 25 Z" fill="#ff7e1d"/>
                                            </svg>
                                            <svg width="35" height="65" viewBox="0 0 50 90" style="flex-shrink:0;">
                                                <rect x="12" y="20" width="26" height="55" rx="10" fill="#dc2626"/>
                                                <rect x="20" y="8" width="10" height="12" fill="#334155"/>
                                                <path d="M15 8 Q25 2 35 8" fill="none" stroke="#334155" stroke-width="3"/>
                                                <text x="25" y="48" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle" transform="rotate(90 25 48)">SHANEY</text>
                                            </svg>
                                            <div>
                                                <h1 class="firm-title">${foundDoc.vendor || 'SHANEY ENTERPRISE'}</h1>
                                                <div class="firm-sub">Fire And Safety</div>
                                            </div>
                                        </div>
                                        <div class="meta-box">
                                            <div>Date :- <span>${foundDoc.date || 'DD-MM-YYYY'}</span></div>
                                            <div style="margin-top: 3px;">SR.No :- <span>${foundDoc.ref || '-----'}</span></div>
                                        </div>
                                    </div>

                                    <div class="party-box">
                                        <div>Certified M/s:- <span class="party-val">${foundDoc.party || 'CUSTOMER NAME'}</span></div>
                                        <div style="margin-top: 5px;">Address :- <span class="party-val">ADDRESS</span></div>
                                    </div>

                                    <div class="cert-text">
                                        <div>We certify that the fire extinguishers mentioned below</div>
                                        <div>Are tested and refilled as per the relevant Indian standard.</div>
                                        <div style="margin-top: 4px;">This extinguishers are refilled on Date :- <span style="color:#dc2626; font-family:monospace;">${foundDoc.date || 'DD-MM-YYYY'}</span></div>
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
                                                <td style="text-align:left; padding:5px 10px; border:1px solid #000; font-style:italic; font-weight:bold;">Hy. Test</td>
                                                <td colspan="2" style="border:1px solid #000; font-weight:bold;">${items?.hyTest || 'OK'}</td>
                                            </tr>
                                            <tr>
                                                <td style="text-align:left; padding:5px 10px; border:1px solid #000; font-style:italic; font-weight:bold;">Parts</td>
                                                <td colspan="2" style="border:1px solid #000; font-weight:bold;">${items?.parts || 'OK'}</td>
                                            </tr>
                                            <tr>
                                                <td style="text-align:left; padding:5px 10px; border:1px solid #000; font-style:italic; font-weight:bold;">Remark</td>
                                                <td colspan="2" style="border:1px solid #000; font-weight:bold;">${items?.remark || 'OK'}</td>
                                            </tr>
                                            ${tableRowsHTML}
                                        </tbody>
                                    </table>

                                    <div class="footer-box">
                                        <div>
                                            <div class="badges-row">
                                                <span>🛡️ ISO CERTIFIED</span>
                                                <span>⭐ GeM SELLER</span>
                                                <span>🏛️ MSME REGD.</span>
                                                <span>🇮🇳 MAKE IN INDIA</span>
                                            </div>
                                            <div class="footer-addr">
                                                <div>112, Royal Plaza, Near Sai baba Temple, Zanzarda Road, Junagadh-362001.</div>
                                                <div>+91 97263 50101 | +91 97264 50101</div>
                                                <div>shaneyenterprise101@gmail.com</div>
                                            </div>
                                        </div>
                                        <div class="sign-box">
                                            <div class="sign-title">For ${foundDoc.vendor || 'Shaney Enterprise'}</div>
                                            <!-- Precise Official Purple Round Stamp SVG -->
                                            <svg class="stamp-svg" viewBox="0 0 120 120">
                                                <circle cx="60" cy="60" r="54" fill="none" stroke="#6b21a8" stroke-width="2.5" stroke-dasharray="4,2"/>
                                                <circle cx="60" cy="60" r="44" fill="none" stroke="#6b21a8" stroke-width="1.5"/>
                                                <text x="60" y="32" font-size="9" font-weight="bold" fill="#6b21a8" text-anchor="middle" font-family="Arial">SHANEY ENTERPRISE</text>
                                                <text x="60" y="82" font-size="8" font-weight="bold" fill="#6b21a8" text-anchor="middle" font-family="Arial">JUNAGADH</text>
                                                <text x="60" y="62" font-size="14" font-weight="bold" fill="#6b21a8" text-anchor="middle" font-family="Georgia" font-style="italic">Navnit</text>
                                            </svg>
                                            <div class="sign-space"></div>
                                            <div class="sign-title">Authorised Signature</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `);
        } else {
            // --- QUOTATION RENDERER ---
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
                        .footer-box { margin-top: auto; padding-top: 30px; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #e2e8f0; position: relative; }
                        .stamp-svg { position: absolute; bottom: 25px; left: 65%; transform: translateX(-50%) rotate(-7deg); width: 105px; opacity: 0.88; pointer-events: none; }
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
                            <div style="text-align: center; min-width: 200px; position: relative;">
                                <div style="font-weight: bold; font-size: 14px;">For ${foundDoc.vendor || 'FIRM NAME'}</div>
                                <svg class="stamp-svg" viewBox="0 0 120 120">
                                    <circle cx="60" cy="60" r="54" fill="none" stroke="#6b21a8" stroke-width="2.5" stroke-dasharray="4,2"/>
                                    <circle cx="60" cy="60" r="44" fill="none" stroke="#6b21a8" stroke-width="1.5"/>
                                    <text x="60" y="32" font-size="9" font-weight="bold" fill="#6b21a8" text-anchor="middle" font-family="Arial">SHANEY ENTERPRISE</text>
                                    <text x="60" y="82" font-size="8" font-weight="bold" fill="#6b21a8" text-anchor="middle" font-family="Arial">JUNAGADH</text>
                                    <text x="60" y="62" font-size="14" font-weight="bold" fill="#6b21a8" text-anchor="middle" font-family="Georgia" font-style="italic">Navnit</text>
                                </svg>
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

// 6. Save Data to DynamoDB (Clean & Sanitized Payload Handler)
app.post('/api/data', async (req, res) => {
    try {
        const key = req.body.key || req.body.type || 'general';
        let item = req.body.item || req.body.data || req.body;

        // Ignore or clean deleted flags/nested pollution if present
        if (item && typeof item === 'object') {
            if (item.deleted) {
                delete item.deleted;
            }
        }

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
                updatedAt: Date.now()
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
                            updatedAt: Date.now()
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