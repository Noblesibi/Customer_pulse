import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, CheckCircle2, AlertTriangle, AlertOctagon, Activity, HelpCircle,
  ArrowUpRight, ArrowDownRight, Sparkles, ClipboardList, Send, Clock, CheckCheck,
  MessageSquare, Building2, ArrowRight, Eye, CheckSquare, CalendarClock, X
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
    myTasks, myTasksLoading, fetchMyTasks,
    replyToInteraction, fetchReplies, repliesByInteraction,
    usersList, fetchUsersList,
    activityLogs, activityLogsLoading, fetchActivityLogs,
    interactions, interactionsLoading, fetchInteractions,
    updateTaskStatus,
    staffList, fetchStaff
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

  const handleForwardSubmit = async (e) => {
    e.preventDefault();
    const { task, newStatus } = forwardModalState;
    if (!forwardToUid) return;
    const selectedUser = (staffList || []).find(s => s.uid === forwardToUid);
    if (!selectedUser) return;
    
    const ok = await updateTaskStatus(task.interactionId, task.uid, newStatus, '', selectedUser.uid, selectedUser.name);
    if (ok) {
      fetchInteractions();
    }
    setTaskStatuses(prev => ({ 
      ...prev, 
      [`${task.interactionId}-${task.uid}`]: newStatus,
      [`${task.interactionId}-${task.uid}-forwardedToName`]: selectedUser.name 
    }));
    setForwardModalState({ isOpen: false, task: null, newStatus: 'Forwarded' });
    setForwardToUid('');
  };

  useEffect(() => {
    fetchDashboardStats();
    fetchMyTasks();
    fetchInteractions();
    fetchStaff();
    if (user?.userType === 'CEO') {
      fetchUsersList();
    }
    const interval = setInterval(() => {
      fetchDashboardStats();
      fetchMyTasks();
      fetchInteractions();
      fetchStaff();
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
    <div className="space-y-5">
      {/* 0. Header Greeting */}
      <div className="glass p-5 rounded-2xl border border-slate-800/80 flex items-center justify-between">
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
      </div>

      {/* ── TASKS ASSIGNED TO ME ── */}
      {(() => {
        // Extract real tasks assigned to current user from interactions
        const realMyTasks = [];
        interactions.forEach(item => {
          if (Array.isArray(item.actionMentions)) {
            item.actionMentions.forEach(mention => {
              if (mention.uid === user?.uid) {
                realMyTasks.push({
                  ...mention,
                  interactionId: item.interactionId,
                  accountId: item.accountId,
                  companyName: item.companyName || 'External Account',
                  loggedByName: item.loggedByName || 'System Admin',
                  subject: item.subject,
                  timestamp: item.timestamp,
                  originalInteraction: item
                });
              }
            });
          }
        });

        const displayTasks = realMyTasks;

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
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-350">Tasks Assigned to Me</h3>
                  <p className="text-xs text-slate-500">
                    Your pending and active tasks — update status directly from here.
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/activity-log')}
                className="flex items-center gap-1 text-xs font-bold text-primary hover:text-blue-300 transition-colors cursor-pointer"
              >
                View All <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {displayTasks.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">No tasks assigned to you yet.</div>
            ) : (
              <div className="space-y-3">
                {displayTasks.slice(0, 5).map((task, idx) => {
                  const currentStatus = taskStatuses[`${task.interactionId}-${task.uid}`] || task.status || 'Pending';
                  const forwardedTo = taskStatuses[`${task.interactionId}-${task.uid}-forwardedToName`] || task.forwardedToName;
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
                      key={`${task.interactionId}-${idx}`} 
                      onClick={() => navigate('/activity-log', { state: { selectedInteractionId: task.interactionId } })}
                      className="bg-dark-900/60 border border-slate-800 p-4 rounded-xl hover:border-slate-700/60 cursor-pointer transition-all duration-200 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/accounts/${task.accountId}`);
                              }}
                              className="text-xs font-extrabold text-slate-200 hover:underline hover:text-primary cursor-pointer transition-colors"
                            >
                              {task.companyName}
                            </span>
                            {task.subject && (
                              <span className="text-xs text-slate-500 font-semibold truncate max-w-[160px]">{task.subject}</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-355 font-semibold leading-relaxed">{task.task}</p>
                          <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                            <span className="text-xs text-slate-500 font-medium">Assigned by: <span className="text-slate-400 font-bold">{task.loggedByName}</span></span>
                            <span className="text-xs text-slate-600">·</span>
                            <span className="text-xs text-slate-500">{new Date(task.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                            
                            {task.priority && (
                              <>
                                <span className="text-xs text-slate-600">·</span>
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                                  task.priority === 'High' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                                  task.priority === 'Medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                  'bg-slate-800 border-slate-700 text-slate-450'
                                }`}>
                                  {task.priority === 'High' ? '🔥 High' : task.priority === 'Medium' ? '⚡ Medium' : 'Low'}
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
                                  📅 Due: {new Date(task.dueDate).toLocaleDateString()} {isTaskOverdue && ' (OVERDUE)'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {(() => {
                          let displayStatus = currentStatus === 'Pending' ? 'Task Assigned' : currentStatus;
                          if (displayStatus === 'Accept/Decline') displayStatus = 'Accept';
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
                            let displayStatus = currentStatus === 'Pending' ? 'Task Assigned' : currentStatus;
                            if (displayStatus === 'Accept/Decline') displayStatus = 'Accept';
                            if (displayStatus === 'Completed/Forwarded') displayStatus = 'Completed';
                            if (showAsOverdued) {
                              displayStatus = 'Overdued';
                            }
                            return (
                              <select
                                value={displayStatus}
                                onChange={async (e) => {
                                  e.stopPropagation();
                                  const st = e.target.value;
                                  if (st === 'Completed') {
                                    setCompletionModalState({ isOpen: true, task, newStatus: st });
                                  } else if (st === 'Forwarded') {
                                    setForwardModalState({ isOpen: true, task, newStatus: st });
                                  } else {
                                    const ok = await updateTaskStatus(task.interactionId, task.uid, st);
                                    if (ok) fetchInteractions();
                                    setTaskStatuses(prev => ({ ...prev, [`${task.interactionId}-${task.uid}`]: st }));
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="px-2 py-1 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 font-bold outline-none cursor-pointer focus:border-indigo-500"
                              >
                                {displayStatus === 'Overdued' && <option value="Overdued">Overdued</option>}
                                <option value="Task Assigned">Task Assigned</option>
                                <option value="Accept">Accept</option>
                                <option value="Decline">Decline</option>
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

      {/* 2. Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chart A: Industry Health Trend */}
        <div className="glass p-4 rounded-xl border border-slate-800/80">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Industry Health Profile</h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                <XAxis dataKey="industry" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '12px' }} />
                <Area type="monotone" dataKey="avgHealth" name="Avg Health Score" stroke="#2563EB" strokeWidth={2} fillOpacity={1} fill="url(#healthGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart B: Sentiment Distribution */}
        <div className="glass p-4 rounded-xl border border-slate-800/80 grid grid-cols-1 md:grid-cols-5 items-center gap-3">
          <div className="md:col-span-3 h-44">
            {sentimentData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No sentiment data logged yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sentimentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
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
          <div className="md:col-span-2 space-y-2 pr-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Communication Sentiment</h3>
            <div className="space-y-1.5">
              {sentimentData.map(entry => (
                <div key={entry.name} className="flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-slate-300">{entry.name}</span>
                  </div>
                  <span className="text-white">{entry.value} logged</span>
                </div>
              ))}
              {sentimentData.length === 0 && (
                <span className="text-xs text-slate-500">Log client emails/chats to populate sentiment distribution</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chart C: Risk Categories Distribution */}
        <div className="glass p-4 rounded-xl border border-slate-800/80">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Active Risk Types</h3>
          <div className="h-44">
            {riskData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No unresolved risks logged. System is clean!
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                  <XAxis dataKey="category" stroke="#64748b" fontSize={9} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} allowDecimals={false} />
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
        <div className="glass p-4 rounded-xl border border-slate-800/80">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Engagement Channels</h3>
          <div className="h-44">
            {engagementData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No interactions logged yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={engagementData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                  <XAxis type="number" stroke="#64748b" fontSize={10} />
                  <YAxis dataKey="source" type="category" stroke="#64748b" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '12px' }} />
                  <Bar dataKey="Count" fill="#2563EB" radius={[0, 4, 4, 0]} barSize={14} />
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


      {/* ── MY TASKS WIDGET ── visible to non-admin users when they have assignments */}
      {user?.role !== 'Admin' && (
        <div className="glass p-4 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">My Assigned Tasks</h3>
            <span className="ml-auto bg-primary/10 border border-primary/20 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
              {myTasks.length} task{myTasks.length !== 1 ? 's' : ''}
            </span>
          </div>

          {myTasksLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : myTasks.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500">No tasks assigned to you yet.</div>
          ) : (
            <div className="space-y-3">
              {myTasks.map(task => {
                const replies = repliesByInteraction[task.interactionId] || task.replies || [];
                const myReply = replies.find(r => r.authorUid === user?.uid);
                const myMention = (task.actionMentions || []).find(m => m.uid === user?.uid);
                const isOverdue = myMention?.dueDate && (() => {
                  const today = new Date();
                  today.setHours(0,0,0,0);
                  const taskDue = new Date(myMention.dueDate);
                  taskDue.setHours(0,0,0,0);
                  return taskDue < today && myMention?.status !== 'Completed';
                })();
                return (
                  <div key={task.interactionId} className="bg-dark-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                    {/* Task header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-bold text-white">{task.companyName}</span>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full border ${
                            task.replyStatus === 'Replied'
                              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                              : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                          }`}>
                            {task.replyStatus === 'Replied' ? '✓ Replied' : '⏳ Pending'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">{task.messageText}</p>
                        {myMention && (
                          <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/80 mb-2">
                            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">Your Sub-Task:</span>
                            <p className="text-xs text-slate-200 font-semibold leading-relaxed">{myMention.task}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock className="w-3 h-3" />
                          {task.loggedByName && <span>By {task.loggedByName} ·</span>}
                          <span>{new Date(task.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                          {myMention?.priority && (
                            <>
                              <span className="text-slate-650">·</span>
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                                myMention.priority === 'High' ? 'bg-rose-500/10 border-rose-500/20 text-rose-450' :
                                myMention.priority === 'Medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-450' :
                                'bg-slate-800 border-slate-700 text-slate-450'
                              }`}>
                                {myMention.priority === 'High' ? '🔥 High' : myMention.priority === 'Medium' ? '⚡ Medium' : 'Low'}
                              </span>
                            </>
                          )}
                          {myMention?.dueDate && (
                            <>
                              <span className="text-slate-650">·</span>
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                                isOverdue 
                                  ? 'bg-rose-600 border-rose-500 text-white animate-pulse' 
                                  : 'bg-slate-800 border-slate-700 text-slate-300'
                              }`}>
                                📅 Due: {new Date(myMention.dueDate).toLocaleDateString()} {isOverdue && ' (OVERDUE)'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Existing replies */}
                    {replies.length > 0 && (
                      <div className="space-y-1.5 border-t border-slate-800 pt-2">
                        {replies.map(r => (
                          <div key={r.replyId} className="flex gap-2 text-xs">
                            <span className="text-primary font-bold shrink-0">{r.authorName}:</span>
                            <span className="text-slate-300">{r.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply box — hide if already replied */}
                    {!myReply && (
                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          value={replyTexts[task.interactionId] || ''}
                          onChange={e => setReplyTexts(prev => ({ ...prev, [task.interactionId]: e.target.value }))}
                          onKeyDown={async e => {
                            if (e.key === 'Enter' && replyTexts[task.interactionId]?.trim()) {
                              setSendingReply(prev => ({ ...prev, [task.interactionId]: true }));
                              await replyToInteraction(task.interactionId, replyTexts[task.interactionId]);
                              setReplyTexts(prev => ({ ...prev, [task.interactionId]: '' }));
                              setSendingReply(prev => ({ ...prev, [task.interactionId]: false }));
                            }
                          }}
                          placeholder="Type your reply and press Enter..."
                          className="flex-1 bg-dark-900 border border-slate-700 text-xs text-white rounded-xl px-3 py-2 focus:outline-none focus:border-primary/50"
                        />
                        <button
                          disabled={!replyTexts[task.interactionId]?.trim() || sendingReply[task.interactionId]}
                          onClick={async () => {
                            if (!replyTexts[task.interactionId]?.trim()) return;
                            setSendingReply(prev => ({ ...prev, [task.interactionId]: true }));
                            await replyToInteraction(task.interactionId, replyTexts[task.interactionId]);
                            setReplyTexts(prev => ({ ...prev, [task.interactionId]: '' }));
                            setSendingReply(prev => ({ ...prev, [task.interactionId]: false }));
                          }}
                          className="bg-primary text-white p-2 rounded-xl cursor-pointer disabled:opacity-40"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
              const ok = await updateTaskStatus(task.interactionId, task.uid, newStatus);
              if (ok) {
                if (completionNote.trim()) {
                  await replyToInteraction(task.interactionId, `Task Completion Note: ${completionNote}`);
                }
                fetchInteractions();
              }
              setTaskStatuses(prev => ({ ...prev, [`${task.interactionId}-${task.uid}`]: newStatus }));
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

    </div>
  );
}
