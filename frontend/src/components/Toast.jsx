import React, { useEffect } from 'react';
import { Bell, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

export default function Toast({ type, message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 6000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const styles = {
    'New Risk': {
      bg: 'bg-red-500/20 border-red-500/40 text-red-200',
      icon: <AlertTriangle className="text-red-400 w-5 h-5 shrink-0" />
    },
    'Health Score Drop': {
      bg: 'bg-amber-500/20 border-amber-500/40 text-amber-200',
      icon: <AlertTriangle className="text-amber-400 w-5 h-5 shrink-0" />
    },
    'New Interaction': {
      bg: 'bg-blue-500/20 border-blue-500/40 text-blue-200',
      icon: <Bell className="text-blue-400 w-5 h-5 shrink-0" />
    },
    'Success': {
      bg: 'bg-green-500/20 border-green-500/40 text-green-200',
      icon: <CheckCircle className="text-green-400 w-5 h-5 shrink-0" />
    },
    'default': {
      bg: 'bg-slate-800/80 border-slate-700/80 text-slate-200',
      icon: <Info className="text-primary w-5 h-5 shrink-0" />
    }
  };

  const current = styles[type] || styles['default'];

  return (
    <div className={`fixed bottom-5 right-5 z-50 glass flex items-start gap-3 p-4 rounded-xl border ${current.bg} max-w-sm shadow-2xl animate-soft-pulse transition-all duration-300`}>
      {current.icon}
      <div className="flex-1 text-sm font-medium">
        <div className="font-bold mb-0.5 text-white">{type || 'Notification'}</div>
        <div className="opacity-90">{message}</div>
      </div>
      <button 
        onClick={onClose} 
        className="text-slate-400 hover:text-white transition-colors duration-150"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
