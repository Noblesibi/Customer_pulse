/**
 * CustomerPulse Risk Rules & Scoring Engine Catalog
 * Fully compliant with the 8 Category weighted risk model, hard overrides,
 * impact multipliers, and custom rule extensions.
 */

export const DEFAULT_RISK_CATEGORIES = [
  { id: 'A', name: 'Silence and inactivity', weight: 20, description: 'Touchpoint recency, interaction gaps, and engagement volume drops' },
  { id: 'B', name: 'Sentiment and language', weight: 20, description: 'Negative tone, escalation language, pricing pushback, and cancellation keywords' },
  { id: 'C', name: 'Responsiveness', weight: 10, description: 'Unanswered outbound emails, reply delays, and meeting attendance behavior' },
  { id: 'D', name: 'Relationship and contacts', weight: 15, description: 'Single-threading, champion silence, contact departures, and organizational shifts' },
  { id: 'E', name: 'Meetings and touchpoint schedule', weight: 10, description: 'Meeting schedule breakdown, meeting durations, attendance drops, and lack of next steps' },
  { id: 'F', name: 'Commitments and our execution', weight: 10, description: 'Overdue action items, SLA breaches, missed promised deliverables, and note gaps' },
  { id: 'G', name: 'Contract and commercial lifecycle', weight: 10, description: 'Contract status, unpaid invoices, billing disputes, and scope shrink' },
  { id: 'H', name: 'Competitive and market signals', weight: 5, description: 'Competitor mentions, RFP evaluations, in-house build talk, and customer layoffs' },
  { id: 'Basic', name: 'Basic risk rules', weight: 0, description: 'Core foundational risk indicators and essential operational thresholds' }
];

export const HARD_OVERRIDES = [
  { condition: 'Cancellation or notice language', forcedBand: 'Critical', description: 'Keywords: "terminate", "cancel", "notice period", "cancellation notice"' },
  { condition: 'Competitor meeting reported', forcedBand: 'High', description: 'Customer disclosed meeting with another vendor' },
  { condition: '90 days of silence', forcedBand: 'High', description: 'Zero recorded interactions across 90 days' },
  { condition: 'Legal or dispute language', forcedBand: 'High', description: 'Keywords: "penalty", "SLA breach", "legal", "dispute"' }
];

export const IMPACT_MULTIPLIERS = {
  Strategic: 1.5,
  Key: 1.2,
  Standard: 1.0,
  Low: 0.8
};

export const RISK_BANDS = [
  { band: 'Low', min: 0, max: 25, color: 'text-emerald-700 bg-emerald-50 border-emerald-200', probability: 0.05 },
  { band: 'Medium', min: 26, max: 50, color: 'text-amber-700 bg-amber-50 border-amber-200', probability: 0.25 },
  { band: 'High', min: 51, max: 75, color: 'text-orange-700 bg-orange-50 border-orange-200', probability: 0.50 },
  { band: 'Critical', min: 76, max: 100, color: 'text-rose-700 bg-rose-50 border-rose-200', probability: 0.80 }
];

