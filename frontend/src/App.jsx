import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Layouts & Pages
import AppLayout from './layouts/AppLayout.jsx';
import Login from './pages/Login.jsx';
import Landing from './pages/Landing.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Accounts from './pages/Accounts.jsx';
import NewAccount from './pages/NewAccount.jsx';
import EditAccount from './pages/EditAccount.jsx';
import Contacts from './pages/Contacts.jsx';
import Risks from './pages/Risks.jsx';
import WebhooksDemo from './pages/WebhooksDemo.jsx';
import Users from './pages/Users.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public pages */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />

        {/* Protected Dashboard and CRM modules */}
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/accounts/new" element={<NewAccount />} />
          <Route path="/accounts/:id/edit" element={<EditAccount />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/risks" element={<Risks />} />
          <Route path="/webhooks-demo" element={<WebhooksDemo />} />
          <Route path="/users" element={<Users />} />
        </Route>

        {/* Fallback routing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
