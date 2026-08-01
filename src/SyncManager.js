// src/SyncManager.js

const BACKEND_URL = "https://shaney-erp-backend.onrender.com";

export const SyncManager = {
  
  // 1. Load Data locally for instant UI load & 0 network reads
  getLocalData(key, fallback = []) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error(`Error reading local data for ${key}:`, e);
      return fallback;
    }
  },

  // 2. Save Data Locally & Push to Render Backend (Optimized Write)
  async saveData(storageKey, firestoreCollection, item) {
    try {
      let list = this.getLocalData(storageKey, []);
      const index = list.findIndex(i => String(i.id) === String(item.id));
      if (index !== -1) {
        list[index] = item;
      } else {
        list.push(item);
      }
      localStorage.setItem(storageKey, JSON.stringify(list));

      // Skip network sync if user is logged out
      if (!localStorage.getItem("ERP_Active_Role")) return true;

      // Push updated item state to Render Backend cleanly
      await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: storageKey,
          item: item
        })
      });

      return true;
    } catch (e) {
      console.error("Sync save error:", e);
      return false;
    }
  },

  // 3. Delete Data Locally & Remotely
  async deleteData(storageKey, firestoreCollection, itemId) {
    try {
      let list = this.getLocalData(storageKey, []);
      list = list.filter(i => String(i.id) !== String(itemId));
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

  // 4. Fetch Fresh Data from Render Backend only when required
  async fetchFreshDataIfNeeded(storageKey, firestoreCollection) {
    if (!localStorage.getItem("ERP_Active_Role")) {
      return this.getLocalData(storageKey, []);
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/data?key=${storageKey}`);
      if (response.ok) {
        const result = await response.json();
        if (result && result.success && Array.isArray(result.data)) {
          localStorage.setItem(storageKey, JSON.stringify(result.data));
          return result.data;
        }
      }
    } catch (e) {
      console.error("Fetch fresh data error:", e);
    }
    return this.getLocalData(storageKey, []);
  },

  // 5. Post Office Live Log to Render Backend
  async postOfficeLog(actionText, staffName) {
    if (!localStorage.getItem("ERP_Active_Role")) return;

    try {
      const staff = (staffName || 'ADMIN').toUpperCase();
      const payload = {
        action: `${staff}: ${actionText}`,
        staff: staff
      };

      await fetch(`${BACKEND_URL}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let logs = this.getLocalData("ERP_Office_Live_Logs", []);
      const now = new Date();
      const logObj = {
        id: Date.now(),
        staff: staff,
        action: actionText,
        date: now.toLocaleDateString('en-GB'),
        time: now.toLocaleTimeString()
      };
      logs.unshift(logObj);
      if (logs.length > 100) logs.pop();
      localStorage.setItem("ERP_Office_Live_Logs", JSON.stringify(logs));
      
      return true;
    } catch (e) {
      console.error("Post office log error:", e);
      return false;
    }
  },

  // 6. Fetch Filtered Office Logs
  async getOfficeLogs(staff = 'ALL', date = '') {
    if (!localStorage.getItem("ERP_Active_Role")) {
      return this.getLocalData("ERP_Office_Live_Logs", []);
    }

    try {
      let url = `${BACKEND_URL}/api/logs`;
      const params = new URLSearchParams();
      if (staff && staff !== 'ALL') params.append('staff', staff);
      if (date) params.append('date', date);
      if ([...params].length > 0) url += `?${params.toString()}`;

      const response = await fetch(url);
      if (response.ok) {
        const logs = await response.json();
        if (Array.isArray(logs)) {
          localStorage.setItem("ERP_Office_Live_Logs", JSON.stringify(logs));
          return logs;
        }
      }
    } catch (e) {
      console.error("Get office logs error:", e);
    }
    return this.getLocalData("ERP_Office_Live_Logs", []);
  },

  // 7. Heartbeat / Online Presence Worker
  async updateHeartbeat(username) {
    if (!username || !localStorage.getItem("ERP_Active_Role")) return;
    try {
      await fetch(`${BACKEND_URL}/api/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.toUpperCase() })
      });
    } catch (e) {
      // Silent catch to suppress background noise
    }
  },

  // 8. Get Active Sessions Map
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