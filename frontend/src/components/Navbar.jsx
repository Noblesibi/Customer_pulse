import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bell, Check, MailOpen, AlertCircle, LogOut, Shield, ChevronDown, Activity } from 'lucide-react';
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
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const notifDropdownRef = useRef(null);
  const profileDropdownRef = useRef(null);

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
      { path: '/contacts',        label: 'Contacts',   roles: ['Admin', 'Sales Manager', 'Employee'] },
      { path: '/risks',           label: 'Risks',      roles: ['Admin', 'Executive', 'Sales Manager'] },
      { path: '/webhooks-demo',   label: 'Webhooks',   roles: ['Admin', 'Sales Manager'] },
      { path: '/users',           label: 'Users',      roles: ['Admin'] }
    ];

    return links.filter(link => link.roles.includes(role));
  };

  return (
    <header className="h-20 glass border-b border-slate-800/80 px-8 flex items-center justify-between z-30 sticky top-0 shrink-0 select-none">
      
      {/* Brand Logo - click to go back to landing page */}
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
        <div className="bg-[#0f172a] rounded-xl px-3 py-1.5">
          <img
            src="/nest-digital-logo.png"
            alt="Nest Digital"
            className="h-8 w-auto object-contain"
          />
        </div>
        <div className="hidden sm:block border-l border-slate-300/40 pl-3">
          <span className="font-extrabold text-sm text-black tracking-wide block">CustomerPulse</span>
          <span className="text-[9px] text-primary font-semibold tracking-wider uppercase leading-none">Rel Intelligence</span>
        </div>
      </div>

      {/* Horizontal Links Navigation */}
      <nav className="hidden lg:flex items-center gap-0.5">
        {getLinks().map(link => (
          <NavLink
            key={link.path}
            to={link.path}
            className={({ isActive }) => 
              `px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                isActive 
                  ? 'bg-primary/10 border-primary/25 text-primary' 
                  : 'bg-transparent border-transparent text-primary/70 hover:text-primary hover:bg-primary/5'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      {/* Right Actions Block */}
      <div className="flex items-center gap-4">
        
        {/* Notification Bell */}
        <div className="relative" ref={notifDropdownRef}>
          <button 
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="relative bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/60 hover:bg-slate-800 hover:text-white transition-all duration-200 cursor-pointer"
          >
            <Bell className="w-4.5 h-4.5 text-slate-300" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-danger text-white text-[9px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center animate-bounce border border-dark-950">
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 mt-3 w-96 glass border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 animate-soft-pulse duration-500">
              {/* Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-dark-900/60">
                <h3 className="font-bold text-xs text-white">Notifications Alert Center</h3>
                {unreadNotificationsCount > 0 && (
                  <button 
                    onClick={markAllNotificationsRead}
                    className="text-[10px] text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No recent notifications
                  </div>
                ) : (
                  notifications.map(item => (
                    <div 
                      key={item.notificationId}
                      className={`p-3.5 border-b border-slate-800/50 flex gap-3 text-xs transition-colors duration-150 ${
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
                        <span className="text-[10px] text-slate-500 block mt-1.5">
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
              <span className="text-xs font-bold text-white block truncate">{user?.name}</span>
              <span className="text-[9px] text-emerald-500 font-semibold uppercase mt-0.5 block truncate">
                {user?.userType || user?.role}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-3 w-56 glass border border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 animate-soft-pulse duration-500">
              <div className="px-3.5 py-2.5 border-b border-slate-800/80 mb-1 leading-none md:hidden">
                <span className="text-xs font-bold text-white block truncate">{user?.name}</span>
                <span className="text-[9px] text-emerald-500 font-semibold uppercase mt-1 block truncate">
                  {user?.userType || user?.role}
                </span>
              </div>
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-rose-500 hover:bg-rose-500/10 active:scale-98 text-xs font-semibold transition-all cursor-pointer text-left"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
