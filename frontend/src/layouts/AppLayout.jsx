import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar.jsx';
import Toast from '../components/Toast.jsx';
import { useStore } from '../store/index.js';

export default function AppLayout() {
  const { user, notifications } = useStore();
  const location = useLocation();
  const [activeToast, setActiveToast] = useState(null);
  const [lastNotificationId, setLastNotificationId] = useState(null);

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
      <main className="flex-1 overflow-y-auto p-8 bg-dark-950">
        <Outlet />
      </main>

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
