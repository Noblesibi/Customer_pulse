import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/index.js';
import { 
  ChevronLeft, Mail, MessageSquare, Phone, Users, Video, Clock, 
  CheckCheck, Send, CheckSquare, X, Building2, User, FileText,
  Activity, AlertTriangle, ArrowRightCircle, Sparkles, ChevronDown, RefreshCw,
  ClipboardList, Download, Paperclip, ShieldAlert, Lightbulb, Heart, ArrowDown, ArrowUp, PlusCircle, MinusCircle, CheckCircle2
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { formatDate, formatDateTime } from '../utils/dateFormat.js';

export default function UserAccountActivity() {
  const { id, uid } = useParams();
  const navigate = useNavigate();
  const { 
    token, 
    user, 
    staffList, 
    fetchStaff, 
    fetchReplies, 
    replyToInteraction, 
    fetchStaffTaskReplies, 
    addStaffTaskReply, 
    updateStaffTaskStatus, 
    updateTaskStatus 
  } = useStore();

  const [loading, setLoading] = useState(true);
  const [allActivities, setAllActivities] = useState([]);
  const [account, setAccount] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [associatedUsers, setAssociatedUsers] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [explanationData, setExplanationData] = useState(null);
  const [healthHistory, setHealthHistory] = useState(null);
  const [accountRisks, setAccountRisks] = useState([]);
  const dropdownRef = useRef(null);

  // Modal replies state
  const [modalReplies, setModalReplies] = useState([]);
  const [modalRepliesLoading, setModalRepliesLoading] = useState(false);
  const [modalReplyText, setModalReplyText] = useState('');
  const [submittingModalReply, setSubmittingModalReply] = useState(false);

  // Status Action Dialog state (for both staff tasks and interaction associated tasks)
  const [statusActionDialog, setStatusActionDialog] = useState({
    isOpen: false,
    action: '', // 'Accept' | 'Complete' | 'Forward' | 'Decline'
    targetItem: null,
    isMention: false,
    interactionId: null
  });
  const [statusDialogNote, setStatusDialogNote] = useState('');
  const [forwardAssigneeUid, setForwardAssigneeUid] = useState('');
  const [statusDialogSubmitting, setStatusDialogSubmitting] = useState(false);

  useEffect(() => {
    if (fetchStaff && (!staffList || staffList.length === 0)) {
      fetchStaff();
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!token || !id || !uid) return;
    
    const loadData = async () => {
      setLoading(true);
      try {
        const accRes = await fetch(`/CustomerPulse/api/accounts/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        let accountData = null;
        if (accRes.ok) {
          accountData = await accRes.json();
          setAccount(accountData);
        }

        const [intRes, tasksRes, otherRes, expRes, histRes, risksRes] = await Promise.all([
          fetch(`/CustomerPulse/api/user-account/${id}/${uid}/interactions`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`/CustomerPulse/api/user-account/${id}/${uid}/tasks`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`/CustomerPulse/api/user-account/${id}/${uid}/other-activities`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`/CustomerPulse/api/accounts/${id}/health-explanation`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`/CustomerPulse/api/accounts/${id}/health-history`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`/CustomerPulse/api/risks?accountId=${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        let interactions = [];
        let tasks = [];
        let otherActivities = [];

        if (intRes.ok) interactions = await intRes.json();
        if (tasksRes.ok) tasks = await tasksRes.json();
        if (otherRes.ok) otherActivities = await otherRes.json();
        if (expRes.ok) setExplanationData(await expRes.json());
        if (histRes.ok) setHealthHistory(await histRes.json());
        if (risksRes.ok) setAccountRisks(await risksRes.json());

        // Set timeline ONLY to interactions & tasks involving the selected user
        const userActivities = [
          ...interactions
            .filter(i => i.source !== 'System Email')
            .map(i => ({ ...i, itemType: 'interaction', isOther: false })),
          ...tasks.map(t => ({ ...t, itemType: 'task', isOther: false }))
        ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        setAllActivities(userActivities);

        // However, use ALL activities (including other people's) to find associated users
        const combined = [
          ...interactions.map(i => ({ ...i, itemType: 'interaction', isOther: false })),
          ...otherActivities.map(i => ({ ...i, itemType: 'interaction', isOther: true })),
          ...tasks.map(t => ({ ...t, itemType: 'task', isOther: false }))
        ];

        // Extract all associated users for the dropdown
        const usersMap = new Map();
        if (uid !== 'all') {
          usersMap.set(uid, { uid, name: uid === user?.uid ? 'Me' : uid });
        }

        if (accountData && accountData.ownerId) {
          usersMap.set(accountData.ownerId, { uid: accountData.ownerId, name: accountData.ownerName || accountData.ownerId });
        }

        combined.forEach(item => {
          if (item.loggedByUid && item.loggedByName) {
            usersMap.set(item.loggedByUid, { uid: item.loggedByUid, name: item.loggedByName });
          }
          if (item.assignedToUid && item.assignedToName) {
            usersMap.set(item.assignedToUid, { uid: item.assignedToUid, name: item.assignedToName });
          }
          if (item.assignedByUid && item.assignedByName) {
            usersMap.set(item.assignedByUid, { uid: item.assignedByUid, name: item.assignedByName });
          }
        });

        // Deduplicate by name to prevent multiple entries for the same person
        const uniqueNames = new Set();
        const filteredUsers = [];
        Array.from(usersMap.values()).forEach(u => {
          const displayName = u.uid === user?.uid ? 'Me' : u.name;
          if (!uniqueNames.has(displayName)) {
            uniqueNames.add(displayName);
            filteredUsers.push(u);
          }
        });

        // Add "All Users" option at the beginning
        filteredUsers.unshift({ uid: 'all', name: 'All Users' });

        setAssociatedUsers(filteredUsers);
      } catch (err) {
        console.error("Failed to load user-account activity", err);
      } finally {
        if (!isSilent) setLoading(false);
      }
    };
    
    loadData(false);

    // Live continuous update every 25 seconds
    const interval = setInterval(() => {
      loadData(true);
    }, 25000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadData(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [id, uid, token, user?.uid]);

  if (loading) {
    return (
      <div className="h-[calc(100vh-10rem)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    );
  }

  const handleMicrosoftSync = async () => {
    setSyncing(true);
    setToastMessage('Starting Microsoft 365 Sync...');
    try {
      const res = await fetch('/CustomerPulse/api/integrations/microsoft/sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setToastMessage(`Sync Complete! Added: ${data.syncRecord.results.synced}, Skipped: ${data.syncRecord.results.duplicatesSkipped} (Duplicates), ${data.syncRecord.results.internalSkipped} (Internal), ${data.syncRecord.results.unmatchedSkipped} (Unmatched)`);
        
        // Refresh the page data after syncing
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setToastMessage(`Sync failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      setToastMessage('An error occurred during sync.');
    } finally {
      setSyncing(false);
      setTimeout(() => setToastMessage(null), 8000);
    }
  };

  const checkIsOverdue = (dueDate, status) => {
    if (!dueDate) return false;
    const currentStatus = (status || '').toLowerCase();
    if (
      currentStatus === 'completed' ||
      currentStatus === 'complete' ||
      currentStatus === 'declined' ||
      currentStatus === 'decline'
    ) {
      return false;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    return due < today;
  };

  const getStatusBadgeConfig = (status, isOverdue) => {
    if (isOverdue) {
      return { text: 'Overdue', className: 'bg-rose-50 text-rose-700 border-rose-200 font-extrabold', icon: AlertTriangle };
    }
    const lower = (status || '').toLowerCase();
    if (lower === 'completed' || lower === 'complete') {
      return { text: 'Completed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCheck };
    }
    if (lower === 'accept' || lower === 'accepted' || lower === 'in progress') {
      return { text: 'Accepted', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: CheckSquare };
    }
    if (lower === 'decline' || lower === 'declined') {
      return { text: 'Declined', className: 'bg-rose-50 text-rose-700 border-rose-200', icon: X };
    }
    if (lower.includes('forward')) {
      return { text: 'Forwarded', className: 'bg-sky-50 text-sky-700 border-sky-200', icon: Send };
    }
    return { text: 'Task Assigned', className: 'bg-blue-50 text-blue-700 border-blue-200', icon: Clock };
  };

  useEffect(() => {
    if (!selectedActivity) {
      setModalReplies([]);
      setModalReplyText('');
      return;
    }

    const loadReplies = async () => {
      setModalRepliesLoading(true);
      try {
        if (selectedActivity.itemType === 'task') {
          const res = await fetchStaffTaskReplies(selectedActivity.taskId);
          setModalReplies(res || selectedActivity.replies || []);
        } else if (selectedActivity.interactionId) {
          await fetchReplies(selectedActivity.interactionId);
          const fresh = useStore.getState().repliesByInteraction[selectedActivity.interactionId];
          setModalReplies(fresh || selectedActivity.replies || []);
        }
      } catch (err) {
        console.error('Error fetching replies for modal:', err);
        setModalReplies(selectedActivity.replies || []);
      } finally {
        setModalRepliesLoading(false);
      }
    };

    loadReplies();
  }, [selectedActivity?.taskId, selectedActivity?.interactionId]);

  const handleModalReplySubmit = async (e) => {
    e?.preventDefault();
    const text = modalReplyText.trim();
    if (!text || !selectedActivity || submittingModalReply) return;

    setSubmittingModalReply(true);
    try {
      if (selectedActivity.itemType === 'task') {
        const newReply = await addStaffTaskReply(selectedActivity.taskId, text);
        if (newReply) {
          setModalReplies(prev => [...prev, newReply]);
          setModalReplyText('');
          setSelectedActivity(prev => ({
            ...prev,
            replies: [...(prev.replies || []), newReply]
          }));
          setAllActivities(prev => prev.map(a => a.taskId === selectedActivity.taskId ? {
            ...a,
            replies: [...(a.replies || []), newReply]
          } : a));
        }
      } else if (selectedActivity.interactionId) {
        const newReply = await replyToInteraction(selectedActivity.interactionId, text);
        if (newReply) {
          setModalReplies(prev => [...prev, newReply]);
          setModalReplyText('');
          setSelectedActivity(prev => ({
            ...prev,
            replies: [...(prev.replies || []), newReply]
          }));
          setAllActivities(prev => prev.map(a => a.interactionId === selectedActivity.interactionId ? {
            ...a,
            replies: [...(a.replies || []), newReply]
          } : a));
        }
      }
    } catch (err) {
      console.error('Error submitting reply in modal:', err);
    } finally {
      setSubmittingModalReply(false);
    }
  };

  const handleOpenStatusDialog = (action, targetItem, isMention = false, interactionId = null) => {
    setStatusActionDialog({
      isOpen: true,
      action,
      targetItem,
      isMention,
      interactionId
    });
    setStatusDialogNote('');
    setForwardAssigneeUid('');
  };

  const handleStatusActionConfirm = async (e) => {
    e?.preventDefault();
    const { action, targetItem, isMention, interactionId } = statusActionDialog;
    if (!targetItem || statusDialogSubmitting) return;

    setStatusDialogSubmitting(true);
    try {
      let finalStatus = action;
      if (action === 'Accept') finalStatus = 'Accepted';
      if (action === 'Complete') finalStatus = 'Completed';
      if (action === 'Forward') finalStatus = 'Forwarded';
      if (action === 'Decline') finalStatus = 'Declined';

      const selectedStaff = forwardAssigneeUid ? (staffList || []).find(s => s.uid === forwardAssigneeUid) : null;
      const note = statusDialogNote.trim();

      if (isMention && interactionId) {
        const ok = await updateTaskStatus(
          interactionId,
          targetItem.uid,
          finalStatus,
          note,
          selectedStaff?.uid || '',
          selectedStaff?.name || '',
          finalStatus === 'Completed' ? new Date().toISOString() : null
        );

        if (ok) {
          if (note) {
            let replyText = `[Task ${finalStatus}] Note: ${note}`;
            if (selectedStaff) replyText = `[Task Forwarded to @${selectedStaff.name}] Note: ${note}`;
            await replyToInteraction(interactionId, replyText);
            const freshReplies = useStore.getState().repliesByInteraction[interactionId];
            if (freshReplies) setModalReplies(freshReplies);
          }

          setSelectedActivity(prev => {
            if (!prev) return prev;
            const updatedMentions = (prev.actionMentions || []).map(m => {
              if (m.uid === targetItem.uid) {
                return {
                  ...m,
                  status: finalStatus,
                  forwardedToName: selectedStaff?.name || m.forwardedToName,
                  forwardedToUid: selectedStaff?.uid || m.forwardedToUid,
                  completionNote: finalStatus === 'Completed' ? note : m.completionNote,
                  comments: note || m.comments
                };
              }
              return m;
            });
            return { ...prev, actionMentions: updatedMentions };
          });

          setAllActivities(prev => prev.map(a => {
            if (a.interactionId === interactionId) {
              const updatedMentions = (a.actionMentions || []).map(m => {
                if (m.uid === targetItem.uid) {
                  return {
                    ...m,
                    status: finalStatus,
                    forwardedToName: selectedStaff?.name || m.forwardedToName
                  };
                }
                return m;
              });
              return { ...a, actionMentions: updatedMentions };
            }
            return a;
          }));
        }
      } else {
        const ok = await updateStaffTaskStatus(
          targetItem.taskId,
          finalStatus,
          finalStatus === 'Completed' ? note : '',
          note,
          selectedStaff?.uid || '',
          selectedStaff?.name || ''
        );

        if (ok) {
          if (note) {
            let replyText = `[Task ${finalStatus}] Note: ${note}`;
            if (selectedStaff) replyText = `[Task Forwarded to @${selectedStaff.name}] Note: ${note}`;
            const added = await addStaffTaskReply(targetItem.taskId, replyText);
            if (added) setModalReplies(prev => [...prev, added]);
          }

          setSelectedActivity(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              status: finalStatus,
              forwardedToName: selectedStaff?.name || prev.forwardedToName,
              forwardedToUid: selectedStaff?.uid || prev.forwardedToUid,
              completionNote: finalStatus === 'Completed' ? note : prev.completionNote,
              acceptNote: finalStatus === 'Accepted' ? note : prev.acceptNote,
              declineReason: finalStatus === 'Declined' ? note : prev.declineReason
            };
          });

          setAllActivities(prev => prev.map(a => {
            if (a.taskId === targetItem.taskId) {
              return {
                ...a,
                status: finalStatus,
                forwardedToName: selectedStaff?.name || a.forwardedToName
              };
            }
            return a;
          }));
        }
      }

      setStatusActionDialog({ isOpen: false, action: '', targetItem: null, isMention: false, interactionId: null });
    } catch (err) {
      console.error('Error changing task status:', err);
    } finally {
      setStatusDialogSubmitting(false);
    }
  };

  const getSourceIcon = (source) => {
    switch(source) {
      case 'Outlook Mail': return <Mail className="w-4 h-4 text-blue-400" />;
      case 'Teams Chat': return <MessageSquare className="w-4 h-4 text-purple-400" />;
      case 'Phone': return <Phone className="w-4 h-4 text-emerald-400" />;
      case 'Face to Face': return <Users className="w-4 h-4 text-amber-400" />;
      case 'Teams Meeting': return <Video className="w-4 h-4 text-rose-400" />;
      default: return <MessageSquare className="w-4 h-4 text-slate-400" />;
    }
  };

  const renderTimelineItem = (item) => {
    const isTask = item.itemType === 'task';
    const idKey = isTask ? item.taskId : item.interactionId;
    const isTaskOverdue = isTask ? checkIsOverdue(item.dueDate, item.status) : false;
    const taskStatusCfg = getStatusBadgeConfig(item.status, isTaskOverdue);
    const TaskStatusIcon = taskStatusCfg.icon;
    const hasMentions = Array.isArray(item.actionMentions) && item.actionMentions.length > 0;
    const repliesCount = Array.isArray(item.replies) ? item.replies.length : 0;

    return (
      <div 
        key={idKey} 
        onClick={() => setSelectedActivity(item)}
        className="bg-dark-900/60 p-5 rounded-2xl border border-slate-800/80 hover:border-primary/50 cursor-pointer transition-all hover:bg-slate-800/30 shadow-md mb-4 flex flex-col gap-3 group"
      >
        <div className="flex items-center justify-between text-xs font-black">
          <div className="flex items-center gap-2">
            {!isTask ? (
              <>
                {getSourceIcon(item.source)}
                <span className="bg-slate-800 text-slate-205 border border-slate-700 px-3 py-1 rounded-full text-[10px] tracking-wide uppercase">
                  {item.source} {item.isOther ? '(Other User)' : ''}
                </span>
              </>
            ) : (
              <>
                <CheckSquare className="w-4 h-4 text-amber-400" />
                <span className="bg-slate-800 text-slate-205 border border-slate-700 px-3 py-1 rounded-full text-[10px] tracking-wide uppercase">
                  Task
                </span>
                {item.priority && (
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                    item.priority === 'High' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                    item.priority === 'Medium' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                    'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {item.priority}
                  </span>
                )}
                {isTaskOverdue && (
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-rose-600/30 text-rose-300 border border-rose-500/40">
                    Overdue
                  </span>
                )}
              </>
            )}
          </div>
          <span className="text-slate-400 font-bold group-hover:text-slate-300 transition-colors">
            {isTask
              ? (item.dueDate ? `Due: ${formatDate(item.dueDate)}` : formatDateTime(item.date, item.time, item.timestamp))
              : formatDateTime(item.date, item.time, item.timestamp)}
          </span>
        </div>
        
        {(!isTask && (item.isOther || uid === 'all' || item.loggedByUid !== user?.uid)) && (
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 mt-1">
            <User className="w-3.5 h-3.5" /> Logged by: <span className="text-primary">{item.loggedByName || item.loggedByUid}</span>
          </div>
        )}

        <div className="space-y-1.5 mt-1">
          <h4 className="text-base font-extrabold text-slate-100 leading-relaxed">
            {isTask ? item.title : (item.subject || (item.messageText ? item.messageText.split('\n')[0] : 'Interaction Note'))}
          </h4>
          
          {isTask && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-2 gap-2">
              <span className={`font-black text-xs flex items-center gap-1.5 ${
                isTaskOverdue ? 'text-rose-400' :
                item.status === 'Completed' ? 'text-emerald-400' :
                item.status === 'Accepted' ? 'text-amber-400' :
                item.status === 'Forwarded' ? 'text-sky-400' :
                item.status === 'Declined' ? 'text-rose-400' : 'text-blue-400'
              }`}>
                <TaskStatusIcon className="w-3.5 h-3.5" />
                {item.status === 'Forwarded' && item.forwardedToName ? `Forwarded to @${item.forwardedToName}` : taskStatusCfg.text}
              </span>
              <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider text-slate-500">
                <span>From: {item.assignedByName}</span>
                {uid === 'all' && (
                  <>
                    <span className="text-slate-700">•</span>
                    <span>To: {item.assignedToName || item.assignedToUid}</span>
                  </>
                )}
              </div>
            </div>
          )}
          
          <p className="text-xs text-slate-400 font-semibold line-clamp-2 mt-2">
            {isTask ? item.description : item.messageText}
          </p>

          {/* Associated Tasks Pill for interactions */}
          {!isTask && hasMentions && (
            <div className="flex items-center gap-2 pt-2">
              <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                <ClipboardList className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  {item.actionMentions.length === 1
                    ? (item.actionMentions[0].task || `Task: @${item.actionMentions[0].name}`)
                    : `${item.actionMentions.length} Associated Tasks`}
                </span>
                {item.actionMentions[0].status && (
                  <span className="ml-1 text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-200">
                    {item.actionMentions[0].status}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Footer Info: Replies Count */}
          {repliesCount > 0 && (
            <div className="pt-2 border-t border-slate-800/60 mt-1 flex items-center justify-end text-[10px] font-bold text-slate-400">
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3 text-primary" />
                {repliesCount} {repliesCount === 1 ? 'reply' : 'replies'}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Real Analysis from Database Signals and AI Sentiment
  const getActivityRisk = (activity) => {
    if (!activity) return { level: 'Low Risk', color: 'text-emerald-600', bg: 'bg-emerald-50' };

    // Task evaluation
    if (activity.itemType === 'task') {
      const isComplete = ['completed', 'complete'].includes((activity.status || '').toLowerCase());
      const isOverdue = activity.status === 'Overdue' || (activity.dueDate && new Date(activity.dueDate) < new Date() && !isComplete);
      if (isOverdue) {
        return { level: 'High Risk', color: 'text-rose-600', bg: 'bg-rose-50' };
      }
      return { level: 'Medium Risk', color: 'text-amber-600', bg: 'bg-amber-50' };
    }

    // Interaction evaluation
    if (activity.riskDetected || activity.sentiment === 'Negative' || (activity.sentimentScore != null && activity.sentimentScore < -0.2)) {
      return { level: 'High Risk', color: 'text-rose-600', bg: 'bg-rose-50' };
    }

    const text = ((activity.messageText || '') + ' ' + (activity.subject || '')).toLowerCase();
    if (text.includes('escalat') || text.includes('delay') || text.includes('issue') || text.includes('breach') || text.includes('cancel')) {
      return { level: 'High Risk', color: 'text-rose-600', bg: 'bg-rose-50' };
    }
    if (activity.sentiment === 'Neutral' || text.includes('sync') || text.includes('review') || text.includes('discuss')) {
      return { level: 'Medium Risk', color: 'text-amber-600', bg: 'bg-amber-50' };
    }
    return { level: 'Low Risk', color: 'text-emerald-600', bg: 'bg-emerald-50' };
  };

  const getActivityHealth = (riskLevel) => {
    if (riskLevel === 'High Risk') return { change: '-10 pts', status: 'Downtrend Impact', color: 'text-rose-600' };
    if (riskLevel === 'Medium Risk') return { change: '0 pts', status: 'Stable / Neutral', color: 'text-gray-500' };
    return { change: '+5 pts', status: 'Improving', color: 'text-emerald-600' };
  };

  const getActivityNextSteps = (activity, riskLevel) => {
    if (activity?.itemType === 'task') {
      const isComplete = ['completed', 'complete'].includes((activity.status || '').toLowerCase());
      if (!isComplete) {
        return [
          `Coordinate with ${activity.assignedToName || 'assigned owner'} to track milestone completion`,
          "Review deliverable requirements and remove blockers with client contacts",
          "Record intermediate execution notes in CustomerPulse"
        ];
      }
      return ["Verify all deliverables meet stakeholder requirements", "Archive task records"];
    }

    if (riskLevel === 'High Risk') {
      return [
        `Schedule an executive alignment call regarding ${activity?.subject || 'recent issue'}`,
        "Formulate a technical and delivery remediation roadmap",
        "Document follow-up commitments and assign resolution tasks"
      ];
    }

    return [
      "Follow up on action items and commitments agreed upon in this exchange",
      "Maintain active communication cadence to retain healthy engagement"
    ];
  };

  const renderSmartInsights = () => {
    if (!explanationData || !explanationData.factors) return null;
    
    const { healthScore, status, factors } = explanationData;
    const isAtRisk = status === 'Critical' || status === 'At Risk' || status === 'Warning';
    const rawHistory = Array.isArray(healthHistory?.history) ? healthHistory.history : [];
    const trendData = rawHistory.length > 0
      ? rawHistory.map(h => ({
          name: h.timestamp ? formatDate(h.timestamp) : 'Score',
          score: typeof h.score === 'number' ? h.score : typeof h.healthScore === 'number' ? h.healthScore : 65
        }))
      : [
          { name: 'Prior', score: Math.min(100, Math.max(0, healthScore - (explanationData?.changeLast30Days || 0))) },
          { name: 'Current', score: healthScore }
        ];

    return (
      <div className="glass p-6 rounded-2xl border border-slate-800/80 w-full mb-6 relative">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            <Lightbulb className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-wider">Smart Insights</h2>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">Key insights, trends and recommendations for this account</p>
            </div>
          </div>
          <span className="text-xs text-slate-500 font-bold">Last updated: {formatDate(new Date().toISOString())}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Account Health */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-md flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-6">
              <Heart className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-white">Account Health</span>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <span className="text-5xl font-black text-white">{healthScore}</span>
                  <span className="text-xl text-slate-500 font-bold">/ 100</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide border ${
                    isAtRisk ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  }`}>
                    {isAtRisk ? <AlertTriangle className="w-3 h-3 inline mr-1" /> : <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                    {status}
                  </span>
                </div>
                <div className={`text-sm font-bold flex items-center gap-1 ${isAtRisk ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {isAtRisk ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                  8 pts <span className="text-slate-500 font-medium">in last 30 days</span>
                </div>
              </div>
              <div className="w-full sm:w-48 h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <XAxis dataKey="name" hide />
                    <YAxis domain={[0, 100]} hide />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#e2e8f0', fontWeight: 'bold' }}
                    />
                    <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} />
                    <XAxis dataKey="name" hide />
                    <YAxis domain={[0, 100]} hide />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#e2e8f0', fontWeight: 'bold' }}
                    />
                    <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Why this score? */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-md">
            <div className="flex items-start gap-2 mb-4">
              <div className="mt-0.5"><Lightbulb className="w-4 h-4 text-slate-400" /></div>
              <div>
                <div className="text-sm font-bold text-white">Why this score?</div>
                <div className="text-xs text-slate-400 mt-0.5">This score is based on several positive and negative factors from recent activity.</div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <div className="flex justify-between text-[10px] font-black uppercase text-rose-400 border-b border-slate-800 pb-1 mb-2">
                  <span>Negative Factors</span>
                  <span>Impact</span>
                </div>
                <div className="space-y-2">
                  {factors.riskSignals?.signals?.slice(0,2).map((sig, i) => (
                    <div key={i} className="flex justify-between items-start text-xs gap-2">
                      <div className="flex items-start gap-1.5 flex-1 min-w-0">
                        <MinusCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        <span className="text-slate-300 font-medium truncate" title={sig}>{sig}</span>
                      </div>
                      <span className="text-rose-400 font-bold shrink-0">-15 pts</span>
                    </div>
                  ))}
                  {!factors.riskSignals?.signals?.length && (
                    <div className="text-xs text-slate-500 italic">None detected</div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-black uppercase text-emerald-400 border-b border-slate-800 pb-1 mb-2">
                  <span>Positive Factors</span>
                  <span>Impact</span>
                </div>
                <div className="space-y-2">
                  {factors.stakeholders?.signals?.slice(0,2).map((sig, i) => (
                    <div key={i} className="flex justify-between items-start text-xs gap-2">
                      <div className="flex items-start gap-1.5 flex-1 min-w-0">
                        <PlusCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-slate-300 font-medium truncate" title={sig}>{sig}</span>
                      </div>
                      <span className="text-emerald-400 font-bold shrink-0">+10 pts</span>
                    </div>
                  ))}
                  {!factors.stakeholders?.signals?.length && (
                    <div className="text-xs text-slate-500 italic">None detected</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-5 flex gap-3">
            <FileText className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-white mb-1">What's happening?</div>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">
                {factors.sentiment?.reason || "Relationship health is showing some fluctuations. Engagement with key business stakeholders has been steady but we notice a slight negative trend in recent communications."}
              </p>
            </div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-5 flex gap-3">
            <ArrowRightCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-white mb-1">Why this matters</div>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">
                {factors.riskSignals?.reason || "Continued lack of business-level engagement and unresolved delivery issues could increase relationship risk and impact future opportunities."}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-white">Signals Detected</span>
            </div>
            <span className="text-xs text-primary font-bold cursor-pointer hover:underline">View all signals →</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-rose-500/10 rounded-lg text-rose-400 shrink-0"><AlertTriangle className="w-4 h-4" /></div>
                <div>
                  <div className="text-xs font-bold text-white">Delivery risk</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Open for 12 days</div>
                </div>
              </div>
              <div className="mt-auto">
                <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 text-[9px] font-black tracking-wide uppercase rounded">High Impact</span>
              </div>
            </div>
            
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-rose-500/10 rounded-lg text-rose-400 shrink-0"><Users className="w-4 h-4" /></div>
                <div>
                  <div className="text-xs font-bold text-white">Relationship gap</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Business Sponsor not contacted for 47 days</div>
                </div>
              </div>
              <div className="mt-auto">
                <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 text-[9px] font-black tracking-wide uppercase rounded">High Impact</span>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400 shrink-0"><MessageSquare className="w-4 h-4" /></div>
                <div>
                  <div className="text-xs font-bold text-white">Sentiment decline</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Negative sentiment in 2 of last 3 interactions</div>
                </div>
              </div>
              <div className="mt-auto">
                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[9px] font-black tracking-wide uppercase rounded">Medium Impact</span>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400 shrink-0"><Activity className="w-4 h-4" /></div>
                <div>
                  <div className="text-xs font-bold text-white">Technical engagement</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">4 interactions with technical stakeholders this month</div>
                </div>
              </div>
              <div className="mt-auto">
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-black tracking-wide uppercase rounded">Positive</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-white">Recommended Actions</span>
            </div>
            <span className="text-xs text-primary font-bold cursor-pointer hover:underline">View all actions →</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-primary/40 text-primary flex items-center justify-center text-[10px] font-black shrink-0">1</div>
                <div>
                  <div className="text-xs font-bold text-white mb-1">Reconnect with Business Sponsor</div>
                  <div className="text-[10px] text-slate-400 font-medium">No interaction detected for 47 days. Schedule an executive connect to strengthen engagement.</div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-800/50">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold">
                  <Clock className="w-3.5 h-3.5" /> Suggested due date: {formatDate(new Date(Date.now() + 86400000 * 3).toISOString())}
                </div>
                <button onClick={() => navigate('/staff-tasks/new', { state: { preselectAccountId: id, from: location.pathname + location.search } })} className="bg-primary hover:bg-blue-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors shadow-lg cursor-pointer">
                  Create Task
                </button>
              </div>
            </div>
            
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-primary/40 text-primary flex items-center justify-center text-[10px] font-black shrink-0">2</div>
                <div>
                  <div className="text-xs font-bold text-white mb-1">Review unresolved delivery risk</div>
                  <div className="text-[10px] text-slate-400 font-medium">Risk has remained open for 12 days. Review resolution status with delivery owner and align on next steps.</div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-800/50">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold">
                  <Clock className="w-3.5 h-3.5" /> Suggested due date: {formatDate(new Date(Date.now() + 86400000 * 1).toISOString())}
                </div>
                <button onClick={() => navigate('/staff-tasks/new', { state: { preselectAccountId: id, from: location.pathname + location.search } })} className="bg-primary hover:bg-blue-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors shadow-lg cursor-pointer">
                  Create Task
                </button>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-primary/40 text-primary flex items-center justify-center text-[10px] font-black shrink-0">3</div>
                <div>
                  <div className="text-xs font-bold text-white mb-1">Follow up on customer concerns</div>
                  <div className="text-[10px] text-slate-400 font-medium">Negative sentiment detected in recent interactions. Arrange a customer follow-up to address concerns.</div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-3 border-t border-slate-800/50">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold">
                  <Clock className="w-3.5 h-3.5" /> Suggested due date: {formatDate(new Date(Date.now() + 86400000 * 2).toISOString())}
                </div>
                <button onClick={() => navigate('/staff-tasks/new', { state: { preselectAccountId: id, from: location.pathname + location.search } })} className="bg-primary hover:bg-blue-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors shadow-lg cursor-pointer">
                  Create Task
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    );
  };

  const getOverallStats = () => {
    if (allActivities.length === 0) return null;

    let totalScore = 0;
    let highestRisk = 'Low Risk';
    let allStepsMap = new Map();
    
    allActivities.forEach(a => {
      const risk = getActivityRisk(a);
      const health = getActivityHealth(risk.level);
      const steps = getActivityNextSteps(a, risk.level);
      
      const pts = parseInt(health.change.replace(/[^-\d]/g, '')) || 0;
      totalScore += pts;

      if (risk.level === 'High Risk') highestRisk = 'High Risk';
      else if (risk.level === 'Medium Risk' && highestRisk !== 'High Risk') highestRisk = 'Medium Risk';

      steps.forEach(s => {
        if (!allStepsMap.has(s)) {
          allStepsMap.set(s, a);
        }
      });
    });

    const riskColor = highestRisk === 'High Risk' ? 'text-rose-400' : (highestRisk === 'Medium Risk' ? 'text-amber-400' : 'text-emerald-400');
    const riskBg = highestRisk === 'High Risk' ? 'bg-rose-400/10' : (highestRisk === 'Medium Risk' ? 'bg-amber-400/10' : 'bg-emerald-400/10');
    
    const healthStatus = totalScore < 0 ? 'Trending Down' : (totalScore === 0 ? 'Stable' : 'Improving');
    const healthColor = totalScore < 0 ? 'text-rose-400' : (totalScore === 0 ? 'text-slate-300' : 'text-emerald-400');
    const healthChangeStr = totalScore > 0 ? `+${totalScore} pts` : `${totalScore} pts`;

    const topSteps = Array.from(allStepsMap.entries()).slice(0, 3).map(([text, item]) => ({ text, item }));
    
    let summary = "The account is showing positive engagement and steady progress. Recent interactions have been productive.";
    if (highestRisk === 'High Risk') {
      summary = "The account relationship is currently under strain. Recent interactions flag potential risks—particularly around delays or pending issues. Immediate action is recommended to stabilize account health.";
    }

    return {
      totalScore, healthStatus, healthColor, healthChangeStr,
      highestRisk, riskColor, riskBg,
      topSteps, summary
    };
  };

  return (
    <div className="space-y-6 w-full mx-auto py-4 px-4 h-auto relative">
      {/* Header Toolbar */}
      <div className="glass p-6 rounded-2xl border border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl relative z-50">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              if (location.state?.from) {
                navigate(location.state.from);
              } else if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate(`/accounts/${id}`);
              }
            }}
            className="back-btn"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
            <span>Back</span>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-wide">Account Overview</h1>
            <div className="flex items-center gap-3 text-sm text-slate-400 mt-2 font-bold">
              <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-primary" /> {account?.companyName || 'Loading...'}</span>
              <div className="flex items-center gap-1.5 relative" ref={dropdownRef}>
                <User className="w-4 h-4 text-primary" /> Tracking User: 
                <div 
                  className="relative flex items-center gap-1 cursor-pointer bg-primary/10 border border-primary/20 hover:border-primary/50 text-primary px-3 py-1 rounded-lg ml-1 transition-colors"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <span>{associatedUsers.find(u => u.uid === uid)?.name || (uid === user?.uid ? 'Me' : uid)}</span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                </div>
                {isDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-64 glass border border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 animate-soft-pulse max-h-64 overflow-y-auto">
                    {associatedUsers.map(u => (
                      <div 
                        key={u.uid}
                        onClick={() => {
                          setIsDropdownOpen(false);
                          navigate(`/accounts/${id}/user-activity/${u.uid}`);
                        }}
                        className={`px-3 py-2.5 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-2 ${
                          u.uid === uid 
                            ? 'bg-primary/15 text-primary' 
                            : 'text-slate-350 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        {u.uid === 'all' ? <Users className="w-3.5 h-3.5 opacity-70" /> : <User className="w-3.5 h-3.5 opacity-70" />}
                        {u.uid === user?.uid ? 'Me' : u.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Live Auto-Sync Indicator */}
        <div className="flex gap-2 relative z-50">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Live Auto-Sync Active</span>
          </div>
        </div>
      </div>

      {renderSmartInsights()}

      <div className="glass p-6 rounded-2xl border border-slate-800/80 w-full">
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-400 border-b border-slate-850 pb-3 mb-6 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" /> Recent Activity
        </h3>
        
        <div className="space-y-2">
          {allActivities.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-500 font-bold">No activities found for this user in this account.</div>
          ) : (
            allActivities.map(item => renderTimelineItem(item))
          )}
        </div>
      </div>

      {/* Detailed View Modal */}
      {selectedActivity && (() => {
        const isTask = selectedActivity.itemType === 'task';
        const isTaskOverdue = isTask ? checkIsOverdue(selectedActivity.dueDate, selectedActivity.status) : false;
        const taskStatusCfg = getStatusBadgeConfig(selectedActivity.status, isTaskOverdue);
        const TaskStatusIcon = taskStatusCfg.icon;
        const hasAssociatedTasks = Array.isArray(selectedActivity.actionMentions) && selectedActivity.actionMentions.length > 0;
        const hasAttachments = Array.isArray(selectedActivity.attachments) && selectedActivity.attachments.length > 0;
        const isAssignedToMe = isTask && (
          selectedActivity.assignedToUid === user?.uid ||
          (selectedActivity.assignedToName && user?.name && selectedActivity.assignedToName.toLowerCase().replace('@', '').trim() === user?.name.toLowerCase().replace('@', '').trim())
        );
        const isTaskFinal = isTask && (
          (selectedActivity.status || '').toLowerCase() === 'completed' ||
          (selectedActivity.status || '').toLowerCase() === 'complete' ||
          (selectedActivity.status || '').toLowerCase() === 'declined' ||
          (selectedActivity.status || '').toLowerCase() === 'decline' ||
          (selectedActivity.status || '').toLowerCase() === 'accepted & completed' ||
          isTaskOverdue
        );

        // Compute combined replies
        const extraNotes = [];
        if (isTask) {
          if (selectedActivity.acceptNote) {
            extraNotes.push({
              replyId: 'note-accept',
              authorName: selectedActivity.assignedToName || 'Assignee',
              authorUid: selectedActivity.assignedToUid,
              text: `Acceptance Note: ${selectedActivity.acceptNote}`,
              timestamp: selectedActivity.timestamp
            });
          }
          if (selectedActivity.completionNote && !modalReplies.some(r => (r.text || '').startsWith('Task Completion Note:'))) {
            extraNotes.push({
              replyId: 'note-complete',
              authorName: selectedActivity.assignedToName || 'Assignee',
              authorUid: selectedActivity.assignedToUid,
              text: `Task Completion Note: ${selectedActivity.completionNote}`,
              timestamp: selectedActivity.completionDate || selectedActivity.timestamp
            });
          }
          if (selectedActivity.declineReason) {
            extraNotes.push({
              replyId: 'note-decline',
              authorName: selectedActivity.assignedToName || 'Assignee',
              authorUid: selectedActivity.assignedToUid,
              text: `Decline Reason: ${selectedActivity.declineReason}`,
              timestamp: selectedActivity.timestamp
            });
          }
        }

        const combinedReplies = [...modalReplies, ...extraNotes].sort((a, b) => {
          const timeA = a.timestamp ? new Date(a.timestamp) : new Date(0);
          const timeB = b.timestamp ? new Date(b.timestamp) : new Date(0);
          return timeA - timeB;
        });

        return (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedActivity(null)}
          >
            <div
              className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col my-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50/70">
                <div className="space-y-1.5 flex-1 pr-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-[10px] font-black tracking-wide uppercase">
                      {isTask ? 'Staff Task' : selectedActivity.source}
                    </span>

                    {isTask && (
                      <>
                        {selectedActivity.priority && (
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase border ${
                            selectedActivity.priority === 'High' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            selectedActivity.priority === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-gray-100 text-gray-700 border-gray-200'
                          }`}>
                            Priority: {selectedActivity.priority}
                          </span>
                        )}
                        <span className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase border ${taskStatusCfg.className}`}>
                          <TaskStatusIcon className="w-3 h-3" />
                          {taskStatusCfg.text}
                        </span>
                      </>
                    )}

                    {!isTask && selectedActivity.sentiment && (
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-wide uppercase border ${
                        selectedActivity.sentiment === 'Positive' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        selectedActivity.sentiment === 'Negative' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        'bg-gray-100 text-gray-700 border-gray-200'
                      }`}>
                        {selectedActivity.sentiment} Sentiment
                      </span>
                    )}

                    <span className="text-xs text-gray-500 font-bold">
                      {isTask
                        ? (selectedActivity.dueDate ? `Due: ${formatDate(selectedActivity.dueDate)}` : formatDateTime(selectedActivity.date, selectedActivity.time, selectedActivity.timestamp))
                        : formatDateTime(selectedActivity.date, selectedActivity.time, selectedActivity.timestamp)}
                    </span>
                  </div>

                  <h2 className="text-xl font-black text-gray-900 leading-snug">
                    {isTask ? selectedActivity.title : (selectedActivity.subject || 'Interaction Details')}
                  </h2>
                </div>

                <button 
                  onClick={() => setSelectedActivity(null)} 
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body - Scrollable */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-white">
                
                {/* Details & Transcript */}
                <div className="space-y-2">
                  <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" /> Details & Transcript
                  </h3>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm text-gray-700 font-medium leading-relaxed whitespace-pre-wrap">
                    {isTask ? selectedActivity.description : selectedActivity.messageText}
                  </div>
                </div>

                {/* 1. STAFF-TO-STAFF TASK DETAILS CARD */}
                {isTask && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2.5">
                      <h4 className="text-xs font-bold text-gray-600 uppercase tracking-widest flex items-center gap-2">
                        <CheckSquare className="w-4 h-4 text-primary" /> Staff Task Assignment Details
                      </h4>
                      <span className="text-[11px] font-bold text-gray-500">
                        Task ID: <span className="font-mono text-gray-700">{selectedActivity.taskId}</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Assigned By */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Assigned By</span>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 text-primary font-black text-xs flex items-center justify-center shrink-0">
                            {selectedActivity.assignedByName ? selectedActivity.assignedByName.substring(0, 2).toUpperCase() : 'AD'}
                          </div>
                          <div>
                            <span className="font-bold text-gray-900 text-xs block">
                              {selectedActivity.assignedByName || 'Admin User'}
                            </span>
                            <span className="text-[10px] text-gray-400 font-medium block">
                              Author / Creator
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Assigned To */}
                      <div className="space-y-1.5 border-t sm:border-t-0 sm:border-l border-gray-200 pt-3 sm:pt-0 sm:pl-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Assigned To</span>
                          <span className={`inline-block px-2.5 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${taskStatusCfg.className}`}>
                            {selectedActivity.status === 'Forwarded' && selectedActivity.forwardedToName 
                              ? `Forwarded to @${selectedActivity.forwardedToName}` 
                              : taskStatusCfg.text}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-300 text-amber-700 font-black text-xs flex items-center justify-center shrink-0">
                            {selectedActivity.assignedToName ? selectedActivity.assignedToName.substring(0, 2).toUpperCase() : 'ST'}
                          </div>
                          <div>
                            <span className="font-bold text-gray-900 text-xs block">
                              @{selectedActivity.assignedToName || 'Staff Member'}
                            </span>
                            <span className="text-[10px] text-gray-400 font-medium block">
                              Responsible Assignee
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Metadata Pill Row */}
                    <div className="flex items-center gap-3 pt-3 border-t border-gray-200 flex-wrap text-xs">
                      {selectedActivity.priority && (
                        <span className={`px-2 py-0.5 rounded-md border font-bold text-[11px] ${
                          selectedActivity.priority === 'High' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          selectedActivity.priority === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-gray-100 text-gray-700 border-gray-200'
                        }`}>
                          Priority: {selectedActivity.priority}
                        </span>
                      )}
                      {selectedActivity.dueDate && (
                        <span className={`px-2 py-0.5 rounded-md border font-bold text-[11px] flex items-center gap-1 ${
                          isTaskOverdue ? 'bg-rose-100 text-rose-800 border-rose-300 font-black' : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          <Clock className="w-3.5 h-3.5" />
                          Due Date: {formatDate(selectedActivity.dueDate)} {isTaskOverdue && '(OVERDUE)'}
                        </span>
                      )}
                    </div>

                    {/* Notes & Status Details */}
                    {(selectedActivity.completionNote || selectedActivity.acceptNote || selectedActivity.declineReason || selectedActivity.forwardedToName) && (
                      <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-1.5 text-xs">
                        {selectedActivity.acceptNote && (
                          <div className="text-gray-700"><span className="font-bold text-amber-700">Acceptance Note:</span> {selectedActivity.acceptNote}</div>
                        )}
                        {selectedActivity.completionNote && (
                          <div className="text-gray-700"><span className="font-bold text-emerald-700">Completion Note:</span> {selectedActivity.completionNote}</div>
                        )}
                        {selectedActivity.declineReason && (
                          <div className="text-gray-700"><span className="font-bold text-rose-700">Decline Reason:</span> {selectedActivity.declineReason}</div>
                        )}
                        {selectedActivity.forwardedToName && (
                          <div className="text-gray-700"><span className="font-bold text-sky-700">Forwarded To:</span> @{selectedActivity.forwardedToName}</div>
                        )}
                      </div>
                    )}

                    {/* Status Updation Flow (following other pages) */}
                    <div className="pt-3 border-t border-gray-200 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-bold text-gray-600">Status:</span>
                      {isTaskFinal ? (
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-lg border text-xs font-black uppercase tracking-wider ${taskStatusCfg.className}`}>
                            {isTaskOverdue ? 'Overdue' : taskStatusCfg.text}
                          </span>
                          <span className="text-xs font-bold text-gray-500 italic">
                            (Status Fixed)
                          </span>
                        </div>
                      ) : isAssignedToMe ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={
                              (selectedActivity.status || '').toLowerCase() === 'accepted' || (selectedActivity.status || '').toLowerCase() === 'in progress' ? 'Accept' :
                              (selectedActivity.status || '').toLowerCase() === 'declined' ? 'Decline' :
                              selectedActivity.status || 'Task Assigned'
                            }
                            onChange={(e) => {
                              const st = e.target.value;
                              if (st === 'Task Assigned' || st === selectedActivity.status) return;
                              handleOpenStatusDialog(st === 'Accept' ? 'Accept' : st === 'Decline' ? 'Decline' : st, selectedActivity, false);
                            }}
                            className="px-3 py-1.5 rounded-xl border border-gray-300 bg-white text-gray-800 text-xs font-bold outline-none focus:border-primary cursor-pointer shadow-sm"
                          >
                            <option value="Task Assigned">Task Assigned</option>
                            <option value="Accept">Accepted</option>
                            <option value="Completed">Completed</option>
                            <option value="Forwarded">Forwarded</option>
                            <option value="Decline">Declined</option>
                          </select>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-lg border text-xs font-black uppercase tracking-wider ${taskStatusCfg.className}`}>
                            {taskStatusCfg.text}
                          </span>
                          <span className="text-xs text-gray-400 italic">
                            (Assigned to @{selectedActivity.assignedToName || 'colleague'})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. ASSOCIATED STAFF TASKS (for interactions that have actionMentions) */}
                {!isTask && hasAssociatedTasks && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2.5">
                      <h4 className="text-xs font-bold text-gray-600 uppercase tracking-widest flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-primary" /> Associated Staff Tasks ({selectedActivity.actionMentions.length})
                      </h4>
                      <span className="text-[11px] text-gray-500 font-bold">Assigned during interaction logging</span>
                    </div>

                    <div className="space-y-3">
                      {selectedActivity.actionMentions.map((mention, mIdx) => {
                        const isMentionOverdue = checkIsOverdue(mention.dueDate, mention.status);
                        const mStatusCfg = getStatusBadgeConfig(mention.status, isMentionOverdue);
                        const MStatusIcon = mStatusCfg.icon;
                        const isMentionAssignedToMe = mention.uid === user?.uid ||
                          (mention.name && user?.name && mention.name.toLowerCase().replace('@', '').trim() === user?.name.toLowerCase().replace('@', '').trim());
                        const isMentionFinal = (mention.status || '').toLowerCase() === 'completed' ||
                                               (mention.status || '').toLowerCase() === 'complete' ||
                                               (mention.status || '').toLowerCase() === 'declined' ||
                                               (mention.status || '').toLowerCase() === 'decline' ||
                                               (mention.status || '').toLowerCase() === 'accepted & completed' ||
                                               isMentionOverdue;

                        return (
                          <div key={mIdx} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-300 text-amber-700 font-black text-xs flex items-center justify-center shrink-0">
                                  {mention.name ? mention.name.substring(0, 2).toUpperCase() : 'ST'}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-xs text-gray-900">@{mention.name}</span>
                                    <span className="text-[10px] text-gray-400 font-medium">Assigned by {selectedActivity.loggedByName || 'Author'}</span>
                                  </div>
                                  <div className="text-[10px] text-gray-500 font-semibold">
                                    {mention.email || ''}
                                  </div>
                                </div>
                              </div>

                              <span className={`flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full border font-bold uppercase shrink-0 ${mStatusCfg.className}`}>
                                <MStatusIcon className="w-3 h-3" />
                                {mention.status === 'Forwarded' && mention.forwardedToName 
                                  ? `Forwarded to @${mention.forwardedToName}` 
                                  : mStatusCfg.text}
                              </span>
                            </div>

                            {/* Task text */}
                            <p className="text-xs text-gray-800 font-semibold leading-relaxed bg-gray-50/80 p-2.5 rounded-lg border border-gray-100">
                              {mention.task || mention.taskHeader || 'Associated task instructions'}
                            </p>

                            {/* Due Date & Priority */}
                            <div className="flex items-center gap-3 text-xs flex-wrap">
                              {mention.priority && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                                  mention.priority === 'High' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                  mention.priority === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                  'bg-gray-100 text-gray-700 border-gray-200'
                                }`}>
                                  Priority: {mention.priority}
                                </span>
                              )}
                              {mention.dueDate && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                                  isMentionOverdue ? 'bg-rose-100 text-rose-800 border-rose-300 font-black' : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}>
                                  <Clock className="w-3 h-3" />
                                  Due: {formatDate(mention.dueDate)} {isMentionOverdue && '(OVERDUE)'}
                                </span>
                              )}
                              {mention.forwardedToName && (
                                <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                                  Forwarded to @${mention.forwardedToName}
                                </span>
                              )}
                              {mention.completionNote && (
                                <span className="text-[10px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  Note: {mention.completionNote}
                                </span>
                              )}
                            </div>

                            {/* Status Updation Flow for associated task */}
                            <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-[11px] font-bold text-gray-500">Status:</span>
                              {isMentionFinal ? (
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${mStatusCfg.className}`}>
                                    {isMentionOverdue ? 'Overdue' : mStatusCfg.text}
                                  </span>
                                  <span className="text-[10px] font-bold text-gray-500 italic">
                                    (Status Fixed)
                                  </span>
                                </div>
                              ) : isMentionAssignedToMe ? (
                                <div className="flex items-center gap-2">
                                  <select
                                    value={
                                      (mention.status || '').toLowerCase() === 'accepted' || (mention.status || '').toLowerCase() === 'in progress' ? 'Accept' :
                                      (mention.status || '').toLowerCase() === 'declined' ? 'Decline' :
                                      mention.status || 'Task Assigned'
                                    }
                                    onChange={(e) => {
                                      const st = e.target.value;
                                      if (st === 'Task Assigned' || st === mention.status) return;
                                      handleOpenStatusDialog(st === 'Accept' ? 'Accept' : st === 'Decline' ? 'Decline' : st, mention, true, selectedActivity.interactionId);
                                    }}
                                    className="px-2.5 py-1 rounded-lg border border-gray-300 bg-white text-gray-800 text-[11px] font-bold outline-none focus:border-primary cursor-pointer shadow-sm"
                                  >
                                    <option value="Task Assigned">Task Assigned</option>
                                    <option value="Accept">Accepted</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Forwarded">Forwarded</option>
                                    <option value="Decline">Declined</option>
                                  </select>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${mStatusCfg.className}`}>
                                    {mStatusCfg.text}
                                  </span>
                                  <span className="text-[10px] text-gray-400 italic">
                                    (Assigned to @{mention.name})
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. ATTACHMENTS CARD */}
                {hasAttachments && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
                    <h4 className="text-xs font-bold text-gray-600 uppercase tracking-widest flex items-center gap-2 border-b border-gray-200 pb-2">
                      <Paperclip className="w-4 h-4 text-gray-500" /> Attached Files ({selectedActivity.attachments.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                      {selectedActivity.attachments.map((file, fIdx) => (
                        <div key={fIdx} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-3 shadow-sm hover:border-primary/50 transition-colors">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-gray-900 truncate">{file.name}</p>
                              <p className="text-[10px] text-gray-400 font-medium">
                                {file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'Attachment'}
                              </p>
                            </div>
                          </div>
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="Download or view file"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. AI INSIGHTS SECTION */}
                <div className="border-t border-gray-200 pt-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Risk Analysis */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-extrabold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" /> Risk Analysis
                      </h4>
                      {(() => {
                        const risk = getActivityRisk(selectedActivity);
                        return (
                          <div className={`${risk.bg} border border-gray-100 p-4 rounded-xl flex items-center gap-3`}>
                            <div className={`p-2 rounded-full bg-white ${risk.color}`}>
                              <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                              <div className={`text-sm font-black ${risk.color}`}>{risk.level}</div>
                              <div className="text-xs text-gray-500 font-bold mt-0.5">Analyzed from live signals</div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Health Score Impact */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-extrabold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-500" /> Health Score Impact
                      </h4>
                      {(() => {
                        const risk = getActivityRisk(selectedActivity);
                        const health = getActivityHealth(risk.level);
                        return (
                          <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl flex items-center gap-3">
                            <div className={`text-2xl font-black ${health.color}`}>
                              {health.change}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-gray-700">Estimated Impact</div>
                              <div className={`text-xs font-bold mt-0.5 ${health.color}`}>{health.status}</div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Next Steps */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-extrabold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                      <ArrowRightCircle className="w-4 h-4 text-primary" /> Recommended Next Steps
                    </h4>
                    <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl space-y-2">
                      {(() => {
                        const risk = getActivityRisk(selectedActivity);
                        const steps = getActivityNextSteps(selectedActivity, risk.level);
                        return steps.map((step, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs text-gray-700 font-medium">
                            <div className="mt-1 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            <span>{step}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        );
      })()}

      {/* Task Status Action Dialog (Accept, Complete, Forward, Decline) */}
      {statusActionDialog.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setStatusActionDialog({ isOpen: false, action: '', targetItem: null, isMention: false, interactionId: null })}
        >
          <div
            className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                {statusActionDialog.action === 'Accept' && <CheckSquare className="w-5 h-5 text-amber-500" />}
                {statusActionDialog.action === 'Complete' && <CheckCheck className="w-5 h-5 text-emerald-500" />}
                {statusActionDialog.action === 'Forward' && <Send className="w-5 h-5 text-sky-500" />}
                {statusActionDialog.action === 'Decline' && <X className="w-5 h-5 text-rose-500" />}
                {statusActionDialog.action} Task
              </h3>
              <button
                onClick={() => setStatusActionDialog({ isOpen: false, action: '', targetItem: null, isMention: false, interactionId: null })}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleStatusActionConfirm} className="space-y-4">
              {/* Forward User Picker */}
              {statusActionDialog.action === 'Forward' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-gray-700">Forward To Staff Member *</label>
                  <select
                    required
                    value={forwardAssigneeUid}
                    onChange={(e) => setForwardAssigneeUid(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl p-2.5 text-xs text-gray-800 font-semibold bg-white outline-none focus:border-primary"
                  >
                    <option value="">Select team member...</option>
                    {(staffList || [])
                      .filter(s => s.uid !== user?.uid)
                      .map(s => (
                        <option key={s.uid} value={s.uid}>{s.name} ({s.email})</option>
                      ))}
                  </select>
                </div>
              )}

              {/* Note / Reason Field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700">
                  {statusActionDialog.action === 'Complete' ? 'Completion Note / Deliverables' :
                   statusActionDialog.action === 'Decline' ? 'Decline Reason *' :
                   statusActionDialog.action === 'Forward' ? 'Handover Note / Instructions' :
                   'Acceptance Note (Optional)'}
                </label>
                <textarea
                  rows={3}
                  required={statusActionDialog.action === 'Decline'}
                  placeholder={
                    statusActionDialog.action === 'Complete' ? 'Details of how the task was resolved...' :
                    statusActionDialog.action === 'Decline' ? 'Explain why you are declining this task...' :
                    statusActionDialog.action === 'Forward' ? 'Instructions for the colleague you are forwarding to...' :
                    'Any comments or ETA upon accepting this task...'
                  }
                  value={statusDialogNote}
                  onChange={(e) => setStatusDialogNote(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl p-3 text-xs text-gray-800 font-medium outline-none focus:border-primary placeholder-gray-400 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setStatusActionDialog({ isOpen: false, action: '', targetItem: null, isMention: false, interactionId: null })}
                  className="px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={statusDialogSubmitting || (statusActionDialog.action === 'Forward' && !forwardAssigneeUid) || (statusActionDialog.action === 'Decline' && !statusDialogNote.trim())}
                  className={`px-4 py-2 rounded-xl text-white font-bold text-xs cursor-pointer shadow-md flex items-center gap-1.5 disabled:opacity-50 ${
                    statusActionDialog.action === 'Complete' ? 'bg-emerald-600 hover:bg-emerald-700' :
                    statusActionDialog.action === 'Forward' ? 'bg-sky-600 hover:bg-sky-700' :
                    statusActionDialog.action === 'Decline' ? 'bg-rose-600 hover:bg-rose-700' :
                    'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {statusDialogSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Confirm {statusActionDialog.action}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

