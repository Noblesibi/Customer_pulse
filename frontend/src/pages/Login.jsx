import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, User, Briefcase, LayoutDashboard, AlertCircle, ExternalLink } from 'lucide-react';
import { useStore } from '../store/index.js';

export default function Login() {
  const { login, loginWithMicrosoft, authLoading, authError } = useStore();
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      setValidationError('Please enter your corporate email address.');
      return;
    }
    if (!emailRegex.test(email.trim())) {
      setValidationError('Please enter a valid email address (e.g. user@company.com).');
      return;
    }
    if (!password.trim()) {
      setValidationError('Please enter your password.');
      return;
    }

    const success = await login(email.trim(), password);
    if (success) {
      navigate(from, { replace: true });
    }
  };

  const handleMSLogin = async () => {
    // Default ms login info mapping to Executive
    const success = await loginWithMicrosoft('executive@pulse.com', 'Executive Corporate User');
    if (success) {
      navigate(from, { replace: true });
    }
  };

  // Preset accounts for ease of evaluation
  // Preset accounts for ease of evaluation
  const setPresetCredentials = (userType) => {
    const presets = {
      admin: { email: 'admin@pulse.com', pass: 'admin123' },
      exec: { email: 'executive@pulse.com', pass: 'exec123' },
      manager: { email: 'manager@pulse.com', pass: 'manager123' },
      employee: { email: 'employee@pulse.com', pass: 'employee123' }
    };
    const creds = presets[userType];
    if (creds) {
      setEmail(creds.email);
      setPassword(creds.pass);
    }
  };

  const [selectedPreset, setSelectedPreset] = useState('');
  const handlePresetSelect = (val) => {
    setSelectedPreset(val);
    setPresetCredentials(val);
  };

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center p-6 relative overflow-hidden select-none">
      {/* Decorative backdrop gradients */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-primary/10 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-emerald-500/5 blur-[120px]" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand header */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="bg-primary/20 p-2.5 rounded-2xl border border-primary/40 text-primary animate-soft-pulse">
            <LayoutDashboard className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-wide">Customer Pulse</h1>
            <p className="text-xs text-primary font-bold tracking-wider uppercase">Relationship Intelligence Hub</p>
          </div>
        </div>

        {/* Auth form card */}
        <div className="glass rounded-3xl p-8 border border-slate-800/80 shadow-2xl">
          <h2 className="text-xl font-bold text-white text-center mb-6">
            Sign In to Dashboard
          </h2>

          {(validationError || authError) && (
            <div className="mb-5 bg-danger/10 border border-danger/30 text-rose-200 text-xs p-3.5 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <span>{validationError || authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Address */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold">Corporate Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input 
                  type="email" 
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-dark-900/60 border border-slate-800 focus:border-primary/50 text-white rounded-xl py-3 pl-11 pr-4 text-sm focus:outline-none transition-colors duration-150"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input 
                  type="password" 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-dark-900/60 border border-slate-800 focus:border-primary/50 text-white rounded-xl py-3 pl-11 pr-4 text-sm focus:outline-none transition-colors duration-150"
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={authLoading}
              className="w-full bg-primary hover:bg-blue-600 active:scale-98 text-white text-sm font-semibold rounded-xl py-3.5 shadow-lg shadow-primary/20 transition-all duration-200"
            >
              {authLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

        </div>

      </div>
    </div>
  );
}
