// src/SyncManager.js

const BACKEND_URL = "https://shaney-erp-backend.onrender.com";

export const SyncManager = {
  
  // 1. Load Data (LocalStorage first for 0 reads & instant load)
  getLocalData(key, fallback = []) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      return fallback;
    }
  },

  // 2. Save Data Locally & Push to Render Backend (Single Master State Write)
  async saveData(storageKey, firestoreCollection, item) {
    try {
      let list = this.getLocalData(storageKey, []);
      const index = list.findIndex(i => i.id === item.id);
      if (index !== -1) {
        list[index] = item;
      } else {
        list.push(item);
      }
      localStorage.setItem(storageKey, JSON.stringify(list));

      // Check if user is logged in before making network request
      if (!localStorage.getItem("ERP_Active_Role")) return true;

      // Push updated state to Render Backend
      await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: storageKey,
          item: item,
          timestamp: Date.now()
        })
      });

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

      if (!localStorage.getItem("ERP_Active_Role")) return true;

      await fetch(`${BACKEND_URL}/api/data/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: storageKey,
          itemId: itemId
        })
      });

      return true;
    } catch (e) {
      console.error("Sync delete error:", e);
      return false;
    }
  },

  // 4. Fetch Fresh Data from Render Backend
  async fetchFreshDataIfNeeded(storageKey, firestoreCollection) {
    if (!localStorage.getItem("ERP_Active_Role")) {
      return this.getLocalData(storageKey, []);
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/data?key=${storageKey}`);
      if (response.ok) {
        const result = await response.json();
        if (result && result.data) {
          localStorage.setItem(storageKey, JSON.stringify(result.data));
          return result.data;
        }
      }
    } catch (e) {
      console.error("Fetch fresh data error:", e);
    }
    return this.getLocalData(storageKey, []);
  },

  // 5. Live Office Feed Logs via Render Backend
  async postOfficeLog(actionText, staffName) {
    if (!localStorage.getItem("ERP_Active_Role")) return;

    try {
      const now = new Date();
      const logObj = {
        id: Date.now(),
        staff: (staffName || 'ADMIN').toUpperCase(),
        action: `${(staffName || 'ADMIN').toUpperCase()}: ${actionText}`,
        date: now.toLocaleDateString('en-GB'),
        time: now.toLocaleTimeString()
      };
      
      await fetch(`${BACKEND_URL}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logObj)
      });

      let logs = this.getLocalData("ERP_Office_Live_Logs", []);
      logs.unshift(logObj);
      if (logs.length > 100) logs.pop();
      localStorage.setItem("ERP_Office_Live_Logs", JSON.stringify(logs));
      
      return true;
    } catch (e) {
      console.error("Post office log error:", e);
      return false;
    }
  },

  // 6. Fetch Office Logs
  async getOfficeLogs() {
    if (!localStorage.getItem("ERP_Active_Role")) {
      return this.getLocalData("ERP_Office_Live_Logs", []);
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/logs`);
      if (response.ok) {
        const logs = await response.json();
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

  // 7. Heartbeat / Online Presence (Stops automatically on logout)
  async updateHeartbeat(username) {
    if (!username || !localStorage.getItem("ERP_Active_Role")) return;
    try {
      await fetch(`${BACKEND_URL}/api/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.toUpperCase(), time: Date.now() })
      });
    } catch (e) {
      // Silent catch to prevent background noise
    }
  },

  // 8. Get Active Sessions
  async getActiveSessions() {
    if (!localStorage.getItem("ERP_Active_Role")) return {};
    try {
      const response = await fetch(`${BACKEND_URL}/api/sessions`);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      return {};
    }
    return {};
  }
};