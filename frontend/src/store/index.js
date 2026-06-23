import { create } from 'zustand';

const API_BASE = 'http://localhost:5000/api';

export const useStore = create((set, get) => ({
  // Authentication State
  user: (() => {
    const raw = localStorage.getItem('cp_user');
    if (!raw) return null;
    try {
      const u = JSON.parse(raw);
      return u;
    } catch (_) {
      return null;
    }
  })(),
  token: localStorage.getItem('cp_token') || null,
  authError: null,
  authLoading: false,

  login: async (email, password) => {
    set({ authLoading: true, authError: null });
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      
      localStorage.setItem('cp_token', data.token);
      localStorage.setItem('cp_user', JSON.stringify(data.user));
      set({ token: data.token, user: data.user, authLoading: false });
      return true;
    } catch (err) {
      set({ authError: err.message, authLoading: false });
      return false;
    }
  },

  signup: async (email, password, name, role) => {
    set({ authLoading: true, authError: null });
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Signup failed');

      if (data.token) {
        localStorage.setItem('cp_token', data.token);
        localStorage.setItem('cp_user', JSON.stringify(data.user));
        set({ token: data.token, user: data.user });
      }
      set({ authLoading: false });
      return true;
    } catch (err) {
      set({ authError: err.message, authLoading: false });
      return false;
    }
  },

  loginWithMicrosoft: async (email, name) => {
    set({ authLoading: true, authError: null });
    try {
      const res = await fetch(`${API_BASE}/auth/microsoft-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, microsoftToken: 'mock-sso-token' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Microsoft login failed');

      localStorage.setItem('cp_token', data.token);
      localStorage.setItem('cp_user', JSON.stringify(data.user));
      set({ token: data.token, user: data.user, authLoading: false });
      return true;
    } catch (err) {
      set({ authError: err.message, authLoading: false });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('cp_token');
    localStorage.removeItem('cp_user');
    set({ token: null, user: null, authError: null });
  },

  // Accounts CRUD
  accounts: [],
  totalAccounts: 0,
  totalPages: 1,
  currentPage: 1,
  accountsLoading: false,

  fetchAccounts: async (page = 1, search = '', filters = {}) => {
    const token = get().token;
    if (!token) return;
    set({ accountsLoading: true });
    try {
      const queryParams = new URLSearchParams({
        page,
        search,
        ...filters
      }).toString();

      const res = await fetch(`${API_BASE}/accounts?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        set({
          accounts: data.accounts,
          totalAccounts: data.total,
          currentPage: data.page,
          totalPages: data.totalPages,
          accountsLoading: false
        });
      }
    } catch (err) {
      console.error(err);
      set({ accountsLoading: false });
    }
  },

  addAccount: async (accountData) => {
    const token = get().token;
    try {
      const res = await fetch(`${API_BASE}/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(accountData)
      });
      const data = await res.json();
      if (res.ok) {
        set(state => ({ accounts: [data, ...state.accounts] }));
        get().fetchDashboardStats();
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    }
  },

  updateAccount: async (id, updatedData) => {
    const token = get().token;
    try {
      const res = await fetch(`${API_BASE}/accounts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedData)
      });
      const data = await res.json();
      if (res.ok) {
        set(state => ({
          accounts: state.accounts.map(a => (a.accountId === id ? data : a))
        }));
        get().fetchDashboardStats();
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    }
  },

  deleteAccount: async (id) => {
    const token = get().token;
    try {
      const res = await fetch(`${API_BASE}/accounts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        set(state => ({
          accounts: state.accounts.filter(a => a.accountId !== id)
        }));
        get().fetchDashboardStats();
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    }
  },

  fetchHealthExplanation: async (accountId) => {
    const token = get().token;
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE}/accounts/${accountId}/health-explanation`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch (err) {
      console.error('Error fetching health explanation:', err);
      return null;
    }
  },

  // Contacts
  contacts: [],
  contactsLoading: false,

  fetchContacts: async (accountId = '') => {
    const token = get().token;
    if (!token) return;
    set({ contactsLoading: true });
    try {
      const url = accountId ? `${API_BASE}/contacts?accountId=${accountId}` : `${API_BASE}/contacts`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        set({ contacts: data, contactsLoading: false });
      }
    } catch (err) {
      console.error(err);
      set({ contactsLoading: false });
    }
  },

  addContact: async (contactData) => {
    const token = get().token;
    try {
      const res = await fetch(`${API_BASE}/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(contactData)
      });
      const data = await res.json();
      if (res.ok) {
        set(state => ({ contacts: [...state.contacts, data] }));
        get().fetchContacts(contactData.accountId);
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    }
  },

  updateContact: async (id, contactData) => {
    const token = get().token;
    try {
      const res = await fetch(`${API_BASE}/contacts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(contactData)
      });
      const data = await res.json();
      if (res.ok) {
        set(state => ({
          contacts: state.contacts.map(c => (c.contactId === id ? data : c))
        }));
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    }
  },

  deleteContact: async (id, accountId) => {
    const token = get().token;
    try {
      const res = await fetch(`${API_BASE}/contacts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        set(state => ({
          contacts: state.contacts.filter(c => c.contactId !== id)
        }));
        if (accountId) get().fetchContacts(accountId);
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    }
  },

  // Interactions Timeline
  interactions: [],
  interactionsLoading: false,

  fetchInteractions: async (accountId = '', beforeTimestamp = '') => {
    const token = get().token;
    if (!token) return;
    set({ interactionsLoading: true });
    try {
      const query = new URLSearchParams();
      if (accountId) query.append('accountId', accountId);
      if (beforeTimestamp) query.append('beforeTimestamp', beforeTimestamp);

      const res = await fetch(`${API_BASE}/interactions?${query.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        set({ interactions: data, interactionsLoading: false });
      }
    } catch (err) {
      console.error(err);
      set({ interactionsLoading: false });
    }
  },

  addInteraction: async (interactionData) => {
    const token = get().token;
    try {
      const res = await fetch(`${API_BASE}/interactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(interactionData)
      });
      const data = await res.json();
      if (res.ok) {
        set(state => ({
          interactions: [data.interaction, ...state.interactions]
        }));
        get().fetchDashboardStats();
        get().fetchNotifications();
        return data; // returns interaction & health score & analysis
      }
      return null;
    } catch (err) {
      console.error(err);
      return null;
    }
  },

  // Risks Module
  risks: [],
  risksLoading: false,

  fetchRisks: async (accountId = '') => {
    const token = get().token;
    if (!token) return;
    set({ risksLoading: true });
    try {
      const url = accountId ? `${API_BASE}/risks?accountId=${accountId}` : `${API_BASE}/risks`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        set({ risks: data, risksLoading: false });
      }
    } catch (err) {
      console.error(err);
      set({ risksLoading: false });
    }
  },

  resolveRisk: async (id, comments = '') => {
    const token = get().token;
    try {
      const res = await fetch(`${API_BASE}/risks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'Resolved', description: comments })
      });
      const data = await res.json();
      if (res.ok) {
        set(state => ({
          risks: state.risks.map(r => (r.riskId === id ? data : r))
        }));
        get().fetchDashboardStats();
        get().fetchNotifications();
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    }
  },

  // Dashboard Statistics
  dashboardStats: null,
  dashboardLoading: false,

  fetchDashboardStats: async () => {
    const token = get().token;
    if (!token) return;
    set({ dashboardLoading: true });
    try {
      const res = await fetch(`${API_BASE}/dashboard/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        set({ dashboardStats: data, dashboardLoading: false });
      }
    } catch (err) {
      console.error(err);
      set({ dashboardLoading: false });
    }
  },

  // AI Summary
  activeAccountSummary: null,
  summaryLoading: false,

  fetchAccountSummary: async (accountId) => {
    const token = get().token;
    if (!token || !accountId) return;
    set({ summaryLoading: true, activeAccountSummary: null });
    try {
      const res = await fetch(`${API_BASE}/summary/${accountId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        set({ activeAccountSummary: data.summary, summaryLoading: false });
      }
    } catch (err) {
      console.error(err);
      set({ summaryLoading: false });
    }
  },

  // Notifications Bell
  notifications: [],
  unreadNotificationsCount: 0,

  fetchNotifications: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        const unread = data.filter(n => !n.read).length;
        set({ notifications: data, unreadNotificationsCount: unread });
      }
    } catch (err) {
      console.error(err);
    }
  },

  markNotificationRead: async (id) => {
    const token = get().token;
    try {
      const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        set(state => {
          const updated = state.notifications.map(n => (n.notificationId === id ? { ...n, read: true } : n));
          const unread = updated.filter(n => !n.read).length;
          return { notifications: updated, unreadNotificationsCount: unread };
        });
      }
    } catch (err) {
      console.error(err);
    }
  },

  markAllNotificationsRead: async () => {
    const token = get().token;
    try {
      const res = await fetch(`${API_BASE}/notifications/read-all`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        set(state => {
          const updated = state.notifications.map(n => ({ ...n, read: true }));
          return { notifications: updated, unreadNotificationsCount: 0 };
        });
      }
    } catch (err) {
      console.error(err);
    }
  },

  // Staff Directory (for Action Tracking / Mentions)
  staffList: [],

  fetchStaff: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/auth/staff`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        set({ staffList: data });
      }
    } catch (err) {
      console.error(err);
    }
  },

  // Users List (Admin Only)
  usersList: [],
  usersLoading: false,
  fetchUsersList: async () => {
    const token = get().token;
    if (!token) return;
    set({ usersLoading: true });
    try {
      const res = await fetch(`${API_BASE}/auth/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        set({ usersList: data, usersLoading: false });
      } else {
        set({ usersLoading: false });
      }
    } catch (err) {
      console.error(err);
      set({ usersLoading: false });
    }
  },

  addUser: async (userData) => {
    const token = get().token;
    try {
      const res = await fetch(`${API_BASE}/auth/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(userData)
      });
      const data = await res.json();
      if (res.ok) {
        set(state => {
          const exists = state.usersList.some(u => u.uid === data.uid || u.email.toLowerCase() === data.email.toLowerCase());
          const updatedList = exists
            ? state.usersList.map(u => (u.uid === data.uid || u.email.toLowerCase() === data.email.toLowerCase() ? data : u))
            : [...state.usersList, data];
          return { usersList: updatedList };
        });
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    }
  },

  deleteUser: async (uid) => {
    const token = get().token;
    try {
      const res = await fetch(`${API_BASE}/auth/users/${uid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        set(state => ({ usersList: state.usersList.filter(u => u.uid !== uid) }));
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    }
  },

  // ── MY TASKS (interactions where current user is @mentioned) ──
  myTasks: [],
  myTasksLoading: false,

  fetchMyTasks: async () => {
    const token = get().token;
    if (!token) return;
    set({ myTasksLoading: true });
    try {
      const res = await fetch(`${API_BASE}/interactions/my-tasks`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        set({ myTasks: data, myTasksLoading: false });
      } else {
        set({ myTasksLoading: false });
      }
    } catch (err) {
      console.error(err);
      set({ myTasksLoading: false });
    }
  },

  // ── REPLIES ──
  repliesByInteraction: {}, // { [interactionId]: [replies] }

  fetchReplies: async (interactionId) => {
    const token = get().token;
    if (!token || !interactionId) return;
    try {
      const res = await fetch(`${API_BASE}/interactions/${interactionId}/replies`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        set(state => ({
          repliesByInteraction: {
            ...state.repliesByInteraction,
            [interactionId]: data
          }
        }));
      }
    } catch (err) {
      console.error(err);
    }
  },

  replyToInteraction: async (interactionId, text) => {
    const token = get().token;
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE}/interactions/${interactionId}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      if (res.ok) {
        // Append reply locally
        set(state => ({
          repliesByInteraction: {
            ...state.repliesByInteraction,
            [interactionId]: [
              ...(state.repliesByInteraction[interactionId] || []),
              data
            ]
          },
          // Update myTasks replyStatus for this interaction
          myTasks: state.myTasks.map(t =>
            t.interactionId === interactionId
              ? { ...t, replyStatus: 'Replied', replies: [...(t.replies || []), data] }
              : t
          )
        }));
        get().fetchNotifications();
        return data;
      }
      return null;
    } catch (err) {
      console.error(err);
      return null;
    }
  },

  updateTaskStatus: async (interactionId, mentionUid, status, completionNote = '', forwardToUid = '', forwardToName = '', completionDate = null) => {
    const token = get().token;
    if (!token) return false;
    try {
      const res = await fetch(`${API_BASE}/interactions/${interactionId}/task-status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ mentionUid, status, completionNote, forwardToUid, forwardToName, completionDate })
      });
      const data = await res.json();
      if (res.ok) {
        set(state => ({
          interactions: state.interactions.map(i => {
            if (i.interactionId === interactionId) {
              return { ...i, actionMentions: data.actionMentions || i.actionMentions };
            }
            return i;
          }),
          myTasks: state.myTasks.map(t => {
            if (t.interactionId === interactionId) {
              return { ...t, actionMentions: data.actionMentions || t.actionMentions };
            }
            return t;
          })
        }));
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error updating task status in store:', err);
      return false;
    }
  },

  // ── ACTIVITY LOGS ──
  activityLogs: [],
  activityLogsLoading: false,

  fetchActivityLogs: async () => {
    const token = get().token;
    if (!token) return;
    set({ activityLogsLoading: true });
    try {
      const res = await fetch(`${API_BASE}/activity-logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        set({ activityLogs: data, activityLogsLoading: false });
      } else {
        set({ activityLogsLoading: false });
      }
    } catch (err) {
      console.error('Error fetching activity logs:', err);
      set({ activityLogsLoading: false });
    }
  }
}));

