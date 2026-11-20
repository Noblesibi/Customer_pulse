import { db, logActivity } from '../config/database.js';

export const RECOMMENDATION_CATEGORIES = {
  TASK: 'TASK',
  OPPORTUNITY: 'OPPORTUNITY',
  RISK: 'RISK',
  ENGAGEMENT: 'ENGAGEMENT',
  GREETING_DRAFT: 'GREETING_DRAFT',
};

export const RECOMMENDATION_STATUS = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  EDITED: 'EDITED',
  REJECTED: 'REJECTED',
  DEFERRED: 'DEFERRED',
};

function makeRecommendationKey(accountId, category, sourceId, title) {
  const cleanTitle = String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 30);
  const cleanSource = String(sourceId || 'manual')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 24);
  const cleanAcc = String(accountId || 'acc')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 20);
  return `rec_${String(category).toLowerCase().slice(0, 8)}_${cleanAcc}_${cleanSource}_${cleanTitle}`;
}

/**
 * Stages AI-generated recommendations (Follow-up Tasks, Business Opportunities,
 * Customer Risks, and Engagement Insights) in `AiRecommendations` with full
 * supporting source references (`interactionId`, `meetingId`, `internetMessageId`,
 * `sourceTimestamp`, `accountId`, `contactId`).
 *
 * Strictly enforces Requirement #6: AI generates recommendations with status
 * `PENDING_REVIEW` and does not silently execute business actions.
 */
