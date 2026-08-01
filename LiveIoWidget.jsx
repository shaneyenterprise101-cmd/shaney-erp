import React, { useState, useEffect } from 'react';
import { getIOMetrics, resetIOMetrics } from '../utils/storageMonitor';

export default function LiveIoWidget() {
  const [metrics, setMetrics] = useState(getIOMetrics());
  const [isOpen, setIsOpen] = useState(false);

  // Poll metrics every 1.5 seconds for live mobile feed update
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(getIOMetrics());
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[999999]">
      {!isOpen ? (
        <button 
          onClick={() => setIsOpen(true)}
          className="bg-slate-900 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-full shadow-2xl flex items-center gap-2 text-xs font-black uppercase tracking-wider backdrop-blur-md animate-bounce cursor-pointer">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
          Live I/O Monitor
        </button>
      ) : (
        <div className="bg-slate-900/95 text-white border border-slate-700 w-80 rounded-2xl shadow-2xl p-4 backdrop-blur-xl flex flex-col gap-3 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <h3 className="font-black text-xs uppercase text-emerald-400 flex items-center gap-1.5">
              📊 Project Read/Write Stats
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white font-bold text-lg cursor-pointer">&times;</button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/50">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Reads</span>
              <span className="text-sm font-mono font-black text-blue-400">{metrics.reads} ops</span>
              <span className="text-[9px] text-slate-500 block">{(metrics.totalBytesRead / 1024).toFixed(1)} KB</span>
            </div>

            <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/50">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Writes</span>
              <span className="text-sm font-mono font-black text-amber-400">{metrics.writes} ops</span>
              <span className="text-[9px] text-slate-500 block">{(metrics.totalBytesWritten / 1024).toFixed(1)} KB</span>
            </div>
          </div>

          <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/30 flex justify-between items-center text-xs">
            <span className="font-bold text-slate-300">Storage Footprint:</span>
            <span className="font-mono font-black text-emerald-400">{metrics.totalFootprintKB} KB</span>
          </div>

          <div className="max-h-32 overflow-y-auto custom-scrollbar flex flex-col gap-1 text-[10px] font-mono bg-slate-950 p-2 rounded-lg border border-slate-800">
            <span className="text-slate-500 font-bold uppercase mb-1">Active Keys Breakdown:</span>
            {Object.entries(metrics.keyBreakdown).map(([k, size]) => (
              <div key={k} className="flex justify-between text-slate-300 border-b border-slate-900 pb-0.5">
                <span className="truncate pr-2">{k}</span>
                <span className="text-emerald-400 shrink-0">{size}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-1">
            <span className="text-[9px] text-slate-500">Synced: {metrics.lastUpdated || 'Just now'}</span>
            <button 
              onClick={() => { resetIOMetrics(); setMetrics(getIOMetrics()); }}
              className="bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-red-500/20 cursor-pointer">
              Reset Metrics
            </button>
          </div>
        </div>
      )}
    </div>
  );
}