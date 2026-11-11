import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../store/index.js';
import { 
  Settings, AlertTriangle, Plus, Lock, Unlock, Search, Check, Filter, 
  Clock, Calendar, Mail, Video, Users, Heart, ShieldAlert, Award, 
  FileText, Trash2, CheckCircle2, ChevronRight, X, Sparkles, SlidersHorizontal, Info 
} from 'lucide-react';
import ScoreTrendGraph from '../ScoreTrendGraph.jsx';
import { getAccountHealthConfig } from '../../utils/healthUtils.js';
import { READY_MADE_CATALOG, CUSTOMER_TIERS, CATALOG_CATEGORIES, DEFAULT_HEALTH_CATEGORIES } from '../../utils/scoringCatalog.js';

function InfoTooltip({ 
  title, 
  why, 
  formula, 
  status, 
  note, 
  placement = 'top',
  align = 'left',
  iconSize = 'w-3.5 h-3.5',
  className = '' 
}) {
  const getPositionClasses = () => {
    switch (placement) {
      case 'bottom':
        return `top-full mt-2.5 ${align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'}`;
      case 'right':
        return 'left-full ml-2.5 top-1/2 -translate-y-1/2';
      case 'left':
        return 'right-full mr-2.5 top-1/2 -translate-y-1/2';
      case 'top':
      default:
        return `bottom-full mb-2.5 ${align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'}`;
    }
  };

  return (
    <div className={`relative inline-flex items-center group/infotip ${className}`}>
      <span
        tabIndex={0}
        role="button"
        aria-label="Why this value?"
        className="p-0.5 text-slate-400 hover:text-blue-600 transition-colors rounded-full cursor-help inline-flex items-center"
      >
        <Info className={iconSize} />
      </span>
      <div 
        className={`absolute z-[70] hidden group-hover/infotip:flex flex-col w-64 sm:w-72 p-3 bg-white text-slate-800 rounded-xl shadow-[0_12px_28px_-4px_rgba(15,23,42,0.12),0_4px_10px_-2px_rgba(15,23,42,0.06)] border border-slate-200/90 pointer-events-none animate-in fade-in zoom-in-95 duration-150 ${getPositionClasses()}`}
      >
        {/* Directional Arrow Beak */}
        {placement === 'top' && (
          <div className={`absolute -bottom-1.5 ${align === 'right' ? 'right-4' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-4'} w-2.5 h-2.5 bg-white border-b border-r border-slate-200 rotate-45`} />
        )}
        {placement === 'bottom' && (
          <div className={`absolute -top-1.5 ${align === 'right' ? 'right-4' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-4'} w-2.5 h-2.5 bg-white border-t border-l border-slate-200 rotate-45`} />
        )}
        {placement === 'right' && (
          <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white border-b border-l border-slate-200 rotate-45" />
        )}
        {placement === 'left' && (
          <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white border-t border-r border-slate-200 rotate-45" />
        )}

        {title && (
          <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-slate-100 relative z-10">
            <span className="text-[11.5px] font-bold text-slate-900 flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
              {title}
            </span>
            {status && (
              <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200/80 shrink-0">
                {status}
              </span>
            )}
          </div>
        )}
        <div className="text-[11px] text-slate-600 leading-snug font-normal relative z-10">
          <strong className="text-blue-700 font-semibold">Why this? </strong>
          {why}
        </div>
        {formula && (
          <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-500 bg-slate-50 -mx-3 -mb-3 p-1.5 px-2.5 rounded-b-xl flex items-start gap-1 relative z-10">
            <span className="text-slate-700 font-semibold shrink-0">Formula:</span>
            <span className="font-mono text-slate-600 truncate">{formula}</span>
          </div>
        )}
        {note && !formula && (
          <div className="mt-1 text-[9.5px] text-slate-400 italic relative z-10">
            {note}
          </div>
        )}
      </div>
    </div>
  );
}

function getSpecificTouchpointReason(tp) {
  if (tp.sentimentReason && tp.sentimentReason.trim()) {
    return tp.sentimentReason;
  }
  const subj = (tp.subject || tp.title || '').trim();
  const lower = subj.toLowerCase();
  const type = (tp.type || tp.interactionType || '').toLowerCase();

  // 1. Specific Celebrations
  if (lower.includes('birthday') || type.includes('birthday')) {
    return 'Personal birthday greeting sent to key contact, strengthening executive relationship warmth.';
  }
  if (lower.includes('work anniversary') || lower.includes('tenure') || type.includes('work_anniversary')) {
    return 'Work anniversary recognition acknowledging stakeholder tenure and shared collaboration.';
  }
  if (lower.includes('company anniversary') || type.includes('company_anniversary')) {
    return 'Corporate anniversary touchpoint celebrating the customer enterprise milestone and partnership.';
  }
  if (lower.includes('congratulation') || lower.includes('achievement') || lower.includes('award') || type.includes('achievement')) {
    return 'Congratulatory message acknowledging notable customer achievements, product launches, or awards.';
  }
  if (lower.includes('festival') || lower.includes('diwali') || lower.includes('christmas') || lower.includes('new year') || lower.includes('eid') || lower.includes('holiday')) {
    return 'Seasonal festival greeting sent to nurture warm, trusted ongoing business relationship.';
  }

  // 2. Action Tasks / Operational
  if (lower.includes('[associated task assigned]') || lower.includes('task assigned') || lower.includes('reconnect with')) {
    const cleanTask = subj.replace(/^\[Associated Task Assigned\]\s*/i, '').trim();
    return cleanTask 
      ? `Internal follow-up task logged: "${cleanTask}" to maintain account engagement.`
      : 'Internal operational task assigned to drive proactive customer engagement.';
  }

  // 3. Meetings & Calls
  if (lower.includes('meeting') || lower.includes('qbr') || lower.includes('call') || lower.includes('sync') || lower.includes('review') || lower.includes('demo')) {
    if (tp.sentiment === 'Pos') return 'Collaborative customer session with positive alignment and forward momentum on deliverables.';
    if (tp.sentiment === 'Neg') return 'Meeting surfaced timeline friction, delivery bottlenecks, or critical feedback requiring follow-up.';
    return 'Scheduled status sync or requirements review session logged with customer stakeholders.';
  }

  // 4. Commercial / Contracts
  if (lower.includes('proposal') || lower.includes('contract') || lower.includes('pricing')) {
    if (tp.sentiment === 'Pos') return 'Commercial discussion progressing favorably towards agreement sign-off.';
    if (tp.sentiment === 'Neg') return 'Pricing, budget constraints, or scope objections raised during contract review.';
    return 'Contractual or commercial proposal documentation shared with procurement.';
  }

  // 5. General sentiment based on content
  if (tp.sentiment === 'Pos') {
    return 'Customer communication expressing positive client feedback, approval, or relationship goodwill.';
  }
  if (tp.sentiment === 'Neg') {
    return 'Client raised dissatisfaction, delivery delays, SLA breaches, or an escalation request.';
  }
  return 'Informational email or status update logged in database without active risk or celebration signals.';
}

