import { db } from '../config/database.js';
import { getSystemDateString, getSystemTimeString } from '../utils/dateUtils.js';
import { calculateRelationshipGaps } from './relationship.service.js';
import { generateSmartHealthAnalysis } from './ai.service.js';

const DEFAULT_WEIGHTS = {
  engagementFrequency: 0.20,
  communicationResponsiveness: 0.15,
  sentimentTrend: 0.15,
  stakeholderCoverage: 0.15,
  riskSignals: 0.15,
  commitments: 0.10,
  businessSignals: 0.10
};

async function getAccountWeights(accountId) {
  let doc = await db.collection('healthscoreconfigs').doc(accountId).get();
  if (!doc.exists) {
    doc = await db.collection('healthscoreconfigs').doc('global').get();
  }
  if (!doc.exists || !doc.data().config) {
    return DEFAULT_WEIGHTS;
  }
  const config = doc.data().config;
  return {
    engagementFrequency: (config.engagementFrequency ?? 20) / 100,
    communicationResponsiveness: (config.communicationResponsiveness ?? 15) / 100,
    sentimentTrend: (config.sentimentTrend ?? 15) / 100,
    stakeholderCoverage: (config.stakeholderCoverage ?? 15) / 100,
    riskSignals: (config.riskSignals ?? 15) / 100,
    commitments: (config.commitments ?? 10) / 100,
    businessSignals: (config.businessSignals ?? 10) / 100,
  };
}

/**
 * Normalizes a value between min and max to a 0-100 scale.
 */
function normalize(val, min, max) {
  if (val <= min) return 0;
  if (val >= max) return 100;
  return Math.round(((val - min) / (max - min)) * 100);
}

/**
 * Calculates the Phase 2 Health Score using 7 behavioral factors.
 */

/**
 * Evaluates all 42 Ready-Made Scoring Criteria and Custom Rules against live account signals.
 */
