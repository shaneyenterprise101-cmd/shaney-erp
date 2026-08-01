import React, { useState, useEffect } from 'react';
import { db } from './firebase'; // 👈 Firebase instance imported
import { doc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

export default function Product() {
  const [firms, setFirms] = useState(() => {
    const saved = localStorage.getItem('ERP_Companies_v104');
    return saved ? JSON.parse(saved).filter(f => f.type === 'certificate') : [];
  });

  const [products, setProducts] = useState(() => {
    const saved = localStorage.getItem('ERP_Products_v104');
    return saved ? JSON.parse(saved) : [];
  });

  // 🟢 REAL-TIME LIVE SYNC LISTENER (App.jsx broadcast catcher)
  useEffect(() => {
    const handleDataUpdate = (e) => {
      if (!e.detail || e.detail.type === 'products') {
        const saved = localStorage.getItem('ERP_Products_v104');
        if (saved) {
          setProducts(JSON.parse(saved));
        }
      }
    };
    window.addEventListener('ERP_DATA_UPDATED', handleDataUpdate);
    return () => window.removeEventListener('ERP_DATA_UPDATED', handleDataUpdate);
  }, []);

  // 🟢 Fetch products from Firebase Cloud on load
  useEffect(() => {
    const fetchCloudProducts = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "products"));
        const cloudProducts = [];
        querySnapshot.forEach((docSnap) => {
          cloudProducts.push(docSnap.data());
        });
        if (cloudProducts.length > 0) {
          setProducts(cloudProducts);
          localStorage.setItem('ERP_Products_v104', JSON.stringify(cloudProducts));
        }
      } catch (err) {
        console.error("Error fetching products from cloud:", err);
      }
    };
    fetchCloudProducts();
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState([]);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  // Mobile Floating Search State
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // Form states
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

    const currentTimestamp = Date.now();
    let prodObj = null;

    if (editingProductId) {
      prodObj = {
        id: editingProductId,
        docType: 'product',
        description: description.trim(),
        hsn: hsn.trim(),
        rates,
        updatedAt: currentTimestamp // 🟢 Timestamp update
      };
      const updated = products.map(p => p.id === editingProductId ? prodObj : p);
      setProducts(updated);
      localStorage.setItem('ERP_Products_v104', JSON.stringify(updated));
      setEditingProductId(null);
      alert('✅ Item Updated Successfully!');
    } else {
      prodObj = {
        id: 'prod_' + Date.now(),
        docType: 'product',
        description: description.trim(),
        hsn: hsn.trim(),
        rates,
        updatedAt: currentTimestamp // 🟢 Timestamp create
      };
      const updated = [...products, prodObj];
      setProducts(updated);
      localStorage.setItem('ERP_Products_v104', JSON.stringify(updated));
      alert('✅ Item Saved Successfully!');
    }

    // 🟢 Save to Firebase Cloud & SQLite IPC
    try {
      if (prodObj) {
        await setDoc(doc(db, "products", String(prodObj.id)), prodObj);
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', prodObj);
        }
      }
    } catch (err) {
      console.error("Firebase product save error:", err);
    }

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
      const updated = products.filter(p => p.id !== id);
      setProducts(updated);
      localStorage.setItem('ERP_Products_v104', JSON.stringify(updated));
      setSelectedProductIds(selectedProductIds.filter(i => i !== id));

      try {
        await deleteDoc(doc(db, "products", String(id)));
        if (window.require) {
          const { ipcRenderer } = window.require('electron');
          if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', { id, deleted: true, updatedAt: Date.now() });
        }
      } catch (err) {
        console.error("Firebase product delete error:", err);
      }
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedProductIds.length === 0) return alert('Please select at least one item to delete!');
    if (confirm(`Are you sure you want to delete ${selectedProductIds.length} selected item(s)?`)) {
      const updated = products.filter(p => !selectedProductIds.includes(p.id));
      setProducts(updated);
      localStorage.setItem('ERP_Products_v104', JSON.stringify(updated));

      for (let id of selectedProductIds) {
        try {
          await deleteDoc(doc(db, "products", String(id)));
          if (window.require) {
            const { ipcRenderer } = window.require('electron');
            if (ipcRenderer) await ipcRenderer.invoke('sqlite-save-record', { id, deleted: true, updatedAt: Date.now() });
          }
        } catch (err) {
          console.error("Firebase product delete error:", err);
        }
      }

      setSelectedProductIds([]);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = (p.description || '').toLowerCase().includes(searchTerm.toLowerCase()) || (p.hsn || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  }).reverse();

  // Pagination Logic
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
    <div className="animate-[fadeIn_0.3s_ease-in-out] w-full max-w-full pb-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT FORM PANEL */}
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
                      value={rates[f.id] || ''} 
                      onChange={e => handleRateChange(f.id, e.target.value)} 
                      className="pro-input font-mono bg-white font-bold text-xs" 
                      placeholder="0.00" 
                    />
                  </div>
                ))}
                {firms.length === 0 && (
                  <p className="text-[11px] text-red-500 font-bold text-center py-2">Koi Certificate firm nahi mili! Pehle Settings mein Certificate Firm banayein.</p>
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

        {/* RIGHT INVENTORY CARD LIST PANEL */}
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
              {/* Desktop Search */}
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

              {/* Mobile Search Button */}
              <button type="button" onClick={() => setIsMobileSearchOpen(true)} className="sm:hidden bg-slate-100 hover:bg-slate-200 text-slate-700 p-2 rounded-xl shadow-sm cursor-pointer flex items-center justify-center">
                <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </button>

              <button className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all shadow-sm flex items-center gap-1.5 cursor-pointer">
                <svg className="w-3.5 h-3.5 fill-current text-blue-600" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg> IMPORT
              </button>

              <button className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all shadow-sm flex items-center gap-1.5 cursor-pointer">
                <svg className="w-3.5 h-3.5 fill-current text-orange-500" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg> Sample
              </button>

              {selectedProductIds.length > 0 && (
                <button onClick={handleDeleteSelected} className="bg-red-50 hover:bg-red-500 text-red-600 hover:text-white border border-red-200 px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all shadow-sm flex items-center gap-1.5 cursor-pointer">
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> Delete ({selectedProductIds.length})
                </button>
              )}
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
                    placeholder="Search Items..." 
                    className="w-full bg-slate-50 font-medium pl-3 pr-9 text-xs py-2 rounded-lg border border-slate-300 outline-none" 
                  />
                  <svg className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <button type="button" onClick={() => setIsMobileSearchOpen(false)} className="text-slate-500 font-black text-2xl px-2 leading-none cursor-pointer">&times;</button>
              </div>
            )}
          </div>

          {/* Pagination & Count Header Tools */}
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

          {/* CARD LIST CONTAINER */}
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
                      {Object.entries(p.rates || {}).map(([fId, r]) => {
                        const fObj = firms.find(x => x.id === fId);
                        return r ? <span key={fId} className="inline-block bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-bold">₹{r} ({fObj ? fObj.name : 'Firm'})</span> : null;
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

          {/* Mobile Pagination Footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white p-3 border-t border-slate-200 shadow-sm sm:hidden shrink-0">
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