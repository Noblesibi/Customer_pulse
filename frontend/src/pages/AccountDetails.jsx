import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Plus, Search, Edit2, Trash2, Globe, Building2, ShieldAlert, UserPlus, Send, X,
  MessageSquare, Mail, Calendar, Clock, Users, AtSign, CheckSquare, Square, Mic, Video,
  CheckCheck, Phone, Paperclip, Upload, FileText, Loader2, ArrowLeft, BrainCircuit, ChevronLeft, User, Map as MapIcon, Target, AlertTriangle, Lightbulb,
  Activity, ArrowRightCircle, RefreshCw, ChevronDown, ChevronUp, ClipboardList, Gift, Download, PartyPopper, Settings, Sparkles
} from 'lucide-react';
import { useStore } from '../store/index.js';
import { formatDate, formatTime, formatDateTime, getCurrentKolkataDate, getCurrentKolkataTime } from '../utils/dateFormat.js';

import StakeholdersTab from '../components/AccountTabs/StakeholdersTab.jsx';
import OpportunitiesTab from '../components/AccountTabs/OpportunitiesTab.jsx';
import CustomerJourneyTab from '../components/AccountTabs/CustomerJourneyTab.jsx';
import SmartInsightsTab from '../components/AccountTabs/SmartInsightsTab.jsx';
import RisksTab from '../components/AccountTabs/RisksTab.jsx';
import InteractionsTab from '../components/AccountTabs/InteractionsTab.jsx';
import TasksTab from '../components/AccountTabs/TasksTab.jsx';
import GreetingsTab from '../components/AccountTabs/GreetingsTab.jsx';
import NotesTab from '../components/AccountTabs/NotesTab.jsx';
import AccountHealthTab from '../components/AccountTabs/AccountHealthTab.jsx';
import OutlookMailTab from '../components/AccountTabs/OutlookMailTab.jsx';
import ScoreTrendGraph from '../components/ScoreTrendGraph.jsx';
import { getAccountHealthConfig } from '../utils/healthUtils.js';
import { Home, HeartPulse as HeartPulseIcon, TrendingUp, CheckCircle2, ArrowRight } from 'lucide-react';
import {
  JOURNEY_STAGES,
  getStageSuggestion as computeStageSuggestion,
  getAutoProgressionStep
} from '../utils/journeyUtils.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import { READY_MADE_RISK_RULES, getRiskCategoryId } from '../utils/riskRulesCatalog.js';
export const getStageSuggestion = (currentStage, interactions = []) => {
  if (!interactions || interactions.length === 0) return null;

  const stages = ['Awareness', 'Consideration', 'Decision', 'Retention', 'Advocacy'];
  const currentIndex = stages.indexOf(currentStage);

  // Helper for auto-detecting journey stage from interaction details
  const autoDetectStage = (item) => {
    if (item.stage && stages.includes(item.stage)) return item.stage;
    const text = (
      (item.title || '') + ' ' +
      (item.details || '') + ' ' +
      (item.subject || '') + ' ' +
      (item.channel || '') + ' ' +
      (item.notes || '') + ' ' +
      (item.description || '') + ' ' +
      (item.messageText || '')
    ).toLowerCase();

    if (text.includes('advocacy') || text.includes('referral') || text.includes('advocate') || text.includes('case study') || text.includes('testimonial')) return 'Advocacy';
    if (text.includes('retention') || text.includes('renew') || text.includes('qbr') || text.includes('expansion') || text.includes('upsell') || text.includes('onboarding') || text.includes('health')) return 'Retention';
    if (text.includes('decision') || text.includes('contract') || text.includes('proposal') || text.includes('pricing') || text.includes('procurement') || text.includes('legal') || text.includes('po ') || text.includes('closing')) return 'Decision';
    if (text.includes('workshop') || text.includes('requirement') || text.includes('technical') || text.includes('poc') || text.includes('evaluation') || text.includes('demo') || text.includes('deep dive')) return 'Consideration';
    return 'Awareness';
  };

  // Find the highest stage reached according to interactions
  let highestDetectedIndex = -1;
  interactions.forEach(item => {
    const detected = autoDetectStage(item);
    const idx = stages.indexOf(detected);
    if (idx > highestDetectedIndex) {
      highestDetectedIndex = idx;
    }
  });

  // If the highest detected stage is not strictly greater than the current stage, no suggestion needed
  if (highestDetectedIndex <= currentIndex) {
    return null;
  }

  // The suggested stage is the highest detected one
  const suggestedStage = stages[highestDetectedIndex];

  // Build the text summary based on the interactions that led to this detected stage
  const interactionsForSuggestedStage = interactions.filter(i => autoDetectStage(i) === suggestedStage);
  const sorted = [...interactionsForSuggestedStage].sort((a, b) => new Date(b.date || b.timestamp || 0) - new Date(a.date || a.timestamp || 0));
  const recent = sorted.slice(0, 3);
  const titles = Array.from(new Set(recent.map(i => i.subject || i.title || i.taskHeader || i.channel).filter(Boolean)));

  let textSummary = '';
  if (titles.length > 0) {
    textSummary = `activities like "${titles.join('", "')}"`;
  } else {
    textSummary = 'recent activities';
  }

  let reason = '';
  switch (suggestedStage) {
    case 'Consideration':
      reason = `Based on ${textSummary}, the customer has shown active interest. Consider moving to Consideration to focus on technical evaluation and requirements.`; break;
    case 'Decision':
      reason = `With ${textSummary} completed, technical evaluations are progressing well. Move to Decision to finalize proposals and contracts.`; break;
    case 'Retention':
      reason = `Recent ${textSummary} indicate that contracts are signed or nearing completion. Move to Retention to focus on successful onboarding, delivery, and ongoing support.`; break;
    case 'Advocacy':
      reason = `Based on successful ${textSummary}, the customer is stable and realizing consistent value. Move to Advocacy to explore case studies, testimonials, and referrals.`; break;
    default: return null;
  }

  return { suggested: suggestedStage, reason };
};

