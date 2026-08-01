import React, { useState, useEffect } from 'react';
import { toJpeg } from 'html-to-image';

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

export default function Sticker() {
  const [firms, setFirms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [capacities, setCapacities] = useState([]);
  const [customFonts, setCustomFonts] = useState(['Arial', 'Impact', 'Courier New', 'Georgia']);
  
  // Sticker State
  const [selectedFirm, setSelectedFirm] = useState('');
  const [pageSize, setPageSize] = useState('A6');
  const [customW, setCustomW] = useState(105);
  const [customH, setCustomH] = useState(148);
  const [stBg, setStBg] = useState(null);

  const [stType, setStType] = useState('');
  const [stCap, setStCap] = useState('');
  const [stRefill, setStRefill] = useState('');
  const [stValid, setStValid] = useState('');

  const [tblW, setTblW] = useState(280);
  const [rowH, setRowH] = useState(5);
  const [col1, setCol1] = useState(50);
  const [col2, setCol2] = useState(50);
  const [tblX, setTblX] = useState(20);
  const [tblY, setTblY] = useState(150);
  const [tableBg, setTableBg] = useState('#ffffff');

  // A. Label Text Style (Type:, Kg:)
  const [fontL, setFontL] = useState('Arial');
  const [sizeL, setSizeL] = useState(12);
  const [colorL, setColorL] = useState('#000000');
  const [boldL, setBoldL] = useState(false);
  const [italicL, setItalicL] = useState(false);

  // B. Imported Data Style (Values)
  const [fontD, setFontD] = useState('Arial');
  const [sizeD, setSizeD] = useState(12);
  const [colorD, setColorD] = useState('#d92121');
  const [boldD, setBoldD] = useState(false);
  const [italicD, setItalicD] = useState(false);

  const [copies, setCopies] = useState(1);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // Helper: Convert YYYY-MM-DD to DD-MM-YYYY for display
  const formatDateForDisplay = (isoDate) => {
    if (!isoDate || !isoDate.includes('-')) return isoDate || '';
    const [y, m, d] = isoDate.split('-');
    if (y.length === 4) return `${d}-${m}-${y}`;
    return isoDate;
  };

  // 🟢 REAL-TIME LIVE SYNC LISTENER (App.jsx broadcast catcher)
  useEffect(() => {
    const handleDataUpdate = (e) => {
      if (!e.detail || e.detail.type === 'settings' || e.detail.type === 'templates') {
        try {
          const savedComps = localStorage.getItem('ERP_Companies_v104');
          if (savedComps) {
            const parsed = JSON.parse(savedComps);
            const certFirms = parsed.filter(c => c.type === 'certificate');
            setFirms(certFirms);
          }
          const savedFonts = localStorage.getItem('ERP_CustomFonts');
          if (savedFonts) {
            setCustomFonts(JSON.parse(savedFonts));
          }
        } catch(err) {
          console.error("Sticker sync storage parse error:", err);
        }
      }
    };
    window.addEventListener('ERP_DATA_UPDATED', handleDataUpdate);
    return () => window.removeEventListener('ERP_DATA_UPDATED', handleDataUpdate);
  }, []);

  useEffect(() => {
    try {
      const savedComps = localStorage.getItem('ERP_Companies_v104');
      if (savedComps) {
        const parsed = JSON.parse(savedComps);
        const certFirms = parsed.filter(c => c.type === 'certificate');
        setFirms(certFirms);
        if (certFirms.length > 0 && !selectedFirm) setSelectedFirm(certFirms[0].id);
      }
      const savedFonts = localStorage.getItem('ERP_CustomFonts');
      if (savedFonts) {
        setCustomFonts(JSON.parse(savedFonts));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Firm-wise design & category load effect (Loads from Cloud / LocalStorage fallback)
  useEffect(() => {
    if (!selectedFirm) return;
    const firm = firms.find(f => f.id === selectedFirm);
    if (firm) {
      setCategories(firm.categories || ['ABC Stored Pressure', 'Co2', 'Foam']);
      setCapacities(firm.capacities || ['2Kg', '4.5Kg', '6Kg', '9Kg']);
    }

    const fetchStickerDesign = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/data`);
        let d = null;
        if (res.ok) {
          const allData = await res.json();
          if (allData && typeof allData === 'object') {
            let cloudDesigns = [];
            if (Array.isArray(allData)) {
              cloudDesigns = allData.filter(item => item.docType === 'sticker_design' && String(item.firmId) === String(selectedFirm));
            } else if (allData.sticker_designs) {
              cloudDesigns = allData.sticker_designs.filter(item => String(item.firmId) === String(selectedFirm));
            }
            if (cloudDesigns.length > 0) {
              d = cloudDesigns[0];
            }
          }
        }

        if (!d) {
          const savedDesign = localStorage.getItem('ERP_Sticker_Design_' + selectedFirm);
          if (savedDesign) d = JSON.parse(savedDesign);
        }

        if (d) {
          setPageSize(d.pageSize || 'A6');
          setCustomW(d.customW || 105);
          setCustomH(d.customH || 148);
          setStBg(d.stBg || null);
          setTblW(d.tblW || 280);
          setRowH(d.rowH || 5);
          setCol1(d.col1 || 50);
          setCol2(d.col2 || 50);
          setTblX(d.tblX || 20);
          setTblY(d.tblY || 150);
          setTableBg(d.tableBg || '#ffffff');
          setFontL(d.fontL || 'Arial');
          setSizeL(d.sizeL || 12);
          setColorL(d.colorL || '#000000');
          setBoldL(d.boldL || false);
          setItalicL(d.italicL || false);
          setFontD(d.fontD || 'Arial');
          setSizeD(d.sizeD || 12);
          setColorD(d.colorD || '#d92121');
          setBoldD(d.boldD || false);
          setItalicD(d.italicD || false);
        } else {
          setStBg(null);
        }
      } catch (e) {
        console.error("Error loading sticker design:", e);
      }
    };

    fetchStickerDesign();
  }, [selectedFirm, firms]);

  const handleBgUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => setStBg(evt.target.result);
    reader.readAsDataURL(file);
  };

  const autoSetValidDate = (e) => {
    const val = e ? e.target.value : stRefill;
    setStRefill(val);
    if (val) {
      const d = new Date(val);
      d.setFullYear(d.getFullYear() + 1);
      d.setDate(d.getDate() - 1);
      setStValid(d.toISOString().split('T')[0]);
    }
  };

  const adjustFontSize = (amount, target) => {
    if (target === 'L') {
      setSizeL(prev => Math.max(6, Number(prev) + amount));
    } else {
      setSizeD(prev => Math.max(6, Number(prev) + amount));
    }
  };

  const promptCustomFont = () => {
    const fName = prompt("Enter Custom Font Name:");
    if (fName && fName.trim()) {
      const updated = [...customFonts, fName.trim()];
      setCustomFonts(updated);
      localStorage.setItem('ERP_CustomFonts', JSON.stringify(updated));
      alert(`✅ Font "${fName.trim()}" added!`);
    }
  };

  const deleteCustomFont = () => {
    const fName = prompt("Enter Font Name to remove from dropdown:");
    if (fName && fName.trim()) {
      const updated = customFonts.filter(f => f.toLowerCase() !== fName.trim().toLowerCase());
      setCustomFonts(updated);
      localStorage.setItem('ERP_CustomFonts', JSON.stringify(updated));
      alert(`✅ Font removed!`);
    }
  };

  // 🟢 UPDATED WITH SQLITE IPC AND EXACT TIMESTAMP FOR DELTA SYNC
  const saveDesign = async () => {
    if (!selectedFirm) return alert('Select a firm first!');
    const currentTimestamp = Date.now();
    const data = {
      id: 'sticker_design_' + selectedFirm,
      docType: 'sticker_design',
      firmId: selectedFirm,
      pageSize, customW, customH, stBg, tblW, rowH, col1, col2, tblX, tblY, tableBg,
      fontL, sizeL, colorL, boldL, italicL, fontD, sizeD, colorD, boldD, italicD,
      updatedAt: currentTimestamp // 🟢 Exact Timestamp
    };
    
    // Save locally
    localStorage.setItem('ERP_Sticker_Design_' + selectedFirm, JSON.stringify(data));

    try {
      // Save to Cloud & SQLite IPC
      await fetch(`${BACKEND_URL}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'sticker_designs', id: String(selectedFirm), data: sanitizeForCloud(data) })
      });
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', data);
      }
      window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'settings' } }));
      logActionToBackend(`Saved Sticker Design for firm ID: ${selectedFirm}`);
      alert('✅ Sticker design saved and synced to Cloud successfully!');
    } catch (err) {
      console.error("Cloud sticker save error:", err);
      alert('✅ Saved locally, but cloud sync failed: ' + err.message);
    }
  };

  const resetDesign = () => {
    if (confirm('Reset sticker settings for this firm?')) {
      if (selectedFirm) localStorage.removeItem('ERP_Sticker_Design_' + selectedFirm);
      setStBg(null);
      setStType('');
      setStCap('');
      setStRefill('');
      setStValid('');
    }
  };

  // Multi-Copy Print Function Using Page Breaks
  const handleImagePrint = async () => {
    const element = document.getElementById('printableStickerArea');
    if (!element) return alert('Preview element not found!');
    document.body.style.cursor = 'wait';

    try {
      const dataUrl = await toJpeg(element, {
        quality: 0.95,
        pixelRatio: 3,
        backgroundColor: '#ffffff'
      });

      const totalCopies = Math.max(1, Number(copies) || 1);
      let imagesHtml = '';
      for (let i = 0; i < totalCopies; i++) {
        imagesHtml += `
          <div class="sticker-page">
            <img src="${dataUrl}" />
          </div>
        `;
      }

      let iframe = document.getElementById('print-iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
      }

      const docObj = iframe.contentWindow.document;
      docObj.open();
      docObj.write(`
        <html>
          <head>
            <title>Print Sticker</title>
            <style>
              body { margin: 0; padding: 0; background: white; }
              .sticker-page {
                width: 100vw;
                height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                page-break-after: always;
                break-after: page;
                box-sizing: border-box;
              }
              .sticker-page:last-child {
                page-break-after: avoid;
                break-after: avoid;
              }
              img { max-width: 100%; max-height: 100%; object-fit: contain; }
              @page { size: auto; margin: 0; }
            </style>
          </head>
          <body>
            ${imagesHtml}
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                }, 400);
              };
            </script>
          </body>
        </html>
      `);
      docObj.close();
      logActionToBackend(`Printed ${totalCopies} sticker copies`);
    } catch (err) {
      alert('Printing failed: ' + err.message);
    } finally {
      document.body.style.cursor = 'default';
    }
  };

  // Dimensions in mm
  let widthMm = 105, heightMm = 148;
  if (pageSize === 'CUSTOM') {
    widthMm = Number(customW) || 105;
    heightMm = Number(customH) || 148;
  } else if (pageSize === 'A6') {
    widthMm = 105; heightMm = 148;
  } else if (pageSize === 'A6-L') {
    widthMm = 148; heightMm = 105;
  } else if (pageSize === 'A5') {
    widthMm = 148; heightMm = 210;
  } else if (pageSize === 'A5-L') {
    widthMm = 210; heightMm = 148;
  }

  // Sticker Content Render Function (Shared)
  const renderStickerContent = () => (
    <div 
      id="printableStickerArea"
      className="bg-white shadow-2xl relative overflow-hidden transition-all duration-300 box-border mx-auto shrink-0"
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        minWidth: `${widthMm}mm`,
        minHeight: `${heightMm}mm`,
        backgroundImage: stBg ? `url('${stBg}')` : 'none',
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Sticker Table */}
      <table 
        className="absolute border-2 border-black"
        style={{
          left: `${tblX}px`,
          top: `${tblY}px`,
          width: `${tblW}px`,
          backgroundColor: tableBg,
          tableLayout: 'fixed',
          borderCollapse: 'collapse'
        }}
      >
        <tbody>
          <tr>
            <td className="border border-black align-middle" style={{ width: `${col1}%`, padding: `${rowH}px` }}>
              <span style={{ fontFamily: fontL, fontSize: `${sizeL}px`, color: colorL, fontWeight: boldL ? 'bold' : 'normal', fontStyle: italicL ? 'italic' : 'normal' }}>Type: </span>
              <span style={{ fontFamily: fontD, fontSize: `${sizeD}px`, color: colorD, fontWeight: boldD ? 'bold' : 'normal', fontStyle: italicD ? 'italic' : 'normal' }}>{stType || '-'}</span>
            </td>
            <td className="border border-black align-middle" style={{ width: `${col2}%`, padding: `${rowH}px` }}>
              <span style={{ fontFamily: fontL, fontSize: `${sizeL}px`, color: colorL, fontWeight: boldL ? 'bold' : 'normal', fontStyle: italicL ? 'italic' : 'normal' }}>Refill: </span>
              <span style={{ fontFamily: fontD, fontSize: `${sizeD}px`, color: colorD, fontWeight: boldD ? 'bold' : 'normal', fontStyle: italicD ? 'italic' : 'normal' }}>{formatDateForDisplay(stRefill) || '-'}</span>
            </td>
          </tr>
          <tr>
            <td className="border border-black align-middle" style={{ width: `${col1}%`, padding: `${rowH}px` }}>
              <span style={{ fontFamily: fontL, fontSize: `${sizeL}px`, color: colorL, fontWeight: boldL ? 'bold' : 'normal', fontStyle: italicL ? 'italic' : 'normal' }}>Kg: </span>
              <span style={{ fontFamily: fontD, fontSize: `${sizeD}px`, color: colorD, fontWeight: boldD ? 'bold' : 'normal', fontStyle: italicD ? 'italic' : 'normal' }}>{stCap || '-'}</span>
            </td>
            <td className="border border-black align-middle" style={{ width: `${col2}%`, padding: `${rowH}px` }}>
              <span style={{ fontFamily: fontL, fontSize: `${sizeL}px`, color: colorL, fontWeight: boldL ? 'bold' : 'normal', fontStyle: italicL ? 'italic' : 'normal' }}>Valid Up To: </span>
              <span style={{ fontFamily: fontD, fontSize: `${sizeD}px`, color: colorD, fontWeight: boldD ? 'bold' : 'normal', fontStyle: italicD ? 'italic' : 'normal' }}>{formatDateForDisplay(stValid) || '-'}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="tab-content active h-[calc(100vh-65px)] w-full relative bg-slate-100 overflow-y-auto custom-scrollbar p-4 md:p-6 animate-[fadeIn_0.3s_ease-in-out]">
      <div className="max-w-7xl mx-auto pb-10">
        <h2 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-widest border-b-2 border-slate-200 pb-3 mb-6 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2.5">
            {/* Sticker Tag SVG Icon */}
            <svg className="w-7 h-7 text-[#00a67e]" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z" />
            </svg>
            STICKER DESIGNER
          </span>
          {/* Mobile Preview Button */}
          <button 
            onClick={() => setPreviewModalOpen(true)}
            className="lg:hidden bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase shadow-sm cursor-pointer flex items-center gap-1.5"
          >
            {/* Eye SVG Icon */}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview Design
          </button>
        </h2>

        <div className="flex flex-col lg:flex-row gap-6 items-start w-full">
          
          {/* LEFT CONTROL PANEL */}
          <div className="w-full lg:w-[450px] shrink-0 bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-4 lg:max-h-[85vh] lg:overflow-y-auto custom-scrollbar">
            
            {/* 1. Firm & Page Setup */}
            <div className="bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-100 flex flex-col gap-2">
              <label className="block text-[11px] font-black uppercase text-indigo-800 tracking-widest">1. Firm & Page Setup</label>
              <select value={selectedFirm} onChange={(e) => setSelectedFirm(e.target.value)} className="pro-input w-full text-xs font-bold bg-white">
                <option value="">Select Firm...</option>
                {firms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>

              <select value={pageSize} onChange={(e) => setPageSize(e.target.value)} className="pro-input w-full text-xs font-bold text-slate-700 bg-white">
                <option value="A6">A6 Portrait (105 x 148 mm)</option>
                <option value="A6-L">A6 Landscape (148 x 105 mm)</option>
                <option value="A5">A5 Portrait (148 x 210 mm)</option>
                <option value="A5-L">A5 Landscape (210 x 148 mm)</option>
                <option value="CUSTOM">⚙️ Custom Size</option>
              </select>

              {pageSize === 'CUSTOM' && (
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={customW} onChange={(e) => setCustomW(e.target.value)} placeholder="Width (mm)" className="pro-input text-xs font-mono font-bold" />
                  <input type="number" value={customH} onChange={(e) => setCustomH(e.target.value)} placeholder="Height (mm)" className="pro-input text-xs font-mono font-bold" />
                </div>
              )}

              <input type="file" accept="image/*" onChange={handleBgUpload} className="pro-input w-full text-[10px] bg-white cursor-pointer" />
              {stBg && <button onClick={() => setStBg(null)} className="text-[10px] text-red-500 font-bold hover:underline block text-left">✕ Remove Background</button>}
            </div>

            {/* 2. Sticker Data */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <label className="block text-[11px] font-black uppercase mb-2 text-slate-700 tracking-widest">2. Sticker Data</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Type</label>
                  <input type="text" list="typeList" value={stType} onChange={(e) => setStType(e.target.value)} className="pro-input text-xs w-full bg-white font-bold" placeholder="Type or Select..." />
                  <datalist id="typeList">
                    {categories.map((c, i) => <option key={i} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Capacity</label>
                  <input type="text" list="capList" value={stCap} onChange={(e) => setStCap(e.target.value)} className="pro-input text-xs w-full bg-white font-bold" placeholder="Type or Select..." />
                  <datalist id="capList">
                    {capacities.map((c, i) => <option key={i} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Refill Date (Manual / Calendar)</label>
                  <input type="date" value={stRefill} onChange={autoSetValidDate} className="pro-input text-xs font-bold w-full bg-white cursor-pointer" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Valid Date (Manual / Auto)</label>
                  <input type="date" value={stValid} onChange={(e) => setStValid(e.target.value)} className="pro-input text-xs font-bold w-full bg-white cursor-pointer" />
                </div>
              </div>
            </div>

            {/* 3. Table Layout & Style */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <label className="block text-[11px] font-black uppercase mb-2 text-slate-700 tracking-widest">3. Table Layout & Style</label>
              
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div><label className="text-[9px] font-bold text-blue-600 block mb-1">Total Box Width (px)</label><input type="number" value={tblW} onChange={(e) => setTblW(e.target.value)} className="pro-input text-xs font-black border-blue-300" /></div>
                <div><label className="text-[9px] font-bold text-blue-600 block mb-1">Row Height/Padding</label><input type="number" value={rowH} onChange={(e) => setRowH(e.target.value)} className="pro-input text-xs font-black border-blue-300" /></div>
                <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Col 1 Width (%)</label><input type="number" value={col1} onChange={(e) => setCol1(e.target.value)} className="pro-input text-xs" /></div>
                <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Col 2 Width (%)</label><input type="number" value={col2} onChange={(e) => setCol2(e.target.value)} className="pro-input text-xs" /></div>
                <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Move Left/Right (X)</label><input type="number" value={tblX} onChange={(e) => setTblX(e.target.value)} className="pro-input text-xs" /></div>
                <div><label className="text-[9px] font-bold text-slate-500 block mb-1">Move Up/Down (Y)</label><input type="number" value={tblY} onChange={(e) => setTblY(e.target.value)} className="pro-input text-xs" /></div>
                
                <div className="col-span-2 flex items-center gap-2 bg-indigo-50/50 p-2 rounded border border-indigo-100 mt-1">
                  <label className="text-[10px] font-black uppercase text-indigo-700">Table Background Color:</label>
                  <input type="color" value={tableBg} onChange={(e) => setTableBg(e.target.value)} className="w-10 h-7 rounded cursor-pointer border-0 p-0 ml-auto" />
                </div>
              </div>

              {/* A. Label Text Style */}
              <label className="block text-[9px] font-bold uppercase mt-2 mb-1 text-slate-600 bg-slate-200/70 p-1.5 rounded">A. Label Text Style (Type:, Kg:)</label>
              <div className="flex items-center gap-1 mb-2">
                <select value={fontL} onChange={(e) => setFontL(e.target.value)} className="pro-input text-[10px] w-24 bg-white py-1.5">
                  {customFonts.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <div className="flex items-center bg-white border border-slate-300 rounded overflow-hidden shadow-sm">
                  <button type="button" onClick={() => adjustFontSize(-1, 'L')} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-black border-r border-slate-300 cursor-pointer">-</button>
                  <input type="number" value={sizeL} onChange={(e) => setSizeL(e.target.value)} className="w-10 text-center text-xs border-0 p-0 font-bold" />
                  <button type="button" onClick={() => adjustFontSize(1, 'L')} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-black border-l border-slate-300 cursor-pointer">+</button>
                </div>
                <input type="color" value={colorL} onChange={(e) => setColorL(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 p-0 ml-1" />
                <button 
                  type="button" 
                  onClick={() => setBoldL(!boldL)} 
                  className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition-colors border ${boldL ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                >
                  B
                </button>
                <button 
                  type="button" 
                  onClick={() => setItalicL(!italicL)} 
                  className={`px-2.5 py-1 rounded italic text-[10px] cursor-pointer transition-colors border ${italicL ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                >
                  I
                </button>
              </div>

              {/* B. Imported Data Style */}
              <label className="block text-[9px] font-bold uppercase mt-2 mb-1 text-blue-700 bg-blue-100/70 p-1.5 rounded">B. Imported Data Style (Values)</label>
              <div className="flex items-center gap-1 mb-2">
                <select value={fontD} onChange={(e) => setFontD(e.target.value)} className="pro-input text-[10px] w-24 bg-white py-1.5">
                  {customFonts.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <div className="flex items-center bg-white border border-slate-300 rounded overflow-hidden shadow-sm">
                  <button type="button" onClick={() => adjustFontSize(-1, 'D')} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-black border-r border-slate-300 cursor-pointer">-</button>
                  <input type="number" value={sizeD} onChange={(e) => setSizeD(e.target.value)} className="w-10 text-center text-xs border-0 p-0 font-bold" />
                  <button type="button" onClick={() => adjustFontSize(1, 'D')} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-black border-l border-slate-300 cursor-pointer">+</button>
                </div>
                <input type="color" value={colorD} onChange={(e) => setColorD(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 p-0 ml-1" />
                <button 
                  type="button" 
                  onClick={() => setBoldD(!boldD)} 
                  className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition-colors border ${boldD ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                >
                  B
                </button>
                <button 
                  type="button" 
                  onClick={() => setItalicD(!italicD)} 
                  className={`px-2.5 py-1 rounded italic text-[10px] cursor-pointer transition-colors border ${italicD ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                >
                  I
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={promptCustomFont} className="bg-blue-100 text-blue-700 px-3 py-2 rounded-xl text-[10px] font-black shadow-sm w-full transition-all hover:bg-blue-200 flex justify-center items-center gap-1 cursor-pointer">
                ➕ Add Custom Font
              </button>
              <button type="button" onClick={deleteCustomFont} className="bg-red-100 text-red-600 px-3 py-2 rounded-xl text-[10px] font-black shadow-sm w-full transition-all hover:bg-red-200 flex justify-center items-center gap-1 cursor-pointer">
                ➖ Remove Font
              </button>
            </div>

            <button onClick={saveDesign} className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-black uppercase text-xs shadow-md hover:bg-blue-700 transition-all cursor-pointer flex items-center justify-center gap-1.5">
              {/* Save SVG Icon */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              Save Design
            </button>

            <div className="flex gap-2 items-end mt-1">
              <div className="flex flex-col w-16 shrink-0">
                <label className="text-[9px] font-bold text-center text-emerald-700 uppercase mb-0.5">Qty</label>
                <input type="number" value={copies} onChange={(e) => setCopies(e.target.value)} min="1" className="pro-input w-full text-center font-black border-2 border-emerald-500 text-emerald-700 bg-emerald-50" style={{ height: '42px' }} />
              </div>
              {/* 🟢 MULTI-COPY PRINT BUTTON */}
              <button onClick={handleImagePrint} className="flex-grow bg-[#00a67e] text-white rounded-xl font-black uppercase tracking-widest shadow-md hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 text-xs cursor-pointer" style={{ height: '42px' }} title="Print">
                {/* Printer SVG Icon */}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                Print
              </button>
            </div>
          </div>

          {/* RIGHT PREVIEW CANVAS (Desktop View) */}
          <div className="hidden lg:flex flex-grow bg-slate-100 p-8 border-2 border-dashed border-slate-300 rounded-2xl min-h-[500px] justify-center items-start overflow-auto w-full">
            {renderStickerContent()}
          </div>

        </div>

        {/* 🟢 FULL SCREEN FIXED MOBILE PREVIEW MODAL / DRAWER */}
        {previewModalOpen && (
          <div className="fixed inset-0 bg-slate-950/85 z-[999999] flex flex-col items-center justify-center backdrop-blur-md p-2 md:p-6">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col h-[92vh] overflow-hidden animate-[fadeIn_0.2s_ease-out]">
              
              {/* Modal Header */}
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-[#00a67e] text-white rounded-t-2xl shrink-0">
                <h3 className="font-black uppercase text-xs md:text-sm flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  Sticker Design Preview
                </h3>
                <button type="button" onClick={() => setPreviewModalOpen(false)} className="text-white hover:text-red-200 font-bold text-3xl leading-none cursor-pointer">&times;</button>
              </div>
              
              {/* Modal Body with Improved Scroll Alignment */}
              <div className="flex-1 overflow-auto bg-slate-100 p-6 custom-scrollbar flex">
                <div className="m-auto flex items-center justify-center p-4">
                  {renderStickerContent()}
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}