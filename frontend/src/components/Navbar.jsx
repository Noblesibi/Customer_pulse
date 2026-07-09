import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Bell, Check, MailOpen, AlertCircle, LogOut, Shield, ChevronDown, Activity, Menu, X } from 'lucide-react';
import { useStore } from '../store/index.js';

export default function Navbar() {
  const { 
    user,
    logout,
    notifications, 
    unreadNotificationsCount, 
    fetchNotifications, 
    markNotificationRead, 
    markAllNotificationsRead 
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

  // Periodically fetch notifications to simulate Firestore push listeners
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => {
      fetchNotifications();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

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
      { path: '/activity-log',    label: 'Activity Log',   roles: ['Admin', 'Executive', 'Sales Manager', 'Employee'] }
    ];

    return links.filter(link => link.roles.includes(role));
  };

  return (
    <header className="h-20 glass border-b border-slate-800/80 px-8 flex items-center justify-between z-30 sticky top-0 shrink-0 select-none">
      
      {/* Brand Logo - click to go back to landing page */}
      <div className="flex items-center gap-3 cursor-pointer shrink-0" onClick={() => navigate('/')}>
        <div className="flex items-center gap-2">
          {/* Circular Nest Logo */}
          <div className="h-8 w-11 overflow-hidden flex items-center justify-start shrink-0">
            <img
              src="/nest-digital-logo.png"
              alt="Nest Digital Logo"
              className="h-8 max-w-none object-cover object-left"
            />
          </div>
          {/* Logo Text in HTML */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex flex-col text-[#0f172a] leading-none text-left">
              <span className="font-black text-xs tracking-tight">NeST</span>
              <span className="font-extrabold text-[8px] tracking-widest text-[#0f172a]/70">DIGITAL</span>
            </div>
            <div className="h-6 w-px bg-slate-300/60 mx-1"></div>
            <span className="text-[9px] font-black text-[#0f172a]/80 uppercase tracking-wider text-left leading-tight hidden md:block">
              Engineering<br />Transformation
            </span>
          </div>
        </div>
        <div className="hidden sm:block border-l border-slate-300/40 pl-3">
          <span className="font-extrabold text-sm text-black tracking-wide block">CustomerPulse</span>
          <span className="text-xs text-primary font-semibold tracking-wider uppercase leading-none">Rel Intelligence</span>
        </div>
      </div>

      {/* Horizontal Links Navigation */}
      <nav className="hidden lg:flex items-center gap-2 shrink-0">
        {/* Dashboard */}
        <NavLink
          to="/dashboard"
          className={({ isActive }) => 
            `px-3 py-1.5 rounded-lg text-sm font-semibold border whitespace-nowrap transition-colors ${
              isActive 
                ? 'bg-primary/10 border-primary/25 text-primary' 
                : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
            }`
          }
        >
          Dashboard
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
            className="px-3 py-1.5 text-sm font-semibold transition-colors"
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
            className="pr-2.5 pl-1 py-1.5 cursor-pointer flex items-center justify-center hover:text-primary border-l border-transparent transition-colors"
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
                      : 'text-slate-300 hover:text-primary'
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
                      : 'text-slate-300 hover:text-primary'
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
            className="px-3 py-1.5 text-sm font-semibold transition-colors"
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
            className="pr-2.5 pl-1 py-1.5 cursor-pointer flex items-center justify-center hover:text-primary border-l border-transparent transition-colors"
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
                      : 'text-slate-300 hover:text-primary'
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
                      : 'text-slate-300 hover:text-primary'
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
            `px-3 py-1.5 rounded-lg text-sm font-semibold border whitespace-nowrap transition-colors ${
              isActive 
                ? 'bg-primary/10 border-primary/25 text-primary' 
                : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
            }`
          }
        >
          User Directory
        </NavLink>

        {/* Activity Log */}
        <NavLink
          to="/activity-log"
          className={({ isActive }) => 
            `px-3 py-1.5 rounded-lg text-sm font-semibold border whitespace-nowrap transition-colors ${
              isActive 
                ? 'bg-primary/10 border-primary/25 text-primary' 
                : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
            }`
          }
        >
          Activity Log
        </NavLink>
      </nav>

      {/* Right Actions Block */}
      <div className="flex items-center gap-4 shrink-0">
        
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
            <div className="absolute right-0 mt-3 w-96 glass border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 animate-soft-pulse duration-500">
              {/* Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-dark-900/60">
                <h3 className="font-bold text-sm text-white">Notifications Alert Center</h3>
                {unreadNotificationsCount > 0 && (
                  <button 
                    onClick={markAllNotificationsRead}
                    className="text-xs text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No recent notifications
                  </div>
                ) : (
                  notifications.map(item => (
                    <div 
                      key={item.notificationId}
                      className={`p-3.5 border-b border-slate-800/50 flex gap-3 text-sm transition-colors duration-150 ${
                        item.read ? 'opacity-65 hover:bg-slate-800/20' : 'bg-primary/5 hover:bg-primary/10'
                      }`}
                    >
                      <div className="mt-0.5">
                        {item.type === 'New Risk' || item.type === 'Health Score Drop' ? (
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        ) : (
                          <MailOpen className="w-4 h-4 text-blue-400 shrink-0" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-200 font-medium leading-relaxed">{item.message}</p>
                        <span className="text-xs text-slate-500 block mt-1.5">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {!item.read && (
                        <button 
                          onClick={() => markNotificationRead(item.notificationId)}
                          className="text-slate-400 hover:text-emerald-400 p-0.5 transition-colors self-center cursor-pointer"
                          title="Mark read"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
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
              <span className="text-xs text-emerald-500 font-semibold uppercase mt-0.5 block truncate">
                {user?.userType || user?.role}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-3 w-56 glass border border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 animate-soft-pulse duration-500">
              <div className="px-3.5 py-2.5 border-b border-slate-800/80 mb-1 leading-none md:hidden">
                <span className="text-sm font-bold text-black block truncate">{user?.name}</span>
                <span className="text-xs text-emerald-500 font-semibold uppercase mt-1 block truncate">
                  {user?.userType || user?.role}
                </span>
              </div>
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
        <div className="lg:hidden absolute top-20 left-0 right-0 bg-dark-950/98 backdrop-blur-md border-b border-slate-800 p-5 space-y-3.5 z-40 shadow-2xl flex flex-col select-none max-h-[80vh] overflow-y-auto">
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

          {/* Activity Log */}
          <NavLink
            to="/activity-log"
            onClick={() => setIsMobileMenuOpen(false)}
            className={({ isActive }) => 
              `px-4 py-3 rounded-xl text-sm font-semibold border ${
                isActive 
                  ? 'bg-primary/15 border-primary/25 text-primary' 
                  : 'bg-transparent border-transparent text-primary/70 hover:text-primary'
              }`
            }
          >
            Activity Log
          </NavLink>
        </div>
      )}
    </header>
  );
}
