import React, { useEffect, useState } from 'react';
import { 
  ClipboardList, Search, RefreshCw, ChevronLeft, ChevronRight, User, ShieldAlert, X, Eye,
  Plus, CheckSquare, Building2, Users, Calendar, Clock, AtSign, Square, Send, Mail, Video, Phone, MessageSquare
} from 'lucide-react';
import { useStore } from '../store/index.js';

const parseLogDetails = (details) => {
  if (!details) return { mainText: 'No additional parameters logged.', assignee: null };
  const match = details.match(/\(Assigned to: ([^\)]+)\)$/);
  if (match) {
    return { mainText: details.replace(match[0], '').trim(), assignee: match[1] };
  }
  return { mainText: details, assignee: null };
};

export default function ActivityLog() {
  const { 
    activityLogs, 
    activityLogsLoading, 
    fetchActivityLogs, 
    user,
    accounts,
    fetchAccounts,
    contacts,
    fetchContacts,
    staffList,
    fetchStaff,
    addInteraction
  } = useStore();
  
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState(null);
  const itemsPerPage = 10;

  // Log Activity Modal Form States
  const [isLogInteractionOpen, setIsLogInteractionOpen] = useState(false);
  const [interactionSource, setInteractionSource] = useState('Outlook Mail');
  const [interactionText, setInteractionText] = useState('');
  const [interactionDate, setInteractionDate] = useState(new Date().toISOString().split('T')[0]);
  const [interactionTime, setInteractionTime] = useState(new Date().toTimeString().slice(0, 5));
  const [interactionContactId, setInteractionContactId] = useState('');
  const [interactionAccountId, setInteractionAccountId] = useState('');
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);

  useEffect(() => {
    fetchActivityLogs();
    fetchAccounts();
    fetchStaff();
  }, []);

  const handleRefresh = () => {
    fetchActivityLogs();
  };

  const channels = [
    { id: 'Outlook Mail', label: 'Outlook Mail', icon: Mail, color: 'text-blue-400' },
    { id: 'Teams Chat', label: 'Teams Chat', icon: MessageSquare, color: 'text-purple-400' },
    { id: 'Phone', label: 'Phone', icon: Phone, color: 'text-emerald-400' },
    { id: 'Face to Face', label: 'Face to Face', icon: Users, color: 'text-amber-400' },
    { id: 'Teams Meeting', label: 'Teams Meeting', icon: Video, color: 'text-rose-400' },
  ];

  const handleLogInteraction = async (e) => {
    e.preventDefault();

    const targetAccountId = interactionAccountId;
    const targetContactId = interactionContactId || (contacts[0]?.contactId);

    if (!targetAccountId) {
      alert('Please select an account.');
      return;
    }
    if (!targetContactId) {
      alert('Please add at least one contact to this account before logging an interaction.');
      return;
    }
    if (!interactionText.trim()) {
      alert('Please enter the interaction notes/message text.');
      return;
    }

    let taskText = mentionSearch.trim();
    selectedMentions.forEach(m => {
      taskText = taskText.replace(`@${m.name}`, '');
    });
    taskText = taskText.replace(/\s+/g, ' ').trim();

    const derivedSubject = interactionText.trim().split('\n')[0].slice(0, 50) || 'Interaction Note';
    const res = await addInteraction({
      accountId: targetAccountId,
      contactId: targetContactId,
      source: interactionSource,
      subject: derivedSubject,
      messageText: interactionText,
      date: interactionDate,
      time: interactionTime,
      actionMentions: selectedMentions.map(m => ({ uid: m.uid, name: m.name, task: taskText }))
    });

    if (res) {
      setIsLogInteractionOpen(false);
      resetInteractionForm();
      fetchActivityLogs();
    }
  };

  const resetInteractionForm = () => {
    setInteractionText('');
    setInteractionSource('Outlook Mail');
    setInteractionDate(new Date().toISOString().split('T')[0]);
    setInteractionTime(new Date().toTimeString().slice(0, 5));
    setInteractionContactId('');
    setInteractionAccountId('');
    setSelectedMentions([]);
    setMentionSearch('');
  };

  const getMentionSearchQuery = (text) => {
    const lastAtIndex = text.lastIndexOf('@');
    if (lastAtIndex === -1) return '';
    const partAfterAt = text.slice(lastAtIndex + 1);
    return partAfterAt;
  };

  const insertMention = (staffMember) => {
    const lastAtIndex = mentionSearch.lastIndexOf('@');
    if (lastAtIndex === -1) return;
    const beforeAt = mentionSearch.slice(0, lastAtIndex);
    const newText = beforeAt + `@${staffMember.name} `;
    setMentionSearch(newText);
    
    const parsed = [];
    staffList.forEach(s => {
      if (newText.includes(`@${s.name}`)) {
        parsed.push({ uid: s.uid, name: s.name });
      }
    });
    setSelectedMentions(parsed);
    setShowMentionDropdown(false);
  };

  const handleMentionSearchChange = (val) => {
    setMentionSearch(val);
    const parsed = [];
    staffList.forEach(s => {
      if (val.includes(`@${s.name}`)) {
        parsed.push({ uid: s.uid, name: s.name });
      }
    });
    setSelectedMentions(parsed);
  };

  const toggleMention = (staffMember) => {
    setSelectedMentions(prev => {
      const exists = prev.find(m => m.uid === staffMember.uid);
      let updated;
      if (exists) {
        updated = prev.filter(m => m.uid !== staffMember.uid);
      } else {
        updated = [...prev, { uid: staffMember.uid, name: staffMember.name }];
      }
      
      let text = mentionSearch;
      if (exists) {
        text = text.replace(`@${staffMember.name}`, '').replace(/\s+/g, ' ').trim();
      } else {
        text = `@${staffMember.name} ${text}`.replace(/\s+/g, ' ').trim();
      }
      setMentionSearch(text);
      return updated;
    });
  };

  // Get unique action types for filtering dropdown
  const actionTypes = ['All', ...new Set(activityLogs.map(log => log.action))];

  // Filter logs based on search and action dropdown selection
  const filteredLogs = activityLogs.filter(log => {
    // Role-based visibility check: non-global users only see logs explicitly assigned to them
    if (user) {
      const isGlobalUser = user.role === 'Admin' || user.userType === 'Admin' || user.userType === 'CEO';
      if (!isGlobalUser) {
        const { assignee } = parseLogDetails(log.details);
        if (!assignee) return false;
        const assigneeNames = assignee.split(',').map(name => name.trim().toLowerCase());
        const currentUserName = (user.name || '').toLowerCase();
        if (!assigneeNames.includes(currentUserName)) {
          return false;
        }
      }
    }

    const matchesSearch = 
      (log.userName && log.userName.toLowerCase().includes(search.toLowerCase())) ||
      (log.userId && log.userId.toLowerCase().includes(search.toLowerCase())) ||
      (log.details && log.details.toLowerCase().includes(search.toLowerCase())) ||
      (log.action && log.action.toLowerCase().includes(search.toLowerCase()));
      
    const matchesAction = actionFilter === 'All' || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  // Pagination calculations
  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + itemsPerPage);

  const getActionBadgeClass = (action) => {
    const act = action.toLowerCase();
    if (act.includes('login')) return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600';
    if (act.includes('signup')) return 'bg-teal-500/10 border-teal-500/20 text-teal-600';
    if (act.includes('create')) return 'bg-blue-500/10 border-blue-500/20 text-blue-600';
    if (act.includes('update')) return 'bg-amber-500/10 border-amber-500/20 text-amber-600';
    if (act.includes('delete')) return 'bg-rose-500/10 border-rose-500/20 text-rose-600';
    if (act.includes('resolve')) return 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600';
    return 'bg-slate-500/10 border-slate-500/20 text-slate-600';
  };

  return (
    <div className="space-y-5">
      {/* Header Block */}
      <div className="glass p-5 rounded-2xl border border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            <span className="bg-primary/20 border border-primary/40 text-primary text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full">
              Audit Logs
            </span>
          </div>
          <h1 className="text-xl font-bold text-white mt-1">System Activity Audit Trail</h1>
          <p className="text-xs text-slate-400">
            Real-time monitoring and event tracking of all system interactions, account edits, and admin changes.
          </p>
        </div>
        <button
          onClick={() => setIsLogInteractionOpen(true)}
          className="bg-primary hover:bg-blue-600 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 text-white transition-all cursor-pointer shadow-lg shadow-primary/25"
        >
          <Plus className="w-4 h-4 text-white" />
          Log Activity
        </button>
      </div>

      {/* Filters and Search Panel */}
      <div className="glass p-4 rounded-xl border border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by actor, details, action..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-dark-700/50 border border-slate-350 focus:border-primary/50 outline-none text-xs rounded-xl pl-10 pr-4 py-2.5 text-black placeholder-slate-400"
          />
        </div>

        {/* Action Type Dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
            Filter Action:
          </label>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-dark-700/50 border border-slate-350 focus:border-primary/50 outline-none text-xs rounded-xl px-3 py-2.5 text-black"
          >
            {actionTypes.map(act => (
              <option key={act} value={act}>{act}</option>
            ))}
          </select>
        </div>

        {/* Counter */}
        <div className="flex items-center justify-end text-xs font-semibold text-slate-450 pr-2">
          Showing {totalItems} activity record{totalItems !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Logs Table Area */}
      <div className="glass rounded-xl border border-slate-800/80 overflow-hidden">
        {activityLogsLoading && paginatedLogs.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3 text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            <span className="text-xs font-semibold">Loading system audit trail...</span>
          </div>
        ) : paginatedLogs.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
            <User className="w-8 h-8 text-slate-400" />
            <span className="font-semibold">No activity log entries found matching the filter criteria.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-dark-900/60 border-b border-slate-800/60 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="p-4 w-44">Timestamp</th>
                  <th className="p-4 w-48">Actor</th>
                  <th className="p-4 w-44">Action Event</th>
                  <th className="p-4">Detailed Description</th>
                  <th className="p-4 w-20 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {paginatedLogs.map((log) => (
                  <tr 
                    key={log.logId} 
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-slate-800/10 cursor-pointer transition-colors"
                  >
                    <td className="p-4 text-slate-450 font-medium whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString([], {
                        dateStyle: 'short',
                        timeStyle: 'medium'
                      })}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="bg-primary/10 border border-primary/20 text-primary w-6 h-6 rounded-md flex items-center justify-center font-bold text-[10px] shrink-0">
                          {log.userName ? log.userName.substring(0, 2).toUpperCase() : 'US'}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-200 block truncate">{log.userName || 'System/SSO User'}</span>
                          <span className="text-[9px] text-slate-500 block truncate">{log.userId}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider ${getActionBadgeClass(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 text-slate-350 leading-relaxed max-w-md break-words font-semibold">
                      {(() => {
                        const { mainText, assignee } = parseLogDetails(log.details);
                        return (
                          <div className="flex flex-col gap-1.5">
                            <span>{mainText}</span>
                            {assignee && (
                              <div className="flex">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-500">
                                  <User className="w-3 h-3" />
                                  Assigned: {assignee}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLog(log);
                        }}
                        className="p-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/25 rounded-lg text-primary font-bold cursor-pointer inline-flex items-center justify-center"
                        title="View Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Panel */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-800/60 flex items-center justify-between bg-dark-900/40">
            <span className="text-xs text-slate-500">
              Page <span className="font-bold text-slate-300">{currentPage}</span> of <span className="font-bold text-slate-300">{totalPages}</span>
            </span>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="p-1.5 border border-slate-700 hover:border-slate-500 rounded-lg text-slate-300 disabled:opacity-40 disabled:hover:border-slate-700 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="p-1.5 border border-slate-700 hover:border-slate-500 rounded-lg text-slate-300 disabled:opacity-40 disabled:hover:border-slate-700 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Activity Log Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass w-full max-w-2xl rounded-2xl border border-slate-800/80 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-dark-900/80">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                <span className="text-sm font-bold text-slate-200">Activity Log Details</span>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 hover:bg-slate-800/20 border border-slate-800/40 rounded-xl text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Top Meta info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Actor */}
                <div className="bg-dark-700/50 p-4 rounded-xl border border-slate-800/60">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Actor / User</span>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="bg-primary/10 border border-primary/20 text-primary w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm">
                      {selectedLog.userName ? selectedLog.userName.substring(0, 2).toUpperCase() : 'US'}
                    </div>
                    <div>
                      <span className="font-bold text-slate-200 block text-sm">{selectedLog.userName || 'System/SSO User'}</span>
                      <span className="text-[10px] text-slate-500 block">{selectedLog.userId}</span>
                    </div>
                  </div>
                </div>

                {/* Event Metadata */}
                <div className="bg-dark-700/50 p-4 rounded-xl border border-slate-800/60 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Event Action</span>
                    <div className="mt-2">
                      <span className={`inline-block px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider ${getActionBadgeClass(selectedLog.action)}`}>
                        {selectedLog.action}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] text-slate-500 font-semibold">
                    Timestamp: {new Date(selectedLog.timestamp).toLocaleString([], { dateStyle: 'long', timeStyle: 'medium' })}
                  </div>
                </div>
              </div>

              {/* Action Details */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Detailed Parameters & Logs</span>
                <div className="bg-dark-700/50 p-4 rounded-xl border border-slate-800/60 text-xs text-slate-350 leading-relaxed font-semibold font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {(() => {
                    const { mainText, assignee } = parseLogDetails(selectedLog.details);
                    return (
                      <div className="space-y-2">
                        <div>{mainText}</div>
                        {assignee && (
                          <div className="pt-2 flex">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-500 font-sans">
                              <User className="w-3 h-3" />
                              Assigned: {assignee}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800/80 flex justify-end bg-dark-900/60">
              <button
                onClick={() => setSelectedLog(null)}
                className="bg-primary text-white hover:bg-blue-600 px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg shadow-primary/20"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Interaction Modal */}
      {isLogInteractionOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass w-full max-w-2xl rounded-2xl border border-slate-800/80 flex flex-col shadow-2xl max-h-[92vh] overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <CheckSquare className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-200 text-sm">Log Activity</h3>
                  <p className="text-[10px] text-slate-500 font-semibold">Record a client interaction for AI analysis & tracking</p>
                </div>
              </div>
              <button onClick={() => { setIsLogInteractionOpen(false); resetInteractionForm(); }} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLogInteraction} className="overflow-y-auto flex-1">
              <div className="p-6 space-y-5">

                {/* Section 1: Channel Type */}
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3 text-slate-400" /> Channel / Interaction Type
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {channels.map(ch => {
                      const Icon = ch.icon;
                      const isActive = interactionSource === ch.id;
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => setInteractionSource(ch.id)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all duration-150 cursor-pointer ${
                            isActive
                              ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20'
                              : 'bg-dark-900/60 border-slate-800/80 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : ch.color}`} />
                          {ch.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Section 2: Company & Contact */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Building2 className="w-3 h-3 text-slate-400" /> Company Account
                    </label>
                    <select
                      value={interactionAccountId}
                      onChange={(e) => {
                        setInteractionAccountId(e.target.value);
                        setInteractionContactId('');
                        fetchContacts(e.target.value);
                      }}
                      className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                    >
                      <option value="">Select Company</option>
                      {accounts.map(acc => (
                        <option key={acc.accountId || acc.id} value={acc.accountId || acc.id}>
                          {acc.companyName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Users className="w-3 h-3 text-slate-400" /> Client Contact / Staff
                    </label>
                    <select
                      value={interactionContactId}
                      onChange={(e) => setInteractionContactId(e.target.value)}
                      className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                    >
                      <option value="">{contacts.length === 0 ? 'No contacts found' : 'Select Contact'}</option>
                      {contacts
                        .filter(c => !interactionAccountId || c.accountId === interactionAccountId)
                        .map(c => (
                          <option key={c.contactId} value={c.contactId}>
                            {c.name} — {c.designation || c.hierarchyTag}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Section 3: Date & Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-slate-400" /> Date
                    </label>
                    <input
                      type="date"
                      value={interactionDate}
                      onChange={(e) => setInteractionDate(e.target.value)}
                      className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-400" /> Time
                    </label>
                    <input
                      type="time"
                      value={interactionTime}
                      onChange={(e) => setInteractionTime(e.target.value)}
                      className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Section 4: Notes / Message */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Notes / Message Content *</label>
                  <textarea
                    value={interactionText}
                    onChange={(e) => setInteractionText(e.target.value)}
                    rows={5}
                    className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-3 focus:outline-none focus:border-primary/50 resize-none leading-relaxed font-semibold"
                    placeholder="Paste email content, meeting notes, Teams chat log, call summary... Gemini AI will automatically parse sentiment, detect risks, and update the account health score."
                  />
                </div>

                {/* Section 5: Action Tracking / Internal Mentions */}
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <AtSign className="w-3 h-3 text-slate-400" /> Assign Task
                  </label>

                  {/* Mention Search & Dropdown */}
                  <div className="relative">
                    <input
                      type="text"
                      value={mentionSearch}
                      onFocus={() => setShowMentionDropdown(true)}
                      onChange={(e) => handleMentionSearchChange(e.target.value)}
                      onBlur={() => setTimeout(() => setShowMentionDropdown(false), 150)}
                      placeholder="Type @name to assign task (e.g. @NDA Head take a look)..."
                      className="w-full bg-dark-700/50 border border-slate-350 text-xs rounded-xl p-2.5 focus:outline-none focus:border-primary/50 text-black placeholder-slate-450"
                    />
                    {showMentionDropdown && (() => {
                      const query = getMentionSearchQuery(mentionSearch);
                      const filteredStaff = staffList.filter(s => 
                        s.name.toLowerCase().includes(query.toLowerCase()) || 
                        s.email.toLowerCase().includes(query.toLowerCase())
                      );
                      if (filteredStaff.length === 0 || !mentionSearch.includes('@')) return null;
                      return (
                        <div className="absolute z-55 w-full top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-36 overflow-y-auto">
                          {filteredStaff.map(s => {
                            const isSelected = selectedMentions.some(m => m.uid === s.uid);
                            return (
                              <button
                                key={s.uid}
                                type="button"
                                onMouseDown={() => insertMention(s)}
                                className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-100 transition-colors text-slate-700 ${
                                  isSelected ? 'bg-primary/5 text-primary' : ''
                                }`}
                              >
                                <div className="flex flex-col items-start text-left">
                                  <span className="font-bold text-black">{s.name}</span>
                                  <span className="text-[10px] text-slate-500 font-semibold">{s.role}{s.department ? ` · ${s.department}` : ''}</span>
                                </div>
                                {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <Square className="w-3.5 h-3.5 text-slate-400" />}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Selected Tags Confirmation */}
                  {selectedMentions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[10px] text-slate-500 font-bold self-center">Assigned to:</span>
                      {selectedMentions.map(m => (
                        <span
                          key={m.uid}
                          className="flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-[10px] font-semibold rounded-full px-2 py-0.5"
                        >
                          @{m.name}
                          <button type="button" onClick={() => toggleMention(m)} className="hover:text-red-500 ml-0.5 cursor-pointer">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Footer Actions */}
              <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-dark-900/60">
                <button
                  type="button"
                  onClick={() => { setIsLogInteractionOpen(false); resetInteractionForm(); }}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-black cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-primary hover:bg-blue-600 text-xs text-white font-semibold rounded-xl px-5 py-2.5 flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-primary/20"
                >
                  <Send className="w-3.5 h-3.5 text-white" />
                  Save & Assign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
