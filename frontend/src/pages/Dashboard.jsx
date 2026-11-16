import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, CheckCircle2, AlertTriangle, AlertOctagon, Activity,
  ArrowUpRight, ArrowDownRight, Sparkles, Send, Clock, CheckCheck,
  MessageSquare, Building2, CheckSquare, CalendarClock, X, ThumbsUp, ShieldAlert,
  Plus, TrendingUp, Target, BarChart3, ChevronRight, ChevronLeft, Calendar, Flag,
  Map as MapIcon, Compass, PartyPopper
} from 'lucide-react';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import { useStore } from '../store/index.js';
import { formatDate, formatDateTime } from '../utils/dateFormat.js';
import TeamMemberSelect from '../components/TeamMemberSelect.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
export default function Dashboard() {
  const navigate = useNavigate();
  const {
    dashboardStats, dashboardLoading, fetchDashboardStats,
    user,
    replyToInteraction,
    usersList, fetchUsersList,
    interactions, fetchInteractions,
    updateTaskStatus,
    staffList, fetchStaff,
    staffTasks, fetchStaffTasks, updateStaffTaskStatus,
    risks, fetchRisks,
    accounts, fetchAccounts,
    contacts, fetchContacts,
    token
  } = useStore();

  const [completionModalState, setCompletionModalState] = useState({ isOpen: false, task: null, newStatus: '' });
  const [completionNote, setCompletionNote] = useState('');
  const [completionFile, setCompletionFile] = useState(null);
  const [taskStatuses, setTaskStatuses] = useState({});

  const [forwardModalState, setForwardModalState] = useState({ isOpen: false, task: null, newStatus: 'Forwarded' });
  const [forwardToUid, setForwardToUid] = useState('');
  const [forwardReason, setForwardReason] = useState('');
  const [forwardFile, setForwardFile] = useState(null);

  const [declineModalState, setDeclineModalState] = useState({ isOpen: false, task: null });
  const [declineReason, setDeclineReason] = useState('');

  const [acceptModalState, setAcceptModalState] = useState({ isOpen: false, task: null });
  const [acceptNote, setAcceptNote] = useState('');
  const [taskTab, setTaskTab] = useState('overdue'); // 'overdue' | 'today' | 'all' | 'new'
  const [taskPage, setTaskPage] = useState(1);
  const [notifiedTasks, setNotifiedTasks] = useState(new Set());

  const [notifyToast, setNotifyToast] = useState(null);
  const [isAlertDismissed, setIsAlertDismissed] = useState(() => {
    return sessionStorage.getItem('dashboard_health_alert_dismissed') === 'true';
  });

  const handleDismissAlert = () => {
    setIsAlertDismissed(true);
    sessionStorage.setItem('dashboard_health_alert_dismissed', 'true');
  };

  const handleNotifyTask = async (task) => {
    const taskKey = task.taskId || task.uid || task.id || task.interactionId;
    if (!task.accountId) {
      setNotifyToast('This task is not linked to an account, so there are no stakeholders to notify.');
      setTimeout(() => setNotifyToast(null), 3500);
      return;
    }
    try {
      const res = await fetch('/CustomerPulse/api/risks/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          accountId: task.accountId,
          risk: {
            key: `task-${taskKey}`,
            title: task.taskHeader || task.title || task.description || 'Task needs attention',
            severity: task.priority || 'Medium',
            category: task.isInteractionTask ? 'Interaction Task' : 'Staff Task',
            description: task.description || ''
          }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send notification');
      const names = (data.recipients || []).map(r => r.name).join(', ');
      setNotifyToast(`Notified ${names} via email & in-app (as ${data.senderRole})`);
      setNotifiedTasks(prev => new Set(prev).add(taskKey));
    } catch (err) {
      setNotifyToast(err.message);
    } finally {
      setTimeout(() => setNotifyToast(null), 3500);
    }
  };

  const [managementData, setManagementData] = useState(null);
  const [managementDrillDown, setManagementDrillDown] = useState(null);

  useEffect(() => {
    if (!token) return;
    const fetchManagement = async () => {
      try {
        const res = await fetch('/CustomerPulse/api/dashboard/management', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) setManagementData(await res.json());
      } catch (err) { console.error('Failed to load management data', err); }
    };
    fetchManagement();
  }, [token]);

  const uploadFile = async (file) => {
    if (!file) return null;
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
      });
      const token = useStore.getState().token;
      const res = await fetch('/CustomerPulse/api/interactions/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: file.name, type: file.type, base64 })
      });
      if (res.ok) return await res.json();
      else console.error('File upload failed:', await res.json());
    } catch (err) { console.error('Error uploading file:', err); }
    return null;
  };

  const handleForwardSubmit = async (e) => {
    e.preventDefault();
    const { task, newStatus } = forwardModalState;
    if (!forwardToUid) return;
    const selectedUser = (staffList || []).find(s => s.uid === forwardToUid);
    if (!selectedUser) return;
    const taskKey = task.isInteractionTask ? `${task.interactionId}-${task.uid}` : task.taskId;
    if (task.isInteractionTask) {
      const ok = await updateTaskStatus(task.interactionId, task.uid, newStatus, forwardReason.trim(), selectedUser.uid, selectedUser.name);
      if (ok) {
        if (forwardReason.trim() || forwardFile) {
          let finalNote = `Forwarded Task Note: ${forwardReason.trim() || 'No note provided'}`;
          if (forwardFile) {
            const uploaded = await uploadFile(forwardFile);
            if (uploaded && uploaded.url) finalNote += `\n\n📎 Attached: [${uploaded.name}](${uploaded.url})`;
          }
          await replyToInteraction(task.interactionId, finalNote);
        }
        fetchInteractions();
      }
    } else {
      let finalNote = `Forwarded Task Note: ${forwardReason.trim() || 'No note provided'}`;
      if (forwardFile) {
        const uploaded = await uploadFile(forwardFile);
        if (uploaded && uploaded.url) finalNote += `\n\n📎 Attached: [${uploaded.name}](${uploaded.url})`;
      }
      const ok = await updateStaffTaskStatus(task.taskId, newStatus, '', finalNote, selectedUser.uid, selectedUser.name);
      if (ok) fetchStaffTasks('assigned-to-me');
    }
    setTaskStatuses(prev => ({
      ...prev,
      [taskKey]: newStatus,
      [`${taskKey}-forwardedToName`]: selectedUser.name,
      [`${taskKey}-note`]: forwardReason.trim()
    }));
    setForwardModalState({ isOpen: false, task: null, newStatus: 'Forwarded' });
    setForwardToUid(''); setForwardReason(''); setForwardFile(null);
  };

  const handleStatusChange = async (task, newStatus) => {
    const taskKey = task.isInteractionTask ? `${task.interactionId}-${task.uid}` : task.taskId;
    const currentLower = (taskStatuses[taskKey] || task.status || '').toLowerCase();
    if (
      currentLower === 'completed' ||
      currentLower === 'complete' ||
      currentLower === 'declined' ||
      currentLower === 'decline' ||
      currentLower === 'accepted & completed'
    ) {
      return;
    }

    if (newStatus === 'Completed') {
      setCompletionModalState({ isOpen: true, task, newStatus: 'Completed' });
      setCompletionNote('');
      setCompletionFile(null);
    } else if (newStatus === 'Accept') {
      setAcceptModalState({ isOpen: true, task });
      setAcceptNote('');
    } else if (newStatus === 'Decline') {
      setDeclineModalState({ isOpen: true, task });
      setDeclineReason('');
    } else if (newStatus === 'Forwarded') {
      setForwardModalState({ isOpen: true, task, newStatus: 'Forwarded' });
      setForwardToUid('');
      setForwardReason('');
      setForwardFile(null);
    } else if (newStatus === 'Task Assigned' || newStatus === 'Pending') {
      if (task.isInteractionTask) {
        const ok = await updateTaskStatus(task.interactionId, task.uid, 'Pending');
        if (ok) fetchInteractions();
      } else {
        const ok = await updateStaffTaskStatus(task.taskId, 'Task Assigned');
        if (ok) fetchStaffTasks('assigned-to-me');
      }
      setTaskStatuses(prev => ({ ...prev, [taskKey]: 'Task Assigned' }));
    }
  };

  const resolveTaskNote = (task) => {
    const taskKey = task.isInteractionTask ? `${task.interactionId}-${task.uid}` : task.taskId;
    const sessionNote = taskStatuses[`${taskKey}-note`];
    if (sessionNote) return { label: 'Status Note', text: sessionNote };

    if (task.completionNote) return { label: 'Completion Note', text: task.completionNote };
    if (task.declineReason) return { label: 'Decline Reason', text: task.declineReason };
    if (task.forwardReason) return { label: 'Forward Reason', text: task.forwardReason };
    if (task.acceptNote) return { label: 'Acceptance Note', text: task.acceptNote };

    if (task.isInteractionTask && task.originalInteraction?.replies?.length > 0) {
      const replies = task.originalInteraction.replies;
      for (let i = replies.length - 1; i >= 0; i--) {
        const repText = replies[i].text || replies[i].replyText || replies[i].message || '';
        if (repText.startsWith('Task Completion Note:')) {
          return { label: 'Completion Note', text: repText.replace('Task Completion Note:', '').trim() };
        }
        if (repText.startsWith('Acceptance Note:')) {
          return { label: 'Acceptance Note', text: repText.replace('Acceptance Note:', '').trim() };
        }
        if (repText.startsWith('Decline Reason:')) {
          return { label: 'Decline Reason', text: repText.replace('Decline Reason:', '').trim() };
        }
        if (repText.startsWith('Forwarded Task Note:')) {
          return { label: 'Forwarding Note', text: repText.replace('Forwarded Task Note:', '').trim() };
        }
      }
    }

    if (task.notes && typeof task.notes === 'string' && task.notes.trim()) {
      return { label: 'Note', text: task.notes.trim() };
    }
    if (task.comments && typeof task.comments === 'string' && task.comments.trim()) {
      return { label: 'Comments', text: task.comments.trim() };
    }

    return null;
  };


  useEffect(() => {
    fetchDashboardStats();
    fetchInteractions();
    fetchStaff();
    fetchStaffTasks('assigned-to-me');
    fetchRisks();
    fetchAccounts(1, '', { limit: 1000 });
    fetchContacts();
    if (user?.userType === 'CEO') fetchUsersList();
    const interval = setInterval(() => {
      fetchDashboardStats();
      fetchInteractions();
      fetchStaff();
      fetchStaffTasks('assigned-to-me');
      fetchRisks();
      fetchAccounts(1, '', { limit: 1000 });
      if (user?.userType === 'CEO') fetchUsersList();
    }, 5000);
    return () => clearInterval(interval);
  }, [user]);

  if (dashboardLoading && !dashboardStats) {
    return (
      <LoadingSpinner fullPage size="xl" text="Loading dashboard…" />
    );
  }

  const cards = dashboardStats?.cards || { totalAccounts: 0, healthyAccounts: 0, atRiskAccounts: 0, criticalAccounts: 0, activeContacts: 0, monthlyInteractions: 0 };
  const charts = dashboardStats?.charts || { sentimentDistribution: { Positive: 0, Neutral: 0, Negative: 0 }, riskCategories: {}, industryTrend: [], engagementFrequency: {} };
  const widgets = dashboardStats?.widgets || { topRisks: [], aiRecommendations: [], upcomingCommitments: [] };

  // Real Health alerts & drops data from PostgreSQL via dashboardStats or fallback to accounts
  const healthAlertsData = dashboardStats?.healthAlerts || {
    droppingCount: 0,
    droppingAccounts: [],
    lowestAccounts: [],
    isAllStable: true
  };

  const droppingAccounts = (healthAlertsData.droppingAccounts && healthAlertsData.droppingAccounts.length > 0)
    ? healthAlertsData.droppingAccounts
    : (accounts || []).filter(a => Number(a.scoreTrend) < 0 || (a.previousHealthScore && a.healthScore < a.previousHealthScore));

  const droppingCount = healthAlertsData.droppingCount ?? droppingAccounts.length;

  const lowestAccounts = (healthAlertsData.lowestAccounts && healthAlertsData.lowestAccounts.length > 0)
    ? healthAlertsData.lowestAccounts
    : [...(accounts || [])].sort((a, b) => (Number(a.healthScore) || 0) - (Number(b.healthScore) || 0)).slice(0, 5);

  // Real Celebrations data from PostgreSQL via dashboardStats
  const celebrationsData = dashboardStats?.celebrations || { today: 0, tomorrow: 0, thisWeek: 0, draftsReady: 0, sent: 0, total: 0 };
  const todayGreetingsCount = celebrationsData.today || 0;
  const thisWeekGreetingsCount = celebrationsData.thisWeek || 0;
  const draftsReadyCount = celebrationsData.draftsReady || 0;

  // Real Open Risks count from PostgreSQL via dashboardStats or store risks
  const openRisksCount = dashboardStats?.openRisksCount !== undefined
    ? dashboardStats.openRisksCount
    : (risks || []).filter(r => r.status === 'Open').length;

  const sentimentData = [
    { name: 'Positive', value: charts.sentimentDistribution.Positive || 0, color: '#10b981' },
    { name: 'Neutral', value: charts.sentimentDistribution.Neutral || 0, color: '#f59e0b' },
    { name: 'Negative', value: charts.sentimentDistribution.Negative || 0, color: '#ef4444' }
  ].filter(d => d.value > 0);

  const riskData = Object.entries(charts.riskCategories).map(([category, count]) => ({ category, Count: count }));
  const engagementData = Object.entries(charts.engagementFrequency).map(([source, count]) => ({ source, Count: count }));
  const trendData = charts.industryTrend || [];

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const canViewAllTasks = user?.role === 'Admin' || user?.userType === 'Admin' || user?.name?.toLowerCase().includes('nazneen') || user?.email?.toLowerCase().includes('nazneen') || user?.email === 'nj@gmail.com';

  // Task processing
  const realMyTasks = [];
  interactions.forEach(item => {
    if (Array.isArray(item.actionMentions)) {
      item.actionMentions.forEach(mention => {
        const forwardedToName = taskStatuses[`${item.interactionId}-${mention.uid}-forwardedToName`] || mention.forwardedToName;
        const forwardedToUid = mention.forwardedToUid || null;
        const isForMe = mention.uid === user?.uid || forwardedToUid === user?.uid || (forwardedToName && user?.name && forwardedToName.toLowerCase() === user?.name.toLowerCase());
        if (isForMe) {
          const taskDesc = mention.task || item.messageText || item.subject || 'Task Assignment';
          const fallbackHeader = taskDesc.split(/[.!?\n]/)[0].trim();
          const cleanHeader = fallbackHeader.length <= 50 ? fallbackHeader : (fallbackHeader.slice(0, 47) + '...');
          realMyTasks.push({
            ...mention,
            taskId: mention.taskId || `${item.interactionId}-${mention.uid}`,
            title: mention.taskHeader || cleanHeader,
            taskHeader: mention.taskHeader || cleanHeader,
            description: mention.task || item.messageText || item.subject,
            assignedToUid: mention.uid,
            assignedToName: mention.name,
            assignedByUid: item.loggedByUid,
            assignedByName: item.loggedByName || 'System Admin',
            forwardedToUid: forwardedToUid,
            forwardedToName: forwardedToName,
            priority: mention.priority || 'Medium',
            dueDate: mention.dueDate || null,
            status: mention.status || 'Pending',
            accountId: item.accountId,
            companyName: item.companyName || 'External Account',
            contactName: item.contactName || item.contact || mention.contactName || '',
            loggedByName: item.loggedByName || 'System Admin',
            subject: item.subject,
            timestamp: item.timestamp,
            date: item.date,
            time: item.time,
            originalInteraction: item,
            isInteractionTask: true
          });
        }
      });
    }
  });

  const myStaffTasks = (staffTasks || [])
    .filter(t => t.assignedToUid === user?.uid || t.forwardedToUid === user?.uid || (t.forwardedToName && user?.name && t.forwardedToName.toLowerCase() === user?.name.toLowerCase()))
    .map(t => ({
      ...t,
      taskHeader: t.title,
      task: t.description,
      contactName: t.contactName || t.contact || '',
      isInteractionTask: false
    }));

  const parseDateToTime = (raw) => {
    if (!raw) return 0;
    if (raw instanceof Date) return isNaN(raw.getTime()) ? 0 : raw.getTime();
    if (typeof raw === 'number') return raw;

    const str = String(raw).trim();
    if (!str) return 0;

    const direct = Date.parse(str);
    if (!isNaN(direct)) return direct;

    const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      let hours = match[4] ? parseInt(match[4], 10) : 0;
      const minutes = match[5] ? parseInt(match[5], 10) : 0;
      const seconds = match[6] ? parseInt(match[6], 10) : 0;
      const ampm = match[7] ? match[7].toLowerCase() : null;

      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;

      const d = new Date(year, month, day, hours, minutes, seconds);
      if (!isNaN(d.getTime())) return d.getTime();
    }
    return 0;
  };

  const getTaskTime = (task) => {
    if (!task) return 0;
    let t = 0;
    if (task.timestamp) t = parseDateToTime(task.timestamp);
    if (!t && task.createdAt) t = parseDateToTime(task.createdAt);
    if (!t && task.date) {
      const combined = task.time ? `${task.date} ${task.time}` : task.date;
      t = parseDateToTime(combined);
    }
    if (!t && task.dueDate) t = parseDateToTime(task.dueDate);
    return t;
  };

  const displayTasks = [...realMyTasks, ...myStaffTasks].sort((a, b) => getTaskTime(b) - getTaskTime(a));

  const todayDateObj = new Date();
  todayDateObj.setHours(0, 0, 0, 0);

  const isTaskOverdue = (t) => {
    const taskKey = t.isInteractionTask ? `${t.interactionId}-${t.uid}` : t.taskId;
    const st = (taskStatuses[taskKey] || t.status || 'Pending').toLowerCase();
    const isHandled = st.includes('complet') || st.includes('decline') || st.includes('forward');
    if (isHandled) return false;
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    if (isNaN(d.getTime())) return false;
    d.setHours(0, 0, 0, 0);
    return d < todayDateObj;
  };

  const isTaskToday = (t) => {
    const taskKey = t.isInteractionTask ? `${t.interactionId}-${t.uid}` : t.taskId;
    const st = (taskStatuses[taskKey] || t.status || 'Pending').toLowerCase();
    const isHandled = st.includes('complet') || st.includes('decline') || st.includes('forward');
    if (isHandled) return false;
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    if (isNaN(d.getTime())) return false;
    d.setHours(0, 0, 0, 0);
    return d.getTime() === todayDateObj.getTime();
  };

  const isTaskNew = (t) => {
    // Exclude overdue tasks from New
    if (isTaskOverdue(t)) return false;

    const taskKey = t.isInteractionTask ? `${t.interactionId}-${t.uid}` : t.taskId;
    const st = (taskStatuses[taskKey] || t.status || 'Pending').toLowerCase();

    // Not yet actioned: not Accepted, In Progress, Completed, Declined, or Forwarded
    const isHandled = st.includes('complet') || st.includes('decline') || st.includes('forward') || st.includes('accept') || st.includes('progress');
    if (isHandled) return false;

    // Status is untouched: still marked as Pending or Task Assigned (or was created within the last 48 hours)
    const isUntouched = st === 'pending' || st === 'task assigned';
    const tTime = getTaskTime(t);
    const isRecent = tTime > 0 && (Date.now() - tTime) < 48 * 60 * 60 * 1000;
    return isUntouched || isRecent;
  };

  const overdueTasksCount = displayTasks.filter(isTaskOverdue).length;
  const todayTasksCount = displayTasks.filter(isTaskToday).length;
  const allTasksCount = displayTasks.length;
  const newTasksCount = displayTasks.filter(isTaskNew).length;

  const filteredTasks = displayTasks.filter(t => {
    if (taskTab === 'overdue') return isTaskOverdue(t);
    if (taskTab === 'today') return isTaskToday(t);
    if (taskTab === 'new') return isTaskNew(t);
    return true; // 'all'
  });

  const taskPageSize = 4;
  const totalTaskPages = Math.max(1, Math.ceil(filteredTasks.length / taskPageSize));
  const safeTaskPage = Math.min(taskPage, totalTaskPages);
  const paginatedTasks = filteredTasks.slice((safeTaskPage - 1) * taskPageSize, safeTaskPage * taskPageSize);

  const resolveTaskTitle = (task) => {
    const raw = task.taskHeader || task.task || task.title || task.originalInteraction?.messageText || task.originalInteraction?.subject || 'Task Assignment';
    if (task.taskHeader && task.taskHeader.split(/\s+/).length <= 5) return task.taskHeader;
    const clean = raw.trim();
    const lower = clean.toLowerCase();
    if (lower.includes('call with') || lower.includes('conversation through call with')) {
      const match = clean.match(/(?:call with|conversation with|conversation through call with)\s+([A-Za-z]+)/i);
      if (match && match[1]) return `Call with ${match[1].charAt(0).toUpperCase() + match[1].slice(1)}`;
    }
    if (lower.includes('conversation with')) {
      const match = clean.match(/conversation with\s+([A-Za-z]+)/i);
      if (match && match[1]) return `Sync with ${match[1].charAt(0).toUpperCase() + match[1].slice(1)}`;
    }
    if (lower.includes('discussion on') || lower.includes('discussion about')) {
      const match = clean.match(/discussion (?:on the|on|about the|about)\s+([^.!?,\n]+)/i);
      if (match && match[1]) {
        const topic = match[1].split(/\s+/).slice(0, 3).join(' ');
        return `${topic.charAt(0).toUpperCase() + topic.slice(1)} Discussion`;
      }
    }
    if (lower.includes('use case')) return 'Use Cases Discussion';
    if (lower.includes('security') || lower.includes('rbac')) return 'Security Audit';
    if (lower.includes('regression') || lower.includes('test')) return 'Regression Testing';
    if (lower.includes('load test')) return 'Load Testing';
    if (lower.includes('appraisal')) return 'Appraisal Review';
    if (lower.includes('budget')) return 'Budget Review';
    let stripped = clean.replace(/^(had a conversation through call with|had a conversation with|had the discussion on the|had the discussion on|discussion on the|discussion on|conversation with|conversation through call with)\s+/i, '');
    stripped = stripped.replace(/\s+(based on the new project|based on the|based on|regarding|about)\s+.*/i, '');
    stripped = stripped.charAt(0).toUpperCase() + stripped.slice(1);
    const words = stripped.split(/\s+/);
    if (words.length > 4) return words.slice(0, 4).join(' ') + '...';
    return stripped;
  };

  const handleCreateTaskFromAction = (nba) => {
    if (!nba) return;
    // 1. Identify Account
    const acc = (accounts || []).find(a => 
      (a.accountId && String(a.accountId) === String(nba.accountId)) || 
      (a.id && String(a.id) === String(nba.accountId)) || 
      (a.companyName && a.companyName.toLowerCase().trim() === (nba.companyName || '').toLowerCase().trim())
    );
    const targetAccountId = nba.accountId || acc?.accountId || acc?.id || '';
    const targetCompanyName = nba.companyName || acc?.companyName || '';

    // 2. Identify Contact (if linkType is contact or contact name is in action)
    let preselectContactId = '';
    let preselectContactName = '';
    if (nba.linkType === 'contact' && nba.linkId) {
      preselectContactId = nba.linkId;
    }
    const syncMatch = nba.suggestedAction?.match(/(?:sync with|check-in with|reach out to|contact)\s+([A-Za-z\s]+?)(?:\.|$)/i);
    if (syncMatch && syncMatch[1]) {
      preselectContactName = syncMatch[1].trim();
    }

    // 3. Identify Assignee (Account Owner vs Key Contact Owner logic)
    const accOwnerId = acc?.ownerId || acc?.assignedTo;
    const accOwnerName = acc?.ownerName || acc?.owner;
    const accOwnerEmail = acc?.ownerEmail;

    // Filter contacts belonging to this account
    const accContacts = (contacts || []).filter(c => 
      targetAccountId && (String(c.accountId) === String(targetAccountId) || String(c.account_id) === String(targetAccountId))
    );

    // Key contact owners (owners assigned to contacts under this account)
    const keyContactOwners = accContacts
      .map(c => ({
        ownerId: c.ownerId,
        ownerName: c.ownerName,
        ownerEmail: c.ownerEmail,
        contactName: c.name
      }))
      .filter(k => k.ownerId || k.ownerName || k.ownerEmail);

    const isUserMatch = (u, oId, oName, oEmail) => {
      if (!u) return false;
      const uId = String(u.uid || '');
      const uEmail = (u.email || '').toLowerCase().trim();
      const uName = (u.name || '').toLowerCase().trim();
      if (oId && String(oId) === uId) return true;
      if (oEmail && uEmail && oEmail.toLowerCase().trim() === uEmail) return true;
      if (oName && uName && oName.toLowerCase().trim() === uName) return true;
      return false;
    };

    const isAdminUser = (u) => {
      if (!u) return false;
      const role = String(u.role || u.userType || '').toLowerCase();
      const email = String(u.email || u.ownerEmail || '').toLowerCase();
      const uid = String(u.uid || u.ownerId || '');
      const name = String(u.name || u.ownerName || '').toLowerCase();
      return (
        role === 'admin' ||
        uid === 'mock-admin-uid' ||
        email.includes('admin@') ||
        name.includes('admin user')
      );
    };

    const isCurrentUserAdmin = isAdminUser(user);
    const isCurrentUserAccountOwner = !isCurrentUserAdmin && isUserMatch(user, accOwnerId, accOwnerName, accOwnerEmail);
    const isCurrentUserKeyContactOwner = !isCurrentUserAdmin && keyContactOwners.some(k => isUserMatch(user, k.ownerId, k.ownerName, k.ownerEmail));

    let chosenTarget = null;
    if (isCurrentUserAdmin) {
      // 1. When Admin clicks -> DO NOT assign Admin! Choose the Account Owner!
      let accOwnerCandidate = (accOwnerId || accOwnerName) 
        ? { ownerId: accOwnerId, ownerName: accOwnerName, ownerEmail: accOwnerEmail } 
        : null;

      if (accOwnerCandidate && !isAdminUser(accOwnerCandidate)) {
        chosenTarget = accOwnerCandidate;
      } else {
        chosenTarget = keyContactOwners.find(k => !isAdminUser(k)) || accOwnerCandidate || keyContactOwners[0];
      }
    } else if (isCurrentUserAccountOwner) {
      // 2. When Account Owner clicks -> choose the Key Contact Owner(s)!
      chosenTarget = keyContactOwners.find(k => !isUserMatch(user, k.ownerId, k.ownerName, k.ownerEmail) && !isAdminUser(k))
        || keyContactOwners.find(k => !isUserMatch(user, k.ownerId, k.ownerName, k.ownerEmail))
        || keyContactOwners[0];
    } else if (isCurrentUserKeyContactOwner) {
      // 3. When Key Contact Owner clicks -> choose the Account Owner!
      chosenTarget = (accOwnerId || accOwnerName) ? { ownerId: accOwnerId, ownerName: accOwnerName, ownerEmail: accOwnerEmail } : null;
    } else {
      // 4. Default / third party -> choose Account Owner first
      let accOwnerCandidate = (accOwnerId || accOwnerName) 
        ? { ownerId: accOwnerId, ownerName: accOwnerName, ownerEmail: accOwnerEmail } 
        : null;
      if (accOwnerCandidate && !isAdminUser(accOwnerCandidate)) {
        chosenTarget = accOwnerCandidate;
      } else {
        chosenTarget = keyContactOwners.find(k => !isAdminUser(k)) || accOwnerCandidate || keyContactOwners[0];
      }
    }

    let preselectUid = '';
    let preselectName = '';
    if (chosenTarget) {
      const staffMatch = (staffList || []).find(s => 
        (chosenTarget.ownerId && String(s.uid) === String(chosenTarget.ownerId)) ||
        (chosenTarget.ownerEmail && s.email && s.email.toLowerCase().trim() === chosenTarget.ownerEmail.toLowerCase().trim()) ||
        (chosenTarget.ownerName && s.name && s.name.toLowerCase().trim() === chosenTarget.ownerName.toLowerCase().trim())
      );
      if (staffMatch) {
        if (!isCurrentUserAdmin || !isAdminUser(staffMatch)) {
          preselectUid = staffMatch.uid;
          preselectName = staffMatch.name;
        }
      } else if (chosenTarget.ownerName) {
        if (!isCurrentUserAdmin || !isAdminUser(chosenTarget)) {
          preselectName = chosenTarget.ownerName;
          preselectUid = chosenTarget.ownerId || '';
        }
      }
    }

    // Safety fallback: If current user is Admin, ensure Admin is never passed as assignee
    if (isCurrentUserAdmin && (!preselectUid || preselectUid === user?.uid || preselectUid === 'mock-admin-uid')) {
      const staffAccOwner = (staffList || []).find(s => 
        !isAdminUser(s) && (
          (accOwnerId && String(s.uid) === String(accOwnerId)) ||
          (accOwnerEmail && s.email && s.email.toLowerCase().trim() === accOwnerEmail.toLowerCase().trim()) ||
          (accOwnerName && s.name && s.name.toLowerCase().trim() === accOwnerName.toLowerCase().trim())
        )
      );
      if (staffAccOwner) {
        preselectUid = staffAccOwner.uid;
        preselectName = staffAccOwner.name;
      } else {
        for (const k of keyContactOwners) {
          const kStaff = (staffList || []).find(s => 
            !isAdminUser(s) && (
              (k.ownerId && String(s.uid) === String(k.ownerId)) ||
              (k.ownerEmail && s.email && s.email.toLowerCase().trim() === k.ownerEmail.toLowerCase().trim()) ||
              (k.ownerName && s.name && s.name.toLowerCase().trim() === k.ownerName.toLowerCase().trim())
            )
          );
          if (kStaff) {
            preselectUid = kStaff.uid;
            preselectName = kStaff.name;
            break;
          }
        }
      }
    }

    // 4. Priority
    const priority = nba.priority || 'Medium';

    // 5. Due date - remove hardcoded date calculation so user chooses their own date
    const preselectDueDate = '';

    // 6. Title and Description
    const cleanAction = (nba.suggestedAction || '').replace(/\.$/, '').trim();
    const preselectTitle = cleanAction || `${targetCompanyName} - Follow-up`;
    
    let preselectDescription = cleanAction;
    if (nba.reason && nba.reason !== nba.suggestedAction) {
      preselectDescription += `\n\nContext / Reason:\n${nba.reason}`;
    }
    if (nba.type) {
      preselectDescription += `\nAction Type: ${nba.type}`;
    }

    navigate('/staff-tasks/new', {
      state: {
        preselectAccountId: targetAccountId,
        preselectCompanyName: targetCompanyName,
        preselectContactId,
        preselectContactName,
        preselectUid,
        preselectName,
        preselectPriority: priority,
        preselectDueDate,
        preselectTitle,
        preselectDescription,
        from: '/dashboard'
      }
    });
  };

  // Style helpers
  const P = {
    background: '#ffffff', borderRadius: 20,
    border: '1px solid rgba(226, 232, 240, 0.9)',
    boxShadow: '0 4px 20px -4px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.02)',
    overflow: 'hidden'
  };
  const PH = {
    padding: '16px 22px', borderBottom: '1px solid #f1f5f9',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
  };
  const ST = {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 11, fontWeight: 800, color: '#64748b',
    letterSpacing: '0.09em', textTransform: 'uppercase'
  };
  const IB = (bg) => ({
    width: 32, height: 32, borderRadius: 9, background: bg,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
  });
  const SBStyle = (st) => {
    const s = (st || '').toLowerCase();
    if (s.includes('complet') || s.includes('forward')) return { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' };
    if (s.includes('accept') || s.includes('progress')) return { bg: '#eef2f9', color: '#223670', border: '#c7d1e8' };
    if (s.includes('decline')) return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' };
    if (s.includes('overdu')) return { bg: '#fdf4ff', color: '#9333ea', border: '#e9d5ff' };
    return { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
  };
  const PrStyle = (p) => ({
    display: 'inline-flex', alignItems: 'center', gap: 3,
    padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800,
    background: p === 'High' ? '#fef2f2' : p === 'Medium' ? '#fffbeb' : '#f0fdf4',
    color: p === 'High' ? '#dc2626' : p === 'Medium' ? '#d97706' : '#16a34a',
    border: `1px solid ${p === 'High' ? '#fecaca' : p === 'Medium' ? '#fde68a' : '#bbf7d0'}`
  });
  const MO = {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16, boxSizing: 'border-box'
  };
  const MB = {
    background: '#ffffff', borderRadius: 20, padding: '24px 20px', width: '100%', maxWidth: 460,
    boxShadow: '0 24px 60px rgba(0,0,0,0.18)', position: 'relative', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box'
  };
  const MC = {
    position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 8,
    border: '1px solid #e2e8f0', background: '#f8fafc',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b'
  };
  const FL = { display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' };
  const FI = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 12, color: '#0f172a', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' };
  const FS = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 12, color: '#0f172a', outline: 'none', cursor: 'pointer', fontFamily: 'inherit', boxSizing: 'border-box' };
  const SB = (bg) => ({ padding: '10px 22px', borderRadius: 10, background: bg, color: '#ffffff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' });

  return (
    <div className="p-3 sm:p-5 lg:p-7 pb-12 min-h-full font-sans max-w-full overflow-x-hidden">
      {notifyToast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 10000, background: '#0f172a', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{notifyToast}</span>
        </div>
      )}

      {/* HERO HEADER */}
      <div style={{ background: 'linear-gradient(135deg, #16244b 0%, #223670 55%, #2d458d 100%)', borderRadius: 20, padding: '24px 22px', marginBottom: 22, position: 'relative', overflow: 'hidden', boxShadow: '0 8px 32px rgba(34,54,112,0.28)' }}>
        <div style={{ position: 'absolute', top: -50, right: -50, width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -70, right: 140, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <h1 style={{ color: '#ffffff', fontSize: 26, fontWeight: 800, margin: '0 0 6px', lineHeight: 1.2 }}>{user?.name || 'User'}</h1>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999, padding: '5px 13px', color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 700, marginTop: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
              {user?.position || user?.userType || user?.role || 'Employee'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <span 
                onClick={() => navigate('/risks')} 
                style={{ 
                  padding: '6px 12px', 
                  background: openRisksCount > 0 ? '#ef4444' : 'rgba(255,255,255,0.18)', 
                  color: 'white', 
                  fontSize: 11, 
                  fontWeight: 700, 
                  borderRadius: 999, 
                  cursor: 'pointer', 
                  transition: 'all 0.15s ease' 
                }} 
                onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'} 
                onMouseLeave={e => e.currentTarget.style.filter = 'none'} 
                title="Review Risks in Account Health"
              >
                {openRisksCount} risk{openRisksCount === 1 ? '' : 's'} to review
              </span>

              <span 
                onClick={() => navigate('/staff-tasks')} 
                style={{ 
                  padding: '6px 12px', 
                  background: overdueTasksCount > 0 ? '#d97706' : 'rgba(255,255,255,0.18)', 
                  color: 'white', 
                  fontSize: 11, 
                  fontWeight: 700, 
                  borderRadius: 999, 
                  cursor: 'pointer', 
                  transition: 'all 0.15s ease' 
                }} 
                onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'} 
                onMouseLeave={e => e.currentTarget.style.filter = 'none'} 
                title="Review Overdue Tasks"
              >
                {overdueTasksCount} overdue task{overdueTasksCount === 1 ? '' : 's'}
              </span>

              <span 
                onClick={() => navigate('/risks')} 
                style={{ 
                  padding: '6px 12px', 
                  background: droppingCount > 0 ? '#ef4444' : 'rgba(255,255,255,0.18)', 
                  color: 'white', 
                  fontSize: 11, 
                  fontWeight: 700, 
                  borderRadius: 999, 
                  cursor: 'pointer', 
                  transition: 'all 0.15s ease' 
                }} 
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.35)'} 
                onMouseLeave={e => e.currentTarget.style.background = droppingCount > 0 ? '#ef4444' : 'rgba(255,255,255,0.18)'} 
                title="Review Health Drops in Account Health"
              >
                {droppingCount} health drop{droppingCount === 1 ? '' : 's'}
              </span>

              <span 
                onClick={() => navigate('/accounts')} 
                style={{ 
                  padding: '6px 12px', 
                  background: todayGreetingsCount > 0 ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.18)', 
                  color: 'white', 
                  fontSize: 11, 
                  fontWeight: 700, 
                  borderRadius: 999, 
                  display: 'flex', 
                  alignItems: 'center', 
                  cursor: 'pointer', 
                  transition: 'all 0.15s ease' 
                }} 
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.35)'} 
                onMouseLeave={e => e.currentTarget.style.background = todayGreetingsCount > 0 ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.18)'} 
                title="Review Greetings Due in Accounts"
              >
                {todayGreetingsCount} greeting{todayGreetingsCount === 1 ? '' : 's'} due
                {todayGreetingsCount > 0 && (
                  <span style={{ background: 'white', color: '#223670', padding: '2px 6px', borderRadius: 999, marginLeft: 6, fontSize: 9, fontWeight: 800 }}>New</span>
                )}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => navigate('/staff-tasks/new', { state: { from: '/dashboard' } })} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 12, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={14} color="white" /> Assign Task
            </button>
            <button onClick={() => navigate('/log-interaction', { state: { from: '/dashboard' } })} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: '#ffffff', border: '1px solid rgba(255,255,255,0.9)', borderRadius: 12, color: '#223670', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={14} color="#223670" /> Log Interaction
            </button>
          </div>
        </div>
      </div>

      {/* Alert Bar — Dynamically synced with PostgreSQL account health drops */}
      {!isAlertDismissed && droppingCount > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, transition: 'all 0.25s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangle size={18} color="#d97706" />
            <span style={{ color: '#92400e', fontSize: 13, fontWeight: 700 }}>
              {droppingCount} account{droppingCount === 1 ? '' : 's'} dropped health points this week.
            </span>
            <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>Alert</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button 
              onClick={() => navigate('/risks')} 
              style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #d97706', borderRadius: 8, color: '#92400e', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s ease' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#d97706'; e.currentTarget.style.color = '#ffffff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#92400e'; }}
              title="Review in Account Health"
            >
              Review
            </button>
            <button 
              onClick={handleDismissAlert} 
              style={{ padding: '8px 16px', background: '#fde68a', border: '1px solid #fcd34d', borderRadius: 8, color: '#92400e', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s ease' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#fcd34d'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fde68a'; }}
              title="Dismiss this notification"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Accounts', value: cards.totalAccounts, accent: '#223670', iconBg: '#eef2f9', iconColor: '#223670', Icon: Building2, badge: 'CRM Active', badgeBg: '#eef2f9', badgeColor: '#223670', BI: Activity },
          { label: 'Healthy', value: cards.healthyAccounts, accent: '#10b981', iconBg: '#f0fdf4', iconColor: '#10b981', Icon: CheckCircle2, badge: '≥70% Score', badgeBg: '#f0fdf4', badgeColor: '#16a34a', BI: ArrowUpRight, vc: '#10b981' },
          { label: 'At-Risk', value: cards.atRiskAccounts, accent: '#f59e0b', iconBg: '#fffbeb', iconColor: '#f59e0b', Icon: AlertTriangle, badge: '40–69% Score', badgeBg: '#fffbeb', badgeColor: '#d97706', BI: Target, vc: '#d97706' },
          { label: 'Critical', value: cards.criticalAccounts, accent: '#ef4444', iconBg: '#fef2f2', iconColor: '#ef4444', Icon: AlertOctagon, badge: '<40% Score', badgeBg: '#fef2f2', badgeColor: '#dc2626', BI: ArrowDownRight, vc: '#dc2626' },
          { label: 'Stakeholders', value: cards.activeContacts, accent: '#ec4899', iconBg: '#fdf2f8', iconColor: '#ec4899', Icon: Users, badge: 'Rel Depth', badgeBg: '#fdf2f8', badgeColor: '#db2777', BI: TrendingUp, vc: '#db2777' },
          ...(managementData ? [
            { label: 'Avg Health Score', value: `${managementData.metrics?.avgHealth || 0}%`, accent: '#06b6d4', iconBg: '#ecfeff', iconColor: '#06b6d4', Icon: Activity, badge: 'Global', badgeBg: '#ecfeff', badgeColor: '#0891b2', BI: TrendingUp, vc: '#0891b2' },

            { label: 'Opportunities', value: managementData.metrics?.expansionOpportunities || 0, accent: '#14b8a6', iconBg: '#ccfbf1', iconColor: '#14b8a6', Icon: TrendingUp, badge: 'Expansion', badgeBg: '#ccfbf1', badgeColor: '#0f766e', BI: ArrowUpRight, vc: '#0f766e', onClick: () => setManagementDrillDown({ title: 'All Opportunities', type: 'nbas', list: managementData.drillDown?.expansionOpportunities || [] }) }
          ] : [])
        ].map(({ label, value, accent, iconBg, iconColor, Icon, badge, badgeBg, badgeColor, BI, vc, onClick }) => (
          <div key={label} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', background: '#fff', borderRadius: 16, padding: '16px 14px', border: '1px solid #e2e8f0', boxShadow: '0 4px 14px -3px rgba(15,23,42,0.05)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: accent, borderRadius: '16px 16px 0 0' }} />
            <div style={{ width: 34, height: 34, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, color: iconColor }}>
              <Icon size={17} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: vc || '#0f172a', lineHeight: 1, marginBottom: 5 }}>{value}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, padding: '3px 7px', borderRadius: 999, background: badgeBg, color: badgeColor, fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap' }}>
              <BI size={9} /> {badge}
            </div>
          </div>
        ))}
      </div>

      {/* Mini Radar Blocks — Live PostgreSQL Account Health & Celebrations */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 18, marginBottom: 24 }}>
        {/* Health Alerts Card */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', boxShadow: '0 4px 14px -3px rgba(15,23,42,0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={16} color={droppingCount > 0 ? '#ef4444' : '#10b981'} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Health Alerts</span>
              </div>
              {droppingCount > 0 ? (
                <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                  {droppingCount} Dropping
                </span>
              ) : (
                <span style={{ background: '#ecfdf5', color: '#047857', padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={10} color="#047857" /> All Stable
                </span>
              )}
            </div>

            {droppingCount > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {droppingAccounts.slice(0, 3).map((item, j) => (
                  <div
                    key={j}
                    onClick={() => {
                      const targetId = item.accountId || item.id;
                      if (targetId) {
                        navigate(`/accounts/${targetId}`, { state: { tab: 'AccountHealth', from: '/dashboard' } });
                      } else {
                        navigate('/risks');
                      }
                    }}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#0f172a',
                      cursor: 'pointer',
                      padding: '8px 10px',
                      borderRadius: 10,
                      background: '#fef2f2',
                      border: '1px solid #fee2e2',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.filter = 'brightness(0.97)'}
                    onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                    title={`Review ${item.companyName} in Account Health`}
                  >
                    <span style={{ fontWeight: 700 }}>{item.companyName}</span>
                    <span style={{ background: '#dc2626', color: '#ffffff', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                      {item.previousScore ? `${item.previousScore} → ${item.currentScore}` : `${item.currentScore}% (${item.scoreTrend || '-'} pts)`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#f0fdf4', border: '1px solid #dcfce7', borderRadius: 10, marginBottom: 12 }}>
                  <CheckCircle2 size={16} color="#16a34a" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>
                    All {cards.totalAccounts || (accounts || []).length} accounts stable — 0 sharp health drops
                  </span>
                </div>
                {lowestAccounts.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.04em' }}>
                      Watchlist (Lowest Health)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {lowestAccounts.slice(0, 4).map((acc, k) => (
                        <div
                          key={k}
                          onClick={() => {
                            const targetId = acc.accountId || acc.id;
                            if (targetId) {
                              navigate(`/accounts/${targetId}`, { state: { tab: 'AccountHealth', from: '/dashboard' } });
                            } else {
                              navigate('/risks');
                            }
                          }}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#334155',
                            cursor: 'pointer',
                            padding: '6px 8px',
                            borderRadius: 8,
                            background: '#f8fafc',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                          onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
                          title={`View ${acc.companyName} in Account Health`}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{acc.companyName}</span>
                          <span style={{ background: acc.currentScore < 50 ? '#fee2e2' : '#fef3c7', color: acc.currentScore < 50 ? '#b91c1c' : '#b45309', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                            {acc.currentScore}% Health
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ marginTop: 14 }}>
            <button
              onClick={() => navigate('/risks')}
              style={{
                width: '100%',
                padding: '9px 16px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                color: '#223670',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#223670'; e.currentTarget.style.color = '#ffffff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#223670'; }}
            >
              Open Account Health <ArrowUpRight size={13} />
            </button>
          </div>
        </div>

        {/* Greetings Due Card */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '20px', boxShadow: '0 4px 14px -3px rgba(15,23,42,0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PartyPopper size={16} color={todayGreetingsCount > 0 ? '#d97706' : '#64748b'} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Greetings Due</span>
              </div>
              {todayGreetingsCount > 0 ? (
                <span style={{ background: '#fef3c7', color: '#b45309', padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                  {todayGreetingsCount} Today
                </span>
              ) : thisWeekGreetingsCount > 0 ? (
                <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                  {thisWeekGreetingsCount} This Week
                </span>
              ) : (
                <span style={{ background: '#f1f5f9', color: '#64748b', padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                  Up to date
                </span>
              )}
            </div>

            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 6px', lineHeight: 1.4 }}>
                {todayGreetingsCount > 0
                  ? `${todayGreetingsCount} celebration${todayGreetingsCount > 1 ? 's' : ''} due today${draftsReadyCount > 0 ? `, ${draftsReadyCount} draft ready` : ''}.`
                  : thisWeekGreetingsCount > 0
                    ? `0 due today (${thisWeekGreetingsCount} celebration${thisWeekGreetingsCount > 1 ? 's' : ''} scheduled for this week).`
                    : '0 celebrations due today — all greetings up to date.'}
              </p>
              <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px', lineHeight: 1.4 }}>
                {todayGreetingsCount > 0
                  ? 'Send personalized greetings or review pre-filled drafts for account stakeholders.'
                  : thisWeekGreetingsCount > 0
                    ? 'Upcoming stakeholder birthdays and anniversaries detected from PostgreSQL contacts.'
                    : 'Customer celebrations and milestone alerts sync automatically from your contacts.'}
              </p>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <button
              onClick={() => navigate('/accounts')}
              style={{
                width: '100%',
                padding: '9px 16px',
                background: todayGreetingsCount > 0 ? '#223670' : '#f8fafc',
                border: '1px solid',
                borderColor: todayGreetingsCount > 0 ? '#223670' : '#e2e8f0',
                borderRadius: 10,
                color: todayGreetingsCount > 0 ? '#ffffff' : '#0f172a',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#223670';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={e => {
                if (todayGreetingsCount === 0) {
                  e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.color = '#0f172a';
                }
              }}
            >
              {todayGreetingsCount > 0 ? 'Review Drafts' : thisWeekGreetingsCount > 0 ? 'View Upcoming in Accounts' : 'Browse Accounts'}
              <ArrowUpRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* TASKS + SIDEBAR */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 sm:gap-[18px] mb-5 items-start">

        {/* Tasks Panel */}
        <div style={{ ...P, display: 'flex', flexDirection: 'column' }}>
          <div style={PH}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0 }}>Tasks Assigned to Me</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => { setTaskTab('overdue'); setTaskPage(1); }}
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '3px 10px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      border: taskTab === 'overdue' ? '1px solid #7f1d1d' : overdueTasksCount > 0 ? '1px solid #fecaca' : '1px solid transparent',
                      background: taskTab === 'overdue' ? '#991b1b' : overdueTasksCount > 0 ? '#fef2f2' : 'transparent',
                      color: taskTab === 'overdue' ? '#ffffff' : overdueTasksCount > 0 ? '#991b1b' : '#64748b',
                      boxShadow: taskTab === 'overdue' ? '0 2px 6px rgba(153,27,27,0.3)' : 'none'
                    }}
                  >
                    Overdue {overdueTasksCount}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setTaskTab('today'); setTaskPage(1); }}
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '3px 10px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      border: taskTab === 'today' ? '1px solid #223670' : '1px solid transparent',
                      background: taskTab === 'today' ? '#223670' : 'transparent',
                      color: taskTab === 'today' ? '#ffffff' : '#64748b',
                      boxShadow: taskTab === 'today' ? '0 2px 6px rgba(15,23,42,0.25)' : 'none'
                    }}
                  >
                    Today {todayTasksCount}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setTaskTab('all'); setTaskPage(1); }}
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '3px 10px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      border: taskTab === 'all' ? '1px solid #1a2d5a' : '1px solid transparent',
                      background: taskTab === 'all' ? '#223670' : 'transparent',
                      color: taskTab === 'all' ? '#ffffff' : '#64748b',
                      boxShadow: taskTab === 'all' ? '0 2px 6px rgba(34,54,112,0.3)' : 'none'
                    }}
                  >
                    All {allTasksCount}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setTaskTab('new'); setTaskPage(1); }}
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '3px 10px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      border: taskTab === 'new' ? '1px solid #1d4ed8' : '1px solid #bfdbfe',
                      background: taskTab === 'new' ? '#2563eb' : '#eff6ff',
                      color: taskTab === 'new' ? '#ffffff' : '#1e40af',
                      boxShadow: taskTab === 'new' ? '0 2px 6px rgba(37,99,235,0.3)' : 'none'
                    }}
                  >
                    New {newTasksCount}
                  </button>
                </div>
              </div>
            </div>
            <button style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#223670', cursor: 'pointer', border: 'none', background: 'none', padding: 0 }} onClick={() => navigate('/staff-tasks')}>
              View All
            </button>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 0', color: '#94a3b8' }}>
                <CheckCheck size={32} style={{ margin: '0 auto 10px', opacity: 0.35 }} />
                <p style={{ fontSize: 13, fontWeight: 600 }}>
                  {taskTab === 'overdue' && 'No overdue tasks. All caught up!'}
                  {taskTab === 'today' && 'No tasks due today.'}
                  {taskTab === 'new' && 'No new tasks pending.'}
                  {taskTab === 'all' && 'No tasks assigned to you yet.'}
                </p>
              </div>
            ) : paginatedTasks.map((task, idx) => {
              const taskKey = task.isInteractionTask ? `${task.interactionId}-${task.uid}` : task.taskId;
              const currentStatus = taskStatuses[taskKey] || task.status || 'Pending';
              const forwardedTo = taskStatuses[`${taskKey}-forwardedToName`] || task.forwardedToName;
              const today = new Date(); today.setHours(0,0,0,0);
              const taskDue = task.dueDate ? new Date(task.dueDate) : null;
              if (taskDue) taskDue.setHours(0,0,0,0);
              const isTaskOverdue = taskDue && taskDue < today && !currentStatus.toLowerCase().includes('complet') && !currentStatus.toLowerCase().includes('decline');
              const isStatusUnchanged = currentStatus === 'Pending' || currentStatus === 'Task Assigned';
              const showAsOverdued = isTaskOverdue && isStatusUnchanged;

              let displayStatus = currentStatus === 'Pending' ? 'Task Assigned' : currentStatus;
              if (displayStatus === 'Accept/Decline') displayStatus = 'Accepted';
              if (displayStatus === 'Accept' || displayStatus === 'In Progress') displayStatus = 'Accepted';
              if (displayStatus === 'Decline' || displayStatus === 'Declined') displayStatus = 'Declined';
              if (displayStatus === 'Completed/Forwarded') displayStatus = 'Completed';
              if (showAsOverdued) displayStatus = 'Overdued';

              let selectValue = currentStatus === 'Pending' ? 'Task Assigned' : currentStatus;
              if (selectValue === 'Accept/Decline') selectValue = 'Accept';
              if (selectValue === 'Completed/Forwarded') selectValue = 'Completed';
              if (selectValue === 'Accepted' || selectValue === 'In Progress') selectValue = 'Accept';
              if (selectValue === 'Declined' || selectValue === 'Decline') selectValue = 'Decline';
              if (showAsOverdued) selectValue = 'Overdued';

              const stBadge = SBStyle(displayStatus);

              const isTaskFinal = (currentStatus || '').toLowerCase() === 'completed' ||
                                  (currentStatus || '').toLowerCase() === 'complete' ||
                                  (currentStatus || '').toLowerCase() === 'declined' ||
                                  (currentStatus || '').toLowerCase() === 'decline' ||
                                  (currentStatus || '').toLowerCase().includes('forward') ||
                                  (currentStatus || '').toLowerCase() === 'accepted & completed';

              const noteInfo = resolveTaskNote(task);

              return (
                <div
                  key={task.isInteractionTask ? `${task.interactionId}-${idx}` : task.taskId}
                  style={{
                    background: showAsOverdued ? 'linear-gradient(135deg,#fff8f8,#fff)' : '#ffffff',
                    border: `1px solid ${showAsOverdued ? '#fecaca' : '#e2e8f0'}`,
                    borderRadius: 14,
                    padding: '16px 18px',
                    cursor: 'pointer',
                    marginBottom: 12,
                    boxShadow: '0 2px 8px -2px rgba(15,23,42,0.04)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = showAsOverdued ? '#f87171' : '#cbd5e1';
                    e.currentTarget.style.boxShadow = '0 6px 16px -4px rgba(15,23,42,0.08)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = showAsOverdued ? '#fecaca' : '#e2e8f0';
                    e.currentTarget.style.boxShadow = '0 2px 8px -2px rgba(15,23,42,0.04)';
                  }}
                  onClick={() => {
                    if (task.isInteractionTask) navigate('/interaction-log', { state: { selectedInteractionId: task.interactionId, from: '/dashboard' } });
                    else navigate('/staff-tasks', { state: { selectedTaskId: task.taskId, from: '/dashboard' } });
                  }}
                >
                  {/* Top Row: Account & Category & Priority & Status Badge */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {task.accountId ? (
                        <span
                          style={{ fontSize: 12, fontWeight: 800, color: '#223670', cursor: 'pointer' }}
                          onClick={e => { e.stopPropagation(); navigate(`/accounts/${task.accountId}`, { state: { from: '/dashboard' } }); }}
                          title="View Account"
                        >
                          {task.companyName || 'Account'}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>
                          {task.companyName || 'Internal'}
                        </span>
                      )}

                      <span style={{ fontSize: 10, color: '#cbd5e1' }}>·</span>

                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
                        background: task.isInteractionTask ? '#eef2f9' : '#f5f3ff',
                        color: task.isInteractionTask ? '#223670' : '#7c3aed',
                        border: `1px solid ${task.isInteractionTask ? '#c7d1e8' : '#ddd6fe'}`,
                        letterSpacing: '0.04em'
                      }}>
                        {task.isInteractionTask ? 'INTERACTION LOG' : 'STAFF TASK'}
                      </span>

                      {task.priority && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
                          background: task.priority === 'High' ? '#fef2f2' : task.priority === 'Medium' ? '#fffbeb' : '#f0fdf4',
                          color: task.priority === 'High' ? '#dc2626' : task.priority === 'Medium' ? '#d97706' : '#16a34a',
                          border: `1px solid ${task.priority === 'High' ? '#fecaca' : task.priority === 'Medium' ? '#fde68a' : '#bbf7d0'}`
                        }}>
                          {task.priority} Priority
                        </span>
                      )}
                    </div>

                    <span style={{
                      flexShrink: 0, fontSize: 10, fontWeight: 800, padding: '4px 10px',
                      borderRadius: 999, background: stBadge.bg, color: stBadge.color,
                      border: `1px solid ${stBadge.border}`, whiteSpace: 'nowrap'
                    }}>
                      {displayStatus === 'Forwarded' && forwardedTo ? `→ @${forwardedTo}` : displayStatus}
                    </span>
                  </div>

                  {/* Task Title */}
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '0 0 6px', lineHeight: 1.35 }}>
                    {resolveTaskTitle(task)}
                  </h4>

                  {/* Description Snippet */}
                  {task.description && (
                    <p style={{
                      fontSize: 12, fontWeight: 500, color: '#475569', margin: '0 0 10px', lineHeight: 1.45,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                    }}>
                      {task.description}
                    </p>
                  )}

                  {/* Metadata Details Grid */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 8, padding: '8px 10px', background: '#f8fafc',
                    borderRadius: 10, border: '1px solid #f1f5f9', marginBottom: 10
                  }}>
                    {/* Due Date */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: isTaskOverdue ? '#dc2626' : '#475569' }}>
                      <Calendar size={13} color={isTaskOverdue ? '#dc2626' : '#94a3b8'} />
                      <span>Due: {task.dueDate ? formatDate(task.dueDate) : '—'}</span>
                      {isTaskOverdue && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#dc2626', background: '#fee2e2', padding: '1px 6px', borderRadius: 4 }}>
                          OVERDUE
                        </span>
                      )}
                    </div>

                    {/* Logged Date & Time */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                      <Clock size={13} color="#94a3b8" />
                      <span>Logged: {formatDateTime(task.date, task.time, task.timestamp || task.createdAt) || '—'}</span>
                    </div>

                    {/* Assigned By */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#475569' }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#e2e8f0', color: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800 }}>
                        {(task.assignedByName || task.loggedByName || 'AD').substring(0, 2).toUpperCase()}
                      </div>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>By: <strong style={{ color: '#0f172a' }}>{task.assignedByName || task.loggedByName || 'Admin User'}</strong></span>
                    </div>

                    {/* Assigned To (Replaced Contact with recipient to whom task is assigned) */}
                    {(() => {
                      const toName = task.forwardedToName || task.assignedToName || task.name || user?.name || 'Me';
                      const toInitials = (toName || 'US').substring(0, 2).toUpperCase();
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#475569' }}>
                          <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#e0e7ff', color: '#3730a3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800 }}>
                            {toInitials}
                          </div>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>To: <strong style={{ color: '#0f172a' }}>{toName}</strong></span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Status Note / Note Added display */}
                  {noteInfo && (
                    <div style={{
                      marginTop: 8, marginBottom: 8, padding: '8px 12px',
                      background: '#f8fafc', border: '1px solid #e2e8f0',
                      borderLeft: '3px solid #223670', borderRadius: 8,
                      display: 'flex', alignItems: 'flex-start', gap: 8
                    }}>
                      <MessageSquare size={13} color="#223670" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#223670', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {noteInfo.label}:
                          </span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#1e40af', background: '#dbeafe', padding: '1px 6px', borderRadius: 999 }}>Note Added</span>
                        </div>
                        <p style={{ margin: '3px 0 0', fontSize: 11, color: '#334155', fontWeight: 600, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {noteInfo.text}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Action Bar (Replaces [Mark done] [Notify] [Open account]) */}
                  <div
                    style={{
                      marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      flexWrap: 'wrap', gap: 10
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Change Status:
                      </span>
                      {isTaskFinal ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 8,
                            background: stBadge.bg, color: stBadge.color, border: `1px solid ${stBadge.border}`
                          }}>
                            {displayStatus === 'Forwarded' && forwardedTo ? `Forwarded to @${forwardedTo}` : displayStatus}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', fontStyle: 'italic' }}>
                            (Status Fixed)
                          </span>
                        </div>
                      ) : (
                        <select
                          value={selectValue}
                          onChange={(e) => handleStatusChange(task, e.target.value)}
                          style={{
                            padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800,
                            background: '#ffffff',
                            color: '#0f172a',
                            border: '1px solid #cbd5e1',
                            cursor: 'pointer',
                            outline: 'none', transition: 'border-color 0.15s ease'
                          }}
                        >
                          {showAsOverdued && <option value="Overdued">Overdue</option>}
                          <option value="Task Assigned">Task Assigned</option>
                          <option value="Accept">Accept</option>
                          <option value="Completed">Completed</option>
                          <option value="Decline">Decline</option>
                          <option value="Forwarded">Forward</option>
                        </select>
                      )}
                    </div>

                    {/* View Details Link */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (task.isInteractionTask) {
                          navigate('/interaction-log', { state: { selectedInteractionId: task.interactionId, from: '/dashboard' } });
                        } else {
                          navigate('/staff-tasks', { state: { selectedTaskId: task.taskId, from: '/dashboard' } });
                        }
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: 'none', border: 'none', padding: 0,
                        fontSize: 11, fontWeight: 800, color: '#223670', cursor: 'pointer'
                      }}
                      onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                    >
                      <span>View Task Details</span>
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
            </div>

            {/* Pagination Controls */}
            {filteredTasks.length > taskPageSize && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid #e8edf5', marginTop: 'auto' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                  Showing {Math.min((safeTaskPage - 1) * taskPageSize + 1, filteredTasks.length)}–{Math.min(safeTaskPage * taskPageSize, filteredTasks.length)} of {filteredTasks.length} tasks
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    disabled={safeTaskPage === 1}
                    onClick={() => setTaskPage(p => Math.max(1, p - 1))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '5px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: safeTaskPage === 1 ? '#f1f5f9' : '#ffffff',
                      color: safeTaskPage === 1 ? '#94a3b8' : '#0f172a',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: safeTaskPage === 1 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <ChevronLeft size={12} /> Prev
                  </button>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', padding: '0 4px' }}>
                    {safeTaskPage} / {totalTaskPages}
                  </span>
                  <button
                    disabled={safeTaskPage >= totalTaskPages}
                    onClick={() => setTaskPage(p => Math.min(totalTaskPages, p + 1))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '5px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: safeTaskPage >= totalTaskPages ? '#f1f5f9' : '#ffffff',
                      color: safeTaskPage >= totalTaskPages ? '#94a3b8' : '#0f172a',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: safeTaskPage >= totalTaskPages ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Next <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Top Risks */}
          <div style={P}>
            <div style={PH}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0 }}>Top Account Risks</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/risks')}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#223670',
                  cursor: 'pointer',
                  border: 'none',
                  background: 'none',
                  padding: 0
                }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
              >
                All risks
              </button>
            </div>
            <div style={{ padding: '14px 16px' }}>
              {widgets.topRisks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <CheckCircle2 size={28} style={{ margin: '0 auto 8px', color: '#10b981', opacity: 0.5 }} />
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#10b981' }}>No critical risks — all clear!</p>
                </div>
              ) : widgets.topRisks.slice(0, 3).map(risk => (
                <div key={risk.riskId} style={{ borderBottom: '1px solid #f1f5f9', padding: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{risk.companyName}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: risk.severity === 'High' ? '#7f1d1d' : '#fef3c7', color: risk.severity === 'High' ? 'white' : '#92400e' }}>
                        {risk.severity === 'High' ? 'Critical' : 'High'}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>{risk.type || 'Delivery'} · {risk.description}</p>
                  </div>
                  <button
                    onClick={() => {
                      if (risk.accountId) {
                        navigate(`/accounts/${risk.accountId}`, { state: { tab: 'Risks', from: '/dashboard' } });
                      } else {
                        navigate('/risks');
                      }
                    }}
                    style={{ padding: '6px 14px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}
                  >
                    Review
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Top Recommended Actions */}
          {managementData && (
            <div style={{ ...P, display: 'flex', flexDirection: 'column', maxHeight: 520, boxSizing: 'border-box' }}>
              <div style={PH}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0 }}>Top Recommended Actions</p>
                </div>
                {managementData.topActions && managementData.topActions.length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                    {managementData.topActions.length} Actions
                  </span>
                )}
              </div>
              <div style={{ padding: '12px 14px 12px 16px', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 450, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 #f1f5f9' }} className="custom-scrollbar">
                {!managementData.topActions || managementData.topActions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', opacity: 0.5 }}>
                    <CheckSquare size={28} color="#94a3b8" style={{ margin: '0 auto 8px' }} />
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', margin: 0 }}>No pending recommendations.</p>
                  </div>
                ) : (
                  (managementData.topActions || []).map((nba, idx) => {
                    const isHigh = nba.priority === 'High';
                    const isMed = nba.priority === 'Medium';
                    const badgeBg = isHigh ? '#fef2f2' : isMed ? '#fffbeb' : '#eff6ff';
                    const badgeColor = isHigh ? '#ef4444' : isMed ? '#f59e0b' : '#3b82f6';
                    return (
                      <div 
                        key={idx} 
                        onClick={() => navigate(`/accounts/${nba.accountId}`, { state: { from: '/dashboard' } })}
                        style={{ borderBottom: '1px solid #f1f5f9', padding: '12px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{nba.companyName}</span>
                          </div>
                          <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.4 }}>{nba.suggestedAction}</p>
                        </div>
                        <button 
                          style={{ padding: '6px 14px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#0f172a', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }} 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            handleCreateTaskFromAction(nba);
                          }}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          Create task
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-5">
        
        <div style={{ ...P, padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Industry Health Profile</div>
          {trendData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8', fontSize: 12, fontWeight: 600, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              No industry health data available
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {trendData.slice(0, 3).map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', width: 70 }}>{item.industry}</span>
                  <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${item.avgHealth}%`, height: '100%', background: '#64748b', borderRadius: 999 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', width: 20, textAlign: 'right' }}>{Math.round(item.avgHealth)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ ...P, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Global Journey Pipeline</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { stage: 'Awareness', color: '#64748b' },
              { stage: 'Consideration', color: '#64748b' },
              { stage: 'Decision', color: '#64748b' },
              { stage: 'Retention', color: '#64748b' },
              { stage: 'Advocacy', color: '#64748b' }
            ].slice(0, 3).map(({ stage, color }) => {
              const count = managementData?.journeyStats?.[stage] || 0;
              const totalAcc = managementData?.metrics?.totalAccounts || cards.totalAccounts || 0;
              const percent = totalAcc > 0 ? Math.round((count / totalAcc) * 100) : 0;
              return (
                <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', width: 70 }}>{stage}</span>
                  <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(percent, count > 0 ? 5 : 0)}%`, height: '100%', background: color, borderRadius: 999 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', width: 20, textAlign: 'right' }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ ...P, padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>Active Risk Types</div>
          {riskData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              <CheckCircle2 size={24} style={{ color: '#10b981', opacity: 0.8, marginBottom: 6 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#166534' }}>No active risks</span>
              <span style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>All accounts clear of open risks</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {riskData.slice(0, 3).map((item, idx) => {
                const totalRisks = riskData.reduce((acc, r) => acc + (r.Count || 0), 0);
                const percent = totalRisks > 0 ? Math.round((item.Count / totalRisks) * 100) : 0;
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#475569', width: 85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.category}</span>
                    <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(percent, 8)}%`, height: '100%', background: '#64748b', borderRadius: 999 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', width: 20, textAlign: 'right' }}>{item.Count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* BU HEAD */}
      {user?.userType === 'BU Head' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <div style={P}>
            <div style={PH}><div style={ST}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#223670', display: 'inline-block' }} />Division Projects & Teams</div></div>
            <div style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Projects</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {user.projects && user.projects.length > 0 ? user.projects.map(p => (
                  <span key={p} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: '#374151' }}>📁 {p}</span>
                )) : <span style={{ fontSize: 12, color: '#94a3b8' }}>No projects mapped.</span>}
              </div>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Project Managers</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {user.projectManagers && user.projectManagers.length > 0 ? user.projectManagers.map(pm => (
                  <span key={pm} style={{ background: '#eef1f9', border: '1px solid #c5ceea', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: '#223670' }}>👤 {pm}</span>
                )) : <span style={{ fontSize: 12, color: '#94a3b8' }}>No project managers assigned.</span>}
              </div>
            </div>
          </div>
          <div style={P}>
            <div style={PH}><div style={ST}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#223670', display: 'inline-block' }} />BU Operations Directory</div></div>
            <div style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Division Employees</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {user.employees && user.employees.length > 0 ? user.employees.map(emp => (
                  <div key={emp} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#374151' }}>💼 {emp}</div>
                )) : <span style={{ fontSize: 12, color: '#94a3b8', gridColumn: '1/-1' }}>No employee records.</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MANAGER */}
      {['Project Manager', 'Delivery Manager', 'Sales Manager', 'Account Manager'].includes(user?.userType) && (
        <div style={{ ...P, marginBottom: 20 }}>
          <div style={PH}><div style={ST}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#223670', display: 'inline-block' }} />My Managed Projects & Teams</div></div>
          <div style={{ padding: '16px 20px' }}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {user.projects && user.projects.length > 0 ? user.projects.map((proj, idx) => {
                const projName = typeof proj === 'string' ? proj : proj.name;
                const projEmps = typeof proj === 'string' ? [] : (proj.employees || []);
                return (
                  <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: '#eef1f9', border: '1px solid #c5ceea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📁</div>
                      <h4 style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', margin: 0 }}>{projName || `Project #${idx + 1}`}</h4>
                    </div>
                    <div style={{ paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                      <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Team Roster</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {projEmps.length > 0 && projEmps.some(Boolean) ? projEmps.filter(Boolean).map((emp, eIdx) => (
                          <div key={eIdx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7, background: '#fff', border: '1px solid #e2e8f0', fontSize: 11, fontWeight: 600, color: '#374151' }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#223670', flexShrink: 0 }} /> {emp}
                          </div>
                        )) : <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>No employees yet.</span>}
                      </div>
                    </div>
                  </div>
                );
              }) : <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 12 }}>No projects managed yet.</div>}
            </div>
          </div>
        </div>
      )}

      {/* CEO */}
      {user?.userType === 'CEO' && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ ...P, marginBottom: 16 }}>
            <div style={PH}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Corporate Heads Directory & Operations</span>
              </div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {['Finance Head', 'Global HR Head', 'ITG Head', 'NDA Head', 'TC Head', 'Quality Head'].map(pos => {
                  const head = usersList.find(u => u.position?.toLowerCase().includes(pos.toLowerCase().replace(' head', '')) || u.position?.toLowerCase() === pos.toLowerCase());
                  return (
                    <div key={pos} style={{ background: '#f8fafc', border: `1px solid ${head ? '#bbf7d0' : '#fecaca'}`, borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{pos}</span>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: head ? '#f0fdf4' : '#fef2f2', color: head ? '#16a34a' : '#dc2626', border: `1px solid ${head ? '#bbf7d0' : '#fecaca'}` }}>
                          {head ? 'ACTIVE' : 'VACANT'}
                        </span>
                      </div>
                      {head ? (
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>{head.name}</p>
                          <p style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{head.email}</p>
                          <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                            <span>📁 {head.projects?.length || 0} Projects</span>
                            <span>•</span>
                            <span>👥 {head.employees?.length || 0} Members</span>
                          </div>
                        </div>
                      ) : <p style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>No head currently assigned.</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={P}>
            <div style={PH}><div style={ST}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#223670', display: 'inline-block' }} />Corporate Business Units Status</div></div>
            <div style={{ padding: '16px 20px' }}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid #dcfce7', marginBottom: 10 }}>
                    <h4 style={{ fontSize: 12, fontWeight: 800, color: '#16a34a', margin: 0 }}>Delivery Division (Farming)</h4>
                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>Managed under ITG</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Main Delivery Head:</span>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>
                        {usersList.find(u => (u.userType || u.role) === 'Delivery Head' && !u.position?.toLowerCase().includes('insurance') && !u.position?.toLowerCase().includes('industrial') && !u.position?.toLowerCase().includes('healthcare'))?.name || 'Vacant'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Sub-Divisions:</span>
                      <span style={{ fontWeight: 600, color: '#374151', textAlign: 'right', maxWidth: '60%' }}>Insurance, Industrial, Healthcare & Mobility</span>
                    </div>
                  </div>
                </div>
                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid #ede9fe', marginBottom: 10 }}>
                    <h4 style={{ fontSize: 12, fontWeight: 800, color: '#7c3aed', margin: 0 }}>P&L Division (Hunting & Mining)</h4>
                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>Sales Consultation</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>P&L BU Head:</span>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{usersList.find(u => u.position?.toLowerCase().includes('p&l head'))?.name || 'Vacant'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Key Roster:</span>
                      <span style={{ fontWeight: 600, color: '#374151' }}>BFS BU Consultants, Sales Managers</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FUNCTIONAL HEAD */}
      {user?.userType === 'Functional Head' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <div style={P}>
            <div style={PH}><div style={ST}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#223670', display: 'inline-block' }} />Departmental Projects & SLA</div></div>
            <div style={{ padding: '16px 20px' }}>
              {user.projects && user.projects.length > 0 ? user.projects.map((p, idx) => {
                const projName = typeof p === 'string' ? p : p.name;
                const employeesCount = typeof p === 'string' ? 0 : (p.employees?.length || 0);
                return (
                  <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
                    <div>
                      <p style={{ fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>📁 {projName}</p>
                      <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>Overseeing {employeesCount} employee(s)</p>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 999, background: '#eef1f9', color: '#223670', border: '1px solid #c5ceea' }}>ACTIVE</span>
                  </div>
                );
              }) : <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '16px 0', fontStyle: 'italic' }}>No active projects logged.</p>}
            </div>
          </div>
          <div style={P}>
            <div style={PH}><div style={ST}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#223670', display: 'inline-block' }} />Department Operations & Headcount</div></div>
            <div style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Active Employees</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {user.employees && user.employees.length > 0 ? user.employees.map(emp => (
                  <div key={emp} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: '#eef1f9', border: '1px solid #c5ceea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#223670' }}>
                        {emp.substring(0, 2).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{emp}</span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b' }}>{user.department || 'Staff'} team</span>
                  </div>
                )) : <p style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', fontStyle: 'italic' }}>No employee records mapped.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETION MODAL */}
      {completionModalState.isOpen && (
        <div style={MO}>
          <div style={MB}>
            <button style={MC} onClick={() => { setCompletionModalState({ isOpen: false, task: null, newStatus: '' }); setCompletionNote(''); setCompletionFile(null); }}><X size={14} /></button>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#d1fae5,#a7f3d0)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 14, flexShrink: 0 }}><CheckSquare size={20} color="#059669" /></div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>Complete Task</h3>
                <p style={{ fontSize: 12, color: '#64748b', fontWeight: 500, margin: 0 }}>Send a note back to {completionModalState.task?.loggedByName}</p>
              </div>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const { task, newStatus } = completionModalState;
              const taskKey = task.isInteractionTask ? `${task.interactionId}-${task.uid}` : task.taskId;
              let finalNote = `Task Completion Note: ${completionNote.trim() || 'No note provided'}`;
              if (completionFile) {
                const uploaded = await uploadFile(completionFile);
                if (uploaded && uploaded.url) finalNote += `\n\n📎 Attached: [${uploaded.name}](${uploaded.url})`;
              }
              if (task.isInteractionTask) {
                const ok = await updateTaskStatus(task.interactionId, task.uid, newStatus);
                if (ok) { if (completionNote.trim() || completionFile) await replyToInteraction(task.interactionId, finalNote); fetchInteractions(); }
              } else {
                const ok = await updateStaffTaskStatus(task.taskId, newStatus, finalNote, finalNote);
                if (ok) fetchStaffTasks('assigned-to-me');
              }
              setTaskStatuses(prev => ({ ...prev, [taskKey]: newStatus, [`${taskKey}-note`]: completionNote.trim() }));
              setCompletionModalState({ isOpen: false, task: null, newStatus: '' }); setCompletionNote(''); setCompletionFile(null);
            }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={FL}>Completion Note</label>
                <textarea value={completionNote} onChange={e => setCompletionNote(e.target.value)} style={{ ...FI, minHeight: 100 }} placeholder="E.g., Task completed successfully." required />
              </div>
              <div>
                <label style={FL}>Attachments (Optional)</label>
                <input type="file" onChange={e => setCompletionFile(e.target.files[0])} style={{ fontSize: 12, color: '#374151' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" style={SB('linear-gradient(135deg,#059669,#10b981)')}>Mark Completed</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FORWARD MODAL */}
      {forwardModalState.isOpen && (
        <div style={MO}>
          <div style={MB}>
            <button style={MC} onClick={() => { setForwardModalState({ isOpen: false, task: null, newStatus: 'Forwarded' }); setForwardToUid(''); setForwardReason(''); setForwardFile(null); }}><X size={14} /></button>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#dde3f2,#c5ceea)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 14, flexShrink: 0 }}><Send size={20} color="#2b4590" /></div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>Forward Task</h3>
                <p style={{ fontSize: 12, color: '#64748b', fontWeight: 500, margin: 0 }}>Select a team member to forward this task to</p>
              </div>
            </div>
            <form onSubmit={handleForwardSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={FL}>Forward To</label>
                <TeamMemberSelect
                  value={forwardToUid}
                  onChange={(uid) => setForwardToUid(uid)}
                  staffList={staffList}
                  currentUserId={user?.uid}
                  required
                />
              </div>
              <div>
                <label style={FL}>Forwarding Note / Reason</label>
                <textarea value={forwardReason} onChange={e => setForwardReason(e.target.value)} style={{ ...FI, minHeight: 90 }} placeholder="E.g., Forwarding as you are leading the deployment module." />
              </div>
              <div>
                <label style={FL}>Attachments (Optional)</label>
                <input
                  type="file"
                  onChange={(e) => setForwardFile(e.target.files[0])}
                  className="w-full text-xs text-slate-700 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border file:border-slate-300 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-800 hover:file:bg-slate-200 file:cursor-pointer cursor-pointer transition-all"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" disabled={!forwardToUid} style={{ ...SB('linear-gradient(135deg,#1a2d5a,#2b4590)'), opacity: !forwardToUid ? 0.5 : 1 }}>Forward Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ACCEPT MODAL */}
      {acceptModalState.isOpen && (
        <div style={MO}>
          <div style={MB}>
            <button style={MC} onClick={() => { setAcceptModalState({ isOpen: false, task: null }); setAcceptNote(''); }}><X size={14} /></button>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#fef3c7,#fde68a)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 14, flexShrink: 0 }}><ThumbsUp size={20} color="#d97706" /></div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>Accept Task</h3>
                <p style={{ fontSize: 12, color: '#64748b', fontWeight: 500, margin: 0 }}>Confirm acceptance and optionally add a note</p>
              </div>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const { task } = acceptModalState;
              const taskKey = task.isInteractionTask ? `${task.interactionId}-${task.uid}` : task.taskId;
              if (task.isInteractionTask) {
                const ok = await updateTaskStatus(task.interactionId, task.uid, 'Accept');
                if (ok) { if (acceptNote.trim()) await replyToInteraction(task.interactionId, `Acceptance Note: ${acceptNote}`); fetchInteractions(); }
              } else {
                const ok = await updateStaffTaskStatus(task.taskId, 'Accept', '', acceptNote.trim());
                if (ok) fetchStaffTasks('assigned-to-me');
              }
              setTaskStatuses(prev => ({ ...prev, [taskKey]: 'Accept', [`${taskKey}-note`]: acceptNote.trim() }));
              setAcceptModalState({ isOpen: false, task: null }); setAcceptNote('');
            }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={FL}>Acceptance Note (Optional)</label>
                <textarea value={acceptNote} onChange={e => setAcceptNote(e.target.value)} style={{ ...FI, minHeight: 100 }} placeholder="E.g., I will begin working on this task immediately." />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" style={SB('linear-gradient(135deg,#d97706,#f59e0b)')}>Accept Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DECLINE MODAL */}
      {declineModalState.isOpen && (
        <div style={MO}>
          <div style={MB}>
            <button style={MC} onClick={() => { setDeclineModalState({ isOpen: false, task: null }); setDeclineReason(''); }}><X size={14} /></button>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#fee2e2,#fecaca)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 14, flexShrink: 0 }}><ShieldAlert size={20} color="#dc2626" /></div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>Decline Task</h3>
                <p style={{ fontSize: 12, color: '#64748b', fontWeight: 500, margin: 0 }}>Provide a reason for declining this task</p>
              </div>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const { task } = declineModalState;
              const taskKey = task.isInteractionTask ? `${task.interactionId}-${task.uid}` : task.taskId;
              if (task.isInteractionTask) {
                const ok = await updateTaskStatus(task.interactionId, task.uid, 'Decline');
                if (ok) { if (declineReason.trim()) await replyToInteraction(task.interactionId, `Decline Reason: ${declineReason}`); fetchInteractions(); }
              } else {
                const ok = await updateStaffTaskStatus(task.taskId, 'Decline', '', declineReason.trim());
                if (ok) fetchStaffTasks('assigned-to-me');
              }
              setTaskStatuses(prev => ({ ...prev, [taskKey]: 'Decline', [`${taskKey}-note`]: declineReason.trim() }));
              setDeclineModalState({ isOpen: false, task: null }); setDeclineReason('');
            }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={FL}>Reason for Declining</label>
                <textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)} style={{ ...FI, minHeight: 100 }} placeholder="E.g., Unable to complete due to conflicting priorities." required />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" style={SB('linear-gradient(135deg,#dc2626,#ef4444)')}>Submit Decline</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drill-down Modal (Using Light theme as requested previously for Modals) */}
      {managementDrillDown && (
        <div style={MO} onClick={() => setManagementDrillDown(null)}>
          <div style={{ ...MB, maxWidth: 640, padding: 0, display: 'flex', flexDirection: 'column', maxHeight: '85vh', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', borderRadius: '20px 20px 0 0' }}>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: 0 }}>{managementDrillDown.title}</h2>
              <button onClick={() => setManagementDrillDown(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 8, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }} className="custom-scrollbar">
              {managementDrillDown.list.length === 0 ? (
                 <p style={{ fontSize: 14, color: '#64748b', fontWeight: 700, textAlign: 'center', padding: '32px 0', margin: 0 }}>No records found.</p>
              ) : (
                managementDrillDown.list.map((item, idx) => {
                  if (managementDrillDown.type === 'accounts') {
                    return (
                      <div key={idx} onClick={() => navigate(`/accounts/${item.accountId}`, { state: { from: '/dashboard' } })} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, cursor: 'pointer', transition: 'all 0.2s ease' }} onMouseEnter={e => e.currentTarget.style.borderColor = '#93c5fd'} onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}>
                        <div>
                          <p style={{ fontWeight: 800, color: '#0f172a', margin: '0 0 4px', fontSize: 14 }}>{item.companyName}</p>
                          <p style={{ fontSize: 12, fontWeight: 800, margin: 0, color: item.healthScore < 50 ? '#ef4444' : '#10b981' }}>Health Score: {item.healthScore}%</p>
                        </div>
                        <ChevronRight size={20} color="#94a3b8" />
                      </div>
                    )
                  } else {
                    const priorityColors = { High: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' }, Medium: { bg: '#fffbeb', color: '#d97706', border: '#fde68a' }, Low: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' } };
                    const pc = priorityColors[item.priority] || priorityColors.Medium;
                    return (
                      <div key={idx} onClick={() => navigate(`/accounts/${item.accountId}`, { state: { from: '/dashboard' } })} style={{ padding: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, cursor: 'pointer', transition: 'all 0.2s ease' }} onMouseEnter={e => e.currentTarget.style.borderColor = '#5eead4'} onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <p style={{ fontWeight: 800, color: '#0f172a', margin: 0, fontSize: 14 }}>{item.companyName}</p>
                          <ChevronRight size={16} color="#94a3b8" />
                        </div>
                        {item.reason && (
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: '0 0 6px', lineHeight: 1.4 }}>{item.reason}</p>
                        )}
                        {item.suggestedAction && (
                          <p style={{ fontSize: 12, fontWeight: 500, color: '#475569', margin: '0 0 10px', lineHeight: 1.4 }}>→ {item.suggestedAction}</p>
                        )}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: '#ccfbf1', color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.type || 'Account Expansion'}</span>
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: pc.bg, color: pc.color, border: `1px solid ${pc.border}`, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.priority} Priority</span>
                        </div>
                      </div>
                    )
                  }
                })
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
