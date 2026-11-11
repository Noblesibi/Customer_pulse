import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, Search, Edit2, Trash2, Globe, Building2, ShieldAlert, UserPlus, Send, X,
  MessageSquare, Mail, Calendar, Clock, Users, AtSign, CheckSquare, Square, Mic, Video,
  CheckCheck, Phone, Paperclip, Upload, FileText, Loader2, ArrowLeft, BrainCircuit, ChevronLeft, User, Map as MapIcon, Target, AlertTriangle, Lightbulb,
  Activity, ArrowRightCircle, RefreshCw, ChevronDown, ChevronUp, ClipboardList, Download
} from 'lucide-react';
import { useStore } from '../store/index.js';
import { formatDate, formatTime, formatDateTime, getCurrentKolkataDate, getCurrentKolkataTime } from '../utils/dateFormat.js';

const stripHtml = (html) => {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || "";
  } catch (e) {
    return html.replace(/<[^>]*>?/gm, '');
  }
};

export default function AccountDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const {
    user,
    token,
    updateAccount,
    fetchHealthExplanation,

    contacts,
    fetchContacts,
    updateContact,
    deleteContact,

    interactions,
    fetchInteractions,
    addInteraction,

    risks,
    fetchRisks,

    activeAccountSummary,
    fetchAccountSummary,
    summaryLoading,

    staffList,
    fetchStaff,

    repliesByInteraction,
    fetchReplies,
    replyToInteraction,
    fetchStaffTaskReplies,
    addStaffTaskReply,
    updateStaffTaskStatus,
    updateTaskStatus,
    generateTaskHeader
  } = useStore();

  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nbas, setNbas] = useState([]);
  const [journeyStage, setJourneyStage] = useState('Awareness');
  const [showStageDropdown, setShowStageDropdown] = useState(false);

  // Owner searchable dropdown state
  const [ownerSearch, setOwnerSearch] = useState('');
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
  const [stakeholderSearch, setStakeholderSearch] = useState({});
  const [showStakeholderDropdown, setShowStakeholderDropdown] = useState({});

  // Modals state
  const [isLogInteractionOpen, setIsLogInteractionOpen] = useState(false);
  const [isHealthExplanationOpen, setIsHealthExplanationOpen] = useState(false);
  const [explanationData, setExplanationData] = useState(null);
  const [explanationLoading, setExplanationLoading] = useState(false);

  // Permission: only Admin role OR user whose name starts with 'Nazneen'
  const canEditOwners = user?.role === 'Admin' || user?.name?.toLowerCase().startsWith('nazneen');

  // My Activity embedded panel state
  const [activityLoading, setActivityLoading] = useState(false);
  const [allActivities, setAllActivities] = useState([]);
  const [allUsersActivities, setAllUsersActivities] = useState([]);
  const [associatedUsers, setAssociatedUsers] = useState([]);
  const [activityUid, setActivityUid] = useState('all');
  const [pendingScrollId, setPendingScrollId] = useState(null);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [selectedActivityItem, setSelectedActivityItem] = useState(null);
  const [syncingMs365, setSyncingMs365] = useState(false);
  const [activityToast, setActivityToast] = useState(null);
  const [isRiskExpanded, setIsRiskExpanded] = useState(false);
  const [isHealthExpanded, setIsHealthExpanded] = useState(false);
  const userDropdownRef = useRef(null);

  // Log Interaction Form States
  const [interactionSource, setInteractionSource] = useState('Outlook Mail');
  const [interactionText, setInteractionText] = useState('');
  const [interactionDate, setInteractionDate] = useState(getCurrentKolkataDate());
  const [interactionTime, setInteractionTime] = useState(getCurrentKolkataTime());
  const [interactionContactId, setInteractionContactId] = useState('');
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState('Medium');
  const [attachmentsList, setAttachmentsList] = useState([]);
  const [uploading, setUploading] = useState(false);

  const resetInteractionForm = () => {
    setInteractionSource('Outlook Mail');
    setInteractionText('');
    setInteractionDate(getCurrentKolkataDate());
    setInteractionTime(getCurrentKolkataTime());
    setInteractionContactId('');
    setSelectedMentions([]);
    setMentionSearch('');
    setTaskDueDate('');
    setTaskPriority('Medium');
    setAttachmentsList([]);
  };

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
    if (!activityLoading && pendingScrollId) {
      setTimeout(() => {
        const element = document.getElementById(`activity-${pendingScrollId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.style.transition = 'all 0.5s ease';
          element.style.backgroundColor = 'rgba(var(--color-primary), 0.2)';
          element.style.borderColor = 'rgba(var(--color-primary), 0.8)';
          setTimeout(() => {
            element.style.backgroundColor = '';
            element.style.borderColor = '';
          }, 2000);
        }
        setPendingScrollId(null);
      }, 100);
    }
  }, [activityLoading, pendingScrollId]);

  const handleStepClick = (item) => {
    const isTask = item.itemType === 'task';
    const idKey = isTask ? item.taskId : item.interactionId;
    
    if (activityUid !== 'all') {
      setPendingScrollId(idKey);
      setActivityUid('all');
    } else {
      const element = document.getElementById(`activity-${idKey}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.style.transition = 'all 0.5s ease';
        element.style.backgroundColor = 'rgba(var(--color-primary), 0.2)';
        element.style.borderColor = 'rgba(var(--color-primary), 0.8)';
        setTimeout(() => {
          element.style.backgroundColor = '';
          element.style.borderColor = '';
        }, 2000);
      }
    }
  };

  // Overdue helper
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

  // Status badge config helper
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

  // Load fresh replies when selectedActivityItem opens or changes
  useEffect(() => {
    if (!selectedActivityItem) {
      setModalReplies([]);
      setModalReplyText('');
      return;
    }

    const loadReplies = async () => {
      setModalRepliesLoading(true);
      try {
        if (selectedActivityItem.itemType === 'task') {
          const res = await fetchStaffTaskReplies(selectedActivityItem.taskId);
          setModalReplies(res || selectedActivityItem.replies || []);
        } else if (selectedActivityItem.interactionId) {
          await fetchReplies(selectedActivityItem.interactionId);
          const fresh = useStore.getState().repliesByInteraction[selectedActivityItem.interactionId];
          setModalReplies(fresh || selectedActivityItem.replies || []);
        }
      } catch (err) {
        console.error('Error fetching replies for modal:', err);
        setModalReplies(selectedActivityItem.replies || []);
      } finally {
        setModalRepliesLoading(false);
      }
    };

    loadReplies();
  }, [selectedActivityItem?.taskId, selectedActivityItem?.interactionId]);

  const handleModalReplySubmit = async (e) => {
    e?.preventDefault();
    const text = modalReplyText.trim();
    if (!text || !selectedActivityItem || submittingModalReply) return;

    setSubmittingModalReply(true);
    try {
      if (selectedActivityItem.itemType === 'task') {
        const newReply = await addStaffTaskReply(selectedActivityItem.taskId, text);
        if (newReply) {
          setModalReplies(prev => [...prev, newReply]);
          setModalReplyText('');
          setSelectedActivityItem(prev => ({
            ...prev,
            replies: [...(prev.replies || []), newReply]
          }));
          setAllActivities(prev => prev.map(a => a.taskId === selectedActivityItem.taskId ? {
            ...a,
            replies: [...(a.replies || []), newReply]
          } : a));
        }
      } else if (selectedActivityItem.interactionId) {
        const newReply = await replyToInteraction(selectedActivityItem.interactionId, text);
        if (newReply) {
          setModalReplies(prev => [...prev, newReply]);
          setModalReplyText('');
          setSelectedActivityItem(prev => ({
            ...prev,
            replies: [...(prev.replies || []), newReply]
          }));
          setAllActivities(prev => prev.map(a => a.interactionId === selectedActivityItem.interactionId ? {
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

          setSelectedActivityItem(prev => {
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

          setSelectedActivityItem(prev => {
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

  const loadAccountData = async () => {
    if (!id || !token) return;
    try {
      setLoading(true);

      const accountPromise = fetch(`/CustomerPulse/api/accounts/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(res => res.ok ? res.json() : null);

      const nbaPromise = fetch(`/CustomerPulse/api/accounts/${id}/nba`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(res => res.ok ? res.json() : []);

      const [accountData, nbaData] = await Promise.all([
        accountPromise,
        nbaPromise,
        fetchContacts(id),
        fetchInteractions(id),
        fetchRisks(id),
        fetchStaff(),
        fetchAccountSummary(id)
      ]);

      if (accountData) {
        setAccount(accountData);
        setJourneyStage(accountData.journeyStage || 'Awareness');
      }
      
      if (nbaData) {
        setNbas(nbaData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccountData();
  }, [id, token]);


  // Click-outside handler for user dropdown in activity panel
  useEffect(() => {
    function handleClickOutside(event) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setIsUserDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load activity data when panel opens or tracked user changes
  const loadActivityData = async (uid, isBackgroundFetch = false) => {
    if (!token || !id || !uid) return;
    if (!isBackgroundFetch) setActivityLoading(true);
    try {
      const [intRes, tasksRes, otherRes] = await Promise.all([
        fetch(`/CustomerPulse/api/user-account/${id}/${uid}/interactions`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/CustomerPulse/api/user-account/${id}/${uid}/tasks`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/CustomerPulse/api/user-account/${id}/${uid}/other-activities`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      let interactionsData = [];
      let tasks = [];
      let otherActivities = [];

      if (intRes.ok) interactionsData = await intRes.json();
      if (tasksRes.ok) tasks = await tasksRes.json();
      if (otherRes.ok) otherActivities = await otherRes.json();

      const userActivities = [
        ...interactionsData
          .filter(i => i.source !== 'System Email')
          .map(i => ({ ...i, itemType: 'interaction', isOther: false })),
        ...tasks.map(t => ({ ...t, itemType: 'task', isOther: false }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      if (isBackgroundFetch) {
        setAllUsersActivities(userActivities);
        setActivityLoading(false);
        return;
      }

      setAllActivities(userActivities);
      if (uid === 'all') {
        setAllUsersActivities(userActivities);
      }

      const combined = [
        ...interactionsData.map(i => ({ ...i, itemType: 'interaction', isOther: false })),
        ...otherActivities.map(i => ({ ...i, itemType: 'interaction', isOther: true })),
        ...tasks.map(t => ({ ...t, itemType: 'task', isOther: false }))
      ];

      const usersMap = new Map();
      if (uid !== 'all') {
        usersMap.set(uid, { uid, name: uid === user?.uid ? 'Me' : uid });
      }
      if (account && account.ownerId) {
        usersMap.set(account.ownerId, { uid: account.ownerId, name: account.ownerName || account.ownerId });
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

      const uniqueNames = new Set();
      const filteredUsers = [];
      Array.from(usersMap.values()).forEach(u => {
        const displayName = u.uid === user?.uid ? 'Me' : u.name;
        if (!uniqueNames.has(displayName)) {
          uniqueNames.add(displayName);
          filteredUsers.push(u);
        }
      });
      filteredUsers.unshift({ uid: 'all', name: 'All Users' });
      setAssociatedUsers(filteredUsers);
    } catch (err) {
      console.error("Failed to load user-account activity", err);
    } finally {
      setActivityLoading(false);
    }
  };

  // Load activity data when account loads or tracked user changes
  useEffect(() => {
    if (activityUid) {
      loadActivityData(activityUid);
    }
  }, [activityUid]);

  // Initialize activityUid once user is available
  useEffect(() => {
    if (user?.uid && !activityUid) {
      setActivityUid('all');
    }
  }, [user?.uid]);

  const handleActivityUserChange = (newUid) => {
    setActivityUid(newUid);
    setIsUserDropdownOpen(false);
  };

  const handleMicrosoftSync = async () => {
    setSyncingMs365(true);
    setActivityToast('Starting Microsoft 365 Sync...');
    try {
      const res = await fetch('/CustomerPulse/api/integrations/microsoft/sync', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setActivityToast(`Sync Complete! Added: ${data.syncRecord.results.synced}, Skipped: ${data.syncRecord.results.duplicatesSkipped} (Duplicates), ${data.syncRecord.results.internalSkipped} (Internal), ${data.syncRecord.results.unmatchedSkipped} (Unmatched)`);
        setTimeout(() => loadActivityData(activityUid), 1500);
      } else {
        setActivityToast(`Sync failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      setActivityToast('An error occurred during sync.');
    } finally {
      setSyncingMs365(false);
      setTimeout(() => setActivityToast(null), 8000);
    }
  };

  // Activity analysis helpers
  const getActivityRisk = (text = '') => {
    const lower = text.toLowerCase();
    if (lower.includes('delay') || lower.includes('issue') || lower.includes('problem') || lower.includes('decline')) {
      return { level: 'High Risk', color: 'text-rose-400', bg: 'bg-rose-400/10' };
    }
    if (lower.includes('sync') || lower.includes('review') || lower.includes('discuss')) {
      return { level: 'Medium Risk', color: 'text-amber-400', bg: 'bg-amber-400/10' };
    }
    return { level: 'Low Risk', color: 'text-emerald-400', bg: 'bg-emerald-400/10' };
  };

  const getActivityHealth = (riskLevel) => {
    if (riskLevel === 'High Risk') return { change: '-10 pts', status: 'Trending Down', color: 'text-rose-400' };
    if (riskLevel === 'Medium Risk') return { change: '0 pts', status: 'Stable', color: 'text-slate-300' };
    return { change: '+5 pts', status: 'Improving', color: 'text-emerald-400' };
  };

  const getActivityNextSteps = (riskLevel, type, item) => {
    let itemName = '';
    if (type === 'task') {
      itemName = item.title || (item.description ? item.description.split('\n')[0] : 'Task');
    } else {
      itemName = item.subject || (item.messageText ? stripHtml(item.messageText).split('\n')[0] : 'Interaction');
    }
    if (itemName.length > 40) itemName = itemName.substring(0, 40) + '...';

    if (riskLevel === 'High Risk') return [
      `Schedule an immediate escalation call for "${itemName}"`, 
      `Involve technical leadership for "${itemName}"`, 
      `Draft a remediation plan within 24h for "${itemName}"`
    ];
    if (type === 'task') return [
      `Ensure task "${itemName}" is completed by due date`, 
      `Update assigned user on progress for "${itemName}"`
    ];
    return [
      `Follow up on "${itemName}" in 2 weeks to check status`, 
      `Update account strategy notes based on "${itemName}"`
    ];
  };

  const getActivityOverallStats = () => {
    if (allUsersActivities.length === 0) return null;
    let totalScore = 0;
    let highestRisk = 'Low Risk';
    let allStepsMap = new Map();
    const HIGH_KEYWORDS = ['delay', 'issue', 'problem', 'decline'];
    const MED_KEYWORDS  = ['sync', 'review', 'discuss'];
    const riskActivities = [];
    const healthBreakdown = [];

    allUsersActivities.forEach(a => {
      const rawText = a.itemType === 'task' ? a.description : a.messageText;
      const text = stripHtml(rawText || '');
      const lower = text.toLowerCase();
      const risk = getActivityRisk(text);
      const health = getActivityHealth(risk.level);
      const steps = getActivityNextSteps(risk.level, a.itemType, a);
      const pts = parseInt(health.change.replace(/[^-\d]/g, '')) || 0;
      totalScore += pts;
      if (risk.level === 'High Risk') highestRisk = 'High Risk';
      else if (risk.level === 'Medium Risk' && highestRisk !== 'High Risk') highestRisk = 'Medium Risk';
      steps.forEach(s => { if (!allStepsMap.has(s)) allStepsMap.set(s, a); });

      const foundKeywords = [
        ...HIGH_KEYWORDS.filter(k => lower.includes(k)),
        ...MED_KEYWORDS.filter(k => lower.includes(k)),
      ];
      const name = a.itemType === 'task'
        ? (a.title || (a.description ? a.description.split('\n')[0] : 'Task'))
        : (a.subject || (text ? text.split('\n')[0] : 'Interaction'));
      const shortName = name.length > 38 ? name.substring(0, 38) + '…' : name;

      if (risk.level !== 'Low Risk') {
        riskActivities.push({ name: shortName, type: a.itemType, risk: risk.level, keywords: foundKeywords });
      }
      healthBreakdown.push({ name: shortName, type: a.itemType, pts, risk: risk.level });
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
    return { totalScore, healthStatus, healthColor, healthChangeStr, highestRisk, riskColor, riskBg, topSteps, summary, riskActivities, healthBreakdown };
  };

  const getActivitySourceIcon = (source) => {
    switch(source) {
      case 'Outlook Mail': return <Mail className="w-4 h-4 text-blue-400" />;
      case 'Teams Chat': return <MessageSquare className="w-4 h-4 text-purple-400" />;
      case 'Phone': return <Phone className="w-4 h-4 text-emerald-400" />;
      case 'Face to Face': return <Users className="w-4 h-4 text-amber-400" />;
      case 'Teams Meeting': return <Video className="w-4 h-4 text-rose-400" />;
      default: return <MessageSquare className="w-4 h-4 text-slate-400" />;
    }
  };

  const handleShowHealthExplanation = async () => {
    setIsHealthExplanationOpen(true);
    setExplanationLoading(true);
    setExplanationData(null);
    const data = await fetchHealthExplanation(id);
    setExplanationData(data);
    setExplanationLoading(false);
  };

  const getHealthPillColor = (score) => {
    if (score >= 90) return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400';
    if (score >= 75) return 'bg-blue-500/10 border-blue-500/25 text-blue-400';
    if (score >= 50) return 'bg-amber-500/10 border-amber-500/25 text-amber-400';
    return 'bg-rose-500/10 border-rose-500/25 text-rose-400 animate-pulse';
  };

  const channels = [
    { id: 'Outlook Mail', label: 'Outlook Mail', icon: Mail, color: 'text-blue-400' },
    { id: 'Teams Chat', label: 'Teams Chat', icon: MessageSquare, color: 'text-purple-400' },
    { id: 'Phone', label: 'Phone', icon: Phone, color: 'text-emerald-400' },
    { id: 'Face to Face', label: 'Face to Face', icon: Users, color: 'text-amber-400' },
    { id: 'Teams Meeting', label: 'Teams Meeting', icon: Video, color: 'text-rose-400' },
  ];

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setUploading(true);

    for (const file of files) {
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result);
          reader.onerror = (error) => reject(error);
        });

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
          const data = await res.json();
          setAttachmentsList(prev => [...prev, data]);
        } else {
          const err = await res.json();
          alert(`Failed to upload ${file.name}: ${err.error || 'Server error'}`);
        }
      } catch (err) {
        console.error(err);
        alert(`Error uploading file ${file.name}`);
      }
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleRemoveAttachment = (index) => {
    setAttachmentsList(prev => prev.filter((_, i) => i !== index));
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

  const handleLogInteraction = async (e) => {
    e.preventDefault();

    const targetContactId = interactionContactId || (contacts[0]?.contactId);

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
      accountId: id,
      contactId: targetContactId,
      source: interactionSource,
      subject: derivedSubject,
      messageText: interactionText,
      date: interactionDate,
      time: interactionTime,
      attachments: attachmentsList,
      actionMentions: await Promise.all(selectedMentions.map(async m => ({
        uid: m.uid,
        name: m.name,
        task: taskText,
        taskHeader: await generateTaskHeader(taskText),
        dueDate: taskDueDate || null,
        priority: taskPriority
      })))
    });

    if (res) {
      // Re-fetch only what's necessary (e.g. Account stats, Summary, NBA, Risks) instead of full staff/contact lists
      const accountPromise = fetch(`/CustomerPulse/api/accounts/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(res => res.ok ? res.json() : null);
      
      const nbaPromise = fetch(`/CustomerPulse/api/accounts/${id}/nba`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(res => res.ok ? res.json() : []);

      await Promise.all([
        accountPromise.then(data => data && setAccount(data)),
        nbaPromise.then(data => data && setNbas(data)),
        fetchAccountSummary(id),
        fetchRisks(id)
      ]);

      if (activityUid) {
        loadActivityData(activityUid);
      }
      if (activityUid !== 'all') {
        loadActivityData('all', true);
      }
      setIsLogInteractionOpen(false);
      resetInteractionForm();
    }
  };

  if (loading || !account) {
    return (
      <div className="h-[calc(100vh-10rem)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full mx-auto py-4 px-4 h-auto">
      {/* 1. Header Toolbar */}
      <div className="glass p-6 rounded-2xl border border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="back-btn"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
            <span>Back</span>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-wide">{account.companyName}</h1>
              <span
                onClick={handleShowHealthExplanation}
                className={`px-3.5 py-1.5 text-xs font-black rounded-full border cursor-help hover:scale-105 transition-transform duration-150 ${getHealthPillColor(account.healthScore)}`}
              >
                {account.healthScore}% {account.status}
              </span>
            </div>
            <div className="flex items-center gap-5 text-sm text-slate-400 mt-2 font-bold">
              <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-primary" /> {account.industry}</span>
              <span className="flex items-center gap-1.5"><Globe className="w-4 h-4 text-primary" /> {account.region}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          
                            </div>
        
                            {/* Contact Owner Select */}
                            <div className="mt-4 pt-3.5 border-t border-slate-800/30 relative z-30 flex flex-col gap-2">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Key Contact Owner</span>
                                <span className="text-slate-200 font-bold text-sm">
                                  {c.ownerName || (c.ownerId ? staffList.find(s => s.uid === c.ownerId)?.name : null) || 'Unassigned'}
                                </span>
                              </div>
                              {canEditOwners ? (
                                <div className="relative z-40">
                                  <input
                                    type="text"
                                    value={stakeholderSearch[c.contactId] ?? ''}
                                    placeholder="Type @name to search..."
                                    onFocus={() => {
                                      setStakeholderSearch(prev => ({ ...prev, [c.contactId]: '' }));
                                      setShowStakeholderDropdown(prev => ({ ...prev, [c.contactId]: true }));
                                    }}
                                    onChange={(e) => setStakeholderSearch(prev => ({ ...prev, [c.contactId]: e.target.value }))}
                                    onBlur={() => setTimeout(() => setShowStakeholderDropdown(prev => ({ ...prev, [c.contactId]: false })), 180)}
                                    className="w-full bg-dark-700/50 border border-slate-700 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-primary/50 text-black placeholder-slate-450 font-semibold"
                                  />
                                  {showStakeholderDropdown[c.contactId] && (() => {
                                    const q = (stakeholderSearch[c.contactId] || '').replace(/^@/, '').toLowerCase();
                                    const filtered = staffList.filter(s =>
                                      s.name.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q)
                                    );
                                    if (!filtered.length) return null;
                                    return (
                                      <div className="absolute z-[100] w-full top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-40 overflow-y-auto">
                                        <button
                                          type="button"
                                          onMouseDown={async () => {
                                            await updateContact(c.contactId, { ownerId: '', ownerName: '' });
                                            fetchContacts(id);
                                            setStakeholderSearch(prev => ({ ...prev, [c.contactId]: '' }));
                                            setShowStakeholderDropdown(prev => ({ ...prev, [c.contactId]: false }));
                                          }}
                                          className="w-full text-left px-3 py-2 text-xs text-slate-400 font-semibold"
                                        >
                                          Unassigned
                                        </button>
                                        {filtered.map(s => (
                                          <button
                                            key={s.uid}
                                            type="button"
                                            onMouseDown={async () => {
                                              await updateContact(c.contactId, { ownerId: s.uid, ownerName: s.name });
                                              fetchContacts(id);
                                              setStakeholderSearch(prev => ({ ...prev, [c.contactId]: s.name }));
                                              setShowStakeholderDropdown(prev => ({ ...prev, [c.contactId]: false }));
                                            }}
                                            className="w-full flex flex-col items-start px-3 py-2.5 text-xs"
                                          >
                                            <span className="font-bold text-black">{s.name}</span>
                                            <span className="text-slate-500 font-semibold">{s.position || s.jobRole || s.role}{s.department ? ` · ${s.department}` : ''}</span>
                                          </button>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
      </div>

</div>

      {/* ========================================================
          EMBEDDED MY ACTIVITY PANEL
          ======================================================== */}
        <div className="glass rounded-2xl border border-primary/30 shadow-[0_0_20px_rgba(37,99,235,0.08)] overflow-hidden transition-all duration-300">
          {/* Activity Panel Toolbar */}
          <div className="px-5 py-3 border-b border-slate-800/80 flex items-center justify-between gap-3 bg-gradient-to-r from-slate-900/80 to-slate-900/40">
            <div className="flex items-center gap-2 relative" ref={userDropdownRef}>
              <User className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-slate-400 font-bold">Tracking:</span>
              <div
                className="relative flex items-center gap-1 cursor-pointer bg-primary/10 border border-primary/20 hover:border-primary/50 text-primary px-2.5 py-0.5 rounded-lg transition-colors text-xs font-bold"
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
              >
                <span>{associatedUsers.find(u => u.uid === activityUid)?.name || (activityUid === user?.uid ? 'Me' : activityUid || 'Me')}</span>
                <ChevronDown className="w-3 h-3 opacity-70" />
              </div>
              {isUserDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 glass border border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 max-h-56 overflow-y-auto">
                  {associatedUsers.map(u => (
                    <div
                      key={u.uid}
                      onClick={() => handleActivityUserChange(u.uid)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-2 ${
                        u.uid === activityUid
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
            <button
              onClick={handleMicrosoftSync}
              disabled={syncingMs365}
              className="bg-dark-800 hover:bg-dark-700 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 text-white transition-all cursor-pointer shadow-lg disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-primary ${syncingMs365 ? 'animate-spin' : ''}`} />
              {syncingMs365 ? 'Syncing...' : 'Sync Microsoft 365'}
            </button>
          </div>

          {/* Activity Panel Content */}
          {activityLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="p-5 space-y-5">
              {/* Smart Insights */}
              {(() => {
                const stats = getActivityOverallStats();
                if (!stats) return null;
                return (
                  <div className="space-y-4">
                    <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-primary" /> Smart Insights
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                      <div className={`border border-slate-800 rounded-xl shadow-md overflow-hidden transition-all duration-300 flex flex-col ${isRiskExpanded ? 'bg-slate-900/80' : stats.riskBg}`}>
                        <div 
                          className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${isRiskExpanded ? stats.riskBg : 'hover:bg-slate-800/30'}`}
                          onClick={() => setIsRiskExpanded(!isRiskExpanded)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full bg-slate-900 ${stats.riskColor} shadow-inner`}>
                              <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                              <div className={`text-sm font-black ${stats.riskColor}`}>{stats.highestRisk}</div>
                              <div className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-wide">Aggregated Risk Level</div>
                            </div>
                          </div>
                          {isRiskExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                        </div>
                        {isRiskExpanded && (
                          <div className="p-4 pt-2 border-t border-slate-800/50 space-y-3 flex-1 flex flex-col justify-between">
                            <div>
                              <div className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-1.5">Flagged Activities</div>
                              {stats.riskActivities.length === 0 ? (
                                <p className="text-xs text-slate-400 font-medium">No high or medium risk activities detected. All interactions appear healthy.</p>
                              ) : (
                                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                  {stats.riskActivities.slice(0, 5).map((ra, i) => (
                                    <div key={i} className="bg-slate-800/60 rounded-lg p-2.5 flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="text-xs font-bold text-slate-200 truncate">{ra.name}</div>
                                        <div className="text-[10px] text-slate-500 font-semibold capitalize mt-0.5">{ra.type}</div>
                                        {ra.keywords.length > 0 && (
                                          <div className="flex gap-1 flex-wrap mt-1">
                                            {ra.keywords.map((kw, ki) => (
                                              <span key={ki} className="text-[9px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono">"{kw}"</span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${
                                        ra.risk === 'High Risk' ? 'bg-rose-400/15 text-rose-400' : 'bg-amber-400/15 text-amber-400'
                                      }`}>{ra.risk}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="border-t border-slate-800/50 pt-3">
                              <div className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-1.5">Why This Risk?</div>
                              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                                {stats.highestRisk === 'Low Risk' 
                                  ? 'No critical risk keywords detected in recent activities.' 
                                  : 'Negative keywords or overdue actions flagged in recent communications.'}
                              </p>
                            </div>
                            <div className="border-t border-slate-800/50 pt-3">
                              <div className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-1.5">Calculation Criteria</div>
                              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                                Risk is derived locally from activity keywords. Keywords like "delay", "issue", or "problem" yield High Risk. "sync", "review" yield Medium Risk. Overdue tasks also elevate risk.
                              </p>
                            </div>
                            <div className="border-t border-slate-800/50 pt-3">
                              <div className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-1.5">Suggested Resolution</div>
                              <div className="space-y-1.5">
                                {stats.topSteps.slice(0, 2).map((step, si) => (
                                  <div key={si} className="flex items-start gap-1.5 text-xs text-slate-300 font-medium">
                                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                                    <span>{step.text}</span>
                                  </div>
                                ))}
                                {stats.topSteps.length === 0 && (
                                  <p className="text-xs text-slate-400 font-medium">No immediate actions required.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className={`border border-slate-800 rounded-xl shadow-md overflow-hidden transition-all duration-300 flex flex-col ${isHealthExpanded ? 'bg-slate-900/80' : 'bg-slate-900/50'}`}>
                        <div 
                          className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${isHealthExpanded ? 'bg-slate-900/50' : 'hover:bg-slate-800/30'}`}
                          onClick={() => setIsHealthExpanded(!isHealthExpanded)}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`text-2xl font-black ${stats.healthColor}`}>{stats.healthChangeStr}</div>
                            <div>
                              <div className="text-sm font-extrabold text-slate-300">Net Health Impact</div>
                              <div className={`text-[10px] font-bold mt-0.5 uppercase tracking-wide ${stats.healthColor}`}>{stats.healthStatus}</div>
                            </div>
                          </div>
                          {isHealthExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                        </div>
                        {isHealthExpanded && (
                          <div className="p-4 pt-2 border-t border-slate-800/50 space-y-3 flex-1 flex flex-col justify-between">
                            <div>
                              <div className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-1.5">
                                Score Breakdown
                                <span className="ml-2 normal-case text-slate-500 font-semibold">({stats.healthBreakdown.length} activities)</span>
                              </div>
                              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                                {stats.healthBreakdown.map((hb, i) => (
                                  <div key={i} className="flex items-center justify-between gap-2 bg-slate-800/50 rounded-lg px-2.5 py-1.5">
                                    <div className="min-w-0">
                                      <div className="text-xs font-semibold text-slate-300 truncate">{hb.name}</div>
                                      <div className="text-[10px] text-slate-500 capitalize">{hb.type} · {hb.risk}</div>
                                    </div>
                                    <span className={`text-xs font-black shrink-0 px-2 py-0.5 rounded ${
                                      hb.pts > 0 ? 'text-emerald-400 bg-emerald-400/10' : hb.pts < 0 ? 'text-rose-400 bg-rose-400/10' : 'text-slate-400 bg-slate-800'
                                    }`}>
                                      {hb.pts > 0 ? `+${hb.pts}` : hb.pts} pts
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="border-t border-slate-800/50 pt-3">
                              <div className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-1.5">Calculation Criteria</div>
                              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                                Health Score (Net Impact) is calculated locally based on the activities shown above. Positive activities add points, while negative activities subtract points. High Risk activities deduct 10 points. Low Risk activities add 5 points.
                              </p>
                            </div>
                            <div className="border-t border-slate-800/50 pt-3">
                              <div className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-1.5">Scoring Key</div>
                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-rose-400/10 rounded-lg p-1.5">
                                  <div className="text-xs font-black text-rose-400">-10 pts</div>
                                  <div className="text-[9px] text-slate-400 font-semibold mt-0.5">High Risk</div>
                                </div>
                                <div className="bg-slate-800 rounded-lg p-1.5">
                                  <div className="text-xs font-black text-slate-400">0 pts</div>
                                  <div className="text-[9px] text-slate-400 font-semibold mt-0.5">Medium Risk</div>
                                </div>
                                <div className="bg-emerald-400/10 rounded-lg p-1.5">
                                  <div className="text-xs font-black text-emerald-400">+5 pts</div>
                                  <div className="text-[9px] text-slate-400 font-semibold mt-0.5">Low Risk</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl shadow-md">
                        <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-primary" /> Summary</h4>
                        <p className="text-xs text-slate-300 font-medium leading-relaxed">{stats.summary}</p>
                      </div>
                      <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl shadow-md">
                        <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5"><ArrowRightCircle className="w-3.5 h-3.5 text-primary" /> Priority Next Steps</h4>
                        <div className="space-y-1.5">
                          {stats.topSteps.map((step, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleStepClick(step.item)}
                              className="flex items-start gap-2 text-xs text-slate-300 font-medium cursor-pointer hover:text-primary transition-colors"
                            >
                              <div className="mt-1 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 shadow-[0_0_8px_rgba(var(--color-primary),0.8)]" />
                              <span>{step.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Recent Activity Timeline */}
              <div>
                <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-400 border-b border-slate-850 pb-3 mb-4 flex items-center gap-2">
                  Recent Activity
                </h3>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {allActivities.length === 0 ? (
                    <div className="text-center py-10 text-sm text-slate-500 font-bold">No activities found for this user in this account.</div>
                  ) : (
                    allActivities.map(item => {
                      const isTask = item.itemType === 'task';
                      const idKey = isTask ? item.taskId : item.interactionId;
                      const hasMentions = Array.isArray(item.actionMentions) && item.actionMentions.length > 0;
                      const isItemOverdue = isTask ? checkIsOverdue(item.dueDate, item.status) : false;
                      const statusCfg = getStatusBadgeConfig(item.status, isItemOverdue);
                      const StatusIcon = statusCfg.icon;

                      const repliesCount = isTask
                        ? (item.replies?.length || 0)
                        : (item.replies?.length || repliesByInteraction[item.interactionId]?.length || 0);

                      return (
                        <div
                          key={idKey}
                          id={`activity-${idKey}`}
                          onClick={() => setSelectedActivityItem(item)}
                          className="bg-dark-900/60 p-4 rounded-xl border border-slate-800/80 hover:border-primary/50 cursor-pointer transition-all hover:bg-slate-800/30 shadow-md flex flex-col gap-2.5 group"
                        >
                          <div className="flex items-center justify-between text-xs font-black">
                            <div className="flex items-center gap-2 flex-wrap">
                              {!isTask ? (
                                <>
                                  {getActivitySourceIcon(item.source)}
                                  <span className="bg-slate-800 text-slate-200 border border-slate-700 px-2.5 py-0.5 rounded-full text-[10px] tracking-wide uppercase font-bold">
                                    {item.source} {item.isOther ? '(Other User)' : ''}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <CheckSquare className="w-4 h-4 text-amber-400" />
                                  <span className="bg-slate-800 text-slate-200 border border-slate-700 px-2.5 py-0.5 rounded-full text-[10px] tracking-wide uppercase font-bold">
                                    Staff Task
                                  </span>
                                  {item.priority && (
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${
                                      item.priority === 'High' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                                      item.priority === 'Medium' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                      'bg-slate-800 border-slate-700 text-slate-400'
                                    }`}>
                                      {item.priority}
                                    </span>
                                  )}
                                </>
                              )}

                              {/* Task Status Badge */}
                              {isTask && (
                                <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border font-bold uppercase ${
                                  isItemOverdue ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 font-extrabold' :
                                  (item.status || '').toLowerCase().includes('complete') ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' :
                                  (item.status || '').toLowerCase().includes('forward') ? 'bg-sky-500/15 border-sky-500/30 text-sky-400' :
                                  (item.status || '').toLowerCase().includes('accept') ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' :
                                  (item.status || '').toLowerCase().includes('decline') ? 'bg-rose-500/15 border-rose-500/30 text-rose-400' :
                                  'bg-blue-500/15 border-blue-500/30 text-blue-400'
                                }`}>
                                  <StatusIcon className="w-3 h-3" />
                                  {isItemOverdue ? 'Overdue' : (item.status === 'Pending' ? 'Task Assigned' : item.status || 'Task Assigned')}
                                </span>
                              )}
                            </div>
                            <span className="text-slate-400 font-bold group-hover:text-slate-300 transition-colors text-[10px]">
                              {isTask 
                                ? (item.dueDate ? `Due: ${formatDate(item.dueDate)}` : formatDateTime(item.date, item.time, item.timestamp))
                                : formatDateTime(item.date, item.time, item.timestamp)}
                            </span>
                          </div>

                          {/* People Involved */}
                          {isTask ? (
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 pt-0.5">
                              <span>From: <span className="text-slate-200">{item.assignedByName || 'Admin'}</span></span>
                              <span>To: <span className="text-primary font-black">@{item.assignedToName || 'Staff Member'}</span></span>
                            </div>
                          ) : (
                            (!isTask && (item.isOther || activityUid === 'all' || item.loggedByUid !== user?.uid)) && (
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                <User className="w-3 h-3" /> Logged by: <span className="text-primary">{item.loggedByName || item.loggedByUid}</span>
                              </div>
                            )
                          )}

                          <h4 className="text-sm font-extrabold text-slate-100 leading-relaxed">
                            {isTask ? item.title : (item.subject || (item.messageText ? stripHtml(item.messageText).split('\n')[0] : 'Interaction Note'))}
                          </h4>

                          <p className="text-[11px] text-slate-400 font-semibold line-clamp-2">
                            {isTask ? item.description : stripHtml(item.messageText)}
                          </p>

                          {/* Associated Tasks Badge for interactions */}
                          {!isTask && hasMentions && (
                            <div className="flex items-center gap-2 pt-1">
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

                          {/* Footer Info: Sentiment & Replies Count */}
                          <div className="pt-2 border-t border-slate-800/60 mt-1 flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
                            {!isTask ? (
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded border ${
                                  item.sentiment === 'Positive' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                  item.sentiment === 'Negative' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                                  'bg-slate-800 border-slate-700 text-slate-350'
                                }`}>
                                  {item.sentiment || 'Neutral'} Sentiment
                                </span>
                                {item.riskDetected && (
                                  <span className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-0.5 rounded flex items-center gap-1">
                                    <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                                    Risk: {item.riskCategory || 'Flagged'}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="text-slate-500 font-bold">
                                {item.forwardedToName ? `Forwarded to @${item.forwardedToName}` : ''}
                              </div>
                            )}

                            {repliesCount > 0 && (
                              <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold ml-auto">
                                <MessageSquare className="w-3 h-3 text-primary" />
                                {repliesCount} {repliesCount === 1 ? 'reply' : 'replies'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

      {/* Activity Detail Modal */}
      {selectedActivityItem && (() => {
        const isTask = selectedActivityItem.itemType === 'task';
        const isTaskOverdue = isTask ? checkIsOverdue(selectedActivityItem.dueDate, selectedActivityItem.status) : false;
        const taskStatusCfg = getStatusBadgeConfig(selectedActivityItem.status, isTaskOverdue);
        const TaskStatusIcon = taskStatusCfg.icon;
        const hasAssociatedTasks = Array.isArray(selectedActivityItem.actionMentions) && selectedActivityItem.actionMentions.length > 0;
        const hasAttachments = Array.isArray(selectedActivityItem.attachments) && selectedActivityItem.attachments.length > 0;
        const isAssignedToMe = isTask && (
          selectedActivityItem.assignedToUid === user?.uid ||
          (selectedActivityItem.assignedToName && user?.name && selectedActivityItem.assignedToName.toLowerCase().replace('@', '').trim() === user?.name.toLowerCase().replace('@', '').trim())
        );
        const isTaskFinal = isTask && (
          (selectedActivityItem.status || '').toLowerCase() === 'completed' ||
          (selectedActivityItem.status || '').toLowerCase() === 'complete' ||
          (selectedActivityItem.status || '').toLowerCase() === 'declined' ||
          (selectedActivityItem.status || '').toLowerCase() === 'decline' ||
          (selectedActivityItem.status || '').toLowerCase() === 'accepted & completed' ||
          isTaskOverdue
        );

        // Compute combined replies
        const extraNotes = [];
        if (isTask) {
          if (selectedActivityItem.acceptNote) {
            extraNotes.push({
              replyId: 'note-accept',
              authorName: selectedActivityItem.assignedToName || 'Assignee',
              authorUid: selectedActivityItem.assignedToUid,
              text: `Acceptance Note: ${selectedActivityItem.acceptNote}`,
              timestamp: selectedActivityItem.timestamp
            });
          }
          if (selectedActivityItem.completionNote && !modalReplies.some(r => (r.text || '').startsWith('Task Completion Note:'))) {
            extraNotes.push({
              replyId: 'note-complete',
              authorName: selectedActivityItem.assignedToName || 'Assignee',
              authorUid: selectedActivityItem.assignedToUid,
              text: `Task Completion Note: ${selectedActivityItem.completionNote}`,
              timestamp: selectedActivityItem.completionDate || selectedActivityItem.timestamp
            });
          }
          if (selectedActivityItem.declineReason) {
            extraNotes.push({
              replyId: 'note-decline',
              authorName: selectedActivityItem.assignedToName || 'Assignee',
              authorUid: selectedActivityItem.assignedToUid,
              text: `Decline Reason: ${selectedActivityItem.declineReason}`,
              timestamp: selectedActivityItem.timestamp
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
            className="fixed inset-0 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            style={{ zIndex: 100000 }}
            onClick={() => setSelectedActivityItem(null)}
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
                      {isTask ? 'Staff Task' : selectedActivityItem.source}
                    </span>

                    {isTask && (
                      <>
                        {selectedActivityItem.priority && (
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase border ${
                            selectedActivityItem.priority === 'High' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            selectedActivityItem.priority === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-gray-100 text-gray-700 border-gray-200'
                          }`}>
                            Priority: {selectedActivityItem.priority}
                          </span>
                        )}
                        <span className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase border ${taskStatusCfg.className}`}>
                          <TaskStatusIcon className="w-3 h-3" />
                          {taskStatusCfg.text}
                        </span>
                      </>
                    )}

                    {!isTask && selectedActivityItem.sentiment && (
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-wide uppercase border ${
                        selectedActivityItem.sentiment === 'Positive' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        selectedActivityItem.sentiment === 'Negative' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        'bg-gray-100 text-gray-700 border-gray-200'
                      }`}>
                        {selectedActivityItem.sentiment} Sentiment
                      </span>
                    )}

                    <span className="text-xs text-gray-500 font-bold">
                      {isTask
                        ? (selectedActivityItem.dueDate ? `Due: ${formatDate(selectedActivityItem.dueDate)}` : formatDateTime(selectedActivityItem.date, selectedActivityItem.time, selectedActivityItem.timestamp))
                        : formatDateTime(selectedActivityItem.date, selectedActivityItem.time, selectedActivityItem.timestamp)}
                    </span>
                  </div>

                  <h2 className="text-xl font-black text-gray-900 leading-snug">
                    {isTask ? selectedActivityItem.title : (selectedActivityItem.subject || 'Interaction Details')}
                  </h2>
                </div>

                <button 
                  onClick={() => setSelectedActivityItem(null)} 
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
                    {isTask ? selectedActivityItem.description : stripHtml(selectedActivityItem.messageText)}
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
                        Task ID: <span className="font-mono text-gray-700">{selectedActivityItem.taskId}</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Assigned By */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Assigned By</span>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 text-primary font-black text-xs flex items-center justify-center shrink-0">
                            {selectedActivityItem.assignedByName ? selectedActivityItem.assignedByName.substring(0, 2).toUpperCase() : 'AD'}
                          </div>
                          <div>
                            <span className="font-bold text-gray-900 text-xs block">
                              {selectedActivityItem.assignedByName || 'Admin User'}
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
                            {selectedActivityItem.status === 'Forwarded' && selectedActivityItem.forwardedToName 
                              ? `Forwarded to @${selectedActivityItem.forwardedToName}` 
                              : taskStatusCfg.text}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-300 text-amber-700 font-black text-xs flex items-center justify-center shrink-0">
                            {selectedActivityItem.assignedToName ? selectedActivityItem.assignedToName.substring(0, 2).toUpperCase() : 'ST'}
                          </div>
                          <div>
                            <span className="font-bold text-gray-900 text-xs block">
                              @{selectedActivityItem.assignedToName || 'Staff Member'}
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
                      {selectedActivityItem.priority && (
                        <span className={`px-2 py-0.5 rounded-md border font-bold text-[11px] ${
                          selectedActivityItem.priority === 'High' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          selectedActivityItem.priority === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-gray-100 text-gray-700 border-gray-200'
                        }`}>
                          Priority: {selectedActivityItem.priority}
                        </span>
                      )}
                      {selectedActivityItem.dueDate && (
                        <span className={`px-2 py-0.5 rounded-md border font-bold text-[11px] flex items-center gap-1 ${
                          isTaskOverdue ? 'bg-rose-100 text-rose-800 border-rose-300 font-black' : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          <Clock className="w-3.5 h-3.5" />
                          Due Date: {formatDate(selectedActivityItem.dueDate)} {isTaskOverdue && '(OVERDUE)'}
                        </span>
                      )}
                    </div>

                    {/* Notes & Status Details */}
                    {(selectedActivityItem.completionNote || selectedActivityItem.acceptNote || selectedActivityItem.declineReason || selectedActivityItem.forwardedToName) && (
                      <div className="bg-white p-3 rounded-lg border border-gray-200 space-y-1.5 text-xs">
                        {selectedActivityItem.acceptNote && (
                          <div className="text-gray-700"><span className="font-bold text-amber-700">Acceptance Note:</span> {selectedActivityItem.acceptNote}</div>
                        )}
                        {selectedActivityItem.completionNote && (
                          <div className="text-gray-700"><span className="font-bold text-emerald-700">Completion Note:</span> {selectedActivityItem.completionNote}</div>
                        )}
                        {selectedActivityItem.declineReason && (
                          <div className="text-gray-700"><span className="font-bold text-rose-700">Decline Reason:</span> {selectedActivityItem.declineReason}</div>
                        )}
                        {selectedActivityItem.forwardedToName && (
                          <div className="text-gray-700"><span className="font-bold text-sky-700">Forwarded To:</span> @{selectedActivityItem.forwardedToName}</div>
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
                              (selectedActivityItem.status || '').toLowerCase() === 'accepted' || (selectedActivityItem.status || '').toLowerCase() === 'in progress' ? 'Accept' :
                              (selectedActivityItem.status || '').toLowerCase() === 'declined' ? 'Decline' :
                              selectedActivityItem.status || 'Task Assigned'
                            }
                            onChange={(e) => {
                              const st = e.target.value;
                              if (st === 'Task Assigned' || st === selectedActivityItem.status) return;
                              handleOpenStatusDialog(st === 'Accept' ? 'Accept' : st === 'Decline' ? 'Decline' : st, selectedActivityItem, false);
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
                            (Assigned to @{selectedActivityItem.assignedToName || 'colleague'})
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
                        <ClipboardList className="w-4 h-4 text-primary" /> Associated Staff Tasks ({selectedActivityItem.actionMentions.length})
                      </h4>
                      <span className="text-[11px] text-gray-500 font-bold">Assigned during interaction logging</span>
                    </div>

                    <div className="space-y-3">
                      {selectedActivityItem.actionMentions.map((mention, mIdx) => {
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
                                    <span className="text-[10px] text-gray-400 font-medium">Assigned by {selectedActivityItem.loggedByName || 'Author'}</span>
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
                                  Forwarded to @{mention.forwardedToName}
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
                                      handleOpenStatusDialog(st === 'Accept' ? 'Accept' : st === 'Decline' ? 'Decline' : st, mention, true, selectedActivityItem.interactionId);
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
                      <Paperclip className="w-4 h-4 text-gray-500" /> Attached Files ({selectedActivityItem.attachments.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                      {selectedActivityItem.attachments.map((file, fIdx) => (
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
                <div className="space-y-4 pt-2 border-t border-gray-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" /> Risk Analysis
                      </h3>
                      {(() => {
                        const text = isTask ? selectedActivityItem.description : stripHtml(selectedActivityItem.messageText);
                        const risk = getActivityRisk(text);
                        return (
                          <div className={`${risk.level === 'High Risk' ? 'bg-rose-50' : risk.level === 'Medium Risk' ? 'bg-amber-50' : 'bg-emerald-50'} border border-gray-100 p-4 rounded-xl flex items-center gap-3`}>
                            <div className={`p-2 rounded-full bg-white ${risk.level === 'High Risk' ? 'text-rose-600' : risk.level === 'Medium Risk' ? 'text-amber-600' : 'text-emerald-600'}`}>
                              <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                              <div className={`text-sm font-black ${risk.level === 'High Risk' ? 'text-rose-600' : risk.level === 'Medium Risk' ? 'text-amber-600' : 'text-emerald-600'}`}>{risk.level}</div>
                              <div className="text-xs text-gray-500 font-bold mt-0.5">Analyzed from content</div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-500" /> Health Score
                      </h3>
                      {(() => {
                        const text = isTask ? selectedActivityItem.description : stripHtml(selectedActivityItem.messageText);
                        const risk = getActivityRisk(text);
                        const health = getActivityHealth(risk.level);
                        return (
                          <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl flex items-center gap-3">
                            <div className={`text-2xl font-black ${health.color}`}>{health.change}</div>
                            <div>
                              <div className="text-sm font-bold text-gray-700">Impact</div>
                              <div className={`text-xs font-bold mt-0.5 ${health.color}`}>{health.status}</div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                      <ArrowRightCircle className="w-4 h-4 text-primary" /> Recommended Next Steps
                    </h3>
                    <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl space-y-2">
                      {(() => {
                        const text = isTask ? selectedActivityItem.description : stripHtml(selectedActivityItem.messageText);
                        const risk = getActivityRisk(text);
                        const steps = getActivityNextSteps(risk.level, selectedActivityItem.itemType, selectedActivityItem);
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
          className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          style={{ zIndex: 110000 }}
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

      {/* Activity Toast */}
      {activityToast && (
        <div 
          className="fixed bottom-6 right-6 bg-dark-800 border border-slate-700 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in max-w-sm"
          style={{ zIndex: 100000 }}
        >
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <RefreshCw className={`w-4 h-4 text-primary ${syncingMs365 ? 'animate-spin' : ''}`} />
          </div>
          <p className="text-xs font-semibold leading-relaxed">{activityToast}</p>
        </div>
      )}

      {/* ========================================================
          MODALS INTERFACE
          ======================================================== */}


      {/* Modal: Log Interaction Activity */}
      {isLogInteractionOpen && (
        <div 
          className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: 100000 }}
        >
          <div className="glass w-full max-w-2xl rounded-2xl border border-slate-700/80 flex flex-col shadow-2xl max-h-[92vh] overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-dark-900/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <CheckSquare className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Log Interaction</h3>
                  <p className="text-xs text-slate-500">Record an interaction for this account</p>
                </div>
              </div>
              <button onClick={() => { setIsLogInteractionOpen(false); resetInteractionForm(); }} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLogInteraction} className="overflow-y-auto flex-1">
              <div className="p-6 space-y-5">
                {/* Interaction Type selection */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-450 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3" /> Channel / Interaction Type
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
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer transition-all duration-150 ${isActive
                            ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20'
                            : 'bg-dark-900/60 border-slate-700 text-slate-350 hover:border-slate-550'
                            }`}
                        >
                          <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : ch.color}`} />
                          {ch.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Client contact selection */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-450 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <Users className="w-3 h-3" /> Client Contact
                  </label>
                  <select
                    value={interactionContactId}
                    onChange={(e) => setInteractionContactId(e.target.value)}
                    className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                  >
                    <option value="">{contacts.length === 0 ? 'No contacts found' : 'Select Contact'}</option>
                    {contacts.map(c => (
                      <option key={c.contactId} value={c.contactId}>
                        {c.name} — {c.designation || c.hierarchyTag}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date & Time selection */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-450 uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" /> Date
                    </label>
                    <input
                      type="date"
                      value={interactionDate}
                      onChange={(e) => setInteractionDate(e.target.value)}
                      className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-450 uppercase font-bold tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3 h-3" /> Time
                    </label>
                    <input
                      type="time"
                      value={interactionTime}
                      onChange={(e) => setInteractionTime(e.target.value)}
                      className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Interaction message content */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-450 uppercase font-bold tracking-wider">Notes / Message Content *</label>
                  <textarea
                    value={interactionText}
                    onChange={(e) => setInteractionText(e.target.value)}
                    rows={5}
                    className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-3 focus:outline-none focus:border-primary/50 resize-none leading-relaxed"
                    placeholder="Enter interaction log text..."
                  />
                </div>

                {/* Attachments */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-450 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-slate-500" /> Attachments
                  </label>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center justify-center gap-2 px-4 py-3 bg-dark-900 border border-slate-700/80 hover:border-slate-500 rounded-xl text-xs font-semibold text-slate-350 hover:bg-dark-700 cursor-pointer active:scale-98 transition-all w-fit">
                        <Upload className="w-4 h-4" />
                        <span>Choose Files</span>
                        <input
                          type="file"
                          multiple
                          onChange={handleFileChange}
                          className="hidden"
                          disabled={uploading}
                        />
                      </label>
                      {uploading && (
                        <span className="text-xs text-slate-550 animate-pulse flex items-center gap-1.5 font-bold">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                          Uploading...
                        </span>
                      )}
                    </div>

                    {attachmentsList.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-dark-900/60 border border-slate-800 rounded-2xl">
                        {attachmentsList.map((file, idx) => (
                          <div key={idx} className="relative group bg-slate-905 border border-slate-800 rounded-xl p-2.5 flex items-center gap-3 overflow-hidden shadow-sm">
                            <div className="shrink-0 w-8 h-8 rounded-lg bg-dark-800 border border-slate-800 flex items-center justify-center overflow-hidden">
                              {file.type.startsWith('image/') ? (
                                <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                              ) : file.type.startsWith('video/') ? (
                                <Video className="w-4 h-4 text-indigo-400" />
                              ) : (
                                <FileText className="w-4 h-4 text-amber-400" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-200 truncate pr-4">{file.name}</p>
                              <p className="text-[10px] text-slate-500 font-bold">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveAttachment(idx)}
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Task assignments / Mentions */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-450 uppercase font-bold tracking-wider flex items-center gap-1.5">
                    <AtSign className="w-3 h-3" /> Assign Task
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={mentionSearch}
                      onFocus={() => setShowMentionDropdown(true)}
                      onChange={(e) => handleMentionSearchChange(e.target.value)}
                      onBlur={() => setTimeout(() => setShowMentionDropdown(false), 150)}
                      placeholder="Type @name to assign task..."
                      className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50"
                    />
                    {showMentionDropdown && (() => {
                      const query = getMentionSearchQuery(mentionSearch);
                      const filteredStaff = staffList.filter(s =>
                        s.name.toLowerCase().includes(query.toLowerCase()) ||
                        s.email.toLowerCase().includes(query.toLowerCase())
                      );
                      if (filteredStaff.length === 0 || !mentionSearch.includes('@')) return null;
                      return (
                        <div className="absolute z-15 w-full top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden max-h-36 overflow-y-auto">
                          {filteredStaff.map(s => {
                            const isSelected = selectedMentions.some(m => m.uid === s.uid);
                            return (
                              <button
                                key={s.uid}
                                type="button"
                                onMouseDown={() => insertMention(s)}
                                className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-800 transition-colors text-slate-700 ${isSelected ? 'bg-primary/5 text-primary' : ''
                                  }`}
                              >
                                <div className="flex flex-col items-start text-left">
                                  <span className="font-bold text-black">{s.name}</span>
                                  <span className="text-xs text-slate-500 font-semibold">{s.role}</span>
                                </div>
                                {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <Square className="w-3.5 h-3.5 text-slate-400" />}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                  {selectedMentions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedMentions.map(m => (
                        <span key={m.uid} className="flex items-center gap-1 bg-primary/10 border border-primary/30 text-primary text-xs font-semibold rounded-full px-2 py-0.5">
                          @{m.name}
                          <button type="button" onClick={() => toggleMention(m)} className="hover:text-red-500 ml-0.5 cursor-pointer">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {selectedMentions.length > 0 && (
                  <div className="grid grid-cols-2 gap-4 mt-3 p-3 bg-slate-900/50 rounded-xl border border-slate-850">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Due Date</label>
                      <input
                        type="date"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                        className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Priority</label>
                      <select
                        value={taskPriority}
                        onChange={(e) => setTaskPriority(e.target.value)}
                        className="w-full bg-dark-900/60 border border-slate-700 text-xs text-white rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                      >
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-dark-900/40">
                <button
                  type="button"
                  onClick={() => { setIsLogInteractionOpen(false); resetInteractionForm(); }}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-primary hover:bg-blue-600 text-xs text-white font-semibold rounded-xl px-5 py-2.5 flex items-center gap-2 transition-all shadow-lg shadow-primary/20 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Save &amp; Assign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Health Score Explanation Breakdown */}
      {isHealthExplanationOpen && (
        <div 
          className="fixed inset-0 bg-dark-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: 100000 }}
        >
          <div className="glass w-full max-w-2xl rounded-2xl border border-slate-700/80 flex flex-col shadow-2xl max-h-[92vh] overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-bold text-white text-sm">Health Score Breakdown</h3>
                  <p className="text-xs text-slate-500">Pillar calculations contributing to client health status</p>
                </div>
              </div>
              <button
                onClick={() => { setIsHealthExplanationOpen(false); setExplanationData(null); }}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              {explanationLoading ? (
                <div className="h-64 flex flex-col items-center justify-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="text-xs text-slate-400">Analyzing database logs and metrics...</span>
                </div>
              ) : !explanationData ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Failed to load health score metrics.
                </div>
              ) : (
                <div className="space-y-6 text-xs text-slate-300 leading-relaxed">
                  {/* Summary Banner */}
                  <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 flex items-center gap-6">
                    <div className="relative flex items-center justify-center w-20 h-20 shrink-0">
                      <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                      <span className="text-xl font-black text-white">{explanationData.healthScore}%</span>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-white">Status: <span className={
                        explanationData.healthScore >= 90 ? 'text-emerald-400' :
                          explanationData.healthScore >= 75 ? 'text-blue-400' :
                            explanationData.healthScore >= 50 ? 'text-amber-400' :
                              'text-rose-400'
                      }>{explanationData.status}</span></h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        The score is derived from a weighted calculation across four primary health categories (25% weight each).
                      </p>
                    </div>
                  </div>

                  {/* Dynamic Pillars Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {explanationData.factors ? (
                      Object.entries(explanationData.factors).map(([key, factor], index) => {
                        const titles = {
                          engagement: 'Engagement Frequency',
                          responsiveness: 'Responsiveness',
                          sentiment: 'Sentiment Trend',
                          stakeholders: 'Stakeholder Coverage',
                          riskSignals: 'Risk Signals',
                          commitments: 'Commitments & Actions',
                          business: 'Business & Expansion'
                        };
                        return (
                          <div key={key} className="bg-dark-900/60 border border-slate-800 rounded-xl p-4.5 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-200">{index + 1}. {titles[key] || key}</span>
                              <span className="text-xs font-black text-primary">{Math.round(factor.score || 0)}/100</span>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              {factor.reason}
                            </p>
                            <div className="text-xs p-2 bg-slate-900/40 rounded border border-slate-850 space-y-1 font-medium max-h-28 overflow-y-auto">
                              {factor.signals && factor.signals.length > 0 ? (
                                factor.signals.map((signal, idx) => (
                                  <div key={idx} className="flex gap-1.5 items-start text-slate-300">
                                    <span className="mt-1 w-1 h-1 rounded-full bg-primary flex-shrink-0" />
                                    <span>{signal}</span>
                                  </div>
                                ))
                              ) : (
                                <span className="text-slate-500">No specific signals detected.</span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="col-span-1 md:col-span-2 text-center text-slate-500 p-4 border border-slate-800 rounded-xl bg-dark-900/60">
                        Detailed factors are not available for this legacy health score.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => { setIsHealthExplanationOpen(false); setExplanationData(null); }}
                className="bg-primary hover:bg-blue-600 text-xs text-white font-semibold rounded-xl px-5 py-2 transition-colors cursor-pointer"
              >
                Close breakdown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