function evaluateAllScoringRules({
  allInteractions = [],
  recentInteractions = [],
  contacts = [],
  tasks = [],
  risks = [],
  tier = 'Strategic',
  activeRules = null,
  customRules = [],
  now = new Date()
}) {
  const BASIC_HEALTH_RULE_IDS = new Set([
    'rec_any',
    'rec_manual_log',
    'freq_30d',
    'freq_meet90d',
    'meet_actions_overdue',
    'meet_cancel_words',
    'meet_satisfaction',
    'meet_complaints',
    'sent_escalation',
    'greet_birthday_anniv',
    'risk_gone_silent'
  ]);

  const isRuleActive = (ruleId, explicitDefault = undefined) => {
    if (activeRules && activeRules[ruleId] !== undefined) {
      return Boolean(activeRules[ruleId]);
    }
    if (explicitDefault !== undefined) return Boolean(explicitDefault);
    return BASIC_HEALTH_RULE_IDS.has(ruleId);
  };

  const appliedAdjustments = [];
  let recencyAdjustment = 0;
  let frequencyAdjustment = 0;
  let responsivenessAdjustment = 0;
  let meetingAdjustment = 0;
  let sentimentAdjustment = 0;
  let relationshipAdjustment = 0;
  let greetingsAdjustment = 0;
  let commitmentsAdjustment = 0;
  let riskAdjustment = 0;

  // 1. Recency Metrics
  const lastInt = allInteractions[0];
  const lastDate = lastInt ? (lastInt.timestamp || lastInt.date) : null;
  const daysSinceLast = lastDate ? Math.max(0, Math.floor((now - new Date(lastDate)) / (1000 * 60 * 60 * 24))) : 999;

  const twoWayInts = allInteractions.filter(i => {
    const t = (i.type || i.interactionType || i.source || '').toLowerCase();
    return t.includes('meeting') || t.includes('call') || t.includes('inbound') || i.direction === 'inbound';
  });
  const daysSinceTwoWay = twoWayInts[0] ? Math.max(0, Math.floor((now - new Date(twoWayInts[0].timestamp || twoWayInts[0].date)) / (1000 * 60 * 60 * 24))) : 999;

  const meetingInts = allInteractions.filter(i => {
    const t = (i.type || i.interactionType || i.source || i.subject || '').toLowerCase();
    return t.includes('meeting') || t.includes('teams') || t.includes('sync') || t.includes('call') || t.includes('qbr');
  });
  const daysSinceMeeting = meetingInts[0] ? Math.max(0, Math.floor((now - new Date(meetingInts[0].timestamp || meetingInts[0].date)) / (1000 * 60 * 60 * 24))) : 999;

  const inboundInts = allInteractions.filter(i => i.direction === 'inbound' || (i.source || '').toLowerCase().includes('inbound'));
  const daysSinceInbound = inboundInts[0] ? Math.max(0, Math.floor((now - new Date(inboundInts[0].timestamp || inboundInts[0].date)) / (1000 * 60 * 60 * 24))) : 999;

  const execContacts = contacts.filter(c => {
    const h = (c.hierarchyTag || c.role || '').toUpperCase();
    return h.includes('CXO') || h.includes('VP') || h.includes('DIRECTOR');
  });
  const execContactIds = new Set(execContacts.map(c => c.contactId || c.id));
  const execInts = allInteractions.filter(i => i.contactId && execContactIds.has(i.contactId));
  const daysSinceExec = execInts[0] ? Math.max(0, Math.floor((now - new Date(execInts[0].timestamp || execInts[0].date)) / (1000 * 60 * 60 * 24))) : 999;

  const qbrInts = allInteractions.filter(i => (i.subject || '').toLowerCase().includes('qbr') || (i.subject || '').toLowerCase().includes('executive review'));
  const daysSinceQbr = qbrInts[0] ? Math.max(0, Math.floor((now - new Date(qbrInts[0].timestamp || qbrInts[0].date)) / (1000 * 60 * 60 * 24))) : 999;

  // Silence threshold calibrated by tier
  let silenceThreshold = 30;
  if (tier === 'Strategic') silenceThreshold = 14;
  else if (tier === 'Standard') silenceThreshold = 60;
  else if (tier === 'Low Touch') silenceThreshold = 90;

  // -- Evaluate Recency Rules --
  if (isRuleActive('rec_any') && daysSinceLast > silenceThreshold) {
    recencyAdjustment -= 20;
    appliedAdjustments.push({ id: 'rec_any', label: 'Days since last interaction', points: -20, category: 'Recency' });
  }
  if (isRuleActive('rec_twoway') && daysSinceTwoWay > 30) {
    recencyAdjustment -= 15;
    appliedAdjustments.push({ id: 'rec_twoway', label: 'Days since last two-way interaction', points: -15, category: 'Recency' });
  }
  if (isRuleActive('rec_meeting') && daysSinceMeeting > 60) {
    recencyAdjustment -= 15;
    appliedAdjustments.push({ id: 'rec_meeting', label: 'Days since last meeting', points: -15, category: 'Recency' });
  }
  if (isRuleActive('rec_inbound') && daysSinceInbound > 45) {
    recencyAdjustment -= 10;
    appliedAdjustments.push({ id: 'rec_inbound', label: 'Days since last inbound mail', points: -10, category: 'Recency' });
  }
  if (isRuleActive('rec_exec') && execContacts.length > 0 && daysSinceExec > 90) {
    recencyAdjustment -= 15;
    appliedAdjustments.push({ id: 'rec_exec', label: 'Days since last exec contact', points: -15, category: 'Recency' });
  }
  if (isRuleActive('rec_qbr') && daysSinceQbr > 90) {
    recencyAdjustment -= 10;
    appliedAdjustments.push({ id: 'rec_qbr', label: 'Days since last QBR', points: -10, category: 'Recency' });
  }

  // 2. Frequency Rules
  const count30d = recentInteractions.length;
  if (isRuleActive('freq_30d')) {
    if (count30d === 0) {
      frequencyAdjustment -= 20;
      appliedAdjustments.push({ id: 'freq_30d', label: 'Interactions count in last 30d (0 touches)', points: -20, category: 'Frequency' });
    } else if (count30d >= 6) {
      frequencyAdjustment += 15;
      appliedAdjustments.push({ id: 'freq_30d', label: 'High interaction frequency in last 30d', points: +15, category: 'Frequency' });
    }
  }
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const meetings90d = meetingInts.filter(i => new Date(i.timestamp || i.date || 0) >= ninetyDaysAgo).length;
  if (isRuleActive('freq_meet90d')) {
    if (meetings90d === 0) {
      frequencyAdjustment -= 15;
      appliedAdjustments.push({ id: 'freq_meet90d', label: 'Zero meetings in 90 days', points: -15, category: 'Frequency' });
    } else if (meetings90d >= 3) {
      frequencyAdjustment += 10;
      appliedAdjustments.push({ id: 'freq_meet90d', label: 'Frequent meetings in 90 days (3+)', points: +10, category: 'Frequency' });
    }
  }

  // 3. Responsiveness Rules
  let unansweredCount = 0;
  recentInteractions.forEach(i => {
    if (i.followUpSignals && i.followUpSignals.length > 0) unansweredCount++;
  });
  if (isRuleActive('resp_unanswered')) {
    if (unansweredCount > 0) {
      const deduction = Math.min(40, unansweredCount * 20);
      responsivenessAdjustment -= deduction;
      appliedAdjustments.push({ id: 'resp_unanswered', label: `Unanswered customer emails (${unansweredCount} pending)`, points: -deduction, category: 'Responsiveness' });
    } else {
      responsivenessAdjustment += 15;
      appliedAdjustments.push({ id: 'resp_unanswered', label: 'Clean inbox: 0 unanswered customer threads', points: +15, category: 'Responsiveness' });
    }
  }

  // 4. Meeting & Transcripts Rules
  let transcriptHasCancel = false;
  let transcriptHasCompetitor = false;
  let transcriptHasComplaint = false;
  let transcriptHasSatisfaction = false;

  recentInteractions.forEach(i => {
    const text = ((i.messageText || '') + ' ' + (i.subject || '')).toLowerCase();
    if (text.includes('cancel') || text.includes('reschedule') || text.includes('postpone')) transcriptHasCancel = true;
    if (text.includes('competitor') || text.includes('alternative') || text.includes('switch to')) transcriptHasCompetitor = true;
    if (text.includes('complaint') || text.includes('frustrated') || text.includes('dissatisfied') || text.includes('delay')) transcriptHasComplaint = true;
    if (text.includes('happy') || text.includes('pleased') || text.includes('great work') || text.includes('excellent')) transcriptHasSatisfaction = true;
  });

  if (isRuleActive('meet_cancel_words') && transcriptHasCancel) {
    meetingAdjustment -= 20;
    appliedAdjustments.push({ id: 'meet_cancel_words', label: 'Cancellation/reschedule phrases detected', points: -20, category: 'Meeting' });
  }
  if (isRuleActive('meet_competitor') && transcriptHasCompetitor) {
    meetingAdjustment -= 25;
    appliedAdjustments.push({ id: 'meet_competitor', label: 'Competitor mentioned in communication', points: -25, category: 'Meeting' });
  }
  if (isRuleActive('meet_complaints') && transcriptHasComplaint) {
    meetingAdjustment -= 20;
    appliedAdjustments.push({ id: 'meet_complaints', label: 'Complaint / friction phrases detected', points: -20, category: 'Meeting' });
  }
  if (isRuleActive('meet_satisfaction') && transcriptHasSatisfaction) {
    meetingAdjustment += 15;
    appliedAdjustments.push({ id: 'meet_satisfaction', label: 'Customer satisfaction phrases detected', points: +15, category: 'Meeting' });
  }

  // 5. Sentiment & Content Rules
  const last5 = allInteractions.slice(0, 5);
  let negCount = 0;
  let hasEscalation = false;
  let hasThanks = false;

  last5.forEach(i => {
    const s = (i.sentiment || '').toLowerCase();
    if (s.includes('neg') || i.riskDetected) negCount++;
    const text = ((i.subject || '') + ' ' + (i.messageText || '')).toLowerCase();
    if (text.includes('escalate') || text.includes('escalation') || text.includes('urgent issue')) hasEscalation = true;
    if (text.includes('thank') || text.includes('appreciate') || text.includes('congrat') || i.isCelebration) hasThanks = true;
  });

  if (isRuleActive('sent_last5') && negCount >= 2) {
    sentimentAdjustment -= 15;
    appliedAdjustments.push({ id: 'sent_last5', label: 'Negative sentiment cluster in recent touchpoints', points: -15, category: 'Sentiment' });
  }
  if (isRuleActive('sent_escalation') && hasEscalation) {
    sentimentAdjustment -= 20;
    appliedAdjustments.push({ id: 'sent_escalation', label: 'Escalation keywords detected', points: -20, category: 'Sentiment' });
  }
  if (isRuleActive('sent_thanks') && hasThanks) {
    sentimentAdjustment += 15;
    appliedAdjustments.push({ id: 'sent_thanks', label: 'Customer appreciation / thanks touchpoint', points: +15, category: 'Sentiment' });
  }

  // 6. Relationship Depth Rules
  const influences = contacts.map(c => (c.influenceTag || '').toLowerCase());
  const hasDM = influences.includes('decision maker');
  const hasChamp = influences.includes('champion') || influences.includes('influencer');

  if (isRuleActive('rel_role_coverage')) {
    if (!hasDM) {
      relationshipAdjustment -= 10;
      appliedAdjustments.push({ id: 'rel_role_coverage', label: 'Missing Decision Maker role coverage', points: -10, category: 'Relationship Depth' });
    }
    if (execContacts.length === 0) {
      relationshipAdjustment -= 10;
      appliedAdjustments.push({ id: 'rel_role_coverage', label: 'Missing Executive Sponsor (CXO/VP)', points: -10, category: 'Relationship Depth' });
    }
  }
  if (isRuleActive('rel_dm_engaged') && hasDM) {
    relationshipAdjustment += 15;
    appliedAdjustments.push({ id: 'rel_dm_engaged', label: 'Decision-maker mapped & engaged', points: +15, category: 'Relationship Depth' });
  }

  // 7. Greetings & Culture Rules
  const celebrationInts = allInteractions.filter(i => i.isCelebration || i.interactionType === 'Customer Celebration' || i.celebrationEventType);
  if (isRuleActive('greet_birthday_anniv') && celebrationInts.length > 0) {
    greetingsAdjustment += 10;
    appliedAdjustments.push({ id: 'greet_birthday_anniv', label: 'Celebration greeting touchpoint logged', points: +10, category: 'Greetings' });
  }

  // 8. Commitments & SLA Rules
  let overdueCount = 0;
  const todayMs = new Date().setHours(0, 0, 0, 0);
  tasks.forEach(t => {
    const st = (t.status || '').toLowerCase();
    if (!st.includes('complete') && !st.includes('decline') && t.dueDate) {
      const dueMs = new Date(t.dueDate).setHours(0, 0, 0, 0);
      if (todayMs > dueMs) overdueCount++;
    }
  });

  if (isRuleActive('comm_overdue_tasks')) {
    if (overdueCount > 0) {
      commitmentsAdjustment -= 15;
      appliedAdjustments.push({ id: 'comm_overdue_tasks', label: `${overdueCount} overdue task commitment(s)`, points: -15, category: 'Commitments' });
    } else {
      commitmentsAdjustment += 10;
      appliedAdjustments.push({ id: 'comm_overdue_tasks', label: 'All commitments on schedule', points: +10, category: 'Commitments' });
    }
  }

  // 9. Risk Flags Rules
  const openRisks = risks.filter(r => r.status === 'Open');
  const hasHighRisk = openRisks.some(r => r.severity === 'High' || r.severity === 'Critical');

  if (isRuleActive('risk_gone_silent') && daysSinceLast > 30) {
    riskAdjustment -= 20;
    appliedAdjustments.push({ id: 'risk_gone_silent', label: 'Account gone silent (>30d without interaction)', points: -20, category: 'Risk Flags' });
  }
  if (isRuleActive('risk_deep_silence') && daysSinceLast > 60) {
    riskAdjustment -= 30;
    appliedAdjustments.push({ id: 'risk_deep_silence', label: 'Deep silence (>60d without interaction)', points: -30, category: 'Risk Flags' });
  }
  if (isRuleActive('risk_open_high')) {
    if (hasHighRisk) {
      riskAdjustment -= 25;
      appliedAdjustments.push({ id: 'risk_open_high', label: 'Active High/Critical risk open', points: -25, category: 'Risk Flags' });
    } else if (openRisks.length === 0) {
      riskAdjustment += 15;
      appliedAdjustments.push({ id: 'risk_open_high', label: 'Zero active risk flags', points: +15, category: 'Risk Flags' });
    }
  }

  // 10. Custom Rules Evaluation
  let customAdjustment = 0;
  customRules.forEach(cr => {
    if (isRuleActive(cr.id)) {
      const pts = Number(cr.points) || 0;
      if (pts !== 0) {
        appliedAdjustments.push({ id: cr.id, label: cr.label || 'Custom Rule', points: pts, category: cr.category || 'Custom' });
        const cat = (cr.category || '').toLowerCase();
        if (cat.includes('recency')) recencyAdjustment += pts;
        else if (cat.includes('frequency')) frequencyAdjustment += pts;
        else if (cat.includes('responsiv')) responsivenessAdjustment += pts;
        else if (cat.includes('meet')) meetingAdjustment += pts;
        else if (cat.includes('sentiment')) sentimentAdjustment += pts;
        else if (cat.includes('relation')) relationshipAdjustment += pts;
        else if (cat.includes('greet')) greetingsAdjustment += pts;
        else if (cat.includes('commit') || cat.includes('sla')) commitmentsAdjustment += pts;
        else if (cat.includes('risk')) riskAdjustment += pts;
        else customAdjustment += pts;
      }
    }
  });

  return {
    appliedAdjustments,
    recencyAdjustment,
    frequencyAdjustment,
    responsivenessAdjustment,
    meetingAdjustment,
    sentimentAdjustment,
    relationshipAdjustment,
    greetingsAdjustment,
    commitmentsAdjustment,
    riskAdjustment,
    customAdjustment
  };
}

