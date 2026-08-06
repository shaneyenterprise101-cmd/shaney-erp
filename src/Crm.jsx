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

// 🟢 1-by-1 Safe Sequential Rate Limiter: Exactly 1 item per 1 second with progress callback
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

// 🟢 Safe Helper for non-progress batch tasks
const processInBatches = async (items, batchSize = 1, delayMs = 1000, asyncTaskCallback) => {
  let results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(item => asyncTaskCallback(item)));
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return results;
};

// 🟢 Bulletproof Data Sanitizer with Timestamp Fallback
const sanitizeForCloud = (dataObj) => {
  let cleaned = { ...dataObj };
  if (!cleaned.updatedAt) {
    cleaned.updatedAt = Date.now();
  }
  Object.keys(cleaned).forEach(key => {
    if (cleaned[key] === undefined) {
      cleaned[key] = null;
    }
  });
  return cleaned;
};

export default function Crm({ selectedFY }) {
  const parseSafeDate = (dateStr) => {
    if (!dateStr) return null;
    if (typeof dateStr !== 'string') return new Date(dateStr);
    
    let clean = String(dateStr).trim();
    if (clean.includes('/')) clean = clean.replace(/\//g, '-');

    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
          return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        }
      }
    }
    return new Date(dateStr);
  };

  const [crmData, setCrmData] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_CRM_v9');
      let initialCrm = saved ? JSON.parse(saved) : [];
      return initialCrm.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
    } catch (e) {
      return [];
    }
  });

  const [staffList, setStaffList] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_StaffList');
      return saved ? JSON.parse(saved) : ['NAVNIT', 'KISHOR'];
    } catch (e) {
      return ['NAVNIT', 'KISHOR'];
    }
  });

  const [searchQuery, setSearchQuery] = useState('');
  
  // 🟢 Read Preset Filter safely on load (from Dashboard Action Center click)
  const [filtReminderDate, setFiltReminderDate] = useState(() => {
    const preset = localStorage.getItem('CRM_PRESET_FILTER');
    if (preset) {
      localStorage.removeItem('CRM_PRESET_FILTER');
      return preset;
    }
    return 'ALL';
  });

  const [filtDistrict, setFiltDistrict] = useState('ALL');
  const [filtTaluka, setFiltTaluka] = useState('ALL');
  const [filtCluster, setFiltCluster] = useState('ALL');
  const [filtStatus, setFiltStatus] = useState('ALL');
  const [filtStaff, setFiltStaff] = useState('ALL');

  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [activeCardStatusDropdown, setActiveCardStatusDropdown] = useState(null);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStaff, setBulkStaff] = useState('');

  const [addForm, setAddForm] = useState({
    name: '', district: '', taluka: '', cluster: '', p1: '', m1: '', p2: '', m2: ''
  });

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({ id: '', name: '', district: '', taluka: '', cluster: '', p1: '', m1: '', p2: '', m2: '' });

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [activeNoteRecord, setActiveNoteRecord] = useState(null);
  const [noteText, setNoteText] = useState('');

  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waTarget, setWaTarget] = useState({ id: '', name1: '', phone1: '', name2: '', phone2: '' });

  const [callModalOpen, setCallModalOpen] = useState(false);
  const [callTarget, setCallTarget] = useState({ id: '', name1: '', phone1: '', name2: '', phone2: '' });

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [rawExcelRows, setRawExcelRows] = useState([]);
  const [previewColumns, setPreviewColumns] = useState([]);

  // 🟢 Fetch Cloud Data for CRM Leads
  useEffect(() => {
    const fetchCrmFromCloud = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/data`);
        if (res.ok) {
          const allData = await res.json();
          if (allData && typeof allData === 'object') {
            let cloudCrm = [];
            if (Array.isArray(allData)) {
              cloudCrm = allData.filter(item => item.docType === 'crm');
            } else if (allData.crm_leads && Array.isArray(allData.crm_leads)) {
              cloudCrm = allData.crm_leads;
            } else if (allData.payload) {
              try {
                const parsed = JSON.parse(allData.payload);
                if (parsed.crm_leads) cloudCrm = parsed.crm_leads;
              } catch(e){}
            }
            if (cloudCrm.length > 0) {
              cloudCrm = cloudCrm.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
              setCrmData(cloudCrm);
              localStorage.setItem('ERP_CRM_v9', JSON.stringify(cloudCrm));
            }
          }
        }
      } catch (err) {
        console.error("Error fetching CRM from AWS backend:", err);
      }
    };

    fetchCrmFromCloud();

    const handleDataUpdated = (e) => {
      if (!e.detail || e.detail.type === 'crm') {
        try {
          const saved = localStorage.getItem('ERP_CRM_v9');
          if (saved) {
            let parsedData = JSON.parse(saved);
            setCrmData(parsedData.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item)));
          }
        } catch (e) {}
      }
    };

    window.addEventListener('ERP_DATA_UPDATED', handleDataUpdated);
    return () => {
      window.removeEventListener('ERP_DATA_UPDATED', handleDataUpdated);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('ERP_CRM_v9', JSON.stringify(crmData));
  }, [crmData]);

  useEffect(() => {
    const handleStorage = () => {
      try {
        const savedStaff = localStorage.getItem('ERP_StaffList');
        if (savedStaff) setStaffList(JSON.parse(savedStaff));
      } catch (e) {}
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // 🟢 Build list including dynamic ERP Certificate Overdues on-the-fly when OVERDUE filter is active
  let activeRecordsList = [...crmData];
  if (filtReminderDate === 'OVERDUE') {
    try {
      const history = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
      const todayTime = new Date().setHours(0, 0, 0, 0);

      history.forEach(b => {
        if (b.docType === 'certificate' && !b.reminderDone && b.validDate) {
          const vDateObj = parseSafeDate(b.validDate);
          if (vDateObj && !isNaN(vDateObj.getTime())) {
            vDateObj.setHours(0, 0, 0, 0);
            if (vDateObj.getTime() < todayTime) {
              const exists = activeRecordsList.find(c => c.name && b.party && c.name.toLowerCase() === b.party.toLowerCase() && c.isErpOverdue);
              if (!exists) {
                activeRecordsList.push({
                  id: 'erp_overdue_' + b.id,
                  docType: 'crm',
                  name: b.party,
                  district: b.district || 'OVERDUE',
                  taluka: 'Certificate Expired',
                  cluster: '',
                  p1: 'Owner/Auth',
                  m1: b.partyNum || b.contact || '',
                  p2: '',
                  m2: '',
                  status: 'Overdue Reminder',
                  staff: '',
                  reminderDate: b.validDate,
                  isErpOverdue: true,
                  updatedAt: Date.now()
                });
              }
            }
          }
        }
      });
    } catch (e) {}
  }

  const districts = Array.from(new Set(crmData.map(c => c.district).filter(d => d && d !== 'OVERDUE'))).sort();
  const talukas = Array.from(new Set(
    crmData.filter(c => filtDistrict === 'ALL' || c.district?.toUpperCase() === filtDistrict.toUpperCase())
         .map(c => c.taluka).filter(t => t && t !== 'Certificate Expired')
  )).sort();
  const clusters = Array.from(new Set(
    crmData.filter(c => (filtDistrict === 'ALL' || c.district?.toUpperCase() === filtDistrict.toUpperCase()) &&
                        (filtTaluka === 'ALL' || c.taluka?.toUpperCase() === filtTaluka.toUpperCase()))
         .map(c => c.cluster).filter(Boolean)
  )).sort();

  const filteredLeads = activeRecordsList.filter(c => {
    const distMatch = filtDistrict === 'ALL' || (c.district || '').toUpperCase() === filtDistrict.toUpperCase();
    const talMatch = filtTaluka === 'ALL' || (c.taluka || '').toUpperCase() === filtTaluka.toUpperCase();
    const clusterMatch = filtCluster === 'ALL' || (c.cluster || '').toUpperCase() === filtCluster.toUpperCase();
    const statusMatch = filtStatus === 'ALL' || (c.status || '').toUpperCase() === filtStatus.toUpperCase();
    
    let staffMatch = true;
    if (filtStaff === 'UNASSIGNED') {
      staffMatch = !c.staff || c.staff === 'Unassigned' || c.staff === '';
    } else if (filtStaff !== 'ALL') {
      staffMatch = (c.staff || '') === filtStaff;
    }

    const searchMatch = !searchQuery || 
      (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.m1 || '').includes(searchQuery) || 
      (c.m2 || '').includes(searchQuery);

    let dateMatch = true;
    if (filtReminderDate !== 'ALL') {
      if (filtReminderDate === 'OVERDUE') {
        if (c.isErpOverdue) {
          dateMatch = true;
        } else if (!c.reminderDate) {
          dateMatch = false;
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const rDate = parseSafeDate(c.reminderDate);
          if (!rDate || isNaN(rDate.getTime())) {
            dateMatch = false;
          } else {
            rDate.setHours(0, 0, 0, 0);
            dateMatch = rDate.getTime() < today.getTime();
          }
        }
      } else {
        if (c.isErpOverdue) {
          dateMatch = false;
        } else if (!c.reminderDate) {
          dateMatch = false;
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const rDate = parseSafeDate(c.reminderDate);
          
          if (!rDate || isNaN(rDate.getTime())) {
            dateMatch = false;
          } else {
            rDate.setHours(0, 0, 0, 0);
            if (filtReminderDate === 'TODAY') dateMatch = rDate.getTime() === today.getTime();
            else if (filtReminderDate === 'UPCOMING') dateMatch = rDate.getTime() > today.getTime();
          }
        }
      }
    }

    return distMatch && talMatch && clusterMatch && statusMatch && staffMatch && searchMatch && dateMatch;
  }).reverse();

  const totalPages = Math.ceil(filteredLeads.length / rowsPerPage) || 1;
  const paginatedLeads = filteredLeads.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const handleSaveNew = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim()) return alert('Customer Name is mandatory!');

    const cleanName = String(addForm.name).trim().toLowerCase();
    const cleanM1 = String(addForm.m1 || '').replace(/\D/g, '');
    const cleanM2 = String(addForm.m2 || '').replace(/\D/g, '');

    const isExactDuplicate = crmData.some(c => {
      const existingName = String(c.name || '').trim().toLowerCase();
      const existingM1 = String(c.m1 || '').replace(/\D/g, '');
      const existingM2 = String(c.m2 || '').replace(/\D/g, '');
      return existingName === cleanName && 
             ((cleanM1 && (cleanM1 === existingM1 || cleanM1 === existingM2)) || 
              (cleanM2 && (cleanM2 === existingM1 || cleanM2 === existingM2)));
    });

    if (isExactDuplicate) {
      alert('❌ Duplicate Entry Found! This exact school name and mobile number already exists in CRM.');
      return;
    }

    const finalDistrict = addForm.district.trim() || (filtDistrict !== 'ALL' ? filtDistrict : '');
    const finalTaluka = addForm.taluka.trim() || (filtTaluka !== 'ALL' ? filtTaluka : '');
    const finalCluster = addForm.cluster.trim() || (filtCluster !== 'ALL' ? filtCluster : '');

    const leadId = 'crm_' + Date.now();
    const currentTimestamp = Date.now();

    const newLead = sanitizeForCloud({
      id: leadId,
      docType: 'crm',
      name: addForm.name.trim(),
      district: finalDistrict,
      taluka: finalTaluka,
      cluster: finalCluster,
      p1: addForm.p1.trim(),
      m1: addForm.m1.trim(),
      p2: addForm.p2.trim(),
      m2: addForm.m2.trim(),
      status: 'New',
      staff: '',
      reminderDate: '',
      updatedAt: currentTimestamp
    });

    const updatedCrm = [...crmData, newLead];
    setCrmData(updatedCrm);
    setAddForm({ name: '', district: '', taluka: '', cluster: '', p1: '', m1: '', p2: '', m2: '' });

    try {
      await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'crm_leads', id: String(leadId), data: newLead })
      });
      // 🟢 PERMANENT SECURITY CACHING: Save locally so it never hits the server again
      localStorage.setItem(`shaney_crm_${leadId}`, JSON.stringify(newLead));
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', newLead);
      }
    } catch (err) {
      console.error("AWS save lead error:", err);
    }

    logActionToBackend(`Added CRM Lead: ${newLead.name}`);
    alert('✅ Lead Added Successfully!');
  };

  const handleStatusChange = async (id, newStatus) => {
    const lead = crmData.find(c => c.id === id);
    if (!lead) return;

    const oldStatus = lead.status;
    const currentTimestamp = Date.now();
    const updatedLead = sanitizeForCloud({ ...lead, status: newStatus, updatedAt: currentTimestamp });

    const updatedCrm = crmData.map(c => c.id === id ? updatedLead : c);
    setCrmData(updatedCrm);

    try {
      await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'crm_leads', id: String(id), data: updatedLead })
      });
      // 🟢 PERMANENT SECURITY CACHING
      localStorage.setItem(`shaney_crm_${id}`, JSON.stringify(updatedLead));
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', updatedLead);
      }
    } catch (err) {
      console.error("AWS status update error:", err);
    }

    logActionToBackend(`Updated CRM status for ${lead.name} to ${newStatus}`);

    try {
      let customers = [];
      const savedCusts = localStorage.getItem('ERP_Customers_v104');
      if (savedCusts) {
        customers = JSON.parse(savedCusts);
      }

      const origName = lead.name || '';
      const companyName = "SMC " + origName;
      
      let village = lead.cluster || origName.replace(/PRA\s+SHALA|PAY\s+CENTRE\s+SHALA/gi, '').trim();
      if (!village) village = origName;

      const taluka = lead.taluka || '';
      const district = lead.district || '';

      let contactsArr = [];
      if (lead.p1 || lead.m1) {
        contactsArr.push({ person: lead.p1 || '', mobile: lead.m1 || '', type: 'Mobile', sameAsWhatsapp: true, whatsapp: lead.m1 || '' });
      }
      if (lead.p2 || lead.m2) {
        contactsArr.push({ person: lead.p2 || '', mobile: lead.m2 || '', type: 'Mobile', sameAsWhatsapp: true, whatsapp: lead.m2 || '' });
      }
      if (contactsArr.length === 0) {
        contactsArr.push({ person: '', mobile: '', type: 'Mobile', sameAsWhatsapp: true, whatsapp: '' });
      }

      if (newStatus.toLowerCase() === 'closed') {
        const existingIndex = customers.findIndex(cust => cust.id === lead.id || (cust.name && cust.name.toLowerCase() === companyName.toLowerCase()));

        const customerObj = sanitizeForCloud({
          id: lead.id,
          docType: 'customer',
          name: companyName,
          address: "",
          village: village,
          taluka: taluka,
          district: district,
          state: 'Gujarat',
          pincode: '',
          contacts: contactsArr,
          contactPerson1: lead.p1 || '',
          contact: lead.m1 || '',
          contactPerson2: lead.p2 || '',
          mobile2: lead.m2 || '',
          updatedAt: currentTimestamp
        });

        if (existingIndex !== -1) {
          customers[existingIndex] = customerObj;
        } else {
          customers.push(customerObj);
        }

        localStorage.setItem('ERP_Customers_v104', JSON.stringify(customers));
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'customers', id: String(lead.id), data: customerObj })
        });
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', customerObj);
        }

        alert(`🎉 Lead Closed! Added to Directory as "${companyName}".`);
      } else if (oldStatus && oldStatus.toLowerCase() === 'closed' && newStatus.toLowerCase() !== 'closed') {
        customers = customers.filter(cust => cust.id !== lead.id && cust.name.toLowerCase() !== companyName.toLowerCase());
        localStorage.setItem('ERP_Customers_v104', JSON.stringify(customers));
        try { 
          await fetch(`${BACKEND_URL}/api/data/${lead.id}`, { method: 'DELETE' });
          localStorage.removeItem(`shaney_crm_${lead.id}`);
          if (window.require) {
            const { ipcRenderer } = window.require('electron');
            if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', { id: lead.id, deleted: true, updatedAt: Date.now() });
          }
        } catch(e){}
        alert(`ℹ️ Status changed from Closed. Removed from Customer Directory.`);
      }
    } catch (err) {
      console.error('Directory Sync Error:', err);
    }
  };

  const handleDateChange = async (id, newDate) => {
    const currentTimestamp = Date.now();
    const updatedCrm = crmData.map(c => c.id === id ? { ...c, reminderDate: newDate, updatedAt: currentTimestamp } : c);
    setCrmData(updatedCrm);
    const updatedLead = sanitizeForCloud(updatedCrm.find(c => c.id === id));
    try {
      await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'crm_leads', id: String(id), data: updatedLead })
      });
      localStorage.setItem(`shaney_crm_${id}`, JSON.stringify(updatedLead));
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', updatedLead);
      }
    } catch (e) {
      console.error("AWS date change error:", e);
    }
  };

  const handleDeleteLead = async (id, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (confirm('Are you sure you want to delete this lead?')) {
      const lead = crmData.find(c => c.id === id);
      setCrmData(crmData.filter(c => c.id !== id));
      setSelectedIds(selectedIds.filter(i => i !== id));

      try {
        await fetch(`${BACKEND_URL}/api/data/${id}`, { method: 'DELETE' });
        localStorage.removeItem(`shaney_crm_${id}`);
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', { id, deleted: true, updatedAt: Date.now() });
        }
      } catch (err) {
        console.error("AWS delete lead error:", err);
      }

      logActionToBackend(`Deleted CRM Lead Record: ${lead ? lead.name : id}`);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return alert('Please select at least one lead!');
    if (confirm('Delete ' + selectedIds.length + ' selected leads?')) {
      setCrmData(crmData.filter(c => !selectedIds.includes(c.id)));
      
      await processInBatches(selectedIds, 1, 1000, async (id) => {
        try { 
          await fetch(`${BACKEND_URL}/api/data/${id}`, { method: 'DELETE' });
          localStorage.removeItem(`shaney_crm_${id}`);
          if (window.require) {
            const { ipcRenderer } = window.require('electron');
            if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', { id, deleted: true, updatedAt: Date.now() });
          }
        } catch(e){}
      });

      setSelectedIds([]);
      logActionToBackend(`Deleted multiple CRM leads`);
    }
  };

  const handleBulkAssign = async () => {
    if (selectedIds.length === 0 || !bulkStaff) return alert('Select leads and target staff member first!');
    const currentTimestamp = Date.now();
    const updatedCrm = crmData.map(c => selectedIds.includes(c.id) ? { ...c, staff: bulkStaff === 'UNASSIGNED' ? '' : bulkStaff, updatedAt: currentTimestamp } : c);
    setCrmData(updatedCrm);

    await processInBatches(selectedIds, 1, 1000, async (id) => {
      const l = sanitizeForCloud(updatedCrm.find(c => c.id === id));
      try { 
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'crm_leads', id: String(id), data: l })
        });
        localStorage.setItem(`shaney_crm_${id}`, JSON.stringify(l));
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', l);
        }
      } catch(e){}
    });

    setSelectedIds([]);
    setBulkStaff('');
    logActionToBackend(`Assigned multiple CRM leads to ${bulkStaff}`);
    alert('✅ Bulk Assignment Updated!');
  };

  const openEditModal = (c, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setEditForm({
      id: c.id,
      name: c.name || '',
      district: c.district || '',
      taluka: c.taluka || '',
      cluster: c.cluster || '',
      p1: c.p1 || '',
      m1: c.m1 || '',
      p2: c.p2 || '',
      m2: c.m2 || ''
    });
    setEditModalOpen(true);
  };

  const saveCrmEditRecord = async () => {
    if (!editForm.name.trim()) return alert('Customer Name mandatory!');
    const currentTimestamp = Date.now();
    const updatedCrm = crmData.map(c => c.id === editForm.id ? {
      ...c,
      name: editForm.name.trim(),
      district: editForm.district.trim(),
      taluka: editForm.taluka.trim(),
      cluster: editForm.cluster.trim(),
      p1: editForm.p1.trim(),
      m1: editForm.m1.trim(),
      p2: editForm.p2.trim(),
      m2: editForm.m2.trim(),
      updatedAt: currentTimestamp
    } : c);
    setCrmData(updatedCrm);
    setEditModalOpen(false);

    const editedLead = sanitizeForCloud(updatedCrm.find(c => c.id === editForm.id));
    try {
      await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'crm_leads', id: String(editForm.id), data: editedLead })
      });
      localStorage.setItem(`shaney_crm_${editForm.id}`, JSON.stringify(editedLead));
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', editedLead);
      }
    } catch (e) {
      console.error("AWS edit lead error:", e);
    }

    logActionToBackend(`Updated CRM Lead: ${editForm.name}`);
    alert('✅ Lead Updated Successfully!');
  };

  const openWhatsAppModal = (c, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setWaTarget({
      id: c.id,
      name1: c.p1 || 'Contact 1',
      phone1: c.m1 || '',
      name2: c.p2 || 'Contact 2',
      phone2: c.m2 || ''
    });
    setWaModalOpen(true);
  };

  const triggerWhatsApp = async (phone, contactNumKey, recordId) => {
    if (!phone) return alert('No phone number available!');
    const cleanPhone = String(phone).replace(/\D/g, '');
    if (!cleanPhone) return;

    let targetId = recordId || waTarget.id;
    let foundLead = crmData.find(c => c.id === targetId) || crmData.find(c => String(c.m1).replace(/\D/g, '') === cleanPhone || String(c.m2).replace(/\D/g, '') === cleanPhone);

    let companyName = "UNKNOWN CUSTOMER";
    let contactLabel = "CONTACT";

    if (foundLead) {
      companyName = foundLead.name ? String(foundLead.name).toUpperCase() : "UNKNOWN CUSTOMER";
      const isM2 = (contactNumKey === 'm2') || (String(foundLead.m2).replace(/\D/g, '') === cleanPhone);
      if (isM2) {
        let p2Name = foundLead.p2 ? String(foundLead.p2).trim().toUpperCase() : '';
        contactLabel = p2Name ? `${p2Name} (CONTACT 2)` : 'CONTACT 2';
        contactNumKey = 'm2';
      } else {
        let p1Name = foundLead.p1 ? String(foundLead.p1).trim().toUpperCase() : '';
        contactLabel = p1Name ? `${p1Name} (CONTACT 1)` : 'CONTACT 1';
        contactNumKey = 'm1';
      }

      const currentTimestamp = Date.now();
      const updatedCrm = crmData.map(c => {
        if (c.id === foundLead.id) {
          const counts = c.whatsappCounts || { m1: 0, m2: 0 };
          if (contactNumKey === 'm1') counts.m1 = (counts.m1 || 0) + 1;
          if (contactNumKey === 'm2') counts.m2 = (counts.m2 || 0) + 1;
          return { ...c, whatsappSent: true, whatsappCounts: counts, status: c.status === 'New' ? 'WASent' : c.status, updatedAt: currentTimestamp };
        }
        return c;
      });

      setCrmData(updatedCrm);
      const updatedLead = sanitizeForCloud(updatedCrm.find(c => c.id === foundLead.id));
      try {
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'crm_leads', id: String(foundLead.id), data: updatedLead })
        });
        localStorage.setItem(`shaney_crm_${foundLead.id}`, JSON.stringify(updatedLead));
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', updatedLead);
        }
      } catch (e) {
        console.error("AWS WA update error:", e);
      }
    } else {
      contactLabel = contactNumKey === 'm2' ? 'CONTACT 2' : 'CONTACT 1';
    }

    logActionToBackend(`SENT CRM WHATSAPP MESSAGE TO ${companyName} -> ${contactLabel}`);
    
    setTimeout(() => {
      window.open('https://wa.me/91' + cleanPhone, '_blank');
    }, 1000);

    setWaModalOpen(false);
  };

  const triggerCall = async (phone, contactNumKey, recordId) => {
    if (!phone) return alert('No phone number available!');
    const cleanPhone = String(phone).replace(/\D/g, '');
    if (!cleanPhone) return;

    let targetId = recordId || callTarget.id;
    let foundLead = crmData.find(c => c.id === targetId) || crmData.find(c => String(c.m1).replace(/\D/g, '') === cleanPhone || String(c.m2).replace(/\D/g, '') === cleanPhone);

    let companyName = "UNKNOWN CUSTOMER";
    let contactLabel = "CONTACT";

    if (foundLead) {
      companyName = foundLead.name ? String(foundLead.name).toUpperCase() : "UNKNOWN CUSTOMER";
      const isM2 = (contactNumKey === 'm2') || (String(foundLead.m2).replace(/\D/g, '') === cleanPhone);
      if (isM2) {
        let p2Name = foundLead.p2 ? String(foundLead.p2).trim().toUpperCase() : '';
        contactLabel = p2Name ? `${p2Name} (CONTACT 2)` : 'CONTACT 2';
        contactNumKey = 'm2';
      } else {
        let p1Name = foundLead.p1 ? String(foundLead.p1).trim().toUpperCase() : '';
        contactLabel = p1Name ? `${p1Name} (CONTACT 1)` : 'CONTACT 1';
        contactNumKey = 'm1';
      }

      const currentTimestamp = Date.now();
      const updatedCrm = crmData.map(c => {
        if (c.id === foundLead.id) {
          const counts = c.callCounts || { m1: 0, m2: 0 };
          if (contactNumKey === 'm1') counts.m1 = (counts.m1 || 0) + 1;
          if (contactNumKey === 'm2') counts.m2 = (counts.m2 || 0) + 1;
          return { ...c, callCounts: counts, updatedAt: currentTimestamp };
        }
        return c;
      });

      setCrmData(updatedCrm);
      const updatedLead = sanitizeForCloud(updatedCrm.find(c => c.id === foundLead.id));
      try {
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'crm_leads', id: String(foundLead.id), data: updatedLead })
        });
        localStorage.setItem(`shaney_crm_${foundLead.id}`, JSON.stringify(updatedLead));
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', updatedLead);
        }
      } catch (e) {
        console.error("AWS call update error:", e);
      }
    } else {
      contactLabel = contactNumKey === 'm2' ? 'CONTACT 2' : 'CONTACT 1';
    }

    logActionToBackend(`MADE CRM PHONE CALL TO ${companyName} -> ${contactLabel}`);
    window.open('tel:' + cleanPhone, '_self');
  };

  const openNoteModal = (c, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setActiveNoteRecord(c);
    setNoteText(c.note || '');
    setNoteModalOpen(true);
  };

  const saveNote = async () => {
    if (!activeNoteRecord) return;
    const currentTimestamp = Date.now();
    const updatedCrm = crmData.map(c => c.id === activeNoteRecord.id ? { ...c, note: noteText, updatedAt: currentTimestamp } : c);
    setCrmData(updatedCrm);
    setNoteModalOpen(false);

    const updatedLead = sanitizeForCloud(updatedCrm.find(c => c.id === activeNoteRecord.id));
    try {
      await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'crm_leads', id: String(activeNoteRecord.id), data: updatedLead })
      });
      localStorage.setItem(`shaney_crm_${activeNoteRecord.id}`, JSON.stringify(updatedLead));
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', updatedLead);
      }
    } catch (e) {
      console.error("AWS note error:", e);
    }

    logActionToBackend(`Added discussion note for CRM lead: ${activeNoteRecord.name}`);
    alert('✅ Note Saved!');
  };

  const handleExcelFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        
        if (rows.length === 0) {
          alert('⚠️ The selected Excel file is empty!');
          return;
        }

        setPreviewColumns(Object.keys(rows[0]));
        setRawExcelRows(rows);
        setPreviewModalOpen(true);
      } catch (err) {
        alert('❌ Failed to read Excel file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const confirmExcelImport = async () => {
    try {
      setIsImporting(true);
      setImportProgress({ current: 0, total: rawExcelRows.length });

      let count = 0;
      let skippedCount = 0;
      let newBatch = [...crmData];
      const currentTimestamp = Date.now();

      let leadsToUpload = [];

      for (let idx = 0; idx < rawExcelRows.length; idx++) {
        let row = rawExcelRows[idx];
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

        const district = findVal(['district', 'District']);
        const taluka = findVal(['taluka', 'Taluka']);
        const cluster = findVal(['paycentrename', 'pay centre name', 'cluster', 'Cluster', 'Pay Centre']);
        const name = findVal(['customercompanyname', 'customer company name', 'customer/company name', 'name', 'Name', 'Customer', 'School']);
        const p1 = findVal(['contactperson1', 'contact person 1', 'p1', 'Contact1']);
        const m1 = findVal(['mobileno1', 'mobile no 1', 'm1', 'Mobile1', 'Phone']);
        const p2 = findVal(['contactperson2', 'contact person 2', 'p2', 'Contact2']);
        const m2 = findVal(['mobileno2', 'mobile no 2', 'm2', 'Mobile2']);

        if (name) {
          const cleanName = String(name).trim().toLowerCase();
          const cleanM1 = String(m1).replace(/\D/g, '');
          const cleanM2 = String(m2).replace(/\D/g, '');

          const isExactDuplicate = newBatch.some(c => {
            const existingName = String(c.name || '').trim().toLowerCase();
            const existingM1 = String(c.m1 || '').replace(/\D/g, '');
            const existingM2 = String(c.m2 || '').replace(/\D/g, '');
            return existingName === cleanName && 
                   ((cleanM1 && (cleanM1 === existingM1 || cleanM1 === existingM2)) || 
                    (cleanM2 && (cleanM2 === existingM1 || cleanM2 === existingM2)));
          });

          if (isExactDuplicate) {
            skippedCount++;
            continue;
          }

          const leadId = 'crm_ex_' + Date.now() + '_' + idx;
          const leadObj = sanitizeForCloud({
            id: leadId,
            docType: 'crm',
            name: String(name).trim(),
            district: String(district).trim(),
            taluka: String(taluka).trim(),
            cluster: String(cluster).trim(),
            p1: String(p1).trim(),
            m1: String(m1).trim(),
            p2: String(p2).trim(),
            m2: String(m2).trim(),
            status: 'New',
            staff: '',
            reminderDate: '',
            updatedAt: currentTimestamp
          });
          newBatch.push(leadObj);
          leadsToUpload.push(leadObj);
          count++;
        }
      }

      await processInBatchesWithProgress(leadsToUpload, 1, 1000, async (leadObj) => {
        try { 
          await fetch(`${BACKEND_URL}/api/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'crm_leads', id: String(leadObj.id), data: leadObj })
          });
          localStorage.setItem(`shaney_crm_${leadObj.id}`, JSON.stringify(leadObj));
          if (window.require) {
            const { ipcRenderer } = window.require('electron');
            if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', leadObj);
          }
        } catch(e){}
      }, (current, total) => {
        setImportProgress({ current, total });
      });

      setCrmData(newBatch);
      setPreviewModalOpen(false);
      setIsImporting(false);
      logActionToBackend(`Imported ${count} CRM leads via Excel (Skipped ${skippedCount} exact duplicates)`);
      alert(`✅ Successfully imported ${count} leads to Cloud & Local! (${skippedCount} exact duplicate entries skipped).`);
    } catch (err) {
      setIsImporting(false);
      alert('❌ Import failed: ' + err.message);
    }
  };

  return (
    <div id="tab-crm" className="tab-content active h-[calc(100vh-65px)] w-full relative bg-slate-100 overflow-hidden animate-[fadeIn_0.3s_ease-in-out]">
      
      {/* 🟢 SPINNING LOADER & LIVE CLOUD COUNTER SCREEN */}
      {isImporting && (
        <div className="fixed inset-0 bg-slate-950/80 z-[999999] flex flex-col items-center justify-center backdrop-blur-md">
          <div className="w-16 h-16 border-4 border-[#00a67e] border-t-transparent rounded-full animate-spin mb-4"></div>
          <h2 className="text-white font-black text-lg uppercase tracking-widest">Uploading to Cloud (1 by 1)...</h2>
          <p className="text-[#00a67e] text-sm font-black mt-2 font-mono bg-emerald-950/80 px-4 py-2 rounded-xl border border-emerald-500/30">
            Cloud Files Uploaded: {importProgress.current} / {importProgress.total}
          </p>
          <p className="text-slate-400 text-xs font-bold mt-2">Please do not close this window while safe syncing is active.</p>
        </div>
      )}

      <div className="flex flex-row w-full h-full relative">

        {isMobileMenuOpen && (
          <div className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
        )}

        {/* SIDEBAR */}
        <div className={`absolute lg:relative inset-y-0 left-0 w-80 bg-white shadow-2xl z-50 flex flex-col h-full border-r border-slate-200 transition-transform duration-300 shrink-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
          
          <div className="p-4 flex justify-between items-center border-b lg:hidden bg-slate-50 shrink-0">
            <h2 className="font-black text-lg text-[#00a67e] flex items-center gap-2">
              <svg className="w-5 h-5 text-[#00a67e]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
              MENU &amp; FILTERS
            </h2>
            <button type="button" onClick={() => setIsMobileMenuOpen(false)} className="text-red-500 font-black text-3xl leading-none cursor-pointer">&times;</button>
          </div>

          <div className="p-4 xl:p-5 overflow-y-auto flex-1 custom-scrollbar">
            
            <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 mb-6 shadow-sm">
              <label className="flex items-center gap-2 text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-3">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                WORKSPACE
              </label>
              <select value={filtStaff} onChange={(e) => setFiltStaff(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg px-3 py-2.5 outline-none cursor-pointer shadow-sm">
                <option value="ALL">All Staff (Admin View)</option>
                <option value="UNASSIGNED">Unassigned Leads</option>
                {staffList.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <h3 className="font-black text-xs text-slate-800 uppercase mb-4 flex items-center gap-2 tracking-widest">
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              Filters
            </h3>
            
            <div className="flex flex-col gap-3 mb-6">
              
              <div className="relative">
                <div onClick={() => { setDateDropdownOpen(!dateDropdownOpen); setStatusDropdownOpen(false); }} className="w-full bg-blue-50 text-blue-700 border border-blue-400 rounded-lg px-3 py-2.5 text-xs font-bold cursor-pointer shadow-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    {filtReminderDate === 'ALL' && 'All Dates (Reminders)'}
                    {filtReminderDate === 'TODAY' && 'Today (Aaj Ke)'}
                    {filtReminderDate === 'UPCOMING' && 'Upcoming (Next)'}
                    {filtReminderDate === 'OVERDUE' && 'Overdue (Missed)'}
                  </span>
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
                </div>
                {dateDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 flex flex-col p-1">
                    <div onClick={() => { setFiltReminderDate('ALL'); setDateDropdownOpen(false); }} className="px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded cursor-pointer flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16m-7 6h7"/></svg>
                      All Dates (Reminders)
                    </div>
                    <div onClick={() => { setFiltReminderDate('TODAY'); setDateDropdownOpen(false); }} className="px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg>
                      Today (Aaj Ke)
                    </div>
                    <div onClick={() => { setFiltReminderDate('UPCOMING'); setDateDropdownOpen(false); }} className="px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded cursor-pointer flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
                      Upcoming (Next)
                    </div>
                    <div onClick={() => { setFiltReminderDate('OVERDUE'); setDateDropdownOpen(false); }} className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded cursor-pointer flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg>
                      Overdue (Missed)
                    </div>
                  </div>
                )}
              </div>

              <div className="relative">
                <div onClick={() => { setStatusDropdownOpen(!statusDropdownOpen); setDateDropdownOpen(false); }} className="w-full bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2.5 text-xs font-bold cursor-pointer shadow-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                    {filtStatus === 'ALL' && 'All Status'}
                    {filtStatus === 'New' && 'NEW'}
                    {filtStatus === 'NoAnswer' && 'NO ANSWER'}
                    {filtStatus === 'FollowUp' && 'FOLLOW-UP'}
                    {filtStatus === 'WASent' && 'WA SENT'}
                    {filtStatus === 'Rejected' && 'REJECTED'}
                    {filtStatus === 'Closed' && 'CLOSED'}
                  </span>
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
                </div>
                {statusDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 flex flex-col p-1">
                    <div onClick={() => { setFiltStatus('ALL'); setStatusDropdownOpen(false); }} className="px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded cursor-pointer flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16m-7 6h7"/></svg>
                      All Status
                    </div>
                    <div onClick={() => { setFiltStatus('New'); setStatusDropdownOpen(false); }} className="px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 rounded cursor-pointer flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg>
                      NEW
                    </div>
                    <div onClick={() => { setFiltStatus('NoAnswer'); setStatusDropdownOpen(false); }} className="px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50 rounded cursor-pointer flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18.364 5.636l-12.728 12.728M5.636 5.636l12.728 12.728"/></svg>
                      NO ANSWER
                    </div>
                    <div onClick={() => { setFiltStatus('FollowUp'); setStatusDropdownOpen(false); }} className="px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50 rounded cursor-pointer flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      FOLLOW-UP
                    </div>
                    <div onClick={() => { setFiltStatus('WASent'); setStatusDropdownOpen(false); }} className="px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                      WA SENT
                    </div>
                    <div onClick={() => { setFiltStatus('Rejected'); setStatusDropdownOpen(false); }} className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded cursor-pointer flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                      REJECTED
                    </div>
                    <div onClick={() => { setFiltStatus('Closed'); setStatusDropdownOpen(false); }} className="px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>
                      CLOSED
                    </div>
                  </div>
                )}
              </div>
              
              <select value={filtDistrict} onChange={(e) => setFiltDistrict(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2.5 text-xs font-bold outline-none cursor-pointer shadow-sm">
                <option value="ALL">All Districts</option>
                {districts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>

              <select value={filtTaluka} onChange={(e) => setFiltTaluka(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2.5 text-xs font-bold outline-none cursor-pointer shadow-sm">
                <option value="ALL">All Talukas</option>
                {talukas.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <select value={filtCluster} onChange={(e) => setFiltCluster(e.target.value)} className="w-full bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2.5 text-xs font-bold outline-none cursor-pointer shadow-sm">
                <option value="ALL">All Clusters</option>
                {clusters.map(cl => <option key={cl} value={cl}>{cl}</option>)}
              </select>

              <button type="button" onClick={() => { setFiltDistrict('ALL'); setFiltTaluka('ALL'); setFiltCluster('ALL'); setFiltStatus('ALL'); setFiltStaff('ALL'); setFiltReminderDate('ALL'); setSearchQuery(''); }} className="w-full bg-slate-200 text-slate-600 py-2.5 rounded-lg font-bold text-xs hover:bg-slate-300 transition-colors shadow-sm mt-1 flex items-center justify-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                Reset Filters
              </button>
            </div>

            <h3 className="font-black text-xs text-slate-800 uppercase mb-4 flex items-center gap-2 tracking-widest mt-6">
              <svg className="w-4 h-4 text-[#00a67e]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg>
              Add New Lead
            </h3>
            
            <form onSubmit={handleSaveNew} className="flex flex-col gap-2.5 pb-6">
              <input type="text" value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} className="w-full bg-yellow-50 border border-yellow-200 text-slate-700 rounded-lg px-3 py-2.5 text-xs font-bold outline-none focus:border-yellow-400 transition-colors" placeholder="Customer/Company Name *" required />
              
              <div className="flex gap-2">
                <input type="text" value={addForm.district} onChange={e => setAddForm({...addForm, district: e.target.value})} className="w-1/2 bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2.5 text-xs font-bold outline-none focus:border-[#00a67e] transition-colors" placeholder={filtDistrict !== 'ALL' ? filtDistrict : "District"} />
                <input type="text" value={addForm.taluka} onChange={e => setAddForm({...addForm, taluka: e.target.value})} className="w-1/2 bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2.5 text-xs font-bold outline-none focus:border-[#00a67e] transition-colors" placeholder={filtTaluka !== 'ALL' ? filtTaluka : "Taluka"} />
              </div>
              
              <input type="text" value={addForm.cluster} onChange={e => setAddForm({...addForm, cluster: e.target.value})} className="w-full bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2.5 text-xs font-bold outline-none focus:border-[#00a67e] transition-colors" placeholder={filtCluster !== 'ALL' ? filtCluster : "Pay Centre Name"} />
              
              <div className="flex gap-2">
                <input type="text" value={addForm.p1} onChange={e => setAddForm({...addForm, p1: e.target.value})} className="w-1/2 bg-blue-50 border border-blue-100 text-blue-800 rounded-lg px-3 py-2.5 text-xs font-bold outline-none focus:border-blue-300 transition-colors" placeholder="Contact Person 1" />
                <input type="text" value={addForm.m1} onChange={e => setAddForm({...addForm, m1: e.target.value})} className="w-1/2 bg-blue-50 border border-blue-100 text-blue-800 rounded-lg px-3 py-2.5 text-xs font-mono font-bold outline-none focus:border-blue-300 transition-colors" placeholder="Mobile No 1" />
              </div>
              
              <div className="flex gap-2">
                <input type="text" value={addForm.p2} onChange={e => setAddForm({...addForm, p2: e.target.value})} className="w-1/2 bg-blue-50 border border-blue-100 text-blue-800 rounded-lg px-3 py-2.5 text-xs font-bold outline-none focus:border-blue-300 transition-colors" placeholder="Contact Person 2" />
                <input type="text" value={addForm.m2} onChange={e => setAddForm({...addForm, m2: e.target.value})} className="w-1/2 bg-blue-50 border border-blue-100 text-blue-800 rounded-lg px-3 py-2.5 text-xs font-mono font-bold outline-none focus:border-blue-300 transition-colors" placeholder="Mobile No 2" />
              </div>
              
              <button type="submit" className="w-full bg-[#00a67e] text-white py-3 rounded-lg font-black uppercase tracking-widest text-xs hover:bg-emerald-600 shadow-md mt-2 transition-all cursor-pointer flex items-center justify-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
                Save Record
              </button>
            </form>

          </div>
        </div>

        {/* RIGHT MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col h-full w-full min-w-0 overflow-hidden bg-slate-100">
          
          <header className="bg-white p-3.5 shadow-sm border-b flex items-center justify-between gap-3 shrink-0 relative">
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden bg-slate-800 text-white p-2 rounded-lg shadow hover:bg-slate-700 cursor-pointer">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
              </button>
              <h1 className="text-base md:text-xl font-black tracking-tight flex items-center gap-2">
                <svg className="w-6 h-6 text-[#00a67e]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                <span className="text-[#00a67e]">SHANEY</span> CRM
              </h1>
            </div>

            <div className="flex items-center gap-2 justify-end min-w-0">
              <div className="hidden sm:block relative">
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search Name/Mobile..." className="pro-input w-full max-w-[200px] bg-slate-50 font-medium pl-3 pr-9" />
                <svg className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </div>

              <button type="button" onClick={() => setIsMobileSearchOpen(true)} className="sm:hidden bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl shadow-sm cursor-pointer flex items-center justify-center">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </button>

              <label className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl font-bold text-xs cursor-pointer shadow flex items-center gap-1.5 shrink-0 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                <span className="hidden sm:inline">Import</span>
                <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleExcelFileSelect} />
              </label>
              <button type="button" onClick={() => { if(confirm('Clear all CRM records?')) setCrmData([]); }} className="bg-red-50 text-red-600 border border-red-200 px-3 py-2 rounded-xl font-bold text-xs hover:bg-red-100 hidden sm:flex items-center gap-1 shrink-0 transition-colors cursor-pointer" title="Clear All">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                Clear
              </button>
            </div>

            {isMobileSearchOpen && (
              <div className="absolute inset-0 bg-white px-4 flex items-center gap-3 z-50 sm:hidden shadow-md w-full h-full">
                <div className="relative flex-1">
                  <input type="text" autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search Name/Mobile..." className="pro-input w-full bg-slate-50 font-medium pl-3 pr-9 text-xs py-2.5" />
                  <svg className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                </div>
                <button type="button" onClick={() => setIsMobileSearchOpen(false)} className="text-slate-500 font-black text-2xl px-2 leading-none cursor-pointer">&times;</button>
              </div>
            )}
          </header>

          <main className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar pb-20 relative">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col w-full overflow-hidden mb-10">
              
              <div className="flex flex-col sm:flex-row justify-between sm:items-center p-4 border-b bg-slate-50 gap-3 shrink-0">
                <h2 className="font-black text-xs xl:text-sm text-slate-800 uppercase flex items-center justify-between w-full sm:w-auto gap-3">
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                    Database List
                  </span>
                  <span className="bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full text-[10px] font-mono">{filteredLeads.length} Leads Found</span>
                </h2>
                
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
                  <div className="flex items-center gap-1.5 w-full sm:w-auto">
                    <select value={bulkStaff} onChange={(e) => setBulkStaff(e.target.value)} className="pro-input py-2 text-xs w-full sm:w-36 font-bold bg-white cursor-pointer">
                      <option value="">Assign To...</option>
                      <option value="UNASSIGNED">Unassign</option>
                      {staffList.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button type="button" onClick={handleBulkAssign} className="bg-indigo-600 text-white px-3.5 py-2 rounded-xl font-bold text-xs shadow hover:bg-indigo-700 whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg> Assign
                    </button>
                    <button type="button" onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-700 text-white px-3.5 py-2 rounded-xl font-bold text-xs shadow whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> Delete
                    </button>
                  </div>

                  <div className="flex items-center justify-between w-full sm:w-auto bg-white border rounded-xl p-1 shrink-0 shadow-sm">
                    <button type="button" onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} className="px-3 py-1 rounded-lg font-bold text-xs hover:bg-slate-100 text-slate-600 cursor-pointer">◀</button>
                    <span className="text-[10px] font-black uppercase px-3 text-slate-500 whitespace-nowrap">Pg {currentPage}/{totalPages}</span>
                    <button type="button" onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} className="px-3 py-1 rounded-lg font-bold text-xs hover:bg-slate-100 text-slate-600 cursor-pointer">▶</button>
                  </div>
                </div>
              </div>

              {/* DESKTOP TABLE VIEW */}
              <div className="hidden md:block w-full overflow-x-auto custom-scrollbar">
                <div className="min-w-[1050px] flex flex-col">
                  <div className="grid grid-cols-12 bg-slate-100 text-[10px] font-black uppercase text-slate-500 border-b p-3.5 gap-4 shrink-0 tracking-wider">
                    <div className="col-span-3 flex items-center gap-2 pl-2">
                      <input type="checkbox" onChange={(e) => {
                        if (e.target.checked) setSelectedIds(paginatedLeads.map(l => l.id));
                        else setSelectedIds([]);
                      }} checked={paginatedLeads.length > 0 && selectedIds.length === paginatedLeads.length} className="w-4 h-4 accent-[#00a67e] cursor-pointer" />
                      <span>Customer Profile</span>
                    </div>
                    <div className="col-span-4 pl-2">Contacts & Mobile (Touch to Edit)</div>
                    <div className="col-span-5 text-center pr-2">Status & Actions</div>
                  </div>

                  <div className="divide-y divide-slate-100 w-full font-medium">
                    {paginatedLeads.map(c => {
                      const isChecked = selectedIds.includes(c.id);
                      const unassignedBadge = (!c.staff || c.staff === 'Unassigned' || c.staff === '') ? 
                        <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-black px-2 py-0.5 rounded uppercase flex items-center gap-1 shrink-0 mt-1">
                          <svg className="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg> Unassigned
                        </span> : 
                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[9px] font-black px-2 py-0.5 rounded uppercase flex items-center gap-1 shrink-0 mt-1">
                          <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg> {c.staff}
                        </span>;

                      const erpBadge = c.isErpOverdue ?
                        <span className="bg-red-100 text-red-800 border border-red-200 text-[9px] font-black px-2 py-0.5 rounded uppercase flex items-center gap-1 shrink-0 mt-1 ml-1">
                          ⚠️ ERP Overdue
                        </span> : null;

                      let locArr = [];
                      if (c.cluster) locArr.push(c.cluster);
                      if (c.taluka) locArr.push(c.taluka);
                      if (c.district) locArr.push(c.district);
                      const locString = locArr.join(' • ') || '-';

                      const cardStatusOpen = activeCardStatusDropdown === c.id;

                      const counts = c.whatsappCounts || { m1: 0, m2: 0 };
                      const countM1 = counts.m1 || (c.whatsappSent && !c.m2 ? 1 : 0);
                      const countM2 = counts.m2 || 0;

                      const callCounts = c.callCounts || { m1: 0, m2: 0 };
                      const callCountM1 = callCounts.m1 || 0;
                      const callCountM2 = callCounts.m2 || 0;

                      return (
                        <div key={c.id} className="p-4 grid grid-cols-12 gap-4 items-start hover:bg-slate-50/85 transition-colors relative group">
                          
                          <div className="col-span-3 flex items-start gap-3 w-full min-w-0">
                            <div>
                              <input type="checkbox" checked={isChecked} onChange={(e) => {
                                if (e.target.checked) setSelectedIds([...selectedIds, c.id]);
                                else setSelectedIds(selectedIds.filter(id => id !== c.id));
                              }} className="w-4 h-4 mt-1 accent-[#00a67e] shrink-0 cursor-pointer" />
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                              <h4 className="font-black text-slate-900 text-sm uppercase break-words w-full">{c.name}</h4>
                              <div className="flex items-center gap-2 flex-wrap">
                                  {unassignedBadge}
                                  {erpBadge}
                              </div>
                              <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 flex items-start gap-1 w-full truncate pr-2">
                                <svg className="w-3.5 h-3.5 shrink-0 text-slate-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                <span className="truncate" title={locString}>{locString}</span>
                              </p>
                            </div>
                          </div>

                          <div className="col-span-4 w-full font-mono text-xs flex flex-col gap-2 min-w-0">
                            {c.m1 || c.p1 ? (
                              <div className="flex items-center justify-between border border-slate-200 bg-white p-2.5 rounded-xl shadow-sm hover:border-blue-400 hover:shadow-md transition-all group">
                                <div onClick={(e) => openEditModal(c, e)} className="flex flex-col min-w-0 flex-1 pr-2 cursor-pointer" title="Click to Edit Contact">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-slate-800 text-[10px] uppercase truncate" title={c.p1 || 'Contact 1'}>{c.p1 || 'Contact 1'}</span>
                                    {countM1 > 0 && (
                                      <span className="inline-flex items-center text-[#25D366] bg-green-50 px-1 py-0.2 rounded border border-green-200" title={`WhatsApp sent ${countM1} time(s)`}>
                                        <svg className="w-3 h-3 fill-current inline" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                                        <span className="text-[9px] font-black ml-0.5">{countM1}</span>
                                      </span>
                                    )}
                                    {callCountM1 > 0 && (
                                      <span className="inline-flex items-center text-blue-600 bg-blue-50 px-1 py-0.2 rounded border border-blue-200 ml-1" title={`Called ${callCountM1} time(s)`}>
                                        <svg className="w-3 h-3 fill-current inline" viewBox="0 0 24 24"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                                        <span className="text-[9px] font-black ml-0.5">{callCountM1}</span>
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-slate-500 font-bold text-xs truncate block w-full mt-0.5">
                                    {c.m1 ? c.m1 : <span className="text-red-400 italic">No Number</span>}
                                  </span>
                                </div>
                                <button type="button" onClick={() => triggerCall(c.m1, 'm1', c.id)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-black text-[10px] uppercase transition-colors shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer" title="Call">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                                  CALL
                                </button>
                              </div>
                            ) : null}

                            {c.m2 || c.p2 ? (
                              <div className="flex items-center justify-between border border-slate-200 bg-white p-2.5 rounded-xl shadow-sm hover:border-blue-400 hover:shadow-md transition-all group">
                                <div onClick={(e) => openEditModal(c, e)} className="flex flex-col min-w-0 flex-1 pr-2 cursor-pointer" title="Click to Edit Contact">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-slate-700 text-[10px] uppercase truncate" title={c.p2 || 'Contact 2'}>{c.p2 || 'Contact 2'}</span>
                                    {countM2 > 0 && (
                                      <span className="inline-flex items-center text-[#25D366] bg-green-50 px-1 py-0.2 rounded border border-green-200" title={`WhatsApp sent ${countM2} time(s)`}>
                                        <svg className="w-3 h-3 fill-current inline" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                                        <span className="text-[9px] font-black ml-0.5">{countM2}</span>
                                      </span>
                                    )}
                                    {callCountM2 > 0 && (
                                      <span className="inline-flex items-center text-blue-600 bg-blue-50 px-1 py-0.2 rounded border border-blue-200 ml-1" title={`Called ${callCountM2} time(s)`}>
                                        <svg className="w-3 h-3 fill-current inline" viewBox="0 0 24 24"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                                        <span className="text-[9px] font-black ml-0.5">{callCountM2}</span>
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-slate-500 font-bold text-xs truncate block w-full mt-0.5">
                                    {c.m2 ? c.m2 : <span className="text-red-400 italic">No Number</span>}
                                  </span>
                                </div>
                                <button type="button" onClick={() => triggerCall(c.m2, 'm2', c.id)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-black text-[10px] uppercase transition-colors shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer" title="Call">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                                  CALL
                                </button>
                              </div>
                            ) : null}
                          </div>

                          <div className="col-span-5 w-full flex flex-col gap-1.5 bg-slate-50 border border-slate-200 p-2 rounded-xl shadow-inner max-w-[280px] ml-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="grid grid-cols-2 gap-1 w-full">
                              <div className="border border-slate-200 bg-white px-1.5 rounded-lg shadow-sm flex items-center h-[30px] min-w-0">
                                <input type="date" value={c.reminderDate || ''} onChange={(e) => handleDateChange(c.id, e.target.value)} className="pro-input text-[9px] flex-1 py-0 font-mono font-bold bg-transparent cursor-pointer border-0 shadow-none outline-none focus:ring-0 min-w-0" title="Reminder Date" />
                              </div>

                              <div className="relative min-w-0 h-[30px]">
                                <div onClick={() => setActiveCardStatusDropdown(cardStatusOpen ? null : c.id)} className="w-full h-full text-[9px] font-black uppercase px-2 text-blue-700 bg-blue-50 border border-blue-200 shadow-sm cursor-pointer rounded-lg flex items-center justify-between">
                                  <span className="flex items-center gap-1 truncate">
                                    <svg className="w-2.5 h-2.5 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg>
                                    {c.status ? `+ ${c.status.toUpperCase()}` : '+ NEW'}
                                  </span>
                                  <svg className="w-2.5 h-2.5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
                                </div>
                                {cardStatusOpen && (
                                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 flex flex-col p-1">
                                    <div onClick={() => { handleStatusChange(c.id, 'New'); setActiveCardStatusDropdown(null); }} className="px-2.5 py-1.5 text-[10px] font-bold text-blue-700 hover:bg-blue-50 rounded cursor-pointer flex items-center gap-2">
                                      <svg className="w-3 h-3 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg> NEW
                                    </div>
                                    <div onClick={() => { handleStatusChange(c.id, 'NoAnswer'); setActiveCardStatusDropdown(null); }} className="px-2.5 py-1.5 text-[10px] font-bold text-amber-700 hover:bg-amber-50 rounded cursor-pointer flex items-center gap-2">
                                      <svg className="w-3 h-3 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18.364 5.636l-12.728 12.728M5.636 5.636l12.728 12.728"/></svg> NO ANSWER
                                    </div>
                                    <div onClick={() => { handleStatusChange(c.id, 'FollowUp'); setActiveCardStatusDropdown(null); }} className="px-2.5 py-1.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50 rounded cursor-pointer flex items-center gap-2">
                                      <svg className="w-3 h-3 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> FOLLOW-UP
                                    </div>
                                    <div onClick={() => { handleStatusChange(c.id, 'WASent'); setActiveCardStatusDropdown(null); }} className="px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer flex items-center gap-2">
                                      <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg> WA SENT
                                </div>
                                <div onClick={() => { handleStatusChange(c.id, 'Rejected'); setActiveCardStatusDropdown(null); }} className="px-2.5 py-1.5 text-[10px] font-bold text-red-600 hover:bg-red-50 rounded cursor-pointer flex items-center gap-2">
                                  <svg className="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg> REJECTED
                                </div>
                                <div onClick={() => { handleStatusChange(c.id, 'Closed'); setActiveCardStatusDropdown(null); }} className="px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer flex items-center gap-2">
                                  <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg> CLOSED
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-1 w-full">
                          <button type="button" onClick={(e) => openWhatsAppModal(c, e)} className="flex items-center justify-center gap-1 bg-[#25D366] hover:bg-green-600 text-white py-1.5 px-1.5 rounded-md text-[9px] font-bold shadow-sm transition-colors cursor-pointer w-full h-[30px]" title="Send WhatsApp">
                            <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                <span className="truncate">WA</span>
              </button>
              <button type="button" onClick={(e) => openNoteModal(c, e)} className="flex items-center justify-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 py-1.5 px-1.5 rounded-md text-[9px] font-bold shadow-sm transition-colors cursor-pointer w-full h-[30px]" title="Add Note">
                <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                <span className="truncate">Note</span>
              </button>
              <button type="button" onClick={(e) => handleDeleteLead(c.id, e)} className="flex items-center justify-center gap-1 bg-red-50 hover:bg-red-500 text-red-600 hover:text-white border border-red-200 py-1.5 px-1.5 rounded-md text-[9px] font-bold shadow-sm transition-colors cursor-pointer w-full h-[30px]" title="Delete">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                <span className="truncate">Del</span>
              </button>
            </div>
          </div>

                        </div>
                      );
                    })}
                    {paginatedLeads.length === 0 && (
                      <div className="text-center py-16 text-slate-400 font-bold italic">No CRM leads found matching filters.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* MOBILE CARD VIEW */}
              <div className="block md:hidden p-3 space-y-3 bg-slate-50 w-full">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-black uppercase text-slate-700">
                    <input type="checkbox" onChange={(e) => {
                      if (e.target.checked) setSelectedIds(filteredLeads.map(l => l.id));
                      else setSelectedIds([]);
                    }} checked={filteredLeads.length > 0 && selectedIds.length === filteredLeads.length} className="accent-[#00a67e] w-4 h-4 cursor-pointer" />
                    <span>Select All ({filteredLeads.length})</span>
                  </label>
                  {selectedIds.length > 0 && (
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                      {selectedIds.length} Selected
                    </span>
                  )}
                </div>

                {paginatedLeads.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 font-bold italic text-xs">No CRM leads found.</div>
                ) : (
                  paginatedLeads.map(c => {
                    const isChecked = selectedIds.includes(c.id);
                    let locArr = [];
                    if (c.cluster) locArr.push(c.cluster);
                    if (c.taluka) locArr.push(c.taluka);
                    if (c.district) locArr.push(c.district);
                    const locString = locArr.join(' • ') || '-';

                    const counts = c.whatsappCounts || { m1: 0, m2: 0 };
                    const countM1 = counts.m1 || (c.whatsappSent && !c.m2 ? 1 : 0);
                    const countM2 = counts.m2 || 0;

                    const callCounts = c.callCounts || { m1: 0, m2: 0 };
                    const callCountM1 = callCounts.m1 || 0;
                    const callCountM2 = callCounts.m2 || 0;

                    const cardStatusOpen = activeCardStatusDropdown === c.id;

                    return (
                      <div key={c.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-2.5">
                            <input type="checkbox" checked={isChecked} onChange={(e) => {
                              if (e.target.checked) setSelectedIds([...selectedIds, c.id]);
                              else setSelectedIds(selectedIds.filter(id => id !== c.id));
                            }} className="accent-[#00a67e] w-4 h-4 cursor-pointer" />
                            <span className="font-mono font-black text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 uppercase">{c.status || 'NEW'}</span>
                          </div>
                          {(!c.staff || c.staff === 'Unassigned' || c.staff === '') ? (
                            <span className="text-[9px] font-black bg-amber-100 text-amber-800 px-2 py-0.5 rounded uppercase">Unassigned</span>
                          ) : (
                            <span className="text-[9px] font-black bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded uppercase">{c.staff}</span>
                          )}
                        </div>

                        <div>
                          <h4 className="font-black text-slate-900 text-sm uppercase">{c.name}</h4>
                          <p className="text-[11px] font-bold text-slate-500 mt-0.5">{locString}</p>
                        </div>

                        {/* MOBILE CONTACT SECTION - TOUCH TO EDIT ENABLED */}
                        <div className="flex flex-col gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          {c.m1 || c.p1 ? (
                            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                              <div onClick={(e) => openEditModal(c, e)} className="flex flex-col min-w-0 flex-1 pr-2 cursor-pointer" title="Click to Edit Contact">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-slate-800 text-[10px] uppercase truncate">{c.p1 || 'Contact 1'}</span>
                                  {countM1 > 0 && (
                                    <span className="inline-flex items-center text-[#25D366] bg-green-50 px-1 py-0.2 rounded border border-green-200">
                                      <svg className="w-3 h-3 fill-current inline" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                                      <span className="text-[9px] font-black ml-0.5">{countM1}</span>
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-slate-600 font-bold text-xs">{c.m1}</span>
                              </div>
                              <button type="button" onClick={() => triggerCall(c.m1, 'm1', c.id)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg font-black text-[10px] uppercase shadow-sm">CALL</button>
                            </div>
                          ) : null}

                          {c.m2 || c.p2 ? (
                            <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                              <div onClick={(e) => openEditModal(c, e)} className="flex flex-col min-w-0 flex-1 pr-2 cursor-pointer" title="Click to Edit Contact">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-slate-700 text-[10px] uppercase truncate">{c.p2 || 'Contact 2'}</span>
                                  {countM2 > 0 && (
                                    <span className="inline-flex items-center text-[#25D366] bg-green-50 px-1 py-0.2 rounded border border-green-200">
                                      <svg className="w-3 h-3 fill-current inline" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                                      <span className="text-[9px] font-black ml-0.5">{countM2}</span>
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-slate-600 font-bold text-xs">{c.m2}</span>
                              </div>
                              <button type="button" onClick={() => triggerCall(c.m2, 'm2', c.id)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg font-black text-[10px] uppercase shadow-sm">CALL</button>
                            </div>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <input type="date" value={c.reminderDate || ''} onChange={(e) => handleDateChange(c.id, e.target.value)} className="pro-input text-xs font-mono font-bold bg-slate-50 w-full" />
                          <div className="relative min-w-0">
                            <div onClick={() => setActiveCardStatusDropdown(cardStatusOpen ? null : c.id)} className="w-full text-[10px] font-black uppercase px-2.5 py-2 text-blue-700 bg-blue-50 border border-blue-200 shadow-sm cursor-pointer rounded-lg flex items-center justify-between">
                              <span className="flex items-center gap-1 truncate">
                                <svg className="w-2.5 h-2.5 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg>
                                {c.status ? `+ ${c.status.toUpperCase()}` : '+ NEW'}
                              </span>
                              <svg className="w-2.5 h-2.5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"/></svg>
                            </div>
                            {cardStatusOpen && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 flex flex-col p-1">
                                <div onClick={() => { handleStatusChange(c.id, 'New'); setActiveCardStatusDropdown(null); }} className="px-2.5 py-1.5 text-[10px] font-bold text-blue-700 hover:bg-blue-50 rounded cursor-pointer flex items-center gap-2">
                                  <svg className="w-3 h-3 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg> NEW
                                </div>
                                <div onClick={() => { handleStatusChange(c.id, 'NoAnswer'); setActiveCardStatusDropdown(null); }} className="px-2.5 py-1.5 text-[10px] font-bold text-amber-700 hover:bg-amber-50 rounded cursor-pointer flex items-center gap-2">
                                  <svg className="w-3 h-3 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18.364 5.636l-12.728 12.728M5.636 5.636l12.728 12.728"/></svg> NO ANSWER
                                </div>
                                <div onClick={() => { handleStatusChange(c.id, 'FollowUp'); setActiveCardStatusDropdown(null); }} className="px-2.5 py-1.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50 rounded cursor-pointer flex items-center gap-2">
                                  <svg className="w-3 h-3 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> FOLLOW-UP
                                </div>
                                <div onClick={() => { handleStatusChange(c.id, 'WASent'); setActiveCardStatusDropdown(null); }} className="px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer flex items-center gap-2">
                                  <svg className="w-3 h-3 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg> WA SENT
                                </div>
                                <div onClick={() => { handleStatusChange(c.id, 'Rejected'); setActiveCardStatusDropdown(null); }} className="px-2.5 py-1.5 text-[10px] font-bold text-red-600 hover:bg-red-50 rounded cursor-pointer flex items-center gap-2">
                                  <svg className="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg> REJECTED
                                </div>
                                <div onClick={() => { handleStatusChange(c.id, 'Closed'); setActiveCardStatusDropdown(null); }} className="px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer flex items-center gap-2">
                                  <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg> CLOSED
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100">
                          <button type="button" onClick={(e) => openWhatsAppModal(c, e)} className="flex-1 bg-[#25D366] text-white py-2 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 shadow-sm">
                            <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg> WA
                          </button>
                          <button type="button" onClick={(e) => openNoteModal(c, e)} className="flex-1 bg-amber-50 text-amber-700 border border-amber-200 py-2 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 shadow-sm">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> Note
                          </button>
                          <button type="button" onClick={(e) => handleDeleteLead(c.id, e)} className="flex-1 bg-red-50 text-red-600 border border-red-200 py-2 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 shadow-sm">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg> Del
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}

                {totalPages > 1 && (
                  <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm mt-4">
                    <button type="button" onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-lg border border-slate-300">Previous</button>
                    <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Page {currentPage} of {totalPages}</span>
                    <button type="button" onClick={() => setCurrentPage(prev => Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-lg border border-slate-300">Next</button>
                  </div>
                )}
              </div>

            </div>
          </main>
        </div>
      </div>

      {callModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-blue-600 p-4 text-white flex justify-between items-center">
              <h3 className="font-black text-sm uppercase flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                Call Contact
              </h3>
              <button type="button" onClick={() => setCallModalOpen(false)} className="font-black text-2xl leading-none cursor-pointer">&times;</button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <button type="button" onClick={() => triggerCall(callTarget.phone1, 'm1', callTarget.id)} className="flex flex-col items-start bg-slate-50 border border-slate-200 p-3 rounded-xl hover:bg-blue-50 hover:border-blue-300 w-full shadow-sm text-left cursor-pointer">
                <span className="font-black text-slate-800 text-xs uppercase">{callTarget.name1}</span>
                <span className="font-mono text-blue-600 font-bold text-xs mt-0.5">{callTarget.phone1 || 'No Phone 1'}</span>
              </button>
              {callTarget.phone2 && (
                <button type="button" onClick={() => triggerCall(callTarget.phone2, 'm2', callTarget.id)} className="flex flex-col items-start bg-slate-50 border border-slate-200 p-3 rounded-xl hover:bg-blue-50 hover:border-blue-300 w-full shadow-sm text-left cursor-pointer">
                  <span className="font-black text-slate-800 text-xs uppercase">{callTarget.name2}</span>
                  <span className="font-mono text-blue-600 font-bold text-xs mt-0.5">{callTarget.phone2}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {waModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-[#25D366] p-4 text-white flex justify-between items-center">
              <h3 className="font-black text-sm uppercase flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                Send WhatsApp To...
              </h3>
              <button type="button" onClick={() => setWaModalOpen(false)} className="font-black text-2xl leading-none cursor-pointer">&times;</button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <button type="button" onClick={() => triggerWhatsApp(waTarget.phone1, 'm1')} className="flex flex-col items-start bg-slate-50 border border-slate-200 p-3 rounded-xl hover:bg-green-50 hover:border-green-300 w-full shadow-sm text-left cursor-pointer">
                <span className="font-black text-slate-800 text-xs uppercase">{waTarget.name1}</span>
                <span className="font-mono text-emerald-600 font-bold text-xs mt-0.5">{waTarget.phone1 || 'No Phone 1'}</span>
              </button>
              {waTarget.phone2 && (
                <button type="button" onClick={() => triggerWhatsApp(waTarget.phone2, 'm2')} className="flex flex-col items-start bg-slate-50 border border-slate-200 p-3 rounded-xl hover:bg-green-50 hover:border-green-300 w-full shadow-sm text-left cursor-pointer">
                  <span className="font-black text-slate-800 text-xs uppercase">{waTarget.name2}</span>
                  <span className="font-mono text-emerald-600 font-bold text-xs mt-0.5">{waTarget.phone2}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {editModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-blue-600 p-4 text-white flex justify-between items-center shrink-0">
              <h3 className="font-black text-sm uppercase flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                Edit Customer
              </h3>
              <button type="button" onClick={() => setEditModalOpen(false)} className="font-black text-2xl leading-none cursor-pointer">&times;</button>
            </div>
            <div className="p-4 md:p-5 overflow-y-auto custom-scrollbar flex-1 flex flex-col gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Customer/Company Name *</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} className="pro-input bg-yellow-50 font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">District</label>
                  <input type="text" value={editForm.district} onChange={e => setEditForm({...editForm, district: e.target.value})} className="pro-input font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Taluka</label>
                  <input type="text" value={editForm.taluka} onChange={e => setEditForm({...editForm, taluka: e.target.value})} className="pro-input font-bold" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Pay Centre Name</label>
                <input type="text" value={editForm.cluster} onChange={e => setEditForm({...editForm, cluster: e.target.value})} className="pro-input font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-3 border-t pt-3">
                <div>
                  <label className="text-[10px] font-bold text-blue-600 uppercase block mb-1">Contact Person 1</label>
                  <input type="text" value={editForm.p1} onChange={e => setEditForm({...editForm, p1: e.target.value})} className="pro-input font-bold bg-blue-50/30" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-blue-600 uppercase block mb-1">Mobile No 1</label>
                  <input type="text" value={editForm.m1} onChange={e => setEditForm({...editForm, m1: e.target.value})} className="pro-input font-mono font-bold bg-blue-50/30" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-blue-600 uppercase block mb-1">Contact Person 2</label>
                  <input type="text" value={editForm.p2} onChange={e => setEditForm({...editForm, p2: e.target.value})} className="pro-input font-bold bg-blue-50/30" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-blue-600 uppercase block mb-1">Mobile No 2</label>
                  <input type="text" value={editForm.m2} onChange={e => setEditForm({...editForm, m2: e.target.value})} className="pro-input font-mono font-bold bg-blue-50/30" />
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t shrink-0 flex justify-end gap-2">
              <button type="button" onClick={() => setEditModalOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 uppercase text-xs cursor-pointer">Cancel</button>
              <button type="button" onClick={saveCrmEditRecord} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase text-xs shadow-md cursor-pointer flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {noteModalOpen && activeNoteRecord && (
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
              <h3 className="font-black text-sm uppercase flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2.5 2.5 0 113.536 3.536L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                Discussion Notes
              </h3>
              <button type="button" onClick={() => setNoteModalOpen(false)} className="font-black text-2xl leading-none cursor-pointer">&times;</button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <p className="font-black text-slate-800 text-sm uppercase">{activeNoteRecord.name}</p>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows="4" className="pro-input text-xs bg-slate-50 leading-relaxed" placeholder="Type discussion details or follow-up notes..."></textarea>
              <button type="button" onClick={saveNote} className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-black text-xs uppercase shadow-md hover:bg-indigo-700 transition-colors cursor-pointer flex items-center justify-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {previewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[99999] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[90vh] overflow-hidden">
            
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-[#00a67e] text-white rounded-t-2xl shrink-0">
              <h3 className="font-black uppercase text-sm flex items-center gap-2">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                Excel Import Preview ({rawExcelRows.length} Rows Found)
              </h3>
              <button type="button" onClick={() => setPreviewModalOpen(false)} className="text-white hover:text-red-200 font-bold text-2xl leading-none cursor-pointer">&times;</button>
            </div>
            
            <div className="p-4 overflow-auto flex-1 custom-scrollbar bg-slate-50">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
                <table className="w-full border-collapse text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-[#00a67e] text-white font-black uppercase text-[10px]">
                      <th className="p-2.5 border border-emerald-600 text-center w-12">#</th>
                      {previewColumns.map((col, cIdx) => (
                        <th key={cIdx} className="p-2.5 border border-emerald-600 text-left px-4">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rawExcelRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50 font-medium">
                        <td className="p-2.5 border border-slate-200 text-center font-bold text-slate-400 bg-slate-50">{rIdx + 1}</td>
                        {previewColumns.map((col, cIdx) => (
                          <td key={cIdx} className="p-2.5 border border-slate-200 text-slate-800 px-4">{row[col] !== undefined ? String(row[col]) : ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500 font-bold mt-3 text-center">Click 'Confirm & Import' to save these records into the CRM database (1 by 1 safe upload).</p>
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3 rounded-b-2xl shrink-0 shadow-lg">
              <button type="button" onClick={() => setPreviewModalOpen(false)} className="px-6 py-2.5 rounded-xl font-black text-slate-700 bg-white border-2 border-slate-300 hover:bg-slate-100 uppercase text-xs cursor-pointer">Cancel</button>
              <button type="button" onClick={confirmExcelImport} disabled={isImporting} className="px-6 py-2.5 rounded-xl font-black uppercase tracking-wider text-white bg-[#00a67e] hover:bg-emerald-600 shadow-md transition-colors flex items-center gap-2 text-xs cursor-pointer disabled:opacity-50">
                {isImporting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a88 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span>Processing (1-by-1)...</span>
                  </>
                ) : (
                  <>
                    <span>✅</span> Confirm & Import
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}