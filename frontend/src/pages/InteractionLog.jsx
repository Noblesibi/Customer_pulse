import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  ClipboardList, Search, RefreshCw, ChevronLeft, ChevronRight, User, ShieldAlert, X, Eye,
  Plus, CheckSquare, Building2, Users, Send, Mail, Video, Phone, MessageSquare, Calendar,
  Paperclip, FileText, Download, ThumbsUp
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

const formatLoggedDateTime = (dateStr, timeStr, timestampStr) => {
  if (dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const [yyyy, mm, dd] = parts;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthLabel = months[parseInt(mm, 10) - 1] || mm;
      const dayVal = parseInt(dd, 10);
      
      let timeLabel = '';
      if (timeStr) {
        const timeParts = timeStr.split(':');
        if (timeParts.length >= 2) {
          let hours = parseInt(timeParts[0], 10);
          const minutes = timeParts[1].substring(0, 2);
          const ampm = hours >= 12 ? 'PM' : 'AM';
          hours = hours % 12;
          hours = hours ? hours : 12;
          timeLabel = `, ${hours}:${minutes} ${ampm}`;
        }
      }
      return `${dayVal} ${monthLabel} ${yyyy}${timeLabel}`;
    }
  }
  if (timestampStr) {
    const dt = new Date(timestampStr);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    }
  }
  return '—';
};

const formatDueDate = (dateStr) => {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [yyyy, mm, dd] = parts;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthLabel = months[parseInt(mm, 10) - 1] || mm;
    const dayVal = parseInt(dd, 10);
    return `${dayVal} ${monthLabel} ${yyyy}`;
  }
  return dateStr;
};