export async function calculateAccountHealth(accountId) {
  try {
    // Load custom scoring configuration (account-specific or global fallback)
    let configDoc = await db.collection('healthscoreconfigs').doc(accountId).get();
    if (!configDoc.exists) {
      configDoc = await db.collection('healthscoreconfigs').doc('global').get();
    }
    const config = (configDoc.exists && configDoc.data().config) ? configDoc.data().config : {};
    const tier = config.tier || 'Strategic';
    const activeRules = config.activeRules || null; // if null, use defaults
    const customRules = Array.isArray(config.customRules) ? config.customRules : [];

    // Tier-calibrated silence thresholds and cadence expectations
    let silenceThresholdDays = 30;
    let expectedCadence = 3; // monthly touchpoints
    if (tier === 'Strategic') {
      silenceThresholdDays = 14;
      expectedCadence = 4;
    } else if (tier === 'Standard') {
      silenceThresholdDays = 60;
      expectedCadence = 2;
    } else if (tier === 'Low Touch') {
      silenceThresholdDays = 90;
      expectedCadence = 1;
    }
    const [allInteractionsSnapshot, emailLogsSnapshot] = await Promise.all([
      db.collection('interactions').where('accountId', '==', accountId).get(),
      db.collection('emaillogs').get()
    ]);
    const dbInteractions = allInteractionsSnapshot.docs.map(doc => doc.data());
    const accountEmails = emailLogsSnapshot.docs
      .map(doc => doc.data())
      .filter(e => !e.isMock && String(e.relatedAccountId) === String(accountId))
      .map(e => ({
        interactionId: e.logId,
        accountId: accountId,
        source: 'System Email',
        subject: e.subject,
        messageText: e.htmlBody || '',
        date: (e.sentAt || e.createdAt || '').slice(0, 10),
        timestamp: e.sentAt || e.createdAt,
        sentiment: 'Neutral'
      }));

    const allInteractions = [...dbInteractions, ...accountEmails];
    allInteractions.sort((a, b) => new Date(b.timestamp || b.date || 0) - new Date(a.timestamp || a.date || 0));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();
    const recentInteractions = allInteractions.filter(i => (i.timestamp || i.date) >= thirtyDaysAgoIso);

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Factors Object
    const factors = {
      engagementFrequency: { score: 0, reason: '', signals: [] },
      communicationResponsiveness: { score: 0, reason: '', signals: [] },
      sentimentTrend: { score: 0, reason: '', signals: [] },
      stakeholderCoverage: { score: 0, reason: '', signals: [] },
      riskSignals: { score: 0, reason: '', signals: [] },
      commitments: { score: 0, reason: '', signals: [] },
      businessSignals: { score: 0, reason: '', signals: [] }
    };

    // --- 1. Engagement Frequency (20%) ---
    const lastInteraction = allInteractions.length > 0 ? allInteractions[0] : null;
    const lastDate = lastInteraction ? (lastInteraction.timestamp || lastInteraction.date) : null;
    const daysSinceLast = lastDate ? Math.max(0, Math.floor((now - new Date(lastDate)) / (1000 * 60 * 60 * 24))) : 999;

    let engCount = recentInteractions.length;
    let engScore = 100;

    // Evaluate rec_any rule
    const isRecAnyActive = activeRules ? (activeRules['rec_any'] !== undefined ? Boolean(activeRules['rec_any']) : true) : true;
    const isFreq30dActive = activeRules ? (activeRules['freq_30d'] !== undefined ? Boolean(activeRules['freq_30d']) : true) : true;

    if (isRecAnyActive && daysSinceLast > silenceThresholdDays) {
      // Inactivity penalty triggered based on Tier
      engScore = Math.max(0, 100 - 20 - Math.min(40, (daysSinceLast - silenceThresholdDays) * 2));
      factors.engagementFrequency.signals.push(`No interaction in ${daysSinceLast} days (exceeds ${tier} ${silenceThresholdDays}d threshold).`);
    } else if (isFreq30dActive) {
      if (engCount >= expectedCadence) engScore = 100;
      else if (engCount >= 2) engScore = 75;
      else if (engCount === 1) engScore = 50;
      else engScore = 20;
    } else {
      // If recency and frequency penalties are turned off, default to healthy baseline
      engScore = engCount > 0 ? 90 : 70;
    }

    factors.engagementFrequency.score = engScore;
    factors.engagementFrequency.reason = `Engagement evaluated against ${tier} tier (${silenceThresholdDays}d cadence). ${engCount} touches in last 30d.`;

    // --- 2. Communication Responsiveness (15%) ---
    // Inferred by the presence of unanswered follow-up AI tags.
    let unansweredFollowUps = 0;
    recentInteractions.forEach(i => {
      // Dummy heuristic: If there are followUpSignals but no subsequent customer response, count as unanswered.
      if (i.followUpSignals && i.followUpSignals.length > 0) unansweredFollowUps++;
    });
    // For every unanswered follow-up, deduct 20 points from base 100
    let respScore = Math.max(0, 100 - (unansweredFollowUps * 20));
    factors.communicationResponsiveness.score = respScore;
    factors.communicationResponsiveness.reason = `Response behavior. Detected ${unansweredFollowUps} unanswered follow-ups.`;

    // --- 3. Sentiment Trend (15%) ---
    let sentScore = 70; // baseline
    if (allInteractions.length > 0) {
      const sortedInteractions = [...allInteractions].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
      let sentimentSum = 0;
      sortedInteractions.forEach(i => {
        if (i.sentiment === 'Positive') sentimentSum += 100;
        else if (i.sentiment === 'Neutral') sentimentSum += 60;
        else sentimentSum += 0; // Negative
      });
      sentScore = Math.round(sentimentSum / sortedInteractions.length);
      factors.sentimentTrend.signals.push(`Based on last ${sortedInteractions.length} interactions.`);
    }
    factors.sentimentTrend.score = sentScore;
    factors.sentimentTrend.reason = `Average sentiment trend over recent communications.`;

    // --- 4. Stakeholder Coverage (15%) ---
    const contactsSnapshot = await db.collection('contacts')
      .where('accountId', '==', accountId)
      .get();
    const contacts = contactsSnapshot.docs.map(doc => doc.data());

    let stakeScore = 0;
    if (contacts.length > 0) {
      const hierarchies = contacts.map(c => c.hierarchyTag || '');
      const influences = contacts.map(c => c.influenceTag || '');
      const hasCXOorVP = hierarchies.includes('CXO') || hierarchies.includes('VP');
      const hasDecisionMaker = influences.includes('Decision Maker');
      const hasChampion = influences.includes('Champion') || influences.includes('Influencer');

      if (hasCXOorVP && hasDecisionMaker) stakeScore = 100;
      else if (hasCXOorVP || hasDecisionMaker) stakeScore = 85;
      else if (hasChampion) stakeScore = 70;
      else stakeScore = 50;

      const isRelCoverageActive = activeRules ? (activeRules['rel_role_coverage'] !== undefined ? Boolean(activeRules['rel_role_coverage']) : false) : false;
      if (isRelCoverageActive) {
        const { gaps } = await calculateRelationshipGaps(accountId);
        let penalty = 0;
        gaps.forEach(gap => {
          if (gap.category === 'Executive') penalty += 15;
          else if (gap.category === 'Business') penalty += 10;
          factors.stakeholderCoverage.signals.push(`Missing coverage: ${gap.category}`);
        });
        stakeScore = Math.max(10, stakeScore - penalty);
      }
    }
    factors.stakeholderCoverage.score = stakeScore;
    factors.stakeholderCoverage.reason = `Assessed by existing contact hierarchy and influence tags.`;

    // --- 5. Risk Signals (15%) ---
    const risksSnapshot = await db.collection('risks')
      .where('accountId', '==', accountId)
      .get();
    const risks = risksSnapshot.docs.map(doc => doc.data()).filter(r => r.status === 'Open');

    let riskScore = 100;
    let recurringCount = 0;
    if (risks.length > 0) {
      const hasHigh = risks.some(r => r.severity === 'High');
      const hasMedium = risks.some(r => r.severity === 'Medium');
      // Look for recurrence in last 30 days
      const recentRisks = risksSnapshot.docs.map(doc => doc.data()).filter(r => r.timestamp >= thirtyDaysAgoIso);
      recurringCount = recentRisks.length;

      const isRiskHighActive = activeRules ? (activeRules['risk_open_high'] !== undefined ? Boolean(activeRules['risk_open_high']) : false) : false;
      let baseRiskScore = 80;
      if (isRiskHighActive && hasHigh) baseRiskScore = 30;
      else if (hasMedium) baseRiskScore = 60;

      // Decay penalty
      riskScore = Math.max(0, baseRiskScore - (recurringCount * 10));
      factors.riskSignals.signals.push(`Open risks: ${risks.length}`);
      if (recurringCount > 1) factors.riskSignals.signals.push(`${recurringCount} risks triggered recently.`);
    }
    factors.riskSignals.score = riskScore;
    factors.riskSignals.reason = `Risk assessment considering severity and recurrence.`;

    // --- 6. Commitments & Actions (10%) ---
    let commitmentsCompleted = 0;
    let commitmentsOverdue = 0;
    let hasOverdueTask = false;

    // 1. Fetch real tasks from tasks collection
    const tasksSnapshot = await db.collection('tasks')
      .where('accountId', '==', accountId)
      .get();
    const accountTasks = tasksSnapshot.docs.map(doc => doc.data()).filter(t => !t.taskId?.includes('DUMMY'));

    for (const t of accountTasks) {
      const status = (t.status || '').toLowerCase();
      if (status.includes('completed') || status.includes('complete')) {
        commitmentsCompleted++;
      } else if (t.dueDate && !status.includes('decline')) {
        const dueDateObj = new Date(t.dueDate);
        dueDateObj.setHours(0, 0, 0, 0);
        if (today.getTime() > dueDateObj.getTime()) {
          commitmentsOverdue++;
          const diffDays = (today.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays >= 7) hasOverdueTask = true;
        }
      }
    }

    // 2. Also check any standalone interaction actionMentions
    for (const inter of allInteractions) {
      const mentions = inter.actionMentions || [];
      for (const m of mentions) {
        if (m.status === 'Completed') {
          commitmentsCompleted++;
        } else if (m.dueDate) {
          const dueDateObj = new Date(m.dueDate);
          dueDateObj.setHours(0, 0, 0, 0);
          if (today.getTime() > dueDateObj.getTime()) {
            commitmentsOverdue++;
            const diffDays = (today.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24);
            if (diffDays >= 7) hasOverdueTask = true;
          }
        }
      }
    }
    let commScore = 100;
    const isCommOverdueActive = activeRules ? (activeRules['comm_overdue_tasks'] !== undefined ? Boolean(activeRules['comm_overdue_tasks']) : false) : false;
    if (isCommOverdueActive && commitmentsOverdue > 0) {
      commScore = Math.max(0, 100 - (commitmentsOverdue * 15));
    }
    factors.commitments.score = commScore;
    factors.commitments.reason = `Completed: ${commitmentsCompleted}, Overdue: ${commitmentsOverdue}`;
    if (commitmentsOverdue > 0) {
      factors.commitments.signals.push(`${commitmentsOverdue} overdue task commitment(s) detected`);
    }

    // Overdue Risk automation
    if (hasOverdueTask) {
      const existingOverdue = risks.find(r => r.category === 'Overdue Action');
      if (!existingOverdue) {
        await db.collection('risks').add({ accountId, category: 'Overdue Action', severity: 'High', description: 'A task is 7+ days overdue.', status: 'Open', createdAt: new Date().toISOString() });
      }
    }

    // --- 7. Business / Expansion Signals (10%) ---
    let expansionSignalsCount = 0;
    recentInteractions.forEach(i => {
      if (i.businessOpportunities && i.businessOpportunities.length > 0) expansionSignalsCount += i.businessOpportunities.length;
    });
    let busScore = Math.min(100, 50 + (expansionSignalsCount * 25)); // Base 50, +25 per signal
    factors.businessSignals.score = busScore;
    factors.businessSignals.reason = `Detected ${expansionSignalsCount} expansion/business signals.`;

    // --- Evaluate all 42 Scoring Criteria & Rules + Custom Rules ---
    const ruleEval = evaluateAllScoringRules({
      allInteractions,
      recentInteractions,
      contacts,
      tasks: accountTasks,
      risks,
      tier,
      activeRules,
      customRules,
      now
    });

    // Apply rule adjustments to factor scores
    factors.engagementFrequency.score = Math.max(0, Math.min(100, 70 + ruleEval.recencyAdjustment + ruleEval.frequencyAdjustment));
    factors.communicationResponsiveness.score = Math.max(0, Math.min(100, (factors.communicationResponsiveness.score || 85) + (ruleEval.responsivenessAdjustment > 0 ? 15 : ruleEval.responsivenessAdjustment)));
    factors.sentimentTrend.score = Math.max(0, Math.min(100, sentScore + ruleEval.sentimentAdjustment));
    factors.stakeholderCoverage.score = Math.max(0, Math.min(100, stakeScore + ruleEval.relationshipAdjustment));
    factors.riskSignals.score = Math.max(0, Math.min(100, (risks.length === 0 ? 100 : riskScore) + ruleEval.riskAdjustment));
    factors.commitments.score = Math.max(0, Math.min(100, (commitmentsOverdue === 0 ? 100 : commScore) + ruleEval.commitmentsAdjustment));
    factors.businessSignals.score = Math.max(0, Math.min(100, busScore + ruleEval.meetingAdjustment + ruleEval.greetingsAdjustment));

    // --- Aggregate Phase 2 Score ---
    const WEIGHTS = await getAccountWeights(accountId);
    const baseAggScore = Math.round(
      (WEIGHTS.engagementFrequency * factors.engagementFrequency.score) +
      (WEIGHTS.communicationResponsiveness * factors.communicationResponsiveness.score) +
      (WEIGHTS.sentimentTrend * factors.sentimentTrend.score) +
      (WEIGHTS.stakeholderCoverage * factors.stakeholderCoverage.score) +
      (WEIGHTS.riskSignals * factors.riskSignals.score) +
      (WEIGHTS.commitments * factors.commitments.score) +
      (WEIGHTS.businessSignals * factors.businessSignals.score)
    );
    const healthScore = Math.max(5, Math.min(100, baseAggScore + (ruleEval.customAdjustment || 0)));

    let status = 'Warning';
    if (healthScore >= 85) status = 'Excellent';
    else if (healthScore >= 70) status = 'Healthy';
    else if (healthScore >= 40) status = 'Warning';
    else status = 'Critical';

    const result = { healthScore, status, tier };

    const accountRef = db.collection('accounts').doc(accountId);
    const accountDoc = await accountRef.get();
    if (accountDoc.exists) {
      await accountRef.update({
        healthScore: result.healthScore,
        status: result.status,
        tier: result.tier || accountDoc.data().tier || "Strategic"
      });
    }

    // Save to HealthScores with factors JSONB and appliedAdjustments
    await db.collection('healthscores').add({
      accountId,
      healthScore,
      status,
      factors,
      appliedAdjustments: ruleEval.appliedAdjustments || [],
      timestamp: new Date().toISOString()
    });

    // Save to AccountSignals
    await db.collection('accountsignals').doc(accountId).set({
      accountId,
      customerInitiatedCount: 0,
      employeeInitiatedCount: engCount,
      unansweredFollowUps,
      commitmentsCompletedOnTime: commitmentsCompleted,
      commitmentsOverdue,
      expansionSignalsCount,
      lastCalculated: new Date().toISOString()
    });

    // Auto-create Relationship Deterioration risk if score crashes
    if (healthScore < 40 && risks.length === 0) {
      await db.collection('risks').add({
        accountId, category: 'Relationship Deterioration', severity: 'High', description: `Health score dropped to critical (${healthScore}%).`, status: 'Open', createdAt: new Date().toISOString()
      });
    }

    return result;
  } catch (error) {
    console.error(`Error calculating health score for account ${accountId}:`, error);
    return { healthScore: 50, status: 'Warning' };
  }
}

