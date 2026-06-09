import React, { useEffect, useState, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar.jsx';
import Toast from '../components/Toast.jsx';
import { useStore } from '../store/index.js';
import { ArrowUp } from 'lucide-react';

export default function AppLayout() {
  const { user, notifications } = useStore();
  const location = useLocation();
  const [activeToast, setActiveToast] = useState(null);
  const [lastNotificationId, setLastNotificationId] = useState(null);
  const [showBackTop, setShowBackTop] = useState(false);
  const mainRef = useRef(null);

  // Authenticate guard
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Monitor notifications for new alerts to trigger global Toast popups
  useEffect(() => {
    if (notifications.length > 0) {
      const latest = notifications[0];
      // Trigger toast only if it's a new, unread notification that we haven't shown yet
      if (!latest.read && latest.notificationId !== lastNotificationId) {
        setActiveToast({
          type: latest.type,
          message: latest.message
        });
        setLastNotificationId(latest.notificationId);
      }
    }
  }, [notifications, lastNotificationId]);

  // Show back-to-top button after scrolling down 400px
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => setShowBackTop(el.scrollTop > 400);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => {
    if (mainRef.current) mainRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Determine readable title based on path
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard': return 'Executive Dashboard';
      case '/accounts': return 'Account Management CRM';
      case '/contacts': return 'Contact Relationship Mapping';
      case '/risks': return 'Risk Center Control';
      case '/webhooks-demo': return 'Microsoft Graph Ingestion Sandbox';
      case '/users': return 'User Directory Management';
      default: return 'Customer Pulse Overview';
    }
  };

  return (
    <div className="flex flex-col bg-dark-950 min-h-screen">
      {/* Top horizontal navigation bar */}
      <Navbar />

      {/* Main Content Viewport */}
      <main ref={mainRef} className="flex-1 overflow-y-auto p-8 bg-dark-950">
        <Outlet />
      </main>

      {/* Floating Back to Top button */}
      {showBackTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-50 bg-primary text-white p-3 rounded-full shadow-lg cursor-pointer flex items-center justify-center"
          title="Back to top"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}

      {/* Global Realtime Toast Alerts */}
      {activeToast && (
        <Toast 
          type={activeToast.type}
          message={activeToast.message}
          onClose={() => setActiveToast(null)}
        />
      )}
    </div>
  );
}
