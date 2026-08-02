import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import { toJpeg } from 'html-to-image'; 

const BACKEND_URL = "https://shaney-erp-backend.onrender.com";

const getCurrentFY = () => {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  return m >= 4 ? `F.Y. ${y}-${String(y + 1).slice(-2)}` : `F.Y. ${y - 1}-${String(y).slice(-2)}`;
};

const getFinancialYear = (refStr, dateStr) => {
  if (refStr) {
    const match = String(refStr).match(/(\d{2})-(\d{2})/);
    if (match) {
      return `F.Y. ${match[1]}-${match[2]}`;
    }
  }

  if (!dateStr) return getCurrentFY();
  let day, month, year;
  let cleanStr = String(dateStr).trim();
  if (cleanStr.includes('/')) cleanStr = cleanStr.replace(/\//g, '-');
  
  if (cleanStr.includes('-')) {
    const parts = cleanStr.split('-');
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
    } else {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    }
  }
  if (!year || isNaN(year)) return getCurrentFY();
  if (month >= 4) {
    const nextYr = String(year + 1).slice(-2);
    return `F.Y. ${year}-${nextYr}`;
  } else {
    const prevYr = String(year - 1).slice(-2);
    return `F.Y. ${year - 1}-${String(year).slice(-2)}`;
  }
};

const sanitizeForCloud = (dataObj) => {
  let cleaned = { ...dataObj };
  if (!cleaned.updatedAt) {
    cleaned.updatedAt = Date.now();
  }
  if (!cleaned.fy || cleaned.fy === 'ALL' || typeof cleaned.fy === 'undefined') {
    cleaned.fy = getFinancialYear(cleaned.ref, cleaned.date || cleaned.validDate) || getCurrentFY();
  }
  Object.keys(cleaned).forEach(key => {
    if (cleaned[key] === undefined) {
      cleaned[key] = null;
    }
  });
  return cleaned;
};

const getDynamicPrefix = () => {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  const yr1 = m >= 4 ? String(y).slice(-2) : String(y - 1).slice(-2);
  const yr2 = m >= 4 ? String(y + 1).slice(-2) : String(y).slice(-2);
  return `SE/${yr1}-${yr2}/101`;
};

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

