import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ShieldAlert, ShieldCheck, Check, Sparkles, Filter, Building2, Clock, X, Search, Settings, Plus, Activity, Mail, MessageSquare, CheckSquare, ListTodo, AlertTriangle, ChevronDown, Trash2, Info, BookOpen, HelpCircle, ExternalLink, CheckCircle2, RotateCw, HeartPulse, SlidersHorizontal, Award, DollarSign
} from 'lucide-react';
import { useStore } from '../store/index.js';
import { formatDate } from '../utils/dateFormat.js';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import { READY_MADE_CATALOG, CUSTOMER_TIERS, CATALOG_CATEGORIES, DEFAULT_HEALTH_CATEGORIES } from '../utils/scoringCatalog.js';
import {
  DEFAULT_RISK_CATEGORIES,
  READY_MADE_RISK_RULES,
  HARD_OVERRIDES,
  IMPACT_MULTIPLIERS,
  RISK_BANDS,
  calculateWeightedRiskScore
} from '../utils/riskRulesCatalog.js';

export const RISK_CATEGORIES_INFO = [
  {
    category: 'Delivery',
    aliases: ['Delivery', 'Delivery Delays'],
    trigger: 'Auto-synced when tasks or milestones are overdue by ≥ 3 days.',
    meaning: 'Project execution delays, delayed deliverables, missed deadlines, or SLA slippage.',
    severity: 'Critical (≥ 7d) / High (3–6d)',
    severityBadge: 'bg-red-50 text-red-700 border-red-200',
    color: 'bg-red-500',
    dotColor: '#ef4444'
  },
  {
    category: 'Relationship',
    aliases: ['Relationship', 'Relationship Deterioration'],
    trigger: 'Auto-triggered when no interaction is logged in 30+ days, or when sentiment trends negative.',
    meaning: 'Account disengagement, loss of contact touchpoints, or client relationship cooling off.',
    severity: 'High',
    severityBadge: 'bg-amber-50 text-amber-700 border-amber-200',
    color: 'bg-amber-500',
    dotColor: '#f59e0b'
  },
  {
    category: 'Overdue Action',
    aliases: ['Overdue Action'],
    trigger: 'Auto-generated when customer action items or commitments are overdue by 7+ days.',
    meaning: 'Specific commitment or action item agreed with the client has failed to be executed on schedule.',
    severity: 'High',
    severityBadge: 'bg-red-50 text-red-700 border-red-200',
    color: 'bg-red-600',
    dotColor: '#dc2626'
  },
  {
    category: 'Escalation',
    aliases: ['Escalation'],
    trigger: 'Extracted by AI from emails/notes containing words like "escalate", "manager", "director", "VP".',
    meaning: 'Client has formally escalated or threatened to escalate an issue to senior management.',
    severity: 'Critical / High',
    severityBadge: 'bg-rose-50 text-rose-700 border-rose-200',
    color: 'bg-rose-500',
    dotColor: '#e11d48'
  },
  {
    category: 'Competitor Mentions',
    aliases: ['Competitor Mentions'],
    trigger: 'Extracted by AI when client mentions alternatives, competitors, RFP, or switching providers.',
    meaning: 'Client is actively evaluating competitor products/services, putting retention at immediate risk.',
    severity: 'High',
    severityBadge: 'bg-purple-50 text-purple-700 border-purple-200',
    color: 'bg-purple-500',
    dotColor: '#9333ea'
  },
  {
    category: 'Customer Frustration',
    aliases: ['Customer Frustration'],
    trigger: 'Extracted by AI from messages with heavy negative sentiment ("terrible", "unacceptable", "disappointed").',
    meaning: 'High customer anger or dissatisfaction regarding service reliability or engineering quality.',
    severity: 'High',
    severityBadge: 'bg-orange-50 text-orange-700 border-orange-200',
    color: 'bg-orange-500',
    dotColor: '#ea580c'
  },
  {
    category: 'Budget Concerns',
    aliases: ['Budget Concerns'],
    trigger: 'Extracted by AI from discussions mentioning pricing, cost cuts, budget constraints, or billing.',
    meaning: 'Financial friction, client budget contraction, or disputes over invoices and billing rates.',
    severity: 'Medium',
    severityBadge: 'bg-sky-50 text-sky-700 border-sky-200',
    color: 'bg-sky-500',
    dotColor: '#0284c7'
  },
  {
    category: 'Technical',
    aliases: ['Technical'],
    trigger: 'Logged manually by engineers or technical leads in the Risk Workspace.',
    meaning: 'Architecture blockers, security audit findings, bug regressions, or infrastructure incompatibilities.',
    severity: 'Medium / High',
    severityBadge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    color: 'bg-indigo-500',
    dotColor: '#4f46e5'
  },
  {
    category: 'Commercial',
    aliases: ['Commercial'],
    trigger: 'Logged manually or triggered via sales/account review.',
    meaning: 'Commercial disagreements, deal restructuring, payment defaults, or cancellation notices.',
    severity: 'High',
    severityBadge: 'bg-blue-50 text-blue-700 border-blue-200',
    color: 'bg-blue-500',
    dotColor: '#2563eb'
  }
];

export const getCategoryInfo = (catName) => {
  if (!catName) return {
    category: 'General',
    trigger: 'Logged manually or detected through account monitoring rules.',
    meaning: 'Identified risk factor impacting customer health and engagement.',
    severity: 'Medium',
    severityBadge: 'bg-gray-100 text-gray-700 border-gray-200',
    color: 'bg-gray-500',
    dotColor: '#6b7280'
  };
  const clean = catName.trim().toLowerCase();
  return RISK_CATEGORIES_INFO.find(c =>
    c.category.toLowerCase() === clean ||
    c.aliases.some(a => a.toLowerCase() === clean) ||
    clean.includes(c.category.toLowerCase())
  ) || {
    category: catName,
    trigger: 'Logged manually or detected through account monitoring rules.',
    meaning: 'Identified risk factor impacting customer health and engagement.',
    severity: 'Medium',
    severityBadge: 'bg-gray-100 text-gray-700 border-gray-200',
    color: 'bg-gray-500',
    dotColor: '#6b7280'
  };
};

