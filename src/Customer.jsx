import React, { useState, useEffect } from 'react';
import { db } from './firebase'; // 👈 Firebase instance import kiya gaya hai
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

export default function Customer() {
  const [customers, setCustomers] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_Customers_v104');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });

  // 🟢 REAL-TIME LIVE SYNC LISTENER (App.jsx broadcast catcher)
  useEffect(() => {
    const handleDataUpdate = (e) => {
      if (!e.detail || e.detail.type === 'customers') {
        const saved = localStorage.getItem('ERP_Customers_v104');
        if (saved) {
          setCustomers(JSON.parse(saved));
        }
      }
    };
    window.addEventListener('ERP_DATA_UPDATED', handleDataUpdate);
    return () => window.removeEventListener('ERP_DATA_UPDATED', handleDataUpdate);
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  // Mobile Floating Search State
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  
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

  // 🟢 GRANULAR SAVE TO FIREBASE, SQLITE & LOCALSTORAGE WITH TIMESTAMP
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
      updatedAt: currentTimestamp // 🟢 Exact Timestamp for Delta Sync
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

    // Firebase & SQLite sync
    try {
      await setDoc(doc(db, "customers", String(customerId)), customerPayload);
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', customerPayload);
      }
      console.log("✅ Customer synced to Firebase & SQLite successfully");
    } catch (err) {
      console.error("❌ Sync error:", err);
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
    alert('✅ Customer Saved Successfully to Directory & Cloud!');
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
        
        for (let id of selectedIds) {
          try { 
            await deleteDoc(doc(db, "customers", String(id))); 
            if (window.require) {
              const { ipcRenderer } = window.require('electron');
              if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', { id, deleted: true, updatedAt: Date.now() });
            }
          } catch(e){}
        }

        setSelectedIds([]);
        localStorage.setItem('ERP_Customers_v104', JSON.stringify(updated));
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
        await deleteDoc(doc(db, "customers", String(id)));
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', { id, deleted: true, updatedAt: Date.now() });
        }
      } catch (err) {
        console.error("Firebase delete error:", err);
      }
    }
  };

  const filteredCustomers = customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).reverse();

  // Pagination Logic
  const totalPages = Math.ceil(filteredCustomers.length / rowsPerPage) || 1;
  const paginatedCustomers = filteredCustomers.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  return (
    <div className="animate-[fadeIn_0.3s_ease-in-out] max-w-full mx-auto pb-10">
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT SIDE: CLIENT FORM */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="font-black text-xs text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <span className="text-sm">{editingId ? '✏️' : '➕'}</span> {editingId ? 'Update Client Record' : 'Global Client'}
            </h3>
            {editingId && (
              <button 
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setFormData({ name: '', address: '', village: '', taluka: '', district: '', state: 'Gujarat', pincode: '', contacts: [{ person: '', mobile: '', type: 'Mobile', sameAsWhatsapp: true, whatsapp: '' }] });
                }}
                className="text-[10px] font-bold text-red-500 hover:underline cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Client Name / Firm *</label>
              <input 
                type="text" 
                name="name" 
                value={formData.name} 
                onChange={handleInputChange} 
                placeholder="Client Name or Firm Name" 
                className="pro-input text-xs py-2.5 font-bold" 
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Full Address / Location (Manual / Office)</label>
              <input 
                type="text" 
                name="address" 
                value={formData.address} 
                onChange={handleInputChange} 
                placeholder="e.g. MAMLATDAR KACHERI VISAVADAR" 
                className="pro-input text-xs py-2.5 font-medium" 
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Village / Area</label>
                <input 
                  type="text" 
                  name="village" 
                  value={formData.village} 
                  onChange={handleInputChange} 
                  placeholder="Village Name" 
                  className="pro-input text-xs py-2" 
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Taluka / Tehsil</label>
                <input 
                  type="text" 
                  name="taluka" 
                  value={formData.taluka} 
                  onChange={handleInputChange} 
                  placeholder="Taluka" 
                  className="pro-input text-xs py-2" 
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">District</label>
                <input 
                  type="text" 
                  name="district" 
                  value={formData.district} 
                  onChange={handleInputChange} 
                  placeholder="District" 
                  className="pro-input text-xs py-2" 
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">State</label>
                <input 
                  type="text" 
                  name="state" 
                  value={formData.state} 
                  onChange={handleInputChange} 
                  placeholder="State" 
                  className="pro-input text-xs py-2" 
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Pincode</label>
                <input 
                  type="text" 
                  name="pincode" 
                  value={formData.pincode} 
                  onChange={handleInputChange} 
                  placeholder="Pincode" 
                  className="pro-input text-xs py-2 font-mono" 
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase text-indigo-600 tracking-wider">Contact & Number Details</label>
                <button 
                  type="button" 
                  onClick={addContactField}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-black px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
                >
                  <span>➕ Add More</span>
                </button>
              </div>

              {formData.contacts.map((contact, index) => (
                <div key={index} className="flex flex-col gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-inner">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-7">
                      <input 
                        type="text" 
                        placeholder={`Contact Person ${index + 1}`} 
                        value={contact.person} 
                        onChange={(e) => handleInputChange(e, index, 'person')} 
                        className="pro-input text-[11px] py-1.5 px-2 bg-white" 
                      />
                    </div>
                    <div className="col-span-3">
                      <select 
                        value={contact.type} 
                        onChange={(e) => handleInputChange(e, index, 'type')}
                        className="pro-input text-[10px] font-bold py-1.5 px-1 bg-white text-slate-700"
                      >
                        <option value="Mobile">Mobile</option>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Both">Both</option>
                        <option value="Office">Office</option>
                      </select>
                    </div>
                    <div className="col-span-2 text-center">
                      {formData.contacts.length > 1 && (
                        <button 
                          type="button" 
                          onClick={() => removeContactField(index)}
                          className="text-red-500 hover:text-red-700 font-bold text-sm px-2 py-0.5 bg-white border border-red-200 rounded-lg shadow-sm cursor-pointer"
                          title="Remove"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-7">
                      <input 
                        type="text" 
                        placeholder="Mobile / Contact No" 
                        value={contact.mobile} 
                        onChange={(e) => handleInputChange(e, index, 'mobile')} 
                        className="pro-input text-[11px] py-1.5 px-2 bg-white font-mono font-bold" 
                      />
                    </div>
                    <div className="col-span-5 flex items-center justify-end gap-1.5">
                      <label className="text-[9px] font-bold text-emerald-700 flex items-center gap-1 cursor-pointer whitespace-nowrap bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                        <input 
                          type="checkbox" 
                          checked={contact.sameAsWhatsapp} 
                          onChange={(e) => handleInputChange(e, index, 'sameAsWhatsapp')} 
                          className="accent-emerald-600 w-3 h-3 cursor-pointer" 
                        /> Same WA
                      </label>
                    </div>
                  </div>

                  {!contact.sameAsWhatsapp && (
                    <div>
                      <input 
                        type="text" 
                        placeholder="Specific WhatsApp Number" 
                        value={contact.whatsapp} 
                        onChange={(e) => handleInputChange(e, index, 'whatsapp')} 
                        className="pro-input text-[11px] py-1.5 px-2 bg-white font-mono text-emerald-700 font-bold" 
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button 
              type="submit" 
              className={`w-full text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-md transition-all mt-3 active:scale-95 cursor-pointer ${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#00a67e] hover:bg-emerald-600'}`}
            >
              {editingId ? '🔄 Update Record' : '💾 Save To Directory'}
            </button>
          </form>
        </div>

        {/* RIGHT SIDE: DIRECTORY TABLE & MOBILE CARDS */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col min-h-[500px]">
          
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 border-b border-slate-100 pb-4 mb-4 relative">
            <h3 className="font-black text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              Directory <span className="text-[10px] text-slate-400 font-normal">(Click any row/card to edit)</span>
            </h3>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {/* Desktop Search */}
              <div className="hidden sm:block relative">
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search Client..." 
                  className="pro-input text-xs py-1.5 pl-3 pr-9 w-48 bg-slate-50" 
                />
                <svg className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>

              {/* Mobile Search Button */}
              <button type="button" onClick={() => setIsMobileSearchOpen(true)} className="sm:hidden bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl shadow-sm cursor-pointer flex items-center justify-center">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </button>

              <button type="button" className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-300 shadow-sm transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg> Import
              </button>
              <button 
                type="button"
                onClick={handleDeleteSelectedOrAll}
                className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold px-3 py-1.5 rounded-xl border border-red-200 shadow-sm transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> 
                {selectedIds.length > 0 ? `Delete (${selectedIds.length})` : 'Delete'}
              </button>
            </div>

            {/* Mobile Floating Full-Width Search Bar Overlay */}
            {isMobileSearchOpen && (
              <div className="absolute inset-0 bg-white px-3 flex items-center gap-3 z-50 sm:hidden shadow-sm w-full h-full">
                <div className="relative flex-1">
                  <input 
                    type="text" 
                    autoFocus 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    placeholder="Search Client..." 
                    className="pro-input w-full bg-slate-50 font-medium pl-3 pr-9 text-xs py-2" 
                  />
                  <svg className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <button type="button" onClick={() => setIsMobileSearchOpen(false)} className="text-slate-500 font-black text-2xl px-2 leading-none cursor-pointer">&times;</button>
              </div>
            )}
          </div>

          {/* Pagination & Count Header Tools */}
          <div className="flex flex-col sm:flex-row justify-between items-center py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl mb-3 gap-2 shrink-0">
            <span className="text-[10px] font-black uppercase text-slate-600 tracking-wider">
              Total <span className="font-mono text-indigo-600">{filteredCustomers.length}</span> Records Found
            </span>
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
              <button type="button" onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-2.5 py-1 rounded font-bold text-xs hover:bg-slate-100 disabled:opacity-30 text-slate-600 cursor-pointer">◀</button>
              <span className="text-[10px] font-black uppercase px-2 text-slate-500 whitespace-nowrap">Pg {currentPage}/{totalPages}</span>
              <button type="button" onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-2.5 py-1 rounded font-bold text-xs hover:bg-slate-100 disabled:opacity-30 text-slate-600 cursor-pointer">▶</button>
            </div>
          </div>

          {/* 🟢 DESKTOP TABLE VIEW (Visible on md and above) */}
          <div className="hidden md:block overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-3 w-10 text-center">
                    <input 
                      type="checkbox" 
                      onChange={handleSelectAll} 
                      checked={paginatedCustomers.length > 0 && selectedIds.length === paginatedCustomers.length} 
                      className="accent-[#00a67e] cursor-pointer" 
                    />
                  </th>
                  <th className="py-2.5 px-3">Client / Firm Name</th>
                  <th className="py-2.5 px-3">Address Details</th>
                  <th className="py-2.5 px-3">Contacts & Numbers</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {paginatedCustomers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-24 text-slate-400 font-medium italic">
                      No client records found in directory.
                    </td>
                  </tr>
                ) : (
                  paginatedCustomers.map(c => (
                    <tr 
                      key={c.id} 
                      onClick={() => handleEditClick(c)}
                      className={`hover:bg-emerald-50/50 cursor-pointer transition-colors ${editingId === c.id ? 'bg-amber-50/80 border-l-4 border-amber-500' : ''}`}
                      title="Click to edit record"
                    >
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(c.id)} 
                          onChange={(e) => handleSelectRow(e, c.id)} 
                          className="accent-[#00a67e] cursor-pointer" 
                        />
                      </td>
                      <td className="py-3 px-3 font-black text-slate-800">{c.name}</td>
                      <td className="py-3 px-3 text-slate-600 font-medium">
                        {c.address ? <div className="font-bold text-slate-900 mb-0.5">{c.address}</div> : null}
                        {c.village ? `${c.village}, ` : ''}{c.taluka ? `${c.taluka}, ` : ''}{c.district} {c.pincode ? `- ${c.pincode}` : ''}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700">
                        {(c.contacts || []).map((con, idx) => (
                          <div key={idx} className="text-[11px] mb-1 pb-1 border-b border-slate-50 last:border-0">
                            <span className="font-bold text-indigo-700">{con.person || 'Contact'}:</span> {con.mobile} <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-sans font-bold">({con.type})</span>
                            {!con.sameAsWhatsapp && con.whatsapp && (
                              <div className="text-[10px] text-emerald-600 font-bold">🟢 WA: {con.whatsapp}</div>
                            )}
                          </div>
                        ))}
                      </td>
                      <td className="py-3 px-3 text-center" onClick={(e) => handleDeleteSingle(e, c.id)}>
                        <button 
                          type="button"
                          className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-lg transition-colors font-bold text-xs cursor-pointer"
                          title="Delete Record"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 🟢 MOBILE CARD VIEW */}
          <div className="block md:hidden flex-1 space-y-3 pt-2">
            {paginatedCustomers.length === 0 ? (
              <div className="text-center py-20 text-slate-400 font-medium italic text-xs">
                No client records found in directory.
              </div>
            ) : (
              paginatedCustomers.map(c => (
                <div 
                  key={c.id}
                  onClick={() => handleEditClick(c)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer shadow-sm flex flex-col gap-2.5 bg-white ${editingId === c.id ? 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-400/30' : 'border-slate-200 hover:border-emerald-400'}`}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2.5">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(c.id)} 
                        onChange={(e) => handleSelectRow(e, c.id)} 
                        onClick={(e) => e.stopPropagation()}
                        className="accent-[#00a67e] w-4 h-4 cursor-pointer" 
                      />
                      <span className="font-black text-slate-900 text-sm uppercase">{c.name}</span>
                    </div>
                    <button 
                      type="button"
                      onClick={(e) => handleDeleteSingle(e, c.id)}
                      className="text-red-500 hover:text-red-700 bg-red-50 p-1.5 rounded-lg text-xs font-bold"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>

                  {c.address && (
                    <div className="text-xs text-slate-700 font-bold bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                      🏢 {c.address}
                    </div>
                  )}

                  <div className="text-xs text-slate-600 font-medium grid grid-cols-2 gap-x-2 gap-y-1 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
                    <div><span className="text-[10px] font-bold text-slate-400 uppercase block">Village / Area:</span> {c.village || '—'}</div>
                    <div><span className="text-[10px] font-bold text-slate-400 uppercase block">Taluka:</span> {c.taluka || '—'}</div>
                    <div><span className="text-[10px] font-bold text-slate-400 uppercase block">District:</span> {c.district || '—'}</div>
                    <div><span className="text-[10px] font-bold text-slate-400 uppercase block">State / Pin:</span> {c.state || 'Gujarat'} {c.pincode ? `- ${c.pincode}` : ''}</div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider block">Contacts:</span>
                    {(c.contacts || []).map((con, idx) => (
                      <div key={idx} className="bg-indigo-50/40 p-2 rounded-lg border border-indigo-100/50 flex flex-col gap-0.5 text-xs font-mono text-slate-700">
                        <div className="flex justify-between items-center">
                          <span className="font-black text-indigo-900">{con.person || `Contact ${idx + 1}`}</span>
                          <span className="text-[9px] bg-white px-2 py-0.5 rounded text-slate-600 font-sans font-extrabold border border-indigo-100">{con.type}</span>
                        </div>
                        <div className="font-bold text-slate-900 text-sm tracking-wide">{con.mobile}</div>
                        {!con.sameAsWhatsapp && con.whatsapp && (
                          <div className="text-[10px] text-emerald-700 font-bold">🟢 WhatsApp: {con.whatsapp}</div>
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
            <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm mt-4 md:hidden shrink-0">
              <button type="button" onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-lg border border-slate-300 cursor-pointer">Previous</button>
              <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Page {currentPage} of {totalPages}</span>
              <button type="button" onClick={() => setCurrentPage(prev => Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-lg border border-slate-300 cursor-pointer">Next</button>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}