import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import {
  Search, ChevronDown, Plus, ChevronRight, CheckSquare,
  ExternalLink, Info, X, Loader2, AlertTriangle, Lock
} from 'lucide-react';
import { formatDate } from '../../utils/dateFormat.js';

export default function StakeholdersTab({
  account,
  allActivities = [],
  accountContacts = [],
  openRisks = [],
  nbas = [],
  onTaskCreated
}) {
  const navigate = useNavigate();
  const { user, staffList, fetchStaff, staffTasks, fetchStaffTasks, risks: storeRisks, token, createStaffTask, generateTaskHeader } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);
  const [createdTasks, setCreatedTasks] = useState(new Map());
  const [isCreatingAnother, setIsCreatingAnother] = useState(false);

  // Filter & Pagination States
  const [engagementFilter, setEngagementFilter] = useState('All Engagement Status');
  const [showEngagementDropdown, setShowEngagementDropdown] = useState(false);
  const [hoveredEngagement, setHoveredEngagement] = useState(null);
  const [hoveredTrend, setHoveredTrend] = useState(null);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const accId = account?.accountId || account?.id || null;

  // Hydrate all active (open) tasks per contact strictly from real database activities & staff tasks
  useEffect(() => {
    const tasksForContacts = new Map();
    const combinedTasks = [
      ...(Array.isArray(staffTasks) ? staffTasks.filter(t => !accId || t.accountId === accId || t.account_id === accId) : []),
      ...allActivities.filter(a => a.itemType === 'task')
    ];

    combinedTasks.forEach(activity => {
      const statusLower = (activity.status || '').toLowerCase();
      if (activity.contactId && !['completed', 'complete', 'declined'].includes(statusLower)) {
        const tid = activity.taskId || activity.id;
        if (!tid) return;
        const existingArr = tasksForContacts.get(activity.contactId) || [];
        if (!existingArr.some(item => item.taskId === tid)) {
          existingArr.push({
            taskId: tid,
            title: activity.title || activity.taskHeader || '',
            status: activity.status || 'Pending',
            priority: activity.priority || 'Medium',
            dueDate: activity.dueDate || '',
            assignedToName: activity.assignedToName || '',
            timestamp: activity.timestamp || activity.createdAt || activity.date || ''
          });
          tasksForContacts.set(activity.contactId, existingArr);
        }
      }
    });

    tasksForContacts.forEach((arr, key) => {
      arr.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      tasksForContacts.set(key, arr);
    });

    setCreatedTasks(tasksForContacts);
  }, [allActivities, staffTasks, accId]);

  // Reset pagination page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, engagementFilter, rowsPerPage]);

  // Task Creation & AI/DB Reconnect Brief States
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activityToast, setActivityToast] = useState(null);
  const [reconnectBrief, setReconnectBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const userEditedRef = useRef({ title: false, description: false, priority: false });

  const showActivityToast = (msg) => {
    setActivityToast(msg);
    setTimeout(() => setActivityToast(null), 3000);
  };

  // Assign-to searchable state
  const [assignSearch, setAssignSearch] = useState('');
  const [assignDropdownOpen, setAssignDropdownOpen] = useState(false);
  const [assignedStaff, setAssignedStaff] = useState(null);
  const assignRef = useRef(null);

  useEffect(() => {
    if (!staffList || staffList.length === 0) {
      if (fetchStaff) fetchStaff();
    }
    if (fetchStaffTasks) {
      fetchStaffTasks('all-tasks');
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (assignRef.current && !assignRef.current.contains(e.target)) {
        setAssignDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredStaff = (staffList || []).filter(s => {
    const query = assignSearch.replace(/^@/, '').toLowerCase().trim();
    if (!query) return true;
    return (
      (s.name || s.displayName || '').toLowerCase().includes(query) ||
      (s.role || s.jobTitle || '').toLowerCase().includes(query)
    );
  });

  // Resolve real open risks for this account from props or store
  const accountOpenRisks = React.useMemo(() => {
    if (Array.isArray(openRisks) && openRisks.length > 0) return openRisks;
    if (!accId || !Array.isArray(storeRisks)) return [];
    return storeRisks.filter(r => r.accountId === accId && r.status !== 'Resolved');
  }, [openRisks, storeRisks, accId]);

  // Real dynamic data computation from stored database records
  const contactStatsMap = React.useMemo(() => {
    const map = new Map();
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(today.getDate() - 15);

    const accountLabel = account?.companyName || 'this account';
    const journeyStage = account?.journeyStage || 'Awareness';

    accountContacts.forEach(contact => {
      const cid = contact.contactId || contact.id;
      const contactEmail = (contact.email || '').toLowerCase().trim();

      const contactActivities = allActivities.filter(a =>
        a.contactId === cid ||
        (a.participants && a.participants.some(p => p.contactId === cid || (contactEmail && (p.email || '').toLowerCase() === contactEmail))) ||
        (a.to && a.to.some(t => typeof t === 'object' ? (t.contactId === cid || (contactEmail && (t.email || '').toLowerCase() === contactEmail)) : false)) ||
        (a.from && typeof a.from === 'object' && a.from.contactId === cid)
      );

      const sorted = [...contactActivities].sort(
        (a, b) => new Date(b.timestamp || b.date || b.dueDate || 0) - new Date(a.timestamp || a.date || a.dueDate || 0)
      );

      const lastInt = sorted[0];
      let lastInteractionDate = '-';
      let lastInteractionDays = '';
      let diffDays = null;

      if (lastInt) {
        const lDate = new Date(lastInt.timestamp || lastInt.date || lastInt.dueDate || 0);
        if (!isNaN(lDate.getTime())) {
          lastInteractionDate = formatDate(lDate);
          const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const lDateMidnight = new Date(lDate.getFullYear(), lDate.getMonth(), lDate.getDate());
          const diffMs = todayMidnight.getTime() - lDateMidnight.getTime();
          diffDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
          lastInteractionDays = diffDays === 0
            ? '(today)'
            : diffDays === 1
              ? '(1 day ago)'
              : `(${diffDays} days ago)`;
        }
      }

      const recentActivities = sorted.filter(a => new Date(a.timestamp || a.date || a.dueDate || 0) >= thirtyDaysAgo);
      const interactionCount = recentActivities.length;

      let engagement = 'Not Engaged';
      if (interactionCount > 3) engagement = 'Active';
      else if (interactionCount > 0) engagement = 'Needs Attention';

      const last15Count = recentActivities.filter(a => new Date(a.timestamp || a.date || a.dueDate || 0) >= fifteenDaysAgo).length;
      const prior15Count = interactionCount - last15Count;
      let trend = 'Stable';
      if (last15Count > prior15Count) trend = 'Improving';
      else if (last15Count < prior15Count && prior15Count > 0) trend = 'Declining';

      let trendReason = '';
      let trendDetail = '';
      if (trend === 'Improving') {
        trendReason = `${contact.name}'s engagement velocity is accelerating, with ${last15Count} ${last15Count === 1 ? 'touchpoint' : 'touchpoints'} in the last 15 days compared to ${prior15Count} in the prior 15 days (Day 16–30).`;
        trendDetail = `30-day velocity comparison: Recent 15d (${last15Count}) vs. Prior 15d (${prior15Count}).`;
      } else if (trend === 'Declining') {
        trendReason = `${contact.name}'s engagement velocity has slowed down, with ${last15Count} ${last15Count === 1 ? 'touchpoint' : 'touchpoints'} in the last 15 days compared to ${prior15Count} in the prior 15 days (Day 16–30).`;
        trendDetail = `30-day velocity comparison: Recent 15d (${last15Count}) vs. Prior 15d (${prior15Count}).`;
      } else {
        if (interactionCount === 0) {
          trendReason = `No interactions logged with ${contact.name} in the last 30 days (0 in recent 15d and 0 in prior 15d). Velocity is flat/stable.`;
        } else {
          trendReason = `${contact.name}'s communication cadence is steady, with ${last15Count} ${last15Count === 1 ? 'touchpoint' : 'touchpoints'} in the last 15 days and ${prior15Count} in the prior 15 days.`;
        }
        trendDetail = `30-day velocity comparison: Recent 15d (${last15Count}) vs. Prior 15d (${prior15Count}).`;
      }

      const influence = contact.influenceTag || 'Observer';

      let relationship = 'Moderate';
      if (engagement === 'Active' && ['High', 'Medium', 'Decision Maker', 'Champion', 'Influencer'].includes(influence)) {
        relationship = 'Strong';
      } else if (engagement === 'Not Engaged') {
        relationship = 'Weak';
      }

      let nextAction = 'None';
      if (engagement === 'Not Engaged' || lastInteractionDays === '') nextAction = 'Schedule Connect';
      else if (engagement === 'Needs Attention') nextAction = 'Reconnect';

      const latestTitle = lastInt
        ? (lastInt.subject || lastInt.title || lastInt.taskHeader || '').trim()
        : '';
      const latestChannel = lastInt
        ? (lastInt.channel || lastInt.source || (lastInt.itemType === 'task' ? 'Task' : '')).trim()
        : '';
      const daysAgoText = diffDays === null
        ? ''
        : diffDays === 0
          ? 'today'
          : `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
      const hasOpenTask = createdTasks.has(cid);

      // Extract real concerns / signals from this contact's logged DB activities
      const detectedConcerns = [];
      sorted.forEach(item => {
        if (item.riskCategory) detectedConcerns.push(`${item.riskCategory}${item.summary ? `: ${item.summary}` : ''}`);
        if (Array.isArray(item.concerns)) item.concerns.forEach(c => detectedConcerns.push(c));
        if (Array.isArray(item.followUpSignals)) item.followUpSignals.forEach(f => detectedConcerns.push(f));
        if (Array.isArray(item.requirements)) item.requirements.forEach(r => detectedConcerns.push(r));
        if (item.sentiment === 'Negative' && (item.subject || item.title)) {
          detectedConcerns.push(`Negative sentiment in "${item.subject || item.title}"`);
        }
      });

      // Match NBAs referencing this contact
      const contactNbas = (Array.isArray(nbas) ? nbas : []).filter(
        n => (n.linkType === 'contact' && n.linkId === cid) || (contact.name && (n.suggestedAction || '').includes(contact.name))
      );

      // Hover tooltip strings
      let engagementReason = '';
      let engagementDetail = '';

      if (engagement === 'Active') {
        engagementReason = `${contact.name} has ${interactionCount} interactions recorded for ${accountLabel} in the last 30 days (meets the 4+ touchpoints threshold for Active).`;
        engagementDetail = lastInt
          ? `Latest touchpoint${latestTitle ? ` "${latestTitle}"` : ''}${latestChannel ? ` (${latestChannel})` : ''} on ${lastInteractionDate} (${daysAgoText}) · Trend: ${trend} (${last15Count} in last 15d vs. ${prior15Count} prior).`
          : `Trend: ${trend}.`;
      } else if (engagement === 'Needs Attention') {
        engagementReason = `${contact.name} only has ${interactionCount} ${interactionCount === 1 ? 'interaction' : 'interactions'} recorded for ${accountLabel} in the last 30 days (4+ touchpoints required for Active).`;
        engagementDetail = [
          lastInt
            ? `Last touchpoint${latestTitle ? ` "${latestTitle}"` : ''}${latestChannel ? ` (${latestChannel})` : ''} on ${lastInteractionDate} (${daysAgoText}).`
            : '',
          hasOpenTask
            ? 'A follow-up task is currently assigned.'
            : `Reconnect recommended for this ${influence} contact.`
        ].filter(Boolean).join(' ');
      } else {
        engagementReason = sorted.length > 0
          ? `0 interactions recorded with ${contact.name} for ${accountLabel} in the last 30 days (${sorted.length} older ${sorted.length === 1 ? 'record' : 'records'} on file).`
          : `No interactions or tasks have been logged with ${contact.name} for ${accountLabel} yet.`;
        engagementDetail = [
          lastInt
            ? `Last touchpoint${latestTitle ? ` "${latestTitle}"` : ''} was on ${lastInteractionDate} (${daysAgoText}).`
            : '',
          hasOpenTask
            ? 'An outreach task is currently assigned.'
            : `Schedule an initial connect for this ${influence} contact.`
        ].filter(Boolean).join(' ');
      }

      // Build real DB-grounded Assign Task brief (instant 0ms baseline before AI enrichment)
      const roleDesc = [contact.designation, influence].filter(Boolean).join(' · ');
      let reasonHeadline = '';
      let reasonSummary = '';

      if (engagement === 'Active') {
        reasonHeadline = `${interactionCount} touchpoints recorded in the last 30 days${lastInteractionDate !== '-' ? ` (latest on ${lastInteractionDate})` : ''}.`;
        reasonSummary = `${contact.name}${roleDesc ? ` (${roleDesc})` : ''} is actively engaged on ${accountLabel}${latestTitle ? `, most recently via "${latestTitle}"` : ''}. Assign a follow-up task to sustain momentum in the ${journeyStage} stage.`;
      } else if (engagement === 'Needs Attention') {
        reasonHeadline = `Only ${interactionCount} ${interactionCount === 1 ? 'interaction' : 'interactions'} in the last 30 days${daysAgoText ? ` — last touchpoint ${daysAgoText}` : ''}.`;
        reasonSummary = `Last recorded touchpoint with ${contact.name}${roleDesc ? ` (${roleDesc})` : ''} at ${accountLabel} was on ${lastInteractionDate}${latestTitle ? ` ("${latestTitle}"${latestChannel ? ` via ${latestChannel}` : ''})` : ''}. Reconnect to build consistent engagement (4+ touchpoints in 30 days).`;
      } else {
        reasonHeadline = sorted.length > 0
          ? `0 interactions in the last 30 days${daysAgoText ? ` — last contact was ${daysAgoText} (${lastInteractionDate})` : ''}.`
          : `No interactions or tasks recorded with ${contact.name} for ${accountLabel} yet.`;
        reasonSummary = sorted.length > 0
          ? `${contact.name}${roleDesc ? ` (${roleDesc})` : ''} has not been engaged in over 30 days${latestTitle ? ` (last activity: "${latestTitle}")` : ''}. Schedule a connect to re-establish relationship coverage on ${accountLabel}.`
          : `${contact.name}${roleDesc ? ` (${roleDesc})` : ''} is mapped to ${accountLabel} (${journeyStage} stage) with zero logged touchpoints. Schedule an introductory connect to establish engagement.`;
      }

      const dbIssues = [];
      if (engagement === 'Not Engaged') {
        dbIssues.push(
          sorted.length > 0
            ? `Engagement gap: ${diffDays} days since last touchpoint (${lastInteractionDate}).`
            : `Zero logged interactions with ${contact.name} on ${accountLabel}.`
        );
      } else if (engagement === 'Needs Attention') {
        dbIssues.push(`Low touchpoint frequency: ${interactionCount} of 4+ required 30-day interactions recorded.`);
      }
      detectedConcerns.slice(0, 2).forEach(item => {
        if (item && !dbIssues.includes(item)) dbIssues.push(item);
      });
      accountOpenRisks.slice(0, 2).forEach(r => {
        const riskText = `${r.severity || 'Open'} Risk (${r.category || 'Account'}): ${r.description || 'Requires attention'}`;
        if (!dbIssues.includes(riskText)) dbIssues.push(riskText);
      });

      const actionVerb = engagement === 'Not Engaged'
        ? 'Schedule Connect with'
        : engagement === 'Needs Attention'
          ? 'Reconnect with'
          : 'Follow up with';

      const defaultTaskTitle = `${actionVerb} ${contact.name}${contact.designation ? ` (${contact.designation})` : ''}`;

      const descParts = [
        `${actionVerb} ${contact.name}${roleDesc ? ` (${roleDesc})` : ''} at ${accountLabel}.`,
        reasonHeadline
      ];
      if (latestTitle) {
        descParts.push(`Last logged touchpoint: "${latestTitle}"${lastInteractionDate !== '-' ? ` on ${lastInteractionDate}` : ''}.`);
      }
      if (accountOpenRisks.length > 0) {
        descParts.push(`Address open account risk: ${accountOpenRisks[0].category}${accountOpenRisks[0].description ? ` — ${accountOpenRisks[0].description}` : ''}.`);
      } else if (detectedConcerns.length > 0) {
        descParts.push(`Follow up on noted signal: ${detectedConcerns[0]}.`);
      }
      const defaultTaskDescription = descParts.join(' ');

      const isExecOrDm = ['Decision Maker', 'Champion'].includes(influence) || /cto|ceo|cfo|vp|director|head|chief/i.test(contact.designation || '');
      const hasHighRisk = accountOpenRisks.some(r => r.severity === 'Critical' || r.severity === 'High');
      const defaultPriority = (hasHighRisk || (engagement === 'Not Engaged' && isExecOrDm))
        ? 'High'
        : engagement === 'Active'
          ? 'Low'
          : 'Medium';

      const suggestedSteps = [];
      if (contactNbas.length > 0 && contactNbas[0].suggestedAction) {
        suggestedSteps.push(contactNbas[0].suggestedAction);
      } else if (latestTitle) {
        suggestedSteps.push(`Follow up on last logged touchpoint ("${latestTitle}"${lastInteractionDate !== '-' ? ` on ${lastInteractionDate}` : ''}) with ${contact.name}.`);
      } else {
        suggestedSteps.push(`Reach out to ${contact.name}${contact.designation ? ` (${contact.designation})` : ''} aligned with ${accountLabel}'s ${journeyStage} priorities.`);
      }
      if (accountOpenRisks.length > 0) {
        suggestedSteps.push(`Discuss mitigation for open ${accountOpenRisks[0].category} risk (${accountOpenRisks[0].severity}) on ${accountLabel}.`);
      } else if (detectedConcerns.length > 0) {
        suggestedSteps.push(`Resolve pending signal from interaction logs: ${detectedConcerns[0]}.`);
      } else {
        suggestedSteps.push(`Align with ${contact.name} on ${accountLabel}'s ${journeyStage} stage milestones and next deliverables.`);
      }
      suggestedSteps.push(`Log the conversation in CustomerPulse to update ${contact.name}'s 30-day engagement status.`);

      map.set(cid, {
        influence,
        relationship,
        engagement,
        trend,
        trendReason,
        trendDetail,
        last15Count,
        prior15Count,
        nextAction,
        lastInteractionDate,
        lastInteractionDays,
        lastInteractionTime: lastInt ? new Date(lastInt.timestamp || lastInt.date || lastInt.dueDate || 0).getTime() : 0,
        interactionCount,
        engagementReason,
        engagementDetail,
        localBrief: {
          reasonHeadline,
          reasonSummary,
          issues: dbIssues,
          taskTitle: defaultTaskTitle,
          taskDescription: defaultTaskDescription,
          priority: defaultPriority,
          suggestedSteps,
          source: 'db'
        }
      });
    });
    return map;
  }, [accountContacts, allActivities, account?.companyName, account?.journeyStage, createdTasks, accountOpenRisks, nbas]);

  // Populate Assign Task drawer from real DB data immediately, then enrich via backend AI + DB endpoint
  useEffect(() => {
    if (!selectedContact) {
      setReconnectBrief(null);
      setBriefLoading(false);
      return;
    }

    const cid = selectedContact.contactId || selectedContact.id;
    const stats = contactStatsMap.get(cid);
    const initialBrief = stats?.localBrief || null;

    userEditedRef.current = { title: false, description: false, priority: false };

    // Default due date to +3 days (YYYY-MM-DD) so Create Task works seamlessly
    const defaultDue = new Date();
    defaultDue.setDate(defaultDue.getDate() + 3);
    setDueDate(defaultDue.toISOString().split('T')[0]);

    // Auto-resolve recommended Staff Assignee (Key Contact Owner / Account Owner — never auto-assign Admin to self)
    if (Array.isArray(staffList) && staffList.length > 0) {
      const isAdminObj = (u) => {
        if (!u) return false;
        const role = String(u.role || u.userType || '').toLowerCase();
        const email = String(u.email || u.ownerEmail || '').toLowerCase();
        const uid = String(u.uid || u.ownerId || '');
        const name = String(u.name || u.ownerName || '').toLowerCase();
        return role === 'admin' || uid === 'mock-admin-uid' || email.includes('admin@') || name.includes('admin user');
      };
      const currentIsAdmin = isAdminObj(user);

      const findStaffMatch = (oId, oName, oEmail) =>
        staffList.find(s =>
          (!currentIsAdmin || !isAdminObj(s)) &&
          (
            (oId && String(s.uid || s.id) === String(oId)) ||
            (oEmail && s.email && s.email.toLowerCase().trim() === String(oEmail).toLowerCase().trim()) ||
            (oName && (s.name || s.displayName || '').toLowerCase().trim() === String(oName).toLowerCase().trim())
          )
        );

      const contactOwnerMatch = findStaffMatch(selectedContact.ownerId, selectedContact.ownerName, selectedContact.ownerEmail);
      const accountOwnerMatch = findStaffMatch(account?.ownerId, account?.ownerName, account?.ownerEmail);
      const chosenStaff = contactOwnerMatch || accountOwnerMatch || null;

      if (chosenStaff) {
        setAssignedStaff(chosenStaff);
        setAssignSearch('');
      }
    }

    if (initialBrief) {
      setReconnectBrief(initialBrief);
      setTaskTitle(initialBrief.taskTitle);
      setTaskDescription(initialBrief.taskDescription);
      setPriority(initialBrief.priority);
    } else {
      setTaskTitle(`Follow up with ${selectedContact.name}`);
      setTaskDescription('');
      setPriority('Medium');
    }

    if (!accId || !cid || !token) return;

    let cancelled = false;
    setBriefLoading(true);

    fetch('/CustomerPulse/api/ai/contact-reconnect-brief', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ accountId: accId, contactId: cid })
    })
      .then(res => (res.ok ? res.json() : null))
      .then(aiBrief => {
        if (cancelled || !aiBrief) return;
        setReconnectBrief(aiBrief);
        if (!userEditedRef.current.title && aiBrief.taskTitle) {
          setTaskTitle(aiBrief.taskTitle);
        }
        if (!userEditedRef.current.description && aiBrief.taskDescription) {
          setTaskDescription(aiBrief.taskDescription);
        }
        if (!userEditedRef.current.priority && aiBrief.priority) {
          setPriority(aiBrief.priority);
        }
      })
      .catch(err => {
        console.error('Failed to fetch AI contact reconnect brief:', err);
      })
      .finally(() => {
        if (!cancelled) setBriefLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedContact?.contactId, selectedContact?.id, accId, token]);

  const openContactDrawer = (contact, createNew = false) => {
    setIsCreatingAnother(createNew);
    setSelectedContact(contact);
  };

  const handleStartAnotherTask = () => {
    const cid = selectedContact?.contactId || selectedContact?.id;
    const stats = cid ? contactStatsMap.get(cid) : null;
    const briefSource = reconnectBrief || stats?.localBrief || null;
    userEditedRef.current = { title: false, description: false, priority: false };
    const defaultDue = new Date();
    defaultDue.setDate(defaultDue.getDate() + 3);
    setDueDate(defaultDue.toISOString().split('T')[0]);
    if (briefSource) {
      setTaskTitle(briefSource.taskTitle || `Follow up with ${selectedContact?.name || 'Contact'}`);
      setTaskDescription(briefSource.taskDescription || '');
      setPriority(briefSource.priority || 'Medium');
    } else if (selectedContact) {
      setTaskTitle(`Follow up with ${selectedContact.name}`);
      setTaskDescription('');
      setPriority('Medium');
    }
    setIsCreatingAnother(true);
  };

  const handleDescriptionBlur = async () => {
    if (!taskDescription.trim() || !userEditedRef.current.description) return;
    try {
      const generated = await generateTaskHeader(taskDescription);
      if (generated && generated !== 'Task Assignment' && !userEditedRef.current.title) {
        setTaskTitle(generated);
      }
    } catch (e) {
      console.error('Error generating task title:', e);
    }
  };

  const handleCreateTask = async () => {
    let resolvedAssignee = assignedStaff;
    if (!resolvedAssignee && assignSearch.trim()) {
      const cleanQ = assignSearch.replace(/^@/, '').toLowerCase().trim();
      resolvedAssignee = (staffList || []).find(
        s =>
          (s.name || s.displayName || '').toLowerCase().trim() === cleanQ ||
          (s.email || '').toLowerCase().trim() === cleanQ
      ) || null;
      if (resolvedAssignee) {
        setAssignedStaff(resolvedAssignee);
      }
    }

    if (!taskTitle.trim() || !taskDescription.trim() || !resolvedAssignee) {
      showActivityToast('Please fill in Task Title, Description, and select an Assignee.');
      return;
    }

    setIsSubmitting(true);
    const cid = selectedContact.contactId || selectedContact.id || null;
    const statsForSelected = cid ? contactStatsMap.get(cid) : null;
    const briefForSelected = reconnectBrief || statsForSelected?.localBrief || null;
    const engagementReasonPayload = briefForSelected
      ? [briefForSelected.reasonHeadline, briefForSelected.reasonSummary].filter(Boolean).join(' ')
      : (statsForSelected?.engagementReason || '');

    const assigneeUid = resolvedAssignee.uid || resolvedAssignee.id;
    const assigneeName = resolvedAssignee.name || resolvedAssignee.displayName || 'Staff Member';
    const payload = {
      title: taskTitle.trim(),
      description: taskDescription.trim(),
      assignedToUid: assigneeUid,
      assignedToName: assigneeName,
      priority,
      dueDate: dueDate || null,
      accountId: accId,
      contactId: cid,
      companyName: account?.companyName || '',
      contactName: selectedContact?.name || '',
      contactEngagementStatus: statsForSelected?.engagement || '',
      contactEngagementReason: engagementReasonPayload
    };

    const res = await createStaffTask(payload);
    setIsSubmitting(false);
    if (res && (res.success || res.taskId || res.id)) {
      const createdObj = res.task || res;
      const newTaskId = createdObj.taskId || res.taskId || res.id;
      showActivityToast('Task assigned! Opening in Staff Tasks...');

      setCreatedTasks(prev => {
        const next = new Map(prev);
        const prevList = next.get(cid) || [];
        const newEntry = {
          taskId: newTaskId,
          title: createdObj.title || payload.title,
          status: createdObj.status || 'Pending',
          priority: createdObj.priority || payload.priority,
          dueDate: createdObj.dueDate || payload.dueDate,
          assignedToName: createdObj.assignedToName || assigneeName,
          timestamp: createdObj.timestamp || new Date().toISOString()
        };
        next.set(cid, [newEntry, ...prevList.filter(item => item.taskId !== newTaskId)]);
        return next;
      });
      setIsCreatingAnother(false);

      if (onTaskCreated) {
        onTaskCreated({
          ...createdObj,
          taskId: newTaskId,
          companyName: createdObj.companyName || account?.companyName || 'Account',
          contactName: createdObj.contactName || selectedContact?.name || '',
          contactEngagementStatus: createdObj.contactEngagementStatus || payload.contactEngagementStatus,
          contactEngagementReason: createdObj.contactEngagementReason || payload.contactEngagementReason
        });
      }
      if (fetchStaffTasks) {
        fetchStaffTasks('all-tasks');
      }

      setTimeout(() => {
        setSelectedContact(null);
        navigate('/staff-tasks', {
          state: {
            selectedTaskId: newTaskId,
            from: accId ? `/accounts/${accId}` : '/accounts',
            tab: 'Stakeholders'
          }
        });
      }, 500);
    } else {
      showActivityToast(res?.error || 'Failed to create task');
    }
  };

  const filteredContacts = accountContacts.filter(c => {
    const stats = contactStatsMap.get(c.contactId || c.id);

    const fullSearchableText = [
      c.name,
      c.email,
      c.designation,
      c.department,
      stats?.influence,
      stats?.relationship,
      stats?.engagement,
      stats?.trend
    ].filter(Boolean).join(' ').toLowerCase();

    const searchWords = searchTerm.toLowerCase().trim().split(/\s+/);
    const matchesSearch = !searchTerm.trim() || searchWords.every(word => fullSearchableText.includes(word));
    const matchesEngagement = engagementFilter === 'All Engagement Status' || stats?.engagement === engagementFilter;

    return matchesSearch && matchesEngagement;
  });

  const totalFiltered = filteredContacts.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * rowsPerPage;
  const endIdx = Math.min(startIdx + rowsPerPage, totalFiltered);
  const paginatedContacts = filteredContacts.slice(startIdx, endIdx);

  const engagementStatuses = ['All Engagement Status', 'Active', 'Needs Attention', 'Not Engaged'];

  const selectedContactId = selectedContact ? (selectedContact.contactId || selectedContact.id) : null;
  const selectedStats = selectedContactId ? contactStatsMap.get(selectedContactId) : null;
  const existingTaskList = (selectedContactId && createdTasks.get(selectedContactId)) || [];
  const showTaskForm = existingTaskList.length === 0 || isCreatingAnother;
  const activeBrief = reconnectBrief || selectedStats?.localBrief || null;

  const selectedSubline = selectedContact
    ? [
        selectedContact.designation,
        selectedContact.department,
        selectedContact.influenceTag,
        selectedContact.projectName
      ].filter(Boolean).join(' • ') || selectedContact.email || ''
    : '';

  return (
    <div className="flex h-[calc(100vh-10rem)] w-full overflow-hidden bg-white rounded-tl-2xl relative">
      {/* Main Stakeholders List */}
      <div className="flex-1 flex flex-col h-full">

        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="text-blue-900">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2 tracking-tight">
                Key Contacts
              </h2>
            </div>
          </div>

          {/* Filters Top Right */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search stakeholders..."
                className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="relative">
              <button
                onClick={() => setShowEngagementDropdown(!showEngagementDropdown)}
                onBlur={() => setTimeout(() => setShowEngagementDropdown(false), 200)}
                className="cursor-pointer flex items-center justify-between gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 min-w-[180px]"
              >
                {engagementFilter} <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {showEngagementDropdown && (
                <div className="absolute top-full mt-1 right-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-[200] overflow-hidden">
                  {engagementStatuses.filter(t => t !== engagementFilter).map(t => (
                    <button
                      key={t}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setEngagementFilter(t);
                        setShowEngagementDropdown(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div
          className="flex-1 overflow-auto mt-4 px-6"
          onScroll={() => {
            if (hoveredEngagement) setHoveredEngagement(null);
            if (hoveredTrend) setHoveredTrend(null);
          }}
        >
          <table className="w-full text-left border-collapse">
            <thead className="bg-white sticky top-0 z-10">
              <tr className="border-b border-gray-200">
                <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:bg-gray-50 rounded">
                  Name <span className="text-gray-400 text-[10px]">↕</span>
                </th>
                <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider">Role / Designation</th>
                <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:bg-gray-50 rounded">
                  Influence <span className="text-gray-400 text-[10px]">↕</span>
                </th>
                <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider">Relationship Strength</th>
                <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider">Last Interaction</th>
                <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider text-center">
                  Interactions<br /><span className="text-[9px] text-gray-500 lowercase normal-case">(30 days)</span>
                </th>
                <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider">Engagement Status</th>
                <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider">Trend</th>
                <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider">Next Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedContacts.map(contact => {
                const cid = contact.contactId || contact.id;
                const stats = contactStatsMap.get(cid) || {};
                const isSelected = selectedContactId === cid;
                const contactTasks = createdTasks.get(cid) || [];
                const latestTask = contactTasks[0] || null;
                const taskTime = latestTask ? new Date(latestTask.timestamp || latestTask.createdAt || 0).getTime() : 0;
                const hasNewInteractionSinceTask = Boolean(latestTask && stats.lastInteractionTime && stats.lastInteractionTime > taskTime);
                const isBlocked = Boolean(latestTask && !hasNewInteractionSinceTask);

                return (
                  <tr
                    key={cid}
                    className={`hover:bg-gray-50 transition-colors cursor-pointer group ${isSelected ? 'bg-blue-50/50' : ''}`}
                    onClick={() => openContactDrawer(contact, false)}
                  >
                    <td className="py-4 px-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                          {contact.avatarUrl ? (
                            <img src={contact.avatarUrl} alt={contact.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold text-gray-600">{(contact.name || '?').substring(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="font-bold text-sm text-blue-900">{contact.name}</div>
                      </div>
                    </td>
                    <td className="py-4 px-2 text-sm text-gray-600">
                      {contact.designation || contact.hierarchyTag || '—'}
                    </td>
                    <td className="py-4 px-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        stats.influence === 'High' ? 'bg-red-50 text-red-600' :
                        stats.influence === 'Medium' ? 'bg-orange-50 text-orange-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {stats.influence || 'Observer'}
                      </span>
                    </td>
                    <td className="py-4 px-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 w-16">{stats.relationship}</span>
                        <div className="flex gap-1">
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className={`w-3 h-2 rounded-sm ${
                              (stats.relationship === 'Strong' && i < 4) ? 'bg-green-500' :
                              (stats.relationship === 'Moderate' && i < 3) ? 'bg-amber-400' :
                              (stats.relationship === 'Weak' && i < 1) ? 'bg-red-500' :
                              'bg-gray-200'
                            }`} />
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-2">
                      <div className="text-sm font-semibold text-gray-900">{stats.lastInteractionDate}</div>
                      <div className="text-xs text-gray-500">{stats.lastInteractionDays}</div>
                    </td>
                    <td className="py-4 px-2 text-center text-sm text-gray-900">
                      {stats.interactionCount}
                    </td>
                    <td className="py-4 px-2">
                      <span
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredEngagement({
                            contactName: contact.name,
                            designation: contact.designation || '',
                            accountName: account?.companyName || '',
                            engagement: stats.engagement,
                            reason: stats.engagementReason,
                            detail: stats.engagementDetail,
                            rect
                          });
                        }}
                        onMouseLeave={() => setHoveredEngagement(null)}
                        className={`inline-block px-2.5 py-1 rounded text-[11px] font-bold transition-shadow hover:ring-2 hover:ring-slate-200 ${
                          stats.engagement === 'Active' ? 'bg-green-100 text-green-700' :
                          stats.engagement === 'Needs Attention' ? 'bg-orange-50 text-orange-600' :
                          'bg-red-50 text-red-600'
                        }`}
                      >
                        {stats.engagement}
                      </span>
                    </td>
                    <td className="py-4 px-2 text-sm">
                      <span
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredTrend({
                            contactName: contact.name,
                            designation: contact.designation || '',
                            accountName: account?.companyName || '',
                            trend: stats.trend,
                            reason: stats.trendReason,
                            detail: stats.trendDetail,
                            rect
                          });
                        }}
                        onMouseLeave={() => setHoveredTrend(null)}
                        className={`inline-flex items-center gap-1 font-semibold cursor-help px-2 py-0.5 rounded transition-shadow hover:ring-2 hover:ring-slate-200 ${
                          stats.trend === 'Improving' ? 'text-green-600 bg-green-50/60' :
                          stats.trend === 'Declining' ? 'text-red-600 bg-red-50/60' : 'text-gray-600 bg-slate-50'
                        }`}
                      >
                        {stats.trend === 'Improving' ? '↑' : stats.trend === 'Declining' ? '↓' : '→'} {stats.trend}
                      </span>
                    </td>
                    <td className="py-4 px-2">
                      {isBlocked ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/staff-tasks', {
                              state: {
                                selectedTaskId: latestTask.taskId,
                                from: accId ? `/accounts/${accId}` : '/accounts',
                                tab: 'Stakeholders'
                              }
                            });
                          }}
                          title={`Reconnect is blocked because task "${latestTask.title}" is currently active. Reconnect will automatically re-enable once this task is resolved or a new interaction is logged.`}
                          className="bg-slate-100 hover:bg-slate-200/80 border border-slate-300 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
                        >
                          <Lock className="w-3.5 h-3.5 text-slate-500" />
                          {stats.nextAction && stats.nextAction !== 'None' ? stats.nextAction : 'Reconnect'} (Blocked)
                        </button>
                      ) : stats.nextAction && stats.nextAction !== 'None' ? (
                        <button
                          className="text-blue-900 hover:text-blue-950 bg-white border border-blue-200 hover:bg-blue-50 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            openContactDrawer(contact, true);
                          }}
                        >
                          {stats.nextAction.includes('Connect') ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path><path d="m14 7 5-5"></path><path d="m14 2 5 5"></path></svg>
                          ) : null}
                          {stats.nextAction.includes('Add') ? <Plus className="w-3.5 h-3.5" /> : null}
                          {stats.nextAction}
                        </button>
                      ) : (
                        <span className="text-gray-400 font-medium">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex items-center justify-between py-4 border-t border-gray-200 mt-4 text-sm text-gray-500">
            <div>Showing {paginatedContacts.length} of {accountContacts.length} stakeholders</div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                Rows per page:
                <select
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                  className="border border-gray-300 rounded px-2 py-1 text-gray-700 bg-white outline-none focus:border-blue-900 cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <div>
                {totalFiltered === 0 ? '0 of 0' : `${startIdx + 1}-${endIdx} of ${totalFiltered}`}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-40 cursor-pointer disabled:cursor-default"
                >
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-40 cursor-pointer disabled:cursor-default"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Side Panel (Assign Task / Task Created — 100% DB + AI Driven) */}
      {selectedContact && (
        <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[410px] max-w-full border-l border-gray-200 bg-white flex flex-col shadow-[-4px_0_15px_rgba(0,0,0,0.03)] shrink-0 animate-in slide-in-from-right-8 duration-300 z-20">
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <h3 className="text-xl font-bold text-gray-900">
              {showTaskForm ? 'Assign Task' : 'Task Created'}
            </h3>
            <button
              onClick={() => {
                setIsCreatingAnother(false);
                setSelectedContact(null);
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1">
            {/* Contact Profile Mini (Dynamic Engagement Status & Real DB Fields) */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 mb-5">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-900 flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                {selectedContact.avatarUrl ? (
                  <img src={selectedContact.avatarUrl} alt={selectedContact.name} className="w-full h-full object-cover" />
                ) : (
                  (selectedContact.name || '?').substring(0, 2).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-blue-900 truncate">{selectedContact.name}</h4>
                  {selectedStats?.engagement && (
                    <span
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredEngagement({
                          contactName: selectedContact.name,
                          designation: selectedContact.designation || '',
                          accountName: account?.companyName || '',
                          engagement: selectedStats.engagement,
                          reason: selectedStats.engagementReason,
                          detail: selectedStats.engagementDetail,
                          rect
                        });
                      }}
                      onMouseLeave={() => setHoveredEngagement(null)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded shrink-0 ${
                        selectedStats.engagement === 'Active' ? 'bg-green-100 text-green-700' :
                        selectedStats.engagement === 'Needs Attention' ? 'bg-orange-50 text-orange-600' :
                        'bg-red-50 text-red-600'
                      }`}
                    >
                      {selectedStats.engagement}
                    </span>
                  )}
                </div>
                {selectedSubline && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">{selectedSubline}</p>
                )}
              </div>
            </div>

            {/* Real DB / AI Engagement Reason (Why Engaged OR Why Not Engaged / Needs Attention) */}
            {activeBrief && (
              <div className={`rounded-xl p-4 mb-5 text-xs leading-relaxed space-y-2.5 border ${
                selectedStats?.engagement === 'Active'
                  ? 'bg-emerald-50/60 border-emerald-200/80 text-emerald-950'
                  : 'bg-blue-50/80 border-blue-100 text-blue-900'
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <Info className={`w-4 h-4 shrink-0 mt-0.5 ${
                      selectedStats?.engagement === 'Active' ? 'text-emerald-600' : 'text-blue-600'
                    }`} />
                    <div>
                      <div className={`text-[10px] font-extrabold uppercase tracking-wider mb-1 ${
                        selectedStats?.engagement === 'Active'
                          ? 'text-emerald-700'
                          : selectedStats?.engagement === 'Needs Attention'
                            ? 'text-orange-600'
                            : 'text-red-600'
                      }`}>
                        {selectedStats?.engagement === 'Active'
                          ? 'Why Engaged (Active)'
                          : selectedStats?.engagement === 'Needs Attention'
                            ? 'Why Needs Attention'
                            : 'Why Not Engaged'}
                      </div>
                      <p className="font-bold text-slate-900 mb-0.5">{activeBrief.reasonHeadline}</p>
                      <p className="text-slate-700 leading-relaxed">{activeBrief.reasonSummary}</p>
                    </div>
                  </div>
                  {briefLoading && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0 mt-0.5" title="Analyzing user activities with AI..." />
                  )}
                </div>

                {Array.isArray(activeBrief.issues) && activeBrief.issues.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/70 space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600" /> Task Drivers &amp; Issues
                    </div>
                    <ul className="space-y-1 pl-1">
                      {activeBrief.issues.map((issue, idx) => (
                        <li key={idx} className="text-[11px] text-slate-700 flex items-start gap-1.5">
                          <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {!showTaskForm ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                      <CheckSquare className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-sm font-bold text-gray-900">
                      {existingTaskList.length} Active {existingTaskList.length === 1 ? 'Task' : 'Tasks'} Assigned
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartAnotherTask}
                    className="text-xs font-bold text-blue-900 hover:text-blue-950 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> New Task
                  </button>
                </div>

                <div className="space-y-3">
                  {existingTaskList.map((tItem) => (
                    <div
                      key={tItem.taskId}
                      className="bg-gray-50 border border-gray-200/80 rounded-xl p-4 text-left space-y-3"
                    >
                      {tItem.title && (
                        <div>
                          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Task</div>
                          <div className="text-sm font-semibold text-gray-900">{tItem.title}</div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Status</div>
                          <div className="text-xs font-bold text-blue-900">{tItem.status || 'Pending'}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Priority</div>
                          <div className="text-xs font-bold text-gray-900">{tItem.priority || 'Medium'}</div>
                        </div>
                      </div>
                      {(tItem.assignedToName || tItem.dueDate) && (
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200/70">
                          {tItem.assignedToName && (
                            <div>
                              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Assigned To</div>
                              <div className="text-xs font-semibold text-gray-800 truncate">{tItem.assignedToName}</div>
                            </div>
                          )}
                          {tItem.dueDate && (
                            <div>
                              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Due Date</div>
                              <div className="text-xs font-semibold text-gray-800">{formatDate(tItem.dueDate)}</div>
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          navigate('/staff-tasks', {
                            state: {
                              selectedTaskId: tItem.taskId,
                              from: accId ? `/accounts/${accId}` : '/accounts',
                              tab: 'Stakeholders'
                            }
                          });
                        }}
                        className="w-full py-2 bg-white hover:bg-blue-50 border border-blue-200 text-blue-900 font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        View in Staff Tasks
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {existingTaskList.length > 0 && (
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs">
                    <span className="text-slate-600 font-medium">
                      Creating another task ({existingTaskList.length} active)
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingAnother(false)}
                      className="font-bold text-blue-900 hover:underline cursor-pointer"
                    >
                      View Created
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">Task Title <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => {
                      userEditedRef.current.title = true;
                      setTaskTitle(e.target.value);
                    }}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">Description <span className="text-red-500">*</span></label>
                  <textarea
                    value={taskDescription}
                    onChange={(e) => {
                      userEditedRef.current.description = true;
                      setTaskDescription(e.target.value);
                    }}
                    onBlur={handleDescriptionBlur}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 resize-none h-28 leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Assign to <span className="text-red-500">*</span></label>
                    <div className="relative" ref={assignRef}>
                      <div
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 flex items-center gap-2 cursor-text"
                        onClick={() => { setAssignDropdownOpen(true); }}
                      >
                        {assignedStaff ? (
                          <>
                            <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-900 flex items-center justify-center text-[10px] font-bold shrink-0">
                              {(assignedStaff.name || assignedStaff.displayName || '?').substring(0, 2).toUpperCase()}
                            </div>
                            <span className="flex-1 truncate">{assignedStaff.name || assignedStaff.displayName}</span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setAssignedStaff(null); setAssignSearch(''); }}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <input
                            type="text"
                            value={assignSearch}
                            onChange={(e) => { setAssignSearch(e.target.value); setAssignDropdownOpen(true); }}
                            onFocus={() => setAssignDropdownOpen(true)}
                            placeholder="@name to assign..."
                            className="flex-1 outline-none bg-transparent text-sm placeholder-gray-400 text-gray-900"
                          />
                        )}
                      </div>

                      {assignDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                          {filteredStaff.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-gray-400 text-center">No employees found</div>
                          ) : (
                            filteredStaff.map((s) => (
                              <div
                                key={s.uid || s.id || s.name}
                                className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 cursor-pointer transition-colors"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setAssignedStaff(s);
                                  setAssignSearch('');
                                  setAssignDropdownOpen(false);
                                }}
                              >
                                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-900 flex items-center justify-center text-xs font-bold shrink-0">
                                  {(s.name || s.displayName || '?').substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{s.name || s.displayName}</p>
                                  <p className="text-xs text-gray-500">{s.role || s.jobTitle || 'Employee'}</p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Due Date <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type="date"
                        min={new Date().toISOString().split('T')[0]}
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-lg pl-3 pr-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Priority</label>
                    <div className="relative">
                      <select
                        value={priority}
                        onChange={(e) => {
                          userEditedRef.current.priority = true;
                          setPriority(e.target.value);
                        }}
                        className={`w-full bg-white border border-gray-300 rounded-lg pl-8 pr-8 py-2 text-sm font-semibold focus:outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 appearance-none ${
                          priority === 'High' ? 'text-red-600' : priority === 'Low' ? 'text-green-600' : 'text-orange-600'
                        }`}
                      >
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                      <span className={`absolute left-3 top-1/2 -translate-y-1/2 font-bold ${
                        priority === 'High' ? 'text-red-500' : priority === 'Low' ? 'text-green-500' : 'text-orange-500'
                      }`}>
                        {priority === 'High' ? '↑' : priority === 'Low' ? '↓' : '→'}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">Related To</label>
                    <div className="relative">
                      <div className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-600 cursor-not-allowed truncate">
                        {account?.companyName || ''}
                      </div>
                      <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h16M4 14h16M4 18h16M4 6h16M4 22h16"/></svg>
                    </div>
                  </div>
                </div>

                {activeBrief && Array.isArray(activeBrief.suggestedSteps) && activeBrief.suggestedSteps.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-gray-700">Suggested Next Steps</label>
                      {activeBrief.source === 'ai+db' && (
                        <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                          AI + DB Tailored
                        </span>
                      )}
                    </div>
                    <div className="bg-blue-50/50 rounded-xl p-4 text-xs text-blue-900/90 leading-relaxed border border-blue-100">
                      <ul className="list-disc pl-4 space-y-1.5">
                        {activeBrief.suggestedSteps.map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-white relative">
            {/* Activity Toast */}
            {activityToast && (
              <div className="absolute left-4 bottom-full mb-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl z-50 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
                <CheckSquare className="w-4 h-4 text-green-400" />
                <p className="text-xs font-semibold leading-relaxed">{activityToast}</p>
              </div>
            )}

            {showTaskForm ? (
              <>
                <button
                  onClick={() => {
                    if (existingTaskList.length > 0) {
                      setIsCreatingAnother(false);
                    } else {
                      setSelectedContact(null);
                    }
                  }}
                  disabled={isSubmitting}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateTask}
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-blue-900 hover:bg-blue-950 text-[#ffffff] rounded-lg text-sm font-bold transition-colors flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                  style={{ color: '#ffffff' }}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin text-[#ffffff]" /> : <CheckSquare className="w-4 h-4 text-[#ffffff]" />} Create Task
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setIsCreatingAnother(false);
                    setSelectedContact(null);
                  }}
                  className="px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={handleStartAnotherTask}
                  className="px-5 py-2.5 bg-blue-900 hover:bg-blue-950 text-[#ffffff] rounded-lg text-sm font-bold transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
                  style={{ color: '#ffffff' }}
                >
                  <Plus className="w-4 h-4 text-[#ffffff]" /> Create Another Task
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Hover Tooltip for Key Contact Trend Status */}
      {hoveredTrend && (() => {
        const tooltipWidth = 296;
        const badgeCenterX = hoveredTrend.rect.left + hoveredTrend.rect.width / 2;
        const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
        const clampedCenterX = Math.min(
          Math.max(badgeCenterX, tooltipWidth / 2 + 16),
          viewportW - tooltipWidth / 2 - 16
        );
        const placeAbove = hoveredTrend.rect.top > 200;
        const topPos = placeAbove
          ? hoveredTrend.rect.top - 10
          : hoveredTrend.rect.bottom + 10;
        const arrowLeft = Math.min(
          Math.max(badgeCenterX - (clampedCenterX - tooltipWidth / 2), 18),
          tooltipWidth - 18
        );

        const statusDotClass =
          hoveredTrend.trend === 'Improving'
            ? 'bg-emerald-500'
            : hoveredTrend.trend === 'Declining'
              ? 'bg-rose-500'
              : 'bg-slate-400';
        const statusTitleClass =
          hoveredTrend.trend === 'Improving'
            ? 'text-emerald-700'
            : hoveredTrend.trend === 'Declining'
              ? 'text-rose-600'
              : 'text-slate-600';
        const arrowSymbol =
          hoveredTrend.trend === 'Improving' ? '↑' : hoveredTrend.trend === 'Declining' ? '↓' : '→';

        return (
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left: `${clampedCenterX}px`,
              top: `${topPos}px`,
              width: `${tooltipWidth}px`,
              transform: placeAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
              zIndex: 100005
            }}
            className="pointer-events-none bg-white border border-slate-200 rounded-xl shadow-[0_10px_28px_-4px_rgba(15,23,42,0.16)] px-3.5 py-2.5 text-left"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass}`} />
              <span className={`text-[11px] font-bold ${statusTitleClass}`}>
                Why {arrowSymbol} {hoveredTrend.trend}?
              </span>
            </div>
            <div className="text-[11px] font-semibold text-slate-700 mb-1.5 truncate">
              {hoveredTrend.contactName}
              {hoveredTrend.designation ? ` · ${hoveredTrend.designation}` : ''}
              {hoveredTrend.accountName ? ` (${hoveredTrend.accountName})` : ''}
            </div>
            <p className="text-[11px] font-normal text-[#475569] leading-snug">
              {hoveredTrend.reason}
            </p>
            {hoveredTrend.detail && (
              <p className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10.5px] font-normal text-[#64748B] leading-snug">
                {hoveredTrend.detail}
              </p>
            )}
            <span
              style={{ left: `${arrowLeft}px` }}
              className={`block absolute -translate-x-1/2 w-2.5 h-2.5 bg-white rotate-45 ${
                placeAbove
                  ? 'top-full -mt-[5px] border-r border-b border-slate-200'
                  : 'bottom-full -mb-[5px] border-l border-t border-slate-200'
              }`}
            />
          </div>
        );
      })()}

      {/* Hover Tooltip for Key Contact Engagement Status */}
      {hoveredEngagement && (() => {
        const tooltipWidth = 288;
        const badgeCenterX = hoveredEngagement.rect.left + hoveredEngagement.rect.width / 2;
        const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
        const clampedCenterX = Math.min(
          Math.max(badgeCenterX, tooltipWidth / 2 + 16),
          viewportW - tooltipWidth / 2 - 16
        );
        const placeAbove = hoveredEngagement.rect.top > 200;
        const topPos = placeAbove
          ? hoveredEngagement.rect.top - 10
          : hoveredEngagement.rect.bottom + 10;
        const arrowLeft = Math.min(
          Math.max(badgeCenterX - (clampedCenterX - tooltipWidth / 2), 18),
          tooltipWidth - 18
        );

        const statusDotClass =
          hoveredEngagement.engagement === 'Active'
            ? 'bg-emerald-500'
            : hoveredEngagement.engagement === 'Needs Attention'
              ? 'bg-orange-500'
              : 'bg-red-500';
        const statusTitleClass =
          hoveredEngagement.engagement === 'Active'
            ? 'text-emerald-700'
            : hoveredEngagement.engagement === 'Needs Attention'
              ? 'text-orange-600'
              : 'text-red-600';

        return (
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left: `${clampedCenterX}px`,
              top: `${topPos}px`,
              width: `${tooltipWidth}px`,
              transform: placeAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
              zIndex: 100005
            }}
            className="pointer-events-none bg-white border border-slate-200 rounded-xl shadow-[0_10px_28px_-4px_rgba(15,23,42,0.16)] px-3.5 py-2.5 text-left"
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass}`} />
              <span className={`text-[11px] font-bold ${statusTitleClass}`}>
                Why {hoveredEngagement.engagement}?
              </span>
            </div>
            <div className="text-[11px] font-semibold text-slate-700 mb-1.5 truncate">
              {hoveredEngagement.contactName}
              {hoveredEngagement.designation ? ` · ${hoveredEngagement.designation}` : ''}
              {hoveredEngagement.accountName ? ` (${hoveredEngagement.accountName})` : ''}
            </div>
            <p className="text-[11px] font-normal text-[#475569] leading-snug">
              {hoveredEngagement.reason}
            </p>
            {hoveredEngagement.detail && (
              <p className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10.5px] font-normal text-[#64748B] leading-snug">
                {hoveredEngagement.detail}
              </p>
            )}
            <span
              style={{ left: `${arrowLeft}px` }}
              className={`block absolute -translate-x-1/2 w-2.5 h-2.5 bg-white rotate-45 ${
                placeAbove
                  ? 'top-full -mt-[5px] border-r border-b border-slate-200'
                  : 'bottom-full -mb-[5px] border-l border-t border-slate-200'
              }`}
            />
          </div>
        );
      })()}
    </div>
  );
}
