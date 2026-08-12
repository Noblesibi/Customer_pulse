import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  ClipboardList, Search, RefreshCw, X, Eye, Plus, CheckSquare, 
  Send, ShieldAlert, Check, Ban, HelpCircle, ChevronLeft, Calendar, ThumbsUp, MessageSquare, ExternalLink, FileText
} from 'lucide-react';
import { useStore } from '../store/index.js';
import { formatDate, formatTime, formatDateTime } from '../utils/dateFormat.js';
import TeamMemberSelect from '../components/TeamMemberSelect.jsx';

const formatLoggedDateTime = (dateStr, timeStr, timestampStr) => {
  return formatDateTime(dateStr, timeStr, timestampStr);
};

const formatDueDate = (dateStr) => {
  return formatDate(dateStr);
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

  const isSelectedTaskOverdue = selectedTask && 
                                selectedTask.dueDate && 
                                new Date(selectedTask.dueDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0) && 
                                selectedTask.status?.toLowerCase() !== 'completed' && 
                                selectedTask.status?.toLowerCase() !== 'decline' && 
                                selectedTask.status?.toLowerCase() !== 'declined';
  const [replyText, setReplyText] = useState('');
  const [repliesLoading, setRepliesLoading] = useState(false);

  // Completion Dialog State
  const [isCompletionDialogOpen, setIsCompletionDialogOpen] = useState(false);
  const [completionTask, setCompletionTask] = useState(null);
  const [completionNote, setCompletionNote] = useState('');
  const [completionFile, setCompletionFile] = useState(null);

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
  const [forwardFile, setForwardFile] = useState(null);

  // Tooltip state
  const [hoveredTaskTooltip, setHoveredTaskTooltip] = useState(null);

  const uploadFile = async (file) => {
    if (!file) return null;
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
      });

      const token = useStore.getState().token;
      const res = await fetch('/CustomerPulse/api/interactions/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: file.name,
          type: file.type,
          base64
        })
      });

      if (res.ok) {
        return await res.json();
      } else {
        console.error('File upload failed:', await res.json());
      }
    } catch (err) {
      console.error('Error uploading file:', err);
    }
    return null;
  };

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
    const currentLower = (task.status || '').toLowerCase();
    if (
      currentLower === 'completed' ||
      currentLower === 'complete' ||
      currentLower === 'decline' ||
      currentLower === 'declined' ||
      currentLower === 'accepted & completed'
    ) {
      return;
    }

    const taskId = task.taskId;
    if (newStatus === 'Completed') {
      setCompletionTask(task);
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
    if (!completionTask) return;
    const task = completionTask;

    let finalNote = `Task Completion Note: ${completionNote.trim() || 'No note provided'}`;
    if (completionFile) {
      const uploaded = await uploadFile(completionFile);
      if (uploaded && uploaded.url) {
        finalNote += `\n\n📎 Attached: [${uploaded.name}](${uploaded.url})`;
      }
    }

    if (task.isInteractionTask) {
      const ok = await updateTaskStatus(
        task.originalInteraction.interactionId,
        task.uid,
        'Completed',
        finalNote
      );
      if (ok) {
        await replyToInteraction(task.originalInteraction.interactionId, finalNote);
        setIsCompletionDialogOpen(false);
        setCompletionTask(null);
        setCompletionNote('');
        setCompletionFile(null);
        fetchInteractions();
        if (selectedTask && selectedTask.taskId === task.taskId) {
          setSelectedTask(prev => ({ ...prev, status: 'Completed', completionNote: completionNote.trim() }));
          const updatedReplies = await fetchReplies(task.originalInteraction.interactionId);
          setReplies(updatedReplies || []);
        }
      }
    } else {
      const ok = await updateStaffTaskStatus(
        task.taskId,
        'Completed',
        '',
        finalNote
      );
      if (ok) {
        setIsCompletionDialogOpen(false);
        setCompletionTask(null);
        setCompletionNote('');
        setCompletionFile(null);
        fetchStaffTasks(activeTab);
        if (selectedTask && selectedTask.taskId === task.taskId) {
          setSelectedTask(prev => ({ ...prev, status: 'Completed', completionNote: completionNote.trim() }));
          const updatedReplies = await fetchStaffTaskReplies(task.taskId);
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
    
    let finalNote = `Forwarded Task Note: ${forwardReason.trim() || 'No note provided'}`;
    if (forwardFile) {
      const uploaded = await uploadFile(forwardFile);
      if (uploaded && uploaded.url) {
        finalNote += `\n\n📎 Attached: [${uploaded.name}](${uploaded.url})`;
      }
    }

    if (task.isInteractionTask) {
      const ok = await updateTaskStatus(
        task.originalInteraction.interactionId,
        task.uid,
        'Forwarded',
        forwardReason.trim(),
        targetUser.uid,
        targetUser.name
      );
      if (ok) {
        if (forwardReason.trim() || forwardFile) {
          await replyToInteraction(task.originalInteraction.interactionId, finalNote);
        }
        fetchInteractions();
        if (selectedTask && selectedTask.taskId === task.taskId) {
          setSelectedTask(null);
          setIsDrawerOpen(false);
        }
        setForwardModalState({ isOpen: false, task: null });
        setForwardToUid('');
        setForwardReason('');
        setForwardFile(null);
      }
    } else {
      const ok = await updateStaffTaskStatus(
        task.taskId, 
        'Forwarded', 
        '', 
        finalNote, 
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
        setForwardFile(null);
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
        const forwardedToName = mention.forwardedToName || null;
        const forwardedToUid = mention.forwardedToUid || null;
        const forwardedFromName = mention.forwardedFromName || null;
        const forwardedFromUid = mention.forwardedFromUid || null;

        // Lookup forwarded recipient's live mention & status
        let recipientStatus = null;
        if (forwardedToUid || mention.status === 'Forwarded') {
          const recipientMention = item.actionMentions.find(m => 
            (m.uid === forwardedToUid || m.forwardedFromUid === mention.uid || (forwardedToName && m.name && m.name.toLowerCase() === forwardedToName.toLowerCase())) &&
            m.uid !== mention.uid
          );
          if (recipientMention) {
            recipientStatus = recipientMention.status;
          }
        }

        parsedInteractionTasks.push({
          ...mention,
          taskId: mention.taskId || `${item.interactionId}-${mention.uid}`,
          title: mention.taskHeader || cleanHeader,
          description: mention.task || item.messageText || item.subject,
          assignedToUid: mention.uid,
          assignedToName: mention.name,
          assignedByUid: item.loggedByUid,
          assignedByName: item.loggedByName || 'System Admin',
          forwardedToUid: forwardedToUid,
          forwardedToName: forwardedToName,
          forwardedFromUid: forwardedFromUid,
          forwardedFromName: forwardedFromName,
          recipientStatus: recipientStatus,
          priority: mention.priority || 'Medium',
          dueDate: mention.dueDate || null,
          status: mention.status || 'Pending',
          accountId: item.accountId,
          companyName: item.companyName || 'External Account',
          contactName: item.contactName || '',
          date: item.date || null,
          time: item.time || null,
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
    const isAssignedToMe = t.assignedToUid === user?.uid || 
                           t.forwardedToUid === user?.uid || 
                           (t.forwardedToName && user?.name && t.forwardedToName.toLowerCase() === user?.name.toLowerCase());
    const isCreatedByMe = t.assignedByUid === user?.uid || 
                          t.forwardedByUid === user?.uid || 
                          t.forwardedFromUid === user?.uid || 
                          (t.forwardedByName && user?.name && t.forwardedByName.toLowerCase() === user?.name.toLowerCase()) || 
                          (t.forwardedFromName && user?.name && t.forwardedFromName.toLowerCase() === user?.name.toLowerCase());

    if (activeTab === 'assigned-to-me') {
      return isAssignedToMe;
    }
    if (activeTab === 'created-by-me') {
      return isCreatedByMe;
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
      if (f === 'accept' || f === 'accepted' || f === 'in progress') {
        return s === 'accept' || s === 'accepted' || s === 'in progress';
      }
      if (f === 'decline' || f === 'declined') {
        return s === 'decline' || s === 'declined';
      }
      if (f === 'forwarded' || f === 'forward') {
        return s.includes('forward') || !!task.forwardedToName || !!task.forwardedFromName;
      }
      if (f === 'completed' || f === 'complete') {
        return s.includes('complete');
      }
      if (f === 'overdue' || f === 'overdued') {
        const lowerStatus = (task.status || 'Pending').toLowerCase();
        const isTaskOverdue = task.dueDate && 
                              new Date(task.dueDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0) && 
                              !lowerStatus.includes('complete') && 
                              !lowerStatus.includes('decline');
        return isTaskOverdue || s.includes('overdue');
      }
      return s === f;
    })();
    const matchesPriority = priorityFilter === 'All' || task.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const parseDateToTime = (raw) => {
    if (!raw) return 0;
    if (raw instanceof Date) return isNaN(raw.getTime()) ? 0 : raw.getTime();
    if (typeof raw === 'number') return raw;

    const str = String(raw).trim();
    if (!str) return 0;

    const direct = Date.parse(str);
    if (!isNaN(direct)) return direct;

    const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      let hours = match[4] ? parseInt(match[4], 10) : 0;
      const minutes = match[5] ? parseInt(match[5], 10) : 0;
      const seconds = match[6] ? parseInt(match[6], 10) : 0;
      const ampm = match[7] ? match[7].toLowerCase() : null;

      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;

      const d = new Date(year, month, day, hours, minutes, seconds);
      if (!isNaN(d.getTime())) return d.getTime();
    }
    return 0;
  };

  const getTaskTime = (task) => {
    if (!task) return 0;
    let t = 0;
    if (task.timestamp) t = parseDateToTime(task.timestamp);
    if (!t && task.createdAt) t = parseDateToTime(task.createdAt);
    if (!t && task.date) {
      const combined = task.time ? `${task.date} ${task.time}` : task.date;
      t = parseDateToTime(combined);
    }
    if (!t && task.dueDate) t = parseDateToTime(task.dueDate);
    return t;
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
                  <th className="py-2.5 px-4 w-40 sticky top-0 bg-dark-900 z-10 text-left">Account</th>
                  <th className="py-2.5 px-4 sticky top-0 bg-dark-900 z-10 text-left">Task Header</th>
                  <th className="py-2.5 px-4 w-28 sticky top-0 bg-dark-900 z-10 text-left">Priority</th>
                  <th className="py-2.5 px-4 w-44 sticky top-0 bg-dark-900 z-10 text-left">Logged Date & Time</th>
                  <th className="py-2.5 px-4 w-32 sticky top-0 bg-dark-900 z-10 text-left">Due Date</th>
                  <th className="py-2.5 px-4 w-36 sticky top-0 bg-dark-900 z-10 text-left">Assign By</th>
                  <th className="py-2.5 px-4 w-36 sticky top-0 bg-dark-900 z-10 text-left">Assigned To</th>
                  <th className="py-2.5 px-4 w-40 sticky top-0 bg-dark-900 z-10 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {sortedTasks.map((task, index) => {
                  const isAssignedToMe = task.assignedToUid === user?.uid;
                  
                  const lowerStatus = (task.status || 'Pending').toLowerCase();
                  const isOverdue = task.dueDate && 
                                    new Date(task.dueDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0) && 
                                    lowerStatus !== 'completed' && 
                                    lowerStatus !== 'decline' && 
                                    lowerStatus !== 'declined';
                  const displayStatus = isOverdue
                    ? 'Overdue'
                    : (task.status === 'Pending' ? 'Task Assigned' : task.status === 'In Progress' ? 'Accept' : task.status === 'Declined' ? 'Decline' : task.status);

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
                          <div
                            title={task.description || task.title}
                            className="cursor-help hover:text-primary transition-colors inline-block"
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const showBelow = rect.top < 220;
                              setHoveredTaskTooltip({
                                text: task.description || task.title || 'No task description available.',
                                x: rect.left + rect.width / 2,
                                y: showBelow ? rect.bottom : rect.top,
                                showBelow
                              });
                            }}
                            onMouseLeave={() => setHoveredTaskTooltip(null)}
                          >
                            <span className="font-bold text-black hover:text-primary transition-colors text-xs">
                              {task.title}
                            </span>
                          </div>
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

                      {/* Logged Date & Time */}
                      <td className="py-2.5 px-4 text-xs font-semibold text-black whitespace-nowrap">
                        {formatLoggedDateTime(task.date, task.time, task.timestamp || task.createdAt)}
                      </td>

                      {/* Due Date */}
                      <td className="py-2.5 px-4 text-xs font-semibold text-black whitespace-nowrap">
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
                          <div className="flex flex-col">
                            <span className="font-bold text-black truncate block max-w-[120px]">
                              {task.assignedToName ? (task.assignedToName.startsWith('@') ? task.assignedToName : `@${task.assignedToName}`) : ''}
                            </span>
                            {(task.forwardedToName || task.forwardedFromName) && (
                              <span className="text-[10px] text-sky-600 font-semibold italic">
                                {task.forwardedToName ? `(Fwd to @${task.forwardedToName})` : `(Fwd from @${task.forwardedFromName})`}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                        {activeTab === 'assigned-to-me' && !isOverdue && !lowerStatus.includes('completed') && !lowerStatus.includes('complete') && !lowerStatus.includes('decline') && !lowerStatus.includes('declined') && !lowerStatus.includes('forward') && !task.forwardedToUid ? (
                          <select
                            value={displayStatus}
                            onChange={(e) => handleStatusChange(task, e.target.value)}
                            className={`px-2 py-1 rounded-lg border text-xs outline-none w-fit cursor-pointer focus:border-primary/50 ${
                              displayStatus === 'Accept' || displayStatus === 'Accepted' || displayStatus === 'In Progress' ? 'border-amber-500/30 bg-amber-50/80 text-amber-700 font-extrabold' :
                              displayStatus === 'Forwarded' ? 'border-sky-500/30 bg-sky-50/80 text-sky-700 font-extrabold' :
                              'border-slate-300 bg-white text-slate-800 font-bold'
                            }`}
                          >
                            <option value="Task Assigned">Task Assigned</option>
                            <option value="Accept">Accepted</option>
                            <option value="Decline">Declined</option>
                            <option value="Completed">Completed</option>
                            <option value="Forwarded">Forwarded</option>
                          </select>
                        ) : (
                          (() => {
                            const rawStatus = (task.status || 'Pending');
                            let effectiveStatus = rawStatus;

                            // If task was forwarded, display the recipient's live status
                            if (rawStatus === 'Forwarded' || task.forwardedToUid) {
                              if (task.recipientStatus && task.recipientStatus !== 'Forwarded') {
                                effectiveStatus = task.recipientStatus;
                              }
                            }

                            const lowerEffective = effectiveStatus.toLowerCase();
                            const isTaskOverdue = task.dueDate && 
                                                  new Date(task.dueDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0) && 
                                                  !lowerEffective.includes('completed') && 
                                                  !lowerEffective.includes('complete') && 
                                                  !lowerEffective.includes('decline') && 
                                                  !lowerEffective.includes('declined');

                            let badgeText = 'Task Assigned';
                            let badgeClass = 'bg-slate-400/10 border-slate-400/20 text-slate-500';

                            if (isTaskOverdue) {
                              badgeText = 'Overdue';
                              badgeClass = 'bg-purple-500/10 border-purple-500/20 text-purple-600';
                            } else if (lowerEffective.includes('completed') || lowerEffective.includes('complete')) {
                              badgeText = 'Completed';
                              badgeClass = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600';
                            } else if (lowerEffective.includes('decline') || lowerEffective.includes('declined')) {
                              badgeText = 'Declined';
                              badgeClass = 'bg-rose-500/10 border-rose-500/20 text-rose-600';
                            } else if (lowerEffective.includes('accept') || lowerEffective.includes('in progress')) {
                              badgeText = 'Accepted';
                              badgeClass = 'bg-amber-500/10 border-amber-500/20 text-amber-600';
                            } else if (rawStatus === 'Forwarded' || lowerEffective.includes('forward')) {
                              badgeText = task.forwardedToName ? `Forwarded to @${task.forwardedToName}` : 'Forwarded';
                              badgeClass = 'bg-sky-500/10 border-sky-500/20 text-sky-600';
                            }

                            return (
                              <span className={`inline-block px-2.5 py-1 rounded-lg border text-xs font-black uppercase tracking-wider w-fit ${badgeClass}`}>
                                {badgeText}
                              </span>
                            );
                          })()
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
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Account</span>
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

                </div>

                {/* Right Column */}
                <div className="lg:col-span-7 space-y-6 flex flex-col">
                  
                  {/* Task Assignment details Card */}
                  <div className="bg-dark-900 border border-dark-800 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-dark-800 pb-2">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Task Assignment</h4>
                    </div>
                    <div className="p-4 rounded-xl bg-dark-700/40 border border-dark-800 flex flex-col gap-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Assigned By */}
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Assigned By</span>
                          <div className="flex items-center gap-2">
                            <div className="bg-primary/20 border border-primary/30 text-primary w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0">
                              {selectedTask.assignedByName ? selectedTask.assignedByName.substring(0, 2).toUpperCase() : 'US'}
                            </div>
                            <span className="font-bold text-black text-xs block truncate">
                              {selectedTask.assignedByName || 'Admin User'}
                            </span>
                          </div>
                        </div>

                        {/* Assigned To */}
                        <div className="flex flex-col gap-1.5 border-t sm:border-t-0 sm:border-l border-dark-800 pt-3 sm:pt-0 sm:pl-4">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Assigned To</span>
                            <span className={`inline-block px-2.5 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-wider ${
                              isSelectedTaskOverdue ? 'bg-purple-500/10 border-purple-500/20 text-purple-600' :
                              (selectedTask.status || '').toLowerCase().includes('complete') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' :
                              (selectedTask.status || '').toLowerCase().includes('forward') ? 'bg-sky-500/10 border-sky-500/20 text-sky-600' :
                              (selectedTask.status || '').toLowerCase().includes('accept') || (selectedTask.status || '').toLowerCase().includes('progress') ? 'bg-amber-500/10 border-amber-500/20 text-amber-600' :
                              (selectedTask.status || '').toLowerCase().includes('decline') ? 'bg-rose-500/10 border-rose-500/20 text-rose-600' :
                              'bg-slate-400/10 border-slate-400/20 text-slate-500'
                            }`}>
                              {isSelectedTaskOverdue ? 'Overdue' :
                               selectedTask.status === 'Pending' ? 'Task Assigned' : 
                               (selectedTask.status === 'Accept' || selectedTask.status === 'In Progress') ? 'Accepted' :
                               (selectedTask.status === 'Decline' || selectedTask.status === 'Declined') ? 'Declined' :
                               selectedTask.status || 'Task Assigned'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-500 flex items-center justify-center font-bold text-xs shrink-0">
                              {selectedTask.assignedToName ? selectedTask.assignedToName.substring(0, 2).toUpperCase() : 'US'}
                            </div>
                            <span className="font-bold text-black text-xs block truncate">
                              @{selectedTask.assignedToName || 'Staff Member'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Due Date & Priority */}
                      {(selectedTask.priority || selectedTask.dueDate) && (
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap pt-2 border-t border-dark-800">
                          {selectedTask.priority && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                              selectedTask.priority === 'High' ? 'bg-rose-500/10 border-rose-500/20 text-rose-600' :
                              selectedTask.priority === 'Medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-600' :
                              'bg-slate-400/10 border-slate-400/20 text-slate-500'
                            }`}>
                              Priority: {selectedTask.priority}
                            </span>
                          )}
                          {selectedTask.dueDate && (
                            <span className="text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                              Due: {formatDate(selectedTask.dueDate)}
                            </span>
                          )}
                        </div>
                      )}

                      {selectedTask.assignedToUid === user?.uid && (() => {
                        const isTaskFinal = (selectedTask.status || '').toLowerCase() === 'completed' ||
                                            (selectedTask.status || '').toLowerCase() === 'complete' ||
                                            (selectedTask.status || '').toLowerCase() === 'declined' ||
                                            (selectedTask.status || '').toLowerCase() === 'decline' ||
                                            (selectedTask.status || '').toLowerCase().includes('forward') ||
                                            (selectedTask.status || '').toLowerCase() === 'accepted & completed';

                        return (
                          <div className="pt-2 border-t border-dark-800 border-dashed space-y-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Change Status:</span>
                              {isTaskFinal ? (
                                <div className="flex items-center gap-2">
                                  <span className={`px-2.5 py-1 rounded-lg border text-xs font-black uppercase tracking-wider ${
                                    (selectedTask.status || '').toLowerCase().includes('decline')
                                      ? 'bg-rose-500/10 border-rose-500/20 text-rose-600'
                                      : (selectedTask.status || '').toLowerCase().includes('forward')
                                      ? 'bg-sky-500/10 border-sky-500/20 text-sky-600'
                                      : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
                                  }`}>
                                    {(selectedTask.status || '').toLowerCase().includes('forward')
                                      ? (selectedTask.forwardedToName ? `Forwarded to @${selectedTask.forwardedToName}` : 'Forwarded')
                                      : selectedTask.status === 'Decline' || selectedTask.status === 'Declined' ? 'Declined' : selectedTask.status === 'Accept' ? 'Accepted' : selectedTask.status}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-500 italic">
                                    (Status Fixed)
                                  </span>
                                </div>
                              ) : (
                                <select
                                  disabled={isSelectedTaskOverdue}
                                  value={selectedTask.status === 'Pending' ? 'Task Assigned' : (selectedTask.status === 'In Progress' || selectedTask.status === 'Accept') ? 'Accept' : (selectedTask.status === 'Declined' || selectedTask.status === 'Decline') ? 'Decline' : selectedTask.status}
                                  style={{ backgroundColor: '#ffffff', color: '#000000' }}
                                  onChange={async (e) => {
                                    if (isTaskFinal) return;
                                    const newStatus = e.target.value;
                                    await handleStatusChange(selectedTask, newStatus);
                                  }}
                                  className={`px-2 py-1 rounded-lg border text-[11px] font-bold outline-none w-fit ${
                                    isSelectedTaskOverdue
                                      ? 'border-slate-300 bg-slate-100 text-slate-500 cursor-not-allowed opacity-80'
                                      : 'border-slate-300 bg-white text-black cursor-pointer focus:border-primary'
                                  }`}
                                >
                                  {isSelectedTaskOverdue && <option value="Overdue">Overdue</option>}
                                  <option value="Task Assigned">Task Assigned</option>
                                  <option value="Accept">Accepted</option>
                                  <option value="Decline">Declined</option>
                                  <option value="Completed">Completed</option>
                                  <option value="Forwarded">Forwarded</option>
                                </select>
                              )}
                            </div>
                          </div>
                        );
                      })()}
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
                            selectedTask.completionNote && !replies.some(r => (r.text || '').startsWith('Task Completion Note:')) ? `Task Completion Note: ${selectedTask.completionNote}` : null,
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
                          selectedTask.acceptNote ? { label: `Acceptance Note: ${selectedTask.acceptNote}`, matchPrefix: 'Acceptance Note:' } : null,
                          selectedTask.completionNote ? { label: `Task Completion Note: ${selectedTask.completionNote}`, matchPrefix: 'Task Completion Note:' } : null,
                          selectedTask.declineReason ? { label: `Decline Reason: ${selectedTask.declineReason}`, matchPrefix: 'Decline Reason:' } : null
                        ].filter(Boolean);

                        noteTexts.forEach(({ label, matchPrefix }, idx) => {
                          if (!replies.some(r => (r.text || '').startsWith(matchPrefix))) {
                            extraNotes.push({
                              replyId: `note-${idx}`,
                              authorName: selectedTask.assignedToName || 'Staff Member',
                              authorUid: selectedTask.assignedToUid,
                              text: label,
                              timestamp: new Date().toISOString()
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
                                  {reply.timestamp ? formatDateTime(reply.timestamp) : 'Just now'}
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
              <div className="w-10 h-10 rounded-full bg-amber-5 border border-amber-100 flex items-center justify-center shrink-0">
                <ThumbsUp className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-sm font-black text-black">Accept Task</h3>
                <p className="text-xs text-black font-semibold">Confirm acceptance and optionally add a note</p>
              </div>
            </div>

            <form onSubmit={submitAccept} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-black">Acceptance Note (Optional)</label>
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
              <div className="w-10 h-10 rounded-full bg-rose-5 border border-rose-100 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-sm font-black text-black">Decline Task</h3>
                <p className="text-xs text-black font-semibold">Provide a reason for declining this task</p>
              </div>
            </div>

            <form onSubmit={submitDecline} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-black">Reason for Declining</label>
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
                setCompletionTask(null);
                setCompletionNote('');
                setCompletionFile(null);
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
                <p className="text-xs text-black font-semibold">Send a note back to {completionTask?.assignedByName || completionTask?.loggedByName || 'Admin User'}</p>
              </div>
            </div>
            
            <form onSubmit={submitCompletion} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-black">Completion Note</label>
                <textarea
                  value={completionNote}
                  onChange={(e) => setCompletionNote(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-800 rounded-xl p-3 text-xs text-black focus:outline-none focus:border-emerald-500/50 min-h-[100px]"
                  placeholder="E.g., Task completed successfully. Attached the required files."
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-black">Attachments (Optional)</label>
                <input
                  type="file"
                  onChange={(e) => setCompletionFile(e.target.files[0])}
                  className="w-full text-xs text-black file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border file:border-dark-800 file:text-xs file:font-semibold file:bg-dark-700 file:text-black hover:file:bg-dark-800"
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
                setForwardFile(null);
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
                <p className="text-xs text-black font-semibold">Select a team member to forward this task to</p>
              </div>
            </div>
            
            <form onSubmit={submitForward} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-black">Forward To</label>
                <TeamMemberSelect
                  value={forwardToUid}
                  onChange={(uid) => setForwardToUid(uid)}
                  staffList={staffList}
                  currentUserId={user?.uid}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-black">Forwarding Note / Reason</label>
                <textarea
                  value={forwardReason}
                  onChange={(e) => setForwardReason(e.target.value)}
                  className="w-full bg-dark-700 border border-dark-800 rounded-xl p-3 text-xs text-black outline-none focus:border-blue-500/50 min-h-[100px]"
                  placeholder="E.g., Forwarding to you as you are leading the deployment module."
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-black">Attachments (Optional)</label>
                <input
                  type="file"
                  onChange={(e) => setForwardFile(e.target.files[0])}
                  className="w-full text-xs text-slate-700 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border file:border-slate-300 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-800 hover:file:bg-slate-200 file:cursor-pointer cursor-pointer transition-all"
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
                <span>Task Description</span>
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
