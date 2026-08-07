import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import { toJpeg } from 'html-to-image';

const BACKEND_URL = "https://shaney-erp-backend.onrender.com";

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

const DEFAULT_DESIGN = {
  themeColor: '#00a67e',
  certPos: 'left-vert',
  certPosX: 0,
  certPosY: 0,
  certFont: 'Georgia',
  certSize: 42,
  certColor: '#dc2626',
  certBold: true,
  certItalic: false,
  certUnderline: false,
  customFonts: ['Arial', 'Georgia', 'Caveat', 'Times New Roman', 'Verdana'],
  headerFont: 'Arial', headerSize: 36, headerColor: '#0f172a', headerBold: true, headerItalic: false, headerUnderline: false,
  docFont: 'Georgia', docSize: 15.5, docColor: '#000000', docBold: false, docItalic: true, docUnderline: false,
  custFont: 'Caveat', custSize: 20, custColor: '#000000', custBold: false, custItalic: false, custUnderline: false,
  sigFont: 'Arial', sigSize: 14, sigColor: '#000000', sigBold: false, sigItalic: true, sigUnderline: false, sigX: 0, sigY: 0,
  a4BgUrl: '', topMargin: 0,
  quoteThemeColor: '#1e40af',
  quoteTitle: 'QUOTATION',
  quoteTitleFont: 'Arial', quoteTitleSize: 32, quoteTitleColor: '#1e40af', quoteTitleBold: true, quoteTitleItalic: false, quoteTitleUnderline: false, quoteTitleX: 0, quoteTitleY: 0,
  headerTemp: 'h-classic-left',
  headerFontFam: 'Arial', headerFontSize: 34, headerFontColor: '#dc2626', headerFontBold: true, headerFontItalic: false, headerFontUnderline: false,
  billingTemp: 'b-classic-split',
  billingFontFam: 'Arial', billingFontSize: 12, billingFontColor: '#0f172a', billingFontBold: false, billingFontItalic: false, billingFontUnderline: false,
  tableTemp: 'table-base',
  tableFontFam: 'Arial', tableFontSize: 12, tableFontColor: '#0f172a', tableFontBold: false, tableFontItalic: false, tableFontUnderline: false,
  quoteTermText: '* Terms & Conditions: Validity 30 days. E.& O.E.',
  quoteTermFontFam: 'Arial', quoteTermFontSize: 10, quoteTermFontColor: '#64748b', quoteTermFontBold: false, quoteTermFontItalic: true, quoteTermFontUnderline: false, quoteTermX: 0, quoteTermY: 0,
  graphics: {
    logo: { url: '', x: 0, y: 0, size: 100 },
    stamp: { url: '', x: 0, y: 0, size: 100 },
    subImage: { url: '', x: 0, y: 0, size: 100 },
    rightExt: { url: '', x: 0, y: 0, size: 100 },
    isoLogo: { url: '', x: 0, y: 0, size: 100 },
    gemLogo: { url: '', x: 0, y: 0, size: 100 },
    msme: { url: '', x: 0, y: 0, size: 100 },
    makeInIndia: { url: '', x: 0, y: 0, size: 100 }
  }
};