export default function Risks() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    user,
    accounts,
    fetchAccounts,
    risks,
    fetchRisks,
    risksLoading,
    resolveRisk,
    staffTasks,
    fetchStaffTasks,
    interactions,
    fetchInteractions
  } = useStore();

  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('Open');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [timeframe, setTimeframe] = useState('30');
  const [searchQuery, setSearchQuery] = useState(() => {
    return new URLSearchParams(location.search).get('search') || '';
  });

  useEffect(() => {
    const q = new URLSearchParams(location.search).get('search');
    if (q) setSearchQuery(q);
  }, [location.search]);
  const [selectedRisk, setSelectedRisk] = useState(null);
  const [showConfigureRules, setShowConfigureRules] = useState(false);
  const [showCategoriesGuide, setShowCategoriesGuide] = useState(false);
  const [guideSearchQuery, setGuideSearchQuery] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [sortBy, setSortBy] = useState('high_risk'); // 'high_risk' | 'newest' | 'lowest_health'
  const [reanalyzing, setReanalyzing] = useState(false);
  const [portfolioAccounts, setPortfolioAccounts] = useState([]);
  const { token, showActivityToast } = useStore();

  // Load all portfolio accounts and risks on mount and keep synced silently
  const loadPortfolioData = async () => {
    if (!token) return;
    try {
      const res = await fetch('/CustomerPulse/api/accounts?limit=1000', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.accounts)) {
          setPortfolioAccounts(data.accounts);
        }
      }
    } catch (e) {
      console.warn('Error loading portfolio accounts:', e);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadPortfolioData();
    fetchRisks();
    fetchStaffTasks();
    fetchInteractions();

    const interval = setInterval(() => {
      loadPortfolioData();
      fetchRisks();
      fetchStaffTasks();
    }, 8000);

    return () => clearInterval(interval);
  }, [token]);

  const handleAiReanalyze = async (riskId) => {
    if (!riskId || !token) return;
    setReanalyzing(true);
    try {
      const res = await fetch(`/CustomerPulse/api/risks/${riskId}/ai-analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data) {
        setSelectedRisk(prev => ({
          ...prev,
          ...data,
          whatIsRisk: data.whatIsRisk,
          whyItHappens: data.whyItHappens,
          howToResolve: data.howToResolve,
          description: data.whatIsRisk || data.description
        }));
        if (showActivityToast) showActivityToast('AI Risk Analysis freshly synthesized for account');
      }
    } catch (e) {
      console.error('Error re-analyzing with AI:', e);
    } finally {
      setReanalyzing(false);
    }
  };

  // ── Unified Configure Rules State (Health + Risk Analysis) ─────────────
  const [configureRulesTab, setConfigureRulesTab] = useState('health'); // 'health' | 'risks'
  const [saveSuccessToast, setSaveSuccessToast] = useState(false);

  // 1. Health Score Calculation Rules State
  const [selectedTier, setSelectedTier] = useState('Strategic');
  const [healthCatalogCategory, setHealthCatalogCategory] = useState('All Criteria');
  const [healthRuleSearch, setHealthRuleSearch] = useState('');
  const [activeHealthRules, setActiveHealthRules] = useState(() => {
    const defaults = {};
    READY_MADE_CATALOG.forEach(r => { defaults[r.id] = r.defaultEnabled === true; });
    return defaults;
  });
  const [healthCategoryWeights, setHealthCategoryWeights] = useState(() => {
    const defaults = {};
    DEFAULT_HEALTH_CATEGORIES.forEach(c => { defaults[c.id] = c.weight; });
    return defaults;
  });
  const [healthCategoryEnabled, setHealthCategoryEnabled] = useState(() => {
    const defaults = {};
    DEFAULT_HEALTH_CATEGORIES.forEach(c => { defaults[c.id] = true; });
    return defaults;
  });
  const [customHealthRules, setCustomHealthRules] = useState([]);
  const [showAddHealthRuleModal, setShowAddHealthRuleModal] = useState(false);
  const [customHealthRuleForm, setCustomHealthRuleForm] = useState({
    label: '',
    category: 'Recency',
    window: '30d window',
    channel: 'All Sources',
    operator: '>=',
    value: '30',
    points: -15,
    tier: 'All Tiers'
  });

  // 2. Risk Analysis & Scoring Rules State
  const [riskCatalogCategory, setRiskCatalogCategory] = useState('All');
  const [riskRuleSearch, setRiskRuleSearch] = useState('');
  const [categoryWeights, setCategoryWeights] = useState(() => {
    const defaults = {};
    DEFAULT_RISK_CATEGORIES.forEach(c => { defaults[c.id] = c.weight; });
    return defaults;
  });
  const [categoryEnabled, setCategoryEnabled] = useState(() => {
    const defaults = {};
    DEFAULT_RISK_CATEGORIES.forEach(c => { defaults[c.id] = true; });
    return defaults;
  });
  const [activeRiskRules, setActiveRiskRules] = useState(() => {
    const defaults = {};
    READY_MADE_RISK_RULES.forEach(r => { defaults[r.id] = r.defaultEnabled === true; });
    return defaults;
  });
  const [customRiskRules, setCustomRiskRules] = useState([]);
  const [contractValue, setContractValue] = useState(250000);
  const [bandProbabilities, setBandProbabilities] = useState({
    Low: 5,
    Medium: 25,
    High: 50,
    Critical: 80
  });
  const [showAddRiskRuleModal, setShowAddRiskRuleModal] = useState(false);
  const [customRiskRuleForm, setCustomRiskRuleForm] = useState({
    label: '',
    categoryId: 'A',
    category: 'Silence and inactivity',
    window: '30d window',
    channel: 'All Sources',
    tier: 'All Tiers',
    operator: '>=',
    value: '30',
    points: 30
  });

  // Load saved preferences from localStorage on mount
  useEffect(() => {
    try {
      const savedHealth = localStorage.getItem('customer_pulse_health_config');
      if (savedHealth) {
        const parsed = JSON.parse(savedHealth);
        if (parsed.tier) setSelectedTier(parsed.tier);
        if (parsed.rulesVersion === 2 && parsed.activeRules) {
          setActiveHealthRules(parsed.activeRules);
        } else {
          // Rebase to Basic-only default
          const defaults = {};
          READY_MADE_CATALOG.forEach(r => { defaults[r.id] = r.defaultEnabled === true; });
          setActiveHealthRules(defaults);
        }
        if (parsed.customRules) setCustomHealthRules(parsed.customRules);
        if (parsed.categoryWeights) setHealthCategoryWeights(parsed.categoryWeights);
        if (parsed.categoryEnabled) setHealthCategoryEnabled(parsed.categoryEnabled);
      }
      const savedRisk = localStorage.getItem('customer_pulse_risk_rules_global');
      if (savedRisk) {
        const parsed = JSON.parse(savedRisk);
        if (parsed.categoryWeights) setCategoryWeights(parsed.categoryWeights);
        if (parsed.categoryEnabled) setCategoryEnabled(parsed.categoryEnabled);
        if (parsed.rulesVersion === 2 && parsed.activeRules) {
          setActiveRiskRules(parsed.activeRules);
        } else {
          // Rebase to Basic-only default
          const defaults = {};
          READY_MADE_RISK_RULES.forEach(r => { defaults[r.id] = r.defaultEnabled === true; });
          setActiveRiskRules(defaults);
        }
        if (parsed.customRules) setCustomRiskRules(parsed.customRules);
        if (parsed.contractValue) setContractValue(parsed.contractValue);
        if (parsed.bandProbabilities) setBandProbabilities(parsed.bandProbabilities);
      }
    } catch (e) {
      console.warn('Error loading saved rule configurations:', e);
    }
  }, []);

  // Listen for rule changes made in individual account tabs so the portfolio page updates in real time
  useEffect(() => {
    const handleRulesSync = (e) => {
      if (!e?.detail) return;
      const { healthPayload, riskPayload, payload } = e.detail;
      const effectiveRisk = riskPayload || payload;
      if (healthPayload) {
        if (healthPayload.tier) setSelectedTier(healthPayload.tier);
        if (healthPayload.activeRules) setActiveHealthRules(healthPayload.activeRules);
        if (healthPayload.customRules) setCustomHealthRules(healthPayload.customRules);
        if (healthPayload.categoryWeights) setHealthCategoryWeights(healthPayload.categoryWeights);
        if (healthPayload.categoryEnabled) setHealthCategoryEnabled(healthPayload.categoryEnabled);
      }
      if (effectiveRisk) {
        if (effectiveRisk.categoryWeights) setCategoryWeights(effectiveRisk.categoryWeights);
        if (effectiveRisk.categoryEnabled) setCategoryEnabled(effectiveRisk.categoryEnabled);
        if (effectiveRisk.activeRules) setActiveRiskRules(effectiveRisk.activeRules);
        if (effectiveRisk.customRules) setCustomRiskRules(effectiveRisk.customRules);
        if (effectiveRisk.bandProbabilities) setBandProbabilities(effectiveRisk.bandProbabilities);
      }
      loadPortfolioData();
    };
    window.addEventListener('health-rules-updated', handleRulesSync);
    window.addEventListener('account-risk-rules-updated', handleRulesSync);
    return () => {
      window.removeEventListener('health-rules-updated', handleRulesSync);
      window.removeEventListener('account-risk-rules-updated', handleRulesSync);
    };
  }, []);

  // Health Rules helpers
  const allAvailableHealthRules = useMemo(() => {
    return [...READY_MADE_CATALOG, ...customHealthRules];
  }, [customHealthRules]);

  const filteredHealthRules = useMemo(() => {
    return allAvailableHealthRules.filter(rule => {
      const matchesCat = healthCatalogCategory === 'All Criteria' ||
        (healthCatalogCategory === 'Custom'
          ? rule.isCustom
          : (healthCatalogCategory === 'Basic'
            ? (Boolean(rule.isBasic) || rule.category === 'Basic')
            : rule.category === healthCatalogCategory));
      const q = healthRuleSearch.toLowerCase().trim();
      const matchesQuery = !q ||
        (rule.label || '').toLowerCase().includes(q) ||
        (rule.description || '').toLowerCase().includes(q) ||
        (rule.category || '').toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [allAvailableHealthRules, healthCatalogCategory, healthRuleSearch]);

  const activeHealthRulesCount = useMemo(() => {
    return allAvailableHealthRules.filter(r => {
      const parentCat = DEFAULT_HEALTH_CATEGORIES.find(c => c.categoryKey === r.category || (c.categoryKeys && c.categoryKeys.includes(r.category)) || c.name === r.category);
      if (parentCat && healthCategoryEnabled[parentCat.id] === false) return false;
      return activeHealthRules[r.id] === true || (activeHealthRules[r.id] === undefined && r.defaultEnabled === true);
    }).length;
  }, [allAvailableHealthRules, activeHealthRules, healthCategoryEnabled]);

  const handleAddCustomHealthRule = () => {
    if (!customHealthRuleForm.label.trim()) return;
    const newId = `custom_health_${Date.now()}`;
    const newRule = {
      id: newId,
      category: customHealthRuleForm.category,
      label: customHealthRuleForm.label.trim(),
      description: `${customHealthRuleForm.channel} · ${customHealthRuleForm.operator} ${customHealthRuleForm.value} (${customHealthRuleForm.window})`,
      window: customHealthRuleForm.window,
      channel: customHealthRuleForm.channel,
      points: Number(customHealthRuleForm.points) || -10,
      type: Number(customHealthRuleForm.points) > 0 ? 'bonus' : 'penalty',
      tier: customHealthRuleForm.tier,
      isCustom: true
    };
    const updatedCustom = [...customHealthRules, newRule];
    const updatedActive = { ...activeHealthRules, [newId]: true };
    setCustomHealthRules(updatedCustom);
    setActiveHealthRules(updatedActive);
    setShowAddHealthRuleModal(false);
    setCustomHealthRuleForm({
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

  const handleDeleteCustomHealthRule = (id) => {
    setCustomHealthRules(prev => prev.filter(r => r.id !== id));
    setActiveHealthRules(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  // Risk Rules helpers
  const allAvailableRiskRules = useMemo(() => {
    return [...READY_MADE_RISK_RULES, ...customRiskRules];
  }, [customRiskRules]);

  const filteredRiskRules = useMemo(() => {
    return allAvailableRiskRules.filter(rule => {
      let matchesCat = true;
      if (riskCatalogCategory === 'Custom') {
        matchesCat = Boolean(rule.isCustom);
      } else if (riskCatalogCategory === 'Basic') {
        matchesCat = Boolean(rule.isBasic) || rule.categoryId === 'Basic' || rule.category === 'Basic';
      } else if (riskCatalogCategory !== 'All') {
        matchesCat = rule.categoryId === riskCatalogCategory || rule.category === riskCatalogCategory;
      }
      const q = riskRuleSearch.toLowerCase().trim();
      const matchesQuery = !q ||
        (rule.name || rule.label || '').toLowerCase().includes(q) ||
        (rule.trigger || rule.description || '').toLowerCase().includes(q) ||
        (rule.category || '').toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [allAvailableRiskRules, riskCatalogCategory, riskRuleSearch]);

  const activeRiskRulesCount = useMemo(() => {
    return allAvailableRiskRules.filter(r => {
      const isParentCatEnabled = categoryEnabled[r.categoryId] !== false;
      const isBasicEnabled = !r.isBasic || categoryEnabled['Basic'] !== false;
      const isRuleActive = activeRiskRules[r.id] === true || (activeRiskRules[r.id] === undefined && r.defaultEnabled === true);
      return isParentCatEnabled && isBasicEnabled && isRuleActive;
    }).length;
  }, [allAvailableRiskRules, activeRiskRules, categoryEnabled]);

  const handleAddCustomRiskRule = () => {
    if (!customRiskRuleForm.label.trim()) return;
    const catObj = DEFAULT_RISK_CATEGORIES.find(c => c.id === customRiskRuleForm.categoryId) || DEFAULT_RISK_CATEGORIES[0];
    const newId = `custom_risk_${Date.now()}`;
    const newRule = {
      id: newId,
      categoryId: catObj.id,
      category: catObj.name,
      name: customRiskRuleForm.label.trim(),
      label: customRiskRuleForm.label.trim(),
      trigger: `${customRiskRuleForm.channel} · ${customRiskRuleForm.operator} ${customRiskRuleForm.value} (${customRiskRuleForm.window})`,
      description: `${customRiskRuleForm.channel} · ${customRiskRuleForm.operator} ${customRiskRuleForm.value} (${customRiskRuleForm.window})`,
      points: Number(customRiskRuleForm.points) || 20,
      window: customRiskRuleForm.window,
      channel: customRiskRuleForm.channel,
      tier: customRiskRuleForm.tier,
      isCustom: true,
      defaultEnabled: true
    };
    setCustomRiskRules(prev => [...prev, newRule]);
    setActiveRiskRules(prev => ({ ...prev, [newId]: true }));
    setShowAddRiskRuleModal(false);
    setCustomRiskRuleForm({
      label: '',
      categoryId: 'A',
      category: 'Silence and inactivity',
      window: '30d window',
      channel: 'All Sources',
      tier: 'All Tiers',
      operator: '>=',
      value: '30',
      points: 30
    });
  };

  const handleDeleteCustomRiskRule = (id) => {
    setCustomRiskRules(prev => prev.filter(r => r.id !== id));
    setActiveRiskRules(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  // Save All Configurations
  const handleSaveAllConfigurations = async () => {
    try {
      const healthPayload = {
        rulesVersion: 2,
        tier: selectedTier,
        categoryWeights: healthCategoryWeights,
        categoryEnabled: healthCategoryEnabled,
        activeRules: activeHealthRules,
        customRules: customHealthRules,
        updatedAt: new Date().toISOString()
      };
      const riskPayload = {
        rulesVersion: 2,
        categoryWeights,
        categoryEnabled,
        activeRules: activeRiskRules,
        customRules: customRiskRules,
        updatedAt: new Date().toISOString()
      };

      // 1. Immediately save locally and dispatch broadcast events for instant UI reactivity
      localStorage.setItem('customer_pulse_health_config', JSON.stringify(healthPayload));
      localStorage.setItem('customer_pulse_risk_rules_global', JSON.stringify(riskPayload));

      window.dispatchEvent(new CustomEvent('health-rules-updated', { detail: { healthPayload, riskPayload } }));
      if (useStore.getState().fetchDashboardStats) useStore.getState().fetchDashboardStats();
      if (useStore.getState().fetchRisks) useStore.getState().fetchRisks();
      loadPortfolioData();

      // 2. Immediate feedback & close modal
      setSaveSuccessToast(true);
      setTimeout(() => {
        setSaveSuccessToast(false);
        setShowConfigureRules(false);
      }, 350);

      // 3. Background sync without freezing the UI
      const token = useStore.getState().token;
      if (token) {
        fetch('/CustomerPulse/api/accounts/global/health-config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ config: healthPayload })
        }).catch(err => console.warn('Global health config save warning:', err));

        fetch('/CustomerPulse/api/risks/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            rules: customRiskRules.map(r => ({
              id: r.id,
              title: r.name,
              description: r.trigger,
              severity: r.points >= 50 ? 'High' : 'Medium',
              enabled: activeRiskRules[r.id] !== false
            }))
          })
        }).catch(err => console.warn('Backend rule save warning:', err));
      }
    } catch (e) {
      console.warn('Save rule error:', e);
      setShowConfigureRules(false);
    }
  };

  // Reset All Defaults
  const handleResetAllDefaults = () => {
    // Reset Health
    const defHealthActive = {};
    READY_MADE_CATALOG.forEach(r => { defHealthActive[r.id] = true; });
    const defHealthWeights = {};
    const defHealthEnabled = {};
    DEFAULT_HEALTH_CATEGORIES.forEach(c => {
      defHealthWeights[c.id] = c.weight;
      defHealthEnabled[c.id] = true;
    });
    setHealthCategoryWeights(defHealthWeights);
    setHealthCategoryEnabled(defHealthEnabled);
    setActiveHealthRules(defHealthActive);
    setSelectedTier('Strategic');

    // Reset Risks
    const defWeights = {};
    const defEnabled = {};
    const defRiskActive = {};
    DEFAULT_RISK_CATEGORIES.forEach(c => {
      defWeights[c.id] = c.weight;
      defEnabled[c.id] = true;
    });
    READY_MADE_RISK_RULES.forEach(r => {
      defRiskActive[r.id] = true;
    });
    setCategoryWeights(defWeights);
    setCategoryEnabled(defEnabled);
    setActiveRiskRules(defRiskActive);
    setBandProbabilities({ Low: 5, Medium: 25, High: 50, Critical: 80 });

    if (showActivityToast) showActivityToast('Defaults restored for Health & Risk Analysis rules');
  };

  const now = new Date();

  // Group and normalize account domains into identifiable NeST Digital Business Unit Teams
  const getTeamName = (domain) => {
    if (!domain) return 'Other';
    const d = domain.trim();
    if (d === 'BFS' || d.toLowerCase().includes('banking')) return 'Banking & Financial Services (BFS)';
    if (d === 'AUTO' || d.toLowerCase().includes('transport') || d.toLowerCase().includes('automotive')) return 'Automotive & Transportation';
    if (d === 'AERO' || d === 'DEFENSE' || d.toLowerCase().includes('aerospace')) return 'Aerospace & Defence';
    if (d === 'GIS') return 'Geographic Information Services (GIS)';
    if (d === 'SAS') return 'Staff Augmentation (SAS)';
    return d;
  };

  // Dynamic active accounts: prioritize complete unpaginated portfolio accounts from PostgreSQL
  const activeAccounts = portfolioAccounts.length > 0 ? portfolioAccounts : (accounts || []);

  // Dynamic available teams extracted from all accounts in PostgreSQL
  const availableTeams = Array.from(new Set(
    activeAccounts.map(a => getTeamName(a.domain)).filter(Boolean)
  )).sort();

  // Accounts filtered by selected team (if any)
  const scopedAccounts = teamFilter
    ? activeAccounts.filter(a => getTeamName(a.domain) === teamFilter)
    : activeAccounts;

  const scopedAccountIds = new Set(scopedAccounts.map(a => a.accountId || a.id));

  // Dynamic calculation of health scores for all accounts based strictly on THIS PAGE'S rules engine
  const dynamicAccounts = useMemo(() => {
    const activeHealthWeightSum = DEFAULT_HEALTH_CATEGORIES.reduce((sum, c) => {
      return sum + (healthCategoryEnabled[c.id] !== false ? (Number(healthCategoryWeights[c.id]) || 0) : 0);
    }, 0);

    return scopedAccounts.map(acc => {
      const baseScore = typeof acc.healthScore === 'number' ? acc.healthScore : 70;
      let scoreAdjustment = 0;

      // 1. Health Category activation adjustments (turn off category to exclude its deductions)
      DEFAULT_HEALTH_CATEGORIES.forEach(cat => {
        if (healthCategoryEnabled[cat.id] === false) {
          const catRules = READY_MADE_CATALOG.filter(r => r.category === cat.categoryKey || (cat.categoryKeys && cat.categoryKeys.includes(r.category)));
          catRules.forEach(r => {
            const isRuleActive = activeHealthRules[r.id] === true || (activeHealthRules[r.id] === undefined && r.defaultEnabled === true);
            if (isRuleActive && r.points < 0) {
              scoreAdjustment += Math.round(Math.abs(r.points) * 0.4);
            }
          });
        }
      });

      // 2. Health Scoring Rules toggled in Tab 1
      READY_MADE_CATALOG.forEach(rule => {
        const parentCat = DEFAULT_HEALTH_CATEGORIES.find(c => c.categoryKey === rule.category || (c.categoryKeys && c.categoryKeys.includes(rule.category)) || c.name === rule.category);
        const isCatEnabled = !parentCat || healthCategoryEnabled[parentCat.id] !== false;
        const isRuleActive = activeHealthRules[rule.id] === true || (activeHealthRules[rule.id] === undefined && rule.defaultEnabled === true);

        if (isCatEnabled && !isRuleActive) {
          if (rule.points < 0) scoreAdjustment += Math.abs(rule.points);
          else if (rule.points > 0) scoreAdjustment -= rule.points;
        }
      });

      // 3. Custom Health Rules
      customHealthRules.forEach(rule => {
        const isRuleActive = activeHealthRules[rule.id] === true || (activeHealthRules[rule.id] === undefined && rule.defaultEnabled === true);
        if (isRuleActive) {
          scoreAdjustment += (Number(rule.points) || 0);
        }
      });

      // 4. Category Weights scaling
      if (activeHealthWeightSum < 100) {
        scoreAdjustment += Math.round((100 - activeHealthWeightSum) * 0.2);
      } else if (activeHealthWeightSum > 100) {
        scoreAdjustment -= Math.round((activeHealthWeightSum - 100) * 0.15);
      }

      const calculatedScore = Math.max(5, Math.min(100, Math.round(baseScore + scoreAdjustment)));
      return {
        ...acc,
        healthScore: calculatedScore
      };
    });
  }, [scopedAccounts, healthCategoryEnabled, healthCategoryWeights, activeHealthRules, customHealthRules]);

  const dynamicAccountHealthMap = useMemo(() => {
    const map = {};
    dynamicAccounts.forEach(a => {
      const id = a.accountId || a.id;
      if (id) map[id] = a.healthScore;
      if (a.companyName) map[a.companyName.toLowerCase()] = a.healthScore;
    });
    return map;
  }, [dynamicAccounts]);

  // Compute metrics from dynamically calibrated data
  const totalAccts = dynamicAccounts.length;
  const validHealth = dynamicAccounts.filter(a => typeof a.healthScore === 'number');
  const avgHealth = validHealth.length ? Math.round(validHealth.reduce((sum, a) => sum + a.healthScore, 0) / validHealth.length) : 0;

  // Real accounts created this month
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const newThisMonth = scopedAccounts.filter(a => {
    if (!a.createdAt) return false;
    const cd = new Date(a.createdAt);
    return !isNaN(cd.getTime()) && cd >= startOfMonth;
  }).length;

  // Real average trend from accounts
  const trendAccounts = validHealth.filter(a => a.scoreTrend !== undefined && a.scoreTrend !== null && Number(a.scoreTrend) !== 0);
  const avgTrend = trendAccounts.length ? Math.round(trendAccounts.reduce((sum, a) => sum + Number(a.scoreTrend), 0) / trendAccounts.length) : 0;

  // Map risk to 8 Official Categories (A through H)
  const getRiskCategoryId = (risk) => {
    if (risk.categoryId && ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(risk.categoryId)) {
      return risk.categoryId;
    }
    const cat = (risk.category || '').toLowerCase();
    const rule = (risk.rule || '').toLowerCase();
    const title = (risk.title || '').toLowerCase();
    const desc = (risk.description || '').toLowerCase();

    // A: Silence and inactivity
    if (title.includes('silence') || rule.includes('without touchpoint') || rule.includes('gap') || desc.includes('inactivity') || desc.includes('touchpoint')) return 'A';
    // B: Sentiment and language
    if (cat.includes('sentiment') || cat.includes('frustrat') || title.includes('sentiment') || desc.includes('frustrated')) return 'B';
    // C: Responsiveness
    if (cat.includes('responsiv') || rule.includes('unanswered') || rule.includes('reply')) return 'C';
    // D: Relationship and contacts
    if (cat.includes('relationship') || title.includes('single-thread') || title.includes('champion') || title.includes('stakeholder')) return 'D';
    // E: Meetings and touchpoint frequency
    if (cat.includes('meeting') || title.includes('meeting') || rule.includes('meeting')) return 'E';
    // F: Commitments and our execution
    if (cat.includes('deliver') || cat.includes('commit') || title.includes('deliverable') || rule.includes('sla') || title.includes('overdue')) return 'F';
    // G: Contract and commercial lifecycle
    if (cat.includes('commerc') || cat.includes('contract') || title.includes('invoice') || title.includes('payment')) return 'G';
    // H: Competitive and market signals
    if (cat.includes('compet') || cat.includes('market') || title.includes('competitor')) return 'H';

    return 'A'; // fallback
  };

  const enabledRisks = useMemo(() => {
    return (risks || []).filter(r => {
      const catId = getRiskCategoryId(r);
      if (categoryEnabled[catId] === false) return false;

      const titleLower = (r.title || '').toLowerCase();
      const ruleLower = (r.rule || '').toLowerCase();
      const descLower = (r.description || '').toLowerCase();

      const matchedRule = allAvailableRiskRules.find(catalogRule => {
        const catNameLower = (catalogRule.name || catalogRule.label || '').toLowerCase();
        return titleLower.includes(catNameLower) ||
          ruleLower.includes(catNameLower) ||
          (catalogRule.trigger && descLower.includes(catalogRule.trigger.toLowerCase()));
      });

      if (matchedRule) {
        const isRuleActive = activeRiskRules[matchedRule.id] === true || (activeRiskRules[matchedRule.id] === undefined && matchedRule.defaultEnabled === true);
        if (!isRuleActive) return false;
      }

      return true;
    });
  }, [risks, categoryEnabled, activeRiskRules, allAvailableRiskRules]);

  const baseRisks = enabledRisks;
  const displayRisks = teamFilter ? baseRisks.filter(r => scopedAccountIds.has(r.accountId)) : baseRisks;
  const openRisks = displayRisks.filter(r => r.status === 'Open');
  const openRisksCount = openRisks.length;
  const criticalRisksCount = openRisks.filter(r => r.severity === 'Critical').length;
  const highRisksCount = openRisks.filter(r => r.severity === 'High').length;

  // Real Overdue Tasks from Database (staff tasks + interaction tasks)
  const overdueStaffTasks = (staffTasks || []).filter(t => {
    if (!t.dueDate) return false;
    if (teamFilter && !scopedAccountIds.has(t.accountId)) return false;
    const d = new Date(t.dueDate);
    const isCompleted = (t.status || '').toLowerCase().includes('complet') || (t.status || '').toLowerCase().includes('decline');
    return !isCompleted && d < now;
  });

  const overdueInteractionTasks = [];
  (interactions || []).forEach(item => {
    if (teamFilter && !scopedAccountIds.has(item.accountId)) return;
    (item.assignedTasks || item.mentions || []).forEach(m => {
      if (m.dueDate) {
        const d = new Date(m.dueDate);
        const st = (m.status || '').toLowerCase();
        if (!st.includes('complet') && !st.includes('decline') && d < now) {
          overdueInteractionTasks.push({ ...m, accountId: item.accountId });
        }
      }
    });
  });

  const allOverdueTasks = [...overdueStaffTasks, ...overdueInteractionTasks];
  const overdueTasksCount = allOverdueTasks.length;
  const overdueAccountsCount = new Set(allOverdueTasks.map(t => t.accountId).filter(Boolean)).size;

  // Real Silent Accounts (Accounts with no interaction logged in past timeframe days)
  const timeframeDays = parseInt(timeframe, 10) || 30;
  const daysAgoDate = new Date(now.getTime() - timeframeDays * 24 * 60 * 60 * 1000);
  const accountsWithRecentInteraction = new Set();
  (interactions || []).forEach(i => {
    if (!i.accountId) return;
    const d = new Date(i.date || i.timestamp || i.createdAt || 0);
    if (!isNaN(d.getTime()) && d >= daysAgoDate) {
      accountsWithRecentInteraction.add(i.accountId);
    }
  });
  const silentAccountsList = scopedAccounts.filter(a => !accountsWithRecentInteraction.has(a.accountId));
  const silentAccountsCount = silentAccountsList.length;

  const greenCount = validHealth.filter(a => a.healthScore >= 70).length;
  const amberCount = validHealth.filter(a => a.healthScore >= 40 && a.healthScore < 70).length;
  const redCount = validHealth.filter(a => a.healthScore < 40).length;
  const totalWithHealth = validHealth.length || 1;
  const greenPct = (greenCount / totalWithHealth) * 100;
  const amberPct = (amberCount / totalWithHealth) * 100;
  const redPct = (redCount / totalWithHealth) * 100;

  // Real dynamic health distribution curve across 8 segments
  const healthSegments = [0, 0, 0, 0, 0, 0, 0, 0];
  validHealth.forEach(a => {
    const idx = Math.min(7, Math.floor((a.healthScore / 100) * 8));
    healthSegments[idx]++;
  });
  const maxSegment = Math.max(...healthSegments, 1);
  const pathPoints = healthSegments.map((count, i) => {
    const x = Math.round((i / (healthSegments.length - 1)) * 100);
    const y = Math.round(28 - (count / maxSegment) * 22);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const lowestHealthAccounts = [...validHealth].sort((a, b) => a.healthScore - b.healthScore).slice(0, 4);

  const risksInTimeframe = displayRisks.filter(r => {
    if (!r.createdAt) return true;
    const cd = new Date(r.createdAt);
    return !isNaN(cd.getTime()) && (now - cd) / (1000 * 60 * 60 * 24) <= timeframeDays;
  });
  const categoryCounts = risksInTimeframe.reduce((acc, r) => {
    const cat = r.category || 'General';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const risksByCategory = Object.keys(categoryCounts).map(cat => {
    let color = 'bg-blue-500';
    if (cat === 'Relationship' || cat === 'Delivery' || cat.includes('Overdue')) color = 'bg-red-500';
    else if (cat === 'Commercial') color = 'bg-sky-500';
    return { label: cat, count: categoryCounts[cat], color };
  }).sort((a, b) => b.count - a.count);
  const maxRiskCat = risksByCategory.length ? risksByCategory[0].count : 1;
  const enrichedRiskCategories = risksByCategory.map(rc => ({
    ...rc,
    width: `${Math.max(12, Math.round((rc.count / maxRiskCat) * 100))}%`
  }));

  // Real unique owners list from database
  const uniqueOwners = Array.from(new Set([
    ...activeAccounts.map(a => a.ownerName),
    ...displayRisks.map(r => r.ownerName)
  ])).filter(Boolean).sort();

  // Team workload
  const teamMap = {};
  if (dynamicAccounts) {
    dynamicAccounts.forEach(a => {
      const owner = a.ownerName || 'Unassigned';
      if (!teamMap[owner]) teamMap[owner] = { accounts: 0, healthSum: 0, risks: 0 };
      teamMap[owner].accounts++;
      if (typeof a.healthScore === 'number') teamMap[owner].healthSum += a.healthScore;
    });
  }
  openRisks.forEach(r => {
    const owner = r.ownerName || 'Unassigned';
    if (teamMap[owner]) teamMap[owner].risks++;
  });
  const teamWorkloadList = Object.keys(teamMap).map(owner => {
    const t = teamMap[owner];
    return {
      name: owner,
      accounts: t.accounts,
      avgHealth: t.accounts > 0 ? Math.round(t.healthSum / t.accounts) : 0,
      risks: t.risks
    };
  }).sort((a, b) => b.accounts - a.accounts).slice(0, 4);

  const filteredRisks = displayRisks.filter(r => {
    const matchSev = severityFilter ? r.severity === severityFilter : true;
    const matchStatus = statusFilter ? r.status === statusFilter : true;
    const matchOwner = ownerFilter ? r.ownerName === ownerFilter : true;
    const matchSearch = searchQuery ? (
      (r.companyName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.whatIsRisk || '').toLowerCase().includes(searchQuery.toLowerCase())
    ) : true;
    return matchSev && matchStatus && matchOwner && matchSearch;
  });

  const severityRank = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };

  const sortedRisks = [...filteredRisks].sort((a, b) => {
    if (sortBy === 'newest') {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    }
    if (sortBy === 'lowest_health') {
      return (a.health ?? 100) - (b.health ?? 100);
    }
    // Default 'high_risk': Highest severity first (Critical -> High -> Medium -> Low), then lowest health, then newest
    const rankDiff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
    if (rankDiff !== 0) return rankDiff;
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    if (timeB !== timeA) return timeB - timeA;
    return (a.health ?? 100) - (b.health ?? 100);
  });

  const getSeverityColor = (sev) => {
    switch (sev) {
      case 'Critical': return 'bg-red-800 text-white border-red-900';
      case 'High': return 'bg-amber-200 text-amber-900 border-amber-300';
      case 'Medium': return 'bg-yellow-200 text-yellow-800 border-yellow-300';
      case 'Low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const renderTrend = (value) => {
    if (value < 0) return <span className="text-red-500 text-xs">↓ {Math.abs(value)}</span>;
    if (value > 0) return <span className="text-green-500 text-xs">↑ {value}</span>;
    return null;
  };

  return (
    <div className="p-4 md:p-6 space-y-6 select-none w-full">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-black">Account Health & Portfolio Overview</h2>
          <p className="text-xs text-gray-500 font-medium">
            {(user?.role === 'Admin' || user?.userType === 'Admin' || user?.userType === 'CEO')
              ? 'Health scores, risk detection and activity across all 165 portfolio accounts'
              : 'Health scores, risk detection and activity across your assigned accounts'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="appearance-none bg-white border border-gray-300 rounded-md py-1.5 pl-3 pr-8 text-sm text-black focus:outline-none focus:border-gray-400 cursor-pointer shadow-sm hover:bg-gray-50 transition-colors"
            >
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
            </select>
            <ChevronDown className="w-4 h-4 text-gray-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="appearance-none bg-white border border-gray-300 rounded-md py-1.5 pl-3 pr-8 text-sm text-black focus:outline-none focus:border-gray-400 cursor-pointer shadow-sm hover:bg-gray-50 transition-colors"
            >
              <option value="">All teams</option>
              {availableTeams.map(team => (
                <option key={team} value={team}>{team}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={() => setShowCategoriesGuide(true)}
            className="bg-white hover:bg-gray-50 text-sm font-medium text-black px-3 py-1.5 rounded-md flex items-center gap-1.5 border border-gray-300 transition-colors shadow-sm cursor-pointer"
            title="View Risk Categories, triggers & definitions"
          >
            <Info className="w-3.5 h-3.5 text-blue-600" />
            Risk categories
          </button>

          <button
            onClick={() => setShowConfigureRules(true)}
            className="bg-white hover:bg-gray-50 text-sm font-medium text-black px-3 py-1.5 rounded-md flex items-center gap-1.5 border border-gray-300 transition-colors shadow-sm cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            Configure rules
          </button>
        </div>
      </div>

      {/* STATS ROW */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-gray-100 flex flex-col justify-between h-[100px] hover:shadow-md transition-shadow cursor-default">
          <span className="text-xs text-gray-500 font-medium">Accounts</span>
          <div>
            <div className="text-2xl font-bold text-black leading-none">{totalAccts}</div>
            <div className="text-[10px] text-gray-400 mt-1 font-medium">
              {newThisMonth > 0
                ? `+${newThisMonth} this month`
                : ((user?.role === 'Admin' || user?.userType === 'Admin' || user?.userType === 'CEO')
                  ? `${totalAccts} active in CRM`
                  : `${totalAccts} assigned accounts`)}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-gray-100 flex flex-col justify-between h-[100px] hover:shadow-md transition-shadow cursor-default">
          <span className="text-xs text-gray-500 font-medium">Avg health</span>
          <div>
            <div className="text-2xl font-bold text-black leading-none">{avgHealth}</div>
            <div className="text-[10px] font-medium mt-1">
              {avgTrend < 0 ? (
                <span className="text-red-500">↓ {Math.abs(avgTrend)} vs last month</span>
              ) : avgTrend > 0 ? (
                <span className="text-green-500">↑ {avgTrend} vs last month</span>
              ) : (
                <span className="text-gray-400">Stable trend</span>
              )}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-gray-100 flex flex-col justify-between h-[100px] hover:shadow-md transition-shadow cursor-default">
          <span className="text-xs text-gray-500 font-medium">Open risks</span>
          <div>
            <div className="text-2xl font-bold text-black leading-none">{openRisksCount}</div>
            <div className="text-[10px] text-red-600 font-medium mt-1">{criticalRisksCount} Critical · {highRisksCount} High</div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-gray-100 flex flex-col justify-between h-[100px] hover:shadow-md transition-shadow cursor-default">
          <span className="text-xs text-gray-500 font-medium">Overdue tasks</span>
          <div>
            <div className="text-2xl font-bold text-black leading-none">{overdueTasksCount}</div>
            <div className="text-[10px] text-red-600 font-medium mt-1">
              {overdueTasksCount > 0 ? `in ${overdueAccountsCount} account${overdueAccountsCount === 1 ? '' : 's'}` : '0 overdue'}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-gray-100 flex flex-col justify-between h-[100px] hover:shadow-md transition-shadow cursor-default">
          <span className="text-xs text-gray-500 font-medium">Silent {timeframeDays}+ days</span>
          <div>
            <div className="text-2xl font-bold text-black leading-none">{silentAccountsCount}</div>
            <div className={`text-[10px] font-medium mt-1 ${silentAccountsCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {silentAccountsCount > 0 ? `${silentAccountsCount} accounts` : '0 accounts'}
            </div>
          </div>
        </div>
      </div>

      {/* MIDDLE 2 COLS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Col: Health distribution */}
        <div className="space-y-6">
          {/* Health Distribution */}
          <div className="bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-gray-100 p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold text-gray-600">Health distribution</h3>
              <button onClick={() => navigate('/accounts')} className="text-[11px] text-blue-600 font-medium hover:underline cursor-pointer">View accounts</button>
            </div>

            {/* Progress Bar */}
            <div className="flex h-3 rounded-full overflow-hidden mb-2">
              <div className="bg-green-500 transition-all duration-300" style={{ width: `${greenPct}%` }}></div>
              <div className="bg-amber-500 transition-all duration-300" style={{ width: `${amberPct}%` }}></div>
              <div className="bg-red-500 transition-all duration-300" style={{ width: `${redPct}%` }}></div>
            </div>

            {/* Legend */}
            <div className="flex gap-4 text-xs font-medium mb-6">
              <span className="text-green-600 font-bold">Green {greenCount}</span>
              <span className="text-amber-600 font-bold">Amber {amberCount}</span>
              <span className="text-red-500 font-bold">Red {redCount}</span>
            </div>

            {/* Line Chart */}
            <div className="h-16 w-full relative">
              <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-full" strokeWidth="1.5">
                <defs>
                  <linearGradient id="healthGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path d={`${pathPoints} L 100 30 L 0 30 Z`} fill="url(#healthGrad)" stroke="none" />
                <path d={pathPoints} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="text-xs text-gray-500 mt-2 font-medium">Average health: {avgHealth}</div>
          </div>


        </div>

        {/* Right Col: Risks by category */}
        <div className="bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-gray-100 p-5 h-fit">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-semibold text-gray-600">Risks by category, {timeframeDays} days</h3>
            <button
              onClick={() => setShowCategoriesGuide(true)}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 cursor-pointer hover:underline"
              title="View full Risk Categories Reference Guide"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Guide</span>
            </button>
          </div>

          {enrichedRiskCategories.length > 0 ? (
            <div className="space-y-4">
              {enrichedRiskCategories.map(item => {
                const info = getCategoryInfo(item.label);
                return (
                  <div
                    key={item.label}
                    className="relative group flex items-center gap-3 cursor-pointer"
                    onClick={() => setShowCategoriesGuide(true)}
                  >
                    <span className="text-xs font-medium text-gray-700 w-28 truncate hover:text-blue-600 transition-colors" title={item.label}>
                      {item.label}
                    </span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                      <div className={`${item.color} h-full rounded-full transition-all duration-300`} style={{ width: item.width }}></div>
                    </div>
                    <span className="text-xs font-bold text-gray-700 w-6 text-right">{item.count}</span>

                    {/* Tooltip on category bar hover - Meaning description only */}
                    <div
                      style={{
                        position: 'absolute',
                        left: '120px',
                        top: 'calc(100% + 6px)',
                        zIndex: 999,
                        width: '240px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        boxShadow: '0 10px 25px -4px rgba(15, 23, 42, 0.15), 0 4px 6px -2px rgba(15, 23, 42, 0.05)',
                        pointerEvents: 'none'
                      }}
                      className="hidden group-hover:block"
                    >
                      <div style={{ position: 'absolute', bottom: '100%', left: '20px', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '5px solid #cbd5e1' }} />
                      <div style={{ position: 'absolute', bottom: '100%', left: '20px', marginBottom: '-1px', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderBottom: '4px solid #ffffff' }} />

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: info.dotColor || '#3b82f6', display: 'inline-block' }} />
                          {info.category}
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: info.severity?.includes('Critical') ? '#fef2f2' : info.severity?.includes('High') ? '#fffbeb' : '#eff6ff', color: info.severity?.includes('Critical') ? '#b91c1c' : info.severity?.includes('High') ? '#b45309' : '#1d4ed8', border: `1px solid ${info.severity?.includes('Critical') ? '#fecaca' : info.severity?.includes('High') ? '#fde68a' : '#bfdbfe'}` }}>
                          {info.severity}
                        </span>
                      </div>
                      <p style={{ fontSize: '11px', color: '#334155', margin: 0, lineHeight: 1.45 }}>
                        {info.meaning}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2 border border-emerald-200">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-gray-800">No Risks Logged</p>
              <p className="text-[11px] text-gray-500 mt-0.5">All accounts are operating within standard parameters.</p>
            </div>
          )}
        </div>
      </div>

      {/* OPEN RISKS (Full width) */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
          <h3 className="text-sm font-bold text-black w-24">Open risks</h3>

          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search customer, risk, key"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-md pl-9 pr-3 py-1.5 text-sm text-black focus:outline-none focus:border-gray-400 placeholder:text-gray-400 shadow-sm transition-all"
            />
          </div>

          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="appearance-none bg-white border border-gray-200 rounded-md py-1.5 pl-3 pr-8 text-sm text-black focus:outline-none focus:border-gray-400 cursor-pointer shadow-sm hover:bg-gray-50 transition-colors font-semibold"
                title="Arrange risks by severity or date"
              >
                <option value="high_risk">Arrange: High Risk First</option>
                <option value="newest">Arrange: Newest First</option>
                <option value="lowest_health">Arrange: Lowest Health First</option>
              </select>
              <ChevronDown className="w-4 h-4 text-gray-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                className="appearance-none bg-white border border-gray-200 rounded-md py-1.5 pl-3 pr-8 text-sm text-black focus:outline-none focus:border-gray-400 cursor-pointer shadow-sm hover:bg-gray-50 transition-colors"
              >
                <option value="">All owners</option>
                {uniqueOwners.map(owner => (
                  <option key={owner} value={owner}>{owner}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] font-bold text-gray-500 bg-gray-50/50">
                <th className="py-2.5 px-4 font-bold uppercase tracking-wider">Customer</th>
                <th className="py-2.5 px-4 font-bold uppercase tracking-wider">Health</th>
                <th className="py-2.5 px-4 font-bold uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <span>Category</span>
                    <button
                      type="button"
                      onClick={() => setShowCategoriesGuide(true)}
                      className="text-gray-400 hover:text-blue-600 transition-colors cursor-pointer"
                      title="View all risk categories, triggers & meanings"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </th>
                <th className="py-2.5 px-4 font-bold uppercase tracking-wider">Owner</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-100">
              {sortedRisks.map((risk, i) => (
                <tr
                  key={i}
                  onClick={() => setSelectedRisk(risk)}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  title="Click to view risk details"
                >
                  <td className="py-3 px-4">
                    <div className="font-bold text-black hover:text-blue-600 transition-colors flex items-center gap-1.5">
                      <span>{risk.companyName}</span>
                      {risk.accountId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/accounts/${risk.accountId}`);
                          }}
                          className="text-gray-400 hover:text-blue-600 p-0.5 rounded transition-colors inline-flex items-center cursor-pointer"
                          title={`Open ${risk.companyName} account details`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{risk.description}</div>
                  </td>
                  <td className="py-3 px-4">
                    {(() => {
                      const computedHealth = dynamicAccountHealthMap[risk.accountId] ?? dynamicAccountHealthMap[risk.companyName?.toLowerCase()] ?? risk.health;
                      const badgeClass = computedHealth < 40
                        ? 'bg-red-50 text-red-700'
                        : computedHealth < 70
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-emerald-50 text-emerald-700';
                      return (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${badgeClass}`}>
                          {computedHealth} {renderTrend(risk.healthChange)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    {(() => {
                      const info = getCategoryInfo(risk.category);
                      return (
                        <div className="relative group inline-block">
                          <span
                            onClick={() => setShowCategoriesGuide(true)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 text-gray-800 border border-gray-200 cursor-pointer transition-all"
                            title="Click to view categories guide"
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: info.dotColor || '#3b82f6' }} />
                            <span>{risk.category || 'General'}</span>
                            <Info className="w-3 h-3 text-gray-400 group-hover:text-blue-600 transition-colors" />
                          </span>

                          {/* Hover Tooltip - Positioned to the right to avoid overlaying rows */}
                          <div
                            style={{
                              position: 'absolute',
                              left: 'calc(100% + 10px)',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              zIndex: 999,
                              width: '240px',
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              borderRadius: '10px',
                              padding: '10px 12px',
                              boxShadow: '0 10px 25px -4px rgba(15, 23, 42, 0.15), 0 4px 6px -2px rgba(15, 23, 42, 0.05)',
                              pointerEvents: 'none'
                            }}
                            className="hidden group-hover:block"
                          >
                            <div style={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderRight: '5px solid #cbd5e1' }} />
                            <div style={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '-1px', width: 0, height: 0, borderTop: '4px solid transparent', borderBottom: '4px solid transparent', borderRight: '4px solid #ffffff' }} />

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid #f1f5f9' }}>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: info.dotColor || '#3b82f6', display: 'inline-block' }} />
                                {info.category}
                              </span>
                              <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: info.severity?.includes('Critical') ? '#fef2f2' : info.severity?.includes('High') ? '#fffbeb' : '#eff6ff', color: info.severity?.includes('Critical') ? '#b91c1c' : info.severity?.includes('High') ? '#b45309' : '#1d4ed8', border: `1px solid ${info.severity?.includes('Critical') ? '#fecaca' : info.severity?.includes('High') ? '#fde68a' : '#bfdbfe'}` }}>
                                {info.severity}
                              </span>
                            </div>
                            <p style={{ fontSize: '11px', color: '#334155', margin: 0, lineHeight: 1.45 }}>
                              {info.meaning}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="py-3 px-4 text-xs font-semibold text-gray-700">{risk.ownerName}</td>
                </tr>
              ))}
              {risksLoading ? (
                <tr>
                  <td colSpan="4" className="py-12 text-center">
                    <LoadingSpinner size="lg" text="Loading account health risks..." />
                  </td>
                </tr>
              ) : sortedRisks.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-8 text-center text-sm text-gray-500 font-medium">
                    No open risks found matching your criteria.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* BOTTOM SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-gray-100 p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold text-gray-600">Lowest health accounts</h3>
            <button onClick={() => navigate('/accounts')} className="text-[11px] text-blue-600 font-medium hover:underline cursor-pointer">View all</button>
          </div>
          <div className="space-y-2.5">
            {lowestHealthAccounts.length > 0 ? lowestHealthAccounts.map(a => (
              <div
                key={a.accountId || a.id}
                onClick={() => navigate(`/accounts/${a.accountId || a.id}`, { state: { from: location.pathname + location.search } })}
                className="flex justify-between items-center text-sm hover:bg-gray-50 p-1.5 -mx-1.5 rounded cursor-pointer transition-colors"
                title="View Account Details"
              >
                <span className="text-black font-semibold text-sm hover:text-blue-600 transition-colors">{a.companyName}</span>
                <span className={`font-bold text-xs ${a.healthScore < 40 ? 'text-red-600' : a.healthScore < 70 ? 'text-amber-600' : 'text-emerald-600'}`}>{a.healthScore}%</span>
              </div>
            )) : <div className="text-sm text-gray-500 p-2">No health data available</div>}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-600 mb-4">Team workload</h3>
          <div className="space-y-4 mb-5">
            {teamWorkloadList.map(t => (
              <div key={t.name} className="flex justify-between items-center text-sm">
                <span className="text-black font-semibold">{t.name} <span className="text-gray-500 font-medium">· {t.accounts} accounts</span></span>
                <span className="text-gray-600 text-[11px] font-medium">Avg {t.avgHealth} · {t.risks} risk{t.risks !== 1 ? 's' : ''}</span>
              </div>
            ))}
            {teamWorkloadList.length === 0 && <div className="text-sm text-gray-500">No team data available</div>}
          </div>
          <p className="text-[11px] text-gray-400 font-medium leading-relaxed mt-4">
            Unacknowledged Critical risks escalate to the manager after 3 days.
          </p>
        </div>
      </div>

      {/* ========================================================
          MODALS FROM EXISTING CODE
          ======================================================== */}

      {selectedRisk && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="bg-white max-w-4xl w-full rounded-xl border border-gray-200 shadow-2xl flex flex-col max-h-[90vh]">

            <div className="p-5 border-b border-gray-100 flex items-start justify-between bg-gray-50 rounded-t-xl">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Risk Workspace</span>
                  <span className="text-gray-400">•</span>
                  <span className="text-[11px] font-bold text-gray-800">{selectedRisk.companyName}</span>
                  <span className="text-gray-400">•</span>
                  <span className="text-[10px] font-semibold text-gray-500">Lead: {selectedRisk.ownerName || 'Account Lead'}</span>
                  {selectedRisk.accountId && (
                    <button
                      onClick={() => navigate(`/accounts/${selectedRisk.accountId}`)}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors ml-1 cursor-pointer bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 hover:bg-blue-100 shadow-2xs"
                      title="Open full account view"
                    >
                      <span>Open Account View</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <h2 className="text-xl font-bold text-black flex items-center gap-3">
                  {selectedRisk.title || `${selectedRisk.category || 'Relationship'} Risk`}
                  <span className={`text-[10px] px-2 py-0.5 rounded border tracking-wide uppercase font-bold ${getSeverityColor(selectedRisk.severity)}`}>
                    {selectedRisk.severity || 'High'}
                  </span>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200 font-bold">
                    {dynamicAccountHealthMap[selectedRisk.accountId] ?? dynamicAccountHealthMap[selectedRisk.companyName?.toLowerCase()] ?? selectedRisk.health ?? '—'}% Health
                  </span>
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAiReanalyze(selectedRisk.riskId || selectedRisk.id)}
                  disabled={reanalyzing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  title="Re-run deep AI risk analysis"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${reanalyzing ? 'animate-spin text-blue-600' : 'text-blue-500'}`} />
                  <span>{reanalyzing ? 'AI Analyzing...' : 'Re-analyze with AI'}</span>
                </button>
                <button onClick={() => setSelectedRisk(null)} className="text-gray-400 hover:text-gray-800 bg-white border border-gray-200 hover:bg-gray-100 p-1.5 rounded-lg transition-colors cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ONLY THE 3 CORE REQUESTED SECTIONS */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">

              {/* 1. WHAT IS THE RISK */}
              <div className="bg-rose-50/70 rounded-xl p-5 border border-rose-200 shadow-2xs">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-rose-900 uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    What is the Risk
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 uppercase tracking-wide">
                    Executive Risk Brief
                  </span>
                </div>
                <p className="text-sm text-slate-800 leading-relaxed font-medium">
                  {selectedRisk.whatIsRisk || selectedRisk.description}
                </p>
              </div>

              {/* 2. WHY DOES IT HAPPEN */}
              <div className="bg-amber-50/70 rounded-xl p-5 border border-amber-200 shadow-2xs">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    Why Does It Happen
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wide">
                    Root Cause Analysis
                  </span>
                </div>
                <p className="text-sm text-slate-800 leading-relaxed font-medium">
                  {selectedRisk.whyItHappens || selectedRisk.aiInsight || selectedRisk.rule || `Meeting frequency threshold exceeded for ${selectedRisk.companyName}.`}
                </p>
              </div>

              {/* 3. HOW TO RESOLVE THIS RISK */}
              <div className="bg-emerald-50/60 rounded-xl p-5 border border-emerald-200 shadow-2xs">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    How to Resolve This Risk
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wide">
                    Actionable Remediation Plan
                  </span>
                </div>

                {(() => {
                  let steps = selectedRisk.howToResolve || selectedRisk.suggestedActions;
                  if (typeof steps === 'string') {
                    try { steps = JSON.parse(steps); } catch (e) { steps = []; }
                  }
                  if (!Array.isArray(steps) || steps.length === 0) {
                    steps = [
                      { title: `Schedule an executive reconnection sync with ${selectedRisk.companyName}`, due: 'Within 3 days', description: 'Re-align on project deliverables and strategic objectives.' },
                      { title: 'Prepare a comprehensive account status report', due: 'Within 1 week', description: 'Highlight recent milestones, SLAs, and resolution timelines.' }
                    ];
                  }

                  return (
                    <div className="space-y-2.5">
                      {steps.map((step, sIdx) => {
                        const stepTitle = typeof step === 'object' ? (step.title || step.name) : String(step);
                        const stepDue = typeof step === 'object' ? step.due : null;
                        const stepDesc = typeof step === 'object' ? step.description : null;

                        return (
                          <div key={sIdx} className="bg-white p-3.5 rounded-lg border border-emerald-100 shadow-2xs flex items-start gap-3 hover:border-emerald-300 transition-colors">
                            <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                              {sIdx + 1}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-900 leading-tight">{stepTitle}</span>
                                {stepDue && (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                    {stepDue}
                                  </span>
                                )}
                              </div>
                              {stepDesc && (
                                <p className="text-xs text-slate-600 mt-1 leading-normal font-normal">
                                  {stepDesc}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex items-center justify-between">
              <div className="text-[10px] text-gray-500 font-medium">
                {selectedRisk.createdAt ? `Logged on ${formatDate(selectedRisk.createdAt)}` : 'System Risk'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedRisk(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* UNIFIED RULES CONFIGURATION MODAL (HEALTH SCORE + RISK ANALYSIS)           */}
      {/* ========================================================================= */}
      {showConfigureRules && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-100">

            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      Scoring & Risk Analysis Rules Engine
                      <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        Unified Enterprise Config
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configure objective rules for Health Score Calculation and Risk Analysis across all accounts.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowConfigureRules(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Primary Dual-Tab Switcher */}
              <div className="flex items-center gap-2 bg-slate-200/70 p-1 rounded-2xl w-full sm:w-fit">
                <button
                  type="button"
                  onClick={() => setConfigureRulesTab('health')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${configureRulesTab === 'health'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  <HeartPulse className="w-4 h-4 text-blue-600" />
                  <span>Health Score Calculation Rules</span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-800">
                    {activeHealthRulesCount} Active
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfigureRulesTab('risks')}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${configureRulesTab === 'risks'
                      ? 'bg-white text-rose-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  <span>Risk Analysis & Scoring Rules</span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-md bg-rose-100 text-rose-800">
                    {activeRiskRulesCount} Active
                  </span>
                </button>
              </div>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">

              {saveSuccessToast && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-3 rounded-xl flex items-center gap-2 font-bold animate-in fade-in duration-200">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Configuration saved successfully! All scoring engines and risk monitors are updated.</span>
                </div>
              )}

              {/* ========================================================================= */}
              {/* TAB 1: HEALTH SCORE CALCULATION RULES                                     */}
              {/* ========================================================================= */}
              {configureRulesTab === 'health' && (
                <div className="space-y-6 animate-in fade-in duration-150">

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
                          DEFAULT_HEALTH_CATEGORIES.reduce((sum, c) => sum + (healthCategoryEnabled[c.id] !== false ? (Number(healthCategoryWeights[c.id]) || 0) : 0), 0) === 100
                            ? 'text-slate-900'
                            : 'text-amber-700'
                        }>{
                          DEFAULT_HEALTH_CATEGORIES.reduce((sum, c) => sum + (healthCategoryEnabled[c.id] !== false ? (Number(healthCategoryWeights[c.id]) || 0) : 0), 0)
                        }</strong>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                      {DEFAULT_HEALTH_CATEGORIES.map(cat => {
                        const isEnabled = healthCategoryEnabled[cat.id] !== false;
                        const weight = healthCategoryWeights[cat.id] ?? cat.weight;

                        return (
                          <div
                            key={cat.id}
                            className={`p-3.5 rounded-2xl border transition-all ${
                              isEnabled ? 'bg-white border-slate-200 shadow-2xs' : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                                {cat.id === 'Basic' ? 'Category Basic' : `Category ${cat.id}`}
                              </span>
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={e => setHealthCategoryEnabled({ ...healthCategoryEnabled, [cat.id]: e.target.checked })}
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
                                  onChange={e => setHealthCategoryWeights({
                                    ...healthCategoryWeights,
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

                  {/* Health Filter Pills & Search */}
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="relative flex-1 w-full max-w-md">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={healthRuleSearch}
                          onChange={e => setHealthRuleSearch(e.target.value)}
                          placeholder="Search health scoring criteria, channels, and rules..."
                          className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowAddHealthRuleModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" /> Add Custom Health Rule
                      </button>
                    </div>

                    {/* Category Filter Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs custom-scrollbar">
                      {CATALOG_CATEGORIES.map(cat => {
                        const count = allAvailableHealthRules.filter(r => {
                          if (cat === 'All Criteria') return true;
                          if (cat === 'Basic') return Boolean(r.isBasic) || r.category === 'Basic';
                          return r.category === cat;
                        }).length;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setHealthCatalogCategory(cat)}
                            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${healthCatalogCategory === cat
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                              }`}
                          >
                            {cat} ({count})
                          </button>
                        );
                      })}
                      {customHealthRules.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setHealthCatalogCategory('Custom')}
                          className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${healthCatalogCategory === 'Custom'
                              ? 'bg-slate-900 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                            }`}
                        >
                          <span>Custom Rules</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full font-extrabold bg-purple-100 text-purple-700">
                            {customHealthRules.length}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Health Criteria Cards Grid */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                      <span>Displaying {filteredHealthRules.length} scoring criteria</span>
                      <span className="text-emerald-700 font-extrabold">{activeHealthRulesCount} of {allAvailableHealthRules.length} active</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredHealthRules.map(rule => {
                        const parentCat = DEFAULT_HEALTH_CATEGORIES.find(c => c.categoryKey === rule.category || (c.categoryKeys && c.categoryKeys.includes(rule.category)) || c.name === rule.category);
                        const isCatEnabled = !parentCat || healthCategoryEnabled[parentCat.id] !== false;
                        const isRuleActive = activeHealthRules[rule.id] === true || (activeHealthRules[rule.id] === undefined && rule.defaultEnabled === true);
                        const isEnabled = isCatEnabled && isRuleActive;
                        const isBonus = (rule.points || 0) > 0 || rule.type === 'bonus';
                        const pointsStr = isBonus ? `+${Math.abs(rule.points)} pts` : `-${Math.abs(rule.points)} pts`;

                        return (
                          <div
                            key={rule.id}
                            className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${isEnabled
                                ? 'bg-white border-slate-200/90 shadow-2xs hover:border-slate-300'
                                : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                              }`}
                          >
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
                                  {!isCatEnabled && (
                                    <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                      Category Off
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {rule.isCustom && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteCustomHealthRule(rule.id)}
                                      className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                                      title="Delete custom rule"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full border ${isBonus ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
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

                            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                  {rule.window || '30d'}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                  {rule.channel || 'All'}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => setActiveHealthRules({ ...activeHealthRules, [rule.id]: !isRuleActive })}
                                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out ${isEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                                  }`}
                                title={isEnabled ? 'Click to disable' : 'Click to enable'}>
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isEnabled ? 'translate-x-[22px]' : 'translate-x-[2px]'
                                  }`} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}

              {/* ========================================================================= */}
              {/* TAB 2: RISK ANALYSIS & SCORING RULES                                      */}
              {/* ========================================================================= */}
              {configureRulesTab === 'risks' && (
                <div className="space-y-6 animate-in fade-in duration-150">

                  {/* Category Weights Configuration */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                          Category Weights & Activation
                        </h4>
                        <p className="text-xs text-slate-500">
                          Admin-editable category weights (default sum: 100). Turn off categories to exclude from risk calculation.
                        </p>
                      </div>
                      <div className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-xl">
                        Active Weights Sum: <strong className="text-slate-900">{
                          DEFAULT_RISK_CATEGORIES.reduce((sum, c) => sum + (categoryEnabled[c.id] ? (Number(categoryWeights[c.id]) || 0) : 0), 0)
                        }</strong>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                      {DEFAULT_RISK_CATEGORIES.map(cat => {
                        const isEnabled = categoryEnabled[cat.id] !== false;
                        const weight = categoryWeights[cat.id] ?? cat.weight;

                        return (
                          <div
                            key={cat.id}
                            className={`p-3.5 rounded-2xl border transition-all ${isEnabled ? 'bg-white border-slate-200 shadow-2xs' : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                              }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                                {cat.id === 'Basic' ? 'Category Basic' : `Category ${cat.id}`}
                              </span>
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={e => setCategoryEnabled({ ...categoryEnabled, [cat.id]: e.target.checked })}
                                className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                                title={isEnabled ? 'Disable category' : 'Enable category'}
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
                                  onChange={e => setCategoryWeights({ ...categoryWeights, [cat.id]: Math.max(0, parseInt(e.target.value) || 0) })}
                                  className="w-14 px-2 py-0.5 text-xs font-bold text-center border border-slate-200 rounded-lg focus:outline-none focus:border-rose-500 disabled:opacity-50"
                                />
                                <span className="text-xs text-slate-400 font-semibold">%</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Risk Catalog Filter Pills & Search */}
                  <div className="space-y-3 pt-2">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="relative flex-1 w-full max-w-md">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={riskRuleSearch}
                          onChange={e => setRiskRuleSearch(e.target.value)}
                          placeholder="Search across all 74 risk rules, triggers, and keywords..."
                          className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 bg-white"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowAddRiskRuleModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" /> Add Custom Risk Rule
                      </button>
                    </div>

                    {/* Category Filter Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs custom-scrollbar">
                      <button
                        type="button"
                        onClick={() => setRiskCatalogCategory('All')}
                        className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${riskCatalogCategory === 'All'
                            ? 'bg-rose-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                          }`}
                      >
                        All Rules ({allAvailableRiskRules.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setRiskCatalogCategory('Basic')}
                        className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${riskCatalogCategory === 'Basic'
                            ? 'bg-rose-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                          }`}
                      >
                        Basic ({allAvailableRiskRules.filter(r => r.isBasic || r.categoryId === 'Basic').length})
                      </button>
                      {DEFAULT_RISK_CATEGORIES.filter(c => c.id !== 'Basic').map(cat => {
                        const count = allAvailableRiskRules.filter(r => r.categoryId === cat.id).length;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setRiskCatalogCategory(cat.id)}
                            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${riskCatalogCategory === cat.id
                                ? 'bg-rose-600 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                              }`}
                          >
                            {cat.id}. {cat.name.split(' ')[0]} ({count})
                          </button>
                        );
                      })}
                      {customRiskRules.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setRiskCatalogCategory('Custom')}
                          className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${riskCatalogCategory === 'Custom'
                              ? 'bg-slate-900 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                            }`}
                        >
                          <span>Custom Rules</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full font-extrabold bg-purple-100 text-purple-700">
                            {customRiskRules.length}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Risk Criteria Cards Grid */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                      <span>Displaying {filteredRiskRules.length} risk criteria</span>
                      <span className="text-emerald-700 font-extrabold">{activeRiskRulesCount} of {allAvailableRiskRules.length} active</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredRiskRules.map(rule => {
                        const isParentCatEnabled = categoryEnabled[rule.categoryId] !== false;
                        const isBasicEnabled = !rule.isBasic || categoryEnabled['Basic'] !== false;
                        const isCatEnabled = isParentCatEnabled && isBasicEnabled;
                        const isRuleActive = activeRiskRules[rule.id] === true || (activeRiskRules[rule.id] === undefined && rule.defaultEnabled === true);
                        const isEnabled = isCatEnabled && isRuleActive;
                        const pointsStr = `+${Math.abs(rule.points || 0)} pts`;

                        return (
                          <div
                            key={rule.id}
                            className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${isEnabled
                                ? 'bg-white border-slate-200 shadow-2xs hover:border-slate-300'
                                : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                              }`}
                          >
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
                                  {(categoryEnabled[rule.categoryId] === false || (rule.isBasic && categoryEnabled['Basic'] === false)) && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                                      Category Off
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {rule.isCustom && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteCustomRiskRule(rule.id)}
                                      className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                                      title="Delete custom rule"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full border bg-rose-50 text-rose-700 border-rose-200">
                                    {pointsStr}
                                  </span>
                                </div>
                              </div>

                              <h5 className="text-xs font-bold text-slate-900 leading-snug">
                                {rule.name || rule.label}
                              </h5>
                              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                {rule.trigger || rule.description}
                              </p>
                              {rule.isTiered && (
                                <span className="inline-block text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/80">
                                  Tiered (Highest silence tier counts)
                                </span>
                              )}
                            </div>

                            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                  {rule.window || 'Live Signal'}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                  {rule.channel || 'All Sources'}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => setActiveRiskRules({ ...activeRiskRules, [rule.id]: !isRuleActive })}
                                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out ${isEnabled ? 'bg-rose-600' : 'bg-slate-300'
                                  }`}
                                title={isEnabled ? 'Click to disable rule' : 'Click to enable rule'}
                              >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isEnabled ? 'translate-x-[22px]' : 'translate-x-[2px]'
                                  }`} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500 font-medium hidden sm:block">
                <span>
                  {configureRulesTab === 'health'
                    ? `Health Criteria: ${activeHealthRulesCount} active rules`
                    : `Risk Catalog: ${activeRiskRulesCount} active rules · 8 categories`}
                </span>
              </div>
              <div className="flex items-center gap-3">

                <button
                  type="button"
                  onClick={() => setShowConfigureRules(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAllConfigurations}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-opacity cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Save All Configurations
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CUSTOM HEALTH RULE BUILDER MODAL                                          */}
      {/* ========================================================================= */}
      {showAddHealthRuleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" /> Custom Health Rule Builder
              </h3>
              <button onClick={() => setShowAddHealthRuleModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rule Name / Condition</label>
                <input
                  type="text"
                  value={customHealthRuleForm.label}
                  onChange={e => setCustomHealthRuleForm({ ...customHealthRuleForm, label: e.target.value })}
                  placeholder="e.g. Unresolved technical blocker > 14 days"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Metric Category</label>
                  <select
                    value={customHealthRuleForm.category}
                    onChange={e => setCustomHealthRuleForm({ ...customHealthRuleForm, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-xs font-medium bg-white"
                  >
                    {CATALOG_CATEGORIES.filter(c => c !== 'All Criteria').map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Time Window</label>
                  <select
                    value={customHealthRuleForm.window}
                    onChange={e => setCustomHealthRuleForm({ ...customHealthRuleForm, window: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-xs font-medium bg-white"
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
                    value={customHealthRuleForm.channel}
                    onChange={e => setCustomHealthRuleForm({ ...customHealthRuleForm, channel: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-xs font-medium bg-white"
                  >
                    <option value="All Sources">All Sources</option>
                    <option value="Outlook Email">Outlook Email</option>
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
                    value={customHealthRuleForm.tier}
                    onChange={e => setCustomHealthRuleForm({ ...customHealthRuleForm, tier: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-xs font-medium bg-white"
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
                    value={customHealthRuleForm.operator}
                    onChange={e => setCustomHealthRuleForm({ ...customHealthRuleForm, operator: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-xs font-medium bg-white"
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
                    value={customHealthRuleForm.value}
                    onChange={e => setCustomHealthRuleForm({ ...customHealthRuleForm, value: e.target.value })}
                    placeholder="e.g. 30, or 'escalation'"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-xs font-medium"
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
                    value={customHealthRuleForm.points}
                    onChange={e => setCustomHealthRuleForm({ ...customHealthRuleForm, points: parseInt(e.target.value) || 0 })}
                    placeholder="-15 or +10"
                    className="w-32 px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-xs font-bold"
                  />
                  <span className="text-xs text-slate-500 font-medium">
                    {customHealthRuleForm.points > 0 ? '🟢 Adds bonus points' : '🔴 Subtracts penalty points'}
                  </span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddHealthRuleModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomHealthRule}
                disabled={!customHealthRuleForm.label.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                Add Rule to Catalog
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CUSTOM RISK RULE BUILDER MODAL                                            */}
      {/* ========================================================================= */}
      {showAddRiskRuleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" /> Custom Risk Rule Builder
              </h3>
              <button onClick={() => setShowAddRiskRuleModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rule Name / Condition</label>
                <input
                  type="text"
                  value={customRiskRuleForm.label}
                  onChange={e => setCustomRiskRuleForm({ ...customRiskRuleForm, label: e.target.value })}
                  placeholder="e.g. Unresolved technical blocker > 14 days"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-rose-500 text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Metric Category</label>
                  <select
                    value={customRiskRuleForm.categoryId}
                    onChange={e => {
                      const selCat = DEFAULT_RISK_CATEGORIES.find(c => c.id === e.target.value);
                      setCustomRiskRuleForm({
                        ...customRiskRuleForm,
                        categoryId: e.target.value,
                        category: selCat ? selCat.name : customRiskRuleForm.category
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-rose-500 text-xs font-medium bg-white"
                  >
                    {DEFAULT_RISK_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.id}. {cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Time Window</label>
                  <select
                    value={customRiskRuleForm.window}
                    onChange={e => setCustomRiskRuleForm({ ...customRiskRuleForm, window: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-rose-500 text-xs font-medium bg-white"
                  >
                    <option value="7d window">7 days</option>
                    <option value="14d window">14 days</option>
                    <option value="30d window">30 days</option>
                    <option value="45d window">45 days</option>
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
                    value={customRiskRuleForm.channel}
                    onChange={e => setCustomRiskRuleForm({ ...customRiskRuleForm, channel: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-rose-500 text-xs font-medium bg-white"
                  >
                    <option value="All Sources">All Sources</option>
                    <option value="Outlook Email">Outlook Email</option>
                    <option value="Teams Meeting">Teams Meeting</option>
                    <option value="In-Person Visit">In-Person Visit</option>
                    <option value="Phone Call">Phone Call</option>
                    <option value="Manual Log">Manual Log</option>
                    <option value="Tasks Table">Tasks Table</option>
                    <option value="CRM & Contract">CRM & Contract</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Applicable Tier</label>
                  <select
                    value={customRiskRuleForm.tier}
                    onChange={e => setCustomRiskRuleForm({ ...customRiskRuleForm, tier: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-rose-500 text-xs font-medium bg-white"
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
                    value={customRiskRuleForm.operator}
                    onChange={e => setCustomRiskRuleForm({ ...customRiskRuleForm, operator: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-rose-500 text-xs font-medium bg-white"
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
                    value={customRiskRuleForm.value}
                    onChange={e => setCustomRiskRuleForm({ ...customRiskRuleForm, value: e.target.value })}
                    placeholder="e.g. 30, or 'escalation'"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-rose-500 text-xs font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Risk Score Impact (Points)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={customRiskRuleForm.points}
                    onChange={e => setCustomRiskRuleForm({ ...customRiskRuleForm, points: parseInt(e.target.value) || 0 })}
                    placeholder="30 or 50"
                    className="w-32 px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-rose-500 text-xs font-bold"
                  />
                  <span className="text-xs text-rose-600 font-medium">
                    Adds points to category score (capped at 100 max per category)
                  </span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddRiskRuleModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomRiskRule}
                disabled={!customRiskRuleForm.label.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                Add Rule to Catalog
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Risk Categories Reference Guide Modal */}
      {showCategoriesGuide && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white max-w-4xl w-full rounded-xl border border-gray-200 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex items-start justify-between bg-gray-50/70">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded border border-blue-100">Knowledge Base</span>
                </div>
                <h2 className="text-lg font-bold text-black flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                  Risk Categories Reference Guide
                </h2>
                <p className="text-xs text-gray-500 mt-1 font-medium">
                  Operational definitions, system triggers, and severity levels for customer risk monitoring in Customer Pulse.
                </p>
              </div>
              <button
                onClick={() => setShowCategoriesGuide(false)}
                className="text-gray-400 hover:text-gray-800 bg-white border border-gray-200 hover:bg-gray-100 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Filter inside Modal */}
            <div className="p-4 border-b border-gray-100 bg-white flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter categories (e.g., Delivery, Escalation, Contract, Frustration)..."
                  value={guideSearchQuery}
                  onChange={(e) => setGuideSearchQuery(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-black focus:outline-none focus:border-blue-500"
                />
              </div>
              {guideSearchQuery && (
                <button
                  onClick={() => setGuideSearchQuery('')}
                  className="text-xs text-gray-500 hover:text-black font-semibold cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Modal Table Content */}
            <div className="p-4 overflow-auto flex-1 custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-[11px] font-bold text-gray-500 bg-gray-50/50">
                    <th className="py-2.5 px-3.5 font-bold uppercase tracking-wider w-44">Category</th>
                    <th className="py-2.5 px-3.5 font-bold uppercase tracking-wider">What It Means</th>
                    <th className="py-2.5 px-3.5 font-bold uppercase tracking-wider">Primary Trigger / Origin</th>
                    <th className="py-2.5 px-3.5 font-bold uppercase tracking-wider w-36">Default Severity</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-gray-100">
                  {RISK_CATEGORIES_INFO
                    .filter(cat => {
                      if (!guideSearchQuery.trim()) return true;
                      const q = guideSearchQuery.toLowerCase();
                      return cat.category.toLowerCase().includes(q) ||
                        cat.meaning.toLowerCase().includes(q) ||
                        cat.trigger.toLowerCase().includes(q) ||
                        cat.severity.toLowerCase().includes(q);
                    })
                    .map((cat, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                        <td className="py-3 px-3.5 align-top">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-900 border border-gray-200">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.dotColor || '#3b82f6' }} />
                            {cat.category}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-gray-800 leading-relaxed font-medium align-top">
                          {cat.meaning}
                        </td>
                        <td className="py-3 px-3.5 text-gray-600 leading-relaxed align-top">
                          <span className="font-semibold text-gray-700">{cat.trigger}</span>
                        </td>
                        <td className="py-3 px-3.5 align-top">
                          <span className={`inline-block text-[10px] px-2 py-0.5 rounded font-bold border ${cat.severityBadge}`}>
                            {cat.severity}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="text-[11px] text-gray-500 font-medium">
                Categories are detected automatically from communications and scheduled account tasks.
              </span>
              <button
                type="button"
                onClick={() => setShowCategoriesGuide(false)}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
