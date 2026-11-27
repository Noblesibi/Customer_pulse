import { db } from '../config/database.js';
import { calculateRelationshipGaps } from './relationship.service.js';

export async function generateNextBestActions(accountId) {
  const actions = [];

  // 1. Fetch Account Data
  const accDoc = await db.collection('accounts').doc(accountId).get();
  if (!accDoc.exists) return actions;
  const account = accDoc.data();

  // 2. Fetch Open Risks, Interactions, Staff Tasks, and Celebrations in parallel
  const [risksSnap, interactionsSnap, tasksSnap, celebrationsSnap] = await Promise.all([
    db.collection('risks').where('accountId', '==', accountId).get().catch(() => ({ docs: [] })),
    db.collection('interactions').where('accountId', '==', accountId).get().catch(() => ({ docs: [] })),
    db.collection('tasks').where('accountId', '==', accountId).get().catch(() => ({ docs: [] })),
    db.collection('celebrationEvents').where('accountId', '==', accountId).get().catch(() => ({ docs: [] })),
  ]);

  const openRisks = risksSnap.docs.map(d => d.data()).filter(r => r.status === 'Open');
  const interactions = interactionsSnap.docs.map(d => d.data());
  const staffTasks = tasksSnap.docs.map(d => d.data());
  const celebrations = celebrationsSnap.docs.map(d => d.data());

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
  const threeDaysAhead = todayStart + 3 * 86400000;
  const sevenDaysAhead = todayStart + 7 * 86400000;

  // ── A. Open Risks ──────────────────────────────────────────────────────────
  for (const risk of openRisks) {
    const sev = String(risk.severity || '').toLowerCase();
    if (risk.category === 'Overdue Action') {
      actions.push({
        id: `nba-risk-${risk.riskId || risk.id || risk.createdAt}`,
        type: 'Urgent Follow-Up',
        priority: 'High',
        reason: risk.description || 'A critical commitment requires immediate follow-up.',
        suggestedAction: 'Review urgent action items and escalate or reassign immediately.',
        suggestedOwner: account.ownerId,
        linkType: 'risk',
        linkId: risk.riskId || risk.id
      });
    } else if (sev === 'high' || sev === 'critical') {
      actions.push({
        id: `nba-risk-${risk.riskId || risk.id || risk.createdAt}`,
        type: 'Risk Mitigation',
        priority: 'High',
        reason: risk.description || `${risk.category} risk is open.`,
        suggestedAction: `Schedule a mitigation sync with stakeholders regarding: ${risk.category}.`,
        suggestedOwner: account.ownerId,
        linkType: 'risk',
        linkId: risk.riskId || risk.id
      });
    } else if (sev === 'medium') {
      actions.push({
        id: `nba-risk-med-${risk.riskId || risk.id || risk.createdAt}`,
        type: 'Risk Mitigation',
        priority: 'Medium',
        reason: risk.description || `${risk.category} risk is active.`,
        suggestedAction: `Review and address open ${risk.category || 'Medium'} risk before it escalates.`,
        suggestedOwner: account.ownerId,
        linkType: 'risk',
        linkId: risk.riskId || risk.id
      });
    }
  }

  // ── B. Account Health Score ────────────────────────────────────────────────
  const healthScore = typeof account.healthScore === 'number' ? account.healthScore : null;
  if (healthScore !== null && healthScore < 40) {
    actions.push({
      id: `nba-health-critical-${accountId}`,
      type: 'Health Recovery',
      priority: 'High',
      reason: `Account health score is Critical (${healthScore}/100).`,
      suggestedAction: `Conduct an urgent account health review and executive alignment plan for ${account.companyName || 'this account'}.`,
      suggestedOwner: account.ownerId,
      linkType: 'health',
      linkId: accountId
    });
  } else if (healthScore !== null && healthScore < 70) {
    actions.push({
      id: `nba-health-warning-${accountId}`,
      type: 'Health Improvement',
      priority: 'Medium',
      reason: `Account health score is in Warning status (${healthScore}/100).`,
      suggestedAction: `Increase customer touchpoints and resolve open signals to lift health above 70.`,
      suggestedOwner: account.ownerId,
      linkType: 'health',
      linkId: accountId
    });
  }

  // ── C. Staff-to-Staff Tasks ────────────────────────────────────────────────
  const isTaskClosed = (st) => {
    const s = String(st || '').toLowerCase();
    return s === 'completed' || s === 'complete' || s === 'declined' || s === 'decline' || s === 'accepted & completed';
  };
  const openStaffTasks = staffTasks.filter(t => !isTaskClosed(t.status));
  const overdueStaffTasks = openStaffTasks.filter(t => t.dueDate && new Date(t.dueDate).setHours(0, 0, 0, 0) < todayStart);
  const dueSoonStaffTasks = openStaffTasks.filter(t => {
    if (!t.dueDate) return false;
    const dueMs = new Date(t.dueDate).setHours(0, 0, 0, 0);
    return dueMs >= todayStart && dueMs <= threeDaysAhead;
  });

  if (overdueStaffTasks.length > 0) {
    const topTask = overdueStaffTasks[0];
    actions.push({
      id: `nba-staff-tasks-overdue-${accountId}`,
      type: 'Staff Task Overdue',
      priority: 'High',
      reason: `${overdueStaffTasks.length} staff task${overdueStaffTasks.length > 1 ? 's are' : ' is'} overdue (e.g., "${topTask.title || 'Task'}").`,
      suggestedAction: `Follow up with ${topTask.assignedToName || 'the assigned owner'} to complete overdue staff task${overdueStaffTasks.length > 1 ? 's' : ''}.`,
      suggestedOwner: topTask.assignedToUid || account.ownerId,
      linkType: 'task',
      linkId: topTask.taskId || topTask.id
    });
  } else if (dueSoonStaffTasks.length > 0) {
    const topTask = dueSoonStaffTasks[0];
    actions.push({
      id: `nba-staff-tasks-soon-${accountId}`,
      type: 'Staff Task Follow-Up',
      priority: 'Medium',
      reason: `${dueSoonStaffTasks.length} staff task${dueSoonStaffTasks.length > 1 ? 's are' : ' is'} due within 3 days ("${topTask.title || 'Task'}").`,
      suggestedAction: `Track progress on "${topTask.title || 'upcoming staff task'}" with ${topTask.assignedToName || 'the assignee'}.`,
      suggestedOwner: topTask.assignedToUid || account.ownerId,
      linkType: 'task',
      linkId: topTask.taskId || topTask.id
    });
  }

  // ── D. Associated Tasks (actionMentions on Interaction Logs) ──────────────
  const openAssocTasks = [];
  for (const intr of interactions) {
    if (!Array.isArray(intr.actionMentions)) continue;
    for (const m of intr.actionMentions) {
      if (!isTaskClosed(m.status)) {
        openAssocTasks.push({ ...m, interactionId: intr.interactionId || intr.id });
      }
    }
  }
  const overdueAssocTasks = openAssocTasks.filter(m => m.dueDate && new Date(m.dueDate).setHours(0, 0, 0, 0) < todayStart);
  if (overdueAssocTasks.length > 0) {
    const first = overdueAssocTasks[0];
    actions.push({
      id: `nba-assoc-tasks-overdue-${accountId}`,
      type: 'Associated Task Overdue',
      priority: 'High',
      reason: `${overdueAssocTasks.length} interaction-linked associated task${overdueAssocTasks.length > 1 ? 's are' : ' is'} overdue ("${first.taskHeader || first.task || 'Action item'}").`,
      suggestedAction: `Complete or follow up on overdue associated task${overdueAssocTasks.length > 1 ? 's' : ''} with ${first.name || 'the assigned team member'}.`,
      suggestedOwner: first.uid || account.ownerId,
      linkType: 'interaction',
      linkId: first.interactionId
    });
  } else if (openAssocTasks.length > 0) {
    const first = openAssocTasks[0];
    actions.push({
      id: `nba-assoc-tasks-open-${accountId}`,
      type: 'Associated Task Follow-Up',
      priority: 'Medium',
      reason: `${openAssocTasks.length} open associated task${openAssocTasks.length > 1 ? 's' : ''} linked to logged interactions.`,
      suggestedAction: `Follow up on "${first.taskHeader || first.task || 'associated action item'}" assigned to ${first.name || 'staff'}.`,
      suggestedOwner: first.uid || account.ownerId,
      linkType: 'interaction',
      linkId: first.interactionId
    });
  }

  // ── E. Upcoming Celebrations & Greetings (next 7 days, not yet sent) ──────
  const upcomingGreetings = [];
  const seenFestKeys = new Set();
  for (const cel of celebrations) {
    const st = String(cel.status || '').toUpperCase();
    if (['SENT', 'DISMISSED', 'REJECTED', 'EXPIRED'].includes(st)) continue;
    if (!cel.eventDate) continue;
    const d = new Date(`${String(cel.eventDate).slice(0, 10)}T00:00:00`);
    if (isNaN(d.getTime())) continue;
    const ms = d.getTime();
    if (ms >= todayStart - 86400000 && ms <= sevenDaysAhead) {
      const k = `${String(cel.eventTitle || '').toLowerCase()}::${String(cel.eventDate).slice(0, 10)}`;
      if (!seenFestKeys.has(k)) {
        seenFestKeys.add(k);
        upcomingGreetings.push(cel);
      }
    }
  }
  if (upcomingGreetings.length > 0) {
    const nextCel = upcomingGreetings[0];
    actions.push({
      id: `nba-greeting-upcoming-${accountId}`,
      type: 'Celebration Greeting',
      priority: 'Medium',
      reason: upcomingGreetings.length === 1
        ? `Upcoming occasion: ${nextCel.eventTitle || nextCel.eventType} (${String(nextCel.eventDate).slice(0, 10)}).`
        : `${upcomingGreetings.length} upcoming celebrations/greetings in the next 7 days (starting with ${nextCel.eventTitle || nextCel.eventType}).`,
      suggestedAction: `Review and send the personalized greeting for ${nextCel.eventTitle || 'the upcoming celebration'}.`,
      suggestedOwner: account.ownerId,
      linkType: 'celebration',
      linkId: nextCel.id
    });
  }

  // ── F. Manual Interaction Logs (Sentiment, Follow-ups, Recency) ───────────
  const realCustomerInteractions = interactions.filter(i => i.source !== 'System Email');
  const recentInteractions = realCustomerInteractions.filter(i => new Date(i.timestamp || i.date) >= thirtyDaysAgo);
  const recentNegative = realCustomerInteractions.find(i =>
    String(i.sentiment || '').toLowerCase() === 'negative' &&
    new Date(i.timestamp || i.date) >= fourteenDaysAgo
  );
  if (recentNegative) {
    actions.push({
      id: `nba-sentiment-neg-${recentNegative.interactionId || recentNegative.id}`,
      type: 'Sentiment Recovery',
      priority: 'High',
      reason: `Recent interaction "${recentNegative.subject || 'Customer Log'}" recorded Negative sentiment.`,
      suggestedAction: `Reach out promptly to address concerns raised in "${recentNegative.subject || 'the recent interaction'}".`,
      suggestedOwner: account.ownerId,
      linkType: 'interaction',
      linkId: recentNegative.interactionId || recentNegative.id
    });
  }
  const followUpInteraction = recentInteractions.find(i => Array.isArray(i.followUpSignals) && i.followUpSignals.length > 0);
  if (followUpInteraction) {
    actions.push({
      id: `nba-followup-${followUpInteraction.interactionId || followUpInteraction.id}`,
      type: 'Interaction Follow-Up',
      priority: 'Medium',
      reason: `Unanswered follow-up noted in "${followUpInteraction.subject || 'recent interaction'}": ${followUpInteraction.followUpSignals[0]}`,
      suggestedAction: `Send a follow-up update closing the open point from "${followUpInteraction.subject || 'the recent log'}".`,
      suggestedOwner: account.ownerId,
      linkType: 'interaction',
      linkId: followUpInteraction.interactionId || followUpInteraction.id
    });
  } else if (recentInteractions.length === 0) {
    actions.push({
      id: `nba-no-recent-interaction-${accountId}`,
      type: 'Engagement Outreach',
      priority: 'Medium',
      reason: 'No customer interactions have been logged in the last 30 days.',
      suggestedAction: `Log a customer touchpoint or schedule a check-in call with ${account.companyName || 'this account'}.`,
      suggestedOwner: account.ownerId,
      linkType: 'interaction',
      linkId: null
    });
  }

  // Process Relationship Gaps
  const { gaps } = await calculateRelationshipGaps(accountId);
  const missingRoleGaps = gaps.filter(g => g.type === 'Missing Relationship' && !g.contactId);
  const contactSpecificGaps = gaps.filter(g => !(g.type === 'Missing Relationship' && !g.contactId));

  // Consolidate multiple missing-role gaps into one clear NBA card so we don't show
  // near-duplicate "Identify and map a key ... stakeholder" cards with different priorities.
  if (missingRoleGaps.length > 0) {
    const categories = Array.from(new Set(missingRoleGaps.map(g => g.category)));
    const hasExecutiveGap = categories.includes('Executive');
    const roleListText = categories.length === 1
      ? `a key ${categories[0]} stakeholder`
      : `key ${categories.join(' & ')} stakeholders`;
    const missingReason = categories.length === 1
      ? `No ${categories[0]} stakeholders are mapped for this account.`
      : `No ${categories.join(' or ')} stakeholders are mapped for this account.`;

    actions.push({
      id: `nba-gap-missing-${categories.join('-').toLowerCase()}`,
      type: 'Relationship Engagement',
      priority: hasExecutiveGap ? 'High' : 'Medium',
      reason: missingReason,
      suggestedAction: `Identify and map ${roleListText} for this account.`,
      suggestedOwner: account.ownerId,
      linkType: 'contact',
      linkId: null
    });
  }

  for (const gap of contactSpecificGaps) {
    actions.push({
      id: `nba-gap-${gap.category}-${gap.contactId || 'missing'}`,
      type: 'Relationship Engagement',
      priority: gap.category === 'Executive' ? 'High' : 'Medium',
      reason: gap.message,
      suggestedAction: gap.contactId
        ? `Schedule a check-in or executive sync with ${gap.contactName}.`
        : `Identify and map a key ${gap.category} stakeholder for this account.`,
      suggestedOwner: account.ownerId,
      linkType: 'contact',
      linkId: gap.contactId || null
    });
  }

  // ── H. Commercial Expansion & Engagement Opportunities (last 30 days) ─────
  for (const interaction of recentInteractions) {
    if (Array.isArray(interaction.businessOpportunities) && interaction.businessOpportunities.length > 0) {
      interaction.businessOpportunities.forEach((opp, i) => {
        actions.push({
          id: `nba-biz-opp-${interaction.interactionId}-${i}`,
          type: 'Account Expansion',
          priority: 'Medium',
          reason: `AI identified a potential expansion opportunity: ${opp}`,
          suggestedAction: `Follow up on the ${opp} mentioned in the recent interaction.`,
          suggestedOwner: account.ownerId,
          linkType: 'interaction',
          linkId: interaction.interactionId
        });
      });
    }

    if (Array.isArray(interaction.engagementOpportunities) && interaction.engagementOpportunities.length > 0) {
      interaction.engagementOpportunities.forEach((opp, i) => {
        actions.push({
          id: `nba-eng-opp-${interaction.interactionId}-${i}`,
          type: 'Stakeholder Connect',
          priority: 'Low',
          reason: `AI identified an engagement signal: ${opp}`,
          suggestedAction: `Plan a milestone connection or personalized outreach.`,
          suggestedOwner: account.ownerId,
          linkType: 'interaction',
          linkId: interaction.interactionId
        });
      });
    }
  }

  // Deduplicate and sort by priority (High -> Medium -> Low)
  const uniqueActions = [];
  const seenIds = new Set();
  actions.forEach(a => {
    if (!seenIds.has(a.id)) {
      seenIds.add(a.id);
      uniqueActions.push(a);
    }
  });

  const priorityWeight = { 'High': 3, 'Medium': 2, 'Low': 1 };
  uniqueActions.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);

  return uniqueActions;
}
