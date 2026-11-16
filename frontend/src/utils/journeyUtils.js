export const JOURNEY_STAGES = [
  'Awareness',
  'Consideration',
  'Decision',
  'Retention',
  'Advocacy'
];


export function getDynamicJourneyTooltip(stage, account = null) {
  const company = account?.companyName || 'the account';
  const currentStage = account?.journeyStage || 'Awareness';
  const isCurrent = currentStage.toLowerCase() === String(stage).toLowerCase();

  switch (stage) {
    case 'Awareness':
      return isCurrent
        ? `Currently in Awareness for ${company}: Establishing initial relationships, identifying key contacts, and exploring introductory requirements.`
        : `Initial discovery and introductory touchpoints with ${company}.`;
    case 'Consideration':
      return isCurrent
        ? `Active Consideration stage: Validating technical scope, scheduling demos/PoC, and aligning with ${company}'s operational needs.`
        : `Active interest — technical evaluation, demos, and requirements alignment for ${company}.`;
    case 'Decision':
      return isCurrent
        ? `Decision phase active: Reviewing commercial terms, final pricing proposals, procurement approvals, and SLA agreements for ${company}.`
        : `Finalizing commercial proposals, pricing review, and contract closure with ${company}.`;
    case 'Retention':
      return isCurrent
        ? `Active Retention stage: Delivering on contracted SLAs, managing ongoing tasks, scheduling reviews, and ensuring high health for ${company}.`
        : `Active customer partnership — delivery execution, milestone tracking, and relationship retention.`;
    case 'Advocacy':
      return isCurrent
        ? `Advocacy status achieved: ${company} is an executive partner participating in case studies, renewals, and expansion opportunities.`
        : `Trusted long-term partnership — customer advocacy, referrals, and commercial expansion.`;
    default:
      return JOURNEY_STAGE_TOOLTIPS[stage] || `Customer journey stage: ${stage}`;
  }
}

export const JOURNEY_STAGE_TOOLTIPS = {
  Awareness: 'Initial discovery and introductory touchpoints with the customer.',
  Consideration: 'Active interest — technical evaluation, demos, PoC, and requirements gathering.',
  Decision: 'Finalizing proposals, pricing, legal/procurement review, and contract closure.',
  Retention: 'Active customer — onboarding, delivery execution, QBRs, and ongoing account health.',
  Advocacy: 'Trusted long-term partner — case studies, testimonials, referrals, and expansion.'
};

const STAGE_NEXT_FOCUS = {
  Consideration: 'technical evaluation, product demos, and requirements alignment',
  Decision: 'commercial proposals, stakeholder sign-off, and contract finalization',
  Retention: 'onboarding, delivery milestones, and ongoing customer health',
  Advocacy: 'long-term partnership expansion, case studies, testimonials, and referrals'
};

const GREETING_EVENT_TYPES = new Set([
  'birthday',
  'work_anniversary',
  'company_anniversary',
  'festival',
  'holiday',
  'welcome',
  'farewell',
  'promotion',
  'new_role',
  'award',
  'achievement',
  'certification',
  'business_milestone',
  'project_milestone',
  'special_recognition',
  'custom_greeting'
]);

export function isAutomatedGreeting(item) {
  if (!item) return false;
  if (item.itemType === 'greeting') return true;
  if (item.isCelebration === true || item.isCelebration === 'true') return true;
  if (item.interactionType === 'Customer Celebration') return true;
  if (item.source === 'System Email') return true;
  const evType = item.eventType || item.celebrationEventType;
  if (evType && GREETING_EVENT_TYPES.has(String(evType).toLowerCase())) return true;
  return false;
}

export function stripHtmlText(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
}

export function getActivityTitle(item) {
  if (!item) return '';
  const raw =
    item.subject ||
    item.title ||
    item.taskHeader ||
    item.action ||
    (typeof item.task === 'string' && item.task.length <= 90 ? item.task : '') ||
    item.channel ||
    item.source ||
    '';
  return String(raw).trim();
}

export function detectActivityStage(item) {
  if (!item) return 'Awareness';
  if (item.stage && JOURNEY_STAGES.includes(item.stage)) {
    return item.stage;
  }

  // Automated celebration/greeting emails represent relationship touchpoints in Awareness, not commercial stage transitions
  if (isAutomatedGreeting(item)) {
    return 'Awareness';
  }

  const oppText = Array.isArray(item.businessOpportunities) ? item.businessOpportunities.join(' ') : '';
  const commitText = Array.isArray(item.commitments) ? item.commitments.join(' ') : '';
  const followUpText = Array.isArray(item.followUpSignals) ? item.followUpSignals.join(' ') : '';

  const text = (
    (item.title || '') + ' ' +
    (item.details || '') + ' ' +
    (item.subject || '') + ' ' +
    (item.channel || '') + ' ' +
    (item.notes || '') + ' ' +
    (item.description || '') + ' ' +
    (item.completionNote || '') + ' ' +
    stripHtmlText(item.messageText || '') + ' ' +
    (item.task || '') + ' ' +
    (item.taskHeader || '') + ' ' +
    (item.rationale || '') + ' ' +
    oppText + ' ' +
    commitText + ' ' +
    followUpText
  ).toLowerCase();

  if (
    text.includes('advocacy') ||
    text.includes('referral') ||
    text.includes('advocate') ||
    text.includes('case study') ||
    text.includes('testimonial') ||
    text.includes('reference call')
  ) {
    return 'Advocacy';
  }
  if (
    text.includes('retention') ||
    text.includes('renew') ||
    text.includes('qbr') ||
    text.includes('expansion') ||
    text.includes('upsell') ||
    text.includes('onboarding') ||
    text.includes('kickoff') ||
    text.includes('kick-off') ||
    text.includes('sla ') ||
    text.includes('delivery review')
  ) {
    return 'Retention';
  }
  if (
    text.includes('decision') ||
    text.includes('contract') ||
    text.includes('proposal') ||
    text.includes('pricing') ||
    text.includes('quote') ||
    text.includes('commercial') ||
    text.includes('procurement') ||
    text.includes('legal') ||
    text.includes('po ') ||
    text.includes('negotiation') ||
    text.includes('closing')
  ) {
    return 'Decision';
  }
  if (
    text.includes('consideration') ||
    text.includes('workshop') ||
    text.includes('requirement') ||
    text.includes('technical') ||
    text.includes('poc') ||
    text.includes('evaluation') ||
    text.includes('demo') ||
    text.includes('deep dive') ||
    text.includes('architecture') ||
    text.includes('discovery call')
  ) {
    return 'Consideration';
  }
  return 'Awareness';
}

