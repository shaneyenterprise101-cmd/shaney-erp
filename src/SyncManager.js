const BACKEND_URL = "https://shaney-erp-backend.onrender.com";

// Unified Sync Manager to interact with Render Backend API & Local Storage / SQLite (0 Direct Firebase SDK Reads/Writes)
export const SyncManager = {
  
  // 1. Load Data (LocalStorage pehle, taaki instant load ho)
  getLocalData(key, fallback = []) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      return fallback;
    }
  },

  // 2. Save Data locally and push to Render Backend & SQLite IPC
  async saveData(storageKey, firestoreCollection, item) {
    try {
      let list = this.getLocalData(storageKey, []);
      const itemPayload = { ...item, updatedAt: item.updatedAt || Date.now() };
      const index = list.findIndex(i => i.id === item.id);
      if (index !== -1) {
        list[index] = itemPayload;
      } else {
        list.push(itemPayload);
      }
      localStorage.setItem(storageKey, JSON.stringify(list));

      // Sync to Render Backend (AWS DynamoDB)
      await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: firestoreCollection, id: String(item.id), data: itemPayload })
      });

      // Sync to Local SQLite via Electron IPC if available
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', itemPayload);
      }

      return true;
    } catch (e) {
      console.error("Sync save error:", e);
      return false;
    }
  },

  // 3. Delete Data
  async deleteData(storageKey, firestoreCollection, itemId) {
    try {
      let list = this.getLocalData(storageKey, []);
      list = list.filter(i => i.id !== itemId);
      localStorage.setItem(storageKey, JSON.stringify(list));

      // Delete from Render Backend
      await fetch(`${BACKEND_URL}/api/data/${itemId}`, { method: 'DELETE' });

      // Delete/Mark deleted in SQLite IPC
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', { id: itemId, deleted: true, updatedAt: Date.now() });
      }

      return true;
    } catch (e) {
      console.error("Sync delete error:", e);
      return false;
    }
  },

  // 4. Fetch Fresh Data from Cloud Backend
  async fetchFreshDataIfNeeded(storageKey, firestoreCollection) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/data`);
      if (res.ok) {
        const allData = await res.json();
        let cloudData = [];
        if (Array.isArray(allData)) {
          cloudData = allData.filter(item => item.docType === firestoreCollection || item.type === firestoreCollection);
        } else if (allData[firestoreCollection] && Array.isArray(allData[firestoreCollection])) {
          cloudData = allData[firestoreCollection];
        }
        if (cloudData.length > 0) {
          localStorage.setItem(storageKey, JSON.stringify(cloudData));
          return cloudData;
        }
      }
    } catch (e) {
      console.error("Fetch fresh data error:", e);
    }
    return this.getLocalData(storageKey, []);
  },

  // 🟢 5. LIVE OFFICE FEED LOGS
  async postOfficeLog(actionText, staffName) {
    try {
      const now = new Date();
      const formattedAction = `${staffName.toUpperCase()}: ${actionText}`;
      
      await fetch(`${BACKEND_URL}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: formattedAction })
      });

      let logs = this.getLocalData("ERP_Office_Live_Logs", []);
      logs.unshift({
        id: Date.now(),
        staff: staffName.toUpperCase(),
        action: formattedAction,
        date: now.toLocaleDateString('en-GB'),
        time: now.toLocaleTimeString()
      });
      if (logs.length > 100) logs.pop();
      localStorage.setItem("ERP_Office_Live_Logs", JSON.stringify(logs));
      
      return true;
    } catch (e) {
      console.error("Post office log error:", e);
      return false;
    }
  },

  // 🟢 6. FETCH RECENT OFFICE LOGS
  async getOfficeLogs() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/logs`);
      if (res.ok) {
        const logs = await res.json();
        if (Array.isArray(logs) && logs.length > 0) {
          localStorage.setItem("ERP_Office_Live_Logs", JSON.stringify(logs));
          return logs;
        }
      }
    } catch (e) {
      console.error("Get office logs error:", e);
    }
    return this.getLocalData("ERP_Office_Live_Logs", []);
  },

  // 🟢 7. HEARTBEAT / ONLINE PRESENCE
  async updateHeartbeat(username) {
    if (!username) return;
    try {
      const userKey = username.toLowerCase();
      const payload = {
        id: 'session_' + userKey,
        docType: 'active_session',
        username: username.toUpperCase(),
        lastActive: Date.now(),
        updatedAt: Date.now()
      };
      await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'active_sessions', id: String(userKey), data: payload })
      });
    } catch (e) {
      console.error("Heartbeat error:", e);
    }
  },

  // 🟢 8. GET ACTIVE SESSIONS
  async getActiveSessions() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/data`);
      if (res.ok) {
        const allData = await res.json();
        let sessions = [];
        if (Array.isArray(allData)) {
          sessions = allData.filter(item => item.docType === 'active_session');
        } else if (allData.active_sessions) {
          sessions = allData.active_sessions;
        }
        let onlineMap = {};
        const nowTime = Date.now();
        sessions.forEach((data) => {
          if (data.username && (nowTime - (data.lastActive || 0) < 90000)) {
            onlineMap[data.username.toLowerCase()] = true;
          }
        });
        return onlineMap;
      }
    } catch (e) {
      console.error("Get active sessions error:", e);
    }
    return {};
  }
};