import React, { useState, useEffect, useRef } from 'react';
import {
  Mail, Search, RefreshCw, ChevronDown, ChevronUp, ArrowUpRight,
  ArrowDownLeft, X, MessageSquare, Filter, MailOpen, WifiOff,
  AlertTriangle, Paperclip, Clock, Wifi
} from 'lucide-react';
import { useStore } from '../../store/index.js';
import { formatDate, formatTime, formatDateTime } from '../../utils/dateFormat.js';

const stripHtml = (html) => {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  } catch {
    return html.replace(/<[^>]*>?/gm, '');
  }
};

const getInitials = (name = '') =>
  name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';

const AVATAR_COLORS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-sky-500 to-cyan-600',
];
const avatarColor = (name = '') => AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];

export default function OutlookMailTab({ account }) {
  const { token } = useStore();
  const accountId = account?.accountId || account?.id;

  const [mails, setMails] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [dirFilter, setDirFilter] = useState('All');
  const [expandedId, setExpandedId] = useState(null);
  const [showFilterDrop, setShowFilterDrop] = useState(false);
  const filterRef = useRef(null);

  const fetchMails = async () => {
    if (!token || !accountId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/CustomerPulse/api/accounts/${accountId}/outlook-mails`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMails(data.mails || []);
      setMeta(data.meta || null);
    } catch (err) {
      console.error('OutlookMailTab fetch error:', err);
      setError('Could not load mails. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMails(); }, [accountId, token]);

  useEffect(() => {
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilterDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = mails.filter(m => {
    if (dirFilter === 'Inbound' && m.direction !== 'inbound') return false;
    if (dirFilter === 'Outbound' && m.direction !== 'outbound') return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.subject?.toLowerCase().includes(q) ||
      stripHtml(m.messageText).toLowerCase().includes(q) ||
      m.orgSender?.name?.toLowerCase().includes(q) ||
      m.orgSender?.email?.toLowerCase().includes(q) ||
      m.customerInfo?.name?.toLowerCase().includes(q) ||
      m.customerInfo?.email?.toLowerCase().includes(q)
    );
  });

  const inboundCount = mails.filter(m => m.direction === 'inbound').length;
  const outboundCount = mails.filter(m => m.direction === 'outbound').length;
  const withRisk = mails.filter(m => m.riskDetected).length;

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] w-full overflow-hidden bg-white rounded-tl-2xl">

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-md">
            <Mail className="text-white" style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none">Outlook Mail</h2>
            <p className="text-[11px] text-gray-400 font-medium mt-0.5">
              Conversations between your team and <span className="text-blue-600 font-bold">{account?.companyName}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" style={{ width: 13, height: 13 }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search mails…"
              className="pl-8 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-52 bg-gray-50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X style={{ width: 13, height: 13 }} />
              </button>
            )}
          </div>
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilterDrop(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Filter style={{ width: 13, height: 13 }} />
              {dirFilter}
              <ChevronDown style={{ width: 12, height: 12 }} className="text-gray-400" />
            </button>
            {showFilterDrop && (
              <div className="absolute right-0 mt-1.5 w-40 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                {['All', 'Inbound', 'Outbound'].map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setDirFilter(opt); setShowFilterDrop(false); }}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${dirFilter === opt ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    {opt === 'Inbound' && <ArrowDownLeft style={{ width: 13, height: 13 }} />}
                    {opt === 'Outbound' && <ArrowUpRight style={{ width: 13, height: 13 }} />}
                    {opt === 'All' && <Mail style={{ width: 13, height: 13 }} />}
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={fetchMails}
            disabled={loading}
            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-0 px-6 py-2.5 bg-gradient-to-r from-blue-50 to-sky-50 border-b border-blue-100 flex-wrap">
        {[
          { label: 'Total', value: mails.length, color: 'text-blue-700', bg: 'bg-blue-100' },
          { label: 'Received', value: inboundCount, color: 'text-emerald-700', bg: 'bg-emerald-100' },
          { label: 'Sent', value: outboundCount, color: 'text-indigo-700', bg: 'bg-indigo-100' },
          { label: 'Risk Flagged', value: withRisk, color: withRisk > 0 ? 'text-rose-700' : 'text-gray-400', bg: withRisk > 0 ? 'bg-rose-100' : 'bg-gray-100' },
        ].map((s, i) => (
          <div key={s.label} className="flex items-center gap-2 pr-4 mr-4 border-r border-blue-200 last:border-r-0">
            <span className={`text-base font-black ${s.color}`}>{s.value}</span>
            <span className="text-[11px] text-gray-500 font-semibold">{s.label}</span>
          </div>
        ))}
        {meta?.orgEmails?.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-gray-500 font-medium">
            <Wifi style={{ width: 11, height: 11 }} className="text-emerald-500" />
            Org: {meta.orgEmails.slice(0, 2).join(', ')}{meta.orgEmails.length > 2 ? ` +${meta.orgEmails.length - 2}` : ''}
          </div>
        )}
      </div>

      {/* Two-panel body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: mail list */}
        <div className="w-96 shrink-0 border-r border-gray-100 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                <RefreshCw className="animate-spin text-blue-400" style={{ width: 28, height: 28 }} />
                <p className="text-sm font-medium">Loading mails…</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                <WifiOff className="text-rose-400" style={{ width: 32, height: 32 }} />
                <p className="text-sm font-semibold text-gray-700">{error}</p>
                <button onClick={fetchMails} className="text-xs text-blue-600 font-bold hover:underline">Retry</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                <MailOpen className="text-gray-200" style={{ width: 48, height: 48 }} />
                <p className="text-sm font-semibold text-gray-500">No mails found</p>
                <p className="text-xs text-gray-400">
                  {search ? 'Try a different search term.' : 'Emails from Microsoft 365 are automatically synced in real-time.'}
                </p>
              </div>
            ) : (
              filtered.map(mail => {
                const isActive = expandedId === mail.interactionId;
                const isInbound = mail.direction === 'inbound';
                const preview = stripHtml(mail.messageText).slice(0, 110);

                return (
                  <button
                    key={mail.interactionId}
                    onClick={() => setExpandedId(isActive ? null : mail.interactionId)}
                    className={`w-full text-left px-4 py-3.5 border-b border-gray-50 transition-all duration-150 hover:bg-blue-50/40 ${isActive ? 'bg-blue-50 border-l-[3px] border-l-blue-500' : 'border-l-[3px] border-l-transparent'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isInbound ? 'bg-emerald-100' : 'bg-indigo-100'}`}>
                        {isInbound
                          ? <ArrowDownLeft style={{ width: 13, height: 13 }} className="text-emerald-600" />
                          : <ArrowUpRight style={{ width: 13, height: 13 }} className="text-indigo-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-0.5">
                          <span className="text-[13px] font-bold text-gray-900 truncate leading-tight">{mail.subject}</span>
                          <span className="text-[10px] text-gray-400 font-medium shrink-0 mt-0.5">{formatDate(mail.timestamp)}</span>
                        </div>
                        <div className="text-[11px] text-gray-500 font-medium mb-1 truncate">
                          {isInbound
                            ? <><span className="text-emerald-600 font-bold">From:</span> {mail.customerInfo?.name} &rarr; {mail.orgSender?.name}</>
                            : <><span className="text-indigo-600 font-bold">To:</span> {mail.orgSender?.name} &rarr; {mail.customerInfo?.name}</>}
                        </div>
                        <p className="text-[11px] text-gray-400 leading-snug line-clamp-2">{preview || '(No preview)'}</p>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {mail.riskDetected && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100 px-1.5 py-0.5 rounded-full">
                              <AlertTriangle style={{ width: 9, height: 9 }} /> Risk
                            </span>
                          )}
                          {mail.replies?.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider bg-sky-50 text-sky-600 border border-sky-100 px-1.5 py-0.5 rounded-full">
                              <MessageSquare style={{ width: 9, height: 9 }} /> {mail.replies.length}
                            </span>
                          )}
                          {mail.attachments?.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-amber-600 border border-amber-100 px-1.5 py-0.5 rounded-full">
                              <Paperclip style={{ width: 9, height: 9 }} /> {mail.attachments.length}
                            </span>
                          )}
                          {!mail.isManual && (
                            <span className="text-[9px] font-bold uppercase tracking-wider bg-purple-50 text-purple-600 border border-purple-100 px-1.5 py-0.5 rounded-full">
                              Synced
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: detail */}
        <div className="flex-1 overflow-y-auto">
          {!expandedId ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400 p-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-100 to-sky-100 flex items-center justify-center">
                <Mail className="text-blue-400" style={{ width: 28, height: 28 }} />
              </div>
              <p className="text-sm font-semibold text-gray-500">Select a mail to read</p>
              <p className="text-xs text-gray-400 text-center max-w-xs">
                Choose an email from the list to view the full conversation thread between your team and the customer.
              </p>
            </div>
          ) : (
            <MailDetail
              mail={filtered.find(m => m.interactionId === expandedId)}
              onClose={() => setExpandedId(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MailDetail({ mail, onClose }) {
  const [bodyExpanded, setBodyExpanded] = useState(true);
  if (!mail) return null;

  const isInbound = mail.direction === 'inbound';
  const bodyText = stripHtml(mail.messageText);

  return (
    <div className="flex flex-col h-full">
      {/* Detail Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                isInbound ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}>
                {isInbound ? <ArrowDownLeft style={{ width: 11, height: 11 }} /> : <ArrowUpRight style={{ width: 11, height: 11 }} />}
                {isInbound ? 'Received' : 'Sent'}
              </span>
              {mail.riskDetected && (
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200">
                  <AlertTriangle style={{ width: 11, height: 11 }} /> Risk Flagged
                </span>
              )}
              {!mail.isManual && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200">
                  Auto-Synced
                </span>
              )}
            </div>
            <h3 className="text-lg font-black text-gray-900 leading-tight">{mail.subject}</h3>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <Clock style={{ width: 11, height: 11 }} />
              {formatDate(mail.timestamp)}{mail.time ? ` at ${formatTime(mail.time)}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>

      {/* Participants */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/70">
        <div className="grid grid-cols-2 gap-3">
          <ParticipantCard
            label={isInbound ? 'To — Your Team' : 'From — Your Team'}
            name={mail.orgSender?.name}
            email={mail.orgSender?.email}
            role={mail.orgSender?.role}
            side="org"
          />
          <ParticipantCard
            label={isInbound ? 'From — Customer' : 'To — Customer'}
            name={mail.customerInfo?.name}
            email={mail.customerInfo?.email}
            role={mail.customerInfo?.designation}
            company={mail.customerInfo?.company}
            side="customer"
          />
        </div>
      </div>

      {/* Body + Thread */}
      <div className="px-6 py-5 flex-1 overflow-y-auto space-y-5">
        {/* Body */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div
            className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 cursor-pointer select-none"
            onClick={() => setBodyExpanded(v => !v)}
          >
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Email Body</span>
            {bodyExpanded
              ? <ChevronUp style={{ width: 15, height: 15 }} className="text-gray-400" />
              : <ChevronDown style={{ width: 15, height: 15 }} className="text-gray-400" />}
          </div>
          {bodyExpanded && (
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{bodyText || '(No content)'}</p>
            </div>
          )}
        </div>

        {/* Attachments */}
        {mail.attachments?.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Paperclip style={{ width: 13, height: 13 }} /> Attachments ({mail.attachments.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {mail.attachments.map((att, i) => (
                <a
                  key={i}
                  href={att.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors"
                >
                  <Paperclip style={{ width: 11, height: 11 }} />
                  {att.name || `Attachment ${i + 1}`}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Replies thread */}
        {mail.replies?.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <MessageSquare style={{ width: 13, height: 13 }} />
              Thread ({mail.replies.length} {mail.replies.length === 1 ? 'reply' : 'replies'})
            </h4>
            <div className="space-y-3">
              {mail.replies.map((reply, i) => (
                <div key={reply.replyId || i} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${avatarColor(reply.authorName || '')} flex items-center justify-center text-white text-[9px] font-black`}>
                        {getInitials(reply.authorName || 'U')}
                      </div>
                      <span className="text-xs font-bold text-gray-800">{reply.authorName || 'Team Member'}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-medium">{formatDateTime(reply.timestamp)}</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{reply.text || reply.content || ''}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ParticipantCard({ label, name, email, role, company, side }) {
  const isOrg = side === 'org';
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${isOrg ? 'border-indigo-100 bg-indigo-50/50' : 'border-emerald-100 bg-emerald-50/50'}`}>
      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${isOrg ? 'from-indigo-400 to-blue-500' : 'from-emerald-400 to-teal-500'} flex items-center justify-center text-white text-xs font-black shrink-0 shadow-sm`}>
        {getInitials(name || '')}
      </div>
      <div className="min-w-0">
        <p className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${isOrg ? 'text-indigo-500' : 'text-emerald-600'}`}>{label}</p>
        <p className="text-xs font-bold text-gray-900 truncate">{name || '—'}</p>
        {email && <p className="text-[10px] text-gray-500 truncate font-medium">{email}</p>}
        {role && <p className="text-[10px] text-gray-400 truncate">{role}{company ? ` · ${company}` : ''}</p>}
      </div>
    </div>
  );
}
