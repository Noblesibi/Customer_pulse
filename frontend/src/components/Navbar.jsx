import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Bell, Check, MailOpen, Mail, AlertCircle, LogOut, Shield, ChevronDown, Activity, Menu, X, CheckCheck } from 'lucide-react';
import nestLogo from '../assets/nest-digital-logo.png';
import nestIcon from '../assets/nest_icon.png';
import { useStore } from '../store/index.js';
import { formatDate, formatDateTime, formatNotificationTime } from '../utils/dateFormat.js';

export default function Navbar() {
  const { 
    user,
    logout,
    notifications, 
    unreadNotificationsCount, 
    fetchNotifications, 
    markNotificationRead, 
    markAllNotificationsRead,
    staffList,
    fetchStaff
  } = useStore();

  const navigate = useNavigate();
  const location = useLocation();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAccountsOpen, setIsAccountsOpen] = useState(false);
  const [isRisksOpen, setIsRisksOpen] = useState(false);

  const notifDropdownRef = useRef(null);
  const profileDropdownRef = useRef(null);
  const accountsDropdownRef = useRef(null);
  const risksDropdownRef = useRef(null);

  const getNotificationBadge = (notif) => {
    const msg = (notif?.message || '').toLowerCase();
    const type = (notif?.type || '').toLowerCase();

    if (msg.includes('risk') || type.includes('risk')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
          <AlertCircle className="w-4 h-4 text-rose-600" />
        </div>
      );
    }
    if (msg.includes('task') || type.includes('task')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
          <Activity className="w-4 h-4 text-indigo-600" />
        </div>
      );
    }
    if (msg.includes('anniversary') || msg.includes('reminder') || type.includes('reminder')) {
      return (
        <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
          <Activity className="w-4 h-4 text-amber-600" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
        <Mail className="w-4 h-4 text-blue-600" />
      </div>
    );
  };

  // Smart deep-link navigation for notification items
  const handleNotificationClick = (notif) => {
    if (!notif.read) {
      markNotificationRead(notif.notificationId || notif.id || notif._id);
    }
    setIsNotifOpen(false);

    const type = (notif.type || '').toLowerCase();
    const msg  = (notif.message || '').toLowerCase();

    // ── 1. Staff task (by task) ──────────────────────────────────────
    if (notif.taskId && (type.includes('task') || msg.includes('task'))) {
      navigate('/staff-tasks', { state: { selectedTaskId: notif.taskId } });
      return;
    }

    // ── 2. Interaction log (by interaction) ──────────────────────────
    if (notif.interactionId && (type.includes('interaction') || type.includes('task reply') || msg.includes('interaction') || msg.includes('reply'))) {
      navigate('/interaction-log', { state: { selectedInteractionId: notif.interactionId } });
      return;
    }

    // ── 3. Risk alert (by risk) ───────────────────────────────────────
    if (notif.riskId || type.includes('risk') || msg.includes('risk')) {
      navigate('/risks', { state: { selectedRiskId: notif.riskId } });
      return;
    }

    // ── 4. Account (by account) ───────────────────────────────────────
    if (notif.accountId && (type.includes('account') || msg.includes('account'))) {
      navigate(`/accounts/${notif.accountId}`);
      return;
    }

    // ── 5. Direct link/path override ────────────────────────────────
    if (notif.link) { navigate(notif.link); return; }
    if (notif.path) { navigate(notif.path); return; }

    // ── 6. Fallback: route by message content ────────────────────────
    if (type.includes('task') || msg.includes('task')) {
      navigate('/staff-tasks');
    } else if (msg.includes('interaction') || msg.includes('mail') || msg.includes('outlook')) {
      navigate('/interaction-log');
    } else if (msg.includes('account') || msg.includes('client')) {
      navigate('/accounts');
    } else {
      navigate('/dashboard');
    }
  };
  const [activeToast, setActiveToast] = useState(null);
  const prevNotifIdsRef = useRef(new Set());
  const initialLoadRef = useRef(true);

  useEffect(() => {
    fetchNotifications();
    fetchStaff();
    const interval = setInterval(() => {
      fetchNotifications();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const dismissedToastIdsRef = useRef(new Set());

  // Show toast popup for new/unread incoming notifications
  useEffect(() => {
    if (!notifications || notifications.length === 0) return;
    const currentIds = new Set(notifications.map(n => n.notificationId || n.id || n._id));
    if (initialLoadRef.current) {
      prevNotifIdsRef.current = currentIds;
      initialLoadRef.current = false;
      const latestUnread = notifications.find(n => !n.read);
      if (latestUnread) {
        const notifKey = latestUnread.notificationId || latestUnread.id || latestUnread._id;
        if (!dismissedToastIdsRef.current.has(notifKey)) {
          dismissedToastIdsRef.current.add(notifKey);
          setActiveToast(latestUnread);
        }
      }
      return;
    }
    const newNotif = notifications.find(n => !n.read && !prevNotifIdsRef.current.has(n.notificationId || n.id || n._id));
    if (newNotif) {
      const notifKey = newNotif.notificationId || newNotif.id || newNotif._id;
      if (!dismissedToastIdsRef.current.has(notifKey)) {
        dismissedToastIdsRef.current.add(notifKey);
        setActiveToast(newNotif);
      }
    }
    prevNotifIdsRef.current = currentIds;
  }, [notifications]);

  // Strict 5-second auto-dismiss timer for active toast popup
  useEffect(() => {
    if (!activeToast) return;
    const timer = setTimeout(() => {
      setActiveToast(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [activeToast]);

  // Fetch tag dynamically from User Directory
  const directoryUser = (staffList || []).find(s => 
    (s.uid && user?.uid && s.uid === user?.uid) ||
    (s.email && user?.email && s.email.toLowerCase().trim() === user?.email.toLowerCase().trim())
  );
  const userDisplayTag = directoryUser?.position || directoryUser?.userType || directoryUser?.jobRole || user?.position || user?.userType || user?.role || 'Employee';

  // Handle click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(event.target)) {
        setIsNotifOpen(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
      if (accountsDropdownRef.current && !accountsDropdownRef.current.contains(event.target)) {
        setIsAccountsOpen(false);
      }
      if (risksDropdownRef.current && !risksDropdownRef.current.contains(event.target)) {
        setIsRisksOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getLinks = () => {
    const role = user?.role;
    const links = [
      { path: '/dashboard',      label: 'Dashboard',  roles: ['Admin', 'Executive', 'Sales Manager', 'Employee'] },
      { path: '/accounts',        label: 'Accounts',   roles: ['Admin', 'Executive', 'Sales Manager', 'Employee'] },
      { path: '/contacts',        label: 'Contacts',   roles: ['Admin', 'Executive', 'Sales Manager', 'Employee'] },
      { path: '/risks',           label: 'Risks',      roles: ['Admin', 'Executive', 'Sales Manager'] },
      { path: '/webhooks-demo',   label: 'Email Ingestion',   roles: ['Admin', 'Executive', 'Sales Manager'] },
      { path: '/users',           label: 'User Directory',      roles: ['Admin', 'Executive', 'Sales Manager', 'Employee'] },
      { path: '/interaction-log',    label: 'Interaction Log',   roles: ['Admin', 'Executive', 'Sales Manager', 'Employee'] }
    ];
    return links.filter(link => link.roles.includes(role));
  };

  const canAccessNotificationEngine = user?.role === 'Admin' || user?.userType === 'Admin' || user?.name?.toLowerCase().includes('nazneen') || user?.email?.toLowerCase().includes('nazneen') || user?.email === 'nj@gmail.com';

  return (
    <header className="h-20 glass border-b border-slate-800/80 px-3 sm:px-5 xl:px-8 flex items-center justify-between gap-3 sticky top-0 shrink-0 select-none" style={{ zIndex: 9999 }}>
      
      {/* Brand Logo - click to go back to landing page */}
      <div className="flex items-center gap-3.5 cursor-pointer shrink-0" onClick={() => navigate('/')}>
        <div className="flex items-center gap-2.5">
          {/* NeST Oval Logo Icon */}
          <img
            src={nestIcon}
            alt="NeST Logo Icon"
            className="h-8 sm:h-9 w-auto object-contain shrink-0"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = '/CustomerPulse/nest_icon.png';
            }}
          />
          {/* NeST DIGITAL Text */}
          <div className="flex flex-col text-[#0f172a] leading-none text-left shrink-0">
            <span className="font-black text-xs sm:text-sm tracking-tight">NeST</span>
            <span className="font-extrabold text-[8px] sm:text-[9px] tracking-widest text-[#0f172a]">DIGITAL</span>
          </div>
        </div>

        {/* Vertical Divider & App Title */}
        <div className="hidden sm:flex items-center gap-3.5 border-l border-slate-300 h-7 pl-3.5">
          <div className="flex flex-col text-left justify-center">
            <span className="font-extrabold text-sm sm:text-base text-black tracking-wide block leading-none">CustomerPulse</span>
            <span className="text-[9px] xl:text-[10px] text-black font-bold tracking-widest uppercase leading-tight mt-0.5 hidden xl:block">RELATIONSHIPS, MEASURED</span>
          </div>
        </div>
      </div>

      {/* Horizontal Links Navigation */}
      <nav className="hidden lg:flex items-center gap-1 xl:gap-2 2xl:gap-3 shrink min-w-0">
        {/* Dashboard */}
        <NavLink
          to="/dashboard"
          className={({ isActive }) => 
            `px-2.5 py-1.5 xl:px-3.5 xl:py-1.5 rounded-lg text-xs xl:text-sm font-semibold border whitespace-nowrap transition-colors ${
              isActive 
                ? 'bg-primary/10 border-primary/25 text-primary' 
                : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
            }`
          }
        >
          Dashboard
        </NavLink>

        {/* Interaction Log */}
        <NavLink
          to="/interaction-log"
          className={({ isActive }) => 
            `px-2.5 py-1.5 xl:px-3.5 xl:py-1.5 rounded-lg text-xs xl:text-sm font-semibold border whitespace-nowrap transition-colors ${
              isActive 
                ? 'bg-primary/10 border-primary/25 text-primary' 
                : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
            }`
          }
        >
          Interaction Log
        </NavLink>

        {/* Staff Tasks */}
        <NavLink
          to="/staff-tasks"
          className={({ isActive }) => 
            `px-2.5 py-1.5 xl:px-3.5 xl:py-1.5 rounded-lg text-xs xl:text-sm font-semibold border whitespace-nowrap transition-colors ${
              isActive 
                ? 'bg-primary/10 border-primary/25 text-primary' 
                : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
            }`
          }
        >
          Tasks
        </NavLink>

        {/* Accounts Dropdown */}
        <div 
          className={`relative flex items-center rounded-lg border whitespace-nowrap transition-colors ${
            ['/accounts', '/contacts'].includes(location.pathname)
              ? 'bg-primary/10 border-primary/25 text-primary'
              : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
          }`}
          ref={accountsDropdownRef}
        >
          <NavLink
            to="/accounts"
            className="px-2.5 py-1.5 xl:px-3.5 xl:py-1.5 text-xs xl:text-sm font-semibold transition-colors"
            onClick={() => setIsAccountsOpen(false)}
          >
            Accounts
          </NavLink>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsAccountsOpen(!isAccountsOpen);
              setIsRisksOpen(false);
            }}
            className="pr-2 pl-0.5 py-1.5 cursor-pointer flex items-center justify-center hover:text-primary border-l border-transparent transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>
          
          {isAccountsOpen && (
            <div className="absolute left-0 mt-2 top-full w-48 glass border border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 animate-soft-pulse duration-300">
              <NavLink
                to="/accounts"
                onClick={() => setIsAccountsOpen(false)}
                className={({ isActive }) =>
                  `flex items-center px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-350 hover:text-primary'
                  }`
                }
              >
                Accounts Portfolio
              </NavLink>
              <NavLink
                to="/contacts"
                onClick={() => setIsAccountsOpen(false)}
                className={({ isActive }) =>
                  `flex items-center px-3 py-2.5 rounded-lg text-xs font-bold transition-all mt-0.5 ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-350 hover:text-primary'
                  }`
                }
              >
                Contacts Directory
              </NavLink>
            </div>
          )}
        </div>

        {/* Risks Dropdown – visible to all users */}
        <div 
          className={`relative flex items-center rounded-lg border whitespace-nowrap transition-colors ${
            ['/risks', '/webhooks-demo'].includes(location.pathname)
              ? 'bg-primary/10 border-primary/25 text-primary'
              : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
          }`}
          ref={risksDropdownRef}
        >
          <NavLink
            to="/risks"
            className="px-2.5 py-1.5 xl:px-3.5 xl:py-1.5 text-xs xl:text-sm font-semibold transition-colors"
            onClick={() => setIsRisksOpen(false)}
          >
            Risks
          </NavLink>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsRisksOpen(!isRisksOpen);
              setIsAccountsOpen(false);
            }}
            className="pr-2 pl-0.5 py-1.5 cursor-pointer flex items-center justify-center hover:text-primary border-l border-transparent transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>
          
          {isRisksOpen && (
            <div className="absolute left-0 mt-2 top-full w-48 glass border border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 animate-soft-pulse duration-300">
              <NavLink
                to="/risks"
                onClick={() => setIsRisksOpen(false)}
                className={({ isActive }) =>
                  `flex items-center px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-350 hover:text-primary'
                  }`
                }
              >
                Risks Center
              </NavLink>
              <NavLink
                to="/webhooks-demo"
                onClick={() => setIsRisksOpen(false)}
                className={({ isActive }) =>
                  `flex items-center px-3 py-2.5 rounded-lg text-xs font-bold transition-all mt-0.5 ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-355 hover:text-primary'
                  }`
                }
              >
                Email Ingestion
              </NavLink>
            </div>
          )}
        </div>

        {/* User Directory */}
        <NavLink
          to="/users"
          className={({ isActive }) => 
            `px-2.5 py-1.5 xl:px-3.5 xl:py-1.5 rounded-lg text-xs xl:text-sm font-semibold border whitespace-nowrap transition-colors ${
              isActive 
                ? 'bg-primary/10 border-primary/25 text-primary' 
                : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
            }`
          }
        >
          User Directory
        </NavLink>
      </nav>

      {/* Right Actions Block */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
        
        {/* Mobile Menu Toggler */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="lg:hidden bg-slate-800/50 p-2 rounded-xl border border-slate-700/60 hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
          type="button"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5 text-slate-300" /> : <Menu className="w-5 h-5 text-slate-300" />}
        </button>

        {/* Notification Bell */}
        <div className="relative" ref={notifDropdownRef}>
          <button 
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="relative bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/60 hover:bg-slate-800 hover:text-white transition-all duration-200 cursor-pointer"
          >
            <Bell className="w-4.5 h-4.5 text-slate-300" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-danger text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center animate-bounce border border-dark-950">
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 mt-3 w-80 bg-white border border-slate-800 rounded-xl shadow-2xl overflow-hidden" style={{ zIndex: 99999, backgroundColor: '#ffffff' }}>
              <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between bg-white">
                <span className="text-xs font-black text-black uppercase tracking-wider">Notifications</span>
                {unreadNotificationsCount > 0 && (
                  <span className="bg-danger/10 text-danger text-[10px] font-black px-2 py-0.5 rounded-full border border-danger/20">
                    {unreadNotificationsCount} new
                  </span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60 bg-white">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center bg-white">
                    <Bell className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                    <p className="text-xs text-slate-500 font-semibold">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map((notif, idx) => (
                    <div
                      key={notif.notificationId || notif.id || notif._id || idx}
                      className={`px-4 py-3 cursor-pointer transition-colors hover:bg-sky-50/60 bg-white ${
                        notif.read ? 'bg-white' : 'bg-primary/5 border-l-2 border-primary'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p
                          onClick={() => handleNotificationClick(notif)}
                          className={`text-xs leading-relaxed flex-1 ${notif.read ? 'text-slate-400 font-medium' : 'text-black font-bold'}`}
                        >
                          {notif.message}
                        </p>
                        {!notif.read && (
                          <button
                            onClick={(e) => { e.stopPropagation(); markNotificationRead(notif.notificationId || notif.id || notif._id); }}
                            className="shrink-0 text-[9px] font-bold text-primary/70 hover:text-primary border border-primary/20 hover:border-primary/50 rounded px-1.5 py-0.5 transition-colors bg-transparent cursor-pointer whitespace-nowrap"
                            title="Mark as read"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                      <div
                        onClick={() => handleNotificationClick(notif)}
                        className="flex items-center gap-2 mt-1.5"
                      >
                        <span className="text-[10px] text-slate-500 font-semibold">
                          {formatNotificationTime(notif)}
                        </span>
                        {!notif.read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Dropdown Menu */}
        <div className="relative border-l border-slate-800/60 pl-4" ref={profileDropdownRef}>

          <button 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2 hover:opacity-85 transition-opacity cursor-pointer text-left"
          >
            <div className="bg-primary/10 border border-primary/20 text-primary w-9.5 h-9.5 rounded-xl flex items-center justify-center font-bold text-xs shrink-0">
              {user?.name?.substring(0, 2).toUpperCase()}
            </div>
            <div className="hidden md:block min-w-0 leading-none pr-1">
              <span className="text-sm font-bold text-black block truncate">{user?.name}</span>
              <span className="text-xs font-bold uppercase mt-0.5 block truncate" style={{ color: '#10b981' }}>
                {userDisplayTag}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-3 w-56 glass border border-slate-800 rounded-xl shadow-2xl p-1.5 animate-soft-pulse duration-500" style={{ zIndex: 99999 }}>
              <div className="px-3.5 py-2.5 border-b border-slate-800/80 mb-1 leading-none md:hidden">
                <span className="text-sm font-bold text-black block truncate">{user?.name}</span>
                <span className="text-xs font-bold uppercase mt-1 block truncate" style={{ color: '#10b981' }}>
                  {userDisplayTag}
                </span>
              </div>
              {canAccessNotificationEngine && (
                <button 
                  onClick={() => { setIsProfileOpen(false); navigate('/notification-center'); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-slate-700 hover:bg-slate-100 text-sm font-semibold transition-all cursor-pointer text-left mb-1"
                >
                  <Bell className="w-4 h-4 text-primary" />
                  Notification Engine
                </button>
              )}
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-rose-500 hover:bg-rose-500/10 active:scale-98 text-sm font-semibold transition-all cursor-pointer text-left"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden absolute top-20 left-0 right-0 bg-dark-950/98 backdrop-blur-md border-b border-slate-800 p-5 space-y-3.5 shadow-2xl flex flex-col select-none max-h-[80vh] overflow-y-auto" style={{ zIndex: 99999 }}>
          {/* Dashboard */}
          <NavLink
            to="/dashboard"
            onClick={() => setIsMobileMenuOpen(false)}
            className={({ isActive }) => 
              `px-4 py-3 rounded-xl text-sm font-semibold border ${
                isActive 
                  ? 'bg-primary/15 border-primary/25 text-primary' 
                  : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
              }`
            }
          >
            Dashboard
          </NavLink>

          {/* Interaction Log */}
          <NavLink
            to="/interaction-log"
            onClick={() => setIsMobileMenuOpen(false)}
            className={({ isActive }) => 
              `px-4 py-3 rounded-xl text-sm font-semibold border ${
                isActive 
                  ? 'bg-primary/15 border-primary/25 text-primary' 
                  : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
              }`
            }
          >
            Interaction Log
          </NavLink>

          {/* Staff Tasks */}
          <NavLink
            to="/staff-tasks"
            onClick={() => setIsMobileMenuOpen(false)}
            className={({ isActive }) => 
              `px-4 py-3 rounded-xl text-sm font-semibold border ${
                isActive 
                  ? 'bg-primary/15 border-primary/25 text-primary' 
                  : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
              }`
            }
          >
            Tasks
          </NavLink>



          {/* Accounts Group */}
          <div className="space-y-1.5">
            <div className="px-4 text-[10px] font-black uppercase tracking-wider text-slate-500">Accounts & Contacts</div>
            <div className="pl-4 space-y-1">
              <NavLink
                to="/accounts"
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) => 
                  `block px-4 py-2.5 rounded-xl text-sm font-semibold border ${
                    isActive 
                      ? 'bg-primary/15 border-primary/25 text-primary' 
                      : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
                  }`
                }
              >
                Accounts Portfolio
              </NavLink>
              <NavLink
                to="/contacts"
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) => 
                  `block px-4 py-2.5 rounded-xl text-sm font-semibold border ${
                    isActive 
                      ? 'bg-primary/15 border-primary/25 text-primary' 
                      : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
                  }`
                }
              >
                Contacts Directory
              </NavLink>
            </div>
          </div>

          {/* Risks Group – visible to all users */}
          <div className="space-y-1.5">
            <div className="px-4 text-[10px] font-black uppercase tracking-wider text-slate-500">Risks & Ingestion</div>
            <div className="pl-4 space-y-1">
              <NavLink
                to="/risks"
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) => 
                  `block px-4 py-2.5 rounded-xl text-sm font-semibold border ${
                    isActive 
                      ? 'bg-primary/15 border-primary/25 text-primary' 
                      : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
                  }`
                }
              >
                Risks Center
              </NavLink>
              <NavLink
                to="/webhooks-demo"
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) => 
                  `block px-4 py-2.5 rounded-xl text-sm font-semibold border ${
                    isActive 
                      ? 'bg-primary/15 border-primary/25 text-primary' 
                      : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
                  }`
                }
              >
                Email Ingestion
              </NavLink>
            </div>
          </div>

          {/* User Directory */}
          <NavLink
            to="/users"
            onClick={() => setIsMobileMenuOpen(false)}
            className={({ isActive }) => 
              `px-4 py-3 rounded-xl text-sm font-semibold border ${
                isActive 
                  ? 'bg-primary/15 border-primary/25 text-primary' 
                  : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
              }`
            }
          >
            User Directory
          </NavLink>

        </div>
      )}

      {/* Toast Popup — Pinned at bottom-right corner of viewport using React Portal */}
      {activeToast && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '360px',
            zIndex: 999999,
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            cursor: 'pointer'
          }}
          onClick={() => { handleNotificationClick(activeToast); setActiveToast(null); }}
        >
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px'
          }}>
            <Bell size={16} color="#1d4ed8" />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', itemsCenter: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
              <span style={{
                fontSize: '10px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#1d4ed8',
                backgroundColor: '#eff6ff',
                padding: '2px 8px',
                borderRadius: '9999px',
                border: '1px solid #bfdbfe'
              }}>
                Notification Alert
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveToast(null); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={14} />
              </button>
            </div>

            <p style={{
              margin: 0,
              fontSize: '12px',
              fontWeight: 700,
              color: '#0f172a',
              lineHeight: '1.45'
            }}>
              {activeToast.message}
            </p>

            <span style={{
              fontSize: '10px',
              color: '#64748b',
              fontWeight: 600,
              marginTop: '6px',
              display: 'block'
            }}>
              {formatNotificationTime(activeToast)} · Click to open
            </span>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}
