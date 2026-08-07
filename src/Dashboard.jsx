import React, { useState, useEffect } from 'react';
import Highcharts from 'highcharts';
import highchartsMap from 'highcharts/modules/map';
import gujaratGeoJson from '../gujarat.json';
import { db } from './firebase';
import { collection, getDocs, doc, setDoc, query, orderBy, limit } from 'firebase/firestore';

if (typeof highchartsMap === 'function') {
  highchartsMap(Highcharts);
}

export default function Dashboard({ currentUser, setActiveTab }) {
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    totalCerts: 0,
    activeLeads: 0,
    overdueCount: 0
  });

  const [actionTasks, setActionTasks] = useState([]);
  const [staffActivity, setStaffActivity] = useState([]);
  const [districtData, setDistrictData] = useState([]);
  const [liveFeedLogs, setLiveFeedLogs] = useState([]);
  const [leaderboardData, setLeaderboardData] = useState([]);

  // 🟢 State for District Click Taluka Modal Breakdown
  const [modalDistrict, setModalDistrict] = useState(null);
  const [talukaBreakdown, setTalukaBreakdown] = useState([]);

  // 🟢 State for Activity Box Click Timestamp Popup
  const [selectedActivityInfo, setSelectedActivityInfo] = useState(null);

  // 🟢 Dedicated State for Login Activity Card Dropdown Only
  const role = localStorage.getItem("ERP_Active_Role") || currentUser?.role || "ADMIN";
  const loggedInName = role === "ADMIN" ? "Admin" : (currentUser?.name || (() => {
    try {
      const activeUser = JSON.parse(localStorage.getItem("ERP_Active_Staff_Data") || "{}");
      return activeUser?.name || 'Staff';
    } catch(e) {
      return 'Staff';
    }
  })());

  const [staffList, setStaffList] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("ERP_Staff_Accounts_v1") || localStorage.getItem("ERP_Staff_Accounts_v104") || "[]");
    } catch (e) {
      return [];
    }
  });

  const [loginActivityStaff, setLoginActivityStaff] = useState(() => {
    try {
      const list = JSON.parse(localStorage.getItem("ERP_Staff_Accounts_v1") || localStorage.getItem("ERP_Staff_Accounts_v104") || "[]");
      if (role === "ADMIN") {
        return "ALL";
      }
      return loggedInName.toUpperCase();
    } catch (e) {
      return loggedInName.toUpperCase();
    }
  });

  // 🟢 HEARTBEAT & SESSION PRESENCE TRACKER VIA FIREBASE FIRESTORE (Vercel Ready)
  useEffect(() => {
    if (!loggedInName) return;

    const sendCloudHeartbeat = async () => {
      try {
        const userKey = loggedInName.toLowerCase();
        await setDoc(doc(db, "active_sessions", userKey), {
          username: loggedInName.toUpperCase(),
          lastActive: Date.now(),
          updatedAt: Date.now()
        }, { merge: true });
      } catch (e) {
        try {
          const activeUserId = loggedInName.toLowerCase();
          let activeSessions = JSON.parse(localStorage.getItem("ERP_Active_Sessions_Map") || "{}");
          activeSessions[activeUserId] = Date.now();
          localStorage.setItem("ERP_Active_Sessions_Map", JSON.stringify(activeSessions));
        } catch(err) {}
      }
    };

    sendCloudHeartbeat();
    const interval = setInterval(sendCloudHeartbeat, 20000); // Optimized interval to save writes
    return () => clearInterval(interval);
  }, [loggedInName]);

  const parseIndianDate = (dateStr) => {
    try {
      if (!dateStr) return null;
      if (typeof dateStr !== 'string') return new Date(dateStr);
      if (dateStr.includes('-')) {
        let p = dateStr.split('-');
        if (p[0].length === 4) return new Date(Number(p[0]), Number(p[1]) - 1, Number(p.slice(2, p.length).join('')));
        return new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
      }
      return new Date(dateStr);
    } catch (err) {
      return null;
    }
  };

  const hasBeenRenewed = (currentCert, historyData) => {
    if (!currentCert.validDate || !currentCert.party) return false;
    let currValidObj = parseIndianDate(currentCert.validDate);
    if (!currValidObj || isNaN(currValidObj)) return false;

    return historyData.some(other => {
      if (other.id === currentCert.id) return false;
      if (String(other.party).toLowerCase().trim() !== String(currentCert.party).toLowerCase().trim()) return false;
      if (other.vendor !== currentCert.vendor) return false;

      let otherValidObj = parseIndianDate(other.validDate || other.date);
      if (!otherValidObj || isNaN(otherValidObj)) return false;

      return otherValidObj > currValidObj;
    });
  };

  useEffect(() => {
    const fetchDataAndSessions = async () => {
      try {
        let history = JSON.parse(localStorage.getItem("ERP_History_v104") || "[]");
        let crmData = JSON.parse(localStorage.getItem("ERP_CRM_v9") || "[]");
        const customersData = JSON.parse(localStorage.getItem("ERP_Customers_v104") || "[]");
        
        // 🟢 Pull records from SQLite local database if available via Electron IPC
        if (window.require) {
          try {
            const { ipcRenderer } = window.require('electron');
            if (ipcRenderer) {
              const sqliteRecords = await ipcRenderer.invoke('sqlite-get-records');
              if (sqliteRecords && sqliteRecords.length > 0) {
                history = sqliteRecords.filter(r => r.docType === 'certificate' || r.docType === 'quotation');
                crmData = sqliteRecords.filter(r => r.docType === 'crm');
              }
            }
          } catch(e) {}
        }
        
        const storedStaff = JSON.parse(localStorage.getItem("ERP_Staff_Accounts_v1") || localStorage.getItem("ERP_Staff_Accounts_v104") || "[]");
        setStaffList(storedStaff);

        let onlineMap = {};
        let logsFromCloud = [];
        try {
          // Fetch active sessions from Firestore
          const sessionsSnapshot = await getDocs(collection(db, "active_sessions"));
          const nowTime = Date.now();
          sessionsSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.username && (nowTime - (data.lastActive || 0) < 90000)) {
              onlineMap[data.username.toLowerCase()] = true;
            }
          });

          // Fetch recent office logs from Firestore (Limited to 30 to save reads)
          const qLogs = query(collection(db, "office_logs"), orderBy("id", "desc"), limit(30));
          const logsSnapshot = await getDocs(qLogs);
          logsSnapshot.forEach((docSnap) => {
            logsFromCloud.push(docSnap.data());
          });
        } catch (e) {
          const activeSessions = JSON.parse(localStorage.getItem("ERP_Active_Sessions_Map") || "{}");
          const now = Date.now();
          storedStaff.forEach(st => {
            const uId = String(st.name || st.userid || "").toLowerCase();
            if ((now - (activeSessions[uId] || 0)) < 90000) {
              onlineMap[uId] = true;
            }
          });
          logsFromCloud = JSON.parse(localStorage.getItem("ERP_Office_Live_Logs") || "[]");
        }

        const staffWithStatus = storedStaff.map(st => {
          const uId = String(st.name || st.userid || "").toLowerCase();
          return {
            ...st,
            isOnline: !!onlineMap[uId]
          };
        });

        setStaffActivity(staffWithStatus);
        setLiveFeedLogs(logsFromCloud);

        let rev = 0;
        let certCount = 0;
        let overdueCount = 0;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let tasks = [];
        let districtMap = {};

        // 🏆 AUTOMATIC LEADERBOARD CALCULATION BASED ON "CONFIRMED BY" (staffName)
        const curMonth = today.getMonth();
        const curYear = today.getFullYear();
        let staffSalesMap = {};

        if (gujaratGeoJson && gujaratGeoJson.features) {
          gujaratGeoJson.features.forEach(f => {
            let officialName = f.properties && f.properties.NAME_2;
            if (officialName) {
              districtMap[officialName.toLowerCase()] = {
                originalName: officialName,
                customers: 0,
                leads: 0
              };
            }
          });
        }

        let customerDistrictLookup = {};
        customersData.forEach(cust => {
          if (cust.name && cust.district) {
            customerDistrictLookup[String(cust.name).trim().toLowerCase()] = cust.district;
          }
        });

        let crmDistrictLookup = {};
        crmData.forEach(c => {
          if (c && (c.name || c.party) && c.district) {
            let pName = String(c.name || c.party).trim().toLowerCase();
            crmDistrictLookup[pName] = c.district;
          }
        });

        const addCount = (rawDistrict, type) => {
          if (!rawDistrict) return;
          let clean = String(rawDistrict).trim().toLowerCase();
          if (clean === 'ahmedabad') clean = 'ahmadabad';
          if (clean === 'kutch') clean = 'kachchh';
          if (clean === 'mehsana') clean = 'mahesana';

          let foundKey = Object.keys(districtMap).find(k => k === clean || k.includes(clean) || clean.includes(k));
          if (foundKey) {
            districtMap[foundKey][type] += 1;
          }
        };

        // 🟢 STRICT UNIQUE CERTIFICATE LIST MATCHING CERTIFICATE TAB
        let rawCertList = history.filter(b => {
          if (!b) return false;
          const dType = String(b.docType || 'certificate').toLowerCase();
          return dType === 'certificate' && b.id !== 'certificates' && b.id !== 'products';
        });

        let uniqueCertMap = new Map();
        rawCertList.forEach(item => {
          if (item && item.id != null) {
            uniqueCertMap.set(String(item.id), item);
          }
        });
        let allCertHistory = Array.from(uniqueCertMap.values());

        // 🟢 FILTER ONLY CURRENT MONTH CERTIFICATES FOR METRICS CARDS
        let certHistory = allCertHistory.filter(b => {
          if (!b.date) return false;
          let dObj = parseIndianDate(b.date);
          if (!dObj || isNaN(dObj)) return false;
          return dObj.getMonth() === curMonth && dObj.getFullYear() === curYear;
        });

        certHistory.forEach(b => {
          certCount++;
          let tVal = parseFloat(String(b.total || "0").replace(/,/g, '').replace('₹', '')) || 0;
          rev += tVal;

          let districtFound = b.district;
          if (!districtFound && b.party) {
            let pKey = String(b.party).trim().toLowerCase();
            if (customerDistrictLookup[pKey]) {
              districtFound = customerDistrictLookup[pKey];
            } else if (crmDistrictLookup[pKey]) {
              districtFound = crmDistrictLookup[pKey];
            }
          }

          if (districtFound) {
            addCount(districtFound, 'customers');
          }
        });

        // Leaderboard strictly using 'staffName' (Confirmed By) for current month
        certHistory.forEach(b => {
          if (b.date) {
            let dObj = parseIndianDate(b.date);
            if (dObj && !isNaN(dObj) && dObj.getMonth() === curMonth && dObj.getFullYear() === curYear) {
              let confirmedBy = (b.staffName || b.staff || "ADMIN").toUpperCase().trim();
              let tVal = parseFloat(String(b.total || "0").replace(/,/g, '').replace('₹', '')) || 0;
              if (!staffSalesMap[confirmedBy]) {
                staffSalesMap[confirmedBy] = { name: confirmedBy, totalSales: 0, count: 0 };
              }
              staffSalesMap[confirmedBy].totalSales += tVal;
              staffSalesMap[confirmedBy].count += 1;
            }
          }
        });

        let lbArr = Object.values(staffSalesMap).sort((a, b) => b.totalSales - a.totalSales);
        setLeaderboardData(lbArr);

        let activeLeads = 0;
        if (Array.isArray(crmData)) {
          crmData.forEach(c => {
            if (!c) return;
            if (c.isErpOverdue || (c.id && String(c.id).startsWith('erp_overdue_'))) return;

            if (c.status !== 'Closed' && c.status !== 'Rejected' && !c.isMainErpRecord) {
              activeLeads++;
            }

            if (c.district && c.status !== 'Closed' && c.status !== 'Rejected') {
              addCount(c.district, 'leads');
            }
          });
        }

        allCertHistory.forEach(b => {
          if (!b) return;
          if (b.validDate && !b.reminderDone && !b.neverReturn && !hasBeenRenewed(b, allCertHistory)) {
            let vDateObj = parseIndianDate(b.validDate);
            if (vDateObj && !isNaN(vDateObj.getTime())) {
              vDateObj.setHours(0, 0, 0, 0);
              let diffDays = Math.ceil((vDateObj - today) / (1000 * 60 * 60 * 24));
              if (diffDays <= 0) {
                overdueCount++;
                let isToday = diffDays === 0;
                tasks.push({
                  party: b.party || 'Unknown Client',
                  subText: isToday ? 'Certificate Expiry Today' : 'Certificate Overdue',
                  filterTarget: isToday ? 'TODAY' : 'OVERDUE',
                  badgeColor: isToday ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-red-600 bg-red-50 border-red-200'
                });
              }
            }
          }
        });

        setMetrics({
          totalRevenue: rev,
          totalCerts: certCount,
          activeLeads: activeLeads,
          overdueCount: overdueCount
        });
        setActionTasks(tasks);

        let formattedDistricts = Object.keys(districtMap).map(key => {
          let item = districtMap[key];
          let val = 0;
          if (item.customers > 0) val = 2;
          else if (item.leads > 0) val = 1;

          return {
            name: item.originalName,
            value: val,
            customCustomers: item.customers,
            customLeads: item.leads
          };
        });

        setDistrictData(formattedDistricts);

      } catch (err) {
        console.error("Dashboard Load Error:", err);
      }
    };

    fetchDataAndSessions();
    const pollInterval = setInterval(fetchDataAndSessions, 10000); // 10s poll interval to save reads
    return () => clearInterval(pollInterval);
  }, [currentUser, role, loggedInName]);

  const handleDistrictClick = (districtName) => {
    try {
      const customersData = JSON.parse(localStorage.getItem("ERP_Customers_v104") || "[]");
      const crmData = JSON.parse(localStorage.getItem("ERP_CRM_v9") || "[]");

      let talukaMap = {}; 

      customersData.forEach(cust => {
        let cDist = String(cust.district || "").trim().toLowerCase();
        let targetDist = String(districtName).trim().toLowerCase();
        if (cDist.includes(targetDist) || targetDist.includes(cDist)) {
          let tName = cust.taluka ? String(cust.taluka).trim().toUpperCase() : "GENERAL / UNSPECIFIED";
          if (!talukaMap[tName]) talukaMap[tName] = { customers: 0, leads: 0 };
          talukaMap[tName].customers += 1;
        }
      });

      crmData.forEach(c => {
        if (!c) return;
        let cDist = String(c.district || "").trim().toLowerCase();
        let targetDist = String(districtName).trim().toLowerCase();
        if (cDist.includes(targetDist) || targetDist.includes(cDist)) {
          let tName = c.taluka ? String(c.taluka).trim().toUpperCase() : "GENERAL / UNSPECIFIED";
          if (!talukaMap[tName]) talukaMap[tName] = { customers: 0, leads: 0 };
          talukaMap[tName].leads += 1;
        }
      });

      let breakdownArr = Object.keys(talukaMap).map(t => ({
        taluka: t,
        customers: talukaMap[t].customers,
        leads: talukaMap[t].leads,
        status: (talukaMap[t].customers > 0 || talukaMap[t].leads > 0) ? 'Covered' : 'No Data'
      }));

      setModalDistrict(districtName);
      setTalukaBreakdown(breakdownArr);
    } catch (e) {
      console.error("Taluka breakdown error:", e);
    }
  };

  const goToCrmTabWithFilter = (filterType) => {
    try {
      localStorage.setItem('CRM_PRESET_FILTER', filterType);
      if (setActiveTab) {
        setActiveTab('crm');
      } else {
        window.dispatchEvent(new CustomEvent('ERP_SWITCH_TAB', { detail: { tabId: 'crm' } }));
      }
    } catch (e) {
      console.error("Navigation error:", e);
    }
  };

  const handleQuickAction = (actionTarget) => {
    window.dispatchEvent(new CustomEvent('ERP_SWITCH_TAB', { detail: { tabId: actionTarget } }));
  };

  useEffect(() => {
    let mapChart;

    if (Highcharts && Highcharts.mapChart && document.getElementById('gujaratMapContainer')) {
      try {
        mapChart = Highcharts.mapChart('gujaratMapContainer', {
          chart: { backgroundColor: 'transparent' },
          title: { text: null },
          mapNavigation: {
            enabled: true,
            buttonOptions: { verticalAlign: 'bottom', align: 'left' }
          },
          legend: {
            enabled: true,
            layout: 'vertical',
            align: 'right',
            verticalAlign: 'top',
            floating: true,
            x: 0,
            y: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#cbd5e1',
            borderWidth: 1,
            borderRadius: 6,
            itemStyle: { fontSize: '10px', fontWeight: 'bold', color: '#1e293b' },
            symbolRadius: 50
          },
          colorAxis: {
            dataClassColor: 'category',
            dataClasses: [
              { from: 0, to: 0, color: '#e2e8f0', name: 'No Data' },
              { from: 1, to: 1, color: '#ea580c', name: 'LEADS' },       
              { from: 2, to: 2, color: '#22c55e', name: 'CUSTOMERS' }    
            ]
          },
          plotOptions: {
            map: {
              allAreas: true,
              borderColor: '#94a3b8',
              borderWidth: 0.5,
              cursor: 'pointer',
              states: {
                hover: { color: '#0f172a' }
              },
              point: {
                events: {
                  click: function () {
                    handleDistrictClick(this.name);
                  }
                }
              }
            }
          },
          tooltip: {
            useHTML: true,
            backgroundColor: '#1e293b',
            borderWidth: 0,
            borderRadius: 8,
            shadow: true,
            padding: 10,
            style: { color: '#f8fafc' },
            formatter: function () {
              let customers = this.point.customCustomers || 0;
              let leads = this.point.customLeads || 0;
              let districtName = this.point.name || 'District';
              
              return `
                <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; border-bottom: 1px solid #334155; padding-bottom: 6px; margin-bottom: 6px;">
                  📍 ${districtName} (Click to view Talukas)
                </div>
                <div style="font-size: 12px; line-height: 1.6;">
                  <span style="color: #22c55e; font-size: 14px;">●</span> <b>Customers:</b> <span style="color: #fff">${customers}</span><br/>
                  <span style="color: #ea580c; font-size: 14px;">●</span> <b>Active Leads:</b> <span style="color: #fff">${leads}</span>
                </div>
              `;
            }
          },
          series: [{
            data: districtData,
            mapData: gujaratGeoJson,
            joinBy: ['NAME_2', 'name'],
            name: 'District Performance',
            dataLabels: {
              enabled: true,
              format: '{point.name}',
              style: { fontSize: '8px', fontWeight: 'bold', color: '#1e293b', textOutline: 'none' }
            }
          }],
          credits: { enabled: false }
        });
      } catch (e) {
        console.error("Highcharts Map render error:", e);
      }
    }

    return () => {
      if (mapChart) mapChart.destroy();
    };

  }, [districtData]);

  return (
    <div className="animate-[fadeIn_0.3s_ease-in-out]">
      {/* 👋 WELCOME BANNER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <svg className="w-6 h-6 text-indigo-600 inline-block" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Welcome back, <span className="text-indigo-600 uppercase">{loggedInName}</span>!
          </h1>
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">
            Here is your business summary today (Current Month)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-left sm:text-right bg-white px-4 py-2.5 rounded-xl shadow-sm border border-slate-200 flex items-center gap-3">
            <div>
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Today's Date</div>
              <div className="text-[13px] font-bold text-slate-700">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
            </div>
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
          </div>
        </div>
      </div>

      {/* 📈 TOP METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl p-5 text-white shadow-sm relative overflow-hidden">
          <div className="absolute -right-2 -top-2 text-white/20 text-6xl select-none">
            <svg className="w-16 h-16 text-white/20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-indigo-100 mb-1 relative z-10">Current Month Revenue</div>
          <div className="text-2xl font-black relative z-10">{role === "STAFF" ? "₹ ***" : `₹ ${metrics.totalRevenue.toLocaleString('en-IN')}`}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden hover:shadow-md transition-shadow">
          <div className="absolute -right-2 -top-2 text-slate-50 text-6xl select-none">
            <svg className="w-16 h-16 text-slate-100" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 relative z-10">Total Certificates</div>
          <div className="text-2xl font-black text-slate-700 relative z-10">{metrics.totalCerts}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden hover:shadow-md transition-shadow">
          <div className="absolute -right-2 -top-2 text-emerald-50 text-6xl select-none">
            <svg className="w-16 h-16 text-emerald-100" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 relative z-10">Active Leads</div>
          <div className="text-2xl font-black text-emerald-600 relative z-10">{metrics.activeLeads}</div>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 shadow-sm relative overflow-hidden hover:shadow-md transition-shadow">
          <div className="absolute -right-2 -top-2 text-red-100/50 text-6xl select-none">
            <svg className="w-16 h-16 text-red-200" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-1 relative z-10">Overdue Reminders</div>
          <div className="text-2xl font-black text-red-600 relative z-10">{metrics.overdueCount}</div>
        </div>
      </div>

      {/* 🚀 3-COLUMN DASHBOARD GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              QUICK ACTIONS
            </h3>
            <div className="space-y-2">
              <button 
                type="button"
                onClick={() => handleQuickAction('certificate-create')}
                className="w-full flex items-center justify-between p-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-bold text-[10px] transition-colors border border-indigo-100 uppercase tracking-wider cursor-pointer">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  CREATE CERTIFICATE
                </span>
                <span>&rarr;</span>
              </button>

              <button 
                type="button"
                onClick={() => handleQuickAction('quotation-create')}
                className="w-full flex items-center justify-between p-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl font-bold text-[10px] transition-colors border border-blue-100 uppercase tracking-wider cursor-pointer">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
                  CREATE QUOTATION
                </span>
                <span>&rarr;</span>
              </button>

              <button 
                type="button"
                onClick={() => handleQuickAction('crm')}
                className="w-full flex items-center justify-between p-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl font-bold text-[10px] transition-colors border border-emerald-100 uppercase tracking-wider cursor-pointer">
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
                  ADD CRM LEAD
                </span>
                <span>&rarr;</span>
              </button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 shrink-0">
              <div>
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block animate-pulse"></span>
                  Action Center
                </h3>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Today & Overdue tasks</p>
              </div>
              <span className="text-[9px] font-black bg-slate-100 text-slate-600 px-2 py-1 rounded-lg uppercase">
                {Array.isArray(actionTasks) && actionTasks.length > 0 ? `${actionTasks.length} PENDING` : '0 PENDING'}
              </span>
            </div>
            <div className="space-y-2.5 overflow-y-auto pr-1 custom-scrollbar" style={{ maxHeight: '280px' }}>
              {!Array.isArray(actionTasks) || actionTasks.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic text-center py-6">No overdue tasks pending.</p>
              ) : (
                actionTasks.map((task, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-slate-100 bg-amber-50/40 flex items-center justify-between gap-3 shadow-sm hover:border-slate-300 transition-all">
                    <div className="flex flex-col min-w-0 flex-1">
                      <h4 className="font-black text-slate-800 text-xs uppercase truncate">{task.party}</h4>
                      <span className={`text-[9px] font-black uppercase mt-1 px-1.5 py-0.5 rounded border inline-block w-max ${task.badgeColor}`}>
                        {task.subText}
                      </span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => goToCrmTabWithFilter(task.filterTarget)}
                      className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase shadow-sm flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                    >
                      <span>Go</span>
                      <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                {role === 'ADMIN' ? 'Online Active Staff' : 'My Session Status'}
              </h3>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">Live active presence monitor</p>
            </div>
            <div className="space-y-2.5" style={{ maxHeight: '250px', overflowY: 'auto' }}>
               {role === 'ADMIN' ? (
                 (() => {
                   const onlineStaffOnly = Array.isArray(staffActivity) ? staffActivity.filter(st => st.isOnline) : [];
                   if (onlineStaffOnly.length === 0) {
                     return <p className="text-[10px] text-slate-400 italic text-center py-4">No staff currently online.</p>;
                   }
                   return onlineStaffOnly.map((st, idx) => {
                     const staffName = st.name || st.userid || 'Staff';
                     return (
                       <div key={idx} className="flex items-center justify-between bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-200">
                         <span className="text-xs font-black text-slate-800 uppercase">{staffName}</span>
                         <span className="text-[9px] font-bold text-emerald-700 bg-white px-2.5 py-0.5 rounded-full border border-emerald-300 uppercase flex items-center gap-1.5 shadow-sm">
                           <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                           Online
                         </span>
                       </div>
                     );
                   });
                 })()
               ) : (
                 <div className="flex items-center justify-between bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-200">
                   <span className="text-xs font-black text-slate-800 uppercase">{loggedInName}</span>
                   <span className="text-[9px] font-bold text-emerald-700 bg-white px-2.5 py-0.5 rounded-full border border-emerald-300 uppercase flex items-center gap-1.5 shadow-sm">
                     <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                     Online
                   </span>
                 </div>
               )}
            </div>
          </div>

          {/* 🏆 THIS MONTH'S CONFIRMED BY LEADERBOARD BOX */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="border-b border-slate-100 pb-3 mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">THIS MONTH'S LEADERBOARD (CONFIRMED BY)</h3>
            </div>
            <div className="space-y-2.5 max-h-[220px] overflow-y-auto custom-scrollbar">
              {leaderboardData.length === 0 ? (
                <div className="text-center py-6 text-[10px] text-slate-400 italic">
                  No sales recorded by staff this month.
                </div>
              ) : (
                leaderboardData.map((staff, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 font-black text-[10px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-black text-slate-800 uppercase">{staff.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black font-mono text-emerald-600">₹{staff.totalSales.toLocaleString('en-IN')}</div>
                      <div className="text-[9px] font-bold text-slate-400">{staff.count} Certs</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mt-2">
            <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-2">
              <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                <span className="animate-pulse w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span> Live Office Feed & Action Tracker
              </h3>
            </div>
            <div id="realtimeLiveFeed" className="flex flex-col gap-2 h-48 overflow-y-auto custom-scrollbar">
              {liveFeedLogs.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic text-center mt-5">System operating normally on low-bandwidth optimized cache.</p>
              ) : (
                liveFeedLogs.map((log, lIdx) => (
                  <div key={lIdx} className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-xs flex justify-between items-center">
                    <span className="font-bold text-slate-800 uppercase">⚡ {log.action}</span>
                    <span className="text-[10px] font-mono text-slate-500">{log.time}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
                  Gujarat Geographical Performance
                </h3>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Click any district to view Taluka Breakdown</p>
              </div>
              <button onClick={() => window.location.reload()} className="text-[9px] font-black uppercase text-teal-600 bg-teal-50 border border-teal-100 rounded-lg px-2 py-1 hover:bg-teal-100 transition-colors cursor-pointer">Sync Data</button>
            </div>
            <div style={{ width: '100%', height: '380px' }} id="gujaratMapContainer"></div>
          </div>

          {/* ⏱️ REAL LOGIN ACTIVITY HEATMAP GRID */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  LOGIN & LOGOUT TIMESTAMPS MONITOR
                </h3>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Date-wise and exact hour-wise activity matrix (Click green box for timestamps)</p>
              </div>

              {/* 🟢 INDEPENDENT STAFF SELECT DROPDOWN FOR LOGIN ACTIVITY ONLY */}
              <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-2">
                <div className="relative flex items-center">
                  <select 
                    value={loginActivityStaff}
                    onChange={(e) => setLoginActivityStaff(e.target.value)}
                    className="bg-white border border-slate-300 text-slate-800 font-black text-xs px-2.5 py-1 pr-7 rounded-lg outline-none cursor-pointer uppercase shadow-sm appearance-none"
                  >
                    <option value="ALL">ALL STAFF</option>
                    {staffList.map((st, idx) => {
                      let sName = String(st.name || st.userid || st.username || st).toUpperCase();
                      return (
                        <option key={idx} value={sName}>
                          {sName}
                        </option>
                      );
                    })}
                  </select>
                  <svg className="w-3.5 h-3.5 text-slate-500 absolute right-2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar pb-2">
              <div className="min-w-[700px]">
                
                {/* Header Dynamic Dates Row (1 to 31) */}
                <div className="flex mb-2 pl-16">
                  {(() => {
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = now.getMonth();
                    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
                    
                    let daysArr = [];
                    for (let i = 1; i <= totalDaysInMonth; i++) {
                      daysArr.push(String(i).padStart(2, '0'));
                    }
                    return daysArr.map((dateStr, idx) => (
                      <div key={idx} className="flex-1 text-center text-[10px] font-bold text-slate-400">
                        {dateStr}
                      </div>
                    ));
                  })()}
                </div>

                {/* Rows for Hours (00 to 23 / 12 AM to 11 PM) */}
                <div className="space-y-1.5">
                  {['12 AM', '01 AM', '02 AM', '03 AM', '04 AM', '05 AM', '06 AM', '07 AM', '08 AM', '09 AM', '10 AM', '11 AM', '12 PM', '01 PM', '02 PM', '03 PM', '04 PM', '05 PM', '06 PM', '07 PM', '08 PM', '09 PM', '10 PM', '11 PM'].map((hourLabel, hIdx) => (
                    <div key={hIdx} className="flex items-center">
                      <div className="w-16 text-[10px] font-bold text-slate-400 pr-2 text-right uppercase">
                        {hourLabel}
                      </div>

                      <div className="flex-1 flex gap-1">
                        {(() => {
                          const now = new Date();
                          const year = now.getFullYear();
                          const month = now.getMonth();
                          const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

                          return Array.from({ length: totalDaysInMonth }).map((_, dIdx) => {
                            const dayNum = String(dIdx + 1).padStart(2, '0');
                            const monthNum = String(month + 1).padStart(2, '0');
                            const targetDateStr = `${dayNum}/${monthNum}/${year}`;

                            const realLogs = JSON.parse(localStorage.getItem("ERP_Real_Login_Logs") || "[]");
                            const matchedLog = realLogs.find(l => {
                              const matchesUser = loginActivityStaff === 'ALL' || l.user === loginActivityStaff;
                              const matchesDate = l.date === targetDateStr;
                              const matchesHour = l.hour === hIdx;
                              return matchesUser && matchesDate && matchesHour;
                            });

                            const isActive = !!matchedLog;
                            
                            return (
                              <div 
                                key={dIdx} 
                                onClick={() => {
                                  if (isActive && matchedLog) {
                                    setSelectedActivityInfo({
                                      date: matchedLog.date,
                                      hour: hourLabel,
                                      loginTime: matchedLog.loginTime,
                                      logoutTime: matchedLog.logoutTime,
                                      user: matchedLog.user
                                    });
                                  }
                                }}
                                className={`flex-1 h-5 rounded-[4px] transition-all ${isActive ? 'bg-emerald-500 shadow-sm cursor-pointer hover:bg-emerald-600 hover:scale-110' : 'bg-slate-100'}`}
                                title={isActive ? `${matchedLog.user} logged in at ${matchedLog.loginTime} on ${targetDateStr}` : ''}
                              ></div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            </div>

            <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-slate-100">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">{loginActivityStaff}</span>
            </div>
          </div>

        </div>
      </div>

      {/* 🟢 TIMESTAMP POPUP MODAL WHEN CLICKING GREEN BOX */}
      {selectedActivityInfo && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-in-out]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200">
            <div className="bg-emerald-600 text-white px-5 py-4 flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>
                Session Timestamps
              </h3>
              <button 
                onClick={() => setSelectedActivityInfo(null)}
                className="text-emerald-100 hover:text-white text-xl font-black cursor-pointer"
              >
                &times;
              </button>
            </div>
            
            <div className="p-5 space-y-3 text-slate-700">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">User / Staff</span>
                <span className="text-xs font-black text-slate-800 uppercase">{selectedActivityInfo.user}</span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Date / Slot</span>
                <span className="text-xs font-black text-slate-800">Slot Hour: {selectedActivityInfo.hour} ({selectedActivityInfo.date})</span>
              </div>

              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest block">Login Timestamp</span>
                <span className="text-xs font-black text-emerald-800">{selectedActivityInfo.loginTime}</span>
              </div>

              <div className="bg-orange-50 p-3 rounded-xl border border-orange-200">
                <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest block">Logout Status</span>
                <span className="text-xs font-black text-orange-800">{selectedActivityInfo.logoutTime}</span>
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex justify-end">
              <button 
                onClick={() => setSelectedActivityInfo(null)}
                className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 TALUKA BREAKDOWN MODAL POPUP ON DISTRICT CLICK */}
      {modalDistrict && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-in-out]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black uppercase tracking-wider flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-white inline-block" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  {modalDistrict} District
                </h3>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Taluka-wise Customer & Lead Analysis</p>
              </div>
              <button 
                onClick={() => setModalDistrict(null)}
                className="text-slate-400 hover:text-white text-xl font-black bg-slate-800 hover:bg-slate-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer"
              >
                &times;
              </button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-3">
              {talukaBreakdown.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-8">No taluka data found for this district.</p>
              ) : (
                talukaBreakdown.map((item, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between gap-4 shadow-sm hover:border-slate-300 transition-all">
                    <div>
                      <h4 className="font-black text-slate-800 text-xs uppercase">{item.taluka}</h4>
                      <span className={`text-[9px] font-black uppercase mt-1 px-2 py-0.5 rounded inline-block ${item.status === 'Covered' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-200 text-slate-600'}`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-right">
                      <div className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                        <div className="text-[9px] font-black text-emerald-600 uppercase">Customers</div>
                        <div className="text-sm font-black text-emerald-700">{item.customers}</div>
                      </div>
                      <div className="bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-lg">
                        <div className="text-[9px] font-black text-orange-600 uppercase">Leads</div>
                        <div className="text-sm font-black text-orange-700">{item.leads}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
              <button 
                onClick={() => setModalDistrict(null)}
                className="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}