import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

const BACKEND_URL = "https://shaney-erp-backend.onrender.com";

const getCurrentFY = () => {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  return m >= 4 ? `F.Y. ${y}-${String(y + 1).slice(-2)}` : `F.Y. ${y - 1}-${String(y).slice(-2)}`;
};

// 🟢 BULLETPROOF DATA SANITIZER WITH TIMESTAMP FALLBACK
const sanitizeForCloud = (dataObj) => {
  let cleaned = { ...dataObj };
  if (!cleaned.updatedAt) {
    cleaned.updatedAt = Date.now(); // 🟢 Timestamp fallback
  }
  Object.keys(cleaned).forEach(key => {
    if (cleaned[key] === undefined) {
      cleaned[key] = null;
    }
  });
  return cleaned;
};

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

export default function Reminder({ selectedFY }) {
  const [filterDays, setFilterDays] = useState(15);
  const [filterDate, setFilterDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFirm, setSelectedFirm] = useState('ALL');
  const [selectedReminderIds, setSelectedReminderIds] = useState([]);
  const [reminderFY, setReminderFY] = useState('ALL');
  
  // 🟢 Pagination State for Reminders
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10; // 🟢 Set to 10 rows per page
  
  // Modal State for Non-Returning / Permanent Closed Customers
  const [isNeverReturnModalOpen, setIsNeverReturnModalOpen] = useState(false);

  const [firms, setFirms] = useState(() => {
    const saved = localStorage.getItem('ERP_Companies_v104');
    return saved ? JSON.parse(saved).filter(f => f.type === 'certificate') : [];
  });

  const [customers, setCustomers] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_Customers_v104');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });

  const [historyData, setHistoryData] = useState(() => {
    const saved = localStorage.getItem('ERP_History_v104');
    let initialHist = saved ? JSON.parse(saved) : [];
    initialHist = initialHist.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
    return initialHist.filter(b => b.docType === 'certificate');
  });

  // 🟢 REAL-TIME LIVE SYNC LISTENER (App.jsx broadcast catcher)
  useEffect(() => {
    const fetchCloudHistory = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/data`);
        if (res.ok) {
          const allData = await res.json();
          if (allData && typeof allData === 'object') {
            let cloudHist = [];
            if (Array.isArray(allData)) {
              cloudHist = allData.filter(item => item.docType === 'certificate');
            } else if (allData.history && Array.isArray(allData.history)) {
              cloudHist = allData.history.filter(item => item.docType === 'certificate');
            } else if (allData.payload) {
              try {
                const parsed = JSON.parse(allData.payload);
                if (parsed.history) cloudHist = parsed.history.filter(item => item.docType === 'certificate');
              } catch(e){}
            }
            if (cloudHist.length > 0) {
              cloudHist = cloudHist.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
              setHistoryData(cloudHist);
              const saved = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
              const nonCerts = saved.filter(b => b.docType !== 'certificate');
              localStorage.setItem('ERP_History_v104', JSON.stringify([...nonCerts, ...cloudHist]));
            }
          }
        }
      } catch (err) {
        console.error("Error fetching history from cloud:", err);
      }
    };
    fetchCloudHistory();

    const handleDataUpdate = (e) => {
      if (!e.detail || e.detail.type === 'certificates' || e.detail.type === 'customers') {
        try {
          const saved = localStorage.getItem('ERP_History_v104');
          if (saved) {
            let parsedData = JSON.parse(saved);
            parsedData = parsedData.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
            setHistoryData(parsedData.filter(b => b.docType === 'certificate'));
          }
          const savedCust = localStorage.getItem('ERP_Customers_v104');
          if (savedCust) {
            setCustomers(JSON.parse(savedCust));
          }
        } catch(err) {
          console.error("Reminder sync parse error:", err);
        }
      }
    };
    window.addEventListener('ERP_DATA_UPDATED', handleDataUpdate);
    return () => window.removeEventListener('ERP_DATA_UPDATED', handleDataUpdate);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedFirm, reminderFY, filterDays]);

  const availableFYs = Array.from(new Set(historyData.map(c => c.fy || getCurrentFY()).filter(Boolean))).sort().reverse();

  const handleDaysChange = (days) => {
    setFilterDays(days);
    const today = new Date();
    today.setHours(0,0,0,0);
    let target = new Date(today);
    target.setDate(target.getDate() + Number(days));
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, '0');
    const d = String(target.getDate()).padStart(2, '0');
    setFilterDate(`${y}-${m}-${d}`);
  };

  const handleDateChange = (dateStr) => {
    setFilterDate(dateStr);
    if(!dateStr) return;
    const today = new Date();
    today.setHours(0,0,0,0);
    const target = new Date(dateStr);
    target.setHours(0,0,0,0);
    const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    setFilterDays(diff);
  };

  useEffect(() => {
    handleDaysChange(15);
  }, []);

  const parseIndianDate = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr.includes('-')) {
      let p = dateStr.split('-');
      if (p[0].length === 4) return new Date(Number(p[0]), Number(p[1]) - 1, Number(p.slice(2).join('')));
      return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
    }
    return new Date(dateStr);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const hasBeenRenewed = (currentCert) => {
    if (!currentCert.validDate || !currentCert.party) return false;
    let currValidObj = parseIndianDate(currentCert.validDate);
    if (!currValidObj || isNaN(currValidObj)) return false;

    return historyData.some(other => {
      if (other.id === currentCert.id) return false;
      if (String(other.party).toLowerCase().trim() !== String(currentCert.party).toLowerCase().trim()) return false;
      if (other.vendor !== currentCert.vendor) return false;

      let otherValidObj = parseIndianDate(other.validDate || other.date);
      if (!otherValidObj || isNaN(otherValidObj)) return false;

      return otherValidObj > currValidObj;
    });
  };

  // Active Pending Reminders (Excludes done and permanent non-returning customers)
  const filteredReminders = historyData.filter(c => {
    if (!c.validDate) return false;
    if (c.reminderDone) return false; 
    if (c.neverReturn) return false; 
    if (hasBeenRenewed(c)) return false;

    let vDateObj = parseIndianDate(c.validDate);
    if (!vDateObj || isNaN(vDateObj)) return false;
    vDateObj.setHours(0, 0, 0, 0);

    let diffTime = vDateObj - today;
    let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > Number(filterDays)) return false;

    const matchesSearch = (c.party || '').toLowerCase().includes(searchTerm.toLowerCase()) || (c.ref || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFirm = selectedFirm === 'ALL' || c.vendor === selectedFirm;
    const rowFY = c.fy || getCurrentFY();
    const matchesFY = reminderFY === 'ALL' || rowFY === reminderFY || rowFY.includes(reminderFY);

    return matchesSearch && matchesFirm && matchesFY;
  }).map(c => {
    let vDateObj = parseIndianDate(c.validDate);
    vDateObj.setHours(0,0,0,0);
    let diffDays = Math.ceil((vDateObj - today) / (1000 * 60 * 60 * 24));
    return { ...c, daysLeft: diffDays };
  }).sort((a, b) => a.daysLeft - b.daysLeft);

  // 🟢 Pagination Slicing for Reminders
  const totalPages = Math.ceil(filteredReminders.length / rowsPerPage) || 1;
  const paginatedReminders = filteredReminders.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  // List of Non-Returning / Lost Customers
  const neverReturnList = historyData.filter(c => c.neverReturn);

  const handleWhatsAppSend = async (e, cert) => {
    e.stopPropagation();
    
    let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
    const idx = allHistory.findIndex(h => h.id.toString() === cert.id.toString());
    let targetRecord = null;
    if (idx !== -1) {
      allHistory[idx].whatsappSent = true;
      allHistory[idx].updatedAt = Date.now(); // 🟢 Timestamp update
      targetRecord = allHistory[idx];
      localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
      setHistoryData(allHistory.filter(b => b.docType === 'certificate'));
      window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'certificates' } }));

      try {
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'certificates', id: String(cert.id), data: sanitizeForCloud(targetRecord) })
        });
        localStorage.removeItem(`shaney_certificate_${cert.id}`);
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', targetRecord);
        }
      } catch (err) {
        console.error("Cloud/SQLite whatsapp sent update error:", err);
      }
      logActionToBackend(`Sent Expiry Reminder WhatsApp to ${cert.party} (Ref: ${cert.ref})`);
    }

    const cData = customers.find(c => c.name.toLowerCase() === cert.party.toLowerCase());
    const phone = cData?.contact || cData?.phone || cert.partyNum || '';
    const baseUrl = BACKEND_URL;
    const docLink = `${baseUrl}/preview/${cert.id}`;
    
    const template = localStorage.getItem("waTempExpiry") || "Hello {name},\n\nThis is a gentle reminder that your Fire Safety Certificate (Ref: {ref}) is valid up to {date}.\n\n📄 View Document:\n🔗 {docLink}";
    const msg = template.replace("{name}", cert.party).replace("{ref}", cert.ref).replace("{date}", cert.validDate).replace("{docLink}", docLink);
    
    // 🟢 1 Second delay before opening WhatsApp as requested
    setTimeout(() => {
      window.open(`https://wa.me/${phone ? '91'+phone.replace(/\D/g,'') : ''}?text=${encodeURIComponent(msg)}`, '_blank');
    }, 1000);
  };

  const setNeverReturnStatus = async (e, id, statusVal) => {
    e.stopPropagation();
    let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
    let targetRecord = null;
    allHistory = allHistory.map(h => {
      if (h.id === id) {
        targetRecord = { ...h, neverReturn: statusVal, updatedAt: Date.now() }; // 🟢 Timestamp update
        return targetRecord;
      }
      return h;
    });
    localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
    setHistoryData(allHistory.filter(b => b.docType === 'certificate'));
    window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'certificates' } }));

    try {
      await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'certificates', id: String(id), data: sanitizeForCloud(targetRecord) })
      });
      localStorage.removeItem(`shaney_certificate_${id}`);
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer && targetRecord) await ipcRenderer.invoke('sqlite-save-record', targetRecord);
      }
      logActionToBackend(`Marked customer non-returning ID: ${id}`);
    } catch (err) {
      console.error("Cloud/SQLite neverReturn update error:", err);
    }
  };

  const toggleSingleReminderStatus = async (e, id, statusVal) => {
    e.stopPropagation();
    let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
    let targetRecord = null;
    allHistory = allHistory.map(h => {
      if (h.id === id) {
        targetRecord = { ...h, reminderDone: statusVal, updatedAt: Date.now() }; // 🟢 Timestamp update
        return targetRecord;
      }
      return h;
    });
    localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
    setHistoryData(allHistory.filter(b => b.docType === 'certificate'));
    window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'certificates' } }));

    try {
      await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'certificates', id: String(id), data: sanitizeForCloud(targetRecord) })
      });
      localStorage.removeItem(`shaney_certificate_${id}`);
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer && targetRecord) await ipcRenderer.invoke('sqlite-save-record', targetRecord);
      }
      logActionToBackend(`Toggled reminder status for ID: ${id}`);
    } catch (err) {
      console.error("Cloud/SQLite reminder update error:", err);
    }
  };

  const markBulkRemindersDone = async () => {
    if (selectedReminderIds.length === 0) {
      alert('Please select at least one reminder!');
      return;
    }
    let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
    const currentTimestamp = Date.now();
    let updatedRecords = [];
    allHistory = allHistory.map(h => {
      if (selectedReminderIds.includes(h.id)) {
        const rec = { ...h, reminderDone: true, updatedAt: currentTimestamp };
        updatedRecords.push(rec);
        return rec;
      }
      return h;
    });
    localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
    setHistoryData(allHistory.filter(b => b.docType === 'certificate'));
    setSelectedReminderIds([]);
    window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'certificates' } }));

    for (let rec of updatedRecords) {
      try {
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'certificates', id: String(rec.id), data: sanitizeForCloud(rec) })
        });
        localStorage.removeItem(`shaney_certificate_${rec.id}`);
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', rec);
        }
      } catch (err) {
        console.error("Cloud/SQLite bulk reminder update error:", err);
      }
    }
    logActionToBackend(`Marked ${updatedRecords.length} reminders as done`);
    alert('✅ Selected reminders marked as done!');
  };

  const startAutoReminders = () => {
    if (filteredReminders.length === 0) {
      alert('No reminders available to send!');
      return;
    }
    if (confirm(`Send WhatsApp reminders to ${filteredReminders.length} client(s)?`)) {
      filteredReminders.forEach((r, index) => {
        setTimeout(async () => {
          let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
          const idx = allHistory.findIndex(h => h.id.toString() === r.id.toString());
          if (idx !== -1) {
            allHistory[idx].whatsappSent = true;
            allHistory[idx].updatedAt = Date.now();
            const targetRecord = allHistory[idx];
            localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
            setHistoryData(allHistory.filter(b => b.docType === 'certificate'));
            window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'certificates' } }));

            try {
              await fetch(`${BACKEND_URL}/api/data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'certificates', id: String(r.id), data: sanitizeForCloud(targetRecord) })
              });
              localStorage.removeItem(`shaney_certificate_${r.id}`);
              if (window.require) {
                const { ipcRenderer } = window.require('electron');
                if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', targetRecord);
              }
            } catch (err) {
              console.error("Cloud/SQLite auto reminder update error:", err);
            }
          }

          const cData = customers.find(c => c.name.toLowerCase() === r.party.toLowerCase());
          const phone = cData?.contact || cData?.phone || r.partyNum || '';
          const baseUrl = BACKEND_URL;
          const docLink = `${baseUrl}/preview/${r.id}`;
          const template = localStorage.getItem("waTempExpiry") || "Hello {name},\n\nThis is a gentle reminder that your Fire Safety Certificate (Ref: {ref}) is valid up to {date}.\n\n📄 View Document:\n🔗 {docLink}";
          const msg = template.replace("{name}", r.party).replace("{ref}", r.ref).replace("{date}", r.validDate).replace("{docLink}", docLink);
          window.open(`https://wa.me/${phone ? '91'+phone.replace(/\D/g,'') : ''}?text=${encodeURIComponent(msg)}`, '_blank');
        }, index * 1000);
      });
      logActionToBackend(`Triggered auto WhatsApp reminders for ${filteredReminders.length} clients`);
    }
  };

  return (
    <div className="tab-content active h-[calc(100vh-65px)] w-full relative bg-slate-100 overflow-y-auto custom-scrollbar p-4 md:p-6 animate-[fadeIn_0.3s_ease-in-out]">
      <div className="max-w-7xl mx-auto pb-10">
        <div className="flex flex-col gap-4 bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mb-6">
          <div className="flex justify-between items-center w-full flex-wrap gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="font-black text-slate-800 text-lg uppercase text-orange-600 flex items-center gap-2">
                <svg className="w-5 h-5 text-orange-600 inline-block shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg> Auto Reminders
              </h3>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1.5 shadow-inner">
                <span className="text-[10px] font-bold text-slate-500 uppercase ml-1">Due In:</span>
                <input type="number" value={filterDays} onChange={(e) => handleDaysChange(e.target.value)} className="pro-input py-1.5 w-16 text-center text-xs font-black text-orange-600 border-orange-200 bg-white" />
                <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">Days</span>
                <span className="text-slate-300">|</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase ml-1">Upto:</span>
                <input type="date" value={filterDate} onChange={(e) => handleDateChange(e.target.value)} className="pro-input py-1.5 w-32 text-xs font-black text-orange-600 border-orange-200 bg-white cursor-pointer uppercase font-mono" />
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-between flex-wrap">
              <div className="relative w-full sm:w-48">
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search Client..." className="w-full text-xs py-2.5 pl-8 pr-3 rounded-lg border border-slate-300 bg-slate-50 outline-none font-medium shadow-inner" />
                <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center bg-orange-50/50 p-3.5 rounded-xl border border-orange-100 mt-2 flex-wrap gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
              <select value={selectedFirm} onChange={(e) => setSelectedFirm(e.target.value)} className="pro-input text-[11px] font-bold py-2.5 w-full sm:w-40 border-orange-200 text-orange-900 bg-white shadow-sm cursor-pointer">
                <option value="ALL">All Firms</option>
                {firms.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
              </select>

              <select value={reminderFY} onChange={(e) => setReminderFY(e.target.value)} className="pro-input text-[11px] font-bold py-2.5 w-full sm:w-36 border-orange-200 text-orange-900 bg-white shadow-sm cursor-pointer">
                <option value="ALL">All F.Y.</option>
                {availableFYs.map(fy => <option key={fy} value={fy}>{fy}</option>)}
              </select>

              <button 
                type="button" 
                onClick={() => setIsNeverReturnModalOpen(true)} 
                className="bg-red-600 hover:bg-red-700 text-white text-xs uppercase font-black px-4 py-2.5 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <svg className="w-4 h-4 fill-current inline-block shrink-0" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-1.84.63-3.54 1.69-4.89L16.89 18.31C15.54 19.37 13.84 20 12 20c-4.41 0-8-3.59-8-8zm14.31 4.89L7.11 5.69C8.46 4.63 10.16 4 12 4c4.41 0 8 3.59 8 8 0 1.84-.63 3.54-1.69 4.89z"/></svg> Non-Returning ({neverReturnList.length})
              </button>
            </div>

            <div className="flex gap-3 w-full sm:w-auto">
              <button type="button" onClick={markBulkRemindersDone} className="flex-1 sm:flex-none border text-xs uppercase font-black px-4 py-2.5 rounded-xl shadow-sm transition-all flex justify-center items-center gap-1.5 cursor-pointer bg-white border-indigo-200 hover:bg-indigo-50 text-indigo-700">
                <svg className="w-3.5 h-3.5 fill-current inline-block shrink-0" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Mark Done
              </button>
              <button type="button" onClick={startAutoReminders} className="flex-1 sm:flex-none bg-[#25D366] hover:bg-green-600 text-white text-xs uppercase font-black px-5 py-2.5 rounded-xl shadow-md transition-all flex justify-center items-center gap-1.5 cursor-pointer">
                <svg className="w-4 h-4 fill-current inline-block shrink-0" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg> Auto WA
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          
          {/* 🟢 DESKTOP TABLE VIEW */}
          <div className="hidden md:block overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs whitespace-nowrap min-w-[800px]">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-widest text-[10px] font-black border-b border-slate-200">
                <tr>
                  <th className="px-5 py-4 w-10 text-center">
                    <input type="checkbox" onChange={(e) => {
                      if(e.target.checked) setSelectedReminderIds(filteredReminders.map(r => r.id));
                      else setSelectedReminderIds([]);
                    }} checked={filteredReminders.length > 0 && selectedReminderIds.length === filteredReminders.length} className="cursor-pointer w-4 h-4 rounded border-slate-300 accent-[#00a67e]" />
                  </th>
                  <th className="px-5 py-4">Client Name ↕</th>
                  <th className="px-5 py-4">Contact 📞</th>
                  <th className="px-5 py-4">Ref / Invoice</th>
                  <th className="px-5 py-4 text-center">Valid Upto ↕</th>
                  <th className="px-5 py-4 text-center">Days Left ↕</th>
                  <th className="px-5 py-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedReminders.map(r => {
                  let vDateObj = parseIndianDate(r.validDate);
                  vDateObj.setHours(0,0,0,0);
                  let daysLeft = Math.ceil((vDateObj - today) / (1000 * 60 * 60 * 24));
                  
                  let statusBadge = "";
                  if (daysLeft < 0) {
                    statusBadge = `<span class="bg-red-100 text-red-700 font-black px-2.5 py-1 rounded text-[10px]">Expired (${Math.abs(daysLeft)}d ago)</span>`;
                  } else if (daysLeft === 0) {
                    statusBadge = `<span class="bg-amber-100 text-amber-700 font-black px-2.5 py-1 rounded text-[10px]">Expires Today!</span>`;
                  } else {
                    statusBadge = `<span class="bg-blue-50 text-blue-700 font-bold px-2.5 py-1 rounded text-[10px]">${daysLeft} Days Left</span>`;
                  }

                  let custData = customers.find(x => String(x.name).toLowerCase().trim() === String(r.party).toLowerCase().trim());
                  let phoneNum = custData?.contact || r.partyNum || "No Number";

                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4 text-center">
                        <input type="checkbox" checked={selectedReminderIds.includes(r.id)} onChange={(e) => {
                          if(e.target.checked) setSelectedReminderIds([...selectedReminderIds, r.id]);
                          else setSelectedReminderIds(selectedReminderIds.filter(id => id !== r.id));
                        }} className="cursor-pointer w-4 h-4 rounded border-slate-300 accent-[#00a67e]" />
                      </td>
                      <td className="px-5 py-4 font-black text-slate-900 uppercase text-xs">
                        <div className="flex items-center gap-1.5">
                          <span>{r.party}</span>
                          {r.whatsappSent && (
                            <span className="text-emerald-500 inline-flex items-center" title="WhatsApp Sent">
                              <svg className="w-4 h-4 fill-current inline" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">{r.vendor}</div>
                      </td>
                      <td className="px-5 py-4 font-mono font-bold text-indigo-600 text-xs">
                        <span className="inline-flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 fill-current inline-block shrink-0" viewBox="0 0 24 24"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg> {phoneNum}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono font-black text-slate-700 text-xs">{r.ref}</td>
                      <td className="px-5 py-4 font-mono font-bold text-center text-slate-600 text-xs">{r.validDate}</td>
                      <td className="px-5 py-4 text-center" dangerouslySetInnerHTML={{__html: statusBadge}}></td>
                      <td className="px-5 py-4 text-center flex items-center justify-center gap-1.5">
                        <button type="button" onClick={(e) => handleWhatsAppSend(e, r)} className="bg-[#25D366] hover:bg-green-600 text-white font-black text-[10px] uppercase px-2.5 py-1.5 rounded-lg shadow-sm transition-all inline-flex items-center gap-1 cursor-pointer" title="Send WhatsApp">
                          <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg> WA
                        </button>
                        
                        <button type="button" onClick={(e) => toggleSingleReminderStatus(e, r.id, true)} className="font-black text-[10px] uppercase px-2.5 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer bg-indigo-50 hover:bg-indigo-100 text-indigo-700 inline-flex items-center gap-1" title="Mark Done">
                          <svg className="w-3 h-3 fill-current inline-block shrink-0" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Done
                        </button>

                        <button type="button" onClick={(e) => setNeverReturnStatus(e, r.id, true)} className="font-black text-[10px] uppercase px-2 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer bg-red-50 hover:bg-red-100 text-red-600 inline-flex items-center gap-1" title="Customer won't return">
                          <svg className="w-3 h-3 fill-current inline-block shrink-0" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-1.84.63-3.54 1.69-4.89L16.89 18.31C15.54 19.37 13.84 20 12 20c-4.41 0-8-3.59-8-8zm14.31 4.89L7.11 5.69C8.46 4.63 10.16 4 12 4c4.41 0 8 3.59 8 8 0 1.84-.63 3.54-1.69 4.89z"/></svg> Skip
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredReminders.length === 0 && (
                  <tr><td colSpan="7" className="text-center py-16 text-slate-400 font-bold italic">No pending reminders in the selected timeframe!</td></tr>
                )}
              </tbody>
            </table>

            {/* Desktop Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 bg-slate-50 border-t border-slate-200">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                  disabled={currentPage === 1}
                  className="bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-bold text-xs px-4 py-2 rounded-lg border border-slate-300 transition-colors cursor-pointer shadow-sm"
                >
                  Previous
                </button>
                <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                  Page {currentPage} of {totalPages}
                </span>
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                  disabled={currentPage === totalPages}
                  className="bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-bold text-xs px-4 py-2 rounded-lg border border-slate-300 transition-colors cursor-pointer shadow-sm"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* 🟢 MOBILE CARD VIEW */}
          <div className="block md:hidden p-3 space-y-3 bg-slate-50">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-black uppercase text-slate-700">
                <input 
                  type="checkbox" 
                  onChange={(e) => {
                    if(e.target.checked) setSelectedReminderIds(filteredReminders.map(r => r.id));
                    else setSelectedReminderIds([]);
                  }} 
                  checked={filteredReminders.length > 0 && selectedReminderIds.length === filteredReminders.length} 
                  className="accent-[#00a67e] w-4 h-4 cursor-pointer" 
                />
                <span>Select All ({filteredReminders.length})</span>
              </label>
              {selectedReminderIds.length > 0 && (
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                  {selectedReminderIds.length} Selected
                </span>
              )}
            </div>

            {paginatedReminders.length === 0 ? (
              <div className="text-center py-16 text-slate-400 font-bold italic text-xs">
                No pending reminders in the selected timeframe!
              </div>
            ) : (
              paginatedReminders.map(r => {
                let vDateObj = parseIndianDate(r.validDate);
                vDateObj.setHours(0,0,0,0);
                let daysLeft = Math.ceil((vDateObj - today) / (1000 * 60 * 60 * 24));
                
                let statusText = "";
                let badgeColor = "";
                if (daysLeft < 0) {
                  statusText = `Expired (${Math.abs(daysLeft)}d ago)`;
                  badgeColor = "bg-red-100 text-red-700";
                } else if (daysLeft === 0) {
                  statusText = "Expires Today!";
                  badgeColor = "bg-amber-100 text-amber-700";
                } else {
                  statusText = `${daysLeft} Days Left`;
                  badgeColor = "bg-blue-50 text-blue-700";
                }

                let custData = customers.find(x => String(x.name).toLowerCase().trim() === String(r.party).toLowerCase().trim());
                let phoneNum = custData?.contact || r.partyNum || "No Number";

                return (
                  <div key={r.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2.5">
                        <input 
                          type="checkbox" 
                          checked={selectedReminderIds.includes(r.id)} 
                          onChange={(e) => {
                            if(e.target.checked) setSelectedReminderIds([...selectedReminderIds, r.id]);
                            else setSelectedReminderIds(selectedReminderIds.filter(id => id !== r.id));
                          }} 
                          className="accent-[#00a67e] w-4 h-4 cursor-pointer" 
                        />
                        <span className="font-mono font-black text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{r.ref}</span>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{r.vendor}</span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-black text-slate-900 text-sm uppercase">
                          <div className="flex items-center gap-1.5">
                            <span>{r.party}</span>
                            {r.whatsappSent && (
                              <span className="inline-flex items-center bg-green-100 text-green-700 p-1 rounded" title="WhatsApp Sent">
                                <svg className="w-3.5 h-3.5 fill-current text-green-600 shrink-0 inline" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                              </span>
                            )}
                          </div>
                        </h4>
                      </div>
                      <p className="text-[11px] font-mono font-bold text-indigo-600 mt-0.5 inline-flex items-center gap-1">
                        <svg className="w-3 h-3 fill-current inline-block shrink-0" viewBox="0 0 24 24"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg> {phoneNum}
                      </p>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Valid Upto</span>
                        <span className="font-mono font-bold text-slate-700 text-xs">{r.validDate}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Status</span>
                        <span className={`font-bold text-[10px] px-2 py-0.5 rounded inline-block mt-0.5 ${badgeColor}`}>{statusText}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100">
                      <button type="button" onClick={(e) => handleWhatsAppSend(e, r)} className="flex-1 bg-[#25D366] text-white py-2 px-1 rounded-lg text-[10px] font-black uppercase transition-colors text-center flex items-center justify-center gap-1 shadow-sm">
                        <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg> WA
                      </button>
                      <button type="button" onClick={(e) => toggleSingleReminderStatus(e, r.id, true)} className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-2 px-1 rounded-lg text-[10px] font-black uppercase border border-indigo-200 transition-colors text-center flex items-center justify-center gap-1 shadow-sm">
                        <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Done
                      </button>
                      <button type="button" onClick={(e) => setNeverReturnStatus(e, r.id, true)} className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 py-2 px-1 rounded-lg text-[10px] font-black uppercase border border-red-200 transition-colors text-center flex items-center justify-center gap-1 shadow-sm">
                        <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-1.84.63-3.54 1.69-4.89L16.89 18.31C15.54 19.37 13.84 20 12 20c-4.41 0-8-3.59-8-8zm14.31 4.89L7.11 5.69C8.46 4.63 10.16 4 12 4c4.41 0 8 3.59 8 8 0 1.84-.63 3.54-1.69 4.89z"/></svg> Skip
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {/* Mobile Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm mt-4">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                  disabled={currentPage === 1}
                  className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-lg border border-slate-300 transition-colors cursor-pointer"
                >
                  Previous
                </button>
                <span className="text-xs font-black text-slate-700 uppercase tracking-wider">
                  Page {currentPage} of {totalPages}
                </span>
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, currentPage + 1))} 
                  disabled={currentPage === totalPages}
                  className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-lg border border-slate-300 transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            )}
          </div>

        </div>

        {/* 🔥 NON-RETURNING / LOST CUSTOMERS MODAL */}
        {isNeverReturnModalOpen && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
              
              <div className="bg-red-600 p-4 text-white flex justify-between items-center shrink-0">
                <h3 className="font-black text-sm uppercase tracking-wide flex items-center gap-2">
                  <svg className="w-4 h-4 fill-current inline-block shrink-0" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-1.84.63-3.54 1.69-4.89L16.89 18.31C15.54 19.37 13.84 20 12 20c-4.41 0-8-3.59-8-8zm14.31 4.89L7.11 5.69C8.46 4.63 10.16 4 12 4c4.41 0 8 3.59 8 8 0 1.84-.63 3.54-1.69 4.89z"/></svg> Non-Returning / Lost Customers ({neverReturnList.length})
                </h3>
                <button onClick={() => setIsNeverReturnModalOpen(false)} className="text-white hover:text-red-200 font-black text-2xl leading-none cursor-pointer">&times;</button>
              </div>

              <div className="p-4 overflow-auto flex-1 custom-scrollbar bg-slate-50">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-slate-100 text-slate-600 uppercase tracking-widest text-[10px] font-black border-b border-slate-200">
                      <tr>
                        <th className="p-3">Client Name</th>
                        <th className="p-3">Ref / Invoice</th>
                        <th className="p-3 text-center">Valid Upto</th>
                        <th className="p-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {neverReturnList.map(nr => (
                        <tr key={nr.id} className="hover:bg-slate-50">
                          <td className="p-3 font-black text-slate-900 uppercase">
                            {nr.party}
                            <div className="text-[10px] text-slate-400 uppercase font-semibold">{nr.vendor}</div>
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-700">{nr.ref}</td>
                          <td className="p-3 font-mono text-center text-slate-600">{nr.validDate}</td>
                          <td className="p-3 text-center">
                            <button 
                              type="button" 
                              onClick={(e) => setNeverReturnStatus(e, nr.id, false)} 
                              className="bg-amber-100 hover:bg-amber-200 text-amber-800 font-black text-[10px] uppercase px-3 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer inline-flex items-center gap-1"
                            >
                              <svg className="w-3 h-3 fill-current inline-block shrink-0" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg> Restore to Reminders
                            </button>
                          </td>
                        </tr>
                      ))}
                      {neverReturnList.length === 0 && (
                        <tr><td colSpan="4" className="text-center py-10 text-slate-400 font-bold italic">No non-returning customers found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-3 bg-white border-t border-slate-200 flex justify-end shrink-0">
                <button onClick={() => setIsNeverReturnModalOpen(false)} className="bg-slate-800 hover:bg-black text-white px-6 py-2 rounded-lg font-black text-xs uppercase tracking-widest transition-all cursor-pointer">
                  Close
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}