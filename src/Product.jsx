import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { SyncManager } from './SyncManager';

const BACKEND_URL = "https://shaney-erp-backend.onrender.com";

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

export default function Product() {
  const [firms, setFirms] = useState(() => {
    const saved = SyncManager.getLocalData('ERP_Companies_v104', []);
    return saved.filter(f => f.type === 'quotation');
  });

  const [products, setProducts] = useState(() => {
    const saved = SyncManager.getLocalData('ERP_Products_v104', []);
    return saved
      .filter(item => item && item.description && String(item.description).trim() !== '' && item.id !== 'products')
      .map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
  });

  const hasFetchedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    async function initProducts() {
      if (hasFetchedRef.current) return;
      hasFetchedRef.current = true;

      try {
        const freshData = await SyncManager.fetchFreshDataIfNeeded('ERP_Products_v104', 'products');
        if (isMounted && Array.isArray(freshData)) {
          const prodsOnly = freshData.filter(b => b && b.description && String(b.description).trim() !== '' && b.id !== 'products');
          const mapped = prodsOnly.map(item => (!item.updatedAt ? { ...item, updatedAt: Date.now() } : item));
          setProducts(mapped);
        }
      } catch (err) {
        console.error("Init product fetch error:", err);
      }
    }
    initProducts();

    const handleDataUpdate = (e) => {
      if (!e.detail || e.detail.type === 'products' || e.detail.type === 'all' || e.detail.type === 'settings') {
        const saved = SyncManager.getLocalData('ERP_Products_v104', []);
        if (isMounted) {
          const prodsOnly = saved.filter(b => b && b.description && String(b.description).trim() !== '' && b.id !== 'products');
          setProducts(prodsOnly);
        }
        const savedFirms = SyncManager.getLocalData('ERP_Companies_v104', []);
        if (savedFirms) {
          setFirms(savedFirms.filter(f => f.type === 'quotation'));
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
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // Import States
  const [isSyncing, setIsSyncing] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [rawExcelData, setRawExcelData] = useState([]);
  const [excelColumns, setExcelColumns] = useState([]);

  const [description, setDescription] = useState('');
  const [hsn, setHsn] = useState('8424');
  const [rates, setRates] = useState({});
  const [editingProductId, setEditingProductId] = useState(null);

  const handleRateChange = (firmId, val) => {
    setRates({ ...rates, [firmId]: val });
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      alert('Item description is required!');
      return;
    }

    let cleanRates = {};
    firms.forEach(f => {
      if (rates[f.id] !== undefined && rates[f.id] !== '' && rates[f.id] !== null) {
        cleanRates[f.id] = rates[f.id];
      }
    });

    const currentTimestamp = Date.now();
    let prodObj = null;

    if (editingProductId) {
      prodObj = {
        id: editingProductId,
        docType: 'product',
        description: description.trim(),
        hsn: hsn.trim(),
        rates: cleanRates,
        updatedAt: currentTimestamp
      };
      await SyncManager.saveData('ERP_Products_v104', 'products', prodObj);
      setEditingProductId(null);
      logActionToBackend(`Updated Product: ${prodObj.description}`);
      alert('✅ Item Updated Successfully!');
    } else {
      prodObj = {
        id: 'prod_' + Date.now(),
        docType: 'product',
        description: description.trim(),
        hsn: hsn.trim(),
        rates: cleanRates,
        updatedAt: currentTimestamp
      };
      await SyncManager.saveData('ERP_Products_v104', 'products', prodObj);
      logActionToBackend(`Created Product: ${prodObj.description}`);
      alert('✅ Item Saved Successfully!');
    }

    const saved = SyncManager.getLocalData('ERP_Products_v104', []);
    setProducts(saved.filter(b => b && b.description && String(b.description).trim() !== '' && b.id !== 'products'));

    setDescription('');
    setHsn('8424');
    setRates({});
  };

  const handleEditProduct = (prod) => {
    setEditingProductId(prod.id);
    setDescription(prod.description || '');
    setHsn(prod.hsn || '8424');
    setRates(prod.rates || {});
  };

  const handleDeleteProduct = async (e, id) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this item?')) {
      await SyncManager.deleteData('ERP_Products_v104', 'products', id);
      
      const saved = SyncManager.getLocalData('ERP_Products_v104', []);
      setProducts(saved.filter(b => b && b.description && String(b.description).trim() !== '' && b.id !== 'products'));
      setSelectedProductIds(selectedProductIds.filter(i => i !== id));
      logActionToBackend(`Deleted Product ID: ${id}`);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedProductIds.length === 0) return alert('Please select at least one item to delete!');
    if (confirm(`Are you sure you want to delete ${selectedProductIds.length} selected item(s)?`)) {
      for (let id of selectedProductIds) {
        await SyncManager.deleteData('ERP_Products_v104', 'products', id);
      }
      const saved = SyncManager.getLocalData('ERP_Products_v104', []);
      setProducts(saved.filter(b => b && b.description && String(b.description).trim() !== '' && b.id !== 'products'));
      setSelectedProductIds([]);
      logActionToBackend(`Deleted multiple products from inventory`);
    }
  };

  // 🟢 SMART IMPORT FUNCTIONS
  const downloadSampleProductExcel = () => {
    let sampleObj = {
      "Description": "ABC Fire Extinguisher 6Kg",
      "HSN": "8424"
    };
    firms.forEach(f => {
      sampleObj[f.name] = 2250;
    });

    const worksheet = XLSX.utils.json_to_sheet([sampleObj]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Product_Sample");
    XLSX.writeFile(workbook, "Product_Import_Sample.xlsx");
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

  const confirmProductImport = async () => {
    setIsSyncing(true);
    setImportProgress({ current: 0, total: rawExcelData.length });

    try {
      let currentProducts = [...products];
      let newProductItems = [];
      let importedCount = 0;
      let skippedCount = 0;
      const currentTimestamp = Date.now();

      const existingDesc = new Set(currentProducts.map(p => String(p.description).trim().toLowerCase()));

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

        const desc = findVal(['Description', 'Item Description', 'Item', 'Product', 'Name']);
        const hsnVal = findVal(['HSN', 'HSN Code']) || '8424';

        if (desc) {
          const cleanDesc = String(desc).trim().toLowerCase();
          
          if (!existingDesc.has(cleanDesc)) {
            let itemRates = {};
            firms.forEach(f => {
              const rVal = findVal([f.name, f.id, f.name.toLowerCase()]);
              if (rVal !== '' && rVal !== undefined) {
                itemRates[f.id] = rVal;
              }
            });

            const prodObj = {
              id: 'prod_imp_' + Date.now() + '_' + idx,
              docType: 'product',
              description: String(desc).trim(),
              hsn: String(hsnVal).trim(),
              rates: itemRates,
              updatedAt: currentTimestamp
            };
            currentProducts.push(prodObj);
            newProductItems.push(prodObj);
            existingDesc.add(cleanDesc);
            importedCount++;
          } else {
            skippedCount++;
          }
        }
      });

      setProducts(currentProducts);
      const allLocal = SyncManager.getLocalData('ERP_Products_v104', []);
      const nonProds = allLocal.filter(item => !item || !item.description || item.id === 'products');
      localStorage.setItem('ERP_Products_v104', JSON.stringify([...nonProds, ...currentProducts]));

      setImportProgress({ current: 0, total: newProductItems.length });
      let currentSyncedFiles = 0;

      await processInBatchesWithProgress(newProductItems, 1, 1000, async (pItem) => {
        await SyncManager.saveData('ERP_Products_v104', 'products', pItem);
      }, (curr) => {
        currentSyncedFiles = curr;
        setImportProgress({ current: currentSyncedFiles, total: newProductItems.length });
      });

      window.dispatchEvent(new CustomEvent('ERP_DATA_UPDATED', { detail: { type: 'products' } }));
      
      setPreviewModalOpen(false);
      setIsSyncing(false);
      logActionToBackend(`Imported ${importedCount} new products via Excel`);
      alert(`Sync Complete! Added ${importedCount} new products (${skippedCount} duplicate products skipped).`);

    } catch (err) {
      setIsSyncing(false);
      alert('Import Sync Failed: ' + err.message);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = (p.description || '').toLowerCase().includes(searchTerm.toLowerCase()) || (p.hsn || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  }).reverse();

  const totalPages = Math.ceil(filteredProducts.length / rowsPerPage) || 1;
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedProductIds(paginatedProducts.map(p => p.id));
    } else {
      setSelectedProductIds([]);
    }
  };

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
          
          {/* 🟢 FORM SIDE (Balanced width: col-span-5) */}
          <div className="lg:col-span-5 w-full bg-white p-6 md:p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col gap-5">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-1">
              <h3 className="font-black text-sm text-slate-800 uppercase tracking-widest flex items-center gap-2.5">
                <span className={`p-1.5 rounded-lg leading-none ${editingProductId ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                  {editingProductId ? '✏️' : '➕'}
                </span>
                {editingProductId ? 'EDIT PRODUCT' : 'MASTER PRODUCT'}
              </h3>
              {editingProductId && (
                <button 
                  type="button"
                  onClick={() => { setEditingProductId(null); setDescription(''); setHsn('8424'); setRates({}); }}
                  className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-1 rounded-md hover:bg-red-100 transition-colors cursor-pointer uppercase tracking-wider"
                >
                  Cancel
                </button>
              )}
            </div>

            <form onSubmit={handleSaveProduct} className="flex flex-col gap-4.5">
              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5 ml-1">Item Description *</label>
                <input 
                  type="text" 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  className="w-full text-xs font-bold text-slate-800 bg-slate-50/50 border border-slate-200 rounded-xl px-3.5 py-3 outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all shadow-sm" 
                  placeholder="Enter item description..." 
                  required 
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-600 uppercase tracking-widest mb-1.5 ml-1">HSN Code</label>
                <input 
                  type="text" 
                  value={hsn} 
                  onChange={e => setHsn(e.target.value)} 
                  className="w-full text-xs font-black font-mono text-slate-800 bg-slate-50/50 border border-slate-200 rounded-xl px-3.5 py-3 outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all shadow-sm" 
                  placeholder="8424" 
                />
              </div>

              <div className="mt-1">
                <label className="block text-[11px] font-black text-slate-700 uppercase mb-2 tracking-widest ml-1">Firm Rates (Quotation Nodes)</label>
                <div className="flex flex-col gap-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100 shadow-inner max-h-[280px] overflow-y-auto custom-scrollbar">
                  {firms.map(f => (
                    <div key={f.id} className="flex flex-col bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                      <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider truncate mb-1.5">{f.name}</span>
                      <input 
                        type="number" 
                        value={rates[f.id] !== undefined ? rates[f.id] : ''} 
                        onChange={e => handleRateChange(f.id, e.target.value)} 
                        className="w-full font-mono bg-slate-50 font-bold text-xs border border-slate-200 rounded-lg px-2.5 py-2 outline-none focus:bg-white focus:border-indigo-400" 
                        placeholder="0.00" 
                      />
                    </div>
                  ))}
                  {firms.length === 0 && (
                    <p className="text-[11px] text-red-500 font-bold text-center py-2">Koi Quotation firm nahi mili!</p>
                  )}
                </div>
              </div>

              <button 
                type="submit" 
                className={`w-full text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 mt-2 ${editingProductId ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-orange-500/30' : 'bg-gradient-to-r from-[#0f172a] to-slate-800 hover:from-slate-800 hover:to-slate-700 shadow-slate-900/20'}`}
              >
                <svg className="w-4 h-4 fill-current inline" viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
                {editingProductId ? 'Update Item' : 'Save Item'}
              </button>
            </form>
          </div>

          {/* 🟢 INVENTORY SIDE (Balanced width: col-span-7) */}
          <div className="lg:col-span-7 bg-white p-6 md:p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden flex flex-col relative min-h-[600px]">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-5 mb-5 relative">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  onChange={handleSelectAll} 
                  checked={paginatedProducts.length > 0 && selectedProductIds.length === paginatedProducts.length} 
                  className="cursor-pointer w-4 h-4 rounded border-slate-300 accent-[#00a67e]" 
                />
                <h4 className="font-black text-lg text-slate-800 uppercase tracking-wide flex items-center gap-2">
                  📦 INVENTORY
                </h4>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap justify-end w-full sm:w-auto">
                <div className="hidden sm:block relative">
                  <input 
                    type="text" 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    placeholder="Search items..." 
                    className="w-48 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-full py-2.5 pl-10 pr-4 outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 transition-all shadow-sm" 
                  />
                  <svg className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>

                <button type="button" onClick={() => setIsMobileSearchOpen(true)} className="sm:hidden bg-slate-50 hover:bg-slate-100 text-slate-600 p-2.5 rounded-full border border-slate-200 shadow-sm cursor-pointer flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </button>

                <button type="button" onClick={downloadSampleProductExcel} className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-black px-4 py-2.5 rounded-full border border-slate-200 shadow-sm transition-all hover:shadow flex items-center gap-1.5 cursor-pointer uppercase tracking-wider">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> Sample
                </button>

                <label className="bg-[#00a67e] hover:bg-emerald-600 text-white text-xs font-black px-5 py-2.5 rounded-full shadow-md shadow-emerald-500/20 transition-all hover:-translate-y-0.5 flex items-center gap-1.5 cursor-pointer uppercase tracking-wider">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg> Import
                  <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileSelectAndPreview} className="hidden" />
                </label>

                {selectedProductIds.length > 0 && (
                  <button onClick={handleDeleteSelected} className="bg-red-50 hover:bg-red-100 text-red-600 text-xs font-black px-4 py-2.5 rounded-full border border-red-200 shadow-sm transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 uppercase tracking-wider animate-[fadeIn_0.2s_ease-in-out]">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Delete ({selectedProductIds.length})
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
                      placeholder="Search Items..." 
                      className="w-full text-xs font-bold text-slate-700 bg-slate-50 border border-emerald-200 rounded-full py-2.5 pl-10 pr-4 outline-none focus:ring-4 focus:ring-emerald-500/20" 
                    />
                    <svg className="w-4 h-4 text-emerald-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  <button type="button" onClick={() => setIsMobileSearchOpen(false)} className="text-slate-400 hover:text-slate-700 font-black text-2xl px-2 leading-none cursor-pointer">&times;</button>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center py-2 px-1 mb-3 gap-3 shrink-0">
              <span className="text-[11px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                Total <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-2.5 py-0.5 rounded-md text-xs">{filteredProducts.length}</span> Items
              </span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-600 font-bold transition-colors cursor-pointer border border-slate-200 shadow-sm">◀</button>
                <span className="text-[10px] font-black uppercase px-2 text-slate-500 tracking-wider">Pg {currentPage} / {totalPages}</span>
                <button type="button" onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-600 font-bold transition-colors cursor-pointer border border-slate-200 shadow-sm">▶</button>
              </div>
            </div>

            <div className="flex flex-col gap-3 flex-1">
              {paginatedProducts.map((p) => (
                <div 
                  key={p.id} 
                  onClick={() => handleEditProduct(p)}
                  className={`flex items-center justify-between p-4 bg-white border rounded-2xl shadow-sm transition-all gap-4 group cursor-pointer ${editingProductId === p.id ? 'border-amber-400 bg-amber-50/30 ring-4 ring-amber-500/10' : 'border-slate-200 hover:border-emerald-400 hover:shadow-md'}`}
                  title="Click to edit item"
                >
                  <div className="flex items-center gap-3.5">
                    <input 
                      type="checkbox" 
                      checked={selectedProductIds.includes(p.id)} 
                      onChange={(e) => {
                        if (e.target.checked) setSelectedProductIds([...selectedProductIds, p.id]);
                        else setSelectedProductIds(selectedProductIds.filter(id => id !== p.id));
                      }} 
                      onClick={(e) => e.stopPropagation()}
                      className="cursor-pointer w-4 h-4 rounded border-slate-300 accent-[#00a67e]" 
                    />
                    <div>
                      <h4 className="font-black text-slate-900 uppercase text-xs sm:text-sm tracking-wide">{p.description}</h4>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-md">
                          HSN: {p.hsn || '8424'}
                        </span>
                        {Object.entries(p.rates || {}).map(([fKey, r]) => {
                          const fObj = firms.find(x => x.id === fKey);
                          if (!fObj) return null;
                          return r ? <span key={fKey} className="inline-block bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-md text-[10px] font-bold">₹{r} ({fObj.name})</span> : null;
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button onClick={(e) => handleDeleteProduct(e, p.id)} className="text-slate-400 hover:text-white bg-slate-50 hover:bg-red-500 p-2.5 rounded-xl transition-all shadow-sm cursor-pointer" title="Delete">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                  </div>
                </div>
              ))}

              {paginatedProducts.length === 0 && (
                <div className="text-center py-20 text-slate-400 font-bold italic">
                  No items found.
                </div>
              )}
            </div>

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
                Product Excel Import Preview
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
              <button type="button" onClick={confirmProductImport} className="px-8 py-3 rounded-xl font-black uppercase tracking-widest text-white bg-gradient-to-r from-[#00a67e] to-emerald-500 hover:from-emerald-500 hover:to-teal-400 shadow-lg shadow-emerald-500/30 transition-all flex items-center gap-2 text-xs cursor-pointer active:scale-95">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg> CONFIRM & SYNC TO CLOUD
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}