/**
 * Evaluates confirmed database interactions / completed tasks to automatically
 * advance the Customer Journey one stage at a time ("from one to one").
 * Respects DB-stored manual overrides: only activities newer than manualOverrideAt trigger auto-advance.
 */
export function getAutoProgressionStep(currentStage, activities = [], manualOverrideAt = null) {
  const currentIndex = JOURNEY_STAGES.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex >= JOURNEY_STAGES.length - 1) return null;
  if (!Array.isArray(activities) || activities.length === 0) return null;

  const overrideMs = manualOverrideAt ? new Date(manualOverrideAt).getTime() : 0;

  const confirmedActivities = activities.filter(item => {
    if (!item || isAutomatedGreeting(item)) return false;
    if (item.source === 'System Activity' || item.source === 'System') return false;
    if (item.itemType === 'task') {
      const st = (item.status || '').toLowerCase();
      if (st !== 'completed' && st !== 'complete') return false;
    }

    if (overrideMs > 0) {
      const rawTime = item.completedAt || item.updatedAt || item.timestamp || item.createdAt || item.date;
      const itemMs = rawTime ? new Date(rawTime).getTime() : 0;
      if (!itemMs || itemMs <= overrideMs) return false;
    }
    return true;
  });

  if (confirmedActivities.length === 0) return null;

  let highestDetectedIndex = -1;
  confirmedActivities.forEach(item => {
    const detected = detectActivityStage(item);
    const idx = JOURNEY_STAGES.indexOf(detected);
    if (idx > highestDetectedIndex) {
      highestDetectedIndex = idx;
    }
  });

  if (highestDetectedIndex <= currentIndex) return null;

  // Step-by-step ("one-to-one") progression to the next stage
  const nextStage = JOURNEY_STAGES[currentIndex + 1];
  const matching = confirmedActivities.filter(
    i => JOURNEY_STAGES.indexOf(detectActivityStage(i)) > currentIndex
  );
  const sorted = [...matching].sort(
    (a, b) => new Date(b.timestamp || b.date || 0) - new Date(a.timestamp || a.date || 0)
  );
  const titles = Array.from(new Set(sorted.slice(0, 2).map(getActivityTitle).filter(Boolean)));
  const signalSummary = titles.length > 0 ? `"${titles.join('", "')}"` : 'recorded customer interactions';

  const reason = `Automatically advanced from ${currentStage} to ${nextStage} based on database interaction ${signalSummary}.`;

  return {
    fromStage: currentStage,
    nextStage,
    reason
  };
}

/**
 * Computes next-stage suggestions strictly from database-stored tasks,
 * Next Best Actions (NBAs), and recorded interactions. Returns null when no DB signals exist.
 */
export function getStageSuggestion(currentStage, interactions = [], nbas = []) {
  const currentIndex = JOURNEY_STAGES.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex >= JOURNEY_STAGES.length - 1) return null;

  const safeActivities = (Array.isArray(interactions) ? interactions : []).filter(
    i => i && !isAutomatedGreeting(i) && i.source !== 'System Activity' && i.source !== 'System'
  );
  const safeNbas = Array.isArray(nbas) ? nbas : [];

  const allCandidates = [
    ...safeActivities,
    ...safeNbas.map(n => ({
      title: n.action || n.title,
      details: n.rationale || n.description || '',
      itemType: 'nba'
    }))
  ];

  if (allCandidates.length === 0) return null;

  const nextStage = JOURNEY_STAGES[currentIndex + 1];

  const higherStageItems = allCandidates.filter(item => {
    const detected = detectActivityStage(item);
    return JOURNEY_STAGES.indexOf(detected) > currentIndex;
  });

  if (higherStageItems.length === 0) return null;

  const sorted = [...higherStageItems].sort(
    (a, b) => new Date(b.timestamp || b.date || b.dueDate || 0) - new Date(a.timestamp || a.date || b.dueDate || 0)
  );
  const titles = Array.from(new Set(sorted.slice(0, 2).map(getActivityTitle).filter(Boolean)));
  const activityLabel = titles.length > 0 ? `recorded database activities "${titles.join('", "')}"` : 'recorded database signals';

  return {
    suggested: nextStage,
    reason: `Based on ${activityLabel}, the account shows readiness for ${nextStage} (${STAGE_NEXT_FOCUS[nextStage]}).`
  };
}