export default function Templates() {
  const [designMode, setDesignMode] = useState('quotation');
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);

  const [firms, setFirms] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_Companies_v104');
      return saved ? JSON.parse(saved) : [
        { id: 'comp_cert_1', type: 'certificate', name: 'Shaney Enterprise', address: '112, Royal Plaza, Junagadh', contact: '+91 9726350101' }
      ];
    } catch (e) {
      return [{ id: 'comp_cert_1', type: 'certificate', name: 'Shaney Enterprise', address: '112, Royal Plaza, Junagadh', contact: '+91 9726350101' }];
    }
  });

  const [firmTemplates, setFirmTemplates] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_FirmTemplates_v104');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    const handleDataUpdate = (e) => {
      if (!e.detail || e.detail.type === 'templates' || e.detail.type === 'settings') {
        try {
          const savedFirms = localStorage.getItem('ERP_Companies_v104');
          if (savedFirms) setFirms(JSON.parse(savedFirms));
          const savedTemplates = localStorage.getItem('ERP_FirmTemplates_v104');
          if (savedTemplates) setFirmTemplates(JSON.parse(savedTemplates));
        } catch(err) {
          console.error("Storage parse error:", err);
        }
      }
    };
    window.addEventListener('ERP_DATA_UPDATED', handleDataUpdate);
    return () => window.removeEventListener('ERP_DATA_UPDATED', handleDataUpdate);
  }, []);

  useEffect(() => {
    const fetchCloudTemplates = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/data`);
        if (res.ok) {
          const allData = await res.json();
          if (allData && typeof allData === 'object') {
            let cloudTemplates = {};
            let cloudFirms = [];

            if (Array.isArray(allData)) {
              allData.filter(item => item && item.docType === 'firm_template').forEach(t => {
                if (t.id) cloudTemplates[t.id] = t;
              });
              cloudFirms = allData.filter(item => item && item.docType === 'company');
            } else {
              if (allData.firm_templates) {
                const ft = allData.firm_templates;
                if (Array.isArray(ft)) {
                  ft.forEach(t => { if (t && t.id) cloudTemplates[t.id] = t; });
                } else if (typeof ft === 'object') {
                  Object.values(ft).forEach(t => { if (t && t.id) cloudTemplates[t.id] = t; });
                }
              }
              if (allData.companies) {
                const comp = allData.companies;
                cloudFirms = Array.isArray(comp) ? comp : Object.values(comp);
              }
            }

            if (Object.keys(cloudTemplates).length > 0) {
              setFirmTemplates(cloudTemplates);
              localStorage.setItem('ERP_FirmTemplates_v104', JSON.stringify(cloudTemplates));
            }
            if (cloudFirms.length > 0) {
              setFirms(cloudFirms);
              localStorage.setItem('ERP_Companies_v104', JSON.stringify(cloudFirms));
            }
          }
        }
      } catch (err) {
        console.error("Error fetching templates from cloud:", err);
      }
    };
    fetchCloudTemplates();
  }, []);

  const filteredFirms = firms.filter(f => {
    if (designMode === 'certificate') return f.type === 'certificate';
    return f.type !== 'certificate';
  });

  const [selectedFirmId, setSelectedFirmId] = useState(filteredFirms[0]?.id || firms[0]?.id || '');

  useEffect(() => {
    const matchingFirms = firms.filter(f => {
      if (designMode === 'certificate') return f.type === 'certificate';
      return f.type !== 'certificate';
    });
    if (matchingFirms.length > 0) {
      setSelectedFirmId(matchingFirms[0].id);
    }
  }, [designMode, firms]);

  const [currentDesign, setCurrentDesign] = useState(DEFAULT_DESIGN);
  const templateKey = `${selectedFirmId}_${designMode}`;

  // 🟢 NON-LOOPING LOAD EFFECT
  useEffect(() => {
    if (selectedFirmId) {
      const savedTemplate = firmTemplates[templateKey] || firmTemplates[selectedFirmId];
      if (savedTemplate) {
        setCurrentDesign({
          ...DEFAULT_DESIGN,
          ...savedTemplate,
          graphics: {
            ...DEFAULT_DESIGN.graphics,
            ...(savedTemplate.graphics || {})
          }
        });
      } else {
        setCurrentDesign(DEFAULT_DESIGN);
      }
    }
  }, [selectedFirmId, designMode]);

  // 🟢 NON-LOOPING SAVE EFFECT
  useEffect(() => {
    if (selectedFirmId && currentDesign) {
      try {
        const currentSaved = JSON.parse(localStorage.getItem('ERP_FirmTemplates_v104') || '{}');
        if (JSON.stringify(currentSaved[templateKey]) !== JSON.stringify(currentDesign)) {
          const updated = { ...currentSaved, [templateKey]: currentDesign };
          setFirmTemplates(updated);
          localStorage.setItem('ERP_FirmTemplates_v104', JSON.stringify(updated));
        }
      } catch (e) {
        console.error("Storage error", e);
      }
    }
  }, [currentDesign, selectedFirmId, templateKey]);

  const handleSaveTemplateToCloud = async () => {
    if (!selectedFirmId) return;
    const currentTimestamp = Date.now();

    try {
      alert(`⏳ Saving template for "${activeFirmObj.name}" to cloud... Please wait.`);

      const basePayload = {
        id: String(templateKey),
        docType: 'firm_template',
        firmId: selectedFirmId,
        designMode: designMode,
        ...currentDesign,
        updatedAt: currentTimestamp
      };

      const res1 = await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          type: 'firm_templates', 
          id: String(templateKey), 
          data: sanitizeForCloud(basePayload) 
        })
      });

      if (!res1.ok) throw new Error(`Server returned status ${res1.status}`);

      const updatedTemplates = { ...firmTemplates, [templateKey]: currentDesign };
      setFirmTemplates(updatedTemplates);
      localStorage.setItem('ERP_FirmTemplates_v104', JSON.stringify(updatedTemplates));

      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer) {
          await ipcRenderer.invoke('sqlite-save-record', basePayload);
        }
      }

      window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'templates' } }));
      logActionToBackend(`Saved ${designMode} template for firm ID: ${selectedFirmId}`);
      
      alert(`✅ ${designMode.toUpperCase()} Template for "${activeFirmObj.name}" saved to Cloud successfully!`);
    } catch (err) {
      console.error("Cloud template save error:", err);
      alert("❌ Failed to save template to cloud: " + err.message);
    }
  };

  const [categories, setCategories] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_CertCategories_v104');
      return saved ? JSON.parse(saved) : ["ABC Stored Pressure", "Co2", "Water Co2", "M-Foam", "Dry Chemical Powder"];
    } catch (e) {
      return ["ABC Stored Pressure", "Co2", "Water Co2", "M-Foam", "Dry Chemical Powder"];
    }
  });
  const [newCategory, setNewCategory] = useState('');

  const [capacities, setCapacities] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_CertCapacities_v104');
      return saved ? JSON.parse(saved) : ["1Kg", "2Kg", "4.5Kg", "6Kg", "9 Ltr Stored PressureType", "50 Ltr"];
    } catch (e) {
      return ["1Kg", "2Kg", "4.5Kg", "6Kg", "9 Ltr Stored PressureType", "50 Ltr"];
    }
  });
  const [newCapacity, setNewCapacity] = useState('');

  useEffect(() => { localStorage.setItem('ERP_CertCategories_v104', JSON.stringify(categories)); }, [categories]);
  useEffect(() => { localStorage.setItem('ERP_CertCapacities_v104', JSON.stringify(capacities)); }, [capacities]);

  const handleAddCategory = (e) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    const formatted = newCategory.trim();
    if (!categories.includes(formatted)) setCategories([...categories, formatted]);
    setNewCategory('');
  };

  const removeCategory = (catToRemove) => { setCategories(categories.filter(c => c !== catToRemove)); };

  const handleAddCapacity = (e) => {
    e.preventDefault();
    if (!newCapacity.trim()) return;
    const formatted = newCapacity.trim();
    if (!capacities.includes(formatted)) setCapacities([...capacities, formatted]);
    setNewCapacity('');
  };

  const removeCapacity = (capToRemove) => { setCapacities(capacities.filter(c => c !== capToRemove)); };

  const handleAddFont = () => {
    const fName = prompt("Enter new font family name (e.g., Roboto, Open Sans):");
    if (fName && fName.trim()) {
      const trimmed = fName.trim();
      if (!currentDesign.customFonts.includes(trimmed)) {
        setCurrentDesign(prev => ({ ...prev, customFonts: [...prev.customFonts, trimmed] }));
      }
    }
  };

  const handleDeleteFont = (fontToDelete) => {
    if (currentDesign.customFonts.length <= 1) {
      alert("At least one font must remain!");
      return;
    }
    if (confirm(`Are you sure you want to delete font '${fontToDelete}'?`)) {
      setCurrentDesign(prev => ({ ...prev, customFonts: prev.customFonts.filter(f => f !== fontToDelete) }));
    }
  };

  const compressAndConvertToBase64 = (file, maxWidth = 300, maxHeight = 300) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
          } else {
            if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/png'));
        };
        img.src = uploadEvent.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleGraphicFile = async (key, file) => {
    if (!file) return;
    try {
      const compressedDataUrl = await compressAndConvertToBase64(file, 300, 300);
      setCurrentDesign(prev => ({
        ...prev,
        graphics: {
          ...(prev.graphics || {}),
          [key]: { ...(prev.graphics?.[key] || { x: 0, y: 0, size: 100 }), url: compressedDataUrl }
        }
      }));
    } catch (err) {
      console.error("Image compression error:", err);
    }
  };

  const removeGraphic = (key) => {
    setCurrentDesign(prev => ({
      ...prev,
      graphics: {
        ...prev.graphics,
        [key]: { ...(prev.graphics?.[key] || {}), url: '' }
      }
    }));
  };

  const updateGraphicProp = (key, prop, val) => {
    setCurrentDesign(prev => ({
      ...prev,
      graphics: {
        ...prev.graphics,
        [key]: { ...(prev.graphics?.[key] || { url: '', x: 0, y: 0, size: 100 }), [prop]: Number(val) }
      }
    }));
  };

  const handleBgFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const compressedDataUrl = await compressAndConvertToBase64(file, 400, 600);
      setCurrentDesign(prev => ({ ...prev, a4BgUrl: compressedDataUrl }));
    } catch (err) {
      console.error("Background compression error:", err);
    }
  };

  const [draggingKey, setDraggingKey] = useState(null);
  const [dragOffset, setDragOffset] = useState({ startX: 0, startY: 0, origX: 0, origY: 0, scale: 1 });

  const handleMouseDown = (key, e) => {
    e.stopPropagation();
    setDraggingKey(key);
    const g = currentGraphics[key] || { x: 0, y: 0 };
    
    // 🟢 Scale-aware coordinate fixing
    const canvasEl = document.getElementById('a4-preview-canvas');
    const rect = canvasEl ? canvasEl.getBoundingClientRect() : { width: 794 };
    const scale = rect.width / 794;

    setDragOffset({
      startX: e.clientX,
      startY: e.clientY,
      origX: g.x || 0,
      origY: g.y || 0,
      scale: scale || 1
    });
  };

  const handleMouseMove = (e) => {
    if (!draggingKey) return;
    const dx = (e.clientX - dragOffset.startX) / dragOffset.scale;
    const dy = (e.clientY - dragOffset.startY) / dragOffset.scale;
    
    const newX = dragOffset.origX + dx;
    const newY = dragOffset.origY + dy;

    setCurrentDesign(prev => ({
      ...prev,
      graphics: {
        ...prev.graphics,
        [draggingKey]: {
          ...(prev.graphics[draggingKey] || { size: 100, url: '' }),
          x: Math.round(newX),
          y: Math.round(newY)
        }
      }
    }));
  };

  const handleMouseUp = () => { setDraggingKey(null); };

  const activeFirmObj = firms.find(f => f.id === selectedFirmId) || filteredFirms[0] || firms[0] || { name: 'Shaney Enterprise', address: 'Junagadh', contact: '+91 9726350101' };
  const currentGraphics = currentDesign.graphics || {};

  const getQuoteHeaderHTML = () => {
    const v = currentDesign;
    const cColor = v.quoteThemeColor;
    const tB = v.quoteTitleBold ? "font-weight: 900;" : "font-weight: normal;";
    const tI = v.quoteTitleItalic ? "font-style: italic;" : "font-style: normal;";
    const tU = v.quoteTitleUnderline ? "text-decoration: underline;" : "";
    const tC = v.quoteTitleColor || cColor;
    const tF = v.quoteTitleFont || "Arial";
    const tS = v.quoteTitleSize ? v.quoteTitleSize + "px" : "32px";
    const tX = v.quoteTitleX || 0;
    const tY = v.quoteTitleY || 0;

    const mainTitle = `<h1 class="uppercase tracking-widest" style="margin-bottom: 15px; position: relative; z-index: 10; font-family: '${tF}', sans-serif; font-size: ${tS}; ${tB} ${tI} ${tU} color: ${tC}; transform: translate(${tX}px, ${tY}px); line-height: 1;">${v.quoteTitle}</h1>`;

    const hB = v.headerFontBold ? "font-weight: 900;" : "font-weight: normal;";
    const hI = v.headerFontItalic ? "font-style: italic;" : "font-style: normal;";
    const hU = v.headerFontUnderline ? "text-decoration: underline;" : "";
    const hF = v.headerFontFam || "Arial";
    const hS = v.headerFontSize ? v.headerFontSize : 34;
    const hC = v.headerFontColor || cColor;
    const subSizeVal = Math.max(10, Math.floor(hS * 0.4));
    const nameStyle = `font-family: '${hF}', sans-serif; font-size: ${hS}px; ${hB} ${hI} ${hU} line-height: 1.1; display: inline-block;`;
    const subStyle = `font-size: ${subSizeVal}px; opacity: 0.85; margin-top: 6px; display: block; font-family: '${hF}', sans-serif;`;
    const nameStr = `<span style="${nameStyle}">${activeFirmObj.name}</span>`;
    const addrStr = `<div style="${subStyle}">${activeFirmObj.address || ""}</div>`;

    let html = "";
    switch (v.headerTemp) {
        case 'h-solid-block': html = `<div class="flex justify-center items-center w-full p-6 rounded-2xl mb-2 text-center" style="background: ${cColor}; color: white;"><div><div class="uppercase">${nameStr}</div>${addrStr}</div></div>`; break;
        case 'h-dark-mode': html = `<div class="flex justify-start items-center w-full p-6 bg-slate-900 rounded-xl mb-2 border-b-4" style="border-color: ${cColor}; color: white;"><div><div>${nameStr}</div>${addrStr}</div></div></div>`; break;
        case 'h-ultimate-pro': html = `<div class="flex justify-start items-center w-full pb-6 mb-2 border-b border-slate-200" style="color: ${hC};"><div><div style="border-left: 6px solid ${cColor}; padding-left: 15px;">${nameStr}</div><div style="padding-left: 15px;">${addrStr}</div></div></div>`; break;
        case 'h-modern-right': html = `<div class="flex flex-col items-end w-full pb-4 mb-2 border-b border-slate-300" style="color: ${hC};"><div class="text-right">${nameStr}</div><div class="text-right">${addrStr}</div></div>`; break;
        case 'h-elegant-line': html = `<div class="flex justify-start items-end w-full pb-3 mb-2 relative" style="color: ${hC};"><div><div>${nameStr}</div><div style="width: 80px; height: 5px; background: ${cColor}; margin-top: 8px; border-radius: 3px;"></div><div class="mt-3">${addrStr}</div></div></div>`; break;
        case 'h-center-focus': html = `<div class="flex flex-col items-center w-full pb-4 mb-2 border-b border-slate-200" style="color: ${hC};"><div class="text-center">${nameStr}</div><div class="text-center">${addrStr}</div></div>`; break;
        case 'h-minimal-box': html = `<div class="flex justify-center items-center w-full p-5 border-2 rounded-xl mb-2 text-center" style="border-color: ${cColor}; color: ${hC};"><div><div>${nameStr}</div>${addrStr}</div></div>`; break;
        case 'h-bold-brand': html = `<div class="flex justify-start items-end w-full pb-4 mb-2 border-l-8 pl-4" style="border-color: ${cColor}; color: ${hC};"><div><div class="tracking-tighter">${nameStr}</div>${addrStr}</div></div>`; break;
        case 'h-gradient-fade': html = `<div class="flex justify-start items-center w-full p-6 rounded-lg mb-2" style="background: linear-gradient(90deg, ${cColor}20, transparent); color: ${hC};"><div><div>${nameStr}</div>${addrStr}</div></div>`; break;
        case 'h-corporate-split': html = `<div class="flex justify-start items-end w-full pb-4 mb-2 border-b-2" style="border-color: ${cColor}; color: ${hC};"><div><div>${nameStr}</div>${addrStr}</div></div>`; break;
        case 'h-luxury-accent': html = `<div class="flex flex-col items-center w-full pb-4 mb-2" style="color: ${hC};"><div class="tracking-widest uppercase">${nameStr}</div><div style="width: 100%; height: 1px; background: ${cColor}; margin: 15px 0;"></div><div class="text-center">${addrStr}</div></div>`; break;
        case 'h-tech-neon': html = `<div class="flex justify-start items-center w-full p-5 bg-slate-900 rounded-lg mb-2 text-white"><div><div style="text-shadow: 0 0 10px ${cColor}80;">${nameStr}</div>${addrStr}</div></div>`; break;
        case 'h-clean-cut': html = `<div class="flex justify-start items-end w-full pb-4 mb-2" style="color: ${hC};"><div><div class="flex items-center gap-3"><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${cColor};"></span>${nameStr}</div><div class="pl-6">${addrStr}</div></div></div>`; break;
        case 'h-vintage-stamp': html = `<div class="flex flex-col items-center text-center w-full p-6 border-4 border-double rounded mb-2" style="border-color: ${cColor}; color: ${hC};"><div class="uppercase tracking-widest">${nameStr}</div><div class="font-serif italic mt-2">${addrStr}</div></div>`; break;
        default: html = `<div class="flex justify-start items-center w-full pb-4 mb-2 border-b-2 border-slate-200" style="color: ${hC};"><div><div>${nameStr}</div>${addrStr}</div></div>`;
    }
    return mainTitle + html;
  };

  const getQuoteBillingHTML = () => {
    const v = currentDesign;
    const cColor = v.quoteThemeColor;
    const bB = v.billingFontBold ? "font-weight: 900;" : "font-weight: normal;";
    const bI = v.billingFontItalic ? "font-style: italic;" : "font-style: normal;";
    const bU = v.billingFontUnderline ? "text-decoration: underline;" : "";
    const bF = v.billingFontFam || "Arial";
    const bS = v.billingFontSize ? v.billingFontSize : 13;
    const bC = v.billingFontColor || '#0f172a';
    const bSubSize = Math.max(9, Math.floor(bS * 0.85)); 
    const bSmallSize = Math.max(8, Math.floor(bS * 0.70)); 
    const bNameStyle = `font-family: '${bF}', sans-serif; font-size: ${bS}px; ${bB} ${bI} ${bU}; line-height: 1.2; display: block; margin-top: 2px;`;
    const cName = `<span style="${bNameStyle}">AJMERI DEVELOPERS</span>`;
    const cAddr = "702/A, CORPORATE PLAZA, VADODARA, GUJARAT";
    const cContact = activeFirmObj.contact || "+91 9876543210";

    const left = `
      <span style="font-size: ${bSmallSize}px; opacity: 0.7; text-transform: uppercase; font-weight: 900; display: block; letter-spacing: 0.05em;">Billed To</span>
      ${cName}
      <div style="font-size: ${bSubSize}px; opacity: 0.85; margin-top: 4px; word-break: break-word;">${cAddr}</div>
      <div style="font-size: ${bSubSize}px; font-weight: bold; margin-top: 4px; word-break: break-word;">📞 Contact: ${cContact}</div>
    `;

    const right = `
      <table style="border-collapse: collapse; text-align: left; white-space: nowrap; margin-left: auto;">
        <tr>
          <td style="font-weight: bold; padding-right: 12px; text-transform: uppercase; font-size: ${bSmallSize}px; padding-bottom: 6px; text-align: right; opacity: 0.7;">Quote Ref</td>
          <td style="font-weight: 900; font-family: monospace; font-size: ${bS}px; padding-bottom: 6px; text-align: right;">: SE/25-26/Q01</td>
        </tr>
        <tr>
          <td style="font-weight: bold; padding-right: 12px; text-transform: uppercase; font-size: ${bSmallSize}px; padding-top: 6px; border-top: 1px solid currentColor; text-align: right; opacity: 0.7;">Date</td>
          <td style="font-weight: bold; font-size: ${bS}px; padding-top: 6px; border-top: 1px solid currentColor; text-align: right;">: 22-07-2026</td>
        </tr>
      </table>
    `;

    const mainWrapStyle = `color: ${bC}; font-family: '${bF}', sans-serif;`;

    switch (v.billingTemp) {
        case 'b-solid-right': return `<div class="flex rounded-xl overflow-hidden w-full mb-4 border border-slate-200" style="${mainWrapStyle}"><div class="w-[55%] bg-white p-5 pr-4">${left}</div><div class="w-[45%] p-5 text-white" style="background:${cColor}; color: white;">${right}</div></div>`;
        case 'b-grid-compact': return `<div class="grid grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg w-full mb-4 border" style="border-color: ${cColor}40; ${mainWrapStyle}"><div class="col-span-2 pr-4">${left}</div><div class="col-span-2 text-right" style="color: ${cColor};">${right}</div></div>`;
        case 'b-ultra-premium': return `<div class="flex justify-between items-center p-6 w-full mb-4 bg-white border border-slate-200 relative overflow-hidden rounded-lg shadow-sm" style="${mainWrapStyle}"><div class="absolute top-0 left-0 w-full h-1" style="background: linear-gradient(90deg, ${cColor}, transparent);"></div><div class="w-[55%] relative z-10 pr-4">${left}</div><div class="w-[40%] text-right flex justify-end relative z-10">${right}</div></div>`;
        case 'b-minimal-border': return `<div class="flex justify-between items-center w-full mb-4 border-2 p-5 rounded-lg" style="border-color: ${cColor}; ${mainWrapStyle}"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right flex justify-end">${right}</div></div>`;
        case 'b-floating-shadow': return `<div class="flex justify-between items-center w-full mb-4 gap-4" style="${mainWrapStyle}"><div class="w-[50%] bg-white shadow-lg p-5 rounded-xl border-t-4" style="border-top-color: ${cColor};">${left}</div><div class="w-[50%] bg-white shadow-lg p-5 rounded-xl flex justify-end border-t-4" style="border-top-color: ${cColor};">${right}</div></div>`;
        case 'b-dual-cards': return `<div class="flex justify-between items-center w-full mb-4 gap-4" style="${mainWrapStyle}"><div class="w-[50%] bg-slate-50 border border-slate-200 p-5 rounded-xl pr-4">${left}</div><div class="w-[50%] bg-slate-50 border border-slate-200 p-5 rounded-xl flex justify-end">${right}</div></div>`;
        case 'b-accent-left': return `<div class="flex justify-between items-center w-full mb-4 bg-white border border-slate-200 p-5 rounded-lg border-l-8" style="border-left-color: ${cColor}; ${mainWrapStyle}"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right flex justify-end">${right}</div></div>`;
        case 'b-boxed-tint': return `<div class="flex justify-between items-center w-full mb-4 p-5 rounded-lg" style="background-color: ${cColor}10; border: 1px solid ${cColor}40; ${mainWrapStyle}"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right bg-white p-3 rounded shadow-sm flex justify-end">${right}</div></div>`;
        case 'b-clean-line': return `<div class="flex justify-between items-center w-full mb-4 pb-4 border-b border-slate-300" style="${mainWrapStyle}"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right flex justify-end">${right}</div></div>`;
        case 'b-corporate-grey': return `<div class="flex justify-between items-center w-full mb-4 bg-slate-100 p-5 rounded-xl" style="${mainWrapStyle}"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right flex justify-end">${right}</div></div>`;
        case 'b-modern-dark': return `<div class="flex justify-between items-center w-full mb-4 bg-slate-800 text-white p-5 rounded-xl" style="font-family: '${bF}', sans-serif;"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right flex justify-end">${right}</div></div>`;
        case 'b-tech-grid': return `<div class="flex justify-between items-center w-full mb-4 border border-dashed p-5" style="border-color: ${cColor}; ${mainWrapStyle}"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right flex justify-end">${right}</div></div>`;
        case 'b-elegant-serif': return `<div class="flex justify-between items-center w-full mb-4 px-4" style="font-family: Georgia, serif; color: ${bC};"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right flex justify-end">${right}</div></div>`;
        case 'b-impact-block': return `<div class="flex justify-between items-stretch w-full mb-4" style="${mainWrapStyle}"><div class="w-[60%] p-5 text-white rounded-l-lg" style="background: ${cColor};">${left}</div><div class="w-[40%] bg-slate-100 p-5 rounded-r-lg flex justify-end">${right}</div></div>`;
        default: return `<div class="flex justify-between items-center bg-slate-50 p-5 rounded-xl border-l-4 w-full mb-4" style="border-left-color: ${cColor}; ${mainWrapStyle}"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right bg-white p-3 rounded-lg border border-slate-100 flex justify-end">${right}</div></div>`;
    }
  };

  const getTableStyle = () => ({
    fontFamily: currentDesign.tableFontFam,
    fontSize: `${currentDesign.tableFontSize}px`,
    color: currentDesign.tableFontColor,
    fontWeight: currentDesign.tableFontBold ? 'bold' : 'normal',
    fontStyle: currentDesign.tableFontItalic ? 'italic' : 'normal',
    textDecoration: currentDesign.tableFontUnderline ? 'underline' : 'none'
  });

  const renderA4Content = () => {
    return designMode === 'certificate' ? (
      <div 
        id="a4-preview-canvas"
        className="bg-white shadow-2xl relative w-[794px] h-[1123px] min-w-[794px] min-h-[1123px] overflow-hidden flex flex-col shrink-0 box-border z-0 p-8"
        style={{
          backgroundImage: currentDesign.a4BgUrl ? `url(${currentDesign.a4BgUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          paddingTop: `${20 + (currentDesign.topMargin || 0)}px`
        }}
      >
        {Object.entries(currentGraphics).map(([k, g]) => {
          if (!g || !g.url) return null;
          return (
            <img 
              key={k} 
              src={g.url} 
              alt={k} 
              onMouseDown={(e) => handleMouseDown(k, e)}
              className="cursor-move hover:outline hover:outline-2 hover:outline-blue-500"
              style={{ 
                position: 'absolute', 
                left: `${20 + (g.x || 0)}px`, 
                top: `${20 + (g.y || 0)}px`, 
                width: `${g.size || 80}px`, 
                zIndex: 40, 
                objectFit: 'contain',
                userSelect: 'none'
              }} 
            />
          );
        })}

        <div className="flex h-full w-full pt-[10px] pb-[40px] pl-[10px] pr-[20px] flex-row z-20 relative pointer-events-none">
          {currentDesign.certPos !== 'none' && (
            <div 
              className={currentDesign.certPos === 'top-center' ? 'absolute left-1/2 -translate-x-1/2 top-0 z-30 w-full text-center' : 'w-[70px] flex-shrink-0 flex flex-col items-center justify-start pt-[80px] z-30'} 
              style={{ width: currentDesign.certPos === 'top-center' ? '100%' : '70px', minWidth: currentDesign.certPos === 'top-center' ? 'auto' : '70px', transform: `translate(${currentDesign.certPosX}px, ${currentDesign.certPosY}px)` }}
            >
              <div 
                className={currentDesign.certPos === 'top-center' ? 'font-bold tracking-widest' : 'vert-text-stable'}
                style={{
                  fontFamily: currentDesign.certFont,
                  fontSize: `${currentDesign.certSize}px`,
                  color: currentDesign.certColor,
                  fontWeight: currentDesign.certBold ? '900' : 'normal',
                  fontStyle: currentDesign.certItalic ? 'italic' : 'normal',
                  textDecoration: currentDesign.certUnderline ? 'underline' : 'none'
                }}
              >
                {currentDesign.certPos === 'top-center' ? (
                  <span>CERTIFICATE</span>
                ) : (
                  <>
                    <span>C</span><span>E</span><span>R</span><span>T</span><span>I</span><span>F</span><span>I</span><span>C</span><span>A</span><span>T</span><span>E</span>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex-grow flex flex-col pt-2 h-full z-20 pointer-events-auto" style={{ width: currentDesign.certPos === 'top-center' ? '100%' : 'calc(100% - 70px)' }}>
            <div className="flex items-center mb-4 w-full pb-4 flex-shrink-0 mt-5 justify-between" style={{ borderBottom: `3px solid ${currentDesign.a4BgUrl ? 'transparent' : currentDesign.themeColor}` }}>
              <div className="flex flex-col justify-center max-w-[70%]">
                {!currentDesign.a4BgUrl && (
                  <h1 
                    className="leading-tight uppercase tracking-tight break-words" 
                    style={{ 
                      fontFamily: currentDesign.headerFont, 
                      fontSize: `${currentDesign.headerSize}px`, 
                      color: currentDesign.headerColor,
                      fontWeight: currentDesign.headerBold ? '900' : 'normal',
                      fontStyle: currentDesign.headerItalic ? 'italic' : 'normal',
                      textDecoration: currentDesign.headerUnderline ? 'underline' : 'none'
                    }}
                  >
                    {activeFirmObj.name}
                  </h1>
                )}
                <div className="mt-1 flex items-center h-5">
                  {!currentDesign.a4BgUrl && <p className="text-[14px] font-black text-red-600 tracking-wider">Fire And Safety</p>}
                </div>
              </div>
              <div 
                className="text-right shrink-0 pt-1"
                style={{ 
                  fontFamily: currentDesign.docFont, 
                  fontSize: `${Math.max(10, currentDesign.docSize - 3)}px`, 
                  color: currentDesign.docColor,
                  fontWeight: currentDesign.docBold ? 'bold' : 'normal',
                  fontStyle: currentDesign.docItalic ? 'italic' : 'normal',
                  textDecoration: currentDesign.docUnderline ? 'underline' : 'none'
                }}
              >
                <p>Date :- <span>12-12-2025</span></p>
                <p>SR.No :- <span>SE/25-26/126</span></p>
              </div>
            </div>

            {currentDesign.a4BgUrl && <div className="h-10"></div>}

            <div className="w-full mb-3 leading-[1.5] pl-[5mm] pr-[15px] flex-shrink-0">
              <p style={{ fontFamily: currentDesign.docFont, color: currentDesign.docColor, fontSize: `${currentDesign.docSize}px`, fontWeight: currentDesign.docBold ? 'bold' : 'normal', fontStyle: currentDesign.docItalic ? 'italic' : 'normal', textDecoration: currentDesign.docUnderline ? 'underline' : 'none' }}>
                Certified M/s:- <span className="ml-2 uppercase underline" style={{ fontFamily: currentDesign.custFont, fontSize: `${currentDesign.custSize}px`, color: currentDesign.custColor, fontWeight: currentDesign.custBold ? 'bold' : 'normal', fontStyle: currentDesign.custItalic ? 'italic' : 'normal', textDecoration: currentDesign.custUnderline ? 'underline' : 'none' }}>AJMERI DEVELOPERS</span>
              </p>
              <p className="mt-1" style={{ fontFamily: currentDesign.docFont, color: currentDesign.docColor, fontSize: `${currentDesign.docSize}px`, fontWeight: currentDesign.docBold ? 'bold' : 'normal', fontStyle: currentDesign.docItalic ? 'italic' : 'normal', textDecoration: currentDesign.docUnderline ? 'underline' : 'none' }}>
                Address :- <span className="ml-2 uppercase" style={{ fontFamily: currentDesign.custFont, fontSize: `${currentDesign.custSize}px`, color: currentDesign.custColor, fontWeight: currentDesign.custBold ? 'bold' : 'normal', fontStyle: currentDesign.custItalic ? 'italic' : 'normal', textDecoration: currentDesign.custUnderline ? 'underline' : 'none' }}>{activeFirmObj.address}</span>
              </p>
            </div>

            <div className="w-full leading-[1.4] mb-3 text-center px-4 flex-shrink-0" style={{ fontFamily: currentDesign.docFont, color: currentDesign.docColor, fontSize: `${currentDesign.docSize}px`, fontWeight: currentDesign.docBold ? 'bold' : 'normal', fontStyle: currentDesign.docItalic ? 'italic' : 'normal', textDecoration: currentDesign.docUnderline ? 'underline' : 'none' }}>
              <p>We certify that the fire extinguishers mentioned below</p>
              <p>Are tested and refilled as per the relevant Indian standard.</p>
              <p>This extinguishers are refilled on Date :- <span className="text-red-600 font-mono">12-12-2025</span></p>
              <p>And Warranty will stand valid up to Date :- <span className="text-red-600 font-mono">11-12-2026</span></p>
              <p>Provided the seal is unbroken and in satisfactory condition.</p>
            </div>

            <div className="w-full pr-[5mm] flex-shrink-0 z-30">
              <table className="cert-table">
                <thead>
                  <tr>
                    <th style={{ width: '45%' }}>Extinguisher&nbsp;Type</th>
                    <th style={{ width: '30%' }}>Capacity</th>
                    <th style={{ width: '25%' }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="left-align" style={{ fontStyle: 'italic', fontWeight: 'bold' }}>Hy.&nbsp;Test</td>
                    <td colSpan="2" style={{ fontWeight: 'bold' }}>Pass</td>
                  </tr>
                  <tr>
                    <td className="left-align" style={{ fontStyle: 'italic', fontWeight: 'bold' }}>Parts</td>
                    <td colSpan="2" style={{ fontWeight: 'bold' }}>COMPLETE</td>
                  </tr>
                  <tr>
                    <td className="left-align" style={{ fontStyle: 'italic', fontWeight: 'bold' }}>Remark</td>
                    <td colSpan="2" style={{ fontWeight: 'bold' }}>-</td>
                  </tr>
                  {categories.map((cat, i) => (
                    <tr key={cat}>
                      <td className="left-align" style={{ fontWeight: '500', fontStyle: 'italic' }}>{cat}</td>
                      <td style={{ fontWeight: 'bold' }}>{i === 0 ? '6Kg, 9Kg' : (i === 1 ? '4.5Kg' : '')}</td>
                      <td style={{ fontWeight: 'bold' }}>{i === 0 ? '2+1' : (i === 1 ? '1' : '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-auto pt-10 pb-2 flex justify-between items-end z-20 relative">
              <div className="font-mono" style={{ fontSize: `${Math.max(9, Math.floor(currentDesign.docSize * 0.65))}px`, color: '#64748b', marginTop: '20px' }}>
                {!currentDesign.a4BgUrl && (
                  <>
                    <p>{activeFirmObj.address}</p>
                    <p>{activeFirmObj.contact}</p>
                  </>
                )}
              </div>
              <div 
                className="ml-auto text-center min-w-[220px]" 
                style={{ 
                  fontFamily: currentDesign.sigFont, 
                  color: currentDesign.sigColor,
                  transform: `translate(${currentDesign.sigX || 0}px, ${currentDesign.sigY || 0}px)`
                }}
              >
                <p style={{ 
                  fontSize: `${currentDesign.sigSize}px`, 
                  fontWeight: currentDesign.sigBold ? '900' : 'normal', 
                  fontStyle: currentDesign.sigItalic ? 'italic' : 'normal',
                  textDecoration: currentDesign.sigUnderline ? 'underline' : 'none',
                  wordBreak: 'break-word',
                  lineHeight: '1.2'
                }}>
                  For {activeFirmObj.name}
                </p>
                <div className="h-10"></div>
                <p style={{ 
                  fontSize: `${currentDesign.sigSize}px`, 
                  fontWeight: currentDesign.sigBold ? '900' : 'normal', 
                  fontStyle: currentDesign.sigItalic ? 'italic' : 'normal',
                  textDecoration: currentDesign.sigUnderline ? 'underline' : 'none'
                }}>
                  Authorised Signature
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : (
      <div className="bg-white shadow-2xl relative w-[794px] h-[1123px] min-w-[794px] min-h-[1123px] overflow-hidden flex flex-col shrink-0 box-border z-0 p-10">
        {['logo', 'stamp'].map((k) => {
          const g = currentGraphics[k];
          if (!g || !g.url) return null;
          return (
            <img 
              key={k} 
              src={g.url} 
              alt={k} 
              onMouseDown={(e) => handleMouseDown(k, e)}
              className="cursor-move hover:outline hover:outline-2 hover:outline-blue-500"
              style={{ 
                position: 'absolute', 
                left: `${20 + (g.x || 0)}px`, 
                top: `${20 + (g.y || 0)}px`, 
                width: `${g.size || 80}px`, 
                zIndex: 40, 
                objectFit: 'contain',
                userSelect: 'none'
              }} 
            />
          );
        })}

        <div dangerouslySetInnerHTML={{ __html: getQuoteHeaderHTML() }} />
        <div dangerouslySetInnerHTML={{ __html: getQuoteBillingHTML() }} />

        <div 
          className={`w-full rounded-lg overflow-hidden mb-6 ${currentDesign.tableTemp.includes('corporate') || currentDesign.tableTemp.includes('minimal') ? 'border border-slate-200' : ''}`}
          style={getTableStyle()}
        >
          <table className={`w-full border-collapse ${currentDesign.tableTemp}`}>
            <thead className={currentDesign.tableTemp.includes('dark-head') ? 'bg-slate-800 text-white border-0' : ''} style={currentDesign.tableTemp.includes('dark-head') ? {} : { borderBottom: `2px solid ${currentDesign.quoteThemeColor}` }}>
              <tr style={currentDesign.tableTemp.includes('dark-head') ? {} : { color: currentDesign.tableFontColor }}>
                <th className="text-center w-[10%] uppercase tracking-widest text-[10px]">Sr.</th>
                <th className="text-left w-[40%] pl-2 uppercase tracking-widest text-[10px]">Item Description</th>
                <th className="text-center w-[15%] uppercase tracking-widest text-[10px]">HSN</th>
                <th className="text-center w-[10%] uppercase tracking-widest text-[10px]">Qty</th>
                <th className="text-center w-[10%] uppercase tracking-widest text-[10px]">Rate</th>
                <th className="text-right w-[15%] pr-2 uppercase tracking-widest text-[10px]">Amount</th>
              </tr>
            </thead>
            <tbody className={currentDesign.tableTemp.includes('striped') ? 'even:bg-slate-50' : ''}>
              <tr className="border-b border-slate-100">
                <td className="text-center py-2">1</td>
                <td className="text-left pl-2 font-bold py-2">ABC Fire Extinguisher 6kg</td>
                <td className="text-center py-2">8424</td>
                <td className="text-center py-2">2</td>
                <td className="text-center py-2">₹2250</td>
                <td className="text-right font-bold pr-2 py-2">₹4500.00</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mb-8">
          <div className="text-right font-black text-lg p-3 rounded-xl bg-slate-50 border border-slate-200" style={{ color: currentDesign.quoteThemeColor }}>
            Grand Total: ₹4,500.00
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-slate-200 flex justify-between items-end relative z-10">
          <div 
            style={{ 
              fontFamily: currentDesign.quoteTermFontFam,
              fontSize: `${currentDesign.quoteTermFontSize}px`,
              color: currentDesign.quoteTermFontColor,
              fontWeight: currentDesign.quoteTermFontBold ? 'bold' : 'normal',
              fontStyle: currentDesign.quoteTermFontItalic ? 'italic' : 'normal',
              textDecoration: currentDesign.quoteTermFontUnderline ? 'underline' : 'none',
              transform: `translate(${currentDesign.quoteTermX}px, ${currentDesign.quoteTermY}px)`,
              maxWidth: '450px',
              whiteSpace: 'pre-wrap'
            }}
          >
            {currentDesign.quoteTermText}
          </div>
          <div 
            className="ml-auto text-center min-w-[220px]" 
            style={{ 
              fontFamily: currentDesign.sigFont, 
              color: currentDesign.sigColor,
              transform: `translate(${currentDesign.sigX || 0}px, ${currentDesign.sigY || 0}px)`
            }}
          >
            <p style={{ 
              fontSize: `${currentDesign.sigSize}px`, 
              fontWeight: currentDesign.sigBold ? '900' : 'normal', 
              fontStyle: currentDesign.sigItalic ? 'italic' : 'normal',
              textDecoration: currentDesign.sigUnderline ? 'underline' : 'none',
              wordBreak: 'break-word',
              lineHeight: '1.2'
            }}>
              For {activeFirmObj.name}
            </p>
            <div className="h-12"></div>
            <p style={{ 
              fontSize: `${currentDesign.sigSize}px`, 
              fontWeight: currentDesign.sigBold ? '900' : 'normal', 
              fontStyle: currentDesign.sigItalic ? 'italic' : 'normal',
              textDecoration: currentDesign.sigUnderline ? 'underline' : 'none'
            }}>
              Authorised Signature
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div 
      className="tab-content active h-[calc(100vh-65px)] w-full relative bg-slate-100 overflow-y-auto custom-scrollbar p-4 md:p-6 animate-[fadeIn_0.3s_ease-in-out] select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <style dangerouslySetInnerHTML={{__html: `
        .cert-table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; background: #fff; }
        .cert-table th { padding: 5px; text-align: center; border: 1px solid #000; background: #f8fafc; font-family: ${currentDesign.docFont}, sans-serif; font-size: ${currentDesign.docSize}px; color: ${currentDesign.docColor}; font-weight: ${currentDesign.docBold ? 'bold' : 'bold'}; font-style: ${currentDesign.docItalic ? 'italic' : 'normal'}; text-decoration: ${currentDesign.docUnderline ? 'underline' : 'none'}; }
        .cert-table td { padding: 4px 5px; text-align: center; border: 1px solid #000; font-family: ${currentDesign.docFont}, sans-serif; font-size: ${currentDesign.docSize}px; color: ${currentDesign.docColor}; font-weight: ${currentDesign.docBold ? 'bold' : 'normal'}; font-style: ${currentDesign.docItalic ? 'italic' : 'normal'}; text-decoration: ${currentDesign.docUnderline ? 'underline' : 'none'}; }
        .cert-table td.left-align { text-align: left; padding-left: 10px; }
        .vert-text-stable { display: flex; flex-direction: column; gap: 8px; font-size: 42px; font-weight: 900; line-height: 1; text-align: center; }
        .table-base th { padding: 12px 10px; border-bottom: 2px solid ${currentDesign.quoteThemeColor}; text-transform: uppercase; }
        .table-base td { padding: 10px; border-bottom: 1px solid #f1f5f9; }
        .table-striped tbody tr:nth-child(even) { background-color: #f8fafc; }
        .table-corporate { border: 1px solid #e2e8f0; }
        .table-corporate th { background: #f1f5f9; padding: 12px 10px; border-bottom: 1px solid #cbd5e1; text-transform: uppercase; }
        .table-corporate td { border-bottom: 1px solid #e2e8f0; padding: 10px; }
        .table-dark-head th { background-color: ${currentDesign.quoteThemeColor}; color: white !important; padding: 12px 10px; text-transform: uppercase; border: none; }
        .table-dark-head td { padding: 10px; border-bottom: 1px solid #f1f5f9; }
        .table-minimal th { border-bottom: 1px solid currentColor; padding: 8px 10px; text-transform: uppercase; }
        .table-minimal td { padding: 8px 10px; border-bottom: 1px dashed #e2e8f0; }
        .table-bordered { border: 1px solid #cbd5e1; }
        .table-bordered th, .table-bordered td { border: 1px solid #cbd5e1; padding: 10px; }
        .table-bordered th { background: #f8fafc; text-transform: uppercase; }
        .table-elegant th { border-top: 2px solid currentColor; border-bottom: 2px solid currentColor; padding: 12px 10px; text-transform: uppercase; }
        .table-elegant td { padding: 12px 10px; border-bottom: 1px solid #f1f5f9; }
        .table-accent th { background-color: ${currentDesign.quoteThemeColor}15; color: ${currentDesign.quoteThemeColor} !important; padding: 12px 10px; border-bottom: 2px solid ${currentDesign.quoteThemeColor}; text-transform: uppercase; }
        .table-accent td { padding: 12px 10px; border-bottom: 1px dashed #cbd5e1; }
        .table-compact th, .table-compact td { padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
        .table-compact th { background: #f8fafc; text-transform: uppercase; }
        .table-spaced { border-collapse: separate; border-spacing: 0 4px; }
        .table-spaced th { padding: 10px; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; }
        .table-spaced td { background: #f8fafc; padding: 12px 10px; }
      `}} />

      {isMobilePreviewOpen && (
        <div className="fixed inset-0 z-[99999] flex flex-col justify-end bg-slate-900/70 backdrop-blur-sm transition-all duration-300 lg:hidden">
          <div className="w-full h-[90vh] bg-slate-100 rounded-t-3xl flex flex-col shadow-2xl overflow-hidden animate-[slideUp_0.3s]">
            <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0 shadow-sm z-10">
              <h2 className="font-black text-slate-800 text-sm tracking-widest uppercase flex items-center gap-2">LIVE DOCUMENT PREVIEW</h2>
              <button onClick={() => setIsMobilePreviewOpen(false)} className="text-slate-400 hover:text-red-500 font-bold text-2xl leading-none">&times;</button>
            </div>
            <div className="flex-1 bg-slate-500 overflow-y-auto overflow-x-hidden flex justify-center items-start py-4 w-full custom-scrollbar">
              <div className="origin-top transform scale-[0.45] transition-transform drop-shadow-2xl mb-10">{renderA4Content()}</div>
            </div>
            <div className="p-4 bg-white border-t border-slate-200 flex justify-end items-center shrink-0 z-10">
              <button onClick={() => setIsMobilePreviewOpen(false)} className="w-full bg-slate-800 hover:bg-slate-900 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer">CLOSE</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto pb-10">
        
        {/* 🟢 Top Header Bar with Back Button & Icons */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between gap-4 mb-6">
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              Template Settings & Design
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 flex flex-col gap-5 max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar">
            
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-widest">⚙️ Select Design Mode</label>
                <button type="button" onClick={() => setIsMobilePreviewOpen(true)} className="lg:hidden bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold text-xs px-3 py-2 rounded-lg uppercase transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer">
                  <span>Preview</span>
                </button>
              </div>
              <select value={designMode} onChange={(e) => setDesignMode(e.target.value)} className="w-full bg-[#0f172a] text-white text-xs font-bold py-3 px-4 rounded-xl cursor-pointer shadow-md border-0 outline-none hover:bg-slate-800 transition-all text-center">
                <option value="certificate">📄 Certificate Layouts</option>
                <option value="quotation">Quotation Layouts</option>
              </select>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h3 className="font-black text-slate-800 text-[11px] uppercase text-indigo-600">🎨 Edit Graphics For Firm ({designMode}):</h3>
                <button type="button" onClick={handleSaveTemplateToCloud} className="bg-[#00a67e] hover:bg-emerald-600 text-white font-black text-[10px] px-3 py-1.5 rounded-lg uppercase shadow-sm transition-all cursor-pointer">💾 Save to Cloud</button>
              </div>
              <select value={selectedFirmId} onChange={(e) => setSelectedFirmId(e.target.value)} className="w-full text-xs font-bold py-2.5 px-3 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-900 outline-none cursor-pointer">
                {filteredFirms.map(f => (
                  <option key={f.id} value={f.id}>{f.type === 'certificate' ? '📄' : '🧾'} {f.name}</option>
                ))}
              </select>
            </div>

            {designMode === 'certificate' && (
              <div className="flex flex-col gap-4 animate-[fadeIn_0.2s_ease-in-out]">
                <div className="bg-teal-50 border border-teal-200 p-4 rounded-2xl shadow-sm flex flex-col gap-4">
                  <h3 className="font-black text-teal-800 text-xs uppercase border-b border-teal-200 pb-2">🖼️ A4 Layout, Theme & Graphics</h3>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">Theme Color</label>
                    <input type="color" value={currentDesign.themeColor} onChange={(e) => setCurrentDesign({...currentDesign, themeColor: e.target.value})} className="w-full h-9 rounded-lg cursor-pointer border border-slate-300 p-0.5 bg-white shadow-sm" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">"Certificate" Position</label>
                    <div className="grid grid-cols-12 gap-2">
                      <select value={currentDesign.certPos} onChange={(e) => setCurrentDesign({...currentDesign, certPos: e.target.value})} className="col-span-6 text-xs font-bold py-2 px-3 rounded-xl border border-slate-300 bg-white text-slate-700 outline-none shadow-sm cursor-pointer">
                        <option value="left-vert">Vertical Left</option>
                        <option value="top-center">Top Centered</option>
                        <option value="none">Hidden</option>
                      </select>
                      <input type="number" value={currentDesign.certPosX} onChange={(e) => setCurrentDesign({...currentDesign, certPosX: Number(e.target.value)})} placeholder="X" className="col-span-3 text-xs py-2 text-center font-mono font-bold rounded-xl border border-slate-300 bg-white shadow-sm" />
                      <input type="number" value={currentDesign.certPosY} onChange={(e) => setCurrentDesign({...currentDesign, certPosY: Number(e.target.value)})} placeholder="Y" className="col-span-3 text-xs py-2 text-center font-mono font-bold rounded-xl border border-slate-300 bg-white shadow-sm" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Certificate Text Font Setup</label>
                    <div className="grid grid-cols-12 gap-1 p-2 bg-white rounded-xl border border-slate-200 shadow-sm items-center">
                      <select value={currentDesign.certFont} onChange={(e) => setCurrentDesign({...currentDesign, certFont: e.target.value})} className="col-span-4 text-xs font-bold py-1.5 px-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 truncate">
                        {currentDesign.customFonts.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <div className="col-span-2 flex items-center gap-0.5 justify-center">
                        <button type="button" onClick={handleAddFont} className="bg-emerald-600 text-white w-5 h-5 rounded text-[10px] font-black">+</button>
                        <button type="button" onClick={() => handleDeleteFont(currentDesign.certFont)} className="bg-red-500 text-white w-5 h-5 rounded text-[10px] font-black">-</button>
                      </div>
                      <input type="number" value={currentDesign.certSize} onChange={(e) => setCurrentDesign({...currentDesign, certSize: Number(e.target.value)})} className="col-span-1 text-xs py-1.5 text-center font-mono font-bold rounded-lg border border-slate-200 bg-slate-50" placeholder="Size" />
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, certBold: !currentDesign.certBold})} className={`col-span-1 h-8 rounded-lg font-serif font-bold text-xs border ${currentDesign.certBold ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>B</button>
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, certItalic: !currentDesign.certItalic})} className={`col-span-1 h-8 rounded-lg font-serif italic text-xs border ${currentDesign.certItalic ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>I</button>
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, certUnderline: !currentDesign.certUnderline})} className={`col-span-1 h-8 rounded-lg font-serif underline text-xs border ${currentDesign.certUnderline ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>U</button>
                      <input type="color" value={currentDesign.certColor} onChange={(e) => setCurrentDesign({...currentDesign, certColor: e.target.value})} className="col-span-2 h-8 w-full p-0.5 border border-slate-300 rounded-lg cursor-pointer bg-white" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Header Font Setup</label>
                    <div className="grid grid-cols-12 gap-1 p-2 bg-white rounded-xl border border-slate-200 shadow-sm items-center">
                      <select value={currentDesign.headerFont} onChange={(e) => setCurrentDesign({...currentDesign, headerFont: e.target.value})} className="col-span-4 text-xs font-bold py-1.5 px-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 truncate">
                        {currentDesign.customFonts.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <div className="col-span-2 flex items-center gap-0.5 justify-center">
                        <button type="button" onClick={handleAddFont} className="bg-emerald-600 text-white w-5 h-5 rounded text-[10px] font-black">+</button>
                        <button type="button" onClick={() => handleDeleteFont(currentDesign.headerFont)} className="bg-red-500 text-white w-5 h-5 rounded text-[10px] font-black">-</button>
                      </div>
                      <input type="number" value={currentDesign.headerSize} onChange={(e) => setCurrentDesign({...currentDesign, headerSize: Number(e.target.value)})} className="col-span-1 text-xs py-1.5 text-center font-mono font-bold rounded-lg border border-slate-200 bg-slate-50" placeholder="Size" />
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, headerBold: !currentDesign.headerBold})} className={`col-span-1 h-8 rounded-lg font-serif font-bold text-xs border ${currentDesign.headerBold ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>B</button>
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, headerItalic: !currentDesign.headerItalic})} className={`col-span-1 h-8 rounded-lg font-serif italic text-xs border ${currentDesign.headerItalic ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>I</button>
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, headerUnderline: !currentDesign.headerUnderline})} className={`col-span-1 h-8 rounded-lg font-serif underline text-xs border ${currentDesign.headerUnderline ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>U</button>
                      <input type="color" value={currentDesign.headerColor} onChange={(e) => setCurrentDesign({...currentDesign, headerColor: e.target.value})} className="col-span-2 h-8 w-full p-0.5 border border-slate-300 rounded-lg cursor-pointer bg-white" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Doc Font Setup (Body, Date, Table)</label>
                    <div className="grid grid-cols-12 gap-1 p-2 bg-white rounded-xl border border-slate-200 shadow-sm items-center">
                      <select value={currentDesign.docFont} onChange={(e) => setCurrentDesign({...currentDesign, docFont: e.target.value})} className="col-span-4 text-xs font-bold py-1.5 px-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 truncate">
                        {currentDesign.customFonts.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <div className="col-span-2 flex items-center gap-0.5 justify-center">
                        <button type="button" onClick={handleAddFont} className="bg-emerald-600 text-white w-5 h-5 rounded text-[10px] font-black">+</button>
                        <button type="button" onClick={() => handleDeleteFont(currentDesign.docFont)} className="bg-red-500 text-white w-5 h-5 rounded text-[10px] font-black">-</button>
                      </div>
                      <input type="number" value={currentDesign.docSize} onChange={(e) => setCurrentDesign({...currentDesign, docSize: Number(e.target.value)})} className="col-span-1 text-xs py-1.5 text-center font-mono font-bold rounded-lg border border-slate-200 bg-slate-50" placeholder="Size" />
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, docBold: !currentDesign.docBold})} className={`col-span-1 h-8 rounded-lg font-serif font-bold text-xs border ${currentDesign.docBold ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>B</button>
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, docItalic: !currentDesign.docItalic})} className={`col-span-1 h-8 rounded-lg font-serif italic text-xs border ${currentDesign.docItalic ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>I</button>
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, docUnderline: !currentDesign.docUnderline})} className={`col-span-1 h-8 rounded-lg font-serif underline text-xs border ${currentDesign.docUnderline ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>U</button>
                      <input type="color" value={currentDesign.docColor} onChange={(e) => setCurrentDesign({...currentDesign, docColor: e.target.value})} className="col-span-2 h-8 w-full p-0.5 border border-slate-300 rounded-lg cursor-pointer bg-white" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Cust Font Setup (Customer & Address)</label>
                    <div className="grid grid-cols-12 gap-1 p-2 bg-white rounded-xl border border-slate-200 shadow-sm items-center">
                      <select value={currentDesign.custFont} onChange={(e) => setCurrentDesign({...currentDesign, custFont: e.target.value})} className="col-span-4 text-xs font-bold py-1.5 px-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 truncate">
                        {currentDesign.customFonts.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <div className="col-span-2 flex items-center gap-0.5 justify-center">
                        <button type="button" onClick={handleAddFont} className="bg-emerald-600 text-white w-5 h-5 rounded text-[10px] font-black">+</button>
                        <button type="button" onClick={() => handleDeleteFont(currentDesign.custFont)} className="bg-red-500 text-white w-5 h-5 rounded text-[10px] font-black">-</button>
                      </div>
                      <input type="number" value={currentDesign.custSize} onChange={(e) => setCurrentDesign({...currentDesign, custSize: Number(e.target.value)})} className="col-span-1 text-xs py-1.5 text-center font-mono font-bold rounded-lg border border-slate-200 bg-slate-50" placeholder="Size" />
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, custBold: !currentDesign.custBold})} className={`col-span-1 h-8 rounded-lg font-serif font-bold text-xs border ${currentDesign.custBold ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>B</button>
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, custItalic: !currentDesign.custItalic})} className={`col-span-1 h-8 rounded-lg font-serif italic text-xs border ${currentDesign.custItalic ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>I</button>
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, custUnderline: !currentDesign.custUnderline})} className={`col-span-1 h-8 rounded-lg font-serif underline text-xs border ${currentDesign.custUnderline ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>U</button>
                      <input type="color" value={currentDesign.custColor} onChange={(e) => setCurrentDesign({...currentDesign, custColor: e.target.value})} className="col-span-2 h-8 w-full p-0.5 border border-slate-300 rounded-lg cursor-pointer bg-white" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <label className="block text-[10px] font-bold text-slate-700 uppercase">Signature Setup (Center Aligned)</label>
                    <div className="grid grid-cols-12 gap-1 items-center">
                      <select value={currentDesign.sigFont} onChange={(e) => setCurrentDesign({...currentDesign, sigFont: e.target.value})} className="col-span-4 text-xs font-bold py-1.5 px-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 truncate">
                        {currentDesign.customFonts.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <input type="number" value={currentDesign.sigSize} onChange={(e) => setCurrentDesign({...currentDesign, sigSize: Number(e.target.value)})} className="col-span-2 text-xs py-1.5 text-center font-mono font-bold rounded-lg border border-slate-200 bg-slate-50" placeholder="Size" />
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, sigBold: !currentDesign.sigBold})} className={`col-span-1 h-8 rounded-lg font-serif font-bold text-xs border ${currentDesign.sigBold ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>B</button>
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, sigItalic: !currentDesign.sigItalic})} className={`col-span-1 h-8 rounded-lg font-serif italic text-xs border ${currentDesign.sigItalic ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>I</button>
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, sigUnderline: !currentDesign.sigUnderline})} className={`col-span-1 h-8 rounded-lg font-serif underline text-xs border ${currentDesign.sigUnderline ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>U</button>
                      <input type="color" value={currentDesign.sigColor} onChange={(e) => setCurrentDesign({...currentDesign, sigColor: e.target.value})} className="col-span-3 h-8 w-full p-0.5 border border-slate-300 rounded-lg cursor-pointer bg-white" />
                    </div>
                    <div className="grid grid-cols-12 gap-2 mt-2 pt-2 border-t border-slate-100 items-center">
                      <span className="col-span-4 text-[10px] font-bold text-slate-500 uppercase">Position X / Y:</span>
                      <input type="number" value={currentDesign.sigX} onChange={(e) => setCurrentDesign({...currentDesign, sigX: Number(e.target.value)})} placeholder="X" className="col-span-4 text-xs py-1 text-center font-mono font-bold rounded-lg border border-slate-300 bg-slate-50" />
                      <input type="number" value={currentDesign.sigY} onChange={(e) => setCurrentDesign({...currentDesign, sigY: Number(e.target.value)})} placeholder="Y" className="col-span-4 text-xs py-1 text-center font-mono font-bold rounded-lg border border-slate-300 bg-slate-50" />
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black uppercase text-slate-700">A4 Background</label>
                      {currentDesign.a4BgUrl && <button onClick={() => setCurrentDesign({...currentDesign, a4BgUrl: ''})} className="text-red-500 font-bold text-xs">Delete</button>}
                    </div>
                    <input type="file" accept="image/*" onChange={handleBgFile} className="text-[9px] w-full text-slate-400 cursor-pointer" />
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Top Margin (px):</label>
                      <input type="number" value={currentDesign.topMargin} onChange={(e) => setCurrentDesign({...currentDesign, topMargin: Number(e.target.value)})} className="pro-input text-xs py-1 font-mono font-bold text-center" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { name: 'Top Logo', key: 'logo' },
                      { name: 'Right Ext', key: 'rightExt' },
                      { name: 'Sub Image', key: 'subImage' },
                      { name: 'Stamping', key: 'stamp' },
                      { name: 'ISO Logo', key: 'isoLogo' },
                      { name: 'GeM Logo', key: 'gemLogo' },
                      { name: 'MSME', key: 'msme' },
                      { name: 'Make In India', key: 'makeInIndia' }
                    ].map((item) => {
                      const slotData = currentGraphics[item.key] || { url: '', x: 0, y: 0, size: 100 };
                      return (
                        <div key={item.key} className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                            <label className="text-[9px] font-black uppercase text-slate-700">{item.name}</label>
                            {slotData.url && <button onClick={() => removeGraphic(item.key)} className="text-red-500 font-bold text-xs hover:underline">✕ Del</button>}
                          </div>
                          <input type="file" accept="image/*" onChange={(e) => handleGraphicFile(item.key, e.target.files[0])} className="text-[8px] w-full text-slate-400 cursor-pointer" />
                          <div className="grid grid-cols-3 gap-1">
                            <input type="number" value={slotData.x} onChange={(e) => updateGraphicProp(item.key, 'x', e.target.value)} placeholder="X" className="text-[10px] border border-slate-200 p-1 text-center rounded font-mono font-bold bg-slate-50" />
                            <input type="number" value={slotData.y} onChange={(e) => updateGraphicProp(item.key, 'y', e.target.value)} placeholder="Y" className="text-[10px] border border-slate-200 p-1 text-center rounded font-mono font-bold bg-slate-50" />
                            <input type="number" value={slotData.size} onChange={(e) => updateGraphicProp(item.key, 'size', e.target.value)} placeholder="Size" className="text-[10px] border border-slate-200 p-1 text-center rounded font-mono font-bold bg-slate-50" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-red-50 p-4 rounded-xl border border-red-200 shadow-sm">
                  <h4 className="font-black text-[11px] text-red-900 uppercase mb-2 border-b border-red-200 pb-2">🔥 Main Categories</h4>
                  <form onSubmit={handleAddCategory} className="flex gap-2 mb-3">
                    <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="text-xs py-2 px-3 rounded-xl border border-red-200 bg-white w-full outline-none font-bold" placeholder="New Category..." />
                    <button type="submit" className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase shadow-sm">➕</button>
                  </form>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((cat) => (
                      <span key={cat} className="bg-white border border-red-200 text-red-800 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm">
                        {cat} <button type="button" onClick={() => removeCategory(cat)} className="text-red-500 hover:text-red-700 font-black">&times;</button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 shadow-sm">
                  <h4 className="font-black text-[11px] text-blue-900 uppercase mb-2 border-b border-blue-200 pb-2">📏 Capacities</h4>
                  <form onSubmit={handleAddCapacity} className="flex gap-2 mb-3">
                    <input type="text" value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} className="text-xs py-2 px-3 rounded-xl border border-blue-200 bg-white w-full outline-none font-bold" placeholder="New Capacity..." />
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase shadow-sm">➕</button>
                  </form>
                  <div className="flex flex-wrap gap-1.5">
                    {capacities.map((cap) => (
                      <span key={cap} className="bg-white border border-blue-200 text-blue-800 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm">
                        {cap} <button type="button" onClick={() => removeCapacity(cap)} className="text-blue-500 hover:text-blue-700 font-black">&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {designMode === 'quotation' && (
              <div className="flex flex-col gap-4 mt-2 animate-[fadeIn_0.2s_ease-in-out]">
                <div className="bg-pink-50 border border-pink-200 p-4 rounded-2xl shadow-sm flex flex-col gap-3">
                  <h3 className="font-black text-pink-800 text-[11px] uppercase border-b border-pink-200 pb-2">🎨 1. Global & Title Setup</h3>
                  <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-pink-100 shadow-sm">
                    <label className="text-[10px] font-bold text-slate-600 uppercase ml-1">Theme Color</label>
                    <input type="color" value={currentDesign.quoteThemeColor} onChange={(e) => setCurrentDesign({...currentDesign, quoteThemeColor: e.target.value})} className="w-10 h-8 rounded-lg cursor-pointer border border-slate-300 p-0.5 bg-white shadow-sm" />
                  </div>
                  <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-pink-100 shadow-sm">
                    <label className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Title Text:</label>
                    <input type="text" value={currentDesign.quoteTitle} onChange={(e) => setCurrentDesign({...currentDesign, quoteTitle: e.target.value})} className="flex-1 text-xs font-black text-slate-800 py-1.5 px-3 border border-slate-300 rounded-lg bg-slate-50 outline-none" />
                  </div>

                  <div className="flex flex-col gap-1.5 bg-white p-2.5 rounded-xl border border-pink-100 shadow-sm mt-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">Title Font & Position Setup</label>
                    <div className="grid grid-cols-12 gap-1 items-center">
                      <select value={currentDesign.quoteTitleFont} onChange={(e) => setCurrentDesign({...currentDesign, quoteTitleFont: e.target.value})} className="col-span-4 text-xs font-bold py-1.5 px-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 truncate">
                        {currentDesign.customFonts.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <div className="col-span-2 flex items-center gap-0.5 justify-center">
                        <button type="button" onClick={handleAddFont} className="bg-emerald-600 text-white w-5 h-5 rounded text-[10px] font-black">+</button>
                        <button type="button" onClick={() => handleDeleteFont(currentDesign.quoteTitleFont)} className="bg-red-500 text-white w-5 h-5 rounded text-[10px] font-black">-</button>
                      </div>
                      <input type="number" value={currentDesign.quoteTitleSize} onChange={(e) => setCurrentDesign({...currentDesign, quoteTitleSize: Number(e.target.value)})} className="col-span-1 text-xs py-1.5 text-center font-mono font-bold rounded-lg border border-slate-200 bg-slate-50" placeholder="Size" />
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, quoteTitleBold: !currentDesign.quoteTitleBold})} className={`col-span-1 h-8 rounded-lg font-serif font-bold text-xs border ${currentDesign.quoteTitleBold ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>B</button>
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, quoteTitleItalic: !currentDesign.quoteTitleItalic})} className={`col-span-1 h-8 rounded-lg font-serif italic text-xs border ${currentDesign.quoteTitleItalic ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>I</button>
                      <button type="button" onClick={() => setCurrentDesign({...currentDesign, quoteTitleUnderline: !currentDesign.quoteTitleUnderline})} className={`col-span-1 h-8 rounded-lg font-serif underline text-xs border ${currentDesign.quoteTitleUnderline ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>U</button>
                      <input type="color" value={currentDesign.quoteTitleColor} onChange={(e) => setCurrentDesign({...currentDesign, quoteTitleColor: e.target.value})} className="col-span-2 h-8 w-full p-0.5 border border-slate-300 rounded-lg cursor-pointer bg-white" />
                    </div>
                    <div className="grid grid-cols-12 gap-2 mt-1 pt-2 border-t border-slate-100 items-center">
                      <span className="col-span-4 text-[10px] font-bold text-slate-500 uppercase">Position X / Y:</span>
                      <input type="number" value={currentDesign.quoteTitleX} onChange={(e) => setCurrentDesign({...currentDesign, quoteTitleX: Number(e.target.value)})} placeholder="X" className="col-span-4 text-xs py-1 text-center font-mono font-bold rounded-lg border border-slate-300 bg-slate-50" />
                      <input type="number" value={currentDesign.quoteTitleY} onChange={(e) => setCurrentDesign({...currentDesign, quoteTitleY: Number(e.target.value)})} placeholder="Y" className="col-span-4 text-xs py-1 text-center font-mono font-bold rounded-lg border border-slate-300 bg-slate-50" />
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex flex-col gap-2.5">
                  <label className="text-[11px] font-black uppercase text-indigo-700 tracking-wider border-b border-slate-100 pb-2">
                    2. Header Setup (15 Designs)
                  </label>
                  <select 
                    value={currentDesign.headerTemp}
                    onChange={(e) => setCurrentDesign({...currentDesign, headerTemp: e.target.value})}
                    className="text-xs font-bold w-full py-2.5 px-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-700 outline-none shadow-sm cursor-pointer mb-1"
                  >
                    {[
                      { val: 'h-classic-left', label: 'Classic Left' },
                      { val: 'h-solid-block', label: 'Solid Block' },
                      { val: 'h-dark-mode', label: 'Dark Mode' },
                      { val: 'h-ultimate-pro', label: 'Ultimate Pro' },
                      { val: 'h-modern-right', label: 'Modern Right' },
                      { val: 'h-elegant-line', label: 'Elegant Line' },
                      { val: 'h-center-focus', label: 'Center Focus' },
                      { val: 'h-minimal-box', label: 'Minimal Box' },
                      { val: 'h-bold-brand', label: 'Bold Brand' },
                      { val: 'h-gradient-fade', label: 'Gradient Fade' },
                      { val: 'h-corporate-split', label: 'Corporate Split' },
                      { val: 'h-luxury-accent', label: 'Luxury Accent' },
                      { val: 'h-tech-neon', label: 'Tech Neon' },
                      { val: 'h-clean-cut', label: 'Clean Cut' },
                      { val: 'h-vintage-stamp', label: 'Vintage Stamp' }
                    ].map((opt, i) => (
                      <option key={opt.val} value={opt.val}>
                        Header Design #{i+1} ({opt.label})
                      </option>
                    ))}
                  </select>
                  
                  <div className="grid grid-cols-12 gap-1 p-2 bg-slate-50 rounded-xl border border-slate-200 items-center shadow-sm">
                    <select value={currentDesign.headerFontFam} onChange={(e) => setCurrentDesign({...currentDesign, headerFontFam: e.target.value})} className="col-span-4 text-xs font-bold py-1.5 px-1 rounded-lg border border-slate-200 bg-white truncate">
                      {currentDesign.customFonts.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <div className="col-span-2 flex items-center gap-0.5 justify-center">
                      <button type="button" onClick={handleAddFont} className="bg-emerald-600 text-white w-5 h-5 rounded text-[10px] font-black">+</button>
                      <button type="button" onClick={() => handleDeleteFont(currentDesign.headerFontFam)} className="bg-red-500 text-white w-5 h-5 rounded text-[10px] font-black">-</button>
                    </div>
                    <input type="number" value={currentDesign.headerFontSize} onChange={(e) => setCurrentDesign({...currentDesign, headerFontSize: Number(e.target.value)})} className="col-span-1 text-xs py-1.5 text-center font-mono font-bold rounded-lg border border-slate-200 bg-slate-50" placeholder="Size" />
                    <button type="button" onClick={() => setCurrentDesign({...currentDesign, headerFontBold: !currentDesign.headerFontBold})} className={`col-span-1 h-8 rounded-lg font-serif font-bold text-xs border ${currentDesign.headerFontBold ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'}`}>B</button>
                    <button type="button" onClick={() => setCurrentDesign({...currentDesign, headerFontItalic: !currentDesign.headerFontItalic})} className={`col-span-1 h-8 rounded-lg font-serif italic text-xs border ${currentDesign.headerFontItalic ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'}`}>I</button>
                    <button type="button" onClick={() => setCurrentDesign({...currentDesign, headerFontUnderline: !currentDesign.headerFontUnderline})} className={`col-span-1 h-8 rounded-lg font-serif underline text-xs border ${currentDesign.headerFontUnderline ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'}`}>U</button>
                    <input type="color" value={currentDesign.headerFontColor} onChange={(e) => setCurrentDesign({...currentDesign, headerFontColor: e.target.value})} className="col-span-2 h-8 w-full p-0.5 border border-slate-300 rounded-lg cursor-pointer bg-white" title="Header Color" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex flex-col gap-2.5">
                  <label className="text-[11px] font-black uppercase text-indigo-700 tracking-wider border-b border-slate-100 pb-2">
                    3. Billing Setup (15 Designs)
                  </label>
                  <select 
                    value={currentDesign.billingTemp}
                    onChange={(e) => setCurrentDesign({...currentDesign, billingTemp: e.target.value})}
                    className="text-xs font-bold w-full py-2.5 px-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-700 outline-none shadow-sm cursor-pointer mb-1"
                  >
                    {[
                      { val: 'b-classic-split', label: 'Classic Split' },
                      { val: 'b-dual-cards', label: 'Dual Cards' },
                      { val: 'b-solid-right', label: 'Solid Right' },
                      { val: 'b-grid-compact', label: 'Compact Grid' },
                      { val: 'b-ultra-premium', label: 'Ultra Premium' },
                      { val: 'b-minimal-border', label: 'Minimal Border' },
                      { val: 'b-floating-shadow', label: 'Floating Shadow' },
                      { val: 'b-accent-left', label: 'Accent Left' },
                      { val: 'b-boxed-tint', label: 'Boxed Tint' },
                      { val: 'b-corporate-grey', label: 'Corporate Grey' },
                      { val: 'b-clean-line', label: 'Clean Line' },
                      { val: 'b-modern-dark', label: 'Modern Dark' },
                      { val: 'b-tech-grid', label: 'Tech Grid' },
                      { val: 'b-elegant-serif', label: 'Elegant Serif' },
                      { val: 'b-impact-block', label: 'Impact Block' }
                    ].map((opt, i) => (
                      <option key={opt.val} value={opt.val}>
                        Billing Design #{i+1} ({opt.label})
                      </option>
                    ))}
                  </select>
                  
                  <div className="grid grid-cols-12 gap-1 p-2 bg-slate-50 rounded-xl border border-slate-200 items-center shadow-sm">
                    <select value={currentDesign.billingFontFam} onChange={(e) => setCurrentDesign({...currentDesign, billingFontFam: e.target.value})} className="col-span-4 text-xs font-bold py-1.5 px-1 rounded-lg border border-slate-200 bg-white truncate">
                      {currentDesign.customFonts.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <div className="col-span-2 flex items-center gap-0.5 justify-center">
                      <button type="button" onClick={handleAddFont} className="bg-emerald-600 text-white w-5 h-5 rounded text-[10px] font-black">+</button>
                      <button type="button" onClick={() => handleDeleteFont(currentDesign.billingFontFam)} className="bg-red-500 text-white w-5 h-5 rounded text-[10px] font-black">-</button>
                    </div>
                    <input type="number" value={currentDesign.billingFontSize} onChange={(e) => setCurrentDesign({...currentDesign, billingFontSize: Number(e.target.value)})} className="col-span-1 text-xs py-1.5 text-center font-mono font-bold rounded-lg border border-slate-200 bg-slate-50" placeholder="Size" />
                    <button type="button" onClick={() => setCurrentDesign({...currentDesign, billingFontBold: !currentDesign.billingFontBold})} className={`col-span-1 h-8 rounded-lg font-serif font-bold text-xs border ${currentDesign.billingFontBold ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'}`}>B</button>
                    <button type="button" onClick={() => setCurrentDesign({...currentDesign, billingFontItalic: !currentDesign.billingFontItalic})} className={`col-span-1 h-8 rounded-lg font-serif italic text-xs border ${currentDesign.billingFontItalic ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'}`}>I</button>
                    <button type="button" onClick={() => setCurrentDesign({...currentDesign, billingFontUnderline: !currentDesign.billingFontUnderline})} className={`col-span-1 h-8 rounded-lg font-serif underline text-xs border ${currentDesign.billingFontUnderline ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'}`}>U</button>
                    <input type="color" value={currentDesign.billingFontColor} onChange={(e) => setCurrentDesign({...currentDesign, billingFontColor: e.target.value})} className="col-span-2 h-8 w-full p-0.5 border border-slate-300 rounded-lg cursor-pointer bg-white" title="Billing Color" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex flex-col gap-2.5">
                  <label className="text-[11px] font-black uppercase text-indigo-700 tracking-wider border-b border-slate-100 pb-2">
                    4. Table Setup (10 Designs)
                  </label>
                  <select 
                    value={currentDesign.tableTemp}
                    onChange={(e) => setCurrentDesign({...currentDesign, tableTemp: e.target.value})}
                    className="text-xs font-bold w-full py-2.5 px-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-700 outline-none shadow-sm cursor-pointer mb-1"
                  >
                    {[
                      { val: 'table-base', label: 'Modern Line Grid' },
                      { val: 'table-base table-striped', label: 'Zebra Striped' },
                      { val: 'table-corporate', label: 'Classic Corporate' },
                      { val: 'table-dark-head', label: 'Dark Header' },
                      { val: 'table-minimal', label: 'Minimal Box' },
                      { val: 'table-bordered', label: 'Full Bordered' },
                      { val: 'table-elegant', label: 'Elegant Serif' },
                      { val: 'table-accent', label: 'Accent Highlight' },
                      { val: 'table-compact', label: 'Compact Spacing' },
                      { val: 'table-spaced', label: 'Wide Spacing' }
                    ].map((opt, i) => (
                      <option key={opt.val} value={opt.val}>
                        Table Design #{i+1} ({opt.label})
                      </option>
                    ))}
                  </select>
                  
                  <div className="grid grid-cols-12 gap-1 p-2 bg-slate-50 rounded-xl border border-slate-200 items-center shadow-sm">
                    <select value={currentDesign.tableFontFam} onChange={(e) => setCurrentDesign({...currentDesign, tableFontFam: e.target.value})} className="col-span-4 text-xs font-bold py-1.5 px-1 rounded-lg border border-slate-200 bg-white truncate">
                      {currentDesign.customFonts.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <div className="col-span-2 flex items-center gap-0.5 justify-center">
                      <button type="button" onClick={handleAddFont} className="bg-emerald-600 text-white w-5 h-5 rounded text-[10px] font-black">+</button>
                      <button type="button" onClick={() => handleDeleteFont(currentDesign.tableFontFam)} className="bg-red-500 text-white w-5 h-5 rounded text-[10px] font-black">-</button>
                    </div>
                    <input type="number" value={currentDesign.tableFontSize} onChange={(e) => setCurrentDesign({...currentDesign, tableFontSize: Number(e.target.value)})} className="col-span-1 text-xs py-1.5 text-center font-mono font-bold rounded-lg border border-slate-200 bg-slate-50" placeholder="Size" />
                    <button type="button" onClick={() => setCurrentDesign({...currentDesign, tableFontBold: !currentDesign.tableFontBold})} className={`col-span-1 h-8 rounded-lg font-serif font-bold text-xs border ${currentDesign.tableFontBold ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'}`}>B</button>
                    <button type="button" onClick={() => setCurrentDesign({...currentDesign, tableFontItalic: !currentDesign.tableFontItalic})} className={`col-span-1 h-8 rounded-lg font-serif italic text-xs border ${currentDesign.tableFontItalic ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'}`}>I</button>
                    <button type="button" onClick={() => setCurrentDesign({...currentDesign, tableFontUnderline: !currentDesign.tableFontUnderline})} className={`col-span-1 h-8 rounded-lg font-serif underline text-xs border ${currentDesign.tableFontUnderline ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'}`}>U</button>
                    <input type="color" value={currentDesign.tableFontColor} onChange={(e) => setCurrentDesign({...currentDesign, tableFontColor: e.target.value})} className="col-span-2 h-8 w-full p-0.5 border border-slate-300 rounded-lg cursor-pointer bg-white" title="Table Color" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex flex-col gap-2.5">
                  <label className="text-[11px] font-black uppercase text-indigo-700 tracking-wider border-b border-slate-100 pb-2">
                    5. Terms & Footer Setup
                  </label>
                  <textarea 
                    value={currentDesign.quoteTermText} 
                    onChange={(e) => setCurrentDesign({...currentDesign, quoteTermText: e.target.value})}
                    rows="3"
                    className="pro-input text-xs w-full bg-slate-50 border-slate-300 rounded-lg shadow-inner resize-none font-medium"
                    placeholder="Enter terms and conditions..."
                  ></textarea>
                  
                  <div className="grid grid-cols-12 gap-1 p-2 bg-white rounded-xl border border-slate-200 items-center shadow-sm">
                    <select value={currentDesign.quoteTermFontFam} onChange={(e) => setCurrentDesign({...currentDesign, quoteTermFontFam: e.target.value})} className="col-span-4 text-xs font-bold py-1.5 px-1 rounded-lg border border-slate-200 bg-slate-50 truncate">
                      {currentDesign.customFonts.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <div className="col-span-2 flex items-center gap-0.5 justify-center">
                      <button type="button" onClick={handleAddFont} className="bg-emerald-600 text-white w-5 h-5 rounded text-[10px] font-black">+</button>
                      <button type="button" onClick={() => handleDeleteFont(currentDesign.quoteTermFontFam)} className="bg-red-500 text-white w-5 h-5 rounded text-[10px] font-black">-</button>
                    </div>
                    <input type="number" value={currentDesign.quoteTermFontSize} onChange={(e) => setCurrentDesign({...currentDesign, quoteTermFontSize: Number(e.target.value)})} className="col-span-1 text-xs py-1.5 text-center font-mono font-bold rounded-lg border border-slate-200 bg-slate-50" placeholder="Size" />
                    <button type="button" onClick={() => setCurrentDesign({...currentDesign, quoteTermFontBold: !currentDesign.quoteTermFontBold})} className={`col-span-1 h-8 rounded-lg font-serif font-bold text-xs border ${currentDesign.quoteTermFontBold ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-700'}`}>B</button>
                    <button type="button" onClick={() => setCurrentDesign({...currentDesign, quoteTermFontItalic: !currentDesign.quoteTermFontItalic})} className={`col-span-1 h-8 rounded-lg font-serif italic text-xs border ${currentDesign.quoteTermFontItalic ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-700'}`}>I</button>
                    <button type="button" onClick={() => setCurrentDesign({...currentDesign, quoteTermFontUnderline: !currentDesign.quoteTermFontUnderline})} className={`col-span-1 h-8 rounded-lg font-serif underline text-xs border ${currentDesign.quoteTermFontUnderline ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-700'}`}>U</button>
                    <input type="color" value={currentDesign.quoteTermFontColor} onChange={(e) => setCurrentDesign({...currentDesign, quoteTermFontColor: e.target.value})} className="col-span-2 h-8 w-full p-0.5 border border-slate-300 rounded-lg cursor-pointer bg-white" title="Text Color" />
                  </div>
                  <div className="grid grid-cols-12 gap-2 mt-1 pt-2 border-t border-slate-100 items-center">
                    <span className="col-span-4 text-[10px] font-bold text-slate-500 uppercase">Position X / Y:</span>
                    <input type="number" value={currentDesign.quoteTermX} onChange={(e) => setCurrentDesign({...currentDesign, quoteTermX: Number(e.target.value)})} placeholder="X" className="col-span-4 text-xs py-1 text-center font-mono font-bold rounded-lg border border-slate-300 bg-slate-50" />
                    <input type="number" value={currentDesign.quoteTermY} onChange={(e) => setCurrentDesign({...currentDesign, quoteTermY: Number(e.target.value)})} placeholder="Y" className="col-span-4 text-xs py-1 text-center font-mono font-bold rounded-lg border border-slate-300 bg-slate-50" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <label className="block text-[10px] font-bold text-slate-700 uppercase">Signature Setup (Center Aligned)</label>
                  <div className="grid grid-cols-12 gap-1 items-center">
                    <select value={currentDesign.sigFont} onChange={(e) => setCurrentDesign({...currentDesign, sigFont: e.target.value})} className="col-span-4 text-xs font-bold py-1.5 px-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 truncate">
                      {currentDesign.customFonts.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <input type="number" value={currentDesign.sigSize} onChange={(e) => setCurrentDesign({...currentDesign, sigSize: Number(e.target.value)})} className="col-span-2 text-xs py-1.5 text-center font-mono font-bold rounded-lg border border-slate-200 bg-slate-50" placeholder="Size" />
                    <button type="button" onClick={() => setCurrentDesign({...currentDesign, sigBold: !currentDesign.sigBold})} className={`col-span-1 h-8 rounded-lg font-serif font-bold text-xs border ${currentDesign.sigBold ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>B</button>
                    <button type="button" onClick={() => setCurrentDesign({...currentDesign, sigItalic: !currentDesign.sigItalic})} className={`col-span-1 h-8 rounded-lg font-serif italic text-xs border ${currentDesign.sigItalic ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>I</button>
                    <button type="button" onClick={() => setCurrentDesign({...currentDesign, sigUnderline: !currentDesign.sigUnderline})} className={`col-span-1 h-8 rounded-lg font-serif underline text-xs border ${currentDesign.sigUnderline ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-600'}`}>U</button>
                    <input type="color" value={currentDesign.sigColor} onChange={(e) => setCurrentDesign({...currentDesign, sigColor: e.target.value})} className="col-span-3 h-8 w-full p-0.5 border border-slate-300 rounded-lg cursor-pointer bg-white" />
                  </div>
                  <div className="grid grid-cols-12 gap-2 mt-2 pt-2 border-t border-slate-100 items-center">
                    <span className="col-span-4 text-[10px] font-bold text-slate-500 uppercase">Position X / Y:</span>
                    <input type="number" value={currentDesign.sigX} onChange={(e) => setCurrentDesign({...currentDesign, sigX: Number(e.target.value)})} placeholder="X" className="col-span-4 text-xs py-1 text-center font-mono font-bold rounded-lg border border-slate-300 bg-slate-50" />
                    <input type="number" value={currentDesign.sigY} onChange={(e) => setCurrentDesign({...currentDesign, sigY: Number(e.target.value)})} placeholder="Y" className="col-span-4 text-xs py-1 text-center font-mono font-bold rounded-lg border border-slate-300 bg-slate-50" />
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl shadow-sm flex flex-col gap-2.5">
                  <h3 className="font-black text-emerald-800 text-[11px] uppercase border-b border-emerald-200 pb-2">🖼️ Quotation Logo & Stamp Setup</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { name: 'Top Logo', key: 'logo' },
                      { name: 'Stamp', key: 'stamp' }
                    ].map((item) => {
                      const slotData = currentGraphics[item.key] || { url: '', x: 0, y: 0, size: 100 };
                      return (
                        <div key={item.key} className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                            <label className="text-[9px] font-black uppercase text-slate-700">{item.name}</label>
                            {slotData.url && <button onClick={() => removeGraphic(item.key)} className="text-red-500 font-bold text-xs hover:underline">✕ Del</button>}
                          </div>
                          <input type="file" accept="image/*" onChange={(e) => handleGraphicFile(item.key, e.target.files[0])} className="text-[8px] w-full text-slate-400 cursor-pointer" />
                          <div className="grid grid-cols-3 gap-1">
                            <input type="number" value={slotData.x} onChange={(e) => updateGraphicProp(item.key, 'x', e.target.value)} placeholder="X" className="text-[10px] border border-slate-200 p-1 text-center rounded font-mono font-bold bg-slate-50" />
                            <input type="number" value={slotData.y} onChange={(e) => updateGraphicProp(item.key, 'y', e.target.value)} placeholder="Y" className="text-[10px] border border-slate-200 p-1 text-center rounded font-mono font-bold bg-slate-50" />
                            <input type="number" value={slotData.size} onChange={(e) => updateGraphicProp(item.key, 'size', e.target.value)} placeholder="Size" className="text-[10px] border border-slate-200 p-1 text-center rounded font-mono font-bold bg-slate-50" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}
          </div>

          <div className="hidden lg:flex lg:col-span-7 bg-slate-300 p-6 rounded-2xl shadow-inner border border-slate-400 justify-center items-center overflow-y-auto overflow-x-hidden h-[78vh] w-full custom-scrollbar relative">
            <div className="m-auto flex justify-center items-center py-10 w-full">
              <div className="origin-center transform scale-[0.65] xl:scale-[0.75] transition-transform shadow-2xl bg-white">
                {renderA4Content()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}