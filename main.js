import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;
let mainWindow;
let sock;
let currentWaStatus = 'Disconnected';
let lastQrDataUrl = '';

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'shaney_erp_live.db');
  db = new Database(dbPath);

  db.prepare(`
    CREATE TABLE IF NOT EXISTS history_records (
      id TEXT PRIMARY KEY,
      docType TEXT,
      vendor TEXT,
      party TEXT,
      ref TEXT,
      date TEXT,
      total REAL,
      payment TEXT,
      workStatus TEXT,
      fy TEXT,
      updatedAt INTEGER,
      itemsData TEXT,
      payloadJson TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS whatsapp_logs (
      id TEXT PRIMARY KEY,
      sender TEXT,
      receiver TEXT,
      status TEXT,
      sentOn TEXT
    )
  `).run();
}

async function connectWhatsApp(phone = '') {
  try {
    console.log('🔄 Initializing WhatsApp connection for phone:', phone);
    if (sock) {
      try { await sock.logout(); } catch(e) {}
      sock = null;
    }

    const authPath = path.join(app.getPath('userData'), 'baileys_auth_info');
    console.log('📁 Auth state path:', authPath);
    
    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      console.log('📡 Connection update received:', update);
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log('📱 QR code string received from Baileys!');
        currentWaStatus = 'Scanning';
        lastQrDataUrl = await QRCode.toDataURL(qr);
        if (mainWindow) {
          mainWindow.webContents.send('wa-status-update', { status: currentWaStatus, qr: lastQrDataUrl, phone });
        }
      }

      if (connection === 'close') {
        console.log('❌ Connection closed:', lastDisconnect?.error);
        currentWaStatus = 'Disconnected';
        lastQrDataUrl = '';
        if (mainWindow) {
          mainWindow.webContents.send('wa-status-update', { status: currentWaStatus, qr: '', phone: '' });
        }
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          console.log('🔁 Reconnecting WhatsApp in 3 seconds...');
          setTimeout(() => connectWhatsApp(phone), 3000);
        }
      } else if (connection === 'open') {
        currentWaStatus = 'Connected';
        lastQrDataUrl = '';
        console.log('✅ WhatsApp Connected Successfully via Baileys!');
        if (mainWindow) {
          mainWindow.webContents.send('wa-status-update', { status: currentWaStatus, qr: '', phone });
        }
      }
    });
  } catch (err) {
    console.error("❌ WhatsApp connection error exception:", err);
  }
}

function setupIpcHandlers() {
  ipcMain.handle('get-wa-status', () => {
    return { status: currentWaStatus, qr: lastQrDataUrl };
  });

  ipcMain.handle('trigger-wa-connect', async (event, data) => {
    const phone = data?.phone || '';
    console.log('⚡ IPC trigger-wa-connect called with phone:', phone);
    if (currentWaStatus !== 'Connected') {
      await connectWhatsApp(phone);
    }
    return { status: currentWaStatus, qr: lastQrDataUrl, phone };
  });

  ipcMain.handle('wa-logout', async () => {
    try {
      if (sock) {
        try { await sock.logout(); } catch(e) {}
        sock = null;
      }
      const authPath = path.join(app.getPath('userData'), 'baileys_auth_info');
      if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
      }
      currentWaStatus = 'Disconnected';
      lastQrDataUrl = '';
      if (mainWindow) {
        mainWindow.webContents.send('wa-status-update', { status: currentWaStatus, qr: '', phone: '' });
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sqlite-save-record', (event, record) => {
    try {
      const timestamp = Date.now();
      const finalUpdatedAt = record.updatedAt || timestamp;
      
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO history_records 
        (id, docType, vendor, party, ref, date, total, payment, workStatus, fy, updatedAt, itemsData, payloadJson)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        record.id,
        record.docType || 'certificate',
        record.vendor || '',
        record.party || '',
        record.ref || '',
        record.date || '',
        record.total || 0,
        record.payment || 'CASH',
        record.workStatus || 'New',
        record.fy || '',
        finalUpdatedAt,
        record.itemsData || '',
        JSON.stringify(record)
      );

      return { success: true, updatedAt: finalUpdatedAt };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sqlite-get-records', () => {
    try {
      const rows = db.prepare('SELECT payloadJson FROM history_records ORDER BY updatedAt DESC').all();
      return rows.map(r => JSON.parse(r.payloadJson));
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('sqlite-get-delta-records', (event, lastSyncTime) => {
    try {
      const rows = db.prepare('SELECT payloadJson FROM history_records WHERE updatedAt > ?').all(lastSyncTime || 0);
      return rows.map(r => JSON.parse(r.payloadJson));
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('send-whatsapp-msg', async (event, { phone, message }) => {
    try {
      if (!sock || currentWaStatus !== 'Connected') {
        return { success: false, error: 'WhatsApp not connected' };
      }
      const formattedPhone = phone.includes('@s.whatsapp.net') ? phone : `${phone}@s.whatsapp.net`;
      await sock.sendMessage(formattedPhone, { text: message });
      
      const logId = 'log_' + Date.now();
      const sentTime = new Date().toLocaleString();
      db.prepare(`INSERT INTO whatsapp_logs (id, sender, receiver, status, sentOn) VALUES (?, ?, ?, ?, ?)`).run(logId, 'ADMIN', phone, 'Success', sentTime);

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-wa-logs', () => {
    try {
      return db.prepare('SELECT * FROM whatsapp_logs ORDER BY sentOn DESC').all();
    } catch (e) { return []; }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'public/logo.jpg'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // 🟢 DevTools open karne ke liye taaki Electron build mein error pata chal sake
  mainWindow.webContents.openDevTools();

  mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  initDatabase();
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});