export default function InteractionLog() {
  const { 
    activityLogs, 
    activityLogsLoading, 
    fetchActivityLogs, 
    user,
    accounts,
    fetchAccounts,
    staffList,
    fetchStaff,
    interactions,
    fetchInteractions,
    updateTaskStatus,
    replyToInteraction,
    fetchReplies,
    repliesByInteraction
  } = useStore();
  
  const currentUserStaff = staffList.find(s => s.uid === user?.uid);
  const isTrueAdmin = currentUserStaff
    ? (currentUserStaff.role === 'Admin' || currentUserStaff.position?.toLowerCase().includes('admin'))
    : false;
  const isTrueCeo = currentUserStaff
    ? (currentUserStaff.position === 'CEO' || currentUserStaff.position === 'Chief Executive Officer')
    : false;
  const showAllTasks = isTrueAdmin || isTrueCeo;
  
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all-tasks'); // 'all-tasks' | 'my-tasks'

  useEffect(() => {
    if (staffList.length > 0) {
      if (!showAllTasks && activeTab === 'all-tasks') {
        setActiveTab('assigned-by-me');
      }
    }
  }, [showAllTasks, activeTab, staffList]);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState(null);
  const [hoveredTaskTooltip, setHoveredTaskTooltip] = useState(null);
  const [cardReplyText, setCardReplyText] = useState({});
  const [submittingReply, setSubmittingReply] = useState({});
  const itemsPerPage = 10;

  useEffect(() => {
    if (selectedLog && selectedLog.interactionId) {
      fetchReplies(selectedLog.interactionId);
    }
  }, [selectedLog?.interactionId]);



  // Completion Note Modal State
  const [completionModalState, setCompletionModalState] = useState({ isOpen: false, task: null, newStatus: '' });
  const [completionNote, setCompletionNote] = useState('');
  const [completionFile, setCompletionFile] = useState(null);
  const [taskStatuses, setTaskStatuses] = useState(() => {
    try {
      const saved = localStorage.getItem('cp_task_notes');
      return saved ? JSON.parse(saved) : {};
    } catch (_) { return {}; }
  });

  // Helper: update taskStatuses and persist to localStorage
  const updateTaskStatuses = (updater) => {
    setTaskStatuses(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      try { localStorage.setItem('cp_task_notes', JSON.stringify(next)); } catch (_) {}
      return next;
    });
  };

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

    const ok = await updateTaskStatus(task.interactionId, task.uid, newStatus, forwardReason.trim(), selectedUser.uid, selectedUser.name);
    if (ok) {
      if (forwardReason.trim()) {
        await replyToInteraction(task.interactionId, `Forwarded Task Note: ${forwardReason}`);
      }
      fetchActivityLogs();
      fetchInteractions();
    }
    updateTaskStatuses(prev => ({ 
      ...prev, 
      [`${task.interactionId}-${task.uid}`]: newStatus,
      [`${task.interactionId}-${task.uid}-forwardedToName`]: selectedUser.name,
      [`${task.interactionId}-${task.uid}-note`]: forwardReason.trim()
    }));

    // Update details drawer selectedLog state if open and matching
    if (selectedLog && selectedLog.interactionId === task.interactionId) {
      setSelectedLog(prev => {
        const originalMention = (prev.actionMentions || []).find(m => m.uid === task.uid);
        const updatedMentions = (prev.actionMentions || []).map(m =>
          m.uid === task.uid ? { ...m, status: 'Forwarded', forwardedToName: selectedUser.name, forwardedToUid: selectedUser.uid } : m
        );
        const alreadyExists = (prev.actionMentions || []).some(m => m.uid === selectedUser.uid && m.status === 'Task Assigned');
        if (!alreadyExists && originalMention) {
          updatedMentions.push({
            uid: selectedUser.uid,
            name: selectedUser.name,
            task: originalMention.task,
            status: 'Task Assigned'
          });
        }
        return { ...prev, actionMentions: updatedMentions };
      });
    }

    setForwardModalState({ isOpen: false, task: null, newStatus: 'Forwarded' });
    setForwardToUid('');
    setForwardReason('');
  };

  useEffect(() => {
    fetchActivityLogs();
    fetchAccounts();
    fetchStaff();
    fetchInteractions();
  }, []);

  useEffect(() => {
    if (location.state?.selectedInteractionId && interactions.length > 0) {
      const match = interactions.find(i => i.interactionId === location.state.selectedInteractionId);
      if (match) {
        setSelectedLog(match);
      }
    }
  }, [location, interactions]);

  const handleRefresh = () => {
    fetchActivityLogs();
  };

  const handleCloseDetails = () => {
    if (location.state?.from) {
      navigate(location.state.from);
    } else {
      setSelectedLog(null);
    }
  };

  // Helper to lookup user position instead of showing raw UID
  const getUserPosition = (userId) => {
    const staff = staffList.find(s => s.uid === userId);
    if (staff && staff.position) return staff.position;
    if (userId === 'mock-admin-uid') return 'System Administrator';
    if (userId === 'mock-employee-uid') return 'Account Owner';
    return 'Platform Member';
  };





  // Helper to derive clean log title from the log description/subject instead of the task
  const deriveLogTitle = (logItem) => {
    if (!logItem) return 'Interaction Log';
    const rawText = (logItem.subject && logItem.subject !== 'Interaction Note')
      ? logItem.subject
      : (logItem.messageText || logItem.subject || 'Interaction Log');
    let clean = rawText.split(/[.!?\n]/)[0].trim();
    const lower = clean.toLowerCase();
    if (lower.includes('call with') || lower.includes('conversation through call with')) {
      const match = clean.match(/(?:call with|call|conversation with|conversation through call with)\s+([A-Za-z]+)/i);
      if (match && match[1]) return `Call with ${match[1].charAt(0).toUpperCase() + match[1].slice(1)}`;
    }
    if (lower.includes('conversation with')) {
      const match = clean.match(/conversation with\s+([A-Za-z]+)/i);
      if (match && match[1]) return `Sync with ${match[1].charAt(0).toUpperCase() + match[1].slice(1)}`;
    }
    if (lower.includes('portfolio review') || lower.includes('review meeting')) return 'Portfolio Review Meeting';
    if (lower.includes('discussion on') || lower.includes('discussion about')) {
      const match = clean.match(/discussion (?:on the|on|about the|about)\s+([^.!?,\n]+)/i);
      if (match && match[1]) {
        const topic = match[1].split(/\s+/).slice(0, 3).join(' ');
        const cleanTopic = topic.replace(/(?:of|the|a|for|new)$/i, '').trim();
        return `${cleanTopic.charAt(0).toUpperCase() + cleanTopic.slice(1)} Discussion`;
      }
    }
    if (lower.includes('shared') && lower.includes('proposal')) return 'Shared Proposal';
    if (lower.includes('strategic') && lower.includes('discussion')) return 'Strategic Discussion';
    if (lower.includes('conducted') && lower.includes('discussion')) return 'Conducted Discussion';
    if (lower.includes('stability')) return 'Stability Feedback';
    if (lower.includes('feedback')) return 'Client Feedback';
    if (lower.includes('onboard')) return 'Customer Onboarding';
    if (lower.includes('review') && lower.includes('account')) return 'Review Accounts';

    if (lower.includes('use case')) return 'Use Cases Discussion';
    if (lower.includes('security') || lower.includes('rbac')) return 'Security Audit';
    if (lower.includes('regression') || lower.includes('test')) return 'Regression Testing';
    if (lower.includes('load test')) return 'Load Testing';
    if (lower.includes('appraisal')) return 'Appraisal Review';
    if (lower.includes('budget')) return 'Budget Review';

    clean = clean.replace(/^(we held a |held a |had a |we had a |had a conversation through call with|had a conversation with|had the discussion on the|had the discussion on|discussion on the|discussion on|conversation with|conversation through call with)\s+/i, '');
    clean = clean.replace(/\s+(based on the new project|based on the|based on|regarding|about)\s+.*/i, '');
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    const words = clean.split(/\s+/);
    if (words.length > 5) {
      return words.slice(0, 5).join(' ') + '...';
    }
    return clean || 'Interaction Log';
  };

  // Extract all task assignments from interactions
  const realTasks = [];
  interactions.forEach(item => {
    if (Array.isArray(item.actionMentions) && item.actionMentions.length > 0) {
      const computedLogHeader = deriveLogTitle(item);
      item.actionMentions.forEach(mention => {
        const taskDesc = mention.task || item.messageText || item.subject || 'Task Assignment';
        const fallbackHeader = taskDesc.split(/[.!?\n]/)[0].trim();
        const cleanHeader = fallbackHeader.length <= 50 ? fallbackHeader : (fallbackHeader.slice(0, 47) + '...');
        realTasks.push({
          ...mention,
          taskHeader: mention.taskHeader || cleanHeader,
          logHeader: computedLogHeader,
          interactionId: item.interactionId,
          accountId: item.accountId,
          contactId: item.contactId,
          companyName: item.companyName || 'External Account',
          loggedByName: item.loggedByName || 'System Admin',
          loggedByUid: item.loggedByUid,
          date: item.date,
          time: item.time,
          timestamp: item.timestamp,
          originalInteraction: item
        });
      });
    }
  });

  // Sort by timestamp descending (newest tasks first, in the order of time entered)
  realTasks.sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp) : (a.date && a.time ? new Date(`${a.date}T${a.time}:00`) : new Date(0));
    const timeB = b.timestamp ? new Date(b.timestamp) : (b.date && b.time ? new Date(`${b.date}T${b.time}:00`) : new Date(0));
    return timeB - timeA;
  });

  // Helper to filter any task list consistently
  const filterTaskList = (tasksArray) => {
    return tasksArray.filter(task => {
      const query = search.toLowerCase();
      const taskText = (task.taskHeader || '') + ' ' + (task.task || task.originalInteraction?.messageText || task.originalInteraction?.subject || '');
      const matchesSearch = (
        (task.name && task.name.toLowerCase().includes(query)) ||
        (taskText.toLowerCase().includes(query)) ||
        (task.companyName && task.companyName.toLowerCase().includes(query)) ||
        (task.loggedByName && task.loggedByName.toLowerCase().includes(query))
      );

      const currentStatus = taskStatuses[`${task.interactionId}-${task.uid}`] || task.status || 'Pending';
      let displayStatus = currentStatus === 'Pending' ? 'Task Assigned' : currentStatus;
      if (displayStatus === 'Accept/Decline') displayStatus = 'Accept';
      if (displayStatus === 'Completed/Forwarded') displayStatus = 'Completed';
      const today = new Date();
      today.setHours(0,0,0,0);
      const taskDue = task.dueDate ? new Date(task.dueDate) : null;
      if (taskDue) {
        taskDue.setHours(0,0,0,0);
      }
      const isTaskOverdue = taskDue && taskDue < today && currentStatus !== 'Completed';
      const isStatusUnchanged = currentStatus === 'Pending' || currentStatus === 'Task Assigned';
      if (isTaskOverdue && isStatusUnchanged) {
        displayStatus = 'Overdued';
      }

      const matchesStatus = statusFilter === 'All' || displayStatus.toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  };

  const filteredAllTasks = filterTaskList(realTasks);
  const filteredAssignedByMeTasks = filterTaskList(realTasks.filter(task => task.loggedByUid === user?.uid));
  const filteredMyTasks = filterTaskList(realTasks.filter(task => task.uid === user?.uid));

  // Unified items display based on activeTab
  let displayItems = [];
  if (activeTab === 'all-tasks') {
    displayItems = filteredAllTasks;
  } else if (activeTab === 'assigned-by-me') {
    displayItems = filteredAssignedByMeTasks;
  } else if (activeTab === 'assigned-to-me') {
    displayItems = filteredMyTasks;
  }

  // Pagination calculations
  const totalItems = displayItems.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = displayItems.slice(startIndex, startIndex + itemsPerPage);

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
    <div className="p-4 md:p-5 space-y-3.5 flex flex-col h-auto md:h-[calc(100vh-7rem)] min-h-0">
      {/* Header Block */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-white">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-white">Interaction Log</h1>
        </div>
        <button
          onClick={() => navigate('/log-interaction')}
          className="bg-primary hover:bg-blue-600 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 text-white transition-all cursor-pointer shadow-lg shadow-primary/25"
        >
          <Plus className="w-4 h-4 text-white" />
          Log Interaction
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-1">
        {showAllTasks && (
          <button
            onClick={() => { setActiveTab('all-tasks'); setCurrentPage(1); }}
            className={`px-5 py-3 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
              activeTab === 'all-tasks'
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-400 hover:text-black'
            }`}
          >
            All Tasks
          </button>
        )}
        <button
          onClick={() => { setActiveTab('assigned-by-me'); setCurrentPage(1); }}
          className={`px-5 py-3 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
            activeTab === 'assigned-by-me'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-400 hover:text-black'
          }`}
        >
          Tasks Assigned by Me
        </button>
        <button
          onClick={() => { setActiveTab('assigned-to-me'); setCurrentPage(1); }}
          className={`px-5 py-3 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
            activeTab === 'assigned-to-me'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-400 hover:text-black'
          }`}
        >
          Tasks Assigned to Me
        </button>
      </div>

      {/* Filters and Search Panel */}
      <div className="glass p-4 rounded-xl border border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-center">
        {/* Search */}
        <div className="relative md:col-span-2 sm:col-span-2">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search tasks by assignee, description, company..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-dark-700/50 border border-slate-350 focus:border-primary/50 outline-none text-xs rounded-xl pl-10 pr-4 py-2.5 text-black placeholder-slate-400"
          />
        </div>

        {/* Status Filter */}
        <div className="relative md:col-span-1 sm:col-span-1">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-dark-700/50 border border-slate-350 focus:border-primary/50 outline-none text-xs rounded-xl px-3 py-2.5 text-black font-semibold cursor-pointer"
          >
            <option value="All">All Statuses</option>
            <option value="Task Assigned">Task Assigned</option>
            <option value="Accept">Accept</option>
            <option value="Decline">Decline</option>
            <option value="Completed">Completed</option>
            <option value="Forwarded">Forwarded</option>
            <option value="Overdued">Overdued</option>
          </select>
        </div>

        {/* Counter */}
        <div className="flex items-center justify-end text-xs font-semibold text-slate-450 pr-2 md:col-span-1 sm:col-span-1">
          Showing {totalItems} task assignment{totalItems !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Logs Table Area */}
      <div className="glass rounded-xl border border-slate-800/80 flex-1 flex flex-col min-h-0 overflow-hidden">
        {paginatedItems.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
            <User className="w-8 h-8 text-slate-400" />
            <span className="font-semibold">No records found matching the filter criteria.</span>
          </div>
        ) : (          <>
            {/* Stacked Cards for Mobile */}
            <div className="block md:hidden overflow-y-auto flex-1 min-h-0 divide-y divide-slate-800/40">
              {paginatedItems.map((task, idx) => {
                const currentStatus = taskStatuses[`${task.interactionId}-${task.uid}`] || task.status || 'Pending';
                const today = new Date();
                today.setHours(0,0,0,0);
                const taskDue = task.dueDate ? new Date(task.dueDate) : null;
                if (taskDue) {
                  taskDue.setHours(0,0,0,0);
                }
                const isTaskOverdue = taskDue && taskDue < today && currentStatus !== 'Completed';
                const isStatusUnchanged = currentStatus === 'Pending' || currentStatus === 'Task Assigned';
                const showAsOverdued = isTaskOverdue && isStatusUnchanged;

                const showButtons = activeTab === 'assigned-to-me';
                let displayStatus = currentStatus === 'Pending' ? 'Task Assigned' : currentStatus;
                if (displayStatus === 'Accept/Decline') displayStatus = 'Accepted';
                if (displayStatus === 'Accept' || displayStatus === 'In Progress') displayStatus = 'Accepted';
                if (displayStatus === 'Decline' || displayStatus === 'Declined') displayStatus = 'Declined';
                if (displayStatus === 'Completed/Forwarded') displayStatus = 'Completed';
                if (showAsOverdued) {
                  displayStatus = 'Overdued';
                }
                const forwardedTo = taskStatuses[`${task.interactionId}-${task.uid}-forwardedToName`] || task.forwardedToName;

                return (
                  <div 
                    key={`${task.interactionId}-${task.uid}-${idx}`} 
                    onClick={() => setSelectedLog(task.originalInteraction)}
                    className="p-4 bg-dark-900/20 hover:bg-slate-800/10 cursor-pointer transition-all space-y-3"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/accounts/${task.accountId}`);
                        }}
                        className="font-bold text-xs text-slate-200 hover:text-primary cursor-pointer transition-colors"
                      >
                        {task.companyName}
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium whitespace-nowrap">
                        {formatLoggedDateTime(task.date, task.time, task.timestamp)}
                      </span>
                    </div>

                    <div className="text-xs leading-relaxed font-semibold space-y-1">
                      <div className="text-slate-200">
                        {task.logHeader || deriveLogTitle(task.originalInteraction || {})}
                      </div>
                      {/* Log Message Section */}
                      <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60 space-y-1">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Interaction Log Description</span>
                        <p className="text-[11px] text-slate-350 font-normal leading-normal whitespace-pre-wrap">
                          {task.originalInteraction?.messageText || task.originalInteraction?.subject || 'No log description available.'}
                        </p>
                      </div>
                      {(task.priority || task.dueDate) && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {task.priority && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                              task.priority === 'High' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                              task.priority === 'Medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                              'bg-slate-800 border-slate-700 text-slate-455'
                            }`}>
                              {task.priority === 'High' ? 'High' : task.priority === 'Medium' ? 'Medium' : 'Low'}
                            </span>
                          )}
                          {task.dueDate && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                              isTaskOverdue 
                                ? 'bg-rose-600 border-rose-500 text-white animate-pulse' 
                                : 'bg-slate-800 border-slate-700 text-slate-300'
                            }`}>
                              Due: {new Date(task.dueDate).toLocaleDateString()} {isTaskOverdue && ' (OVERDUE)'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <div className="flex flex-col gap-1 text-slate-450">
                        <span>By: <strong className="text-slate-300 font-semibold">{task.loggedByName}</strong></span>
                        {activeTab !== 'my-tasks' && (
                          <span className="truncate max-w-[150px]">To: <strong className="text-slate-300 font-semibold">{task.name}</strong></span>
                        )}
                      </div>

                      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                        {showButtons ? (
                          <div className="flex flex-col gap-1 items-end">
                            <select 
                              value={displayStatus === 'Accepted' ? 'Accept' : displayStatus === 'Declined' ? 'Decline' : displayStatus}
                              onChange={(e) => {
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
                                  updateTaskStatus(task.interactionId, task.uid, st).then(ok => { if (ok) fetchInteractions(); });
                                  updateTaskStatuses(prev => ({ ...prev, [`${task.interactionId}-${task.uid}`]: st }));
                                }
                              }}
                              className="px-2 py-1 rounded-lg border border-slate-700 bg-slate-800 text-[10px] text-slate-300 font-bold outline-none cursor-pointer focus:border-indigo-500"
                            >
                              {(displayStatus === 'Overdued' || displayStatus === 'Overdue') && <option value="Overdued">Overdued</option>}
                              <option value="Task Assigned">Task Assigned</option>
                              <option value="Accept">Accepted</option>
                              <option value="Decline">Declined</option>
                              <option value="Completed">Completed</option>
                              <option value="Forwarded">Forwarded</option>
                            </select>
                            {displayStatus === 'Forwarded' && forwardedTo && (
                              <span className="text-[10px] text-indigo-400 font-bold">
                                to @{forwardedTo}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 items-end">
                            <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-wider ${
                              displayStatus.toLowerCase() === 'completed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                              displayStatus.toLowerCase() === 'forwarded' ? 'bg-sky-500/10 border-sky-500/20 text-sky-400' :
                              displayStatus.toLowerCase() === 'accept' || displayStatus.toLowerCase() === 'accepted' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                              displayStatus.toLowerCase() === 'decline' || displayStatus.toLowerCase() === 'declined' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                              displayStatus.toLowerCase() === 'overdued' || displayStatus.toLowerCase() === 'overdue' ? 'bg-purple-500/10 border-purple-500/20 text-purple-500' :
                              'bg-slate-800 border-slate-700 text-slate-400'
                            }`}>
                              {displayStatus === 'Forwarded' && forwardedTo ? `Forwarded to @${forwardedTo}` : displayStatus}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Table for Desktop */}
            <div className="hidden md:block overflow-y-auto flex-1 min-h-0">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-dark-900 border-b border-slate-800/60 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="py-2.5 px-4 w-40 sticky top-0 bg-dark-900 z-10 text-left">Account</th>
                    <th className="py-2.5 px-4 w-36 sticky top-0 bg-dark-900 z-10 text-left">Interaction Type</th>
                    <th className="py-2.5 px-4 w-36 sticky top-0 bg-dark-900 z-10 text-left">Client Contact</th>
                    <th className="py-2.5 px-4 sticky top-0 bg-dark-900 z-10 text-left">Log Header</th>
                    <th className="py-2.5 px-4 w-44 sticky top-0 bg-dark-900 z-10 text-left">Connected Person (Our Company)</th>
                    <th className="py-2.5 px-4 w-44 sticky top-0 bg-dark-900 z-10 text-left">Associated Task</th>
                    <th className="py-2.5 px-4 w-44 sticky top-0 bg-dark-900 z-10 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {paginatedItems.map((task, idx) => {
                      const currentStatus = taskStatuses[`${task.interactionId}-${task.uid}`] || task.status || 'Pending';
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
                      <tr 
                        key={`${task.interactionId}-${task.uid}-${idx}`} 
                        onClick={() => setSelectedLog(task.originalInteraction)}
                        className={`hover:bg-blue-50/80 cursor-pointer transition-colors duration-150 border-b border-dark-800/40 ${
                          idx % 2 === 0 ? 'bg-blue-50/30' : 'bg-white'
                        }`}
                      >
                        <td className="p-4">
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (task.accountId) navigate(`/accounts/${task.accountId}`);
                            }}
                            className="font-bold text-slate-200 hover:text-primary cursor-pointer transition-colors"
                          >
                            {task.companyName || 'External Account'}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap font-bold text-xs">
                          {(() => {
                            const rawType = task.originalInteraction?.source || task.source || task.originalInteraction?.activityType || task.originalInteraction?.type || 'Outlook Mail';
                            const lower = (rawType || '').toLowerCase();
                            let label = rawType;
                            let badgeStyle = 'bg-slate-800/80 border-slate-700/60 text-slate-300';
                            if (lower.includes('face to face') || lower.includes('in person')) {
                              label = 'Face to Face';
                              badgeStyle = 'bg-amber-500/10 border-amber-500/20 text-amber-400';
                            } else if (lower.includes('outlook') || lower.includes('mail') || lower.includes('email')) {
                              label = 'Outlook Mail';
                              badgeStyle = 'bg-blue-500/10 border-blue-500/20 text-blue-400';
                            } else if (lower.includes('teams chat') || lower.includes('chat')) {
                              label = 'Teams Chat';
                              badgeStyle = 'bg-purple-500/10 border-purple-500/20 text-purple-400';
                            } else if (lower.includes('teams meeting') || lower.includes('meeting') || lower.includes('video')) {
                              label = 'Teams Meeting';
                              badgeStyle = 'bg-rose-500/10 border-rose-500/20 text-rose-400';
                            } else if (lower.includes('phone') || lower.includes('call')) {
                              label = 'Phone Call';
                              badgeStyle = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
                            }
                            return (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-black tracking-wider uppercase ${badgeStyle}`}>
                                {label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap text-xs font-semibold text-slate-300">
                          {task.originalInteraction?.contactName || task.contactName || '—'}
                        </td>
                        <td className="py-2 px-4 text-slate-350 leading-relaxed font-semibold max-w-xs break-words">
                          <div 
                            title={task.originalInteraction?.messageText || 'No log details available.'}
                            className="cursor-help hover:text-primary transition-colors inline-block"
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const showBelow = rect.top < 220;
                              setHoveredTaskTooltip({
                                text: task.originalInteraction?.messageText || task.originalInteraction?.subject || 'No log details available.',
                                x: rect.left + rect.width / 2,
                                y: showBelow ? rect.bottom : rect.top,
                                showBelow
                              });
                            }}
                            onMouseLeave={() => setHoveredTaskTooltip(null)}
                          >
                            {task.logHeader || deriveLogTitle(task.originalInteraction || {})}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="bg-primary/20 border border-primary/30 text-primary w-6 h-6 rounded-md flex items-center justify-center font-bold text-[10px] shrink-0">
                              {(task.loggedByName || task.name || 'US').substring(0, 2).toUpperCase()}
                            </div>
                            <span className="font-bold text-slate-200 text-xs truncate max-w-[130px]">
                              {task.loggedByName || task.name || 'Staff Member'}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 max-w-[180px]">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(task.originalInteraction);
                            }}
                            title={`Assigned to @${task.name || 'Staff'}: ${task.task || task.taskHeader || 'Assigned Task'}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-white border border-primary/20 hover:border-primary font-bold text-xs transition-all w-full justify-start cursor-pointer group shadow-sm"
                          >
                            <ClipboardList className="w-3.5 h-3.5 shrink-0 text-primary group-hover:text-white transition-colors" />
                            <span className="truncate text-left">
                              {task.task ? (task.task.length > 24 ? task.task.substring(0, 24) + '...' : task.task) : `Task: @${task.name || 'Staff'}`}
                            </span>
                          </button>
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {(() => {
                            const showButtons = activeTab === 'assigned-to-me';
                            let displayStatus = currentStatus === 'Pending' ? 'Task Assigned' : currentStatus;
                            if (displayStatus === 'Accept/Decline') displayStatus = 'Accepted';
                            if (displayStatus === 'Accept' || displayStatus === 'In Progress') displayStatus = 'Accepted';
                            if (displayStatus === 'Decline' || displayStatus === 'Declined') displayStatus = 'Declined';
                            if (displayStatus === 'Completed/Forwarded') displayStatus = 'Completed';
                            if (showAsOverdued) {
                              displayStatus = 'Overdued';
                            }
                            const forwardedTo = taskStatuses[`${task.interactionId}-${task.uid}-forwardedToName`] || task.forwardedToName;
                            if (showButtons) {
                              return (
                                <div className="flex flex-col gap-1">
                                  <select 
                                    value={displayStatus === 'Accepted' ? 'Accept' : displayStatus === 'Declined' ? 'Decline' : displayStatus}
                                    onChange={(e) => {
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
                                        updateTaskStatus(task.interactionId, task.uid, st).then(ok => { if (ok) fetchInteractions(); });
                                        updateTaskStatuses(prev => ({ ...prev, [`${task.interactionId}-${task.uid}`]: st }));
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-2 py-1 rounded-lg border border-slate-350 bg-white text-xs text-black font-bold outline-none cursor-pointer focus:border-primary w-fit"
                                  >
                                    {(displayStatus === 'Overdued' || displayStatus === 'Overdue') && <option value="Overdued">Overdued</option>}
                                    <option value="Task Assigned">Task Assigned</option>
                                    <option value="Accept">Accepted</option>
                                    <option value="Decline">Declined</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Forwarded">Forwarded</option>
                                  </select>
                                  {displayStatus === 'Forwarded' && forwardedTo && (
                                    <span className="text-xs text-primary font-bold">
                                      to @{forwardedTo}
                                    </span>
                                  )}
                                </div>
                              );
                            }
                            return (
                              <div className="flex flex-col gap-1">
                                <span className={`inline-block px-2.5 py-1 rounded-lg border text-xs font-black uppercase tracking-wider w-fit ${
                                  displayStatus.toLowerCase() === 'completed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' :
                                  displayStatus.toLowerCase() === 'forwarded' ? 'bg-sky-500/10 border-sky-500/20 text-sky-600' :
                                  displayStatus.toLowerCase() === 'accept' || displayStatus.toLowerCase() === 'accepted' ? 'bg-amber-500/10 border-amber-500/20 text-amber-600' :
                                  displayStatus.toLowerCase() === 'decline' || displayStatus.toLowerCase() === 'declined' ? 'bg-rose-500/10 border-rose-500/20 text-rose-600' :
                                  displayStatus.toLowerCase() === 'overdued' || displayStatus.toLowerCase() === 'overdue' ? 'bg-purple-500/10 border-purple-500/20 text-purple-600' :
                                  'bg-slate-400/10 border-slate-400/20 text-slate-500'
                                }`}>
                                  {displayStatus === 'Forwarded' && forwardedTo ? `Forwarded to @${forwardedTo}` : displayStatus}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>)}

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

      {/* Interaction Log Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-dark-950 z-50 flex flex-col animate-fade-in overflow-hidden rounded-2xl border border-dark-800 shadow-2xl" style={{fontFamily: 'Montserrat, sans-serif'}}>
          <div className="flex-1 flex flex-col overflow-hidden">
            {(() => {
              const isInteraction = !!selectedLog.interactionId;
              const userName = isInteraction ? selectedLog.loggedByName : selectedLog.userName;
              const action = isInteraction ? selectedLog.source : selectedLog.action;
              const timestamp = selectedLog.timestamp;
              
              let mainText = '';
              let legacyAssignee = null;
              let mentions = [];
              
              if (isInteraction) {
                mainText = selectedLog.messageText;
                mentions = selectedLog.actionMentions || [];
              } else {
                const parsed = parseLogDetails(selectedLog.details);
                mainText = parsed.mainText;
                legacyAssignee = parsed.assignee;
              }
              
              const getStatusColorClass = (st) => {
                const s = (st || 'Pending').toLowerCase();
                if (s.includes('complete') || s.includes('forward')) return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400';
                if (s.includes('progress') || s.includes('accept') || s.includes('decline')) return 'bg-amber-500/10 border-amber-500/25 text-amber-400';
                if (s.includes('overdued') || s.includes('overdue')) return 'bg-purple-500/10 border-purple-500/25 text-purple-400';
                return 'bg-slate-800 border-slate-700 text-slate-400';
              };

              const getCategoryBadgeClass = (src) => {
                const s = (src || '').toLowerCase();
                if (s.includes('mail') || s.includes('email')) return 'bg-blue-500/10 border-blue-500/25 text-blue-400';
                if (s.includes('chat') || s.includes('teams')) return 'bg-purple-500/10 border-purple-500/25 text-purple-400';
                if (s.includes('phone') || s.includes('call')) return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400';
                if (s.includes('meeting') || s.includes('video')) return 'bg-rose-500/10 border-rose-500/25 text-rose-400';
                return 'bg-amber-500/10 border-amber-500/25 text-amber-400';
              };

              return (
                <>
                  {/* Content Container */}
                  <div className="p-6 overflow-y-auto space-y-6 bg-dark-950 flex-1 w-full">
                    
                    {/* Header Card */}
                    <div className="bg-dark-900 border border-dark-800 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-wrap">
                        <button
                          onClick={handleCloseDetails}
                          className="flex items-center gap-1.5 cursor-pointer text-black hover:bg-dark-700 transition-colors font-bold text-base px-3.5 py-1.5 rounded-full"
                        >
                          <ChevronLeft className="w-5 h-5" />
                          <span>Back</span>
                        </button>
                        <div className="w-px h-5 bg-dark-800 hidden sm:block" />
                        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <ClipboardList className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-black text-lg">Interaction Log Details</h3>
                        </div>
                      </div>
                      <button
                        onClick={handleCloseDetails}
                        className="p-2 hover:bg-dark-700 rounded-full text-slate-500 hover:text-black cursor-pointer transition-colors"
                        title="Close"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Main Two-Column Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      
                      {/* Left Column (Metadata & Details) */}
                      <div className="lg:col-span-5 space-y-6 flex flex-col">
                        
                        {/* Log Message Card */}
                        <div className="bg-dark-900 border border-dark-800 rounded-xl p-5 shadow-sm">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-dark-800 pb-2">Interaction Log Description</h4>
                          <p className="text-sm font-semibold text-black leading-relaxed whitespace-pre-wrap mt-3">
                            {mainText}
                          </p>
                        </div>

                        {/* Associated Client & Interaction Details Card */}
                        {isInteraction && (
                          <div className="bg-dark-900 border border-dark-800 p-5 rounded-xl shadow-sm space-y-4">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-dark-800 pb-2 block">Interaction Details</h4>
                            <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                              <div>
                                <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider mb-1">Company Account</span>
                                <span className="text-xs font-extrabold text-black block truncate" title={selectedLog.companyName}>{selectedLog.companyName || 'External Account'}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider mb-1">Client Contact</span>
                                <span className="text-xs font-extrabold text-black block truncate" title={selectedLog.contactName}>{selectedLog.contactName || 'System/Unknown'}</span>
                              </div>
                              <div className="pt-2 border-t border-dark-800/40">
                                <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider mb-1">Interaction Type</span>
                                <span className={`inline-block px-3 py-1 rounded-lg border text-xs font-black uppercase tracking-wider w-fit mt-1.5 ${getCategoryBadgeClass(action)}`}>
                                  {action}
                                </span>
                              </div>
                              <div className="pt-2 border-t border-dark-800/40">
                                <span className="text-[10px] text-slate-500 block uppercase font-bold tracking-wider mb-1">Logged Date & Time</span>
                                <div className="text-xs text-black font-bold flex items-center gap-1.5 mt-2">
                                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                                  <span>{formatLoggedDateTime(selectedLog?.date, selectedLog?.time, selectedLog?.timestamp || timestamp)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Attachments Section */}
                        {selectedLog && selectedLog.attachments && selectedLog.attachments.length > 0 && (
                          <div className="bg-dark-900 border border-dark-800 rounded-xl p-5 shadow-sm space-y-3">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-dark-800 pb-2">
                              <Paperclip className="w-4 h-4 text-slate-400" /> Attachments ({selectedLog.attachments.length})
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                              {selectedLog.attachments.map((file, idx) => (
                                <div key={idx} className="relative group bg-dark-700 border border-dark-800 rounded-xl p-3 flex items-center gap-3 overflow-hidden hover:border-primary/50">
                                  <div className="shrink-0 w-12 h-12 rounded-lg bg-dark-800 border border-dark-800 flex items-center justify-center overflow-hidden">
                                    {file.type && file.type.startsWith('image/') ? (
                                      <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                                    ) : file.type && file.type.startsWith('video/') ? (
                                      <Video className="w-5 h-5 text-indigo-500" />
                                    ) : (
                                      <FileText className="w-5 h-5 text-amber-500" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold text-black truncate pr-6">{file.name}</p>
                                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                                      {file.size ? `${(file.size / 1024).toFixed(1)} KB` : '0 KB'} · {file.type ? file.type.split('/')[1]?.toUpperCase() : 'FILE'}
                                    </p>
                                  </div>
                                  <a
                                    href={file.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-dark-900 hover:bg-dark-800 border border-dark-800 rounded-lg text-slate-400 cursor-pointer"
                                    title="Open or Download file"
                                  >
                                    <Download className="w-4 h-4" />
                                  </a>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Assigned By Metadata Card */}
                        <div className="bg-dark-900 border border-dark-800 p-5 rounded-xl shadow-sm flex flex-col justify-between">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-dark-800 pb-2 block mb-3">Assigned By</h4>
                          <div className="flex items-center gap-3">
                            <div className="bg-primary/20 border border-primary/30 text-primary w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                              {userName ? userName.substring(0, 2).toUpperCase() : 'US'}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-black block text-sm truncate">{userName || 'System/SSO User'}</span>
                              <span className="text-xs text-slate-400 font-bold block mt-0.5">
                                {isInteraction ? 'Staff Member' : getUserPosition(selectedLog.userId)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Event Metadata / Category Card */}
                        {!isInteraction && (
                          <div className="bg-dark-900 border border-dark-800 p-5 rounded-xl shadow-sm flex flex-col justify-between gap-3">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-dark-800 pb-2 block">Activity Category</h4>
                            <div>
                              <span className={`inline-block px-3 py-1 rounded-lg border text-xs font-black uppercase tracking-wider ${getCategoryBadgeClass(action)}`}>
                                {action}
                              </span>
                              <div className="text-xs text-black font-bold flex items-center gap-1.5 border-t border-dark-800 pt-3 mt-3">
                                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                                <span>{formatLoggedDateTime(selectedLog?.date, selectedLog?.time, selectedLog?.timestamp || timestamp)}</span>
                              </div>
                            </div>
                          </div>
                        )}

                      </div>

                      {/* Right Column (Mapped Tasks / Assignees) */}
                      <div className="lg:col-span-7 space-y-6 flex flex-col">
                        
                        {/* Task Assignees List Card */}
                        <div className="bg-dark-900 border border-dark-800 rounded-xl p-5 shadow-sm flex-1 flex flex-col">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-dark-800 pb-2 mb-4">
                            Task Assigned To
                          </h4>
                          
                          {isInteraction && mentions.length > 0 ? (
                            <div className="space-y-4">
                              {mentions.map((mention, idx) => {
                                const isAssignee = mention.uid === user?.uid;
                                const currentStatus = taskStatuses[`${selectedLog.interactionId}-${mention.uid}`] || mention.status || 'Pending';
                                const forwardedTo = taskStatuses[`${selectedLog.interactionId}-${mention.uid}-forwardedToName`] || mention.forwardedToName;
                                const today = new Date();
                                today.setHours(0,0,0,0);
                                const taskDue = mention.dueDate ? new Date(mention.dueDate) : null;
                                if (taskDue) {
                                  taskDue.setHours(0,0,0,0);
                                }
                                const isTaskOverdue = taskDue && taskDue < today && currentStatus !== 'Completed';
                                const isStatusUnchanged = currentStatus === 'Pending' || currentStatus === 'Task Assigned';
                                const showAsOverdued = isTaskOverdue && isStatusUnchanged;

                                let displayStatus = currentStatus === 'Pending' ? 'Task Assigned' : currentStatus;
                                if (displayStatus === 'Accept/Decline') displayStatus = 'Accepted';
                                if (displayStatus === 'Accept' || displayStatus === 'In Progress') displayStatus = 'Accepted';
                                if (displayStatus === 'Decline' || displayStatus === 'Declined') displayStatus = 'Declined';
                                if (displayStatus === 'Completed/Forwarded') displayStatus = 'Completed';
                                if (showAsOverdued) {
                                  displayStatus = 'Overdued';
                                }

                                return (
                                  <div 
                                    key={`${mention.uid}-${idx}`} 
                                    className="bg-dark-700 border border-dark-800 p-4 rounded-xl shadow-sm space-y-3"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0">
                                          {mention.name ? mention.name.substring(0, 2).toUpperCase() : 'US'}
                                        </div>
                                        <div>
                                          <span className="font-bold text-black text-xs block">@{mention.name}</span>
                                        </div>
                                      </div>
                                      <span className={`inline-block px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${getStatusColorClass(displayStatus)}`}>
                                        {displayStatus === 'Forwarded' && forwardedTo ? `Forwarded to @${forwardedTo}` : displayStatus}
                                      </span>
                                    </div>
                                    
                                    {mention.task && (
                                      <p className="text-sm text-black leading-relaxed font-medium pl-1">
                                        {mention.task}
                                      </p>
                                    )}
                                    {(mention.priority || mention.dueDate) && (
                                      <div className="flex items-center gap-2 pl-1 mt-1.5 flex-wrap">
                                        {mention.priority && (
                                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                            mention.priority === 'High' ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' :
                                            mention.priority === 'Medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                                            'bg-dark-700 border-dark-800 text-black'
                                          }`}>
                                            {mention.priority === 'High' ? 'High' : mention.priority === 'Medium' ? 'Medium' : 'Low'}
                                          </span>
                                        )}
                                        {mention.dueDate && (() => {
                                          const isOverdueObj = isTaskOverdue;
                                          return (
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                              isOverdueObj 
                                                ? 'bg-rose-600 border-rose-500 text-white' 
                                                : 'bg-dark-700 border-dark-800 text-black'
                                            }`}>
                                              Due: {new Date(mention.dueDate).toLocaleDateString()} {isOverdueObj && ' (OVERDUE)'}
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    )}
                                    
                                    {isAssignee && (
                                      <div className="pt-2 border-t border-dark-800 border-dashed space-y-1.5 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Change Status:</span>
                                          <select
                                            value={displayStatus === 'Accepted' ? 'Accept' : displayStatus === 'Declined' ? 'Decline' : displayStatus}
                                            onChange={async (e) => {
                                              const st = e.target.value;
                                              if (st === 'Completed') {
                                                setCompletionModalState({ isOpen: true, task: { ...mention, interactionId: selectedLog.interactionId }, newStatus: st });
                                              } else if (st === 'Forwarded') {
                                                setForwardModalState({ isOpen: true, task: { ...mention, interactionId: selectedLog.interactionId }, newStatus: st });
                                              } else if (st === 'Decline') {
                                                setDeclineModalState({ isOpen: true, task: { ...mention, interactionId: selectedLog.interactionId } });
                                              } else if (st === 'Accept') {
                                                setAcceptModalState({ isOpen: true, task: { ...mention, interactionId: selectedLog.interactionId } });
                                              } else {
                                                const ok = await updateTaskStatus(selectedLog.interactionId, mention.uid, st);
                                                if (ok) {
                                                  fetchActivityLogs();
                                                  fetchInteractions();
                                                  setSelectedLog(prev => {
                                                    const updatedMentions = (prev.actionMentions || []).map(m =>
                                                      m.uid === mention.uid ? { ...m, status: st } : m
                                                    );
                                                    return { ...prev, actionMentions: updatedMentions };
                                                  });
                                                }
                                                updateTaskStatuses(prev => ({ ...prev, [`${selectedLog.interactionId}-${mention.uid}`]: st }));
                                              }
                                            }}
                                            className="px-2.5 py-1 rounded-lg border border-dark-800 bg-dark-750 text-xs text-black font-bold outline-none cursor-pointer focus:border-primary"
                                          >
                                            {displayStatus === 'Overdued' && <option value="Overdued">Overdued</option>}
                                            <option value="Task Assigned">Task Assigned</option>
                                            <option value="Accept">Accepted</option>
                                            <option value="Decline">Declined</option>
                                            <option value="Completed">Completed</option>
                                            <option value="Forwarded">Forwarded</option>
                                          </select>
                                        </div>
                                        {currentStatus === 'Forwarded' && forwardedTo && (
                                          <span className="text-xs text-indigo-500 font-bold">
                                            to @{forwardedTo}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-slate-400 italic text-sm my-auto">
                              No assignees mapped to this log.
                            </div>
                          )}
                        </div>

                        {/* Legacy Log Assignee */}
                        {legacyAssignee && (
                          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                            <div className="bg-amber-500/10 p-2 rounded-xl shrink-0 mt-0.5">
                              <User className="w-4 h-4 text-amber-500" />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest block">Assigned Task</span>
                              <p className="text-xs font-semibold text-black">
                                Follow-up required:
                              </p>
                              <div className="flex mt-1.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 border border-amber-500/25 text-amber-600">
                                  @{legacyAssignee}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Conversation Replies & Notes Update Band */}
                        <div className="bg-dark-900 border border-dark-800 rounded-xl p-5 shadow-sm space-y-4 flex flex-col">
                          <div className="flex items-center justify-between border-b border-dark-800 pb-3">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="w-4 h-4 text-primary" />
                              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                Replies & Notes Updates
                              </h4>
                            </div>
                            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full font-extrabold">
                              {(() => {
                                const fetched = repliesByInteraction[selectedLog.interactionId] || selectedLog.replies || [];
                                const mentionsList = selectedLog.mentions || [];
                                const extraNotes = mentionsList.reduce((acc, m) => {
                                  const nt = taskStatuses[`${selectedLog.interactionId}-${m.uid}-note`] || m.comments || m.completionNote;
                                  if (nt && !fetched.some(r => (r.text || '').includes(nt))) {
                                    acc.push({ replyId: `note-${m.uid}`, authorName: m.name || 'Staff Member', authorUid: m.uid, text: `Status Note: ${nt}`, timestamp: selectedLog.timestamp || new Date().toISOString() });
                                  }
                                  return acc;
                                }, []);
                                const total = fetched.length + extraNotes.length;
                                return `${total} ${total === 1 ? 'Reply' : 'Replies'}`;
                              })()}
                            </span>
                          </div>

                          {/* Replies Feed (repls) */}
                          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 min-h-[60px]">
                            {(() => {
                              const fetched = repliesByInteraction[selectedLog.interactionId] || selectedLog.replies || [];
                              const mentionsList = selectedLog.mentions || [];
                              const extraNotes = mentionsList.reduce((acc, m) => {
                                const nt = taskStatuses[`${selectedLog.interactionId}-${m.uid}-note`] || m.comments || m.completionNote;
                                if (nt && !fetched.some(r => (r.text || '').includes(nt))) {
                                  acc.push({ replyId: `note-${m.uid}`, authorName: m.name || 'Staff Member', authorUid: m.uid, text: `Status Note: ${nt}`, timestamp: selectedLog.timestamp || new Date().toISOString() });
                                }
                                return acc;
                              }, []);
                               const repliesList = [...fetched, ...extraNotes];
                               repliesList.sort((a, b) => {
                                 const timeA = a.timestamp ? new Date(a.timestamp) : new Date(0);
                                 const timeB = b.timestamp ? new Date(b.timestamp) : new Date(0);
                                 return timeA - timeB;
                               });
                               if (repliesList.length === 0) {
                                return (
                                  <div className="text-center py-6 text-slate-400 italic text-xs flex flex-col items-center justify-center gap-1.5">
                                    <MessageSquare className="w-6 h-6 text-slate-500 opacity-60" />
                                    <span>No follow-up replies or notes updates in this conversation yet.</span>
                                  </div>
                                );
                              }
                              return repliesList.map((reply, idx) => {
                                const isMe = reply.authorUid === user?.uid;
                                return (
                                  <div
                                    key={reply.replyId || idx}
                                    className={`p-3.5 rounded-xl border flex flex-col gap-1.5 transition-all ${
                                      isMe
                                        ? 'bg-primary/10 border-primary/20 ml-6 text-right items-end'
                                        : 'bg-dark-700/60 border-dark-800 mr-6 text-left items-start'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-500 flex items-center justify-center font-bold text-[10px]">
                                        {reply.authorName ? reply.authorName.substring(0, 2).toUpperCase() : 'US'}
                                      </div>
                                      <span className="text-xs font-bold text-black">{reply.authorName || 'Staff User'}</span>
                                      <span className="text-[10px] text-slate-400 font-medium">
                                        {reply.timestamp ? new Date(reply.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Just now'}
                                      </span>
                                    </div>
                                    <p className="text-xs font-semibold text-black leading-relaxed whitespace-pre-wrap pl-8">
                                      {reply.text}
                                    </p>
                                  </div>
                                );
                              });
                            })()}
                          </div>

                          {/* Upcoming Replying Band / Notes Update */}
                          <div className="pt-3 border-t border-dark-800">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                              Add Reply / Notes Update
                            </label>
                            <div className="flex flex-col sm:flex-row gap-2.5">
                              <textarea
                                rows={2}
                                placeholder="Type your reply, comment, or status note update here..."
                                value={cardReplyText[selectedLog.interactionId] || ''}
                                onChange={(e) => setCardReplyText(prev => ({ ...prev, [selectedLog.interactionId]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    const text = (cardReplyText[selectedLog.interactionId] || '').trim();
                                    if (!text || submittingReply[selectedLog.interactionId]) return;
                                    setSubmittingReply(prev => ({ ...prev, [selectedLog.interactionId]: true }));
                                    replyToInteraction(selectedLog.interactionId, text).then(res => {
                                      if (res) {
                                        setCardReplyText(prev => ({ ...prev, [selectedLog.interactionId]: '' }));
                                        updateTaskStatuses(prev => ({ ...prev, [`${selectedLog.interactionId}-latestReply`]: text }));
                                      }
                                      setSubmittingReply(prev => ({ ...prev, [selectedLog.interactionId]: false }));
                                    });
                                  }
                                }}
                                className="flex-1 bg-dark-750 border border-dark-800 rounded-xl p-3 text-xs text-black font-semibold outline-none focus:border-primary placeholder-slate-400 resize-none transition-colors"
                              />
                              <button
                                type="button"
                                disabled={!(cardReplyText[selectedLog.interactionId] || '').trim() || submittingReply[selectedLog.interactionId]}
                                onClick={async () => {
                                  const text = (cardReplyText[selectedLog.interactionId] || '').trim();
                                  if (!text || submittingReply[selectedLog.interactionId]) return;
                                  setSubmittingReply(prev => ({ ...prev, [selectedLog.interactionId]: true }));
                                  const res = await replyToInteraction(selectedLog.interactionId, text);
                                  if (res) {
                                    setCardReplyText(prev => ({ ...prev, [selectedLog.interactionId]: '' }));
                                    updateTaskStatuses(prev => ({ ...prev, [`${selectedLog.interactionId}-latestReply`]: text }));
                                  }
                                  setSubmittingReply(prev => ({ ...prev, [selectedLog.interactionId]: false }));
                                }}
                                className="px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:hover:bg-primary text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 self-end sm:self-stretch shadow-md"
                              >
                                {submittingReply[selectedLog.interactionId] ? (
                                  <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    <span>Sending...</span>
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-4 h-4" />
                                    <span>Send Reply</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <span className="text-[10px] text-slate-400 italic mt-1.5 block">
                              Press Shift + Enter for new line, Enter or click Send Reply to submit follow-up note.
                            </span>
                          </div>
                        </div>

                      </div>

                    </div>
                  </div>


                </>
              );
            })()}
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
                const ok = await updateTaskStatus(task.interactionId, task.uid, 'Accept');
                if (ok) {
                  if (acceptNote.trim()) {
                    await replyToInteraction(task.interactionId, `Acceptance Note: ${acceptNote}`);
                  }
                  fetchInteractions();
                }
                updateTaskStatuses(prev => ({ ...prev, [`${task.interactionId}-${task.uid}`]: 'Accept', [`${task.interactionId}-${task.uid}-note`]: acceptNote.trim() }));
                if (selectedLog && selectedLog.interactionId === task.interactionId) {
                  setSelectedLog(prev => {
                    const updatedMentions = (prev.actionMentions || []).map(m =>
                      m.uid === task.uid ? { ...m, status: 'Accept' } : m
                    );
                    return { ...prev, actionMentions: updatedMentions };
                  });
                }
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
              updateTaskStatuses(prev => ({ ...prev, [`${task.interactionId}-${task.uid}`]: newStatus, [`${task.interactionId}-${task.uid}-note`]: completionNote.trim() }));
              // Update details panel selectedLog state as well
              if (selectedLog && selectedLog.interactionId === task.interactionId) {
                setSelectedLog(prev => {
                  const updatedMentions = (prev.actionMentions || []).map(m =>
                    m.uid === task.uid ? { ...m, status: newStatus } : m
                  );
                  return { ...prev, actionMentions: updatedMentions };
                });
              }
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
                const ok = await updateTaskStatus(task.interactionId, task.uid, 'Decline');
                if (ok) {
                  if (declineReason.trim()) {
                    await replyToInteraction(task.interactionId, `Decline Reason: ${declineReason}`);
                  }
                  fetchInteractions();
                }
                updateTaskStatuses(prev => ({ ...prev, [`${task.interactionId}-${task.uid}`]: 'Decline', [`${task.interactionId}-${task.uid}-note`]: declineReason.trim() }));
                if (selectedLog && selectedLog.interactionId === task.interactionId) {
                  setSelectedLog(prev => {
                    const updatedMentions = (prev.actionMentions || []).map(m =>
                      m.uid === task.uid ? { ...m, status: 'Decline' } : m
                    );
                    return { ...prev, actionMentions: updatedMentions };
                  });
                }
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

      {/* Floating Task Description Tooltip */}
      {hoveredTaskTooltip && (
        <div 
          style={{
            position: 'fixed',
            left: `${hoveredTaskTooltip.x}px`,
            top: `${hoveredTaskTooltip.y}px`,
            transform: hoveredTaskTooltip.showBelow ? 'translate(-50%, 0) translateY(8px)' : 'translate(-50%, -100%) translateY(-8px)',
            zIndex: 9999
          }}
          className="w-80 p-4 bg-slate-900/95 border border-slate-700/80 text-slate-200 text-xs rounded-xl shadow-2xl backdrop-blur-md pointer-events-none"
        >
          <div className="space-y-3">
            <div>
              <div className="font-bold text-slate-400 mb-1 flex items-center gap-1.5 border-b border-slate-800/60 pb-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Interaction Log Description</span>
              </div>
              <div className="leading-relaxed whitespace-pre-wrap font-medium text-slate-300">
                {hoveredTaskTooltip.text}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
