import { Router } from 'express';
import { generateTaskHeader, generateContactReconnectBrief, generateActivityNextSteps, generateSmartHealthAnalysis } from '../services/ai.service.js';
import { db } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();
router.use(authenticateToken);

/**
 * POST /api/ai/health-insights
 * Generates an executive, AI-synthesized health explanation ("Why this score?"),
 * "What's happening", and "Why it matters" using Gemini AI / smart relationship synthesis.
 */
router.post('/health-insights', async (req, res) => {
  try {
    const {
      accountName,
      industry,
      journeyStage,
      healthScore,
      status,
      factors,
      overdueTasks,
      openRisks,
      recentInteractions,
      contacts
    } = req.body || {};

    const analysis = await generateSmartHealthAnalysis({
      accountName,
      industry,
      journeyStage,
      healthScore,
      status,
      factors,
      overdueTasks,
      openRisks,
      recentInteractions,
      contacts
    });

    return res.json(analysis);
  } catch (err) {
    console.error('Error generating AI health insights:', err);
    return res.status(500).json({ error: 'Failed to generate AI health insights' });
  }
});

/**
 * POST /api/ai/generate-task-header
 * Expects { description } in the request body.
 * Generates and returns a clean, concise task header.
 */
router.post('/generate-task-header', async (req, res) => {
  const { description } = req.body;
  if (!description) {
    return res.status(400).json({ error: 'Missing description' });
  }

  try {
    const header = await generateTaskHeader(description);
    return res.json({ header });
  } catch (error) {
    console.error('Error generating task header:', error);
    return res.status(500).json({ error: 'Failed to generate task header' });
  }
});

/**
 * POST /api/ai/activity-next-steps
 * Generates AI Recommended Next Steps, Risk Analysis, and Health Impact
 * for an interaction, email, meeting transcript, or staff task.
 */
router.post('/activity-next-steps', async (req, res) => {
  try {
    const { title, content, type, source, accountName, contactName, status, priority, sentiment } = req.body || {};
    const result = await generateActivityNextSteps({
      title,
      content,
      type,
      source,
      accountName,
      contactName,
      status,
      priority,
      sentiment
    });
    return res.json(result);
  } catch (err) {
    console.error('Error generating AI activity next steps:', err);
    return res.status(500).json({ error: 'Failed to generate AI next steps' });
  }
});

router.post('/suggest-mapping', async (req, res) => {
  const { headers, sampleRow } = req.body;
  if (!headers || !Array.isArray(headers)) {
    return res.status(400).json({ error: 'Missing or invalid headers array' });
  }

  try {
    const { suggestColumnMapping } = await import('../services/ai.service.js');
    const mapping = await suggestColumnMapping(headers, sampleRow);
    return res.json({ mapping });
  } catch (error) {
    console.error('Error suggesting mapping:', error);
    return res.status(500).json({ error: 'Failed to suggest mapping' });
  }
});

/**
 * POST /api/ai/contact-reconnect-brief
 * Queries real PostgreSQL account, contact, interaction, email, task, and risk records
 * and generates an AI + DB grounded reconnect / outreach task brief for the Assign Task drawer.
 */
