import { generateRiskAiDetails } from '../services/ai.service.js';
import { Router } from 'express';
import { db, logActivity } from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';
import { calculateAccountHealth } from '../services/health.service.js';
import { getSystemDateString, getSystemTimeString } from '../utils/dateUtils.js';
import { resolveNotifyRouting, sendRiskNotification, getNotifiedRiskKeys } from '../services/riskNotify.service.js';

const router = Router();

router.use(authenticateToken);

/**
 * GET /api/risks
 * Fetch active/resolved risks. Supports accountId filter and severity filters.
 */
router.get('/', async (req, res) => {
  try {
    const { accountId, severity, status } = req.query;

    // Auto-detect and sync risks using AI-generated, user-understanding details
    try {
      const accountsSnap = await db.collection('accounts').get();
      const validAccounts = accountsSnap.docs.map(d => ({ accountId: d.data().accountId || d.id, ...d.data() }));
      const validAccountMap = new Map(validAccounts.map(a => [a.accountId, a]));

      // 1. Sync Overdue Task Delivery Risks with AI Details
      const tasksSnap = await db.collection('tasks').get();
      const allTasks = tasksSnap.docs.map(d => d.data());
      const now = new Date();
      for (const t of allTasks) {
        if (!t.dueDate || !t.accountId || !validAccountMap.has(t.accountId)) continue;
        const due = new Date(t.dueDate);
        if (isNaN(due.getTime())) continue;
        const isDone = (t.status || '').toLowerCase().includes('complet') || (t.status || '').toLowerCase().includes('decline');
        const daysOverdue = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        const riskId = `risk-task-${t.taskId}`;
        const acc = validAccountMap.get(t.accountId) || {};

        if (!isDone && daysOverdue >= 1) {
          const existing = await db.collection('risks').doc(riskId).get();
          const sev = daysOverdue >= 7 ? 'Critical' : daysOverdue >= 3 ? 'High' : 'Medium';

          const aiDetails = await generateRiskAiDetails({
            companyName: acc.companyName || 'Account',
            category: 'Delivery',
            severity: sev,
            conditionType: 'overdue_task',
            daysOverdue,
            taskTitle: t.title,
            assignedToName: t.assignedToName,
            healthScore: acc.healthScore || 60,
            tier: acc.tier || 'Standard',
            ownerName: acc.ownerName || 'Account Owner',
            contacts: t.contactName ? [{ name: t.contactName }] : []
          });

          const riskPayload = {
            riskId,
            accountId: t.accountId,
            category: 'Delivery',
            severity: sev,
            title: aiDetails.title,
            description: aiDetails.description,
            whatIsRisk: aiDetails.whatIsRisk,
            whyItHappens: aiDetails.whyItHappens,
            howToResolve: aiDetails.howToResolve,
            source: 'AI + Rules',
            rule: `Commitment SLA breached: ${daysOverdue} day(s) overdue`,
            healthImpact: daysOverdue >= 7 ? '-20 points' : daysOverdue >= 3 ? '-15 points' : '-10 points',
            involved: [t.assignedToName, t.contactName].filter(Boolean),
            suggested: aiDetails.suggestedActions?.[0]?.title || `Follow up with ${t.assignedToName || 'assignee'} on task completion.`,
            confidence: aiDetails.confidence || 94,
            impact: aiDetails.impact || 'Project Delivery Delay',
            aiInsight: aiDetails.aiInsight,
            suggestedActions: aiDetails.suggestedActions
          };

          if (!existing.exists) {
            await db.collection('risks').doc(riskId).set({
              ...riskPayload,
              status: 'Open',
              createdAt: t.createdAt || new Date().toISOString()
            });
          } else if (existing.data().status === 'Open') {
            await db.collection('risks').doc(riskId).update(riskPayload);
          }
        } else if (isDone) {
          const existing = await db.collection('risks').doc(riskId).get();
          if (existing.exists && existing.data().status !== 'Resolved') {
            await db.collection('risks').doc(riskId).update({ status: 'Resolved', resolvedAt: new Date().toISOString() });
          }
        }
      }

      // 2. Sync Inactivity / Prolonged Silence with AI Details
      // If accountId is specified, check that account.
      // If global, only flag accounts that have real past interactions + 30d gap, OR health < 60
      const targetAccountIds = accountId
        ? [accountId]
        : validAccounts.filter(a => (a.healthScore !== undefined && a.healthScore < 60)).slice(0, 8).map(a => a.accountId);

      for (const accId of targetAccountIds) {
        const acc = validAccountMap.get(accId) || {};
        const intSnap = await db.collection('interactions').where('accountId', '==', accId).get();
        const interactions = intSnap.docs.map(d => d.data());

        let lastDate = null;
        let latestInteraction = null;
        for (const i of interactions) {
          const dStr = i.date || i.timestamp;
          if (!dStr) continue;
          const d = new Date(dStr);
          if (!isNaN(d.getTime())) {
            if (!lastDate || d > lastDate) {
              lastDate = d;
              latestInteraction = i;
            }
          }
        }

        const daysSinceLastInteraction = lastDate
          ? Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const isSilent = daysSinceLastInteraction !== null ? daysSinceLastInteraction >= 30 : (acc.healthScore !== undefined && acc.healthScore < 60);

        const silenceRiskId = `risk-silence-${accId}`;
        const existingSilence = await db.collection('risks').doc(silenceRiskId).get();

        if (isSilent) {
          const contactSnap = await db.collection('contacts').where('accountId', '==', accId).get();
          const contactNames = contactSnap.docs.map(d => d.data().name).filter(Boolean);
          const sev = (daysSinceLastInteraction && daysSinceLastInteraction >= 60) || (acc.healthScore < 45) ? 'Critical' : 'High';

          const aiDetails = await generateRiskAiDetails({
            companyName: acc.companyName || 'Account',
            category: 'Relationship',
            severity: sev,
            conditionType: 'silence',
            daysSinceLastInteraction: daysSinceLastInteraction,
            lastInteractionDate: lastDate ? lastDate.toISOString().slice(0, 10) : null,
            lastInteractionSubject: latestInteraction?.subject || '',
            healthScore: acc.healthScore || 59,
            tier: acc.tier || 'Strategic',
            ownerName: acc.ownerName || 'Account Owner',
            contacts: contactNames.map(name => ({ name }))
          });

          const silencePayload = {
            riskId: silenceRiskId,
            accountId: accId,
            category: 'Relationship',
            severity: sev,
            title: aiDetails.title,
            description: aiDetails.description,
            whatIsRisk: aiDetails.whatIsRisk,
            whyItHappens: aiDetails.whyItHappens,
            howToResolve: aiDetails.howToResolve,
            evidence: latestInteraction
              ? `${latestInteraction.channel || latestInteraction.type || 'Interaction'} "${latestInteraction.subject || 'Touchpoint'}"`
              : 'Zero customer touchpoints logged since account onboarding',
            evidenceLink: latestInteraction ? 'View interaction' : null,
            rule: daysSinceLastInteraction !== null
              ? `Contact gap: ${daysSinceLastInteraction} days without touchpoint`
              : 'Zero touchpoints logged since account onboarding',
            healthImpact: '-20 points',
            involved: contactNames.length > 0 ? contactNames : [acc.ownerName || 'Account Stakeholders'].filter(Boolean),
            suggested: aiDetails.suggestedActions?.[0]?.title || 'Schedule an alignment check-in with key decision-makers.',
            source: 'AI + Rules',
            confidence: aiDetails.confidence || 90,
            impact: aiDetails.impact || 'High Risk of Churn & Disengagement',
            aiInsight: aiDetails.aiInsight,
            suggestedActions: aiDetails.suggestedActions
          };

          if (!existingSilence.exists) {
            await db.collection('risks').doc(silenceRiskId).set({
              ...silencePayload,
              status: 'Open',
              createdAt: lastDate ? lastDate.toISOString() : new Date().toISOString()
            });
          } else if (existingSilence.data().status === 'Open') {
            await db.collection('risks').doc(silenceRiskId).update(silencePayload);
          }
        } else if (!isSilent && existingSilence.exists && existingSilence.data().status !== 'Resolved') {
          await db.collection('risks').doc(silenceRiskId).update({ status: 'Resolved', resolvedAt: new Date().toISOString() });
        }
      }
    } catch (syncErr) {
      console.warn('Risk sync check warning:', syncErr.message);
    }

    let snapshot;
    if (accountId) {
      snapshot = await db.collection('risks').where('accountId', '==', accountId).get();
    } else {
      snapshot = await db.collection('risks').get();
    }

    let risks = snapshot.docs.map(doc => doc.data());

    // Filter by User Profile permissions / assigned projects (Secure-by-default)
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : null;

    const isTrueAdmin = userProfile && (userProfile.userType === 'Admin' || userProfile.role === 'Admin');
    const isCeo = userProfile && (userProfile.userType === 'CEO' || userProfile.position === 'CEO' || userProfile.position === 'Chief Executive Officer');

    if (!isTrueAdmin && !isCeo) {
      const userEmail = req.user.email?.toLowerCase();
      const userName = req.user.name?.toLowerCase();

      const isMatch = (entity) => {
        if (entity.ownerId === req.user.uid || entity.assignedTo === req.user.uid || entity.userId === req.user.uid) return true;
        if (userEmail && (entity.ownerEmail?.toLowerCase() === userEmail || entity.assignedToEmail?.toLowerCase() === userEmail || entity.email?.toLowerCase() === userEmail)) return true;
        if (userName && (entity.ownerName?.toLowerCase().includes(userName.split(' ')[0]) || entity.assignedToName?.toLowerCase().includes(userName.split(' ')[0]))) return true;
        return false;
      };

      const accountsSnap = await db.collection('accounts').get();
      const accounts = accountsSnap.docs.map(doc => doc.data());

      const ownedAccountIds = new Set(
        accounts
          .filter(a => isMatch(a))
          .map(a => a.accountId || a.id)
      );

      const contactsSnap = await db.collection('contacts').get();
      const stakeholderAccountIds = new Set(
        contactsSnap.docs
          .map(d => d.data())
          .filter(c => isMatch(c))
          .map(c => c.accountId)
          .filter(Boolean)
      );

      // Only consider: 1) Account Owner, 2) Stakeholder Contact Owner
      const allowedIds = new Set([...ownedAccountIds, ...stakeholderAccountIds]);
      risks = risks.filter(r => allowedIds.has(r.accountId));
    }

    if (severity) {
      risks = risks.filter(r => r.severity === severity);
    }

    if (status) {
      risks = risks.filter(r => r.status === status);
    }

    // Enrich with company name, health, owner, renewalDays and ensure AI insights
    const enriched = await Promise.all(risks.map(async (r) => {
      const accountDoc = await db.collection('accounts').doc(r.accountId).get();
      const accData = accountDoc.exists ? accountDoc.data() : {};
      const renewalDays = accData.renewalDate ? Math.max(0, Math.floor((new Date(accData.renewalDate) - new Date()) / (1000 * 60 * 60 * 24))) : '—';

      // If existing risk lacks AI insight or description has dummy 999 or old fake strings, generate on-the-fly from real data
      let finalTitle = r.title;
      let finalDescription = r.description;
      let finalAiInsight = r.aiInsight;
      let finalImpact = r.impact;
      let finalConfidence = r.confidence;
      let finalSuggestedActions = r.suggestedActions;
      let finalWhatIsRisk = r.whatIsRisk;
      let finalWhyItHappens = r.whyItHappens;

      const hasOldFakeTemplates = (finalDescription && (
        finalDescription.includes('Automotive supply') ||
        finalDescription.includes('Engineering alignment blind spot') ||
        finalDescription.includes('In medical device and healthcare') ||
        finalDescription.includes('Payment platform collaboration') ||
        finalDescription.includes('aerospace and flight operations') ||
        finalDescription.includes('999')
      )) || (finalTitle && (
        finalTitle.includes('Automotive Program') ||
        finalTitle.includes('Healthcare Cadence Gap') ||
        finalTitle.includes('Aviation Program') ||
        finalTitle.includes('FinTech Stakeholder')
      ));

      if (!finalAiInsight || !finalWhatIsRisk || hasOldFakeTemplates) {
        try {
          const intSnap = await db.collection('interactions').where('accountId', '==', r.accountId).get();
          const interactions = intSnap.docs.map(d => d.data());
          let lastDate = null;
          let latestInteraction = null;
          for (const i of interactions) {
            const dStr = i.date || i.timestamp;
            if (!dStr) continue;
            const d = new Date(dStr);
            if (!isNaN(d.getTime())) {
              if (!lastDate || d > lastDate) {
                lastDate = d;
                latestInteraction = i;
              }
            }
          }
          const daysSinceLastInteraction = lastDate
            ? Math.floor((new Date().getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
            : null;

          const aiGen = await generateRiskAiDetails({
            companyName: accData.companyName || 'Account',
            category: r.category || 'Relationship',
            severity: r.severity || 'High',
            conditionType: (r.category || '').toLowerCase().includes('delivery') ? 'overdue_task' : 'silence',
            taskTitle: r.title || 'Customer action item',
            daysSinceLastInteraction,
            lastInteractionDate: lastDate ? lastDate.toISOString().slice(0, 10) : null,
            lastInteractionSubject: latestInteraction?.subject || '',
            healthScore: accData.healthScore || 59,
            tier: accData.tier || 'Strategic',
            ownerName: accData.ownerName || 'Account Lead'
          });

          finalTitle = aiGen.title;
          finalDescription = aiGen.description;
          finalWhatIsRisk = aiGen.whatIsRisk;
          finalWhyItHappens = aiGen.whyItHappens;
          finalAiInsight = aiGen.aiInsight;
          finalImpact = aiGen.impact;
          finalConfidence = aiGen.confidence;
          finalSuggestedActions = aiGen.suggestedActions;

          // Save cleaned, real data back to PostgreSQL database
          try {
            await db.collection('risks').doc(r.riskId || r.id).update({
              title: finalTitle,
              description: finalDescription,
              whatIsRisk: finalWhatIsRisk,
              whyItHappens: finalWhyItHappens,
              howToResolve: finalSuggestedActions,
              suggestedActions: finalSuggestedActions,
              aiInsight: finalAiInsight,
              impact: finalImpact,
              confidence: finalConfidence
            });
          } catch (updErr) { }
        } catch (e) { }
      }

      // Ensure suggestedActions and involved are parsed if stored as JSON strings
      if (typeof finalSuggestedActions === 'string') {
        try {
          finalSuggestedActions = JSON.parse(finalSuggestedActions);
        } catch (e) {
          finalSuggestedActions = [];
        }
      }

      let finalInvolved = r.involved;
      if (typeof finalInvolved === 'string') {
        try {
          finalInvolved = JSON.parse(finalInvolved);
        } catch (e) {
          finalInvolved = [finalInvolved];
        }
      }
      if (!Array.isArray(finalInvolved)) {
        finalInvolved = finalInvolved ? [finalInvolved] : [];
      }

      return {
        ...r,
        title: finalTitle || r.title || `${r.category || 'Account'} Risk`,
        description: finalWhatIsRisk || finalDescription,
        whatIsRisk: finalWhatIsRisk || finalDescription,
        whyItHappens: finalWhyItHappens || finalAiInsight || r.rule,
        howToResolve: finalSuggestedActions,
        aiInsight: finalWhyItHappens || finalAiInsight,
        impact: finalImpact || 'Relationship Friction & Churn Vulnerability',
        confidence: finalConfidence || 91,
        suggestedActions: Array.isArray(finalSuggestedActions) && finalSuggestedActions.length > 0
          ? finalSuggestedActions
          : [
            { title: 'Coordinate an alignment sync with account owner', due: 'Within 3 days' },
            { title: 'Review open deliverables and relationship milestones', due: 'Within 1 week' }
          ],
        involved: finalInvolved,
        companyName: accData.companyName || 'Unknown Company',
        health: accData.healthScore !== undefined ? accData.healthScore : 50,
        healthChange: accData.scoreTrend || 0,
        ownerName: accData.ownerName || r.ownerName || 'Unassigned',
        renewalDays
      };
    }));

    return res.json(enriched);
  } catch (error) {
    console.error('Error fetching risks:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/risks/notify/recipients?accountId=
 * Preview who will receive a Notify, based on the current user's role on the account.
 */
router.get('/notify/recipients', async (req, res) => {
  try {
    const { accountId } = req.query;
    if (!accountId) return res.status(400).json({ error: 'accountId is required.' });
    const routing = await resolveNotifyRouting(accountId, req.user);
    const notifiedKeys = await getNotifiedRiskKeys(accountId);
    return res.json({
      senderRole: routing.sender.role,
      canNotify: Boolean(routing.sender.role) && routing.recipients.length > 0,
      recipients: routing.recipients.map(r => ({ uid: r.uid, name: r.name, email: r.email, roles: r.roles })),
      notifiedKeys
    });
  } catch (error) {
    console.error('Error resolving notify recipients:', error);
    return res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * POST /api/risks/notify
 * Body: { accountId, risk: { riskId?, key?, title, severity, category, description, suggested } }
 */
router.post('/notify', async (req, res) => {
  try {
    const { accountId, risk } = req.body || {};
    if (!accountId) return res.status(400).json({ error: 'accountId is required.' });
    const result = await sendRiskNotification({ accountId, risk }, req.user);
    return res.json(result);
  } catch (error) {
    console.error('Error sending risk notification:', error);
    return res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * PUT /api/risks/:id
 * Update risk status (e.g. resolve it)
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { status, description, severity } = req.body;

  try {
    const docRef = db.collection('risks').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Risk not found' });
    }

    const currentRisk = doc.data();

    // Verify user is associated with the company
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : null;
    const isTrueAdmin = userProfile && (userProfile.userType === 'Admin' || userProfile.role === 'Admin');
    const isCeo = userProfile && (userProfile.userType === 'CEO' || userProfile.position === 'CEO' || userProfile.position === 'Chief Executive Officer');

    if (!isTrueAdmin && !isCeo) {
      const userEmail = req.user.email?.toLowerCase();
      const userName = req.user.name?.toLowerCase();

      const isMatch = (entityId, entityEmail, entityName) => {
        if (entityId === req.user.uid) return true;
        if (userEmail && entityEmail?.toLowerCase() === userEmail) return true;
        if (userName && entityName?.toLowerCase().includes(userName.split(' ')[0])) return true;
        return false;
      };

      const accountDoc = await db.collection('accounts').doc(currentRisk.accountId).get();
      const accountOwnerId = accountDoc.exists ? accountDoc.data().ownerId : null;
      const accountOwnerEmail = accountDoc.exists ? accountDoc.data().ownerEmail : null;
      const accountOwnerName = accountDoc.exists ? accountDoc.data().ownerName : null;

      const isAccountOwner = isMatch(accountOwnerId, accountOwnerEmail, accountOwnerName);

      const contactsSnap = await db.collection('contacts').get();
      const isStakeholder = contactsSnap.docs.some(d => {
        const contact = d.data();
        return contact.accountId === currentRisk.accountId && isMatch(contact.ownerId, contact.ownerEmail, contact.ownerName);
      });

      if (!isAccountOwner && !isStakeholder) {
        return res.status(403).json({ error: 'Forbidden: You are not associated with this company.' });
      }
    }

    const updates = {};
    if (status) {
      updates.status = status; // e.g. 'Resolved', 'Acknowledged', 'Open'
      if (status === 'Resolved') {
        updates.resolvedBy = req.user.name || 'Admin';
        updates.resolvedAt = new Date().toISOString();
      } else if (status === 'Acknowledged') {
        updates.acknowledgedBy = req.user.name || 'Admin';
        updates.acknowledgedAt = new Date().toISOString();
      } else {
        updates.resolvedBy = null;
        updates.resolvedAt = null;
      }
    }
    if (description !== undefined) updates.description = description;
    if (severity !== undefined) updates.severity = severity;
    if (req.body.title !== undefined) updates.title = req.body.title;

    await docRef.update(updates);

    // Notify of risk resolution status
    if (status === 'Resolved') {
      const notificationId = 'notif-' + Math.random().toString(36).substring(2, 11);
      await db.collection('notifications').doc(notificationId).set({
        notificationId,
        accountId: currentRisk.accountId,
        type: 'Risk Resolved',
        message: `Risk [${currentRisk.category}] resolved successfully.`,
        severity: 'Low',
        read: false,
        date: getSystemDateString(),
        time: getSystemTimeString(),
        timestamp: new Date().toISOString()
      });
    }

    // Recalculate health since a risk is resolved/updated
    await calculateAccountHealth(currentRisk.accountId);

    const updatedDoc = await docRef.get();
    await logActivity(req.user.uid, req.user.name, 'Resolve Risk', `Updated risk ID ${id} status to: ${status || 'Updated'}. Description: ${description || 'None'}`);
    return res.json(updatedDoc.data());
  } catch (error) {
    console.error('Error updating risk:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/risks
 * Create a new risk manually
 */
router.post('/', async (req, res) => {
  try {
    const { accountId, category, severity, description, dueDate, ownerId, source = 'Manual', title, suggested } = req.body;

    if (!accountId || !category || !severity) {
      return res.status(400).json({ error: 'accountId, category, and severity are required.' });
    }

    const riskId = 'risk-' + Math.random().toString(36).substring(2, 11);

    const newRisk = {
      riskId,
      accountId,
      category,
      severity,
      title: title || category,
      description: description || '',
      status: 'Open',
      source,
      suggested: suggested || 'Follow up with customer stakeholder.',
      dueDate: dueDate || null,
      ownerId: ownerId || req.user.uid,
      assignedToName: req.user.name || 'Admin User',
      createdAt: new Date().toISOString()
    };

    await db.collection('risks').doc(riskId).set(newRisk);

    // Recalculate health score for this account
    await calculateAccountHealth(accountId);

    await logActivity(req.user.uid, req.user.name, 'Create Risk', `Manually created risk ${category} for account ${accountId}`);

    return res.status(201).json(newRisk);
  } catch (error) {
    console.error('Error creating risk:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/risks/:id
 * Delete a risk
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const docRef = db.collection('risks').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Risk not found' });
    }

    const accountId = doc.data().accountId;
    await docRef.delete();

    // Recalculate health
    await calculateAccountHealth(accountId);

    await logActivity(req.user.uid, req.user.name, 'Delete Risk', `Deleted risk ID ${id}`);

    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting risk:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/risks/rules
 * Fetch active risk rules
 */
router.get('/rules', async (req, res) => {
  try {
    const snap = await db.collection('risk_rules').get();
    const rules = snap.docs.map(d => d.data());
    return res.json(rules);
  } catch (error) {
    console.error('Error fetching risk rules:', error);
    return res.json([]);
  }
});

/**
 * POST /api/risks/rules
 * Save or update risk configuration rules
 */
router.post('/rules', async (req, res) => {
  try {
    const { rules } = req.body;
    if (Array.isArray(rules)) {
      for (const r of rules) {
        const id = r.id || `rule-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        await db.collection('risk_rules').doc(id).set({
          id,
          name: r.title || r.name || 'Custom Rule',
          conditions: { description: r.description || '' },
          severity: r.severity || 'High',
          enabled: Boolean(r.enabled),
          created_at: r.created_at || new Date().toISOString()
        });
      }
    }
    return res.json({ success: true, count: rules?.length || 0 });
  } catch (error) {
    console.error('Error saving risk rules:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;