const JOURNEY_STAGE_TOOLTIPS = {
  Awareness: 'Initial discovery and introductory touchpoints with the customer.',
  Consideration: 'Active interest — technical evaluation, demos, PoC, and requirements gathering.',
  Decision: 'Finalizing proposals, pricing, legal/procurement review, and contract closure.',
  Retention: 'Active customer — onboarding, delivery execution, QBRs, and ongoing account health.',
  Advocacy: 'Trusted long-term partner — case studies, testimonials, referrals, and expansion.'
};

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
  const location = useLocation();

  const handleBack = () => {
    if (location.state?.from) {
      navigate(location.state.from);
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/accounts');
    }
  };

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
    staffTasks,
    fetchStaffTasks
  } = useStore();

  const [account, setAccount] = useState(null);
  const [activeTab, setActiveTab] = useState(location.state?.tab || location.state?.defaultTab || 'Overview');

  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
    }
  }, [location.state]);
  const [loading, setLoading] = useState(true);
  const [nbas, setNbas] = useState([]);
  const [journeyStage, setJourneyStage] = useState('Awareness');
  const [showStageDropdown, setShowStageDropdown] = useState(false);
  const [showJourneySuggestion, setShowJourneySuggestion] = useState(false);
  const [hasJourneySuggestion, setHasJourneySuggestion] = useState(true);
  const [journeyMeta, setJourneyMeta] = useState({
    previousStage: 'None',
    stageChangedOn: null,
    stageChangedTimestamp: null,
    reason: '',
    triggerType: 'initial',
    manualOverrideAt: null
  });
  const [journeyPopup, setJourneyPopup] = useState(null);
  const [journeyHistory, setJourneyHistory] = useState([]);
  const journeyPopupTimerRef = useRef(null);
  const overviewStageDropdownRef = useRef(null);
  const overviewSuggestionRef = useRef(null);
  const ownerDropdownRef = useRef(null);

  // Owner searchable dropdown state
  const [ownerSearch, setOwnerSearch] = useState('');
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
  const [stakeholderSearch, setStakeholderSearch] = useState({});
  const [showStakeholderDropdown, setShowStakeholderDropdown] = useState({});
  const [openInfluenceDropdown, setOpenInfluenceDropdown] = useState(null);

  // Modals state
  const [isLogInteractionOpen, setIsLogInteractionOpen] = useState(false);
  const [isHealthExplanationOpen, setIsHealthExplanationOpen] = useState(false);
  const [explanationData, setExplanationData] = useState(null);
  const [explanationLoading, setExplanationLoading] = useState(false);

  // Live Database Health Score synchronized with PostgreSQL
  const liveHealth = account?.healthScore ?? 50;
  const healthCfg = getAccountHealthConfig(liveHealth);

  // Permissions
  const isAccountOwner = account && (user?.uid === account.ownerId || (user?.email && user?.email === account.ownerEmail) || (user?.name && user?.name === account.ownerName));
  const canEditOwners = user?.role === 'Admin' || user?.name?.toLowerCase().startsWith('nazneen') || isAccountOwner;
  const canEditAccount = ['Admin', 'Sales Manager', 'Executive'].includes(user?.role) || isAccountOwner;

  // My Activity embedded panel state
  const [activityLoading, setActivityLoading] = useState(false);
  const [allActivities, setAllActivities] = useState([]);
  const [allUsersActivities, setAllUsersActivities] = useState([]);

  // Compute all contacts related to this account (explicitly mapped + implicitly involved via activities)
  const accountContacts = React.useMemo(() => {
    const mapped = contacts.filter(c => c.accountId === (account?.accountId || account?.id || id) || c.account_id === (account?.accountId || account?.id || id));
    const activityContactIds = new Set();
    allActivities.forEach(a => {
      if (a.contactId) activityContactIds.add(a.contactId);
      if (a.participants) {
        a.participants.forEach(p => {
          if (p.contactId) activityContactIds.add(p.contactId);
          else if (p.id) activityContactIds.add(p.id);
        });
      }
      if (a.to) {
        a.to.forEach(t => {
          if (typeof t === 'object' && t.contactId) activityContactIds.add(t.contactId);
        });
      }
      if (a.from && typeof a.from === 'object' && a.from.contactId) {
        activityContactIds.add(a.from.contactId);
      }
    });

    const additional = contacts.filter(c => activityContactIds.has(c.contactId || c.id) && !mapped.find(m => (m.contactId || m.id) === (c.contactId || c.id)));
    return [...mapped, ...additional];
  }, [contacts, account, id, allActivities]);

  // Strictly filter interactions to this account only - never leak other accounts' interactions
  const accountInteractions = React.useMemo(() => {
    const accIdVal = account?.accountId || account?.id || id;
    return (interactions || []).filter(i => {
      const iAcc = i.accountId || i.account_id;
      return iAcc === accIdVal;
    });
  }, [interactions, account, id]);
  const [associatedUsers, setAssociatedUsers] = useState([]);
  const [activityUid, setActivityUid] = useState('all');
  const [pendingScrollId, setPendingScrollId] = useState(null);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [selectedActivityItem, setSelectedActivityItem] = useState(null);
  const [aiAnalysisCache, setAiAnalysisCache] = useState({});
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Fetch AI recommended next steps & analysis dynamically using Gemini AI
  useEffect(() => {
    if (!selectedActivityItem) return;
    const isTask = selectedActivityItem.itemType === 'task';
    const key = selectedActivityItem.interactionId || selectedActivityItem.taskId || selectedActivityItem.id || (selectedActivityItem.title || selectedActivityItem.subject);
    if (!key || aiAnalysisCache[key]) return;

    let isMounted = true;
    const fetchAiAnalysis = async () => {
      try {
        setIsAiLoading(true);
        const authToken = token || localStorage.getItem('cp_token');
        const res = await fetch('/CustomerPulse/api/ai/activity-next-steps', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
          },
          body: JSON.stringify({
            title: isTask ? selectedActivityItem.title : (selectedActivityItem.subject || ''),
            content: isTask ? selectedActivityItem.description : (selectedActivityItem.messageText || ''),
            type: isTask ? 'Task' : (selectedActivityItem.type || selectedActivityItem.channel || 'Email'),
            source: selectedActivityItem.source || (isTask ? 'Staff Task' : 'Email'),
            accountName: account?.name || '',
            contactName: selectedActivityItem.contactName || selectedActivityItem.assignedToName || '',
            status: selectedActivityItem.status || '',
            priority: selectedActivityItem.priority || '',
            sentiment: selectedActivityItem.sentiment || ''
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (isMounted && data) {
            setAiAnalysisCache(prev => ({ ...prev, [key]: data }));
          }
        }
      } catch (err) {
        console.error('Error fetching AI activity analysis:', err);
      } finally {
        if (isMounted) setIsAiLoading(false);
      }
    };

    fetchAiAnalysis();
    return () => { isMounted = false; };
  }, [selectedActivityItem, token, account?.name]);
  const [syncingMs365, setSyncingMs365] = useState(false);
  const [activityToast, setActivityToast] = useState(null);

  const showActivityToast = (msg) => {
    const text = typeof msg === 'string'
      ? msg
      : (msg?.message ? (msg.title ? `${msg.title}: ${msg.message}` : msg.message) : (msg?.title || String(msg || '')));
    setActivityToast(text);
    setTimeout(() => setActivityToast(null), 3000);
  };

  const currentAccId = account?.accountId || account?.id || id;

  const [accountRiskConfig, setAccountRiskConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('customer_pulse_risk_rules_global');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
  });

  const [syncedRiskMetrics, setSyncedRiskMetrics] = useState(null);

  useEffect(() => {
    try {
      const accountSaved = currentAccId ? localStorage.getItem(`customer_pulse_risk_config_${currentAccId}`) : null;
      const globalSaved = localStorage.getItem('customer_pulse_risk_rules_global');
      const saved = accountSaved || globalSaved;
      if (saved) setAccountRiskConfig(JSON.parse(saved));
      else setAccountRiskConfig(null);
    } catch (e) {}
  }, [currentAccId]);

  useEffect(() => {
    const handleRiskRulesSync = (e) => {
      if (!e?.detail) return;
      if (e.detail.accountId && e.detail.accountId !== currentAccId) return; // Strict account isolation
      if (e.detail.global || e.detail.payload || e.detail.riskPayload || e.detail.accountId === currentAccId) {
        setAccountRiskConfig(e.detail.payload || e.detail.riskPayload || null);
      }
    };
    window.addEventListener('account-risk-rules-updated', handleRiskRulesSync);
    window.addEventListener('health-rules-updated', handleRiskRulesSync);
    return () => {
      window.removeEventListener('account-risk-rules-updated', handleRiskRulesSync);
      window.removeEventListener('health-rules-updated', handleRiskRulesSync);
    };
  }, [currentAccId]);

  const currentOpenRisks = useMemo(() => {
    if (syncedRiskMetrics?.activeRisks) {
      return syncedRiskMetrics.activeRisks;
    }
    const raw = (Array.isArray(risks) ? risks : []).filter(
      r => (r.accountId === currentAccId || r.account_id === currentAccId) && (r.status || '').toLowerCase() !== 'resolved'
    );
    if (!accountRiskConfig) return raw;

    const catEnabled = accountRiskConfig.categoryEnabled || {};
    const actRules = accountRiskConfig.activeRules || {};

    return raw.filter(r => {
      const catId = getRiskCategoryId(r);
      if (catId && catEnabled[catId] === false) return false;

      const titleLower = (r.title || '').toLowerCase();
      const ruleLower = (r.rule || '').toLowerCase();
      const descLower = (r.description || '').toLowerCase();

      const matchedRule = READY_MADE_RISK_RULES.find(catalogRule => {
        const catNameLower = (catalogRule.name || catalogRule.label || '').toLowerCase();
        return (catNameLower && (titleLower.includes(catNameLower) || ruleLower.includes(catNameLower))) ||
               (catalogRule.trigger && descLower.includes(catalogRule.trigger.toLowerCase()));
      });

      if (matchedRule) {
        const isRuleActive = actRules[matchedRule.id] === true || (actRules[matchedRule.id] === undefined && matchedRule.defaultEnabled === true);
        if (!isRuleActive) return false;
      }
      return true;
    });
  }, [risks, currentAccId, accountRiskConfig, syncedRiskMetrics]);

  // ── Notify (role-aware: Admin / Account Owner / Key Contact Owner) ──
  const [notifiedRiskKeys, setNotifiedRiskKeys] = useState(new Set());
  const [isSendingNotify, setIsSendingNotify] = useState(false);
  const SEVERITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };
  const topOpenRisk = useMemo(() => {
    const list = [...currentOpenRisks];
    return list.sort((a, b) => {
      const aSev = SEVERITY_WEIGHT[(a.severity || 'medium').toLowerCase()] || 0;
      const bSev = SEVERITY_WEIGHT[(b.severity || 'medium').toLowerCase()] || 0;
      return bSev - aSev;
    })[0] || null;
  }, [currentOpenRisks]);
  const topRiskKey = topOpenRisk ? (topOpenRisk.riskId || topOpenRisk.id || topOpenRisk.category) : null;
  const isTopRiskNotified = Boolean(topRiskKey && notifiedRiskKeys.has(topRiskKey));

  useEffect(() => {
    if (!id || !token) return;
    fetch(`/CustomerPulse/api/risks/notify/recipients?accountId=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data) setNotifiedRiskKeys(new Set(data.notifiedKeys || [])); })
      .catch(() => { });
  }, [id, token]);

  const handleNotifyTopRisk = async () => {
    if (!topOpenRisk || isSendingNotify) return;
    setIsSendingNotify(true);
    try {
      const res = await fetch('/CustomerPulse/api/risks/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          accountId: id,
          risk: {
            riskId: topOpenRisk.riskId,
            key: topRiskKey,
            title: topOpenRisk.category,
            severity: topOpenRisk.severity,
            category: topOpenRisk.category,
            description: topOpenRisk.description || ''
          }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send notification');
      const names = (data.recipients || []).map(r => r.name).join(', ');
      showActivityToast(`Notified ${names} via email & in-app (as ${data.senderRole})`);
      setNotifiedRiskKeys(prev => new Set(prev).add(data.riskKey || topRiskKey));
    } catch (err) {
      showActivityToast(err.message);
    } finally {
      setIsSendingNotify(false);
    }
  };
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

  const loadAccountData = async (silent = false) => {
    if (!id || !token) return;
    try {
      if (!silent && !account) setLoading(true);

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
        fetchAccountSummary(id),
        fetchStaffTasks ? fetchStaffTasks('all-tasks') : Promise.resolve()
      ]);

      if (accountData) {
        setAccount(accountData);
        let dbHistoryList = Array.isArray(accountData.journeyHistory) ? accountData.journeyHistory : [];
        if (dbHistoryList.length === 0) {
          try {
            const jhRes = await fetch(`/CustomerPulse/api/accounts/${id}/journey`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (jhRes.ok) {
              const parsedJh = await jhRes.json();
              if (Array.isArray(parsedJh)) dbHistoryList = parsedJh;
            }
          } catch {
            // Non-fatal
          }
        }
        setJourneyHistory(dbHistoryList);

        const latestHist = dbHistoryList.length > 0 ? dbHistoryList[0] : null;
        const dbStage = accountData.journeyStage || latestHist?.toStage || 'Awareness';
        const dbUpdatedIso = accountData.journeyUpdatedAt || latestHist?.timestamp || null;
        const dbPrevStage =
          accountData.previousJourneyStage ||
          (latestHist?.fromStage && latestHist.fromStage !== dbStage ? latestHist.fromStage : 'None');
        const dbReason = accountData.journeyReason || latestHist?.reason || '';
        const dbTrigger = accountData.journeyTrigger || latestHist?.triggerType || 'initial';

        setJourneyStage(dbStage);
        setJourneyMeta({
          previousStage: dbPrevStage,
          stageChangedOn: dbUpdatedIso ? formatDate(dbUpdatedIso) : null,
          stageChangedTimestamp: dbUpdatedIso,
          reason: dbReason,
          triggerType: dbTrigger,
          manualOverrideAt: accountData.journeyManualOverrideAt || (
            (dbTrigger === 'manual' || dbTrigger === 'suggestion') ? dbUpdatedIso : null
          )
        });
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


  const combinedJourneyActivities = React.useMemo(() => {
    const accIdVal = account?.accountId || account?.id || id;
    const storeInts = (interactions || [])
      .filter(i => (i.accountId || i.account_id) === accIdVal)
      .map(i => ({ ...i, itemType: 'interaction' }));
    const accountStaffTasks = (staffTasks || [])
      .filter(t => t.accountId === accIdVal || t.account_id === accIdVal || (account?.companyName && t.companyName?.toLowerCase() === account.companyName?.toLowerCase()))
      .map(t => ({ ...t, itemType: 'task' }));

    if (allActivities && allActivities.length > 0) {
      const existingTaskIds = new Set(allActivities.filter(a => a.itemType === 'task').map(t => t.taskId || t.id));
      const extraTasks = accountStaffTasks.filter(t => !existingTaskIds.has(t.taskId || t.id));
      return [...allActivities, ...extraTasks];
    }
    return [...storeInts, ...accountStaffTasks];
  }, [allActivities, interactions, staffTasks, account?.accountId, account?.id, account?.companyName, id]);

  const activeJourneySuggestion = React.useMemo(
    () => computeStageSuggestion(journeyStage, combinedJourneyActivities, nbas),
    [journeyStage, combinedJourneyActivities, nbas]
  );

  const handleUpdateJourneyStage = async (newStage, { triggerType = 'manual', reason = '' } = {}) => {
    if (!newStage || newStage === journeyStage) {
      setShowStageDropdown(false);
      setShowJourneySuggestion(false);
      return;
    }

    const prevStage = journeyStage || account?.journeyStage || 'Awareness';
    const nowIso = new Date().toISOString();
    const formattedToday = formatDate(nowIso);
    const isManual = triggerType === 'manual' || triggerType === 'suggestion';

    const effectiveReason = reason || (
      triggerType === 'manual'
        ? `Manually updated from ${prevStage} to ${newStage} by ${user?.name || 'user'}.`
        : `Updated from ${prevStage} to ${newStage}.`
    );

    const nextMeta = {
      currentStage: newStage,
      previousStage: prevStage,
      stageChangedOn: formattedToday,
      stageChangedTimestamp: nowIso,
      reason: effectiveReason,
      triggerType,
      manualOverrideAt: isManual ? nowIso : (journeyMeta?.manualOverrideAt || null)
    };

    setJourneyStage(newStage);
    setJourneyMeta(nextMeta);
    setJourneyHistory(prev => [
      {
        fromStage: prevStage,
        toStage: newStage,
        reason: effectiveReason,
        triggerType,
        timestamp: nowIso
      },
      ...(Array.isArray(prev) ? prev : [])
    ]);

    setAccount(prev => prev ? {
      ...prev,
      journeyStage: newStage,
      stage: newStage,
      previousJourneyStage: prevStage,
      journeyUpdatedAt: nowIso,
      journeyReason: effectiveReason,
      journeyTrigger: triggerType,
      ...(isManual ? { journeyManualOverrideAt: nowIso } : {})
    } : prev);

    setShowStageDropdown(false);
    setShowJourneySuggestion(false);

    // Show compact on-screen Journey Change Pop-up (stage transition only)
    if (journeyPopupTimerRef.current) clearTimeout(journeyPopupTimerRef.current);
    setJourneyPopup({
      fromStage: prevStage,
      toStage: newStage,
      triggerType
    });
    journeyPopupTimerRef.current = setTimeout(() => {
      setJourneyPopup(null);
    }, 4000);

    try {
      const res = await fetch(`/CustomerPulse/api/accounts/${id}/journey`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          journeyStage: newStage,
          fromStage: prevStage,
          reason: effectiveReason,
          triggerType
        })
      });
      if (!res.ok) throw new Error('Update failed');
    } catch (err) {
      console.error('Failed to update journey stage:', err);
    }
  };

  // Automatic step-by-step ("one-to-one") Customer Journey progression from confirmed interactions
  useEffect(() => {
    if (loading || !account || combinedJourneyActivities.length === 0) return;
    const autoStep = getAutoProgressionStep(
      journeyStage,
      combinedJourneyActivities,
      journeyMeta?.manualOverrideAt
    );
    if (!autoStep || !autoStep.nextStage || autoStep.nextStage === journeyStage) return;

    const timer = setTimeout(() => {
      handleUpdateJourneyStage(autoStep.nextStage, {
        triggerType: 'auto',
        reason: autoStep.reason
      });
    }, 450);

    return () => clearTimeout(timer);
  }, [loading, account?.accountId, journeyStage, combinedJourneyActivities, journeyMeta?.manualOverrideAt]);

  // Click-outside handler for user dropdown & Overview journey dropdowns
  useEffect(() => {
    function handleClickOutside(event) {
      if (overviewStageDropdownRef.current && !overviewStageDropdownRef.current.contains(event.target)) {
        setShowStageDropdown(false);
      }
      if (overviewSuggestionRef.current && !overviewSuggestionRef.current.contains(event.target)) {
        setShowJourneySuggestion(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setIsUserDropdownOpen(false);
      }
      if (ownerDropdownRef.current && !ownerDropdownRef.current.contains(event.target)) {
        setShowOwnerDropdown(false);
      }
      if (!event.target.closest('.stakeholder-dropdown-container')) {
        setShowStakeholderDropdown({});
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

      const greetingEventTypes = ['birthday', 'work_anniversary', 'company_anniversary', 'festival', 'welcome', 'farewell', 'promotion', 'achievement', 'custom_greeting'];
      const userActivities = [
        ...interactionsData
          .filter(i => i.source !== 'System Email')
          .map(i => ({ ...i, itemType: 'interaction', isOther: false })),
        ...interactionsData
          .filter(i => i.source === 'System Email')
          .map(i => ({ ...i, itemType: greetingEventTypes.includes(i.eventType) ? 'greeting' : 'mail_tracking', isOther: false })),
        ...tasks.map(t => ({ ...t, itemType: 'task', isOther: false }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      if (isBackgroundFetch && uid !== activityUid) {
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

  // Ensure Account Owner and Key Contact Owners are always in the dropdown
  useEffect(() => {
    setAssociatedUsers(prev => {
      if (!prev || prev.length === 0) return prev;
      const usersMap = new Map();
      prev.forEach(u => usersMap.set(u.uid, u));

      if (account && account.ownerId) {
        usersMap.set(account.ownerId, { uid: account.ownerId, name: account.ownerName || account.ownerId });
      }

      if (contacts && contacts.length > 0) {
        contacts.forEach(c => {
          if (c.ownerId) {
            usersMap.set(c.ownerId, { uid: c.ownerId, name: c.ownerName || c.ownerId });
          }
        });
      }

      const uniqueNames = new Set();
      const filteredUsers = [];
      Array.from(usersMap.values()).forEach(u => {
        if (u.uid === 'all') return;
        const displayName = u.uid === user?.uid ? 'Me' : u.name;
        if (!uniqueNames.has(displayName)) {
          uniqueNames.add(displayName);
          filteredUsers.push(u);
        }
      });
      filteredUsers.unshift({ uid: 'all', name: 'All Users' });
      return filteredUsers;
    });
  }, [account, contacts, user?.uid]);

  const handleActivityUserChange = (newUid) => {
    setActivityUid(newUid);
    setIsUserDropdownOpen(false);
  };

  // Continuous Live Auto-Sync: automatically keeps interactions and activities up to date
  useEffect(() => {
    if (!token || !id) return;

    // Trigger initial silent background sync with Microsoft 365
    fetch('/CustomerPulse/api/integrations/microsoft/sync', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data?.syncRecord?.results?.synced > 0) {
          if (activityUid) loadActivityData(activityUid, true);
          fetchInteractions(id);
          if (fetchStaffTasks) fetchStaffTasks('all-tasks');
        }
      })
      .catch(err => console.debug('Initial silent auto-sync note:', err));

    // Load real database health factors for the account
    if (fetchHealthExplanation) {
      fetchHealthExplanation(id).then(d => {
        if (d) setExplanationData(d);
      }).catch(err => console.debug('Explanation sync error:', err));
    }

    // Live silent background polling every 60 seconds
    const liveTimer = setInterval(() => {
      if (activityUid) {
        loadActivityData(activityUid, true);
      }
      fetchInteractions(id);
      if (fetchHealthExplanation) {
        fetchHealthExplanation(id).then(d => {
          if (d) setExplanationData(d);
        }).catch(() => { });
      }
    }, 60000);

    return () => {
      clearInterval(liveTimer);
    };
  }, [id, token, activityUid]);

  // Activity analysis helpers
  const getActivityRisk = (text = '', item = null) => {
    const lower = text.toLowerCase();
    // Celebrations, greetings & recognitions are inherently positive relationship touchpoints
    if (
      lower.includes('congratulat') ||
      lower.includes('achievement') ||
      lower.includes('anniversary') ||
      lower.includes('birthday') ||
      lower.includes('celebrat') ||
      lower.includes('award') ||
      lower.includes('wishing you')
    ) {
      return { level: 'Low Risk', color: 'text-emerald-400', bg: 'bg-emerald-400/10' };
    }
    if (
      lower.includes('delay') ||
      lower.includes('issue') ||
      lower.includes('problem') ||
      lower.includes('decline') ||
      lower.includes('escalat') ||
      lower.includes('blocker') ||
      lower.includes('penalty') ||
      lower.includes('breach')
    ) {
      return { level: 'High Risk', color: 'text-rose-400', bg: 'bg-rose-400/10' };
    }
    if (
      lower.includes('sync') ||
      lower.includes('review') ||
      lower.includes('discuss') ||
      lower.includes('pending')
    ) {
      return { level: 'Medium Risk', color: 'text-amber-400', bg: 'bg-amber-400/10' };
    }
    return { level: 'Low Risk', color: 'text-emerald-400', bg: 'bg-emerald-400/10' };
  };

  const getActivityHealth = (riskLevel) => {
    if (riskLevel === 'High Risk') return { change: 'Risk Flag', status: 'Requires Attention', color: 'text-rose-600' };
    if (riskLevel === 'Medium Risk') return { change: 'Neutral', status: 'Steady Contact', color: 'text-amber-600' };
    return { change: 'Healthy', status: 'Positive Engagement', color: 'text-emerald-600' };
  };

  const getActivityNextSteps = (riskLevel, type, item = {}) => {
    // 0. Use curated steps if explicitly supplied by AI service or database
    if (Array.isArray(item?.nextSteps) && item.nextSteps.length > 0) {
      return item.nextSteps;
    }
    if (Array.isArray(item?.recommendedActions) && item.recommendedActions.length > 0) {
      return item.recommendedActions;
    }

    const isTask = type === 'task' || item?.itemType === 'task';
    const rawTitle = (item?.subject || item?.title || '').trim();
    const rawBody = stripHtml(item?.messageText || item?.description || item?.details || '');
    const fullText = `${rawTitle} ${rawBody}`.toLowerCase();
    const source = (item?.source || '').toLowerCase();
    const taskStatus = (item?.status || '').toLowerCase();
    const hasMentions = Array.isArray(item?.actionMentions) && item.actionMentions.length > 0;
    const isOverdue = isTask ? checkIsOverdue(item?.dueDate, item?.status) : false;

    // 1. Celebrations, Greetings, Anniversaries, Awards & Recognition
    const isCelebration =
      fullText.includes('congratulat') ||
      fullText.includes('achievement') ||
      fullText.includes('anniversary') ||
      fullText.includes('birthday') ||
      fullText.includes('celebrat') ||
      fullText.includes('award') ||
      fullText.includes('recognition') ||
      fullText.includes('milestone') ||
      fullText.includes('wishing you') ||
      fullText.includes('greetings') ||
      fullText.includes('festival') ||
      fullText.includes('holiday');

    if (isCelebration) {
      if (fullText.includes('birthday') || fullText.includes('anniversary')) {
        return [
          'Acknowledge any client reply warmly to build personal and executive rapport.',
          'Verify that milestone dates remain recorded in the contact’s profile for future relationship building.',
          'Schedule an informal catch-up or coffee sync while goodwill and sentiment are high.'
        ];
      }
      if (fullText.includes('award') || fullText.includes('achievement')) {
        return [
          'Acknowledge client appreciation and reinforce NeST Digital’s dedication to shared success.',
          'Explore whether this achievement opens doors for a joint customer success story or case study.',
          'Schedule an upcoming roadmap sync to capitalize on high sentiment and explore expansion initiatives.'
        ];
      }
      return [
        'Acknowledge client responses warmly and leverage positive sentiment to deepen engagement.',
        'Record key relationship milestone dates in the stakeholder directory.',
        'Plan a follow-up touchpoint within 2–3 weeks to sustain executive momentum.'
      ];
    }

    // 2. System-Assigned Task Notifications (e.g. "[Associated Task Assigned] ...")
    const isSystemTaskNotification =
      rawTitle.toLowerCase().includes('[associated task assigned]') ||
      rawTitle.toLowerCase().includes('task assigned') ||
      fullText.includes('you have been assigned an associated task') ||
      fullText.includes('task title:');

    if (isSystemTaskNotification) {
      if (isOverdue || fullText.includes('overdue')) {
        return [
          'Immediate Priority: Unblock pending dependencies and re-engage the assigned owner to resolve the delay.',
          'Communicate an updated delivery schedule to stakeholders to maintain operational transparency.',
          'Mark deliverable completed in the Tasks tab once verified to restore delivery SLA.'
        ];
      }
      return [
        'Review the assigned task deliverables and align with the task owner on expectations and timeline.',
        'Track deliverable execution under the Tasks tab to ensure completion before the target due date.',
        'Log key findings or meeting notes once the action item has been completed.'
      ];
    }

    // 3. High Risk, Urgent Escalations & Project Delays
    const isHighRisk =
      riskLevel === 'High Risk' ||
      item?.riskDetected ||
      fullText.includes('escalat') ||
      fullText.includes('outage') ||
      fullText.includes('downtime') ||
      fullText.includes('blocker') ||
      fullText.includes('critical issue') ||
      fullText.includes('churn') ||
      fullText.includes('dissatisfied') ||
      fullText.includes('penalty') ||
      fullText.includes('breach');

    if (isHighRisk) {
      return [
        'Schedule an immediate stakeholder alignment call with technical leadership to review root causes.',
        'Draft and communicate a structured corrective action plan (CAP) within 24–48 hours.',
        'Establish a regular progress check-in schedule with the client until issue resolution is verified.'
      ];
    }

    // 4. Overdue Tasks
    if (isTask && isOverdue) {
      return [
        'Immediate Priority: Unblock pending dependencies and re-engage the assigned owner to resolve the delay.',
        'Communicate a revised delivery schedule to stakeholders to maintain transparency.',
        'Escalate to the delivery lead if external approvals or inputs are blocking progress.'
      ];
    }

    // 5. Completed Tasks
    if (isTask && (taskStatus.includes('complete') || taskStatus.includes('completed') || taskStatus.includes('accepted & completed'))) {
      return [
        'Confirm deliverable acceptance with client stakeholders to ensure expectations were met.',
        'Document completion takeaways and update account journey milestones accordingly.'
      ];
    }

    // 6. Declined Tasks
    if (isTask && taskStatus.includes('decline')) {
      return [
        'Review the stated decline reason and reassign the task or adjust scope as necessary.',
        'Align with the account manager to clarify responsibility and expectations.'
      ];
    }

    // 7. General Tasks in Progress
    if (isTask) {
      const assignee = item?.assignedToName ? `@${item.assignedToName.replace('@', '')}` : 'the assigned owner';
      const dueStr = item?.dueDate ? `by ${formatDate(item.dueDate)}` : 'by target due date';
      return [
        `Coordinate with ${assignee} to track milestone progress ${dueStr}.`,
        'Record intermediate updates or notes in the task thread to keep the team aligned.',
        'Mark task completed once all requirements have been verified.'
      ];
    }

    // 8. Commercial Opportunities, Proposals, SOWs & Contracts
    const isCommercial =
      fullText.includes('proposal') ||
      fullText.includes('pricing') ||
      fullText.includes('quote') ||
      fullText.includes('contract') ||
      fullText.includes('sow') ||
      fullText.includes('scope of work') ||
      fullText.includes('renewal') ||
      fullText.includes('expansion') ||
      fullText.includes('procurement') ||
      fullText.includes('nda') ||
      fullText.includes('rfp') ||
      fullText.includes('budget');

    if (isCommercial) {
      return [
        'Review scope boundaries and commercial deliverables with internal solutions leadership.',
        'Prepare the finalized proposal or statement of work (SOW) for client procurement review.',
        'Schedule an executive walkthrough to clarify technical deliverables and expedite sign-off.'
      ];
    }

    // 9. Client Meetings, QBRs, Demos & Sync Calls
    const isMeeting =
      source.includes('meeting') ||
      source.includes('call') ||
      source.includes('face to face') ||
      fullText.includes('meeting') ||
      fullText.includes('qbr') ||
      fullText.includes('quarterly business review') ||
      fullText.includes('status call') ||
      fullText.includes('demo') ||
      fullText.includes('presentation') ||
      fullText.includes('catchup');

    if (isMeeting) {
      return [
        'Distribute formal meeting minutes and agreed action items to all client attendees within 24 hours.',
        'Convert key discussion outcomes into trackable action items in the Tasks tab with assigned deadlines.',
        'Confirm stakeholder attendance and preliminary agenda for the next scheduled review.'
      ];
    }

    // 10. Interactions with Associated Staff Tasks
    if (hasMentions) {
      return [
        `Monitor execution of the ${item.actionMentions.length} associated task(s) assigned to team members.`,
        'Follow up with assignees to ensure deliverables stay aligned with client expectations.'
      ];
    }

    // 11. General Email & Routine Correspondence (Sentiment-aware)
    if (item?.sentiment === 'Positive') {
      return [
        'Acknowledge client feedback promptly to reinforce a responsive, high-touch partnership.',
        'Explore opportunities to introduce value-add capabilities or relevant case studies.',
        'Plan the next proactive milestone check-in to maintain positive momentum.'
      ];
    }

    if (item?.sentiment === 'Negative' || riskLevel === 'Medium Risk') {
      return [
        'Conduct a quick internal debrief with the project team to understand client friction points.',
        'Reach out proactively to the stakeholder to clarify requirements and reset expectations.',
        'Log an action item under the Tasks tab to track resolution of any pending queries.'
      ];
    }

    // Default Actionable & Professional Advisory
    return [
      'Maintain relationship momentum by scheduling the next operational check-in within 2–3 weeks.',
      'Ensure open questions or client inquiries are answered promptly within 1 business day.',
      'Keep account strategy notes and stakeholder sentiment ratings updated based on ongoing exchanges.'
    ];
  };

  const getActivityOverallStats = () => {
    if (allUsersActivities.length === 0) return null;
    let totalScore = 0;
    let highestRisk = 'Low Risk';
    let allStepsMap = new Map();
    const HIGH_KEYWORDS = ['delay', 'issue', 'problem', 'decline'];
    const MED_KEYWORDS = ['sync', 'review', 'discuss'];
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
      const shortName = name.length > 38 ? name.substring(0, 38) + '...' : name;

      if (risk.level !== 'Low Risk') {
        riskActivities.push({ name: shortName, type: a.itemType, risk: risk.level, keywords: foundKeywords });
      }
      healthBreakdown.push({ name: shortName, type: a.itemType, pts, risk: risk.level });
    });

    const riskColor = highestRisk === 'High Risk' ? 'text-rose-600' : (highestRisk === 'Medium Risk' ? 'text-amber-600' : 'text-emerald-600');
    const riskBg = highestRisk === 'High Risk' ? 'bg-rose-50 border-rose-200' : (highestRisk === 'Medium Risk' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200');
    const healthStatus = totalScore < 0 ? 'Requires Attention' : (totalScore === 0 ? 'Stable' : 'Consistent Touchpoints');
    const healthColor = totalScore < 0 ? 'text-rose-600' : (totalScore === 0 ? 'text-slate-700' : 'text-emerald-600');
    const healthChangeStr = totalScore > 0 ? `+${totalScore} pts` : `${totalScore} pts`;
    const topSteps = Array.from(allStepsMap.entries()).slice(0, 3).map(([text, item]) => ({ text, item }));
    let summary = "The account is showing positive engagement and steady progress. Recent interactions have been productive.";
    if (highestRisk === 'High Risk') {
      summary = "The account relationship is currently under strain. Recent interactions flag potential risks — particularly around delays or pending issues. Immediate action is recommended to stabilize account health.";
    }
    return { totalScore, healthStatus, healthColor, healthChangeStr, highestRisk, riskColor, riskBg, topSteps, summary, riskActivities, healthBreakdown };
  };

  const getActivitySourceIcon = (source) => {
    switch (source) {
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
      actionMentions: selectedMentions.map(m => ({
        uid: m.uid,
        name: m.name,
        task: taskText,
        dueDate: taskDueDate || null,
        priority: taskPriority
      }))
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
        accountPromise.then(data => data && setAccount(prev => ({ ...data, journeyStage: prev?.journeyStage || data.journeyStage, stage: prev?.journeyStage || data.journeyStage }))),
        fetchInteractions(id),
        nbaPromise.then(data => data && setNbas(data)),
        fetchAccountSummary(id),
        fetchStaffTasks ? fetchStaffTasks('all-tasks') : Promise.resolve(),
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

  // Dashboard-identical resolution flow for Account Owner vs Key Contact Owner
  const getHeaderPreselectedData = () => {
    const targetAccountId = account?.accountId || account?.id || id || '';
    const targetCompanyName = account?.companyName || '';

    const accContacts = (accountContacts && accountContacts.length > 0)
      ? accountContacts
      : (contacts || []).filter(c =>
        targetAccountId && (String(c.accountId) === String(targetAccountId) || String(c.account_id) === String(targetAccountId))
      );

    // If account has strictly 1 contact, preselect it; if multiple contacts exist, leave empty so user can freely search/choose
    const primaryContact = accContacts.length === 1 ? accContacts[0] : null;
    const preselectContactId = primaryContact ? (primaryContact.contactId || primaryContact.id) : '';
    const preselectContactName = primaryContact ? (primaryContact.name || '') : '';

    const accOwnerId = account?.ownerId || account?.assignedTo;
    const accOwnerName = account?.ownerName || account?.owner;
    const accOwnerEmail = account?.ownerEmail;

    const keyContactOwners = accContacts
      .map(c => ({
        ownerId: c.ownerId,
        ownerName: c.ownerName,
        ownerEmail: c.ownerEmail,
        contactName: c.name,
        contactId: c.contactId || c.id
      }))
      .filter(k => k.ownerId || k.ownerName || k.ownerEmail);

    const isUserMatch = (u, oId, oName, oEmail) => {
      if (!u) return false;
      const uId = String(u.uid || '');
      const uEmail = (u.email || '').toLowerCase().trim();
      const uName = (u.name || '').toLowerCase().trim();
      if (oId && String(oId) === uId) return true;
      if (oEmail && uEmail && oEmail.toLowerCase().trim() === uEmail) return true;
      if (oName && uName && oName.toLowerCase().trim() === uName) return true;
      return false;
    };

    const isAdminUser = (u) => {
      if (!u) return false;
      const role = String(u.role || u.userType || '').toLowerCase();
      const email = String(u.email || u.ownerEmail || '').toLowerCase();
      const uid = String(u.uid || u.ownerId || '');
      const name = String(u.name || u.ownerName || '').toLowerCase();
      return (
        role === 'admin' ||
        uid === 'mock-admin-uid' ||
        email.includes('admin@') ||
        name.includes('admin user')
      );
    };

    const isCurrentUserAdmin = isAdminUser(user);
    const isCurrentUserAccountOwner = !isCurrentUserAdmin && isUserMatch(user, accOwnerId, accOwnerName, accOwnerEmail);
    const isCurrentUserKeyContactOwner = !isCurrentUserAdmin && keyContactOwners.some(k => isUserMatch(user, k.ownerId, k.ownerName, k.ownerEmail));

    let chosenTarget = null;
    if (isCurrentUserAdmin) {
      // Admin clicks -> do NOT assign admin! Choose the account owner
      let accOwnerCandidate = (accOwnerId || accOwnerName)
        ? { ownerId: accOwnerId, ownerName: accOwnerName, ownerEmail: accOwnerEmail }
        : null;

      if (accOwnerCandidate && !isAdminUser(accOwnerCandidate)) {
        chosenTarget = accOwnerCandidate;
      } else {
        chosenTarget = keyContactOwners.find(k => !isAdminUser(k)) || accOwnerCandidate || keyContactOwners[0];
      }
    } else if (isCurrentUserAccountOwner) {
      // Account owner clicks -> choose the key contact owner(s)
      chosenTarget = keyContactOwners.find(k => !isUserMatch(user, k.ownerId, k.ownerName, k.ownerEmail) && !isAdminUser(k))
        || keyContactOwners.find(k => !isUserMatch(user, k.ownerId, k.ownerName, k.ownerEmail))
        || keyContactOwners[0];
    } else if (isCurrentUserKeyContactOwner) {
      // Key contact owner clicks -> choose the account owner
      chosenTarget = (accOwnerId || accOwnerName) ? { ownerId: accOwnerId, ownerName: accOwnerName, ownerEmail: accOwnerEmail } : null;
    } else {
      // Default / third party -> choose account owner first
      let accOwnerCandidate = (accOwnerId || accOwnerName)
        ? { ownerId: accOwnerId, ownerName: accOwnerName, ownerEmail: accOwnerEmail }
        : null;
      if (accOwnerCandidate && !isAdminUser(accOwnerCandidate)) {
        chosenTarget = accOwnerCandidate;
      } else {
        chosenTarget = keyContactOwners.find(k => !isAdminUser(k)) || accOwnerCandidate || keyContactOwners[0];
      }
    }

    let preselectUid = '';
    let preselectName = '';
    if (chosenTarget) {
      const staffMatch = (staffList || []).find(s =>
        (chosenTarget.ownerId && String(s.uid) === String(chosenTarget.ownerId)) ||
        (chosenTarget.ownerEmail && s.email && s.email.toLowerCase().trim() === chosenTarget.ownerEmail.toLowerCase().trim()) ||
        (chosenTarget.ownerName && s.name && s.name.toLowerCase().trim() === chosenTarget.ownerName.toLowerCase().trim())
      );
      if (staffMatch) {
        if (!isCurrentUserAdmin || !isAdminUser(staffMatch)) {
          preselectUid = staffMatch.uid;
          preselectName = staffMatch.name;
        }
      } else if (chosenTarget.ownerName) {
        if (!isCurrentUserAdmin || !isAdminUser(chosenTarget)) {
          preselectName = chosenTarget.ownerName;
          preselectUid = chosenTarget.ownerId || '';
        }
      }
    }

    if (isCurrentUserAdmin && (!preselectUid || preselectUid === user?.uid || preselectUid === 'mock-admin-uid')) {
      const staffAccOwner = (staffList || []).find(s =>
        !isAdminUser(s) && (
          (accOwnerId && String(s.uid) === String(accOwnerId)) ||
          (accOwnerEmail && s.email && s.email.toLowerCase().trim() === accOwnerEmail.toLowerCase().trim()) ||
          (accOwnerName && s.name && s.name.toLowerCase().trim() === accOwnerName.toLowerCase().trim())
        )
      );
      if (staffAccOwner) {
        preselectUid = staffAccOwner.uid;
        preselectName = staffAccOwner.name;
      } else {
        for (const k of keyContactOwners) {
          const kStaff = (staffList || []).find(s =>
            !isAdminUser(s) && (
              (k.ownerId && String(s.uid) === String(k.ownerId)) ||
              (k.ownerEmail && s.email && s.email.toLowerCase().trim() === k.ownerEmail.toLowerCase().trim()) ||
              (k.ownerName && s.name && s.name.toLowerCase().trim() === k.ownerName.toLowerCase().trim())
            )
          );
          if (kStaff) {
            preselectUid = kStaff.uid;
            preselectName = kStaff.name;
            break;
          }
        }
      }
    }

    return {
      targetAccountId,
      targetCompanyName,
      preselectContactId,
      preselectContactName,
      preselectUid,
      preselectName
    };
  };

  const handleHeaderLogInteraction = () => {
    const data = getHeaderPreselectedData();
    navigate('/log-interaction', {
      state: {
        preselectAccountId: data.targetAccountId,
        preselectCompanyName: data.targetCompanyName,
        preselectContactId: data.preselectContactId,
        preselectContactName: data.preselectContactName,
        preselectUid: data.preselectUid,
        preselectName: data.preselectName,
        from: location.pathname + location.search
      }
    });
  };

  const handleHeaderNewTask = () => {
    const data = getHeaderPreselectedData();
    navigate('/staff-tasks/new', {
      state: {
        preselectAccountId: data.targetAccountId,
        preselectCompanyName: data.targetCompanyName,
        preselectContactId: data.preselectContactId,
        preselectContactName: data.preselectContactName,
        preselectUid: data.preselectUid,
        preselectName: data.preselectName,
        from: location.pathname + location.search
      }
    });
  };

  if (loading || !account) {
    return (
      <div className="h-[calc(100vh-10rem)] flex items-center justify-center">
        <LoadingSpinner size="lg" text="Loading account details..." />
      </div>
    );
  }

  const accountTabs = [
    { id: 'Overview', label: 'Overview', icon: Home },
    { id: 'SmartInsights', label: 'Smart Insights', icon: Lightbulb },
    { id: 'AccountHealth', label: 'Account Health', icon: HeartPulseIcon },
    { id: 'Risks', label: 'Risks', icon: AlertTriangle },
    { id: 'Stakeholders', label: 'Key Contacts', icon: Users },
    { id: 'CustomerJourney', label: 'Customer Journey', icon: MapIcon },
    { id: 'Opportunities', label: 'Opportunities', icon: Target },
    { id: 'Interactions', label: 'Interactions', icon: MessageSquare },
    { id: 'Tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'Greetings', label: 'Celebrations', icon: PartyPopper },
  ];


  const currentTasks = (allActivities || []).filter(a => a.itemType === 'task');
  const openTasks = currentTasks.filter(t => !['completed', 'complete', 'declined'].includes((t.status || '').toLowerCase()));
  const overdueTasks = openTasks.filter(t => checkIsOverdue(t.dueDate, t.status));

  return (
    <div className="flex flex-col md:flex-row h-auto md:h-[calc(100vh-80px)] w-full bg-[#F6F8FB] text-slate-900 overflow-hidden">
      {/* On-Screen Customer Journey Change Pop-up (Compact Stage Transition Only) */}
      {journeyPopup && (
        <div
          className="fixed top-20 right-6 bg-white border border-slate-200 rounded-xl shadow-[0_10px_28px_-6px_rgba(15,23,42,0.16)] px-3.5 py-2.5 flex items-center gap-2.5"
          style={{ zIndex: 100002 }}
          role="alert"
        >
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${journeyPopup.triggerType === 'auto'
            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/80'
            : 'bg-[#E8F0FE] text-[#223670] border border-[#BFDBFE]/60'
            }`}>
            {journeyPopup.triggerType === 'auto' ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Journey:
          </span>
          <div className="flex items-center gap-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
              {journeyPopup.fromStage}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#E8F0FE] text-[#223670]">
              {journeyPopup.toStage}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setJourneyPopup(null)}
            className="text-slate-400 hover:text-slate-600 p-0.5 ml-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Activity Notification Toast */}
      {activityToast && (
        <div
          className="fixed bottom-6 right-6 bg-white border border-slate-200 text-slate-800 px-4 py-3 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2.5"
          style={{ zIndex: 100001 }}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{typeof activityToast === 'string' ? activityToast : (activityToast?.message || activityToast?.title || '')}</span>
        </div>
      )}
      {/* Mobile Top Navigation & Tab Bar */}
      <div className="md:hidden flex items-center gap-2 px-3 py-2.5 bg-white border-b border-slate-200 overflow-x-auto shrink-0 z-20">
        <button
          type="button"
          onClick={handleBack}
          className="back-btn !text-xs !py-1.5 !px-2.5 shrink-0"
          style={{ color: '#223670' }}
        >
          <ChevronLeft className="w-4 h-4 text-[#223670]" strokeWidth={2.5} />
          <span className="font-bold text-[#223670]">Back</span>
        </button>
        <div className="h-5 w-px bg-slate-200 shrink-0" />
        <div className="flex items-center gap-1.5 shrink-0">
          {accountTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap shrink-0 transition-colors cursor-pointer ${isActive
                    ? 'bg-[#EBEEF7] text-[#223670] font-bold'
                    : 'text-slate-700 hover:bg-slate-100 font-semibold'
                  }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#223670]' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop Left Sidebar */}
      <div className="hidden md:flex md:w-56 lg:w-64 border-r border-slate-100 bg-white flex-col shrink-0 h-full overflow-y-auto z-10">
        <div className="px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <button
            type="button"
            onClick={handleBack}
            className="back-btn !text-xs !py-1.5 !px-2.5"
            style={{ color: '#223670' }}
          >
            <ChevronLeft className="w-4 h-4 text-[#223670]" strokeWidth={2.5} />
            <span className="font-bold text-[#223670]">Back</span>
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {accountTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`sidebar-tab-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 text-left cursor-pointer border border-transparent ${isActive
                  ? 'bg-[#EBEEF7] text-[#223670] font-bold'
                  : 'text-slate-800 font-semibold hover:bg-[#F4F6FB] hover:text-[#223670]'
                  }`}
                style={{ color: '#223670' }}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#223670]' : 'text-slate-600'}`} />
                <span className={isActive ? 'text-[#223670] font-bold' : 'text-slate-800 font-semibold'}>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-[#F6F8FB] relative pt-4 px-3 sm:px-6">

        <div className={`w-full max-w-[1600px] mx-auto pb-6 ${activeTab !== 'Overview' ? 'hidden' : 'block'}`}>
          <div className="space-y-6 w-full mx-auto h-auto">
            {/* --- NEW REFERENCE DASHBOARD BLOCK --- */}
            <div className="flex flex-col gap-6 mb-6">

              {/* Unified Header Row */}
              <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(15,23,42,0.03)] relative z-30">
                <div className="flex items-start gap-4 flex-1 w-full">
                  <div className="w-14 h-14 shrink-0 rounded-2xl bg-[#E8F0FE] text-[#223670] flex items-center justify-center font-bold text-2xl">
                    {account?.companyName?.substring(0, 2).toUpperCase() || '—'}
                  </div>

                  <div className="flex flex-col gap-2">
                    <h1 className="text-2xl font-bold text-gray-900 leading-none">{account?.companyName || ''}</h1>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-gray-500">
                      {account?.ownerName && <span>Owner: {account.ownerName}</span>}
                      {account?.ownerName && <span className="text-gray-300">|</span>}
                      {(account?.domain || account?.industry) && <span>{account.domain || account.industry}</span>}
                      {account?.tier && (
                        <>
                          <span className="text-gray-300">|</span>
                          <span>{account.tier}</span>
                        </>
                      )}
                      <span className="text-gray-300">|</span>
                      <span>{accountContacts?.length || 0} contacts</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-900 mt-0.5">
                      {account?.region && <span className="text-gray-500">{account.region}</span>}

                      <div className="flex items-center gap-2 relative">
                        <span className="text-slate-600 text-[11px] font-bold uppercase tracking-wider">Journey:</span>
                        <div className="relative" ref={overviewStageDropdownRef}>
                          <button
                            onClick={() => setShowStageDropdown(!showStageDropdown)}
                            className="journey-stage-btn px-3.5 py-1 rounded-full text-xs font-bold bg-[#E8F0FE] text-[#223670] border border-[#BFDBFE]/60 hover:bg-[#DBEAFE] flex items-center gap-1.5 transition-colors cursor-pointer"
                            style={{ color: '#223670' }}
                          >
                            <span className="text-[#223670] font-bold">{journeyStage}</span>
                            <ChevronDown className="w-3.5 h-3.5 text-[#223670]" />
                          </button>

                          {showStageDropdown && (
                            <div className="absolute top-full left-0 mt-1.5 min-w-full w-max bg-white border border-slate-200/90 rounded-xl shadow-[0_8px_24px_-4px_rgba(15,23,42,0.12)] p-1 z-50 overflow-visible">
                              {['Awareness', 'Consideration', 'Decision', 'Retention', 'Advocacy'].map(stage => (
                                <button
                                  key={stage}
                                  onClick={async () => {
                                    await handleUpdateJourneyStage(stage, { triggerType: 'manual' });
                                    if (showActivityToast) showActivityToast(`Journey stage updated to ${stage}`);
                                  }}
                                  className={`relative group w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 overflow-visible ${journeyStage === stage ? 'bg-[#E8F0FE]/80 font-semibold text-[#223670]' : 'font-medium text-[#64748B] hover:bg-[#F1F5FD] hover:text-[#223670]'
                                    }`}
                                  type="button"
                                >
                                  <span>{stage}</span>
                                  <span
                                    role="tooltip"
                                    className="pointer-events-none block absolute left-full top-1/2 -translate-y-1/2 ml-2.5 w-52 bg-white border border-slate-200 rounded-xl shadow-[0_8px_24px_-4px_rgba(15,23,42,0.14)] px-3 py-2 z-[100] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 text-left"
                                  >
                                    <span className="block absolute right-full top-1/2 -translate-y-1/2 -mr-[5px] w-2 h-2 bg-white border-l border-b border-slate-200 rotate-45" />
                                    <span className="block text-[11px] font-semibold text-[#223670] mb-0.5">{stage}</span>
                                    <span className="block text-[11px] font-normal text-[#64748B] leading-snug whitespace-normal">{getDynamicJourneyTooltip(stage, account)}</span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}

                        </div>

                        {activeJourneySuggestion && (
                          <div className="relative group ml-2" ref={overviewSuggestionRef}>
                            <button
                              onClick={() => setShowJourneySuggestion(!showJourneySuggestion)}
                              className="flex items-center gap-1.5 px-3 py-1 bg-[#E31C25]/10 hover:bg-[#E31C25]/20 text-[#E31C25] border border-[#E31C25]/30 rounded-full text-xs font-bold transition-colors shadow-sm"
                            >
                              <Lightbulb className="w-3.5 h-3.5" />
                              Suggestion: Move to {activeJourneySuggestion.suggested}
                            </button>

                            {Boolean(activeJourneySuggestion) && (
                              <div className={`absolute top-full left-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-[0_10px_28px_-4px_rgba(15,23,42,0.15)] z-50 p-4 transition-all duration-150 ${showJourneySuggestion ? 'opacity-100 visible' : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible'}`}>
                                <h4 className="text-[11px] font-bold text-[#4f46e5] uppercase tracking-wider mb-2">Why move to {activeJourneySuggestion.suggested}?</h4>
                                <p className="text-sm text-gray-700 leading-relaxed mb-4">
                                  {activeJourneySuggestion.reason}
                                </p>
                                <button
                                  onClick={async () => {
                                    await handleUpdateJourneyStage(activeJourneySuggestion.suggested, { triggerType: 'suggestion', reason: activeJourneySuggestion.reason });
                                    if (showActivityToast) showActivityToast(`Journey stage updated to ${activeJourneySuggestion.suggested}`);
                                  }}
                                  className="w-full bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-bold py-2 rounded-lg transition-colors"
                                >
                                  Apply Suggestion
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <button onClick={handleHeaderLogInteraction} className="px-4 py-2 bg-white border border-slate-200 text-slate-800 rounded-xl text-sm font-semibold shadow-2xs hover:bg-slate-50 cursor-pointer">Log interaction</button>
                  <button onClick={handleHeaderNewTask} className="px-4 py-2 bg-white border border-slate-200 text-slate-800 rounded-xl text-sm font-semibold shadow-2xs hover:bg-slate-50 cursor-pointer">New task</button>
                </div>
              </div>

              {/* Dynamic DB-synchronized Metric Calculations */}
              {(() => {
                const criticalRisksCount = currentOpenRisks.filter(r => (r.severity || '').toLowerCase() === 'critical').length;
                const highRisksCount = currentOpenRisks.filter(r => (r.severity || '').toLowerCase() === 'high').length;
                const mediumRisksCount = currentOpenRisks.filter(r => ['medium', 'low'].includes((r.severity || '').toLowerCase())).length;

                // Exact synchronization with Risks page overallRiskLevel
                const riskLevelName = syncedRiskMetrics?.level ?? (
                  criticalRisksCount > 0 ? 'Critical' : highRisksCount > 0 ? 'High' : mediumRisksCount > 0 ? 'Medium' : 'Low'
                );
                const effectiveActiveRisksCount = syncedRiskMetrics?.activeCount ?? currentOpenRisks.length;
                const riskBadgeClass = effectiveActiveRisksCount === 0 
                  ? 'bg-emerald-100 text-emerald-700' 
                  : (riskLevelName === 'Critical' || riskLevelName === 'High') 
                    ? 'bg-red-100 text-red-700' 
                    : 'bg-amber-100 text-amber-800';

                const liveHealth = account?.healthScore ?? 50;
                const healthCfg = getAccountHealthConfig(liveHealth);
                const healthBadgeClass = healthCfg.badgeClass;
                const healthBadgeText = healthCfg.badgeText;

                const currentScopedInts = (interactions || []).filter(i => {
                  const iAcc = i.accountId || i.account_id;
                  return iAcc === currentAccId || (account?.id && iAcc === account.id) || (account?.accountId && iAcc === account.accountId);
                });
                const realInteractionsList = ((allActivities && allActivities.length > 0) ? allActivities : currentScopedInts)
                  .filter(i => {
                    const iAcc = i.accountId || i.account_id;
                    const matchesAccount = !iAcc || iAcc === currentAccId || (account?.id && iAcc === account.id) || (account?.accountId && iAcc === account.accountId);
                    return matchesAccount && (i.itemType === 'interaction' || !i.itemType) && i.source !== 'System Email';
                  });
                const sortedInteractionsList = [...realInteractionsList].sort((a, b) => new Date(b.timestamp || b.date || 0) - new Date(a.timestamp || a.date || 0));
                const latestInteraction = sortedInteractionsList[0];

                let lastRealContactLabel = 'No contact';
                let lastRealContactType = 'None';
                if (latestInteraction) {
                  const d = new Date(latestInteraction.timestamp || latestInteraction.date || Date.now());
                  const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
                  lastRealContactLabel = days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`;
                  lastRealContactType = latestInteraction.channel || latestInteraction.source || 'Interaction';
                }

                const championContact = (accountContacts || []).find(c => (c.influenceTag || '').toLowerCase().includes('champion') || (c.influenceTag || '').toLowerCase().includes('influencer'));
                const decisionMakerContact = (accountContacts || []).find(c => (c.influenceTag || '').toLowerCase().includes('decision'));

                const tasksDueThisWeek = openTasks.filter(t => {
                  if (!t.dueDate) return false;
                  const due = new Date(t.dueDate);
                  const now = new Date();
                  const diffDays = (due - now) / (1000 * 60 * 60 * 24);
                  return diffDays >= -1 && diffDays <= 7;
                });

                // Calculate real celebrations occurring in the next 7 days
                const nowForCelebrations = new Date();
                const celebrationsThisWeek = (accountContacts || []).filter(c => {
                  const checkDateInWeek = (dateStr) => {
                    if (!dateStr) return false;
                    const d = new Date(dateStr);
                    if (isNaN(d.getTime())) return false;
                    const thisYearDate = new Date(nowForCelebrations.getFullYear(), d.getMonth(), d.getDate());
                    const diffDays = (thisYearDate - nowForCelebrations) / (1000 * 60 * 60 * 24);
                    return diffDays >= -1 && diffDays <= 7;
                  };
                  return checkDateInWeek(c.dob || c.birthDate || c.birthday) || checkDateInWeek(c.workAnniversary || c.joiningDate);
                }).length;

                // Calculate real detected opportunities (matching Opportunities tab)
                let manualOpportunitiesCount = 0;
                try {
                  const saved = localStorage.getItem(`manual_opps_${account?.accountId || account?.id || id}`);
                  if (saved) manualOpportunitiesCount = JSON.parse(saved).length;
                } catch { }

                const expansionKeywords = ['renew', 'upsell', 'upgrade', 'cross-sell', 'cloud migration', 'security audit', 'artificial intelligence', 'machine learning', 'digital transformation', 'new project', 'new business', 'pilot project', 'proof of concept', 'poc', 'rfp', 'managed service'];
                const activityOpportunitiesCount = (allActivities || []).filter(a => {
                  if (Array.isArray(a.businessOpportunities) && a.businessOpportunities.length > 0) return true;
                  const text = `${a.messageText || ''} ${a.details || ''} ${a.subject || ''} ${a.taskHeader || ''} ${a.title || ''}`.toLowerCase();
                  return expansionKeywords.some(kw => text.includes(kw));
                }).length;

                const nbaOpportunitiesCount = (nbas || []).length;
                const totalOpportunitiesCount = manualOpportunitiesCount + activityOpportunitiesCount + nbaOpportunitiesCount;

                return (
                  <>
                    {/* Top Metric Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm cursor-pointer hover:border-blue-200 transition-colors" onClick={() => setActiveTab('AccountHealth')}>
                        <div className="text-xs text-gray-500 font-medium mb-2">Health score</div>
                        <div className="text-2xl font-bold text-gray-900 mb-2">{liveHealth}</div>
                        <div className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${healthBadgeClass}`}>
                          {healthBadgeText}
                        </div>
                      </div>
                      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm cursor-pointer hover:border-red-200 transition-colors" onClick={() => setActiveTab('Risks')}>
                        <div className="text-xs text-gray-500 font-medium mb-2">Risk level</div>
                        <div className="text-2xl font-bold text-gray-900 mb-2">{riskLevelName}</div>
                        <div className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${riskBadgeClass}`}>
                          {effectiveActiveRisksCount === 0 ? 'No active flags' : `${effectiveActiveRisksCount} active flag${effectiveActiveRisksCount > 1 ? 's' : ''}`}
                        </div>
                      </div>
                      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm cursor-pointer hover:border-blue-200 transition-colors" onClick={() => setActiveTab('CustomerJourney')}>
                        <div className="text-xs text-gray-500 font-medium mb-2">Journey stage</div>
                        <div className="text-2xl font-bold text-gray-900 mb-2">{journeyStage || account?.journeyStage || 'Awareness'}</div>
                        <div className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-[#DCFCE7] text-[#15803D]">
                          Active
                        </div>
                      </div>
                      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm cursor-pointer hover:border-blue-200 transition-colors" onClick={() => setActiveTab('Tasks')}>
                        <div className="text-xs text-gray-500 font-medium mb-2">Open tasks</div>
                        <div className="text-2xl font-bold text-gray-900 mb-2">{openTasks.length}</div>
                        <div className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${overdueTasks.length > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {overdueTasks.length > 0 ? `${overdueTasks.length} overdue` : '0 overdue'}
                        </div>
                      </div>
                      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm cursor-pointer hover:border-blue-200 transition-colors" onClick={() => setActiveTab('Interactions')}>
                        <div className="text-xs text-gray-500 font-medium mb-2">Last real contact</div>
                        <div className="text-2xl font-bold text-gray-900 mb-2">{lastRealContactLabel}</div>
                        <div className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-[#F1F5F9] text-[#475569]">
                          {lastRealContactType}
                        </div>
                      </div>
                    </div>

                    {/* Middle Two-Column Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                      {/* Needs attention now */}
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-semibold text-gray-600">Needs attention now</h3>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('Risks');
                              document.querySelector('.flex-1.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                          >
                            View all risks
                          </button>
                        </div>

                        {topOpenRisk ? (
                          <div className={`${topOpenRisk.severity === 'Critical' || topOpenRisk.severity === 'High' ? 'bg-[#FFF5F5] border-[#FECDD3]/80' : 'bg-[#FFFBEB] border-[#FDE68A]/80'} border rounded-xl p-4`}>
                            <h4 className="text-sm font-bold text-slate-900 mb-1">{topOpenRisk.severity} · {topOpenRisk.category}</h4>
                            <p className="text-sm text-slate-600 mb-4">{topOpenRisk.description || 'Open risk on this account.'}</p>
                            <div className="flex gap-3">
                              <button
                                onClick={() => navigate('/staff-tasks/new', { state: { preselectAccountId: id, preselectTitle: `Mitigate Risk: ${topOpenRisk.category}`, from: location.pathname + location.search } })}
                                className="px-4 py-1.5 border border-slate-200 bg-white text-slate-800 rounded-lg text-xs font-bold hover:bg-slate-50 shadow-2xs cursor-pointer"
                              >
                                Create task
                              </button>
                              <button
                                onClick={handleNotifyTopRisk}
                                disabled={isTopRiskNotified || isSendingNotify}
                                className={`px-4 py-1.5 border border-slate-200 rounded-lg text-xs font-bold shadow-2xs transition-colors cursor-pointer ${isTopRiskNotified ? 'bg-slate-100 text-slate-600 opacity-70 cursor-default' : 'bg-white text-slate-800 hover:bg-slate-50'
                                  }`}
                              >
                                {isTopRiskNotified ? 'Notified ✓' : isSendingNotify ? 'Sending…' : 'Notify'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500">
                            No open risks on this account.
                          </div>
                        )}

                      </div>

                      {/* Right side: Score trend & Journey */}
                      <ScoreTrendGraph
                        accountId={id}
                        currentScore={liveHealth}
                        status={healthBadgeText}
                        realInteractionsCount={realInteractionsList.length}
                        overdueTasksCount={overdueTasks.length}
                        openRisksCount={currentOpenRisks.length}
                        onOpenHealth={() => {
                          setActiveTab('AccountHealth');
                          document.querySelector('.flex-1.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      />
                    </div>

                    {/* Bottom Three-Column Section */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Recent activity */}
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <div className="flex justify-between items-center mb-5">
                          <h3 className="text-sm font-semibold text-gray-600">Recent activity</h3>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('Interactions');
                              document.querySelector('.flex-1.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                          >
                            All interactions
                          </button>
                        </div>
                        <div className="space-y-4 mb-6">
                          {sortedInteractionsList.length === 0 ? (
                            <div className="text-sm text-gray-400 py-4 text-center">No interactions logged yet.</div>
                          ) : (
                            sortedInteractionsList.slice(0, 3).map((item, idx) => {
                              const d = new Date(item.timestamp || item.date || Date.now());
                              const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
                              const daysText = days === 0 ? 'today' : `${days}d`;
                              return (
                                <div key={idx} className="flex justify-between items-center text-sm gap-2">
                                  <span className="text-gray-900 font-medium truncate" title={item.title || item.subject || item.details || item.channel}>
                                    {item.channel ? `${item.channel}: ` : ''}{item.title || item.subject || item.details || 'Customer touchpoint'}
                                  </span>
                                  <span className="text-gray-400 shrink-0">{daysText}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                        <p className="text-xs text-gray-400">System alerts are hidden by default.</p>
                      </div>

                      {/* Key contacts */}
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-gray-600">Key contacts</h3>
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                                {accountContacts?.length || 0}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('Stakeholders');
                                document.querySelector('.flex-1.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="text-xs font-semibold text-black hover:text-gray-700 transition-colors cursor-pointer"
                            >
                              Open contacts
                            </button>
                          </div>

                          {(!accountContacts || accountContacts.length === 0) ? (
                            <div className="py-6 text-center text-xs text-gray-400">
                              No key contacts mapped yet.
                            </div>
                          ) : (
                            <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                              {accountContacts.map(c => {
                                const tag = c.influenceTag || 'Observer';
                                const tagBadgeClass =
                                  tag === 'Champion' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    tag === 'Decision Maker' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                      tag === 'Influencer' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                        tag === 'Gatekeeper' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                          'bg-gray-50 text-gray-700 border-gray-200';

                                return (
                                  <div key={c.contactId || c.id} className="flex items-center justify-between gap-2 text-sm pb-2 border-b border-gray-50 last:border-0 last:pb-0">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-gray-900 font-semibold text-xs truncate" title={c.name}>{c.name}</p>
                                      {c.designation && (
                                        <p className="text-[11px] text-gray-400 truncate">{c.designation}</p>
                                      )}
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 border uppercase tracking-wider ${tagBadgeClass}`}>
                                      {tag}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Upcoming & growth */}
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <div className="flex justify-between items-center mb-5">
                          <h3 className="text-sm font-semibold text-gray-600">Upcoming & growth</h3>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('Greetings');
                              document.querySelector('.flex-1.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                          >
                            Celebrations
                          </button>
                        </div>
                        <div className="space-y-4">
                          <div
                            className="flex justify-between items-center text-sm cursor-pointer hover:bg-gray-50/80 p-1 -m-1 rounded-md transition-colors"
                            onClick={() => setActiveTab('Greetings')}
                            title="View Celebrations"
                          >
                            <span className="text-gray-900 font-medium">Celebrations this week</span>
                            <span className="font-semibold text-gray-900">{celebrationsThisWeek}</span>
                          </div>
                          <div
                            className="flex justify-between items-center text-sm cursor-pointer hover:bg-gray-50/80 p-1 -m-1 rounded-md transition-colors"
                            onClick={() => setActiveTab('Opportunities')}
                            title="View Opportunities"
                          >
                            <span className="text-gray-900 font-medium">Opportunities detected</span>
                            <span className="font-semibold text-gray-900">{totalOpportunitiesCount}</span>
                          </div>
                          <div
                            className="flex justify-between items-center text-sm cursor-pointer hover:bg-gray-50/80 p-1 -m-1 rounded-md transition-colors"
                            onClick={() => setActiveTab('Tasks')}
                            title="View Tasks"
                          >
                            <span className="text-gray-900 font-medium">Tasks due this week</span>
                            <span className={`font-semibold ${tasksDueThisWeek.length > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{tasksDueThisWeek.length}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}

            </div>
            {/* --- END REFERENCE DASHBOARD BLOCK --- */}

            {/* 2. Grid Dashboard Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left Hand side info panel: Corporate details & AI summary */}
              <div className={`lg:col-span-5 flex flex-col gap-5 relative ${showOwnerDropdown ? 'z-50' : 'z-20'}`}>

                {/* Corporate details Card */}
                <div className={`bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4 overflow-visible relative ${showOwnerDropdown ? 'z-50' : 'z-20'}`}>
                  <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 mb-2">Corporate Profile</h3>
                  <div className="flex flex-col gap-4 overflow-visible">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">General Email</span>
                      <span className="text-sm text-gray-900 font-medium truncate" title={account.email}>{account.email || 'Not Specified'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Phone Number</span>
                      <span className="text-sm text-gray-900 font-medium">{account.phone || 'Not Specified'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">NeST BU</span>
                      <span className="text-sm text-gray-900 font-medium">{account.domain || 'Not Specified'}</span>
                    </div>

                    {/* Owner selection dropdown */}
                    <div className="flex flex-col gap-1.5 pt-2 border-t border-gray-200 overflow-visible relative">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Account Owner</span>
                        <div className="flex flex-col">
                          <span className="text-gray-900 font-bold text-sm">{account.ownerName || 'Unassigned'}</span>
                          {(account.ownerEmail || (account.ownerId ? staffList.find(s => s.uid === account.ownerId)?.email : null)) && (
                            <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3" /> {account.ownerEmail || staffList.find(s => s.uid === account.ownerId)?.email}
                            </span>
                          )}
                        </div>
                      </div>
                      {canEditOwners ? (
                        <div className="relative" ref={ownerDropdownRef}>
                          <input
                            type="text"
                            value={ownerSearch}
                            placeholder="Type @name to search..."
                            onFocus={() => { setOwnerSearch(''); setShowOwnerDropdown(true); }}
                            onChange={(e) => { setOwnerSearch(e.target.value); setShowOwnerDropdown(true); }}
                            className="w-full bg-white border border-gray-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-primary/50 text-black placeholder-slate-450 font-semibold"
                          />
                          {showOwnerDropdown && (() => {
                            const q = ownerSearch.replace(/^@/, '').toLowerCase();
                            const filtered = staffList.filter(s =>
                              s.name.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q)
                            );
                            if (!filtered.length) return null;
                            return (
                              <div className="absolute z-[100] w-full top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto ring-1 ring-black/5 divide-y divide-gray-100">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setAccount(prev => ({ ...prev, ownerId: '', ownerName: 'Unassigned' }));
                                    await updateAccount(id, { ownerId: '', ownerName: '' });
                                    setOwnerSearch('');
                                    setShowOwnerDropdown(false);
                                  }}
                                  className="w-full text-left px-3.5 py-2.5 text-xs text-slate-500 font-semibold hover:bg-slate-50 transition-colors bg-white block cursor-pointer"
                                >
                                  Unassigned
                                </button>
                                {filtered.map(s => (
                                  <button
                                    key={s.uid}
                                    type="button"
                                    onClick={async () => {
                                      setAccount(prev => ({ ...prev, ownerId: s.uid, ownerName: s.name }));
                                      await updateAccount(id, { ownerId: s.uid, ownerName: s.name });
                                      setOwnerSearch(s.name);
                                      setShowOwnerDropdown(false);
                                    }}
                                    className="w-full flex flex-col items-start px-3.5 py-2.5 text-xs hover:bg-indigo-50/70 transition-colors text-left bg-white block cursor-pointer"
                                  >
                                    <span className="font-bold text-gray-900">{s.name}</span>
                                    <span className="text-slate-500 text-[11px] font-medium">{s.position || s.jobRole || s.role}{s.department ? ` · ${s.department}` : ''}</span>
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>





              </div>

              {/* Right Hand side content panel: Contacts & Interactions */}
              <div className="lg:col-span-7 flex flex-col gap-5">

                {/* Next Best Actions (P2-F08) */}
                {nbas.length > 0 && (
                  <div className="p-5 space-y-4 overflow-visible relative z-30">
                    <h3 className="text-sm font-extrabold uppercase tracking-widest text-primary border-b border-primary/20 pb-2 flex items-center gap-2">
                      <Target className="w-4 h-4" /> Recommended Next Best Actions
                    </h3>
                    <div className="space-y-3">
                      {nbas.map((nba, idx) => (
                        <div key={idx}
                          onClick={() => {
                            if (nba.linkType === 'risk') {
                              navigate(`/risks?search=${encodeURIComponent(account.companyName)}`);
                            } else if (nba.linkType === 'contact') {
                              document.getElementById('contacts-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            } else if (nba.linkType === 'interaction') {
                              document.getElementById(`interaction-${nba.linkId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }}
                          className={`bg-white p-4 rounded-xl border flex gap-4 transition-all ${nba.linkType
                            ? 'cursor-pointer hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5 border-gray-200'
                            : 'border-gray-200'
                            }`}
                        >
                          <div className="mt-1">
                            {nba.priority === 'High' && <AlertTriangle className="w-5 h-5 text-rose-500" />}
                            {nba.priority === 'Medium' && <Lightbulb className="w-5 h-5 text-amber-500" />}
                            {nba.priority === 'Low' && <Target className="w-5 h-5 text-blue-500" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded ${nba.priority === 'High' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                                nba.priority === 'Medium' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                  'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                }`}>
                                {nba.priority} Priority
                              </span>
                              <span className="text-xs font-black text-slate-300">{nba.type}</span>
                            </div>
                            <p className="text-sm font-bold text-black mb-1">{nba.suggestedAction}</p>
                            <p className="text-xs text-slate-500 font-semibold">{nba.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}


              </div>
              {/* Full Width Key Contacts */}
              <div className="lg:col-span-12 relative z-10">
                {/* Key Contacts */}
                <div id="contacts-section" className="flex-1 p-5 flex flex-col gap-4 overflow-visible relative">
                  <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-600 border-b border-gray-200 pb-2">Key Contacts Mapped</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5 overflow-visible relative">
                    {accountContacts.length === 0 ? (
                      <span className="text-sm text-slate-500 col-span-2 py-8 text-center font-bold">No contacts currently mapped to this client account.</span>
                    ) : (
                      accountContacts.map(c => {
                        const isDropdownOpen = Boolean(showStakeholderDropdown[c.contactId]);
                        return (
                          <div key={c.contactId || c.id} className={`bg-white p-4 rounded-2xl border border-slate-100 relative flex flex-col justify-between hover:bg-[#eef2f9]/50 transition-all shadow-sm overflow-visible ${isDropdownOpen ? 'z-50' : 'z-20'}`}>
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="text-base font-black text-black truncate" title={c.name}>{c.name}</h4>
                              </div>
                              <p className="text-xs text-primary font-black mt-1 uppercase tracking-wider">{c.designation}</p>

                              <div className="mt-2.5 space-y-1.5 text-xs text-slate-500">
                                <p className="flex items-center gap-1.5 font-bold truncate" title={c.email}><Mail className="w-3.5 h-3.5 text-slate-500" /> {c.email}</p>
                                {c.phone && <p className="flex items-center gap-1.5 font-bold"><Phone className="w-3.5 h-3.5 text-slate-500" /> {c.phone}</p>}
                              </div>

                              {c.projectName && (
                                <div className="mt-2.5 text-xs flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-2.5 py-1.5 rounded-lg truncate font-bold text-slate-700">
                                  <span className="text-slate-500 font-extrabold uppercase text-[10px] tracking-wider">Project:</span>
                                  <span className="truncate">{c.projectName}</span>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center justify-between mt-3.5 pt-2.5 border-t border-slate-800/40">
                              {canEditAccount ? (
                                <div className="relative group inline-block">
                                  <select
                                    value={c.influenceTag || 'Observer'}
                                    onChange={async (e) => {
                                      const newTag = e.target.value;
                                      await updateContact(c.contactId || c.id, { ...c, influenceTag: newTag });
                                      if (fetchContacts) fetchContacts(id);
                                      showActivityToast(`Influence tag changed to ${newTag} for ${c.name}`);
                                    }}
                                    className="text-[10px] font-extrabold bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded pl-2 pr-4 py-0.5 uppercase tracking-wider focus:outline-none cursor-pointer appearance-none text-left hover:bg-blue-500/20 transition-colors relative z-10 w-full"
                                  >
                                    <option className="bg-white text-slate-900 font-semibold" value="Decision Maker">Decision Maker</option>
                                    <option className="bg-white text-slate-900 font-semibold" value="Influencer">Influencer</option>
                                    <option className="bg-white text-slate-900 font-semibold" value="Champion">Champion</option>
                                    <option className="bg-white text-slate-900 font-semibold" value="Gatekeeper">Gatekeeper</option>
                                    <option className="bg-white text-slate-900 font-semibold" value="Observer">Observer</option>
                                  </select>
                                  <ChevronDown className="w-3 h-3 text-blue-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none z-20" />
                                  {/* Tooltip */}
                                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 bg-white border border-slate-200 text-slate-700 text-[11px] text-left p-2.5 rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                                    <div className="text-[11px] font-bold text-blue-700 mb-0.5">{c.name} · {c.influenceTag}</div>
                                    <div className="text-[10px] text-slate-600 leading-snug">
                                      {c.influenceTag === 'Decision Maker' ? `Key stakeholder with final sign-off authority on budget, contracts, and renewals for ${account?.companyName || 'the account'}.` :
                                       c.influenceTag === 'Influencer' ? `Technical stakeholder who shapes architecture standards and vendor evaluations.` :
                                       c.influenceTag === 'Champion' ? `Internal sponsor advocating for NeST solutions and driving relationship adoption.` :
                                       c.influenceTag === 'Gatekeeper' ? `Controls communication access and procurement review workflow.` :
                                       `Secondary stakeholder kept informed on operational progress.`}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="relative group inline-block">
                                  <span className="text-[10px] font-extrabold bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded px-2 py-0.5 uppercase tracking-wider block">
                                    {c.influenceTag}
                                  </span>
                                  {/* Tooltip */}
                                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 bg-white border border-slate-200 text-slate-700 text-[11px] text-left p-2.5 rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                                    <div className="text-[11px] font-bold text-blue-700 mb-0.5">{c.name} · {c.influenceTag}</div>
                                    <div className="text-[10px] text-slate-600 leading-snug">
                                      {c.influenceTag === 'Decision Maker' ? `Key stakeholder with final sign-off authority on budget, contracts, and renewals for ${account?.companyName || 'the account'}.` :
                                       c.influenceTag === 'Influencer' ? `Technical stakeholder who shapes architecture standards and vendor evaluations.` :
                                       c.influenceTag === 'Champion' ? `Internal sponsor advocating for NeST solutions and driving relationship adoption.` :
                                       c.influenceTag === 'Gatekeeper' ? `Controls communication access and procurement review workflow.` :
                                       `Secondary stakeholder kept informed on operational progress.`}
                                    </div>
                                  </div>
                                </div>
                              )}

                            </div>

                            {/* Contact Owner Select */}
                            <div className="mt-4 pt-3.5 border-t border-gray-100 relative flex flex-col gap-2">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Key Contact Owner</span>
                                <div className="flex flex-col">
                                  <span className="text-gray-900 font-bold text-sm">
                                    {c.ownerName || (c.ownerId ? staffList.find(s => s.uid === c.ownerId)?.name : null) || 'Unassigned'}
                                  </span>
                                  {((c.ownerEmail) || (c.ownerId ? staffList.find(s => s.uid === c.ownerId)?.email : null)) && (
                                    <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                                      <Mail className="w-3 h-3" /> {c.ownerEmail || staffList.find(s => s.uid === c.ownerId)?.email}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {canEditOwners ? (
                                <div className="relative stakeholder-dropdown-container">
                                  <input
                                    type="text"
                                    value={stakeholderSearch[c.contactId] ?? ''}
                                    placeholder="Type @name to search..."
                                    onFocus={() => {
                                      setStakeholderSearch(prev => ({ ...prev, [c.contactId]: '' }));
                                      setShowStakeholderDropdown(prev => ({ ...prev, [c.contactId]: true }));
                                    }}
                                    onChange={(e) => {
                                      setStakeholderSearch(prev => ({ ...prev, [c.contactId]: e.target.value }));
                                      setShowStakeholderDropdown(prev => ({ ...prev, [c.contactId]: true }));
                                    }}
                                    className="w-full bg-white border border-gray-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-primary/50 text-black placeholder-slate-450 font-semibold"
                                  />
                                  {isDropdownOpen && (() => {
                                    const q = (stakeholderSearch[c.contactId] || '').replace(/^@/, '').toLowerCase();
                                    const filtered = staffList.filter(s =>
                                      s.name.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q)
                                    );
                                    if (!filtered.length) return null;
                                    return (
                                      <div className="absolute z-[100] w-full top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto ring-1 ring-black/5 divide-y divide-gray-100">
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            await updateContact(c.contactId, { ownerId: '', ownerName: '' });
                                            fetchContacts(id);
                                            setStakeholderSearch(prev => ({ ...prev, [c.contactId]: '' }));
                                            setShowStakeholderDropdown(prev => ({ ...prev, [c.contactId]: false }));
                                          }}
                                          className="w-full text-left px-3.5 py-2.5 text-xs text-slate-500 font-semibold hover:bg-slate-50 transition-colors bg-white block cursor-pointer"
                                        >
                                          Unassigned
                                        </button>
                                        {filtered.map(s => (
                                          <button
                                            key={s.uid}
                                            type="button"
                                            onClick={async () => {
                                              await updateContact(c.contactId, { ownerId: s.uid, ownerName: s.name });
                                              fetchContacts(id);
                                              setStakeholderSearch(prev => ({ ...prev, [c.contactId]: s.name }));
                                              setShowStakeholderDropdown(prev => ({ ...prev, [c.contactId]: false }));
                                            }}
                                            className="w-full flex flex-col items-start px-3.5 py-2.5 text-xs hover:bg-indigo-50/70 transition-colors text-left bg-white block cursor-pointer"
                                          >
                                            <span className="font-bold text-gray-900">{s.name}</span>
                                            <span className="text-slate-500 text-[11px] font-medium">{s.position || s.jobRole || s.role}{s.department ? ` · ${s.department}` : ''}</span>
                                          </button>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* ========================================================
          EMBEDDED MY ACTIVITY PANEL
          ======================================================== */}
            <div className="overflow-hidden transition-all duration-300">
              {/* Activity Panel Toolbar */}
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 bg-white rounded-t-2xl">
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
                    <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-2xl p-1.5 z-50 max-h-56 overflow-y-auto">
                      {associatedUsers.map(u => (
                        <div
                          key={u.uid}
                          onClick={() => handleActivityUserChange(u.uid)}
                          className={`px-3 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-2 ${u.uid === activityUid
                            ? 'bg-primary/15 text-primary'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                        >
                          {u.uid === 'all' ? <Users className="w-3.5 h-3.5 opacity-70" /> : <User className="w-3.5 h-3.5 opacity-70" />}
                          {u.uid === user?.uid ? 'Me' : u.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Live Auto-Sync Active</span>
                </div>

              </div>

              {/* Activity Panel Content */}
              {activityLoading ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner size="md" />
                </div>
              ) : (
                <div className="p-5 space-y-5">
                  {/* Smart Insights */}
                  {(() => {
                    const stats = getActivityOverallStats();
                    if (!stats && allActivities.length === 0) return null;

                    // Real Database-Derived Risk Analysis from PostgreSQL
                    const criticalRisks = currentOpenRisks.filter(r => r.severity === 'Critical');
                    const highRisks = currentOpenRisks.filter(r => r.severity === 'High');
                    const mediumRisks = currentOpenRisks.filter(r => r.severity === 'Medium' || !r.severity);
                    const overdueCount = overdueTasks.length;

                    let dbRiskLevel = 'Low Risk';
                    let dbRiskClass = 'text-emerald-700';
                    let dbRiskBorder = 'border-emerald-200';
                    let dbRiskBg = 'bg-emerald-50';
                    let dbRiskIconClass = 'bg-emerald-50 border-emerald-200 text-emerald-600';

                    if (criticalRisks.length > 0 || highRisks.length > 0) {
                      dbRiskLevel = criticalRisks.length > 0 ? 'Critical Risk' : 'High Risk';
                      dbRiskClass = 'text-rose-600';
                      dbRiskBorder = 'border-rose-200';
                      dbRiskBg = 'bg-rose-50';
                      dbRiskIconClass = 'bg-rose-50 border-rose-200 text-rose-600';
                    } else if (mediumRisks.length > 0 || overdueCount > 0) {
                      dbRiskLevel = 'Medium Risk';
                      dbRiskClass = 'text-amber-600';
                      dbRiskBorder = 'border-amber-200';
                      dbRiskBg = 'bg-amber-50';
                      dbRiskIconClass = 'bg-amber-50 border-amber-200 text-amber-600';
                    }

                    // Real database flagged items (Overdue tasks + Open risks)
                    const realFlaggedItems = [
                      ...overdueTasks.map(t => ({
                        id: t.taskId || t.id,
                        name: t.title || 'Overdue Task Commitment',
                        type: 'Overdue Task',
                        severity: 'High',
                        detail: `Assigned to: ${t.assignedToName || 'Unassigned'} · Due: ${t.dueDate ? formatDate(t.dueDate) : 'Overdue'}`,
                        item: t,
                        isTask: true
                      })),
                      ...currentOpenRisks.map(r => ({
                        id: r.riskId || r.id,
                        name: r.description || r.title || r.category || 'Risk Flag',
                        type: 'Open Risk Flag',
                        severity: r.severity || 'Medium',
                        detail: `Category: ${r.category || 'General'} · Status: ${r.status || 'Open'}`,
                        item: r,
                        isTask: false
                      }))
                    ];

                    // Real dynamic rationale from database records
                    let whyThisRiskText = '0 active risk tickets in PostgreSQL and 0 overdue task commitments. Account health is within normal baseline.';
                    if (criticalRisks.length > 0 || highRisks.length > 0) {
                      whyThisRiskText = `${criticalRisks.length + highRisks.length} high/critical risk flag(s) active in PostgreSQL requiring immediate management attention.`;
                    } else if (overdueCount > 0 && currentOpenRisks.length === 0) {
                      whyThisRiskText = `${overdueCount} task commitment is currently overdue (assigned to ${overdueTasks[0]?.assignedToName || 'team member'}, due ${overdueTasks[0]?.dueDate ? formatDate(overdueTasks[0]?.dueDate) : 'recently'}), presenting an operational SLA delivery risk.`;
                    } else if (currentOpenRisks.length > 0) {
                      whyThisRiskText = `${currentOpenRisks.length} open risk ticket(s) active in PostgreSQL requiring ongoing mitigation.`;
                    }

                    // Real dynamic resolution steps
                    const realResolutionSteps = [];
                    if (overdueTasks.length > 0) {
                      realResolutionSteps.push(`Complete or update due date for overdue task: "${overdueTasks[0].title}" to restore delivery SLA.`);
                    }
                    if (currentOpenRisks.length > 0) {
                      realResolutionSteps.push(`Mitigate active risk ticket: "${currentOpenRisks[0].title || currentOpenRisks[0].category}" under the Risks tab.`);
                    }
                    if (realResolutionSteps.length === 0) {
                      realResolutionSteps.push('Maintain regular contact by scheduling the next milestone check-in within 2–3 weeks.');
                      realResolutionSteps.push('Ensure client queries continue to receive prompt responses within 1 business day.');
                    }

                    return (
                      <div className="space-y-4">
                        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                          <Lightbulb className="w-4 h-4 text-primary" /> Smart Insights
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                          <div className="border border-slate-200/80 rounded-xl shadow-xs overflow-hidden transition-all duration-300 flex flex-col bg-white">
                            <div
                              className="p-4 flex items-center justify-between cursor-pointer transition-colors hover:bg-slate-50"
                              onClick={() => setIsRiskExpanded(!isRiskExpanded)}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full border ${dbRiskIconClass}`}>
                                  <AlertTriangle className="w-5 h-5" />
                                </div>
                                <div>
                                  <div className={`text-sm font-extrabold ${dbRiskClass}`}>{dbRiskLevel}</div>
                                  <div className="text-[10px] text-slate-500 font-bold mt-0.5 uppercase tracking-wide">
                                    Aggregated Risk Posture {realFlaggedItems.length > 0 ? `· ${realFlaggedItems.length} Active Signal${realFlaggedItems.length > 1 ? 's' : ''}` : ''}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-slate-500 hidden sm:inline">
                                  {isRiskExpanded ? 'Hide Details' : 'View Details'}
                                </span>
                                {isRiskExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                              </div>
                            </div>
                            {isRiskExpanded && (
                              <div className="p-4 pt-2 border-t border-slate-100 space-y-3 flex-1 flex flex-col justify-between bg-white">
                                <div>
                                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1.5 flex items-center justify-between">
                                    <span>Flagged Database Items</span>
                                    <span className="normal-case text-[10px] font-bold text-slate-500">
                                      {realFlaggedItems.length} active item{realFlaggedItems.length === 1 ? '' : 's'}
                                    </span>
                                  </div>
                                  {realFlaggedItems.length === 0 ? (
                                    <p className="text-xs text-slate-500 font-medium bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                      No open risk flags or overdue tasks detected in the database. All account commitments are on track.
                                    </p>
                                  ) : (
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                      {realFlaggedItems.map((item, i) => (
                                        <div
                                          key={item.id || i}
                                          onClick={() => {
                                            if (item.isTask) setActiveTab('Tasks');
                                            else setActiveTab('Risks');
                                          }}
                                          className="bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-lg p-2.5 flex items-start justify-between gap-2 cursor-pointer transition-colors"
                                          title={item.isTask ? 'Click to view in Tasks tab' : 'Click to view in Risks tab'}
                                        >
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-xs font-bold text-slate-900 truncate">{item.name}</span>
                                            </div>
                                            <div className="text-[10px] text-slate-500 font-semibold mt-0.5">{item.detail}</div>
                                          </div>
                                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 mt-0.5 border ${item.severity === 'Critical' || item.severity === 'High'
                                              ? 'bg-rose-50 border-rose-200 text-rose-700'
                                              : 'bg-amber-50 border-amber-200 text-amber-700'
                                            }`}>
                                            {item.type}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="border-t border-slate-100 pt-3">
                                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">Why This Risk Posture?</div>
                                  <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                                    {whyThisRiskText}
                                  </p>
                                </div>
                                <div className="border-t border-slate-100 pt-3">
                                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">Calculation Criteria</div>
                                  <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                                    Risk is evaluated directly from PostgreSQL records: (1) Active risk records in the <code className="bg-slate-100 px-1 rounded text-slate-700">risks</code> table, (2) Task due dates vs current date in the <code className="bg-slate-100 px-1 rounded text-slate-700">tasks</code> table, and (3) AI keyword flags across interactions.
                                  </p>
                                </div>
                                <div className="border-t border-slate-100 pt-3">
                                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1.5">Suggested Resolution</div>
                                  <div className="space-y-1.5">
                                    {realResolutionSteps.map((stepText, si) => (
                                      <div key={si} className="flex items-start gap-1.5 text-xs text-slate-700 font-medium">
                                        <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#223670] flex-shrink-0" />
                                        <span>{stepText}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Real Database-Synced Health Score Card */}
                          <div className="border border-slate-200/80 rounded-xl shadow-xs overflow-hidden transition-all duration-300 flex flex-col bg-white">
                            <div
                              className="p-4 flex items-center justify-between cursor-pointer transition-colors hover:bg-slate-50"
                              onClick={() => setIsHealthExpanded(!isHealthExpanded)}
                            >
                              <div className="flex items-center gap-3.5">
                                <div className="flex items-baseline gap-1">
                                  <span className="text-2xl font-black" style={{ color: getAccountHealthConfig(liveHealth).hex }}>
                                    {liveHealth}
                                  </span>
                                  <span className="text-xs font-bold text-slate-400">/ 100</span>
                                </div>
                                <div>
                                  <div className="text-sm font-bold text-slate-900">Account Health Score</div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border"
                                      style={{
                                        color: getAccountHealthConfig(liveHealth).hex,
                                        backgroundColor: `${getAccountHealthConfig(liveHealth).hex}15`,
                                        borderColor: `${getAccountHealthConfig(liveHealth).hex}40`
                                      }}
                                    >
                                      <span
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{ backgroundColor: getAccountHealthConfig(liveHealth).hex }}
                                      />
                                      {getAccountHealthConfig(liveHealth).status}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium">· Real Database Sync</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-slate-500 hidden sm:inline">
                                  {isHealthExpanded ? 'Hide Factors' : 'View Factors'}
                                </span>
                                {isHealthExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                              </div>
                            </div>
                            {isHealthExpanded && (
                              <div className="p-4 pt-2 border-t border-slate-100 space-y-3.5 flex-1 flex flex-col justify-between bg-white">
                                <div>
                                  <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-2">
                                    <span>7 Database Health Factors</span>
                                    <span className="normal-case text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                      PostgreSQL Synced
                                    </span>
                                  </div>
                                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                    {[
                                      { key: 'engagementFrequency', name: 'Engagement Frequency', weight: '20%', defaultScore: 50, defaultReason: 'Customer interaction frequency in the last 30 days' },
                                      { key: 'communicationResponsiveness', name: 'Communication Responsiveness', weight: '15%', defaultScore: 100, defaultReason: 'Response velocity and turnaround on open threads' },
                                      { key: 'sentimentTrend', name: 'Sentiment Trend', weight: '15%', defaultScore: 50, defaultReason: 'Tone and sentiment detected across touchpoints' },
                                      { key: 'stakeholderCoverage', name: 'Stakeholder Coverage', weight: '15%', defaultScore: 75, defaultReason: 'Executive, technical, and business contact alignment' },
                                      { key: 'riskSignals', name: 'Risk Signals', weight: '15%', defaultScore: 100, defaultReason: 'Open risk flags, escalation severity, and blockers' },
                                      { key: 'commitments', name: 'Commitments & SLAs', weight: '10%', defaultScore: 85, defaultReason: 'Task completion deadlines and delivery milestones' },
                                      { key: 'businessSignals', name: 'Business Signals', weight: '5%', defaultScore: 50, defaultReason: 'Contract status, upsell potential, and company stability' },
                                    ].map(f => {
                                      const raw = explanationData?.factors?.[f.key];
                                      const score = typeof raw === 'number' ? raw : (raw?.score ?? f.defaultScore);
                                      const reason = (typeof raw === 'object' && raw?.reason) ? raw.reason : f.defaultReason;
                                      const fCfg = getAccountHealthConfig(score);
                                      return (
                                        <div key={f.key} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-bold text-slate-900">{f.name}</span>
                                              <span className="text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.2 rounded">
                                                {f.weight}
                                              </span>
                                            </div>
                                            <div className="text-[11px] text-slate-500 truncate mt-0.5">{reason}</div>
                                          </div>
                                          <span
                                            className="text-xs font-extrabold shrink-0 px-2.5 py-0.5 rounded-md border"
                                            style={{
                                              color: fCfg.hex,
                                              backgroundColor: `${fCfg.hex}15`,
                                              borderColor: `${fCfg.hex}30`
                                            }}
                                          >
                                            {score} / 100
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="border-t border-slate-100 pt-3">
                                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">Calculation Criteria</div>
                                  <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                                    Health Score is synchronized in real time with PostgreSQL <code className="bg-slate-100 px-1 rounded text-slate-700">healthscores</code> and calculated using the 7 weighted behavioral signals shown above (interactions, follow-ups, sentiment, stakeholder coverage, risk flags, and task SLAs).
                                  </p>
                                </div>
                                <div className="border-t border-slate-100 pt-3">
                                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1.5">Official Scoring Standard</div>
                                  <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="bg-rose-50 border border-rose-200/80 rounded-lg p-2">
                                      <div className="text-xs font-extrabold text-rose-700">&lt; 40 pts</div>
                                      <div className="text-[10px] text-rose-600 font-bold mt-0.5">Critical</div>
                                    </div>
                                    <div className="bg-amber-50 border border-amber-200/80 rounded-lg p-2">
                                      <div className="text-xs font-extrabold text-amber-700">40 – 69 pts</div>
                                      <div className="text-[10px] text-amber-700 font-bold mt-0.5">Warning</div>
                                    </div>
                                    <div className="bg-emerald-50 border border-emerald-200/80 rounded-lg p-2">
                                      <div className="text-xs font-extrabold text-emerald-700">70 – 100 pts</div>
                                      <div className="text-[10px] text-emerald-700 font-bold mt-0.5">Healthy</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-xs">
                            <h4 className="text-xs font-extrabold uppercase tracking-widest text-[#223670] mb-2 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-[#223670]" /> Summary</h4>
                            <p className="text-xs text-gray-700 font-medium leading-relaxed">
                              {overdueCount > 0
                                ? `${stats?.summary || 'The account is showing positive engagement.'} Notice: ${overdueCount} task commitment is currently overdue and requires prompt completion to maintain SLA standards.`
                                : (stats?.summary || 'The account is showing positive engagement and steady progress. Recent interactions have been productive.')
                              }
                            </p>
                          </div>
                          <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-xs">
                            <h4 className="text-xs font-extrabold uppercase tracking-widest text-[#223670] mb-2 flex items-center gap-1.5"><ArrowRightCircle className="w-3.5 h-3.5 text-[#223670]" /> Priority Next Steps</h4>
                            <div className="space-y-2">
                              {overdueTasks.length > 0 && (
                                <div
                                  onClick={() => setActiveTab('Tasks')}
                                  className="flex items-start gap-2 text-xs font-semibold text-rose-700 cursor-pointer hover:underline transition-colors"
                                  title="Click to jump to Tasks tab"
                                >
                                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-rose-600 flex-shrink-0" />
                                  <span>Resolve overdue task: "{overdueTasks[0].title}" (Due {formatDate(overdueTasks[0].dueDate)})</span>
                                </div>
                              )}
                              {currentOpenRisks.length > 0 && (
                                <div
                                  onClick={() => setActiveTab('Risks')}
                                  className="flex items-start gap-2 text-xs font-semibold text-amber-700 cursor-pointer hover:underline transition-colors"
                                  title="Click to jump to Risks tab"
                                >
                                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                                  <span>Review active risk ticket: "{currentOpenRisks[0].title || currentOpenRisks[0].category}"</span>
                                </div>
                              )}
                              {(stats?.topSteps || []).slice(0, overdueTasks.length > 0 ? 2 : 3).map((step, idx) => (
                                <div
                                  key={idx}
                                  onClick={() => handleStepClick(step.item)}
                                  className="flex items-start gap-2 text-xs text-gray-700 font-medium cursor-pointer hover:text-[#223670] transition-colors"
                                >
                                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#223670] flex-shrink-0" />
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
                    <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-400 border-b border-slate-800 pb-3 mb-4 flex items-center gap-2">
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
                              className="bg-white p-4 rounded-xl border border-slate-100 hover:border-blue-200 cursor-pointer transition-all hover:bg-[#eef2f9]/40 shadow-xs flex flex-col gap-2.5 group"
                            >
                              <div className="flex items-center justify-between text-xs font-black">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {!isTask ? (
                                    <>
                                      {getActivitySourceIcon(item.source)}
                                      <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded-full text-[10px] tracking-wide uppercase font-bold">
                                        {item.source} {item.isOther ? '(Other User)' : ''}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckSquare className="w-4 h-4 text-amber-400" />
                                      <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded-full text-[10px] tracking-wide uppercase font-bold">
                                        Staff Task
                                      </span>
                                      {item.priority && (
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${item.priority === 'High' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
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
                                    <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border font-bold uppercase ${isItemOverdue ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 font-extrabold' :
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
                                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 pt-0.5">
                                  <span>From: <span className="text-gray-900 font-bold">{item.assignedByName || 'Admin User'}</span></span>
                                  <span>To: <span className="text-primary font-black">@{item.assignedToName || 'Staff Member'}</span></span>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 pt-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <User className="w-3 h-3 text-slate-400" /> Logged by: <span className="text-primary font-bold">{item.loggedByName || item.loggedByUid || 'Admin User'}</span>
                                  </div>
                                  {item.recipientName && (
                                    <div className="text-slate-500">
                                      To: <span className="text-primary font-bold">@{item.recipientName}</span>
                                    </div>
                                  )}
                                </div>
                              )}

                              <h4 className="text-sm font-extrabold text-gray-900 leading-relaxed">
                                {isTask ? item.title : (item.subject || (item.messageText ? stripHtml(item.messageText).split('\n')[0] : 'Interaction Note'))}
                              </h4>

                              <p className="text-[11px] text-gray-600 font-medium line-clamp-2">
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
                                    <span className={`px-2 py-0.5 rounded border ${item.sentiment === 'Positive' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                      item.sentiment === 'Negative' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                                        'bg-slate-800 border-slate-700 text-slate-500'
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
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase border ${selectedActivityItem.priority === 'High' ? 'bg-rose-50 text-rose-700 border-rose-200' :
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
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-wide uppercase border ${selectedActivityItem.sentiment === 'Positive' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
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
                              Task ID: <span className="font-semibold text-gray-700">{selectedActivityItem.taskId}</span>
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
                              <span className={`px-2 py-0.5 rounded-md border font-bold text-[11px] ${selectedActivityItem.priority === 'High' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                selectedActivityItem.priority === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                  'bg-gray-100 text-gray-700 border-gray-200'
                                }`}>
                                Priority: {selectedActivityItem.priority}
                              </span>
                            )}
                            {selectedActivityItem.dueDate && (
                              <span className={`px-2 py-0.5 rounded-md border font-bold text-[11px] flex items-center gap-1 ${isTaskOverdue ? 'bg-rose-100 text-rose-800 border-rose-300 font-black' : 'bg-blue-50 text-blue-700 border-blue-200'
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
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${mention.priority === 'High' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                        mention.priority === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                          'bg-gray-100 text-gray-700 border-gray-200'
                                        }`}>
                                        Priority: {mention.priority}
                                      </span>
                                    )}
                                    {mention.dueDate && (
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${isMentionOverdue ? 'bg-rose-100 text-rose-800 border-rose-300 font-black' : 'bg-blue-50 text-blue-700 border-blue-200'
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
                        {(() => {
                          const text = isTask ? selectedActivityItem.description : stripHtml(selectedActivityItem.messageText);
                          const key = selectedActivityItem.interactionId || selectedActivityItem.taskId || selectedActivityItem.id || (selectedActivityItem.title || selectedActivityItem.subject);
                          const aiData = aiAnalysisCache[key];
                          const riskLevel = aiData?.riskLevel || getActivityRisk(text, selectedActivityItem).level;
                          const isHigh = riskLevel === 'High Risk';
                          const isMed = riskLevel === 'Medium Risk';
                          const health = aiData?.healthImpact || getActivityHealth(riskLevel);
                          const isPositive = health.change?.startsWith('+');
                          const isNegative = health.change?.startsWith('-');

                          return (
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-500" /> Risk Analysis
                                  </h3>
                                  <div className={`${isHigh ? 'bg-rose-50 border-rose-200' : isMed ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'} border p-4 rounded-xl flex items-center gap-3`}>
                                    <div className={`p-2 rounded-full bg-white shadow-xs ${isHigh ? 'text-rose-600' : isMed ? 'text-amber-600' : 'text-emerald-600'}`}>
                                      <ShieldAlert className="w-5 h-5" />
                                    </div>
                                    <div>
                                      <div className={`text-sm font-black ${isHigh ? 'text-rose-600' : isMed ? 'text-amber-600' : 'text-emerald-600'}`}>
                                        {riskLevel}
                                      </div>
                                      <div className="text-xs text-gray-500 font-bold mt-0.5">
                                        {aiData ? 'Analyzed by Gemini AI' : isAiLoading ? 'Analyzing risk posture with Gemini AI...' : 'Analyzed from content'}
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <h3 className="text-xs font-extrabold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-[#223670]" /> Account Health Impact
                                  </h3>
                                  <div className="bg-white border border-slate-200/80 p-3.5 rounded-xl flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${isNegative || isHigh ? 'bg-rose-50 text-rose-600' : isMed ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                      <Activity className="w-5 h-5" />
                                    </div>
                                    <div>
                                      <div className={`text-sm font-extrabold ${isNegative || isHigh ? 'text-rose-600' : isMed ? 'text-amber-600' : 'text-emerald-700'}`}>
                                        {isHigh ? 'High Risk Factor' : isMed ? 'Review Needed' : 'Supports Steady Contact'}
                                      </div>
                                      <div className="text-xs text-slate-500 font-medium mt-0.5">
                                        Account Score: <strong className="text-slate-900 font-bold">{liveHealth} / 100</strong> ({getAccountHealthConfig(liveHealth).status})
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#223670] flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-[#223670]" /> Recommended Next Steps
                                  </h3>
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#223670]/10 text-[#223670] border border-[#223670]/20">
                                    <Sparkles className="w-3 h-3 text-[#223670]" />
                                    Powered by Gemini AI
                                  </span>
                                </div>

                                <div className="bg-slate-50/90 border border-slate-200/80 p-4 rounded-xl space-y-2.5">
                                  {isAiLoading && !aiData ? (
                                    <div className="flex items-center gap-3 py-3 text-xs text-slate-600 font-medium">
                                      <Loader2 className="w-4 h-4 text-[#223670] animate-spin shrink-0" />
                                      <span>Consulting Gemini AI for tailored next steps...</span>
                                    </div>
                                  ) : (
                                    <>
                                      {(aiData?.recommendedNextSteps || getActivityNextSteps(riskLevel, selectedActivityItem.itemType, selectedActivityItem)).map((step, idx) => (
                                        <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-800 leading-relaxed font-medium">
                                          <span className="w-5 h-5 rounded-full bg-[#223670]/10 text-[#223670] border border-[#223670]/20 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                                            {idx + 1}
                                          </span>
                                          <span>{step}</span>
                                        </div>
                                      ))}

                                      {aiData?.rationale && (
                                        <div className="text-[11px] text-slate-500 font-medium pt-2 mt-1 border-t border-slate-200/70 flex items-start gap-1.5">
                                          <span className="font-bold text-[#223670] shrink-0">Strategic Rationale:</span>
                                          <span>{aiData.rationale}</span>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </>
                          );
                        })()}
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
                        className={`px-4 py-2 rounded-xl text-black font-bold text-xs cursor-pointer shadow-md flex items-center gap-1.5 disabled:opacity-50 ${statusActionDialog.action === 'Complete' ? 'bg-emerald-600 hover:bg-emerald-700' :
                          statusActionDialog.action === 'Forward' ? 'bg-sky-600 hover:bg-sky-700' :
                            statusActionDialog.action === 'Decline' ? 'bg-rose-600 hover:bg-rose-700' :
                              'bg-amber-600 hover:bg-amber-700'
                          }`}
                      >
                        {statusDialogSubmitting ? (
                          <LoadingSpinner size="xs" color="white" />
                        ) : (
                          <span>Confirm {statusActionDialog.action}</span>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}



            {/* ========================================================
          MODALS INTERFACE
          ======================================================== */}


            {/* Modal: Log Interaction Activity */}
            {isLogInteractionOpen && (
              <div
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                style={{ zIndex: 100000 }}
              >
                <div className="w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden">

                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <CheckSquare className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-black text-sm">Log Interaction</h3>
                        <p className="text-xs text-slate-500">Record an interaction for this account</p>
                      </div>
                    </div>
                    <button onClick={() => { setIsLogInteractionOpen(false); resetInteractionForm(); }} className="text-slate-400 hover:text-black transition-colors cursor-pointer">
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
                                  ? 'bg-primary border-primary text-black shadow-lg shadow-primary/20'
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-blue-200 hover:bg-slate-50'
                                  }`}
                              >
                                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-black' : ch.color}`} />
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
                          className="w-full bg-white border border-gray-300 text-xs text-black rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
                        >
                          <option value="">{contacts.filter(c => c.accountId === id).length === 0 ? 'No contacts found' : 'Select Contact'}</option>
                          {contacts.filter(c => c.accountId === id).map(c => (
                            <option key={c.contactId} value={c.contactId}>
                              {c.name} â€” {c.designation || c.hierarchyTag}
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
                            className="w-full bg-white border border-gray-300 text-xs text-black rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
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
                            className="w-full bg-white border border-gray-300 text-xs text-black rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
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
                          className="w-full bg-white border border-gray-300 text-xs text-black rounded-xl p-3 focus:outline-none focus:border-primary/50 resize-none leading-relaxed"
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
                            <label className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 hover:border-slate-500 rounded-xl text-xs font-semibold text-slate-500 hover:bg-white cursor-pointer active:scale-98 transition-all w-fit">
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
                                <LoadingSpinner size="xs" />
                                Uploading...
                              </span>
                            )}
                          </div>

                          {attachmentsList.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white border border-gray-200 rounded-2xl">
                              {attachmentsList.map((file, idx) => (
                                <div key={idx} className="relative group bg-slate-905 border border-gray-200 rounded-xl p-2.5 flex items-center gap-3 overflow-hidden shadow-sm">
                                  <div className="shrink-0 w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center overflow-hidden">
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
                            className="w-full bg-white border border-gray-300 text-xs text-black rounded-xl p-2.5 focus:outline-none focus:border-primary/50"
                          />
                          {showMentionDropdown && (() => {
                            const query = getMentionSearchQuery(mentionSearch);
                            const filteredStaff = staffList.filter(s =>
                              s.name.toLowerCase().includes(query.toLowerCase()) ||
                              s.email.toLowerCase().includes(query.toLowerCase())
                            );
                            if (filteredStaff.length === 0 || !mentionSearch.includes('@')) return null;
                            return (
                              <div className="absolute z-15 w-full top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden max-h-36 overflow-y-auto">
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
                        <div className="grid grid-cols-2 gap-4 mt-3 p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Due Date</label>
                            <input
                              type="date"
                              value={taskDueDate}
                              onChange={(e) => setTaskDueDate(e.target.value)}
                              className="w-full bg-white border border-slate-700 text-xs text-black rounded-xl p-2.5 focus:outline-none focus:border-primary/50"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Priority</label>
                            <select
                              value={taskPriority}
                              onChange={(e) => setTaskPriority(e.target.value)}
                              className="w-full bg-white border border-slate-700 text-xs text-black rounded-xl p-2.5 focus:outline-none focus:border-primary/50 cursor-pointer"
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
                    <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-white">
                      <button
                        type="button"
                        onClick={() => { setIsLogInteractionOpen(false); resetInteractionForm(); }}
                        className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-black transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="bg-primary hover:bg-blue-600 text-xs text-black font-semibold rounded-xl px-5 py-2.5 flex items-center gap-2 transition-all shadow-lg shadow-primary/20 cursor-pointer"
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
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                style={{ zIndex: 100000 }}
              >
                <div className="w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden">

                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <ShieldAlert className="w-5 h-5 text-primary" />
                      <div>
                        <h3 className="font-bold text-black text-sm">Health Score Breakdown</h3>
                        <p className="text-xs text-slate-500">Pillar calculations contributing to client health status</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setIsHealthExplanationOpen(false); setExplanationData(null); }}
                      className="text-slate-400 hover:text-black transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="overflow-y-auto flex-1 p-6 space-y-6">
                    {explanationLoading ? (
                      <div className="h-64 flex flex-col items-center justify-center gap-3">
                        <LoadingSpinner size="md" />
                        <span className="text-xs text-slate-400">Analyzing database logs and metrics...</span>
                      </div>
                    ) : !explanationData ? (
                      <div className="p-8 text-center text-xs text-slate-500">
                        Failed to load health score metrics.
                      </div>
                    ) : (
                      <div className="space-y-6 text-xs text-slate-300 leading-relaxed">
                        {/* Summary Banner */}
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 flex items-center gap-6">
                          <div className="relative flex items-center justify-center w-20 h-20 shrink-0">
                            <div className="absolute inset-0 rounded-full border-4 border-slate-800"></div>
                            <span className="text-xl font-black text-black">{explanationData.healthScore}%</span>
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-sm font-bold text-black">Status: <span className={
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
                                  <div className="text-xs p-2 bg-slate-50 rounded border border-slate-100 space-y-1 font-medium max-h-28 overflow-y-auto">
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
        </div>
        <div className={`absolute inset-0 p-3 sm:p-5 md:p-6 ${activeTab !== 'Stakeholders' ? 'hidden' : 'block'}`}>
          <StakeholdersTab
            account={account}
            allActivities={allActivities}
            accountContacts={accountContacts}
            openRisks={currentOpenRisks}
            nbas={nbas}
            onTaskCreated={(newTask) => {
              setAllActivities(prev => {
                const exists = prev.some(a => a.itemType === 'task' && (a.taskId || a.id) === (newTask.taskId || newTask.id));
                if (exists) return prev;
                return [{ ...newTask, itemType: 'task', isOther: false }, ...prev];
              });
            }}
          />
        </div>
        <div className={`absolute inset-0 p-3 sm:p-5 md:p-6 ${activeTab !== 'Opportunities' ? 'hidden' : 'block'}`}>
          <OpportunitiesTab account={account} allActivities={allActivities} nbas={nbas} />
        </div>
        <div className={`absolute inset-0 p-3 sm:p-5 md:p-6 ${activeTab !== 'CustomerJourney' ? 'hidden' : 'block'}`}>
          <CustomerJourneyTab
            journeyStage={journeyStage}
            journeyMeta={journeyMeta}
            journeyHistory={journeyHistory}
            nbas={nbas}
            account={account}
            allActivities={allActivities}
            onStageChange={async (newStage, opts) => {
              await handleUpdateJourneyStage(newStage, opts);
              if (showActivityToast) showActivityToast(`Journey stage updated to ${newStage}`);
            }}
            onNavigateToTasks={() => setActiveTab('Tasks')}
            onNavigateToInteractions={() => setActiveTab('Interactions')}
            onNavigateToSmartInsights={() => setActiveTab('SmartInsights')}
          />
        </div>
        <div className={`absolute inset-0 p-3 sm:p-5 md:p-6 ${activeTab !== 'SmartInsights' ? 'hidden' : 'block'}`}>
          <SmartInsightsTab
            account={account}
            nbas={nbas}
            contacts={accountContacts}
            allActivities={allActivities}
            openRisks={currentOpenRisks}
            overdueTasks={overdueTasks}
            onNavigateToTasks={() => setActiveTab('Tasks')}
            onNavigateToInteractions={() => setActiveTab('Interactions')}
            onNavigateToRisks={() => setActiveTab('Risks')}
          />
        </div>
        <div className={`absolute inset-0 p-3 sm:p-5 md:p-6 ${activeTab !== 'Risks' ? 'hidden' : 'block'}`}>
          <RisksTab account={account} onToast={showActivityToast} onRiskRulesUpdated={setAccountRiskConfig} onRiskMetricsChanged={setSyncedRiskMetrics} />
        </div>
        <div className={`absolute inset-0 p-3 sm:p-5 md:p-6 ${activeTab !== 'Interactions' ? 'hidden' : 'block'}`}>
          <InteractionsTab account={account} allActivities={allActivities} />
        </div>
        <div className={`absolute inset-0 p-3 sm:p-5 md:p-6 ${activeTab !== 'Tasks' ? 'hidden' : 'block'}`}>
          <TasksTab account={account} allActivities={allActivities} />
        </div>
        <div className={`absolute inset-0 p-3 sm:p-5 md:p-6 ${activeTab !== 'Greetings' ? 'hidden' : 'block'}`}>
          <GreetingsTab account={account} />
        </div>
        <div className={`absolute inset-0 p-3 sm:p-5 md:p-6 ${activeTab !== 'Notes' ? 'hidden' : 'block'}`}>
          <NotesTab account={account} />
        </div>
        <div className={`absolute inset-0 p-3 sm:p-5 md:p-6 ${activeTab !== 'AccountHealth' ? 'hidden' : 'block'}`}>
          <AccountHealthTab
            account={account}
            overdueTasks={overdueTasks}
            openTasks={openTasks}
            risks={currentOpenRisks}
            contacts={accountContacts}
            interactions={accountInteractions}
            onRecalculate={(data) => {
              if (data && typeof data.healthScore === 'number') {
                setAccount(prev => ({
                  ...prev,
                  healthScore: data.healthScore,
                  status: data.status || prev?.status,
                  tier: data.tier || prev?.tier
                }));
              }
              loadAccountData(true);
              try {
                const store = useStore.getState();
                if (store.fetchAccounts) store.fetchAccounts(1);
                if (store.fetchDashboardStats) store.fetchDashboardStats();
              } catch (e) {}
            }}
          />
        </div>
      </div>
    </div>
  );
}






