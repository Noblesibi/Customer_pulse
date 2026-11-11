import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/index.js';
import {
  Building2, TrendingUp, Users, FileText, Mail, Phone, Video, PartyPopper,
  CheckCircle2, Target, Lightbulb, ChevronRight, ChevronDown, MessageSquare
} from 'lucide-react';
import { formatDate } from '../../utils/dateFormat.js';
import {
  JOURNEY_STAGES,
  JOURNEY_STAGE_TOOLTIPS,
  getDynamicJourneyTooltip,
  detectActivityStage,
  getStageSuggestion,
  isAutomatedGreeting,
  stripHtmlText
} from '../../utils/journeyUtils.js';

export default function CustomerJourneyTab({
  account,
  journeyStage: controlledStage,
  journeyMeta,
  journeyHistory = [],
  nbas = [],
  onNavigateToTasks,
  onNavigateToInteractions,
  allActivities = [],
  onStageChange
}) {
  const navigate = useNavigate();
  const { interactions, staffTasks, fetchStaffTasks, token } = useStore();

  const [showHeaderStageDropdown, setShowHeaderStageDropdown] = React.useState(false);
  const [showHeaderSuggestion, setShowHeaderSuggestion] = React.useState(false);
  const [isWhyExpanded, setIsWhyExpanded] = React.useState(true);

  // Timeline Filters (Customer Touchpoints Only — excludes Staff-to-Staff Tasks)
  const [typeFilter, setTypeFilter] = React.useState('All');
  const [dateFilter, setDateFilter] = React.useState('All');
  const [showTypeDropdown, setShowTypeDropdown] = React.useState(false);
  const [showDateDropdown, setShowDateDropdown] = React.useState(false);

  const headerDropdownRef = React.useRef(null);
  const suggestionDropdownRef = React.useRef(null);
  const typeDropdownRef = React.useRef(null);
  const dateDropdownRef = React.useRef(null);

  React.useEffect(() => {
    if (fetchStaffTasks) fetchStaffTasks('all-tasks');
  }, []);

  React.useEffect(() => {
    const handleOutside = (e) => {
      if (headerDropdownRef.current && !headerDropdownRef.current.contains(e.target)) {
        setShowHeaderStageDropdown(false);
      }
      if (suggestionDropdownRef.current && !suggestionDropdownRef.current.contains(e.target)) {
        setShowHeaderSuggestion(false);
      }
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target)) {
        setShowTypeDropdown(false);
      }
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target)) {
        setShowDateDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const stages = JOURNEY_STAGES;
  const accId = account?.accountId || account?.id || account?.account_id;

  const filteredInteractions = React.useMemo(
    () => (interactions || []).filter(i => (i.accountId || i.account_id) === accId),
    [interactions, accId]
  );

  const accountTasksAll = React.useMemo(() => {
    if (!accId) return [];
    return (staffTasks || []).filter(
      t =>
        t.accountId === accId ||
        t.account_id === accId ||
        (account?.companyName && t.companyName?.toLowerCase() === account.companyName?.toLowerCase())
    );
  }, [staffTasks, accId, account?.companyName]);

  const matchingTasks = React.useMemo(
    () => accountTasksAll.filter(t => (t.status || '').toLowerCase() !== 'completed'),
    [accountTasksAll]
  );

  // Merge live DB interactions and DB tasks without duplicating records
  const combinedSource = React.useMemo(() => {
    if (allActivities && allActivities.length > 0) {
      const existingTaskIds = new Set(allActivities.filter(a => a.itemType === 'task').map(t => t.taskId || t.id));
      const extraTasks = accountTasksAll
        .filter(t => !existingTaskIds.has(t.taskId || t.id))
        .map(t => ({ ...t, itemType: 'task' }));
      return [...allActivities, ...extraTasks];
    }
    return [
      ...filteredInteractions.map(i => ({ ...i, itemType: 'interaction' })),
      ...accountTasksAll.map(t => ({ ...t, itemType: 'task' }))
    ];
  }, [allActivities, filteredInteractions, accountTasksAll]);

  // Customer-facing touchpoints ONLY (strictly excludes Staff-to-Staff Tasks and internal staff task/risk alert emails)
  const customerTouchpoints = React.useMemo(() => {
    return combinedSource.filter(i => {
      if (!i || i.itemType === 'task') return false;
      const ev = String(i.eventType || '').toLowerCase();
      const subj = String(i.subject || i.title || '').toLowerCase();
      if (
        i.relatedTaskId ||
        ev.includes('task') ||
        ev.includes('risk') ||
        subj.includes('task assigned') ||
        subj.includes('task status') ||
        subj.includes('risk alert')
      ) {
        return false;
      }
      return true;
    });
  }, [combinedSource]);

  const classifyTouchpointCategory = (item) => {
    const src = String(item.source || item.channel || '').toLowerCase().trim();
    const ev = String(item.eventType || '').toLowerCase().trim();
    const subj = String(item.subject || item.title || '').toLowerCase();

    // 1. Greeting Emails (Celebrations, birthdays, anniversaries, festivals, achievements)
    if (
      item.itemType === 'greeting' ||
      isAutomatedGreeting(item) ||
      ['birthday', 'work_anniversary', 'company_anniversary', 'festival', 'welcome', 'farewell', 'promotion', 'achievement', 'custom_greeting'].includes(ev) ||
      (src === 'system email' && (
        subj.includes('congratulations') ||
        subj.includes('anniversary') ||
        subj.includes('birthday') ||
        subj.includes('celebrating') ||
        subj.includes('warm wishes') ||
        subj.includes('festival') ||
        subj.includes('welcome')
      ))
    ) {
      return 'Greeting Emails';
    }

    // 2. Microsoft Teams (Teams Meeting & Teams Chat)
    if (item.itemType === 'teams_tracking' || src.includes('teams')) {
      return 'Teams';
    }

    // 3. Phone Calls & Face-to-Face Meetings
    if (src === 'phone' || src.includes('phone') || src.includes('call') || src.includes('face') || src.includes('in-person')) {
      return 'Calls & Meetings';
    }

    // 4. Customer Emails (Outlook Mail / Synced Emails)
    if (item.itemType === 'mail_tracking' || src === 'outlook mail' || src === 'email' || src.includes('mail')) {
      return 'Emails';
    }

    // 5. General Logged Customer Interactions
    return 'Interaction Logs';
  };

  const getInteractionIcon = (category = '', title = '', channel = '') => {
    if (category === 'Greeting Emails') return <PartyPopper className="w-4 h-4 text-rose-500" />;
    if (category === 'Teams') return <Video className="w-4 h-4 text-indigo-600" />;
    if (category === 'Emails') return <Mail className="w-4 h-4 text-sky-600" />;
    if (category === 'Calls & Meetings') {
      const lower = (title + ' ' + channel).toLowerCase();
      return lower.includes('phone') || lower.includes('call')
        ? <Phone className="w-4 h-4 text-emerald-600" />
        : <Users className="w-4 h-4 text-amber-600" />;
    }
    const text = (title + ' ' + channel).toLowerCase();
    if (text.includes('doc') || text.includes('file') || text.includes('req') || text.includes('proposal')) {
      return <FileText className="w-4 h-4 text-slate-600" />;
    }
    return <MessageSquare className="w-4 h-4 text-blue-700" />;
  };

  const stageBadgeStyle = (stage) => {
    switch (stage) {
      case 'Decision': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Retention': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Advocacy': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Consideration': return 'bg-blue-50 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  // Build timeline strictly from customer-facing database touchpoints (no staff-to-staff tasks)
  const rawTimeline = React.useMemo(() => {
    if (customerTouchpoints.length === 0) return [];
    return customerTouchpoints.map(i => {
      const detectedStage = detectActivityStage(i);
      const category = classifyTouchpointCategory(i);
      const isManualLog = i.itemType === 'interaction' && !i.externalId && category !== 'Greeting Emails';
      const rawTimestamp = i.timestamp || i.createdAt || i.date;
      const cleanDetails = stripHtmlText(i.notes || i.details || i.description || i.messageText || '');
      const cleanTitle = i.subject || i.title || i.channel || i.source || '';
      return {
        id: i.interactionId || i.id,
        category,
        isManualLog,
        rawDate: rawTimestamp || null,
        date: rawTimestamp ? formatDate(rawTimestamp) : '—',
        icon: getInteractionIcon(category, cleanTitle, i.channel || i.source || ''),
        title: cleanTitle,
        details: cleanDetails || (i.source ? `Logged via ${i.source}` : '—'),
        stage: detectedStage
      };
    });
  }, [customerTouchpoints]);

  const chronological = React.useMemo(
    () => [...rawTimeline].filter(r => r.rawDate).sort((a, b) => new Date(a.rawDate) - new Date(b.rawDate)),
    [rawTimeline]
  );

  const timeline = React.useMemo(() => {
    return [...rawTimeline]
      .filter(item => {
        if (typeFilter !== 'All') {
          if (typeFilter === 'Interaction Logs') {
            if (item.category !== 'Interaction Logs' && !item.isManualLog) return false;
          } else if (item.category !== typeFilter) {
            return false;
          }
        }
        if (dateFilter !== 'All' && item.rawDate) {
          const itemDate = new Date(item.rawDate);
          const now = new Date();
          const diffDays = (now - itemDate) / (1000 * 60 * 60 * 24);
          if (dateFilter === '7' && diffDays > 7) return false;
          if (dateFilter === '14' && diffDays > 14) return false;
          if (dateFilter === '30' && diffDays > 30) return false;
          if (dateFilter === '365' && diffDays > 365) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.rawDate || 0) - new Date(a.rawDate || 0));
  }, [rawTimeline, typeFilter, dateFilter]);

  const latestDbHistory = Array.isArray(journeyHistory) && journeyHistory.length > 0 ? journeyHistory[0] : null;
  const activeStage = controlledStage || account?.journeyStage || latestDbHistory?.toStage || 'Awareness';
  const activeIndex = Math.max(0, stages.indexOf(activeStage));

  // Derive Previous Stage, Stage Changed On, and Time in Current Stage strictly from DB state / DB history / DB timeline
  let previousStage = 'None';
  let stageChangedTimestamp = null;
  let stageChangedOn = '—';

  if (journeyMeta?.stageChangedTimestamp) {
    previousStage = journeyMeta.previousStage || 'None';
    stageChangedTimestamp = new Date(journeyMeta.stageChangedTimestamp);
    stageChangedOn = journeyMeta.stageChangedOn || formatDate(journeyMeta.stageChangedTimestamp);
  } else if (account?.journeyUpdatedAt) {
    previousStage = account.previousJourneyStage || latestDbHistory?.fromStage || 'None';
    stageChangedTimestamp = new Date(account.journeyUpdatedAt);
    stageChangedOn = formatDate(account.journeyUpdatedAt);
  } else if (latestDbHistory?.timestamp) {
    previousStage = latestDbHistory.fromStage && latestDbHistory.fromStage !== activeStage ? latestDbHistory.fromStage : 'None';
    stageChangedTimestamp = new Date(latestDbHistory.timestamp);
    stageChangedOn = formatDate(latestDbHistory.timestamp);
  } else if (chronological.length > 0) {
    let firstCurrentStageIdx = chronological.length - 1;
    while (firstCurrentStageIdx > 0 && chronological[firstCurrentStageIdx - 1]?.stage === activeStage) {
      firstCurrentStageIdx--;
    }
    const firstInStage = chronological[firstCurrentStageIdx];
    if (firstInStage?.rawDate) {
      stageChangedTimestamp = new Date(firstInStage.rawDate);
      stageChangedOn = firstInStage.date;
      if (firstCurrentStageIdx > 0) {
        previousStage = chronological[firstCurrentStageIdx - 1].stage;
      }
    }
  } else if (account?.createdAt) {
    stageChangedTimestamp = new Date(account.createdAt);
    stageChangedOn = formatDate(account.createdAt);
  }

  const prevIndex = previousStage !== 'None' ? stages.indexOf(previousStage) : -1;
  const isMovedBackward = prevIndex !== -1 && prevIndex > activeIndex;

  const timeInCurrentStageDays = stageChangedTimestamp && !isNaN(stageChangedTimestamp.getTime())
    ? Math.max(0, Math.floor((Date.now() - stageChangedTimestamp.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const suggestion = React.useMemo(
    () => getStageSuggestion(activeStage, combinedSource, nbas),
    [activeStage, combinedSource, nbas]
  );

  // Stage reason stored in DB (or derived from customer touchpoint signals matching activeStage) — displayed inside "Why this stage?"
  const stageSignals = React.useMemo(
    () => customerTouchpoints.filter(i => detectActivityStage(i) === activeStage),
    [customerTouchpoints, activeStage]
  );

  const dbStageReason = React.useMemo(() => {
    if (journeyMeta?.reason) return journeyMeta.reason;
    if (account?.journeyReason) return account.journeyReason;
    if (latestDbHistory?.toStage === activeStage && latestDbHistory?.reason) return latestDbHistory.reason;
    if (stageSignals.length > 0) {
      const top = stageSignals[0];
      const title = top.subject || top.title || top.taskHeader || top.source || '';
      const dt = top.timestamp || top.date ? ` (${formatDate(top.timestamp || top.date)})` : '';
      if (title) {
        return `Identified in ${activeStage} from database record "${title}"${dt}.`;
      }
    }
    return '';
  }, [journeyMeta?.reason, account?.journeyReason, latestDbHistory, stageSignals, activeStage]);

  const triggerStageChange = async (newStage, triggerType = 'manual', reason = '') => {
    if (!newStage || newStage === activeStage) {
      setShowHeaderStageDropdown(false);
      setShowHeaderSuggestion(false);
      return;
    }

    setShowHeaderStageDropdown(false);
    setShowHeaderSuggestion(false);

    if (onStageChange) {
      await onStageChange(newStage, { triggerType, reason });
      return;
    }

    if (accId) {
      try {
        await fetch(`/CustomerPulse/api/accounts/${accId}/journey`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ journeyStage: newStage, fromStage: activeStage, reason, triggerType })
        });
      } catch (err) {
        console.error('Failed to save journey stage:', err);
      }
    }
  };

  const getClipPath = (idx, total) => {
    if (idx === 0) return 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%)';
    if (idx === total - 1) return 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 16px 50%)';
    return 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%, 16px 50%)';
  };

  return (
    <div className="flex flex-col h-full w-full overflow-y-auto bg-[#F6F8FB] p-6 pb-20">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Customer Journey</h2>
        </div>
      </div>

      {/* Top Row: Current Stage Card + Momentum / Stage Progression Card */}
      <div className="flex flex-col lg:flex-row gap-6 items-stretch mb-6">
        {/* Current Stage Card */}
        <div className="flex-1 min-w-0">
          {/* Current Stage Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm overflow-visible relative z-30">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-bold text-gray-800">Current Stage</h3>

                {/* Synchronized Compact Journey Dropdown with Hover Tooltips */}
                <div className="flex items-center gap-2 relative" ref={headerDropdownRef}>
                  <span className="text-slate-500 text-[11px] font-bold uppercase tracking-wider">Journey:</span>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowHeaderStageDropdown(prev => !prev)}
                      className="journey-stage-btn px-3.5 py-1 rounded-full text-xs font-bold bg-[#E8F0FE] text-[#1D4ED8] border border-[#BFDBFE]/60 hover:bg-[#DBEAFE] flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span className="text-[#1D4ED8] font-bold">{activeStage}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-[#1D4ED8]" />
                    </button>

                    {showHeaderStageDropdown && (
                      <div className="absolute top-full left-0 mt-1.5 min-w-full w-max bg-white border border-slate-200/90 rounded-xl shadow-[0_8px_24px_-4px_rgba(15,23,42,0.12)] p-1 z-50 overflow-visible">
                        {stages.map(stage => (
                          <button
                            key={stage}
                            type="button"
                            onClick={() => triggerStageChange(stage, 'manual')}
                            className={`relative group w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 overflow-visible ${
                              activeStage === stage
                                ? 'bg-[#E8F0FE]/80 font-semibold text-[#1D4ED8]'
                                : 'font-medium text-[#64748B] hover:bg-[#F1F5FD] hover:text-[#1D4ED8]'
                            }`}
                          >
                            <span>{stage}</span>
                            <span
                              role="tooltip"
                              className="pointer-events-none block absolute left-full top-1/2 -translate-y-1/2 ml-2.5 w-52 bg-white border border-slate-200 rounded-xl shadow-[0_8px_24px_-4px_rgba(15,23,42,0.14)] px-3 py-2 z-[100] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 text-left"
                            >
                              <span className="block absolute right-full top-1/2 -translate-y-1/2 -mr-[5px] w-2 h-2 bg-white border-l border-b border-slate-200 rotate-45" />
                              <span className="block text-[11px] font-semibold text-[#1D4ED8] mb-0.5">{stage}</span>
                              <span className="block text-[11px] font-normal text-[#64748B] leading-snug whitespace-normal">
                                {getDynamicJourneyTooltip(stage, account)}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Suggestion Pill + Hover/Click Dropdown (DB-driven) */}
              {suggestion && (
                <div className="relative group z-40" ref={suggestionDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowHeaderSuggestion(prev => !prev)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-[#E31C25]/10 hover:bg-[#E31C25]/15 text-[#E31C25] border border-[#E31C25]/30 rounded-full text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                  >
                    <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                    <span>Suggestion: Move to {suggestion.suggested}</span>
                    <ChevronDown className="w-3 h-3 opacity-80" />
                  </button>

                  <div
                    className={`absolute right-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-[0_10px_28px_-4px_rgba(15,23,42,0.15)] p-4 z-50 text-left transition-all duration-150 ${
                      showHeaderSuggestion
                        ? 'opacity-100 visible'
                        : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible'
                    }`}
                  >
                    <h4 className="text-[11px] font-bold text-[#4f46e5] uppercase tracking-wider mb-1.5">
                      Why move to {suggestion.suggested}?
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed mb-3.5">
                      {suggestion.reason}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerStageChange(suggestion.suggested, 'suggestion', suggestion.reason);
                      }}
                      className="w-full bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs font-bold py-2 rounded-lg transition-colors cursor-pointer"
                    >
                      Apply Suggestion
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Chevron Progress Bar with Hover Tooltips */}
            <div className="flex h-12 mb-8 overflow-visible">
              {stages.map((stage, idx) => {
                const isCurrent = idx === activeIndex;
                return (
                  <div
                    key={stage}
                    onClick={() => triggerStageChange(stage, 'manual')}
                    className={`flex-1 relative group -ml-1 first:ml-0 cursor-pointer ${
                      isCurrent ? 'z-20' : 'z-10 hover:z-30'
                    }`}
                  >
                    <div
                      className={`w-full h-full flex items-center justify-center transition-colors ${
                        isCurrent
                          ? 'bg-primary text-white hover:opacity-95'
                          : 'bg-slate-100 text-slate-500 hover:bg-[#E8F0FE] hover:text-[#1D4ED8]'
                      }`}
                      style={{
                        clipPath: getClipPath(idx, stages.length),
                        paddingLeft: idx > 0 ? '16px' : '0'
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            isCurrent ? 'border-white' : 'border-slate-300 group-hover:border-[#1D4ED8]'
                          }`}
                        >
                          {isCurrent && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <span className={`text-xs sm:text-sm font-semibold ${isCurrent ? 'text-white' : ''}`}>
                          {stage}
                        </span>
                      </div>
                    </div>

                    {/* Hover Tooltip Above Chevron Stage */}
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-52 bg-white border border-slate-200 rounded-xl shadow-[0_8px_24px_-4px_rgba(15,23,42,0.14)] px-3 py-2 z-[90] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 text-left"
                    >
                      <div className="text-[11px] font-semibold text-[#1D4ED8] mb-0.5">{stage}</div>
                      <div className="text-[11px] font-normal text-[#64748B] leading-snug">
                        {getDynamicJourneyTooltip(stage, account)}
                      </div>
                      <span className="block absolute top-full left-1/2 -translate-x-1/2 -mt-[5px] w-2 h-2 bg-white border-r border-b border-slate-200 rotate-45" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stage Info Stats (Database-connected, Confidence removed) */}
            <div className="flex flex-wrap items-center gap-6 sm:gap-10 border-t border-slate-100 pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-100 text-primary rounded-xl flex items-center justify-center">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Current Stage</div>
                  <div className="text-lg font-bold text-gray-900">{activeStage}</div>
                </div>
              </div>

              <div className="hidden sm:block h-10 w-px bg-slate-200" />

              <div>
                <div className="text-xs text-gray-500 mb-1">Previous Stage</div>
                <div className="text-sm font-bold text-gray-900">{previousStage}</div>
              </div>

              <div className="hidden sm:block h-10 w-px bg-slate-200" />

              <div>
                <div className="text-xs text-gray-500 mb-1">Stage Changed On</div>
                <div className="text-sm font-bold text-gray-900">{stageChangedOn}</div>
              </div>

              <div className="hidden sm:block h-10 w-px bg-slate-200" />

              <div>
                <div className="text-xs text-gray-500 mb-1">Time in Current Stage</div>
                <div className="text-sm font-bold text-gray-900">
                  {timeInCurrentStageDays} {timeInCurrentStageDays === 1 ? 'day' : 'days'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Momentum / Stage Progression Card */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col">
          {/* Progressing Well (Clean, DB-driven — no embedded suggestion or manual dropdown) */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-[#E8F0FE] flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4 text-[#1D4ED8]" />
              </div>
              <h3 className="text-base font-bold text-gray-900">
                {isMovedBackward ? 'Stage Updated' : 'Progressing Well'}
              </h3>
            </div>

            <p className="text-sm text-gray-600 leading-relaxed">
              {previousStage !== 'None' ? (
                <>
                  Account moved from <span className="font-semibold text-gray-800">{previousStage}</span> to{' '}
                  <span className="font-semibold text-gray-800">{activeStage}</span> on {stageChangedOn}.{' '}
                  {!isMovedBackward && (
                    <>Momentum looks <span className="font-bold text-emerald-600">positive</span>.</>
                  )}
                </>
              ) : (
                <>
                  Account is in the <span className="font-semibold text-gray-800">{activeStage}</span> stage
                  {stageChangedOn !== '—' ? ` since ${stageChangedOn}` : ''}.{' '}
                  {rawTimeline.length > 0
                    ? `${rawTimeline.length} ${rawTimeline.length === 1 ? 'activity' : 'activities'} recorded in database.`
                    : 'No interactions recorded in database yet.'}
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Upper Layout: Why this stage? (Full Width) */}
      <div className="w-full mb-6">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
            <button
              type="button"
              onClick={() => setIsWhyExpanded(prev => !prev)}
              className="w-full flex items-center justify-between text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-primary" /> Why this stage?
                </h3>
                {(journeyMeta?.triggerType || account?.journeyTrigger || latestDbHistory?.triggerType) && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    (journeyMeta?.triggerType || account?.journeyTrigger || latestDbHistory?.triggerType) === 'auto'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    {(journeyMeta?.triggerType || account?.journeyTrigger || latestDbHistory?.triggerType) === 'auto'
                      ? 'Auto-Updated'
                      : (journeyMeta?.triggerType || account?.journeyTrigger || latestDbHistory?.triggerType) === 'suggestion'
                        ? 'Applied Suggestion'
                        : 'Manual Update'}
                  </span>
                )}
              </div>
              <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isWhyExpanded ? 'rotate-90' : ''}`} />
            </button>

            {isWhyExpanded && (
              <div className="mt-4 space-y-4">
                {dbStageReason ? (
                  <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-slate-200/80 text-sm text-slate-700 leading-relaxed">
                    <span className="font-bold text-slate-900">Stage Reason: </span>
                    {dbStageReason}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">
                    Current stage is <span className="font-bold text-gray-900">{activeStage}</span> based on stored database records:
                  </p>
                )}

                {stageSignals.length > 0 ? (
                  <div className="flex flex-col gap-2.5 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
                    {stageSignals.map((i, idx) => {
                      const signalTitle = i.subject || i.title || i.taskHeader || stripHtmlText(i.messageText || i.task || '');
                      const signalDate = i.timestamp || i.date || i.dueDate ? formatDate(i.timestamp || i.date || i.dueDate) : '';
                      const signalSource = i.source || i.channel || (i.itemType === 'task' ? 'Task' : '');
                      return (
                        <div key={i.interactionId || i.taskId || idx} className="flex items-start justify-between gap-3 text-sm text-gray-700 font-medium bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <div className="flex items-start gap-2 min-w-0">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{signalTitle}</span>
                          </div>
                          {(signalSource || signalDate) && (
                            <span className="text-[11px] text-slate-400 font-semibold whitespace-nowrap shrink-0">
                              {[signalSource, signalDate].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 italic">
                    No database interactions specifically tagged for {activeStage} yet.
                  </div>
                )}
              </div>
            )}
        </div>
      </div>

      {/* Down Below: Journey Timeline in Full Length from Left to Right */}
      <div className="w-full">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-visible relative z-20">
            <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <Target className="w-4 h-4 text-gray-500" /> Journey Timeline
              </h3>
              <div className="flex items-center gap-3">
                {/* Custom Touchpoint Type Dropdown */}
                <div className="relative" ref={typeDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTypeDropdown(prev => !prev);
                      setShowDateDropdown(false);
                    }}
                    className="flex items-center justify-between gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg px-3 py-1.5 min-w-[148px] transition-colors cursor-pointer"
                  >
                    <span>
                      {typeFilter === 'All'
                        ? 'All Types'
                        : typeFilter === 'Calls & Meetings'
                          ? 'Phone & Face-to-Face'
                          : typeFilter}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>
                  {showTypeDropdown && (
                    <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-slate-200/90 rounded-xl shadow-[0_8px_24px_-4px_rgba(15,23,42,0.12)] p-1 z-50">
                      {[
                        { value: 'All', label: 'All Types' },
                        { value: 'Interaction Logs', label: 'Interaction Logs' },
                        { value: 'Emails', label: 'Emails' },
                        { value: 'Teams', label: 'Teams' },
                        { value: 'Greeting Emails', label: 'Greeting Emails' },
                        { value: 'Calls & Meetings', label: 'Phone & Face-to-Face' }
                      ].map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setTypeFilter(opt.value);
                            setShowTypeDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                            typeFilter === opt.value
                              ? 'bg-[#E8F0FE]/80 font-semibold text-[#1D4ED8]'
                              : 'font-medium text-slate-600 hover:bg-[#F1F5FD] hover:text-[#1D4ED8]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Custom Time Range Dropdown */}
                <div className="relative" ref={dateDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDateDropdown(prev => !prev);
                      setShowTypeDropdown(false);
                    }}
                    className="flex items-center justify-between gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg px-3 py-1.5 min-w-[124px] transition-colors cursor-pointer"
                  >
                    <span>
                      {dateFilter === '7'
                        ? 'Last 7 Days'
                        : dateFilter === '14'
                          ? 'Last 14 Days'
                          : dateFilter === '30'
                            ? 'Last 30 Days'
                            : dateFilter === '365'
                              ? 'Last Year'
                              : 'All Time'}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </button>
                  {showDateDropdown && (
                    <div className="absolute right-0 top-full mt-1.5 w-36 bg-white border border-slate-200/90 rounded-xl shadow-[0_8px_24px_-4px_rgba(15,23,42,0.12)] p-1 z-50">
                      {[
                        { value: 'All', label: 'All Time' },
                        { value: '7', label: 'Last 7 Days' },
                        { value: '14', label: 'Last 14 Days' },
                        { value: '30', label: 'Last 30 Days' }
                      ].map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setDateFilter(opt.value);
                            setShowDateDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                            dateFilter === opt.value
                              ? 'bg-[#E8F0FE]/80 font-semibold text-[#1D4ED8]'
                              : 'font-medium text-slate-600 hover:bg-[#F1F5FD] hover:text-[#1D4ED8]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="w-full overflow-x-auto overflow-y-auto max-h-[400px] rounded-b-2xl custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 shadow-xs">
                  <tr className="bg-slate-50/95 backdrop-blur-xs border-b border-slate-200">
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 w-32">Date</th>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500">Interaction / Touchpoint</th>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500">Key Details</th>
                    <th className="px-6 py-3 text-xs font-bold text-gray-500 w-32">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {timeline.length > 0 ? (
                    timeline.map((item, idx) => (
                      <tr
                        key={item.id || idx}
                        onClick={onNavigateToInteractions}
                        className="hover:bg-slate-50/70 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">{item.date}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                              {item.icon}
                            </div>
                            <span className="text-sm font-bold text-gray-800">{item.title}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 leading-relaxed line-clamp-3">
                          {item.details}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border ${stageBadgeStyle(item.stage)}`}>
                            {item.stage}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-sm text-slate-400 italic">
                        No customer touchpoints recorded for the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
      </div>
    </div>
  );
}