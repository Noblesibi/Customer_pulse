import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  ClipboardList, Search, RefreshCw, X, Eye, Plus, CheckSquare, 
  Send, ShieldAlert, Check, Ban, HelpCircle, ChevronLeft, Calendar, ThumbsUp, MessageSquare, ExternalLink
} from 'lucide-react';
import { useStore } from '../store/index.js';

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

export default function StaffTasks() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    fetchStaff,
    staffList,
    staffTasks,
    staffTasksLoading,
    fetchStaffTasks,
    updateStaffTaskStatus,
    fetchStaffTaskReplies,
    addStaffTaskReply,
    interactions,
    fetchInteractions,
    updateTaskStatus,
    replyToInteraction,
    fetchReplies
  } = useStore();

  const currentUserStaff = (staffList || []).find(s => s.uid === user?.uid);
  const isTrueAdmin = currentUserStaff
    ? (currentUserStaff.role === 'Admin' || currentUserStaff.position?.toLowerCase().includes('admin'))
    : false;
  const isTrueCeo = currentUserStaff
    ? (currentUserStaff.position === 'CEO' || currentUserStaff.position === 'Chief Executive Officer')
    : false;
  const showAllTasks = isTrueAdmin || isTrueCeo;

  const [activeTab, setActiveTab] = useState('all-tasks');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');

  useEffect(() => {
    if (staffList.length > 0) {
      if (!showAllTasks && activeTab === 'all-tasks') {
        setActiveTab('created-by-me');
      }
    }
  }, [showAllTasks, activeTab, staffList]);

  // Selected Task Drawer State
  const [selectedTask, setSelectedTask] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [replies, setReplies] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [repliesLoading, setRepliesLoading] = useState(false);

  // Completion Dialog State
  const [isCompletionDialogOpen, setIsCompletionDialogOpen] = useState(false);
  const [completionTaskId, setCompletionTaskId] = useState(null);
  const [completionNote, setCompletionNote] = useState('');

  // Accept Modal State
  const [acceptModalState, setAcceptModalState] = useState({ isOpen: false, task: null });
  const [acceptNote, setAcceptNote] = useState('');

  // Decline Modal State
  const [declineModalState, setDeclineModalState] = useState({ isOpen: false, task: null });
  const [declineReason, setDeclineReason] = useState('');

  // Forward Modal State
  const [forwardModalState, setForwardModalState] = useState({ isOpen: false, task: null });
  const [forwardToUid, setForwardToUid] = useState('');
  const [forwardReason, setForwardReason] = useState('');

  // Load staff list & tasks
  useEffect(() => {
    fetchStaff();
    fetchStaffTasks(activeTab);
    fetchInteractions();
  }, [activeTab]);

  // Auto-open task drawer if taskId is passed via navigation state
  useEffect(() => {
    if (location.state?.selectedTaskId && allTasksCombined.length > 0) {
      const match = allTasksCombined.find(t => t.taskId === location.state.selectedTaskId);
      if (match) {
        handleOpenDrawer(match);
        // Clear state to prevent reopening on re-renders
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state?.selectedTaskId, staffTasks, interactions]);

  const handleRefresh = () => {
    fetchStaffTasks(activeTab);
    fetchInteractions();
    if (selectedTask) {
      handleOpenDrawer(selectedTask);
    }
  };

  const handleOpenDrawer = async (task) => {
    // Interaction-linked tasks → go to Interaction Log page with that log pre-selected
    if (task.isInteractionTask) {
      navigate('/interaction-log', {
        state: { 
          selectedInteractionId: task.originalInteraction.interactionId,
          from: '/staff-tasks'
        }
      });
      return;
    }

    // Standalone staff tasks → open local details drawer
    setSelectedTask(task);
    setIsDrawerOpen(true);
    setRepliesLoading(true);
    try {
      const taskReplies = await fetchStaffTaskReplies(task.taskId);
      setReplies(taskReplies);
    } catch (err) {
      console.error(err);
    } finally {
      setRepliesLoading(false);
    }
  };

  const handlePostReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTask) return;
    try {
      if (selectedTask.isInteractionTask) {
        const newReply = await replyToInteraction(selectedTask.originalInteraction.interactionId, replyText.trim());
        if (newReply) {
          setReplies(prev => [...prev, newReply]);
          setReplyText('');
        }
      } else {
        const newReply = await addStaffTaskReply(selectedTask.taskId, replyText.trim());
        if (newReply) {
          setReplies(prev => [...prev, newReply]);
          setReplyText('');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (task, newStatus) => {
    const taskId = task.taskId;
    if (newStatus === 'Completed') {
      setCompletionTaskId(taskId);
      setCompletionNote('');
      setIsCompletionDialogOpen(true);
    } else if (newStatus === 'Accept') {
      setAcceptModalState({ isOpen: true, task });
      setAcceptNote('');
    } else if (newStatus === 'Decline') {
      setDeclineModalState({ isOpen: true, task });
      setDeclineReason('');
    } else if (newStatus === 'Forwarded') {
      setForwardModalState({ isOpen: true, task });
      setForwardToUid('');
      setForwardReason('');
    } else {
      if (task.isInteractionTask) {
        const ok = await updateTaskStatus(task.originalInteraction.interactionId, task.uid, newStatus);
        if (ok) {
          fetchInteractions();
          if (selectedTask && selectedTask.taskId === taskId) {
            setSelectedTask(prev => ({ ...prev, status: newStatus }));
          }
        }
      } else {
        const ok = await updateStaffTaskStatus(taskId, newStatus);
        if (ok) {
          fetchStaffTasks(activeTab);
          if (selectedTask && selectedTask.taskId === taskId) {
            setSelectedTask(prev => ({ ...prev, status: newStatus }));
          }
        }
      }
    }
  };

  const submitCompletion = async (e) => {
    if (e) e.preventDefault();
    if (!completionTaskId) return;
    const task = selectedTask;
    if (!task) return;
    if (task.isInteractionTask) {
      const ok = await updateTaskStatus(
        task.originalInteraction.interactionId,
        task.uid,
        'Completed',
        completionNote.trim(),
        `Task Completion Note: ${completionNote.trim()}`
      );
      if (ok) {
        setIsCompletionDialogOpen(false);
        setCompletionTaskId(null);
        setCompletionNote('');
        fetchInteractions();
        if (selectedTask && selectedTask.taskId === completionTaskId) {
          setSelectedTask(prev => ({ ...prev, status: 'Completed', completionNote: completionNote.trim() }));
          const updatedReplies = await fetchReplies(task.originalInteraction.interactionId);
          setReplies(updatedReplies || []);
        }
      }
    } else {
      const ok = await updateStaffTaskStatus(
        completionTaskId, 
        'Completed', 
        completionNote.trim(), 
        `Task Completion Note: ${completionNote.trim()}`
      );
      if (ok) {
        setIsCompletionDialogOpen(false);
        setCompletionTaskId(null);
        setCompletionNote('');
        fetchStaffTasks(activeTab);
        if (selectedTask && selectedTask.taskId === completionTaskId) {
          setSelectedTask(prev => ({ ...prev, status: 'Completed', completionNote: completionNote.trim() }));
          const updatedReplies = await fetchStaffTaskReplies(completionTaskId);
          setReplies(updatedReplies);
        }
      }
    }
  };

  const submitAccept = async (e) => {
    e.preventDefault();
    const { task } = acceptModalState;
    if (!task) return;
    if (task.isInteractionTask) {
      const ok = await updateTaskStatus(
        task.originalInteraction.interactionId,
        task.uid,
        'Accept',
        '',
        acceptNote.trim() ? `Acceptance Note: ${acceptNote.trim()}` : 'Accepted Task'
      );
      if (ok) {
        fetchInteractions();
        if (selectedTask && selectedTask.taskId === task.taskId) {
          setSelectedTask(prev => ({ ...prev, status: 'Accept' }));
          const updatedReplies = await fetchReplies(task.originalInteraction.interactionId);
          setReplies(updatedReplies || []);
        }
        setAcceptModalState({ isOpen: false, task: null });
        setAcceptNote('');
      }
    } else {
      const ok = await updateStaffTaskStatus(
        task.taskId, 
        'Accept', 
        '', 
        acceptNote.trim() ? `Acceptance Note: ${acceptNote.trim()}` : 'Accepted Task'
      );
      if (ok) {
        fetchStaffTasks(activeTab);
        if (selectedTask && selectedTask.taskId === task.taskId) {
          setSelectedTask(prev => ({ ...prev, status: 'Accept' }));
          const updatedReplies = await fetchStaffTaskReplies(task.taskId);
          setReplies(updatedReplies);
        }
        setAcceptModalState({ isOpen: false, task: null });
        setAcceptNote('');
      }
    }
  };

  const submitDecline = async (e) => {
    e.preventDefault();
    const { task } = declineModalState;
    if (!task) return;
    if (task.isInteractionTask) {
      const ok = await updateTaskStatus(
        task.originalInteraction.interactionId,
        task.uid,
        'Decline',
        '',
        `Decline Reason: ${declineReason.trim()}`
      );
      if (ok) {
        fetchInteractions();
        if (selectedTask && selectedTask.taskId === task.taskId) {
          setSelectedTask(prev => ({ ...prev, status: 'Decline' }));
          const updatedReplies = await fetchReplies(task.originalInteraction.interactionId);
          setReplies(updatedReplies || []);
        }
        setDeclineModalState({ isOpen: false, task: null });
        setDeclineReason('');
      }
    } else {
      const ok = await updateStaffTaskStatus(
        task.taskId, 
        'Decline', 
        '', 
        `Decline Reason: ${declineReason.trim()}`
      );
      if (ok) {
        fetchStaffTasks(activeTab);
        if (selectedTask && selectedTask.taskId === task.taskId) {
          setSelectedTask(prev => ({ ...prev, status: 'Decline' }));
          const updatedReplies = await fetchStaffTaskReplies(task.taskId);
          setReplies(updatedReplies);
        }
        setDeclineModalState({ isOpen: false, task: null });
        setDeclineReason('');
      }
    }
  };

  const submitForward = async (e) => {
    e.preventDefault();
    const { task } = forwardModalState;
    if (!task || !forwardToUid) return;
    const targetUser = (staffList || []).find(s => s.uid === forwardToUid);
    if (!targetUser) return;
    
    if (task.isInteractionTask) {
      const ok = await updateTaskStatus(
        task.originalInteraction.interactionId,
        task.uid,
        'Forwarded',
        '',
        forwardReason.trim() ? `Forwarded Task Note: ${forwardReason.trim()}` : '',
        targetUser.uid,
        targetUser.name
      );
      if (ok) {
        fetchInteractions();
        if (selectedTask && selectedTask.taskId === task.taskId) {
          setSelectedTask(null);
          setIsDrawerOpen(false);
        }
        setForwardModalState({ isOpen: false, task: null });
        setForwardToUid('');
        setForwardReason('');
      }
    } else {
      const ok = await updateStaffTaskStatus(
        task.taskId, 
        'Forwarded', 
        '', 
        forwardReason.trim() ? `Forwarded Task Note: ${forwardReason.trim()}` : '', 
        targetUser.uid, 
        targetUser.name
      );
      if (ok) {
        fetchStaffTasks(activeTab);
        if (selectedTask && selectedTask.taskId === task.taskId) {
          setSelectedTask(null);
          setIsDrawerOpen(false);
        }
        setForwardModalState({ isOpen: false, task: null });
        setForwardToUid('');
        setForwardReason('');
      }
    }
  };

  // Extract all task assignments from interactions
  const parsedInteractionTasks = [];
  (interactions || []).forEach(item => {
    if (Array.isArray(item.actionMentions) && item.actionMentions.length > 0) {
      item.actionMentions.forEach(mention => {
        const taskDesc = mention.task || item.messageText || item.subject || 'Task Assignment';
        const fallbackHeader = taskDesc.split(/[.!?\n]/)[0].trim();
        const cleanHeader = fallbackHeader.length <= 50 ? fallbackHeader : (fallbackHeader.slice(0, 47) + '...');
        parsedInteractionTasks.push({
          ...mention,
          taskId: mention.taskId || `${item.interactionId}-${mention.uid}`,
          title: mention.taskHeader || cleanHeader,
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
          contactName: item.contactName || '',
          timestamp: item.timestamp,
          originalInteraction: item,
          isInteractionTask: true
        });
      });
    }
  });

  const allTasksCombined = [...(staffTasks || []), ...parsedInteractionTasks];

  // Filter the combined list based on activeTab
  const tabFilteredTasks = allTasksCombined.filter(t => {
    if (activeTab === 'assigned-to-me') {
      return t.assignedToUid === user?.uid;
    }
    if (activeTab === 'created-by-me') {
      return t.assignedByUid === user?.uid;
    }
    return true; // 'all-tasks'
  });

  // Filter tasks in memory for search, priority, status
  const filteredTasks = tabFilteredTasks.filter(task => {
    const matchesSearch = 
      (task.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (task.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (task.companyName || '').toLowerCase().includes(search.toLowerCase()) ||
      (task.assignedToName || '').toLowerCase().includes(search.toLowerCase()) ||
      (task.assignedByName || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = (() => {
      if (statusFilter === 'All') return true;
      const f = statusFilter.toLowerCase();
      const s = (task.status || 'Pending').toLowerCase();
      if (f === 'task assigned' || f === 'pending') {
        return s === 'task assigned' || s === 'pending';
      }
      if (f === 'accept' || f === 'in progress') {
        return s === 'accept' || s === 'in progress';
      }
      if (f === 'decline' || f === 'declined') {
        return s === 'decline' || s === 'declined';
      }
      return s === f;
    })();
    const matchesPriority = priorityFilter === 'All' || task.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const getTaskTime = (task) => {
    if (task.timestamp) return new Date(task.timestamp);
    if (task.createdAt) return new Date(task.createdAt);
    if (task.date && task.time) return new Date(`${task.date}T${task.time}:00`);
    return new Date(0);
  };

  const sortedTasks = [...filteredTasks].sort((a, b) => getTaskTime(b) - getTaskTime(a));

  return (
    <div className="p-4 md:p-5 space-y-3.5 flex flex-col h-auto md:h-[calc(100vh-7rem)] min-h-0 relative select-none">
      
      {/* Header Block */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-black">Tasks</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/staff-tasks/new')}
            className="bg-primary hover:bg-blue-600 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 text-white transition-all cursor-pointer shadow-lg shadow-primary/25"
          >
            <Plus className="w-4 h-4 text-white" />
            Assign Task
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-2">
        {showAllTasks && (
          <button
            onClick={() => setActiveTab('all-tasks')}
            className={`px-5 py-3 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
              activeTab === 'all-tasks'
                ? 'border-primary text-primary'
                : 'border-transparent text-slate-500 hover:text-primary'
            }`}
          >
            All Tasks
          </button>
        )}
        <button
          onClick={() => setActiveTab('created-by-me')}
          className={`px-5 py-3 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
            activeTab === 'created-by-me'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-primary'
          }`}
        >
          Tasks Assigned by Me
        </button>
        <button
          onClick={() => setActiveTab('assigned-to-me')}
          className={`px-5 py-3 text-xs font-bold transition-colors border-b-2 cursor-pointer ${
            activeTab === 'assigned-to-me'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-primary'
          }`}
        >
          Tasks Assigned to Me
        </button>
      </div>

      {/* Filters Panel */}
      <div className="glass p-4 rounded-xl border border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-center">
        {/* Search */}
        <div className="relative md:col-span-2">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-dark-700/50 border border-slate-350 focus:border-primary/50 outline-none text-xs rounded-xl pl-10 pr-4 py-2.5 text-black placeholder-slate-400 font-semibold"
          />
        </div>

        {/* Status Filter */}
        <div className="relative md:col-span-1">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-dark-700/50 border border-slate-350 focus:border-primary/50 outline-none text-xs rounded-xl px-3 py-2.5 text-black font-semibold cursor-pointer"
          >
            <option value="All">All Statuses</option>
            <option value="Task Assigned">Task Assigned</option>
            <option value="Accept">Accept</option>
            <option value="Decline">Decline</option>
            <option value="Completed">Completed</option>
            <option value="Forwarded">Forwarded</option>
          </select>
        </div>

        {/* Priority Filter */}
        <div className="relative md:col-span-1">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="w-full bg-dark-700/50 border border-slate-350 focus:border-primary/50 outline-none text-xs rounded-xl px-3 py-2.5 text-black font-semibold cursor-pointer"
          >
            <option value="All">All Priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      {/* Main Task List Table View */}
      <div className="glass rounded-xl border border-slate-800/80 flex-1 flex flex-col min-h-0 overflow-hidden">
        {staffTasksLoading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm font-semibold text-slate-400">Loading staff duties directory...</p>
          </div>
        ) : sortedTasks.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
            <ClipboardList className="w-8 h-8 text-slate-400" />
            <span className="font-semibold">No records found matching the filter criteria.</span>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 min-h-0">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-dark-900 border-b border-slate-800/60 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-4 w-44 sticky top-0 bg-dark-900 z-10 text-left">Account</th>
                  <th className="py-2.5 px-4 sticky top-0 bg-dark-900 z-10 text-left">Task Header</th>
                  <th className="py-2.5 px-4 w-32 sticky top-0 bg-dark-900 z-10 text-left">Priority</th>
                  <th className="py-2.5 px-4 w-40 sticky top-0 bg-dark-900 z-10 text-left">Due Date</th>
                  <th className="py-2.5 px-4 w-40 sticky top-0 bg-dark-900 z-10 text-left">Assign By</th>
                  <th className="py-2.5 px-4 w-40 sticky top-0 bg-dark-900 z-10 text-left">Assigned To</th>
                  <th className="py-2.5 px-4 w-44 sticky top-0 bg-dark-900 z-10 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {sortedTasks.map((task, index) => {
                  const isAssignedToMe = task.assignedToUid === user?.uid;
                  
                  const lowerStatus = (task.status || 'Pending').toLowerCase();
                  const displayStatus = task.status === 'Pending' ? 'Task Assigned' : task.status === 'In Progress' ? 'Accept' : task.status === 'Declined' ? 'Decline' : task.status;

                  return (
                    <tr 
                      key={task.taskId}
                      onClick={() => handleOpenDrawer(task)}
                      className={`hover:bg-blue-50/80 cursor-pointer transition-colors duration-150 border-b border-dark-800/40 ${
                        index % 2 === 0 ? 'bg-blue-50/30' : 'bg-white'
                      }`}
                    >
                      {/* Account */}
                      <td className="py-2.5 px-4">
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (task.accountId) {
                              navigate(`/accounts/${task.accountId}`);
                            }
                          }}
                          className="font-bold text-black hover:text-primary cursor-pointer transition-colors text-xs"
                        >
                          {task.companyName || 'Internal'}
                        </div>
                      </td>

                      {/* Task Header */}
                      <td className="py-2.5 px-4 max-w-xs break-words">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-black hover:text-primary transition-colors text-xs">
                            {task.title}
                          </span>
                          {task.isInteractionTask && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-600 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 w-fit">
                              <ExternalLink className="w-2.5 h-2.5" />
                              Interaction Log
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-2.5 px-4">
                        {task.priority ? (
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                            task.priority === 'High' ? 'bg-rose-500/10 border-rose-500/20 text-rose-600' :
                            task.priority === 'Medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-600' :
                            'bg-slate-400/10 border-slate-400/20 text-slate-500'
                          }`}>
                            {task.priority === 'High' ? 'High' : task.priority === 'Medium' ? 'Medium' : 'Low'}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs">-</span>
                        )}
                      </td>

                      {/* Due Date */}
                      <td className="py-2.5 px-4 text-xs font-semibold text-black">
                        {task.dueDate ? formatDueDate(task.dueDate) : '-'}
                      </td>

                      {/* Assign By */}
                      <td className="py-2.5 px-4 font-semibold text-black text-xs">
                        {task.assignedByName}
                      </td>

                      {/* Assigned To */}
                      <td className="py-2.5 px-4 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="bg-primary/10 border border-primary/20 text-primary w-6 h-6 rounded-md flex items-center justify-center font-bold text-[10px] shrink-0">
                            {task.assignedToName ? task.assignedToName.substring(0, 2).toUpperCase() : 'US'}
                          </div>
                          <span className="font-bold text-black truncate block max-w-[120px]">
                            {task.assignedToName ? (task.assignedToName.startsWith('@') ? task.assignedToName : `@${task.assignedToName}`) : ''}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                        {activeTab === 'assigned-to-me' ? (
                          <select
                            value={displayStatus}
                            onChange={(e) => handleStatusChange(task, e.target.value)}
                            className="px-2 py-1 rounded-lg border border-slate-350 bg-white text-xs text-black font-black outline-none cursor-pointer focus:border-primary/50 w-fit"
                          >
                            <option value="Task Assigned">Task Assigned</option>
                            <option value="Accept">Accepted</option>
                            <option value="Decline">Declined</option>
                            <option value="Completed">Completed</option>
                            <option value="Forwarded">Forwarded</option>
                          </select>
                        ) : (
                          <span className={`inline-block px-2.5 py-1 rounded-lg border text-xs font-black uppercase tracking-wider w-fit ${
                            lowerStatus === 'completed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' :
                            lowerStatus === 'forwarded' ? 'bg-sky-500/10 border-sky-500/20 text-sky-600' :
                            lowerStatus === 'accept' || lowerStatus === 'in progress' ? 'bg-amber-500/10 border-amber-500/20 text-amber-600' :
                            lowerStatus === 'decline' || lowerStatus === 'declined' ? 'bg-rose-500/10 border-rose-500/20 text-rose-600' :
                            'bg-slate-400/10 border-slate-400/20 text-slate-500'
                          }`}>
                            {displayStatus === 'Accept' || displayStatus === 'In Progress' ? 'Accepted' :
                             displayStatus === 'Decline' || displayStatus === 'Declined' ? 'Declined' :
                             displayStatus}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Full-page Task Details overlay — matches ActivityLog details design */}
      {isDrawerOpen && selectedTask && (
        <div className="absolute inset-0 z-30 flex flex-col bg-dark-950 overflow-hidden" style={{fontFamily: 'Montserrat, sans-serif'}}>
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Scrollable content area */}
            <div className="p-6 overflow-y-auto space-y-6 bg-dark-950 flex-1 w-full">

              {/* Header Card — matches ActivityLog's back-button header */}
              <div className="bg-dark-900 border border-dark-800 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <button
                    onClick={() => setIsDrawerOpen(false)}
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
                    <h3 className="font-extrabold text-black text-lg">Task Details</h3>
                  </div>
                </div>
              </div>

              {/* Two-column layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left Column */}
                <div className="lg:col-span-5 space-y-6 flex flex-col">

                  {/* Task Description */}
                  <div className="bg-dark-900 border border-dark-800 rounded-xl p-5 shadow-sm space-y-3">
                    <div className="border-b border-dark-800 pb-2">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Task Description</h4>
                    </div>
                    <p className="text-sm font-semibold text-black leading-relaxed whitespace-pre-wrap">
                      {selectedTask.description || selectedTask.title}
                    </p>
                  </div>

                  {/* Task Details */}
                  <div className="bg-dark-900 border border-dark-800 p-5 rounded-xl shadow-sm flex flex-col gap-4">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-dark-800 pb-2 block">Task Details</h4>

                    <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Company Account</span>
                        <span className="text-sm font-extrabold text-black truncate" title={selectedTask.companyName}>{selectedTask.companyName || 'Internal'}</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Client Contact</span>
                        <span className="text-sm font-extrabold text-black truncate" title={selectedTask.contactName}>{selectedTask.contactName || '—'}</span>
                      </div>
                      <div className="flex flex-col gap-1.5 pt-2 border-t border-dark-800/40">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Task Category</span>
                        <span className="px-3 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-600 text-xs font-extrabold uppercase tracking-wider w-fit mt-1.5">
                          Staff Task Assignment
                        </span>
                      </div>
                      <div className="flex flex-col gap-1.5 pt-2 border-t border-dark-800/40">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Logged Date & Time</span>
                        <div className="text-xs text-black font-bold flex items-center gap-1.5 mt-2">
                          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>{formatLoggedDateTime(selectedTask.date, selectedTask.time, selectedTask.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Assigned By */}
                  <div className="bg-dark-900 border border-dark-800 p-5 rounded-xl shadow-sm">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-dark-800 pb-2 block mb-3">Assigned By</h4>
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/20 border border-primary/30 text-primary w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                        {selectedTask.assignedByName ? selectedTask.assignedByName.substring(0, 2).toUpperCase() : 'US'}
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-black block text-sm truncate">{selectedTask.assignedByName || 'Admin User'}</span>
                        <span className="text-xs text-slate-400 font-bold block mt-0.5">Staff Member</span>
                      </div>
                    </div>
                  </div>



                </div>

                {/* Right Column */}
                <div className="lg:col-span-7 space-y-6 flex flex-col">
                  
                  {/* Task Assigned To Card */}
                  <div className="bg-dark-900 border border-dark-800 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-dark-800 pb-2">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Task Assigned To</h4>
                    </div>
                    <div className="p-4 rounded-xl bg-dark-700/40 border border-dark-800 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-500 flex items-center justify-center font-bold text-xs">
                            {selectedTask.assignedToName ? selectedTask.assignedToName.substring(0, 2).toUpperCase() : 'US'}
                          </div>
                          <div>
                            <span className="font-bold text-black text-xs block">
                              @{selectedTask.assignedToName || 'Staff Member'}
                            </span>
                          </div>
                        </div>
                        <span className={`inline-block px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${
                          (selectedTask.status || '').toLowerCase() === 'completed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' :
                          (selectedTask.status || '').toLowerCase() === 'forwarded' ? 'bg-sky-500/10 border-sky-500/20 text-sky-600' :
                          (selectedTask.status || '').toLowerCase() === 'accept' || (selectedTask.status || '').toLowerCase() === 'in progress' ? 'bg-amber-500/10 border-amber-500/20 text-amber-600' :
                          (selectedTask.status || '').toLowerCase() === 'decline' || (selectedTask.status || '').toLowerCase() === 'declined' ? 'bg-rose-500/10 border-rose-500/20 text-rose-600' :
                          'bg-slate-400/10 border-slate-400/20 text-slate-500'
                        }`}>
                          {selectedTask.status === 'Pending' ? 'Task Assigned' : 
                           (selectedTask.status === 'Accept' || selectedTask.status === 'In Progress') ? 'Accepted' :
                           (selectedTask.status === 'Decline' || selectedTask.status === 'Declined') ? 'Declined' :
                           selectedTask.status || 'Task Assigned'}
                        </span>
                      </div>
                      {(selectedTask.priority || selectedTask.dueDate) && (
                        <div className="flex items-center gap-2 pl-1 mt-1.5 flex-wrap">
                          {selectedTask.priority && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                              selectedTask.priority === 'High' ? 'bg-rose-500/10 border-rose-500/20 text-rose-600' :
                              selectedTask.priority === 'Medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-600' :
                              'bg-slate-400/10 border-slate-400/20 text-slate-500'
                            }`}>
                              {selectedTask.priority}
                            </span>
                          )}
                          {selectedTask.dueDate && (
                            <span className="text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                              Due: {selectedTask.dueDate}
                            </span>
                          )}
                        </div>
                      )}

                      {selectedTask.assignedToUid === user?.uid && (
                        <div className="pt-2 border-t border-dark-800 border-dashed space-y-1.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Change Status:</span>
                            <select
                              value={selectedTask.status === 'Pending' ? 'Task Assigned' : (selectedTask.status === 'In Progress' || selectedTask.status === 'Accept') ? 'Accept' : (selectedTask.status === 'Declined' || selectedTask.status === 'Decline') ? 'Decline' : selectedTask.status}
                              onChange={async (e) => {
                                const newStatus = e.target.value;
                                await handleStatusChange(selectedTask, newStatus);
                              }}
                              className="px-2 py-1 rounded-lg border border-dark-800 bg-dark-700/50 text-[11px] text-black font-bold outline-none cursor-pointer focus:border-primary"
                            >
                              <option value="Task Assigned">Task Assigned</option>
                              <option value="Accept">Accepted</option>
                              <option value="Decline">Declined</option>
                              <option value="Completed">Completed</option>
                              <option value="Forwarded">Forwarded</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Replies & Notes Updates */}
                  <div className="bg-dark-900 border border-dark-800 rounded-xl p-5 shadow-sm space-y-4 flex flex-col">
                    <div className="flex items-center justify-between border-b border-dark-800 pb-2">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-primary" />
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          Replies & Notes Updates
                        </h4>
                      </div>
                      <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full font-extrabold">
                        {(() => {
                          const noteTexts = [
                            selectedTask.acceptNote ? `Acceptance Note: ${selectedTask.acceptNote}` : null,
                            selectedTask.completionNote ? `Completion Report: ${selectedTask.completionNote}` : null,
                            selectedTask.declineReason ? `Decline Reason: ${selectedTask.declineReason}` : null
                          ].filter(Boolean);
                          const total = replies.length + noteTexts.length;
                          return `${total} ${total === 1 ? 'Reply' : 'Replies'}`;
                        })()}
                      </span>
                    </div>

                    {/* Replies Feed */}
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 min-h-[60px]">
                      {(() => {
                        const extraNotes = [];
                        const noteTexts = [
                          selectedTask.acceptNote ? `Acceptance Note: ${selectedTask.acceptNote}` : null,
                          selectedTask.completionNote ? `Completion Report: ${selectedTask.completionNote}` : null,
                          selectedTask.declineReason ? `Decline Reason: ${selectedTask.declineReason}` : null
                        ].filter(Boolean);

                        noteTexts.forEach((nt, idx) => {
                          if (!replies.some(r => (r.text || '').includes(nt))) {
                            extraNotes.push({
                              replyId: `note-${idx}`,
                              authorName: selectedTask.assignedToName || 'Staff Member',
                              authorUid: selectedTask.assignedToUid,
                              text: nt,
                              timestamp: selectedTask.timestamp || new Date().toISOString()
                            });
                          }
                        });

                        const repliesList = [...replies, ...extraNotes];
                        repliesList.sort((a, b) => {
                          const timeA = a.timestamp ? new Date(a.timestamp) : new Date(0);
                          const timeB = b.timestamp ? new Date(b.timestamp) : new Date(0);
                          return timeA - timeB;
                        });
                        if (repliesLoading) {
                          return (
                            <div className="flex items-center justify-center py-8">
                              <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
                            </div>
                          );
                        }
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
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          className="w-full bg-dark-700 border border-dark-800 rounded-xl p-3 text-xs text-black placeholder-slate-500 focus:outline-none focus:border-primary font-medium resize-none transition-all"
                        />
                        <button
                          type="button"
                          onClick={handlePostReply}
                          disabled={!replyText.trim() || repliesLoading}
                          className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0 self-end sm:self-auto h-fit disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {repliesLoading ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Sending...</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              <span>Send Reply</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Accept Task Modal */}
      {acceptModalState.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-dark-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setAcceptModalState({ isOpen: false, task: null });
                setAcceptNote('');
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-dark-700 hover:bg-dark-800 text-slate-500 hover:text-black transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                <ThumbsUp className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-sm font-black text-black">Accept Task</h3>
                <p className="text-xs text-slate-450">Confirm acceptance and optionally add a note</p>
              </div>
            </div>

            <form onSubmit={submitAccept} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600">Acceptance Note (Optional)</label>
                <textarea
                  value={acceptNote}
                  onChange={(e) => setAcceptNote(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-800 rounded-xl p-3 text-xs text-black focus:outline-none focus:border-amber-550/50 min-h-[100px]"
                  placeholder="E.g., I will begin working on this task immediately."
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-600/15"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-dark-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setDeclineModalState({ isOpen: false, task: null });
                setDeclineReason('');
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-dark-700 hover:bg-dark-800 text-slate-500 hover:text-black transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-sm font-black text-black">Decline Task</h3>
                <p className="text-xs text-slate-450">Provide a reason for declining this task</p>
              </div>
            </div>

            <form onSubmit={submitDecline} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600">Reason for Declining</label>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-800 rounded-xl p-3 text-xs text-black focus:outline-none focus:border-rose-500/50 min-h-[100px]"
                  placeholder="E.g., Unable to complete due to conflicting priorities or missing resources."
                  required
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-rose-600/15"
                >
                  Submit Decline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete Task Modal */}
      {isCompletionDialogOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-dark-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
            <button 
              onClick={() => {
                setIsCompletionDialogOpen(false);
                setCompletionTaskId(null);
                setCompletionNote('');
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-dark-700 hover:bg-dark-800 text-slate-500 hover:text-black transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                <CheckSquare className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-black text-black">Complete Task</h3>
                <p className="text-xs text-slate-450">Send a note back to Admin User</p>
              </div>
            </div>
            
            <form onSubmit={submitCompletion} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600">Completion Note</label>
                <textarea
                  value={completionNote}
                  onChange={(e) => setCompletionNote(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-800 rounded-xl p-3 text-xs text-black focus:outline-none focus:border-emerald-500/50 min-h-[100px]"
                  placeholder="E.g., Task completed successfully. Attached the required files."
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600">Attachments (Optional)</label>
                <input
                  type="file"
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border file:border-dark-800 file:text-xs file:font-semibold file:bg-dark-700 file:text-slate-700 hover:file:bg-dark-800"
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-emerald-600/15"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-dark-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
            <button 
              onClick={() => {
                setForwardModalState({ isOpen: false, task: null });
                setForwardToUid('');
                setForwardReason('');
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-dark-700 hover:bg-dark-800 text-slate-500 hover:text-black transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <Send className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="text-sm font-black text-black">Forward Task</h3>
                <p className="text-xs text-slate-450">Select a team member to forward this task to</p>
              </div>
            </div>
            
            <form onSubmit={submitForward} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600">Forward To</label>
                <select
                  value={forwardToUid}
                  onChange={(e) => setForwardToUid(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-800 rounded-xl p-3 text-xs text-black outline-none focus:border-blue-500/50 cursor-pointer font-semibold"
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
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600">Forwarding Note / Reason</label>
                <textarea
                  value={forwardReason}
                  onChange={(e) => setForwardReason(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-800 rounded-xl p-3 text-xs text-black outline-none focus:border-blue-500/50 min-h-[100px]"
                  placeholder="E.g., Forwarding to you as you are leading the deployment module."
                />
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={!forwardToUid}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-blue-600/15"
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