export const READY_MADE_RISK_RULES = [
  // --- Category A: Silence and inactivity (Tiered rules) ---
  { id: 'A-1', categoryId: 'A', category: 'Silence and inactivity', name: 'No interaction in 14 days (strategic tier)', trigger: 'Days since last non-automated interaction ≥ 14 for Strategic tier', points: 30, tier: 'Strategic', isTiered: true, defaultEnabled: false },
  { id: 'A-2', categoryId: 'A', category: 'Silence and inactivity', isBasic: true, name: 'No interaction in 30 days', trigger: '≥ 30 days without touchpoint', points: 40, isTiered: true, defaultEnabled: true },
  { id: 'A-3', categoryId: 'A', category: 'Silence and inactivity', name: 'No interaction in 60 days', trigger: '≥ 60 days without touchpoint', points: 70, isTiered: true, defaultEnabled: false },
  { id: 'A-4', categoryId: 'A', category: 'Silence and inactivity', name: 'No interaction in 90 days', trigger: '≥ 90 days without touchpoint', points: 100, isTiered: true, defaultEnabled: false },
  { id: 'A-5', categoryId: 'A', category: 'Silence and inactivity', name: 'No two-way interaction in 45 days', trigger: 'Only outbound sent, no customer reply or meeting in 45 days', points: 50, defaultEnabled: false },
  { id: 'A-6', categoryId: 'A', category: 'Silence and inactivity', isBasic: true, name: 'No meeting in 90 days', trigger: '0 meetings (Teams or in person) in 90 days', points: 40, defaultEnabled: true },
  { id: 'A-7', categoryId: 'A', category: 'Silence and inactivity', name: 'No inbound mail in 45 days', trigger: 'Customer has not sent an inbound mail in 45 days', points: 35, defaultEnabled: false },
  { id: 'A-8', categoryId: 'A', category: 'Silence and inactivity', name: 'Interaction volume collapse', trigger: 'Last 30 days under 50% of the previous 90-day monthly average', points: 40, defaultEnabled: false },
  { id: 'A-9', categoryId: 'A', category: 'Silence and inactivity', isBasic: true, name: 'Only automated or greeting mails', trigger: 'No core business conversation for 60 days', points: 30, defaultEnabled: true },
  { id: 'A-10', categoryId: 'A', category: 'Silence and inactivity', name: 'Manual log gap', trigger: 'Account owner logged nothing in 30 days', points: 15, defaultEnabled: false },

  // --- Category B: Sentiment and language ---
  { id: 'B-1', categoryId: 'B', category: 'Sentiment and language', name: 'Negative interaction', trigger: '1 negative mail, log or transcript in 30 days', points: 20, defaultEnabled: false },
  { id: 'B-2', categoryId: 'B', category: 'Sentiment and language', name: 'Negative cluster', trigger: '3 or more negative interactions in 30 days', points: 50, defaultEnabled: false },
  { id: 'B-3', categoryId: 'B', category: 'Sentiment and language', name: 'Sentiment decline', trigger: 'Average sentiment dropped 20+ points versus the prior 30 days', points: 35, defaultEnabled: false },
  { id: 'B-4', categoryId: 'B', category: 'Sentiment and language', name: 'Escalation words', trigger: 'Keywords: "escalate", "urgent", "unacceptable", "management"', points: 40, defaultEnabled: false },
  { id: 'B-5', categoryId: 'B', category: 'Sentiment and language', name: 'Cancellation language', trigger: 'Keywords: "terminate", "cancel", "notice period", "not renew", "reconsider"', points: 80, defaultEnabled: false },
  { id: 'B-6', categoryId: 'B', category: 'Sentiment and language', name: 'Dissatisfaction phrases', trigger: 'Keywords: "not happy", "disappointed", "delay", "again"', points: 25, defaultEnabled: false },
  { id: 'B-7', categoryId: 'B', category: 'Sentiment and language', name: 'Pricing pressure', trigger: 'Keywords: "too expensive", "discount", "reduce cost", "budget cut"', points: 30, defaultEnabled: false },
  { id: 'B-8', categoryId: 'B', category: 'Sentiment and language', name: 'Quality complaint', trigger: 'Keywords: "bugs", "quality", "rework", "defects"', points: 30, defaultEnabled: false },
  { id: 'B-9', categoryId: 'B', category: 'Sentiment and language', name: 'Legal or contract language', trigger: 'Keywords: "penalty", "SLA breach", "legal", "dispute"', points: 50, defaultEnabled: false },
  { id: 'B-10', categoryId: 'B', category: 'Sentiment and language', isBasic: true, name: 'Unresolved complaint', trigger: 'Negative log with no follow-up within 7 days', points: 40, defaultEnabled: true },
  { id: 'B-11', categoryId: 'B', category: 'Sentiment and language', isBasic: true, name: 'Repeated issue', trigger: 'Same topic raised 3+ times in 60 days', points: 35, defaultEnabled: true },
  { id: 'B-12', categoryId: 'B', category: 'Sentiment and language', name: 'Long unresolved thread', trigger: '6+ back-and-forth emails on one issue', points: 25, defaultEnabled: false },
  { id: 'B-13', categoryId: 'B', category: 'Sentiment and language', name: 'Tone change', trigger: 'Formal and curt where earlier mails were warm (LLM-detected)', points: 15, defaultEnabled: false },

  // --- Category C: Responsiveness ---
  { id: 'C-1', categoryId: 'C', category: 'Responsiveness', name: 'Unanswered outbound streak', trigger: '3 consecutive emails with no customer reply', points: 35, defaultEnabled: false },
  { id: 'C-2', categoryId: 'C', category: 'Responsiveness', name: 'Reply rate below 30%', trigger: 'Customer reply rate below 30% over 90 days', points: 30, defaultEnabled: false },
  { id: 'C-3', categoryId: 'C', category: 'Responsiveness', name: 'Slower replies', trigger: 'Average response time more than doubled versus the 3-month average', points: 25, defaultEnabled: false },
  { id: 'C-4', categoryId: 'C', category: 'Responsiveness', isBasic: true, name: 'Meeting declines', trigger: '2 declined meetings or no-shows in 60 days', points: 35, defaultEnabled: true },
  { id: 'C-5', categoryId: 'C', category: 'Responsiveness', name: 'Repeated rescheduling', trigger: 'A scheduled meeting moved 3+ times', points: 20, defaultEnabled: false },
  { id: 'C-6', categoryId: 'C', category: 'Responsiveness', name: 'Customer attends muted', trigger: 'Customer talk share under 10% in the last 2 transcripts', points: 20, defaultEnabled: false },
  { id: 'C-7', categoryId: 'C', category: 'Responsiveness', name: 'Out-of-office for 30+ days', trigger: 'Primary contact absent or extended OOO', points: 20, defaultEnabled: false },

  // --- Category D: Relationship and contacts ---
  { id: 'D-1', categoryId: 'D', category: 'Relationship and contacts', name: 'Single-threaded account', trigger: 'Only 1 active stakeholder contact in 90 days', points: 35, defaultEnabled: false },
  { id: 'D-2', categoryId: 'D', category: 'Relationship and contacts', name: 'Sponsor silent', trigger: 'Executive sponsor or decision-maker with no interaction in 90 days', points: 40, defaultEnabled: false },
  { id: 'D-3', categoryId: 'D', category: 'Relationship and contacts', name: 'Champion disengaged', trigger: 'Champion\'s last interaction over 45 days ago', points: 40, defaultEnabled: false },
  { id: 'D-4', categoryId: 'D', category: 'Relationship and contacts', name: 'Contact left', trigger: 'Email bounce, left-company mention, or auto-reply', points: 45, defaultEnabled: false },
  { id: 'D-5', categoryId: 'D', category: 'Relationship and contacts', name: 'Primary contact changed', trigger: 'New individual replaced main client contact', points: 30, defaultEnabled: false },
  { id: 'D-6', categoryId: 'D', category: 'Relationship and contacts', name: 'Decision-maker never met', trigger: 'No executive-level meeting in 6 months', points: 30, defaultEnabled: false },
  { id: 'D-7', categoryId: 'D', category: 'Relationship and contacts', name: 'Contact breadth shrinking', trigger: 'Active client contacts down 50% over 2 quarters', points: 30, defaultEnabled: false },
  { id: 'D-8', categoryId: 'D', category: 'Relationship and contacts', name: 'Escalation to customer senior management', trigger: 'Customer leadership added to an active complaint email', points: 40, defaultEnabled: false },
  { id: 'D-9', categoryId: 'D', category: 'Relationship and contacts', name: 'Customer senior removed from CC', trigger: 'Leadership dropped from an active email thread', points: 15, defaultEnabled: false },
  { id: 'D-10', categoryId: 'D', category: 'Relationship and contacts', name: 'Single internal owner', trigger: 'Only one internal person talks to the customer', points: 20, defaultEnabled: false },

  // --- Category E: Meetings and cadence ---
  { id: 'E-1', categoryId: 'E', category: 'Meetings and touchpoint schedule', name: 'Missed recurring syncs', trigger: '2 missed recurring sync meetings', points: 35, defaultEnabled: false },
  { id: 'E-2', categoryId: 'E', category: 'Meetings and touchpoint schedule', name: 'Meeting frequency reduced', trigger: 'Weekly sync became monthly or paused', points: 30, defaultEnabled: false },
  { id: 'E-3', categoryId: 'E', category: 'Meetings and touchpoint schedule', name: 'Shorter meetings', trigger: 'Average call duration down 50%', points: 15, defaultEnabled: false },
  { id: 'E-4', categoryId: 'E', category: 'Meetings and touchpoint schedule', name: 'Falling attendance', trigger: 'Customer attendees fewer in 3 consecutive meetings', points: 25, defaultEnabled: false },
  { id: 'E-5', categoryId: 'E', category: 'Meetings and touchpoint schedule', name: 'No decisions made', trigger: '3 meetings with no decision or recorded next step', points: 25, defaultEnabled: false },
  { id: 'E-6', categoryId: 'E', category: 'Meetings and touchpoint schedule', name: 'No next meeting scheduled', trigger: 'Nothing booked on calendar within 30 days', points: 25, defaultEnabled: false },
  { id: 'E-7', categoryId: 'E', category: 'Meetings and touchpoint schedule', name: 'Transcript stagnation', trigger: 'Same topics repeated, no progress, across 3 meetings', points: 20, defaultEnabled: false },
  { id: 'E-8', categoryId: 'E', category: 'Meetings and touchpoint schedule', name: 'Customer lead absent', trigger: 'Customer-side project lead missed 2 consecutive syncs', points: 30, defaultEnabled: false },

  // --- Category F: Commitments and our own execution ---
  { id: 'F-1', categoryId: 'F', category: 'Commitments and our execution', name: 'Overdue action items', trigger: '3 or more overdue tasks owed to customer', points: 35, defaultEnabled: false },
  { id: 'F-2', categoryId: 'F', category: 'Commitments and our execution', name: 'Single item overdue 14+ days', trigger: 'Any promised item overdue by 14+ days', points: 25, defaultEnabled: false },
  { id: 'F-3', categoryId: 'F', category: 'Commitments and our execution', name: 'No minutes sent', trigger: 'Meeting concluded without follow-up minutes in 3 days', points: 15, defaultEnabled: false },
  { id: 'F-4', categoryId: 'F', category: 'Commitments and our execution', name: 'Proposal not followed up', trigger: 'Proposal or quote sent, no follow-up in 7 days', points: 25, defaultEnabled: false },
  { id: 'F-5', categoryId: 'F', category: 'Commitments and our execution', name: 'Unanswered customer mail', trigger: 'Customer mail unanswered over 2 working days', points: 30, defaultEnabled: false },
  { id: 'F-6', categoryId: 'F', category: 'Commitments and our execution', name: 'Unanswered 5+ days', trigger: 'Customer email unanswered over 5 working days', points: 50, defaultEnabled: false },
  { id: 'F-7', categoryId: 'F', category: 'Commitments and our execution', name: 'Missed promised date', trigger: 'Failed to meet commitment date communicated to client', points: 40, defaultEnabled: false },
  { id: 'F-8', categoryId: 'F', category: 'Commitments and our execution', name: 'Meeting held, no log', trigger: 'Meeting took place without notes logged in 3 days', points: 10, defaultEnabled: false },
  { id: 'F-9', categoryId: 'F', category: 'Commitments and our execution', name: 'Owner change', trigger: 'Account owner changed in last 90 days without handover', points: 25, defaultEnabled: false },

  // --- Category G: Contract and commercial lifecycle ---
  { id: 'G-5', categoryId: 'G', category: 'Contract and commercial lifecycle', name: 'Scope or headcount reduction request', trigger: 'Customer requested descoping or team reduction', points: 60, defaultEnabled: false },
  { id: 'G-6', categoryId: 'G', category: 'Contract and commercial lifecycle', name: 'Payment query or dispute', trigger: 'Billing dispute or payment query mentioned in correspondence', points: 30, defaultEnabled: false },
  { id: 'G-7', categoryId: 'G', category: 'Contract and commercial lifecycle', name: 'Invoice overdue', trigger: 'Customer invoice over 30 days late', points: 40, defaultEnabled: false },
  { id: 'G-8', categoryId: 'G', category: 'Contract and commercial lifecycle', name: 'Invoice overdue 60+ days', trigger: 'Customer invoice over 60 days past due', points: 70, defaultEnabled: false },
  { id: 'G-9', categoryId: 'G', category: 'Contract and commercial lifecycle', name: 'Pending change request unanswered', trigger: 'Change request pending for over 14 days', points: 25, defaultEnabled: false },
  { id: 'G-10', categoryId: 'G', category: 'Contract and commercial lifecycle', name: 'Notice period started', trigger: 'Official notice period started or communicated', points: 100, defaultEnabled: false },
  { id: 'G-11', categoryId: 'G', category: 'Contract and commercial lifecycle', name: 'New vendor evaluation', trigger: 'Keywords: "RFP", "vendor review", "tender"', points: 60, defaultEnabled: false },
  { id: 'G-12', categoryId: 'G', category: 'Contract and commercial lifecycle', name: 'No new work in 12 months', trigger: 'No new SoW, change request, or expansion in 12 months', points: 20, defaultEnabled: false },

  // --- Category H: Competitive and market signals ---
  { id: 'H-1', categoryId: 'H', category: 'Competitive and market signals', name: 'Competitor mentioned', trigger: 'Competitor vendor named in transcript, email, or log', points: 40, defaultEnabled: false },
  { id: 'H-2', categoryId: 'H', category: 'Competitive and market signals', name: 'Competitor meeting reported', trigger: 'Customer reported meeting with an alternative vendor', points: 70, defaultEnabled: false },
  { id: 'H-3', categoryId: 'H', category: 'Competitive and market signals', name: 'In-house build talk', trigger: 'Keywords: "we will build internally", "own team"', points: 50, defaultEnabled: false },
  { id: 'H-4', categoryId: 'H', category: 'Competitive and market signals', name: 'Customer news: layoffs or restructuring', trigger: 'Layoffs or restructuring announced at customer organization', points: 30, defaultEnabled: false },
  { id: 'H-5', categoryId: 'H', category: 'Competitive and market signals', name: 'Customer acquired or merging', trigger: 'M&A activity reported for customer company', points: 40, defaultEnabled: false },
  { id: 'H-6', categoryId: 'H', category: 'Competitive and market signals', name: 'Customer budget freeze', trigger: 'Customer notified of an organizational budget freeze', points: 50, defaultEnabled: false },
  { id: 'H-7', categoryId: 'H', category: 'Competitive and market signals', name: 'Customer leadership change', trigger: 'New client CIO, CTO, or VP appointed', points: 35, defaultEnabled: false },
  { id: 'H-8', categoryId: 'H', category: 'Competitive and market signals', name: 'Industry downturn or regulation shift', trigger: 'External regulatory or industry headwinds reported', points: 15, defaultEnabled: false }
];

