import { formatDate } from './dateFormat.js';

export const DETECTION_RULES = [
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

export const EXCLUDED_OPPORTUNITY_PATTERNS = [
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

export const stripHtmlText = (html) => {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  } catch {
    return String(html).replace(/<[^>]*>?/gm, '');
  }
};

export const classifyOppText = (text) => {
  const lower = String(text || '').toLowerCase();
  for (const rule of DETECTION_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) {
      return { type: rule.type, area: rule.area, confidence: rule.confidence };
    }
  }
  return { type: 'Expansion', area: 'Growth & Innovation', confidence: 'Medium' };
};

export function getManualOpportunities(accountId) {
  if (!accountId || typeof localStorage === 'undefined') return [];
  try {
    const saved = localStorage.getItem(`manual_opps_${accountId}`);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Single source of truth for detecting real commercial opportunities on an account
 * from database-stored interactions and AI expansion NBAs (excluding generic
 * relationship gaps, stakeholder mapping reminders, risk mitigation, greetings, and tasks).
 */
export function detectAccountOpportunities({ account, activities = [], nbas = [] }) {
  const opps = [];
  const seen = new Set();

  (activities || []).forEach((activity, actIdx) => {
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

    const rawText = stripHtmlText(
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

    // 1. Structured businessOpportunities field from DB (highest fidelity)
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
          type,
          potentialArea: area,
          source,
          confidence,
          status: 'Active',
          ownerName,
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
          type: rule.type,
          potentialArea: rule.area,
          source,
          confidence: rule.confidence,
          status: 'Discovery',
          ownerName,
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
  const NON_OPPORTUNITY_NBA_TYPES = new Set([
    'Relationship Engagement',
    'Risk Mitigation',
    'Urgent Follow-Up',
    'Health Recovery',
    'Health Improvement',
    'Staff Task Overdue',
    'Staff Task Follow-Up',
    'Associated Task Overdue',
    'Associated Task Follow-Up',
    'Celebration Greeting',
    'Sentiment Recovery',
    'Interaction Follow-Up',
    'Engagement Outreach',
  ]);
  (nbas || []).forEach((nba, nIdx) => {
    if (!nba.suggestedAction || NON_OPPORTUNITY_NBA_TYPES.has(nba.type)) {
      return;
    }

    const text = `${nba.suggestedAction} ${nba.reason || ''} ${nba.type || ''}`.toLowerCase();
    if (EXCLUDED_OPPORTUNITY_PATTERNS.some(p => p.test(text))) return;

    const isExpansionType = nba.type === 'Account Expansion' || nba.type === 'Opportunity';
    const matchedRule = DETECTION_RULES.find(r => r.keywords.some(k => text.includes(k)));
    if (!isExpansionType && !matchedRule) return;

    const area = matchedRule ? matchedRule.area : 'Growth & Innovation';
    const oppType = matchedRule ? matchedRule.type : 'Expansion';
    const title = nba.suggestedAction;
    const norm = title.trim().toLowerCase().substring(0, 60);
    if (seen.has(norm)) return;
    seen.add(norm);

    opps.push({
      id: nba.id || `nba-opp-${nIdx}`,
      title,
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
      nextStep: nba.suggestedAction,
    });
  });

  const order = { High: 0, Medium: 1, Low: 2 };
  return opps.sort((a, b) => (order[a.confidence] ?? 3) - (order[b.confidence] ?? 3) || a.title.localeCompare(b.title));
}
