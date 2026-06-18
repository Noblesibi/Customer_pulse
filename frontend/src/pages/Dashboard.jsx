import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, CheckCircle2, AlertTriangle, AlertOctagon, Activity, HelpCircle,
  ArrowUpRight, ArrowDownRight, Sparkles, ClipboardList, Send, Clock, CheckCheck,
  MessageSquare, Building2, ArrowRight
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
    interactions, interactionsLoading, fetchInteractions
  } = useStore();

  const [replyTexts, setReplyTexts] = useState({}); // { [interactionId]: string }
  const [sendingReply, setSendingReply] = useState({});

  useEffect(() => {
    fetchDashboardStats();
    fetchMyTasks();
    fetchInteractions();
    if (user?.role === 'Admin' || user?.role === 'Executive') {
      fetchActivityLogs();
    }
    if (user?.userType === 'CEO') {
      fetchUsersList();
    }
    const interval = setInterval(() => {
      fetchDashboardStats();
      fetchMyTasks();
      fetchInteractions();
      if (user?.role === 'Admin' || user?.role === 'Executive') {
        fetchActivityLogs();
      }
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
    aiRecommendations: []
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
              <div className="flex items-center gap-2">
                <span className="bg-primary/20 border border-primary/40 text-primary text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full">
                  Business Unit Head
                </span>
                {user.bu && (
                  <span className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full">
                    BU: {user.bu}
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-white mt-1">Hello, {user.name}</h1>
              <p className="text-xs text-slate-400">
                Monitoring relationship signals, risks, and engagement health for the <span className="text-white font-bold">{user.bu}</span> division.
              </p>
            </>
          ) : ['Project Manager', 'Delivery Manager', 'Sales Manager', 'Account Manager', 'Delivery Head'].includes(user?.userType) ? (
            <>
              <div className="flex items-center gap-2">
                <span className="bg-primary/20 border border-primary/40 text-primary text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full text-white">
                  {user.userType} Portal
                </span>
                {user.bu && (
                  <span className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full">
                    BU: {user.bu}
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-white mt-1">Welcome back, {user.name}</h1>
              <p className="text-xs text-slate-400">
                Monitoring client engagement, risks, and health scores for your managed projects and team rosters.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="bg-primary/20 border border-primary/40 text-primary text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full">
                  {user?.role || 'User'} Portal
                </span>
              </div>
              <h1 className="text-xl font-bold text-white mt-1">Welcome back, {user?.name || 'User'}</h1>
            </>
          )}
        </div>
      </div>

      {/* 1. KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Accounts */}
        <div className="glass p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Total Accounts</span>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2">
            <h3 className="text-lg font-bold text-white">{cards.totalAccounts}</h3>
            <span className="text-[9px] text-slate-500 block mt-0.5">CRM Database Active</span>
          </div>
        </div>

        {/* Healthy Accounts */}
        <div className="glass p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Healthy</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <h3 className="text-lg font-bold text-emerald-400">{cards.healthyAccounts}</h3>
            <span className="text-[9px] text-emerald-500/80 font-medium flex items-center gap-0.5 mt-0.5">
              <ArrowUpRight className="w-3 h-3" />
              Score &ge; 75%
            </span>
          </div>
        </div>

        {/* At-Risk Accounts */}
        <div className="glass p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider">At-Risk</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <h3 className="text-lg font-bold text-amber-400">{cards.atRiskAccounts}</h3>
            <span className="text-[9px] text-amber-500/85 font-medium mt-0.5 block">Score 50-74%</span>
          </div>
        </div>

        {/* Critical Accounts */}
        <div className="glass p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Critical</span>
            <AlertOctagon className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-lg font-bold text-rose-500">{cards.criticalAccounts}</h3>
            <span className="text-[9px] text-rose-400/80 font-medium flex items-center gap-0.5 mt-0.5">
              <ArrowDownRight className="w-3 h-3" />
              Score &lt; 50%
            </span>
          </div>
        </div>

        {/* Active Contacts */}
        <div className="glass p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Stakeholders</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2">
            <h3 className="text-lg font-bold text-white">{cards.activeContacts}</h3>
            <span className="text-[9px] text-slate-500 block mt-0.5">Relationship Depth</span>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                          risk.severity === 'High' 
                            ? 'bg-rose-500/10 border-rose-500/25 text-rose-300' 
                            : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                        }`}>
                          {risk.severity} Risk
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 line-clamp-2">{risk.description}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Side: AI Recommendations Engine */}
        <div className="glass p-4 rounded-xl border border-slate-800/80">
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
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-white">{rec.title}</h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{rec.description}</p>
                  {rec.priority && (
                    <span className={`inline-block text-[9px] font-bold mt-1 uppercase px-1.5 py-0.5 rounded ${
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

      {/* ── CLIENT INTERACTION LOGS PROGRESS TRACKER ── */}
      <div className="glass p-5 rounded-2xl border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-350">
                Client log progress tracking
              </h3>
              <p className="text-[10px] text-slate-500">
                Tracking stage lifecycle (Sent ➔ Seen ➔ Replied ➔ Received) of client communication logs.
              </p>
            </div>
          </div>
        </div>

        {interactionsLoading && interactions.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : interactions.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No client interactions logged yet.
          </div>
        ) : (
          <div className="space-y-4">
            {interactions.slice(0, 4).map((interaction) => {
              const hasMentions = Array.isArray(interaction.actionMentions) && interaction.actionMentions.length > 0;
              
              // 1. Sent: Always complete
              const isSent = true;
              
              // 2. Seen: True if the notification has been marked read (read === true)
              const taskAssignedNotifications = Array.isArray(interaction.notifications) 
                ? interaction.notifications.filter(n => n.type === 'Task Assigned') 
                : [];
              const isSeen = !hasMentions || (taskAssignedNotifications.length > 0 && taskAssignedNotifications.some(n => n.read));
              
              // 3. Replied: True if the assignee replied (replies.length > 0)
              const hasReplies = Array.isArray(interaction.replies) && interaction.replies.length > 0;
              const isReplied = hasReplies;
              
              // 4. Received: True if the admin/creator has read the task reply notification (read === true) or replied back
              const taskReplyNotifications = Array.isArray(interaction.notifications) 
                ? interaction.notifications.filter(n => n.type === 'Task Reply') 
                : [];
              const isReceived = isReplied && (
                (taskReplyNotifications.length > 0 && taskReplyNotifications.some(n => n.read)) || 
                (Array.isArray(interaction.replies) && interaction.replies.some(r => r.authorUid === interaction.loggedByUid))
              );

              return (
                <div key={interaction.interactionId} className="bg-dark-900/60 border border-slate-800 p-4 rounded-xl space-y-3.5 hover:border-slate-700/60 transition-all duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-extrabold text-slate-200">{interaction.companyName}</span>
                        <span className="bg-primary/10 border border-primary/20 text-primary text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded">
                          {interaction.source}
                        </span>
                        {hasMentions && (
                          <span className="bg-amber-500/10 border border-amber-500/25 text-amber-500 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-0.5">
                            Task Assigned to: {interaction.actionMentions.map(m => m.name).join(', ')}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1 line-clamp-1 font-semibold">
                        {interaction.subject || interaction.messageText}
                      </p>
                    </div>
                    <div className="flex flex-col items-end shrink-0 text-[10px] text-slate-500 font-semibold leading-none">
                      <span>Logged by {interaction.loggedByName || 'System'}</span>
                      <span className="mt-1 text-[9px] text-slate-450">
                        {new Date(interaction.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                  </div>

                  {/* Horizontal progress timeline */}
                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-800/40">
                    {/* Step 1: Sent */}
                    <div className="flex flex-col items-center text-center space-y-1">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-500 text-[10px] font-bold">
                        ✓
                      </div>
                      <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Sent (Logged)</span>
                    </div>

                    {/* Step 2: Seen */}
                    <div className="flex flex-col items-center text-center space-y-1">
                      <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${
                        isSeen 
                          ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-500' 
                          : 'bg-dark-800 border border-slate-350 text-slate-450'
                      }`}>
                        {isSeen ? '✓' : '2'}
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${
                        isSeen ? 'text-emerald-500' : 'text-slate-450'
                      }`}>
                        Seen
                      </span>
                    </div>

                    {/* Step 3: Replied */}
                    <div className="flex flex-col items-center text-center space-y-1">
                      <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${
                        isReplied 
                          ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-500' 
                          : 'bg-dark-800 border border-slate-350 text-slate-450'
                      }`}>
                        {isReplied ? '✓' : '3'}
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${
                        isReplied ? 'text-emerald-500' : 'text-slate-450'
                      }`}>
                        Replied
                      </span>
                    </div>

                    {/* Step 4: Received */}
                    <div className="flex flex-col items-center text-center space-y-1">
                      <div className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${
                        isReceived 
                          ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-500' 
                          : 'bg-dark-800 border border-slate-350 text-slate-450'
                      }`}>
                        {isReceived ? '✓' : '4'}
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${
                        isReceived ? 'text-emerald-500' : 'text-slate-450'
                      }`}>
                        Received
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. RECENT ACTIVITY TRACKING WIDGET (Admin & Executive Only) */}
      {(user?.role === 'Admin' || user?.role === 'Executive') && (
        <div className="glass p-5 rounded-2xl border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              <div>
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-350">
                  Recent System Activity Feed
                </h3>
                <p className="text-[10px] text-slate-500">
                  Real-time audit log tracking system events, logins, and account actions.
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/activity-log')}
              className="bg-primary/10 hover:bg-primary/20 border border-primary/25 px-3.5 py-2 rounded-xl text-[10px] font-bold text-primary flex items-center gap-1.5 transition-all cursor-pointer"
            >
              View Full Audit Trail
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {activityLogsLoading && activityLogs.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : activityLogs.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No recent activity logs found.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/40">
              {activityLogs.slice(0, 5).map((log) => {
                const getActionClass = (action) => {
                  const act = action.toLowerCase();
                  if (act.includes('login')) return 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600';
                  if (act.includes('signup')) return 'bg-teal-500/10 border border-teal-500/20 text-teal-600';
                  if (act.includes('create')) return 'bg-blue-500/10 border border-blue-500/20 text-blue-600';
                  if (act.includes('update')) return 'bg-amber-500/10 border border-amber-500/20 text-amber-600';
                  if (act.includes('delete')) return 'bg-rose-500/10 border border-rose-500/20 text-rose-600';
                  if (act.includes('resolve')) return 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-600';
                  return 'bg-slate-500/10 border border-slate-500/20 text-slate-600';
                };

                return (
                  <div key={log.logId} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="bg-primary/10 border border-primary/20 text-primary w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        {log.userName ? log.userName.substring(0, 2).toUpperCase() : 'US'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-200">{log.userName || 'System/SSO User'}</span>
                          <span className={`inline-block px-2 py-0.5 rounded border text-[8px] font-black uppercase tracking-wider ${getActionClass(log.action)}`}>
                            {log.action}
                          </span>
                        </div>
                        <p className="text-slate-350 mt-1 line-clamp-1 font-semibold">{log.details}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 self-end sm:self-auto shrink-0 text-slate-550 font-semibold text-[10px]">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>
                        {new Date(log.timestamp).toLocaleString([], {
                          dateStyle: 'short',
                          timeStyle: 'short'
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MY TASKS WIDGET ── visible to non-admin users when they have assignments */}
      {user?.role !== 'Admin' && (
        <div className="glass p-4 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">My Assigned Tasks</h3>
            <span className="ml-auto bg-primary/10 border border-primary/20 text-primary text-[9px] font-bold px-2 py-0.5 rounded-full">
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
                return (
                  <div key={task.interactionId} className="bg-dark-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                    {/* Task header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-bold text-white">{task.companyName}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                            task.replyStatus === 'Replied'
                              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                              : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                          }`}>
                            {task.replyStatus === 'Replied' ? '✓ Replied' : '⏳ Pending'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-3">{task.messageText}</p>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <Clock className="w-3 h-3" />
                          {task.loggedByName && <span>By {task.loggedByName} ·</span>}
                          <span>{new Date(task.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                      </div>
                    </div>

                    {/* Existing replies */}
                    {replies.length > 0 && (
                      <div className="space-y-1.5 border-t border-slate-800 pt-2">
                        {replies.map(r => (
                          <div key={r.replyId} className="flex gap-2 text-[11px]">
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
                <span className="text-[10px] text-slate-500 font-bold uppercase">Division Projects</span>
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
                <span className="text-[10px] text-slate-500 font-bold uppercase">Project Managers</span>
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
              <span className="text-[10px] text-slate-500 font-bold uppercase">Division Employees</span>
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
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Team Roster</span>
                      <div className="flex flex-col gap-1">
                        {projEmps.length > 0 && projEmps.some(Boolean) ? (
                          projEmps.filter(Boolean).map((emp, eIdx) => (
                            <div key={eIdx} className="bg-slate-800/40 border border-slate-800 p-1.5 rounded-lg text-[11px] text-slate-300 font-semibold flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                              {emp}
                            </div>
                          ))
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">No employees assigned to this project yet.</span>
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
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{pos}</span>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${head ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/25 text-rose-400'}`}>
                        {head ? 'ACTIVE' : 'VACANT'}
                      </span>
                    </div>
                    {head ? (
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-white">{head.name}</h4>
                        <p className="text-[10px] text-slate-400">{head.email}</p>
                        <div className="flex items-center gap-2 pt-2 text-[9px] text-slate-500">
                          <span>📁 {head.projects?.length || 0} Projects</span>
                          <span>•</span>
                          <span>👥 {head.employees?.length || 0} Team Members</span>
                        </div>
                      </div>
                    ) : (
                      <div className="py-2 text-[10px] text-slate-500 italic">No head currently assigned to this function.</div>
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
                  <span className="text-[9px] text-slate-500 font-medium">Managed under ITG</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Main Delivery Head:</span>
                    <span className="text-white font-semibold">
                      {usersList.find(u => (u.userType || u.role) === 'Delivery Head' && !u.position?.toLowerCase().includes('insurance') && !u.position?.toLowerCase().includes('industrial') && !u.position?.toLowerCase().includes('healthcare'))?.name || 'Vacant'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Sub-Divisions:</span>
                    <span className="text-slate-200">Insurance, Industrial, Healthcare & Mobility</span>
                  </div>
                </div>
              </div>

              {/* P&L Division */}
              <div className="bg-dark-900/60 border border-slate-800 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="text-xs font-bold text-purple-400">P&L Division (Hunting & Mining)</h4>
                  <span className="text-[9px] text-slate-500 font-medium">Sales Consultation</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">P&L BU Head:</span>
                    <span className="text-white font-semibold">
                      {usersList.find(u => u.position?.toLowerCase().includes('p&l head'))?.name || 'Vacant'}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px]">
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
                        <span className="text-[9px] text-slate-500 block">Overseeing {employeesCount} assigned employee(s)</span>
                      </div>
                      <span className="bg-primary/10 border border-primary/20 text-primary text-[8px] px-2 py-0.5 rounded font-black tracking-wider">
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
              <span className="text-[10px] text-slate-500 font-bold uppercase block pb-1 border-b border-slate-850">Active Employees Directory</span>
              <div className="grid grid-cols-1 gap-2 mt-2">
                {user.employees && user.employees.length > 0 ? (
                  user.employees.map(emp => (
                    <div key={emp} className="bg-dark-900/60 border border-slate-800/60 p-2.5 rounded-lg text-xs font-bold text-slate-350 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="bg-primary/10 border border-primary/25 text-primary w-5 h-5 rounded flex items-center justify-center font-bold text-[9px]">
                          {emp.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="text-slate-200 font-semibold">{emp}</span>
                      </div>
                      <span className="text-[9px] bg-slate-800 px-2 py-0.5 border border-slate-700/65 text-slate-400 rounded-full font-semibold uppercase">{user.department || 'Staff'} team</span>
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

    </div>
  );
}