/**
 * Calculates risk score based on the 4-step framework:
 * Step 1: Sum points per category
 * Step 2: Cap each category at 100
 * Step 3: Weighted average = Σ(category score × weight) ÷ Σ(weights)
 * Step 4: Check hard overrides and apply impact multiplier
 */
export function calculateWeightedRiskScore({
  firedRuleIds = [],
  customRules = [],
  categoryWeights = {},
  tier = 'Strategic',
  contractValue = 0,
  overrides = []
}) {
  const allRules = [...READY_MADE_RISK_RULES, ...customRules];
  const activeFiredRules = allRules.filter(r => firedRuleIds.includes(r.id));

  // Step 1 & 2: Points per category, capped at 100
  const categoryScores = {};
  DEFAULT_RISK_CATEGORIES.forEach(cat => {
    categoryScores[cat.name] = 0;
  });

  // Category A has tiered silence rules: take maximum silence tier points only
  const catARules = activeFiredRules.filter(r => r.categoryId === 'A' && r.isTiered);
  const maxTieredSilencePoints = catARules.reduce((max, r) => Math.max(max, r.points || 0), 0);
  const otherCatARules = activeFiredRules.filter(r => r.categoryId === 'A' && !r.isTiered);
  const otherCatAPoints = otherCatARules.reduce((sum, r) => sum + (r.points || 0), 0);
  categoryScores['Silence and inactivity'] = Math.min(100, maxTieredSilencePoints + otherCatAPoints);

  // Other categories
  activeFiredRules.filter(r => r.categoryId !== 'A').forEach(r => {
    const catName = r.category || 'Silence and inactivity';
    categoryScores[catName] = Math.min(100, (categoryScores[catName] || 0) + (r.points || 0));
  });

  // Step 3: Weighted average
  let totalWeightedScore = 0;
  let totalWeights = 0;
  DEFAULT_RISK_CATEGORIES.forEach(cat => {
    const w = categoryWeights[cat.id] !== undefined ? categoryWeights[cat.id] : cat.weight;
    if (w > 0) {
      totalWeightedScore += (categoryScores[cat.name] || 0) * w;
      totalWeights += w;
    }
  });

  let rawRiskScore = totalWeights > 0 ? Math.round(totalWeightedScore / totalWeights) : 0;

  // Step 4: Overrides & Impact multiplier
  let forcedBand = null;
  if (overrides && overrides.length > 0) {
    if (overrides.some(o => o.forcedBand === 'Critical')) forcedBand = 'Critical';
    else if (overrides.some(o => o.forcedBand === 'High')) forcedBand = 'High';
  }

  // Determine band
  let finalBand = 'Low';
  if (forcedBand) {
    finalBand = forcedBand;
  } else if (rawRiskScore >= 76) {
    finalBand = 'Critical';
  } else if (rawRiskScore >= 51) {
    finalBand = 'High';
  } else if (rawRiskScore >= 26) {
    finalBand = 'Medium';
  }

  // Impact Multiplier
  const impactFactor = IMPACT_MULTIPLIERS[tier] || 1.0;
  const scaledPriority = Math.round(rawRiskScore * impactFactor);

  return {
    rawRiskScore,
    categoryScores,
    finalBand,
    scaledPriority,
    impactFactor,
    revenueAtRisk: 0,
    firedRulesCount: activeFiredRules.length
  };
}