export default function AccountHealthTab({ account, overdueTasks = [], openTasks = [], risks = [], contacts = [], interactions = [], onRecalculate }) {
  const { user, token, showActivityToast } = useStore();
  const isAdmin = user?.role === 'Admin' || user?.userType === 'Admin' || user?.position?.toLowerCase().includes('admin') || user?.name?.toLowerCase().includes('admin');
  const accId = account?.accountId || account?.id;
  const API_BASE = '/CustomerPulse/api';

  const [explanation, setExplanation] = useState(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  const effectiveOverdueCount = (overdueTasks && overdueTasks.length > 0)
    ? overdueTasks.length
    : (explanation?.factors?.commitments?.score != null && explanation.factors.commitments.score < 100)
      ? 1
      : 0;

  const overdueTaskTitle = useMemo(() => {
    if (overdueTasks && overdueTasks.length > 0) {
      return overdueTasks[0].title || overdueTasks[0].taskHeader || overdueTasks[0].action || overdueTasks[0].subject || '';
    }
    return '';
  }, [overdueTasks]);

  const fetchHealthData = async (silent = false) => {
    if (!accId || !token) return;
    if (!silent && !explanation) setLoadingExplanation(true);
    try {
      const res = await fetch(`${API_BASE}/accounts/${accId}/health-explanation`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setExplanation(prev => {
          if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
          return data;
        });
      }
    } catch (err) {
      console.error('Failed to fetch health explanation:', err);
    } finally {
      setLoadingExplanation(false);
    }
  };

  useEffect(() => {
    fetchHealthData();

    // Silent background polling every 60s
    const interval = setInterval(() => {
      fetchHealthData(true);
    }, 60000);

    return () => {
      clearInterval(interval);
    };
  }, [accId, token]);

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Customer Tier State (Strategic, Key, Standard, Low Touch)
  const [selectedTier, setSelectedTier] = useState(account?.tier || account?.customerTier || 'Strategic');
  const [catalogCategory, setCatalogCategory] = useState('All Criteria');
  const [ruleSearch, setRuleSearch] = useState('');
  const [customRules, setCustomRules] = useState([]);

  // Category Weights & Activation for Health Scoring
  const [categoryWeights, setCategoryWeights] = useState(() => {
    const defaults = {};
    DEFAULT_HEALTH_CATEGORIES.forEach(c => { defaults[c.id] = c.weight; });
    try {
      const globalSaved = localStorage.getItem('customer_pulse_health_config');
      if (globalSaved) {
        const parsedGlobal = JSON.parse(globalSaved);
        if (parsedGlobal.categoryWeights) return { ...defaults, ...parsedGlobal.categoryWeights };
      }
    } catch (e) {}
    return defaults;
  });

  const [categoryEnabled, setCategoryEnabled] = useState(() => {
    const defaults = {};
    DEFAULT_HEALTH_CATEGORIES.forEach(c => { defaults[c.id] = true; });
    try {
      const globalSaved = localStorage.getItem('customer_pulse_health_config');
      if (globalSaved) {
        const parsedGlobal = JSON.parse(globalSaved);
        if (parsedGlobal.categoryEnabled) return { ...defaults, ...parsedGlobal.categoryEnabled };
      }
    } catch (e) {}
    return defaults;
  });

  // Active rules state map
  const [activeRules, setActiveRules] = useState(() => {
    const initial = {};
    READY_MADE_CATALOG.forEach(r => {
      initial[r.id] = r.defaultEnabled === true;
    });
    return initial;
  });

  // Custom rule creation form
  const [customRuleForm, setCustomRuleForm] = useState({
    label: '',
    category: 'Recency',
    window: '30d window',
    channel: 'All Sources',
    operator: '>=',
    value: '30',
    points: -15,
    tier: 'All Tiers'
  });

  // Load scoring rules config for this specific account (or global fallback if none exists)
  useEffect(() => {
    try {
      const accountSaved = accId ? localStorage.getItem(`customer_pulse_health_config_${accId}`) : null;
      const globalSaved = localStorage.getItem('customer_pulse_health_config');
      const saved = accountSaved || globalSaved;
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.rulesVersion === 2 && parsed.activeRules) {
          setActiveRules(parsed.activeRules);
        } else {
          // Rebase to Basic-only default
          const defaults = {};
          READY_MADE_CATALOG.forEach(r => { defaults[r.id] = r.defaultEnabled === true; });
          setActiveRules(defaults);
        }
        if (parsed.customRules) setCustomRules(parsed.customRules);
        if (parsed.tier) setSelectedTier(parsed.tier);
        if (parsed.categoryWeights) setCategoryWeights(parsed.categoryWeights);
        if (parsed.categoryEnabled) setCategoryEnabled(parsed.categoryEnabled);
      }
    } catch (e) {
      console.error('Failed to load health rules config for account:', e);
    }
  }, [accId]);

  useEffect(() => {
    const handleRulesUpdated = (e) => {
      if (e.detail?.accountId && e.detail.accountId !== accId) return; // Strict account isolation
      const payload = e.detail?.healthPayload;
      if (payload) {
        if (payload.activeRules) setActiveRules(payload.activeRules);
        if (payload.customRules) setCustomRules(payload.customRules);
        if (payload.tier) setSelectedTier(payload.tier);
        if (payload.categoryWeights) setCategoryWeights(payload.categoryWeights);
        if (payload.categoryEnabled) setCategoryEnabled(payload.categoryEnabled);
        fetchHealthData(true);
      }
    };
    window.addEventListener('health-rules-updated', handleRulesUpdated);
    return () => window.removeEventListener('health-rules-updated', handleRulesUpdated);
  }, [accId]);

  const allAvailableRules = useMemo(() => {
    return [...READY_MADE_CATALOG, ...customRules];
  }, [customRules]);

  const filteredRules = useMemo(() => {
    return allAvailableRules.filter(rule => {
      const matchesCategory = catalogCategory === 'All Criteria' ||
        (catalogCategory === 'Custom'
          ? rule.isCustom
          : (catalogCategory === 'Basic'
            ? (Boolean(rule.isBasic) || rule.category === 'Basic')
            : rule.category === catalogCategory));
      const q = ruleSearch.toLowerCase().trim();
      const matchesSearch = !q || 
        rule.label.toLowerCase().includes(q) || 
        rule.description.toLowerCase().includes(q) || 
        rule.category.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [allAvailableRules, catalogCategory, ruleSearch]);

  const activeRulesCount = useMemo(() => {
    return allAvailableRules.filter(r => {
      const parentCat = DEFAULT_HEALTH_CATEGORIES.find(c => c.categoryKey === r.category || (c.categoryKeys && c.categoryKeys.includes(r.category)) || c.name === r.category);
      if (parentCat && categoryEnabled[parentCat.id] === false) return false;
      return activeRules[r.id] === true || (activeRules[r.id] === undefined && r.defaultEnabled === true);
    }).length;
  }, [allAvailableRules, activeRules, categoryEnabled]);

  const handleAddCustomRule = () => {
    if (!customRuleForm.label.trim()) return;
    const newId = `custom_${Date.now()}`;
    const newRuleItem = {
      id: newId,
      category: customRuleForm.category,
      label: customRuleForm.label.trim(),
      description: `${customRuleForm.channel} · ${customRuleForm.operator} ${customRuleForm.value} (${customRuleForm.window})`,
      window: customRuleForm.window,
      channel: customRuleForm.channel,
      points: Number(customRuleForm.points) || -10,
      type: Number(customRuleForm.points) > 0 ? 'bonus' : 'penalty',
      tier: customRuleForm.tier,
      isCustom: true
    };
    const updatedCustom = [...customRules, newRuleItem];
    const updatedActive = { ...activeRules, [newId]: true };
    setCustomRules(updatedCustom);
    setActiveRules(updatedActive);
    const globalPayload = {
      tier: selectedTier,
      activeRules: updatedActive,
      customRules: updatedCustom
    };
    localStorage.setItem('customer_pulse_health_config', JSON.stringify(globalPayload));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('health-rules-updated', { detail: { healthPayload: globalPayload, global: true } }));
    }
    setShowAddRuleModal(false);
    setCustomRuleForm({
      label: '',
      category: 'Recency',
      window: '30d window',
      channel: 'All Sources',
      operator: '>=',
      value: '30',
      points: -15,
      tier: 'All Tiers'
    });
  };

  const handleDeleteCustomRule = (id) => {
    const updatedCustom = customRules.filter(r => r.id !== id);
    const updatedActive = { ...activeRules };
    delete updatedActive[id];
    setCustomRules(updatedCustom);
    setActiveRules(updatedActive);
    const globalPayload = {
      tier: selectedTier,
      activeRules: updatedActive,
      customRules: updatedCustom
    };
    localStorage.setItem('customer_pulse_health_config', JSON.stringify(globalPayload));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('health-rules-updated', { detail: { healthPayload: globalPayload, global: true } }));
    }
  };

  const customAdjustmentsCount = useMemo(() => {
    let count = (customRules || []).length;
    READY_MADE_CATALOG.forEach(r => {
      const isRuleActive = activeRules[r.id] === true || (activeRules[r.id] === undefined && r.defaultEnabled === true);
      if (isRuleActive !== (r.defaultEnabled === true)) count++;
    });
    return count;
  }, [customRules, activeRules]);

  const handleSaveOverrides = () => {
    setIsSaving(true);
    try {
      const configPayload = {
        rulesVersion: 2,
        tier: selectedTier,
        categoryWeights,
        categoryEnabled,
        activeRules,
        customRules,
        updatedAt: new Date().toISOString()
      };
      
      // 1. Save strictly for this specific account
      if (accId) {
        localStorage.setItem(`customer_pulse_health_config_${accId}`, JSON.stringify(configPayload));
      } else {
        localStorage.setItem('customer_pulse_health_config', JSON.stringify(configPayload));
      }
      
      // Clean up legacy account-specific keys
      try {
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith('account_scoring_rules_')) {
            localStorage.removeItem(k);
          }
        });
      } catch (e) {}

      // 2. Notify this account's components immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('health-rules-updated', { detail: { healthPayload: configPayload, accountId: accId } }));
      }

      // 3. Close modal immediately for instant feedback
      setShowConfigModal(false);
      if (showActivityToast) {
        showActivityToast(`Scoring criteria & rules for ${selectedTier} tier applied successfully`);
      }

      // 4. Background synchronization with backend without blocking UI
      (async () => {
        try {
          // Save to global backend config in healthscoreconfigs table
          await fetch(`${API_BASE}/accounts/global/health-config`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ config: configPayload })
          });

          // Also update current account
          let resultData = null;
          if (accId) {
            const res = await fetch(`${API_BASE}/accounts/${accId}/health-config`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ config: configPayload })
            });
            if (res.ok) {
              resultData = await res.json();
              if (resultData.explanation) {
                setExplanation(resultData.explanation);
              }
            }
          }
          await fetchHealthData(true);

          const effectiveScore = typeof resultData?.healthScore === 'number' ? resultData.healthScore : explanation?.healthScore;
          const effectiveStatus = resultData?.status || explanation?.status;

          if (typeof effectiveScore === 'number') {
            const store = useStore.getState();
            if (store.setAccountHealth) {
              store.setAccountHealth(accId, effectiveScore, effectiveStatus, selectedTier);
            }
          }

          if (onRecalculate) {
            onRecalculate({
              healthScore: effectiveScore,
              status: effectiveStatus,
              tier: selectedTier,
              explanation: resultData?.explanation
            });
          }
        } catch (err) {
          console.warn('Backend sync note:', err);
        }
      })();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  // Helper for gauge colors
  const getGaugeColor = (score) => {
    return getAccountHealthConfig(score).hex;
  };

  const getStatusText = (score) => {
    return getAccountHealthConfig(score).colorName;
  };

  // Calculate arc stroke offset for gauge (semicircle of radius 80)
  const arcLength = 251.2;
  const score = explanation?.healthScore ?? account?.healthScore ?? 50;
  const strokeDashoffset = arcLength - (Math.min(100, Math.max(0, score)) / 100) * arcLength;

  // Derive contacts for relationship coverage from DB
  const displayContacts = useMemo(() => {
    if (explanation?.relationshipCoverage && explanation.relationshipCoverage.length > 0) {
      return explanation.relationshipCoverage;
    }
    const accInts = (interactions || []).filter(i => (i.accountId || i.account_id) === accId);
    const now = new Date();
    return (contacts || []).map(c => {
      const cId = c.contactId || c.id;
      const cInts = accInts.filter(i => i.contactId === cId || (i.to && c.email && i.to.toLowerCase().includes(c.email.toLowerCase())));
      const lastDate = cInts.length > 0 ? (cInts[0].timestamp || cInts[0].date) : (accInts.length > 0 ? (accInts[0].timestamp || accInts[0].date) : null);
      const daysAgo = lastDate ? Math.max(0, Math.floor((now - new Date(lastDate)) / (1000 * 60 * 60 * 24))) : null;
      return {
        id: cId,
        name: c.name || 'Key Contact',
        role: c.influenceTag || c.hierarchyTag || c.role || 'Stakeholder',
        daysAgo
      };
    });
  }, [explanation?.relationshipCoverage, contacts, interactions, accId]);

  // Derive benchmark data from DB
  const benchmarkData = useMemo(() => {
    return {
      accountScore: explanation?.benchmark?.accountScore ?? score,
      orgAverage: explanation?.benchmark?.orgAverage ?? 58,
      industryBenchmark: explanation?.benchmark?.industryBenchmark ?? 65
    };
  }, [explanation?.benchmark, score]);

  // Safely parse appliedAdjustments (handles array, JSON string, or null/undefined)
  const appliedAdjustmentsList = useMemo(() => {
    if (!explanation?.appliedAdjustments) return [];
    if (Array.isArray(explanation.appliedAdjustments)) return explanation.appliedAdjustments;
    if (typeof explanation.appliedAdjustments === 'string') {
      try {
        const parsed = JSON.parse(explanation.appliedAdjustments);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }, [explanation?.appliedAdjustments]);

  // Derive touchpoints (last 5) from DB
  const displayTouchpoints = useMemo(() => {
    if (Array.isArray(explanation?.touchpoints) && explanation.touchpoints.length > 0) {
      return explanation.touchpoints.map(tp => ({
        ...tp,
        sentimentReason: tp.sentimentReason || getSpecificTouchpointReason(tp)
      }));
    }
    const accInts = (interactions || [])
      .filter(i => (i.accountId || i.account_id) === accId)
      .sort((a, b) => new Date(b.timestamp || b.date || 0) - new Date(a.timestamp || a.date || 0))
      .slice(0, 5);
    return accInts.map(i => {
      const s = (i.sentiment || '').toLowerCase();
      let sentiment = 'Neu';
      if (s.includes('pos') || i.isCelebration || i.interactionType === 'Customer Celebration') sentiment = 'Pos';
      else if (s.includes('neg') || i.riskDetected) sentiment = 'Neg';
      const item = {
        id: i.interactionId || i.id,
        sentiment,
        subject: i.subject || i.title || 'Touchpoint',
        date: i.date || (i.timestamp ? i.timestamp.slice(0, 10) : ''),
        type: i.interactionType || i.type || i.source || 'Email',
        sentimentReason: i.sentimentReason
      };
      item.sentimentReason = i.sentimentReason || getSpecificTouchpointReason(item);
      return item;
    });
  }, [explanation?.touchpoints, interactions, accId]);

  // Interaction stats (explains 30-day window vs total DB count)
  const interactionStats = useMemo(() => {
    if (explanation?.interactionStats) {
      return explanation.interactionStats;
    }
    const accInts = (interactions || []).filter(i => (i.accountId || i.account_id) === accId);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recent30d = accInts.filter(i => new Date(i.timestamp || i.date || 0) >= thirtyDaysAgo);
    const now = new Date();
    const sorted = [...accInts].sort((a, b) => new Date(b.timestamp || b.date || 0) - new Date(a.timestamp || a.date || 0));
    const daysSinceLast = sorted.length > 0 
      ? Math.max(0, Math.floor((now - new Date(sorted[0].timestamp || sorted[0].date || 0)) / (1000 * 60 * 60 * 24)))
      : null;
    return {
      totalCount: accInts.length,
      recent30dCount: recent30d.length,
      daysSinceLastInteraction: daysSinceLast,
      lastInteractionDate: sorted[0]?.date || sorted[0]?.timestamp || null
    };
  }, [explanation?.interactionStats, interactions, accId]);

  return (
    <div className="flex flex-col w-full h-full p-7 overflow-y-auto bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(15,23,42,0.03)] custom-scrollbar">
      
      {/* Header */}
      <div className="mb-6 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            Account health · {account?.name || account?.companyName || 'Account'}
          </h2>
          <div className="text-sm text-gray-500 mt-1.5 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#ECFDF5] text-[#15803D] border border-[#BBF7D0]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Live Auto-Synced
            </span>
            <span>7-factor behavioral scoring engine · Live database data</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-800 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <Settings className="w-4 h-4" /> Customize scoring
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          
          {/* Health Score */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_2px_10px_rgba(15,23,42,0.03)] flex flex-col items-center relative">
             <div className="flex items-center gap-1.5 mb-6">
               <h3 className="text-slate-900 font-bold text-sm">Health score</h3>
               <InfoTooltip
                 title={explanation?.tooltips?.healthScore?.title || `Overall Health Score (${score}/100)`}
                 status={explanation?.tooltips?.healthScore?.status || getAccountHealthConfig(score).status}
                 why={explanation?.tooltips?.healthScore?.why || "Weighted composite score synthesized across 7 core behavioral categories from live database interactions, tasks, sentiment, and stakeholder mapping."}
                 formula={explanation?.tooltips?.healthScore?.formula || "Score = Σ (Category Score × Category Weight)"}
                 note="Healthy: 70–100 · Warning: 40–69 · Critical: <40"
                 align="center"
               />
             </div>
             
             <div className="relative flex items-center justify-center mb-4">
               <svg width="200" height="110" viewBox="0 0 200 110" className="overflow-hidden">
                 <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#e5e7eb" strokeWidth="16" strokeLinecap="round" />
                 <path 
                   d="M 20 100 A 80 80 0 0 1 180 100" 
                   fill="none" 
                   stroke={getGaugeColor(score)} 
                   strokeWidth="16" 
                   strokeLinecap="round" 
                   strokeDasharray="251.2 251.2" 
                   strokeDashoffset={strokeDashoffset} 
                   className="transition-all duration-1000 ease-out" 
                 />
               </svg>
               <div className="absolute bottom-2 left-0 w-full text-center">
                 <span className="text-[2.75rem] font-medium tracking-tight text-gray-900">{score}</span>
               </div>
             </div>

             <div className="text-sm font-semibold flex items-center gap-1">
               {(() => {
                 const healthCfg = getAccountHealthConfig(score);
                 return (
                   <span style={{ color: healthCfg.hex }} className="font-bold">
                     {healthCfg.badgeText}
                   </span>
                 );
               })()}
             </div>
             <div className="text-xs text-gray-500 mt-1.5 font-medium">
               7-Factor Behavioral Engine · {customAdjustmentsCount > 0 ? `${customAdjustmentsCount} rule adjustment${customAdjustmentsCount > 1 ? 's' : ''} applied` : 'Standard enterprise baseline'}
             </div>
          </div>

            {/* Key signals */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-slate-900 font-bold text-sm">Key signals</h3>
                  <InfoTooltip
                    title="Key Behavioral Health Signals"
                    why="High-priority operational indicators reflecting recent engagement rhythm, response velocity, SLA execution, and open risk exposure."
                    align="left"
                  />
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Live DB</span>
              </div>
              <div className="grid grid-cols-2 gap-y-6">
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-1 flex items-center justify-between pr-2">
                    <div className="flex items-center gap-1">
                      <span>Engagement (30d)</span>
                      <InfoTooltip
                        title={explanation?.tooltips?.engagement?.title || "Engagement Frequency"}
                        status={explanation?.tooltips?.engagement?.status || `${interactionStats.recent30dCount} in 30d (${interactionStats.totalCount} total)`}
                        why={
                          explanation?.tooltips?.engagement?.why || (
                            interactionStats.recent30dCount === 0
                              ? `0 touches logged in the last 30 days. Although there are ${interactionStats.totalCount} historical interactions stored in PostgreSQL, the last contact was ${interactionStats.daysSinceLastInteraction} days ago (>30d). Since more than 30 days have elapsed without active touchpoints, this triggers an inactivity penalty.`
                              : `${interactionStats.recent30dCount} customer touches logged across meetings, calls, and emails within the rolling 30-day window.`
                          )
                        }
                        formula={explanation?.tooltips?.engagement?.formula || "≥8 touches: 100 | 4–7: 75 | 2–3: 50 | 1: 25 | 0: 0 (-20 pts)"}
                        note="Evaluates customer touchpoints in a rolling 30-day window."
                        placement="top"
                        align="left"
                      />
                    </div>
                    {interactionStats.totalCount > 0 && (
                      <span className="text-[10px] text-slate-400 font-medium">({interactionStats.totalCount} total)</span>
                    )}
                  </div>
                  <div className="text-xl font-bold text-gray-900">
                    {interactionStats.recent30dCount > 0 ? `${interactionStats.recent30dCount} touches` : '0 in last 30d'}
                  </div>
                  {interactionStats.daysSinceLastInteraction != null && (
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Last contact: {interactionStats.daysSinceLastInteraction}d ago
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                    <span>Email responsiveness</span>
                    <InfoTooltip
                      title={explanation?.tooltips?.responsiveness?.title || "Email Responsiveness & Turnaround"}
                      status={explanation?.tooltips?.responsiveness?.status || `${explanation?.factors?.communicationResponsiveness?.score ?? 100}%`}
                      why={
                        explanation?.tooltips?.responsiveness?.why ||
                        "Measures turnaround velocity on customer inquiries. Starts at a clean 100% baseline. Deducts 20 points for each customer follow-up or email left unanswered. Currently, 0 open customer inquiries or follow-ups are pending in the database."
                      }
                      formula={explanation?.tooltips?.responsiveness?.formula || "Score = max(0, 100 - (unanswered_threads × 20))"}
                      note="100% indicates zero delinquent or overdue customer threads awaiting reply (+15 health bonus)."
                      placement="top"
                      align="right"
                    />
                  </div>
                  <div className="text-xl font-bold text-gray-900">{explanation?.factors?.communicationResponsiveness?.score ?? 100}%</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                    <span>Overdue commitments</span>
                    <InfoTooltip
                      title={explanation?.tooltips?.overdueCommitments?.title || "Commitments & Task SLAs"}
                      status={explanation?.tooltips?.overdueCommitments?.status || `${effectiveOverdueCount} Overdue`}
                      why={
                        explanation?.tooltips?.overdueCommitments?.why || (
                          effectiveOverdueCount > 0
                            ? `Found ${effectiveOverdueCount} commitment or task past its due date${overdueTaskTitle ? `: "${overdueTaskTitle}"` : ''}. Overdue commitments penalize health by 15 points.`
                            : 'All customer commitments, project milestones, and staff action items are currently on schedule.'
                        )
                      }
                      formula={explanation?.tooltips?.overdueCommitments?.formula || "0 overdue: 100 pts (+10 bonus) | ≥1 overdue: -15 pts penalty"}
                      placement="bottom"
                      align="left"
                    />
                  </div>
                  <div className={`text-xl font-bold ${effectiveOverdueCount > 0 ? 'text-rose-600' : 'text-gray-900'}`}>
                    {effectiveOverdueCount > 0 ? `${effectiveOverdueCount} Overdue` : '0 Overdue'}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                    <span>Risk health</span>
                    <InfoTooltip
                      title={explanation?.tooltips?.riskHealth?.title || "Risk Health Status"}
                      status={explanation?.tooltips?.riskHealth?.status || ((explanation?.factors?.riskSignals?.score ?? 100) === 100 ? 'Low risk (100%)' : `${explanation?.factors?.riskSignals?.score || 60}%`)}
                      why={
                        explanation?.tooltips?.riskHealth?.why || (
                          (explanation?.factors?.riskSignals?.score ?? 100) === 100
                            ? 'Evaluated from active risk tickets in the Risks module. Currently, 0 High or Critical risk flags are active for this account, granting a +15 pt positive health driver.'
                            : (explanation?.factors?.riskSignals?.reason || 'Active risk flags or competitor mentions have been detected.')
                        )
                      }
                      formula={explanation?.tooltips?.riskHealth?.formula || "0 active risks: 100 pts (+15 bonus) | Medium: 60 | High/Critical: 20"}
                      placement="bottom"
                      align="right"
                    />
                  </div>
                  <div className="text-xl font-bold text-gray-900">{(explanation?.factors?.riskSignals?.score ?? 100) === 100 ? 'Low risk' : `${explanation?.factors?.riskSignals?.score || 60}%`}</div>
                </div>
              </div>
            </div>

          {/* Category breakdown */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-1.5">
                <h3 className="text-slate-900 font-bold text-sm">Category breakdown</h3>
                <InfoTooltip
                  title="7-Factor Behavioral Engine Categories"
                  why="Each category evaluates a distinct dimension of account health. Hover over the (i) icon on any category to view its scoring formula and database calculation logic."
                  align="left"
                />
              </div>
              <span className="px-2.5 py-0.5 bg-[#E8F0FE] text-[#1D4ED8] text-[11px] font-bold rounded-md">Live DB</span>
            </div>
            
            <div className="space-y-4">
              {[
                { 
                  label: 'Engagement', 
                  weight: '20%', 
                  val: explanation?.factors?.engagementFrequency?.score ?? (score >= 60 ? 60 : 0),
                  why: explanation?.tooltips?.categories?.engagement?.why || explanation?.factors?.engagementFrequency?.reason || 'Touchpoint recency & frequency over the rolling 30-day window.',
                  formula: explanation?.tooltips?.categories?.engagement?.formula || 'Volume vs 30d targets (≥8: 100, 4–7: 75, 2–3: 50, 0: 0)'
                },
                { 
                  label: 'Responsiveness', 
                  weight: '15%', 
                  val: explanation?.factors?.communicationResponsiveness?.score ?? 100,
                  why: explanation?.tooltips?.categories?.responsiveness?.why || explanation?.factors?.communicationResponsiveness?.reason || 'Turnaround velocity on customer emails. Base 100% minus 20 points per unanswered thread.',
                  formula: explanation?.tooltips?.categories?.responsiveness?.formula || 'max(0, 100 - (unanswered_threads × 20))'
                },
                { 
                  label: 'Sentiment', 
                  weight: '15%', 
                  val: explanation?.factors?.sentimentTrend?.score ?? 70,
                  why: explanation?.tooltips?.categories?.sentiment?.why || explanation?.factors?.sentimentTrend?.reason || 'AI tone analysis averaged across the 5 most recent customer interactions in PostgreSQL.',
                  formula: explanation?.tooltips?.categories?.sentiment?.formula || 'Pos = 100, Neu = 60, Neg = 0'
                },
                { 
                  label: 'Stakeholders', 
                  weight: '15%', 
                  val: explanation?.factors?.stakeholderCoverage?.score ?? 50,
                  why: explanation?.tooltips?.categories?.stakeholders?.why || explanation?.factors?.stakeholderCoverage?.signals?.join('; ') || 'Assesses executive sponsor (CXO/VP), Decision Maker, and Champion contact mapping.',
                  formula: explanation?.tooltips?.categories?.stakeholders?.formula || 'CXO + Decision Maker = 100 | CXO/DM = 85 | Champion = 70 | Other = 50'
                },
                { 
                  label: 'Risk Signals', 
                  weight: '15%', 
                  val: explanation?.factors?.riskSignals?.score ?? 100,
                  why: explanation?.tooltips?.categories?.riskSignals?.why || explanation?.factors?.riskSignals?.reason || 'Evaluates active risk alerts, competitor mentions, and escalations in the Risks system.',
                  formula: explanation?.tooltips?.categories?.riskSignals?.formula || '100 minus active severity penalties (0 active risks = 100)'
                },
                { 
                  label: 'Commitments', 
                  weight: '10%', 
                  val: explanation?.factors?.commitments?.score ?? (effectiveOverdueCount > 0 ? 85 : 100),
                  why: explanation?.tooltips?.categories?.commitments?.why || (
                    effectiveOverdueCount > 0 
                      ? `${effectiveOverdueCount} overdue task commitment(s) pending resolution.`
                      : 'All customer commitments and staff action items are completed on schedule.'
                  ),
                  formula: explanation?.tooltips?.categories?.commitments?.formula || '0 overdue: 100 pts | 1 overdue: 85 pts | 2+ overdue: 60 pts'
                },
                { 
                  label: 'Business Signals', 
                  weight: '10%', 
                  val: explanation?.factors?.businessSignals?.score ?? 50,
                  why: explanation?.tooltips?.categories?.businessSignals?.why || 'Tracks commercial expansion, upsell opportunities, and milestone completion. 50% baseline without active expansion or commercial risk.',
                  formula: explanation?.tooltips?.categories?.businessSignals?.formula || 'Expansion (+pts) vs Churn/Budget risk (-pts)'
                }
              ].map((f, i) => (
                <div key={i} className="flex items-center">
                  <div className="w-36 text-sm text-gray-900 flex items-center gap-1">
                    <span>{f.label}</span>
                    <span className="text-gray-400 text-xs">{f.weight}</span>
                    <InfoTooltip
                      title={`${f.label} (${f.weight} Weight)`}
                      status={`${f.val}/100`}
                      why={f.why}
                      formula={f.formula}
                      placement="right"
                    />
                  </div>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden mx-3">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${f.val >= 70 ? 'bg-emerald-500' : f.val >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} 
                      style={{ width: `${Math.min(100, Math.max(0, f.val))}%` }}
                    ></div>
                  </div>
                  <div className="w-8 text-right text-sm font-semibold">{f.val}</div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column */}
        <div className="space-y-6">
          
          {/* AI health summary */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-slate-900 font-bold text-sm">AI health summary</h3>
              <span className="px-2.5 py-0.5 bg-[#E8F0FE] text-[#1D4ED8] text-[11px] font-bold rounded-md">Live AI Synthesis</span>
            </div>
            <p className="text-[15px] text-gray-900 leading-relaxed font-normal">
              {explanation?.aiAnalysisSummary || explanation?.summary || (
                score < 70 
                  ? `Health score is in the ${getAccountHealthConfig(score).status} range (${score}/100). Engagement and commitment signals require attention to stabilize account health.`
                  : `Account health is strong at ${score}/100 (${getAccountHealthConfig(score).status}) with healthy engagement and communication responsiveness.`
              )}
            </p>
          </div>

          {/* Why this score */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5">
                <h3 className="text-slate-900 font-bold text-sm">Why this score</h3>
                <InfoTooltip
                  title="Score Adjustment Drivers"
                  why="Lists all positive credits and negative deductions applied to the account health score by the PostgreSQL calculation engine."
                  align="left"
                />
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Live Rules</span>
            </div>
            
            <div className="space-y-3 mb-4">
              {appliedAdjustmentsList.length > 0 ? (
                appliedAdjustmentsList.map((adj, idx) => (
                  <div key={idx} className="flex justify-between items-center py-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] text-gray-900 font-medium">{adj.label}</span>
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {adj.category}
                      </span>
                    </div>
                    <span className={`text-[15px] font-bold ${adj.points < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {adj.points > 0 ? `+${adj.points}` : adj.points}
                    </span>
                  </div>
                ))
              ) : (
                <>
                  {(explanation?.factors?.engagementFrequency?.score ?? 0) === 0 && (
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] text-gray-900 font-medium">No logged interaction in last 30 days</span>
                        <InfoTooltip
                          title={explanation?.tooltips?.whyThisScore?.inactivity?.title || "Engagement Inactivity Penalty"}
                          status={explanation?.tooltips?.whyThisScore?.inactivity?.status || "-20 pts"}
                          why={explanation?.tooltips?.whyThisScore?.inactivity?.why || `0 customer interactions logged in the rolling 30-day window (last touchpoint was ${interactionStats.daysSinceLastInteraction}d ago). Regular communication is required to sustain health.`}
                          formula={explanation?.tooltips?.whyThisScore?.inactivity?.formula || "0 touches in 30d = -20 pts"}
                          placement="right"
                        />
                      </div>
                      <span className="text-[15px] font-bold text-red-500">-20</span>
                    </div>
                  )}
                  {explanation?.factors?.stakeholderCoverage?.signals?.map((s, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] text-gray-900 font-medium">{s}</span>
                        <InfoTooltip
                          title={explanation?.tooltips?.whyThisScore?.stakeholders?.title || "Stakeholder Coverage Gap"}
                          status={explanation?.tooltips?.whyThisScore?.stakeholders?.status || "-10 pts"}
                          why={explanation?.tooltips?.whyThisScore?.stakeholders?.why || `${s}. Having single-threaded or unmapped executive relationships introduces account churn risk.`}
                          formula={explanation?.tooltips?.whyThisScore?.stakeholders?.formula || "Missing key stakeholder role = -10 pts"}
                          placement="right"
                        />
                      </div>
                      <span className="text-[15px] font-bold text-amber-500">-10</span>
                    </div>
                  ))}
                  {(explanation?.factors?.sentimentTrend?.score ?? 70) < 50 && (
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] text-gray-900 font-medium">Negative sentiment trend detected</span>
                        <InfoTooltip
                          title={explanation?.tooltips?.whyThisScore?.sentiment?.title || "Sentiment Trend Penalty"}
                          status={explanation?.tooltips?.whyThisScore?.sentiment?.status || "-15 pts"}
                          why={explanation?.tooltips?.whyThisScore?.sentiment?.why || "Average sentiment across recent interactions fell below 50%, detecting dissatisfaction, critical remarks, or client frustration."}
                          formula={explanation?.tooltips?.whyThisScore?.sentiment?.formula || "Sentiment score < 50% = -15 pts"}
                          placement="right"
                        />
                      </div>
                      <span className="text-[15px] font-bold text-red-500">-15</span>
                    </div>
                  )}
                  {effectiveOverdueCount > 0 ? (
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] text-gray-900 font-medium">
                          {effectiveOverdueCount === 1 ? 'Overdue task commitment pending' : `${effectiveOverdueCount} overdue task commitments pending`}
                        </span>
                        <InfoTooltip
                          title={explanation?.tooltips?.whyThisScore?.commitmentsBreach?.title || "Task Commitment SLA Breach"}
                          status={explanation?.tooltips?.whyThisScore?.commitmentsBreach?.status || "-15 pts"}
                          why={explanation?.tooltips?.whyThisScore?.commitmentsBreach?.why || `Detected ${effectiveOverdueCount} overdue task commitment${overdueTaskTitle ? `: "${overdueTaskTitle}"` : ''}. Delayed deliverables penalize trust and health.`}
                          formula={explanation?.tooltips?.whyThisScore?.commitmentsBreach?.formula || "≥1 overdue task = -15 pts"}
                          placement="right"
                        />
                      </div>
                      <span className="text-[15px] font-bold text-red-500">-15</span>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] text-gray-900 font-medium">All tasks and commitments on schedule</span>
                        <InfoTooltip
                          title={explanation?.tooltips?.whyThisScore?.commitmentsBonus?.title || "Commitment Execution Bonus"}
                          status={explanation?.tooltips?.whyThisScore?.commitmentsBonus?.status || "+10 pts"}
                          why={explanation?.tooltips?.whyThisScore?.commitmentsBonus?.why || "Zero overdue customer commitments. All deliverables, action items, and task deadlines are met on time."}
                          formula={explanation?.tooltips?.whyThisScore?.commitmentsBonus?.formula || "0 overdue tasks = +10 pts bonus"}
                          placement="right"
                        />
                      </div>
                      <span className="text-[15px] font-bold text-emerald-500">+10</span>
                    </div>
                  )}
                  {(explanation?.factors?.riskSignals?.score ?? 100) === 100 && (
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] text-gray-900 font-medium">No active risk flags</span>
                        <InfoTooltip
                          title={explanation?.tooltips?.whyThisScore?.cleanRisk?.title || "Clean Risk Health Bonus"}
                          status={explanation?.tooltips?.whyThisScore?.cleanRisk?.status || "+15 pts"}
                          why={explanation?.tooltips?.whyThisScore?.cleanRisk?.why || "Zero active High or Critical risk flags open in the system. Full health credit awarded."}
                          formula={explanation?.tooltips?.whyThisScore?.cleanRisk?.formula || "0 active risk flags = +15 pts bonus"}
                          placement="right"
                        />
                      </div>
                      <span className="text-[15px] font-bold text-emerald-500">+15</span>
                    </div>
                  )}
                  {(explanation?.factors?.communicationResponsiveness?.score ?? 100) === 100 && (
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[15px] text-gray-900 font-medium">No unanswered customer follow-ups</span>
                        <InfoTooltip
                          title={explanation?.tooltips?.whyThisScore?.responsivenessBonus?.title || "Communication Responsiveness Bonus"}
                          status={explanation?.tooltips?.whyThisScore?.responsivenessBonus?.status || "+15 pts"}
                          why={explanation?.tooltips?.whyThisScore?.responsivenessBonus?.why || "All customer inquiries and communications have been addressed with 0 delinquent or unanswered threads in the database."}
                          formula={explanation?.tooltips?.whyThisScore?.responsivenessBonus?.formula || "0 unanswered follow-ups = +15 pts bonus"}
                          placement="right"
                        />
                      </div>
                      <span className="text-[15px] font-bold text-emerald-500">+15</span>
                    </div>
                  )}
                </>
              )}
            </div>
            
            <p className="text-[11px] text-gray-400 font-medium">Synchronized directly with PostgreSQL health calculation engine.</p>
          </div>

          {/* Improve this score */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-slate-900 font-bold text-sm">Improve this score</h3>
              <span className="px-2.5 py-0.5 bg-[#E8F0FE] text-[#1D4ED8] text-[11px] font-bold rounded-md">Live Actions</span>
            </div>
            
            <div className="space-y-4 mb-6">
              {(explanation?.factors?.commitments?.score ?? 100) < 100 && (
                <div className="flex justify-between items-center gap-3">
                  <span className="text-sm text-gray-900 font-medium flex-1">Resolve overdue task commitments</span>
                  <span className="px-2 py-0.5 bg-rose-100 text-rose-700 font-bold text-xs rounded">+15</span>
                </div>
              )}
              {(explanation?.factors?.engagementFrequency?.score ?? 50) < 70 && (
                <div className="flex justify-between items-center gap-3">
                  <span className="text-sm text-gray-900 font-medium flex-1">Log customer meeting or call</span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 font-bold text-xs rounded">+20</span>
                </div>
              )}
              {(explanation?.factors?.stakeholderCoverage?.score ?? 50) < 80 && (
                <div className="flex justify-between items-center gap-3">
                  <span className="text-sm text-gray-900 font-medium flex-1">Map Champion & Decision-Maker</span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 font-bold text-xs rounded">+15</span>
                </div>
              )}
              {(explanation?.factors?.communicationResponsiveness?.score ?? 100) < 80 && (
                <div className="flex justify-between items-center gap-3">
                  <span className="text-sm text-gray-900 font-medium flex-1">Respond to unanswered client follow-ups</span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 font-bold text-xs rounded">+15</span>
                </div>
              )}
            </div>
            
            <p className="text-sm font-medium text-gray-900">
              Potential Health Target: <span className="text-emerald-600 font-bold">{score} → {Math.min(100, score + 25)} (Healthy)</span>
            </p>
          </div>

        </div>
      </div>

      {/* Full-Width Score Trend Graph (Displayed from Left to Right of the page) */}
      <div className="w-full mt-6">
        <ScoreTrendGraph
          accountId={accId}
          currentScore={score}
          status={status}
          fullWidth={true}
        />
      </div>

      {/* Bottom Row - 3 Cols with Real DB Data */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {/* Relationship coverage */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_2px_10px_rgba(15,23,42,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-slate-900 font-bold text-sm">Relationship coverage</h3>
              <span className="px-2.5 py-0.5 bg-[#ECFDF5] text-[#15803D] border border-[#BBF7D0] text-[11px] font-bold rounded-md">Live DB</span>
            </div>
            <div className="space-y-3">
              {displayContacts && displayContacts.length > 0 ? (
                displayContacts.slice(0, 4).map((c, idx) => (
                  <div key={c.id || idx} className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-sm text-gray-900 font-medium">{c.name}</span>
                      <span className="text-[11px] text-slate-500">{c.role || c.influenceTag || 'Key Stakeholder'}</span>
                    </div>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      c.daysAgo == null ? 'bg-slate-100 text-slate-600' :
                      c.daysAgo <= 14 ? 'bg-emerald-100 text-emerald-700' :
                      c.daysAgo <= 45 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {c.daysAgo != null ? `${c.daysAgo} days ago` : 'Mapped'}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 py-3 text-center">No contacts currently mapped</p>
              )}
            </div>
          </div>
          {displayContacts.length > 4 && (
            <span className="text-[11px] text-slate-400 mt-3 block">+{displayContacts.length - 4} additional contacts</span>
          )}
        </div>

        {/* Benchmark */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-slate-900 font-bold text-sm">Benchmark</h3>
            <span className="px-2.5 py-0.5 bg-[#ECFDF5] text-[#15803D] border border-[#BBF7D0] text-[11px] font-bold rounded-md">Live DB</span>
          </div>
          <div className="space-y-4">
            <div className="flex items-center">
              <div className="w-24 text-sm text-gray-900">This account</div>
              <div className="flex-1 h-2 bg-gray-200 rounded-full mx-2 flex">
                <div className={`h-full rounded-l-full ${score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{width: `${Math.min(100, Math.max(0, score))}%`}}></div>
              </div>
              <div className="w-6 text-right text-sm font-bold">{score}</div>
            </div>
            <div className="flex items-center">
              <div className="w-24 text-sm text-gray-900">Org average</div>
              <div className="flex-1 h-2 bg-gray-200 rounded-full mx-2 flex">
                <div className="h-full bg-blue-500 rounded-l-full" style={{width: `${Math.min(100, Math.max(0, benchmarkData.orgAverage))}%`}}></div>
              </div>
              <div className="w-6 text-right text-sm font-semibold">{benchmarkData.orgAverage}</div>
            </div>
            <div className="flex items-center">
              <div className="w-24 text-sm text-gray-900 leading-tight">Industry<br/>benchmark</div>
              <div className="flex-1 h-2 bg-gray-200 rounded-full mx-2 flex">
                <div className="h-full bg-blue-400 rounded-l-full" style={{width: `${Math.min(100, Math.max(0, benchmarkData.industryBenchmark))}%`}}></div>
              </div>
              <div className="w-6 text-right text-sm font-semibold">{benchmarkData.industryBenchmark}</div>
            </div>
          </div>
        </div>

        {/* Sentiment, last 5 touchpoints */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-[0_2px_10px_rgba(15,23,42,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-1.5">
                <h3 className="text-slate-900 font-bold text-sm leading-tight">Sentiment, last 5<br/>touchpoints</h3>
                <InfoTooltip
                  title="Recent Touchpoint Sentiment"
                  status={`${explanation?.factors?.sentimentTrend?.score ?? 70}/100`}
                  why="Evaluates AI sentiment tone across the 5 most recent customer interactions in PostgreSQL. Pos (Positive) = 100%, Neu (Neutral) = 60%, Neg (Negative) = 0%."
                  formula="Average of last 5 touchpoint scores"
                  note="Hover on each sentiment pill to inspect the touchpoint title & reason."
                  align="right"
                />
              </div>
              <span className="px-2.5 py-0.5 bg-[#ECFDF5] text-[#15803D] border border-[#BBF7D0] text-[11px] font-bold rounded-md">Live DB</span>
            </div>
            <div className="flex gap-2 mb-4 flex-wrap">
              {displayTouchpoints && displayTouchpoints.length > 0 ? (
                displayTouchpoints.map((tp, idx) => (
                  <div key={tp.id || idx} className="relative inline-flex group/pill">
                    <span 
                      className={`px-2.5 py-0.5 text-xs font-semibold rounded-full cursor-help transition-transform hover:scale-105 ${
                        tp.sentiment === 'Pos' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' :
                        tp.sentiment === 'Neg' ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                        'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {tp.sentiment}
                    </span>
                    {/* Floating Pill Tooltip */}
                    <div className="absolute z-[70] top-full left-0 sm:left-1/2 sm:-translate-x-1/2 mt-2.5 hidden group-hover/pill:flex flex-col w-64 sm:w-72 p-3 bg-white text-slate-800 text-[11px] rounded-xl shadow-[0_12px_28px_-4px_rgba(15,23,42,0.12),0_4px_10px_-2px_rgba(15,23,42,0.06)] border border-slate-200/90 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                      {/* Upward pointing arrow beak */}
                      <div className="absolute -top-1.5 left-5 sm:left-1/2 sm:-translate-x-1/2 w-2.5 h-2.5 bg-white border-t border-l border-slate-200 rotate-45" />

                      <div className="flex items-start justify-between gap-2 pb-1.5 mb-1.5 border-b border-slate-100 relative z-10">
                        <div className="flex flex-col flex-1 min-w-0 pr-1">
                          <span className="font-bold text-slate-900 text-xs leading-snug line-clamp-2">{tp.subject || 'Touchpoint'}</span>
                          <span className="text-[10px] text-slate-500 mt-0.5">{tp.type || 'Customer Touchpoint'}{tp.date ? ` · ${tp.date}` : ''}</span>
                        </div>
                        <span className={`text-[9.5px] px-2 py-0.5 rounded font-bold uppercase shrink-0 ${
                          tp.sentiment === 'Pos' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          tp.sentiment === 'Neg' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                          'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {tp.sentiment === 'Pos' ? 'Positive' : tp.sentiment === 'Neg' ? 'Negative' : 'Neutral'}
                        </span>
                      </div>
                      <div className="text-slate-600 text-[11px] leading-snug relative z-10">
                        <strong className="text-blue-700 font-semibold">Why this sentiment? </strong>
                        {tp.sentimentReason || getSpecificTouchpointReason(tp)}
                      </div>
                      {tp.date && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between relative z-10">
                          <span>Logged in PostgreSQL</span>
                          <span className="font-medium text-slate-600">{tp.date}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <span className="text-xs text-slate-400 italic">No touchpoints recorded</span>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-600 line-clamp-2 mt-2">
            {explanation?.touchpointNote || 'All recent communications recorded from database.'}
          </p>
        </div>
      </div>

      {/* Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-100">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    Customize Scoring Criteria & Rules
                    <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Interaction-Driven Engine
                    </span>
                  </h3>

                </div>
              </div>
              <button 
                onClick={() => setShowConfigModal(false)} 
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
              
              {/* Category Weights & Activation for Health Score */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                      Category Weights & Activation
                    </h4>
                    <p className="text-xs text-slate-500">
                      Admin-editable weights (default sum: 100). Uncheck a category to disable it entirely from health score calculation.
                    </p>
                  </div>
                  <div className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-xl">
                    Active Weights Sum: <strong className={
                      DEFAULT_HEALTH_CATEGORIES.reduce((sum, c) => sum + (categoryEnabled[c.id] !== false ? (Number(categoryWeights[c.id]) || 0) : 0), 0) === 100
                        ? 'text-slate-900'
                        : 'text-amber-700'
                    }>{
                      DEFAULT_HEALTH_CATEGORIES.reduce((sum, c) => sum + (categoryEnabled[c.id] !== false ? (Number(categoryWeights[c.id]) || 0) : 0), 0)
                    }</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                  {DEFAULT_HEALTH_CATEGORIES.map(cat => {
                    const isEnabled = categoryEnabled[cat.id] !== false;
                    const weight = categoryWeights[cat.id] ?? cat.weight;

                    return (
                      <div
                        key={cat.id}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          isEnabled ? 'bg-white border-slate-200 shadow-2xs' : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                            {cat.id === 'Basic' ? 'Basic Category' : `Category ${cat.id}`}
                          </span>
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={e => setCategoryEnabled({ ...categoryEnabled, [cat.id]: e.target.checked })}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                            title={isEnabled ? 'Disable category from health calculation' : 'Enable category for health calculation'}
                          />
                        </div>
                        <h5 className="text-xs font-bold text-slate-900 leading-snug mb-1">
                          {cat.name}
                        </h5>
                        <p className="text-[10px] text-slate-500 line-clamp-2 mb-2.5">
                          {cat.description}
                        </p>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <span className="text-[11px] font-medium text-slate-500">Weight:</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              disabled={!isEnabled}
                              value={weight}
                              onChange={e => setCategoryWeights({
                                ...categoryWeights,
                                [cat.id]: Math.max(0, parseInt(e.target.value) || 0)
                              })}
                              className="w-14 px-2 py-0.5 text-xs font-bold text-center border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 disabled:opacity-50"
                            />
                            <span className="text-xs text-slate-400 font-semibold">%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Category Filter Pills & Search & Add Custom Rule */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 max-w-md bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-2xs focus-within:border-primary">
                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                    <input 
                      type="text"
                      value={ruleSearch}
                      onChange={e => setRuleSearch(e.target.value)}
                      placeholder="Search scoring criteria, metrics or keywords..."
                      className="w-full text-xs bg-transparent outline-none text-slate-800 placeholder-slate-400"
                    />
                    {ruleSearch && (
                      <button onClick={() => setRuleSearch('')} className="text-slate-400 hover:text-slate-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <button 
                    type="button"
                    onClick={() => setShowAddRuleModal(true)}
                    className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3.5 py-2 rounded-xl transition-colors shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Add Custom Rule
                  </button>
                </div>

                {/* Category Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 custom-scrollbar text-xs">
                  {CATALOG_CATEGORIES.map(cat => {
                    const count = cat === 'All Criteria' 
                      ? allAvailableRules.length 
                      : (cat === 'Basic'
                        ? allAvailableRules.filter(r => r.isBasic || r.category === 'Basic').length
                        : allAvailableRules.filter(r => r.category === cat).length);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCatalogCategory(cat)}
                        className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
                          catalogCategory === cat 
                            ? 'bg-slate-900 text-white shadow-2xs' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                        }`}
                      >
                        <span>{cat}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                          catalogCategory === cat ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                  {customRules.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCatalogCategory('Custom')}
                      className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
                        catalogCategory === 'Custom' 
                          ? 'bg-slate-900 text-white shadow-2xs' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                      }`}
                    >
                      <span>Custom Rules</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full font-extrabold bg-purple-100 text-purple-700">
                        {customRules.length}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Ready-Made Criteria Catalog Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>Displaying {filteredRules.length} scoring criteria</span>
                  <span className="text-emerald-700 font-extrabold">{activeRulesCount} of {allAvailableRules.length} active</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {filteredRules.map(rule => {
                    const isRuleActive = activeRules[rule.id] === true || (activeRules[rule.id] === undefined && rule.defaultEnabled === true);
                    const isEnabled = isRuleActive;
                    const isBonus = (rule.points || 0) > 0 || rule.type === 'bonus';
                    const pointsStr = isBonus ? `+${Math.abs(rule.points)} pts` : `-${Math.abs(rule.points)} pts`;

                    return (
                      <div 
                        key={rule.id}
                        className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                          isEnabled 
                            ? 'bg-white border-slate-200/90 shadow-2xs hover:border-slate-300' 
                            : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                        }`}
                      >
                        {/* Top Meta */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/70">
                                {rule.category}
                              </span>
                              {rule.isBasic && (
                                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                                  Basic
                                </span>
                              )}
                              {(() => {
                                const parentCat = DEFAULT_HEALTH_CATEGORIES.find(c => c.categoryKey === rule.category || (c.categoryKeys && c.categoryKeys.includes(rule.category)) || c.name === rule.category);
                                return parentCat && categoryEnabled[parentCat.id] === false ? (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                                    Category Off
                                  </span>
                                ) : null;
                              })()}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {rule.isCustom && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCustomRule(rule.id)}
                                  className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                                  title="Delete custom rule"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full border ${
                                isBonus 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}>
                                {pointsStr}
                              </span>
                            </div>
                          </div>

                          <h5 className="text-xs font-bold text-slate-900 leading-snug">
                            {rule.label}
                          </h5>
                          <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                            {rule.description}
                          </p>
                        </div>

                        {/* Bottom Bar: Window, Channel, and Toggle Switch */}
                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                              {rule.window || '30d'}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                              {rule.channel || 'All'}
                            </span>
                          </div>

                          {/* Toggle Switch */}
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={() => setActiveRules({ ...activeRules, [rule.id]: !isRuleActive })}
                              className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out ${
                                isEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                              title={isEnabled ? 'Click to disable rule' : 'Click to enable rule'}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                isEnabled ? 'translate-x-[22px]' : 'translate-x-[2px]'
                              }`} />
                            </button>
                          ) : (
                            <div className="relative inline-block w-10 align-middle select-none shrink-0" title="Locked by system administrator">
                              <input 
                                type="checkbox" 
                                checked={isEnabled} 
                                disabled 
                                className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-not-allowed right-0 border-emerald-400 bg-emerald-400"
                              />
                              <label className="toggle-label block overflow-hidden h-5 rounded-full bg-emerald-400 cursor-not-allowed" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500 font-medium hidden sm:block">
                <span>Active Rules: <strong className="text-slate-900 font-bold">{activeRulesCount}</strong> / {allAvailableRules.length} · Dynamic PostgreSQL calculation</span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  type="button" 
                  onClick={() => setShowConfigModal(false)} 
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  disabled={isSaving} 
                  onClick={handleSaveOverrides}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:opacity-90 shadow-sm transition-opacity disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? 'Applying to Account Health...' : 'Save & Apply Adjustments'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Add Custom Rule Modal (Rule Builder) */}
      {showAddRuleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" /> Custom Rule Builder
              </h3>
              <button onClick={() => setShowAddRuleModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rule Name / Condition</label>
                <input 
                  type="text" 
                  value={customRuleForm.label}
                  onChange={e => setCustomRuleForm({ ...customRuleForm, label: e.target.value })}
                  placeholder="e.g. Unresolved technical blocker > 14 days"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-primary text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Metric Category</label>
                  <select
                    value={customRuleForm.category}
                    onChange={e => setCustomRuleForm({ ...customRuleForm, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-primary text-xs font-medium bg-white"
                  >
                    {CATALOG_CATEGORIES.filter(c => c !== 'All Criteria').map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Time Window</label>
                  <select
                    value={customRuleForm.window}
                    onChange={e => setCustomRuleForm({ ...customRuleForm, window: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-primary text-xs font-medium bg-white"
                  >
                    <option value="7d window">7 days</option>
                    <option value="14d window">14 days</option>
                    <option value="30d window">30 days</option>
                    <option value="60d window">60 days</option>
                    <option value="90d window">90 days</option>
                    <option value="180d window">180 days</option>
                    <option value="365d window">365 days</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Channel / Source</label>
                  <select
                    value={customRuleForm.channel}
                    onChange={e => setCustomRuleForm({ ...customRuleForm, channel: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-primary text-xs font-medium bg-white"
                  >
                    <option value="All Sources">All Sources</option>
                    <option value="Outlook Mail">Outlook Email</option>
                    <option value="Teams Meeting">Teams Meeting</option>
                    <option value="In-Person Visit">In-Person Visit</option>
                    <option value="Phone Call">Phone Call</option>
                    <option value="Manual Log">Manual Log</option>
                    <option value="Tasks Table">Tasks Table</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Applicable Tier</label>
                  <select
                    value={customRuleForm.tier}
                    onChange={e => setCustomRuleForm({ ...customRuleForm, tier: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-primary text-xs font-medium bg-white"
                  >
                    <option value="All Tiers">All Tiers</option>
                    <option value="Strategic">Strategic Tier</option>
                    <option value="Strategic & Key">Strategic & Key</option>
                    <option value="Standard">Standard Tier</option>
                    <option value="Low Touch">Low Touch Tier</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Condition Operator</label>
                  <select
                    value={customRuleForm.operator}
                    onChange={e => setCustomRuleForm({ ...customRuleForm, operator: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-primary text-xs font-medium bg-white"
                  >
                    <option value=">=">Greater than or equal (&gt;=)</option>
                    <option value="<=">Less than or equal (&lt;=)</option>
                    <option value=">">Greater than (&gt;)</option>
                    <option value="<">Less than (&lt;)</option>
                    <option value="==">Equal to (==)</option>
                    <option value="Contains">Contains keyword</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Threshold / Keyword</label>
                  <input
                    type="text"
                    value={customRuleForm.value}
                    onChange={e => setCustomRuleForm({ ...customRuleForm, value: e.target.value })}
                    placeholder="e.g. 30, or 'escalation'"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-primary text-xs font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Health Score Impact (Points)
                </label>
                <div className="flex items-center gap-3">
                  <input 
                    type="number" 
                    value={customRuleForm.points}
                    onChange={e => setCustomRuleForm({ ...customRuleForm, points: parseInt(e.target.value) || 0 })}
                    placeholder="-15 or +10"
                    className="w-32 px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-primary text-xs font-bold"
                  />
                  <span className="text-xs text-slate-500 font-medium">
                    {customRuleForm.points > 0 ? '🟢 Adds bonus points' : '🔴 Subtracts penalty points'}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button 
                type="button" 
                onClick={() => setShowAddRuleModal(false)} 
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleAddCustomRule}
                disabled={!customRuleForm.label.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                Add Rule to Catalog
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}