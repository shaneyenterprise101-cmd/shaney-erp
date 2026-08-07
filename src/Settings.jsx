import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

const BACKEND_URL = "https://shaney-erp-backend.onrender.com";

const logActionToBackend = async (actionText) => {
  try {
    const role = localStorage.getItem("ERP_Active_Role") || "ADMIN";
    let activeName = "Admin";
    if (role !== "ADMIN") {
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

export default function Settings() {
  const [firms, setFirms] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_Companies_v104');
      return saved ? JSON.parse(saved).filter(f => f.type === 'certificate') : [];
    } catch(e) { return []; }
  });

  const [waStatus, setWaStatus] = useState('Disconnected');
  const [waQrCode, setWaQrCode] = useState('');
  const [allowStaffWa, setAllowStaffWa] = useState(true);
  const [waLogs, setWaLogs] = useState([]);
  const [searchLog, setSearchLog] = useState('');
  const [connectedPhone, setConnectedPhone] = useState('');

  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');

  const processAndSetQr = (rawQr) => {
    if (!rawQr) return;
    if (rawQr.startsWith('data:image') || rawQr.startsWith('http')) {
      setWaQrCode(rawQr);
    } else {
      const encoded = encodeURIComponent(rawQr);
      setWaQrCode(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encoded}`);
    }
  };

  useEffect(() => {
    let qrInterval = null;

    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      if (ipcRenderer) {
        ipcRenderer.on('wa-status-update', (event, { status, qr, phone }) => {
          setWaStatus(status);
          if (phone) setConnectedPhone(phone);
          if (qr) {
            processAndSetQr(qr);
            setShowQrModal(true);
          }
          if (status === 'Connected') {
            setShowQrModal(false);
            setShowPhoneModal(false);
          }
        });
        ipcRenderer.invoke('get-wa-status').then(res => {
          if (res) {
            setWaStatus(res.status || 'Disconnected');
            if (res.phone) setConnectedPhone(res.phone);
          }
        }).catch(e => {});

        ipcRenderer.invoke('get-wa-logs').then(logs => {
          if (logs) setWaLogs(logs);
        }).catch(e => {});
      }
    }

    if (showQrModal) {
      qrInterval = setInterval(async () => {
        try {
          const res = await fetch(`${BACKEND_URL}/api/whatsapp/status`);
          if (res.ok) {
            const data = await res.json();
            if (data.status) setWaStatus(data.status);
            if (data.qr) {
              processAndSetQr(data.qr);
            }
            if (data.status === 'Connected') {
              setShowQrModal(false);
              setShowPhoneModal(false);
            }
          }
        } catch (err) {}
      }, 3000);
    }

    return () => {
      if (qrInterval) clearInterval(qrInterval);
    };
  }, [showQrModal]);

  const handleConnectClick = () => {
    setPhoneNumber('');
    setShowPhoneModal(true);
  };

  const handlePhoneSubmit = async (e) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      alert('Please enter a valid mobile number!');
      return;
    }
    setShowPhoneModal(false);
    setConnectedPhone(phoneNumber.trim());
    setWaQrCode('');
    setShowQrModal(true);
    
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      if (ipcRenderer) {
        setWaStatus('Scanning');
        try {
          const res = await ipcRenderer.invoke('trigger-wa-connect', { phone: phoneNumber.trim() });
          if (res) {
            setWaStatus(res.status || 'Scanning');
            if (res.qr) processAndSetQr(res.qr);
          }
        } catch (err) {
          console.error("Failed to connect WA via IPC:", err);
        }
      }
    }

    try {
      await fetch(`${BACKEND_URL}/api/whatsapp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber.trim() })
      });
    } catch (err) {
      console.error("Cloud WA connect error:", err);
    }
  };

  const handleRegenerateQr = async () => {
    setWaQrCode('');
    if (window.require && connectedPhone) {
      const { ipcRenderer } = window.require('electron');
      if (ipcRenderer) {
        try {
          const res = await ipcRenderer.invoke('trigger-wa-connect', { phone: connectedPhone });
          if (res && res.qr) {
            processAndSetQr(res.qr);
          }
        } catch (err) {
          console.error("Regenerate QR error:", err);
        }
      }
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/whatsapp/refresh`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.qr) processAndSetQr(data.qr);
      }
    } catch (err) {
      console.error("Cloud Refresh QR error:", err);
    }
  };

  const handleDisconnectClick = () => {
    if (confirm('Are you sure you want to disconnect WhatsApp?')) {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer) {
          ipcRenderer.invoke('wa-logout').then(res => {
            setWaStatus('Disconnected');
            setWaQrCode('');
            setConnectedPhone('');
            setShowQrModal(false);
            alert('🔌 WhatsApp Disconnected Successfully!');
          }).catch(e => {
            setWaStatus('Disconnected');
            setWaQrCode('');
            setWaQrCode('');
          });
        }
      }
      fetch(`${BACKEND_URL}/api/whatsapp/logout`, { method: 'POST' }).catch(e => {});
      setWaStatus('Disconnected');
      setWaQrCode('');
      setConnectedPhone('');
      setShowQrModal(false);
      alert('🔌 WhatsApp Disconnected Successfully!');
    }
  };

  const [selectedFirmId, setSelectedFirmId] = useState('');
  const [firmType, setFirmType] = useState('certificate');
  const [firmName, setFirmName] = useState('');
  const [firmAddress, setFirmAddress] = useState('');
  const [firmContact, setFirmContact] = useState('');
  const [firmPrefix, setFirmPrefix] = useState('');
  const [gstRate, setGstRate] = useState('18');
  const [dayOffset, setDayOffset] = useState('0');

  const [staffList, setStaffList] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_Staff_v104');
      return saved ? JSON.parse(saved) : ['NAVNIT', 'KISHOR'];
    } catch(e) { return ['NAVNIT', 'KISHOR']; }
  });
  const [newStaff, setNewStaff] = useState('');

  const [paymentMethods, setPaymentMethods] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_PayMethods_v104');
      return saved ? JSON.parse(saved) : ['CASH', 'ONLINE', 'CHEQUE', 'UPI', 'NEFT'];
    } catch(e) { return ['CASH', 'ONLINE', 'CHEQUE', 'UPI', 'NEFT']; }
  });
  const [newMethod, setNewMethod] = useState('');
  
  const [waMethod, setWaMethod] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_WA_Method_v104');
      return saved ? JSON.parse(saved) : 'direct';
    } catch(e) { return 'direct'; }
  });

  const [waTemplates, setWaTemplates] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_WA_Templates_v104');
      return saved ? JSON.parse(saved) : {
        doc: "Hello {name},\n\nPlease find attached your {type} (Ref: {ref}).",
        payment: "Hello {name},\n\nYour payment of ₹{amount} is pending for Invoice Ref: {ref}.",
        expiry: "Hello {name},\n\nThis is a gentle reminder that your Fire Safety Certificate (Ref: {ref}) is valid up to {date}."
      };
    } catch(e) {
      return {
        doc: "Hello {name},\n\nPlease find attached your {type} (Ref: {ref}).",
        payment: "Hello {name},\n\nYour payment of ₹{amount} is pending for Invoice Ref: {ref}.",
        expiry: "Hello {name},\n\nThis is a gentle reminder that your Fire Safety Certificate (Ref: {ref}) is valid up to {date}."
      };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('ERP_Staff_v104', JSON.stringify(staffList));
      const staffPayload = { id: 'staff_list', docType: 'setting', staffList, updatedAt: Date.now() };
      fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'settings', id: 'staff_list', data: staffPayload })
      }).catch(e => {});
    } catch(e) {}
  }, [staffList]);

  useEffect(() => {
    try {
      localStorage.setItem('ERP_PayMethods_v104', JSON.stringify(paymentMethods));
      const payPayload = { id: 'payment_methods', docType: 'setting', paymentMethods, updatedAt: Date.now() };
      fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'settings', id: 'payment_methods', data: payPayload })
      }).catch(e => {});
    } catch(e) {}
  }, [paymentMethods]);

  useEffect(() => {
    try {
      localStorage.setItem('ERP_WA_Method_v104', JSON.stringify(waMethod));
      localStorage.setItem('ERP_WA_Templates_v104', JSON.stringify(waTemplates));
    } catch(e) {}
  }, [waMethod, waTemplates]);

  useEffect(() => {
    const fetchCloudSettings = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/data`);
        if (res.ok) {
          const allData = await res.json();
          if (allData && typeof allData === 'object') {
            let cloudFirms = [];
            let cloudStaff = [];
            let cloudPay = [];

            if (Array.isArray(allData)) {
              cloudFirms = allData.filter(item => item.docType === 'company');
              const staffDoc = allData.find(item => item.id === 'staff_list');
              if (staffDoc && staffDoc.staffList) cloudStaff = staffDoc.staffList;
              const payDoc = allData.find(item => item.id === 'payment_methods');
              if (payDoc && payDoc.paymentMethods) cloudPay = payDoc.paymentMethods;
            } else {
              if (allData.companies) cloudFirms = allData.companies;
              if (allData.settings) {
                if (allData.settings.staff_list) cloudStaff = allData.settings.staff_list;
                if (allData.settings.payment_methods) cloudPay = allData.settings.payment_methods;
              }
            }

            if (cloudFirms.length > 0) {
              setFirms(cloudFirms);
              localStorage.setItem('ERP_Companies_v104', JSON.stringify(cloudFirms));
            }
            if (cloudStaff.length > 0) {
              setStaffList(cloudStaff);
              localStorage.setItem('ERP_Staff_v104', JSON.stringify(cloudStaff));
            }
            if (cloudPay.length > 0) {
              setPaymentMethods(cloudPay);
              localStorage.setItem('ERP_PayMethods_v104', JSON.stringify(cloudPay));
            }
          }
        }
      } catch (err) {
        console.error("Error fetching settings from cloud:", err);
      }
    };
    fetchCloudSettings();
  }, []);

  const handleSelectFirm = (e) => {
    const id = e.target.value;
    setSelectedFirmId(id);
    if (!id) {
      setFirmName(''); setFirmAddress(''); setFirmContact(''); setFirmPrefix('');
      setFirmType('certificate');
    } else if (id === 'new_company') {
      setFirmName(''); setFirmAddress(''); setFirmContact(''); setFirmPrefix('NEW/26-27/01');
      setFirmType('certificate');
    } else {
      const found = firms.find(f => f.id === id);
      if (found) {
        setFirmName(found.name || '');
        setFirmAddress(found.address || '');
        setFirmContact(found.contact || '');
        setFirmPrefix(found.prefix || '');
        setFirmType(found.type || 'certificate');
        setGstRate(found.gstRate !== undefined ? found.gstRate : '18');
        setDayOffset(found.dayOffset !== undefined ? found.dayOffset : '0');
      }
    }
  };

  const handleSaveFirm = async (e) => {
    e.preventDefault();
    if (!firmName.trim()) { alert('Firm Name is required!'); return; }
    const currentTimestamp = Date.now();
    let newComp = {
      id: selectedFirmId && selectedFirmId !== 'new_company' ? selectedFirmId : ('comp_' + firmType + '_' + Date.now()),
      docType: 'company',
      type: firmType,
      name: firmName.trim(),
      address: firmAddress.trim(),
      contact: firmContact.trim(),
      prefix: firmPrefix.trim(),
      updatedAt: currentTimestamp
    };
    if (firmType === 'quotation') {
      newComp.gstRate = Number(gstRate) || 0;
      newComp.dayOffset = Number(dayOffset) || 0;
    } else {
      newComp.categories = ["ABC Stored Pressure", "Co2", "Water Co2", "M-Foam", "Dry Chemical Powder"];
      newComp.capacities = ["1Kg", "2Kg", "4.5Kg", "6Kg", "9 Ltr Stored PressureType"];
    }

    if (!selectedFirmId || selectedFirmId === 'new_company') {
      const updatedFirms = [...firms, newComp];
      setFirms(updatedFirms);
      localStorage.setItem('ERP_Companies_v104', JSON.stringify(updatedFirms));
      setSelectedFirmId(newComp.id);
      try {
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'companies', id: String(newComp.id), data: newComp })
        });
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', newComp);
        }
        window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'settings' } }));
        logActionToBackend(`Created Firm Profile: ${newComp.name}`);
        alert('✅ New Firm Profile Created & Saved to Cloud!');
      } catch (err) { alert('✅ Created locally, cloud sync failed.'); }
    } else {
      const updatedFirms = firms.map(f => f.id === selectedFirmId ? newComp : f);
      setFirms(updatedFirms);
      localStorage.setItem('ERP_Companies_v104', JSON.stringify(updatedFirms));
      try {
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'companies', id: String(selectedFirmId), data: newComp })
        });
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', newComp);
        }
        window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'settings' } }));
        logActionToBackend(`Updated Firm Profile: ${newComp.name}`);
        alert('✅ Firm Profile Updated & Synced to Cloud!');
      } catch (err) { alert('✅ Updated locally.'); }
    }
  };

  const handleDeleteFirm = async () => {
    if (!selectedFirmId || selectedFirmId === 'new_company') return;
    if (confirm('Delete this Firm Profile?')) {
      const updatedFirms = firms.filter(f => f.id !== selectedFirmId);
      setFirms(updatedFirms);
      localStorage.setItem('ERP_Companies_v104', JSON.stringify(updatedFirms));
      try {
        await fetch(`${BACKEND_URL}/api/data/${selectedFirmId}`, { method: 'DELETE' });
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', { id: selectedFirmId, deleted: true, updatedAt: Date.now() });
        }
        window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'settings' } }));
        logActionToBackend(`Deleted Firm Profile ID: ${selectedFirmId}`);
      } catch (e) {}
      setSelectedFirmId('');
      setFirmName(''); setFirmAddress(''); setFirmContact(''); setFirmPrefix('');
      alert('🗑️ Firm Deleted Successfully!');
    }
  };

  const handleAddStaff = (e) => {
    e.preventDefault();
    if (!newStaff.trim()) return;
    const formatted = newStaff.trim().toUpperCase();
    if (!staffList.includes(formatted)) {
      setStaffList([...staffList, formatted]);
      logActionToBackend(`Added staff member: ${formatted}`);
    }
    setNewStaff('');
  };

  const removeStaff = (s) => {
    setStaffList(staffList.filter(x => x !== s));
    logActionToBackend(`Removed staff member: ${s}`);
  };

  const handleAddMethod = (e) => {
    e.preventDefault();
    if (!newMethod.trim()) return;
    const formatted = newMethod.trim().toUpperCase();
    if (!paymentMethods.includes(formatted)) {
      setPaymentMethods([...paymentMethods, formatted]);
      logActionToBackend(`Added payment method: ${formatted}`);
    }
    setNewMethod('');
  };

  const removeMethod = (m) => {
    setPaymentMethods(paymentMethods.filter(x => x !== m));
    logActionToBackend(`Removed payment method: ${m}`);
  };

  const filteredLogs = waLogs.filter(l => l.receiver.includes(searchLog) || l.status.toLowerCase().includes(searchLog.toLowerCase()));

  return (
    <div className="tab-content active h-[calc(100vh-65px)] w-full relative bg-slate-100 overflow-y-auto custom-scrollbar p-4 md:p-6 animate-[fadeIn_0.3s_ease-in-out]">
      <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-10">
      
      {/* 🟢 Top Header Bar with Back Button & Icons */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            type="button" 
            onClick={() => window.dispatchEvent(new CustomEvent('ERP_SWITCH_TAB', { detail: { tabId: 'dashboard' } }))} 
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2.5 rounded-xl border border-slate-200 flex items-center gap-2 font-black text-xs uppercase transition-colors shadow-sm cursor-pointer"
            title="Go to Dashboard"
          >
            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="hidden sm:inline">Back</span>
          </button>
          
          <h2 className="font-black text-slate-800 text-base uppercase tracking-wider flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            System Settings & Profiles
          </h2>
        </div>
      </div>

      {/* WhatsApp Settings */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h4 className="font-black text-xs text-slate-800 uppercase mb-4 border-b border-slate-100 pb-3 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
            WhatsApp Settings
          </span>
          {waStatus === 'Connected' ? (
            <div className="relative inline-flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
              <span>🟢</span> <span className="font-black">{connectedPhone || 'Connected'}</span>
              <button type="button" onClick={handleDisconnectClick} className="text-red-500 font-bold ml-2 cursor-pointer">Disconnect</button>
            </div>
          ) : (
            <button type="button" onClick={handleConnectClick} className="bg-[#00a67e] hover:bg-emerald-600 text-white text-[10px] font-black uppercase px-4 py-2.5 rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
              <span>Connect WhatsApp</span>
            </button>
          )}
        </h4>

        {/* 1. Mobile Number Input Popup Modal */}
        {showPhoneModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-2xl shadow-xl w-96 border border-slate-200 animate-[fadeIn_0.2s_ease-in-out]">
              <h3 className="font-black text-sm text-slate-800 uppercase mb-2">Enter your mobile number</h3>
              <p className="text-[11px] text-slate-500 mb-4">Provide the WhatsApp number you want to link with this system.</p>
              
              <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-4">
                <input 
                  type="text" 
                  placeholder="e.g. 9876543210" 
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="pro-input text-xs font-mono py-2.5"
                  autoFocus
                  required
                />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowPhoneModal(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer">Cancel</button>
                  <button type="submit" className="bg-[#10b981] hover:bg-emerald-600 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer">Continue</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 2. QR Code Popup Modal */}
        {showQrModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-2xl shadow-xl w-80 border border-slate-200 flex flex-col items-center animate-[fadeIn_0.2s_ease-in-out]">
              <h3 className="font-black text-xs text-slate-800 uppercase mb-3">Scan WhatsApp QR</h3>
              
              <div className="flex justify-end w-full mb-3">
                <button type="button" onClick={handleRegenerateQr} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer">🔄 Refresh QR</button>
              </div>

              {waQrCode ? (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-4 flex justify-center">
                  <img src={waQrCode} alt="WhatsApp QR Code" className="w-48 h-48 object-contain bg-white p-1 rounded border" />
                </div>
              ) : (
                <div className="w-48 h-48 flex items-center justify-center bg-slate-100 rounded-xl mb-4 text-xs font-bold text-slate-400 animate-pulse">
                  Generating QR...
                </div>
              )}

              <button type="button" onClick={() => setShowQrModal(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold w-full cursor-pointer">Close / Cancel</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-6 mb-4 items-center">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input type="radio" name="wa_method_selector" checked={waMethod === 'web'} onChange={() => setWaMethod('web')} className="w-4 h-4 accent-emerald-600 cursor-pointer" /> Send Via WhatsApp Web / App
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input type="radio" name="wa_method_selector" checked={waMethod === 'direct'} onChange={() => setWaMethod('direct')} className="w-4 h-4 accent-emerald-600 cursor-pointer" /> Send Via Direct WhatsApp
          </label>
        </div>

        <div className="mb-5">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input type="checkbox" checked={allowStaffWa} onChange={(e) => setAllowStaffWa(e.target.checked)} className="w-4 h-4 accent-emerald-600 rounded cursor-pointer" /> Allow staff member to send WhatsApp using connected phone number.
          </label>
        </div>
        
        <h4 className="font-black text-xs text-slate-800 uppercase mb-4 border-b border-slate-100 pb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          WhatsApp Message Templates
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          
          <div className="flex flex-col bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner">
            <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">1. Send Document (Cert/Quote)</label>
            <span className="text-[9px] text-emerald-600 font-bold mb-3">Tags: {"{name}, {ref}, {type}"}</span>
            <textarea rows="3" value={waTemplates.doc} onChange={(e) => setWaTemplates({...waTemplates, doc: e.target.value})} className="pro-input text-xs bg-white shadow-sm"></textarea>
          </div>
          
          <div className="flex flex-col bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm shadow-inner">
            <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">2. Payment Pending Reminder</label>
            <span className="text-[9px] text-emerald-600 font-bold mb-3">Tags: {"{name}, {ref}, {amount}"}</span>
            <textarea rows="3" value={waTemplates.payment} onChange={(e) => setWaTemplates({...waTemplates, payment: e.target.value})} className="pro-input text-xs bg-white shadow-sm"></textarea>
          </div>

          <div className="flex flex-col md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
            <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">3. Expiry / Renewal Reminder</label>
            <span className="text-[9px] text-emerald-600 font-bold mb-3">Tags: {"{name}, {ref}, {date}"}</span>
            <textarea rows="3" value={waTemplates.expiry} onChange={(e) => setWaTemplates({...waTemplates, expiry: e.target.value})} className="pro-input text-xs bg-white shadow-sm"></textarea>
          </div>

        </div>

        {/* WhatsApp Log Section */}
        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
          <h4 className="font-black text-xs text-slate-800 uppercase">Whatsapp Log</h4>
          <input type="text" placeholder="Search..." value={searchLog} onChange={(e) => setSearchLog(e.target.value)} className="pro-input text-xs py-1.5 px-3 w-48 bg-slate-50" />
        </div>
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 bg-slate-50">
                <th className="py-2.5 px-3">From</th>
                <th className="py-2.5 px-3">To</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Sent On</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-3 font-bold text-slate-700">{log.sender}</td>
                    <td className="py-3 px-3 font-mono text-slate-600">{log.receiver}</td>
                    <td className="py-3 px-3"><span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">{log.status}</span></td>
                    <td className="py-3 px-3 text-slate-500 text-[11px]">{log.sentOn}</td>
                    <td className="py-3 px-3 text-right font-bold text-blue-600 cursor-pointer">View</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-400 font-bold text-xs">No results.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🏢 FIRM BASIC PROFILES */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="font-black text-slate-800 text-sm uppercase mb-6 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
          Firm Basic Profiles Management
        </h3>
        
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
          <label className="block text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2">Select Firm Profile...</label>
          <select value={selectedFirmId} onChange={handleSelectFirm} className="pro-input font-bold text-slate-800 bg-white border-slate-300 shadow-sm py-3 text-sm cursor-pointer">
            <option value="">Select Firm Profile...</option>
            <option value="new_company" className="font-black text-emerald-600">+ Create New Firm</option>
            {firms.map(f => (
              <option key={f.id} value={f.id}>
                {f.type === 'certificate' ? '📄' : '🧾'} {f.name}
              </option>
            ))}
          </select>
        </div>
        
        <form onSubmit={handleSaveFirm} className="grid grid-cols-2 gap-6">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Firm Name *</label>
            <input type="text" value={firmName} onChange={e => setFirmName(e.target.value)} className="pro-input font-bold py-2.5" placeholder="Enter Firm Name" required />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Address</label>
            <input type="text" value={firmAddress} onChange={e => setFirmAddress(e.target.value)} className="pro-input py-2.5" placeholder="Complete Address" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Contact Details</label>
            <input type="text" value={firmContact} onChange={e => setFirmContact(e.target.value)} className="pro-input font-mono py-2.5" placeholder="Phone / Mobile" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">Ref Prefix</label>
            <input type="text" value={firmPrefix} onChange={e => setFirmPrefix(e.target.value)} className="pro-input font-mono font-bold py-2.5" placeholder="e.g. SE/25-26/01" />
          </div>
          
          <div className="col-span-2 border-t border-slate-100 pt-5 mt-2">
            <label className="block text-[10px] font-black text-orange-600 uppercase mb-2 tracking-widest">Use This Profile For:</label>
            <select 
              value={firmType}
              onChange={(e) => setFirmType(e.target.value)}
              className="pro-input font-bold text-slate-800 bg-orange-50 border-orange-200 shadow-sm py-3 cursor-pointer"
            >
              <option value="certificate">📄 Certificate Invoices</option>
              <option value="quotation">🧾 Quotations</option>
            </select>
          </div>

          {firmType === 'quotation' && (
            <div className="col-span-2 grid grid-cols-2 gap-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Default GST %</label>
                <input type="number" value={gstRate} onChange={e => setGstRate(e.target.value)} className="pro-input font-mono bg-white" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Date Offset (Days)</label>
                <input type="number" value={dayOffset} onChange={e => setDayOffset(e.target.value)} className="pro-input font-mono bg-white" />
              </div>
            </div>
          )}

          <div className="col-span-2 flex gap-3 mt-2">
            <button type="submit" className="flex-1 bg-[#0f172a] text-white py-3 rounded-xl font-bold uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md flex justify-center items-center gap-2 cursor-pointer">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
              <span className="hidden sm:inline">Save Profile</span>
            </button>
            {selectedFirmId && selectedFirmId !== 'new_company' && (
              <button type="button" onClick={handleDeleteFirm} className="bg-red-50 text-red-600 border border-red-200 px-6 rounded-xl font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                <span className="hidden sm:inline">DEL</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Staff Management */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h4 className="font-black text-xs text-slate-800 uppercase mb-4 border-b border-slate-100 pb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
          Manage Staff / Employees
        </h4>
        
        <form onSubmit={handleAddStaff} className="flex gap-2 mb-4">
          <input 
            type="text" 
            value={newStaff}
            onChange={(e) => setNewStaff(e.target.value)}
            className="pro-input text-xs w-full shadow-inner bg-slate-50 font-bold" 
            placeholder="Type new staff name (e.g. Rahul)..." 
          />
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase shadow-md transition-colors whitespace-nowrap cursor-pointer">
            ➕ Add Staff
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          {staffList.map((staff) => (
            <span key={staff} className="bg-slate-100 border border-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm">
              {staff} <button type="button" onClick={() => removeStaff(staff)} className="text-red-500 hover:text-red-700 font-black cursor-pointer">&times;</button>
            </span>
          ))}
        </div>
      </div>

      {/* Payment Methods */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h4 className="font-black text-xs text-slate-800 uppercase mb-4 border-b border-slate-100 pb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
          Manage Payment Methods
        </h4>
        
        <form onSubmit={handleAddMethod} className="flex gap-2 mb-4">
          <input 
            type="text" 
            value={newMethod}
            onChange={(e) => setNewMethod(e.target.value)}
            className="pro-input text-xs w-full shadow-inner bg-slate-50 font-bold" 
            placeholder="Type new payment method (e.g. UPI, Cash)..." 
          />
          <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase shadow-md transition-colors whitespace-nowrap cursor-pointer">
            ➕ Add Method
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          {paymentMethods.map((method) => (
            <span key={method} className="bg-slate-100 border border-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm">
              {method} <button type="button" onClick={() => removeMethod(method)} className="text-red-500 hover:text-red-700 font-black cursor-pointer">&times;</button>
            </span>
          ))}
        </div>
      </div>

    </div>
  </div>
  );
}