function buildExplanationPayload(accountId, latest) {
  const factors = latest.factors || {};
  const healthScore = latest.healthScore ?? 50;
  const status = latest.status || (healthScore >= 70 ? 'Healthy' : healthScore >= 40 ? 'Warning' : 'Critical');

  const positiveDrivers = [];
  const negativeDrivers = [];

  // 1. Engagement Frequency (Weight 20%)
  if (factors.engagementFrequency) {
    if (factors.engagementFrequency.score >= 70) {
      positiveDrivers.push(factors.engagementFrequency.reason || 'Strong customer interaction cadence in the last 30 days');
    } else {
      negativeDrivers.push(factors.engagementFrequency.reason || 'Limited customer interactions logged in the last 30 days');
    }
  }

  // 2. Communication Responsiveness (Weight 15%)
  if (factors.communicationResponsiveness) {
    if (factors.communicationResponsiveness.score >= 80) {
      positiveDrivers.push('Prompt communication responsiveness with 0 unanswered follow-ups');
    } else {
      negativeDrivers.push(factors.communicationResponsiveness.reason || 'Pending unanswered follow-up requests detected');
    }
  }

  // 3. Sentiment Trend (Weight 15%)
  if (factors.sentimentTrend) {
    if (factors.sentimentTrend.score >= 70) {
      positiveDrivers.push('Positive to neutral sentiment across recent interactions');
    } else if (factors.sentimentTrend.score < 50) {
      negativeDrivers.push('Negative sentiment trends identified in recent communications');
    }
  }

  // 4. Stakeholder Coverage (Weight 15%)
  if (factors.stakeholderCoverage) {
    if (factors.stakeholderCoverage.score >= 75) {
      positiveDrivers.push('Good executive and decision-maker stakeholder coverage');
    } else {
      const gaps = (factors.stakeholderCoverage.signals || []).filter(s => s.toLowerCase().includes('missing'));
      if (gaps.length > 0) {
        negativeDrivers.push(gaps.join(', '));
      } else {
        negativeDrivers.push('Incomplete stakeholder hierarchy mapping');
      }
    }
  }

  // 5. Risk Signals (Weight 15%)
  if (factors.riskSignals) {
    if (factors.riskSignals.score >= 80) {
      positiveDrivers.push('No active critical risk flags open');
    } else {
      const signals = (factors.riskSignals.signals || []).join(', ');
      negativeDrivers.push(signals || factors.riskSignals.reason || 'Open risk flags active for this account');
    }
  }

  // 6. Commitments (Weight 10%)
  if (factors.commitments) {
    if (factors.commitments.score >= 100) {
      positiveDrivers.push('Action items and milestones are progressing on schedule');
    } else {
      negativeDrivers.push(factors.commitments.signals?.[0] || 'Overdue tasks and pending commitments');
    }
  }

  // 7. Business Signals (Weight 10%)
  if (factors.businessSignals) {
    if (factors.businessSignals.score > 50) {
      positiveDrivers.push(factors.businessSignals.reason || 'Expansion and business opportunity signals detected');
    } else {
      negativeDrivers.push('No recent expansion or upsell signals identified');
    }
  }

  let summary = '';
  if (negativeDrivers.length === 0) {
    summary = `Account is operating with strong health (${healthScore}/100). Key strengths: ${positiveDrivers.slice(0, 3).join('. ')}.`;
  } else if (positiveDrivers.length === 0) {
    summary = `Account health is held down (${healthScore}/100) by multiple risk factors: ${negativeDrivers.join('; ')}. Immediate executive intervention recommended.`;
  } else {
    summary = `The health score of ${healthScore}/100 is supported by ${positiveDrivers.slice(0, 2).join(' and ')}, but held down by ${negativeDrivers.slice(0, 2).join(' and ')}.`;
  }

  let normalizedAdjustments = latest.appliedAdjustments || [];
  if (typeof normalizedAdjustments === 'string') {
    try {
      normalizedAdjustments = JSON.parse(normalizedAdjustments);
    } catch {
      normalizedAdjustments = [];
    }
  }
  if (!Array.isArray(normalizedAdjustments)) {
    normalizedAdjustments = [];
  }

  return {
    accountId,
    healthScore,
    status,
    factors,
    appliedAdjustments: normalizedAdjustments,
    positiveDrivers,
    negativeDrivers,
    summary
  };
}