export function getRiskCategoryId(risk) {
  if (!risk) return 'A';
  const cat = (risk.category || '').toLowerCase();
  const title = (risk.title || '').toLowerCase();
  
  // Basic: Foundational and core baseline signals
  if (cat === 'basic' || cat.includes('basic') || title.includes('basic')) return 'Basic';

  // A: Silence and inactivity
  if (cat.includes('silence') || cat.includes('inactiv') || title.includes('silence') || title.includes('inactive')) return 'A';
  // B: Sentiment and language
  if (cat.includes('sentiment') || cat.includes('language') || cat.includes('frustrat') || cat.includes('escalat') || cat.includes('anger')) return 'B';
  // C: Responsiveness
  if (cat.includes('responsiv') || title.includes('unanswered') || title.includes('delay')) return 'C';
  // D: Relationship and contacts
  if (cat.includes('relationship') || cat.includes('contact') || cat.includes('champion') || title.includes('sponsor')) return 'D';
  // E: Meetings and touchpoint schedule
  if (cat.includes('meeting') || cat.includes('touchpoint') || cat.includes('schedule') || cat.includes('cadence')) return 'E';
  // F: Commitments and our execution
  if (cat.includes('commit') || cat.includes('execution') || cat.includes('delivery') || cat.includes('sla') || title.includes('overdue deliverable') || title.includes('task')) return 'F';
  // G: Contract and commercial lifecycle
  if (cat.includes('commerc') || cat.includes('contract') || title.includes('invoice') || title.includes('payment')) return 'G';
  // H: Competitive and market signals
  if (cat.includes('compet') || cat.includes('market') || title.includes('competitor')) return 'H';

  return 'A'; // fallback
}
