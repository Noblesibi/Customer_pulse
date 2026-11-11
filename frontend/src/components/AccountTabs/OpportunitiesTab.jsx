import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../../store/index.js';
import {
  Search, FileText, Zap,
  Building2, X, Check, Target, TrendingUp, Plus, ChevronDown, ChevronLeft, ChevronRight
} from 'lucide-react';
import { formatDate } from '../../utils/dateFormat.js';

const POTENTIAL_AREAS = [
  'Embedded & Hardware Engineering',
  'Application Engineering',
  'Cloud & IT Infrastructure',
  'Data Engineering & AI',
  'Quality Engineering & Testing',
  'GIS & Spatial Analytics',
  'Manufacturing & EMS',
  'Cybersecurity',
  'Digital Transformation',
  'Managed Services',
  'Integration & APIs',
  'Contract & Licensing',
  'Upsell & Upgrade',
  'New Business',
  'Other',
];

/* ─────────────────────────────────────────────
   Utility: strip HTML tags
   ───────────────────────────────────────────── */
const stripHtml = (html) => {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  } catch {
    return html.replace(/<[^>]*>?/gm, '');
  }
};

/* ─────────────────────────────────────────────
   Auto-detection rules (Valuable Business Expansion only)
   ───────────────────────────────────────────── */
const DETECTION_RULES = [
  { keywords: ['cloud migration', 'cloud adoption', 'move to cloud', 'aws', 'azure', 'gcp', 'kubernetes', 'infrastructure upgrade', 'devops'], type: 'Expansion', area: 'Cloud & IT Infrastructure', confidence: 'High' },
  { keywords: ['artificial intelligence', 'machine learning', 'ai model', 'data science', 'analytics platform', 'predictive analytics', 'llm', 'generative ai', 'ai pilot'], type: 'Expansion', area: 'Data Engineering & AI', confidence: 'High' },
  { keywords: ['embedded', 'firmware', 'hardware engineering', 'iot', 'edge computing', 'microcontroller', 'autosar', 'pcb design'], type: 'Expansion', area: 'Embedded & Hardware Engineering', confidence: 'High' },
  { keywords: ['cybersecurity', 'security audit', 'penetration test', 'soc 2', 'zero trust', 'compliance audit', 'vulnerability assessment', 'iso 27001'], type: 'Expansion', area: 'Cybersecurity', confidence: 'High' },
  { keywords: ['digital transformation', 'legacy modernization', 'system migration', 'erp upgrade', 'crm upgrade', 'architecture refresh'], type: 'Expansion', area: 'Digital Transformation', confidence: 'High' },
  { keywords: ['new project', 'new business', 'pilot project', 'proof of concept', 'poc', 'rfp', 'rfq', 'proposal requested', 'tender bid'], type: 'Expansion', area: 'New Business', confidence: 'High' },
  { keywords: ['contract renewal', 'subscription renewal', 'extend contract', 'contract extension', 'license renewal', 'multi-year contract'], type: 'Renewal', area: 'Contract & Licensing', confidence: 'High' },
  { keywords: ['upsell', 'up-sell', 'upgrade plan', 'premium tier', 'enterprise tier', 'scale up capacity'], type: 'Expansion', area: 'Upsell & Upgrade', confidence: 'High' },
  { keywords: ['cross-sell', 'cross sell', 'additional solution', 'complementary service', 'product bundling'], type: 'Cross-sell', area: 'New Business', confidence: 'High' },
  { keywords: ['managed service', 'support contract', 'sla extension', '24x7 support', 'dedicated engineering team'], type: 'Cross-sell', area: 'Managed Services', confidence: 'Medium' },
  { keywords: ['custom integration', 'middleware connector', 'api integration', 'data pipeline sync'], type: 'Cross-sell', area: 'Integration & APIs', confidence: 'Medium' },
  { keywords: ['seat expansion', 'team expansion', 'additional licenses', 'headcount growth', 'global rollout'], type: 'Expansion', area: 'Seat Expansion', confidence: 'Medium' },
];

