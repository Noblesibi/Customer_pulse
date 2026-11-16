import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './store/index.js';

// Layouts & Pages
import AppLayout from './layouts/AppLayout.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Login from './pages/Login.jsx';
import Landing from './pages/Landing.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Accounts from './pages/Accounts.jsx';
import AccountDetails from './pages/AccountDetails.jsx';
import NewAccount from './pages/NewAccount.jsx';
import EditAccount from './pages/EditAccount.jsx';
import Contacts from './pages/Contacts.jsx';
import Risks from './pages/Risks.jsx';
import Users from './pages/Users.jsx';
import InteractionLog from './pages/InteractionLog.jsx';
import LogInteraction from './pages/LogInteraction.jsx';
import StaffTasks from './pages/StaffTasks.jsx';
import AssignStaffTask from './pages/AssignStaffTask.jsx';
import NotificationCenter from './pages/NotificationCenter.jsx';
import UserAccountActivity from './pages/UserAccountActivity.jsx';
import ManagementIntelligence from './pages/ManagementIntelligence.jsx';
import ScoringAdmin from './pages/ScoringAdmin.jsx';

export default function App() {
  const { user } = useStore();

  return (
    <ErrorBoundary>
      <BrowserRouter basename="/CustomerPulse">
        <Routes>
          {/* Public pages */}
          <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />} />
          <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
          <Route path="/landing" element={<Landing />} />

          {/* Protected Dashboard and CRM modules */}
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />

            <Route path="/accounts/new" element={<NewAccount />} />
            <Route path="/accounts/:id/edit" element={<EditAccount />} />
            <Route path="/accounts/:id/user-activity/:uid" element={<UserAccountActivity />} />
            <Route path="/accounts/:id" element={<AccountDetails />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/risks" element={<Risks />} />
            <Route path="/users" element={<Users />} />
            <Route path="/interaction-log" element={<InteractionLog />} />
            <Route path="/log-interaction" element={<LogInteraction />} />
            <Route path="/staff-tasks" element={<StaffTasks />} />
            <Route path="/staff-tasks/new" element={<AssignStaffTask />} />
            <Route path="/notification-center" element={<NotificationCenter />} />
            <Route path="/admin/scoring" element={<ScoringAdmin />} />
          </Route>

          {/* Fallback routing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

