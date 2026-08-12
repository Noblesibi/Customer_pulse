import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useStore } from '../store/index.js';


export default function Login() {
  const { login, authLoading, authError } = useStore();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  const navigate  = useNavigate();
  const location  = useLocation();
  const from      = location.state?.from?.pathname || '/dashboard';

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
    if (success) navigate(from, { replace: true });
  };

  const displayError = validationError || authError;

  return (
    <div style={styles.page}>
      {/* ── Brand header ── */}
      <div style={styles.brand}>
        <div style={styles.brandName}>Customer Pulse</div>
        <div style={styles.brandSub}>RELATIONSHIPS, MEASURED</div>
      </div>

      {/* ── Auth card ── */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Sign In to Dashboard</h2>

        {/* Error banner */}
        {displayError && (
          <div style={styles.errorBox}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{displayError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Corporate Email */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Corporate Email</label>
            <div style={styles.inputWrap}>
              <span style={styles.inputIcon}>
                {/* Mail icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </span>
              <input
                id="login-email"
                type="email"
                placeholder="name@nestgroup.net"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={styles.input}
                onFocus={e => e.target.style.borderColor = '#223670'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>
          </div>

          {/* Password */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Password</label>
            <div style={styles.inputWrap}>
              <span style={styles.inputIcon}>
                {/* Lock icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input
                id="login-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={styles.input}
                onFocus={e => e.target.style.borderColor = '#223670'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
              />
            </div>
          </div>

          {/* Sign In button */}
          <button
            id="login-submit"
            type="submit"
            disabled={authLoading}
            style={{
              ...styles.btn,
              opacity: authLoading ? 0.75 : 1,
              cursor: authLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {authLoading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Inline styles (matches the screenshot exactly) ─────────────────────────
const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #eef2f7 0%, #e8edf5 50%, #dde4ef 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: "'Montserrat', sans-serif",
  },
  brand: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '28px',
  },
  brandName: {
    fontSize: '24px',
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: '-0.3px',
    lineHeight: '1.15',
  },
  brandSub: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#223670',
    letterSpacing: '2.5px',
    textTransform: 'uppercase',
    marginTop: '2px',
  },
  card: {
    background: '#ffffff',
    borderRadius: '16px',
    padding: '36px 40px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: '24px',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#b91c1c',
    fontSize: '12px',
    padding: '10px 14px',
    borderRadius: '10px',
    marginBottom: '18px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#475569',
    letterSpacing: '0.2px',
  },
  inputWrap: {
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    left: '13px',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '11px 14px 11px 40px',
    border: '1.5px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '13px',
    color: '#1e293b',
    background: '#f8fafc',
    outline: 'none',
    boxSizing: 'border-box',
  },
  btn: {
    width: '100%',
    padding: '13px',
    background: '#223670',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '700',
    border: 'none',
    borderRadius: '10px',
    marginTop: '4px',
    letterSpacing: '0.2px',
  },
};
