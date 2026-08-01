// Global counters for Read & Write operations
let ioMetrics = {
  reads: 0,
  writes: 0,
  totalBytesRead: 0,
  totalBytesWritten: 0,
  lastUpdated: null
};

// Load initial metrics from LocalStorage first if available
try {
  const savedMetrics = localStorage.getItem('ERP_IO_METRICS_CACHE');
  if (savedMetrics) {
    ioMetrics = JSON.parse(savedMetrics);
  }
} catch (e) {
  console.error("Metrics load error:", e);
}

const persistMetrics = () => {
  ioMetrics.lastUpdated = new Date().toLocaleTimeString();
  try {
    localStorage.setItem('ERP_IO_METRICS_CACHE', JSON.stringify(ioMetrics));
  } catch (e) {}
};

// Monkey-patch localStorage to intercept Reads and Writes automatically across the project
const originalGetItem = Storage.prototype.getItem;
const originalSetItem = Storage.prototype.setItem;

Storage.prototype.getItem = function(key) {
  ioMetrics.reads += 1;
  const value = originalGetItem.apply(this, arguments);
  if (value) {
    ioMetrics.totalBytesRead += new Blob([value]).size;
  }
  persistMetrics();
  return value;
};

Storage.prototype.setItem = function(key, value) {
  ioMetrics.writes += 1;
  if (value) {
    ioMetrics.totalBytesWritten += new Blob([String(value)]).size;
  }
  persistMetrics();
  return originalSetItem.apply(this, arguments);
};

export const getIOMetrics = () => {
  // Calculate total LocalStorage footprint of the project keys
  let totalFootprintBytes = 0;
  let keyBreakdown = {};

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== 'ERP_IO_METRICS_CACHE') {
      const val = localStorage.getItem(key) || '';
      const size = new Blob([val]).size;
      totalFootprintBytes += size;
      keyBreakdown[key] = (size / 1024).toFixed(2) + ' KB';
    }
  }

  return {
    ...ioMetrics,
    totalFootprintKB: (totalFootprintBytes / 1024).toFixed(2),
    keyBreakdown
  };
};

export const resetIOMetrics = () => {
  ioMetrics = { reads: 0, writes: 0, totalBytesRead: 0, totalBytesWritten: 0, lastUpdated: new Date().toLocaleTimeString() };
  localStorage.removeItem('ERP_IO_METRICS_CACHE');
};