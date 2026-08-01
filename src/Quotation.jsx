import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import { toJpeg } from 'html-to-image';

const BACKEND_URL = "https://shaney-erp-backend.onrender.com";

// --- HELPERS ---
const getTodayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDaysISO = (isoDate, days) => {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
  dateObj.setDate(dateObj.getDate() + Number(days));
  const newY = dateObj.getFullYear();
  const newM = String(dateObj.getMonth() + 1).padStart(2, '0');
  const newD = String(dateObj.getDate()).padStart(2, '0');
  return `${newY}-${newM}-${newD}`;
};

const toDDMMYYYY = (iso) => {
  if (!iso || !iso.includes('-')) return iso || '';
  const [y, m, d] = iso.split('-');
  if (y.length === 4) return `${d}-${m}-${y}`;
  return iso;
};

const fromDDMMYYYY = (ddmmyyyy) => {
  if (!ddmmyyyy) return getTodayISO();
  if (ddmmyyyy.match(/^\d{4}-\d{2}-\d{2}$/)) return ddmmyyyy;
  if (ddmmyyyy.match(/^\d{2}-\d{2}-\d{4}$/)) {
     const [d, m, y] = ddmmyyyy.split('-');
     return `${y}-${m}-${d}`;
  }
  return getTodayISO();
};

const getCurrentFY = () => {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  return m >= 4 ? `F.Y. ${y}-${String(y + 1).slice(-2)}` : `F.Y. ${y - 1}-${String(y).slice(-2)}`;
};

const getFinancialYear = (dateStr) => {
  if (!dateStr) return getCurrentFY();
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (month >= 4) {
      const nextYr = String(year + 1).slice(-2);
      return `F.Y. ${year}-${nextYr}`;
    } else {
      const prevYr = String(year - 1).slice(-2);
      return `F.Y. ${year - 1}-${String(year).slice(-2)}`;
    }
  }
  return getCurrentFY();
};

