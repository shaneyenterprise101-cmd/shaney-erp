const BACKEND_URL = "https://shaney-erp-backend.onrender.com";

export const SyncManager = {
  
  getLocalData(key, fallback = []) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      return fallback;
    }
  },

  async saveData(storageKey, firestoreCollection, item) {
    try {
      let list = this.getLocalData(storageKey, []);
      const itemPayload = { ...item, updatedAt: Date.now() };
      
      const index = list.findIndex(i => String(i.id) === String(item.id));
      if (index !== -1) {
        list[index] = itemPayload;
      } else {
        list.push(itemPayload);
      }
      localStorage.setItem(storageKey, JSON.stringify(list));

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'all' } }));
      }

      // Save to Local SQLite via Electron IPC if running as desktop app
      if (typeof window !== 'undefined' && window.require) {
        try {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) {
            await ipcRenderer.invoke('sqlite-save-record', itemPayload);
          }
        } catch (err) {
          console.error("Electron SQLite save error:", err);
        }
      }

      // Save to Cloud Backend API
      await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: firestoreCollection, id: String(item.id), data: itemPayload })
      });

      return true;
    } catch (e) {
      console.error("Sync save error:", e);
      return false;
    }
  },

  async deleteData(storageKey, firestoreCollection, itemId) {
    try {
      let list = this.getLocalData(storageKey, []);
      list = list.filter(i => String(i.id) !== String(itemId));
      localStorage.setItem(storageKey, JSON.stringify(list));

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'all' } }));
      }

      // Save deletion to Local SQLite via Electron IPC
      if (typeof window !== 'undefined' && window.require) {
        try {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) {
            await ipcRenderer.invoke('sqlite-save-record', { id: itemId, deleted: true, updatedAt: Date.now() });
          }
        } catch (err) {
          console.error("Electron SQLite delete error:", err);
        }
      }

      await fetch(`${BACKEND_URL}/api/data/${itemId}`, { method: 'DELETE' });

      return true;
    } catch (e) {
      console.error("Sync delete error:", e);
      return false;
    }
  },

  async fetchFreshDataIfNeeded(storageKey, firestoreCollection) {
    try {
      // 1. Get Local SQLite Records first if running in Electron
      let sqliteRecords = [];
      if (typeof window !== 'undefined' && window.require) {
        try {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer && storageKey === 'ERP_History_v104') {
            sqliteRecords = await ipcRenderer.invoke('sqlite-get-records') || [];
            if (sqliteRecords.length > 0) {
              localStorage.setItem(storageKey, JSON.stringify(sqliteRecords));
            }
          }
        } catch (err) {}
      }

      // 2. Fetch from Cloud Backend API to check for latest updates
      let res = null;
      let retries = 3;
      while (retries > 0) {
        try {
          res = await fetch(`${BACKEND_URL}/api/data`);
          if (res.ok) break;
        } catch (err) {
          retries--;
          if (retries === 0) break; // Don't block app if offline, fallback to local
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (res && res.ok) {
        const allData = await res.json();
        let rawList = [];
        
        if (Array.isArray(allData)) {
          rawList = allData;
        } else if (allData && typeof allData === 'object') {
          if (allData[firestoreCollection] && Array.isArray(allData[firestoreCollection])) {
            rawList = allData[firestoreCollection];
          } else if (storageKey === 'ERP_History_v104') {
            if (Array.isArray(allData.certificates)) rawList.push(...allData.certificates);
            if (Array.isArray(allData.quotations)) rawList.push(...allData.quotations);
            if (Array.isArray(allData.history)) rawList.push(...allData.history);
          } else {
            Object.values(allData).forEach(val => {
              if (Array.isArray(val)) rawList.push(...val);
            });
          }
        }

        // 🟢 FIXED CLOUD DATA UNWRAPPING FOR BOTH ARRAYS AND OBJECTS (DYNAMODB COMPATIBLE)
        let cloudData = [];
        rawList.forEach(item => {
          if (!item) return;
          if (Array.isArray(item.data)) {
            item.data.forEach(sub => {
              if (sub && sub.id) {
                cloudData.push({ ...sub, updatedAt: item.updatedAt || sub.updatedAt || Date.now() });
              }
            });
          } else if (item.data && typeof item.data === 'object' && item.data !== null) {
            if (item.data.id) {
              cloudData.push({ ...item.data, updatedAt: item.updatedAt || item.data.updatedAt || Date.now() });
            }
          } else if (item.id) {
            cloudData.push({ ...item, updatedAt: item.updatedAt || Date.now() });
          }
        });

        if (cloudData.length > 0) {
          // Merge SQLite / Local existing with Cloud data based on latest updatedAt timestamp
          const localExisting = [...sqliteRecords, ...this.getLocalData(storageKey, [])];
          const mergedMap = new Map();
          
          localExisting.forEach(item => {
            if (item && item.id != null) mergedMap.set(String(item.id), item);
          });

          cloudData.forEach(cloudItem => {
            if (cloudItem && cloudItem.id != null) {
              const localItem = mergedMap.get(String(cloudItem.id));
              const cloudTime = Number(cloudItem.updatedAt) || 0;
              const localTime = Number(localItem?.updatedAt) || 0;
              
              if (!localItem || cloudTime >= localTime) {
                mergedMap.set(String(cloudItem.id), cloudItem);
              }
            }
          });

          const merged = Array.from(mergedMap.values());
          localStorage.setItem(storageKey, JSON.stringify(merged));

          // Save back merged records to Electron SQLite DB
          if (typeof window !== 'undefined' && window.require && storageKey === 'ERP_History_v104') {
            try {
              const { ipcRenderer } = window.require('electron');
              if (ipcRenderer) {
                for (let mItem of merged) {
                  await ipcRenderer.invoke('sqlite-save-record', mItem);
                }
              }
            } catch (err) {}
          }

          // 🟢 CRITICAL FIX: Trigger UI update event so pages (Products/Certificates) reload instantly
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: firestoreCollection } }));
          }

          return merged;
        }
      }
    } catch (e) {
      console.error("Fetch fresh data error:", e);
    }
    return this.getLocalData(storageKey, []);
  },

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
    } catch (e) {}
  },

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