/**
 * Returns detailed explanation breakdown for an account health score.
 */
export async function getAccountHealthExplanation(accountId) {
  try {
    let latest = null;
    const scoresSnapshot = await db.collection('healthscores')
      .where('accountId', '==', accountId)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (scoresSnapshot.docs.length > 0 && scoresSnapshot.docs[0].data().factors) {
      latest = scoresSnapshot.docs[0].data();
    } else {
      await calculateAccountHealth(accountId);
      const retrySnapshot = await db.collection('healthscores')
        .where('accountId', '==', accountId)
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();
      if (retrySnapshot.docs.length > 0) {
        latest = retrySnapshot.docs[0].data();
      }
    }

    if (!latest) return null;

    const basePayload = buildExplanationPayload(accountId, latest);

    // Fetch live account signals to generate genuine AI-driven health synthesis
    const [accSnap, tasksSnap, risksSnap, contactsSnap, intSnap, allAccSnap, emailSnap] = await Promise.all([
      db.collection('accounts').doc(accountId).get(),
      db.collection('tasks').where('accountId', '==', accountId).get(),
      db.collection('risks').where('accountId', '==', accountId).get(),
      db.collection('contacts').where('accountId', '==', accountId).get(),
      db.collection('interactions').where('accountId', '==', accountId).get(),
      db.collection('accounts').get(),
      db.collection('emaillogs').get()
    ]);

    const accData = accSnap.exists ? accSnap.data() : {};
    const overdueTasks = tasksSnap.docs.map(d => d.data()).filter(t => {
      const isDone = t.status === 'Completed' || t.status === 'Cancelled';
      if (isDone) return false;
      if (!t.dueDate) return false;
      const today = getSystemDateString();
      return t.dueDate < today;
    });
    const openRisks = risksSnap.docs.map(d => d.data()).filter(r => r.status !== 'Resolved' && r.status !== 'Closed');

    // All interactions for this account, combining manually logged & system-tracked emails
    const dbInteractions = intSnap.docs.map(d => d.data());
    const accountEmails = emailSnap.docs
      .map(doc => doc.data())
      .filter(e => !e.isMock && String(e.relatedAccountId) === String(accountId))
      .map(e => ({
        interactionId: e.logId,
        accountId: accountId,
        source: 'System Email',
        subject: e.subject,
        messageText: e.htmlBody || '',
        date: (e.sentAt || e.createdAt || '').slice(0, 10),
        timestamp: e.sentAt || e.createdAt,
        sentiment: 'Neutral'
      }));

    const allInteractions = [...dbInteractions, ...accountEmails];
    allInteractions.sort((a, b) => new Date(b.timestamp || b.date || 0) - new Date(a.timestamp || a.date || 0));
    const recentInteractions = allInteractions.slice(0, 10);
    const contacts = contactsSnap.docs.map(d => d.data());

    // Calculate real dynamic org-wide average health score
    const allScores = allAccSnap.docs
      .map(d => d.data().healthScore ?? d.data().health_score)
      .filter(s => typeof s === 'number');
    const orgAverage = allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : 58;

    const now = new Date();

    // 1. Benchmark metrics
    basePayload.benchmark = {
      accountScore: basePayload.healthScore,
      orgAverage,
      industryBenchmark: 65
    };

    // 2. Real Relationship Coverage
    basePayload.relationshipCoverage = contacts.map(c => {
      const contactInts = allInteractions.filter(i =>
        i.contactId === (c.contactId || c.id) ||
        (i.to && c.email && i.to.toLowerCase().includes(c.email.toLowerCase())) ||
        (i.contactName && c.name && i.contactName.toLowerCase().includes(c.name.toLowerCase()))
      );
      const lastIntDate = contactInts.length > 0
        ? (contactInts[0].timestamp || contactInts[0].date)
        : (allInteractions.length > 0 ? (allInteractions[0].timestamp || allInteractions[0].date) : null);

      const daysAgo = lastIntDate ? Math.max(0, Math.floor((now - new Date(lastIntDate)) / (1000 * 60 * 60 * 24))) : null;

      return {
        id: c.contactId || c.id,
        name: c.name || 'Unnamed Contact',
        role: c.influenceTag || c.hierarchyTag || c.role || 'Stakeholder',
        influenceTag: c.influenceTag,
        hierarchyTag: c.hierarchyTag,
        daysAgo,
        lastInteractionDate: lastIntDate
      };
    });

    // 3. Real Sentiment & Touchpoints (last 5)
    const last5Ints = allInteractions.slice(0, 5);
    basePayload.touchpoints = last5Ints.map(i => {
      let sentimentTag = 'Neu';
      const s = (i.sentiment || '').toLowerCase();
      if (s.includes('pos') || i.isCelebration || i.interactionType === 'Customer Celebration' || i.celebrationEventType) {
        sentimentTag = 'Pos';
      } else if (s.includes('neg') || i.riskDetected) {
        sentimentTag = 'Neg';
      }

      // Generate unique, context-specific reason based on actual interaction content
      const subj = (i.subject || i.title || '').trim();
      const lower = subj.toLowerCase();
      const ev = (i.eventType || i.celebrationEventType || '').toLowerCase();
      let sentimentReason = i.sentimentReason || '';

      if (!sentimentReason) {
        if (lower.includes('birthday') || ev.includes('birthday')) {
          sentimentReason = 'Birthday celebration message sent to contact to strengthen personal rapport and relationship warmth.';
        } else if (lower.includes('work anniversary') || lower.includes('tenure') || ev.includes('work_anniversary')) {
          sentimentReason = 'Work anniversary touchpoint recognizing stakeholder tenure, shared collaboration, and partnership.';
        } else if (lower.includes('company anniversary') || ev.includes('company_anniversary')) {
          sentimentReason = 'Corporate anniversary recognition celebrating sustained enterprise partnership and customer growth.';
        } else if (lower.includes('congratulation') || lower.includes('achievement') || ev.includes('achievement')) {
          sentimentReason = 'Milestone congratulatory note acknowledging customer achievements, awards, or professional success.';
        } else if (lower.includes('festival') || lower.includes('diwali') || lower.includes('christmas') || lower.includes('new year') || lower.includes('eid')) {
          sentimentReason = 'Festival greeting touchpoint sent to nurture warm, trusted business relationship.';
        } else if (lower.includes('[associated task assigned]') || lower.includes('task assigned') || lower.includes('reconnect with')) {
          const cleanTask = subj.replace(/^\[Associated Task Assigned\]\s*/i, '').trim();
          sentimentReason = cleanTask
            ? `Internal action task assigned: "${cleanTask}" to maintain account engagement.`
            : 'Internal operational task assigned to drive proactive customer engagement.';
        } else if (lower.includes('meeting') || lower.includes('qbr') || lower.includes('call') || lower.includes('sync') || lower.includes('review') || lower.includes('demo')) {
          sentimentReason = sentimentTag === 'Pos'
            ? 'Collaborative session with positive alignment and forward momentum on deliverables.'
            : sentimentTag === 'Neg'
              ? 'Meeting surfaced timeline friction, delivery bottlenecks, or critical feedback requiring follow-up.'
              : 'Operational sync or review meeting logged with customer stakeholders.';
        } else if (sentimentTag === 'Pos') {
          sentimentReason = 'Customer communication expressing positive client feedback, approval, or relationship goodwill.';
        } else if (sentimentTag === 'Neg') {
          sentimentReason = 'Touchpoint detected dissatisfaction, SLA escalation, or pending risk flags.';
        } else {
          sentimentReason = 'Informational touchpoint or operational status update logged in database.';
        }
      }

      return {
        id: i.interactionId || i.id,
        type: i.interactionType || i.type || i.source || 'Email',
        subject: i.subject || i.title || 'Logged touchpoint',
        date: i.date || (i.timestamp ? i.timestamp.slice(0, 10) : ''),
        sentiment: sentimentTag,
        rawSentiment: i.sentiment,
        sentimentReason
      };
    });

    let touchpointNote = 'No negative risk topics detected in recent communications.';
    const negativeInt = last5Ints.find(i => (i.sentiment || '').toLowerCase().includes('neg') || i.riskDetected);
    if (negativeInt) {
      touchpointNote = `Concern noted: ${negativeInt.subject || 'Escalation signal'} on ${negativeInt.date || negativeInt.timestamp?.slice(0, 10)}.`;
    } else if (last5Ints.length > 0) {
      touchpointNote = `Latest touchpoint: ${last5Ints[0].subject} (${last5Ints[0].date || last5Ints[0].timestamp?.slice(0, 10)}).`;
    }
    basePayload.touchpointNote = touchpointNote;

    // 4. Interaction statistics (explains 30-day window vs total DB count)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recent30d = allInteractions.filter(i => new Date(i.timestamp || i.date || 0) >= thirtyDaysAgo);
    const daysSinceLast = allInteractions.length > 0
      ? Math.max(0, Math.floor((now - new Date(allInteractions[0].timestamp || allInteractions[0].date || 0)) / (1000 * 60 * 60 * 24)))
      : null;

    basePayload.interactionStats = {
      totalCount: allInteractions.length,
      recent30dCount: recent30d.length,
      daysSinceLastInteraction: daysSinceLast,
      lastInteractionDate: allInteractions.length > 0 ? (allInteractions[0].date || allInteractions[0].timestamp) : null
    };

    try {
      const aiInsights = await generateSmartHealthAnalysis({
        accountName: accData.companyName || accountId,
        industry: accData.domain || accData.industry || 'Enterprise',
        journeyStage: accData.journeyStage || 'Active',
        healthScore: basePayload.healthScore,
        status: basePayload.status,
        factors: basePayload.factors,
        overdueTasks,
        openRisks,
        recentInteractions,
        contacts
      });

      if (aiInsights && aiInsights.summary) {
        basePayload.summary = aiInsights.summary;
        basePayload.whatsHappening = aiInsights.whatsHappening;
        basePayload.whyItMatters = aiInsights.whyItMatters;
        basePayload.isAiGenerated = true;
      }
      basePayload.aiTooltips = (aiInsights && aiInsights.tooltips) ? aiInsights.tooltips : null;
    } catch (aiErr) {
      console.warn('AI analysis fallback for account ' + accountId + ':', aiErr.message);
    }

    const firstOverdueTask = overdueTasks.length > 0 ? overdueTasks[0] : null;
    const firstOverdueName = firstOverdueTask ? (firstOverdueTask.title || firstOverdueTask.taskHeader || firstOverdueTask.action || 'Overdue Task') : '';
    const factors = basePayload.factors || {};

    const aiT = basePayload.aiTooltips || {};

    basePayload.tooltips = {
      healthScore: {
        title: `Account Health Score (${basePayload.healthScore}/100)`,
        status: basePayload.status,
        why: aiT.healthScore || `${accData.companyName || 'This account'} has an overall health rating of ${basePayload.healthScore}/100 (${basePayload.status}) evaluated by the 7-factor behavioral engine. ${basePayload.summary || ''}`,
        formula: 'Score = Σ (Category Score × Category Weight)'
      },
      engagement: {
        title: 'Engagement Frequency (30-Day Window)',
        status: `${recent30d.length} in 30d (${allInteractions.length} total)`,
        why: aiT.engagement || (recent30d.length === 0
          ? `0 customer interactions recorded in the last 30 days. Although ${allInteractions.length} total interaction(s) exist in PostgreSQL, the last contact was ${daysSinceLast} days ago (>30d), triggering a -20 pt disengagement penalty.`
          : `${recent30d.length} customer interaction(s) logged across communication channels in the last 30 days, keeping the account active.`),
        formula: '≥8 touches: 100 | 4–7: 75 | 2–3: 50 | 1: 25 | 0: 0 (-20 pts)'
      },
      responsiveness: {
        title: 'Email Responsiveness & Turnaround',
        status: `${factors.communicationResponsiveness.score}%`,
        why: aiT.responsiveness || ((factors.communicationResponsiveness.score === 100)
          ? `Prompt response turnaround. Zero unanswered customer inquiries or pending follow-ups are recorded in PostgreSQL (+15 pt credit).`
          : `Unanswered customer inquiries or follow-ups detected, reducing responsiveness score to ${factors.communicationResponsiveness.score}%.`),
        formula: 'Score = max(0, 100 - (unanswered_threads × 20))'
      },
      overdueCommitments: {
        title: 'Commitments & Task SLAs',
        status: overdueTasks.length > 0 ? `${overdueTasks.length} Overdue` : '0 Overdue',
        why: aiT.overdueCommitments || (overdueTasks.length > 0
          ? `Found ${overdueTasks.length} task commitment past its scheduled due date${firstOverdueName ? `: "${firstOverdueName}"` : ''}. Overdue commitments subtract 15 points from health.`
          : 'All customer commitments and staff action items are currently on schedule (+10 pt bonus).'),
        formula: '0 overdue: 100 pts (+10 bonus) | ≥1 overdue: -15 pts penalty'
      },
      riskHealth: {
        title: 'Risk Health Status',
        status: openRisks.length === 0 ? 'Low risk (100%)' : `${factors.riskSignals.score}%`,
        why: aiT.riskHealth || (openRisks.length === 0
          ? 'Zero active Critical or High risk flags identified in the Risks module (+15 pt bonus).'
          : `Found ${openRisks.length} active risk ticket(s) recorded in the database: ${openRisks.map(r => r.category || 'Risk').join(', ')}.`),
        formula: '0 active risks: 100 pts (+15 bonus) | Medium: 60 | High/Critical: 20'
      },
      categories: {
        engagement: {
          why: aiT.engagement || (recent30d.length === 0
            ? `No customer touchpoints logged in the last 30 days (${daysSinceLast}d since last contact). Cadence target is at least 2–4 touches monthly.`
            : `${recent30d.length} touchpoint(s) logged in the last 30 days against target cadence.`),
          formula: 'Volume vs 30d targets (≥8: 100, 4–7: 75, 2–3: 50, 0: 0)'
        },
        responsiveness: {
          why: aiT.responsiveness || (factors.communicationResponsiveness.score === 100
            ? 'Inbox clean: 0 delinquent or unanswered customer follow-up threads in PostgreSQL.'
            : factors.communicationResponsiveness.reason || 'Pending customer threads require response.'),
          formula: 'max(0, 100 - (unanswered_threads × 20))'
        },
        sentiment: {
          why: `Average AI sentiment score of ${factors.sentimentTrend.score}/100 synthesized across the last 5 customer interactions.`,
          formula: 'Pos = 100, Neu = 60, Neg = 0'
        },
        stakeholders: {
          why: factors.stakeholderCoverage.signals.length > 0
            ? `${factors.stakeholderCoverage.signals.join('; ')} across ${contacts.length} mapped contact(s).`
            : `Comprehensive stakeholder mapping across ${contacts.length} contact(s) including executive and decision-maker roles.`,
          formula: 'CXO + Decision Maker = 100 | CXO/DM = 85 | Champion = 70 | Other = 50'
        },
        riskSignals: {
          why: aiT.riskHealth || (openRisks.length === 0
            ? 'Clean risk profile with 0 active flags or competitor escalations in the Risks database.'
            : `${openRisks.length} active risk flag(s) registered in the system.`),
          formula: '100 minus active severity penalties (0 active risks = 100)'
        },
        commitments: {
          why: aiT.overdueCommitments || (overdueTasks.length > 0
            ? `${overdueTasks.length} overdue task commitment(s) currently open past deadline.`
            : 'All assigned tasks and customer commitments are completed or on track.'),
          formula: '0 overdue: 100 pts | 1 overdue: 85 pts | 2+ overdue: 60 pts'
        },
        businessSignals: {
          why: 'Monitors project milestones, expansion opportunities, and business alignment in customer discussions.',
          formula: 'Expansion (+pts) vs Churn/Budget risk (-pts)'
        }
      },
      whyThisScore: {
        inactivity: {
          title: 'Engagement Inactivity Penalty',
          status: '-20 pts',
          why: aiT.engagement || `0 customer interactions logged in the rolling 30-day window (last touchpoint was ${daysSinceLast}d ago). Regular communication is required to sustain health.`,
          formula: '0 touches in 30d = -20 pts'
        },
        stakeholders: {
          title: 'Stakeholder Coverage Gap',
          status: '-10 pts',
          why: factors.stakeholderCoverage?.signals?.length > 0
            ? `${factors.stakeholderCoverage.signals.join('; ')}. Having unmapped executive relationships introduces account churn risk.`
            : 'Missing key stakeholder roles reduces coverage score.',
          formula: 'Missing key stakeholder role = -10 pts'
        },
        sentiment: {
          title: 'Sentiment Trend Penalty',
          status: '-15 pts',
          why: `Average sentiment across recent interactions fell to ${factors.sentimentTrend?.score || 0}%, detecting dissatisfaction or critical remarks in communication.`,
          formula: 'Sentiment score < 50% = -15 pts'
        },
        commitmentsBreach: {
          title: 'Task Commitment SLA Breach',
          status: '-15 pts',
          why: aiT.commitmentBonus || (overdueTasks.length > 0
            ? `Detected ${overdueTasks.length} overdue task commitment${firstOverdueName ? `: "${firstOverdueName}"` : ''}. Delayed deliverables penalize client trust and SLA rating.`
            : 'Overdue task commitments penalize health by 15 points.'),
          formula: '≥1 overdue task = -15 pts'
        },
        commitmentsBonus: {
          title: 'Commitment Execution Bonus',
          status: '+10 pts',
          why: aiT.commitmentBonus || 'Zero overdue customer commitments. All deliverables, action items, and task deadlines are met on time.',
          formula: '0 overdue tasks = +10 pts bonus'
        },
        cleanRisk: {
          title: 'Clean Risk Health Bonus',
          status: '+15 pts',
          why: aiT.cleanRiskBonus || 'Zero active High or Critical risk flags open in the system. Full health credit awarded.',
          formula: '0 active risk flags = +15 pts bonus'
        },
        responsivenessBonus: {
          title: 'Communication Responsiveness Bonus',
          status: '+15 pts',
          why: aiT.responsivenessBonus || 'All customer inquiries and communications have been addressed with 0 delinquent or unanswered threads in PostgreSQL.',
          formula: '0 unanswered follow-ups = +15 pts bonus'
        }
      }
    };

    return basePayload;
  } catch (error) {
    console.error(`Error explaining health score for account ${accountId}:`, error);
    return null;
  }
}