export default function Certificate({ selectedFY, initialViewMode }) {
  const [viewMode, setViewMode] = useState(initialViewMode || 'list'); 
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    if (initialViewMode) {
      setViewMode(initialViewMode);
    }
  }, [initialViewMode]);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);

  useEffect(() => {
    const handleDataUpdate = (e) => {
      if (!e.detail || e.detail.type === 'certificates') {
        const saved = localStorage.getItem('ERP_History_v104');
        if (saved) {
          let parsedData = JSON.parse(saved);
          parsedData = parsedData.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
          setCertificates(parsedData.filter(b => b.docType === 'certificate'));
        }
      }
    };
    window.addEventListener('ERP_DATA_UPDATED', handleDataUpdate);
    return () => window.removeEventListener('ERP_DATA_UPDATED', handleDataUpdate);
  }, []);

  useEffect(() => {
    let timer;
    if (showSummary) {
      timer = setTimeout(() => {
        setShowSummary(false);
      }, 10000);
    }
    return () => clearTimeout(timer);
  }, [showSummary]);

  const getTodayISO = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const add364DaysISO = (isoDate) => {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-');
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    dateObj.setDate(dateObj.getDate() + 364);
    
    const newY = dateObj.getFullYear();
    const newM = String(dateObj.getMonth() + 1).padStart(2, '0');
    const newD = String(dateObj.getDate()).padStart(2, '0');
    return `${newY}-${newM}-${newD}`;
  };

  const toDDMMYYYY = (iso) => {
    if (!iso || !String(iso).includes('-')) return iso || '';
    const parts = String(iso).split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return iso;
  };

  const fromDDMMYYYY = (ddmmyyyy) => {
    if (!ddmmyyyy) return getTodayISO();
    let str = String(ddmmyyyy).trim();
    if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;
    if (str.match(/^\d{2}-\d{2}-\d{4}$/)) {
       const [d, m, y] = str.split('-');
       return `${y}-${m}-${d}`;
    }
    return getTodayISO();
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFirm, setSelectedFirm] = useState('All Firms');
  const [selectedStatus, setSelectedStatus] = useState('All Status');
  const [filterFY, setFilterFY] = useState(selectedFY || 'ALL');

  const [filterMonth, setFilterMonth] = useState('ALL');
  const [filterYearNum, setFilterYearNum] = useState('ALL');

  useEffect(() => {
    if (selectedFY) {
      setFilterFY(selectedFY);
    }
  }, [selectedFY]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedFirm, selectedStatus, filterFY, filterMonth, filterYearNum]);

  const [selectedCertIds, setSelectedCertIds] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'ref', direction: 'desc' });

  const [firms, setFirms] = useState(() => {
    const saved = localStorage.getItem('ERP_Companies_v104');
    return saved ? JSON.parse(saved).filter(f => f.type === 'certificate') : [];
  });

  const [firmTemplates, setFirmTemplates] = useState(() => {
    const saved = localStorage.getItem('ERP_FirmTemplates_v104');
    return saved ? JSON.parse(saved) : {};
  });

  const [staffList, setStaffList] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_Staff_v104');
      return saved ? JSON.parse(saved) : ['NAVNIT', 'KISHOR', 'RAHUL'];
    } catch(e) {
      return ['NAVNIT', 'KISHOR', 'RAHUL'];
    }
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('ERP_Staff_v104');
      if (saved) setStaffList(JSON.parse(saved));
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const [paymentMethods, setPaymentMethods] = useState(() => {
    const saved = localStorage.getItem('ERP_PayMethods_v104');
    return saved ? JSON.parse(saved) : ['CASH', 'ONLINE', 'CHEQUE', 'UPI', 'CREDIT', 'PFMS', 'Bank Transfer'];
  });

  const [categories, setCategories] = useState(() => {
    const saved = localStorage.getItem('ERP_CertCategories_v104');
    return saved ? JSON.parse(saved) : ["ABC Stored Pressure", "Co2", "Water Co2", "M-Foam", "Dry Chemical Powder", "Dissolved acetylene gas", "Oxygen", "Argon gas"];
  });

  const [capacities, setCapacities] = useState(() => {
    const saved = localStorage.getItem('ERP_CertCapacities_v104');
    return saved ? JSON.parse(saved) : ["1Kg", "2Kg", "4.5Kg", "6Kg", "9 Ltr Stored PressureType", "50 Ltr", "6 Cubic Meter", "7 Cubic Meter"];
  });

  const [certificates, setCertificates] = useState(() => {
    let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
    allHistory = allHistory.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
    return allHistory.filter(b => b.docType === 'certificate');
  });

  useEffect(() => {
    let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
    allHistory = allHistory.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
    const certs = allHistory.filter(c => c.docType === 'certificate');
    const others = allHistory.filter(c => c.docType !== 'certificate');
    
    let hasDuplicates = false;
    const uniqueCerts = [];
    const seenRefs = new Set();
    
    certs.sort((a, b) => b.id - a.id).forEach(cert => {
        const calculatedFY = getFinancialYear(cert.ref, cert.date || cert.validDate) || getCurrentFY();
        if (!cert.fy || cert.fy === 'ALL' || cert.fy !== calculatedFY) {
          cert.fy = calculatedFY;
          hasDuplicates = true;
        }
        const uniqueKey = `${cert.vendor}|${cert.ref}`;
        if (!seenRefs.has(uniqueKey)) {
            seenRefs.add(uniqueKey);
            uniqueCerts.push(cert);
        } else {
            hasDuplicates = true;
        }
    });

    if (hasDuplicates) {
        const newHistory = [...others, ...uniqueCerts];
        localStorage.setItem('ERP_History_v104', JSON.stringify(newHistory));
        setCertificates(uniqueCerts);
    }
  }, []);

  const availableFYs = Array.from(new Set(certificates.map(c => c.fy || getFinancialYear(c.ref, c.date) || getCurrentFY()).filter(Boolean))).sort().reverse();
  if (availableFYs.length === 0) availableFYs.push(getCurrentFY());

  const availableYears = Array.from(new Set(certificates.map(c => {
    const dStr = c.date || c.validDate;
    if (!dStr) return null;
    let clean = String(dStr).trim();
    if (clean.includes('/')) clean = clean.replace(/\//g, '-');
    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts[0].length === 4) return parts[0];
      if (parts[2] && parts[2].length === 4) return parts[2];
    }
    return null;
  }).filter(Boolean))).sort().reverse();

  const [customers, setCustomers] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_Customers_v104');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });

  const [editingCertId, setEditingCertId] = useState(null);

  const [formData, setFormData] = useState({
    activeFirmId: firms.length > 0 ? firms[0].id : '',
    client: '',
    address: '',
    serialNo: '',
    refillDate: getTodayISO(),
    validUpTo: add364DaysISO(getTodayISO()),
    submitBy: staffList[0] || '',
    confirmBy: staffList[0] || '',
    collectedBy: staffList[0] || '',
    amount: '',
    payMethod: paymentMethods[0] || 'CASH'
  });

  useEffect(() => {
    if (!editingCertId && viewMode === 'create') {
      const savedFirms = JSON.parse(localStorage.getItem('ERP_Companies_v104') || '[]').filter(f => f.type === 'certificate');
      const activeId = formData.activeFirmId || (savedFirms.length > 0 ? savedFirms[0].id : '');
      const f = savedFirms.find(x => x.id === activeId);
      const allHist = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]').filter(b => b.docType === 'certificate');

      if (f) {
        const firmCerts = allHist.filter(c => c.vendor === f.name);
        const prefixRaw = (f.prefix || f.serialNo || f.startingNo || getDynamicPrefix()).trim();
        const match = prefixRaw.match(/^(.*?)(\d+)$/);
        
        if (match) {
          const baseStr = match[1];
          const numStr = match[2];
          let maxNum = parseInt(numStr, 10) - 1;
          firmCerts.forEach(c => {
              if (c.ref && c.ref.startsWith(baseStr)) {
                  const cMatch = c.ref.match(/(\d+)$/);
                  if (cMatch) {
                      const cNum = parseInt(cMatch[1], 10);
                      if (cNum > maxNum) maxNum = cNum;
                  }
              }
          });
          const nextNum = maxNum + 1;
          const paddedNum = String(nextNum).padStart(numStr.length, '0');
          setFormData(prev => ({ ...prev, activeFirmId: activeId, serialNo: baseStr + paddedNum }));
        } else {
          const nextNum = 101 + firmCerts.length;
          setFormData(prev => ({ ...prev, activeFirmId: activeId, serialNo: prefixRaw + nextNum })); 
        }
      }
    }
  }, [formData.activeFirmId, editingCertId, viewMode]);

  const getCustomerAddress = (partyName) => {
    const found = customers.find(c => c.name.toLowerCase() === partyName.toLowerCase());
    if (found) {
      let addrParts = [];
      if (found.village) addrParts.push(found.village);
      if (found.taluka) addrParts.push(found.taluka);
      if (found.district) addrParts.push(found.district);
      let addrStr = addrParts.join(', ');
      if (found.state || found.pincode) {
        addrStr += `, ${found.state || ''} ${found.pincode ? '- ' + found.pincode : ''}`;
      }
      return addrStr.trim() || found.address || '';
    }
    return '';
  };

  const handleCustomerChange = (e) => {
    const val = e.target.value;
    setFormData({ ...formData, client: val, address: getCustomerAddress(val) || formData.address });
  };

  const [tableData, setTableData] = useState(() => {
    const defaultItems = categories.reduce((acc, cat) => ({ ...acc, [cat]: [{ cap: "", qty: "" }] }), {});
    return { hyTest: 'Pass', parts: 'COMPLETE', remark: 'OK', items: defaultItems };
  });

  const activeFirmObj = firms.find(f => f.id === formData.activeFirmId) || { name: 'COMPANY ENTERPRISE', address: 'Address', contact: '' };
  
  const currentDesign = firmTemplates[formData.activeFirmId] || {
    themeColor: '#00a67e', certPos: 'left-vert', certPosX: 0, certPosY: 0, certFont: 'Georgia', certSize: 42, certColor: '#dc2626', certBold: true, certItalic: false, certUnderline: false,
    headerFont: 'Arial', headerSize: 36, headerColor: '#0f172a', headerBold: true, headerItalic: false, headerUnderline: false,
    docFont: 'Georgia', docSize: 15.5, docColor: '#000000', docBold: false, docItalic: true, docUnderline: false,
    custFont: 'Caveat', custSize: 20, custColor: '#000000', custBold: false, custItalic: false, custUnderline: false,
    sigFont: 'Arial', sigSize: 14, sigColor: '#000000', sigBold: false, sigItalic: true, sigUnderline: false, sigX: 0, sigY: 0,
    a4BgUrl: '', topMargin: 0, graphics: {}
  };

  const addCapRow = (cat) => {
    const newItems = { ...tableData.items };
    if (!newItems[cat]) newItems[cat] = [];
    newItems[cat].push({ cap: "", qty: "" });
    setTableData({ ...tableData, items: newItems });
  };

  const removeCapRow = (cat, idx) => {
    const newItems = { ...tableData.items };
    newItems[cat].splice(idx, 1);
    if (newItems[cat].length === 0) newItems[cat].push({ cap: "", qty: "" });
    setTableData({ ...tableData, items: newItems });
  };

  const updateCapRow = (cat, idx, key, val) => {
    const newItems = { ...tableData.items };
    newItems[cat][idx][key] = val;
    setTableData({ ...tableData, items: newItems });
  };

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [activeCert, setActiveCert] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: paymentMethods[0] || 'CASH', note: '' });

  const getOutstanding = (cert) => {
    const paidTotal = cert.payments ? cert.payments.reduce((sum, p) => sum + Number(p.amount), 0) : 0;
    return Math.max(0, cert.total - paidTotal).toFixed(2);
  };

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activePreviewCert, setActivePreviewCert] = useState(null);

  const handleViewCertificate = async (e, cert) => {
    e.stopPropagation();
    const localKey = `shaney_certificate_${cert.id}`;
    let certToView = cert;

    try {
      const cached = localStorage.getItem(localKey);
      if (cached) {
        certToView = JSON.parse(cached);
      } else {
        const res = await fetch(`${BACKEND_URL}/api/document/${cert.id}`);
        if (res.ok) {
          const cloudData = await res.json();
          if (cloudData && cloudData.data) {
            certToView = cloudData.data;
            localStorage.setItem(localKey, JSON.stringify(certToView));
          }
        }
      }
    } catch (err) {
      console.error("Cache fetch error:", err);
    }

    setActivePreviewCert(certToView);
    setIsPreviewOpen(true);
  };

  const toggleSingleReminderStatus = async (e, id, statusVal) => {
    e.stopPropagation();
    let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
    const idx = allHistory.findIndex(h => h.id === id);
    if(idx !== -1) {
       allHistory[idx].reminderDone = statusVal;
       allHistory[idx].updatedAt = Date.now();
       localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
       setCertificates(allHistory.filter(b => b.docType === 'certificate'));
       try {
         const sanitized = sanitizeForCloud(allHistory[idx]);
         await fetch(`${BACKEND_URL}/api/data`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ type: 'certificates', id: String(id), data: sanitized })
         });
         localStorage.removeItem(`shaney_certificate_${id}`);
         if (window.require) {
           const { ipcRenderer } = window.require('electron');
           if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', allHistory[idx]);
         }
       } catch (err) {
         console.error("AWS reminder status update error:", err);
       }
    }
  };

  const hasBeenRenewed = (currentCert) => {
    if (!currentCert.validDate || !currentCert.party) return false;
    let currValidObj = new Date(currentCert.validDate.split('-').reverse().join('-'));
    if (isNaN(currValidObj)) return false;

    return certificates.some(other => {
      if (other.id === currentCert.id) return false;
      if (String(other.party).toLowerCase().trim() !== String(currentCert.party).toLowerCase().trim()) return false;

      let otherValidObj = new Date((other.validDate || other.date).split('-').reverse().join('-'));
      if (isNaN(otherValidObj)) return false;

      return otherValidObj > currValidObj;
    });
  };

  const handleWhatsAppSend = async (e, cert, type = 'doc') => {
    e.stopPropagation(); 
    const allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
    const idx = allHistory.findIndex(c => c.id === cert.id);
    
    if (idx !== -1 && type === 'doc') {
      allHistory[idx].whatsappSent = true;
      allHistory[idx].updatedAt = Date.now();
      localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
      setCertificates(allHistory.filter(b => b.docType === 'certificate'));
      try {
        const sanitized = sanitizeForCloud(allHistory[idx]);
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'certificates', id: String(cert.id), data: sanitized })
        });
        localStorage.removeItem(`shaney_certificate_${cert.id}`);
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', allHistory[idx]);
        }
      } catch (err) {
        console.error("AWS whatsapp sent update error:", err);
      }
      logActionToBackend(`Sent Certificate WhatsApp to ${cert.party} (Ref: ${cert.ref})`);
    }

    const cData = customers.find(c => c.name.toLowerCase() === cert.party.toLowerCase());
    const phone = cData?.contact || cData?.phone || '';
    const baseUrl = window.location.origin;
    const docLink = `${baseUrl}/preview/${cert.id}`;

    let msg = '';
    if (type === 'payment') {
      const outAmt = getOutstanding(cert);
      msg = `Hello ${cert.party},\n\nYour payment of ₹${outAmt} is pending for Certificate (Ref: ${cert.ref}).\nKindly clear the dues at the earliest.\n\n📄 View your document here:\n🔗 ${docLink}\n\nThank you!\n- ${cert.vendor}`;
      logActionToBackend(`Sent Payment Due Reminder WhatsApp of ₹${outAmt} to ${cert.party} (Ref: ${cert.ref})`);
    } else {
      msg = `Hello ${cert.party},\n\nYour Fire Safety Certificate (Ref: ${cert.ref}) has been generated successfully.\n\n📄 You can view, download as PDF, or print your certificate directly from this link:\n🔗 ${docLink}\n\nThank you!\n- ${cert.vendor}`;
    }

    const waUrl = `https://wa.me/${phone ? '91'+phone.replace(/\D/g,'') : ''}?text=${encodeURIComponent(msg)}`;
    
    setTimeout(() => {
      window.open(waUrl, '_blank');
    }, 1000);
  };

  const executeDocumentAction = async (actionType, elementId, filename) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    document.body.style.cursor = 'wait';

    if (actionType === 'print') {
        const clone = element.cloneNode(true);
        clone.id = 'print-temp-element';
        Object.assign(clone.style, {
            position: 'absolute', top: '0px', left: '0px', transform: 'none',
            width: '794px', height: '1123px', backgroundColor: '#ffffff',
            zIndex: '999999', margin: '0px'
        });
        document.body.appendChild(clone);

        const style = document.createElement('style');
        style.id = 'print-style-temp';
        style.innerHTML = `
            @media print {
                body > *:not(#print-temp-element) { display: none !important; }
                @page { size: A4 portrait; margin: 0; }
                html, body { background-color: white !important; margin: 0 !important; padding: 0 !important; }
            }
        `;
        document.head.appendChild(style);

        setTimeout(() => {
            window.print();
            if (document.body.contains(clone)) document.body.removeChild(clone);
            if (document.head.contains(style)) document.head.removeChild(style);
            document.body.style.cursor = 'default';
        }, 300);

    } else if (actionType === 'pdf') {
        const scaleWrapper = element.parentElement;
        const originalClassName = scaleWrapper.className;
        const originalTransform = scaleWrapper.style.transform;

        try {
            scaleWrapper.className = originalClassName
                .replace(/scale-\[[^\]]+\]/g, '')
                .replace(/sm:scale-\[[^\]]+\]/g, '')
                .replace(/md:scale-\[[^\]]+\]/g, '')
                .replace(/lg:scale-\[[^\]]+\]/g, '')
                .replace(/xl:scale-\[[^\]]+\]/g, '')
                .replace(/transform/g, '')
                .replace(/origin-[a-z-]+/g, '');
            scaleWrapper.style.transform = 'none';
            
            await new Promise(r => setTimeout(r, 400)); 

            const dataUrl = await toJpeg(element, {
                quality: 0.85,    
                pixelRatio: 2,    
                backgroundColor: '#ffffff'
            });

            scaleWrapper.className = originalClassName;
            scaleWrapper.style.transform = originalTransform;

            const pdf = new jsPDF({
              orientation: 'p',
              unit: 'mm',
              format: 'a4',
              compress: true 
            });

            const imgProps = pdf.getImageProperties(dataUrl);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

            pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
            
            const suggestedName = filename ? `${filename}.pdf` : 'Certificate.pdf';

            if ('showSaveFilePicker' in window) {
              try {
                const opts = {
                  suggestedName: suggestedName,
                  types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }],
                };
                const handle = await window.showSaveFilePicker(opts);
                const writable = await handle.createWritable();
                await writable.write(pdf.output('blob'));
                await writable.close();
              } catch (err) {
                if (err.name !== 'AbortError') console.error(err);
              }
            } else {
              pdf.save(suggestedName); 
            }
        } catch (err) {
            console.error("PDF generation failed:", err);
            scaleWrapper.className = originalClassName;
            scaleWrapper.style.transform = originalTransform;
            alert(`PDF generation failed. Reason: ${err.message}`);
        } finally {
            document.body.style.cursor = 'default';
        }
    }
  };

  const handleEditCertificate = (e, cert) => {
    e.stopPropagation();
    setEditingCertId(cert.id); 

    setFormData({
      activeFirmId: firms.find(f => f.name === cert.vendor)?.id || firms[0]?.id || '',
      client: cert.party || '',
      address: getCustomerAddress(cert.party) || '', 
      serialNo: cert.ref || '',
      refillDate: fromDDMMYYYY(cert.date),
      validUpTo: fromDDMMYYYY(cert.validDate),
      submitBy: cert.submitName || staffList[0] || '',
      confirmBy: cert.confirmName || staffList[0] || '',
      collectedBy: cert.collectedName || '',
      amount: cert.total || '',
      payMethod: cert.payment || paymentMethods[0] || 'CASH'
    });
    if (cert.itemsData) {
      try { setTableData(JSON.parse(cert.itemsData)); } catch(err) { }
    }
    setViewMode('create');
  };

  const handleDeleteHistory = async (e, id) => {
    e.stopPropagation();
    if(confirm('Are you sure you want to delete this record?')) {
      let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
      allHistory = allHistory.filter(c => c.id !== id);
      localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
      setCertificates(allHistory.filter(b => b.docType === 'certificate'));
      setSelectedCertIds(selectedCertIds.filter(i => i !== id));

      try {
        await fetch(`${BACKEND_URL}/api/data/${id}`, { method: 'DELETE' });
        localStorage.removeItem(`shaney_certificate_${id}`);
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', { id, deleted: true, updatedAt: Date.now() });
        }
      } catch (err) {
        console.error("AWS delete certificate error:", err);
      }

      logActionToBackend(`Deleted Certificate Record`);
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedCertIds(filteredCertificates.map(c => c.id));
    } else {
      setSelectedCertIds([]);
    }
  };

  const handleSelectRow = (e, id) => {
    e.stopPropagation();
    if (e.target.checked) {
      setSelectedCertIds([...selectedCertIds, id]);
    } else {
      setSelectedCertIds(selectedCertIds.filter(item => item !== id));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedCertIds.length === 0) {
      alert('Please select at least one certificate to delete!');
      return;
    }
    if (confirm(`Are you sure you want to delete ${selectedCertIds.length} selected certificate(s)?`)) {
      let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
      allHistory = allHistory.filter(c => !selectedCertIds.includes(c.id));
      localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
      setCertificates(allHistory.filter(b => b.docType === 'certificate'));
      
      for (let id of selectedCertIds) {
        try { 
          await fetch(`${BACKEND_URL}/api/data/${id}`, { method: 'DELETE' });
          localStorage.removeItem(`shaney_certificate_${id}`);
        } catch(e){}
      }

      setSelectedCertIds([]);
      logActionToBackend(`Deleted multiple certificates`);
    }
  };

  const handleStatusChange = async (e, id, newStatus) => {
    e.stopPropagation();
    let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
    const idx = allHistory.findIndex(c => c.id === id);
    if (idx !== -1) {
      allHistory[idx].workStatus = newStatus;
      allHistory[idx].updatedAt = Date.now();
      localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
      setCertificates(allHistory.filter(b => b.docType === 'certificate'));
      try {
        const sanitized = sanitizeForCloud(allHistory[idx]);
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'certificates', id: String(id), data: sanitized })
        });
        localStorage.removeItem(`shaney_certificate_${id}`);
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', allHistory[idx]);
        }
      } catch (err) {
        console.error("AWS work status update error:", err);
      }
      logActionToBackend(`Updated status of ${allHistory[idx].ref} to ${newStatus}`);
    }
  };

  // 🟢 AUTOMATIC SYNC CUSTOMER TO ERP_Customers_v104 ON CERTIFICATE SAVE / IMPORT
  const syncCustomerToDirectory = async (partyName, phoneNum, addressStr) => {
    if (!partyName) return;
    try {
      let savedCusts = localStorage.getItem('ERP_Customers_v104');
      let customersList = savedCusts ? JSON.parse(savedCusts) : [];
      
      const cleanName = String(partyName).trim().toLowerCase();
      const existing = customersList.find(c => c.name && c.name.trim().toLowerCase() === cleanName);
      
      const currentTimestamp = Date.now();
      if (!existing) {
        const newCustObj = {
          id: 'cust_cert_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          docType: 'customer',
          name: String(partyName).trim(),
          address: addressStr || '',
          village: '',
          taluka: '',
          district: '',
          state: 'Gujarat',
          pincode: '',
          updatedAt: currentTimestamp,
          contacts: [
            {
              person: '',
              mobile: phoneNum ? String(phoneNum).trim() : '',
              type: 'Mobile',
              sameAsWhatsapp: true,
              whatsapp: phoneNum ? String(phoneNum).trim() : ''
            }
          ]
        };
        customersList.push(newCustObj);
        localStorage.setItem('ERP_Customers_v104', JSON.stringify(customersList));
        setCustomers(customersList);

        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'customers', id: String(newCustObj.id), data: newCustObj })
        });
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', newCustObj);
        }
      }
    } catch (err) {
      console.error("Error auto-syncing customer to directory:", err);
    }
  };

  const handleSaveCertificate = async (e, directAction = 'save') => {
    e.preventDefault();
    if (!formData.client || !formData.amount) {
      alert('Please enter Customer Name and Amount!');
      return;
    }
    
    let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
    
    if (editingCertId) {
      const isDuplicate = allHistory.some(c => c.docType === 'certificate' && c.vendor === activeFirmObj.name && c.ref === formData.serialNo && c.id !== editingCertId);
      if (isDuplicate) {
          alert(`⚠️ Certificate No. ${formData.serialNo} already exists! Please use a unique number.`);
          return;
      }
    } else {
      const isDuplicate = allHistory.some(c => c.docType === 'certificate' && c.vendor === activeFirmObj.name && c.ref === formData.serialNo);
      if (isDuplicate) {
          alert(`⚠️ Certificate No. ${formData.serialNo} already exists! Please use a unique number.`);
          return;
      }
    }

    const savedRefillDate = toDDMMYYYY(formData.refillDate);
    const savedValidUpTo = toDDMMYYYY(formData.validUpTo);
    const autoFy = getFinancialYear(formData.serialNo, savedRefillDate) || getCurrentFY();
    const isCredit = formData.payMethod.toLowerCase() === 'credit';
    
    const initialPaymentAmount = isCredit ? 0 : Number(formData.amount);
    const initialPayments = initialPaymentAmount > 0 ? [{ id: Date.now() + 1, amount: initialPaymentAmount, method: formData.payMethod, note: 'Initial payment on generation', date: toDDMMYYYY(getTodayISO()) }] : [];
    
    let targetCertId = editingCertId;
    const currentTimestamp = Date.now();
    let recordPayload = null;

    if (editingCertId) {
      const idx = allHistory.findIndex(x => x.id === editingCertId);
      if(idx !== -1) {
        recordPayload = sanitizeForCloud({
          ...allHistory[idx],
          ref: formData.serialNo,
          party: formData.client,
          date: savedRefillDate,
          validDate: savedValidUpTo,
          total: Number(formData.amount),
          payment: formData.payMethod,
          fy: autoFy,
          vendor: activeFirmObj.name,
          submitName: formData.submitBy,
          confirmName: formData.confirmBy,
          collectedName: formData.collectedBy,
          itemsData: JSON.stringify(tableData),
          updatedAt: currentTimestamp
        });
        allHistory[idx] = recordPayload;
        logActionToBackend(`Updated Certificate Ref: ${formData.serialNo} for ${formData.client}`);
      }
    } else {
      targetCertId = Date.now().toString();
      recordPayload = sanitizeForCloud({
        id: targetCertId,
        docType: 'certificate',
        ref: formData.serialNo,
        party: formData.client,
        date: savedRefillDate,
        validDate: savedValidUpTo,
        total: Number(formData.amount),
        payment: formData.payMethod,
        status: 'Completed',
        workStatus: 'New',
        whatsappSent: false,
        fy: autoFy,
        vendor: activeFirmObj.name,
        submitName: formData.submitBy,
        confirmName: formData.confirmBy,
        collectedName: formData.collectedBy,
        itemsData: JSON.stringify(tableData),
        payments: initialPayments,
        updatedAt: currentTimestamp
      });
      allHistory.push(recordPayload);
      logActionToBackend(`Created Certificate Ref: ${formData.serialNo} for ${formData.client}`);
    }

    localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
    setCertificates(allHistory.filter(b => b.docType === 'certificate'));

    // 🟢 Automatically transfer / sync customer to Customer tab directory
    await syncCustomerToDirectory(formData.client, '', formData.address);
    
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer && recordPayload) {
          await ipcRenderer.invoke('sqlite-save-record', recordPayload);
        }
      }
    } catch (err) {
      console.error("SQLite local save error:", err);
    }

    try {
      await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'certificates', id: String(targetCertId), data: recordPayload })
      });
    } catch (err) {
      console.error("AWS background save error:", err);
    }

    if (targetCertId) {
      localStorage.removeItem(`shaney_certificate_${targetCertId}`);
    }

    const finishSave = () => {
      const defaultItems = categories.reduce((acc, cat) => ({ ...acc, [cat]: [{ cap: "", qty: "" }] }), {});
      setFormData({ ...formData, client: '', address: '', amount: '' });
      setTableData({ hyTest: 'Pass', parts: 'COMPLETE', remark: 'OK', items: defaultItems });
      setEditingCertId(null);
      setViewMode('list');
    };

    if (directAction === 'print') {
      setTimeout(() => { executeDocumentAction('print', 'create-cert-print-area', formData.serialNo); finishSave(); }, 100);
    } else {
      alert(editingCertId ? '✅ Certificate Updated Successfully!' : '✅ Certificate Saved Successfully!');
      finishSave();
    }
  };

  const openPaymentModal = (e, cert) => {
    e.stopPropagation();
    setActiveCert(cert);
    setPaymentForm({ amount: '', method: paymentMethods[0] || 'CASH', note: '' });
    setIsPaymentModalOpen(true);
  };

  const handleAddPaymentEntry = async (e) => {
    e.preventDefault();
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) return;
    const allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
    const idx = allHistory.findIndex(c => c.id === activeCert.id);
    if (idx !== -1) {
      const newPayment = { id: Date.now(), amount: Number(paymentForm.amount), method: paymentForm.method, note: paymentForm.note, date: toDDMMYYYY(getTodayISO()) };
      if (!allHistory[idx].payments) allHistory[idx].payments = [];
      allHistory[idx].payments.push(newPayment);
      allHistory[idx].updatedAt = Date.now();
      
      const totalPaid = allHistory[idx].payments.reduce((s, p) => s + Number(p.amount), 0);
      if (totalPaid >= allHistory[idx].total) {
        allHistory[idx].payment = paymentForm.method;
      }

      localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
      setCertificates(allHistory.filter(b => b.docType === 'certificate'));
      setActiveCert(allHistory[idx]);
      setPaymentForm({ amount: '', method: paymentMethods[0] || 'CASH', note: '' });
      
      try {
        const sanitized = sanitizeForCloud(allHistory[idx]);
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'certificates', id: String(activeCert.id), data: sanitized })
        });
        localStorage.removeItem(`shaney_certificate_${activeCert.id}`);
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', allHistory[idx]);
        }
      } catch (err) {
        console.error("AWS payment add error:", err);
      }

      logActionToBackend(`Added Payment of ₹${paymentForm.amount} for ${activeCert.ref}`);
      alert('✅ Payment Added & Updated!');
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if(confirm('Are you sure you want to delete this payment receipt?')) {
      const allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
      const idx = allHistory.findIndex(c => c.id === activeCert.id);
      if (idx !== -1) {
        const updatedPayments = allHistory[idx].payments.filter(p => p.id !== paymentId);
        allHistory[idx].payments = updatedPayments;
        allHistory[idx].updatedAt = Date.now();
        
        const paidTotal = updatedPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        if (paidTotal < allHistory[idx].total) {
          allHistory[idx].payment = 'CREDIT';
        }

        localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
        setCertificates(allHistory.filter(b => b.docType === 'certificate'));
        setActiveCert(allHistory[idx]);
        
        try {
          const sanitized = sanitizeForCloud(allHistory[idx]);
          await fetch(`${BACKEND_URL}/api/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'certificates', id: String(activeCert.id), data: sanitized })
          });
          localStorage.removeItem(`shaney_certificate_${activeCert.id}`);
          if (window.require) {
            const { ipcRenderer } = window.require('electron');
            if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', allHistory[idx]);
          }
        } catch (err) {
          console.error("AWS payment delete error:", err);
        }

        logActionToBackend(`Deleted payment entry for ${activeCert.ref}`);
        alert('🗑️ Payment Receipt Deleted & Credit Updated!');
      }
    }
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredCertificates = certificates.filter(c => {
    const matchesSearch = (c.ref || '').toLowerCase().includes(searchTerm.toLowerCase()) || (c.party || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFirm = selectedFirm === 'All Firms' || c.vendor === selectedFirm;
    const matchesStatus = selectedStatus === 'All Status' || c.workStatus === selectedStatus;
    
    const rowFY = getFinancialYear(c.ref, c.date || c.validDate) || getCurrentFY();
    const matchesFY = filterFY === 'ALL' || rowFY === filterFY || rowFY.includes(filterFY);

    const dStr = c.date || c.validDate;
    let rowMonth = '';
    let rowYearNum = '';
    if (dStr) {
      let clean = String(dStr).trim();
      if (clean.includes('/')) clean = clean.replace(/\//g, '-');
      if (clean.includes('-')) {
        const parts = clean.split('-');
        if (parts[0].length === 4) {
          rowYearNum = parts[0];
          rowMonth = String(parseInt(parts[1], 10) - 1);
        } else if (parts[2] && parts[2].length === 4) {
          rowYearNum = parts[2];
          rowMonth = String(parseInt(parts[1], 10) - 1);
        }
      }
    }

    const matchesMonth = filterMonth === 'ALL' || rowMonth === String(filterMonth);
    const matchesYearNum = filterYearNum === 'ALL' || rowYearNum === String(filterYearNum);

    return matchesSearch && matchesFirm && matchesStatus && matchesFY && matchesMonth && matchesYearNum;
  }).sort((a, b) => {
    let aVal = a[sortConfig.key] || '';
    let bVal = b[sortConfig.key] || '';

    if (sortConfig.key === 'total') {
      aVal = Number(a.total || 0);
      bVal = Number(b.total || 0);
    } else {
      aVal = String(aVal);
      bVal = String(bVal);
    }

    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(filteredCertificates.length / rowsPerPage) || 1;
  const paginatedCertificates = filteredCertificates.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const summaryCount = filteredCertificates.length;
  const summaryValue = filteredCertificates.reduce((acc, c) => acc + Number(c.total || 0), 0);
  const summaryReceived = filteredCertificates.reduce((acc, c) => {
    const paid = c.payments ? c.payments.reduce((sum, p) => sum + Number(p.amount), 0) : 0;
    return acc + paid;
  }, 0);
  const summaryOutstanding = Math.max(0, summaryValue - summaryReceived);

  let createPayload = null;
  let drawerPayload = null;

  if (viewMode === 'create') {
     createPayload = {
      firmObj: activeFirmObj,
      design: currentDesign,
      party: formData.client,
      address: formData.address,
      date: toDDMMYYYY(formData.refillDate),
      ref: formData.serialNo,
      validDate: toDDMMYYYY(formData.validUpTo),
      items: tableData
     };
  }

  if (isPreviewOpen && activePreviewCert) {
     const dFirmObj = firms.find(f => f.name === activePreviewCert.vendor) || firms[0] || {};
     const dDesign = firmTemplates[dFirmObj.id] || currentDesign;
     drawerPayload = {
       firmObj: dFirmObj,
       design: dDesign,
       party: activePreviewCert.party,
       address: getCustomerAddress(activePreviewCert.party),
       date: activePreviewCert.date,
       ref: activePreviewCert.ref,
       validDate: activePreviewCert.validDate,
       items: activePreviewCert.itemsData ? JSON.parse(activePreviewCert.itemsData) : { hyTest: '-', parts: '-', remark: '-', items: {} }
     };
  }

  const renderA4Page = (payload, containerId, isEditable = false) => {
      if (!payload) return null;
      const { firmObj, design, party, address, date, ref, validDate, items } = payload;
      const graphics = design.graphics || {};
      
      const docS = design.docSize || 15.5;
      const thSize = Math.max(10, Math.floor(docS * 0.85));
      const tdSize = Math.max(10, Math.floor(docS * 0.75));

      return (
          <div 
            id={containerId}
            className="relative flex flex-col shrink-0 box-border p-8 shadow-2xl overflow-hidden"
            style={{ 
              backgroundColor: '#ffffff',
              width: '794px', height: '1123px', minWidth: '794px', minHeight: '1123px', maxWidth: '794px', maxHeight: '1123px',
              paddingTop: `${32 + (design.topMargin || 0)}px`,
              position: 'relative',
              zIndex: 0
            }}
          >
            <style dangerouslySetInnerHTML={{__html: `
              .cert-table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; font-family: ${design.docFont}, sans-serif; table-layout: fixed; word-break: break-word; background: transparent; }
              .cert-table th { padding: 4px; text-align: center; border: 1px solid #000; font-size: ${thSize}px; font-weight: bold; color: ${design.docColor}; font-style: ${design.docItalic ? 'italic' : 'normal'}; overflow: hidden; word-break: break-word; background: transparent; }
              .cert-table td { padding: 4px; text-align: center; border: 1px solid #000; font-size: ${tdSize}px; font-weight: ${design.docBold ? 'bold' : 'normal'}; color: ${design.docColor}; font-style: ${design.docItalic ? 'italic' : 'normal'}; text-decoration: ${design.docUnderline ? 'underline' : 'none'}; word-break: break-word; overflow-wrap: break-word; background: transparent; }
              .cert-table td.left-align { text-align: left; padding-left: 10px; }
            `}} />

            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1, pointerEvents: 'none' }}>
              {design.a4BgUrl && (
                <img src={design.a4BgUrl} alt="Background" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
              {Object.entries(graphics).map(([k, g]) => {
                if (!g || !g.url) return null;
                return <img key={k} src={g.url} alt={k} style={{ position: 'absolute', left: `${20 + (g.x || 0)}px`, top: `${20 + (g.y || 0)}px`, width: `${g.size || 80}px`, objectFit: 'contain' }} />;
              })}
            </div>

            <div className="flex h-full w-full pt-[20px] pb-[60px] pl-[10px] pr-[20px] flex-row relative" style={{ zIndex: 10 }}>
              
              {design.certPos !== 'none' && (
                <div className={design.certPos === 'top-center' ? 'absolute left-1/2 -translate-x-1/2 top-0 w-full text-center' : 'flex-shrink-0 flex flex-col items-center justify-start pt-[100px]'} style={{ width: design.certPos === 'top-center' ? '100%' : '70px', minWidth: design.certPos === 'top-center' ? 'auto' : '70px', transform: `translate(${design.certPosX}px, ${design.certPosY}px)` }}>
                  <div style={{ fontFamily: design.certFont, fontSize: `${design.certSize}px`, color: design.certColor, fontWeight: design.certBold ? '900' : 'normal', fontStyle: design.certItalic ? 'italic' : 'normal', textDecoration: design.certUnderline ? 'underline' : 'none', textAlign: 'center', lineHeight: '1' }}>
                    {design.certPos === 'top-center' ? <span>CERTIFICATE</span> : 'CERTIFICATE'.split('').map((char, i) => <div key={i} style={{ marginBottom: '8px', display: 'block' }}>{char}</div>)}
                  </div>
                </div>
              )}

              <div className="flex-grow flex flex-col pt-2 h-full z-20" style={{ width: design.certPos === 'top-center' ? '100%' : 'calc(100% - 70px)' }}>
                <div className="flex items-center mb-4 w-full pb-4 flex-shrink-0 mt-5 justify-between" style={{ borderBottom: `3px solid ${design.a4BgUrl ? 'transparent' : design.themeColor}` }}>
                  <div className="flex flex-col justify-center">
                    {!design.a4BgUrl && (
                      <h1 className="leading-none uppercase tracking-tight" style={{ fontFamily: design.headerFont, fontSize: `${design.headerSize}px`, color: design.headerColor, fontWeight: design.headerBold ? '900' : 'normal', fontStyle: design.headerItalic ? 'italic' : 'normal', textDecoration: design.headerUnderline ? 'underline' : 'none' }}>
                        {firmObj.name}
                      </h1>
                    )}
                    <div className="mt-1 flex items-center h-5">
                      {!design.a4BgUrl && <p className="font-black tracking-wider" style={{ fontSize: '14px', color: '#dc2626' }}>Fire And Safety</p>}
                    </div>
                  </div>
                  <div className="text-right self-end" style={{ fontFamily: design.docFont, fontSize: `${Math.max(10, docS - 3)}px`, color: design.docColor, fontWeight: design.docBold ? 'bold' : 'normal', fontStyle: design.docItalic ? 'italic' : 'normal', textDecoration: design.docUnderline ? 'underline' : 'none' }}>
                    <p>Date :- <span>{date || 'DD-MM-YYYY'}</span></p>
                    <p>SR.No :- <span onClick={() => { if(isEditable) { const newRef = prompt("Edit Ref No:", ref); if (newRef) setFormData({...formData, serialNo: newRef}); } }} className={isEditable ? "cursor-pointer" : ""} title={isEditable ? "Edit" : ""}>
                      {ref || '-----'}
                    </span></p>
                  </div>
                </div>

                {design.a4BgUrl && <div className="h-10"></div>}

                <div className="w-full mb-4 leading-[1.6] pl-[5mm] pr-[15px] flex-shrink-0">
                  <p style={{ fontFamily: design.docFont, color: design.docColor, fontSize: `${docS}px`, fontWeight: design.docBold ? 'bold' : 'normal', fontStyle: design.docItalic ? 'italic' : 'normal', textDecoration: design.docUnderline ? 'underline' : 'none' }}>
                    Certified M/s:- <span className="ml-2 uppercase" style={{ fontFamily: design.custFont, fontSize: `${design.custSize}px`, color: design.custColor, fontWeight: design.custBold ? 'bold' : 'normal', fontStyle: design.custItalic ? 'italic' : 'normal', textDecoration: design.custUnderline ? 'underline' : 'none' }}>{party || 'CUSTOMER NAME'}</span>
                  </p>
                  <p className="mt-1" style={{ fontFamily: design.docFont, color: design.docColor, fontSize: `${docS}px`, fontWeight: design.docBold ? 'bold' : 'normal', fontStyle: design.docItalic ? 'italic' : 'normal', textDecoration: design.docUnderline ? 'underline' : 'none' }}>
                    Address :- <span className="ml-2 uppercase" style={{ fontFamily: design.custFont, fontSize: `${design.custSize}px`, color: design.custColor, fontWeight: design.custBold ? 'bold' : 'normal', fontStyle: design.custItalic ? 'italic' : 'normal', textDecoration: design.custUnderline ? 'underline' : 'none' }}>{address || 'Address'}</span>
                  </p>
                </div>

                <div className="w-full leading-[1.5] mb-4 text-center px-4 flex-shrink-0" style={{ fontFamily: design.docFont, color: design.docColor, fontSize: `${docS}px`, fontWeight: design.docBold ? 'bold' : 'normal', fontStyle: design.docItalic ? 'italic' : 'normal', textDecoration: design.docUnderline ? 'underline' : 'none' }}>
                  <p>We certify that the fire extinguishers mentioned below</p>
                  <p>Are tested and refilled as per the relevant Indian standard.</p>
                  <p>This extinguishers are refilled on Date :- <span className="font-mono" style={{ color: '#dc2626' }}>{date || 'DD-MM-YYYY'}</span></p>
                  <p>And Warranty will stand valid up to Date :- <span className="font-mono" style={{ color: '#dc2626' }}>{validDate || 'DD-MM-YYYY'}</span></p>
                  <p>Provided the seal is unbroken and in satisfactory condition.</p>
                </div>

                <div className="w-full pr-[5mm] flex-shrink-0 z-30 relative">
                  <table className="cert-table">
                    <thead>
                      <tr>
                        <th style={{ width: '45%' }}>Extinguisher Type</th>
                        <th style={{ width: '30%' }}>Capacity</th>
                        <th style={{ width: '25%' }}>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="left-align" style={{ fontStyle: 'italic', fontWeight: 'bold' }}>Hy. Test</td>
                        <td colSpan="2" style={{ fontWeight: 'bold' }}>{items.hyTest}</td>
                      </tr>
                      <tr>
                        <td className="left-align" style={{ fontStyle: 'italic', fontWeight: 'bold' }}>Parts</td>
                        <td colSpan="2" style={{ fontWeight: 'bold' }}>{items.parts}</td>
                      </tr>
                      <tr>
                        <td className="left-align" style={{ fontStyle: 'italic', fontWeight: 'bold' }}>Remark</td>
                        <td colSpan="2" style={{ fontWeight: 'bold' }}>{items.remark}</td>
                      </tr>
                      {categories.map((cat) => {
                        const rows = items.items && items.items[cat] ? items.items[cat].filter(r => r.cap || r.qty) : [];
                        const capStr = rows.map(r => r.cap).filter(Boolean).join(', ');
                        const qtyStr = rows.map(r => r.qty).filter(Boolean).join(' + ');
                        
                        return (
                          <tr key={cat}>
                            <td className="left-align" style={{ fontWeight: '500', fontStyle: 'italic' }}>{cat}</td>
                            <td style={{ fontWeight: 'bold' }}>{capStr}</td>
                            <td style={{ fontWeight: 'bold' }}>{qtyStr}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-auto pt-4 flex justify-between items-end z-20 relative">
                  <div className="font-mono" style={{ fontSize: `${Math.max(9, Math.floor(docS * 0.65))}px`, color: '#64748b' }}>
                    {!design.a4BgUrl && (
                      <>
                        <p>{firmObj.address}</p>
                        <p>{firmObj.contact}</p>
                      </>
                    )}
                  </div>
                  <div 
                    className="ml-auto text-center min-w-[220px]" 
                    style={{ 
                      fontFamily: design.sigFont || 'Arial', 
                      color: design.sigColor || '#000000',
                      transform: `translate(${design.sigX || 0}px, ${design.sigY || 0}px)`
                    }}
                  >
                    <p style={{ 
                      fontSize: `${design.sigSize || 14}px`, 
                      fontWeight: design.sigBold ? '900' : 'normal', 
                      fontStyle: design.sigItalic ? 'italic' : 'normal',
                      textDecoration: design.sigUnderline ? 'underline' : 'none',
                      wordBreak: 'break-word',
                      lineHeight: '1.2'
                    }}>
                      For {firmObj.name}
                    </p>
                    <div className="h-12"></div>
                    <p style={{ 
                      fontSize: `${design.sigSize || 14}px`, 
                      fontWeight: design.sigBold ? '900' : 'normal', 
                      fontStyle: design.sigItalic ? 'italic' : 'normal',
                      textDecoration: design.sigUnderline ? 'underline' : 'none'
                    }}>
                      Authorised Signature
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
      );
  };

  return (
    <div id="tab-certificate" className="tab-content active h-[calc(100vh-65px)] w-full relative bg-slate-100 overflow-y-auto custom-scrollbar p-4 md:p-6 animate-[fadeIn_0.3s_ease-in-out]">
      <div className="max-w-7xl mx-auto pb-10">

        {isPreviewOpen && activePreviewCert && (
          <div className="fixed inset-0 z-[9999] flex justify-end bg-slate-900/70 backdrop-blur-sm transition-all duration-300">
            <div className="w-[850px] max-w-full h-full bg-slate-100 flex flex-col shadow-2xl animate-[slideInRight_0.3s]">
              <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0 shadow-sm z-10">
                <h2 className="font-black text-slate-800 text-sm tracking-widest uppercase flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-600 inline-block shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Document Viewer
                </h2>
                <button onClick={() => setIsPreviewOpen(false)} className="text-slate-400 hover:text-red-500 font-bold text-2xl leading-none">&times;</button>
              </div>

              <div className="flex-1 bg-slate-500 overflow-y-auto overflow-x-hidden flex justify-center items-start py-4 sm:py-8 w-full custom-scrollbar">
                <div className="origin-top transform scale-[0.4] sm:scale-[0.55] md:scale-[0.7] lg:scale-[0.95] transition-transform drop-shadow-2xl mb-[50px] sm:mb-[100px]">
                    {renderA4Page(drawerPayload, 'drawer-cert-print-area', false)}
                </div>
              </div>

              <div className="p-4 bg-white border-t border-slate-200 flex justify-between items-center shrink-0 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex-wrap gap-3">
                <button onClick={() => setIsPreviewOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-lg text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1.5">
                  <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                  Close
                </button>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button onClick={(e) => handleWhatsAppSend(e, activePreviewCert, 'doc')} className="flex-1 sm:flex-none bg-[#25D366] text-white hover:bg-green-600 px-5 py-2.5 rounded-lg text-xs font-black uppercase transition-all shadow-md flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                    WhatsApp
                  </button>
                  <button onClick={() => {
                    const cleanParty = (activePreviewCert.party || 'Customer').replace(/[^a-zA-Z0-9-_]/g, '_');
                    const cleanRef = (activePreviewCert.ref || 'Cert').replace(/[^a-zA-Z0-9-_]/g, '_');
                    executeDocumentAction('pdf', 'drawer-cert-print-area', `${cleanParty}_${cleanRef}`);
                  }} className="flex-1 sm:flex-none bg-[#facc15] text-white hover:bg-yellow-500 px-5 py-2.5 rounded-lg text-xs font-black uppercase transition-all shadow-md flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                    Save PDF
                  </button>
                  <button onClick={() => executeDocumentAction('print', 'drawer-cert-print-area', '')} className="flex-1 sm:flex-none bg-[#00a67e] text-white hover:bg-emerald-600 px-6 py-2.5 rounded-lg text-xs font-black uppercase transition-all shadow-md flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
                    Print
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 🟢 MOBILE SLIDING DRAWER PREVIEW */}
        {isMobilePreviewOpen && (
          <div className="fixed inset-0 z-[99999] flex flex-col justify-end bg-slate-900/70 backdrop-blur-sm transition-all duration-300 lg:hidden">
            <div className="w-full h-[90vh] bg-slate-100 rounded-t-3xl flex flex-col shadow-2xl overflow-hidden animate-[slideUp_0.3s]">
              <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0 shadow-sm z-10">
                <h2 className="font-black text-slate-800 text-sm tracking-widest uppercase flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg> LIVE DOCUMENT PREVIEW
                </h2>
                <button onClick={() => setIsMobilePreviewOpen(false)} className="text-slate-400 hover:text-red-500 font-bold text-2xl leading-none">&times;</button>
              </div>
              <div className="flex-1 bg-slate-500 overflow-y-auto overflow-x-hidden flex justify-center items-start py-4 w-full custom-scrollbar">
                <div className="origin-top transform scale-[0.45] transition-transform drop-shadow-2xl mb-10">
                  {renderA4Page(createPayload, 'mobile-drawer-preview-area', false)}
                </div>
              </div>
              <div className="p-4 bg-white border-t border-slate-200 flex justify-end items-center shrink-0 z-10">
                <button onClick={() => setIsMobilePreviewOpen(false)} className="w-full bg-slate-800 hover:bg-slate-900 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer">
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'create' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 w-full flex flex-col gap-4 max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar">
              <div className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                <h4 className="font-black text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-indigo-600 inline-block shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  {editingCertId ? 'Edit Certificate' : 'Certificate Entry'}
                </h4>
                
                <div className="flex items-center gap-2">
                  <button 
                    type="button" 
                    onClick={() => setIsMobilePreviewOpen(true)} 
                    className="lg:hidden bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold text-xs px-3 py-2 rounded-lg uppercase transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                    title="Preview A4 Document"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span>Preview</span>
                  </button>

                  <button type="button" onClick={() => { setViewMode('list'); setEditingCertId(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2 rounded-lg uppercase tracking-widest transition-colors shadow-sm flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg> Back
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveCertificate} className="flex flex-col gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-1.5">1. Active Firm</label>
                      <select 
                        value={formData.activeFirmId} 
                        onChange={(e) => setFormData({...formData, activeFirmId: e.target.value})} 
                        className="pro-input border-emerald-300 bg-emerald-50 text-emerald-900 shadow-inner font-bold cursor-pointer"
                      >
                        {firms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </div>
                    
                    <div className="relative">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex justify-between">
                        <span>2. Certified M/s (Customer)</span>
                      </label>
                      <input 
                        type="text" 
                        list="certCustomerList"
                        placeholder="Customer Name..." 
                        value={formData.client} 
                        onChange={handleCustomerChange} 
                        className="pro-input border-slate-300 bg-white shadow-inner font-bold" 
                        required 
                      />
                      <datalist id="certCustomerList">
                        {customers && customers.length > 0 ? customers.map(c => <option key={c.id || c.name} value={c.name} />) : null}
                      </datalist>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Refill Date</label>
                        <input 
                          type="date" 
                          value={formData.refillDate} 
                          onChange={(e) => {
                            const newDate = e.target.value;
                            setFormData({
                              ...formData, 
                              refillDate: newDate,
                              validUpTo: add364DaysISO(newDate)
                            });
                          }} 
                          className="pro-input font-mono shadow-inner font-bold text-slate-700 uppercase" 
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Valid Upto</label>
                        <input 
                          type="date" 
                          value={formData.validUpTo} 
                          onChange={(e) => setFormData({...formData, validUpTo: e.target.value})} 
                          className="pro-input font-mono shadow-inner font-bold text-slate-700 uppercase" 
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <h4 className="font-black text-xs text-[#00a67e] uppercase mb-4 border-b border-slate-100 pb-3 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-emerald-600 inline-block shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                    Extinguisher Details
                  </h4>
                  
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Hy.Test</label>
                      <input type="text" value={tableData.hyTest} onChange={(e) => setTableData({...tableData, hyTest: e.target.value})} className="pro-input text-xs font-bold bg-white" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Parts</label>
                      <input type="text" value={tableData.parts} onChange={(e) => setTableData({...tableData, parts: e.target.value})} className="pro-input text-xs font-bold bg-white" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Remark</label>
                      <input type="text" value={tableData.remark} onChange={(e) => setTableData({...tableData, remark: e.target.value})} className="pro-input text-xs font-bold bg-white" />
                    </div>
                  </div>

                  <datalist id="certCapacityList">
                    {capacities.map(cap => <option key={cap} value={cap} />)}
                  </datalist>

                  <div className="flex flex-col gap-3">
                    {categories.map(cat => (
                      <div key={cat} className="mb-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-black text-[11px] text-slate-800 uppercase tracking-wider">{cat}</h4>
                          <button type="button" onClick={() => addCapRow(cat)} className="bg-slate-800 text-white px-3 py-1 rounded font-bold text-[9px] uppercase tracking-widest hover:bg-slate-700 transition-colors shadow-sm">
                            + Add Extra
                          </button>
                        </div>
                        <div>
                          {(tableData.items[cat] || []).map((row, idx) => (
                            <div key={idx} className="flex items-center gap-3 mb-2 bg-white p-2 rounded border border-slate-200 shadow-sm">
                              <input type="text" list="certCapacityList" value={row.cap} onChange={(e) => updateCapRow(cat, idx, 'cap', e.target.value)} className="pro-input text-[11px] w-[110px] py-1.5 font-bold text-center bg-slate-50 shadow-inner" placeholder="Capacity" />
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Qty</span>
                              <input type="text" value={row.qty} onChange={(e) => updateCapRow(cat, idx, 'qty', e.target.value)} className="pro-input text-[11px] w-[50px] py-1.5 text-center font-mono font-bold bg-slate-50 shadow-inner" placeholder="Qty" />
                              {idx > 0 && (
                                <button type="button" onClick={() => removeCapRow(cat, idx)} className="text-red-400 hover:text-red-600 text-[10px] ml-auto px-2 font-black" title="Remove Row">✕</button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-b-4 border-b-[#00a67e]">
                  <h4 className="font-black text-xs text-slate-800 uppercase mb-4 border-b border-slate-100 pb-3 flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-slate-700 inline-block shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                    Job Details & Actions
                  </h4>
                  
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Submit By</label>
                      <select value={formData.submitBy} onChange={(e) => setFormData({...formData, submitBy: e.target.value})} className="pro-input text-xs font-bold bg-white">
                        {Array.from(new Set([...staffList, formData.submitBy].filter(Boolean))).map(s => <option key={`sub-${s}`} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Confirm By</label>
                      <select value={formData.confirmBy} onChange={(e) => setFormData({...formData, confirmBy: e.target.value})} className="pro-input text-xs font-bold bg-white">
                        {Array.from(new Set([...staffList, formData.confirmBy].filter(Boolean))).map(s => <option key={`con-${s}`} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Collected By</label>
                      <select value={formData.collectedBy} onChange={(e) => setFormData({...formData, collectedBy: e.target.value})} className="pro-input text-xs font-bold bg-white">
                        {Array.from(new Set([...staffList, formData.collectedBy].filter(Boolean))).map(s => <option key={`col-${s}`} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-5 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Amount (₹)</label>
                      <div className="relative">
                        <input type="number" placeholder="Total Amount" value={formData.amount} onChange={(e) => setFormData({...formData, amount: e.target.value})} className="pro-input text-xs font-mono pr-7 text-left font-bold bg-white" required />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Payment Type</label>
                      <select value={formData.payMethod} onChange={(e) => setFormData({...formData, payMethod: e.target.value})} className="pro-input text-xs font-bold text-slate-700 bg-white">
                        {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                    <button type="button" onClick={() => { setViewMode('list'); setEditingCertId(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-lg text-xs font-black uppercase transition-all shadow-sm">
                      Cancel
                    </button>
                    <div className="flex gap-2">
                      <button type="button" onClick={(e) => handleSaveCertificate(e, 'print')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center gap-1.5">
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
                        <span className="hidden sm:inline">Save & Print</span>
                      </button>
                      <button type="submit" onClick={(e) => handleSaveCertificate(e, 'save')} className={`${editingCertId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-[#00a67e] hover:bg-emerald-600'} text-white px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center gap-1.5`}>
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
                        <span className="hidden sm:inline">{editingCertId ? 'Update' : 'Save'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* FIXED NON-SCROLLING HORIZONTAL PREVIEW CONTAINER */}
            <div className="hidden lg:flex lg:col-span-7 bg-slate-300 p-6 rounded-2xl shadow-inner border border-slate-400 justify-center items-center overflow-y-auto overflow-x-hidden h-[78vh] w-full custom-scrollbar relative">
              <div className="m-auto flex justify-center items-center py-10 w-full">
                <div className="origin-center transform scale-[0.5] sm:scale-[0.6] md:scale-[0.7] lg:scale-[0.65] xl:scale-[0.75] transition-transform shadow-2xl bg-white">
                    {renderA4Page(createPayload, 'create-cert-print-area', false)}
                </div>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'list' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            
            {/* 🟢 EXACT TWO-ROW COMPACT FILTER BAR MATCHING USER DRAWING */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-3 mb-4">
              
              {/* Row 1: Certificate Title, Summary Button, All Years, All Months (Left) | Search bar (Right) */}
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3 shrink-0">
                  <h2 className="flex items-center gap-2 text-sm font-black uppercase text-slate-800 tracking-wider">
                    CERTIFICATE
                  </h2>
                  <button 
                    onClick={() => setShowSummary(prev => !prev)} 
                    className="bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 p-1.5 px-3 rounded-lg font-bold text-xs uppercase tracking-wider shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <svg className="w-3.5 h-3.5 text-blue-600 inline-block shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg> 
                    SUMMARY
                  </button>

                  <select value={filterYearNum} onChange={(e) => setFilterYearNum(e.target.value)} style={{ width: '110px' }} className="pro-input py-2 px-2 text-xs shadow-sm font-bold text-slate-700 cursor-pointer bg-white shrink-0">
                    <option value="ALL">All Years</option>
                    {availableYears.map(yr => <option key={yr} value={yr}>{yr}</option>)}
                  </select>

                  <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} style={{ width: '130px' }} className="pro-input py-2 px-2 text-xs shadow-sm font-bold text-slate-700 cursor-pointer bg-white shrink-0">
                    <option value="ALL">All Months</option>
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, idx) => (
                      <option key={idx} value={idx}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="relative w-[220px] shrink-0">
                  <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search..." className="w-full text-xs py-2 pl-8 pr-3 rounded-lg border border-slate-300 bg-slate-50 outline-none font-medium shadow-inner" />
                  <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                </div>
              </div>

              {/* Row 2: All Firms, All F.Y., All Status (Left) | Delete & + ADD Button (Right) */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 shrink-0">
                  <select value={selectedFirm} onChange={(e) => setSelectedFirm(e.target.value)} style={{ width: '160px' }} className="pro-input py-2 px-3 text-xs shadow-sm font-bold text-slate-700 cursor-pointer bg-white shrink-0">
                    <option value="All Firms">All Firms</option>
                    {firms.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                  </select>

                  <select value={filterFY} onChange={(e) => setFilterFY(e.target.value)} style={{ width: '130px' }} className="pro-input py-2 px-3 text-xs shadow-sm font-bold text-slate-700 cursor-pointer bg-white shrink-0">
                    <option value="ALL">All F.Y.</option>
                    {availableFYs.map(fy => <option key={fy} value={fy}>{fy}</option>)}
                  </select>

                  <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} style={{ width: '130px' }} className="pro-input py-2 px-2 text-xs shadow-sm font-bold text-slate-700 cursor-pointer bg-white shrink-0">
                    <option value="All Status">All Status</option>
                    <option value="New">🔵 New</option>
                    <option value="Pending">🔴 Pending</option>
                    <option value="In-Work">🟡 In-Work</option>
                    <option value="Completed">🟢 Completed</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {selectedCertIds.length > 0 && (
                    <button onClick={handleDeleteSelected} className="bg-red-500 hover:bg-red-600 text-white font-black text-xs px-3 py-2 rounded-lg shadow-md transition-all uppercase tracking-wider shrink-0 cursor-pointer flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                      Delete ({selectedCertIds.length})
                    </button>
                  )}

                  <button onClick={() => {
                    const defaultItems = categories.reduce((acc, cat) => ({ ...acc, [cat]: [{ cap: "", qty: "" }] }), {});
                    setFormData({
                      activeFirmId: firms.length > 0 ? firms[0].id : '',
                      client: '', address: '', serialNo: '', refillDate: getTodayISO(),
                      validUpTo: add364DaysISO(getTodayISO()), submitBy: staffList[0] || '', confirmBy: staffList[0] || '',
                      collectedBy: staffList[0] || '', amount: '', payMethod: paymentMethods[0] || 'CASH'
                    });
                    setTableData({ hyTest: 'Pass', parts: 'COMPLETE', remark: 'OK', items: defaultItems });
                    setEditingCertId(null);
                    setViewMode('create');
                  }} className="bg-[#00a67e] hover:bg-emerald-600 text-white font-black text-xs px-4 py-2 rounded-lg shadow-md transition-all flex items-center gap-1.5 uppercase active:scale-95 shrink-0 cursor-pointer">
                    <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> <span>ADD</span>
                  </button>
                </div>
              </div>

            </div>

            {showSummary && (
                <div className="w-full p-4 shrink-0 bg-slate-50 border-b border-slate-200">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm max-w-4xl mx-auto">
                        <div className="text-center border-r border-slate-100">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Transactions</p>
                            <p className="text-xl font-black text-slate-800 mt-1">{summaryCount}</p>
                        </div>
                        <div className="text-center border-r border-slate-100">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Value</p>
                            <p className="text-xl font-black text-emerald-600 font-mono mt-1">₹ {summaryValue.toFixed(2)}</p>
                        </div>
                        <div className="text-center border-r border-slate-100">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Received</p>
                            <p className="text-xl font-black text-blue-600 font-mono mt-1">₹ {summaryReceived.toFixed(2)}</p>
                        </div>
                        <div className="text-center">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Outstanding</p>
                            <p className="text-xl font-black text-red-600 font-mono mt-1">₹ {summaryOutstanding.toFixed(2)}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* 🟢 DESKTOP TABLE VIEW */}
            <div className="hidden md:block overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">
                    <th className="py-4 px-4 w-12 text-center">
                      <input 
                        type="checkbox" 
                        onChange={handleSelectAll} 
                        checked={filteredCertificates.length > 0 && selectedCertIds.length === filteredCertificates.length} 
                        className="accent-[#00a67e]" 
                      />
                    </th>
                    <th className="py-4 px-4 cursor-pointer hover:text-slate-800 whitespace-nowrap" onClick={() => handleSort('ref')}>CERTIFICATE NO ↕</th>
                    <th className="py-4 px-4 cursor-pointer hover:text-slate-800 whitespace-nowrap" onClick={() => handleSort('party')}>COMPANY NAME ↕</th>
                    <th className="py-4 px-4 cursor-pointer hover:text-slate-800 whitespace-nowrap" onClick={() => handleSort('date')}>DATE ↕</th>
                    <th className="py-4 px-4 text-right cursor-pointer hover:text-slate-800 whitespace-nowrap" onClick={() => handleSort('total')}>TOTAL ↕</th>
                    <th className="py-4 px-4 text-center whitespace-nowrap">PAY TYPE</th>
                    <th className="py-4 px-4 text-right whitespace-nowrap">OUTSTANDING</th>
                    <th className="py-4 px-4 text-center whitespace-nowrap">STATUS</th>
                    <th className="py-4 px-4 text-center whitespace-nowrap">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium">
                  {paginatedCertificates.map(c => {
                    const outstandingAmt = getOutstanding(c);
                    const isCredit = (c.payment || '').toLowerCase() === 'credit';
                    const isRenewed = hasBeenRenewed(c);
                    return (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <input 
                            type="checkbox" 
                            checked={selectedCertIds.includes(c.id)} 
                            onChange={(e) => handleSelectRow(e, c.id)} 
                            className="accent-[#00a67e]" 
                          />
                        </td>
                        <td className="py-3 px-4 font-mono font-black text-slate-700 whitespace-nowrap">{c.ref}</td>
                        <td className="py-3 px-4 font-black text-slate-900 uppercase whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{c.party}</span>
                            {c.whatsappSent && (
                              <span className="inline-flex items-center bg-green-100 text-green-700 p-0.5 rounded" title="WhatsApp Sent">
                                <svg className="w-3 h-3 fill-current text-green-600 shrink-0" viewBox="0 0 24 24">
                                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                                </svg>
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">{c.vendor}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">{c.date}</td>
                        <td className="py-3 px-4 font-mono font-black text-slate-800 text-right whitespace-nowrap">₹{(c.total || 0).toFixed(2)}</td>
                        <td className="py-3 px-4 font-bold text-center whitespace-nowrap">
                          <button onClick={(e) => openPaymentModal(e, c)} className={`px-2 py-1 rounded-md text-[10px] uppercase tracking-wider hover:shadow-sm transition-all flex items-center justify-center gap-1 w-full mx-auto ${isCredit ? 'text-red-600 bg-red-50 border border-red-200 font-black' : 'text-slate-600 bg-white border border-slate-200 shadow-sm'}`}>
                            {c.payment}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-700 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <span>₹{outstandingAmt}</span>
                            {Number(outstandingAmt) > 0 && (
                              <button 
                                onClick={(e) => handleWhatsAppSend(e, c, 'payment')} 
                                className="bg-amber-100 hover:bg-amber-200 text-amber-700 p-1 rounded shadow-sm transition-all" 
                                title="Send Due Reminder via WhatsApp"
                              >
                                <svg className="w-3.5 h-3.5 text-amber-700 inline-block shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <select 
                            value={c.workStatus || 'New'} 
                            onChange={(e) => handleStatusChange(e, c.id, e.target.value)} 
                            className="text-[10px] font-black uppercase px-2 py-1.5 rounded border outline-none cursor-pointer w-full text-center bg-blue-50 text-blue-700 border-blue-200"
                          >
                            <option value="New">🔵 New</option>
                            <option value="Pending">🔴 Pending</option>
                            <option value="In-Work">🟡 In-Work</option>
                            <option value="Completed">🟢 Completed</option>
                          </select>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {c.reminderDone && !isRenewed && (
                              <button 
                                onClick={(e) => toggleSingleReminderStatus(e, c.id, false)} 
                                className="bg-amber-100 hover:bg-amber-200 text-amber-700 p-1.5 rounded-lg shadow-sm transition-all flex items-center justify-center cursor-pointer" 
                                title="Undo Reminder (Reactivate)"
                              >
                                <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 512 512">
                                  <path d="M125.7 160H176c17.7 0 32 14.3 32 32s-14.3 32-32 32H48c-17.7 0-32-14.3-32-32V64c0-17.7 14.3-32 32-32s32 14.3 32 32v51.2L108.5 95.7C150.3 55.4 207 32 266.7 32c119.5 0 216.5 97 216.5 216.5s-97 216.5-216.5-216.5c-59.7 0-116.4 23.4-158.2 63.7l-30.2 29.5c-12.5 12.2-12.8 32.2-.6 44.7s32.2 12.8 44.7 .6l30.2-29.5z"/>
                                </svg>
                              </button>
                            )}
                            <button onClick={(e) => handleViewCertificate(e, c)} className="flex items-center gap-1 text-slate-600 hover:text-blue-600 bg-white hover:bg-blue-50 border border-slate-200 px-2 py-1.5 rounded transition-colors shadow-sm font-bold" title="View">
                              <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3 z"/></svg>
                              VIEW
                            </button>
                            <button onClick={(e) => handleEditCertificate(e, c)} className="flex items-center gap-1 text-slate-600 hover:text-orange-600 bg-white hover:bg-orange-50 border border-slate-200 px-2 py-1.5 rounded transition-colors shadow-sm font-bold" title="Edit">
                              <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                              EDIT
                            </button>
                            <button onClick={(e) => handleWhatsAppSend(e, c, 'doc')} className="flex items-center gap-1 bg-[#25D366] hover:bg-green-600 text-white px-2 py-1.5 rounded transition-colors shadow-sm font-bold text-[10px]" title="Send WhatsApp">
                              <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24">
                                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                              </svg>
                              WA
                            </button>
                            <button onClick={(e) => handleDeleteHistory(e, c.id)} className="flex items-center gap-1 text-slate-600 hover:text-red-600 bg-white hover:bg-red-50 border border-slate-200 px-2 py-1.5 rounded transition-colors shadow-sm font-bold" title="Delete">
                              <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                              DEL
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredCertificates.length === 0 && (
                     <tr><td colSpan="9" className="text-center py-10 text-slate-400 font-bold italic">No records found.</td></tr>
                  )}
                </tbody>
              </table>

              {/* 🟢 Desktop Pagination Controls */}
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
                    onChange={handleSelectAll} 
                    checked={filteredCertificates.length > 0 && selectedCertIds.length === filteredCertificates.length} 
                    className="accent-[#00a67e] w-4 h-4 cursor-pointer" 
                  />
                  <span>Select All ({filteredCertificates.length})</span>
                </label>
                {selectedCertIds.length > 0 && (
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                    {selectedCertIds.length} Selected
                  </span>
                )}
              </div>

              {paginatedCertificates.length === 0 ? (
                <div className="text-center py-16 text-slate-400 font-bold italic text-xs">
                  No records found.
                </div>
              ) : (
                paginatedCertificates.map(c => {
                  const outstandingAmt = getOutstanding(c);
                  const isCredit = (c.payment || '').toLowerCase() === 'credit';
                  const isRenewed = hasBeenRenewed(c);
                  return (
                    <div 
                      key={c.id} 
                      onClick={(e) => handleEditCertificate(e, c)}
                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3 active:scale-[0.99] transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2.5">
                          <input 
                            type="checkbox" 
                            checked={selectedCertIds.includes(c.id)} 
                            onChange={(e) => handleSelectRow(e, c.id)} 
                            onClick={(e) => e.stopPropagation()}
                            className="accent-[#00a67e] w-4 h-4 cursor-pointer" 
                          />
                          <span className="font-mono font-black text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{c.ref}</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{c.vendor}</span>
                      </div>

                      <div>
                        <div className="flex items-center justify-between">
                          <h4 className="font-black text-slate-900 text-sm uppercase">{c.party}</h4>
                          {c.whatsappSent && (
                            <span className="inline-flex items-center bg-green-100 text-green-700 p-1 rounded" title="WhatsApp Sent">
                              <svg className="w-3.5 h-3.5 fill-current text-green-600 shrink-0 inline" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-mono font-bold text-slate-500 mt-0.5">Date: {c.date}</p>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase block">Total</span>
                          <span className="font-mono font-black text-slate-800 text-xs">₹{(c.total || 0).toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase block">Pay Type</span>
                          <button onClick={(e) => openPaymentModal(e, c)} className={`mt-0.5 px-2 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold mx-auto block ${isCredit ? 'text-red-600 bg-red-50 border border-red-200' : 'text-slate-700 bg-white border border-slate-200'}`}>
                            {c.payment}
                          </button>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase block">Outstanding</span>
                          <div className="flex items-center justify-center gap-1">
                            <span className="font-mono font-black text-red-600 text-xs">₹{outstandingAmt}</span>
                            {Number(outstandingAmt) > 0 && (
                              <button 
                                onClick={(e) => handleWhatsAppSend(e, c, 'payment')} 
                                className="bg-amber-100 hover:bg-amber-200 text-amber-700 p-0.5 rounded text-[10px]" 
                                title="Send Due Reminder via WhatsApp"
                              >
                                <svg className="w-3.5 h-3.5 text-amber-700 inline-block shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div onClick={(e) => e.stopPropagation()} className="w-full">
                        <select 
                          value={c.workStatus || 'New'} 
                          onChange={(e) => handleStatusChange(e, c.id, e.target.value)} 
                          className="text-xs font-black uppercase px-3 py-2 rounded-lg border outline-none cursor-pointer w-full text-center bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
                        >
                          <option value="New">🔵 New</option>
                          <option value="Pending">🔴 Pending</option>
                          <option value="In-Work">🟡 In-Work</option>
                          <option value="Completed">🟢 Completed</option>
                        </select>
                      </div>

                      <div className="flex items-center justify-between gap-1 pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                        {c.reminderDone && !isRenewed && (
                          <button 
                            onClick={(e) => toggleSingleReminderStatus(e, c.id, false)} 
                            className="bg-amber-100 hover:bg-amber-200 text-amber-700 p-2 rounded-lg text-xs font-bold flex items-center justify-center shrink-0" 
                            title="Undo Reminder"
                          >
                            <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 512 512">
                              <path d="M125.7 160H176c17.7 0 32 14.3 32 32s-14.3 32-32 32H48c-17.7 0-32-14.3-32-32V64c0-17.7 14.3-32 32-32s32 14.3 32 32v51.2L108.5 95.7C150.3 55.4 207 32 266.7 32c119.5 0 216.5 97 216.5 216.5s-97 216.5-216.5-216.5c-59.7 0-116.4 23.4-158.2 63.7l-30.2 29.5c-12.5 12.2-12.8 32.2-.6 44.7s32.2 12.8 44.7 .6l30.2-29.5z"/>
                            </svg>
                          </button>
                        )}
                        <button onClick={(e) => handleViewCertificate(e, c)} className="flex-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 py-2 px-1 rounded-lg text-[10px] font-black uppercase border border-slate-200 transition-colors text-center flex items-center justify-center gap-1">
                          <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                          View
                        </button>
                        <button onClick={(e) => handleEditCertificate(e, c)} className="flex-1 bg-slate-100 hover:bg-orange-50 text-slate-700 hover:text-orange-600 py-2 px-1 rounded-lg text-[10px] font-black uppercase border border-slate-200 transition-colors text-center flex items-center justify-center gap-1">
                          <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                          Edit
                        </button>
                        <button onClick={(e) => handleWhatsAppSend(e, c, 'doc')} className="flex-1 bg-[#25D366] text-white py-2 px-1 rounded-lg text-[10px] font-black uppercase transition-colors text-center flex items-center justify-center gap-1">
                          <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24">
                            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                          </svg>
                          WA
                        </button>
                        <button onClick={(e) => handleDeleteHistory(e, c.id)} className="bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-2 rounded-lg text-[10px] font-black uppercase border border-red-200 transition-colors flex items-center justify-center gap-1">
                          <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                          Del
                        </button>
                      </div>

                    </div>
                  );
                })
              )}

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
        )}

        {/* PAYMENT MODAL */}
        {isPaymentModalOpen && activeCert && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="bg-[#5a5fe0] p-4 text-white flex justify-between items-start shrink-0">
                <div>
                  <h3 className="font-black text-sm uppercase tracking-wide flex items-center gap-2">
                    <svg className="w-4 h-4 text-white inline-block shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg> PAYMENT RECEIPTS
                  </h3>
                  <p className="text-[10px] text-indigo-100 font-bold tracking-widest mt-1">{activeCert.ref} - {activeCert.party}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setIsPaymentModalOpen(false); }} className="text-white hover:text-indigo-200 font-black text-2xl leading-none transition-colors">&times;</button>
              </div>

              <div className="p-4 flex flex-col gap-4 max-h-[80vh] overflow-y-auto custom-scrollbar bg-slate-50">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white border border-slate-200 rounded-xl p-2 text-center shadow-sm">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Total</p>
                    <p className="text-sm font-black text-slate-800 font-mono">₹{Number(activeCert.total || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-2 text-center shadow-sm">
                    <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Paid</p>
                    <p className="text-sm font-black text-emerald-600 font-mono">₹{activeCert.payments ? activeCert.payments.reduce((s,p)=>s+Number(p.amount),0).toFixed(2) : '0.00'}</p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-2 text-center shadow-sm">
                    <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-1">Due</p>
                    <p className="text-sm font-black text-red-600 font-mono">₹{getOutstanding(activeCert)}</p>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <h4 className="font-black text-[10px] text-slate-700 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">PAYMENT HISTORY LOGS</h4>
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {activeCert.payments && activeCert.payments.length > 0 ? (
                      activeCert.payments.map((p, i) => (
                        <div key={p.id} className="flex justify-between items-center bg-slate-50 border border-slate-100 p-2.5 rounded-lg">
                          <div>
                            <p className="text-[10px] font-black text-slate-800 uppercase tracking-wider">{p.method} <span className="text-slate-400 font-medium ml-1">({p.date})</span></p>
                            <p className="text-[10px] text-slate-500 mt-1 font-medium break-words leading-tight">{p.note || 'No remarks provided'}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono font-black text-emerald-600 text-xs">₹{Number(p.amount).toFixed(2)}</span>
                            <button type="button" onClick={() => handleDeletePayment(p.id)} className="text-slate-400 hover:text-white bg-white hover:bg-red-500 border border-slate-200 p-1.5 rounded transition-all shadow-sm" title="Delete Receipt">
                              <svg className="w-3.5 h-3.5 fill-current inline-block shrink-0" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-4">
                        <svg className="w-8 h-8 text-slate-300 mb-1 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
                        <p className="text-[10px] text-slate-400 font-bold italic text-center uppercase tracking-widest">No payment logs found.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 shadow-sm">
                  <div className="flex justify-between items-center mb-3 border-b border-indigo-100 pb-2">
                    <h4 className="font-black text-[10px] text-indigo-800 uppercase tracking-widest flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-indigo-700 inline-block shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg> ADD PAYMENT RECEIPT
                    </h4>
                    <button onClick={(e) => handleWhatsAppSend(e, activeCert, 'payment')} className="bg-[#25D366] hover:bg-green-600 text-white text-[9px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5">
                      <svg className="w-3 h-3 fill-current inline shrink-0" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                      <span>Send Due Reminder WA</span>
                    </button>
                  </div>
                  <form onSubmit={handleAddPaymentEntry} className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-600 uppercase mb-1.5">Amount (₹) *</label>
                        <div className="relative">
                          <input type="number" step="0.01" placeholder="0.00" value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm, amount: e.target.value})} className="pro-input text-xs font-mono font-bold bg-white pr-7 text-left" required />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-600 uppercase mb-1.5">Method *</label>
                        <select value={paymentForm.method} onChange={e=>setPaymentForm({...paymentForm, method: e.target.value})} className="pro-input text-xs font-bold text-slate-700 cursor-pointer bg-white">
                          {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-600 uppercase mb-1.5">Note / Remarks</label>
                      <textarea placeholder="Type remarks here..." value={paymentForm.note} onChange={e=>setPaymentForm({...paymentForm, note: e.target.value})} rows="2" className="pro-input text-xs bg-white resize-none" />
                    </div>
                    <button type="submit" className="w-full bg-[#5a5fe0] hover:bg-indigo-700 text-white py-2.5 rounded-lg font-black text-xs uppercase tracking-widest transition-all shadow-md mt-1 active:scale-95">Save Receipt</button>
                  </form>
                </div>
              </div>
              
              <div className="p-3 bg-white border-t border-slate-200 flex justify-end shrink-0">
                <button onClick={(e) => { e.stopPropagation(); setIsPaymentModalOpen(false); }} className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2 rounded-lg font-black text-xs uppercase tracking-widest shadow-md transition-all">Close</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}