router.post('/contact-reconnect-brief', async (req, res) => {
  const { accountId, contactId } = req.body || {};
  if (!accountId || !contactId) {
    return res.status(400).json({ error: 'accountId and contactId are required' });
  }

  const fmtDDMMYYYY = (val) => {
    if (!val) return null;
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  try {
    const [accountDoc, contactDoc, intSnap, emailSnap, riskSnap, taskSnap] = await Promise.all([
      db.collection('accounts').doc(accountId).get(),
      db.collection('contacts').doc(contactId).get(),
      db.collection('interactions').where('accountId', '==', accountId).get(),
      db.collection('emaillogs').get(),
      db.collection('risks').where('accountId', '==', accountId).get(),
      db.collection('tasks').where('accountId', '==', accountId).get()
    ]);

    const account = accountDoc.exists ? accountDoc.data() : {};
    const contact = contactDoc.exists ? contactDoc.data() : {};
    const contactEmail = (contact.email || '').toLowerCase().trim();

    const dbInteractions = intSnap.docs
      .map(d => d.data())
      .filter(i => !(i.interactionId || '').includes('dummy'));

    const matchedInteractions = dbInteractions.filter(i => {
      if (i.contactId === contactId) return true;
      if (Array.isArray(i.participants) && i.participants.some(p => p.contactId === contactId || (contactEmail && (p.email || '').toLowerCase() === contactEmail))) return true;
      if (Array.isArray(i.to) && i.to.some(t => typeof t === 'object' ? (t.contactId === contactId || (contactEmail && (t.email || '').toLowerCase() === contactEmail)) : (contactEmail && String(t).toLowerCase().includes(contactEmail)))) return true;
      return false;
    });

    const matchedEmails = emailSnap.docs
      .map(d => d.data())
      .filter(e =>
        !e.isMock &&
        String(e.relatedAccountId || '') === String(accountId) &&
        (
          e.relatedContactId === contactId ||
          (contactEmail && String(e.toEmail || e.recipientEmail || '').toLowerCase().includes(contactEmail))
        )
      )
      .map(e => ({
        subject: e.subject || 'System Email',
        source: 'System Email',
        timestamp: e.sentAt || e.createdAt,
        summary: e.htmlBody ? e.htmlBody.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>?/gm, '').trim().substring(0, 180) : ''
      }));

    const matchedTasks = taskSnap.docs
      .map(d => d.data())
      .filter(t => !(t.taskId || '').includes('DUMMY') && t.contactId === contactId)
      .map(t => ({
        subject: t.title || t.taskHeader || 'Assigned Task',
        source: `Task (${t.status || 'Open'})`,
        timestamp: t.timestamp || t.createdAt || t.dueDate,
        summary: t.description || t.task || ''
      }));

    const combinedContactActivities = [
      ...matchedInteractions.map(i => ({
        subject: i.subject || i.title || i.channel || i.source || 'Customer Interaction',
        source: i.channel || i.source || 'Interaction',
        timestamp: i.timestamp || i.date,
        sentiment: i.sentiment || 'Neutral',
        riskCategory: i.riskCategory || '',
        concerns: Array.isArray(i.concerns) ? i.concerns : [],
        followUpSignals: Array.isArray(i.followUpSignals) ? i.followUpSignals : [],
        requirements: Array.isArray(i.requirements) ? i.requirements : [],
        summary: i.summary || i.notes || i.details || i.messageText || ''
      })),
      ...matchedEmails,
      ...matchedTasks
    ].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recent30 = combinedContactActivities.filter(a => a.timestamp && new Date(a.timestamp) >= thirtyDaysAgo);
    const interactionCount30d = recent30.length;

    let engagementStatus = 'Not Engaged';
    if (interactionCount30d > 3) engagementStatus = 'Active';
    else if (interactionCount30d > 0) engagementStatus = 'Needs Attention';

    const latest = combinedContactActivities[0] || null;
    let lastActivityDate = null;
    let daysSinceLast = null;
    if (latest && latest.timestamp) {
      const lDate = new Date(latest.timestamp);
      if (!isNaN(lDate.getTime())) {
        lastActivityDate = fmtDDMMYYYY(lDate);
        daysSinceLast = Math.ceil(Math.abs(now - lDate) / (1000 * 60 * 60 * 24));
      }
    }

    const openRisks = riskSnap.docs
      .map(d => d.data())
      .filter(r => r.status !== 'Resolved')
      .map(r => ({
        severity: r.severity || 'Medium',
        category: r.category || 'Account Risk',
        description: r.description || ''
      }));

    const detectedConcerns = [];
    matchedInteractions.forEach(i => {
      if (i.riskCategory) detectedConcerns.push(`${i.riskCategory}${i.summary ? `: ${i.summary}` : ''}`);
      if (Array.isArray(i.concerns)) i.concerns.forEach(c => detectedConcerns.push(c));
      if (Array.isArray(i.followUpSignals)) i.followUpSignals.forEach(f => detectedConcerns.push(f));
      if (Array.isArray(i.requirements)) i.requirements.forEach(reqItem => detectedConcerns.push(reqItem));
      if (i.sentiment === 'Negative' && (i.subject || i.notes)) {
        detectedConcerns.push(`Negative sentiment noted in "${i.subject || 'recent interaction'}"`);
      }
    });

    const brief = await generateContactReconnectBrief({
      contactName: contact.name || 'Key Contact',
      designation: contact.designation || '',
      influenceTag: contact.influenceTag || '',
      companyName: account.companyName || 'Account',
      journeyStage: account.journeyStage || 'Awareness',
      engagementStatus,
      interactionCount30d,
      totalActivities: combinedContactActivities.length,
      lastActivityDate,
      daysSinceLast,
      lastActivityTitle: latest ? latest.subject : '',
      lastActivityChannel: latest ? latest.source : '',
      recentActivities: combinedContactActivities.slice(0, 5).map(a => ({
        date: fmtDDMMYYYY(a.timestamp),
        source: a.source,
        subject: a.subject,
        sentiment: a.sentiment || 'Neutral',
        summary: String(a.summary || '').substring(0, 140)
      })),
      openRisks,
      detectedConcerns
    });

    return res.json(brief);
  } catch (error) {
    console.error('Error generating contact reconnect brief:', error);
    return res.status(500).json({ error: 'Failed to generate contact reconnect brief' });
  }
});

export default router;
