import { db } from './firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, addDoc, query, orderBy, limit } from 'firebase/firestore';

// Unified Sync Manager to keep Firebase Reads under 1000-1500 per day (Vercel & Live Server Ready)
export const SyncManager = {
  
  // 1. Load Data (LocalStorage pehle, taaki 0 Reads lagen)
  getLocalData(key, fallback = []) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      return fallback;
    }
  },

  // 2. Save Data locally and push single write to Firebase (Optimized for low reads)
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

      await setDoc(doc(db, firestoreCollection, String(item.id)), item);
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

      await deleteDoc(doc(db, firestoreCollection, String(itemId)));
      return true;
    } catch (e) {
      console.error("Sync delete error:", e);
      return false;
    }
  },

  // 4. Controlled Manual / Periodic Sync (Keeps reads < 1000/day)
  async fetchFreshDataIfNeeded(storageKey, firestoreCollection) {
    try {
      const querySnapshot = await getDocs(collection(db, firestoreCollection));
      let cloudData = [];
      querySnapshot.forEach((docSnap) => {
        cloudData.push(docSnap.data());
      });
      if (cloudData.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(cloudData));
        return cloudData;
      }
    } catch (e) {
      console.error("Fetch fresh data error:", e);
    }
    return this.getLocalData(storageKey, []);
  },

  // 🟢 5. LIVE OFFICE FEED LOGS (Replaces server.js /api/logs)
  async postOfficeLog(actionText, staffName) {
    try {
      const now = new Date();
      const logObj = {
        id: Date.now(),
        staff: staffName.toUpperCase(),
        action: `${staffName.toUpperCase()}: ${actionText}`,
        date: now.toLocaleDateString('en-GB'),
        time: now.toLocaleTimeString()
      };
      
      // Save to Cloud Firestore
      await addDoc(collection(db, "office_logs"), logObj);

      // Update Local Cache
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

  // 🟢 6. FETCH RECENT OFFICE LOGS (Low-read optimized: fetches only last 30 logs)
  async getOfficeLogs() {
    try {
      const q = query(collection(db, "office_logs"), orderBy("id", "desc"), limit(30));
      const querySnapshot = await getDocs(q);
      let logs = [];
      querySnapshot.forEach((docSnap) => {
        logs.push(docSnap.data());
      });
      if (logs.length > 0) {
        localStorage.setItem("ERP_Office_Live_Logs", JSON.stringify(logs));
        return logs;
      }
    } catch (e) {
      console.error("Get office logs error:", e);
    }
    return this.getLocalData("ERP_Office_Live_Logs", []);
  },

  // 🟢 7. HEARTBEAT / ONLINE PRESENCE (Replaces server.js /api/heartbeat & sessions)
  async updateHeartbeat(username) {
    if (!username) return;
    try {
      const userKey = username.toLowerCase();
      await setDoc(doc(db, "active_sessions", userKey), {
        username: username.toUpperCase(),
        lastActive: Date.now()
      }, { merge: true });
    } catch (e) {
      console.error("Heartbeat error:", e);
    }
  },

  // 🟢 8. GET ACTIVE SESSIONS
  async getActiveSessions() {
    try {
      const querySnapshot = await getDocs(collection(db, "active_sessions"));
      let onlineMap = {};
      const nowTime = Date.now();
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.username && (nowTime - (data.lastActive || 0) < 90000)) {
          onlineMap[data.username.toLowerCase()] = true;
        }
      });
      return onlineMap;
    } catch (e) {
      return {};
    }
  }
};