export async function stageAiRecommendationsFromAnalysis({
  accountId,
  contactId = null,
  sourceType = 'MANUAL_INTERACTION',
  sourceId = null,
  interactionId = null,
  meetingId = null,
  internetMessageId = null,
  sourceTimestamp = null,
  evidenceExcerpt = '',
  defaultOwnerUid = null,
  defaultOwnerName = null,
  followUpTasks = [],
  businessOpportunities = [],
  risks = [],
  engagementInsights = [],
}) {
  if (!accountId) return [];

  const nowIso = new Date().toISOString();
  const effectiveSourceTimestamp = sourceTimestamp || nowIso;
  const effectiveSourceId = sourceId || meetingId || internetMessageId || interactionId || `src_${Date.now()}`;
  const excerpt = String(evidenceExcerpt || '').trim().slice(0, 400);

  const baseReferences = {
    sourceType,
    sourceId: effectiveSourceId,
    interactionId: interactionId || null,
    meetingId: meetingId || null,
    internetMessageId: internetMessageId || null,
    sourceTimestamp: effectiveSourceTimestamp,
    accountId,
    contactId: contactId || null,
  };

  const candidates = [];

  // 1. Follow-up Tasks
  for (const item of followUpTasks || []) {
    const title = typeof item === 'string' ? item.trim() : String(item?.title || item?.task || '').trim();
    if (!title) continue;
    candidates.push({
      category: RECOMMENDATION_CATEGORIES.TASK,
      title: title.slice(0, 280),
      description: (typeof item === 'object' && item?.description) ? item.description : `Suggested follow-up task from ${sourceType}: ${title}`,
      priority: (typeof item === 'object' && item?.priority) || 'Medium',
      severity: null,
      suggestedAssigneeUid: (typeof item === 'object' && item?.assignedToUid) || defaultOwnerUid || null,
      suggestedAssigneeName: (typeof item === 'object' && item?.assignedToName) || defaultOwnerName || null,
      suggestedDueDate: (typeof item === 'object' && item?.dueDate) || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      linkedRiskId: null,
    });
  }

  // 2. Business Opportunities
  for (const opp of businessOpportunities || []) {
    const title = typeof opp === 'string' ? opp.trim() : String(opp?.title || '').trim();
    if (!title) continue;
    candidates.push({
      category: RECOMMENDATION_CATEGORIES.OPPORTUNITY,
      title: title.slice(0, 280),
      description: (typeof opp === 'object' && opp?.description) ? opp.description : `AI-detected business opportunity from ${sourceType}: ${title}`,
      priority: 'High',
      severity: null,
      suggestedAssigneeUid: defaultOwnerUid || null,
      suggestedAssigneeName: defaultOwnerName || null,
      suggestedDueDate: null,
      linkedRiskId: null,
    });
  }

  // 3. Customer Risks
  for (const r of risks || []) {
    const title = typeof r === 'string' ? r.trim() : String(r?.title || r?.category || r?.description || '').trim();
    if (!title) continue;
    const desc = typeof r === 'object' ? (r.description || title) : title;
    const sev = (typeof r === 'object' && r.severity) || 'Medium';
    const linkedRiskId = (typeof r === 'object' && r.riskId) || null;
    candidates.push({
      category: RECOMMENDATION_CATEGORIES.RISK,
      title: title.slice(0, 280),
      description: desc,
      priority: sev === 'High' || sev === 'Critical' ? 'High' : 'Medium',
      severity: sev,
      suggestedAssigneeUid: defaultOwnerUid || null,
      suggestedAssigneeName: defaultOwnerName || null,
      suggestedDueDate: null,
      linkedRiskId,
    });
  }

  // 4. Customer Engagement Insights
  for (const eng of engagementInsights || []) {
    const title = typeof eng === 'string' ? eng.trim() : String(eng?.title || '').trim();
    if (!title) continue;
    candidates.push({
      category: RECOMMENDATION_CATEGORIES.ENGAGEMENT,
      title: title.slice(0, 280),
      description: (typeof eng === 'object' && eng?.description) ? eng.description : `Customer engagement insight from ${sourceType}: ${title}`,
      priority: 'Medium',
      severity: null,
      suggestedAssigneeUid: defaultOwnerUid || null,
      suggestedAssigneeName: defaultOwnerName || null,
      suggestedDueDate: null,
      linkedRiskId: null,
    });
  }

  const staged = [];
  for (const cand of candidates) {
    const recommendationId = makeRecommendationKey(accountId, cand.category, effectiveSourceId, cand.title);
    const existingDoc = await db.collection('airecommendations').doc(recommendationId).get();
    if (existingDoc.exists) {
      staged.push(existingDoc.data());
      continue;
    }

    const record = {
      recommendationId,
      accountId,
      contactId: contactId || null,
      category: cand.category,
      title: cand.title,
      description: cand.description,
      priority: cand.priority,
      severity: cand.severity,
      suggestedAssigneeUid: cand.suggestedAssigneeUid,
      suggestedAssigneeName: cand.suggestedAssigneeName,
      suggestedDueDate: cand.suggestedDueDate,
      sourceType,
      sourceId: effectiveSourceId,
      interactionId: interactionId || null,
      meetingId: meetingId || null,
      internetMessageId: internetMessageId || null,
      sourceTimestamp: effectiveSourceTimestamp,
      evidenceExcerpt: excerpt,
      sourceReferences: {
        ...baseReferences,
        ...(cand.linkedRiskId ? { linkedRiskId: cand.linkedRiskId } : {}),
      },
      status: RECOMMENDATION_STATUS.PENDING_REVIEW,
      deferredUntil: null,
      reviewedByUid: null,
      reviewedByName: null,
      reviewedAt: null,
      reviewNotes: null,
      createdEntityType: cand.linkedRiskId ? 'RISK_STAGED' : null,
      createdEntityId: cand.linkedRiskId || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await db.collection('airecommendations').doc(recommendationId).set(record);
    staged.push(record);
  }

  return staged;
}

/**
 * Lists AI recommendations with optional filters.
 */
export async function listAiRecommendations({
  accountId = null,
  contactId = null,
  category = null,
  status = null,
  sourceType = null,
} = {}) {
  let query = db.collection('airecommendations');
  if (accountId) {
    query = query.where('accountId', '==', accountId);
  }
  const snap = await query.get();
  let items = snap.docs.map(d => ({ recommendationId: d.id, ...d.data() }));

  if (contactId) items = items.filter(r => r.contactId === contactId);
  if (category) items = items.filter(r => r.category === category);
  if (status && status !== 'ALL') items = items.filter(r => r.status === status);
  if (sourceType) items = items.filter(r => r.sourceType === sourceType);

  return items.sort(
    (a, b) => new Date(b.sourceTimestamp || b.createdAt || 0) - new Date(a.sourceTimestamp || a.createdAt || 0)
  );
}

/**
 * Processes an employee review decision (`APPROVE`, `EDIT`, `REJECT`, `DEFER`)
 * on an AI-generated recommendation.
 *
 * - `APPROVE` / `EDIT`:
 *   - For `TASK`: creates the confirmed task in `Tasks` only upon approval.
 *   - For `RISK`: transitions the staged risk in `Risks` from `Pending Review` to `Open` (or creates it).
 *   - For `OPPORTUNITY` / `ENGAGEMENT`: marks the recommendation confirmed.
 * - `REJECT`: marks the recommendation `REJECTED` (and marks any staged risk `Rejected`).
 * - `DEFER`: marks the recommendation `DEFERRED` with `deferredUntil`.
 */
export async function reviewAiRecommendation({
  recommendationId,
  action,
  edits = {},
  deferredUntil = null,
  reviewNotes = '',
  user = { uid: 'system', name: 'Authorized Employee' },
}) {
  if (!recommendationId) {
    throw new Error('recommendationId is required.');
  }

  const normalizedAction = String(action || '').trim().toUpperCase();
  if (!['APPROVE', 'EDIT', 'REJECT', 'DEFER'].includes(normalizedAction)) {
    throw new Error('action must be one of: APPROVE, EDIT, REJECT, DEFER.');
  }

  const docRef = db.collection('airecommendations').doc(recommendationId);
  const doc = await docRef.get();
  if (!doc.exists) {
    throw new Error(`AI recommendation "${recommendationId}" not found.`);
  }

  const existing = doc.data();
  const nowIso = new Date().toISOString();

  const finalTitle = edits?.title !== undefined ? String(edits.title).trim() : existing.title;
  const finalDescription = edits?.description !== undefined ? String(edits.description).trim() : existing.description;
  const finalPriority = edits?.priority || existing.priority || 'Medium';
  const finalSeverity = edits?.severity || existing.severity || 'Medium';
  const finalAssigneeUid = edits?.suggestedAssigneeUid || edits?.assignedToUid || existing.suggestedAssigneeUid || user.uid;
  const finalAssigneeName = edits?.suggestedAssigneeName || edits?.assignedToName || existing.suggestedAssigneeName || user.name || 'Account Owner';
  const finalDueDate = edits?.suggestedDueDate || edits?.dueDate || existing.suggestedDueDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let nextStatus = RECOMMENDATION_STATUS.PENDING_REVIEW;
  let createdEntityType = existing.createdEntityType || null;
  let createdEntityId = existing.createdEntityId || null;
  let computedDeferredUntil = null;

  if (normalizedAction === 'REJECT') {
    nextStatus = RECOMMENDATION_STATUS.REJECTED;
    const linkedRiskId = existing.sourceReferences?.linkedRiskId || (existing.category === RECOMMENDATION_CATEGORIES.RISK ? existing.createdEntityId : null);
    if (linkedRiskId) {
      const riskDoc = await db.collection('risks').doc(linkedRiskId).get();
      if (riskDoc.exists) {
        await db.collection('risks').doc(linkedRiskId).update({
          status: 'Rejected',
          reviewedByUid: user.uid,
          reviewedAt: nowIso,
        });
      }
    }
  } else if (normalizedAction === 'DEFER') {
    nextStatus = RECOMMENDATION_STATUS.DEFERRED;
    computedDeferredUntil =
      deferredUntil || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const linkedRiskId = existing.sourceReferences?.linkedRiskId || (existing.category === RECOMMENDATION_CATEGORIES.RISK ? existing.createdEntityId : null);
    if (linkedRiskId) {
      const riskDoc = await db.collection('risks').doc(linkedRiskId).get();
      if (riskDoc.exists) {
        await db.collection('risks').doc(linkedRiskId).update({
          status: 'Deferred',
          deferredUntil: computedDeferredUntil,
          reviewedByUid: user.uid,
          reviewedAt: nowIso,
        });
      }
    }
  } else if (normalizedAction === 'APPROVE' || normalizedAction === 'EDIT') {
    nextStatus =
      normalizedAction === 'EDIT' || Object.keys(edits || {}).length > 0
        ? RECOMMENDATION_STATUS.EDITED
        : RECOMMENDATION_STATUS.APPROVED;

    if (existing.category === RECOMMENDATION_CATEGORIES.TASK) {
      const taskId = existing.createdEntityType === 'TASK' && existing.createdEntityId
        ? existing.createdEntityId
        : `task-ai-${Math.random().toString(36).substring(2, 10)}`;
      const taskRecord = {
        taskId,
        accountId: existing.accountId,
        contactId: existing.contactId || null,
        title: finalTitle,
        description: finalDescription || finalTitle,
        assignedTo: finalAssigneeUid,
        assignedToUid: finalAssigneeUid,
        assignedToName: finalAssigneeName,
        assignedByUid: user.uid || finalAssigneeUid || 'system',
        assignedByName: user.name || user.email || 'Authorized Employee',
        priority: finalPriority,
        dueDate: finalDueDate,
        status: 'Pending',
        source: 'AI Approved Recommendation',
        sourceRecommendationId: recommendationId,
        interactionId: existing.interactionId || null,
        meetingId: existing.meetingId || null,
        internetMessageId: existing.internetMessageId || null,
        createdByUid: user.uid,
        createdByName: user.name || user.email || 'Authorized Employee',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await db.collection('tasks').doc(taskId).set(taskRecord, { merge: true });
      createdEntityType = 'TASK';
      createdEntityId = taskId;
    } else if (existing.category === RECOMMENDATION_CATEGORIES.RISK) {
      const riskId =
        existing.sourceReferences?.linkedRiskId ||
        existing.createdEntityId ||
        `risk-ai-${Math.random().toString(36).substring(2, 10)}`;
      await db.collection('risks').doc(riskId).set(
        {
          riskId,
          accountId: existing.accountId,
          contactId: existing.contactId || null,
          category: finalTitle,
          severity: finalSeverity,
          description: finalDescription,
          status: 'Open',
          source: 'AI Approved Recommendation',
          sourceRecommendationId: recommendationId,
          interactionId: existing.interactionId || null,
          meetingId: existing.meetingId || null,
          reviewedByUid: user.uid,
          reviewedByName: user.name || user.email || 'Authorized Employee',
          reviewedAt: nowIso,
          createdAt: existing.createdAt || nowIso,
        },
        { merge: true }
      );
      createdEntityType = 'RISK';
      createdEntityId = riskId;
    } else {
      createdEntityType = existing.category;
      createdEntityId = recommendationId;
    }
  }

  const updatedRecord = {
    ...existing,
    title: finalTitle,
    description: finalDescription,
    priority: finalPriority,
    severity: finalSeverity,
    suggestedAssigneeUid: finalAssigneeUid,
    suggestedAssigneeName: finalAssigneeName,
    suggestedDueDate: finalDueDate,
    status: nextStatus,
    deferredUntil: computedDeferredUntil,
    reviewedByUid: user.uid || null,
    reviewedByName: user.name || user.email || 'Authorized Employee',
    reviewedAt: nowIso,
    reviewNotes: reviewNotes || null,
    createdEntityType,
    createdEntityId,
    updatedAt: nowIso,
  };

  await docRef.set(updatedRecord, { merge: true });

  await logActivity(
    user.uid || 'system',
    user.name || user.email || 'Authorized Employee',
    `AI_RECOMMENDATION_${normalizedAction}`,
    `${normalizedAction} ${existing.category} recommendation "${finalTitle}" (ID: ${recommendationId}) for account ${existing.accountId}`
  ).catch(() => { });

  return updatedRecord;
}
