import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../store/index.js';
import {
  Search,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Plus,
  Clock,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  History,
  Globe,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  RotateCw,
  ArrowUpDown,
  SlidersHorizontal,
  Trash2,
  Award,
  DollarSign,
  Info,
  TrendingDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '../../utils/dateFormat.js';
import {
  DEFAULT_RISK_CATEGORIES,
  READY_MADE_RISK_RULES,
  HARD_OVERRIDES,
  IMPACT_MULTIPLIERS,
  RISK_BANDS,
  calculateWeightedRiskScore
} from '../../utils/riskRulesCatalog.js';

export default function RisksTab({ account, onToast, onRiskRulesUpdated, onRiskMetricsChanged }) {
  const navigate = useNavigate();
  const { token, user, showActivityToast: storeToast, fetchDashboardStats, fetchAccounts } = useStore();
  const showActivityToast = onToast || storeToast;
  const accId = account?.accountId || account?.id;
  const API_BASE = '/CustomerPulse/api';

  // Role detection: 'All Accounts' global scope is strictly reserved for Admins
  const isAdmin = useMemo(() => {
    if (!user) return false;
    const role = String(user.role || user.userType || '').toLowerCase();
    const uid = String(user.uid || user.id || '').toLowerCase();
    const email = String(user.email || '').toLowerCase();
    return role === 'admin' || uid === 'mock-admin-uid' || uid.includes('admin') || email.includes('admin');
  }, [user]);

  // Live Database State
  const [risks, setRisks] = useState([]);
  const [allSystemRisks, setAllSystemRisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchScope, setSearchScope] = useState('account'); // 'account' or 'global' (admins only)

  // Enforce account-only scope for non-admins
  useEffect(() => {
    if (!isAdmin && searchScope !== 'account') {
      setSearchScope('account');
    }
  }, [isAdmin, searchScope]);

  // Modal State for Manual Risk Creation
  const [showModal, setShowModal] = useState(false);
  const [newRisk, setNewRisk] = useState({ title: '', category: 'Commercial', severity: 'Medium', description: '', dueDate: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Customize Risk Rules & Engine States
  const [showCustomizeRulesModal, setShowCustomizeRulesModal] = useState(false);
  const [showAddCustomRuleModal, setShowAddCustomRuleModal] = useState(false);
  const [catalogCategory, setCatalogCategory] = useState('All');
  const [ruleSearch, setRuleSearch] = useState('');
  const [isSavingRules, setIsSavingRules] = useState(false);

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

  const [activeRules, setActiveRules] = useState(() => {
    const defaults = {};
    READY_MADE_RISK_RULES.forEach(r => { defaults[r.id] = r.defaultEnabled === true; });
    return defaults;
  });

  const [customRules, setCustomRules] = useState([]);
  const [contractValue, setContractValue] = useState(() => {
    return account?.contractValue || (account?.tier === 'Strategic' ? 250000 : account?.tier === 'Key' ? 120000 : account?.tier === 'Standard' ? 50000 : 25000);
  });

  const [bandProbabilities, setBandProbabilities] = useState({
    Low: 5,
    Medium: 25,
    High: 50,
    Critical: 80
  });

  // Custom rule creation form state
  const [customRuleForm, setCustomRuleForm] = useState({
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

  // Load risk rules & scoring preferences for this specific account (or global fallback)
  useEffect(() => {
    try {
      const savedConfig = (accId && localStorage.getItem(`customer_pulse_risk_config_${accId}`)) ||
                          localStorage.getItem('customer_pulse_risk_rules_global');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        if (parsed.categoryWeights) setCategoryWeights(parsed.categoryWeights);
        if (parsed.categoryEnabled) setCategoryEnabled(parsed.categoryEnabled);
        if (parsed.rulesVersion === 2 && parsed.activeRules) {
          setActiveRules(parsed.activeRules);
        } else {
          // Rebase to Basic-only default
          const defaults = {};
          READY_MADE_RISK_RULES.forEach(r => { defaults[r.id] = r.defaultEnabled === true; });
          setActiveRules(defaults);
        }
        if (parsed.customRules) setCustomRules(parsed.customRules);
        if (parsed.contractValue) setContractValue(parsed.contractValue);
        if (parsed.bandProbabilities) setBandProbabilities(parsed.bandProbabilities);
      } else {
        // Defaults: only Basic rules are ON, everything else is OFF
        const defaults = {};
        READY_MADE_RISK_RULES.forEach(r => { defaults[r.id] = r.defaultEnabled === true; });
        setActiveRules(defaults);
      }
    } catch (e) {
      console.error('Failed to load risk rules config:', e);
    }
  }, [accId]);

  useEffect(() => {
    const handleRulesUpdated = (e) => {
      // Isolate updates strictly to the current account or global broadcasts
      if (e.detail?.accountId && accId && String(e.detail.accountId) !== String(accId)) {
        return;
      }
      const payload = e.detail?.payload || e.detail?.riskPayload;
      if (payload) {
        if (payload.categoryWeights) setCategoryWeights(payload.categoryWeights);
        if (payload.categoryEnabled) setCategoryEnabled(payload.categoryEnabled);
        if (payload.activeRules) setActiveRules(payload.activeRules);
        if (payload.customRules) setCustomRules(payload.customRules);
        if (payload.bandProbabilities) setBandProbabilities(payload.bandProbabilities);
      }
    };
    window.addEventListener('account-risk-rules-updated', handleRulesUpdated);
    window.addEventListener('health-rules-updated', handleRulesUpdated);
    return () => {
      window.removeEventListener('account-risk-rules-updated', handleRulesUpdated);
      window.removeEventListener('health-rules-updated', handleRulesUpdated);
    };
  }, [accId]);

  // Notify Modal State
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [selectedRiskForNotify, setSelectedRiskForNotify] = useState(null);
  const [isNotifying, setIsNotifying] = useState(false);
  const [notifiedRisks, setNotifiedRisks] = useState(new Set());
  const [notifyRouting, setNotifyRouting] = useState({ senderRole: null, canNotify: false, recipients: [], loading: true, error: '' });

  // Dedicated AI 3-Part Risk Workspace Details Modal State
  const [selectedRiskForDetails, setSelectedRiskForDetails] = useState(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [sortBy, setSortBy] = useState('high_risk'); // 'high_risk' | 'newest' | 'lowest_health'

  // Tabs & Search Controls
  const [activeTab, setActiveTab] = useState('Active');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedHistory, setExpandedHistory] = useState({});

  const toggleHistory = (id) => {
    setExpandedHistory(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const riskKeyOf = (risk) => risk?.riskId || risk?.id || risk?.title;

  // 1. Fetch Real Risks for this Account directly from Database with Zero-Flicker Background Sync
  const loadAccountRisks = async (options = {}) => {
    const { isInitial = false } = options;
    if (!accId || !token) return;

    // Only toggle loading spinner on first initial load when there are no risks yet
    if (isInitial && risks.length === 0) {
      setLoading(true);
    }

    try {
      const res = await fetch(`${API_BASE}/risks?accountId=${encodeURIComponent(accId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        // Zero-flicker update: strictly isolate risks to this account
        const accountOnlyRisks = data.filter(r => !r.accountId || String(r.accountId) === String(accId));
        setRisks(prev => {
          if (JSON.stringify(prev) === JSON.stringify(accountOnlyRisks)) {
            return prev; // Identical, prevent unnecessary re-render
          }
          return accountOnlyRisks;
        });
      } else {
        console.warn('Failed to load risks:', data);
      }
    } catch (err) {
      console.error('Error loading account risks:', err);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  // Fetch all system risks if an admin switches to global scope (silent sync)
  const loadGlobalRisks = async () => {
    if (!token || !isAdmin) return;
    try {
      const res = await fetch(`${API_BASE}/risks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setAllSystemRisks(prev => {
          if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
          return data;
        });
      }
    } catch (err) {
      console.error('Error loading global risks:', err);
    }
  };

  // Initial load
  useEffect(() => {
    loadAccountRisks({ isInitial: true });
  }, [accId, token]);

  // Seamless auto-refresh without flickering: polls every 6 seconds, and instantly refreshes on focus or actions
  useEffect(() => {
    if (!accId || !token) return;

    const interval = setInterval(() => {
      loadAccountRisks({ isInitial: false });
      if (isAdmin && searchScope === 'global') {
        loadGlobalRisks();
      }
    }, 6000);

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        loadAccountRisks({ isInitial: false });
      }
    };

    const handleCustomSync = () => {
      loadAccountRisks({ isInitial: false });
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('refresh-risks', handleCustomSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('refresh-risks', handleCustomSync);
    };
  }, [accId, token, isAdmin, searchScope]);

  // 2. Load role-based recipients + already-notified risks for this account
  useEffect(() => {
    if (!accId || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/risks/notify/recipients?accountId=${encodeURIComponent(accId)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Failed to load recipients');
        setNotifyRouting({ ...data, loading: false, error: '' });
        setNotifiedRisks(new Set(data.notifiedKeys || []));
      } catch (err) {
        if (!cancelled) setNotifyRouting(prev => ({ ...prev, loading: false, error: err.message }));
      }
    })();
    return () => { cancelled = true; };
  }, [accId, token]);

  // 3. Handle Send Notification
  const handleSendNotification = async () => {
    if (!selectedRiskForNotify) return;
    setIsNotifying(true);
    try {
      const risk = selectedRiskForNotify;
      const res = await fetch(`${API_BASE}/risks/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          accountId: accId,
          risk: {
            riskId: risk.riskId || risk.id,
            key: riskKeyOf(risk),
            title: risk.title || risk.category,
            severity: risk.severity,
            category: risk.category,
            description: risk.description || risk.evidence || '',
            suggested: risk.suggested || ''
          }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send notification');

      const names = (data.recipients || []).map(r => r.name).join(', ');
      if (showActivityToast) showActivityToast(`Notified ${names || 'stakeholders'} via email & in-app`);
      setNotifiedRisks(prev => new Set(prev).add(data.riskKey || riskKeyOf(risk)));
      setNotifyModalOpen(false);
      setSelectedRiskForNotify(null);
    } catch (err) {
      console.error(err);
      if (showActivityToast) showActivityToast(err.message);
    } finally {
      setIsNotifying(false);
    }
  };

  // 3b. Deep AI Risk Analysis Re-run
  const handleAiReanalyze = async (riskId) => {
    if (!riskId || !token) return;
    setReanalyzing(true);
    try {
      const res = await fetch(`${API_BASE}/risks/${riskId}/ai-analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data) {
        setSelectedRiskForDetails(prev => ({
          ...prev,
          ...data,
          whatIsRisk: data.whatIsRisk,
          whyItHappens: data.whyItHappens,
          howToResolve: data.howToResolve,
          description: data.whatIsRisk || data.description
        }));
        setRisks(prev => prev.map(r => ((r.riskId || r.id) === riskId ? { ...r, ...data } : r)));
        if (showActivityToast) showActivityToast('AI Risk Analysis freshly synthesized for account');
      }
    } catch (e) {
      console.error('Error re-analyzing with AI:', e);
    } finally {
      setReanalyzing(false);
    }
  };

  // 4. Handle Create Manual Risk in PostgreSQL Database
  const handleCreateRisk = async (e) => {
    e.preventDefault();
    if (!newRisk.category) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/risks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          accountId: accId,
          title: newRisk.title.trim() || newRisk.category,
          category: newRisk.category,
          severity: newRisk.severity,
          description: newRisk.description,
          dueDate: newRisk.dueDate || null,
          source: 'Manual'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create risk');

      if (showActivityToast) showActivityToast(`Risk "${data.title || data.category}" created successfully`);
      setShowModal(false);
      setNewRisk({ title: '', category: 'Commercial', severity: 'Medium', description: '', dueDate: '' });
      await loadAccountRisks();
      if (fetchDashboardStats) fetchDashboardStats();
      if (fetchAccounts) fetchAccounts(1);
    } catch (err) {
      console.error(err);
      if (showActivityToast) showActivityToast(err.message || 'Error creating risk');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 5. Handle Acknowledge Risk
  const handleAcknowledgeRisk = async (risk) => {
    const id = risk.riskId || risk.id;
    try {
      const res = await fetch(`${API_BASE}/risks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'Acknowledged' })
      });
      if (!res.ok) throw new Error('Failed to acknowledge risk');

      setRisks(prev => prev.map(r => ((r.riskId || r.id) === id ? { ...r, status: 'Acknowledged', acknowledgedAt: new Date().toISOString() } : r)));
      if (showActivityToast) showActivityToast(`Risk acknowledged`);
      if (fetchDashboardStats) fetchDashboardStats();
    } catch (err) {
      console.error(err);
      if (showActivityToast) showActivityToast(err.message);
    }
  };

  // 6. Handle Resolve Risk
  const handleResolveRisk = async (risk) => {
    const id = risk.riskId || risk.id;
    try {
      const res = await fetch(`${API_BASE}/risks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'Resolved' })
      });
      if (!res.ok) throw new Error('Failed to resolve risk');

      setRisks(prev => prev.map(r => ((r.riskId || r.id) === id ? { ...r, status: 'Resolved', resolvedAt: new Date().toISOString() } : r)));
      if (showActivityToast) showActivityToast(`Risk marked as resolved`);
      if (fetchDashboardStats) fetchDashboardStats();
      if (fetchAccounts) fetchAccounts(1);
    } catch (err) {
      console.error(err);
      if (showActivityToast) showActivityToast(err.message);
    }
  };

  // 7. Handle Reopen Risk
  const handleReopenRisk = async (risk) => {
    const id = risk.riskId || risk.id;
    try {
      const res = await fetch(`${API_BASE}/risks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'Open' })
      });
      if (!res.ok) throw new Error('Failed to reopen risk');

      setRisks(prev => prev.map(r => ((r.riskId || r.id) === id ? { ...r, status: 'Open', resolvedAt: null } : r)));
      if (showActivityToast) showActivityToast(`Risk reopened`);
      if (fetchDashboardStats) fetchDashboardStats();
    } catch (err) {
      console.error(err);
      if (showActivityToast) showActivityToast(err.message);
    }
  };

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

  // All Catalog and Custom Rules combined
  const allAvailableRiskRules = useMemo(() => {
    return [...READY_MADE_RISK_RULES, ...customRules];
  }, [customRules]);

  // 8. Real Live Metric Computations directly from Real Database Records
  const activeRisksList = useMemo(() => {
    return risks.filter(r => {
      if ((r.status || '').toLowerCase() === 'resolved') return false;
      const catId = getRiskCategoryId(r);
      if (catId && categoryEnabled[catId] === false) return false;

      const titleLower = (r.title || '').toLowerCase();
      const ruleLower = (r.rule || '').toLowerCase();
      const descLower = (r.description || '').toLowerCase();

      const matchedRule = allAvailableRiskRules.find(catalogRule => {
        const catNameLower = (catalogRule.name || catalogRule.label || '').toLowerCase();
        return (catNameLower && (titleLower.includes(catNameLower) || ruleLower.includes(catNameLower))) ||
          (catalogRule.trigger && descLower.includes(catalogRule.trigger.toLowerCase()));
      });

      if (matchedRule) {
        const isRuleActive = activeRules[matchedRule.id] === true || (activeRules[matchedRule.id] === undefined && matchedRule.defaultEnabled === true);
        if (!isRuleActive) return false;
      }
      return true;
    });
  }, [risks, categoryEnabled, activeRules, allAvailableRiskRules]);

  const resolvedRisksList = useMemo(() => {
    return risks.filter(r => (r.status || '').toLowerCase() === 'resolved');
  }, [risks]);

  const notifiedRisksList = useMemo(() => {
    return activeRisksList.filter(r => notifiedRisks.has(riskKeyOf(r)));
  }, [activeRisksList, notifiedRisks]);

  const criticalCount = useMemo(() => {
    return activeRisksList.filter(r => (r.severity || '').toLowerCase() === 'critical').length;
  }, [activeRisksList]);

  const highCount = useMemo(() => {
    return activeRisksList.filter(r => (r.severity || '').toLowerCase() === 'high').length;
  }, [activeRisksList]);

  const mediumCount = useMemo(() => {
    return activeRisksList.filter(r => {
      const s = (r.severity || '').toLowerCase();
      return s === 'medium' || s === 'low';
    }).length;
  }, [activeRisksList]);

  const unacknowledgedCount = useMemo(() => {
    return activeRisksList.filter(r => (r.status || '').toLowerCase() !== 'acknowledged').length;
  }, [activeRisksList]);

  const resolvedCount = useMemo(() => {
    return resolvedRisksList.length;
  }, [resolvedRisksList]);

  // Filtered rules for modal display
  const filteredRiskRules = useMemo(() => {
    return allAvailableRiskRules.filter(rule => {
      let matchesCat = true;
      if (catalogCategory === 'Custom') {
        matchesCat = Boolean(rule.isCustom);
      } else if (catalogCategory === 'Basic') {
        matchesCat = Boolean(rule.isBasic) || rule.categoryId === 'Basic' || rule.category === 'Basic';
      } else if (catalogCategory !== 'All') {
        matchesCat = rule.categoryId === catalogCategory || rule.category === catalogCategory;
      }
      const q = ruleSearch.toLowerCase().trim();
      const matchesQuery = !q ||
        (rule.name || rule.label || '').toLowerCase().includes(q) ||
        (rule.trigger || rule.description || '').toLowerCase().includes(q) ||
        (rule.category || '').toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [allAvailableRiskRules, catalogCategory, ruleSearch]);

  const activeRulesCount = useMemo(() => {
    return allAvailableRiskRules.filter(r => {
      const isParentCatEnabled = categoryEnabled[r.categoryId] !== false;
      const isBasicEnabled = !r.isBasic || categoryEnabled['Basic'] !== false;
      const isRuleActive = activeRules[r.id] === true || (activeRules[r.id] === undefined && r.defaultEnabled === true);
      return isParentCatEnabled && isBasicEnabled && isRuleActive;
    }).length;
  }, [allAvailableRiskRules, activeRules, categoryEnabled]);

  // Add Custom Rule
  const handleAddCustomRiskRule = () => {
    if (!customRuleForm.label.trim()) return;
    const catObj = DEFAULT_RISK_CATEGORIES.find(c => c.id === customRuleForm.categoryId) || DEFAULT_RISK_CATEGORIES[0];
    const newId = `custom_risk_${Date.now()}`;
    const newRule = {
      id: newId,
      categoryId: catObj.id,
      category: catObj.name,
      name: customRuleForm.label.trim(),
      label: customRuleForm.label.trim(),
      trigger: `${customRuleForm.channel} · ${customRuleForm.operator} ${customRuleForm.value} (${customRuleForm.window})`,
      description: `${customRuleForm.channel} · ${customRuleForm.operator} ${customRuleForm.value} (${customRuleForm.window})`,
      points: Number(customRuleForm.points) || 20,
      window: customRuleForm.window,
      channel: customRuleForm.channel,
      tier: customRuleForm.tier,
      isCustom: true,
      defaultEnabled: true
    };
    const updatedCustom = [...customRules, newRule];
    const updatedActive = { ...activeRules, [newId]: true };
    setCustomRules(updatedCustom);
    setActiveRules(updatedActive);

    const globalPayload = {
      categoryWeights,
      categoryEnabled,
      activeRules: updatedActive,
      customRules: updatedCustom,
      contractValue,
      bandProbabilities
    };
    localStorage.setItem('customer_pulse_risk_rules_global', JSON.stringify(globalPayload));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('account-risk-rules-updated', { detail: { payload: globalPayload, global: true } }));
    }

    setShowAddCustomRuleModal(false);
    setCustomRuleForm({
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
    showActivityToast?.(`Added "${newRule.name}" (+${newRule.points} pts) to ${newRule.category}`);
  };

  // Delete Custom Rule
  const handleDeleteCustomRule = (id) => {
    const updatedCustom = customRules.filter(r => r.id !== id);
    const updatedActive = { ...activeRules };
    delete updatedActive[id];
    setCustomRules(updatedCustom);
    setActiveRules(updatedActive);
    const globalPayload = {
      categoryWeights,
      categoryEnabled,
      activeRules: updatedActive,
      customRules: updatedCustom,
      contractValue,
      bandProbabilities
    };
    localStorage.setItem('customer_pulse_risk_rules_global', JSON.stringify(globalPayload));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('account-risk-rules-updated', { detail: { payload: globalPayload, global: true } }));
    }
  };

  // Save rules configuration globally across all accounts
  const handleSaveRiskRulesConfig = () => {
    setIsSavingRules(true);
    try {
      const payload = {
        rulesVersion: 2,
        categoryWeights,
        categoryEnabled,
        activeRules,
        customRules,
        contractValue,
        bandProbabilities,
        updatedAt: new Date().toISOString()
      };
      // 1. Instantly save for this account and update global fallback
      if (accId) {
        localStorage.setItem(`customer_pulse_risk_config_${accId}`, JSON.stringify(payload));
      }
      localStorage.setItem('customer_pulse_risk_rules_global', JSON.stringify(payload));

      // 2. Dispatch events immediately scoped to this account
      onRiskRulesUpdated?.(payload);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('account-risk-rules-updated', { detail: { payload, accountId: accId, global: !accId } }));
        window.dispatchEvent(new CustomEvent('health-rules-updated', { detail: { riskPayload: payload, accountId: accId, global: !accId } }));
      }

      // 3. Close modal immediately without waiting for network
      setShowCustomizeRulesModal(false);
      showActivityToast?.('Risk scoring criteria and category weights applied successfully.');

      // 4. Background network sync
      if (token) {
        fetch(`${API_BASE}/risks/rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            rules: customRules.map(r => ({
              id: r.id,
              title: r.name,
              description: r.trigger,
              severity: r.points >= 50 ? 'High' : 'Medium',
              enabled: activeRules[r.id] !== false
            }))
          })
        }).catch(err => console.warn('Background risk rules sync warning:', err));
      }
    } finally {
      setIsSavingRules(false);
    }
  };

  // Reset to defaults
  const handleResetDefaults = () => {
    const defWeights = {};
    const defEnabled = {};
    const defRules = {};
    DEFAULT_RISK_CATEGORIES.forEach(c => {
      defWeights[c.id] = c.weight;
      defEnabled[c.id] = true;
    });
    READY_MADE_RISK_RULES.forEach(r => {
      defRules[r.id] = true;
    });
    setCategoryWeights(defWeights);
    setCategoryEnabled(defEnabled);
    setActiveRules(defRules);
    setBandProbabilities({ Low: 5, Medium: 25, High: 50, Critical: 80 });
    localStorage.removeItem('customer_pulse_risk_rules_global');
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('account_risk_rules_config_')) {
          localStorage.removeItem(k);
        }
      });
    } catch (e) { }
    onRiskRulesUpdated?.(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('account-risk-rules-updated', { detail: { payload: null, global: true } }));
    }
    showActivityToast?.('Weights and rules restored to official 8-category defaults globally.');
  };

  // Calculate dynamic 4-step risk score
  const dynamicRiskMetrics = useMemo(() => {
    const activeRiskList = activeRisksList;
    const firedIds = [];

    activeRiskList.forEach(r => {
      const titleLower = (r.title || '').toLowerCase();
      const ruleLower = (r.rule || '').toLowerCase();
      const descLower = (r.description || '').toLowerCase();

      const match = allAvailableRiskRules.find(catalogRule => {
        const catNameLower = (catalogRule.name || catalogRule.label || '').toLowerCase();
        return titleLower.includes(catNameLower) ||
          ruleLower.includes(catNameLower) ||
          (catalogRule.trigger && descLower.includes(catalogRule.trigger.toLowerCase()));
      });
      if (match) {
        const isRuleActive = activeRules[match.id] === true || (activeRules[match.id] === undefined && match.defaultEnabled === true);
        if (isRuleActive) {
          firedIds.push(match.id);
        }
      }
    });

    if (activeRiskList.length > 0 && firedIds.length === 0) {
      activeRiskList.forEach(r => {
        const cat = (r.category || '').toLowerCase();
        if (cat.includes('silence') || cat.includes('relation') || cat.includes('inactiv')) firedIds.push('A-2');
        else if (cat.includes('sentiment') || cat.includes('frustrat')) firedIds.push('B-1');
        else if (cat.includes('commit') || cat.includes('deliver') || cat.includes('sla')) firedIds.push('F-1');
        else if (cat.includes('contract') || cat.includes('commerc')) firedIds.push('G-1');
        else if (cat.includes('compet')) firedIds.push('H-1');
        else firedIds.push('A-2');
      });
    }

    const effectiveWeights = {};
    DEFAULT_RISK_CATEGORIES.forEach(c => {
      effectiveWeights[c.id] = categoryEnabled[c.id] !== false ? (categoryWeights[c.id] ?? c.weight) : 0;
    });

    const activeOverrides = [];
    activeRiskList.forEach(r => {
      const fullText = `${r.title || ''} ${r.description || ''} ${r.rule || ''}`.toLowerCase();
      if (fullText.includes('cancel') || fullText.includes('terminate') || fullText.includes('notice period')) {
        activeOverrides.push({ forcedBand: 'Critical', condition: 'Cancellation or notice language' });
      }
      if (fullText.includes('competitor meeting') || fullText.includes('alternative vendor')) {
        activeOverrides.push({ forcedBand: 'High', condition: 'Competitor meeting reported' });
      }

      if (fullText.includes('90 days') && fullText.includes('silence')) {
        activeOverrides.push({ forcedBand: 'High', condition: '90 days of silence' });
      }
      if (fullText.includes('legal') || fullText.includes('sla breach') || fullText.includes('dispute')) {
        activeOverrides.push({ forcedBand: 'High', condition: 'Legal or dispute language' });
      }
    });

    const res = calculateWeightedRiskScore({
      firedRuleIds: firedIds,
      customRules,
      categoryWeights: effectiveWeights,
      tier: account?.tier || 'Strategic',
      contractValue: Number(contractValue) || 100000,
      overrides: activeOverrides
    });

    const prob = (bandProbabilities[res.finalBand] ?? 50) / 100;
    const revAtRisk = Math.round((Number(contractValue) || 100000) * prob);

    return {
      ...res,
      probabilityPercent: Math.round(prob * 100),
      revenueAtRisk: revAtRisk,
      activeOverrides
    };
  }, [risks, allAvailableRiskRules, activeRules, categoryWeights, categoryEnabled, customRules, account, contractValue, bandProbabilities]);

  // Overall Risk Level badge
  const overallRiskLevel = useMemo(() => {
    if (dynamicRiskMetrics.finalBand === 'Critical' || criticalCount > 0) return { label: 'Critical', color: 'text-[#be123c]' };
    if (dynamicRiskMetrics.finalBand === 'High' || highCount > 0) return { label: 'High', color: 'text-[#b45309]' };
    if (dynamicRiskMetrics.finalBand === 'Medium' || mediumCount > 0) return { label: 'Medium', color: 'text-slate-800' };
    return { label: 'Low Risk · Healthy', color: 'text-emerald-700' };
  }, [dynamicRiskMetrics.finalBand, criticalCount, highCount, mediumCount]);

  // Synchronize risk level and active risks count directly with parent (Overview tab and top metric cards)
  useEffect(() => {
    const rawLabel = overallRiskLevel?.label || 'Low';
    const levelLabel = rawLabel.includes('Low') ? 'Low' : rawLabel;
    onRiskMetricsChanged?.({
      level: levelLabel,
      activeCount: activeRisksList.length,
      activeRisks: activeRisksList,
      criticalCount,
      highCount,
      mediumCount
    });
  }, [overallRiskLevel, activeRisksList, criticalCount, highCount, mediumCount, onRiskMetricsChanged]);


  // 9. GLOBAL SEARCH IMPLEMENTATION
  // When searchQuery is non-empty, searches GLOBALLY across all risk records (Active, Notified, and Resolved)
  // Can also search across all accounts if searchScope === 'global'
  const isGlobalSearchActive = Boolean(searchQuery.trim());

  const displayedRisks = useMemo(() => {
    let sourcePool = [];

    if (isGlobalSearchActive) {
      // Global Search Mode across all statuses for this account strictly
      sourcePool = risks;
      const q = searchQuery.toLowerCase();
      sourcePool = sourcePool.filter(r =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.evidence || '').toLowerCase().includes(q) ||
        (r.rule || '').toLowerCase().includes(q) ||
        (Array.isArray(r.involved) && r.involved.some(inv => inv.toLowerCase().includes(q))) ||
        (r.assignedToName || '').toLowerCase().includes(q) ||
        (r.companyName || '').toLowerCase().includes(q)
      );
    } else {
      // Tabbed Mode: filtered by selected tab
      if (activeTab === 'Active') {
        sourcePool = activeRisksList;
      } else if (activeTab === 'Notified') {
        sourcePool = notifiedRisksList;
      } else if (activeTab === 'Resolved') {
        sourcePool = resolvedRisksList;
      }
    }

    // Sort according to user preference (High Risk first, Newest first, or Lowest Health first)
    const sevOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return [...sourcePool].sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
      if (sortBy === 'lowest_health') {
        const aHealth = a.health ?? (account?.healthScore ?? 100);
        const bHealth = b.health ?? (account?.healthScore ?? 100);
        return aHealth - bHealth;
      }
      // Default: high_risk (Critical > High > Medium > Low) then newest first
      const aSev = sevOrder[(a.severity || 'medium').toLowerCase()] || 0;
      const bSev = sevOrder[(b.severity || 'medium').toLowerCase()] || 0;
      if (bSev !== aSev) return bSev - aSev;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [activeTab, activeRisksList, notifiedRisksList, resolvedRisksList, searchQuery, isGlobalSearchActive, searchScope, allSystemRisks, risks, sortBy, account?.healthScore]);

  // Visual helper for severity styling
  const getSeverityStyles = (severity) => {
    const s = (severity || 'medium').toLowerCase();
    if (s === 'critical') {
      return {
        cardClass: 'bg-[#FFF5F5] border-[#FECDD3]',
        badgeClass: 'bg-[#9f1239] text-white',
        actionBtnClass: 'bg-[#FCE7F3] hover:bg-[#FBCFE8] border-[#F9A8D4]/50 text-[#BE185D]'
      };
    }
    if (s === 'high') {
      return {
        cardClass: 'bg-[#FFFBEB] border-[#FDE68A]',
        badgeClass: 'bg-[#92400e] text-white',
        actionBtnClass: 'bg-[#FEF3C7] hover:bg-[#FDE68A] border-[#FCD34D]/60 text-[#B45309]'
      };
    }
    return {
      cardClass: 'bg-white border-slate-200/80',
      badgeClass: 'bg-slate-100 text-slate-700',
      actionBtnClass: 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
    };
  };

  const getStatusBadge = (risk) => {
    const status = (risk.status || 'Open').toLowerCase();
    if (status === 'resolved') {
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">Resolved</span>;
    }
    if (status === 'acknowledged') {
      return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border-none">Acknowledged</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white text-gray-700 border border-gray-200">New</span>;
  };

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(15,23,42,0.03)] overflow-hidden">
      {/* 1. Header (Compact) */}
      <div className="px-6 py-3 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <ShieldAlert className="w-5 h-5 text-[#E11D48] shrink-0" />
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Risk management · {account?.companyName || 'Account'}
            </h2>
          </div>
          <p className="text-xs text-gray-500">
            Rule-based, AI-detected and manual risks. Overall risk level: <span className={`font-bold ${overallRiskLevel.color}`}>{overallRiskLevel.label}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[11px] font-bold border border-emerald-200/70 shadow-2xs select-none" title="Live background auto-sync active">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live Sync</span>
          </div>
          <button
            onClick={() => setShowCustomizeRulesModal(true)}
            className="px-3 py-1.5 bg-white border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold shadow-2xs hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
            Customize risk rules
          </button>
        </div>
      </div>

      {/* 2. Top Summary Metrics (Compact) */}
      <div className="px-6 pt-2.5 pb-1.5">
        <div className="flex gap-3 overflow-x-auto pb-1">
          <div className="flex-1 min-w-[95px] bg-gray-50/70 p-2.5 rounded-xl border border-gray-100">
            <div className="text-xs text-gray-500 font-medium mb-0.5">Critical</div>
            <div className="text-xl font-bold text-[#be123c]">{criticalCount}</div>
          </div>
          <div className="flex-1 min-w-[95px] bg-gray-50/70 p-2.5 rounded-xl border border-gray-100">
            <div className="text-xs text-gray-500 font-medium mb-0.5">High</div>
            <div className="text-xl font-bold text-[#b45309]">{highCount}</div>
          </div>
          <div className="flex-1 min-w-[95px] bg-gray-50/70 p-2.5 rounded-xl border border-gray-100">
            <div className="text-xs text-gray-500 font-medium mb-0.5">Medium</div>
            <div className="text-xl font-bold text-gray-900">{mediumCount}</div>
          </div>

          <div className="flex-1 min-w-[110px] bg-gray-50/70 p-2.5 rounded-xl border border-gray-100">
            <div className="text-xs text-gray-500 font-medium mb-0.5">Resolved, 30 days</div>
            <div className="text-xl font-bold text-green-700">{resolvedCount}</div>
          </div>
        </div>
      </div>

      {/* 3. Global Search Bar with Scope Controls (Compact) */}
      <div className="px-6 py-2 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-blue-600 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={isAdmin && searchScope === 'global' ? "Global search across all accounts & risks..." : "Search risks for this account..."}
            className="w-full pl-9 pr-8 py-1.5 bg-slate-50/70 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-2xs"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Arrange Dropdown */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white font-medium focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs hover:border-slate-300"
          >
            <option value="high_risk">Arrange: High Risk First</option>
            <option value="newest">Arrange: Newest First</option>
            <option value="lowest_health">Arrange: Lowest Health First</option>
          </select>
        </div>

        {/* Scope Pill Toggle (Only visible when Admin logs in) */}
        {isAdmin && (
          <div className="flex items-center gap-1 self-end sm:self-auto shrink-0 bg-slate-100/90 p-0.5 rounded-lg border border-slate-200/80 text-[11px]">
            <button
              onClick={() => setSearchScope('account')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${searchScope === 'account' ? 'bg-white text-blue-700 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              This Account
            </button>
            <button
              onClick={() => setSearchScope('global')}
              className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-all cursor-pointer ${searchScope === 'global' ? 'bg-white text-blue-700 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Globe className="w-3 h-3 text-blue-600" />
              All Accounts
            </button>
          </div>
        )}
      </div>

      {/* Search Result Banner (when Search is active) */}
      {isGlobalSearchActive && (
        <div className="mx-6 mb-2 px-3 py-1.5 bg-blue-50/80 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>
              <strong>Search:</strong> Found <strong>{displayedRisks.length}</strong> risk(s) matching <em>"{searchQuery}"</em> across {isAdmin && searchScope === 'global' ? 'all CRM accounts' : `${account?.companyName || 'this account'}`}
            </span>
          </span>
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs font-bold text-blue-700 hover:underline cursor-pointer"
          >
            Clear Search
          </button>
        </div>
      )}

      {/* 4. Tabs */}
      <div className="px-6 border-b border-gray-200 flex gap-6 text-xs font-medium">
        <button
          onClick={() => { setActiveTab('Active'); setSearchQuery(''); }}
          className={`pb-2 pt-0.5 transition-colors cursor-pointer ${activeTab === 'Active' && !isGlobalSearchActive ? 'text-gray-900 border-b-2 border-blue-600 font-bold' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Active ({activeRisksList.length})
        </button>
        <button
          onClick={() => { setActiveTab('Notified'); setSearchQuery(''); }}
          className={`pb-2 pt-0.5 transition-colors cursor-pointer ${activeTab === 'Notified' && !isGlobalSearchActive ? 'text-gray-900 border-b-2 border-blue-600 font-bold' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Notified ({notifiedRisksList.length})
        </button>
        <button
          onClick={() => { setActiveTab('Resolved'); setSearchQuery(''); }}
          className={`pb-2 pt-0.5 transition-colors cursor-pointer ${activeTab === 'Resolved' && !isGlobalSearchActive ? 'text-gray-900 border-b-2 border-blue-600 font-bold' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Resolved ({resolvedRisksList.length})
        </button>
      </div>

      {/* 5. Risk Cards Scroll Area - Optimized to display 3 to 4 risks at a time */}
      <div className="flex-1 overflow-y-auto px-6 py-2.5 space-y-2 bg-gray-50/30 custom-scrollbar">
        {loading ? (
          <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
            <p className="text-xs font-medium">Loading live risks from database...</p>
          </div>
        ) : displayedRisks.length === 0 ? (
          <div className="py-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200/80 p-6 flex flex-col items-center justify-center max-w-md mx-auto my-3 shadow-2xs">
            <ShieldCheck className="w-10 h-10 text-emerald-500 mb-2" />
            <h3 className="text-sm font-bold text-slate-800">
              {isGlobalSearchActive ? 'No risks match your search' : activeTab === 'Active' ? 'No active risks detected' : activeTab === 'Notified' ? 'No notified risks' : 'No resolved risks'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              {isGlobalSearchActive
                ? (isAdmin ? `Try checking spelling or switching scope between 'This Account' and 'All Accounts'.` : `Try checking spelling or searching by category, rule or stakeholder name.`)
                : activeTab === 'Active'
                  ? `All SLAs, touchpoints, and task commitments for ${account?.companyName || 'this account'} are currently healthy.`
                  : activeTab === 'Notified'
                    ? 'No stakeholder notifications have been triggered for active risks yet.'
                    : 'Resolved risks will appear here once actions are completed.'}
            </p>
          </div>
        ) : (
          displayedRisks.map((risk) => {
            const riskId = risk.riskId || risk.id;
            const { cardClass, badgeClass, actionBtnClass } = getSeverityStyles(risk.severity);
            const isNotified = notifiedRisks.has(riskKeyOf(risk));
            const isResolved = (risk.status || '').toLowerCase() === 'resolved';
            const isAcknowledged = (risk.status || '').toLowerCase() === 'acknowledged';
            const isHistoryOpen = Boolean(expandedHistory[riskId]);

            return (
              <div
                key={riskId}
                onClick={() => setSelectedRiskForDetails(risk)}
                title="Click to view AI Risk Details Workspace"
                className={`border rounded-xl p-3 sm:p-3.5 ${cardClass} relative transition-all shadow-2xs hover:shadow-md cursor-pointer hover:border-slate-400/80 group`}
              >

                {/* Top row: Badges and Time/Assignee */}
                <div className="flex flex-wrap justify-between items-center gap-1.5 mb-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badgeClass}`}>
                      {risk.severity || 'Medium'}
                    </span>
                    <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-full text-[10px] text-gray-600 font-medium">
                      {risk.category || 'General'}
                    </span>
                    <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-full text-[10px] text-gray-600 font-medium">
                      {risk.source || 'Rule-based'}
                    </span>
                    {getStatusBadge(risk)}
                    {risk.companyName && searchScope === 'global' && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold rounded-full text-[10px]">
                        {risk.companyName}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 font-medium flex items-center gap-2">
                    <span className="text-[11px] font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline-block">
                      View AI Details &rarr;
                    </span>
                    <div className="flex items-center gap-1.5 text-gray-500 text-[11px]">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{risk.createdAt ? formatDate(risk.createdAt) : 'Live signal'}</span>
                      <span>·</span>
                      <span>{risk.assignedToName ? `Assigned to ${risk.assignedToName}` : risk.ownerName ? `Added by ${risk.ownerName}` : 'Rule-based System'}</span>
                    </div>
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-xs sm:text-sm font-bold text-gray-900 mb-0.5 group-hover:text-blue-700 transition-colors flex items-center justify-between">
                  <span>{risk.title || risk.category}</span>
                </h3>

                {/* Details (Concise 1-2 line summary to keep cards compact so 3-4 fit on screen) */}
                {risk.description && (
                  <p className="text-[11px] sm:text-xs text-gray-600 line-clamp-2 leading-relaxed mb-1.5">
                    {risk.description}
                  </p>
                )}

                {/* Contextual Chips: Health Impact, Rule & Evidence */}
                {(risk.healthImpact || risk.rule || risk.evidence) && (
                  <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 mb-2">
                    {risk.healthImpact && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold border border-rose-100 text-[10px]">
                        Health impact: {risk.healthImpact}
                      </span>
                    )}
                    {risk.rule && (
                      <span className="text-gray-500 truncate max-w-sm text-[11px]">
                        <span className="font-semibold text-gray-700">Rule:</span> {risk.rule}
                      </span>
                    )}
                    {risk.evidence && (
                      <span className="text-gray-500 truncate max-w-xs text-[11px]">
                        <span className="font-semibold text-gray-700">Evidence:</span> {risk.evidence}
                      </span>
                    )}
                  </div>
                )}

                {/* Actions: Stop propagation so card click opens modal without triggering action button */}
                <div onClick={e => e.stopPropagation()} className="flex items-center justify-between pt-0.5 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {!isResolved ? (
                      <>
                        <button
                          onClick={() => navigate('/staff-tasks/new', {
                            state: {
                              preselectAccountId: risk.accountId || accId,
                              preselectTitle: `Mitigate Risk: ${risk.title || risk.category}`,
                              from: `/accounts/${risk.accountId || accId}`,
                              tab: 'Risks'
                            }
                          })}
                          className={`px-3 py-1 border rounded-lg text-xs font-bold transition-colors cursor-pointer ${actionBtnClass}`}
                        >
                          Create task
                        </button>

                        <button
                          disabled={isNotified}
                          onClick={() => {
                            setSelectedRiskForNotify(risk);
                            setNotifyModalOpen(true);
                          }}
                          className={`px-3 py-1 border rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer ${actionBtnClass} ${isNotified ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                          {isNotified && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                          {isNotified ? 'Notified' : 'Notify'}
                        </button>

                        <button
                          onClick={() => handleResolveRisk(risk)}
                          className="px-3 py-1 bg-white/90 hover:bg-white border border-slate-200/90 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                        >
                          Resolve
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleReopenRisk(risk)}
                        className="px-3 py-1 bg-white border border-slate-200 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                      >
                        Reopen risk
                      </button>
                    )}
                  </div>

                  {/* History Dropdown Button */}
                  <button
                    onClick={() => toggleHistory(riskId)}
                    className="px-2.5 py-1 bg-white/90 hover:bg-white border border-slate-200/90 text-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                  >
                    <span>History</span>
                    {isHistoryOpen ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                  </button>
                </div>

                {/* Collapsible History Drawer */}
                {isHistoryOpen && (
                  <div onClick={e => e.stopPropagation()} className="mt-4 pt-4 border-t border-slate-200/80 space-y-2 animate-in fade-in duration-150 cursor-default">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-2">
                      <History className="w-4 h-4 text-blue-600" />
                      <span>Audit & Action History (Live PostgreSQL Log)</span>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-600 bg-white/95 p-3 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-center py-0.5 border-b border-slate-100">
                        <span className="font-medium text-slate-700">1. Detected / Logged:</span>
                        <span className="text-slate-500">{risk.createdAt ? formatDate(risk.createdAt) : 'Live signal'} ({risk.source || 'Rule-based Engine'})</span>
                      </div>
                      <div className="flex justify-between items-center py-0.5 border-b border-slate-100">
                        <span className="font-medium text-slate-700">2. Stakeholder Notification:</span>
                        <span className={isNotified ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                          {isNotified ? 'Email & In-App Alerts Dispatched' : 'No alerts sent yet'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-0.5">
                        <span className="font-medium text-slate-700">3. Resolution Status:</span>
                        <span className={isResolved ? 'text-emerald-700 font-bold' : 'text-rose-600 font-semibold'}>
                          {isResolved ? `Resolved ${risk.resolvedAt ? 'on ' + formatDate(risk.resolvedAt) : ''}` : 'Open & Active'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ========================================================================= */}
      {/* CUSTOMIZE RISK RULES & SCORING ENGINE MODAL                               */}
      {/* ========================================================================= */}
      {showCustomizeRulesModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-100">

            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    Customize Risk Rules & Scoring Engine
                    <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                      8-Category Weighted Engine
                    </span>
                  </h3>

                </div>
              </div>
              <button
                onClick={() => setShowCustomizeRulesModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">

              {/* 2. Category Weights & Turn Off/On Controls (Section 1) */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                      Category Weights & Activation
                    </h4>
                    <p className="text-xs text-slate-500">
                      Admin-editable weights (default sum: 100). Uncheck a category to disable it entirely from risk calculation.
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

              {/* 3. Catalog Category Filter Tabs & Search Controls */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="relative flex-1 w-full max-w-md">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={ruleSearch}
                      onChange={e => setRuleSearch(e.target.value)}
                      placeholder="Search across all 74 risk rules, keywords, and triggers..."
                      className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 bg-white"
                    />
                  </div>

                  {/* Add Custom Rule Button */}
                  <button
                    type="button"
                    onClick={() => setShowAddCustomRuleModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Add Custom Rule
                  </button>
                </div>

                {/* Category Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs custom-scrollbar">
                  <button
                    type="button"
                    onClick={() => setCatalogCategory('All')}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${catalogCategory === 'All'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                      }`}
                  >
                    All Rules ({allAvailableRiskRules.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatalogCategory('Basic')}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${catalogCategory === 'Basic'
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
                        onClick={() => setCatalogCategory(cat.id)}
                        className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${catalogCategory === cat.id
                            ? 'bg-rose-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                          }`}
                      >
                        {cat.id}. {cat.name.split(' ')[0]} ({count})
                      </button>
                    );
                  })}
                  {customRules.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCatalogCategory('Custom')}
                      className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${catalogCategory === 'Custom'
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

              {/* 4. Rules Catalog Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>Displaying {filteredRiskRules.length} risk criteria</span>
                  <span className="text-emerald-700 font-extrabold">{activeRulesCount} of {allAvailableRiskRules.length} active</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredRiskRules.map(rule => {
                    const isParentCatEnabled = categoryEnabled[rule.categoryId] !== false;
                    const isBasicEnabled = !rule.isBasic || categoryEnabled['Basic'] !== false;
                    const isCatEnabled = isParentCatEnabled && isBasicEnabled;
                    const isRuleActive = activeRules[rule.id] === true || (activeRules[rule.id] === undefined && rule.defaultEnabled === true);
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
                                  onClick={() => handleDeleteCustomRule(rule.id)}
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

                        {/* Bottom Bar: Window / Channel & Toggle */}
                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                              {rule.window || 'Live Signal'}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                              {rule.channel || 'All Sources'}
                            </span>
                          </div>

                          {/* Toggle Switch */}
                          <button
                            type="button"
                            onClick={() => setActiveRules({ ...activeRules, [rule.id]: !isRuleActive })}
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

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500 font-medium hidden sm:block">
                <span>Active Rules: <strong className="text-slate-900 font-bold">{activeRulesCount}</strong> / {allAvailableRiskRules.length} · 8 Categories Configured</span>
              </div>
              <div className="flex items-center gap-3">

                <button
                  type="button"
                  onClick={() => setShowCustomizeRulesModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingRules}
                  onClick={handleSaveRiskRulesConfig}
                  className="flex items-center gap-2 px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition-opacity disabled:opacity-50 cursor-pointer"
                >
                  {isSavingRules ? 'Applying to Account Risks...' : 'Save & Apply Risk Rules'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CUSTOM RISK RULE BUILDER MODAL (MATCHING HEALTH RULES FORM)               */}
      {/* ========================================================================= */}
      {showAddCustomRuleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" /> Custom Risk Rule Builder
              </h3>
              <button onClick={() => setShowAddCustomRuleModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
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
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:border-rose-500 text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Metric Category</label>
                  <select
                    value={customRuleForm.categoryId}
                    onChange={e => {
                      const selCat = DEFAULT_RISK_CATEGORIES.find(c => c.id === e.target.value);
                      setCustomRuleForm({
                        ...customRuleForm,
                        categoryId: e.target.value,
                        category: selCat ? selCat.name : customRuleForm.category
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
                    value={customRuleForm.window}
                    onChange={e => setCustomRuleForm({ ...customRuleForm, window: e.target.value })}
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
                    value={customRuleForm.channel}
                    onChange={e => setCustomRuleForm({ ...customRuleForm, channel: e.target.value })}
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
                    value={customRuleForm.tier}
                    onChange={e => setCustomRuleForm({ ...customRuleForm, tier: e.target.value })}
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
                    value={customRuleForm.operator}
                    onChange={e => setCustomRuleForm({ ...customRuleForm, operator: e.target.value })}
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
                    value={customRuleForm.value}
                    onChange={e => setCustomRuleForm({ ...customRuleForm, value: e.target.value })}
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
                    value={customRuleForm.points}
                    onChange={e => setCustomRuleForm({ ...customRuleForm, points: parseInt(e.target.value) || 0 })}
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
                onClick={() => setShowAddCustomRuleModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomRiskRule}
                disabled={!customRuleForm.label.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                Add Rule to Catalog
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Manual Risk Modal (Direct PostgreSQL Persistence) */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">Add Manual Risk</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateRisk}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Risk Title</label>
                  <input
                    required
                    type="text"
                    value={newRisk.title}
                    onChange={e => setNewRisk({ ...newRisk, title: e.target.value })}
                    placeholder="e.g. Pricing concern raised on call"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Category</label>
                    <select
                      value={newRisk.category}
                      onChange={e => setNewRisk({ ...newRisk, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm cursor-pointer"
                    >
                      <option value="Commercial">Commercial</option>
                      <option value="Relationship">Relationship</option>
                      <option value="Delivery">Delivery</option>
                      <option value="Escalation">Escalation</option>
                      <option value="Competitor Mentions">Competitor Mentions</option>
                      <option value="Customer Frustration">Customer Frustration</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Severity</label>
                    <select
                      value={newRisk.severity}
                      onChange={e => setNewRisk({ ...newRisk, severity: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm cursor-pointer"
                    >
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Description & Suggested Mitigations</label>
                  <textarea
                    required
                    value={newRisk.description}
                    onChange={e => setNewRisk({ ...newRisk, description: e.target.value })}
                    placeholder="Describe the risk conditions and suggested next steps..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Resolution Deadline (Optional)</label>
                  <input
                    type="date"
                    value={newRisk.dueDate}
                    onChange={e => setNewRisk({ ...newRisk, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-sm"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Saving to Database...' : 'Create Risk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notify Modal */}
      {notifyModalOpen && selectedRiskForNotify && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">Notify Stakeholders</h3>
              <button onClick={() => setNotifyModalOpen(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                You are about to send an automated email alert and in-app notification regarding the risk:
              </p>
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-5">
                <p className="text-sm font-bold text-gray-900">{selectedRiskForNotify.title || selectedRiskForNotify.category}</p>
                <p className="text-xs text-gray-500 mt-1">Severity: <span className="font-semibold text-rose-600">{selectedRiskForNotify.severity}</span></p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-700">Recipients:</p>
                  {notifyRouting.senderRole && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#223670]/10 text-[#223670]">
                      Sending as {notifyRouting.senderRole}
                    </span>
                  )}
                </div>
                {notifyRouting.loading ? (
                  <p className="text-sm text-gray-500">Loading recipients…</p>
                ) : notifyRouting.error ? (
                  <p className="text-sm text-[#E31C25]">{notifyRouting.error}</p>
                ) : !notifyRouting.senderRole ? (
                  <p className="text-sm text-[#E31C25]">Only an Admin, the Account Owner or a Key Contact Owner can notify on this account.</p>
                ) : notifyRouting.recipients.length === 0 ? (
                  <p className="text-sm text-gray-500">No other stakeholders are assigned to this account.</p>
                ) : (
                  notifyRouting.recipients.map(r => (
                    <div key={r.uid} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="font-medium text-gray-800">{r.name}</span>
                      <span className="text-xs text-gray-500">· {r.roles.join(' & ')}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
              <button
                onClick={() => setNotifyModalOpen(false)}
                className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSendNotification}
                disabled={isNotifying || !notifyRouting.canNotify}
                className="px-4 py-2 bg-[#223670] hover:bg-[#1a2a57] text-white font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isNotifying ? 'Sending...' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated AI 3-Part Risk Workspace Details Modal */}
      {selectedRiskForDetails && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white max-w-4xl w-full rounded-xl border border-gray-200 shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">

            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex items-start justify-between bg-gray-50 rounded-t-xl">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Risk Workspace</span>
                  <span className="text-gray-400">•</span>
                  <span className="text-[11px] font-bold text-gray-800">
                    {selectedRiskForDetails.companyName || account?.companyName || 'Account'}
                  </span>
                  <span className="text-gray-400">•</span>
                  <span className="text-[10px] font-semibold text-gray-500">
                    Lead: {selectedRiskForDetails.ownerName || selectedRiskForDetails.assignedToName || account?.assignedToName || account?.owner || 'Account Lead'}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-black flex items-center gap-3 flex-wrap">
                  <span>{selectedRiskForDetails.title || `${selectedRiskForDetails.category || 'Relationship'} Risk`}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded border tracking-wide uppercase font-bold ${(selectedRiskForDetails.severity || 'medium').toLowerCase() === 'critical' ? 'text-red-700 bg-red-100 border-red-200' :
                      (selectedRiskForDetails.severity || 'medium').toLowerCase() === 'high' ? 'text-amber-700 bg-amber-100 border-amber-200' :
                        'text-blue-700 bg-blue-100 border-blue-200'
                    }`}>
                    {selectedRiskForDetails.severity || 'High'}
                  </span>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200 font-bold">
                    {selectedRiskForDetails.health ?? account?.healthScore ?? '—'}% Health
                  </span>
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAiReanalyze(selectedRiskForDetails.riskId || selectedRiskForDetails.id)}
                  disabled={reanalyzing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  title="Re-run deep AI risk analysis"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${reanalyzing ? 'animate-spin text-blue-600' : 'text-blue-500'}`} />
                  <span>{reanalyzing ? 'AI Analyzing...' : 'Re-analyze with AI'}</span>
                </button>
                <button
                  onClick={() => setSelectedRiskForDetails(null)}
                  className="text-gray-400 hover:text-gray-800 bg-white border border-gray-200 hover:bg-gray-100 p-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ONLY THE 3 CORE SECTIONS */}
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
                  {selectedRiskForDetails.whatIsRisk || selectedRiskForDetails.description || `${selectedRiskForDetails.title || 'Risk detected'} on account.`}
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
                  {selectedRiskForDetails.whyItHappens || selectedRiskForDetails.aiInsight || selectedRiskForDetails.rule || `Touchpoint schedule and commitment monitoring threshold breached for ${selectedRiskForDetails.companyName || account?.companyName || 'this account'}.`}
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
                  let steps = selectedRiskForDetails.howToResolve || selectedRiskForDetails.suggestedActions;
                  if (typeof steps === 'string') {
                    try { steps = JSON.parse(steps); } catch (e) { steps = []; }
                  }
                  if (!Array.isArray(steps) || steps.length === 0) {
                    const cName = selectedRiskForDetails.companyName || account?.companyName || 'client';
                    steps = [
                      { title: `Schedule an executive reconnection sync with ${cName}`, due: 'Within 3 days', description: 'Re-align on project deliverables and strategic objectives.' },
                      { title: 'Prepare and share an account value summary', due: 'Within 1 week', description: 'Highlight recent milestones, SLAs, and resolution timelines.' }
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

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex items-center justify-between">
              <div className="text-[10px] text-gray-500 font-medium">
                {selectedRiskForDetails.createdAt ? `Logged on ${formatDate(selectedRiskForDetails.createdAt)}` : 'System Risk'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedRiskForDetails(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
