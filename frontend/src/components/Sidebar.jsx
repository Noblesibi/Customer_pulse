import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, UserSquare2, AlertOctagon, Terminal, LogOut, Shield, CheckSquare } from 'lucide-react';
import { useStore } from '../store/index.js';

export default function Sidebar() {
  const { user, logout, staffList } = useStore();
  const navigate = useNavigate();

  const directoryUser = (staffList || []).find(s => 
    (s.uid && user?.uid && s.uid === user?.uid) ||
    (s.email && user?.email && s.email.toLowerCase().trim() === user?.email.toLowerCase().trim())
  );
  const userDisplayTag = directoryUser?.position || directoryUser?.userType || directoryUser?.jobRole || user?.position || user?.userType || user?.role || 'Employee';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getLinks = () => {
    const role = user?.role;
    const links = [
      { path: '/dashboard', label: 'Executive Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, roles: ['Admin', 'Executive', 'Sales Manager', 'Employee'] },
      { path: '/accounts', label: 'Accounts CRM', icon: <Users className="w-5 h-5" />, roles: ['Admin', 'Executive', 'Sales Manager', 'Employee'] },
      { path: '/contacts', label: 'Contact Relationship Mapping', icon: <UserSquare2 className="w-5 h-5" />, roles: ['Admin', 'Executive', 'Sales Manager', 'Employee'] },
      { path: '/staff-tasks', label: 'Tasks', icon: <CheckSquare className="w-5 h-5" />, roles: ['Admin', 'Executive', 'Sales Manager', 'Employee'] },
      { path: '/risks', label: 'Risk Center', icon: <AlertOctagon className="w-5 h-5" />, roles: ['Admin', 'Executive', 'Sales Manager'] },
      { path: '/webhooks-demo', label: 'Email Ingestion', icon: <Terminal className="w-5 h-5" />, roles: ['Admin', 'Executive', 'Sales Manager'] },
      { path: '/users', label: 'User Directory', icon: <Shield className="w-5 h-5" />, roles: ['Admin', 'Executive', 'Sales Manager', 'Employee'] }
    ];

    return links.filter(link => link.roles.includes(role));
  };

  return (
    <aside className="w-64 glass border-r border-slate-800/80 min-h-screen flex flex-col justify-between p-5 select-none z-10 shrink-0">
      <div className="space-y-8">
        {/* Brand Logo */}
        <div className="flex flex-col items-start gap-2 px-2">
          <div className="bg-[#0f172a] rounded-xl px-3 py-1.5">
            <img
              src="/nest-digital-logo.png"
              alt="Nest Digital"
              className="h-8 w-auto object-contain"
            />
          </div>
          <div className="border-t border-slate-200/60 pt-2 w-full">
            <span className="font-extrabold text-lg text-slate-800 tracking-wide block">CustomerPulse</span>
            <span className="text-xs text-primary font-semibold tracking-wider uppercase">Rel Intelligence</span>
          </div>
        </div>

        {/* User Quick Info */}
        <div className="bg-dark-900/60 p-3.5 rounded-xl border border-slate-800/80 flex items-center gap-3">
          <div className="bg-primary/10 border border-primary/20 text-primary w-10 h-10 rounded-lg flex items-center justify-center font-bold">
            {user?.name?.substring(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-white truncate">{user?.name}</h4>
            <div className="flex items-center gap-1 mt-0.5">
              <Shield className="w-3 h-3 text-emerald-400" />
              <span className="text-xs text-emerald-400 font-medium">{userDisplayTag}</span>
            </div>
          </div>
        </div>

        {/* Links Navigation */}
        <nav className="space-y-1.5">
          {getLinks().map(link => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) => 
                `flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-200 ${
                  isActive 
                    ? 'bg-primary/15 border-primary/35 text-white shadow-[0_4px_12px_-4px_rgba(37,99,235,0.25)]' 
                    : 'bg-transparent border-transparent text-slate-400 hover:text-white hover:bg-slate-800/40 hover:border-slate-800'
                }`
              }
            >
              {link.icon}
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Logout button */}
      <div>
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-transparent text-sm font-medium text-rose-400 hover:text-white hover:bg-rose-500/10 hover:border-rose-500/20 transition-all duration-200"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>
    </aside>
  );
}
