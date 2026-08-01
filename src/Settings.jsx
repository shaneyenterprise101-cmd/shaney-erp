import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

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
  const [timer, setTimer] = useState(10);

  useEffect(() => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      if (ipcRenderer) {
        ipcRenderer.on('wa-status-update', (event, { status, qr, phone }) => {
          setWaStatus(status);
          if (phone) setConnectedPhone(phone);
          if (qr) {
            setWaQrCode(qr);
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
  }, []);

  // 🟢 10-Second Timer with Auto-Close
  useEffect(() => {
    let interval = null;
    if (showQrModal && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else if (timer === 0 && showQrModal) {
      setShowQrModal(false); // 10 sec baad window close ho jayegi
    }
    return () => clearInterval(interval);
  }, [showQrModal, timer]);

  const handleConnectClick = () => {
    setPhoneNumber('');
    setShowPhoneModal(true);
  };

  const handlePhoneSubmit = (e) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      alert('Please enter a valid mobile number!');
      return;
    }
    setShowPhoneModal(false);
    setConnectedPhone(phoneNumber.trim());
    setTimer(10); // Reset timer to 10s
    setWaQrCode('');
    setShowQrModal(true);
    
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      if (ipcRenderer) {
        setWaStatus('Scanning');
        ipcRenderer.invoke('trigger-wa-connect', { phone: phoneNumber.trim() }).then(res => {
          if (res) {
            setWaStatus(res.status || 'Scanning');
            if (res.qr) setWaQrCode(res.qr);
          }
        }).catch(err => {
          console.error("Failed to connect WA:", err);
        });
      }
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
          });
        }
      }
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
      setDoc(doc(db, "settings", "staff_list"), { staffList, updatedAt: Date.now() }, { merge: true }).catch(e => {});
    } catch(e) {}
  }, [staffList]);

  useEffect(() => {
    try {
      localStorage.setItem('ERP_PayMethods_v104', JSON.stringify(paymentMethods));
      setDoc(doc(db, "settings", "payment_methods"), { paymentMethods, updatedAt: Date.now() }, { merge: true }).catch(e => {});
    } catch(e) {}
  }, [paymentMethods]);

  useEffect(() => {
    try {
      localStorage.setItem('ERP_WA_Method_v104', JSON.stringify(waMethod));
      localStorage.setItem('ERP_WA_Templates_v104', JSON.stringify(waTemplates));
    } catch(e) {}
  }, [waMethod, waTemplates]);

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
        await setDoc(doc(db, "companies", String(newComp.id)), newComp);
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', newComp);
        }
        alert('✅ New Firm Profile Created & Saved!');
      } catch (err) { alert('✅ Created locally, cloud sync failed.'); }
    } else {
      const updatedFirms = firms.map(f => f.id === selectedFirmId ? newComp : f);
      setFirms(updatedFirms);
      localStorage.setItem('ERP_Companies_v104', JSON.stringify(updatedFirms));
      try {
        await setDoc(doc(db, "companies", String(selectedFirmId)), newComp, { merge: true });
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', newComp);
        }
        alert('✅ Firm Profile Updated!');
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
        await deleteDoc(doc(db, "companies", String(selectedFirmId)));
      } catch (e) {}
      setSelectedFirmId('');
      setFirmName(''); setFirmAddress(''); setFirmContact(''); setFirmPrefix('');
      alert('🗑️ Firm Deleted!');
    }
  };

  const handleAddStaff = (e) => {
    e.preventDefault();
    if (!newStaff.trim()) return;
    const formatted = newStaff.trim().toUpperCase();
    if (!staffList.includes(formatted)) {
      setStaffList([...staffList, formatted]);
    }
    setNewStaff('');
  };

  const removeStaff = (s) => setStaffList(staffList.filter(x => x !== s));

  const handleAddMethod = (e) => {
    e.preventDefault();
    if (!newMethod.trim()) return;
    const formatted = newMethod.trim().toUpperCase();
    if (!paymentMethods.includes(formatted)) {
      setPaymentMethods([...paymentMethods, formatted]);
    }
    setNewMethod('');
  };

  const removeMethod = (m) => setPaymentMethods(paymentMethods.filter(x => x !== m));

  const filteredLogs = waLogs.filter(l => l.receiver.includes(searchLog) || l.status.toLowerCase().includes(searchLog.toLowerCase()));

  return (
    <div className="animate-[fadeIn_0.3s_ease-in-out] max-w-4xl mx-auto flex flex-col gap-6 pb-10">
      
      {/* WhatsApp Settings */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h4 className="font-black text-xs text-slate-800 uppercase mb-4 border-b border-slate-100 pb-3 flex items-center justify-between">
          <span>WhatsApp Settings</span>
        </h4>

        <div className="flex flex-wrap gap-6 mb-4 items-center">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input 
              type="radio" 
              name="wa_method_selector" 
              checked={waMethod === 'web'} 
              onChange={() => setWaMethod('web')}
              className="w-4 h-4 accent-emerald-600 cursor-pointer" 
            /> Send Via WhatsApp Web / App
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input 
              type="radio" 
              name="wa_method_selector" 
              checked={waMethod === 'direct'} 
              onChange={() => setWaMethod('direct')}
              className="w-4 h-4 accent-emerald-600 cursor-pointer" 
            /> Send Via Direct WhatsApp
          </label>
        </div>

        <div className="mb-5">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input 
              type="checkbox" 
              checked={allowStaffWa} 
              onChange={(e) => setAllowStaffWa(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded cursor-pointer" 
            /> Allow staff member to send WhatsApp using connected phone number.
          </label>
        </div>

        <div className="flex items-center gap-4 mb-6 flex-wrap">
          {waStatus === 'Connected' ? (
            <div className="relative inline-flex items-center gap-3 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xl">🟢</span>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Connected with</span>
                <span className="text-xs font-black text-slate-800">{connectedPhone || 'Connected'}</span>
              </div>
              <button 
                type="button" 
                onClick={handleDisconnectClick}
                className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shadow-md cursor-pointer"
                title="Disconnect"
              >
                ✕
              </button>
            </div>
          ) : (
            <button 
              type="button" 
              onClick={handleConnectClick}
              className="bg-[#10b981] hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              Connect WhatsApp
            </button>
          )}
        </div>

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
                  <button 
                    type="button" 
                    onClick={() => setShowPhoneModal(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="bg-[#10b981] hover:bg-emerald-600 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer"
                  >
                    Continue
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 2. QR Code Popup Modal with 10s Timer & Auto-Close */}
        {showQrModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-2xl shadow-xl w-80 border border-slate-200 flex flex-col items-center animate-[fadeIn_0.2s_ease-in-out]">
              <h3 className="font-black text-xs text-slate-800 uppercase mb-2">Scan WhatsApp QR</h3>
              
              <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold mb-4 border border-emerald-200">
                ⏱️ Closing in {timer}s
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

              <button 
                type="button" 
                onClick={() => setShowQrModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold w-full cursor-pointer"
              >
                Close / Cancel
              </button>
            </div>
          </div>
        )}

        <h4 className="font-black text-xs text-slate-800 uppercase mb-4 border-b border-slate-100 pb-3">📝 WhatsApp Message Templates</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">1. Send Document (Cert/Quote)</label>
            <span className="text-[9px] text-emerald-600 font-bold mb-3">Tags: {"{name}, {ref}, {type}"}</span>
            <textarea 
              rows="3" 
              value={waTemplates.doc}
              onChange={(e) => setWaTemplates({...waTemplates, doc: e.target.value})}
              className="pro-input text-xs bg-white shadow-sm"
            ></textarea>
          </div>
          
          <div className="flex flex-col bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">2. Payment Pending Reminder</label>
            <span className="text-[9px] text-emerald-600 font-bold mb-3">Tags: {"{name}, {ref}, {amount}"}</span>
            <textarea 
              rows="3" 
              value={waTemplates.payment}
              onChange={(e) => setWaTemplates({...waTemplates, payment: e.target.value})}
              className="pro-input text-xs bg-white shadow-sm"
            ></textarea>
          </div>

          <div className="flex flex-col md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest mb-1">3. Expiry / Renewal Reminder</label>
            <span className="text-[9px] text-emerald-600 font-bold mb-3">Tags: {"{name}, {ref}, {date}"}</span>
            <textarea 
              rows="3" 
              value={waTemplates.expiry}
              onChange={(e) => setWaTemplates({...waTemplates, expiry: e.target.value})}
              className="pro-input text-xs bg-white shadow-sm"
            ></textarea>
          </div>
        </div>
      </div>

      {/* WhatsApp Log Section */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <h4 className="font-black text-xs text-slate-800 uppercase">Whatsapp Log</h4>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchLog}
              onChange={(e) => setSearchLog(e.target.value)}
              className="pro-input text-xs py-1.5 px-3 w-48 bg-slate-50"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-black uppercase text-slate-500">
                <th className="py-2.5 px-3">From</th>
                <th className="py-2.5 px-3">To</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Sent On</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="text-xs">
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
                  <td colSpan="5" className="py-8 text-center text-slate-400 font-bold text-xs">No results</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Firm Basic Profiles Management */}
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="font-black text-slate-800 text-sm uppercase mb-6 flex items-center gap-2">
          <span className="text-blue-500 text-lg">🏢</span> Firm Basic Profiles Management
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
              💾 <span className="hidden sm:inline">Save Profile</span>
            </button>
            {selectedFirmId && selectedFirmId !== 'new_company' && (
              <button type="button" onClick={handleDeleteFirm} className="bg-red-50 text-red-600 border border-red-200 px-6 rounded-xl font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer">
                🗑️ <span className="hidden sm:inline">DEL</span>
              </button>
            )}
          </div>
        </form>
      </div>

    </div>
  );
}