const getDynamicPrefix = () => {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  const yr1 = m >= 4 ? String(y).slice(-2) : String(y - 1).slice(-2);
  const yr2 = m >= 4 ? String(y + 1).slice(-2) : String(y).slice(-2);
  return `QT/${yr1}-${yr2}/101`;
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

function numberToWords(num) {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    if ((num = num.toString()).length > 9) return 'Overflow';
    let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return ''; let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'Only ' : 'Only';
    return str;
}

// --- DYNAMIC HTML TEMPLATES ---
const getQuoteHeaderHTML = (template, v, cColor, firmName, firmAddr, firmContact) => {
    let titleText = v.quoteMainTitle || "QUOTATION";
    let tB = v.titleB ? "font-weight: 900;" : "font-weight: bold;";
    let tI = v.titleI ? "font-style: italic;" : "font-style: normal;";
    let tU = v.titleU ? "text-decoration: underline;" : "text-decoration: none;";
    let tC = v.titleColor || cColor;
    let tF = v.titleFont || "Arial";
    let tS = v.titleSize ? v.titleSize + "px" : "36px";
    let tX = v.titleX || 0;
    let tY = v.titleY || 0;

    let mainTitle = `<h1 class="uppercase tracking-[0.25em]" style="text-align: center; margin-bottom: 20px; position: relative; z-index: 10; font-family: '${tF}', sans-serif; font-size: ${tS}; ${tB} ${tI} ${tU} color: ${tC}; transform: translate(${tX}px, ${tY}px);">${titleText}</h1>`;

    let hB = v.headerB ? "font-weight: 900;" : "font-weight: normal;";
    let hI = v.headerI ? "font-style: italic;" : "font-style: normal;";
    let hF = v.headerFont || "Arial";
    let hS = v.headerSize ? v.headerSize + "px" : "30px";
    let nameStyle = `font-family: '${hF}', sans-serif; font-size: ${hS}; ${hB} ${hI} line-height: 1;`;
    let name = `<span style="${nameStyle}">${firmName}</span>`;

    let html = "";
    switch (template) {
        case 'h-solid-block': html = `<div class="flex flex-col items-center text-center w-full p-6 rounded-2xl mb-2" style="background: ${cColor}; color: white;"><h2 class="uppercase">${name}</h2><p class="text-xs mt-2 opacity-90">${firmAddr}</p><p class="text-[11px] font-bold mt-1 uppercase opacity-80">${firmContact}</p></div>`; break;
        case 'h-dark-mode': html = `<div class="flex flex-col items-end text-right w-full p-6 bg-slate-900 rounded-xl mb-2 border-b-4" style="border-color: ${cColor}; color: white;"><h2>${name}</h2><p class="text-xs mt-2 text-slate-400">${firmAddr}</p><p class="text-[11px] font-bold mt-1 tracking-widest" style="color: ${cColor};">${firmContact}</p></div>`; break;
        case 'h-ultimate-pro': html = `<div class="flex justify-between items-center w-full pb-6 border-b border-slate-200"><h2 style="color: ${cColor}; border-left: 6px solid ${cColor}; padding-left: 15px;">${name}</h2><div class="text-right border-r-4 pr-4" style="border-color: ${cColor};"><p class="text-[10px] text-slate-500 uppercase">${firmAddr}</p><p class="text-[11px] font-bold mt-1 text-slate-800">${firmContact}</p></div></div>`; break;
        case 'h-modern-right': html = `<div class="flex flex-col items-end w-full pb-4 border-b border-slate-300"><h2 class="text-right" style="color: ${cColor};">${name}</h2><p class="text-xs text-slate-600 mt-2 text-right">${firmAddr}</p><p class="text-[11px] font-bold mt-1 text-right" style="color: ${cColor};">${firmContact}</p></div>`; break;
        case 'h-elegant-line': html = `<div class="flex flex-col items-start w-full pb-3 mb-2 relative"><h2 class="text-slate-900">${name}</h2><div style="width: 80px; height: 5px; background: ${cColor}; margin-top: 8px; border-radius: 3px;"></div><p class="text-xs text-slate-600 mt-3">${firmAddr}</p><p class="text-[11px] font-bold mt-1 text-slate-500">${firmContact}</p></div>`; break;
        case 'h-center-focus': html = `<div class="flex flex-col items-center w-full pb-4 border-b border-slate-200"><h2 class="text-center" style="color: ${cColor};">${name}</h2><p class="text-xs text-slate-600 mt-2 text-center">${firmAddr}</p><p class="text-[11px] font-bold mt-1 text-slate-500 text-center bg-slate-100 px-4 py-1.5 rounded-full mt-2">${firmContact}</p></div>`; break;
        case 'h-minimal-box': html = `<div class="flex flex-col items-center text-center w-full p-5 border-2 rounded-xl mb-2" style="border-color: ${cColor};"><h2 style="color: ${cColor};">${name}</h2><p class="text-xs text-slate-600 mt-2">${firmAddr}</p><p class="text-[11px] font-bold mt-1" style="color: ${cColor};">${firmContact}</p></div>`; break;
        case 'h-bold-brand': html = `<div class="flex flex-col items-start w-full pb-4 border-l-8 pl-4 mb-2" style="border-color: ${cColor};"><h2 class="tracking-tighter" style="color: ${cColor};">${name}</h2><p class="text-xs text-slate-500 mt-2 font-medium">${firmAddr} • ${firmContact}</p></div>`; break;
        case 'h-gradient-fade': html = `<div class="flex flex-col items-start w-full p-6 rounded-lg mb-2" style="background: linear-gradient(90deg, ${cColor}20, transparent);"><h2 style="color: ${cColor};">${name}</h2><p class="text-xs text-slate-700 mt-2">${firmAddr}</p><p class="text-[11px] font-bold mt-1 text-slate-900">${firmContact}</p></div>`; break;
        case 'h-corporate-split': html = `<div class="flex justify-between items-end w-full pb-4 border-b-2" style="border-color: ${cColor};"><h2 class="text-slate-800">${name}</h2><div class="text-right"><p class="text-[10px] text-slate-500">${firmAddr}</p><p class="text-[11px] font-bold mt-1" style="color: ${cColor};">${firmContact}</p></div></div>`; break;
        case 'h-luxury-accent': html = `<div class="flex flex-col items-center w-full pb-4 mb-2"><h2 class="tracking-widest text-slate-900 uppercase">${name}</h2><div style="width: 100%; height: 1px; background: ${cColor}; margin: 15px 0;"></div><p class="text-xs text-slate-500 text-center">${firmAddr} | <b style="color:${cColor};">${firmContact}</b></p></div>`; break;
        case 'h-tech-neon': html = `<div class="flex flex-col items-start w-full p-5 bg-slate-900 rounded-lg mb-2"><h2 style="color: ${cColor}; text-shadow: 0 0 10px ${cColor}80;">${name}</h2><p class="text-xs text-slate-400 mt-2">${firmAddr}</p><p class="text-[11px] font-bold mt-1 text-white">${firmContact}</p></div>`; break;
        case 'h-clean-cut': html = `<div class="flex flex-col items-start w-full pb-4 mb-2"><h2 class="text-slate-800 flex items-center gap-3"><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${cColor};"></span>${name}</h2><p class="text-xs text-slate-500 mt-2 pl-6">${firmAddr}</p><p class="text-[11px] font-bold mt-1 text-slate-400 pl-6">${firmContact}</p></div>`; break;
        case 'h-vintage-stamp': html = `<div class="flex flex-col items-center text-center w-full p-6 border-4 border-double rounded mb-2" style="border-color: ${cColor};"><h2 class="uppercase tracking-widest" style="color: ${cColor};">${name}</h2><p class="text-xs text-slate-700 mt-3 font-serif italic">${firmAddr}</p><p class="text-[11px] font-bold mt-1 text-slate-900">${firmContact}</p></div>`; break;
        default: html = `<div class="flex flex-col items-start w-full pb-4 border-b-2 border-slate-200"><h2 style="color: ${cColor};">${name}</h2><p class="text-xs text-slate-600 mt-2">${firmAddr}</p><p class="text-[11px] font-bold mt-1 text-slate-500">${firmContact}</p></div>`;
    }
    return mainTitle + html;
};

const getQuoteBillingHTML = (template, prefix, dateStr, cName, cAddr, cContact, cColor, v) => {
    let bB = v.billingB ? "font-weight: 900;" : "font-weight: normal;";
    let bI = v.billingI ? "font-style: italic;" : "font-style: normal;";
    let bF = v.billingFont || "Arial";
    let bS = v.billingSize ? v.billingSize + "px" : "16px";
    let bNameStyle = `font-family: '${bF}', sans-serif; font-size: ${bS}; ${bB} ${bI}; line-height: 1.1; display: inline-block; color: #0f172a;`;
    cName = `<span style="${bNameStyle}">${cName || 'UNKNOWN CLIENT'}</span>`;

    const left = `<span class="text-[9px] font-black uppercase block mb-1" style="color: ${cColor};">Billed To</span>${cName}<p class="text-xs text-slate-600 mt-1 break-words">${cAddr || ''}</p><div class="break-words mt-1 text-[10px] font-bold">${cContact || ''}</div>`;
    const right = `<table class="border-collapse text-left whitespace-nowrap ml-auto"><tr><td class="font-bold pr-3 text-slate-400 uppercase text-[9px] pb-1.5 text-right">Quote Ref</td><td class="font-black font-mono text-sm pb-1.5 text-right" style="color:${cColor};">:<span class="cursor-pointer">${prefix}</span></td></tr><tr><td class="font-bold pr-3 text-slate-400 uppercase text-[9px] pt-1.5 border-t border-slate-100 text-right">Date</td><td class="font-bold text-slate-800 pt-1.5 border-t border-slate-100 text-right">:${dateStr}</td></tr></table>`;

    switch (template) {
        case 'b-solid-right': return `<div class="flex rounded-xl overflow-hidden w-full mb-4 border border-slate-200"><div class="w-[55%] bg-white p-5 pr-4">${left}</div><div class="w-[45%] p-5 text-white" style="background:${cColor};"><table class="border-collapse text-left whitespace-nowrap ml-auto"><tr><td class="font-bold pr-3 text-white/70 uppercase text-[9px] pb-1.5 text-right">Quote Ref</td><td class="font-black font-mono text-sm pb-1.5 text-right">:<span>${prefix}</span></td></tr><tr><td class="font-bold pr-3 text-white/70 uppercase text-[9px] pt-1.5 border-t border-white/20 text-right">Date</td><td class="font-bold pt-1.5 border-t border-white/20 text-right">:${dateStr}</td></tr></table></div></div>`;
        case 'b-grid-compact': return `<div class="grid grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg w-full mb-4 border" style="border-color: ${cColor}40;"><div class="col-span-2 pr-4"><span class="text-[9px] font-black uppercase block mb-1" style="color: ${cColor};">Billed To</span>${cName}</div><div class="col-span-2 text-right"><span class="text-[9px] font-black text-slate-400 uppercase block mb-1">Quote Ref</span><h4 class="font-black font-mono text-sm" style="color:${cColor};">:<span >${prefix}</span></h4></div><div class="col-span-2 pr-4"><p class="text-[10px] text-slate-600 break-words">${cAddr}</p><div class="text-[10px] font-bold mt-1 break-words">${cContact}</div></div><div class="col-span-2 text-right"><span class="text-[9px] font-black text-slate-400 uppercase block mb-1">Date</span><h4 class="font-bold text-slate-800 text-xs">${dateStr}</h4></div></div>`;
        case 'b-ultra-premium': return `<div class="flex justify-between items-start p-6 w-full mb-4 bg-white border border-slate-200 relative overflow-hidden rounded-lg shadow-sm"><div class="absolute top-0 left-0 w-full h-1" style="background: linear-gradient(90deg, ${cColor}, transparent);"></div><div class="w-[55%] relative z-10 pr-4">${left}</div><div class="w-[40%] text-right flex justify-end relative z-10">${right}</div></div>`;
        case 'b-minimal-border': return `<div class="flex justify-between items-start w-full mb-4 border-2 p-5 rounded-lg" style="border-color: ${cColor};"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right">${right}</div></div>`;
        case 'b-floating-shadow': return `<div class="flex justify-between items-start w-full mb-4"><div class="w-[48%] bg-white shadow-lg p-5 rounded-xl border-t-4" style="border-top-color: ${cColor};">${left}</div><div class="w-[48%] bg-white shadow-lg p-5 rounded-xl flex justify-end border-t-4" style="border-top-color: ${cColor};">${right}</div></div>`;
        case 'b-dual-cards': return `<div class="flex justify-between items-start w-full mb-4"><div class="w-[48%] bg-slate-50 border border-slate-200 p-5 rounded-xl pr-4">${left}</div><div class="w-[48%] bg-slate-50 border border-slate-200 p-5 rounded-xl flex justify-end">${right}</div></div>`;
        case 'b-accent-left': return `<div class="flex justify-between items-start w-full mb-4 bg-white border border-slate-200 p-5 rounded-lg border-l-8" style="border-left-color: ${cColor};"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right flex justify-end">${right}</div></div>`;
        case 'b-boxed-tint': return `<div class="flex justify-between items-start w-full mb-4 p-5 rounded-lg" style="background-color: ${cColor}10; border: 1px solid ${cColor}40;"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right bg-white p-3 rounded shadow-sm">${right}</div></div>`;
        case 'b-clean-line': return `<div class="flex justify-between items-start w-full mb-4 pb-4 border-b border-slate-300"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right flex justify-end">${right}</div></div>`;
        case 'b-corporate-grey': return `<div class="flex justify-between items-start w-full mb-4 bg-slate-100 p-5 rounded-xl"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right flex justify-end">${right}</div></div>`;
        case 'b-modern-dark': return `<div class="flex justify-between items-start w-full mb-4 bg-slate-800 text-white p-5 rounded-xl"><div class="w-[55%] pr-4"><span class="text-[9px] font-black uppercase block mb-1" style="color: ${cColor};">Billed To</span>${cName}<p class="text-xs text-slate-300 mt-1">${cAddr}</p><div class="text-[10px] font-bold mt-1">${cContact}</div></div><div class="w-[40%] text-right flex justify-end"><table class="border-collapse text-left whitespace-nowrap ml-auto text-white"><tr><td class="font-bold pr-3 text-slate-400 uppercase text-[9px] pb-1.5 text-right">Quote Ref</td><td class="font-black font-mono text-sm pb-1.5 text-right" style="color:${cColor};">:<span >${prefix}</span></td></tr><tr><td class="font-bold pr-3 text-slate-400 uppercase text-[9px] pt-1.5 border-t border-slate-600 text-right">Date</td><td class="font-bold pt-1.5 border-t border-slate-600 text-right">:${dateStr}</td></tr></table></div></div>`;
        case 'b-tech-grid': return `<div class="flex justify-between items-start w-full mb-4 border border-dashed p-5" style="border-color: ${cColor};"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right flex justify-end">${right}</div></div>`;
        case 'b-elegant-serif': return `<div class="flex justify-between items-start w-full mb-4 px-4"><div class="w-[55%] pr-4 font-serif">${left}</div><div class="w-[40%] text-right flex justify-end font-serif">${right}</div></div>`;
        case 'b-impact-block': return `<div class="flex justify-between items-stretch w-full mb-4"><div class="w-[60%] p-5 text-white rounded-l-lg" style="background: ${cColor};"><span class="text-[9px] font-black uppercase block mb-1 opacity-70">Billed To</span>${cName}<p class="text-xs text-white/80 mt-1">${cAddr}</p><div class="text-[10px] font-bold mt-1">${cContact}</div></div><div class="w-[40%] bg-slate-100 p-5 rounded-r-lg flex justify-end">${right}</div></div>`;
        default: return `<div class="flex justify-between items-start bg-slate-50 p-5 rounded-xl border-l-4 w-full mb-4" style="border-left-color: ${cColor};"><div class="w-[55%] pr-4">${left}</div><div class="w-[40%] text-right bg-white p-3 rounded-lg border border-slate-100">${right}</div></div>`;
    }
};

export default function Quotation({ selectedFY, initialViewMode }) {
  const [viewMode, setViewMode] = useState(initialViewMode || 'list'); 

  useEffect(() => {
    if (initialViewMode) {
      setViewMode(initialViewMode);
    }
  }, [initialViewMode]);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);

  // 🟢 REAL-TIME LIVE SYNC LISTENER (App.jsx broadcast catcher)
  useEffect(() => {
    const handleDataUpdate = (e) => {
      if (!e.detail || e.detail.type === 'quotations') {
        const saved = localStorage.getItem('ERP_History_v104');
        if (saved) {
          let parsedData = JSON.parse(saved);
          parsedData = parsedData.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
          setQuotations(parsedData.filter(b => b.docType === 'quotation'));
        }
      }
    };
    window.addEventListener('ERP_DATA_UPDATED', handleDataUpdate);
    return () => window.removeEventListener('ERP_DATA_UPDATED', handleDataUpdate);
  }, []);

  const [firms, setFirms] = useState(() => {
    const saved = localStorage.getItem('ERP_Companies_v104');
    return saved ? JSON.parse(saved).filter(f => f.type === 'quotation') : [];
  });

  const [firmTemplates, setFirmTemplates] = useState(() => {
    const saved = localStorage.getItem('ERP_FirmTemplates_v104');
    return saved ? JSON.parse(saved) : {};
  });

  const [graphics, setGraphics] = useState(() => {
      const saved = localStorage.getItem('ERP_Graphics_v104');
      return saved ? JSON.parse(saved) : {};
  });

  const [staffList, setStaffList] = useState(() => {
    const saved = localStorage.getItem('ERP_Staff_v104');
    return saved ? JSON.parse(saved) : ['NAVNIT', 'KISHOR', 'RAHUL'];
  });

  const [customers, setCustomers] = useState(() => {
    try {
      const saved = localStorage.getItem('ERP_Customers_v104');
      return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });

  const [products, setProducts] = useState(() => {
    try {
        const saved = localStorage.getItem('ERP_Products_v104');
        return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });

  const [quotations, setQuotations] = useState(() => {
    let saved = localStorage.getItem('ERP_History_v104');
    let parsedData = saved ? JSON.parse(saved) : [];
    parsedData = parsedData.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
    return parsedData.filter(b => b.docType === 'quotation');
  });

  // 🟢 Fetch quotations from AWS Cloud on load
  useEffect(() => {
    const fetchCloudQuotations = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/data`);
        if (res.ok) {
          const allData = await res.json();
          if (allData && typeof allData === 'object') {
            let cloudQuotes = [];
            if (Array.isArray(allData)) {
              cloudQuotes = allData.filter(item => item.docType === 'quotation');
            } else if (allData.history && Array.isArray(allData.history)) {
              cloudQuotes = allData.history.filter(item => item.docType === 'quotation');
            } else if (allData.payload) {
              try {
                const parsed = JSON.parse(allData.payload);
                if (parsed.history) cloudQuotes = parsed.history.filter(item => item.docType === 'quotation');
              } catch(e){}
            }
            if (cloudQuotes.length > 0) {
              const checkedCloudQuotes = cloudQuotes.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
              setQuotations(checkedCloudQuotes);
              const savedHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
              const nonQuotes = savedHistory.filter(b => b.docType !== 'quotation');
              const merged = [...nonQuotes, ...checkedCloudQuotes];
              localStorage.setItem('ERP_History_v104', JSON.stringify(merged));
            }
          }
        }
      } catch (err) {
        console.error("Error fetching quotations from cloud:", err);
      }
    };
    fetchCloudQuotations();
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFirmFilter, setSelectedFirmFilter] = useState('ALL');
  const [filterFY, setFilterFY] = useState(selectedFY || 'ALL');
  const [selectedQuoteIds, setSelectedQuoteIds] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'ref', direction: 'desc' });

  useEffect(() => {
    if (selectedFY) setFilterFY(selectedFY);
  }, [selectedFY]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedFirmFilter, filterFY]);

  const availableFYs = Array.from(new Set(quotations.map(c => c.fy).filter(Boolean)));
  if (availableFYs.length === 0) availableFYs.push(getCurrentFY());

  const [editingQuoteId, setEditingQuoteId] = useState(null);
  const [formData, setFormData] = useState({
    activeFirmId: firms.length > 0 ? firms[0].id : '',
    client: '',
    address: '',
    contact: '',
    serialNo: '',
    issueDate: getTodayISO(),
    preparedBy: staffList[0] || ''
  });

  const [items, setItems] = useState([{ id: Date.now(), desc: '', hsn: '8424', qty: 1, rate: 0, gst: 18, amount: 0 }]);

  const activeFirmObj = firms.find(f => f.id === formData.activeFirmId) || { name: 'FIRM NAME', address: 'Address', contact: '', gstRate: 18, dayOffset: 0 };

  useEffect(() => {
    if (!editingQuoteId && viewMode === 'create') {
      const activeId = formData.activeFirmId || (firms.length > 0 ? firms[0].id : '');
      const f = firms.find(x => x.id === activeId);
      let allHist = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]').filter(b => b.docType === 'quotation');
      allHist = allHist.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));

      if (f) {
        const offset = Number(f.dayOffset) || 0;
        const calculatedDate = addDaysISO(getTodayISO(), offset);

        const firmQuotes = allHist.filter(c => c.vendor === f.name);
        const prefixRaw = (f.prefix || f.serialNo || f.startingNo || getDynamicPrefix()).trim();
        const match = prefixRaw.match(/^(.*?)(\d+)$/);
        
        let nextSerialNo = '';
        if (match) {
          const baseStr = match[1];
          const numStr = match[2];
          
          let maxNum = parseInt(numStr, 10) - 1;
          firmQuotes.forEach(c => {
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
          nextSerialNo = baseStr + paddedNum;
        } else {
          const nextNum = 101 + firmQuotes.length;
          nextSerialNo = prefixRaw + nextNum; 
        }

        const firmGst = f.gstRate !== undefined ? Number(f.gstRate) : 18;

        const updatedItems = items.map(it => {
            let r = it.rate;
            if (it.desc) {
                const prod = products.find(p => p.description.toLowerCase() === it.desc.toLowerCase());
                if (prod && prod.rates && prod.rates[activeId] !== undefined) {
                    r = parseFloat(prod.rates[activeId]) || 0;
                }
            }
            const q = parseFloat(it.qty) || 0;
            return { 
                ...it, 
                rate: r, 
                gst: firmGst, 
                amount: q * r 
            };
        });

        setFormData(prev => ({ 
            ...prev, 
            activeFirmId: activeId, 
            serialNo: nextSerialNo,
            issueDate: calculatedDate 
        }));
        setItems(updatedItems);
      }
    }
  }, [formData.activeFirmId, editingQuoteId, viewMode, firms, products]);

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
    const found = customers.find(c => c.name.toLowerCase() === val.toLowerCase());
    let addrStr = formData.address;
    let contactStr = formData.contact;

    if (found) {
      let addrParts = [];
      if (found.village) addrParts.push(found.village);
      if (found.taluka) addrParts.push(found.taluka);
      if (found.district) addrParts.push(found.district);
      addrStr = addrParts.join(', ');
      if (found.state || found.pincode) addrStr += `, ${found.state || ''} ${found.pincode ? '- ' + found.pincode : ''}`;
      addrStr = addrStr.trim() || found.address || '';
      contactStr = found.contact || found.phone || '';
    }
    setFormData({ ...formData, client: val, address: addrStr, contact: contactStr });
  };

  const addItemRow = () => {
      const firmGst = activeFirmObj.gstRate !== undefined ? Number(activeFirmObj.gstRate) : 18;
      setItems([...items, { id: Date.now(), desc: '', hsn: '8424', qty: 1, rate: 0, gst: firmGst, amount: 0 }]);
  };

  const removeItemRow = (index) => {
      const newItems = [...items];
      newItems.splice(index, 1);
      const firmGst = activeFirmObj.gstRate !== undefined ? Number(activeFirmObj.gstRate) : 18;
      if (newItems.length === 0) newItems.push({ id: Date.now(), desc: '', hsn: '8424', qty: 1, rate: 0, gst: firmGst, amount: 0 });
      setItems(newItems);
  };

  const updateItem = (index, field, value) => {
      const newItems = [...items];
      newItems[index][field] = value;
      
      if (field === 'desc') {
          const prod = products.find(p => p.description.toLowerCase() === value.toLowerCase());
          if (prod) {
              newItems[index].hsn = prod.hsn || newItems[index].hsn;
              if (prod.rates && prod.rates[formData.activeFirmId] !== undefined) {
                  newItems[index].rate = parseFloat(prod.rates[formData.activeFirmId]) || 0;
              }
          }
      }

      if (['qty', 'rate', 'desc'].includes(field)) {
          const q = parseFloat(newItems[index].qty) || 0;
          const r = parseFloat(newItems[index].rate) || 0;
          newItems[index].amount = q * r;
      }
      setItems(newItems);
  };

  const currentDesign = firmTemplates[formData.activeFirmId] || {
    themeColor: '#1e40af', quoteMainTitle: 'QUOTATION',
    quoteHeaderTemp: 'h-solid-block', quoteBillingTemp: 'b-classic-split', quoteTableTemp: 'table-base table-modern',
    quoteTableColor: '#1e40af', quoteHeaderColor: '#1e40af', quoteBillingColor: '#1e40af'
  };

  // 🟢 UPDATED WITH SQLITE IPC AND EXACT TIMESTAMP FOR DELTA SYNC
  const handleSaveQuotation = async (e, directAction = 'save') => {
    e.preventDefault();
    if (!formData.client || items.length === 0) {
      alert('Please enter Client Name and at least one item!');
      return;
    }
    
    let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
    allHistory = allHistory.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));

    const gross = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const avgGst = items.length > 0 && items[0].gst !== undefined && items[0].gst !== '' ? (parseFloat(items[0].gst)) : (activeFirmObj.gstRate !== undefined ? Number(activeFirmObj.gstRate) : 18);
    const cgst = (gross * (avgGst / 2)) / 100;
    const sgst = (gross * (avgGst / 2)) / 100;
    const grandTotal = Math.round(gross + cgst + sgst);
    
    if (editingQuoteId) {
      const isDuplicate = allHistory.some(c => c.docType === 'quotation' && c.vendor === activeFirmObj.name && c.ref === formData.serialNo && c.id !== editingQuoteId);
      if (isDuplicate) return alert(`⚠️ Quote No. ${formData.serialNo} already exists! Please use a unique number.`);
    } else {
      const isDuplicate = allHistory.some(c => c.docType === 'quotation' && c.vendor === activeFirmObj.name && c.ref === formData.serialNo);
      if (isDuplicate) return alert(`⚠️ Quote No. ${formData.serialNo} already exists! Please use a unique number.`);
    }

    const savedDate = toDDMMYYYY(formData.issueDate);
    const autoFy = getFinancialYear(savedDate);
    
    let targetQuoteId = editingQuoteId || Date.now().toString();
    const currentTimestamp = Date.now(); // 🟢 Exact Timestamp for Delta Sync
    let quoteObj = null;

    if (editingQuoteId) {
      const idx = allHistory.findIndex(x => x.id === editingQuoteId);
      if(idx !== -1) {
        quoteObj = sanitizeForCloud({
          ...allHistory[idx],
          ref: formData.serialNo,
          party: formData.client,
          date: savedDate,
          total: grandTotal,
          fy: autoFy,
          vendor: activeFirmObj.name,
          staffName: formData.preparedBy,
          itemsData: JSON.stringify(items),
          updatedAt: currentTimestamp // 🟢 Timestamp update
        });
        allHistory[idx] = quoteObj;
        logActionToBackend(`Updated Quotation Ref: ${formData.serialNo} for ${formData.client}`);
      }
    } else {
      quoteObj = sanitizeForCloud({
        id: targetQuoteId,
        docType: 'quotation',
        ref: formData.serialNo,
        party: formData.client,
        date: savedDate,
        total: grandTotal,
        fy: autoFy,
        vendor: activeFirmObj.name,
        staffName: formData.preparedBy,
        itemsData: JSON.stringify(items),
        updatedAt: currentTimestamp // 🟢 Timestamp created
      });
      allHistory.push(quoteObj);
      logActionToBackend(`Created Quotation Ref: ${formData.serialNo} for ${formData.client}`);
    }

    localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
    setQuotations(allHistory.filter(b => b.docType === 'quotation'));

    // 🟢 Save directly to local SQLite Database via Electron IPC (0 latency)
    try {
      if (quoteObj) {
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'history', id: String(targetQuoteId), data: quoteObj })
        });
        localStorage.removeItem(`shaney_quotation_${targetQuoteId}`);
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', quoteObj);
        }
      }
    } catch (err) {
      console.error("Cloud quotation save error:", err);
    }
    
    const finishSave = () => {
      setFormData({ ...formData, client: '', address: '', contact: '' });
      const firmGst = activeFirmObj.gstRate !== undefined ? Number(activeFirmObj.gstRate) : 18;
      setItems([{ id: Date.now(), desc: '', hsn: '8424', qty: 1, rate: 0, gst: firmGst, amount: 0 }]);
      setEditingQuoteId(null);
      setViewMode('list');
    };

    if (directAction === 'print') {
      setTimeout(() => { executeDocumentAction('print', 'create-quote-print-area', formData.serialNo); finishSave(); }, 100);
    } else {
      alert(editingQuoteId ? '✅ Quotation Updated & Synced to Cloud!' : '✅ Quotation Saved & Synced to Cloud!');
      finishSave();
    }
  };

  const handleEditQuote = (e, quote) => {
    e.stopPropagation();
    setEditingQuoteId(quote.id); 

    setFormData({
      activeFirmId: firms.find(f => f.name === quote.vendor)?.id || firms[0]?.id || '',
      client: quote.party || '',
      address: getCustomerAddress(quote.party) || '', 
      contact: customers.find(c => c.name.toLowerCase() === (quote.party||'').toLowerCase())?.contact || '',
      serialNo: quote.ref || '',
      issueDate: fromDDMMYYYY(quote.date),
      preparedBy: quote.staffName || staffList[0] || ''
    });
    if (quote.itemsData) {
      try { setItems(JSON.parse(quote.itemsData)); } catch(err) { }
    }
    setViewMode('create');
  };

  const handleDeleteHistory = async (e, id) => {
    e.stopPropagation();
    if(confirm('Are you sure you want to delete this quotation?')) {
      let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
      allHistory = allHistory.filter(c => c.id !== id);
      localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
      setQuotations(allHistory.filter(b => b.docType === 'quotation'));
      setSelectedQuoteIds(selectedQuoteIds.filter(i => i !== id));
      
      try {
        await fetch(`${BACKEND_URL}/api/data/${id}`, { method: 'DELETE' });
        localStorage.removeItem(`shaney_quotation_${id}`);
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', { id, deleted: true, updatedAt: Date.now() });
        }
      } catch (err) {
        console.error("Cloud quotation delete error:", err);
      }

      logActionToBackend(`Deleted Quotation Record`);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedQuoteIds.length === 0) return alert('Please select at least one quotation to delete!');
    if (confirm(`Are you sure you want to delete ${selectedQuoteIds.length} selected quotation(s)?`)) {
      let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
      allHistory = allHistory.filter(c => !selectedQuoteIds.includes(c.id));
      localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
      setQuotations(allHistory.filter(b => b.docType === 'quotation'));
      
      for (let id of selectedQuoteIds) {
        try {
          await fetch(`${BACKEND_URL}/api/data/${id}`, { method: 'DELETE' });
          localStorage.removeItem(`shaney_quotation_${id}`);
        } catch (err) {
          console.error("Cloud quotation delete error:", err);
        }
      }

      setSelectedQuoteIds([]);
      logActionToBackend(`Deleted multiple quotations`);
    }
  };

  const handleWhatsAppSend = async (e, quote) => {
    e.stopPropagation(); 
    let allHistory = JSON.parse(localStorage.getItem('ERP_History_v104') || '[]');
    const idx = allHistory.findIndex(b => b.id.toString() === quote.id.toString());
    if (idx !== -1) {
      allHistory[idx].whatsappSent = true;
      allHistory[idx].updatedAt = Date.now(); // 🟢 Timestamp update
      const targetRecord = allHistory[idx];
      localStorage.setItem('ERP_History_v104', JSON.stringify(allHistory));
      setQuotations(allHistory.filter(b => b.docType === 'quotation'));
      try {
        await fetch(`${BACKEND_URL}/api/data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'history', id: String(quote.id), data: sanitizeForCloud(targetRecord) })
        });
        localStorage.removeItem(`shaney_quotation_${quote.id}`);
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', targetRecord);
        }
      } catch (err) {
        console.error("Cloud whatsapp sent update error:", err);
      }
      logActionToBackend(`Sent WhatsApp for Quotation Ref: ${quote.ref}`);
    }

    const cData = customers.find(c => c.name.toLowerCase() === quote.party.toLowerCase());
    const phone = cData?.contact || cData?.phone || '';
    const baseUrl = window.location.origin;
    const docLink = `${baseUrl}/preview/${quote.id}`;
    const msg = `Hello ${quote.party},\n\nPlease find attached your Quotation (Ref: ${quote.ref}).\n\n📄 View Document:\n🔗 ${docLink}\n\nThank you!\n- ${quote.vendor}`;
    
    window.open(`https://wa.me/${phone ? '91'+phone.replace(/\D/g,'') : ''}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const executeDocumentAction = async (actionType, elementId, filename) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    document.body.style.cursor = 'wait';

    if (actionType === 'print') {
        const clone = element.cloneNode(true);
        clone.id = 'print-temp-element';
        Object.assign(clone.style, { position: 'absolute', top: '0px', left: '0px', transform: 'none', width: '794px', height: '1123px', backgroundColor: '#ffffff', zIndex: '999999', margin: '0px' });
        
        clone.querySelectorAll('.cell-input').forEach(inp => {
             const span = document.createElement('span');
             span.innerText = inp.value;
             span.style.cssText = "font-weight:bold; color:black; font-size:inherit;";
             inp.parentNode.replaceChild(span, inp);
        });

        document.body.appendChild(clone);
        const style = document.createElement('style');
        style.id = 'print-style-temp';
        style.innerHTML = `@media print { body > *:not(#print-temp-element) { display: none !important; } @page { size: A4 portrait; margin: 0; } html, body { background-color: white !important; margin: 0 !important; padding: 0 !important; } }`;
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
            scaleWrapper.className = originalClassName.replace(/scale-\[[^\]]+\]/g, '').replace(/sm:scale-\[[^\]]+\]/g, '').replace(/md:scale-\[[^\]]+\]/g, '').replace(/lg:scale-\[[^\]]+\]/g, '').replace(/xl:scale-\[[^\]]+\]/g, '').replace(/transform/g, '').replace(/origin-[a-z-]+/g, '');
            scaleWrapper.style.transform = 'none';
            
            const inputs = element.querySelectorAll('input');
            inputs.forEach(inp => {
                const span = document.createElement('span');
                span.innerText = inp.value;
                span.className = inp.className;
                span.style.border = 'none'; span.style.background = 'transparent';
                inp.style.display = 'none';
                inp.parentNode.insertBefore(span, inp);
            });

            await new Promise(r => setTimeout(r, 400)); 

            const dataUrl = await toJpeg(element, { quality: 0.85, pixelRatio: 2, backgroundColor: '#ffffff' });

            inputs.forEach(inp => {
                inp.style.display = '';
                if(inp.previousSibling && inp.previousSibling.tagName === 'SPAN') inp.parentNode.removeChild(inp.previousSibling);
            });

            scaleWrapper.className = originalClassName;
            scaleWrapper.style.transform = originalTransform;

            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
            const imgProps = pdf.getImageProperties(dataUrl);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

            pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
            const suggestedName = filename ? `${filename}.pdf` : 'Quotation.pdf';

            if ('showSaveFilePicker' in window) {
              try {
                const handle = await window.showSaveFilePicker({ suggestedName, types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }] });
                const writable = await handle.createWritable();
                await writable.write(pdf.output('blob'));
                await writable.close();
              } catch (err) { if (err.name !== 'AbortError') console.error(err); }
            } else { pdf.save(suggestedName); }
        } catch (err) {
            console.error("PDF generation failed:", err);
            scaleWrapper.className = originalClassName;
            scaleWrapper.style.transform = originalTransform;
            alert(`PDF failed: ${err.message}`);
        } finally { document.body.style.cursor = 'default'; }
    }
  };

  const filteredQuotes = quotations.filter(c => {
    const matchesSearch = (c.ref || '').toLowerCase().includes(searchTerm.toLowerCase()) || (c.party || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFirm = selectedFirmFilter === 'ALL' || c.vendor === selectedFirmFilter;
    const matchesFY = filterFY === 'ALL' || !c.fy || c.fy === filterFY;
    return matchesSearch && matchesFirm && matchesFY;
  }).sort((a, b) => {
    let aVal = a[sortConfig.key] || ''; let bVal = b[sortConfig.key] || '';
    if (sortConfig.key === 'total') { aVal = Number(a.total || 0); bVal = Number(b.total || 0); }
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(filteredQuotes.length / rowsPerPage) || 1;
  const paginatedQuotes = filteredQuotes.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activePreviewQuote, setActivePreviewQuote] = useState(null);

  // 🟢 CLIENT-SIDE CACHING MECHANISM FOR QUOTATION VIEWER (0 Cloud Reads after 1st load)
  const handleViewQuote = async (e, q) => {
    e.stopPropagation();
    const localKey = `shaney_quotation_${q.id}`;
    let quoteToView = q;

    try {
      const cached = localStorage.getItem(localKey);
      if (cached) {
        quoteToView = JSON.parse(cached);
      } else {
        const res = await fetch(`${BACKEND_URL}/api/document/${q.id}`);
        if (res.ok) {
          const cloudData = await res.json();
          if (cloudData && cloudData.data) {
            quoteToView = cloudData.data;
            localStorage.setItem(localKey, JSON.stringify(quoteToView));
          }
        }
      }
    } catch (err) {
      console.error("Cache fetch error for quotation, falling back to local object:", err);
    }

    setActivePreviewQuote(quoteToView);
    setIsPreviewOpen(true);
  };

  const renderA4Quotation = (payload, containerId, isEditable = false) => {
      if (!payload) return null;
      const { firmObj, design, party, address, contact, date, ref, itemsData } = payload;
      const g = graphics[firmObj.id] || {};

      const tableClass = design.quoteTableTemp || "table-base table-modern";
      const thSize = design.tableSize || 10;
      const tCol = design.quoteTableColor || design.themeColor;

      return (
          <div id={containerId} className="bg-white shadow-2xl relative w-[794px] h-auto min-h-[1123px] overflow-hidden flex flex-col box-border z-0 p-8 md:p-12">
            <style dangerouslySetInnerHTML={{__html:`
                .table-base th { padding: 12px 10px; text-transform: uppercase; font-size: ${thSize}px; font-weight: 800; text-align: center; border-bottom: 2px solid ${tCol}; }
                .table-base td { padding: 12px 10px; text-align: center; border-bottom: 1px solid #f1f5f9; }
                .product-desc-cell { text-align: left !important; font-weight: 700; color: #0f172a; }
                .product-desc-header { text-align: left !important; }
                .table-modern th { background: transparent; color: ${tCol}; }
                .table-striped tbody tr:nth-child(even) { background-color: #f8fafc; }
            `}} />
            
            <div className="absolute top-0 left-0 right-0 h-2" style={{ background: design.themeColor }}></div>
            
            <div className="w-full transition-all duration-300" dangerouslySetInnerHTML={{__html: getQuoteHeaderHTML(design.quoteHeaderTemp || 'h-solid-block', design, design.quoteHeaderColor || design.themeColor, firmObj.name, firmObj.address, firmObj.contact)}} />
            <div className="w-full mt-2 transition-all duration-300" dangerouslySetInnerHTML={{__html: getQuoteBillingHTML(design.quoteBillingTemp || 'b-classic-split', ref, date, party, address, contact, design.quoteBillingColor || design.themeColor, design)}} />

            <div className="overflow-x-auto mt-4 w-full">
                <table className={`w-full text-left border-collapse ${tableClass}`} style={{tableLayout:'fixed', width:'100%'}}>
                    <thead>
                        <tr>
                            <th style={{width:'6%'}}>Sr.</th>
                            <th style={{width:'40%'}} className="product-desc-header">Item Description</th>
                            <th style={{width:'12%'}}>HSN</th>
                            <th style={{width:'9%'}}>GST</th>
                            <th style={{width:'10%'}}>Qty</th>
                            <th style={{width:'13%'}}>Rate</th>
                            <th style={{width:'10%'}} className="text-right pr-2">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="text-xs text-slate-800 font-medium">
                        {(itemsData || items).map((it, idx) => (
                            <tr key={it.id || idx}>
                                <td>{idx + 1}</td>
                                <td className="product-desc-cell">{it.desc || '-'}</td>
                                <td>{it.hsn || '-'}</td>
                                <td>{it.gst !== undefined ? it.gst + '%' : '18%'}</td>
                                <td>{it.qty || 0}</td>
                                <td>{it.rate || 0}</td>
                                <td className="text-right pr-2 font-mono font-bold">{Number(it.amount||0).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {(() => {
                const iData = itemsData || items;
                const g = iData.reduce((s, i) => s + (Number(i.amount) || 0), 0);
                const gRate = iData.length > 0 && iData[0].gst !== undefined && iData[0].gst !== '' ? Number(iData[0].gst) : (firmObj.gstRate !== undefined ? Number(firmObj.gstRate) : 18);
                const c = (g * (gRate / 2)) / 100;
                const s = (g * (gRate / 2)) / 100;
                const grand = Math.round(g + c + s);
                const words = numberToWords(grand) + " Rupees";
                
                return (
                    <div className="flex flex-col ml-auto w-full max-w-sm mt-4 pt-4 border-t-2">
                        <div className="flex justify-between items-center text-xs text-slate-600 mb-2"><span className="font-semibold">Gross Taxable:</span><span className="font-bold text-slate-900 font-mono">₹{g.toFixed(2)}</span></div>
                        <div className="flex justify-between items-center text-xs text-slate-600 mb-2"><span className="font-semibold">CGST:</span><span className="font-bold text-slate-900 font-mono">₹{c.toFixed(2)}</span></div>
                        <div className="flex justify-between items-center text-xs text-slate-600 pb-3 border-b border-slate-200 mb-3"><span className="font-semibold">SGST:</span><span className="font-bold text-slate-900 font-mono">₹{s.toFixed(2)}</span></div>
                        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100"><span className="text-sm font-black uppercase tracking-wider">Grand Total:</span><span className="text-xl font-black font-mono">₹{grand.toFixed(2)}</span></div>
                        <p className="text-[10px] italic text-slate-500 text-right mt-2 font-semibold w-full block break-words capitalize">{words}</p>
                    </div>
                )
            })()}

            <div className="flex flex-col items-end mt-auto pt-10 w-full relative">
                <div className="text-center min-w-[220px] mr-[10mm] relative">
                    <div className="absolute bottom-[28px] left-1/2 -translate-x-1/2 pointer-events-none">
                        {g.stamp && g.stamp.url && <img src={g.stamp.url} style={{ transform:`translate(${g.stamp.x||0}px, ${g.stamp.y||0}px)` , width:`${g.stamp.s||140}px`}} className="max-h-[140px] object-contain opacity-95 mx-auto" />}
                    </div>
                    <div className="h-16"></div>
                    <p className="border-t-2 border-slate-300 pt-1.5 font-black text-xs uppercase tracking-wider">For {firmObj.name}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Authorised Signatory</p>
                </div>
            </div>
          </div>
      );
  };

  let createPayload = null;
  if (viewMode === 'create') {
     createPayload = {
      firmObj: activeFirmObj,
      design: currentDesign,
      party: formData.client,
      address: formData.address,
      contact: formData.contact,
      date: toDDMMYYYY(formData.issueDate),
      ref: formData.serialNo,
      itemsData: items
     };
  }

  return (
    <div className="tab-content active h-[calc(100vh-65px)] w-full relative bg-slate-100 overflow-y-auto custom-scrollbar p-4 md:p-6 animate-[fadeIn_0.3s_ease-in-out]">
        <datalist id="quoteProductList">
            {products.map(p => <option key={p.id} value={p.description} />)}
        </datalist>

      <div className="max-w-7xl mx-auto pb-10">

        {isPreviewOpen && activePreviewQuote && (
          <div className="fixed inset-0 z-[99999] flex justify-end bg-slate-900/70 backdrop-blur-sm transition-all duration-300">
            <div className="w-[850px] max-w-full h-full bg-slate-100 flex flex-col shadow-2xl animate-[slideInRight_0.3s]">
              <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0 shadow-sm z-10">
                <h2 className="font-black text-slate-800 text-sm tracking-widest uppercase flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-600 inline-block shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Document Viewer
                </h2>
                <button onClick={() => setIsPreviewOpen(false)} className="text-slate-400 hover:text-red-500 font-bold text-2xl leading-none">&times;</button>
              </div>

              <div className="flex-1 bg-slate-500 overflow-y-auto overflow-x-hidden flex justify-center items-start py-4 sm:py-8 w-full custom-scrollbar">
                <div className="origin-top transform scale-[0.4] sm:scale-[0.55] md:scale-[0.7] lg:scale-[0.95] transition-transform drop-shadow-2xl mb-[50px] sm:mb-[100px]">
                    {renderA4Quotation({
                        firmObj: firms.find(f => f.name === activePreviewQuote.vendor) || firms[0] || {},
                        design: firmTemplates[firms.find(f => f.name === activePreviewQuote.vendor)?.id] || currentDesign,
                        party: activePreviewQuote.party,
                        address: getCustomerAddress(activePreviewQuote.party),
                        contact: customers.find(c => c.name.toLowerCase() === (activePreviewQuote.party||'').toLowerCase())?.contact || '',
                        date: activePreviewQuote.date,
                        ref: activePreviewQuote.ref,
                        itemsData: activePreviewQuote.itemsData ? JSON.parse(activePreviewQuote.itemsData) : []
                    }, 'drawer-quote-print-area', false)}
                </div>
              </div>

              <div className="p-4 bg-white border-t border-slate-200 flex justify-between items-center shrink-0 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] flex-wrap gap-3">
                <button onClick={() => setIsPreviewOpen(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-lg text-xs font-black uppercase transition-all shadow-sm flex items-center gap-1.5">
                  <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                  Close
                </button>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button onClick={(e) => handleWhatsAppSend(e, activePreviewQuote)} className="flex-1 sm:flex-none bg-[#25D366] text-white hover:bg-green-600 px-5 py-2.5 rounded-lg text-xs font-black uppercase transition-all shadow-md flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                    WhatsApp
                  </button>
                  <button onClick={() => {
                    const cleanParty = (activePreviewQuote.party || 'Customer').replace(/[^a-zA-Z0-9-_]/g, '_');
                    const cleanRef = (activePreviewQuote.ref || 'Quote').replace(/[^a-zA-Z0-9-_]/g, '_');
                    executeDocumentAction('pdf', 'drawer-quote-print-area', `${cleanParty}_${cleanRef}`);
                  }} className="flex-1 sm:flex-none bg-[#facc15] text-white hover:bg-yellow-500 px-5 py-2.5 rounded-lg text-xs font-black uppercase transition-all shadow-md flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                    Save PDF
                  </button>
                  <button onClick={() => executeDocumentAction('print', 'drawer-quote-print-area', '')} className="flex-1 sm:flex-none bg-[#00a67e] text-white hover:bg-emerald-600 px-6 py-2.5 rounded-lg text-xs font-black uppercase transition-all shadow-md flex items-center justify-center gap-1.5">
                    <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
                    Print
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
                  {renderA4Quotation(createPayload, 'mobile-drawer-preview-area', false)}
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
                <h4 className="font-black text-[10px] text-slate-500 uppercase tracking-widest">
                  {editingQuoteId ? '✏️ Edit Quotation' : '📝 Quotation Entry'}
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

                  <button type="button" onClick={() => { setViewMode('list'); setEditingQuoteId(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-4 py-2 rounded-lg uppercase tracking-widest transition-colors shadow-sm flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 fill-current inline" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg> Back
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveQuotation} className="flex flex-col gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-1.5">1. Active Firm</label>
                      <select 
                        value={formData.activeFirmId} 
                        onChange={(e) => setFormData({...formData, activeFirmId: e.target.value})} 
                        className="pro-input border-blue-300 bg-blue-50 text-blue-900 shadow-inner font-bold cursor-pointer"
                      >
                        {firms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </div>
                    
                    <div className="relative">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 flex justify-between">
                        <span>2. Billed To (Client)</span>
                      </label>
                      <input 
                        type="text" 
                        list="certCustomerList"
                        placeholder="Search and select client..." 
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
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Issue Date</label>
                        <input 
                          type="date" 
                          value={formData.issueDate} 
                          onChange={(e) => setFormData({...formData, issueDate: e.target.value})} 
                          className="pro-input font-mono shadow-inner font-bold text-slate-700 uppercase" 
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Prepared By</label>
                        <select 
                          value={formData.preparedBy} 
                          onChange={(e) => setFormData({...formData, preparedBy: e.target.value})} 
                          className="pro-input font-bold text-slate-700 shadow-inner"
                        >
                          {staffList.map(s => <option key={`qsub-${s}`} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-100">
                    <h4 className="font-black text-xs text-blue-600 uppercase">Quotation Items</h4>
                    <button type="button" onClick={addItemRow} className="bg-blue-600 text-white px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider hover:bg-blue-700 transition-colors shadow-sm">
                      + Add Item
                    </button>
                  </div>
                  <div className="space-y-3">
                    {items.map((it, idx) => (
                      <div key={it.id || idx} className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 relative">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-slate-400">Item #{idx + 1}</span>
                          {items.length > 1 && (
                            <button type="button" onClick={() => removeItemRow(idx)} className="text-red-500 hover:text-red-700 text-xs font-bold">✕ Remove</button>
                          )}
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Item Description</label>
                          <input type="text" list="quoteProductList" value={it.desc} onChange={e => updateItem(idx, 'desc', e.target.value)} className="pro-input text-xs font-bold bg-white" placeholder="Product / Service description..." />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Qty</label>
                            <input type="number" value={it.qty} onChange={e => updateItem(idx, 'qty', e.target.value)} className="pro-input text-xs font-bold bg-white text-center" />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Rate (₹)</label>
                            <input type="number" value={it.rate} onChange={e => updateItem(idx, 'rate', e.target.value)} className="pro-input text-xs font-bold bg-white text-center" />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Amount</label>
                            <input type="text" value={Number(it.amount || 0).toFixed(2)} readOnly className="pro-input text-xs font-mono font-bold bg-slate-100 text-slate-700 text-center" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm border-b-4 border-b-blue-500">
                  <div className="flex justify-between items-center pt-2">
                    <button type="button" onClick={() => { setViewMode('list'); setEditingQuoteId(null); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-lg text-xs font-black uppercase transition-all shadow-sm">
                      Cancel
                    </button>
                    <div className="flex gap-2">
                      <button type="button" onClick={(e) => handleSaveQuotation(e, 'print')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center gap-1.5">
                        <svg className="w-4 h-4 fill-current inline" viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
                        <span className="hidden sm:inline">Save & Print</span>
                      </button>
                      <button type="submit" onClick={(e) => handleSaveQuotation(e, 'save')} className={`${editingQuoteId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'} text-white px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider shadow-md transition-all flex items-center gap-1.5`}>
                        <svg className="w-4 h-4 fill-current inline" viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
                        <span className="hidden sm:inline">{editingQuoteId ? 'Update' : 'Save'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="hidden lg:flex lg:col-span-7 bg-slate-300 p-6 rounded-2xl shadow-inner border border-slate-400 justify-center items-center overflow-y-auto overflow-x-hidden h-[78vh] w-full custom-scrollbar relative">
              <div className="m-auto flex justify-center items-center py-10 w-full">
                <div className="origin-center transform scale-[0.5] sm:scale-[0.6] md:scale-[0.7] lg:scale-[0.65] xl:scale-[0.75] transition-transform shadow-2xl bg-white">
                    {renderA4Quotation({
                       firmObj: activeFirmObj,
                       design: currentDesign,
                       party: formData.client,
                       address: formData.address,
                       contact: formData.contact,
                       date: toDDMMYYYY(formData.issueDate),
                       ref: formData.serialNo,
                       itemsData: items
                     }, 'create-quote-print-area', false)}
                </div>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'list' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-white p-3 lg:p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-center gap-4 mb-4">
              <div className="flex items-center gap-3 w-full xl:w-auto shrink-0 justify-between xl:justify-start border-b xl:border-b-0 border-slate-100 pb-3 xl:pb-0">
                <h2 className="flex items-center gap-2 text-sm font-black uppercase text-slate-800 tracking-wider">
                  QUOTATION
                </h2>
              </div>

              <div className="flex items-center justify-between xl:justify-center w-full xl:w-auto gap-2 lg:gap-3 shrink-0">
                <select value={selectedFirmFilter} onChange={(e) => setSelectedFirmFilter(e.target.value)} className="pro-input py-2 px-3 text-xs w-[48%] xl:w-36 shadow-sm font-bold text-slate-700 cursor-pointer bg-white">
                  <option value="ALL">All Firms</option>
                  {firms.map(f => <option key={f.id} value={f.name}>{f.name}</option>)}
                </select>
                <select value={filterFY} onChange={(e) => setFilterFY(e.target.value)} className="pro-input py-2 px-3 text-xs w-[48%] xl:w-32 shadow-sm font-bold text-slate-700 cursor-pointer bg-white">
                  <option value="ALL">All F.Y.</option>
                  {availableFYs.map(fy => <option key={fy} value={fy}>{fy}</option>)}
                </select>
              </div>

              <div className="flex items-center w-full xl:w-auto gap-2 lg:gap-3 shrink-0 justify-end">
                <div className="relative w-full xl:w-48">
                  <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search..." className="w-full text-xs py-2 pl-8 pr-3 rounded-lg border border-slate-300 bg-slate-50 outline-none font-medium shadow-inner" />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
                </div>
                {selectedQuoteIds.length > 0 && (
                  <button onClick={handleDeleteSelected} className="bg-red-500 hover:bg-red-600 text-white font-black text-xs px-3 py-2 rounded-lg shadow-md transition-all uppercase tracking-wider shrink-0 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 fill-current inline" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    Delete ({selectedQuoteIds.length})
                  </button>
                )}
                <button onClick={() => {
                  const firstFirm = firms.length > 0 ? firms[0] : null;
                  const initialOffset = firstFirm ? (Number(firstFirm.dayOffset) || 0) : 0;
                  setFormData({
                    activeFirmId: firstFirm ? firstFirm.id : '',
                    client: '', address: '', contact: '', serialNo: '', issueDate: addDaysISO(getTodayISO(), initialOffset), preparedBy: staffList[0] || ''
                  });
                  const initialGst = firstFirm && firstFirm.gstRate !== undefined ? Number(firstFirm.gstRate) : 18;
                  setItems([{ id: Date.now(), desc: '', hsn: '8424', qty: 1, rate: 0, gst: initialGst, amount: 0 }]);
                  setEditingQuoteId(null);
                  setViewMode('create');
                }} className="bg-[#00a67e] hover:bg-emerald-600 text-white font-black text-xs px-4 py-2 rounded-lg shadow-md transition-all flex items-center gap-1.5 uppercase active:scale-95 shrink-0">
                  <svg className="w-3.5 h-3.5 fill-current inline" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> <span className="hidden sm:inline">ADD</span>
                </button>
              </div>
            </div>

            <div className="hidden md:block overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap min-w-[850px]">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">
                        <tr>
                            <th className="py-4 px-4 w-12 text-center">
                                <input type="checkbox" onChange={(e) => {
                                    if(e.target.checked) setSelectedQuoteIds(filteredQuotes.map(q => q.id));
                                    else setSelectedQuoteIds([]);
                                }} checked={filteredQuotes.length > 0 && selectedQuoteIds.length === filteredQuotes.length} className="cursor-pointer w-4 h-4 rounded border-slate-300 accent-[#00a67e]" />
                            </th>
                            <th className="py-4 px-4 cursor-pointer hover:text-slate-800" onClick={() => handleSort('ref')}>QUOTE NO ↕</th>
                            <th className="py-4 px-4 cursor-pointer hover:text-slate-800" onClick={() => handleSort('party')}>COMPANY NAME ↕</th>
                            <th className="py-4 px-4 cursor-pointer hover:text-slate-800" onClick={() => handleSort('staffName')}>PREPARED BY ↕</th>
                            <th className="py-4 px-4 cursor-pointer hover:text-slate-800" onClick={() => handleSort('date')}>DATE ↕</th>
                            <th className="py-4 px-4 text-right cursor-pointer hover:text-slate-800" onClick={() => handleSort('total')}>TOTAL ↕</th>
                            <th className="py-4 px-4 text-center">ACTION</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                        {paginatedQuotes.map(q => (
                            <tr key={q.id} className="hover:bg-slate-50 transition-colors group">
                                <td className="py-3 px-4 text-center">
                                    <input type="checkbox" checked={selectedQuoteIds.includes(q.id)} onChange={(e) => {
                                        if (e.target.checked) setSelectedQuoteIds([...selectedQuoteIds, q.id]);
                                        else setSelectedQuoteIds(selectedQuoteIds.filter(i => i !== q.id));
                                    }} className="cursor-pointer w-4 h-4 rounded border-slate-300 accent-[#00a67e]" />
                                </td>
                                <td className="py-3 px-4 font-mono font-black text-slate-700 text-xs">{q.ref}</td>
                                <td className="py-3 px-4 font-black text-slate-900 uppercase">
                                    <div className="flex items-center gap-1.5">
                                        <span>{q.party}</span>
                                        {q.whatsappSent && (
                                            <span className="text-emerald-500 inline-flex items-center" title="WhatsApp Sent">
                                                <svg className="w-4 h-4 fill-current inline" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">{q.vendor}</div>
                                </td>
                                <td className="py-3 px-4 font-bold text-slate-600 text-xs">{q.staffName}</td>
                                <td className="py-3 px-4 font-mono text-slate-600 text-xs">{q.date}</td>
                                <td className="py-3 px-4 font-mono font-black text-slate-800 text-sm text-right">₹{Number(q.total || 0).toFixed(2)}</td>
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                    <div className="flex items-center justify-center gap-1.5">
                                        <button onClick={(e) => handleViewQuote(e, q)} className="flex items-center gap-1 text-slate-600 hover:text-blue-600 bg-white hover:bg-blue-50 border border-slate-200 px-2.5 py-1.5 rounded transition-colors shadow-sm font-bold" title="View">
                                            <svg className="w-3.5 h-3.5 fill-current inline" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg> VIEW
                                        </button>
                                        <button onClick={(e) => handleEditQuote(e, q)} className="flex items-center gap-1 text-slate-600 hover:text-orange-600 bg-white hover:bg-orange-50 border border-slate-200 px-2.5 py-1.5 rounded transition-colors shadow-sm font-bold" title="Edit">
                                            <svg className="w-3.5 h-3.5 fill-current inline" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg> EDIT
                                        </button>
                                        <button onClick={(e) => handleWhatsAppSend(e, q)} className="flex items-center gap-1 bg-[#25D366] hover:bg-green-600 text-white px-2.5 py-1.5 rounded transition-colors shadow-sm font-bold text-[10px]" title="Send WhatsApp">
                                            <svg className="w-3.5 h-3.5 fill-current inline" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg> WA
                                        </button>
                                        <button onClick={(e) => handleDeleteHistory(e, q.id)} className="flex items-center gap-1 text-slate-600 hover:text-red-600 bg-white hover:bg-red-50 border border-slate-200 px-2 py-1.5 rounded transition-colors shadow-sm font-bold" title="Delete">
                                            <svg className="w-3.5 h-3.5 fill-current inline" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> DEL
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filteredQuotes.length === 0 && (
                            <tr><td colSpan="7" className="text-center py-10 text-slate-400 font-bold italic">No quotations found.</td></tr>
                        )}
                    </tbody>
                </table>

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

            <div className="block md:hidden p-3 space-y-3 bg-slate-50">
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-black uppercase text-slate-700">
                  <input 
                    type="checkbox" 
                    onChange={(e) => {
                        if(e.target.checked) setSelectedQuoteIds(filteredQuotes.map(q => q.id));
                        else setSelectedQuoteIds([]);
                    }} 
                    checked={filteredQuotes.length > 0 && selectedQuoteIds.length === filteredQuotes.length} 
                    className="accent-[#00a67e] w-4 h-4 cursor-pointer" 
                  />
                  <span>Select All ({filteredQuotes.length})</span>
                </label>
                {selectedQuoteIds.length > 0 && (
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                    {selectedQuoteIds.length} Selected
                  </span>
                )}
              </div>

              {paginatedQuotes.length === 0 ? (
                <div className="text-center py-16 text-slate-400 font-bold italic text-xs">
                  No quotations found.
                </div>
              ) : (
                paginatedQuotes.map(q => (
                  <div 
                    key={q.id} 
                    onClick={(e) => handleEditQuote(e, q)}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3 active:scale-[0.99] transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2.5">
                        <input 
                          type="checkbox" 
                          checked={selectedQuoteIds.includes(q.id)} 
                          onChange={(e) => {
                              if (e.target.checked) setSelectedQuoteIds([...selectedQuoteIds, q.id]);
                              else setSelectedQuoteIds(selectedQuoteIds.filter(i => i !== q.id));
                          }} 
                          onClick={(e) => e.stopPropagation()}
                          className="accent-[#00a67e] w-4 h-4 cursor-pointer" 
                        />
                        <span className="font-mono font-black text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{q.ref}</span>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{q.vendor}</span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-black text-slate-900 text-sm uppercase">{q.party}</h4>
                        {q.whatsappSent && (
                          <span className="inline-flex items-center bg-green-100 text-green-700 p-1 rounded" title="WhatsApp Sent">
                            <svg className="w-3.5 h-3.5 fill-current text-green-600 shrink-0 inline" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono font-bold text-slate-500 mt-0.5">Date: {q.date} | By: {q.staffName}</p>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Total Amount</span>
                        <span className="font-mono font-black text-slate-800 text-xs">₹{Number(q.total || 0).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Prepared By</span>
                        <span className="font-bold text-slate-700 text-xs">{q.staffName}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-1 pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                      <button onClick={(e) => handleViewQuote(e, q)} className="flex-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 py-2 px-1 rounded-lg text-[10px] font-black uppercase border border-slate-200 transition-colors text-center flex items-center justify-center gap-1">
                        <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                        View
                      </button>
                      <button onClick={(e) => handleEditQuote(e, q)} className="flex-1 bg-slate-100 hover:bg-orange-50 text-slate-700 hover:text-orange-600 py-2 px-1 rounded-lg text-[10px] font-black uppercase border border-slate-200 transition-colors text-center flex items-center justify-center gap-1">
                        <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                        Edit
                      </button>
                      <button onClick={(e) => handleWhatsAppSend(e, q)} className="flex-1 bg-[#25D366] text-white py-2 px-1 rounded-lg text-[10px] font-black uppercase transition-colors text-center flex items-center justify-center gap-1">
                        <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24">
                          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.764.966-.937 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                        </svg>
                        WA
                      </button>
                      <button onClick={(e) => handleDeleteHistory(e, q.id)} className="bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-2 rounded-lg text-[10px] font-black uppercase border border-red-200 transition-colors flex items-center justify-center gap-1">
                        <svg className="w-3 h-3 fill-current shrink-0" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        Del
                      </button>
                    </div>

                  </div>
                ))
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

      </div>
    </div>
  );
}