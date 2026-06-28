import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  ClipboardList, Search, RefreshCw, ChevronLeft, ChevronRight, User, ShieldAlert, X, Eye,
  Plus, CheckSquare, Building2, Users, Send, Mail, Video, Phone, MessageSquare, Calendar,
  Paperclip, FileText, Download
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
    staffList,
    fetchStaff,
    interactions,
    fetchInteractions,
    updateTaskStatus,
    replyToInteraction
  } = useStore();
  
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all-tasks'); // 'all-tasks' | 'my-tasks'
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState(null);
  const itemsPerPage = 10;

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
      fetchActivityLogs();
      fetchInteractions();
    }
    setTaskStatuses(prev => ({ 
      ...prev, 
      [`${task.interactionId}-${task.uid}`]: newStatus,
      [`${task.interactionId}-${task.uid}-forwardedToName`]: selectedUser.name 
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

  // Helper to lookup user position instead of showing raw UID
  const getUserPosition = (userId) => {
    const staff = staffList.find(s => s.uid === userId);
    if (staff && staff.position) return staff.position;
    if (userId === 'mock-admin-uid') return 'System Administrator';
    if (userId === 'mock-employee-uid') return 'Account Owner';
    return 'Platform Member';
  };





  // Extract all task assignments from interactions
  const realTasks = [];
  interactions.forEach(item => {
    if (Array.isArray(item.actionMentions) && item.actionMentions.length > 0) {
      item.actionMentions.forEach(mention => {
        realTasks.push({
          ...mention,
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


  const currentUserStaff = staffList.find(s => s.uid === user?.uid);
  const isTrueAdmin = currentUserStaff
    ? (currentUserStaff.role === 'Admin' || currentUserStaff.position?.toLowerCase().includes('admin'))
    : false;
  const isTrueCeo = currentUserStaff
    ? (currentUserStaff.position === 'CEO' || currentUserStaff.position === 'Chief Executive Officer')
    : false;

  const showAllTasks = isTrueAdmin || isTrueCeo;

  // Use only real tasks from interactions (no dummy fallback)
  // If user is Admin or CEO, show all tasks. Otherwise, show only tasks assigned BY them.
  const allTasks = showAllTasks
    ? realTasks
    : realTasks.filter(task => task.loggedByUid === user?.uid);

  // Filter tasks based on search
  const filteredTasks = allTasks.filter(task => {
    const query = search.toLowerCase();
    const taskText = task.task || task.originalInteraction?.messageText || task.originalInteraction?.subject || '';
    return (
      (task.name && task.name.toLowerCase().includes(query)) ||
      (taskText.toLowerCase().includes(query)) ||
      (task.companyName && task.companyName.toLowerCase().includes(query)) ||
      (task.loggedByName && task.loggedByName.toLowerCase().includes(query))
    );
  });

  // Filter tasks assigned to current user only — no dummy fallback
  // MUST filter from realTasks, not from allTasks, so non-Admin/non-CEO users see all tasks assigned to them
  const realMyTasks = realTasks.filter(task => task.uid === user?.uid);
  const filteredMyTasks = realMyTasks.filter(task => {
    const query = search.toLowerCase();
    const taskText = task.task || task.originalInteraction?.messageText || task.originalInteraction?.subject || '';
    return (
      (task.name && task.name.toLowerCase().includes(query)) ||
      (taskText.toLowerCase().includes(query)) ||
      (task.companyName && task.companyName.toLowerCase().includes(query)) ||
      (task.loggedByName && task.loggedByName.toLowerCase().includes(query))
    );
  });


  // Unified items display based on activeTab
  let displayItems = [];
  if (activeTab === 'all-tasks') {
    displayItems = filteredTasks;
  } else if (activeTab === 'my-tasks') {
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
    <div className="space-y-5">
      {/* Header Block */}
      <div className="glass p-5 rounded-2xl border border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-white">
            <ClipboardList className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold text-white">Task Management</h1>
          </div>
          <p className="text-xs text-slate-400">
            Real-time monitoring and updates for assigned tasks.
          </p>
        </div>
        <button
          onClick={() => navigate('/log-activity')}
          className="bg-primary hover:bg-blue-600 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 text-white transition-all cursor-pointer shadow-lg shadow-primary/25"
        >
          <Plus className="w-4 h-4 text-white" />
          Log Activity
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-1">

        <button
          onClick={() => { setActiveTab('all-tasks'); setCurrentPage(1); }}
          className={`px-5 py-3 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
            activeTab === 'all-tasks'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-400 hover:text-black'
          }`}
        >
          All Assigned Tasks
        </button>
        <button
          onClick={() => { setActiveTab('my-tasks'); setCurrentPage(1); }}
          className={`px-5 py-3 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
            activeTab === 'my-tasks'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-400 hover:text-black'
          }`}
        >
          Tasks Assigned to Me
        </button>
      </div>

      {/* Filters and Search Panel */}
      <div className="glass p-4 rounded-xl border border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Search */}
        <div className="relative md:col-span-2">
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



        {/* Counter */}
        <div className="flex items-center justify-end text-xs font-semibold text-slate-450 pr-2">
          Showing {totalItems} task assignment{totalItems !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Logs Table Area */}
      <div className="glass rounded-xl border border-slate-800/80 overflow-hidden">
        {paginatedItems.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
            <User className="w-8 h-8 text-slate-400" />
            <span className="font-semibold">No records found matching the filter criteria.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-dark-900/60 border-b border-slate-800/60 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="p-4 w-40">Date & Time</th>
                  <th className="p-4 w-44">Account / Company</th>
                  {activeTab !== 'my-tasks' && <th className="p-4 w-40">Assigned To</th>}
                  <th className="p-4">Task Description</th>
                  <th className="p-4 w-40">Assigned By</th>
                  <th className="p-4 w-44">Status</th>
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
                      className="hover:bg-slate-800/10 cursor-pointer transition-colors"
                    >
                      <td className="p-4 text-slate-450 font-medium whitespace-nowrap">
                        {new Date(task.timestamp).toLocaleString([], {
                          dateStyle: 'short',
                          timeStyle: 'short'
                        })}
                      </td>
                      <td className="p-4">
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/accounts/${task.accountId}`);
                          }}
                          className="font-bold text-slate-200 hover:underline hover:text-primary cursor-pointer transition-colors"
                        >
                          {task.companyName}
                        </div>
                        <div className="text-xs text-slate-400 truncate max-w-[155px] font-medium">{task.originalInteraction.subject || 'No Subject'}</div>
                      </td>
                      {activeTab !== 'my-tasks' && (
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="bg-primary/10 border border-primary/20 text-primary w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs shrink-0">
                              {task.name ? task.name.substring(0, 2).toUpperCase() : 'US'}
                            </div>
                            <span className="font-bold text-slate-200 truncate block max-w-[120px]">{task.name}</span>
                          </div>
                        </td>
                      )}
                      <td className="p-4 text-slate-350 leading-relaxed font-semibold max-w-xs break-words">
                        <div>{task.task || task.originalInteraction.messageText || task.originalInteraction.subject || 'Task Assignment'}</div>
                        {(task.priority || task.dueDate) && (
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            {task.priority && (
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                                task.priority === 'High' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                                task.priority === 'Medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                'bg-slate-800 border-slate-700 text-slate-450'
                              }`}>
                                {task.priority === 'High' ? '🔥 High' : task.priority === 'Medium' ? '⚡ Medium' : 'Low'}
                              </span>
                            )}
                            {task.dueDate && (() => {
                              const isOverdueObj = isTaskOverdue;
                              return (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                                  isOverdueObj 
                                    ? 'bg-rose-600 border-rose-500 text-white animate-pulse' 
                                    : 'bg-slate-800 border-slate-700 text-slate-300'
                                }`}>
                                  📅 Due: {new Date(task.dueDate).toLocaleDateString()} {isOverdueObj && ' (OVERDUE)'}
                                </span>
                              );
                            })()}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-slate-450 font-semibold whitespace-nowrap">
                        {task.loggedByName}
                      </td>
                      <td className="p-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const showButtons = activeTab === 'my-tasks';
                          let displayStatus = currentStatus === 'Pending' ? 'Task Assigned' : currentStatus;
                          if (displayStatus === 'Accept/Decline') displayStatus = 'Accept';
                          if (displayStatus === 'Completed/Forwarded') displayStatus = 'Completed';
                          if (showAsOverdued) {
                            displayStatus = 'Overdued';
                          }
                          const forwardedTo = taskStatuses[`${task.interactionId}-${task.uid}-forwardedToName`] || task.forwardedToName;
                          if (showButtons) {
                            return (
                              <div className="flex flex-col gap-1">
                                <select 
                                  value={displayStatus}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    const st = e.target.value;
                                    if (st === 'Completed') {
                                      setCompletionModalState({ isOpen: true, task, newStatus: st });
                                    } else if (st === 'Forwarded') {
                                      setForwardModalState({ isOpen: true, task, newStatus: st });
                                    } else {
                                      updateTaskStatus(task.interactionId, task.uid, st).then(ok => { if (ok) fetchInteractions(); });
                                      setTaskStatuses(prev => ({ ...prev, [`${task.interactionId}-${task.uid}`]: st }));
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-2 py-1 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 font-bold outline-none cursor-pointer focus:border-indigo-500 w-fit"
                                >
                                  {displayStatus === 'Overdued' && <option value="Overdued">Overdued</option>}
                                  <option value="Task Assigned">Task Assigned</option>
                                  <option value="Accept">Accept</option>
                                  <option value="Decline">Decline</option>
                                  <option value="Completed">Completed</option>
                                  <option value="Forwarded">Forwarded</option>
                                </select>
                                {displayStatus === 'Forwarded' && forwardedTo && (
                                  <span className="text-xs text-indigo-400 font-bold">
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
                                displayStatus.toLowerCase() === 'accept' ? 'bg-amber-500/10 border-amber-500/20 text-amber-600' :
                                displayStatus.toLowerCase() === 'decline' ? 'bg-rose-500/10 border-rose-500/20 text-rose-600' :
                                displayStatus.toLowerCase() === 'overdued' || displayStatus.toLowerCase() === 'overdue' ? 'bg-rose-500/10 border-rose-500/20 text-rose-600' :
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="glass w-full max-w-xl rounded-2xl border border-slate-800/80 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-up">
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
                if (s.includes('overdued') || s.includes('overdue')) return 'bg-rose-500/10 border-rose-500/25 text-rose-400';
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
                  {/* Header */}
                  <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between bg-dark-900/40">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <ClipboardList className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-sm">Activity Details</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Review the system logs and task assignments</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedLog(null)}
                      className="p-1.5 hover:bg-slate-800/50 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="p-6 overflow-y-auto space-y-5 bg-dark-950/20">
                    {/* Hero Message Box */}
                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 shadow-inner space-y-2.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Log Message</span>
                      <p className="text-xs font-semibold text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                        {mainText}
                      </p>
                    </div>

                    {/* Attachments Section */}
                    {selectedLog && selectedLog.attachments && selectedLog.attachments.length > 0 && (
                      <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 shadow-inner space-y-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block flex items-center gap-1.5">
                          <Paperclip className="w-3.5 h-3.5 text-slate-400" /> Attachments ({selectedLog.attachments.length})
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                          {selectedLog.attachments.map((file, idx) => (
                            <div key={idx} className="relative group bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 flex items-center gap-3 overflow-hidden hover:border-primary/50 transition-all duration-200">
                              <div className="shrink-0 w-12 h-12 rounded-lg bg-dark-800 border border-slate-800/80 flex items-center justify-center overflow-hidden">
                                {file.type && file.type.startsWith('image/') ? (
                                  <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                                ) : file.type && file.type.startsWith('video/') ? (
                                  <Video className="w-5 h-5 text-indigo-500" />
                                ) : (
                                  <FileText className="w-5 h-5 text-amber-500" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-slate-200 truncate pr-6">{file.name}</p>
                                <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                                  {file.size ? `${(file.size / 1024).toFixed(1)} KB` : '0 KB'} · {file.type ? file.type.split('/')[1]?.toUpperCase() : 'FILE'}
                                </p>
                              </div>
                              <a
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
                                title="Open or Download file"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Meta Info Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Logged By User Card */}
                      <div className="bg-slate-900/40 border border-slate-800/60 p-4 rounded-2xl shadow-inner flex flex-col justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Assigned By</span>
                        <div className="flex items-center gap-3 mt-3">
                          <div className="bg-primary/20 border border-primary/30 text-primary w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                            {userName ? userName.substring(0, 2).toUpperCase() : 'US'}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-slate-200 block text-xs truncate">{userName || 'System/SSO User'}</span>
                            <span className="text-[10px] text-slate-500 font-bold block mt-0.5">
                              {isInteraction ? 'Staff Member' : getUserPosition(selectedLog.userId)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Event Metadata Card */}
                      <div className="bg-slate-900/40 border border-slate-800/60 p-4 rounded-2xl shadow-inner flex flex-col justify-between gap-3">
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Activity Category</span>
                          <div className="mt-2.5">
                            <span className={`inline-block px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${getCategoryBadgeClass(action)}`}>
                              {action}
                            </span>
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-500 font-bold flex items-center gap-1.5 border-t border-slate-800/50 pt-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>{new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        </div>
                      </div>
                    </div>

                    {/* Mentions / Sub-tasks List */}
                    {isInteraction && mentions.length > 0 && (
                      <div className="space-y-2.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Assigned To ({mentions.length})</span>
                        <div className="space-y-2.5">
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
                            if (displayStatus === 'Accept/Decline') displayStatus = 'Accept';
                            if (displayStatus === 'Completed/Forwarded') displayStatus = 'Completed';
                            if (showAsOverdued) {
                              displayStatus = 'Overdued';
                            }
                            
                            return (
                              <div 
                                key={`${mention.uid}-${idx}`} 
                                className="bg-slate-900/40 border border-slate-800/60 p-4 rounded-2xl shadow-inner space-y-3"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0">
                                      {mention.name ? mention.name.substring(0, 2).toUpperCase() : 'US'}
                                    </div>
                                    <div>
                                      <span className="font-bold text-slate-205 text-xs block">@{mention.name}</span>
                                      <span className="text-[10px] text-slate-500 font-bold block">Task Assignee</span>
                                    </div>
                                  </div>
                                  <span className={`inline-block px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${getStatusColorClass(displayStatus)}`}>
                                    {displayStatus === 'Forwarded' && forwardedTo ? `Forwarded to @${forwardedTo}` : displayStatus}
                                  </span>
                                </div>
                                
                                <p className="text-xs text-slate-300 leading-relaxed font-semibold pl-1">
                                  {mention.task || selectedLog.messageText || selectedLog.subject || 'Task Assignment'}
                                </p>
                                {(mention.priority || mention.dueDate) && (
                                  <div className="flex items-center gap-2 pl-1 mt-1.5 flex-wrap">
                                    {mention.priority && (
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                        mention.priority === 'High' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                                        mention.priority === 'Medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                        'bg-slate-800 border-slate-700 text-slate-450'
                                      }`}>
                                        {mention.priority === 'High' ? '🔥 High' : mention.priority === 'Medium' ? '⚡ Medium' : 'Low'}
                                      </span>
                                    )}
                                    {mention.dueDate && (() => {
                                      const isOverdueObj = isTaskOverdue;
                                      return (
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                          isOverdueObj 
                                            ? 'bg-rose-600 border-rose-500 text-white animate-pulse' 
                                            : 'bg-slate-800 border-slate-700 text-slate-300'
                                        }`}>
                                          📅 Due: {new Date(mention.dueDate).toLocaleDateString()} {isOverdueObj && ' (OVERDUE)'}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                )}
                                
                                {isAssignee && (
                                  <div className="pt-2 border-t border-slate-800/40 border-dashed space-y-1.5 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Change Status:</span>
                                      <select
                                        value={displayStatus}
                                        onChange={async (e) => {
                                          const st = e.target.value;
                                          if (st === 'Completed') {
                                            setCompletionModalState({ isOpen: true, task: { ...mention, interactionId: selectedLog.interactionId }, newStatus: st });
                                          } else if (st === 'Forwarded') {
                                            setForwardModalState({ isOpen: true, task: { ...mention, interactionId: selectedLog.interactionId }, newStatus: st });
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
                                            setTaskStatuses(prev => ({ ...prev, [`${selectedLog.interactionId}-${mention.uid}`]: st }));
                                          }
                                        }}
                                        className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 font-bold outline-none cursor-pointer focus:border-primary"
                                      >
                                        {displayStatus === 'Overdued' && <option value="Overdued">Overdued</option>}
                                        <option value="Task Assigned">Task Assigned</option>
                                        <option value="Accept">Accept</option>
                                        <option value="Decline">Decline</option>
                                        <option value="Completed">Completed</option>
                                        <option value="Forwarded">Forwarded</option>
                                      </select>
                                    </div>
                                    {currentStatus === 'Forwarded' && forwardedTo && (
                                      <span className="text-xs text-indigo-400 font-bold">
                                        to @{forwardedTo}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Legacy Log Assignee */}
                    {legacyAssignee && (
                      <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-4 flex items-start gap-3">
                        <div className="bg-amber-500/10 p-2 rounded-xl shrink-0 mt-0.5">
                          <User className="w-4 h-4 text-amber-500" />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest block">Assigned Task</span>
                          <p className="text-xs font-semibold text-slate-300">
                            Follow-up required:
                          </p>
                          <div className="flex mt-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 border border-amber-500/25 text-amber-400">
                              @{legacyAssignee}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-6 py-4 border-t border-slate-800/85 flex justify-end bg-dark-900/40">
                    <button
                      onClick={() => setSelectedLog(null)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-205 hover:text-white px-6 py-2.5 rounded-xl text-xs font-bold border border-slate-750 transition-all cursor-pointer shadow-md active:scale-98"
                    >
                      Close Details
                    </button>
                  </div>
                </>
              );
            })()}
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

