import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, CheckCircle2, AlertTriangle, AlertOctagon, Activity, HelpCircle,
  ArrowUpRight, ArrowDownRight, Sparkles, ClipboardList, Send, Clock, CheckCheck,
  MessageSquare, Building2, ArrowRight, Eye, CheckSquare, CalendarClock, X, FileText, ThumbsUp, ShieldAlert,
  Plus
} from 'lucide-react';

import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import { useStore } from '../store/index.js';

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    dashboardStats, dashboardLoading, fetchDashboardStats,
    user,
    replyToInteraction, fetchReplies, repliesByInteraction,
    usersList, fetchUsersList,
    activityLogs, activityLogsLoading, fetchActivityLogs,
    interactions, interactionsLoading, fetchInteractions,
    updateTaskStatus,
    staffList, fetchStaff,
    staffTasks, fetchStaffTasks, updateStaffTaskStatus
  } = useStore();

  const [replyTexts, setReplyTexts] = useState({}); // { [interactionId]: string }
  const [sendingReply, setSendingReply] = useState({});

  // Completion Note Modal State
  const [completionModalState, setCompletionModalState] = useState({ isOpen: false, task: null, newStatus: '' });
  const [completionNote, setCompletionNote] = useState('');
  const [completionFile, setCompletionFile] = useState(null);
  const [taskStatuses, setTaskStatuses] = useState({});

  // Forward Task Modal State
  const [forwardModalState, setForwardModalState] = useState({ isOpen: false, task: null, newStatus: 'Forwarded' });
  const [forwardToUid, setForwardToUid] = useState('');
  const [forwardReason, setForwardReason] = useState('');

  // Decline Modal State
  const [declineModalState, setDeclineModalState] = useState({ isOpen: false, task: null });
  const [declineReason, setDeclineReason] = useState('');

  // Accept Modal State
  const [acceptModalState, setAcceptModalState] = useState({ isOpen: false, task: null });
  const [acceptNote, setAcceptNote] = useState('');

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
        if (forwardReason.trim()) {
          await replyToInteraction(task.interactionId, `Forwarded Task Note: ${forwardReason}`);
        }
        fetchInteractions();
      }
    } else {
      const ok = await updateStaffTaskStatus(task.taskId, newStatus, '', forwardReason.trim(), selectedUser.uid, selectedUser.name);
      if (ok) {
        fetchStaffTasks('assigned-to-me');
      }
    }
    
    setTaskStatuses(prev => ({ 
      ...prev, 
      [taskKey]: newStatus,
      [`${taskKey}-forwardedToName`]: selectedUser.name,
      [`${taskKey}-note`]: forwardReason.trim()
    }));
    setForwardModalState({ isOpen: false, task: null, newStatus: 'Forwarded' });
    setForwardToUid('');
    setForwardReason('');
  };

  useEffect(() => {
    fetchDashboardStats();
    fetchInteractions();
    fetchStaff();
    fetchStaffTasks('assigned-to-me');
    if (user?.userType === 'CEO') {
      fetchUsersList();
    }
    const interval = setInterval(() => {
      fetchDashboardStats();
      fetchInteractions();
      fetchStaff();
      fetchStaffTasks('assigned-to-me');
      if (user?.userType === 'CEO') {
        fetchUsersList();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [user]);

  if (dashboardLoading && !dashboardStats) {
    return (
      <div className="h-96 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    );
  }

  const cards = dashboardStats?.cards || {
    totalAccounts: 0,
    healthyAccounts: 0,
    atRiskAccounts: 0,
    criticalAccounts: 0,
    activeContacts: 0,
    monthlyInteractions: 0
  };

  const charts = dashboardStats?.charts || {
    sentimentDistribution: { Positive: 0, Neutral: 0, Negative: 0 },
    riskCategories: {},
    industryTrend: [],
    engagementFrequency: {}
  };

  const widgets = dashboardStats?.widgets || {
    topRisks: [],
    aiRecommendations: [],
    upcomingCommitments: []
  };

  // Recharts formats
  const sentimentData = [
    { name: 'Positive', value: charts.sentimentDistribution.Positive || 0, color: '#22C55E' },
    { name: 'Neutral', value: charts.sentimentDistribution.Neutral || 0, color: '#F59E0B' },
    { name: 'Negative', value: charts.sentimentDistribution.Negative || 0, color: '#EF4444' }
  ].filter(d => d.value > 0);

  const riskData = Object.entries(charts.riskCategories).map(([category, count]) => ({
    category,
    Count: count
  }));

  const engagementData = Object.entries(charts.engagementFrequency).map(([source, count]) => ({
    source,
    Count: count
  }));

  // Standard health scores trends for mock timeline
  const trendData = charts.industryTrend.length > 0 ? charts.industryTrend : [
    { industry: 'Technology', avgHealth: 82 },
    { industry: 'Finance', avgHealth: 74 },
    { industry: 'Logistics', avgHealth: 55 },
    { industry: 'Healthcare', avgHealth: 90 }
  ];

  return (
    <div className="p-6 md:p-8 space-y-5">
      {/* 0. Header Greeting */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          {user?.userType === 'BU Head' ? (
            <>
              <h1 className="text-xl font-bold text-white mt-1">Hello, {user.name}</h1>
              <p className="text-xs text-slate-400">
                Monitoring relationship signals, risks, and engagement health for the <span className="text-white font-bold">{user.bu}</span> division.
              </p>
            </>
          ) : ['Project Manager', 'Delivery Manager', 'Sales Manager', 'Account Manager', 'Delivery Head'].includes(user?.userType) ? (
            <>
              <h1 className="text-xl font-bold text-white mt-1">Welcome back, {user.name}</h1>
              <p className="text-xs text-slate-400">
                Monitoring client engagement, risks, and health scores for your managed projects and team rosters.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white mt-1">Welcome back, {user?.name || 'User'}</h1>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/staff-tasks/new')}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-blue-600 text-xs text-white font-bold rounded-xl shadow-lg shadow-primary/20 active:scale-98 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>Assign Task</span>
          </button>
          <button
            onClick={() => navigate('/log-interaction')}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-blue-600 text-xs text-white font-bold rounded-xl shadow-lg shadow-primary/20 active:scale-98 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>Log Interaction</span>
          </button>
        </div>
      </div>

      {/* ── TASKS ASSIGNED TO ME ── */}
      {(() => {
        // Extract real tasks assigned to current user from interactions
        const realMyTasks = [];
        interactions.forEach(item => {
          if (Array.isArray(item.actionMentions)) {
            item.actionMentions.forEach(mention => {
              if (mention.uid === user?.uid) {
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
                  priority: mention.priority || 'Medium',
                  dueDate: mention.dueDate || null,
                  status: mention.status || 'Pending',
                  accountId: item.accountId,
                  companyName: item.companyName || 'External Account',
                  loggedByName: item.loggedByName || 'System Admin',
                  subject: item.subject,
                  timestamp: item.timestamp,
                  originalInteraction: item,
                  isInteractionTask: true
                });
              }
            });
          }
        });

        const myStaffTasks = (staffTasks || [])
          .filter(t => t.assignedToUid === user?.uid)
          .map(t => ({
            ...t,
            taskHeader: t.title,
            task: t.description,
            isInteractionTask: false
          }));

        const getTaskTime = (task) => {
          if (task.timestamp) return new Date(task.timestamp);
          if (task.createdAt) return new Date(task.createdAt);
          if (task.date && task.time) return new Date(`${task.date}T${task.time}:00`);
          return new Date(0);
        };

        const displayTasks = [...realMyTasks, ...myStaffTasks].sort((a, b) => getTaskTime(b) - getTaskTime(a));

        const getStatusStyle = (st) => {
          const s = (st || 'Pending').toLowerCase();
          if (s.includes('complete') || s.includes('forward')) return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
          if (s.includes('progress') || s.includes('accept') || s.includes('decline')) return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
          if (s.includes('overdued') || s.includes('overdue')) return 'bg-rose-500/10 border-rose-500/20 text-rose-600';
          return 'bg-slate-500/10 border-slate-600/30 text-slate-400';
        };

        return (
          <div className="glass p-5 rounded-2xl border border-slate-800/80 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-350">Tasks Assigned to Me</h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/staff-tasks/new')}
                  className="flex items-center gap-1 text-xs font-bold text-primary hover:text-blue-300 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Assign Task</span>
                </button>
                <span className="text-slate-700 text-xs">|</span>
                <button
                  onClick={() => navigate('/interaction-log')}
                  className="flex items-center gap-1 text-xs font-bold text-primary hover:text-blue-300 transition-colors cursor-pointer"
                >
                  View All <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {displayTasks.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">No tasks assigned to you yet.</div>
            ) : (
              <div className="space-y-3">
                {displayTasks.slice(0, 5).map((task, idx) => {
                  const taskKey = task.isInteractionTask ? `${task.interactionId}-${task.uid}` : task.taskId;
                  const currentStatus = taskStatuses[taskKey] || task.status || 'Pending';
                  const forwardedTo = taskStatuses[`${taskKey}-forwardedToName`] || task.forwardedToName;
                  const today = new Date();
                  today.setHours(0,0,0,0);
                  const taskDue = task.dueDate ? new Date(task.dueDate) : null;
                  if (taskDue) {
                    taskDue.setHours(0,0,0,0);
                  }
                  const isTaskOverdue = taskDue && taskDue < today && currentStatus !== 'Completed';
                  const isStatusUnchanged = currentStatus === 'Pending' || currentStatus === 'Task Assigned';
                  const showAsOverdued = isTaskOverdue && isStatusUnchanged;
                  return (
                    <div 
                      key={task.isInteractionTask ? `${task.interactionId}-${idx}` : task.taskId} 
                      onClick={() => {
                        if (task.isInteractionTask) {
                          navigate('/interaction-log', { state: { selectedInteractionId: task.interactionId, from: '/dashboard' } });
                        } else {
                          navigate('/staff-tasks', { state: { selectedTaskId: task.taskId } });
                        }
                      }}
                      className="bg-dark-900/60 border border-slate-800 p-4 rounded-xl hover:border-slate-700/60 cursor-pointer transition-all duration-200 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {task.accountId ? (
                              <span 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/accounts/${task.accountId}`);
                                }}
                                className="text-xs font-extrabold text-slate-200 hover:text-primary cursor-pointer transition-colors"
                              >
                                {task.companyName}
                              </span>
                            ) : (
                              <span className="text-xs font-extrabold text-slate-400">
                                {task.companyName || 'Internal'}
                              </span>
                            )}
                            <span className="text-slate-650 text-[10px]">·</span>
                            {task.isInteractionTask ? (
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                                Interaction Log
                              </span>
                            ) : (
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                                Staff Task
                              </span>
                            )}
                          </div>
                          <div className="relative group/task">
                            <p 
                              title={task.description || task.originalInteraction?.messageText || 'No task description available.'}
                              className="text-xs text-slate-355 font-semibold leading-relaxed cursor-help hover:text-primary transition-colors inline-block"
                            >
                              {(() => {
                                const shortHeader = task.taskHeader && task.taskHeader.split(/\s+/).length <= 5
                                  ? task.taskHeader
                                  : (() => {
                                      const clean = (task.taskHeader || task.task || task.title || task.originalInteraction?.messageText || task.originalInteraction?.subject || 'Task Assignment').trim();
                                      const lower = clean.toLowerCase();
                                      if (lower.includes('call with') || lower.includes('conversation through call with')) {
                                        const match = clean.match(/(?:call with|call|conversation with|conversation through call with)\s+([A-Za-z]+)/i);
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
                                          const cleanTopic = topic.replace(/(?:of|the|a|for|new)$/i, '').trim();
                                          return `${cleanTopic.charAt(0).toUpperCase() + cleanTopic.slice(1)} Discussion`;
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
                                      if (words.length > 4) {
                                        return words.slice(0, 4).join(' ') + '...';
                                      }
                                      return stripped;
                                    })();
                                return shortHeader;
                              })()}
                            </p>

                            {/* Premium Custom Tooltip */}
                            <div className="absolute left-0 bottom-full mb-2 w-80 p-4 bg-slate-900/95 border border-slate-700/80 text-slate-200 text-xs rounded-xl shadow-2xl backdrop-blur-md pointer-events-none transition-all duration-200 opacity-0 scale-95 translate-y-1 group-hover/task:opacity-100 group-hover/task:scale-100 group-hover/task:translate-y-0 z-50 origin-bottom-left">
                              <div className="space-y-3">
                                {/* Log Details Section */}
                                <div>
                                  <div className="font-bold text-slate-400 mb-1 flex items-center gap-1.5 border-b border-slate-800/60 pb-1">
                                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                                    <span>Task Description</span>
                                  </div>
                                  <div className="leading-relaxed whitespace-pre-wrap font-medium text-slate-300">
                                    {task.description || task.originalInteraction?.messageText || task.originalInteraction?.subject || 'No task description available.'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          {(currentStatus === 'Completed' || currentStatus === 'Decline' || currentStatus === 'Forwarded') && (taskStatuses[`${taskKey}-note`] || task.comments || task.completionNote) && (
                            <p className="text-[11px] text-slate-405 italic mt-1 bg-slate-950/20 px-2.5 py-1 rounded border border-slate-800/60 w-fit">
                              Note: "{taskStatuses[`${taskKey}-note`] || task.comments || task.completionNote}"
                            </p>
                          )}
                          <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                            <span className="text-xs text-slate-500 font-medium">Assigned by: <span className="text-slate-400 font-bold">{task.assignedByName || task.loggedByName}</span></span>
                            <span className="text-xs text-slate-600">·</span>
                            <span className="text-xs text-slate-500">{new Date(task.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                                               {task.priority && (
                              <>
                                <span className="text-xs text-slate-600">·</span>
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                                  task.priority === 'High' ? 'bg-rose-500/10 border-rose-500/20 text-rose-455' :
                                  task.priority === 'Medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-455' :
                                  'bg-slate-800 border-slate-700 text-slate-455'
                                }`}>
                                  {task.priority === 'High' ? 'High' : task.priority === 'Medium' ? 'Medium' : 'Low'}
                                </span>
                              </>
                            )}

                            {task.dueDate && (
                              <>
                                <span className="text-xs text-slate-600">·</span>
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                                  isTaskOverdue 
                                    ? 'bg-rose-600 border-rose-500 text-white animate-pulse' 
                                    : 'bg-slate-800 border-slate-700 text-slate-300'
                                }`}>
                                  Due: {new Date(task.dueDate).toLocaleDateString()} {isTaskOverdue && ' (OVERDUE)'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {(() => {
                          let displayStatus = currentStatus === 'Pending' ? 'Task Assigned' : currentStatus;
                          if (displayStatus === 'Accept/Decline') displayStatus = 'Accepted';
                          if (displayStatus === 'Accept' || displayStatus === 'In Progress') displayStatus = 'Accepted';
                          if (displayStatus === 'Decline' || displayStatus === 'Declined') displayStatus = 'Declined';
                          if (displayStatus === 'Completed/Forwarded') displayStatus = 'Completed';
                          if (showAsOverdued) {
                            displayStatus = 'Overdued';
                          }
                          return (
                            <span className={`shrink-0 text-xs font-black uppercase tracking-wider px-2 py-1 rounded-lg border ${getStatusStyle(displayStatus)}`}>
                              {displayStatus === 'Forwarded' && forwardedTo ? `Forwarded to @${forwardedTo}` : displayStatus}
                            </span>
                          );
                        })()}
                      </div>

                      {/* Inline status change dropdown */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 font-bold">Change Status:</span>
                          {(() => {
                            let selectValue = currentStatus === 'Pending' ? 'Task Assigned' : currentStatus;
                            if (selectValue === 'Accept/Decline') selectValue = 'Accept';
                            if (selectValue === 'Completed/Forwarded') selectValue = 'Completed';
                            if (selectValue === 'Accepted' || selectValue === 'In Progress') selectValue = 'Accept';
                            if (selectValue === 'Declined' || selectValue === 'Decline') selectValue = 'Decline';
                            if (showAsOverdued) {
                              selectValue = 'Overdued';
                            }
                            return (
                              <select
                                value={selectValue}
                                onChange={async (e) => {
                                  e.stopPropagation();
                                  const st = e.target.value;
                                  if (st === 'Completed') {
                                    setCompletionModalState({ isOpen: true, task, newStatus: st });
                                  } else if (st === 'Forwarded') {
                                    setForwardModalState({ isOpen: true, task, newStatus: st });
                                  } else if (st === 'Decline') {
                                    setDeclineModalState({ isOpen: true, task });
                                  } else if (st === 'Accept') {
                                    setAcceptModalState({ isOpen: true, task });
                                  } else {
                                    if (task.isInteractionTask) {
                                      const ok = await updateTaskStatus(task.interactionId, task.uid, st);
                                      if (ok) fetchInteractions();
                                    } else {
                                      const ok = await updateStaffTaskStatus(task.taskId, st);
                                      if (ok) fetchStaffTasks('assigned-to-me');
                                    }
                                    setTaskStatuses(prev => ({ ...prev, [taskKey]: st }));
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="px-2 py-1 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 font-bold outline-none cursor-pointer focus:border-indigo-500"
                              >
                                {selectValue === 'Overdued' && <option value="Overdued">Overdued</option>}
                                <option value="Task Assigned">Task Assigned</option>
                                <option value="Accept">Accepted</option>
                                <option value="Decline">Declined</option>
                                <option value="Completed">Completed</option>
                                <option value="Forwarded">Forwarded</option>
                              </select>
                            );
                          })()}
                        </div>
                        {currentStatus === 'Forwarded' && forwardedTo && (
                          <span className="text-xs text-indigo-450 font-bold">
                            to @{forwardedTo}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* 1. KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Accounts */}
        <div className="glass p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Accounts</span>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2">
            <h3 className="text-lg font-bold text-white">{cards.totalAccounts}</h3>
            <span className="text-xs text-slate-500 block mt-0.5">CRM Database Active</span>
          </div>
        </div>

        {/* Healthy Accounts */}
        <div className="glass p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Healthy</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <h3 className="text-lg font-bold text-emerald-400">{cards.healthyAccounts}</h3>
            <span className="text-xs text-emerald-500/80 font-medium flex items-center gap-0.5 mt-0.5">
              <ArrowUpRight className="w-3 h-3" />
              Score &ge; 75%
            </span>
          </div>
        </div>

        {/* At-Risk Accounts */}
        <div className="glass p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">At-Risk</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <h3 className="text-lg font-bold text-amber-400">{cards.atRiskAccounts}</h3>
            <span className="text-xs text-amber-500/85 font-medium mt-0.5 block">Score 50-74%</span>
          </div>
        </div>

        {/* Critical Accounts */}
        <div className="glass p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Critical</span>
            <AlertOctagon className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-lg font-bold text-rose-500">{cards.criticalAccounts}</h3>
            <span className="text-xs text-rose-400/80 font-medium flex items-center gap-0.5 mt-0.5">
              <ArrowDownRight className="w-3 h-3" />
              Score &lt; 50%
            </span>
          </div>
        </div>

        {/* Active Contacts */}
        <div className="glass p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Stakeholders</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2">
            <h3 className="text-lg font-bold text-white">{cards.activeContacts}</h3>
            <span className="text-xs text-slate-500 block mt-0.5">Relationship Depth</span>
          </div>
        </div>
      </div>

      {/* 2. Charts Section — responsive grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Chart A: Industry Health Trend */}
        <div className="glass p-3 rounded-xl border border-slate-800/80">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Industry Health Profile</h3>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                <XAxis dataKey="industry" stroke="#64748b" fontSize={9} />
                <YAxis stroke="#64748b" fontSize={9} domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '12px' }} />
                <Area type="monotone" dataKey="avgHealth" name="Avg Health Score" stroke="#2563EB" strokeWidth={2} fillOpacity={1} fill="url(#healthGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart B: Sentiment Distribution */}
        <div className="glass p-3 rounded-xl border border-slate-800/80 flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Communication Sentiment</h3>
          <div className="flex-1 flex items-center gap-2">
            <div className="h-28 w-28 shrink-0">
              {sentimentData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">—</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sentimentData}
                      cx="50%"
                      cy="50%"
                      innerRadius={28}
                      outerRadius={44}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {sentimentData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="space-y-1.5 min-w-0">
              {sentimentData.map(entry => (
                <div key={entry.name} className="flex items-center justify-between text-xs font-semibold gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                    <span className="text-slate-300 truncate">{entry.name}</span>
                  </div>
                  <span className="text-white shrink-0">{entry.value}</span>
                </div>
              ))}
              {sentimentData.length === 0 && (
                <span className="text-xs text-slate-500">No data</span>
              )}
            </div>
          </div>
        </div>

        {/* Chart C: Risk Categories Distribution */}
        <div className="glass p-3 rounded-xl border border-slate-800/80">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Active Risk Types</h3>
          <div className="h-28">
            {riskData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No unresolved risks. System is clean!
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                  <XAxis dataKey="category" stroke="#64748b" fontSize={9} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={9} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '12px' }} />
                  <Bar dataKey="Count" fill="#EF4444" radius={[4, 4, 0, 0]}>
                    {riskData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.Count > 2 ? '#EF4444' : '#F59E0B'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart D: Engagement Source Distribution */}
        <div className="glass p-3 rounded-xl border border-slate-800/80">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Engagement Channels</h3>
          <div className="h-28">
            {engagementData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No interactions logged yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={engagementData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                  <XAxis type="number" stroke="#64748b" fontSize={9} />
                  <YAxis dataKey="source" type="category" stroke="#64748b" fontSize={9} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '12px' }} />
                  <Bar dataKey="Count" fill="#2563EB" radius={[0, 4, 4, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* 3. Bottom Widgets Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Side: Top Risks Tracker */}
        <div className="glass p-4 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Top Account Risks</h3>
            <div className="space-y-3">
              {widgets.topRisks.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No critical open risks found</div>
              ) : (
                widgets.topRisks.map(risk => (
                  <div key={risk.riskId} className="bg-dark-900/60 p-3 rounded-xl border border-slate-800 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{risk.companyName}</span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full border ${
                          risk.severity === 'High' 
                            ? 'bg-rose-500/10 border-rose-500/25 text-rose-300' 
                            : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                        }`}>
                          {risk.severity} Risk
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2">{risk.description}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Center: AI Recommendations Engine */}
        <div className="glass p-4 rounded-xl border border-slate-800/80 flex flex-col">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">AI Relationship Guidance</h3>
            </div>
            <div className="space-y-3">
              {widgets.aiRecommendations.map(rec => (
                <div key={rec.id} className="bg-primary/5 p-3 rounded-xl border border-primary/15 flex gap-3 items-start">
                  <div className="bg-primary/10 border border-primary/25 p-1.5 rounded-lg text-primary shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-white truncate">{rec.title}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{rec.description}</p>
                    {rec.priority && (
                      <span className={`inline-block text-xs font-bold mt-1 uppercase px-1.5 py-0.5 rounded ${
                        rec.priority === 'High' ? 'bg-red-500/20 text-red-300' : 'bg-blue-500/20 text-blue-300'
                      }`}>
                        {rec.priority} Priority
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>


      {/* ── BU HEAD TEAM OVERVIEW ── */}
      {user?.userType === 'BU Head' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
          {/* Projects & PMs under BU */}
          <div className="glass p-4 rounded-xl border border-slate-800/80 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Division Projects & Teams</h3>
            <div className="space-y-2.5">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-bold uppercase">Division Projects</span>
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  {user.projects && user.projects.length > 0 ? (
                    user.projects.map(p => (
                      <span key={p} className="bg-slate-800 text-slate-200 text-xs px-2.5 py-1 rounded-lg border border-slate-700">
                        📁 {p}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">No projects mapped to this BU.</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1 border-t border-slate-800/60 pt-2.5">
                <span className="text-xs text-slate-500 font-bold uppercase">Project Managers</span>
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  {user.projectManagers && user.projectManagers.length > 0 ? (
                    user.projectManagers.map(pm => (
                      <span key={pm} className="bg-primary/5 text-primary text-xs px-2.5 py-1 rounded-lg border border-primary/20 font-semibold">
                        👤 {pm}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">No project managers assigned.</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* BU Division Staff & Engineers */}
          <div className="glass p-4 rounded-xl border border-slate-800/80 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">BU Operations Directory</h3>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-500 font-bold uppercase">Division Employees</span>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {user.employees && user.employees.length > 0 ? (
                  user.employees.map(emp => (
                    <div key={emp} className="bg-dark-900/60 border border-slate-800 p-2 rounded-lg text-xs font-semibold text-slate-300">
                      💼 {emp}
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 col-span-2">No employee records in this BU.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MANAGER TEAM OVERVIEW ── */}
      {['Project Manager', 'Delivery Manager', 'Sales Manager', 'Account Manager'].includes(user?.userType) && (
        <div className="glass p-5 rounded-2xl border border-slate-800/80 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-450">My Managed Projects & Teams</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {user.projects && user.projects.length > 0 ? (
              user.projects.map((proj, idx) => {
                const projName = typeof proj === 'string' ? proj : proj.name;
                const projEmps = typeof proj === 'string' ? [] : (proj.employees || []);
                return (
                  <div key={idx} className="bg-dark-900/60 border border-slate-800 p-4 rounded-xl space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 bg-primary/10 border border-primary/20 text-primary rounded-lg text-xs">
                        📁
                      </span>
                      <h4 className="text-xs font-bold text-white truncate">{projName || `Project #${idx + 1}`}</h4>
                    </div>
                    
                    <div className="space-y-1.5 pt-2 border-t border-slate-850">
                      <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Team Roster</span>
                      <div className="flex flex-col gap-1">
                        {projEmps.length > 0 && projEmps.some(Boolean) ? (
                          projEmps.filter(Boolean).map((emp, eIdx) => (
                            <div key={eIdx} className="bg-slate-800/40 border border-slate-800 p-1.5 rounded-lg text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                              {emp}
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-slate-500 italic">No employees assigned to this project yet.</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center text-xs text-slate-500 col-span-full">No projects managed yet.</div>
            )}
          </div>
        </div>
      )}

      {/* ── CEO PORTAL OVERVIEW ── */}
      {user?.userType === 'CEO' && (
        <div className="space-y-6 mt-5">
          <div className="glass p-5 rounded-2xl border border-slate-800/80 space-y-4">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" /> Corporate Heads Directory & Operations
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {['Finance Head', 'Global HR Head', 'ITG Head', 'NDA Head', 'TC Head', 'Quality Head'].map(pos => {
                const head = usersList.find(u => u.position?.toLowerCase().includes(pos.toLowerCase().replace(' head', '')) || u.position?.toLowerCase() === pos.toLowerCase());
                return (
                  <div key={pos} className="bg-dark-900/60 border border-slate-800 p-4 rounded-xl space-y-3 hover:border-slate-700/80 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">{pos}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-black uppercase ${head ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/25 text-rose-400'}`}>
                        {head ? 'ACTIVE' : 'VACANT'}
                      </span>
                    </div>
                    {head ? (
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-white">{head.name}</h4>
                        <p className="text-xs text-slate-400">{head.email}</p>
                        <div className="flex items-center gap-2 pt-2 text-xs text-slate-500">
                          <span>📁 {head.projects?.length || 0} Projects</span>
                          <span>•</span>
                          <span>👥 {head.employees?.length || 0} Team Members</span>
                        </div>
                      </div>
                    ) : (
                      <div className="py-2 text-xs text-slate-500 italic">No head currently assigned to this function.</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass p-5 rounded-2xl border border-slate-800/80 space-y-4">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-350">
              Corporate Business Units Status
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Delivery Division */}
              <div className="bg-dark-900/60 border border-slate-800 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="text-xs font-bold text-emerald-400">Delivery Division (Farming)</h4>
                  <span className="text-xs text-slate-500 font-medium">Managed under ITG</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Main Delivery Head:</span>
                    <span className="text-white font-semibold">
                      {usersList.find(u => (u.userType || u.role) === 'Delivery Head' && !u.position?.toLowerCase().includes('insurance') && !u.position?.toLowerCase().includes('industrial') && !u.position?.toLowerCase().includes('healthcare'))?.name || 'Vacant'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Sub-Divisions:</span>
                    <span className="text-slate-200">Insurance, Industrial, Healthcare & Mobility</span>
                  </div>
                </div>
              </div>

              {/* P&L Division */}
              <div className="bg-dark-900/60 border border-slate-800 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="text-xs font-bold text-purple-400">P&L Division (Hunting & Mining)</h4>
                  <span className="text-xs text-slate-500 font-medium">Sales Consultation</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">P&L BU Head:</span>
                    <span className="text-white font-semibold">
                      {usersList.find(u => u.position?.toLowerCase().includes('p&l head'))?.name || 'Vacant'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Key Roster:</span>
                    <span className="text-slate-200">BFS BU Consultants, Sales Managers</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FUNCTIONAL HEAD DEPARTMENT OVERVIEW ── */}
      {user?.userType === 'Functional Head' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
          {/* Projects under this Department */}
          <div className="glass p-4 rounded-xl border border-slate-800/80 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Departmental Projects & SLA Status
            </h3>
            
            <div className="space-y-2.5">
              {user.projects && user.projects.length > 0 ? (
                user.projects.map((p, idx) => {
                  const projName = typeof p === 'string' ? p : p.name;
                  const employeesCount = typeof p === 'string' ? 0 : (p.employees?.length || 0);
                  return (
                    <div key={idx} className="bg-dark-900/40 border border-slate-800/60 p-3 rounded-lg flex items-center justify-between text-xs animate-soft-pulse">
                      <div className="space-y-0.5">
                        <span className="font-bold text-slate-200">📁 {projName}</span>
                        <span className="text-xs text-slate-500 block">Overseeing {employeesCount} assigned employee(s)</span>
                      </div>
                      <span className="bg-primary/10 border border-primary/20 text-primary text-xs px-2 py-0.5 rounded font-black tracking-wider">
                        ACTIVE IN PROGRESS
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-xs text-slate-550 py-2 italic text-center">No active projects logged for this department.</div>
              )}
            </div>
          </div>

          {/* Department Staff & Directory */}
          <div className="glass p-4 rounded-xl border border-slate-800/80 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Department Operations & Headcount
            </h3>
            
            <div className="space-y-2">
              <span className="text-xs text-slate-500 font-bold uppercase block pb-1 border-b border-slate-850">Active Employees Directory</span>
              <div className="grid grid-cols-1 gap-2 mt-2">
                {user.employees && user.employees.length > 0 ? (
                  user.employees.map(emp => (
                    <div key={emp} className="bg-dark-900/60 border border-slate-800/60 p-2.5 rounded-lg text-xs font-bold text-slate-350 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="bg-primary/10 border border-primary/25 text-primary w-5 h-5 rounded flex items-center justify-center font-bold text-xs">
                          {emp.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="text-slate-200 font-semibold">{emp}</span>
                      </div>
                      <span className="text-xs bg-slate-800 px-2 py-0.5 border border-slate-700/65 text-slate-400 rounded-full font-semibold uppercase">{user.department || 'Staff'} team</span>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 text-center block py-2 italic">No employee records mapped to this department.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Completion Note Modal */}
      {completionModalState.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-dark-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
            <button 
              onClick={() => {
                setCompletionModalState({ isOpen: false, task: null, newStatus: '' });
                setCompletionNote('');
                setCompletionFile(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckSquare className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Complete Task</h3>
                <p className="text-xs text-slate-400">Send a note back to {completionModalState.task?.loggedByName}</p>
              </div>
            </div>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              const { task, newStatus } = completionModalState;
              const taskKey = task.isInteractionTask ? `${task.interactionId}-${task.uid}` : task.taskId;
              if (task.isInteractionTask) {
                const ok = await updateTaskStatus(task.interactionId, task.uid, newStatus);
                if (ok) {
                  if (completionNote.trim()) {
                    await replyToInteraction(task.interactionId, `Task Completion Note: ${completionNote}`);
                  }
                  fetchInteractions();
                }
              } else {
                const ok = await updateStaffTaskStatus(task.taskId, newStatus, completionNote.trim(), `Task Completion Note: ${completionNote.trim()}`);
                if (ok) {
                  fetchStaffTasks('assigned-to-me');
                }
              }
              setTaskStatuses(prev => ({ ...prev, [taskKey]: newStatus }));
              setCompletionModalState({ isOpen: false, task: null, newStatus: '' });
              setCompletionNote('');
              setCompletionFile(null);
            }} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Completion Note</label>
                <textarea
                  value={completionNote}
                  onChange={(e) => setCompletionNote(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-indigo-500 min-h-[100px]"
                  placeholder="E.g., Task completed successfully. Attached the required files."
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Attachments (Optional)</label>
                <input
                  type="file"
                  onChange={(e) => setCompletionFile(e.target.files[0])}
                  className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700"
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all"
                >
                  Mark Completed
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Forward Task Modal */}
      {forwardModalState.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-dark-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
            <button 
              onClick={() => {
                setForwardModalState({ isOpen: false, task: null, newStatus: 'Forwarded' });
                setForwardToUid('');
                setForwardReason('');
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Send className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Forward Task</h3>
                <p className="text-xs text-slate-400">Select a team member to forward this task to</p>
              </div>
            </div>
            
            <form onSubmit={handleForwardSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Forward To</label>
                <select
                  value={forwardToUid}
                  onChange={(e) => setForwardToUid(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-indigo-500 cursor-pointer"
                  required
                >
                  <option value="">Select Team Member</option>
                  {(staffList || [])
                    .filter(s => s.uid !== user?.uid)
                    .map(s => (
                      <option key={s.uid} value={s.uid}>
                        {s.name} ({s.role || s.position || 'Team Member'})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Forwarding Note / Reason</label>
                <textarea
                  value={forwardReason}
                  onChange={(e) => setForwardReason(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-indigo-500 min-h-[100px]"
                  placeholder="E.g., Forwarding to you as you are leading the deployment module."
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={!forwardToUid}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all"
                >
                  Forward Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Accept Task Modal */}
      {acceptModalState.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-dark-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setAcceptModalState({ isOpen: false, task: null });
                setAcceptNote('');
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <ThumbsUp className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Accept Task</h3>
                <p className="text-xs text-slate-400">Confirm acceptance and optionally add a note</p>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const { task } = acceptModalState;
                const taskKey = task.isInteractionTask ? `${task.interactionId}-${task.uid}` : task.taskId;
                if (task.isInteractionTask) {
                  const ok = await updateTaskStatus(task.interactionId, task.uid, 'Accept');
                  if (ok) {
                    if (acceptNote.trim()) {
                      await replyToInteraction(task.interactionId, `Acceptance Note: ${acceptNote}`);
                    }
                    fetchInteractions();
                  }
                } else {
                  const ok = await updateStaffTaskStatus(task.taskId, 'Accept', '', acceptNote.trim());
                  if (ok) {
                    fetchStaffTasks('assigned-to-me');
                  }
                }
                setTaskStatuses(prev => ({ ...prev, [taskKey]: 'Accept' }));
                setAcceptModalState({ isOpen: false, task: null });
                setAcceptNote('');
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Acceptance Note (Optional)</label>
                <textarea
                  value={acceptNote}
                  onChange={(e) => setAcceptNote(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-amber-500 min-h-[100px]"
                  placeholder="E.g., I will begin working on this task immediately."
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl transition-all"
                >
                  Accept Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Decline Task Modal */}
      {declineModalState.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-dark-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setDeclineModalState({ isOpen: false, task: null });
                setDeclineReason('');
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Decline Task</h3>
                <p className="text-xs text-slate-400">Provide a reason for declining this task</p>
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const { task } = declineModalState;
                const taskKey = task.isInteractionTask ? `${task.interactionId}-${task.uid}` : task.taskId;
                if (task.isInteractionTask) {
                  const ok = await updateTaskStatus(task.interactionId, task.uid, 'Decline');
                  if (ok) {
                    if (declineReason.trim()) {
                      await replyToInteraction(task.interactionId, `Decline Reason: ${declineReason}`);
                    }
                    fetchInteractions();
                  }
                } else {
                  const ok = await updateStaffTaskStatus(task.taskId, 'Decline', '', declineReason.trim());
                  if (ok) {
                    fetchStaffTasks('assigned-to-me');
                  }
                }
                setTaskStatuses(prev => ({ ...prev, [taskKey]: 'Decline' }));
                setDeclineModalState({ isOpen: false, task: null });
                setDeclineReason('');
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Reason for Declining</label>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-rose-500 min-h-[100px]"
                  placeholder="E.g., Unable to complete due to conflicting priorities or missing resources."
                  required
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all"
                >
                  Submit Decline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
