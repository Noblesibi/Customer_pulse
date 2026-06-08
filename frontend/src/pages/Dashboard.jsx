import React, { useEffect } from 'react';
import { 
  Users, CheckCircle2, AlertTriangle, AlertOctagon, Activity, HelpCircle, ArrowUpRight, ArrowDownRight, Sparkles 
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import { useStore } from '../store/index.js';

export default function Dashboard() {
  const { dashboardStats, dashboardLoading, fetchDashboardStats } = useStore();

  useEffect(() => {
    fetchDashboardStats();
    // Poll stats every 5 seconds to show live updates
    const interval = setInterval(() => {
      fetchDashboardStats();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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
    <div className="space-y-8 animate-soft-pulse duration-1000">
      {/* 1. KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-5">
        {/* Total Accounts */}
        <div className="glass p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Accounts</span>
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-white">{cards.totalAccounts}</h3>
            <span className="text-[10px] text-slate-500 block mt-1">CRM Database Active</span>
          </div>
        </div>

        {/* Healthy Accounts */}
        <div className="glass p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Healthy</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-emerald-400">{cards.healthyAccounts}</h3>
            <span className="text-[10px] text-emerald-500/80 font-medium flex items-center gap-0.5 mt-1">
              <ArrowUpRight className="w-3.5 h-3.5" />
              Score &ge; 75%
            </span>
          </div>
        </div>

        {/* At-Risk Accounts */}
        <div className="glass p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">At-Risk</span>
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-amber-400">{cards.atRiskAccounts}</h3>
            <span className="text-[10px] text-amber-500/85 font-medium flex items-center gap-0.5 mt-1">
              Score 50-74%
            </span>
          </div>
        </div>

        {/* Critical Accounts */}
        <div className="glass p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Critical</span>
            <AlertOctagon className="w-5 h-5 text-rose-500 animate-pulse" />
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-rose-500">{cards.criticalAccounts}</h3>
            <span className="text-[10px] text-rose-400/80 font-medium flex items-center gap-0.5 mt-1">
              <ArrowDownRight className="w-3.5 h-3.5" />
              Score &lt; 50%
            </span>
          </div>
        </div>

        {/* Active Contacts */}
        <div className="glass p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Stakeholders</span>
            <Users className="w-5 h-5 text-blue-400" />
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-white">{cards.activeContacts}</h3>
            <span className="text-[10px] text-slate-500 block mt-1">Relationship Depth</span>
          </div>
        </div>

        {/* Monthly Interactions */}
        <div className="glass p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">30D Activity</span>
            <Activity className="w-5 h-5 text-purple-400" />
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-white">{cards.monthlyInteractions}</h3>
            <span className="text-[10px] text-slate-500 block mt-1">Interactions Logged</span>
          </div>
        </div>
      </div>

      {/* 2. Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart A: Industry Health Trend */}
        <div className="glass p-6 rounded-2xl border border-slate-800/80">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">Industry Health Profile</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                <XAxis dataKey="industry" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '12px' }} />
                <Area type="monotone" dataKey="avgHealth" name="Avg Health Score" stroke="#2563EB" strokeWidth={2.5} fillOpacity={1} fill="url(#healthGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart B: Sentiment Distribution */}
        <div className="glass p-6 rounded-2xl border border-slate-800/80 grid grid-cols-1 md:grid-cols-5 items-center gap-4">
          <div className="md:col-span-3 h-72">
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
                    innerRadius={65}
                    outerRadius={90}
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
          <div className="md:col-span-2 space-y-4 pr-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Communication Sentiment</h3>
            <div className="space-y-2.5">
              {sentimentData.map(entry => (
                <div key={entry.name} className="flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart C: Risk Categories Distribution */}
        <div className="glass p-6 rounded-2xl border border-slate-800/80">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">Active Risk Types</h3>
          <div className="h-72">
            {riskData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No unresolved risks logged. System is clean!
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                  <XAxis dataKey="category" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '12px' }} />
                  <Bar dataKey="Count" fill="#EF4444" radius={[6, 6, 0, 0]}>
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
        <div className="glass p-6 rounded-2xl border border-slate-800/80">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">Engagement Channels</h3>
          <div className="h-72">
            {engagementData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No interactions logged yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={engagementData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
                  <XAxis type="number" stroke="#64748b" fontSize={11} />
                  <YAxis dataKey="source" type="category" stroke="#64748b" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '12px' }} />
                  <Bar dataKey="Count" fill="#2563EB" radius={[0, 6, 6, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* 3. Bottom Widgets Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Side: Top Risks Tracker */}
        <div className="glass p-6 rounded-2xl border border-slate-800/80 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">Top Account Risks</h3>
            <div className="space-y-4">
              {widgets.topRisks.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No critical open risks found
                </div>
              ) : (
                widgets.topRisks.map(risk => (
                  <div key={risk.riskId} className="bg-dark-900/60 p-4 rounded-xl border border-slate-800 flex items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{risk.companyName}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
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

        {/* Right Side: AI Recommendations Engine */}
        <div className="glass p-6 rounded-2xl border border-slate-800/80">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">AI Relationship Guidance</h3>
          </div>
          <div className="space-y-4">
            {widgets.aiRecommendations.map(rec => (
              <div key={rec.id} className="bg-primary/5 p-4 rounded-xl border border-primary/15 flex gap-3.5 items-start">
                <div className="bg-primary/10 border border-primary/25 p-2 rounded-lg text-primary shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-white">{rec.title}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{rec.description}</p>
                  {rec.priority && (
                    <span className={`inline-block text-[9px] font-bold mt-1.5 uppercase px-1.5 py-0.5 rounded ${
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
  );
}
