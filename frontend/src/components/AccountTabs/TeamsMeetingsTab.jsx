import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Video, Search, RefreshCw, Calendar, Clock, Users, FileText,
  Sparkles, CheckCircle2, AlertTriangle, XCircle, ChevronDown,
  ChevronUp, ShieldAlert, ExternalLink, ListChecks, CheckSquare, UserCheck, Building2
} from 'lucide-react';
import { useStore } from '../../store/index.js';
import { formatDate, formatTime } from '../../utils/dateFormat.js';

function formatDuration(seconds = 0, startIso, endIso) {
  let secs = Number(seconds) || 0;
  if (secs <= 0 && startIso && endIso) {
    const diff = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000;
    if (!isNaN(diff) && diff > 0) secs = Math.round(diff);
  }
  if (secs <= 0) return '—';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function getTranscriptBadge(status = 'PENDING') {
  switch (status) {
    case 'AVAILABLE':
      return {
        label: 'Transcript Available',
        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: CheckCircle2
      };
    case 'PROCESSING_PENDING':
      return {
        label: 'Processing Pending',
        cls: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: Clock
      };
    case 'NOT_RECORDED':
      return {
        label: 'Not Recorded',
        cls: 'bg-slate-100 text-slate-600 border-slate-200',
        icon: FileText
      };
    case 'PERMISSION_DENIED':
      return {
        label: 'Permission Denied',
        cls: 'bg-rose-50 text-rose-700 border-rose-200',
        icon: ShieldAlert
      };
    case 'MEETING_NOT_FOUND':
      return {
        label: 'Meeting Not Found',
        cls: 'bg-rose-50 text-rose-700 border-rose-200',
        icon: XCircle
      };
    default:
      return {
        label: status || 'Pending',
        cls: 'bg-slate-50 text-slate-600 border-slate-200',
        icon: Clock
      };
  }
}

export default function TeamsMeetingsTab({ account, meetings: preloadedMeetings = null }) {
  const { token } = useStore();
  const accountId = account?.accountId || account?.id;
  const hasPreloaded = Array.isArray(preloadedMeetings) && preloadedMeetings.length > 0;

  const [meetings, setMeetings] = useState(hasPreloaded ? preloadedMeetings : []);
  const [accountOrganizers, setAccountOrganizers] = useState([]);
  const [showOrganizersPanel, setShowOrganizersPanel] = useState(true);
  const [loading, setLoading] = useState(!hasPreloaded);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState(
    hasPreloaded ? (preloadedMeetings[0].meetingId || preloadedMeetings[0].id) : null
  );
  const [transcriptExpanded, setTranscriptExpanded] = useState(true);

  const loadAccountTeamsData = useCallback(async (triggerSync = false) => {
    if (!token || !accountId) return { meetings: [], accountOrganizers: [] };
    const query = triggerSync ? '?sync=true' : '';
    const res = await fetch(`/CustomerPulse/api/accounts/${accountId}/teams-meetings${query}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return {
      meetings: Array.isArray(data.meetings) ? data.meetings : [],
      accountOrganizers: Array.isArray(data.accountOrganizers) ? data.accountOrganizers : [],
    };
  }, [accountId, token]);

  const fetchMeetings = useCallback(async (triggerSync = true) => {
    if (!token || !accountId) return;
    setLoading(true);
    setError(null);
    try {
      const { meetings: list, accountOrganizers: orgs } = await loadAccountTeamsData(Boolean(triggerSync));
      setMeetings(list);
      setAccountOrganizers(orgs);
      setSelectedId(prev => prev || (list[0]?.meetingId || list[0]?.id || null));
    } catch (err) {
      console.error('TeamsMeetingsTab fetch error:', err);
      setError(err.message || 'Could not load Teams meetings.');
    } finally {
      setLoading(false);
    }
  }, [accountId, token, loadAccountTeamsData]);

  useEffect(() => {
    let cancelled = false;
    loadAccountTeamsData(false)
      .then(({ meetings: list, accountOrganizers: orgs }) => {
        if (cancelled) return;
        setMeetings(list || []);
        setAccountOrganizers(orgs || []);
        setSelectedId(prev => prev || (list?.[0]?.meetingId || list?.[0]?.id || null));
        setError(null);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('TeamsMeetingsTab fetch error:', err);
        setError(err.message || 'Could not load Teams meetings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [loadAccountTeamsData]);

  const connectedOrganizers = useMemo(() => {
    if (accountOrganizers.length > 0) return accountOrganizers;
    if (account?.ownerName || account?.ownerEmail) {
      return [
        {
          key: account.ownerId || account.ownerEmail || account.ownerName,
          name: account.ownerName || 'Account Owner',
          email: account.ownerEmail || '',
          isAccountOwner: true,
          isKeyContactOwner: false,
          managedContacts: [],
          eligibilityStatus: 'Pending Assignment',
          teamsStatus: 'Pending Assignment',
          outlookStatus: 'Pending Approval/Configuration',
        },
      ];
    }
    return [];
  }, [accountOrganizers, account]);

  const filtered = useMemo(() => {
    return meetings.filter(m => {
      if (statusFilter !== 'ALL' && m.transcriptStatus !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const text = [
        m.subject,
        m.organizerEmail,
        m.aiSummary,
        m.rawTranscript,
        ...(m.speakers || []),
        ...(m.externalAttendees || []).map(a => `${a.name} ${a.email}`),
        ...(m.internalAttendees || []).map(a => `${a.name} ${a.email}`),
      ].filter(Boolean).join(' ').toLowerCase();
      return text.includes(q);
    });
  }, [meetings, statusFilter, search]);

  const activeMeeting = filtered.find(m => (m.meetingId || m.id) === selectedId) || filtered[0] || null;

  const stats = useMemo(() => ({
    total: meetings.length,
    withTranscript: meetings.filter(m => m.transcriptStatus === 'AVAILABLE').length,
    pendingOrUnrecorded: meetings.filter(m => ['PROCESSING_PENDING', 'NOT_RECORDED', 'PENDING'].includes(m.transcriptStatus)).length,
    permissionIssues: meetings.filter(m => m.transcriptStatus === 'PERMISSION_DENIED').length,
  }), [meetings]);

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] w-full overflow-hidden bg-white rounded-2xl border border-slate-200/80 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-sm">
            <Video className="text-white w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight leading-none">Microsoft Teams Meetings</h2>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              Authorized customer meetings, speaker transcripts & AI summaries for <span className="text-indigo-700 font-bold">{account?.companyName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search meetings, speakers..."
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="AVAILABLE">Transcript Available</option>
            <option value="PROCESSING_PENDING">Processing Pending</option>
            <option value="NOT_RECORDED">Not Recorded</option>
            <option value="PERMISSION_DENIED">Permission Denied</option>
          </select>

          <button
            type="button"
            onClick={() => fetchMeetings(true)}
            disabled={loading}
            title="Sync & Refresh Teams Meetings"
            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Account Stats Strip & Connected Organizers Toggle */}
      <div className="flex items-center justify-between gap-4 px-6 py-2.5 bg-gradient-to-r from-indigo-50/70 to-purple-50/70 border-b border-indigo-100 text-xs flex-wrap">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="font-black text-indigo-700 text-sm">{stats.total}</span>
            <span className="text-slate-600 font-semibold">Account Meetings</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-black text-emerald-700 text-sm">{stats.withTranscript}</span>
            <span className="text-slate-600 font-semibold">With Transcripts</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-black text-amber-700 text-sm">{stats.pendingOrUnrecorded}</span>
            <span className="text-slate-600 font-semibold">No / Pending Transcript</span>
          </div>
          {stats.permissionIssues > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="font-black text-rose-700 text-sm">{stats.permissionIssues}</span>
              <span className="text-rose-700 font-semibold">Policy / Permission Issues</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowOrganizersPanel(v => !v)}
          className="px-3 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 font-bold text-[11px] hover:bg-indigo-50 transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
          <span>
            Connected Account Organizers ({connectedOrganizers.length})
          </span>
          {showOrganizersPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Account-Scoped Organizers Panel (Account Owner & Key Contact Owners for THIS Customer Account) */}
      {showOrganizersPanel && (
        <div className="px-6 py-3 bg-slate-50/80 border-b border-slate-200 text-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            NeST Digital Organizers Connected to {account?.companyName || 'This Account'}
          </div>
          {connectedOrganizers.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No Account Owner or Key Contact Owner linked to this account yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {connectedOrganizers.map((org, idx) => {
                const teamsStatus = org.teamsStatus || org.eligibilityStatus || 'Pending Assignment';
                const isTeamsAuthorized = teamsStatus === 'Authorized';
                return (
                  <div
                    key={org.key || idx}
                    className="bg-white rounded-xl border border-slate-200/90 px-3.5 py-2.5 flex items-start justify-between gap-3 shadow-2xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-xs">{org.name}</span>
                        {org.isAccountOwner && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Account Owner
                          </span>
                        )}
                        {org.isKeyContactOwner && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                            Key Contact Owner
                          </span>
                        )}
                      </div>
                      {org.email && (
                        <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                          {org.email}
                        </div>
                      )}
                      {Array.isArray(org.managedContacts) && org.managedContacts.length > 0 && (
                        <div className="text-[10px] text-slate-600 mt-1 truncate">
                          <span className="font-semibold text-slate-500">Key Contact(s): </span>
                          {org.managedContacts.map(mc => mc.name).join(', ')}
                        </div>
                      )}
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        isTeamsAuthorized
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {isTeamsAuthorized ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                      {teamsStatus}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Split Pane */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left List */}
        <div className="w-80 lg:w-96 shrink-0 border-r border-slate-100 overflow-y-auto bg-slate-50/40">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-xs font-medium">Loading Teams meetings...</span>
            </div>
          ) : error ? (
            <div className="p-6 text-center space-y-2">
              <AlertTriangle className="w-7 h-7 text-rose-400 mx-auto" />
              <p className="text-xs font-semibold text-slate-700">{error}</p>
              <button onClick={fetchMeetings} className="text-xs font-bold text-indigo-600 hover:underline">Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-slate-400 gap-2">
              <Video className="w-10 h-10 text-slate-200" />
              <p className="text-sm font-semibold text-slate-600">No Teams meetings synced yet</p>
              <p className="text-xs text-slate-400 max-w-xs">
                Meetings organized by IT-approved NeST Digital employees with external {account?.companyName} attendees appear here automatically once synchronized.
              </p>
            </div>
          ) : (
            filtered.map(m => {
              const idKey = m.meetingId || m.id;
              const isSelected = activeMeeting && (activeMeeting.meetingId || activeMeeting.id) === idKey;
              const badge = getTranscriptBadge(m.transcriptStatus);
              const BadgeIcon = badge.icon;

              return (
                <button
                  key={idKey}
                  type="button"
                  onClick={() => setSelectedId(idKey)}
                  className={`w-full text-left px-4 py-3.5 border-b border-slate-100 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-50/80 border-l-[3px] border-l-indigo-600'
                      : 'hover:bg-white border-l-[3px] border-l-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-[13px] font-bold text-slate-900 line-clamp-1">{m.subject || 'Teams Meeting'}</span>
                    <span className="text-[10px] font-semibold text-slate-400 shrink-0">{formatDate(m.startDateTime)}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium truncate mb-1.5">
                    Organizer: {m.organizerEmail}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badge.cls}`}>
                      <BadgeIcon className="w-2.5 h-2.5" />
                      {badge.label}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                      {formatDuration(m.durationSeconds, m.startDateTime, m.endDateTime)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Detail Panel */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-white">
          {!activeMeeting ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <Video className="w-10 h-10 text-slate-200" />
              <p className="text-sm font-semibold text-slate-500">Select a meeting to inspect details</p>
            </div>
          ) : (
            <>
              {/* Title & Meta Header */}
              <div className="border-b border-slate-100 pb-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {(() => {
                        const badge = getTranscriptBadge(activeMeeting.transcriptStatus);
                        const BadgeIcon = badge.icon;
                        return (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${badge.cls}`}>
                            <BadgeIcon className="w-3 h-3" />
                            {badge.label}
                          </span>
                        );
                      })()}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        Recording: {activeMeeting.hasRecording ? 'Available' : 'Separate Permission Required'}
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-slate-900">{activeMeeting.subject}</h3>
                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                        {formatDate(activeMeeting.startDateTime)} {formatTime(activeMeeting.startDateTime)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-indigo-500" />
                        Duration: {formatDuration(activeMeeting.durationSeconds, activeMeeting.startDateTime, activeMeeting.endDateTime)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
                        Organizer: <strong className="text-slate-700">{activeMeeting.organizerEmail}</strong>
                      </span>
                    </div>
                  </div>
                  {activeMeeting.joinWebUrl && (
                    <a
                      href={activeMeeting.joinWebUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Teams Link
                    </a>
                  )}
                </div>
              </div>

              {/* Participants Separation: Internal vs External */}
              {(() => {
                const rawAtt = Array.isArray(activeMeeting.attendees) ? activeMeeting.attendees : [];
                const isInternalEmail = (e = '') => {
                  const l = String(e).toLowerCase();
                  return l.endsWith('@nestgroup.net') || l.endsWith('@sfotechnologies.net') || l.endsWith('@nestdigital.com');
                };
                const internalList = Array.isArray(activeMeeting.internalAttendees) && activeMeeting.internalAttendees.length > 0
                  ? activeMeeting.internalAttendees
                  : rawAtt.filter(a => a.isInternal || isInternalEmail(a.email));
                const externalList = Array.isArray(activeMeeting.externalAttendees) && activeMeeting.externalAttendees.length > 0
                  ? activeMeeting.externalAttendees
                  : rawAtt.filter(a => a.isExternal || (a.email && !isInternalEmail(a.email)));

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/40">
                      <div className="text-[10px] font-black uppercase tracking-wider text-indigo-600 mb-2 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> Internal NeST Digital Participants ({internalList.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {internalList.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">Organizer only ({activeMeeting.organizerEmail})</span>
                        ) : (
                          internalList.map((p, idx) => (
                            <span key={idx} className="text-xs font-medium bg-white text-slate-700 border border-indigo-100 px-2.5 py-1 rounded-lg">
                              {p.name || p.email} <span className="text-slate-400 text-[10px]">({p.email})</span>
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40">
                      <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700 mb-2 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" /> External Customer Participants ({externalList.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {externalList.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">No external participants captured</span>
                        ) : (
                          externalList.map((p, idx) => (
                            <span key={idx} className="text-xs font-medium bg-white text-slate-800 border border-emerald-200 px-2.5 py-1 rounded-lg">
                              {p.name || p.email} <span className="text-slate-500 text-[10px]">({p.email})</span>
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* AI Summary, Decisions & Action Items */}
              <div className="bg-gradient-to-br from-slate-50 to-indigo-50/40 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" /> AI Meeting Intelligence Summary
                  </h4>
                  {(activeMeeting.keyTopics || []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {activeMeeting.keyTopics.map((topic, idx) => (
                        <span key={idx} className="text-[10px] font-semibold bg-white border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full">
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-sm text-slate-700 leading-relaxed">
                  {activeMeeting.aiSummary
                    ? activeMeeting.aiSummary
                    : activeMeeting.aiStatus === 'FAILED'
                      ? `AI processing failed (${activeMeeting.aiError || 'Unknown error'}). Use "Retry Failed Sync" to reprocess.`
                      : 'No AI summary generated (transcript unavailable or not recorded).'}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div className="bg-white rounded-xl border border-slate-200/80 p-3.5">
                    <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                      <CheckSquare className="w-3.5 h-3.5 text-emerald-600" /> Key Decisions ({(activeMeeting.keyDecisions || []).length})
                    </div>
                    {(activeMeeting.keyDecisions || []).length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No explicit decisions extracted.</p>
                    ) : (
                      <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                        {activeMeeting.keyDecisions.map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200/80 p-3.5">
                    <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                      <ListChecks className="w-3.5 h-3.5 text-indigo-600" /> Action Items ({(activeMeeting.actionItems || []).length})
                    </div>
                    {(activeMeeting.actionItems || []).length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No explicit action items extracted.</p>
                    ) : (
                      <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                        {activeMeeting.actionItems.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    )}
                  </div>
                </div>

                {((activeMeeting.customerRequirements || []).length > 0 || (activeMeeting.commitments || []).length > 0 || (activeMeeting.risksIdentified || []).length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    <div className="bg-white rounded-xl border border-slate-200/80 p-3">
                      <div className="text-[10px] font-bold uppercase text-slate-600 mb-1.5">Customer Requirements</div>
                      {(activeMeeting.customerRequirements || []).length === 0 ? (
                        <p className="text-xs text-slate-400 italic">None noted</p>
                      ) : (
                        <ul className="space-y-1 text-xs text-slate-700 list-disc pl-4">
                          {activeMeeting.customerRequirements.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      )}
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200/80 p-3">
                      <div className="text-[10px] font-bold uppercase text-slate-600 mb-1.5">Commitments</div>
                      {(activeMeeting.commitments || []).length === 0 ? (
                        <p className="text-xs text-slate-400 italic">None noted</p>
                      ) : (
                        <ul className="space-y-1 text-xs text-slate-700 list-disc pl-4">
                          {activeMeeting.commitments.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      )}
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200/80 p-3">
                      <div className="text-[10px] font-bold uppercase text-rose-600 mb-1.5">Identified Risks / Concerns</div>
                      {(activeMeeting.risksIdentified || []).length === 0 ? (
                        <p className="text-xs text-slate-400 italic">None noted</p>
                      ) : (
                        <ul className="space-y-1 text-xs text-rose-700 list-disc pl-4">
                          {activeMeeting.risksIdentified.map((rk, i) => <li key={i}>{rk}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Speaker-Attributed Transcript Section */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setTranscriptExpanded(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Meeting Transcript
                    </span>
                    {activeMeeting.wordCount > 0 && (
                      <span className="text-[10px] font-semibold text-slate-500">
                        ({activeMeeting.wordCount} words · {(activeMeeting.speakers || []).length} speaker(s))
                      </span>
                    )}
                  </div>
                  {transcriptExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {transcriptExpanded && (
                  <div className="p-5 max-h-96 overflow-y-auto bg-white">
                    {Array.isArray(activeMeeting.parsedDialogue) && activeMeeting.parsedDialogue.length > 0 ? (
                      <div className="space-y-3">
                        {activeMeeting.parsedDialogue.map((cue, idx) => (
                          <div key={idx} className="flex items-start gap-3 text-sm">
                            <span className="text-[11px] font-mono text-slate-400 shrink-0 mt-0.5">{cue.timeDisplay || '00:00'}</span>
                            <div>
                              <span className="font-bold text-indigo-900 mr-2">{cue.speaker}:</span>
                              <span className="text-slate-700 leading-relaxed">{cue.text}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : activeMeeting.rawTranscript ? (
                      <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                        {activeMeeting.rawTranscript}
                      </pre>
                    ) : (
                      <div className="text-xs text-slate-500 py-4 text-center">
                        {activeMeeting.transcriptStatus === 'PERMISSION_DENIED'
                          ? 'Transcript unavailable: Permission denied (verify CustomerPulseDevPolicy assignment for organizer).'
                          : activeMeeting.transcriptStatus === 'PROCESSING_PENDING'
                            ? 'Transcript is still processing in Microsoft Teams and will be fetched on the next sync.'
                            : activeMeeting.transcriptStatus === 'MEETING_NOT_FOUND'
                              ? 'Teams online meeting resource was not found for this organizer.'
                              : 'No spoken transcript was recorded for this meeting.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
