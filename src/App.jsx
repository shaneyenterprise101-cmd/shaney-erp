import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { SyncManager } from './SyncManager.js';
import { db, auth } from './firebase'; 
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import Dashboard from './Dashboard.jsx';
import Settings from './Settings.jsx';
import Templates from './Templates.jsx';
import Customer from './Customer.jsx';
import Product from './Product.jsx';
import Certificate from './Certificate.jsx';
import Quotation from './Quotation.jsx';
import Reminder from './Reminder';
import Report from './Report';
import Crm from './Crm.jsx';
import Envelope from './Envelope.jsx'; 
import Sticker from './Sticker.jsx';

import logoImage from './logo.jpg'; 

const BACKEND_URL = "https://shaney-erp-backend.onrender.com";

const getCurrentFY = () => {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  return m >= 4 ? `F.Y. ${y}-${String(y + 1).slice(-2)}` : `F.Y. ${y - 1}-${String(y).slice(-2)}`;
};

export default function App() {
  const path = window.location.pathname;
  const isPreviewRoute = path.includes('/preview/');
  const previewDocId = isPreviewRoute ? path.split('/')[2] : null;

  const [previewDocData, setPreviewDocData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(isPreviewRoute);

  // 🟢 24*7 Real-Time Background Auto Sync (Stops immediately if logged out)
  useEffect(() => {
    const runRealtimeSync = async () => {
      if (!localStorage.getItem("ERP_Active_Role")) return; 
      try {
        if (!window.require) return;
        const { ipcRenderer } = window.require('electron');
        if (!ipcRenderer) return;

        const lastSync = Number(localStorage.getItem('ERP_Last_Sync_Timestamp') || 0);
        
        const deltaRecords = await ipcRenderer.invoke('sqlite-get-delta-records', lastSync);
        for (let rec of deltaRecords) {
           await SyncManager.saveData('ERP_History_v104', 'history', rec);
        }

        localStorage.setItem('ERP_Last_Sync_Timestamp', Date.now());
      } catch (err) {
        console.error("Realtime sync error:", err);
      }
    };

    runRealtimeSync();
    const syncInterval = setInterval(runRealtimeSync, 5000); 
    return () => clearInterval(syncInterval);
  }, []);

  // 🟢 Heartbeat / Online Presence Worker (Stops on logout)
  useEffect(() => {
    if (!localStorage.getItem("ERP_Active_Role")) return;
    const heartbeatInterval = setInterval(() => {
      const activeUser = JSON.parse(localStorage.getItem("ERP_Active_Staff_Data") || "{}");
      if (activeUser?.name) {
        SyncManager.updateHeartbeat(activeUser.name);
      }
    }, 30000); 
    return () => clearInterval(heartbeatInterval);
  }, []);

  useEffect(() => {
    if (isPreviewRoute && previewDocId) {
      const fetchPublicDocument = async () => {
        try {
          const localCert = localStorage.getItem(`shaney_certificate_${previewDocId}`);
          const localQuote = localStorage.getItem(`shaney_quotation_${previewDocId}`);
          
          if (localCert) {
            setPreviewDocData({ type: 'certificate', data: JSON.parse(localCert) });
            setPreviewLoading(false);
            return;
          }
          if (localQuote) {
            setPreviewDocData({ type: 'quotation', data: JSON.parse(localQuote) });
            setPreviewLoading(false);
            return;
          }

          const res = await fetch(`${BACKEND_URL}/api/document/${previewDocId}`);
          if (res.ok) {
            const data = await res.json();
            if (data) {
              setPreviewDocData(data);
              setPreviewLoading(false);
              return;
            }
          }

          setPreviewLoading(false);
        } catch (err) {
          console.error("Public preview fetch error:", err);
          setPreviewLoading(false);
        }
      };
      fetchPublicDocument();
    }
  }, [isPreviewRoute, previewDocId]);

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem("ERP_Active_Role") ? true : false;
  });
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("ERP_Active_Staff_Data");
      return saved ? JSON.parse(saved) : { name: 'Shaney Enterprise', role: 'ADMIN' };
    } catch(e) {
      return { name: 'Shaney Enterprise', role: 'ADMIN' };
    }
  });

  const [loginInput, setLoginInput] = useState({ email: '', password: '' });
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [registerInput, setRegisterInput] = useState({ email: '', password: '', confirmPassword: '' });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const [selectedFY, setSelectedFY] = useState(getCurrentFY());
  const [availableFYs, setAvailableFYs] = useState([]);

  const [certInitialMode, setCertInitialMode] = useState('list');
  const [quoteInitialMode, setQuoteInitialMode] = useState('list');

  const [staffList, setStaffList] = useState(() => {
    return SyncManager.getLocalData('ERP_Staff_Accounts_v1', []);
  });

  const recordCloudLogoutTimestamp = () => {
    try {
      let activeUserName = currentUser?.name || 'ADMIN';
      if (currentUser?.role === 'STAFF') {
        activeUserName = currentUser?.name || 'Staff';
      }
      
      SyncManager.postOfficeLog("Successfully Logged Out from System", activeUserName);

      const activeUserUpper = activeUserName.toUpperCase();
      let allLoginLogs = SyncManager.getLocalData("ERP_Real_Login_Logs", []);

      for (let i = allLoginLogs.length - 1; i >= 0; i--) {
        if (
          (allLoginLogs[i].user === activeUserUpper || allLoginLogs[i].user === 'ADMIN') &&
          (allLoginLogs[i].logoutTime === "Active / Session Live" || !allLoginLogs[i].logoutTime)
        ) {
          allLoginLogs[i].logoutTime = new Date().toLocaleTimeString();
          break;
        }
      }
      localStorage.setItem("ERP_Real_Login_Logs", JSON.stringify(allLoginLogs));
    } catch (e) {
      console.error("Logout timestamp update error:", e);
    }
  };

  const handleLogout = () => {
    recordCloudLogoutTimestamp();
    localStorage.removeItem("ERP_Active_Role");
    localStorage.removeItem("ERP_Active_Staff_Data");
    document.body.classList.remove('staff-logged-in');
    if (auth) {
      auth.signOut().catch(() => {});
    }
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;

    const inactivityTimeout = currentUser.role === 'STAFF' ? 5 * 60 * 1000 : 15 * 60 * 1000;
    let timer;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        recordCloudLogoutTimestamp();
        handleLogout();
        alert(`Session expired due to ${currentUser.role === 'STAFF' ? '5' : '15'} minutes of inactivity. Please login again.`);
      }, inactivityTimeout);
    };

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach(event => window.addEventListener(event, resetTimer));

    resetTimer();

    return () => {
      if (timer) clearTimeout(timer);
      activityEvents.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [isAuthenticated, currentUser]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchCloudStaffOnce = async () => {
      try {
        const cloudStaff = await SyncManager.fetchFreshDataIfNeeded('ERP_Staff_Accounts_v1', 'staff_accounts');
        if (cloudStaff && cloudStaff.length > 0) {
          setStaffList(cloudStaff);
        }
      } catch (err) {
        console.error("Error fetching staff:", err);
      }
    };
    fetchCloudStaffOnce();
  }, [isAuthenticated]);

  const [editingStaffId, setEditingStaffId] = useState(null);

  const [newStaffForm, setNewStaffForm] = useState({
    userid: '',
    name: '',
    phone: '',
    password: '',
    permissions: { Dashboard: true, Certificate: true, Quotation: true, CRM: true, Export: true }
  });

  useEffect(() => {
    const history = SyncManager.getLocalData('ERP_History_v104', []);
    const historyFYs = history.map(item => item.fy).filter(Boolean);
    const currentFY = getCurrentFY();
    const uniqueFYs = Array.from(new Set([...historyFYs, currentFY])).sort().reverse();
    setAvailableFYs(uniqueFYs);
  }, []);

  useEffect(() => {
    const handleGlobalTabSwitch = (e) => {
      if (e.detail && e.detail.tabId) {
        if (e.detail.tabId === 'certificate-create') {
          setActiveTab('certificate');
          setCertInitialMode('create');
        } else if (e.detail.tabId === 'quotation-create') {
          setActiveTab('quotation');
          setQuoteInitialMode('create');
        } else {
          const rawId = e.detail.tabId.replace('tab-', '').replace('-controls', '');
          setActiveTab(rawId);
        }
      }
    };
    window.addEventListener('ERP_SWITCH_TAB', handleGlobalTabSwitch);
    return () => window.removeEventListener('ERP_SWITCH_TAB', handleGlobalTabSwitch);
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'STAFF') {
      document.body.classList.add('staff-logged-in');
    } else {
      document.body.classList.remove('staff-logged-in');
    }
  }, [currentUser]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    const inputVal = loginInput.email.trim();
    const password = loginInput.password.trim();

    if (!inputVal || !password) {
      setErrorMsg('Please enter User ID / Email and Password.');
      return;
    }

    const recordLocalLoginTimestamp = (userName) => {
      try {
        const todayStr = new Date().toLocaleDateString('en-GB'); 
        const currentHour = new Date().getHours(); 
        let allLoginLogs = SyncManager.getLocalData("ERP_Real_Login_Logs", []);

        allLoginLogs.push({
          user: userName.toUpperCase(),
          date: todayStr,
          hour: currentHour,
          loginTime: new Date().toLocaleTimeString(),
          logoutTime: "Active / Session Live"
        });
        localStorage.setItem("ERP_Real_Login_Logs", JSON.stringify(allLoginLogs));
      } catch (e) {
        console.error("Local login timestamp error:", e);
      }
    };

    let currentStaffList = staffList;
    let foundStaff = currentStaffList.find(s => String(s.userid).toLowerCase() === inputVal.toLowerCase() || String(s.name).toLowerCase() === inputVal.toLowerCase());

    if (!foundStaff) {
      try {
        const cloudStaff = await SyncManager.fetchFreshDataIfNeeded('ERP_Staff_Accounts_v1', 'staff_accounts');
        if (cloudStaff && cloudStaff.length > 0) {
          currentStaffList = cloudStaff;
          setStaffList(cloudStaff);
          foundStaff = currentStaffList.find(s => String(s.userid).toLowerCase() === inputVal.toLowerCase() || String(s.name).toLowerCase() === inputVal.toLowerCase());
        }
      } catch (err) {
        console.error("Staff fetch error during login:", err);
      }
    }

    if (foundStaff) {
      if (String(foundStaff.password) === String(password)) {
        const staffUserObj = {
          userid: foundStaff.userid,
          name: foundStaff.name,
          role: 'STAFF',
          phone: foundStaff.phone || '',
          permissions: foundStaff.permissions || { Dashboard: true, Certificate: true, Quotation: true, CRM: true, Export: true }
        };
        setCurrentUser(staffUserObj);
        localStorage.setItem("ERP_Active_Role", "STAFF");
        localStorage.setItem("ERP_Active_Staff_Data", JSON.stringify(staffUserObj));
        recordLocalLoginTimestamp(staffUserObj.name);
        SyncManager.postOfficeLog("Successfully Logged In to System", staffUserObj.name);
        setIsAuthenticated(true);
        return;
      } else {
        setErrorMsg('Incorrect Password for Staff Account!');
        return;
      }
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, inputVal, password);
      const user = userCredential.user;

      const adminUser = { 
        userid: user.email, 
        name: 'Shaney Enterprise', 
        role: 'ADMIN', 
        permissions: { Dashboard: true, Certificate: true, Quotation: true, CRM: true, Export: true } 
      };

      setCurrentUser(adminUser);
      localStorage.setItem("ERP_Active_Role", "ADMIN");
      localStorage.setItem("ERP_Active_Staff_Data", JSON.stringify(adminUser));
      recordLocalLoginTimestamp("ADMIN");
      SyncManager.postOfficeLog("Successfully Logged In to System", "ADMIN");
      setIsAuthenticated(true);
    } catch (err) {
      console.error("Login Error:", err);
      setErrorMsg('Invalid Admin Email or Staff User ID / Password!');
    }
  };

  const handleRestoreBackup = (e) => {
    if (!e.target.files || !e.target.files[0]) return;
    const fileReader = new FileReader();
    fileReader.readAsText(e.target.files[0], "UTF-8");
    fileReader.onload = (event) => {
      try {
        const parsedData = JSON.parse(event.target.result);
        Object.keys(parsedData).forEach(key => {
          localStorage.setItem(key, JSON.stringify(parsedData[key]));
        });

        alert('✅ Data restored successfully! Page will now reload.');
        window.location.reload();
      } catch (error) {
        alert('❌ Invalid JSON file! Please select a valid Shaney ERP backup file.');
      }
    };
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (!resetEmail.trim()) {
      setErrorMsg('Please enter your registered email address.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setSuccessMsg('Password reset link sent to your email!');
      setTimeout(() => setIsForgotOpen(false), 3000);
    } catch (err) {
      console.error("Reset Password Error:", err);
      setErrorMsg('Failed to send reset email. Check if email is correct.');
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    const email = registerInput.email.trim();
    const password = registerInput.password.trim();
    const confirmPassword = registerInput.confirmPassword.trim();

    if (!email || !password || !confirmPassword) {
      setErrorMsg('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match!');
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setSuccessMsg('Account created successfully! You can now log in.');
      setTimeout(() => {
        setIsRegisterOpen(false);
        setRegisterInput({ email: '', password: '', confirmPassword: '' });
      }, 2000);
    } catch (err) {
      console.error("Register Error:", err);
      setErrorMsg('Registration failed: ' + err.message);
    }
  };

  const handlePermissionChange = (key, val) => {
    setNewStaffForm({
      ...newStaffForm,
      permissions: {
        ...newStaffForm.permissions,
        [key]: val
      }
    });
  };

  const handleSaveStaff = async (e) => {
    e.preventDefault();
    if (!newStaffForm.userid.trim() || !newStaffForm.name.trim() || !newStaffForm.password.trim()) {
      alert('Please fill all required fields!');
      return;
    }
    const formattedUserId = newStaffForm.userid.trim().toLowerCase();
    
    let targetStaffObj = null;
    let updatedStaffList = [];

    if (editingStaffId !== null) {
      targetStaffObj = { ...newStaffForm, userid: editingStaffId, role: 'STAFF' };
      updatedStaffList = staffList.map(s => s.userid === editingStaffId ? targetStaffObj : s);
      setEditingStaffId(null);
    } else {
      if (staffList.some(s => s.userid.toLowerCase() === formattedUserId)) {
        alert('This User ID already exists!');
        return;
      }
      targetStaffObj = { ...newStaffForm, userid: formattedUserId, role: 'STAFF' };
      updatedStaffList = [...staffList, targetStaffObj];
    }

    setStaffList(updatedStaffList);
    localStorage.setItem('ERP_Staff_Accounts_v1', JSON.stringify(updatedStaffList));
    
    const simpleNames = updatedStaffList.map(s => s.name.toUpperCase());
    localStorage.setItem('ERP_StaffList', JSON.stringify(simpleNames));

    await SyncManager.saveData('ERP_Staff_Accounts_v1', 'staff_accounts', targetStaffObj);
    alert('Staff Account Saved & Synced via Render Backend!');

    setNewStaffForm({ userid: '', name: '', phone: '', password: '', permissions: { Dashboard: true, Certificate: true, Quotation: true, CRM: true, Export: true } });
  };

  const handleEditStaffClick = (st) => {
    setEditingStaffId(st.userid);
    setNewStaffForm({
      userid: st.userid || '',
      name: st.name || '',
      phone: st.phone || '',
      password: st.password || '',
      permissions: st.permissions ? JSON.parse(JSON.stringify(st.permissions)) : { Dashboard: true, Certificate: true, Quotation: true, CRM: true, Export: true }
    });
  };

  const handleDeleteStaff = async (uId) => {
    if (confirm('Are you sure you want to delete this staff account?')) {
      const updated = staffList.filter(s => s.userid !== uId);
      setStaffList(updated);
      localStorage.setItem('ERP_Staff_Accounts_v1', JSON.stringify(updated));

      await SyncManager.deleteData('ERP_Staff_Accounts_v1', 'staff_accounts', uId);
      alert('Staff Account Deleted Successfully!');
    }
  };

  const handleFactoryReset = () => {
    if (confirm('WARNING: This will erase all ERP data and reset the system to factory defaults. Are you sure?')) {
      localStorage.clear();
      alert('Factory Reset Complete! The page will now reload.');
      window.location.reload();
    }
  };

  const isStaff = currentUser?.role === 'STAFF';
  const perms = currentUser?.permissions || { Dashboard: true, Certificate: true, Quotation: true, CRM: true, Export: true };

  const tabsConfig = [
    { id: 'dashboard', label: 'Dashboard', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>, show: !isStaff || perms.Dashboard !== false },
    { id: 'customer', label: 'Customers', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>, show: true },
    { id: 'product', label: 'Products', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>, show: true },
    { id: 'certificate', label: 'Certificates', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>, show: !isStaff || perms.Certificate !== false },
    { id: 'quotation', label: 'Quotations', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>, show: !isStaff || perms.Quotation !== false },
    { id: 'reminder', label: 'Reminder', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>, show: true },
    { id: 'report', label: 'Report', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>, show: !isStaff || perms.Export !== false },
    { id: 'crm', label: 'CRM', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>, show: !isStaff || perms.CRM !== false },
    { id: 'envelope', label: 'Envelope', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>, show: true },
    { id: 'sticker', label: 'Sticker', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>, show: true },
  ].filter(t => t.show);

  if (isPreviewRoute) {
    return (
      <div className="w-full min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        {previewLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-white font-black text-xs uppercase tracking-widest">Loading Document from Render Backend...</p>
          </div>
        ) : previewDocData ? (
          <div className="flex flex-col items-center gap-4 w-full max-w-4xl">
            <div className="bg-white p-4 rounded-xl shadow-2xl w-full text-center flex justify-between items-center">
              <span className="font-black text-xs uppercase text-slate-700">📄 Public Document Viewer</span>
              <a href="/" className="bg-[#00a67e] text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider shadow">Go to ERP Login</a>
            </div>
            <div className="bg-slate-500 p-4 rounded-xl shadow-2xl overflow-auto w-full flex justify-center max-h-[80vh]">
              {previewDocData.type === 'certificate' ? (
                <div className="transform scale-[0.6] md:scale-[0.8] origin-top">
                  <div className="bg-white p-8 w-[794px] shadow-2xl">
                    <h1 className="text-2xl font-bold text-center mb-4 uppercase">{previewDocData.data.vendor}</h1>
                    <p className="text-center text-red-600 font-bold mb-6">Fire And Safety Certificate</p>
                    <div className="flex justify-between text-sm mb-4 font-bold">
                      <p>Date: {previewDocData.data.date}</p>
                      <p>SR.No: {previewDocData.data.ref}</p>
                    </div>
                    <p className="text-sm mb-2"><b>Certified M/s:</b> {previewDocData.data.party}</p>
                    <p className="text-sm mb-6"><b>Total Amount:</b> ₹{previewDocData.data.total}</p>
                    <div className="text-center mt-10">
                      <p className="font-bold">For {previewDocData.data.vendor}</p>
                      <div className="h-12"></div>
                      <p className="text-xs">Authorised Signature</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="transform scale-[0.6] md:scale-[0.8] origin-top">
                  <div className="bg-white p-8 w-[794px] shadow-2xl">
                    <h1 className="text-2xl font-bold text-center mb-4 uppercase">{previewDocData.data.vendor}</h1>
                    <p className="text-center text-blue-600 font-bold mb-6">Quotation</p>
                    <div className="flex justify-between text-sm mb-4 font-bold">
                      <p>Date: {previewDocData.data.date}</p>
                      <p>Quote Ref: {previewDocData.data.ref}</p>
                    </div>
                    <p className="text-sm mb-2"><b>Billed To:</b> {previewDocData.data.party}</p>
                    <p className="text-sm mb-6"><b>Grand Total:</b> ₹{previewDocData.data.total}</p>
                    <div className="text-center mt-10">
                      <p className="font-bold">For {previewDocData.data.vendor}</p>
                      <div className="h-12"></div>
                      <p className="text-xs">Authorised Signatory</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white p-8 rounded-2xl shadow-2xl text-center max-w-md w-full">
            <h2 className="text-lg font-black text-red-600 uppercase mb-2">Document Not Found</h2>
            <p className="text-xs text-slate-500 mb-6 font-medium">The link might be expired or the document does not exist.</p>
            <a href="/" className="bg-[#00a67e] text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow block">Go to Homepage</a>
          </div>
        )}
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col lg:flex-row items-center justify-center relative overflow-y-auto px-4 py-8 lg:py-12 gap-8 lg:gap-12">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-emerald-950/40 to-slate-950 z-0"></div>
        <div className="absolute inset-0 bg-[radial-gradient(#00a67e_1px,transparent_1px)] [background-size:24px_24px] opacity-10 z-0"></div>

        <div className="w-full lg:w-1/2 flex items-center justify-center relative z-10 max-w-lg">
          <div className="group relative w-full bg-slate-900/80 backdrop-blur-xl p-4 sm:p-6 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.6)] border border-emerald-500/30 overflow-hidden flex items-center justify-center">
            <img 
              src="/visitingcard.jpeg" 
              alt="Visiting Card" 
              className="w-full h-auto object-contain rounded-2xl transition-transform duration-500 ease-in-out group-hover:scale-105 shadow-2xl bg-transparent"
              onError={(e)=>{e.target.src=logoImage}}
            />
          </div>
        </div>

        <div className="w-full lg:w-1/2 flex items-center justify-center relative z-10 max-w-lg">
          <form onSubmit={handleAuthSubmit} className="w-full bg-slate-900/90 backdrop-blur-2xl p-6 sm:p-8 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.6)] border border-emerald-500/40">
            <div className="text-center mb-6 sm:mb-8">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Shaney Enterprise</h1>
              <p className="text-[#00a67e] mt-1.5 font-extrabold text-[11px] sm:text-xs uppercase tracking-widest bg-emerald-500/10 py-1.5 px-4 rounded-full inline-block border border-emerald-500/30">
                Render Cloud ERP Login
              </p>
            </div>

            <div className="flex flex-col gap-4 sm:gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5 uppercase tracking-wide">Admin Email or Staff ID*</label>
                <input 
                  type="text" 
                  placeholder="Enter Email or Staff User ID" 
                  value={loginInput.email} 
                  onChange={e => setLoginInput({...loginInput, email: e.target.value})} 
                  className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-[#00a67e] font-medium shadow-inner text-sm" 
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5 uppercase tracking-wide">Password*</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="Enter password" 
                    value={loginInput.password} 
                    onChange={e => setLoginInput({...loginInput, password: e.target.value})} 
                    className="w-full px-4 py-3.5 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-[#00a67e] font-medium shadow-inner pr-12 text-sm" 
                    required 
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white focus:outline-none cursor-pointer"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {errorMsg && <p className="text-red-400 font-bold text-xs text-center bg-red-950/50 p-2.5 rounded-lg border border-red-500/30">{errorMsg}</p>}
              {successMsg && <p className="text-emerald-400 font-bold text-xs text-center bg-emerald-950/50 p-2.5 rounded-lg border border-emerald-500/30">{successMsg}</p>}

              <button 
                type="submit"
                className="w-full bg-[#00a67e] text-white py-3.5 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg active:scale-95 mt-2 cursor-pointer">
                Login System
              </button>

              <div className="flex justify-between items-center text-xs font-bold mt-2">
                <button 
                  type="button" 
                  onClick={() => { setIsForgotOpen(true); setErrorMsg(''); setSuccessMsg(''); }}
                  className="text-emerald-400 hover:underline cursor-pointer"
                >
                  Forgot Password?
                </button>
                <button 
                  type="button" 
                  onClick={() => { setIsRegisterOpen(true); setErrorMsg(''); setSuccessMsg(''); }}
                  className="text-emerald-400 hover:underline cursor-pointer"
                >
                  Create Account
                </button>
              </div>
            </div>
          </form>
        </div>

        {isForgotOpen && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-emerald-500/35 w-full max-w-md rounded-3xl p-6 shadow-2xl text-white">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-black uppercase text-emerald-400">Reset Password</h3>
                <button onClick={() => setIsForgotOpen(false)} className="text-slate-400 hover:text-white text-xl font-bold cursor-pointer">&times;</button>
              </div>
              <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">Enter Your Email</label>
                  <input 
                    type="email" 
                    placeholder="admin@shaney.com" 
                    value={resetEmail} 
                    onChange={e => setResetEmail(e.target.value)} 
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-[#00a67e] text-sm" 
                    required 
                  />
                </div>
                {errorMsg && <p className="text-red-400 text-xs font-bold">{errorMsg}</p>}
                {successMsg && <p className="text-emerald-400 text-xs font-bold">{successMsg}</p>}
                <button type="submit" className="w-full bg-[#00a67e] hover:bg-emerald-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider cursor-pointer">
                  Send Reset Link
                </button>
              </form>
            </div>
          </div>
        )}

        {isRegisterOpen && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-emerald-500/35 w-full max-w-md rounded-3xl p-6 shadow-2xl text-white">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-black uppercase text-emerald-400">Create New Account</h3>
                <button onClick={() => setIsRegisterOpen(false)} className="text-slate-400 hover:text-white text-xl font-bold cursor-pointer">&times;</button>
              </div>
              <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">Email Address</label>
                  <input 
                    type="email" 
                    placeholder="Email" 
                    value={registerInput.email} 
                    onChange={e => setRegisterInput({...registerInput, email: e.target.value})} 
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 text-sm" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">Password</label>
                  <input 
                    type="password" 
                    placeholder="Password" 
                    value={registerInput.password} 
                    onChange={e => setRegisterInput({...registerInput, password: e.target.value})} 
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 text-sm" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 uppercase">Confirm Password</label>
                  <input 
                    type="password" 
                    placeholder="Confirm Password" 
                    value={registerInput.confirmPassword} 
                    onChange={e => setRegisterInput({...registerInput, confirmPassword: e.target.value})} 
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 text-sm" 
                    required 
                  />
                </div>
                {errorMsg && <p className="text-red-400 text-xs font-bold">{errorMsg}</p>}
                {successMsg && <p className="text-emerald-400 text-xs font-bold">{successMsg}</p>}
                <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider cursor-pointer">
                  Register Account
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    );
  }

  const openSettings = (type) => {
    if (isStaff) {
      alert("Access Denied. Staff members cannot access settings.");
      return;
    }
    setActiveTab(type);
    setIsProfileOpen(false);
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 relative">
      <header className="bg-[#00a67e] text-white px-2.5 sm:px-4 h-[60px] flex items-center justify-between shadow-md sticky top-0 z-50 gap-2">
        <div className="flex items-center space-x-2 shrink-0 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white flex items-center justify-center shadow-md overflow-hidden shrink-0 border border-emerald-300">
            <img src={logoImage} alt="Logo" className="w-full h-full object-cover rounded-full" onError={(e)=>{e.target.src="/Shaney Logo.jpg"}} />
          </div>
          <span className="font-black text-xs sm:text-sm md:text-lg tracking-wide truncate">Shaney Enterprise</span>
        </div>
        
        <div className="flex items-center space-x-2 shrink-0 ml-auto">
          <select 
            value={selectedFY}
            onChange={(e) => setSelectedFY(e.target.value)}
            className="bg-emerald-800 text-white font-black text-[11px] sm:text-xs px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl border border-emerald-500/50 outline-none cursor-pointer shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <option value="ALL">All F.Y.</option>
            {availableFYs.map(fy => (
              <option key={fy} value={fy}>{fy}</option>
            ))}
          </select>

          <div className="relative hidden md:block">
            <button 
              onClick={() => { setIsCreateOpen(!isCreateOpen); setIsProfileOpen(false); }}
              className="bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm border border-emerald-500/50 transition-colors uppercase cursor-pointer"
            >
              <span>+ Create</span>
              <span className="text-[10px]">▼</span>
            </button>

            {isCreateOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-200 z-[99999] overflow-hidden text-slate-800 py-1.5">
                <button onClick={() => { setActiveTab('certificate'); setCertInitialMode('create'); setIsCreateOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-emerald-50 hover:text-[#00a67e] transition-colors flex items-center gap-2.5 border-b border-slate-50 cursor-pointer">
                  <span>New Certificate</span>
                </button>
                <button onClick={() => { setActiveTab('quotation'); setQuoteInitialMode('create'); setIsCreateOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-emerald-50 hover:text-[#00a67e] transition-colors flex items-center gap-2.5 border-b border-slate-50 cursor-pointer">
                  <span>New Quotation</span>
                </button>
                <button onClick={() => { setActiveTab('product'); setIsCreateOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-emerald-50 hover:text-[#00a67e] transition-colors flex items-center gap-2.5 border-b border-slate-50 cursor-pointer">
                  <span>New Product</span>
                </button>
                <button onClick={() => { setActiveTab('customer'); setIsCreateOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-emerald-50 hover:text-[#00a67e] transition-colors flex items-center gap-2.5 border-b border-slate-50 cursor-pointer">
                  <span>New Customer</span>
                </button>
                <button onClick={() => { setActiveTab('crm'); setIsCreateOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-emerald-50 hover:text-indigo-600 transition-colors flex items-center gap-2.5 text-indigo-700 bg-indigo-50/50 cursor-pointer">
                  <span>+ New Lead (CRM)</span>
                </button>
              </div>
            )}
          </div>

          <div 
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white border-2 border-emerald-300 flex items-center justify-center cursor-pointer shadow-md overflow-hidden hover:scale-105 transition-transform shrink-0"
            onClick={() => { setIsProfileOpen(!isProfileOpen); setIsCreateOpen(false); }}
          >
            <img src={logoImage} alt="Profile Logo" className="w-full h-full object-cover rounded-full" onError={(e)=>{e.target.src="/Shaney Logo.jpg"}} />
          </div>

          <button 
            onClick={() => setIsMobileDrawerOpen(true)}
            className="md:hidden bg-emerald-700 hover:bg-emerald-600 text-white p-2 rounded-xl flex items-center justify-center shadow-sm border border-emerald-500/50 cursor-pointer shrink-0"
            title="Open Menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 top-full mt-3 w-[320px] bg-white rounded-3xl shadow-[0_15px_50px_rgba(0,0,0,0.15)] border border-slate-200 z-[99999] overflow-hidden text-slate-800">
              <div className="flex items-start justify-between p-5 bg-white border-b border-slate-100">
                <div className="flex items-center space-x-3.5">
                  <div className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-inner shrink-0">
                    <img src={logoImage} alt="Menu Logo" className="w-full h-full object-cover rounded-full" onError={(e)=>{e.target.src="/Shaney Logo.jpg"}} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800 leading-tight uppercase">{currentUser?.name || 'Shaney Enterprise'}</h4>
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{currentUser?.role || 'ADMIN'}</span>
                  </div>
                </div>
                <button onClick={() => setIsProfileOpen(false)} className="text-slate-400 hover:text-red-500 text-xl font-bold cursor-pointer p-1">&times;</button>
              </div>

              {!isStaff && (
                <div className="grid grid-cols-2 gap-3.5 p-4 bg-white w-full">
                  <button 
                    onClick={() => openSettings('settings-general')}
                    className="flex flex-col items-center justify-center space-y-2 border border-slate-200/80 rounded-2xl p-4 hover:border-[#00a67e] hover:bg-emerald-50/50 transition-all text-slate-700 shadow-sm bg-white cursor-pointer group">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Setting</span>
                  </button>
                  <button 
                    onClick={() => openSettings('settings-template')}
                    className="flex flex-col items-center justify-center space-y-2 border border-slate-200/80 rounded-2xl p-4 hover:border-amber-400 hover:bg-amber-50/50 transition-all text-slate-700 shadow-sm bg-white cursor-pointer group">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Templates</span>
                  </button>
                </div>
              )}

              <div className="bg-white w-full border-t border-slate-100">
                {!isStaff && (
                  <>
                    <button 
                      onClick={() => { setIsStaffModalOpen(true); setIsProfileOpen(false); }}
                      className="w-full py-4 px-5 text-indigo-600 hover:bg-indigo-50 transition-colors text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2.5 cursor-pointer border-b border-slate-100"
                    >
                      MANAGE STAFF ACCOUNTS
                    </button>
                    <button 
                      onClick={handleFactoryReset}
                      className="w-full py-4 px-5 text-amber-600 hover:bg-amber-50 transition-colors text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2.5 cursor-pointer border-b border-slate-100"
                    >
                      FACTORY RESET
                    </button>
                  </>
                )}

                {isStaff && (
                  <label className="w-full py-4 px-5 text-emerald-600 hover:bg-emerald-50 transition-colors text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2.5 cursor-pointer border-b border-slate-100">
                    RESTORE DATA (.JSON)
                    <input type="file" accept=".json" onChange={handleRestoreBackup} className="hidden" />
                  </label>
                )}

                <button 
                  onClick={handleLogout}
                  className="w-full py-4 px-5 text-red-600 hover:bg-red-50 transition-colors text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  LOG OUT
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <nav className="hidden md:flex overflow-x-auto bg-white border-b border-slate-200 shadow-sm sticky top-[60px] z-40 scrollbar-hide">
        {tabsConfig.map(tab => (
          <div 
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setIsProfileOpen(false); setIsCreateOpen(false); }}
            className={`flex-1 min-w-[100px] text-center py-3 cursor-pointer font-bold text-[11px] uppercase transition-all border-b-4 flex items-center justify-center gap-1.5 ${activeTab === tab.id ? 'text-[#00a67e] border-[#00a67e] bg-[#f0fdf4]' : 'text-slate-500 border-transparent hover:bg-slate-50'}`}>
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </div>
        ))}
      </nav>

      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-[99999] flex md:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMobileDrawerOpen(false)}></div>
          <div className="relative w-80 max-w-[85%] bg-white h-full shadow-2xl flex flex-col z-10 overflow-y-auto">
            <div className="bg-[#00a67e] text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden border border-emerald-300">
                  <img src={logoImage} alt="Logo" className="w-full h-full object-cover rounded-full" onError={(e)=>{e.target.src="/Shaney Logo.jpg"}} />
                </div>
                <div>
                  <h4 className="font-black text-sm leading-tight uppercase">{currentUser?.name || 'Shaney Enterprise'}</h4>
                  <span className="text-[10px] font-extrabold text-emerald-200 uppercase tracking-widest">{currentUser?.role || 'ADMIN'}</span>
                </div>
              </div>
              <button onClick={() => setIsMobileDrawerOpen(false)} className="text-white hover:text-red-200 text-2xl font-black cursor-pointer p-1">&times;</button>
            </div>

            <div className="flex-1 p-4 flex flex-col gap-1.5">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 py-1 mb-1">Main Menu</div>
              {tabsConfig.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setIsMobileDrawerOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer ${activeTab === tab.id ? 'bg-emerald-50 text-[#00a67e] border border-emerald-200 shadow-sm' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <span className="text-base">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="p-4 border-t border-slate-200 bg-white shrink-0">
              <button 
                onClick={() => { setIsMobileDrawerOpen(false); handleLogout(); }}
                className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                LOG OUT SYSTEM
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="p-4 md:p-6 w-full max-w-7xl mx-auto">
        {activeTab === 'dashboard' && <Dashboard currentUser={currentUser} setActiveTab={setActiveTab} />}
        {activeTab === 'settings-general' && <Settings />}
        {activeTab === 'settings' && <Settings />}
        {activeTab === 'settings-template' && <Templates />}
        {activeTab === 'customer' && <Customer />}
        {activeTab === 'product' && <Product />}
        {activeTab === 'certificate' && <Certificate selectedFY={selectedFY} initialViewMode={certInitialMode} setInitialViewMode={setCertInitialMode} />}
        {activeTab === 'quotation' && <Quotation selectedFY={selectedFY} initialViewMode={quoteInitialMode} setInitialViewMode={setQuoteInitialMode} />}
        {activeTab === 'reminder' && <Reminder selectedFY={selectedFY} />}
        {activeTab === 'report' && <Report selectedFY={selectedFY} />}
        {activeTab === 'crm' && <Crm />}
        {activeTab === 'envelope' && <Envelope />}
        {activeTab === 'sticker' && <Sticker />}
      </main>

      {isStaffModalOpen && !isStaff && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 bg-indigo-600 text-white">
              <h3 className="text-sm font-black uppercase tracking-wider">Staff Accounts Management</h3>
              <button onClick={() => setIsStaffModalOpen(false)} className="text-indigo-200 hover:text-white text-2xl font-bold px-2 cursor-pointer">&times;</button>
            </div>
            <div className="p-6 overflow-y-auto bg-slate-50 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
                <h4 className="text-xs font-black text-slate-800 uppercase">Create New Staff</h4>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">User ID *</label>
                  <input type="text" value={newStaffForm.userid} onChange={e=>setNewStaffForm({...newStaffForm, userid: e.target.value})} className="pro-input text-xs py-2 bg-slate-50 font-bold" required />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Full Name *</label>
                  <input type="text" value={newStaffForm.name} onChange={e=>setNewStaffForm({...newStaffForm, name: e.target.value})} className="pro-input text-xs py-2 bg-slate-50 font-bold" required />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Password *</label>
                  <input type="text" value={newStaffForm.password} onChange={e=>setNewStaffForm({...newStaffForm, password: e.target.value})} className="pro-input text-xs py-2 bg-slate-50 font-bold" required />
                </div>
                <button onClick={handleSaveStaff} className="w-full bg-[#00a67e] text-white py-3 rounded-xl font-black text-xs uppercase cursor-pointer">Save Staff</button>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                <h4 className="text-xs font-black text-slate-800 uppercase mb-4">Active Staff List</h4>
                <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[350px]">
                  {staffList.filter(st => st.userid !== 'admin').map((st) => (
                    <div key={st.userid} className="flex justify-between items-center p-3 rounded-xl border bg-slate-50 border-slate-100">
                      <div>
                        <h5 className="text-xs font-black text-slate-800 uppercase">{st.name}</h5>
                        <span className="text-[10px] font-bold text-indigo-600">ID: {st.userid}</span>
                      </div>
                      <button onClick={() => handleDeleteStaff(st.userid)} className="text-red-500 text-xs font-bold cursor-pointer">Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 bg-white border-t border-slate-200 flex justify-end">
              <button onClick={() => setIsStaffModalOpen(false)} className="bg-slate-800 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}