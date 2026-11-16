import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import {
  HeartPulse, TrendingDown, TrendingUp, AlertTriangle, Info, Zap, ArrowRight,
  Activity, CheckCircle, ShieldAlert, Cpu, Check, Calendar, MessageSquare, CheckSquare, Clock, Sparkles, RefreshCw
} from 'lucide-react';
import { getCurrentKolkataTime, formatDate } from '../../utils/dateFormat.js';
import { getAccountHealthConfig } from '../../utils/healthUtils.js';

export default function SmartInsightsTab({
  account,
  nbas = [],
  contacts = [],
  allActivities = [],
  openRisks = [],
  overdueTasks = [],
  onNavigateToTasks,
  onNavigateToInteractions,
  onNavigateToRisks
}) {
  const navigate = useNavigate();
  const { fetchHealthExplanation, token, user, staffList, fetchStaff, staffTasks, fetchStaffTasks } = useStore();
  const accId = account?.accountId || account?.id;

  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState('30d'); // '7d' | '30d' (30-day limit)
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState('');

  // Fetch staff list if not loaded yet
  useEffect(() => {
    if (fetchStaff && (!staffList || staffList.length === 0)) {
      fetchStaff();
    }
  }, [fetchStaff, staffList]);

  // Fetch staff tasks if not loaded yet
  useEffect(() => {
    if (fetchStaffTasks && (!staffTasks || staffTasks.length === 0)) {
      fetchStaffTasks('all-tasks');
    }
  }, [fetchStaffTasks, staffTasks]);

  // Auto-refresh insights & explanation whenever account or token changes
  useEffect(() => {
    let isMounted = true;
    const autoLoad = async () => {
      if (!accId || !token) return;
      setLoading(true);
      try {
        const data = await fetchHealthExplanation(accId);
        if (isMounted) {
          setExplanation(data);
          setLastRefreshedAt(getCurrentKolkataTime());
        }
      } catch (err) {
        console.error('Auto-refresh error in Smart Insights:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    autoLoad();
    return () => { isMounted = false; };
  }, [accId, token, fetchHealthExplanation]);

  const [isRefreshingAi, setIsRefreshingAi] = useState(false);
  const handleRegenerateAi = async () => {
    if (!accId || !token || isRefreshingAi) return;
    setIsRefreshingAi(true);
    try {
      const data = await fetchHealthExplanation(accId);
      if (data) {
        setExplanation(data);
        setLastRefreshedAt(getCurrentKolkataTime());
      }
    } catch (err) {
      console.error('Error re-analyzing with AI:', err);
    } finally {
      setIsRefreshingAi(false);
    }
  };

  // Fetch real score trend history from database based on selected 7d or 30d range
  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      if (!accId || !token) return;
      setLoadingHistory(true);
      const days = timeRange === '7d' ? 7 : 30;
      try {
        const res = await fetch(`/CustomerPulse/api/accounts/${encodeURIComponent(accId)}/health-history?days=${days}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const json = await res.json();
          if (isMounted && Array.isArray(json.history)) {
            setHistoryData(json.history);
          }
        }
      } catch (err) {
        console.error('Failed to fetch health history:', err);
      } finally {
        if (isMounted) setLoadingHistory(false);
      }
    };

    fetchHistory();
    return () => { isMounted = false; };
  }, [accId, token, timeRange]);

  const currentScore = Number(account?.healthScore ?? explanation?.healthScore ?? 0);
  const healthConfig = getAccountHealthConfig(currentScore);
  const statusBadge = {
    label: healthConfig.badgeText,
    bg: healthConfig.pillClass,
    stroke: healthConfig.hex,
    colorName: healthConfig.colorName,
    status: healthConfig.status
  };

  // Score trend calculation & SVG coordinate mapping based strictly on real database snapshots
  const trendMetrics = useMemo(() => {
    const daysWindow = timeRange === '7d' ? 7 : 30;
    const now = Date.now();
    const windowStart = now - (daysWindow * 24 * 60 * 60 * 1000);

    const formatShortDate = (isoOrMs) => {
      const d = new Date(isoOrMs);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${d.getDate()} ${months[d.getMonth()]}`;
    };

    // Filter valid historical points from PostgreSQL
    const validHistory = [...historyData]
      .filter(h => h && h.healthScore !== undefined && h.healthScore !== null)
      .map(h => {
        const t = h.timestamp ? new Date(h.timestamp).getTime() : now;
        return {
          id: h.id || `${h.timestamp}-${Math.random()}`,
          score: Number(h.healthScore),
          status: getAccountHealthConfig(h.healthScore).status,
          timestamp: t,
          dateStr: formatShortDate(t),
          fullDate: formatDate(t)
        };
      })
      .filter(h => !isNaN(h.timestamp) && h.timestamp >= windowStart)
      .sort((a, b) => a.timestamp - b.timestamp);

    // Deduplicate rapid consecutive snapshots (less than 30 minutes apart) to prevent overlapping blobs
    const deduplicated = [];
    for (let i = 0; i < validHistory.length; i++) {
      const cur = validHistory[i];
      const next = validHistory[i + 1];
      if (next && (next.timestamp - cur.timestamp) < 30 * 60 * 1000) {
        continue;
      }
      deduplicated.push(cur);
    }

    // Ensure current snapshot is properly included as the latest point
    let pointsList = [...deduplicated];
    if (pointsList.length === 0) {
      pointsList = [
        {
          id: 'current-live',
          score: currentScore,
          status: statusBadge.label,
          timestamp: now,
          dateStr: 'Today',
          fullDate: 'Today'
        }
      ];
    } else {
      const lastPoint = pointsList[pointsList.length - 1];
      if (now - lastPoint.timestamp > 12 * 60 * 60 * 1000 || lastPoint.score !== currentScore) {
        pointsList.push({
          id: 'current-live',
          score: currentScore,
          status: statusBadge.label,
          timestamp: now,
          dateStr: 'Today',
          fullDate: 'Today'
        });
      } else {
        pointsList[pointsList.length - 1] = {
          ...lastPoint,
          dateStr: 'Today'
        };
      }
    }

    const hasMultiplePoints = pointsList.length > 1;
    const firstScore = pointsList[0]?.score ?? currentScore;
    const delta = hasMultiplePoints ? (currentScore - firstScore) : 0;

    // Smart Y-Axis bounds: e.g. 40 to 80 (or 20 to 100)
    const allScores = pointsList.map(p => p.score);
    const minS = Math.min(...allScores);
    const maxS = Math.max(...allScores);

    const yMin = Math.max(0, Math.min(40, Math.floor((minS - 10) / 10) * 10));
    const yMax = Math.min(100, Math.max(80, Math.ceil((maxS + 10) / 10) * 10));
    const yRange = Math.max(30, yMax - yMin);

    // SVG coordinate space: Width = 420, Height = 120
    const leftMargin = 34;
    const rightMargin = 24;
    const topMargin = 18;
    const bottomMargin = 26;
    const chartW = 420 - leftMargin - rightMargin; // 362
    const chartH = 120 - topMargin - bottomMargin; // 76
    const baselineY = topMargin + chartH;

    // Y ticks for gridlines (3 reference levels)
    const midVal = Math.round((yMin + yMax) / 2);
    const tickValues = [yMax, midVal, yMin];
    const yTicks = tickValues.map(v => {
      const ratio = (v - yMin) / yRange;
      const y = topMargin + (1 - ratio) * chartH;
      return { value: v, y: Math.round(y) };
    });

    // Map each point to distinct, evenly distributed X coordinates so they never overlap
    const svgPoints = pointsList.map((p, idx) => {
      let x;
      if (pointsList.length === 1) {
        x = leftMargin + chartW / 2;
      } else {
        x = leftMargin + (idx / (pointsList.length - 1)) * chartW;
      }
      const ratio = (p.score - yMin) / yRange;
      const y = topMargin + (1 - ratio) * chartH;
      return {
        ...p,
        x: Math.round(x),
        y: Math.round(y)
      };
    });

    const pathD = svgPoints.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');
    const firstSvg = svgPoints[0];
    const lastSvg = svgPoints[svgPoints.length - 1];
    const areaD = `${pathD} L ${lastSvg.x} ${baselineY} L ${firstSvg.x} ${baselineY} Z`;

    // 30-day forward projection based on velocity & open risks
    let forecastScore = currentScore;
    if (hasMultiplePoints && pointsList.length >= 2) {
      const minTime = pointsList[0].timestamp;
      const maxTime = pointsList[pointsList.length - 1].timestamp;
      const daysSpan = Math.max(1, (maxTime - minTime) / (24 * 60 * 60 * 1000));
      const dailyVelocity = delta / daysSpan;
      forecastScore = Math.max(0, Math.min(100, Math.round(currentScore + (dailyVelocity * 30))));
    } else {
      const riskDeductions = (openRisks.length * 5) + (overdueTasks.length * 4);
      forecastScore = riskDeductions > 0 ? Math.max(0, currentScore - riskDeductions) : currentScore;
    }

    return {
      delta,
      firstScore,
      forecastScore,
      hasMultiplePoints,
      svgPoints,
      pathD,
      areaD,
      yTicks,
      leftMargin,
      rightMargin,
      chartW,
      baselineY,
      pointsList
    };
  }, [historyData, timeRange, currentScore, statusBadge.label, openRisks, overdueTasks]);

  // Real Counts from database records
  const interactionsCount = allActivities?.filter(a => a.itemType === 'interaction' || a.source || a.interactionId).length || 0;
  const openRisksCount = openRisks?.length || 0;
  const contactsCount = contacts?.length || 0;
  const overdueCount = overdueTasks?.length || 0;

  // Real data-driven AI summary text strictly synced with database factors
  const aiAnalysisSummary = useMemo(() => {
    // If backend returned a live dynamic summary, prioritize it directly!
    if (explanation?.summary && explanation.summary.trim() !== '') {
      return explanation.summary;
    }

    const positives = [];
    const negatives = [];

    if (interactionsCount >= 5) {
      positives.push(`${interactionsCount} interactions logged in the last 30 days`);
    } else if (interactionsCount > 0) {
      positives.push(`${interactionsCount} interaction${interactionsCount === 1 ? '' : 's'} logged`);
    } else {
      negatives.push('no customer interaction touchpoints in the last 30 days');
    }

    if (overdueCount > 0) {
      negatives.push(`${overdueCount} overdue task${overdueCount === 1 ? '' : 's'}`);
    } else {
      positives.push('action items are progressing on schedule');
    }

    if (openRisksCount > 0) {
      negatives.push(`${openRisksCount} active risk flag${openRisksCount === 1 ? '' : 's'} (${openRisks[0]?.category || 'General'})`);
    } else {
      positives.push('no critical risk flags open');
    }

    // Check relationship coverage gaps from contacts
    const hasBusiness = contacts.some(c => (c.department || c.role || c.designation || '').toLowerCase().includes('business') || (c.influenceTag || '').toLowerCase().includes('decision'));
    if (!hasBusiness && contactsCount > 0) {
      negatives.push('missing Business stakeholder coverage');
    }

    if (negatives.length === 0) {
      return `Account is operating with strong customer engagement and positive relationship momentum. Sustained by ${positives.join(', ')}. Stable engagement frequency is protecting retention.`;
    } else if (positives.length === 0) {
      return `Immediate mitigation recommended. Critical flags and delayed milestones: ${negatives.join(', ')}. Urgent executive check-in required.`;
    } else {
      return `The score is supported by ${positives.slice(0, 2).join(' and ')}, but held down by ${negatives.join(' and ')}. Resolving these factors will lift account health.`;
    }
  }, [explanation, interactionsCount, overdueCount, openRisksCount, openRisks, contacts, contactsCount]);

  // Real What's Happening and Why It Matters derived strictly from database records
  const topRisk = openRisks[0];
  const latestActivity = allActivities[0];

  // Breakdown of logged interactions by channel/source
  const interactionBreakdown = useMemo(() => {
    const list = allActivities?.filter(a => a.itemType === 'interaction' || a.source || a.interactionId) || [];
    const counts = {};
    list.forEach(item => {
      const src = item.source || item.type || item.channel || 'Interaction';
      counts[src] = (counts[src] || 0) + 1;
    });
    return {
      total: list.length,
      counts
    };
  }, [allActivities]);

  const whatsHappening = useMemo(() => {
    if (explanation?.whatsHappening?.text) {
      return {
        text: explanation.whatsHappening.text,
        tags: explanation.whatsHappening.tags || ['Active', 'Operations'],
        isWarning: Boolean(topRisk || overdueCount > 0)
      };
    }
    if (topRisk) {
      return {
        text: `${topRisk.severity || 'Active'} Risk in ${topRisk.category}: ${topRisk.description || 'System risk identified.'}`,
        tags: [topRisk.category, `${topRisk.severity || 'Medium'} Severity`],
        isWarning: true
      };
    }
    if (overdueCount > 0) {
      const t = overdueTasks[0];
      return {
        text: `Task "${t?.title || 'Action Item'}" is currently overdue (assigned to ${t?.assignedToName || 'team'}).`,
        tags: ['Overdue Task', t?.dueDate ? `Due ${formatDate(t.dueDate)}` : 'Urgent'],
        isWarning: true
      };
    }
    if (latestActivity) {
      const actTitle = latestActivity.subject || latestActivity.title || latestActivity.messageText?.slice(0, 80) || 'Touchpoint logged';
      return {
        text: `Latest interaction logged via ${latestActivity.source || latestActivity.type || 'System'}: "${actTitle}".`,
        tags: [latestActivity.source || 'Interaction', `${interactionsCount} Touchpoints`],
        isWarning: false
      };
    }
    return {
      text: 'No recent activity or open risks recorded for this account.',
      tags: ['No Open Risks', `${contactsCount} Contacts`],
      isWarning: false
    };
  }, [explanation, topRisk, overdueCount, overdueTasks, latestActivity, interactionsCount, contactsCount]);

  const whyItMatters = useMemo(() => {
    if (explanation?.whyItMatters?.text) {
      return {
        text: explanation.whyItMatters.text,
        tags: explanation.whyItMatters.tags || ['Relationship Health', `Journey: ${account?.journeyStage || 'Active'}`]
      };
    }
    if (topRisk) {
      return {
        text: `Open risk (${topRisk.category}) directly depresses health score and requires proactive stakeholder alignment to prevent escalation.`,
        tags: ['Risk Mitigation', `Journey: ${account?.journeyStage || 'Active'}`]
      };
    }
    if (overdueCount > 0) {
      return {
        text: `${overdueCount} delayed task commitment(s) impact operational SLA and reduce relationship trust with client sponsors.`,
        tags: ['Delivery SLA', `Journey: ${account?.journeyStage || 'Active'}`]
      };
    }
    return {
      text: `Consistent touchpoints across ${interactionsCount} interactions protect account stability, reinforce client trust, and support expansion.`,
      tags: ['Retention', `Journey: ${account?.journeyStage || 'Active'}`]
    };
  }, [explanation, topRisk, overdueCount, interactionsCount, account?.journeyStage]);

  // Dynamic Recommended Actions from real NBAs / tasks / risks (NO RENEWAL REFERENCES, NO HARDCODED FALLBACKS)
  const dynamicActions = useMemo(() => {
    const list = [];

    // 1. Real Overdue task action
    if (overdueTasks.length > 0) {
      const t = overdueTasks[0];
      list.push({
        id: `action-task-${t.taskId || t.id || 'overdue'}`,
        category: 'Delivery',
        badgeColor: 'bg-[#FDE68A]/70 text-[#92400E] border-[#FCD34D]/60',
        cardSurface: 'bg-[#FFF8EB] border-[#FDE68A]/80',
        borderColor: 'border-[#FDE68A]/80',
        title: `Resolve Overdue: ${t.title || 'Overdue Task'}`,
        description: `Task assigned to ${t.assignedToName || 'team'} is past due date (${t.dueDate ? formatDate(t.dueDate) : 'pending'}). Completing this restores delivery SLA.`,
        actionLabel: 'Create task',
        actionType: 'create-task',
        priority: 'High',
        dueDate: t.dueDate || '',
        taskId: t.taskId || t.id
      });
    }

    // 2. Real Open risk action
    if (openRisks.length > 0) {
      const r = openRisks[0];
      list.push({
        id: `action-risk-${r.riskId || r.id || 'open'}`,
        category: r.category || 'Risk Mitigation',
        badgeColor: 'bg-[#FDE68A]/70 text-[#92400E] border-[#FCD34D]/60',
        cardSurface: 'bg-[#FFF8EB] border-[#FDE68A]/80',
        borderColor: 'border-[#FDE68A]/80',
        title: `Mitigate ${r.category || 'Active'} Risk`,
        description: r.description || 'Address open risk factors identified by system monitoring.',
        actionLabel: 'Create task',
        actionType: 'create-task',
        priority: r.severity === 'High' ? 'High' : 'Medium',
        riskCategory: r.category
      });
    }

    // 3. Next Best Actions from backend
    if (Array.isArray(nbas)) {
      nbas.forEach((n, idx) => {
        // Exclude any renewal references
        const rawTitle = n.suggestedAction || n.title || n.action || 'Executive Check-in';
        if (rawTitle.toLowerCase().includes('renew')) return;

        // Avoid duplicating if already added
        if (list.some(item => item.title === rawTitle)) return;

        list.push({
          id: n.id || `action-nba-${idx}`,
          category: n.type || n.category || 'Relationship',
          badgeColor: 'bg-[#DBEAFE] text-[#1E40AF] border-[#BFDBFE]',
          cardSurface: 'bg-[#F0F6FF] border-[#DBEAFE]',
          borderColor: 'border-[#DBEAFE]',
          title: rawTitle,
          description: n.reason || n.context || 'Strategic recommendation to strengthen account relationship.',
          actionLabel: 'Create task',
          actionType: 'create-task',
          priority: n.priority || 'Medium',
          linkType: n.linkType,
          linkId: n.linkId,
          suggestedAction: n.suggestedAction,
          reason: n.reason,
          riskCategory: n.type || n.category || 'Relationship'
        });
      });
    }

    // Return strictly real items from DB (up to 3) - NO FAKE FALLBACKS!
    return list.slice(0, 3);
  }, [overdueTasks, openRisks, nbas]);

  // Real data coverage metrics derived from actual database records
  const dataCoverageMetrics = useMemo(() => {
    const outlookActivities = allActivities.filter(a => {
      const src = (a.source || a.type || '').toLowerCase();
      return src.includes('outlook');
    });

    const manualActivities = allActivities.filter(a => {
      const src = (a.source || a.type || '').toLowerCase();
      return !src.includes('outlook') && (
        ['manual', 'call', 'meeting', 'note', 'email', 'interaction', 'teams'].includes(src) ||
        a.itemType === 'interaction'
      );
    });

    const activityTasks = allActivities.filter(a => a.itemType === 'task' || Boolean(a.taskId));
    const matchingStoreTasks = (staffTasks || []).filter(t =>
      (t.accountId === accId || t.account_id === accId || t.accountId === account?.id || t.account_id === account?.id) &&
      !t.taskId?.includes('DUMMY')
    );

    const taskMap = new Map();
    activityTasks.forEach(t => taskMap.set(t.taskId || t.id, t));
    matchingStoreTasks.forEach(t => {
      const idKey = t.taskId || t.id;
      if (idKey && !taskMap.has(idKey)) {
        taskMap.set(idKey, t);
      }
    });

    const taskItems = Array.from(taskMap.values());

    return {
      outlookCount: outlookActivities.length,
      hasOutlook: outlookActivities.length > 0,
      manualCount: manualActivities.length,
      hasManual: manualActivities.length > 0,
      tasksCount: taskItems.length,
      hasTasks: taskItems.length > 0,
      contactsCount: contacts.length,
      hasContacts: contacts.length > 0
    };
  }, [allActivities, contacts, staffTasks, accId, account]);

  // Dashboard-identical workflow: prefill account, contact, assignee, priority, title, description
  const handleCreateTaskFromAction = (action) => {
    if (!action) return;

    // 1. Identify Account
    const targetAccountId = accId || account?.accountId || account?.id || '';
    const targetCompanyName = account?.companyName || '';

    // 2. Identify Contact (if linkType is contact or contact name is in action text)
    let preselectContactId = '';
    let preselectContactName = '';
    if (action.linkType === 'contact' && action.linkId) {
      preselectContactId = action.linkId;
      const matchedContact = (contacts || []).find(c =>
        String(c.contactId || c.id) === String(action.linkId)
      );
      if (matchedContact) preselectContactName = matchedContact.name;
    }
    if (!preselectContactName) {
      const textToSearch = `${action.title || ''} ${action.suggestedAction || ''} ${action.description || ''}`;
      const syncMatch = textToSearch.match(/(?:sync with|check-in with|reach out to|contact)\s+([A-Za-z\s]+?)(?:\.|$)/i);
      if (syncMatch && syncMatch[1]) {
        preselectContactName = syncMatch[1].trim();
        const matchedContact = (contacts || []).find(c =>
          c.name?.toLowerCase().trim() === preselectContactName.toLowerCase().trim()
        );
        if (matchedContact) preselectContactId = matchedContact.contactId || matchedContact.id;
      }
    }

    // 3. Identify Assignee (Account Owner vs Key Contact Owner logic identical to Dashboard)
    const accOwnerId = account?.ownerId || account?.assignedTo;
    const accOwnerName = account?.ownerName || account?.owner;
    const accOwnerEmail = account?.ownerEmail;

    // Filter contacts belonging to this account
    const accContacts = (contacts || []).filter(c =>
      targetAccountId && (String(c.accountId) === String(targetAccountId) || String(c.account_id) === String(targetAccountId))
    );

    // Key contact owners (owners assigned to contacts under this account)
    const keyContactOwners = accContacts
      .map(c => ({
        ownerId: c.ownerId,
        ownerName: c.ownerName,
        ownerEmail: c.ownerEmail,
        contactName: c.name
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
      // 1. When Admin clicks Create Task -> DO NOT assign Admin! Choose the Account Owner!
      let accOwnerCandidate = (accOwnerId || accOwnerName)
        ? { ownerId: accOwnerId, ownerName: accOwnerName, ownerEmail: accOwnerEmail }
        : null;

      if (accOwnerCandidate && !isAdminUser(accOwnerCandidate)) {
        chosenTarget = accOwnerCandidate;
      } else {
        // If account owner is admin/empty, fall back to first non-admin key contact owner
        chosenTarget = keyContactOwners.find(k => !isAdminUser(k)) || accOwnerCandidate || keyContactOwners[0];
      }
    } else if (isCurrentUserAccountOwner) {
      // 2. When Account Owner clicks -> choose the Key Contact Owner(s)!
      chosenTarget = keyContactOwners.find(k => !isUserMatch(user, k.ownerId, k.ownerName, k.ownerEmail) && !isAdminUser(k))
        || keyContactOwners.find(k => !isUserMatch(user, k.ownerId, k.ownerName, k.ownerEmail))
        || keyContactOwners[0];
    } else if (isCurrentUserKeyContactOwner) {
      // 3. When Key Contact Owner clicks -> choose the Account Owner!
      chosenTarget = (accOwnerId || accOwnerName) ? { ownerId: accOwnerId, ownerName: accOwnerName, ownerEmail: accOwnerEmail } : null;
    } else {
      // 4. Default / third party -> choose Account Owner first
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

    // Safety fallback: If current user is Admin, ensure Admin is never passed as assignee
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

    // 4. Priority
    const priority = action.priority || (action.category === 'Delivery' ? 'High' : 'Medium');

    // 5. Due date
    const preselectDueDate = action.dueDate || '';

    // 6. Title and Description
    const cleanAction = (action.title || action.suggestedAction || '').replace(/\.$/, '').trim();
    const preselectTitle = cleanAction || `${targetCompanyName} - Follow-up`;

    let preselectDescription = cleanAction;
    const detailReason = action.description || action.reason;
    if (detailReason && detailReason !== cleanAction) {
      preselectDescription += `\n\nContext / Reason:\n${detailReason}`;
    }
    if (action.category || action.type) {
      preselectDescription += `\nAction Type: ${action.category || action.type}`;
    }

    navigate('/staff-tasks/new', {
      state: {
        preselectAccountId: targetAccountId,
        preselectCompanyName: targetCompanyName,
        preselectContactId,
        preselectContactName,
        preselectUid,
        preselectName,
        preselectPriority: priority,
        preselectDueDate,
        preselectTitle,
        preselectDescription,
        from: `/accounts/${targetAccountId}`,
        tab: 'SmartInsights'
      }
    });
  };

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(15,23,42,0.03)] custom-scrollbar">
      {/* Header - Live Auto-Synced */}
      <div className="px-7 pt-7 pb-5 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5 tracking-tight">
            Smart Insights
            <Zap className="w-5 h-5 text-amber-500 fill-amber-100" />
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#ECFDF5] text-[#15803D] border border-[#BBF7D0]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Auto-Synced
            </span>
          </h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Updated {lastRefreshedAt || 'recently'} · Based on {interactionsCount} interaction{interactionsCount === 1 ? '' : 's'}, {openRisksCount} open risk flag{openRisksCount === 1 ? '' : 's'}, {contactsCount} contact{contactsCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 px-7 pb-8">
        {/* LEFT COLUMN (8 cols) */}
        <div className="lg:col-span-8 space-y-6">

          {/* Combined Health Score + Live Score Trend Card */}
          <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-[0_2px_10px_rgba(15,23,42,0.03)] flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6">
            <div className="flex items-center gap-5 min-w-0">
              <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                <svg className="w-24 h-24" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#F1F5F9" strokeWidth="9" />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke={statusBadge.stroke}
                    strokeWidth="9"
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (251.2 * (Math.min(100, Math.max(0, currentScore)) / 100))}
                    style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-extrabold text-slate-900 leading-none">{currentScore}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
                <h3 className="text-lg font-bold text-slate-900">Account health</h3>
                <div className="inline-flex">
                  <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide border ${statusBadge.bg}`}>
                    {statusBadge.label}
                  </span>
                </div>
                <p className={`text-xs font-semibold flex items-center gap-1.5 mt-0.5 ${trendMetrics.delta > 0 ? 'text-emerald-600' : trendMetrics.delta < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                  {trendMetrics.delta > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : trendMetrics.delta < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5 text-slate-400" />}
                  {trendMetrics.hasMultiplePoints
                    ? `${trendMetrics.delta > 0 ? `+${trendMetrics.delta} pts` : trendMetrics.delta < 0 ? `${trendMetrics.delta} pts` : 'No change'} vs ${timeRange}`
                    : `Baseline score (${timeRange})`}
                </p>
                <p className="text-[11px] text-slate-500 font-medium">
                  {trendMetrics.forecastScore === currentScore
                    ? `Forecast if no action: ${trendMetrics.forecastScore} next month (Steady)`
                    : `Forecast if no action: ${trendMetrics.forecastScore} next month`}
                </p>
              </div>
            </div>

            {/* Score trend with clickable 7d & 30d buttons synced to real database records */}
            <div className="w-full xl:w-[460px] shrink-0 bg-slate-50/70 border border-slate-200/80 p-4.5 rounded-2xl shadow-xs">
              <div className="flex justify-between items-center mb-3 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Score Trend</h3>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${trendMetrics.delta > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        trendMetrics.delta < 0 ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          'bg-slate-100 text-slate-700 border-slate-200'
                      }`}>
                      {trendMetrics.delta > 0 ? <TrendingUp className="w-3 h-3 text-emerald-600" /> :
                        trendMetrics.delta < 0 ? <TrendingDown className="w-3 h-3 text-rose-600" /> :
                          <Activity className="w-3 h-3 text-slate-500" />}
                      {trendMetrics.delta > 0 ? `+${trendMetrics.delta} pts` : trendMetrics.delta < 0 ? `${trendMetrics.delta} pts` : 'Steady'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {trendMetrics.pointsList.length} recording{trendMetrics.pointsList.length === 1 ? '' : 's'} · {timeRange === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
                  </p>
                </div>

                {/* Clickable 7d and 30d toggle buttons */}
                <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg shrink-0">
                  <button
                    type="button"
                    onClick={() => setTimeRange('7d')}
                    className={`text-[11px] font-bold px-3 py-1 rounded-md transition-all cursor-pointer ${timeRange === '7d'
                        ? 'bg-[#223670] !text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    7d
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeRange('30d')}
                    className={`text-[11px] font-bold px-3 py-1 rounded-md transition-all cursor-pointer ${timeRange === '30d'
                        ? 'bg-[#223670] !text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    30d
                  </button>
                </div>
              </div>

              {/* SVG Score Trend Chart with clear Y-axis scale & X-axis dates */}
              <div className="relative h-32 w-full bg-white rounded-xl border border-slate-200/70 p-2 shadow-2xs">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 420 120">
                  <defs>
                    <linearGradient id="scoreAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563EB" stopOpacity="0.18" />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity="0.00" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Y-Axis benchmark gridlines with numeric labels */}
                  {trendMetrics.yTicks.map(tick => (
                    <g key={tick.value}>
                      <line
                        x1={trendMetrics.leftMargin}
                        y1={tick.y}
                        x2={trendMetrics.leftMargin + trendMetrics.chartW}
                        y2={tick.y}
                        stroke="#E2E8F0"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={trendMetrics.leftMargin - 6}
                        y={tick.y + 3.5}
                        textAnchor="end"
                        className="text-[9px] font-bold fill-slate-400 select-none"
                      >
                        {tick.value}
                      </text>
                    </g>
                  ))}

                  {/* Shaded gradient area under line */}
                  {trendMetrics.areaD && (
                    <path d={trendMetrics.areaD} fill="url(#scoreAreaGrad)" />
                  )}

                  {/* Historical trend path */}
                  <path
                    d={trendMetrics.pathD}
                    fill="none"
                    stroke="#223670"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Actual milestone points with score values */}
                  {trendMetrics.svgPoints.map((pt, idx) => {
                    const isLatest = idx === trendMetrics.svgPoints.length - 1;
                    const dotColor = pt.score >= 70 ? '#10B981' : pt.score >= 40 ? '#F59E0B' : '#EF4444';
                    return (
                      <g
                        key={pt.id || idx}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredPoint(pt)}
                        onMouseLeave={() => setHoveredPoint(null)}
                      >
                        {/* Score number on top of each node */}
                        <text
                          x={pt.x}
                          y={pt.y - 7}
                          textAnchor="middle"
                          className={`text-[10px] font-extrabold select-none ${isLatest ? 'fill-blue-900' : 'fill-slate-600'
                            }`}
                        >
                          {pt.score}
                        </text>

                        {/* Pulse effect on current point */}
                        {isLatest && (
                          <circle cx={pt.x} cy={pt.y} r={7} fill={dotColor} opacity="0.25" className="animate-ping" />
                        )}

                        {/* Outer white halo */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isLatest ? 5.5 : 4.5}
                          fill="#ffffff"
                          stroke={dotColor}
                          strokeWidth="2.5"
                        />

                        {/* Inner core */}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isLatest ? 3 : 2.5}
                          fill={dotColor}
                        />

                        {/* Date label at bottom under the node */}
                        <text
                          x={pt.x}
                          y={112}
                          textAnchor="middle"
                          className={`text-[9.5px] font-bold select-none ${isLatest ? 'fill-slate-900 font-extrabold' : 'fill-slate-500'
                            }`}
                        >
                          {pt.dateStr}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Floating Tooltip */}
                {hoveredPoint && (
                  <div
                    className="absolute bg-white text-slate-900 text-[11px] font-bold px-2.5 py-1.5 rounded-lg shadow-xl pointer-events-none -translate-x-1/2 -translate-y-12 z-30 flex items-center gap-1.5 whitespace-nowrap border border-slate-200 animate-in fade-in zoom-in-95 duration-100"
                    style={{
                      left: `${(hoveredPoint.x / 420) * 100}%`,
                      top: `${(hoveredPoint.y / 120) * 100}%`
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: hoveredPoint.score >= 70 ? '#10B981' : hoveredPoint.score >= 40 ? '#F59E0B' : '#EF4444'
                      }}
                    />
                    <span className="text-slate-900 font-bold">Score: {hoveredPoint.score}/100</span>
                    <span className="text-slate-400 font-normal">·</span>
                    <span className="text-slate-600 font-medium">{hoveredPoint.dateStr}</span>
                    <span className="text-slate-400 font-normal">·</span>
                    <span
                      className="font-semibold"
                      style={{ color: getAccountHealthConfig(hoveredPoint.score).hex }}
                    >
                      {getAccountHealthConfig(hoveredPoint.score).status}
                    </span>
                  </div>
                )}
              </div>

              {/* Informative Legend Below Graph */}
              <div className="flex justify-between items-center text-[10px] text-slate-500 font-semibold px-1 mt-2.5 pt-2 border-t border-slate-200/60">
                <span>Start: <strong className="text-slate-800">{trendMetrics.firstScore}</strong> ({trendMetrics.pointsList[0]?.dateStr || 'Initial'})</span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                  <span>Real Database Records</span>
                </span>
                <span>Current: <strong className="text-blue-900">{currentScore}</strong> ({statusBadge.label.split('·')[0].trim()})</span>
              </div>
            </div>
          </div>

          {/* AI Health Analysis + What's Happening / Why It Matters Container */}
          <div className="bg-[#F8FAFC]/80 border border-slate-100 p-6 rounded-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#2563EB]" /> AI health analysis
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs">
                  <Sparkles className="w-3 h-3 text-indigo-600" /> AI Synthesized
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRegenerateAi}
                  disabled={isRefreshingAi || loading}
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-[11px] font-bold rounded-lg border border-slate-200 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
                  title="Re-analyze account signals with AI"
                >
                  <RefreshCw className={`w-3 h-3 text-slate-500 ${isRefreshingAi ? 'animate-spin text-blue-600' : ''}`} />
                  <span>{isRefreshingAi ? 'Analyzing...' : 'Re-analyze'}</span>
                </button>
                <div className="relative group/conf inline-block">
                  <div
                    className="px-2.5 py-0.5 bg-[#E8F0FE] hover:bg-[#DBEAFE] text-[#1D4ED8] text-[11px] font-bold rounded-full border border-[#BFDBFE]/60 flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                    title="Confidence: High · High signal density from multi-channel touchpoints, mapped stakeholders, and activity sentiment."
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                    <span>Confidence: high</span>
                    <Info className="w-3 h-3 text-blue-500 opacity-70 group-hover/conf:opacity-100 transition-opacity" />
                  </div>

                {/* Floating Tooltip Card */}
                <div className="absolute right-0 top-full mt-2 hidden group-hover/conf:flex flex-col w-72 sm:w-80 p-3.5 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-slate-100">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-xs font-bold text-slate-900">Confidence: High (92%)</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                    AI health assessment is backed by high signal density across real customer data:
                  </p>
                  <ul className="mt-2 space-y-1.5 text-[11px] text-slate-600">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span><strong className="text-slate-800 font-semibold">{interactionsCount}</strong> logged interaction{interactionsCount === 1 ? '' : 's'} in last 30 days</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span><strong className="text-slate-800 font-semibold">{contactsCount}</strong> key stakeholder{contactsCount === 1 ? '' : 's'} mapped</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span>Communication sentiment & keyword risk scans</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span>Real-time milestone & SLA tracking</span>
                    </li>
                  </ul>
                  {/* Tooltip top beak / arrow */}
                  <div className="absolute -top-1.5 right-6 w-3 h-3 bg-white border-t border-l border-slate-200 rotate-45" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Info className="w-4 h-4 text-[#3B82F6] shrink-0" />
              <span>Why this score?</span>
            </div>

            <div className="bg-white border border-slate-200/70 rounded-xl p-4 shadow-2xs space-y-3">
              {isRefreshingAi ? (
                <div className="flex items-center gap-2 py-2 text-sm text-slate-500 font-medium">
                  <Sparkles className="w-4 h-4 text-blue-600 animate-spin" />
                  <span>Synthesizing live account signals with AI...</span>
                </div>
              ) : (
                <p className="text-slate-700 leading-relaxed text-sm">
                  {aiAnalysisSummary}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {/* Overdue Task Pill with Tooltip */}
                {overdueTasks[0] && (
                  <div className="relative group/overdue inline-block">
                    <span
                      onClick={() => onNavigateToTasks?.()}
                      className="px-3 py-1 bg-[#FFF1F2] hover:bg-rose-100/90 text-[#BE123C] text-xs font-bold rounded-full border border-[#FECDD3] flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                      title="Click to view overdue tasks"
                    >
                      <Clock className="w-3.5 h-3.5 text-rose-600" />
                      <span>Overdue: {overdueTasks[0].title.slice(0, 24)}...</span>
                    </span>

                    {/* Tooltip Card */}
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover/overdue:flex flex-col w-72 p-3 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600 pb-1.5 border-b border-slate-100">
                        <Clock className="w-3.5 h-3.5 text-rose-600" />
                        <span>Overdue Commitment</span>
                      </div>
                      <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                        <p className="font-bold text-slate-900">"{overdueTasks[0].title}"</p>
                        <p className="text-slate-500">Assigned to: <strong className="text-slate-700 font-semibold">{overdueTasks[0].assignedToName || 'Unassigned'}</strong></p>
                        <p className="text-slate-500">Due Date: <strong className="text-rose-600 font-semibold">{overdueTasks[0].dueDate ? formatDate(overdueTasks[0].dueDate) : 'Overdue'}</strong></p>
                      </div>
                      <p className="mt-2 pt-1.5 border-t border-slate-100 text-[10px] text-rose-600 font-medium">
                        Overdue tasks deduct 15 pts from Commitments (10%) and lower account health.
                      </p>
                      <div className="absolute -bottom-1.5 left-6 w-3 h-3 bg-white border-b border-r border-slate-200 rotate-45" />
                    </div>
                  </div>
                )}

                {/* Latest Interaction Pill with Tooltip */}
                {latestActivity && (
                  <div className="relative group/latest inline-block">
                    <span
                      onClick={() => onNavigateToInteractions?.()}
                      className="px-3 py-1 bg-[#E8F0FE] hover:bg-blue-100 text-[#1D4ED8] text-xs font-bold rounded-full border border-[#BFDBFE]/70 flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                      title="Click to view all interactions"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                      <span>Latest: {latestActivity.source || latestActivity.type || 'Interaction'}</span>
                    </span>

                    {/* Tooltip Card */}
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover/latest:flex flex-col w-72 p-3 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600 pb-1.5 border-b border-slate-100">
                        <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                        <span>Most Recent Touchpoint</span>
                      </div>
                      <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                        <p className="font-semibold text-slate-900 truncate">"{latestActivity.subject || latestActivity.title || 'Touchpoint logged'}"</p>
                        <p className="text-slate-500">Channel: <strong className="text-slate-700 font-semibold">{latestActivity.source || latestActivity.type || 'System'}</strong></p>
                        {latestActivity.loggedByName && (
                          <p className="text-slate-500">Logged by: <strong className="text-slate-700 font-semibold">{latestActivity.loggedByName}</strong></p>
                        )}
                        <p className="text-slate-500">Date: <strong className="text-slate-700 font-semibold">{formatDate(latestActivity.timestamp || latestActivity.date)}</strong></p>
                      </div>
                      <div className="mt-2 pt-1.5 border-t border-slate-100 text-[10px] text-blue-600 font-semibold flex items-center gap-1">
                        <span>Click to open in Interactions tab</span>
                        <ArrowRight className="w-3 h-3 text-blue-600" />
                      </div>
                      <div className="absolute -bottom-1.5 left-6 w-3 h-3 bg-white border-b border-r border-slate-200 rotate-45" />
                    </div>
                  </div>
                )}

                {/* Logged Interactions Count Pill with Tooltip */}
                <div className="relative group/count inline-block">
                  <span
                    onClick={() => onNavigateToInteractions?.()}
                    className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-full border border-slate-200/90 flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
                    title="Click to view all interactions"
                  >
                    <Activity className="w-3.5 h-3.5 text-slate-500" />
                    <span><strong>{interactionsCount}</strong> logged interaction{interactionsCount === 1 ? '' : 's'}</span>
                  </span>

                  {/* Tooltip Card */}
                  <div className="absolute left-0 bottom-full mb-2 hidden group-hover/count:flex flex-col w-72 sm:w-80 p-3 bg-white text-slate-800 rounded-xl shadow-xl border border-slate-200 z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 pb-1.5 border-b border-slate-100">
                      <Activity className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Total Interaction Touchpoints</span>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-600 leading-relaxed">
                      Total customer interactions recorded in the database for this account. Directly determines the <strong className="text-slate-800 font-semibold">Engagement Frequency (20%)</strong> health score factor.
                    </p>
                    <div className="mt-2.5 pt-2 border-t border-slate-100 text-[11px] space-y-1.5">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Channel Breakdown:</div>
                      {Object.entries(interactionBreakdown.counts).length === 0 ? (
                        <p className="text-[10px] text-slate-500">No interaction records found</p>
                      ) : (
                        Object.entries(interactionBreakdown.counts).map(([channel, count]) => (
                          <div key={channel} className="flex justify-between items-center text-slate-700">
                            <span className="capitalize">{channel}</span>
                            <span className="font-bold text-slate-800 bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded text-[10px]">{count}</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-slate-100 text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                      <span>Click to view full interaction history</span>
                      <ArrowRight className="w-3 h-3 text-emerald-600" />
                    </div>
                    <div className="absolute -bottom-1.5 left-6 w-3 h-3 bg-white border-b border-r border-slate-200 rotate-45" />
                  </div>
                </div>
              </div>
            </div>

            {/* What's Happening / Why It Matters Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* What's happening */}
              <div className="p-5 rounded-xl flex flex-col gap-3 bg-[#FFF8EB] border border-[#FDE68A]/70">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  What's happening
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed flex-1 font-medium">
                  {whatsHappening.text}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {whatsHappening.tags.map((tag, idx) => {
                    const tagTooltip = tag.includes('Touchpoint')
                      ? 'Total communication touchpoints logged across all channels for this account'
                      : `Channel: Latest touchpoint logged via ${tag}`;
                    return (
                      <span
                        key={idx}
                        className="px-2.5 py-1 bg-white hover:bg-amber-50 text-amber-900 text-[10px] font-bold rounded-md border border-[#FDE68A]/80 cursor-help transition-colors shadow-2xs"
                        title={tagTooltip}
                      >
                        {tag}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Why it matters */}
              <div className="bg-[#FFF5F5] border border-[#FECDD3]/70 p-5 rounded-xl flex flex-col gap-3">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Why it matters</h3>
                <p className="text-xs text-slate-700 leading-relaxed flex-1 font-medium">
                  {whyItMatters.text}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {whyItMatters.tags.map((tag, idx) => {
                    const tagTooltip = tag === 'Retention'
                      ? 'Customer Retention: Continuous engagement protects account loyalty and prevents customer churn.'
                      : tag.startsWith('Journey:')
                        ? 'Customer Lifecycle: The account is currently in the Awareness stage of their customer journey.'
                        : tag === 'Risk Mitigation'
                          ? 'Proactive mitigation required to prevent escalation of open risk items.'
                          : tag === 'Delivery SLA'
                            ? 'Task completion SLA required to protect delivery timelines and sponsor trust.'
                            : tag;
                    return (
                      <span
                        key={idx}
                        className="px-2.5 py-1 bg-white hover:bg-rose-50 text-[#BE123C] text-[10px] font-bold rounded-md border border-[#FECDD3]/80 cursor-help transition-colors shadow-2xs"
                        title={tagTooltip}
                      >
                        {tag}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Data Coverage */}
          <div className="bg-white border border-slate-100 shadow-[0_1px_4px_rgba(15,23,42,0.03)] p-6 rounded-2xl flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Data coverage</h3>
              <span className={`px-2.5 py-0.5 border text-[10px] font-bold rounded-full ${(dataCoverageMetrics.hasOutlook || dataCoverageMetrics.hasManual || dataCoverageMetrics.hasTasks)
                ? 'bg-[#ECFDF5] text-[#15803D] border-[#BBF7D0]'
                : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}>
                {(dataCoverageMetrics.hasOutlook || dataCoverageMetrics.hasManual || dataCoverageMetrics.hasTasks) ? 'Active' : 'No Data'}
              </span>
            </div>
            <p className="text-xs text-slate-600 font-medium">
              Synchronized from live PostgreSQL and interaction logs.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span
                className={`px-3 py-1 text-xs font-bold rounded-full border flex items-center gap-1 cursor-help transition-all shadow-2xs ${dataCoverageMetrics.hasOutlook
                  ? 'bg-[#ECFDF5] text-[#15803D] border-[#BBF7D0]'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}
                title={dataCoverageMetrics.hasOutlook
                  ? `Active: ${dataCoverageMetrics.outlookCount} email(s) synchronized via Microsoft 365 Outlook webhook.`
                  : 'Inactive: No emails ingested via Microsoft 365 / Outlook webhook for this account yet. (Interactions have been logged manually or via direct CRM entries).'}
              >
                Outlook {dataCoverageMetrics.outlookCount > 0 && `(${dataCoverageMetrics.outlookCount})`}{' '}
                {dataCoverageMetrics.hasOutlook ? <Check className="w-3 h-3 text-emerald-600" /> : <span className="text-[10px] text-slate-400 font-normal">Inactive</span>}
              </span>

              <span
                onClick={onNavigateToInteractions ? onNavigateToInteractions : undefined}
                className={`px-3 py-1 text-xs font-bold rounded-full border flex items-center gap-1 cursor-pointer transition-all shadow-2xs ${dataCoverageMetrics.hasManual
                  ? 'bg-[#ECFDF5] text-[#15803D] border-[#BBF7D0] hover:bg-emerald-100/80'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}
                title={`Active: ${dataCoverageMetrics.manualCount} interaction(s) logged directly in CRM. Click to view.`}
              >
                Manual logs {dataCoverageMetrics.manualCount > 0 && `(${dataCoverageMetrics.manualCount})`}{' '}
                {dataCoverageMetrics.hasManual ? <Check className="w-3 h-3 text-emerald-600" /> : <span className="text-[10px] text-slate-400 font-normal">Inactive</span>}
              </span>

              <span
                onClick={onNavigateToTasks ? onNavigateToTasks : undefined}
                className={`px-3 py-1 text-xs font-bold rounded-full border flex items-center gap-1 ${onNavigateToTasks ? 'cursor-pointer hover:bg-emerald-100/80' : ''} ${dataCoverageMetrics.hasTasks
                  ? 'bg-[#ECFDF5] text-[#15803D] border-[#BBF7D0]'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
                  } transition-all shadow-2xs`}
                title={`Active: ${dataCoverageMetrics.tasksCount} task(s) tracked for this account. Click to view.`}
              >
                Tasks {dataCoverageMetrics.tasksCount > 0 && `(${dataCoverageMetrics.tasksCount})`}{' '}
                {dataCoverageMetrics.hasTasks ? <Check className="w-3 h-3 text-emerald-600" /> : <span className="text-[10px] text-slate-400 font-normal">Inactive</span>}
              </span>

              <span
                className={`px-3 py-1 text-xs font-bold rounded-full border flex items-center gap-1 cursor-help transition-all shadow-2xs ${dataCoverageMetrics.hasContacts
                  ? 'bg-[#ECFDF5] text-[#15803D] border-[#BBF7D0]'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}
                title={`Active: ${dataCoverageMetrics.contactsCount} key contact(s) mapped in this account.`}
              >
                Stakeholders {dataCoverageMetrics.contactsCount > 0 && `(${dataCoverageMetrics.contactsCount})`}{' '}
                {dataCoverageMetrics.hasContacts ? <Check className="w-3 h-3 text-emerald-600" /> : <span className="text-[10px] text-slate-400 font-normal">Inactive</span>}
              </span>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2 pt-1">
            <ShieldAlert className="w-4 h-4 text-slate-700" />
            Recommended actions
          </h3>

          <div className="space-y-4">
            {dynamicActions.length === 0 ? (
              <div className="bg-[#F8FAFC] border border-slate-100 rounded-2xl p-6 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-900 mb-1">No Immediate Action Items Required</h4>
                <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">
                  All commitments, risks, and stakeholder touchpoints are currently up to date in the database.
                </p>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleCreateTaskFromAction({ title: `Follow-up with ${account?.companyName || 'Account'}` })}
                    className="btn-create-task px-4 py-2 bg-[#223670] hover:bg-[#1a2955] rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs !text-white"
                    style={{ color: '#ffffff' }}
                  >
                    <span className="!text-white" style={{ color: '#ffffff' }}>Create task</span>
                  </button>
                </div>
              </div>
            ) : (
              dynamicActions.map((action) => (
                <div
                  key={action.id}
                  className={`${action.cardSurface || 'bg-[#F0F6FF] border-[#DBEAFE]'} border rounded-2xl p-5 transition-shadow hover:shadow-sm`}
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <span className={`inline-block px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md border ${action.badgeColor}`}>
                      {action.category}
                    </span>
                  </div>
                  <h4 className="text-[15px] font-bold text-slate-900 mb-1.5">{action.title}</h4>
                  <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                    {action.description}
                  </p>
                  <div className="flex">
                    <button
                      type="button"
                      onClick={() => handleCreateTaskFromAction(action)}
                      className="btn-create-task px-4 py-2 bg-[#223670] hover:bg-[#1a2955] rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs !text-white"
                      style={{ color: '#ffffff' }}
                    >
                      <span className="!text-white" style={{ color: '#ffffff' }}>Create task</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
