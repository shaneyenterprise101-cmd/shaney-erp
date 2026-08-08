import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

const BACKEND_URL = "https://shaney-erp-backend.onrender.com";

// 🟢 Universal Logging Helper
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

// 🟢 1-by-1 Safe Sequential Rate Limiter: Exactly 1 item per 1 second with live progress counter
const processInBatchesWithProgress = async (items, batchSize = 1, delayMs = 1000, asyncTaskCallback, onProgress) => {
  let results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchPromises = batch.map(item => asyncTaskCallback(item));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    if (onProgress) {
      onProgress(Math.min(i + batchSize, items.length), items.length);
    }

    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return results;
};

export default function Customer() {
  // 🟢 1. LOCAL-FIRST INITIALIZATION (Zero wait, instant load)
  const [customers, setCustomers] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_Customers_v104');
      let initialCust = saved ? JSON.parse(saved) : [];
      return initialCust.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
    } catch(e) { return []; }
  });

  // 🟢 2. CONTROLLED BACKGROUND SYNC
  useEffect(() => {
    let isMounted = true;

    const syncWithCloud = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/data`);
        if (res.ok && isMounted) {
          const allData = await res.json();
          if (allData && typeof allData === 'object') {
            let cloudCust = [];
            if (Array.isArray(allData)) {
              cloudCust = allData.filter(item => item.docType === 'customer');
            } else if (allData.customers && Array.isArray(allData.customers)) {
              cloudCust = allData.customers;
            } else if (allData.payload) {
              try {
                const parsed = JSON.parse(allData.payload);
                if (parsed.customers) cloudCust = parsed.customers;
              } catch(e){}
            }

            if (cloudCust.length > 0) {
              cloudCust = cloudCust.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
              
              const localSaved = localStorage.getItem('ERP_Customers_v104');
              const localParsed = localSaved ? JSON.parse(localSaved) : [];
              
              if (JSON.stringify(cloudCust) !== JSON.stringify(localParsed)) {
                setCustomers(cloudCust);
                localStorage.setItem('ERP_Customers_v104', JSON.stringify(cloudCust));
              }
            }
          }
        }
      } catch (err) {
        console.error("Cloud sync background check error:", err);
      }
    };

    syncWithCloud();

    const handleDataUpdate = (e) => {
      if (!e.detail || e.detail.type === 'customers') {
        const saved = localStorage.getItem('ERP_Customers_v104');
        if (saved) {
          let parsedData = JSON.parse(saved);
          parsedData = parsedData.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
          setCustomers(parsedData);
        }
      }
    };
    window.addEventListener('ERP_DATA_UPDATED', handleDataUpdate);
    
    return () => {
      isMounted = false;
      window.removeEventListener('ERP_DATA_UPDATED', handleDataUpdate);
    };
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  // Mobile Floating Search State
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  
  // Import States
  const [isSyncing, setIsSyncing] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [rawExcelData, setRawExcelData] = useState([]);
  const [excelColumns, setExcelColumns] = useState([]);

  const [formData, setFormData] = useState({
    name: '',
    address: '', 
    village: '',
    taluka: '',
    district: '',
    state: 'Gujarat',
    pincode: '',
    contacts: [{ person: '', mobile: '', type: 'Mobile', sameAsWhatsapp: true, whatsapp: '' }]
  });

  useEffect(() => {
    localStorage.setItem('ERP_Customers_v104', JSON.stringify(customers));
  }, [customers]);

  const handleInputChange = (e, index = null, field = null) => {
    const { name, value, type, checked } = e.target;
    if (index !== null) {
      const newContacts = [...formData.contacts];
      if (type === 'checkbox') {
        newContacts[index][field] = checked;
        if (checked && field === 'sameAsWhatsapp') {
          newContacts[index].whatsapp = newContacts[index].mobile;
        }
      } else {
        newContacts[index][field] = value;
        if (field === 'mobile' && newContacts[index].sameAsWhatsapp) {
          newContacts[index].whatsapp = value;
        }
      }
      setFormData({ ...formData, contacts: newContacts });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const addContactField = () => {
    setFormData({
      ...formData,
      contacts: [...formData.contacts, { person: '', mobile: '', type: 'Mobile', sameAsWhatsapp: true, whatsapp: '' }]
    });
  };

  const removeContactField = (index) => {
    const newContacts = formData.contacts.filter((_, i) => i !== index);
    setFormData({ ...formData, contacts: newContacts });
  };

  // 🟢 3. OPTIMIZED SUBMIT
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name) {
      alert('Please enter Client Name / Firm!');
      return;
    }

    const customerId = editingId !== null ? editingId : Date.now();
    const currentTimestamp = Date.now();
    const customerPayload = { 
      id: customerId, 
      docType: 'customer',
      ...formData, 
      updatedAt: currentTimestamp
    };

    let updatedList = [];
    if (editingId !== null) {
      updatedList = customers.map(c => c.id === editingId ? customerPayload : c);
      setEditingId(null);
    } else {
      updatedList = [...customers, customerPayload];
    }

    setCustomers(updatedList);
    localStorage.setItem('ERP_Customers_v104', JSON.stringify(updatedList));

    try {
      await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'customers', id: String(customerId), data: customerPayload })
      });
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', customerPayload);
      }
    } catch (err) {
      console.error("❌ Cloud Sync error:", err);
    }

    setFormData({
      name: '',
      address: '',
      village: '',
      taluka: '',
      district: '',
      state: 'Gujarat',
      pincode: '',
      contacts: [{ person: '', mobile: '', type: 'Mobile', sameAsWhatsapp: true, whatsapp: '' }]
    });
    alert('✅ Customer Saved Successfully!');
  };

  const handleEditClick = (customer) => {
    setEditingId(customer.id);
    setFormData({
      name: customer.name || '',
      address: customer.address || '',
      village: customer.village || '',
      taluka: customer.taluka || '',
      district: customer.district || '',
      state: customer.state || 'Gujarat',
      pincode: customer.pincode || '',
      contacts: customer.contacts ? JSON.parse(JSON.stringify(customer.contacts)) : [{ person: '', mobile: '', type: 'Mobile', sameAsWhatsapp: true, whatsapp: '' }]
    });
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = paginatedCustomers.map(c => c.id);
      setSelectedIds(allIds);
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (e, id) => {
    e.stopPropagation();
    if (e.target.checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter(item => item !== id));
    }
  };

  const handleDeleteSelectedOrAll = async () => {
    if (selectedIds.length > 0) {
      if (confirm(`Are you sure you want to delete ${selectedIds.length} selected customer(s)?`)) {
        const updated = customers.filter(c => !selectedIds.includes(c.id));
        setCustomers(updated);
        localStorage.setItem('ERP_Customers_v104', JSON.stringify(updated));
        setSelectedIds([]);

        for (let id of selectedIds) {
          try { 
            await fetch(`${BACKEND_URL}/api/data/${id}`, { method: 'DELETE' });
            if (window.require) {
              const { ipcRenderer } = window.require('electron');
              if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', { id, deleted: true, updatedAt: Date.now() });
            }
          } catch(e){}
        }
      }
    } else {
      if (confirm('Are you sure you want to delete ALL client records?')) {
        setCustomers([]);
        setSelectedIds([]);
        localStorage.removeItem('ERP_Customers_v104');
      }
    }
  };

  const handleDeleteSingle = async (e, id) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this record?')) {
      const updated = customers.filter(item => item.id !== id);
      setCustomers(updated);
      setSelectedIds(selectedIds.filter(i => i !== id));
      localStorage.setItem('ERP_Customers_v104', JSON.stringify(updated));

      try {
        await fetch(`${BACKEND_URL}/api/data/${id}`, { method: 'DELETE' });
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', { id, deleted: true, updatedAt: Date.now() });
        }
      } catch (err) {
        console.error("Cloud delete error:", err);
      }
    }
  };

  // 🟢 SMART IMPORT FUNCTIONS
  const downloadSampleCustomerExcel = () => {
    const sampleData = [
      {
        "Name": "ABC Industries",
        "Phone": "9876543210",
        "Address": "101, Main Market Road",
        "Village": "Mendarada",
        "Taluka": "Visavadar",
        "District": "Junagadh",
        "State": "Gujarat",
        "Pincode": "362001"
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customer_Sample");
    XLSX.writeFile(workbook, "Customer_Import_Sample.xlsx");
  };

  const handleFileSelectAndPreview = (event) => {
    const file = event.target.files[0];
    if (!file) return;

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
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  const confirmCustomerImport = async () => {
    setIsSyncing(true);
    setImportProgress({ current: 0, total: rawExcelData.length });

    try {
      let currentCustomers = [...customers];
      let newCustomerItems = [];
      let importedCustCount = 0;
      let skippedCustCount = 0;
      const currentTimestamp = Date.now();

      const existingNames = new Set(currentCustomers.map(c => String(c.name).trim().toLowerCase()));

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

        const name = findVal(['Name', 'Customer Name', 'Client Name', 'Firm Name', 'Party']);
        const phone = findVal(['Phone', 'Mobile', 'Contact', 'WhatsApp', 'Number']);
        const address = findVal(['Address', 'Location']);
        const village = findVal(['Village', 'Area']);
        const taluka = findVal(['Taluka', 'Tehsil']);
        const district = findVal(['District', 'City']);
        const state = findVal(['State']) || 'Gujarat';
        const pincode = findVal(['Pincode', 'Pin', 'Zip']);

        if (name) {
          const cleanName = String(name).trim().toLowerCase();
          
          if (!existingNames.has(cleanName)) {
            const custObj = {
              id: 'cust_imp_' + Date.now() + '_' + idx,
              docType: 'customer',
              name: String(name).trim(),
              address: String(address).trim(),
              village: String(village).trim(),
              taluka: String(taluka).trim(),
              district: String(district).trim(),
              state: String(state).trim(),
              pincode: String(pincode).trim(),
              updatedAt: currentTimestamp,
              contacts: [
                {
                  person: 'Owner', 
                  mobile: String(phone).trim(),
                  type: 'Mobile',
                  sameAsWhatsapp: true,
                  whatsapp: String(phone).trim()
                }
              ]
            };
            currentCustomers.push(custObj);
            newCustomerItems.push(custObj);
            existingNames.add(cleanName);
            importedCustCount++;
          } else {
            skippedCustCount++;
          }
        }
      });

      setCustomers(currentCustomers);
      localStorage.setItem('ERP_Customers_v104', JSON.stringify(currentCustomers));

      setImportProgress({ current: 0, total: newCustomerItems.length });
      let currentSyncedFiles = 0;

      await processInBatchesWithProgress(newCustomerItems, 1, 1000, async (cItem) => {
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'customers', id: String(cItem.id), data: cItem })
        });
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', cItem);
        }
      }, (curr) => {
        currentSyncedFiles = curr;
        setImportProgress({ current: currentSyncedFiles, total: newCustomerItems.length });
      });

      window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'customers' } }));
      
      setPreviewModalOpen(false);
      setIsSyncing(false);
      logActionToBackend(`Imported ${importedCustCount} new customers via Excel`);
      alert(`Sync Complete! Added ${importedCustCount} new customers (${skippedCustCount} duplicate customers skipped).`);

    } catch (err) {
      setIsSyncing(false);
      alert('Import Sync Failed: ' + err.message);
    }
  };

  const filteredCustomers = customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).reverse();
  const totalPages = Math.ceil(filteredCustomers.length / rowsPerPage) || 1;
  const paginatedCustomers = filteredCustomers.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // 🟢 COMMON INPUT STYLES FOR PREMIUM UI
  const inputStyles = "w-full text-xs font-bold text-slate-800 bg-slate-50/50 border border-slate-200 rounded-xl px-3.5 py-3 outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all shadow-sm";

  return (
    <div className="tab-content active h-[calc(100vh-65px)] w-full relative bg-slate-50 overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-4 animate-[fadeIn_0.3s_ease-in-out]">
  <div className="max-w-7xl mx-auto pb-10">
        
        {/* 🟢 SPINNING LOADER & LIVE CLOUD COUNTER SCREEN */}
        {isSyncing && (
          <div className="fixed inset-0 bg-slate-900/80 z-[999999] flex flex-col items-center justify-center backdrop-blur-md">
            <div className="w-16 h-16 border-4 border-[#00a67e] border-t-transparent rounded-full animate-spin mb-4"></div>
            <h2 className="text-white font-black text-lg uppercase tracking-widest">Processing (1 by 1 Safe Sync)...</h2>
            <p className="text-[#00a67e] text-sm font-black mt-2 font-mono bg-emerald-950/80 px-4 py-2 rounded-xl border border-emerald-500/30">
              Cloud Files Processed: {importProgress.current} / {importProgress.total}
            </p>
            <p className="text-slate-400 text-xs font-bold mt-2">Please wait while maintaining safe Read/Write performance.</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5 items-start">
          
          {/* 🟢 LEFT SIDE: PREMIUM CLIENT FORM */}
          <div className="lg:col-span-5 xl:col-span-5 bg-white p-6 md:p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col gap-5">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-1">
              <h3 className="font-black text-sm text-slate-800 uppercase tracking-widest flex items-center gap-2.5">
                <span className={`p-1.5 rounded-lg leading-none ${editingId ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                  {editingId ? '✏️' : '➕'}
                </span> 
                {editingId ? 'Update Client' : 'Global Client'}
              </h3>
              {editingId && (
                <button 
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setFormData({ name: '', address: '', village: '', taluka: '', district: '', state: 'Gujarat', pincode: '', contacts: [{ person: '', mobile: '', type: 'Mobile', sameAsWhatsapp: true, whatsapp: '' }] });
                  }}
                  className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-1 rounded-md hover:bg-red-100 transition-colors cursor-pointer uppercase tracking-wider"
                >
                  Cancel
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4.5">
              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5 ml-1">Client Name / Firm *</label>
                <input 
                  type="text" 
                  name="name" 
                  value={formData.name} 
                  onChange={handleInputChange} 
                  placeholder="e.g. Royal Industries" 
                  className={inputStyles} 
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5 ml-1">Full Address / Location</label>
                <input 
                  type="text" 
                  name="address" 
                  value={formData.address} 
                  onChange={handleInputChange} 
                  placeholder="e.g. Mamlatdar Kacheri Road" 
                  className={inputStyles} 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5 ml-1">Village</label>
                  <input 
                    type="text" 
                    name="village" 
                    value={formData.village} 
                    onChange={handleInputChange} 
                    placeholder="Village" 
                    className={inputStyles} 
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5 ml-1">Taluka</label>
                  <input 
                    type="text" 
                    name="taluka" 
                    value={formData.taluka} 
                    onChange={handleInputChange} 
                    placeholder="Taluka" 
                    className={inputStyles} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5 ml-1">District</label>
                  <input 
                    type="text" 
                    name="district" 
                    value={formData.district} 
                    onChange={handleInputChange} 
                    placeholder="District" 
                    className={inputStyles} 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5 ml-1">State</label>
                  <input 
                    type="text" 
                    name="state" 
                    value={formData.state} 
                    onChange={handleInputChange} 
                    placeholder="State" 
                    className={inputStyles} 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1.5 ml-1">Pincode</label>
                  <input 
                    type="text" 
                    name="pincode" 
                    value={formData.pincode} 
                    onChange={handleInputChange} 
                    placeholder="Pin" 
                    className={`${inputStyles} font-mono`} 
                  />
                </div>
              </div>

              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-3 mt-2">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[10px] font-black uppercase text-indigo-600 tracking-wider">Contact Details</label>
                  <button 
                    type="button" 
                    onClick={addContactField}
                    className="bg-white hover:bg-indigo-50 text-indigo-600 text-[10px] font-black px-2.5 py-1.5 rounded-lg border border-indigo-200 transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
                  >
                    <span>➕ Add</span>
                  </button>
                </div>

                {formData.contacts.map((contact, index) => (
                  <div key={index} className="flex flex-col gap-2.5 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm relative group">
                    {formData.contacts.length > 1 && (
                      <button 
                        type="button" 
                        onClick={() => removeContactField(index)}
                        className="absolute -top-2 -right-2 bg-red-100 text-red-600 hover:bg-red-500 hover:text-white rounded-full w-5 h-5 flex items-center justify-center font-bold text-xs transition-colors shadow-sm cursor-pointer z-10 opacity-0 group-hover:opacity-100"
                        title="Remove Contact"
                      >
                        &times;
                      </button>
                    )}
                    
                    <div className="grid grid-cols-12 gap-2.5">
                      <div className="col-span-7">
                        <input 
                          type="text" 
                          placeholder={`Person ${index + 1}`} 
                          value={contact.person} 
                          onChange={(e) => handleInputChange(e, index, 'person')} 
                          className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-indigo-400 transition-all" 
                        />
                      </div>
                      <div className="col-span-5">
                        <select 
                          value={contact.type} 
                          onChange={(e) => handleInputChange(e, index, 'type')}
                          className="w-full text-[10px] font-black text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-indigo-400 transition-all uppercase tracking-wider"
                        >
                          <option value="Mobile">Mobile</option>
                          <option value="WhatsApp">WhatsApp</option>
                          <option value="Both">Both</option>
                          <option value="Office">Office</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-2.5 items-center">
                      <div className="col-span-7">
                        <input 
                          type="text" 
                          placeholder="Number" 
                          value={contact.mobile} 
                          onChange={(e) => handleInputChange(e, index, 'mobile')} 
                          className="w-full text-xs font-black font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:border-indigo-400 transition-all tracking-wider" 
                        />
                      </div>
                      <div className="col-span-5 flex justify-end">
                        <label className="text-[9px] font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1.5 cursor-pointer bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 select-none hover:bg-emerald-100 transition-colors w-full justify-center">
                          <input 
                            type="checkbox" 
                            checked={contact.sameAsWhatsapp} 
                            onChange={(e) => handleInputChange(e, index, 'sameAsWhatsapp')} 
                            className="accent-emerald-600 w-3.5 h-3.5 cursor-pointer" 
                          /> Same WA
                        </label>
                      </div>
                    </div>

                    {!contact.sameAsWhatsapp && (
                      <div className="mt-1">
                        <input 
                          type="text" 
                          placeholder="WhatsApp Number" 
                          value={contact.whatsapp} 
                          onChange={(e) => handleInputChange(e, index, 'whatsapp')} 
                          className="w-full text-xs font-black font-mono text-emerald-700 bg-emerald-50/50 border border-emerald-200 rounded-lg px-2.5 py-2 outline-none focus:border-emerald-500 transition-all tracking-wider" 
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button 
                type="submit" 
                className={`w-full text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 mt-2 ${editingId ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-orange-500/30' : 'bg-gradient-to-r from-[#00a67e] to-emerald-500 hover:from-emerald-500 hover:to-teal-400 shadow-emerald-500/30'}`}
              >
                {editingId ? '🔄 Update Record' : '💾 Save to Directory'}
              </button>
            </form>
          </div>

          {/* 🟢 RIGHT SIDE: PREMIUM DIRECTORY TABLE */}
          <div className="lg:col-span-7 xl:col-span-7 bg-white p-6 md:p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col min-h-[600px]">
            
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-5 border-b border-slate-100 pb-5 mb-5 relative">
              <div>
                <h3 className="font-black text-lg text-slate-800 uppercase tracking-wide flex items-center gap-2.5">
                  <span className="bg-indigo-100 text-indigo-600 p-1.5 rounded-lg flex items-center justify-center shadow-sm">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                  </span>
                  Directory
                </h3>
                <p className="text-[11px] text-slate-400 font-bold tracking-widest uppercase mt-1">Manage & Sync Clients</p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-start xl:justify-end">
                {/* Desktop Search */}
                <div className="hidden sm:block relative group">
                  <input 
                    type="text" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search client..." 
                    className="w-48 lg:w-56 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-full py-2.5 pl-10 pr-4 outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 transition-all shadow-sm" 
                  />
                  <svg className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none group-focus-within:text-emerald-500 transition-colors" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>

                {/* Mobile Search Button */}
                <button type="button" onClick={() => setIsMobileSearchOpen(true)} className="sm:hidden bg-slate-50 hover:bg-slate-100 text-slate-600 p-2.5 rounded-full border border-slate-200 shadow-sm cursor-pointer flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </button>

                <button type="button" onClick={downloadSampleCustomerExcel} className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-black px-4 py-2.5 rounded-full border border-slate-200 shadow-sm transition-all hover:shadow flex items-center gap-1.5 cursor-pointer uppercase tracking-wider">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> Sample
                </button>
                
                <label className="bg-[#00a67e] hover:bg-emerald-600 text-white text-xs font-black px-5 py-2.5 rounded-full shadow-md shadow-emerald-500/20 transition-all hover:-translate-y-0.5 flex items-center gap-1.5 cursor-pointer uppercase tracking-wider">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg> Import
                  <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileSelectAndPreview} className="hidden" />
                </label>

                {/* 🟢 Delete Button - Only shows when checkbox is selected */}
                {selectedIds.length > 0 && (
                  <button 
                    type="button"
                    onClick={handleDeleteSelectedOrAll}
                    className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-black px-4 py-2.5 rounded-full border border-red-200 shadow-sm transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 uppercase tracking-wider animate-[fadeIn_0.2s_ease-in-out]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> 
                    Delete ({selectedIds.length})
                  </button>
                )}
              </div>

              {/* Mobile Floating Full-Width Search Bar Overlay */}
              {isMobileSearchOpen && (
                <div className="absolute inset-0 bg-white px-2 flex items-center gap-2 z-50 sm:hidden w-full h-full">
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      autoFocus 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)} 
                      placeholder="Search Client..." 
                      className="w-full text-xs font-bold text-slate-700 bg-slate-50 border border-emerald-200 rounded-full py-2.5 pl-10 pr-4 outline-none focus:ring-4 focus:ring-emerald-500/20" 
                    />
                    <svg className="w-4 h-4 text-emerald-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  <button type="button" onClick={() => setIsMobileSearchOpen(false)} className="text-slate-400 hover:text-slate-700 font-black text-2xl px-2 leading-none cursor-pointer">&times;</button>
                </div>
              )}
            </div>

            {/* Pagination & Count Header Tools */}
            <div className="flex flex-col sm:flex-row justify-between items-center py-2 px-1 mb-3 gap-3 shrink-0">
              <span className="text-[11px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                Total <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-2.5 py-0.5 rounded-md text-xs">{filteredCustomers.length}</span> Records
              </span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-600 font-bold transition-colors cursor-pointer border border-slate-200 shadow-sm">◀</button>
                <span className="text-[10px] font-black uppercase px-2 text-slate-500 tracking-wider">Pg {currentPage} / {totalPages}</span>
                <button type="button" onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-600 font-bold transition-colors cursor-pointer border border-slate-200 shadow-sm">▶</button>
              </div>
            </div>

            {/* 🟢 DESKTOP TABLE VIEW */}
            <div className="hidden md:block overflow-x-auto flex-1 rounded-2xl border border-slate-200">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">
                    <th className="py-3.5 px-4 w-12 text-center rounded-tl-2xl">
                      <input 
                        type="checkbox" 
                        onChange={handleSelectAll} 
                        checked={paginatedCustomers.length > 0 && selectedIds.length === paginatedCustomers.length} 
                        className="accent-[#00a67e] w-4 h-4 cursor-pointer rounded border-slate-300" 
                      />
                    </th>
                    <th className="py-3.5 px-4">Client / Firm Name</th>
                    <th className="py-3.5 px-4">Address Details</th>
                    <th className="py-3.5 px-4">Contacts & Numbers</th>
                    <th className="py-3.5 px-4 text-center rounded-tr-2xl w-20">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs bg-white">
                  {paginatedCustomers.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center py-24 text-slate-400 font-bold italic tracking-wide">
                        No client records found in directory.
                      </td>
                    </tr>
                  ) : (
                    paginatedCustomers.map(c => (
                      <tr 
                        key={c.id} 
                        onClick={() => handleEditClick(c)}
                        className={`hover:bg-emerald-50/30 transition-all cursor-pointer group ${editingId === c.id ? 'bg-amber-50/40 shadow-[inset_4px_0_0_#f59e0b]' : 'hover:shadow-[inset_4px_0_0_#00a67e]'}`}
                        title="Click to edit record"
                      >
                        <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            checked={selectedIds.includes(c.id)} 
                            onChange={(e) => handleSelectRow(e, c.id)} 
                            className="accent-[#00a67e] w-4 h-4 cursor-pointer rounded border-slate-300" 
                          />
                        </td>
                        <td className="py-3.5 px-4 font-black text-slate-900 uppercase tracking-wide">{c.name}</td>
                        <td className="py-3.5 px-4 text-slate-600 font-semibold leading-relaxed">
                          {c.address ? <div className="font-extrabold text-slate-800 mb-0.5">{c.address}</div> : null}
                          <div className="text-[11px] text-slate-500">
                            {c.village ? `${c.village}, ` : ''}{c.taluka ? `${c.taluka}, ` : ''}{c.district} {c.pincode ? `- ${c.pincode}` : ''}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-700">
                          {(c.contacts || []).map((con, idx) => (
                            <div key={idx} className="mb-2 last:mb-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="font-bold text-indigo-800 text-[11px] uppercase tracking-wider font-sans">{con.person || 'Contact'}:</span> 
                                <span className="font-black text-sm tracking-widest">{con.mobile}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest font-sans">{con.type}</span>
                                {!con.sameAsWhatsapp && con.whatsapp && (
                                  <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest font-sans flex items-center gap-1">
                                    <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                                    WA: {con.whatsapp}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </td>
                        <td className="py-3.5 px-4 text-center" onClick={(e) => handleDeleteSingle(e, c.id)}>
                          <button 
                            type="button"
                            className="text-slate-300 hover:text-white bg-transparent hover:bg-red-500 p-2 rounded-xl transition-all shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                            title="Delete Record"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 🟢 MOBILE CARD VIEW */}
            <div className="block md:hidden flex-1 space-y-4 mt-2">
              {paginatedCustomers.length === 0 ? (
                <div className="text-center py-20 text-slate-400 font-bold italic text-xs">
                  No client records found in directory.
                </div>
              ) : (
                paginatedCustomers.map(c => (
                  <div 
                    key={c.id}
                    onClick={() => handleEditClick(c)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm flex flex-col gap-3 bg-white ${editingId === c.id ? 'border-amber-400 bg-amber-50/30 ring-4 ring-amber-500/10' : 'border-slate-200 hover:border-emerald-400 active:scale-[0.99]'}`}
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(c.id)} 
                          onChange={(e) => handleSelectRow(e, c.id)} 
                          onClick={(e) => e.stopPropagation()}
                          className="accent-[#00a67e] w-4 h-4 cursor-pointer rounded" 
                        />
                        <span className="font-black text-slate-900 text-sm uppercase tracking-wide">{c.name}</span>
                      </div>
                      <button 
                        type="button"
                        onClick={(e) => handleDeleteSingle(e, c.id)}
                        className="text-slate-400 hover:text-white bg-slate-50 hover:bg-red-500 p-2 rounded-xl transition-colors shadow-sm cursor-pointer"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>

                    {c.address && (
                      <div className="text-xs text-slate-700 font-extrabold bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 tracking-wide">
                        🏢 {c.address}
                      </div>
                    )}

                    <div className="text-[11px] text-slate-600 font-semibold grid grid-cols-2 gap-x-3 gap-y-2 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                      <div><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Village / Area</span> {c.village || '—'}</div>
                      <div><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Taluka</span> {c.taluka || '—'}</div>
                      <div><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">District</span> {c.district || '—'}</div>
                      <div><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">State / Pin</span> {c.state || 'Gujarat'} {c.pincode ? `- ${c.pincode}` : ''}</div>
                    </div>

                    <div className="space-y-2 pt-1">
                      <span className="text-[10px] font-black uppercase text-indigo-600 tracking-widest block ml-1">Contacts:</span>
                      {(c.contacts || []).map((con, idx) => (
                        <div key={idx} className="bg-indigo-50/30 p-3 rounded-xl border border-indigo-100/50 flex flex-col gap-1 text-xs font-mono text-slate-700 shadow-sm">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-indigo-900 font-sans tracking-wide">{con.person || `Contact ${idx + 1}`}</span>
                            <span className="text-[9px] bg-white px-2 py-0.5 rounded-md text-slate-500 font-sans font-black uppercase tracking-widest border border-indigo-100 shadow-sm">{con.type}</span>
                          </div>
                          <div className="font-black text-slate-900 text-sm tracking-widest">{con.mobile}</div>
                          {!con.sameAsWhatsapp && con.whatsapp && (
                            <div className="mt-1 flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded-md border border-emerald-100 w-max font-sans">
                              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                              WA: {con.whatsapp}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                  </div>
                ))
              )}
            </div>

            {/* Mobile Pagination Footer */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-sm mt-4 md:hidden shrink-0">
                <button type="button" onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-600 font-bold border border-slate-200 shadow-sm transition-colors cursor-pointer">◀</button>
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Page {currentPage} of {totalPages}</span>
                <button type="button" onClick={() => setCurrentPage(prev => Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-600 font-bold border border-slate-200 shadow-sm transition-colors cursor-pointer">▶</button>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* 🟢 PREVIEW MODAL BEFORE FINAL SYNC */}
      {previewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 z-[99999] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white shrink-0">
              <h3 className="font-black uppercase tracking-widest text-sm flex items-center gap-2.5">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> 
                Excel Import Preview
              </h3>
              <button type="button" onClick={() => setPreviewModalOpen(false)} className="text-slate-400 hover:text-white font-black text-2xl leading-none cursor-pointer transition-colors">&times;</button>
            </div>
            
            <div className="p-5 overflow-auto flex-1 custom-scrollbar bg-slate-50">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">
                <table className="w-full border-collapse text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-black uppercase text-[10px] tracking-widest border-b border-slate-200">
                      <th className="py-3 px-4 text-center border-r border-slate-200 w-12">#</th>
                      {excelColumns.map((col, cIdx) => (
                        <th key={cIdx} className="py-3 px-4 text-left border-r border-slate-200 last:border-0">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-emerald-50/50 font-medium transition-colors">
                        <td className="py-3 px-4 text-center font-bold text-slate-400 bg-slate-50/50 border-r border-slate-100">{rIdx + 1}</td>
                        {excelColumns.map((col, cIdx) => {
                          let val = row[col];
                          return (
                            <td key={cIdx} className="py-3 px-4 text-slate-800 border-r border-slate-100 last:border-0">{val !== undefined ? String(val) : ''}</td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500 font-bold mt-4 text-center tracking-wide uppercase">
                Showing all <span className="text-indigo-600 font-black px-1">{previewRows.length}</span> imported rows. Click 'Confirm & Sync' to update database securely without duplicates.
              </p>
            </div>

            <div className="p-5 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
              <button type="button" onClick={() => setPreviewModalOpen(false)} className="px-6 py-3 rounded-xl font-black text-slate-600 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-colors uppercase tracking-widest text-xs cursor-pointer shadow-sm">Cancel</button>
              <button type="button" onClick={confirmCustomerImport} className="px-8 py-3 rounded-xl font-black uppercase tracking-widest text-white bg-gradient-to-r from-[#00a67e] to-emerald-500 hover:from-emerald-500 hover:to-teal-400 shadow-lg shadow-emerald-500/30 transition-all flex items-center gap-2 text-xs cursor-pointer active:scale-95">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg> CONFIRM & SYNC TO CLOUD
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}