import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

const BACKEND_URL = "https://shaney-erp-backend.onrender.com";

// 🟢 Universal Logging Helper for Admin & Staff Actions via Render Backend
const logActionToBackend = async (actionText) => {
  try {
    const role = localStorage.getItem("ERP_Active_Role") || "ADMIN";
    let activeName = "Admin";
    
    if (role === "ADMIN") {
      activeName = "Admin";
    } else {
      try {
        const activeUser = JSON.parse(localStorage.getItem("ERP_Active_Staff_Data") || "{}");
        activeName = activeUser?.name || "Staff";
      } catch (e) {
        activeName = "Staff";
      }
    }

    const formattedAction = `${activeName.toUpperCase()}: ${actionText}`;
    await fetch(`${BACKEND_URL}/api/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: formattedAction })
    });
  } catch (e) {
    console.error("Log push error:", e);
  }
};

// 🟢 Rate Limiter Helper: Max 10 items per 1 second to maintain safe Read/Write performance
const processInBatches = async (items, batchSize = 10, delayMs = 1000, asyncTaskCallback) => {
  let results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchPromises = batch.map(item => asyncTaskCallback(item));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return results;
};

export default function Report({ selectedFY }) {
  const [firms, setFirms] = useState(() => {
    const saved = localStorage.getItem('ERP_Companies_v104');
    return saved ? JSON.parse(saved) : [];
  });

  // 🟢 REAL-TIME LIVE SYNC LISTENER (App.jsx broadcast catcher)
  useEffect(() => {
    const handleDataUpdate = (e) => {
      if (!e.detail || e.detail.type === 'settings' || e.detail.type === 'certificates') {
        try {
          const savedFirms = localStorage.getItem('ERP_Companies_v104');
          if (savedFirms) {
            setFirms(JSON.parse(savedFirms));
          }
          const history = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
          const historyFYs = history.map(item => item.fy).filter(Boolean);
          setAvailableFYs(Array.from(new Set(historyFYs)).sort().reverse());
        } catch(err) {
          console.error("Report sync storage parse error:", err);
        }
      }
    };
    window.addEventListener('ERP_DATA_UPDATED', handleDataUpdate);
    return () => window.removeEventListener('ERP_DATA_UPDATED', handleDataUpdate);
  }, []);

  const [exportFirm, setExportFirm] = useState('ALL');
  const [exportYear, setExportYear] = useState(selectedFY || 'ALL');
  const [exportMonth, setExportMonth] = useState('ALL');
  const [importTargetFirm, setImportTargetFirm] = useState('');
  
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [availableFYs, setAvailableFYs] = useState(() => {
    const history = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
    const historyFYs = history.map(item => item.fy).filter(Boolean);
    return Array.from(new Set(historyFYs)).sort().reverse();
  });

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [rawExcelData, setRawExcelData] = useState([]);
  const [excelColumns, setExcelColumns] = useState([]);

  useEffect(() => {
    if (selectedFY) {
      setExportYear(selectedFY);
    }
  }, [selectedFY]);

  useEffect(() => {
    if (firms.length > 0 && !importTargetFirm) {
      setImportTargetFirm(firms[0].name);
    }
  }, [firms]);

  const downloadSampleExcel = () => {
    const sampleData = [
      {
        "#FY#": "F.Y. 26-27",
        "#Party Name#": "ABC INDUSTRIES",
        "#Party Address#": "JUNAGADH 362001",
        "Party Number": "9726350101",
        "#Serial No.#": "SE/26-27/101",
        "#Date#": "19-11-2026",
        "Submit Name": "NAVNIT",
        "Confirm Name": "NAVNIT",
        "Collected Name": "RAHUL",
        "Total": 5500,
        "Payment Method": "CASH",
        "#Reffiling Date#": "19-11-2026",
        "#Valid Up To#": "18-11-2027",
        "#HY.TEST#": "PASS",
        "#Parts#": "COMPLETE",
        "#Remark#": "OK",
        "ABC Stored Pressure": "6 Kg",
        "ABC NOS": "2",
        "CO2": "4.5 Kg",
        "CO2 NOS": "1"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Certificate_Sample");
    XLSX.writeFile(workbook, "Certificate_Import_Sample.xlsx");
  };

  const excelDateToString = (serial) => {
    if (!serial) return '';
    if (typeof serial === 'string') return serial;
    if (typeof serial === 'number' && serial > 1000) {
      const utcDays = Math.floor(serial - 25569);
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      const day = String(dateInfo.getUTCDate()).padStart(2, '0');
      const month = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
      const year = String(dateInfo.getUTCFullYear());
      return `${day}-${month}-${year}`;
    }
    return String(serial);
  };

  const parseAddressString = (addrStr) => {
    if (!addrStr) return { address: '', village: '', taluka: '', district: '', pincode: '' };
    const str = String(addrStr).trim();
    
    const pinMatch = str.match(/\b\d{6}\b/);
    const pincode = pinMatch ? pinMatch[0] : '';
    const cleanStr = str.replace(pincode, '').trim();
    const parts = cleanStr.split(/\s+/);

    if (parts.length >= 3 && !/[,\-]/.test(cleanStr) && !/COLLEGE|KACHERI|SCHOOL|ED.|\bGOVERNMENT\b/i.test(cleanStr)) {
      return {
        address: '',
        village: parts[0] || '',
        taluka: parts[1] || '',
        district: parts.slice(2).join(' ') || '',
        pincode: pincode
      };
    } else {
      return {
        address: str,
        village: '',
        taluka: '',
        district: '',
        pincode: pincode
      };
    }
  };

  // 🟢 LOCALSTORAGE-FIRST FULL SYSTEM BACKUP (0 Cloud Reads!)
  const exportFullSystemData = () => {
    try {
      let backupObj = {};
      for (let i = 0; i < localStorage.length; i++) {
        let key = localStorage.key(i);
        if (key && key.startsWith('ERP_')) {
          try {
            backupObj[key] = JSON.parse(localStorage.getItem(key));
          } catch (e) {
            backupObj[key] = localStorage.getItem(key);
          }
        }
      }
      let dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
      let dlAnchor = document.createElement('a');
      dlAnchor.setAttribute("href", dataStr);
      dlAnchor.setAttribute("download", `Shaney_ERP_Full_Backup_${new Date().toISOString().slice(0,10)}.json`);
      document.body.appendChild(dlAnchor);
      dlAnchor.click();
      dlAnchor.remove();
      logActionToBackend("Downloaded full system backup JSON");
      alert('Full System Backup Downloaded Successfully from Local Storage (0 Cloud Reads!)');
    } catch (err) {
      alert('Backup failed: ' + err.message);
    }
  };

  // 🟢 LOCALSTORAGE-FIRST RESTORE BACKUP (0 Cloud Reads!)
  const restoreFullSystemData = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        let backupObj = JSON.parse(e.target.result);
        if (confirm('WARNING: Restoring backup will overwrite current local data. Continue?')) {
          Object.keys(backupObj).forEach(key => {
            const val = backupObj[key];
            if (typeof val === 'object' && val !== null) {
              localStorage.setItem(key, JSON.stringify(val));
            } else {
              localStorage.setItem(key, val);
            }
          });
          window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'settings' } }));
          logActionToBackend("Restored full system from backup JSON");
          alert('System Restored Successfully into Local Storage! Reloading application...');
          window.location.reload();
        }
      } catch (err) {
        alert('Invalid backup file format!');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleFileSelectForPreview = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleOpenPreviewModal = () => {
    if (!selectedFile) {
      alert('Please choose an Excel file first using "Choose File"!');
      return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        if (rows.length === 0) {
          alert('The selected Excel file is empty!');
          return;
        }

        const cols = Object.keys(rows[0]);
        setExcelColumns(cols);
        setRawExcelData(rows);
        setPreviewRows(rows);
        setPreviewModalOpen(true);
      } catch (err) {
        alert('Failed to read Excel file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  // 🟢 THROTTLED CONFIRM MIRROR IMPORT (Max 10 files per second + Spinner)
  const confirmMirrorImport = async () => {
    setIsSyncing(true);
    try {
      let history = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
      let customers = JSON.parse(localStorage.getItem('ERP_Customers_v104') || '[]');
      
      const res = await fetch(`${BACKEND_URL}/api/data`);
      let cloudCertKeys = new Set();
      let cloudCustNames = new Set();

      if (res.ok) {
        const allData = await res.json();
        let cloudCerts = [];
        let cloudCusts = [];
        if (Array.isArray(allData)) {
          cloudCerts = allData.filter(item => item.docType === 'certificate');
          cloudCusts = allData.filter(item => item.docType === 'customer');
        } else {
          if (allData.history) cloudCerts = allData.history.filter(item => item.docType === 'certificate');
          if (allData.customers) cloudCusts = allData.customers;
        }

        cloudCerts.forEach(d => {
          if (d.party && d.date) {
            const uniqueKey = `${String(d.party).trim().toLowerCase()}_${String(d.ref || '').trim().toLowerCase()}_${String(d.date).trim()}`;
            cloudCertKeys.add(uniqueKey);
          }
        });
        cloudCusts.forEach(d => {
          if (d.name) cloudCustNames.add(String(d.name).trim().toLowerCase());
        });
      }

      let importedCertCount = 0;
      let importedCustCount = 0;
      let skippedCertCount = 0;

      let newHistoryItems = [];
      let newCustomerItems = [];
      const currentTimestamp = Date.now();

      rawExcelData.forEach((row, idx) => {
        const findVal = (keys) => {
          for (let k of keys) {
            const cleanK = String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
            const foundKey = Object.keys(row).find(kName => {
              const cleanKName = String(kName).toLowerCase().replace(/[^a-z0-9]/g, '');
              return cleanKName === cleanK;
            });
            if (foundKey !== undefined && row[foundKey] !== '' && row[foundKey] !== undefined) {
              return row[foundKey];
            }
          }
          return '';
        };

        const partyName = findVal(['#Party Name#', 'party Name', 'party', 'Customer', 'Customer Name', 'Name']);
        const rawAddress = findVal(['#Party Address#', 'address', 'Address', 'Location']);
        const contactStr = findVal(['Party Number', 'contact', 'Contact', 'Phone', 'Mobile']);
        const refNo = findVal(['#Serial No.#', 'ref', 'Ref', 'Invoice', 'Certificate No']) || ('IMP-' + Date.now() + idx);
        const rawDate = findVal(['#Date#', 'date', 'Date']);
        const explicitFy = findVal(['#fy#', 'fy', 'financial year']);
        
        const rawSubmit = findVal(['Submit Name', 'submitname', 'submit by', 'submitby']);
        const rawConfirm = findVal(['Confirm Name', 'confirmname', 'confirm by', 'confirmby']);
        const rawCollected = findVal(['Collected Name', 'collectedname', 'collected by', 'collectedby']);

        const submitName = rawSubmit ? String(rawSubmit).trim().toUpperCase() : 'NAVNIT';
        const confirmName = rawConfirm ? String(rawConfirm).trim().toUpperCase() : 'NAVNIT';
        const collectedName = rawCollected ? String(rawCollected).trim().toUpperCase() : '';

        const totalStr = findVal(['Total', 'total', 'Amount']) || '0';
        const payMethod = findVal(['Payment Method', 'payment']) || 'CASH';
        const rawRefillDate = findVal(['#Reffiling Date#', 'reffilingDate']);
        const rawValidDate = findVal(['#Valid Up To#', 'validUpTo']);
        const hyTest = findVal(['#HY.TEST#', 'hyTest']) || 'PASS';
        const parts = findVal(['#Parts#', 'parts']) || 'COMPLETE';
        const remark = findVal(['#Remark#', 'remark']) || '-';

        if (partyName) {
          const cleanParty = String(partyName).trim().toLowerCase();
          const cleanRef = String(refNo).trim().toLowerCase();
          const formattedDate = excelDateToString(rawDate || rawRefillDate) || new Date().toLocaleDateString();
          const formattedValidDate = excelDateToString(rawValidDate);

          const parsedAddr = parseAddressString(rawAddress);

          // 🟢 1. Independent Customer Unique Check & Addition
          let existingCust = customers.find(c => c.name.toLowerCase() === cleanParty);
          if (!existingCust && !cloudCustNames.has(cleanParty)) {
            const custObj = {
              id: 'cust_imp_' + Date.now() + '_' + idx,
              docType: 'customer',
              name: String(partyName).trim(),
              address: parsedAddr.address,
              village: parsedAddr.village,
              taluka: parsedAddr.taluka,
              district: parsedAddr.district,
              state: 'Gujarat',
              pincode: parsedAddr.pincode,
              updatedAt: currentTimestamp,
              contacts: [
                {
                  person: '',
                  mobile: String(contactStr).trim(),
                  type: 'Mobile',
                  sameAsWhatsapp: true,
                  whatsapp: String(contactStr).trim()
                }
              ]
            };
            customers.push(custObj);
            newCustomerItems.push(custObj);
            cloudCustNames.add(cleanParty);
            importedCustCount++;
          }

          // 🟢 2. Date-Aware Certificate Duplicate Check
          const certUniqueKey = `${cleanParty}_${cleanRef}_${formattedDate}`;
          const isCertDuplicate = cloudCertKeys.has(certUniqueKey) || history.some(h => `${String(h.party).trim().toLowerCase()}_${String(h.ref || '').trim().toLowerCase()}_${String(h.date).trim()}` === certUniqueKey);

          if (isCertDuplicate) {
            skippedCertCount++;
            return; 
          }

          let itemsMap = {};
          const standardFields = [
            'fy', '#fy#', 'partyname', 'partyaddress', 'partynumber', 'serialno', 'date', 
            'submitname', 'confirmname', 'collectedname', 'total', 'paymentmethod', 
            'reffilingdate', 'validupto', 'hytest', 'parts', 'remark'
          ];

          const rowKeys = Object.keys(row);
          rowKeys.forEach((rKey, kIdx) => {
            let cleanKey = rKey.replace(/#/g, '').trim();
            let normKey = cleanKey.toLowerCase().replace(/[^a-z0-9]/g, '');

            if (!standardFields.includes(normKey) && !normKey.includes('nos') && !normKey.includes('qty')) {
              let capVal = row[rKey];
              if (capVal !== undefined && String(capVal).trim() !== "") {
                let nosVal = "1";
                let nextKey1 = rowKeys[kIdx + 1];
                let nextKey2 = rowKeys.find(rk => rk.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normKey + 'nos') || rk.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normKey + 'qty'));
                
                if (nextKey2 && row[nextKey2] !== "") {
                  nosVal = row[nextKey2];
                } else if (nextKey1 && (nextKey1.toLowerCase().includes('nos') || nextKey1.toLowerCase().includes('qty')) && row[nextKey1] !== "") {
                  nosVal = row[nextKey1];
                }

                itemsMap[cleanKey] = [{ cap: String(capVal), qty: String(nosVal) }];
              }
            }
          });

          if (Object.keys(itemsMap).length === 0) {
            itemsMap["ABC Stored Pressure"] = [{ cap: "6 Kg", qty: "1" }];
          }

          let itemsDataObject = {
            hyTest: String(hyTest),
            parts: String(parts),
            remark: String(remark),
            items: itemsMap
          };

          const totalAmt = parseFloat(String(totalStr).replace(/[^0-9.]/g, '')) || 0;
          const autoFy = explicitFy ? (String(explicitFy).startsWith("F.Y.") ? explicitFy : `F.Y. ${explicitFy}`) : (selectedFY !== 'ALL' ? selectedFY : "F.Y. 26-27");

          const histObj = {
            id: 'hist_imp_' + Date.now() + '_' + idx,
            docType: 'certificate',
            vendor: importTargetFirm || (firms[0] ? firms[0].name : 'Shaney Enterprise'),
            party: String(partyName).trim(),
            ref: String(refNo).trim(),
            date: formattedDate,
            validDate: formattedValidDate,
            total: totalAmt,
            payment: String(payMethod).trim(),
            workStatus: 'Completed',
            fy: autoFy,
            partyNum: String(contactStr).trim(),
            submitName: submitName,
            confirmName: confirmName,
            collectedName: collectedName,
            updatedAt: currentTimestamp,
            itemsData: JSON.stringify(itemsDataObject),
            payments: totalAmt > 0 ? [{ id: Date.now() + idx, amount: totalAmt, method: String(payMethod).trim(), note: 'Imported from Excel', date: formattedDate }] : []
          };

          history.push(histObj);
          newHistoryItems.push(histObj);
          cloudCertKeys.add(certUniqueKey);
          importedCertCount++;
        }
      });

      localStorage.setItem('ERP_History_v104', JSON.stringify(history));
      localStorage.setItem('ERP_Customers_v104', JSON.stringify(customers));

      // 🟢 Throttled Upload: Max 10 items per 1 second
      await processInBatches(newHistoryItems, 10, 1000, async (hItem) => {
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'certificates', id: String(hItem.id), data: hItem })
        });
        localStorage.removeItem(`shaney_certificate_${hItem.id}`);
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', hItem);
        }
      });

      await processInBatches(newCustomerItems, 10, 1000, async (cItem) => {
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'customers', id: String(cItem.id), data: cItem })
        });
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', cItem);
        }
      });

      window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'certificates' } }));
      window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'customers' } }));

      setPreviewModalOpen(false);
      setSelectedFile(null);
      setIsSyncing(false);
      logActionToBackend(`Imported ${importedCertCount} certificates and ${importedCustCount} customers via Excel`);
      alert(`Sync Complete! Added ${importedCustCount} new customers and ${importedCertCount} new certificates (${skippedCertCount} duplicate certificates skipped).`);
    } catch (err) {
      setIsSyncing(false);
      alert('Import Sync Failed: ' + err.message);
    }
  };

  const exportMirrorExcel = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/data`);
      let history = [];
      if (res.ok) {
        const allData = await res.json();
        if (Array.isArray(allData)) {
          history = allData.filter(item => item.docType === 'certificate');
        } else if (allData.history) {
          history = allData.history.filter(item => item.docType === 'certificate');
        }
      }

      if (exportFirm !== 'ALL') {
        history = history.filter(h => h.vendor === exportFirm);
      }
      if (exportYear !== 'ALL') {
        history = history.filter(h => (h.fy || '').includes(exportYear));
      }

      if (history.length === 0) {
        return alert('No records found on Cloud for selected filters.');
      }

      const exportRows = history.map((h, i) => {
        let itemsObj = {};
        let parsedItemsData = {};
        try {
          parsedItemsData = JSON.parse(h.itemsData || '{}');
          itemsObj = parsedItemsData.items || {};
        } catch(e) {}

        let rowData = {
          '#FY#': h.fy || '',
          '#Party Name#': h.party,
          '#Party Address#': h.partyNum ? `${h.partyNum}` : '',
          'Party Number': h.partyNum || '',
          '#Serial No.#': h.ref,
          '#Date#': h.date,
          'Submit Name': h.submitName || 'NAVNIT',
          'Confirm Name': h.confirmName || 'NAVNIT',
          'Collected Name': h.collectedName || '',
          'Total': h.total,
          'Payment Method': h.payment || 'CASH',
          '#Reffiling Date#': h.date,
          '#Valid Up To#': h.validDate || '',
          '#HY.TEST#': parsedItemsData.hyTest || 'PASS',
          '#Parts#': parsedItemsData.parts || 'COMPLETE',
          '#Remark#': parsedItemsData.remark || '-'
        };

        Object.keys(itemsObj).forEach(catName => {
          if (itemsObj[catName] && itemsObj[catName].length > 0) {
            rowData[catName] = itemsObj[catName][0].cap || '';
            rowData[catName + ' Nos'] = itemsObj[catName][0].qty || '';
          }
        });

        return rowData;
      });

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "ERP_Report");
      XLSX.writeFile(workbook, `Shaney_ERP_Cloud_Report_${exportFirm}_${new Date().toISOString().slice(0,10)}.xlsx`);
      logActionToBackend("Exported cloud report to Excel");
      alert('Excel Report Exported Successfully from Cloud Data!');
    } catch (err) {
      alert('Cloud Export failed: ' + err.message);
    }
  };

  // 🟢 THROTTLED FORCE UPLOAD (Max 10 files per second + Spinner)
  const handleCloudUpload = async () => {
    setIsSyncing(true);
    try {
      const history = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
      let uploadedCount = 0;

      await processInBatches(history, 10, 1000, async (item) => {
        if (!item.updatedAt) {
          item.updatedAt = Date.now();
        }
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'certificates', id: String(item.id), data: item })
        });
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', item);
        }
        uploadedCount++;
      });

      setIsSyncing(false);
      logActionToBackend(`Force uploaded ${uploadedCount} local records to cloud`);
      alert(`Success! Force uploaded ${uploadedCount} local records to Cloud with timestamps.`);
    } catch (err) {
      setIsSyncing(false);
      alert('Force Upload Failed: ' + err.message);
    }
  };

  // 🟢 THROTTLED SYNC/DOWNLOAD (Max 10 files per second + Spinner)
  const handleCloudDownload = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/data`);
      if (res.ok) {
        const allData = await res.json();
        let cloudCerts = [];
        if (Array.isArray(allData)) {
          cloudCerts = allData.filter(item => item.docType === 'certificate');
        } else if (allData.history) {
          cloudCerts = allData.history.filter(item => item.docType === 'certificate');
        }

        let history = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
        let newRecordsCount = 0;

        await processInBatches(cloudCerts, 10, 1000, async (cloudData) => {
          const index = history.findIndex(h => h.id === cloudData.id);
          if (index !== -1) {
            history[index] = cloudData; 
          } else {
            history.push(cloudData); 
          }

          if (window.require) {
            const { ipcRenderer } = window.require('electron');
            if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', cloudData);
          }
          newRecordsCount++;
        });

        localStorage.setItem('ERP_History_v104', JSON.stringify(history));
        window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'certificates' } }));

        setIsSyncing(false);
        logActionToBackend(`Synced ${newRecordsCount} records from cloud`);
        alert(`Sync Complete! Downloaded ${newRecordsCount} records from Cloud.`);
      } else {
        setIsSyncing(false);
        alert('Cloud Sync Failed: Server response not ok');
      }
    } catch (err) {
      setIsSyncing(false);
      alert('Cloud Sync Failed: ' + err.message);
    }
  };

  return (
    <div className="tab-content active h-[calc(100vh-65px)] w-full relative bg-slate-100 overflow-y-auto custom-scrollbar p-4 md:p-6 animate-[fadeIn_0.3s_ease-in-out]">
      <div className="max-w-7xl mx-auto pb-10">
      
      {/* 🟢 GLOBAL LOADING SPINNER SCREEN */}
      {isSyncing && (
        <div className="fixed inset-0 bg-slate-950/70 z-[999999] flex flex-col items-center justify-center backdrop-blur-md">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h2 className="text-white font-black text-lg uppercase tracking-widest">Processing (Max 10 files/sec)...</h2>
          <p className="text-slate-300 text-xs font-bold mt-1">Please wait while maintaining safe Read/Write performance.</p>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 border border-slate-200">
        <h2 className="text-xl font-black text-slate-800 mb-1">Data Reports & Smart Cloud Sync</h2>
        <p className="text-xs text-slate-500 mb-6 font-bold uppercase tracking-widest">Cloud-Connected Export & Import System</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-indigo-100 rounded-xl p-5 bg-indigo-50/30">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center text-xl mb-3 shadow-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            </div>
            <h3 className="font-black text-slate-700 mb-1 text-sm uppercase">Export Cloud Data</h3>
            <p className="text-[11px] text-slate-500 mb-4 font-bold">Download data directly from Cloud to Excel.</p>

            <div className="grid grid-cols-1 mb-2">
              <select value={exportFirm} onChange={(e) => setExportFirm(e.target.value)} className="pro-input text-[11px] font-bold bg-white cursor-pointer shadow-sm">
                <option value="ALL">All Firms (Export Everything)</option>
                {firms.map(f => (
                  <option key={f.id} value={f.name}>{f.type === 'quotation' ? '🧾' : '📄'} {f.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <select value={exportYear} onChange={(e) => setExportYear(e.target.value)} className="pro-input text-[11px] font-bold bg-white cursor-pointer shadow-sm">
                <option value="ALL">All F.Y.</option>
                {availableFYs.map(fy => (
                  <option key={fy} value={fy}>{fy}</option>
                ))}
              </select>

              <select value={exportMonth} onChange={(e) => setExportMonth(e.target.value)} className="pro-input text-[11px] font-bold bg-white cursor-pointer shadow-sm">
                <option value="ALL">All Months</option>
                <option value="01">Jan (01)</option>
                <option value="02">Feb (02)</option>
                <option value="03">Mar (03)</option>
                <option value="04">Apr (04)</option>
                <option value="05">May (05)</option>
                <option value="06">Jun (06)</option>
                <option value="07">Jul (07)</option>
                <option value="08">Aug (08)</option>
                <option value="09">Sep (09)</option>
                <option value="10">Oct (10)</option>
                <option value="11">Nov (11)</option>
                <option value="12">Dec (12)</option>
              </select>
            </div>

            <button type="button" onClick={exportMirrorExcel} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-xl font-black text-xs uppercase shadow-md transition-colors active:scale-95 cursor-pointer flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Download Cloud Excel
            </button>
          </div>

          <div className="border border-emerald-100 rounded-xl p-5 bg-emerald-50/30">
            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center text-xl mb-3 shadow-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            </div>
            <h3 className="font-black text-slate-700 mb-1 text-sm uppercase">Import & Cloud Sync</h3>
            <p className="text-[11px] text-slate-500 mb-3 font-bold">Select target Firm & choose Excel file to import directly to Cloud.</p>

            <div className="flex gap-2 mb-3">
              <select value={importTargetFirm} onChange={(e) => setImportTargetFirm(e.target.value)} className="pro-input text-[11px] font-bold bg-white cursor-pointer shadow-sm flex-1">
                {firms.map(f => (
                  <option key={f.id} value={f.name}>{f.type === 'quotation' ? '🧾' : '📄'} {f.name}</option>
                ))}
              </select>

              <button type="button" onClick={downloadSampleExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl font-black text-xs uppercase shadow-sm transition-all flex items-center gap-1.5 cursor-pointer shrink-0" title="Download Sample Excel Format">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> Sample
              </button>
            </div>

            <label className="block w-full mb-3 cursor-pointer">
              <span className="sr-only">Choose File</span>
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileSelectForPreview} className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-emerald-100 file:text-emerald-700 hover:file:bg-emerald-200 cursor-pointer" />
            </label>

            <button type="button" onClick={handleOpenPreviewModal} className="w-full bg-[#00a67e] hover:bg-emerald-600 text-white px-4 py-3 rounded-xl font-black text-xs uppercase shadow-md transition-colors active:scale-95 flex items-center justify-center gap-2 cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg> PREVIEW & UPLOAD
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 rounded-2xl shadow-sm p-6 border-2 border-slate-200">
        <div className="flex items-center gap-4 mb-6 border-b border-slate-200 pb-4">
          <div className="w-12 h-12 bg-slate-800 text-white rounded-xl flex items-center justify-center text-2xl shadow-md shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-base uppercase tracking-wide">Master Database & Cloud Controls</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Admin Only: Cloud Backup & Sync Controls.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <button type="button" onClick={exportFullSystemData} className="w-full bg-slate-800 hover:bg-black text-white px-4 py-3.5 rounded-xl font-black text-[11px] uppercase shadow-md transition-colors flex justify-center items-center gap-2 active:scale-95 cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg> Download Full Backup (.JSON) [0 Reads]
          </button>

          <div className="relative">
            <input type="file" accept=".json" onChange={restoreFullSystemData} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" title="Upload Backup JSON" />
            <button type="button" className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-4 rounded-xl font-black text-[11px] uppercase shadow-md transition-colors flex justify-center items-center gap-2 relative z-0 active:scale-95 cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Restore Old Backup [0 Reads]
            </button>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-6 mt-2">
          <button type="button" onClick={handleCloudUpload} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg transition-all flex justify-center items-center gap-3 active:scale-95 mb-4 cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg> Force Upload Local Data To Cloud
          </button>

          <button type="button" onClick={handleCloudDownload} className="w-full bg-[#00a67e] hover:bg-emerald-600 text-white px-4 py-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg transition-all flex justify-center items-center gap-3 active:scale-95 cursor-pointer">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/></svg> Sync (Download) From Cloud
          </button>
        </div>
      </div>

      {previewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[99999] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-[#00a67e] text-white rounded-t-2xl shrink-0">
              <h3 className="font-black uppercase text-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Excel Import Preview ({importTargetFirm})
              </h3>
              <button type="button" onClick={() => setPreviewModalOpen(false)} className="text-white hover:text-red-200 font-bold text-2xl leading-none cursor-pointer">&times;</button>
            </div>
            
            <div className="p-4 overflow-auto flex-1 custom-scrollbar bg-slate-50">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
                <table className="w-full border-collapse text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-[#00a67e] text-white font-black uppercase text-[10px]">
                      <th className="p-2.5 border border-emerald-600 text-center w-12">#</th>
                      {excelColumns.map((col, cIdx) => (
                        <th key={cIdx} className="p-2.5 border border-emerald-600 text-left px-4">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50 font-medium">
                        <td className="p-2.5 border border-slate-200 text-center font-bold text-slate-400 bg-slate-50">{rIdx + 1}</td>
                        {excelColumns.map((col, cIdx) => {
                          let val = row[col];
                          if (col.toLowerCase().includes('date') || col.toLowerCase().includes('up to')) {
                            val = excelDateToString(val);
                          }
                          return (
                            <td key={cIdx} className="p-2.5 border border-slate-200 text-slate-800 px-4">{val !== undefined ? String(val) : ''}</td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500 font-bold mt-3 text-center">Showing all {previewRows.length} imported rows preview. Click 'Confirm & Sync' to update database securely without duplicates.</p>
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3 rounded-b-2xl shrink-0 shadow-lg">
              <button type="button" onClick={() => setPreviewModalOpen(false)} className="px-6 py-2.5 rounded-xl font-black text-slate-700 bg-white border-2 border-slate-300 hover:bg-slate-100 transition-colors shadow-sm uppercase text-xs cursor-pointer">Cancel</button>
              <button type="button" onClick={confirmMirrorImport} className="px-6 py-2.5 rounded-xl font-black uppercase tracking-wider text-white bg-[#00a67e] hover:bg-emerald-600 shadow-md transition-colors flex items-center gap-2 text-xs cursor-pointer">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg> CONFIRM & SYNC TO CLOUD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}