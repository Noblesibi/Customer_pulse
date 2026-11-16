import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('CustomerPulse ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/CustomerPulse/dashboard';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #f8fafc 0%, #eef2f6 100%)',
          padding: '24px',
          fontFamily: 'Montserrat, sans-serif'
        }}>
          <div style={{
            maxWidth: '540px',
            width: '100%',
            background: '#ffffff',
            borderRadius: '20px',
            padding: '36px 32px',
            boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.08), 0 0 1px 1px rgba(0,0,0,0.04)',
            border: '1px solid #e2e8f0',
            textAlign: 'center'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: '#fef2f2',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <AlertTriangle size={28} />
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.6, margin: '0 0 24px' }}>
              An unexpected error occurred while rendering this page. The system caught it to prevent an unhandled crash.
            </p>

            {this.state.error && (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '24px',
                textAlign: 'left',
                overflowX: 'auto',
                fontSize: '12px',
                color: '#dc2626',
                fontFamily: 'monospace'
              }}>
                {this.state.error.toString()}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={this.handleReload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  background: '#223670',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={15} /> Reload Page
              </button>

              <button
                onClick={this.handleGoHome}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  background: '#f1f5f9',
                  color: '#334155',
                  fontSize: '13px',
                  fontWeight: 700,
                  border: '1px solid #e2e8f0',
                  cursor: 'pointer'
                }}
              >
                <Home size={15} /> Dashboard Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
