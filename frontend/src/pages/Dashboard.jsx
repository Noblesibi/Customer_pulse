import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, CheckCircle2, AlertTriangle, AlertOctagon, Activity,
  ArrowUpRight, ArrowDownRight, Sparkles, Send, Clock, CheckCheck,
  MessageSquare, Building2, CheckSquare, CalendarClock, X, ThumbsUp, ShieldAlert,
  Plus, TrendingUp, Target, BarChart3, ChevronRight, ChevronLeft, Calendar, Flag
} from 'lucide-react';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import { useStore } from '../store/index.js';
import { formatDate, formatDateTime } from '../utils/dateFormat.js';
import TeamMemberSelect from '../components/TeamMemberSelect.jsx';

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
    staffTasks, fetchStaffTasks, updateStaffTaskStatus
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
  const [taskPage, setTaskPage] = useState(1);

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

  useEffect(() => {
    fetchDashboardStats();
    fetchInteractions();
    fetchStaff();
    fetchStaffTasks('assigned-to-me');
    if (user?.userType === 'CEO') fetchUsersList();
    const interval = setInterval(() => {
      fetchDashboardStats();
      fetchInteractions();
      fetchStaff();
      fetchStaffTasks('assigned-to-me');
      if (user?.userType === 'CEO') fetchUsersList();
    }, 5000);
    return () => clearInterval(interval);
  }, [user]);

  if (dashboardLoading && !dashboardStats) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '3px solid #e2e8f0', borderTopColor: '#223670', borderRadius: '50%', margin: '0 auto 16px' }} />
          <p style={{ color: '#64748b', fontSize: 13, fontWeight: 600 }}>Loading dashboard…</p>
        </div>
      </div>
    );
  }

  const cards = dashboardStats?.cards || { totalAccounts: 0, healthyAccounts: 0, atRiskAccounts: 0, criticalAccounts: 0, activeContacts: 0, monthlyInteractions: 0 };
  const charts = dashboardStats?.charts || { sentimentDistribution: { Positive: 0, Neutral: 0, Negative: 0 }, riskCategories: {}, industryTrend: [], engagementFrequency: {} };
  const widgets = dashboardStats?.widgets || { topRisks: [], aiRecommendations: [], upcomingCommitments: [] };

  const sentimentData = [
    { name: 'Positive', value: charts.sentimentDistribution.Positive || 0, color: '#10b981' },
    { name: 'Neutral', value: charts.sentimentDistribution.Neutral || 0, color: '#f59e0b' },
    { name: 'Negative', value: charts.sentimentDistribution.Negative || 0, color: '#ef4444' }
  ].filter(d => d.value > 0);

  const riskData = Object.entries(charts.riskCategories).map(([category, count]) => ({ category, Count: count }));
  const engagementData = Object.entries(charts.engagementFrequency).map(([source, count]) => ({ source, Count: count }));
  const trendData = charts.industryTrend.length > 0 ? charts.industryTrend : [
    { industry: 'Technology', avgHealth: 82 },
    { industry: 'Finance', avgHealth: 74 },
    { industry: 'Logistics', avgHealth: 55 },
    { industry: 'Healthcare', avgHealth: 90 }
  ];

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
    .map(t => ({ ...t, taskHeader: t.title, task: t.description, isInteractionTask: false }));

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
  const taskPageSize = 3;
  const totalTaskPages = Math.max(1, Math.ceil(displayTasks.length / taskPageSize));
  const paginatedTasks = displayTasks.slice((taskPage - 1) * taskPageSize, taskPage * taskPageSize);

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

  // Style helpers
  const P = {
    background: '#ffffff', borderRadius: 18,
    border: '1px solid #e8edf5', boxShadow: '0 2px 16px rgba(0,0,0,0.05)', overflow: 'hidden'
  };
  const PH = {
    padding: '14px 20px', borderBottom: '1px solid #f1f5f9',
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
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24
  };
  const MB = {
    background: '#ffffff', borderRadius: 20, padding: 28, width: '100%', maxWidth: 460,
    boxShadow: '0 24px 60px rgba(0,0,0,0.18)', position: 'relative'
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
    <div style={{ padding: '24px 28px 48px', background: '#f0f4f8', minHeight: '100vh', fontFamily: 'Montserrat, sans-serif' }}>

      {/* HERO HEADER */}
      <div style={{ background: 'linear-gradient(135deg, #16244b 0%, #223670 55%, #2d458d 100%)', borderRadius: 20, padding: '26px 30px', marginBottom: 22, position: 'relative', overflow: 'hidden', boxShadow: '0 8px 32px rgba(34,54,112,0.28)' }}>
        <div style={{ position: 'absolute', top: -50, right: -50, width: 240, height: 240, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -70, right: 140, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
          <div>
            <h1 style={{ color: '#ffffff', fontSize: 26, fontWeight: 800, margin: '0 0 6px', lineHeight: 1.2 }}>{user?.name || 'User'}</h1>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 999, padding: '5px 13px', color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 700, marginTop: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
              {user?.position || user?.userType || user?.role || 'Employee'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => navigate('/staff-tasks/new')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 12, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={14} color="white" /> Assign Task
            </button>
            <button onClick={() => navigate('/log-interaction')} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: '#ffffff', border: '1px solid rgba(255,255,255,0.9)', borderRadius: 12, color: '#223670', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={14} color="#223670" /> Log Interaction
            </button>
          </div>
        </div>
      </div>

      {/* KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Total Accounts', value: cards.totalAccounts, accent: '#223670', iconBg: '#eef2f9', iconColor: '#223670', Icon: Building2, badge: 'CRM Active', badgeBg: '#eef2f9', badgeColor: '#223670', BI: Activity },
          { label: 'Healthy', value: cards.healthyAccounts, accent: '#10b981', iconBg: '#f0fdf4', iconColor: '#10b981', Icon: CheckCircle2, badge: '≥75% Score', badgeBg: '#f0fdf4', badgeColor: '#16a34a', BI: ArrowUpRight, vc: '#10b981' },
          { label: 'At-Risk', value: cards.atRiskAccounts, accent: '#f59e0b', iconBg: '#fffbeb', iconColor: '#f59e0b', Icon: AlertTriangle, badge: '50–74% Score', badgeBg: '#fffbeb', badgeColor: '#d97706', BI: Target, vc: '#d97706' },
          { label: 'Critical', value: cards.criticalAccounts, accent: '#ef4444', iconBg: '#fef2f2', iconColor: '#ef4444', Icon: AlertOctagon, badge: '<50% Score', badgeBg: '#fef2f2', badgeColor: '#dc2626', BI: ArrowDownRight, vc: '#dc2626' },
          { label: 'Stakeholders', value: cards.activeContacts, accent: '#8b5cf6', iconBg: '#f5f3ff', iconColor: '#8b5cf6', Icon: Users, badge: 'Rel Depth', badgeBg: '#f5f3ff', badgeColor: '#7c3aed', BI: TrendingUp, vc: '#7c3aed' },
        ].map(({ label, value, accent, iconBg, iconColor, Icon, badge, badgeBg, badgeColor, BI, vc }) => (
          <div key={label} style={{ background: '#fff', borderRadius: 16, padding: '18px 20px', border: '1px solid #e8edf5', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: accent, borderRadius: '16px 16px 0 0' }} />
            <div style={{ width: 38, height: 38, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, color: iconColor }}>
              <Icon size={18} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: vc || '#0f172a', lineHeight: 1, marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '3px 8px', borderRadius: 999, background: badgeBg, color: badgeColor, fontSize: 10, fontWeight: 700 }}>
              <BI size={9} /> {badge}
            </div>
          </div>
        ))}
      </div>

      {/* TASKS + SIDEBAR */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18, marginBottom: 20 }}>

        {/* Tasks Panel */}
        <div style={P}>
          <div style={PH}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={IB('linear-gradient(135deg, #16244b, #223670)')}><CalendarClock size={15} color="white" /></div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0 }}>Tasks Assigned to Me</p>
                <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, margin: 0 }}>{displayTasks.length} task{displayTasks.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            {canViewAllTasks && (
              <button style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#223670', cursor: 'pointer', border: 'none', background: 'none', padding: 0 }} onClick={() => navigate('/staff-tasks')}>
                View All <ChevronRight size={12} />
              </button>
            )}
          </div>
          <div style={{ padding: '14px 16px' }}>
            {displayTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 0', color: '#94a3b8' }}>
                <CheckCheck size={32} style={{ margin: '0 auto 10px', opacity: 0.35 }} />
                <p style={{ fontSize: 13, fontWeight: 600 }}>No tasks assigned to you yet.</p>
              </div>
            ) : paginatedTasks.map((task, idx) => {
              const taskKey = task.isInteractionTask ? `${task.interactionId}-${task.uid}` : task.taskId;
              const currentStatus = taskStatuses[taskKey] || task.status || 'Pending';
              const forwardedTo = taskStatuses[`${taskKey}-forwardedToName`] || task.forwardedToName;
              const today = new Date(); today.setHours(0,0,0,0);
              const taskDue = task.dueDate ? new Date(task.dueDate) : null;
              if (taskDue) taskDue.setHours(0,0,0,0);
              const isTaskOverdue = taskDue && taskDue < today && currentStatus !== 'Completed';
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

              return (
                <div
                  key={task.isInteractionTask ? `${task.interactionId}-${idx}` : task.taskId}
                  style={{ background: showAsOverdued ? 'linear-gradient(135deg,#fff5f5,#fff)' : '#f8fafc', border: `1px solid ${showAsOverdued ? '#fecaca' : '#e8edf5'}`, borderRadius: 14, padding: '14px 16px', cursor: 'pointer', marginBottom: 10 }}
                  onClick={() => {
                    if (task.isInteractionTask) navigate('/interaction-log', { state: { selectedInteractionId: task.interactionId, from: '/dashboard' } });
                    else navigate('/staff-tasks', { state: { selectedTaskId: task.taskId } });
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                        {task.accountId ? (
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#223670', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); navigate(`/accounts/${task.accountId}`); }}>{task.companyName}</span>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#374151' }}>{task.companyName || 'Internal'}</span>
                        )}
                        <span style={{ fontSize: 9, color: '#cbd5e1' }}>·</span>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: task.isInteractionTask ? '#eef2f9' : '#f5f3ff', color: task.isInteractionTask ? '#223670' : '#7c3aed', border: `1px solid ${task.isInteractionTask ? '#c7d1e8' : '#ddd6fe'}` }}>
                          {task.isInteractionTask ? 'INTERACTION LOG' : 'STAFF TASK'}
                        </span>
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: '0 0 6px' }} title={task.description}>{resolveTaskTitle(task)}</p>
                    </div>
                    <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: stBadge.bg, color: stBadge.color, border: `1px solid ${stBadge.border}`, whiteSpace: 'nowrap' }}>
                      {displayStatus === 'Forwarded' && forwardedTo ? `→ @${forwardedTo}` : displayStatus}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>By <strong style={{ color: '#374151' }}>{task.assignedByName || task.loggedByName}</strong></span>
                    <span style={{ fontSize: 10, color: '#e2e8f0' }}>·</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{formatDateTime(task.date, task.time, task.timestamp || task.createdAt)}</span>
                    {task.priority && (
                      <>
                        <span style={{ fontSize: 10, color: '#e2e8f0' }}>·</span>
                        <span style={PrStyle(task.priority)}><Flag size={8} /> {task.priority}</span>
                      </>
                    )}
                    {task.dueDate && (
                      <>
                        <span style={{ fontSize: 10, color: '#e2e8f0' }}>·</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4, background: isTaskOverdue ? '#fef2f2' : '#f8fafc', color: isTaskOverdue ? '#dc2626' : '#64748b', border: `1px solid ${isTaskOverdue ? '#fecaca' : '#e2e8f0'}` }}>
                          <Calendar size={9} /> Due: {formatDate(task.dueDate)}{isTaskOverdue && ' · OVERDUE'}
                        </span>
                      </>
                    )}
                    {(() => {
                      const isTaskFinal = (currentStatus || '').toLowerCase() === 'completed' ||
                                          (currentStatus || '').toLowerCase() === 'complete' ||
                                          (currentStatus || '').toLowerCase() === 'declined' ||
                                          (currentStatus || '').toLowerCase() === 'decline' ||
                                          (currentStatus || '').toLowerCase() === 'accepted & completed';

                      return (
                        <div style={{ display: 'flex', itemsAlign: 'center', gap: 8, paddingTop: 10, borderTop: '1px solid #f1f5f9', width: '100%' }} onClick={e => e.stopPropagation()}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status:</span>
                          {isTaskFinal ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: 6,
                                border: (currentStatus || '').toLowerCase().includes('decline') ? '1px solid rgba(244,63,94,0.3)' : (currentStatus || '').toLowerCase().includes('overdue') ? '1px solid rgba(147,51,234,0.3)' : '1px solid rgba(16,185,129,0.3)',
                                background: (currentStatus || '').toLowerCase().includes('decline') ? 'rgba(244,63,94,0.1)' : (currentStatus || '').toLowerCase().includes('overdue') ? 'rgba(147,51,234,0.1)' : 'rgba(16,185,129,0.1)',
                                fontSize: 11,
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                color: (currentStatus || '').toLowerCase().includes('decline') ? '#e11d48' : (currentStatus || '').toLowerCase().includes('overdue') ? '#7e22ce' : '#059669'
                              }}>
                                {selectValue === 'Decline' || selectValue === 'Declined' ? 'Declined' : selectValue === 'Accept' ? 'Accepted' : selectValue}
                              </span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', fontStyle: 'italic' }}>
                                (Status Fixed)
                              </span>
                            </div>
                          ) : (
                            <select
                              disabled={showAsOverdued}
                              value={selectValue}
                              style={{
                                padding: '5px 10px',
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                                background: '#ffffff',
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#0f172a',
                                outline: 'none',
                                cursor: 'pointer'
                              }}
                              onChange={async (e) => {
                                e.stopPropagation();
                                if (isTaskFinal) return;
                                const st = e.target.value;
                                if (st === 'Completed') setCompletionModalState({ isOpen: true, task, newStatus: st });
                                else if (st === 'Forwarded') setForwardModalState({ isOpen: true, task, newStatus: st });
                                else if (st === 'Decline') setDeclineModalState({ isOpen: true, task });
                                else if (st === 'Accept') setAcceptModalState({ isOpen: true, task });
                                else {
                                  if (task.isInteractionTask) { const ok = await updateTaskStatus(task.interactionId, task.uid, st); if (ok) fetchInteractions(); }
                                  else { const ok = await updateStaffTaskStatus(task.taskId, st); if (ok) fetchStaffTasks('assigned-to-me'); }
                                  setTaskStatuses(prev => ({ ...prev, [taskKey]: st }));
                                }
                              }}
                              onClick={e => e.stopPropagation()}
                            >
                              {showAsOverdued && <option value="Overdued">Overdued</option>}
                              <option value="Task Assigned">Task Assigned</option>
                              <option value="Accept">Accepted</option>
                              <option value="Decline">Declined</option>
                              <option value="Completed">Completed</option>
                              <option value="Forwarded">Forwarded</option>
                            </select>
                          )}
                        </div>
                      );
                    })()}
                    {currentStatus === 'Forwarded' && forwardedTo && (
                      <span style={{ fontSize: 11, color: '#223670', fontWeight: 700 }}>→ @{forwardedTo}</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Pagination Controls */}
            {displayTasks.length > 3 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid #e8edf5', marginTop: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                  Showing {Math.min((taskPage - 1) * taskPageSize + 1, displayTasks.length)}–{Math.min(taskPage * taskPageSize, displayTasks.length)} of {displayTasks.length} tasks
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    disabled={taskPage === 1}
                    onClick={() => setTaskPage(p => Math.max(1, p - 1))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '5px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: taskPage === 1 ? '#f1f5f9' : '#ffffff',
                      color: taskPage === 1 ? '#94a3b8' : '#0f172a',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: taskPage === 1 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <ChevronLeft size={12} /> Prev
                  </button>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', padding: '0 4px' }}>
                    {taskPage} / {totalTaskPages}
                  </span>
                  <button
                    disabled={taskPage === totalTaskPages}
                    onClick={() => setTaskPage(p => Math.min(totalTaskPages, p + 1))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '5px 12px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: taskPage === totalTaskPages ? '#f1f5f9' : '#ffffff',
                      color: taskPage === totalTaskPages ? '#94a3b8' : '#0f172a',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: taskPage === totalTaskPages ? 'not-allowed' : 'pointer'
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
                <div style={IB('linear-gradient(135deg,#ef4444,#f97316)')}><AlertOctagon size={15} color="white" /></div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0 }}>Top Account Risks</p>
                  <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, margin: 0 }}>Critical unresolved issues</p>
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 16px' }}>
              {widgets.topRisks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <CheckCircle2 size={28} style={{ margin: '0 auto 8px', color: '#10b981', opacity: 0.5 }} />
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#10b981' }}>No critical risks — all clear!</p>
                </div>
              ) : widgets.topRisks.map(risk => (
                <div key={risk.riskId} style={{ background: risk.severity === 'High' ? '#fff5f5' : '#fffbeb', border: `1px solid ${risk.severity === 'High' ? '#fecaca' : '#fde68a'}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: risk.severity === 'High' ? '#ef4444' : '#f59e0b', marginTop: 4, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{risk.companyName}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: risk.severity === 'High' ? '#fef2f2' : '#fffbeb', color: risk.severity === 'High' ? '#dc2626' : '#d97706', border: `1px solid ${risk.severity === 'High' ? '#fecaca' : '#fde68a'}` }}>
                        {risk.severity} Risk
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: '#475569', lineHeight: 1.4, margin: 0 }}>{risk.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CHARTS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16, marginBottom: 20 }}>

        <div style={{ ...P, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
            <BarChart3 size={13} color="#223670" /> Industry Health Profile
          </div>
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="hg2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#223670" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#223670" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="industry" stroke="#94a3b8" fontSize={9} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={9} domain={[0, 100]} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', color: '#0f172a', borderRadius: 10, fontSize: 11 }} />
                <Area type="monotone" dataKey="avgHealth" name="Avg Health Score" stroke="#223670" strokeWidth={2.5} fillOpacity={1} fill="url(#hg2)" dot={{ r: 4, fill: '#223670', strokeWidth: 2, stroke: '#fff' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ ...P, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Activity size={13} color="#223670" /> Communication Sentiment
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, height: 160 }}>
            <div style={{ width: 130, height: '100%', flexShrink: 0 }}>
              {sentimentData.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12 }}>No data</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={36} outerRadius={54} paddingAngle={4} dataKey="value">
                      {sentimentData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', color: '#0f172a', borderRadius: 10, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sentimentData.map(entry => (
                <div key={entry.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: entry.color, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{entry.name}</span>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{entry.value}</span>
                </div>
              ))}
              {sentimentData.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>No interactions</span>}
            </div>
          </div>
        </div>

        <div style={{ ...P, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
            <AlertTriangle size={13} color="#ef4444" /> Active Risk Types
          </div>
          <div style={{ height: 160 }}>
            {riskData.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontSize: 12, fontWeight: 600, gap: 6 }}>
                <CheckCircle2 size={16} /> System clean — no open risks
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="category" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', color: '#0f172a', borderRadius: 10, fontSize: 11 }} />
                  <Bar dataKey="Count" radius={[6, 6, 0, 0]}>
                    {riskData.map((entry, i) => <Cell key={i} fill={entry.Count > 2 ? '#ef4444' : '#f59e0b'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div style={{ ...P, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
            <MessageSquare size={13} color="#8b5cf6" /> Engagement Channels
          </div>
          <div style={{ height: 160 }}>
            {engagementData.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, fontWeight: 600, gap: 6 }}>
                <Clock size={14} /> No interactions logged yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={engagementData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis dataKey="source" type="category" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', color: '#0f172a', borderRadius: 10, fontSize: 11 }} />
                  <Bar dataKey="Count" fill="#8b5cf6" radius={[0, 6, 6, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* BU HEAD */}
      {user?.userType === 'BU Head' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
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
              setTaskStatuses(prev => ({ ...prev, [taskKey]: newStatus }));
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
              setTaskStatuses(prev => ({ ...prev, [taskKey]: 'Accept' }));
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
              setTaskStatuses(prev => ({ ...prev, [taskKey]: 'Decline' }));
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

    </div>
  );
}
