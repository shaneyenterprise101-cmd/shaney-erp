import React, { useState, useEffect } from 'react';
import { toJpeg } from 'html-to-image';
import { db } from './firebase'; // 👈 Firebase instance imported
import { doc, setDoc, getDoc } from 'firebase/firestore';

export default function Envelope() {
  const [firms, setFirms] = useState([]);
  const [customers, setCustomers] = useState([]);
  
  // 1. Firm & Background State
  const [selectedFirm, setSelectedFirm] = useState('');
  const [envBg, setEnvBg] = useState(null);
  const [bgW, setBgW] = useState(100);
  const [bgH, setBgH] = useState(100);
  const [bgX, setBgX] = useState(0);
  const [bgY, setBgY] = useState(0);

  // 2. Receiver State & Translation
  const [toName, setToName] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [translateLang, setTranslateLang] = useState('gu');

  // 3. Layout, Size & Margins State
  const [sizeSelect, setSizeSelect] = useState('DL-PORT');
  const [customWidth, setCustomWidth] = useState(109);
  const [customHeight, setCustomHeight] = useState(239);
  const [marginTop, setMarginTop] = useState(0);
  const [marginBottom, setMarginBottom] = useState(0);
  const [marginLeft, setMarginLeft] = useState(0);
  const [marginRight, setMarginRight] = useState(0);

  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontSize, setFontSize] = useState(18);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [textColor, setTextColor] = useState('#000000');
  const [textRotate, setTextRotate] = useState('0');
  const [textX, setTextX] = useState(30);
  const [textY, setTextY] = useState(120);

  // 4. Custom Text Box State
  const [customText, setCustomText] = useState('');
  const [customTextFont, setCustomTextFont] = useState('Arial');
  const [customTextSize, setCustomTextSize] = useState(14);
  const [customTextBold, setCustomTextBold] = useState(false);
  const [customTextItalic, setCustomTextItalic] = useState(false);
  const [customTextUnderline, setCustomTextUnderline] = useState(false);
  const [customTextColor, setCustomTextColor] = useState('#000000');
  const [customTextW, setCustomTextW] = useState(200);
  const [customTextR, setCustomTextR] = useState(0);
  const [customTextX, setCustomTextX] = useState(10);
  const [customTextY, setCustomTextY] = useState(10);

  // 5. Custom Images State
  const [img1, setImg1] = useState(null);
  const [img1W, setImg1W] = useState(50);
  const [img1X, setImg1X] = useState(10);
  const [img1Y, setImg1Y] = useState(50);

  const [img2, setImg2] = useState(null);
  const [img2W, setImg2W] = useState(50);
  const [img2X, setImg2X] = useState(10);
  const [img2Y, setImg2Y] = useState(100);

  // Mobile Preview Modal State
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // 🟢 REAL-TIME LIVE SYNC LISTENER (App.jsx broadcast catcher)
  useEffect(() => {
    const handleDataUpdate = (e) => {
      if (!e.detail || e.detail.type === 'settings' || e.detail.type === 'customers') {
        try {
          const savedComps = localStorage.getItem('ERP_Companies_v104');
          if (savedComps) {
            setFirms(JSON.parse(savedComps));
          }
          const savedCusts = localStorage.getItem('ERP_Customers_v104');
          if (savedCusts) {
            setCustomers(JSON.parse(savedCusts));
          }
        } catch(err) {
          console.error("Envelope sync storage parse error:", err);
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
        setFirms(parsed);
        if (parsed.length > 0 && !selectedFirm) setSelectedFirm(parsed[0].id);
      }
      const savedCusts = localStorage.getItem('ERP_Customers_v104');
      if (savedCusts) {
        setCustomers(JSON.parse(savedCusts));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Firm-wise design load effect (Loads from Cloud / LocalStorage fallback)
  useEffect(() => {
    if (!selectedFirm) return;
    
    const fetchEnvelopeDesign = async () => {
      try {
        const docRef = doc(db, "envelope_designs", String(selectedFirm));
        const docSnap = await getDoc(docRef);
        
        let d = null;
        if (docSnap.exists()) {
          d = docSnap.data();
        } else {
          const savedDesign = localStorage.getItem('ERP_Envelope_Design_' + selectedFirm);
          if (savedDesign) d = JSON.parse(savedDesign);
        }

        if (d) {
          setSizeSelect(d.sizeSelect || 'DL-PORT');
          setCustomWidth(d.customWidth || 109);
          setCustomHeight(d.customHeight || 239);
          setMarginTop(d.marginTop || 0);
          setMarginBottom(d.marginBottom || 0);
          setMarginLeft(d.marginLeft || 0);
          setMarginRight(d.marginRight || 0);
          setFontFamily(d.fontFamily || 'Arial');
          setFontSize(d.fontSize || 18);
          setIsBold(d.isBold || false);
          setIsItalic(d.isItalic || false);
          setIsUnderline(d.isUnderline || false);
          setTextColor(d.textColor || '#000000');
          setTextRotate(d.textRotate || '0');
          setTextX(d.textX || 30);
          setTextY(d.textY || 120);
          setCustomText(d.customText || '');
          setCustomTextFont(d.customTextFont || 'Arial');
          setCustomTextSize(d.customTextSize || 14);
          setCustomTextBold(d.customTextBold || false);
          setCustomTextItalic(d.customTextItalic || false);
          setCustomTextUnderline(d.customTextUnderline || false);
          setCustomTextColor(d.customTextColor || '#000000');
          setCustomTextW(d.customTextW || 200);
          setCustomTextR(d.customTextR || 0);
          setCustomTextX(d.customTextX || 10);
          setCustomTextY(d.customTextY || 10);
          setEnvBg(d.envBg || null);
          setBgW(d.bgW || 100);
          setBgH(d.bgH || 100);
          setBgX(d.bgX || 0);
          setBgY(d.bgY || 0);
          setImg1(d.img1 || null);
          setImg1W(d.img1W || 50);
          setImg1X(d.img1X || 10);
          setImg1Y(d.img1Y || 50);
          setImg2(d.img2 || null);
          setImg2W(d.img2W || 50);
          setImg2X(d.img2X || 10);
          setImg2Y(d.img2Y || 100);
        } else {
          setEnvBg(null);
          setCustomText('');
          setImg1(null);
          setImg2(null);
        }
      } catch (e) {
        console.error("Error loading envelope design:", e);
      }
    };

    fetchEnvelopeDesign();
  }, [selectedFirm]);

  const handleCustomerSelect = (nameVal) => {
    setToName(nameVal);
    const found = customers.find(c => c.name.toLowerCase() === nameVal.toLowerCase());
    if (found) {
      const fullAddr = [found.address, found.village, found.taluka, found.district, found.pincode ? '-' + found.pincode : ''].filter(Boolean).join(', ');
      setToAddress(fullAddr);
    }
  };

  const handleTranslate = async () => {
    if (!toAddress.trim() && !toName.trim()) return alert('Please enter text to translate!');
    try {
      if (toAddress.trim()) {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${translateLang}&dt=t&q=${encodeURIComponent(toAddress)}`);
        const json = await res.json();
        if (json && json[0]) {
          setToAddress(json[0].map(item => item[0]).join(''));
        }
      }
      if (toName.trim()) {
        const res2 = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${translateLang}&dt=t&q=${encodeURIComponent(toName)}`);
        const json2 = await res2.json();
        if (json2 && json2[0]) {
          setToName(json2[0].map(item => item[0]).join(''));
        }
      }
    } catch (e) {
      alert('Translation failed. Check internet connection.');
    }
  };

  const handleBgUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => setEnvBg(evt.target.result);
    reader.readAsDataURL(file);
  };

  const handleImgUpload = (e, num) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (num === 1) setImg1(evt.target.result);
      else setImg2(evt.target.result);
    };
    reader.readAsDataURL(file);
  };

  const saveDesign = async () => {
    if (!selectedFirm) return alert('Select a firm first!');
    const currentTimestamp = Date.now();
    const data = {
      id: 'env_design_' + selectedFirm,
      docType: 'envelope_design',
      firmId: selectedFirm,
      sizeSelect, customWidth, customHeight,
      marginTop, marginBottom, marginLeft, marginRight,
      fontFamily, fontSize, isBold, isItalic, isUnderline, textColor, textRotate, textX, textY,
      customText, customTextFont, customTextSize, customTextBold, customTextItalic, customTextUnderline, customTextColor, customTextW, customTextR, customTextX, customTextY,
      envBg, bgW, bgH, bgX, bgY,
      img1, img1W, img1X, img1Y,
      img2, img2W, img2X, img2Y,
      updatedAt: currentTimestamp // 🟢 Exact Timestamp for Delta Sync
    };
    
    // Save locally
    localStorage.setItem('ERP_Envelope_Design_' + selectedFirm, JSON.stringify(data));

    try {
      // Save to Firebase Cloud & SQLite IPC
      await setDoc(doc(db, "envelope_designs", String(selectedFirm)), data, { merge: true });
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', data);
      }
      window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'settings' } }));
      alert('✅ Envelope design saved and synced to Cloud successfully!');
    } catch (err) {
      console.error("Firebase envelope save error:", err);
      alert('✅ Saved locally, but cloud sync failed: ' + err.message);
    }
  };

  const resetDesign = () => {
    if (confirm('Reset envelope settings for this firm?')) {
      if (selectedFirm) localStorage.removeItem('ERP_Envelope_Design_' + selectedFirm);
      setEnvBg(null);
      setToName('');
      setToAddress('');
      setCustomText('');
      setImg1(null);
      setImg2(null);
    }
  };

  // HD Print Function
  const handleImagePrint = async () => {
    const element = document.getElementById('printableEnvelopeArea');
    if (!element) return alert('Preview element not found!');
    document.body.style.cursor = 'wait';

    try {
      const dataUrl = await toJpeg(element, {
        quality: 1.0,
        pixelRatio: 4,
        backgroundColor: '#ffffff'
      });

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
            <title>Print Envelope</title>
            <style>
              body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: white; }
              img { max-width: 100%; max-height: 100%; object-fit: contain; }
              @page { size: auto; margin: 0; }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" onload="window.print();" />
          </body>
        </html>
      `);
      docObj.close();
    } catch (err) {
      alert('Printing failed: ' + err.message);
    } finally {
      document.body.style.cursor = 'default';
    }
  };

  // Dimensions calculation
  let widthMm = 109, heightMm = 239;
  if (sizeSelect === 'CUSTOM') {
    widthMm = Number(customWidth) || 109;
    heightMm = Number(customHeight) || 239;
  } else if (sizeSelect === 'DL-PORT') {
    widthMm = 110; heightMm = 220;
  } else if (sizeSelect === 'DL') {
    widthMm = 220; heightMm = 110;
  } else if (sizeSelect === 'C5') {
    widthMm = 229; heightMm = 162;
  }

  // Envelope Content Render Function (Shared)
  const renderEnvelopeContent = () => (
    <div 
      id="printableEnvelopeArea"
      className="shadow-2xl relative overflow-hidden transition-all duration-300 box-border bg-transparent mx-auto"
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        minWidth: `${widthMm}mm`,
        minHeight: `${heightMm}mm`,
        backgroundColor: 'transparent',
        backgroundImage: envBg ? `url('${envBg}')` : 'none',
        backgroundSize: `${bgW}% ${bgH}%`,
        backgroundPosition: `${bgX}mm ${bgY}mm`,
        backgroundRepeat: 'no-repeat',
        paddingTop: `${marginTop}mm`,
        paddingBottom: `${marginBottom}mm`,
        paddingLeft: `${marginLeft}mm`,
        paddingRight: `${marginRight}mm`
      }}
    >
      {/* Receiver Address Box */}
      <div 
        className="absolute"
        style={{
          left: `${textX}mm`,
          top: `${textY}mm`,
          transform: `rotate(${textRotate}deg)`,
          maxWidth: '85%'
        }}
      >
        <h2 
          className="leading-none"
          style={{
            fontFamily: fontFamily,
            fontSize: `${fontSize}px`,
            fontWeight: isBold ? '900' : 'bold',
            fontStyle: isItalic ? 'italic' : 'normal',
            textDecoration: isUnderline ? 'underline' : 'none',
            color: textColor
          }}
        >
          {toName || 'CLIENT NAME'}
        </h2>
        <p 
          className="mt-1 leading-tight whitespace-pre-wrap break-words"
          style={{
            fontFamily: fontFamily,
            fontSize: `${Math.max(10, fontSize - 4)}px`,
            fontWeight: isBold ? '700' : 'semibold',
            fontStyle: isItalic ? 'italic' : 'normal',
            color: textColor
          }}
        >
          {toAddress || 'Client Full Address'}
        </p>
      </div>

      {/* Custom Text Box */}
      {customText && (
        <div 
          className="absolute"
          style={{
            left: `${customTextX}mm`,
            top: `${customTextY}mm`,
            transform: `rotate(${customTextR}deg)`,
            width: `${customTextW}px`
          }}
        >
          <p 
            className="whitespace-pre-wrap break-words"
            style={{
              fontFamily: customTextFont,
              fontSize: `${customTextSize}px`,
              fontWeight: customTextBold ? 'bold' : 'normal',
              fontStyle: customTextItalic ? 'italic' : 'normal',
              textDecoration: customTextUnderline ? 'underline' : 'none',
              color: customTextColor
            }}
          >
            {customText}
          </p>
        </div>
      )}

      {/* Custom Images */}
      {img1 && (
        <img 
          src={img1} 
          alt="Img 1" 
          className="absolute" 
          style={{ left: `${img1X}mm`, top: `${img1Y}mm`, width: `${img1W}px` }} 
        />
      )}
      {img2 && (
        <img 
          src={img2} 
          alt="Img 2" 
          className="absolute" 
          style={{ left: `${img2X}mm`, top: `${img2Y}mm`, width: `${img2W}px` }} 
        />
      )}
    </div>
  );

  return (
    <div className="tab-content active p-4 md:p-6 w-full max-w-7xl mx-auto animate-[fadeIn_0.3s_ease-in-out]">
      <h2 className="text-xl md:text-2xl font-black text-slate-800 uppercase tracking-widest border-b-2 border-slate-200 pb-3 mb-6 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5">
          {/* Envelope SVG Icon */}
          <svg className="w-7 h-7 text-[#00a67e]" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          ENVELOPE DESIGNER
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
        
        {/* LEFT SETTINGS PANEL */}
        <div className="w-full lg:w-[420px] shrink-0 bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-4 lg:max-h-[85vh] lg:overflow-y-auto custom-scrollbar">
          
          {/* 1. FIRM & BACKGROUND */}
          <div className="bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-100">
            <label className="block text-[11px] font-black text-indigo-800 uppercase tracking-widest mb-1.5">1. Firm & Background</label>
            <select value={selectedFirm} onChange={(e) => setSelectedFirm(e.target.value)} className="pro-input w-full font-bold text-slate-800 bg-white mb-2.5">
              {firms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>

            <label className="block text-[9px] font-bold text-slate-500 uppercase mt-2 mb-1">Upload Envelope Design (Bg)</label>
            <input type="file" accept="image/*" onChange={handleBgUpload} className="pro-input w-full text-[10px] bg-white cursor-pointer mb-1" />
            {envBg && <button onClick={() => setEnvBg(null)} className="text-[10px] text-red-500 font-bold hover:underline mb-2 block">✕ Remove Background</button>}

            <label className="block text-[9px] font-bold text-indigo-600 uppercase mt-3 mb-1 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              Watermark Settings (Scale & Move)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[8px] font-bold text-slate-500">Bg Width (%)</label><input type="number" value={bgW} onChange={(e) => setBgW(e.target.value)} className="pro-input text-[10px] w-full font-mono" /></div>
              <div><label className="text-[8px] font-bold text-slate-500">Bg Height (%)</label><input type="number" value={bgH} onChange={(e) => setBgH(e.target.value)} className="pro-input text-[10px] w-full font-mono" /></div>
              <div><label className="text-[8px] font-bold text-slate-500">Move X (Left) mm</label><input type="number" value={bgX} onChange={(e) => setBgX(e.target.value)} className="pro-input text-[10px] w-full font-mono" /></div>
              <div><label className="text-[8px] font-bold text-slate-500">Move Y (Top) mm</label><input type="number" value={bgY} onChange={(e) => setBgY(e.target.value)} className="pro-input text-[10px] w-full font-mono" /></div>
            </div>
          </div>

          {/* 2. RECEIVER (TO) */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-[11px] font-black text-slate-700 uppercase tracking-widest">2. Receiver (To)</label>
              <div className="flex items-center gap-1">
                <select value={translateLang} onChange={(e) => setTranslateLang(e.target.value)} className="pro-input text-[9px] py-1 px-1 h-6 font-bold text-slate-700 bg-white cursor-pointer">
                  <option value="gu">Gujarati</option>
                  <option value="hi">Hindi</option>
                  <option value="en">English</option>
                </select>
                <button type="button" onClick={handleTranslate} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-[9px] font-black border border-blue-200 hover:bg-blue-600 hover:text-white shadow-sm ml-1 cursor-pointer">A⇋અ</button>
              </div>
            </div>
            <input 
              type="text" 
              list="envCustList" 
              value={toName} 
              onChange={(e) => handleCustomerSelect(e.target.value)} 
              placeholder="🔍 Search or Type Name..." 
              className="pro-input w-full mb-2 font-bold text-blue-800 bg-blue-50/50 border-blue-300" 
            />
            <datalist id="envCustList">
              {customers.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
            <textarea 
              rows="3" 
              value={toAddress} 
              onChange={(e) => setToAddress(e.target.value)} 
              placeholder="સરનામું અહી લખો... (Type full address here)" 
              className="pro-input w-full text-xs font-medium bg-white leading-relaxed"
            ></textarea>
          </div>

          {/* 3. LAYOUT, SIZE & MARGINS */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <label className="block text-[11px] font-black text-slate-700 uppercase tracking-widest mb-2">3. Layout, Size & Margins</label>
            
            <label className="text-[9px] font-bold text-slate-500 uppercase">Envelope / Paper Size</label>
            <select value={sizeSelect} onChange={(e) => setSizeSelect(e.target.value)} className="pro-input w-full font-bold text-slate-800 bg-white mb-2">
              <option value="CUSTOM">⚙️ Custom Size...</option>
              <option value="DL-PORT">DL Portrait (110 x 220 mm)</option>
              <option value="DL">DL Landscape (220 x 110 mm)</option>
              <option value="C5">C5 (229 x 162 mm)</option>
            </select>

            {sizeSelect === 'CUSTOM' && (
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div><label className="text-[9px] font-bold text-blue-600">Width (mm)</label><input type="number" value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} className="pro-input w-full text-xs font-mono font-bold" /></div>
                <div><label className="text-[9px] font-bold text-blue-600">Height (mm)</label><input type="number" value={customHeight} onChange={(e) => setCustomHeight(e.target.value)} className="pro-input w-full text-xs font-mono font-bold" /></div>
              </div>
            )}

            <label className="block text-[9px] font-bold text-blue-600 uppercase mt-3 mb-1">📄 Print Margins (MS Word Style in mm)</label>
            <div className="grid grid-cols-4 gap-1 mb-3">
              <div><label className="text-[8px] font-bold text-slate-500">Top</label><input type="number" value={marginTop} onChange={(e) => setMarginTop(e.target.value)} className="pro-input text-[10px] w-full text-center" /></div>
              <div><label className="text-[8px] font-bold text-slate-500">Bottom</label><input type="number" value={marginBottom} onChange={(e) => setMarginBottom(e.target.value)} className="pro-input text-[10px] w-full text-center" /></div>
              <div><label className="text-[8px] font-bold text-slate-500">Left</label><input type="number" value={marginLeft} onChange={(e) => setMarginLeft(e.target.value)} className="pro-input text-[10px] w-full text-center" /></div>
              <div><label className="text-[8px] font-bold text-slate-500">Right</label><input type="number" value={marginRight} onChange={(e) => setMarginRight(e.target.value)} className="pro-input text-[10px] w-full text-center" /></div>
            </div>

            <label className="text-[9px] font-bold text-slate-500 uppercase border-t pt-2 block border-slate-200">Main Text Style & Box Position</label>
            <div className="flex items-center gap-1 mb-2 mt-1 flex-wrap">
              <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} className="pro-input py-1.5 text-[10px] w-20 bg-white">
                <option value="Arial">Arial</option>
                <option value="Georgia">Georgia</option>
                <option value="Impact">Impact</option>
                <option value="Caveat">Caveat</option>
              </select>
              <input type="number" value={fontSize} onChange={(e) => setFontSize(e.target.value)} className="pro-input py-1.5 text-[10px] w-12 text-center bg-white" />
              <div className="flex bg-white border border-slate-200 rounded ml-1">
                <button type="button" onClick={() => setIsBold(!isBold)} className={`px-2 py-1.5 text-xs font-bold ${isBold ? 'bg-slate-200' : ''}`}>B</button>
                <button type="button" onClick={() => setIsItalic(!isItalic)} className={`px-2 py-1.5 text-xs italic border-l border-slate-200 ${isItalic ? 'bg-slate-200' : ''}`}>I</button>
                <button type="button" onClick={() => setIsUnderline(!isUnderline)} className={`px-2 py-1.5 text-xs underline border-l border-slate-200 ${isUnderline ? 'bg-slate-200' : ''}`}>U</button>
              </div>
              <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0 p-0 ml-auto" />
            </div>

            <select value={textRotate} onChange={(e) => setTextRotate(e.target.value)} className="pro-input w-full font-bold text-slate-800 bg-white mb-2">
              <option value="0">Horizontal ➡️</option>
              <option value="-90">Vertical (Bottom to Top) ⬆️</option>
              <option value="90">Vertical (Top to Bottom) ⬇️</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Move X" value={textX} onChange={(e) => setTextX(e.target.value)} className="pro-input text-xs text-center w-full font-mono" />
              <input type="number" placeholder="Move Y" value={textY} onChange={(e) => setTextY(e.target.value)} className="pro-input text-xs text-center w-full font-mono" />
            </div>
          </div>

          {/* 4. CUSTOM TEXT BOX */}
          <div className="bg-orange-50/60 p-3.5 rounded-xl border border-orange-200">
            <label className="block text-[11px] font-black text-orange-800 uppercase tracking-widest mb-1.5">4. Custom Text Box</label>
            <textarea rows="2" value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="Type extra text here..." className="pro-input w-full text-xs font-medium bg-white mb-2"></textarea>
            
            <div className="flex items-center gap-1 mb-2 flex-wrap">
              <select value={customTextFont} onChange={(e) => setCustomTextFont(e.target.value)} className="pro-input py-1 text-[10px] w-20 bg-white">
                <option value="Arial">Arial</option>
                <option value="Georgia">Georgia</option>
              </select>
              <input type="number" value={customTextSize} onChange={(e) => setCustomTextSize(e.target.value)} className="pro-input py-1 text-[10px] w-12 text-center bg-white" />
              <div className="flex bg-white border border-slate-200 rounded ml-1">
                <button type="button" onClick={() => setCustomTextBold(!customTextBold)} className={`px-2 py-1 text-xs font-bold ${customTextBold ? 'bg-slate-200' : ''}`}>B</button>
                <button type="button" onClick={() => setCustomTextItalic(!customTextItalic)} className={`px-2 py-1 text-xs italic border-l border-slate-200 ${customTextItalic ? 'bg-slate-200' : ''}`}>I</button>
                <button type="button" onClick={() => setCustomTextUnderline(!customTextUnderline)} className={`px-2 py-1 text-xs underline border-l border-slate-200 ${customTextUnderline ? 'bg-slate-200' : ''}`}>U</button>
              </div>
              <input type="color" value={customTextColor} onChange={(e) => setCustomTextColor(e.target.value)} className="w-6 h-6 rounded border-0 p-0 ml-auto" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[9px] text-slate-500 font-bold">Box Width</label><input type="number" value={customTextW} onChange={(e) => setCustomTextW(e.target.value)} className="pro-input text-xs w-full" /></div>
              <div><label className="text-[9px] text-slate-500 font-bold">Rotate(Deg)</label><input type="number" value={customTextR} onChange={(e) => setCustomTextR(e.target.value)} className="pro-input text-xs w-full" /></div>
              <div><label className="text-[9px] text-slate-500 font-bold">Move X</label><input type="number" value={customTextX} onChange={(e) => setCustomTextX(e.target.value)} className="pro-input text-xs w-full" /></div>
              <div><label className="text-[9px] text-slate-500 font-bold">Move Y</label><input type="number" value={customTextY} onChange={(e) => setCustomTextY(e.target.value)} className="pro-input text-xs w-full" /></div>
            </div>
          </div>

          {/* 5. CUSTOM IMAGES */}
          <div className="bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200">
            <label className="block text-[11px] font-black text-emerald-800 uppercase tracking-widest mb-2">5. Custom Images</label>
            
            <div className="mb-3 pb-3 border-b border-emerald-200">
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-bold text-slate-700">Image 1</label>
                {img1 && <button onClick={() => setImg1(null)} className="text-[9px] text-red-500 font-bold hover:underline">✕ Remove</button>}
              </div>
              <input type="file" accept="image/*" onChange={(e) => handleImgUpload(e, 1)} className="pro-input w-full text-[10px] bg-white cursor-pointer mb-2" />
              <div className="grid grid-cols-3 gap-1">
                <div><label className="text-[8px] font-bold">Width</label><input type="number" value={img1W} onChange={(e) => setImg1W(e.target.value)} className="pro-input text-[10px] w-full" /></div>
                <div><label className="text-[8px] font-bold">Move X</label><input type="number" value={img1X} onChange={(e) => setImg1X(e.target.value)} className="pro-input text-[10px] w-full" /></div>
                <div><label className="text-[8px] font-bold">Move Y</label><input type="number" value={img1Y} onChange={(e) => setImg1Y(e.target.value)} className="pro-input text-[10px] w-full" /></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-bold text-slate-700">Image 2</label>
                {img2 && <button onClick={() => setImg2(null)} className="text-[9px] text-red-500 font-bold hover:underline">✕ Remove</button>}
              </div>
              <input type="file" accept="image/*" onChange={(e) => handleImgUpload(e, 2)} className="pro-input w-full text-[10px] bg-white cursor-pointer mb-2" />
              <div className="grid grid-cols-3 gap-1">
                <div><label className="text-[8px] font-bold">Width</label><input type="number" value={img2W} onChange={(e) => setImg2W(e.target.value)} className="pro-input text-[10px] w-full" /></div>
                <div><label className="text-[8px] font-bold">Move X</label><input type="number" value={img2X} onChange={(e) => setImg2X(e.target.value)} className="pro-input text-[10px] w-full" /></div>
                <div><label className="text-[8px] font-bold">Move Y</label><input type="number" value={img2Y} onChange={(e) => setImg2Y(e.target.value)} className="pro-input text-[10px] w-full" /></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <button onClick={saveDesign} className="bg-blue-600 text-white py-2.5 rounded-xl font-black shadow-md hover:bg-blue-700 text-xs uppercase cursor-pointer flex items-center justify-center gap-1.5">
              {/* Save SVG Icon */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              Save
            </button>
            <button onClick={resetDesign} className="bg-red-500 text-white py-2.5 rounded-xl font-black shadow-md hover:bg-red-600 text-xs uppercase cursor-pointer flex items-center justify-center gap-1.5">
              {/* Reset SVG Icon */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Reset
            </button>
          </div>

          {/* 🟢 PRINT ENVELOPE BUTTON */}
          <button onClick={handleImagePrint} className="w-full bg-[#00a67e] text-white py-3 rounded-xl font-black uppercase tracking-widest shadow-md hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 text-xs mt-1 cursor-pointer">
            {/* Printer SVG Icon */}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            Print Envelope
          </button>
        </div>

        {/* RIGHT PREVIEW PANEL (Desktop View) */}
        <div className="hidden lg:flex flex-grow bg-slate-100 p-8 border-2 border-dashed border-slate-300 rounded-2xl min-h-[500px] justify-center items-start overflow-auto w-full">
          {renderEnvelopeContent()}
        </div>

      </div>

      {/* 🟢 FIXED MOBILE PREVIEW MODAL / DRAWER WITHOUT BOTTOM BUTTONS */}
      {previewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 z-[99999] flex flex-col items-center justify-end md:justify-center backdrop-blur-sm p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col h-[90vh] md:h-[85vh] overflow-hidden animate-[fadeIn_0.2s_ease-out]">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-[#00a67e] text-white rounded-t-2xl shrink-0">
              <h3 className="font-black uppercase text-xs md:text-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                Envelope Design Preview
              </h3>
              <button type="button" onClick={() => setPreviewModalOpen(false)} className="text-white hover:text-red-200 font-bold text-2xl leading-none cursor-pointer">&times;</button>
            </div>
            
            {/* Modal Body with Full Scroll Support */}
            <div className="p-6 overflow-auto flex-1 custom-scrollbar bg-slate-100 relative">
              <div className="min-w-max min-h-full m-auto flex items-center justify-center p-4">
                {renderEnvelopeContent()}
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}