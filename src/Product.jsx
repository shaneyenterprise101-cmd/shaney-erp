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

  const handleDeleteProduct = async (id) => {
    if (confirm('Are you sure you want to delete this item?')) {
      // 🟢 Use SyncManager to delete from Local, SQLite, and Cloud simultaneously
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
        // 🟢 Use SyncManager for bulk deletion across all storage layers
        await SyncManager.deleteData('ERP_Products_v104', 'products', id);
      }
      const saved = SyncManager.getLocalData('ERP_Products_v104', []);
      setProducts(saved.filter(b => b && b.description && String(b.description).trim() !== '' && b.id !== 'products'));
      setSelectedProductIds([]);
      logActionToBackend(`Deleted multiple products from inventory`);
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
    <div className="tab-content active h-[calc(100vh-65px)] w-full relative bg-slate-100 overflow-y-auto custom-scrollbar p-4 md:p-6 animate-[fadeIn_0.3s_ease-in-out]">
      <div className="max-w-7xl mx-auto pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          <div className="lg:col-span-4 w-full bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="font-black text-slate-800 text-sm uppercase mb-6 flex items-center gap-2">
              <svg className="w-4 h-4 fill-current text-blue-600" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              {editingProductId ? 'EDIT PRODUCT' : 'MASTER PRODUCT'}
            </h3>

            <form onSubmit={handleSaveProduct} className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 tracking-wider">Item Description</label>
                <input 
                  type="text" 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  className="pro-input font-bold" 
                  placeholder="Enter item description..." 
                  required 
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 tracking-wider">HSN Code</label>
                <input 
                  type="text" 
                  value={hsn} 
                  onChange={e => setHsn(e.target.value)} 
                  className="pro-input font-mono font-bold" 
                  placeholder="8424" 
                />
              </div>

              <div className="mt-2">
                <label className="block text-[10px] font-black text-slate-700 uppercase mb-2 tracking-widest">Firm Rates (Quotation Nodes)</label>
                <div className="flex flex-col gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {firms.map(f => (
                    <div key={f.id} className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-600 truncate mb-1">{f.name}</span>
                      <input 
                        type="number" 
                        value={rates[f.id] !== undefined ? rates[f.id] : ''} 
                        onChange={e => handleRateChange(f.id, e.target.value)} 
                        className="pro-input font-mono bg-white font-bold text-xs" 
                        placeholder="0.00" 
                      />
                    </div>
                  ))}
                  {firms.length === 0 && (
                    <p className="text-[11px] text-red-500 font-bold text-center py-2">Koi Quotation firm nahi mili!</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                {editingProductId && (
                  <button type="button" onClick={() => { setEditingProductId(null); setDescription(''); setHsn('8424'); setRates({}); }} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all cursor-pointer">
                    Cancel
                  </button>
                )}
                <button type="submit" className="flex-1 bg-[#0f172a] text-white py-3 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-800 transition-all shadow-md flex justify-center items-center gap-2 cursor-pointer">
                  <svg className="w-4 h-4 fill-current inline" viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>
                  {editingProductId ? 'Update Item' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>

          <div className="lg:col-span-8 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
            <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center flex-wrap gap-3 relative">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  onChange={handleSelectAll} 
                  checked={paginatedProducts.length > 0 && selectedProductIds.length === paginatedProducts.length} 
                  className="cursor-pointer w-4 h-4 rounded border-slate-300 accent-[#00a67e]" 
                />
                <h4 className="font-black text-xs text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  📦 INVENTORY
                </h4>
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className="hidden sm:block relative">
                  <input 
                    type="text" 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    placeholder="Search Items..." 
                    className="w-full text-xs py-2 pl-3 pr-9 rounded-lg border border-slate-300 bg-slate-50 outline-none font-medium shadow-inner" 
                  />
                  <svg className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>

                <button type="button" onClick={() => setIsMobileSearchOpen(true)} className="sm:hidden bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl shadow-sm cursor-pointer flex items-center justify-center">
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </button>

                {selectedProductIds.length > 0 && (
                  <button onClick={handleDeleteSelected} className="bg-red-50 hover:bg-red-500 text-red-600 hover:text-white border border-red-200 px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all shadow-sm flex items-center gap-1.5 cursor-pointer">
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> Delete ({selectedProductIds.length})
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center py-2.5 px-4 bg-slate-50 border-b border-slate-200 gap-2 shrink-0">
              <span className="text-[10px] font-black uppercase text-slate-600 tracking-wider">
                Total <span className="font-mono text-indigo-600">{filteredProducts.length}</span> Items Found
              </span>
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                <button type="button" onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-2.5 py-1 rounded font-bold text-xs hover:bg-slate-100 disabled:opacity-30 text-slate-600 cursor-pointer">◀</button>
                <span className="text-[10px] font-black uppercase px-2 text-slate-500 whitespace-nowrap">Pg {currentPage}/{totalPages}</span>
                <button type="button" onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-2.5 py-1 rounded font-bold text-xs hover:bg-slate-100 disabled:opacity-30 text-slate-600 cursor-pointer">▶</button>
              </div>
            </div>

            <div className="p-4 flex flex-col gap-3 bg-slate-50/50 min-h-[300px] flex-1">
              {paginatedProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-slate-300 transition-all gap-4">
                  <div className="flex items-center gap-3.5">
                    <input 
                      type="checkbox" 
                      checked={selectedProductIds.includes(p.id)} 
                      onChange={(e) => {
                        if (e.target.checked) setSelectedProductIds([...selectedProductIds, p.id]);
                        else setSelectedProductIds(selectedProductIds.filter(id => id !== p.id));
                      }} 
                      className="cursor-pointer w-4 h-4 rounded border-slate-300 accent-[#00a67e]" 
                    />
                    <div>
                      <h4 className="font-black text-slate-900 uppercase text-xs sm:text-sm">{p.description}</h4>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="inline-block bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md">
                          HSN: {p.hsn || '8424'}
                        </span>
                        {Object.entries(p.rates || {}).map(([fKey, r]) => {
                          const fObj = firms.find(x => x.id === fKey);
                          if (!fObj) return null;
                          return r ? <span key={fKey} className="inline-block bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-bold">₹{r} ({fObj.name})</span> : null;
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleEditProduct(p)} className="text-slate-600 hover:text-orange-600 bg-slate-50 hover:bg-orange-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1 cursor-pointer" title="Edit">
                      ✏️ <span className="hidden sm:inline">Edit</span>
                    </button>
                    <button onClick={() => handleDeleteProduct(p.id)} className="text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 border border-slate-200 p-2 rounded-lg transition-colors shadow-sm cursor-pointer" title="Delete">
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                  </div>
                </div>
              ))}

              {paginatedProducts.length === 0 && (
                <div className="text-center py-16 text-slate-400 font-bold italic">
                  No items found.
                </div>
              )}
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}