const EXCLUDED_OPPORTUNITY_PATTERNS = [
  /schedule a check-in/i,
  /executive sync/i,
  /identify and map/i,
  /map a key .* stakeholder/i,
  /stakeholder engagement/i,
  /reconnect with/i,
  /follow up with .* regarding birthday/i,
  /overdue task/i,
  /risk mitigation/i,
  /mitigate risk/i,
  /urgent follow-up/i,
  /unanswered follow-up/i,
  /log an interaction/i,
  /send .* greeting/i
];

const classifyOppText = (text) => {
  const lower = text.toLowerCase();
  for (const rule of DETECTION_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) {
      return { type: rule.type, area: rule.area, confidence: rule.confidence };
    }
  }
  return { type: 'Expansion', area: 'Growth & Innovation', confidence: 'Medium' };
};

/* ─────────────────────────────────────────────
   Main Component
   ───────────────────────────────────────────── */
const EMPTY_FORM = { title: '', potentialArea: '', otherAreaDetails: '', type: 'Expansion' };

export default function OpportunitiesTab({ account, allActivities, nbas = [] }) {
  const { interactions } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOpp, setSelectedOpp] = useState(null);

  // Manual opportunity creation with persistent storage
  const storageKey = `manual_opps_${account?.accountId || account?.id || 'default'}`;
  const [manualOpps, setManualOpps] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(manualOpps));
    } catch (e) {
      console.error('Failed to save manual opportunities:', e);
    }
  }, [manualOpps, storageKey]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [showAreaDropdown, setShowAreaDropdown] = useState(false);

  /* ── Combine data sources ── */
  const activitiesToScan = useMemo(() => {
    if (allActivities && allActivities.length > 0) return allActivities;
    return interactions?.filter(
      i => (i.accountId || i.account_id) === (account?.accountId || account?.id || account?.account_id)
    ) || [];
  }, [allActivities, interactions, account]);

  /* ── Auto-detect Opportunities ── */
  const detectedOpportunities = useMemo(() => {
    const opps = [];
    const seen = new Set();

    activitiesToScan.forEach((activity, actIdx) => {
      // Exclude automated greetings & celebrations
      if (
        activity.itemType === 'greeting' ||
        activity.isCelebration ||
        activity.source === 'System Email' ||
        ['birthday', 'work_anniversary', 'company_anniversary', 'festival'].includes(String(activity.eventType || '').toLowerCase())
      ) {
        return;
      }

      // Exclude internal staff tasks and administrative alerts
      if (
        activity.itemType === 'task' ||
        activity.relatedTaskId ||
        String(activity.eventType || '').toLowerCase().includes('task') ||
        String(activity.subject || activity.title || '').toLowerCase().includes('task assigned') ||
        String(activity.subject || activity.title || '').toLowerCase().includes('risk alert')
      ) {
        return;
      }

      const rawText = stripHtml(
        (activity.messageText || '') + ' ' +
        (activity.details || '') + ' ' +
        (activity.subject || '') + ' ' +
        (activity.taskHeader || '') + ' ' +
        (activity.taskDescription || '') + ' ' +
        (activity.notes || '') + ' ' +
        (activity.title || '')
      );
      const lowerText = rawText.toLowerCase();
      const actDate = activity.timestamp || activity.date || activity.createdAt || activity.dueDate;
      const ownerName = activity.loggedByName || activity.assignedToName || account?.ownerName || 'Unassigned';
      const source = activity.source || activity.channel || activity.itemType || 'Interaction';

      // 1. Structured businessOpportunities field (highest fidelity)
      if (Array.isArray(activity.businessOpportunities) && activity.businessOpportunities.length > 0) {
        activity.businessOpportunities.forEach((opp, idx) => {
          if (!opp || typeof opp !== 'string') return;
          const trimmedOpp = opp.trim();
          if (EXCLUDED_OPPORTUNITY_PATTERNS.some(p => p.test(trimmedOpp))) return;
          const norm = trimmedOpp.toLowerCase().substring(0, 60);
          if (seen.has(norm)) return;
          seen.add(norm);
          const { type, area, confidence } = classifyOppText(trimmedOpp);
          opps.push({
            id: `${actIdx}-bi-${idx}`,
            title: trimmedOpp,
            fullTitle: trimmedOpp,
            type, potentialArea: area, source, confidence,
            status: 'Active', ownerName,
            lastUpdated: actDate ? formatDate(actDate) : 'Recent',
            description: `Identified from ${source}: ${rawText.substring(0, 220)}\u2026`,
            history: [{ date: actDate ? formatDate(actDate) : 'Recent', text: `Discussed during ${source}: ${activity.subject || activity.taskHeader || ''}` }],
            nextStep: `Follow up on: ${trimmedOpp}`,
          });
        });
        return;
      }

      // 2. Keyword / rule-based detection for high-value business expansion
      for (const rule of DETECTION_RULES) {
        const matchedKeyword = rule.keywords.find(k => lowerText.includes(k));
        if (matchedKeyword) {
          const oppTitle = activity.subject && activity.subject.length > 6
            ? activity.subject
            : `${rule.area} Expansion Opportunity`;
          const norm = oppTitle.trim().toLowerCase().substring(0, 60);
          if (seen.has(norm)) continue;
          seen.add(norm);
          opps.push({
            id: `${actIdx}-kw`,
            title: oppTitle,
            fullTitle: oppTitle,
            type: rule.type, potentialArea: rule.area, source, confidence: rule.confidence,
            status: 'Discovery', ownerName,
            lastUpdated: actDate ? formatDate(actDate) : 'Recent',
            description: `High-value signal "${matchedKeyword}" detected in ${source}: ${rawText.substring(0, 220)}\u2026`,
            history: [{ date: actDate ? formatDate(actDate) : 'Recent', text: `Discussed during ${source}: ${activity.subject || activity.taskHeader || ''}` }],
            nextStep: `Follow up on ${rule.area} requirements`,
          });
          break;
        }
      }
    });

    // 3. Recommended Actions & Opportunities from AI NBA (Strictly high-value business expansion only)
    (nbas || []).forEach((nba, nIdx) => {
      // Exclude generic relationship gaps, check-in reminders, stakeholder mapping, and operational tasks
      if (
        !nba.suggestedAction ||
        nba.type === 'Relationship Engagement' ||
        nba.type === 'Risk Mitigation' ||
        nba.type === 'Urgent Follow-Up'
      ) {
        return;
      }

      const text = `${nba.suggestedAction} ${nba.reason || ''} ${nba.type || ''}`.toLowerCase();
      const isRoutineAction = EXCLUDED_OPPORTUNITY_PATTERNS.some(p => p.test(text));
      if (isRoutineAction) return;

      // Only accept if it is genuine account expansion or matches high-value commercial opportunity rules
      const isExpansionType = nba.type === 'Account Expansion' || nba.type === 'Opportunity';
      const matchedRule = DETECTION_RULES.find(r => r.keywords.some(k => text.includes(k)));

      if (!isExpansionType && !matchedRule) {
        return; // Filter out low-value / non-commercial items
      }

      const area = matchedRule ? matchedRule.area : 'Growth & Innovation';
      const oppType = matchedRule ? matchedRule.type : 'Expansion';
      const title = nba.suggestedAction;
      const norm = title.trim().toLowerCase().substring(0, 60);
      if (seen.has(norm)) return;
      seen.add(norm);

      opps.push({
        id: nba.id || `nba-opp-${nIdx}`,
        title: title,
        fullTitle: title,
        type: oppType,
        potentialArea: area,
        source: 'AI Recommendation',
        confidence: 'High',
        status: 'Active',
        ownerName: account?.ownerName || 'Account Owner',
        lastUpdated: 'Recent',
        description: nba.reason || nba.suggestedAction,
        history: [{ date: 'Recent', text: nba.suggestedAction || nba.reason }],
        nextStep: nba.suggestedAction
      });
    });

    const order = { High: 0, Medium: 1, Low: 2 };
    return opps.sort((a, b) => (order[a.confidence] ?? 3) - (order[b.confidence] ?? 3) || a.title.localeCompare(b.title));
  }, [activitiesToScan, account, nbas]);

  // Merge manual + auto-detected, manual always on top
  const allOpportunities = useMemo(() => {
    return [...manualOpps, ...detectedOpportunities];
  }, [manualOpps, detectedOpportunities]);

  /* ── Global search: all fields ── */
  const filteredOpps = useMemo(() => {
    if (!searchTerm.trim()) return allOpportunities;
    const q = searchTerm.toLowerCase();
    return allOpportunities.filter(o =>
      o.title.toLowerCase().includes(q) ||
      o.potentialArea.toLowerCase().includes(q) ||
      o.type.toLowerCase().includes(q) ||
      o.source.toLowerCase().includes(q) ||
      (o.description || '').toLowerCase().includes(q)
    );
  }, [allOpportunities, searchTerm]);

  /* ── Pagination states (up to 10 opportunities per page) ── */
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalFiltered = filteredOpps.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * rowsPerPage;
  const endIdx = Math.min(startIdx + rowsPerPage, totalFiltered);

  const paginatedOpps = useMemo(() => {
    return filteredOpps.slice(startIdx, endIdx);
  }, [filteredOpps, startIdx, endIdx]);

  /* ── Create opportunity handler ── */
  const handleCreate = () => {
    if (!form.title.trim()) { setFormError('Opportunity title is required.'); return; }

    let finalArea = form.potentialArea.trim() || 'Growth & Innovation';
    if (finalArea === 'Other' && form.otherAreaDetails?.trim()) {
      finalArea = form.otherAreaDetails.trim();
    } else if (finalArea === 'Other') {
      setFormError('Please specify the custom potential area.');
      return;
    }

    const now = new Date().toISOString();
    const newOpp = {
      id: `manual-${Date.now()}`,
      title: form.title.trim(),
      fullTitle: form.title.trim(),
      potentialArea: finalArea,
      type: form.type,
      source: 'Manual',
      confidence: 'High',
      status: 'Active',
      ownerName: account?.ownerName || 'Account Owner',
      lastUpdated: formatDate(now),
      description: `Manually created opportunity${finalArea ? ` for ${finalArea}` : ''}.`,
      history: [{ date: formatDate(now), text: 'Opportunity manually created.' }],
      nextStep: `Follow up on: ${form.title.trim()}`,
      isManual: true,
    };
    setManualOpps(prev => [newOpp, ...prev]);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowCreateModal(false);
  };

  const confidenceStyle = {
    High: 'bg-green-50 text-green-700 border border-green-100',
    Medium: 'bg-orange-50 text-orange-600 border border-orange-100',
    Low: 'bg-red-50 text-red-600 border border-red-100',
  };
  const confidenceDot = { High: 'bg-green-500', Medium: 'bg-orange-400', Low: 'bg-red-500' };
  const typeStyle = {
    Expansion: 'bg-blue-50 text-blue-600 border-blue-200',
    Renewal: 'bg-purple-50 text-purple-600 border-purple-200',
    'Cross-sell': 'bg-green-50 text-green-700 border-green-200',
  };

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-white" onClick={() => showAreaDropdown && setShowAreaDropdown(false)}>

      {/* ── Main Panel ── */}
      <div className="flex-1 flex flex-col w-full">

        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="text-indigo-900">
              <TrendingUp className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                Opportunities
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Global Search */}
            <div className="relative min-w-[280px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search opportunities, areas, owners…"
                className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-8 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Create Button */}
            <button
              onClick={() => { setShowCreateModal(true); setForm(EMPTY_FORM); setFormError(''); }}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 !text-white text-sm font-bold rounded-lg shadow-sm transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4 !text-white" />
              <span className="!text-white">Create Opportunity</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto mt-4 px-6">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white sticky top-0 z-10">
              <tr className="border-b border-gray-200">
                <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider">Opportunity</th>
                <th className="py-3 px-2 text-[11px] font-bold text-gray-900 uppercase tracking-wider">Potential Area</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedOpps.map(opp => (
                <tr
                  key={opp.id}
                  onClick={() => setSelectedOpp(opp)}
                  className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                  title="Click to view full opportunity details"
                >
                  <td className="py-4 px-2">
                    <div className="font-bold text-sm text-blue-900 group-hover:text-blue-700 transition-colors mb-1 leading-snug">
                      {opp.fullTitle || opp.title}
                    </div>
                    {opp.description && (
                      <p className="text-xs text-gray-600 mb-2 leading-relaxed">
                        {opp.description}
                      </p>
                    )}
                    <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap font-semibold">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-gray-400" />
                        Source: {opp.source}
                      </span>
                      {opp.type && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          opp.type === 'Expansion' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          opp.type === 'Renewal' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          opp.type === 'Cross-sell' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          'bg-gray-100 text-gray-700 border-gray-200'
                        }`}>
                          {opp.type}
                        </span>
                      )}
                      {opp.confidence && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          opp.confidence === 'High' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          opp.confidence === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {opp.confidence} Confidence
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-2 text-sm text-gray-700 font-semibold align-top pt-4">
                    <span className="inline-block px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700">
                      {opp.potentialArea}
                    </span>
                  </td>
                </tr>
              ))}
              {totalFiltered === 0 && (
                <tr>
                  <td colSpan="2" className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center justify-center max-w-md mx-auto text-center">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-3">
                        <TrendingUp className="w-6 h-6 text-primary" />
                      </div>
                      <h4 className="text-base font-bold text-gray-800 mb-1">
                        {searchTerm ? 'No opportunities match your search' : 'No expansion opportunities detected'}
                      </h4>
                      <p className="text-xs text-gray-500 leading-relaxed mb-4">
                        {searchTerm
                          ? 'Try refining your search keyword or check other areas.'
                          : 'High-value opportunities are automatically identified from commercial signals, contract renewals, RFPs, and technology expansion discussions in customer interactions, or can be added manually.'}
                      </p>
                      {!searchTerm && (
                        <button
                          onClick={() => { setShowCreateModal(true); setForm(EMPTY_FORM); setFormError(''); }}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 !text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
                        >
                          <Plus className="w-4 h-4 !text-white" /> <span className="!text-white">Create Opportunity</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between py-4 border-t border-gray-200 mt-4 text-sm text-gray-500">
            <div>
              Showing {totalFiltered === 0 ? '0' : `${startIdx + 1}-${endIdx}`} of {totalFiltered} opportunities
              {manualOpps.length > 0 ? ` (${manualOpps.length} manual)` : ''}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                Rows per page:
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-gray-700 bg-white outline-none focus:border-blue-900 cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
              <div>
                {totalFiltered === 0 ? '0-0 of 0' : `${startIdx + 1}-${endIdx} of ${totalFiltered}`}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                  title="Previous page"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                  title="Next page"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Create Opportunity Modal ── */}
      {showCreateModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto" onClick={() => setShowCreateModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-visible flex flex-col min-h-[450px] animate-in fade-in zoom-in-95 duration-200 my-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Create Opportunity</h3>
                  <p className="text-xs text-gray-400">Add a new growth opportunity manually</p>
                </div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 flex flex-col gap-5 flex-1">
              {/* Opportunity Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                  Opportunity <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Expand cloud infrastructure for ZEISS"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-gray-300"
                  value={form.title}
                  onChange={e => { setForm(f => ({ ...f, title: e.target.value })); setFormError(''); }}
                  autoFocus
                />
              </div>

              {/* Potential Area */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                  Potential Area <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    placeholder="Select a potential area…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 pr-9 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder:text-gray-300 cursor-pointer"
                    value={form.potentialArea}
                    onClick={() => setShowAreaDropdown(true)}
                  />
                  <ChevronDown
                    className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer"
                    onClick={() => setShowAreaDropdown(v => !v)}
                  />
                  {showAreaDropdown && (
                    <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-52 overflow-y-auto">
                      {POTENTIAL_AREAS
                        .map(area => (
                          <button
                            key={area}
                            type="button"
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                            onMouseDown={e => { e.preventDefault(); setForm(f => ({ ...f, potentialArea: area })); setShowAreaDropdown(false); }}
                          >
                            {area}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Other Area Details */}
              {form.potentialArea === 'Other' && (
                <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2">
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Specify Area <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Enter custom potential area…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    value={form.otherAreaDetails || ''}
                    onChange={e => { setForm(f => ({ ...f, otherAreaDetails: e.target.value })); setFormError(''); }}
                    autoFocus
                  />
                </div>
              )}



              {/* Error */}
              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <X className="w-4 h-4 shrink-0" /> {formError}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="flex-1 py-2.5 bg-primary hover:bg-primary/90 !text-white rounded-lg text-sm font-bold transition-colors flex justify-center items-center gap-2 shadow-sm cursor-pointer"
              >
                <Check className="w-4 h-4 !text-white" /> <span className="!text-white">Create Opportunity</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Opportunity Details Modal ── */}
      {selectedOpp && createPortal(
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          onClick={() => setSelectedOpp(null)}
        >
          <div
            className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col my-auto animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50/70">
              <div className="space-y-2 flex-1 pr-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-[10px] font-black tracking-wide uppercase">
                    {selectedOpp.source || 'Opportunity'}
                  </span>
                  {selectedOpp.type && (
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase border ${selectedOpp.type === 'Expansion' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        selectedOpp.type === 'Renewal' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          selectedOpp.type === 'Cross-sell' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            'bg-gray-100 text-gray-700 border-gray-200'
                      }`}>
                      {selectedOpp.type}
                    </span>
                  )}
                  {selectedOpp.confidence && (
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase border ${selectedOpp.confidence === 'High' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        selectedOpp.confidence === 'Medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                      Confidence: {selectedOpp.confidence}
                    </span>
                  )}
                  {selectedOpp.status && (
                    <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase">
                      {selectedOpp.status}
                    </span>
                  )}
                </div>

                <h2 className="text-xl font-bold text-gray-900 leading-snug">
                  {selectedOpp.fullTitle || selectedOpp.title}
                </h2>
              </div>

              <button
                onClick={() => setSelectedOpp(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-white">
              {/* Metadata Overview Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div>
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Potential Area</div>
                  <div className="text-sm font-bold text-gray-800 mt-0.5">{selectedOpp.potentialArea || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Account</div>
                  <div className="text-sm font-bold text-gray-800 mt-0.5">{account?.name || 'Account'}</div>
                </div>
                <div>
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Owner</div>
                  <div className="text-sm font-bold text-gray-800 mt-0.5">{selectedOpp.ownerName || account?.ownerName || 'Account Owner'}</div>
                </div>
                {selectedOpp.lastUpdated && (
                  <div>
                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Last Detected / Updated</div>
                    <div className="text-sm font-medium text-gray-700 mt-0.5">{selectedOpp.lastUpdated}</div>
                  </div>
                )}
              </div>

              {/* Details / Context */}
              {selectedOpp.description && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" /> Context & Description
                  </h3>
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm text-gray-700 font-medium leading-relaxed whitespace-pre-wrap">
                    {selectedOpp.description}
                  </div>
                </div>
              )}

              {/* Recommended Next Step */}
              {selectedOpp.nextStep && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-600" /> Recommended Action
                  </h3>
                  <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200/80 text-sm text-blue-950 font-medium leading-relaxed">
                    {selectedOpp.nextStep}
                  </div>
                </div>
              )}

              {/* History / Activity */}
              {Array.isArray(selectedOpp.history) && selectedOpp.history.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" /> Timeline & Activity
                  </h3>
                  <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                    {selectedOpp.history.map((h, hIdx) => (
                      <div key={hIdx} className="p-3 text-xs flex items-start gap-3 bg-white">
                        <span className="font-bold text-gray-400 whitespace-nowrap min-w-[70px]">{h.date}</span>
                        <span className="text-gray-700 font-medium">{h.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 px-6 border-t border-gray-100 flex justify-end bg-gray-50/50">
              <button
                onClick={() => setSelectedOpp(null)}
                className="px-5 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

