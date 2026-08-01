import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// 🚀 OPTIMIZED IN-MEMORY CACHE & STORAGE CONTROLLER
const memoryCache = {};
let writeThrottleTimer = null;
let pendingWrites = new Set();

const originalGetItem = Storage.prototype.getItem;
const originalSetItem = Storage.prototype.setItem;

Storage.prototype.getItem = function(key) {
  if (memoryCache[key] !== undefined) {
    return memoryCache[key];
  }
  const val = originalGetItem.call(this, key);
  if (val !== null) {
    memoryCache[key] = val;
  }
  return val;
};

Storage.prototype.setItem = function(key, value) {
  const stringVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
  
  if (memoryCache[key] !== stringVal) {
    memoryCache[key] = stringVal;
    pendingWrites.add(key);

    clearTimeout(writeThrottleTimer);
    writeThrottleTimer = setTimeout(() => {
      pendingWrites.forEach(k => {
        try {
          originalSetItem.call(localStorage, k, memoryCache[k]);
        } catch (err) {
          console.error("Storage write quota error:", err);
        }
      });
      pendingWrites.clear();
    }, 1000); // 1 second batch window to minimize write frequency
  }
};

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);