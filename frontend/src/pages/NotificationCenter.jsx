import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Mail, Clock, AlertTriangle, CheckCircle2, XCircle, RefreshCw,
  Send, Eye, RotateCcw, Trash2, Settings, BarChart3, List, FileText,
  Server, ChevronDown, ChevronUp, Search, Filter, X, Wifi, WifiOff, Check
} from 'lucide-react';
import { useStore } from '../store/index.js';
import { formatDateTime } from '../utils/dateFormat.js';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtTime = (iso) => {
  if (!iso) return '—';
  return formatDateTime(iso);
};

const eventLabel = (type) =>
  (type || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const STATUS_COLORS = {
  sent:      { bg: 'bg-emerald-500/10', text: 'text-emerald-700', border: 'border-emerald-500/30' },
  mock_sent: { bg: 'bg-sky-500/10',     text: 'text-sky-700',     border: 'border-sky-500/30' },
  queued:    { bg: 'bg-amber-500/10',   text: 'text-amber-700',   border: 'border-amber-500/30' },
  processing:{ bg: 'bg-blue-500/10',    text: 'text-blue-700',    border: 'border-blue-500/30' },
  failed:    { bg: 'bg-rose-500/10',    text: 'text-rose-700',    border: 'border-rose-500/30' },
  cancelled: { bg: 'bg-slate-200',       text: 'text-black',       border: 'border-slate-300' },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.queued;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${c.bg} ${c.text} ${c.border}`}>
      {status === 'sent' && <CheckCircle2 className="w-2.5 h-2.5 mr-1 text-emerald-600" />}
      {status === 'mock_sent' && <CheckCircle2 className="w-2.5 h-2.5 mr-1 text-sky-600" />}
      {status === 'failed' && <XCircle className="w-2.5 h-2.5 mr-1 text-rose-600" />}
      {status === 'queued' && <Clock className="w-2.5 h-2.5 mr-1 text-amber-600" />}
      {status === 'processing' && <RefreshCw className="w-2.5 h-2.5 mr-1 text-blue-600" />}
      {status === 'cancelled' && <X className="w-2.5 h-2.5 mr-1 text-black" />}
      {status === 'mock_sent' ? 'Mock Sent' : status}
    </span>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="bg-dark-900 border border-dark-800 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-black">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-black text-black">{value ?? '—'}</p>
      {sub && <p className="text-[10px] text-black font-bold">{sub}</p>}
    </div>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex items-start justify-between gap-4 py-3 border-b border-dark-800 last:border-0 cursor-pointer">
      <div>
        <p className="text-sm font-extrabold text-black">{label}</p>
        {description && <p className="text-xs font-bold text-black mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-11 h-6 rounded-full border-2 cursor-pointer transition-colors ${checked ? 'bg-primary border-primary' : 'bg-slate-200 border-slate-300'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </label>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard',  label: 'Engine Dashboard',  icon: BarChart3 },
  { id: 'queue',      label: 'Automatic Email Queue', icon: Clock },
  { id: 'history',    label: 'Email Dispatch Logs', icon: List },
  { id: 'templates',  label: 'Automatic Templates', icon: FileText },
  { id: 'settings',   label: 'Notification Settings', icon: Settings },
  { id: 'smtp',       label: 'SMTP Relay Status',  icon: Server },
];

export default function NotificationCenter() {
  const navigate = useNavigate();
  const {
    user,
    emailEngineStats, emailEngineStatsLoading, fetchEmailEngineStats,
    emailQueue, emailQueueLoading, fetchEmailQueue,
    emailLogs, emailLogsLoading, fetchEmailLogs,
    emailTemplates, fetchEmailTemplates,
    retryEmail, retryAllEmails, cancelQueuedEmail, bulkCancelEmails,
    previewEmailTemplate,
    notificationPreferences, fetchNotificationPreferences, updateNotificationPreferences,
    sendTestEmail, fetchSmtpStatus
  } = useStore();

  const isAuthorized = user?.role === 'Admin' || user?.userType === 'Admin' || user?.name?.toLowerCase().includes('nazneen') || user?.email?.toLowerCase().includes('nazneen') || user?.email === 'nj@gmail.com';

  const [activeTab, setActiveTab] = useState('dashboard');
  const [toast, setToast] = useState(null);
  const [previewModal, setPreviewModal] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState('');
  const [queueStatusFilter, setQueueStatusFilter] = useState('');
  const [expandedLog, setExpandedLog] = useState(null);
  const [smtpStatus, setSmtpStatus] = useState(null);
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [testTemplateSending, setTestTemplateSending] = useState(null);
  const [prefSaving, setPrefSaving] = useState(false);
  const [localPrefs, setLocalPrefs] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const refresh = useCallback(() => {
    fetchEmailEngineStats();
    fetchEmailQueue(queueStatusFilter);
    fetchEmailLogs(logStatusFilter || logSearch ? { status: logStatusFilter, search: logSearch } : {});
    fetchEmailTemplates();
  }, [queueStatusFilter, logStatusFilter, logSearch]);

  useEffect(() => {
    refresh();
    if (user?.uid) fetchNotificationPreferences(user.uid);
  }, []);

  useEffect(() => {
    if (notificationPreferences && !localPrefs) {
      setLocalPrefs(notificationPreferences);
    }
  }, [notificationPreferences]);

  // Queue refresh on filter change
  useEffect(() => { fetchEmailQueue(queueStatusFilter); }, [queueStatusFilter]);
  useEffect(() => {
    fetchEmailLogs(logStatusFilter || logSearch ? { status: logStatusFilter, search: logSearch } : {});
  }, [logStatusFilter]);

  const handleRetry = async (id) => {
    const ok = await retryEmail(id);
    if (ok) { showToast('Email requeued for delivery.'); fetchEmailQueue(queueStatusFilter); }
    else showToast('Failed to retry email.', 'error');
  };

  const handleRetryAll = async () => {
    const res = await retryAllEmails();
    if (res?.requeued !== undefined) { showToast(`${res.requeued} email(s) requeued.`); refresh(); }
    else showToast('Retry-all failed.', 'error');
  };

  const handleCancel = async (id) => {
    const ok = await cancelQueuedEmail(id);
    if (ok) { showToast('Email cancelled.'); fetchEmailQueue(queueStatusFilter); }
    else showToast('Cancel failed.', 'error');
  };

  const handleBulkCancel = async () => {
    const res = await bulkCancelEmails();
    if (res?.cancelled !== undefined) { showToast(`${res.cancelled} email(s) cancelled.`); refresh(); }
    else showToast('Bulk cancel failed.', 'error');
  };

  const handlePreview = async (templateId) => {
    setPreviewLoading(true);
    const result = await previewEmailTemplate(templateId);
    setPreviewLoading(false);
    if (result) setPreviewModal({ templateId, ...result });
    else showToast('Preview failed.', 'error');
  };

  const handleTestEmail = async (templateId) => {
    setTestTemplateSending(templateId);
    const ok = await sendTestEmail(templateId, user?.uid);
    setTestTemplateSending(null);
    if (ok) showToast('Test notification email sent to your Outlook inbox!');
    else showToast('Test email failed.', 'error');
  };

  const handleCheckSmtp = async () => {
    setSmtpLoading(true);
    const result = await fetchSmtpStatus();
    setSmtpStatus(result);
    setSmtpLoading(false);
  };

  const handlePrefChange = (key, value) => {
    setLocalPrefs(prev => ({ ...prev, [key]: value }));
  };

  const handleSavePrefs = async () => {
    setPrefSaving(true);
    const ok = await updateNotificationPreferences(user.uid, localPrefs);
    setPrefSaving(false);
    if (ok) showToast('Preferences saved successfully.');
    else showToast('Failed to save preferences.', 'error');
  };

  // Filter templates to show automatic notification templates
  const autoTemplates = (emailTemplates || []).filter(t => !['birthday', 'work_anniversary', 'festival', 'welcome', 'farewell', 'promotion', 'achievement', 'custom_greeting'].includes(t.id));

  const filteredLogs = emailLogs.filter(l => {
    const q = logSearch.toLowerCase();
    if (!q) return true;
    return (
      (l.recipientEmail || '').toLowerCase().includes(q) ||
      (l.subject || '').toLowerCase().includes(q) ||
      (l.recipientName || '').toLowerCase().includes(q)
    );
  });

  const s = emailEngineStats;

  if (!isAuthorized) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-6 select-none">
        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-xl text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-500 flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-black text-slate-900 mb-2">Access Restricted</h2>
          <p className="text-xs text-slate-500 font-semibold mb-6">
            The Automatic Email & Notification Engine is restricted exclusively to Administrators and authorized management (Nazneen).
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-md hover:bg-blue-700 transition-all cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full" style={{ fontFamily: 'Montserrat, sans-serif' }}>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl text-sm font-bold border flex items-center gap-2 ${
          toast.type === 'error'
            ? 'bg-rose-500/10 border-rose-500/20 text-rose-600'
            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700'
        }`}>
          {toast.type === 'error' ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Template Preview Modal */}
      {previewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-dark-800">
            <div className="flex items-center justify-between p-4 border-b border-dark-800 shrink-0">
              <div>
                <h3 className="font-extrabold text-black text-sm">Automatic Template HTML Preview</h3>
                <p className="text-xs font-bold text-black mt-0.5">{previewModal.subject}</p>
              </div>
              <button onClick={() => setPreviewModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer">
                <X className="w-4 h-4 text-black" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <iframe
                srcDoc={previewModal.html}
                title="Email Preview"
                className="w-full rounded-lg border border-dark-800"
                style={{ height: '580px' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="p-6 border-b border-dark-800 bg-dark-900 rounded-t-2xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Bell className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-black">Automatic Email & Notification Engine</h1>
              <p className="text-xs font-bold text-black mt-0.5">Automated Event Emails · Task Assignments · Status Changes · Reminders · Overdue Alerts</p>
            </div>
          </div>
          <button
            onClick={() => { refresh(); showToast('Refreshed email engine.'); }}
            className="flex items-center gap-1.5 text-xs font-bold text-primary border border-primary/20 bg-primary/5 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-primary/10"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh Engine
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1.5 mt-5 flex-wrap">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold border cursor-pointer transition-all ${
                activeTab === tab.id
                  ? 'bg-primary border-primary text-white shadow-md'
                  : 'bg-dark-900 border-dark-800 text-black hover:bg-dark-800'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">

        {/* ─── TAB 1: Dashboard ────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard label="Sent Today" value={s?.totalSentToday ?? '—'} icon={Send} color="bg-emerald-500/10 text-emerald-600" sub={s?.totalMockSentToday ? `+${s.totalMockSentToday} mock` : 'live emails'} />
              <StatCard label="Queued" value={s?.totalQueued ?? '—'} icon={Clock} color="bg-amber-500/10 text-amber-600" sub="awaiting delivery" />
              <StatCard label="Failed" value={s?.totalFailed ?? '—'} icon={AlertTriangle} color="bg-rose-500/10 text-rose-600" sub="max retries reached" />
              <StatCard label="Reminders" value={s?.reminderEmails ?? '—'} icon={Bell} color="bg-blue-500/10 text-blue-600" sub="all time" />
              <StatCard label="Task Notifications" value={s?.taskNotifications ?? '—'} icon={List} color="bg-purple-500/10 text-purple-600" sub="all time" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <StatCard label="Total Sent (All Time)" value={s?.totalSentAllTime ?? '—'} icon={CheckCircle2} color="bg-emerald-500/10 text-emerald-600" />
              <StatCard label="Active Background Worker" value="Every 30s" icon={RefreshCw} color="bg-sky-500/10 text-sky-600" sub="processes queue automatically" />
              <StatCard label="SMTP Relay Server" value="10.45.0.12:25" icon={Server} color="bg-slate-200 text-black" sub={s?.smtpMode === 'SmtpMock' ? 'No SMTP_HOST — console mode' : 'Active (Office + WFH VPN)'} />
            </div>

            {/* Monthly Bar Chart */}
            {s?.monthly && s.monthly.length > 0 && (
              <div className="bg-dark-900 border border-dark-800 rounded-xl p-5 shadow-sm">
                <h4 className="text-xs font-black text-black uppercase tracking-widest mb-4">Monthly Automated Email Delivery Volume</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={s.monthly} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700, fill: '#000000' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#000000' }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                    <Bar dataKey="sent" name="Sent Emails" fill="#1a3a8f" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {emailEngineStatsLoading && (
              <div className="flex justify-center py-8">
                <RefreshCw className="w-5 h-5 text-black animate-spin" />
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 2: Automatic Email Queue ────────────────────────────────── */}
        {activeTab === 'queue' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <div className="flex items-center gap-2">
                <select
                  value={queueStatusFilter}
                  onChange={e => setQueueStatusFilter(e.target.value)}
                  className="text-xs font-black border border-dark-800 rounded-lg px-2.5 py-1.5 bg-dark-900 text-black cursor-pointer"
                >
                  <option value="">All Statuses</option>
                  <option value="queued">Queued</option>
                  <option value="processing">Processing</option>
                  <option value="failed">Failed</option>
                  <option value="sent">Sent</option>
                  <option value="mock_sent">Mock Sent</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <span className="text-xs text-black font-extrabold">{emailQueue.length} item(s) in queue</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleRetryAll}
                  className="flex items-center gap-1.5 text-xs font-black text-emerald-700 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-emerald-500/20"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retry All Failed
                </button>
                <button
                  onClick={handleBulkCancel}
                  className="flex items-center gap-1.5 text-xs font-black text-rose-700 border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-rose-500/20"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Cancel All Queued
                </button>
              </div>
            </div>

            {emailQueueLoading ? (
              <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 text-black animate-spin" /></div>
            ) : emailQueue.length === 0 ? (
              <div className="text-center py-12 text-black text-sm">
                <Clock className="w-8 h-8 mx-auto mb-3 opacity-60 text-primary" />
                <p className="font-extrabold">No emails pending in queue.</p>
                <p className="text-xs font-bold mt-1">Automatic emails are processed in real-time every 30 seconds.</p>
              </div>
            ) : (
              <div className="bg-dark-900 border border-dark-800 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-xs">
                  <thead className="bg-dark-800/40 border-b border-dark-800">
                    <tr>
                      {['Recipient', 'Subject', 'Trigger Event', 'Status', 'Queued At', 'Retries', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-black uppercase tracking-wider text-black text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800">
                    {emailQueue.map(item => (
                      <tr key={item.queueId} className="hover:bg-dark-800/30">
                        <td className="px-4 py-3">
                          <p className="font-black text-black">{item.recipientName}</p>
                          <p className="text-black font-bold">{item.recipientEmail}</p>
                        </td>
                        <td className="px-4 py-3 max-w-[200px] truncate font-extrabold text-black" title={item.subject}>{item.subject}</td>
                        <td className="px-4 py-3"><span className="font-black text-black">{eventLabel(item.eventType)}</span></td>
                        <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                        <td className="px-4 py-3 text-black font-bold">{fmtTime(item.createdAt)}</td>
                        <td className="px-4 py-3 font-black text-black">{item.retryCount ?? 0}/{item.maxRetries ?? 3}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {['failed', 'queued'].includes(item.status) && (
                              <button onClick={() => handleRetry(item.queueId)} title="Retry" className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 cursor-pointer">
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {item.status === 'queued' && (
                              <button onClick={() => handleCancel(item.queueId)} title="Cancel" className="p-1.5 rounded-lg bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 cursor-pointer">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 3: Email History & Logs ─────────────────────────────────── */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-black" />
                <input
                  type="text"
                  placeholder="Search email logs by recipient, subject or event…"
                  value={logSearch}
                  onChange={e => setLogSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs font-extrabold border border-dark-800 rounded-lg bg-dark-900 text-black"
                />
              </div>
              <select
                value={logStatusFilter}
                onChange={e => setLogStatusFilter(e.target.value)}
                className="text-xs font-black border border-dark-800 rounded-lg px-2.5 py-2 bg-dark-900 text-black cursor-pointer"
              >
                <option value="">All Delivery Statuses</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
              </select>
              <button onClick={() => fetchEmailLogs(logStatusFilter || logSearch ? { status: logStatusFilter, search: logSearch } : {})}
                className="flex items-center gap-1.5 text-xs font-bold text-primary border border-primary/20 bg-primary/5 px-3 py-2 rounded-lg cursor-pointer hover:bg-primary/10">
                <Filter className="w-3.5 h-3.5" /> Filter
              </button>
              <span className="text-xs text-black font-black">{filteredLogs.length} record(s)</span>
            </div>

            {emailLogsLoading ? (
              <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 text-black animate-spin" /></div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-black text-sm">
                <List className="w-8 h-8 mx-auto mb-3 opacity-60 text-primary" />
                <p className="font-extrabold">No automatic email log records found.</p>
              </div>
            ) : (
              <div className="bg-dark-900 border border-dark-800 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-xs">
                  <thead className="bg-dark-800/40 border-b border-dark-800">
                    <tr>
                      {['Recipient', 'Subject', 'Trigger Event', 'Status', 'Sent At', 'Retries', 'Details'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-black uppercase tracking-wider text-black text-[10px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800">
                    {filteredLogs.map(log => (
                      <React.Fragment key={log.logId}>
                        <tr className="hover:bg-dark-800/30">
                          <td className="px-4 py-3">
                            <p className="font-black text-black">{log.recipientName}</p>
                            <p className="text-black font-bold">{log.recipientEmail}</p>
                          </td>
                          <td className="px-4 py-3 max-w-[220px] truncate font-extrabold text-black" title={log.subject}>{log.subject}</td>
                          <td className="px-4 py-3 font-black text-black">{eventLabel(log.eventType)}</td>
                          <td className="px-4 py-3"><StatusBadge status={log.isMock ? 'mock_sent' : log.status} /></td>
                          <td className="px-4 py-3 text-black font-bold">{fmtTime(log.sentAt)}</td>
                          <td className="px-4 py-3 font-black text-black">{log.retryCount ?? 0}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setExpandedLog(expandedLog === log.logId ? null : log.logId)}
                              className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                              title="View HTML"
                            >
                              {expandedLog === log.logId ? <ChevronUp className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                        </tr>
                        {expandedLog === log.logId && (
                          <tr>
                            <td colSpan={7} className="px-4 pb-4">
                              {log.failureReason && (
                                <div className="mb-2 text-xs text-rose-700 font-extrabold bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                                  ❌ Failure Details: {log.failureReason}
                                </div>
                              )}
                              {log.htmlBody && (
                                <iframe srcDoc={log.htmlBody} title="Email HTML" className="w-full rounded-xl border border-dark-800" style={{ height: '400px' }} />
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 4: Automatic Templates ─────────────────────────────────── */}
        {activeTab === 'templates' && (
          <div className="space-y-4">
            <p className="text-xs text-black font-extrabold">
              Built-in automatic notification templates triggered by CRM events (Task Assigned, Status Updated, Due Reminders, Overdue Alerts, Comments, etc.).
            </p>
            {previewLoading && (
              <div className="flex justify-center py-6"><RefreshCw className="w-5 h-5 text-black animate-spin" /></div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {autoTemplates.map(tpl => (
                <div key={tpl.id} className="bg-dark-900 border border-dark-800 rounded-xl p-4 shadow-sm flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-black text-black">{tpl.name}</p>
                      <span className="mt-1 inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border bg-sky-500/10 text-sky-700 border-sky-500/30">
                        {tpl.category}
                      </span>
                    </div>
                    <Mail className="w-4 h-4 text-black shrink-0 mt-0.5" />
                  </div>
                  <div className="flex gap-2 mt-auto">
                    <button
                      onClick={() => handlePreview(tpl.id)}
                      className="w-full flex items-center justify-center gap-1.5 text-xs font-black text-primary border border-primary/20 bg-primary/5 px-2 py-2 rounded-lg cursor-pointer hover:bg-primary/10 transition-all"
                    >
                      <Eye className="w-3.5 h-3.5" /> Preview HTML
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── TAB 5: Notification Settings ────────────────────────────────── */}
        {activeTab === 'settings' && (
          <div className="max-w-xl">
            <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-dark-800 pb-3">
                <h4 className="text-xs font-black text-black uppercase tracking-widest">Automatic Email Preferences</h4>
                <button
                  onClick={handleSavePrefs}
                  disabled={prefSaving}
                  className="flex items-center gap-1.5 text-xs font-extrabold text-white bg-primary px-4 py-2 rounded-xl cursor-pointer hover:bg-primary/90 disabled:opacity-50"
                >
                  {prefSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Save Preferences
                </button>
              </div>

              {localPrefs ? (
                <div>
                  <Toggle
                    label="Task Assignment Emails"
                    description="Automatically receive an email when a new task is assigned to you."
                    checked={localPrefs.taskAssigned ?? true}
                    onChange={v => handlePrefChange('taskAssigned', v)}
                  />
                  <Toggle
                    label="Task Reassignment & Forward Emails"
                    description="Automatically receive an email when a task is forwarded to you."
                    checked={localPrefs.taskReassigned ?? true}
                    onChange={v => handlePrefChange('taskReassigned', v)}
                  />
                  <Toggle
                    label="Task Status Update Emails"
                    description="Automatically receive an email when the status of your task changes."
                    checked={localPrefs.taskStatusUpdates ?? true}
                    onChange={v => handlePrefChange('taskStatusUpdates', v)}
                  />
                  <Toggle
                    label="Task Reminder Emails (1-Day Before Due)"
                    description="Automatically receive a reminder email 1 day before due date."
                    checked={localPrefs.taskReminders ?? true}
                    onChange={v => handlePrefChange('taskReminders', v)}
                  />
                  <Toggle
                    label="Overdue Task Alerts"
                    description="Automatically receive an email when a task becomes overdue."
                    checked={localPrefs.taskOverdue ?? true}
                    onChange={v => handlePrefChange('taskOverdue', v)}
                  />
                  <Toggle
                    label="Task Comment Emails"
                    description="Automatically receive an email when someone replies or comments on a task."
                    checked={localPrefs.taskComments ?? true}
                    onChange={v => handlePrefChange('taskComments', v)}
                  />
                </div>
              ) : (
                <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 text-black animate-spin" /></div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB 6: SMTP Server Status ───────────────────────────────────── */}
        {activeTab === 'smtp' && (
          <div className="max-w-lg space-y-4">
            <div className="bg-dark-900 border border-dark-800 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-dark-800 pb-3">
                <h4 className="text-xs font-black text-black uppercase tracking-widest">Company SMTP Server Connection</h4>
                <button
                  onClick={handleCheckSmtp}
                  disabled={smtpLoading}
                  className="flex items-center gap-1.5 text-xs font-black text-primary border border-primary/20 bg-primary/5 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-primary/10 disabled:opacity-50"
                >
                  {smtpLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                  Test Connection
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-black w-28 shrink-0">SMTP Host</span>
                  <span className="font-extrabold text-black font-mono">10.45.0.12</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-black w-28 shrink-0">Port</span>
                  <span className="font-extrabold text-black font-mono">25</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-black w-28 shrink-0">Authentication</span>
                  <span className="font-extrabold text-black">Anonymous Internal Relay</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-black w-28 shrink-0">Sender Email</span>
                  <span className="font-extrabold text-black font-mono">test@nestgroup.net</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-black w-28 shrink-0">Network Access</span>
                  <span className="font-extrabold text-black">Office Network & WFH (VPN)</span>
                </div>
              </div>

              {smtpStatus && (
                <div className={`mt-4 flex items-center gap-3 p-3.5 rounded-xl border ${
                  smtpStatus.ok
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-700'
                }`}>
                  {smtpStatus.ok ? <Wifi className="w-5 h-5 shrink-0 text-emerald-600" /> : <WifiOff className="w-5 h-5 shrink-0 text-rose-600" />}
                  <div>
                    <p className="text-sm font-black">{smtpStatus.ok ? 'SMTP Relay Connection Active & Healthy' : 'SMTP Connection Failed'}</p>
                    {smtpStatus.mode && <p className="text-xs font-bold mt-0.5">Mode: {smtpStatus.mode}</p>}
                    {smtpStatus.error && <p className="text-xs font-bold mt-0.5">{smtpStatus.error}</p>}
                  </div>
                </div>
              )}

              {!smtpStatus && (
                <p className="text-xs font-bold text-black text-center mt-2">Click "Test Connection" to check real-time SMTP relay status.</p>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ─── HTML Email Preview Modal ─────────────────────────────────────── */}
      {previewModal && (
        <div className="fixed inset-0 z-[99999] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200/80 bg-white/90 flex items-center justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    Template Preview
                  </span>
                  <span className="text-xs font-bold text-black font-mono">
                    {previewModal.templateId}
                  </span>
                </div>
                <h3 className="text-sm font-black text-black truncate mt-1" title={previewModal.subject}>
                  Subject: {previewModal.subject || 'Template Preview'}
                </h3>
              </div>
              <button
                onClick={() => setPreviewModal(null)}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                style={{ backgroundColor: 'transparent', color: '#0f172a' }}
                title="Close Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body - Render HTML inside clean iframe */}
            <div className="flex-1 p-4 bg-slate-50/60 overflow-hidden flex flex-col">
              <iframe
                srcDoc={previewModal.html}
                title="Email Template Preview"
                className="w-full h-full min-h-[500px] rounded-xl border border-slate-200 shadow-sm bg-white"
              />
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200/80 bg-white flex items-center justify-between gap-4 shrink-0">
              <p className="text-xs font-bold text-slate-600">
                Interactive preview rendered in real-time HTML engine format.
              </p>
              <button
                onClick={() => setPreviewModal(null)}
                className="px-5 py-2 rounded-xl text-xs font-extrabold border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
                style={{ backgroundColor: 'transparent', color: '#0f172a' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
