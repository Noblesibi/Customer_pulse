import { db } from '../config/database.js';
import { calculateRelationshipGaps } from './relationship.service.js';

export async function generateNextBestActions(accountId) {
  const actions = [];
  
  // 1. Fetch Account Data
  const accDoc = await db.collection('accounts').doc(accountId).get();
  if (!accDoc.exists) return actions;
  const account = accDoc.data();

  // 2. Fetch Open Risks
  const risksSnap = await db.collection('risks').where('accountId', '==', accountId).get();
  const openRisks = risksSnap.docs.map(d => d.data()).filter(r => r.status === 'Open');

  // 3. Fetch Interactions (for AI opportunities)
  const interactionsSnap = await db.collection('interactions').where('accountId', '==', accountId).get();
  const interactions = interactionsSnap.docs.map(d => d.data());
  
  // Process Risks
  for (const risk of openRisks) {
    if (risk.category === 'Overdue Action') {
      actions.push({
        id: `nba-risk-${risk.createdAt}`,
        type: 'Urgent Follow-Up',
        priority: 'High',
        reason: 'A critical task is severely overdue.',
        suggestedAction: 'Review overdue tasks and reassign or escalate immediately.',
        suggestedOwner: account.ownerId,
        linkType: 'risk',
        linkId: risk.riskId || risk.id
      });
    } else if (risk.severity === 'High') {
      actions.push({
        id: `nba-risk-${risk.createdAt}`,
        type: 'Risk Mitigation',
        priority: 'High',
        reason: risk.description,
        suggestedAction: `Schedule a mitigation sync with stakeholders regarding: ${risk.category}.`,
        suggestedOwner: account.ownerId,
        linkType: 'risk',
        linkId: risk.riskId || risk.id
      });
    }
  }

  // Process Relationship Gaps
  const { gaps } = await calculateRelationshipGaps(accountId);
  for (const gap of gaps) {
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

  // Process AI Opportunities (from last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentInteractions = interactions.filter(i => new Date(i.timestamp || i.date) >= thirtyDaysAgo);

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
