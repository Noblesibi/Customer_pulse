import React, { useEffect, useState, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar.jsx';
import { useStore } from '../store/index.js';
import { ArrowUp } from 'lucide-react';

export default function AppLayout() {
  const { user } = useStore();
  const location = useLocation();
  const [showBackTop, setShowBackTop] = useState(false);
  const mainRef = useRef(null);

  // Authenticate guard
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }



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

  const showNavbar = !(location.pathname.startsWith('/accounts/') && !location.pathname.endsWith('/edit') && !location.pathname.endsWith('/new'));

  return (
    <div className="flex flex-col bg-dark-950 min-h-screen">
      {/* Top horizontal navigation bar */}
      {showNavbar && <Navbar />}

      {/* Main Content Viewport */}
      <main ref={mainRef} className="flex-1 overflow-y-auto p-4 md:p-8 bg-dark-950 flex flex-col">
        <div className="flex-1 bg-dark-900 border border-dark-800 rounded-2xl shadow-sm flex flex-col">
          <Outlet />
        </div>
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


    </div>
  );
}
