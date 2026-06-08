import { Router } from 'express';
import { db } from '../config/firebase.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { analyzeCommunication } from '../services/ai.service.js';
import { calculateAccountHealth } from '../services/health.service.js';

const router = Router();

// Require auth
router.use(authenticateToken);

/**
 * GET /api/interactions
 * Get activity feed with optional accountId filter, source filters, and limit-based pagination.
 */
router.get('/', async (req, res) => {
  try {
    const { accountId, source, beforeTimestamp, limit = 20 } = req.query;

    let snapshot;
    if (accountId) {
      snapshot = await db.collection('interactions').where('accountId', '==', accountId).get();
    } else {
      snapshot = await db.collection('interactions').get();
    }

    let interactions = snapshot.docs.map(doc => doc.data());

    // Filter by source
    if (source) {
      interactions = interactions.filter(i => i.source === source);
    }

    // Filter by timestamp for infinite scroll
    if (beforeTimestamp) {
      interactions = interactions.filter(i => i.timestamp < beforeTimestamp);
    }

    // Sort descending by timestamp
    interactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit output
    const limitedInteractions = interactions.slice(0, parseInt(limit));

    // Enrich with contact name and account name if needed
    const enriched = await Promise.all(limitedInteractions.map(async (i) => {
      const contactDoc = await db.collection('contacts').doc(i.contactId).get();
      const accountDoc = await db.collection('accounts').doc(i.accountId).get();
      return {
        ...i,
        contactName: contactDoc.exists ? contactDoc.data().name : 'System/Unknown',
        companyName: accountDoc.exists ? accountDoc.data().companyName : 'External Account'
      };
    }));

    return res.json(enriched);
  } catch (error) {
    console.error('Error fetching interactions timeline:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/interactions
 * Create manual interaction. Triggers AI Engine, saves risks/notifications, updates health.
 */
router.post('/', async (req, res) => {
  const { accountId, contactId, source, messageText, timestamp, subject, date, time, actionMentions } = req.body;

  if (!accountId || !contactId || !source || !messageText) {
    return res.status(400).json({ error: 'Missing accountId, contactId, source, or messageText' });
  }

  try {
    // Verify account and contact exist
    const accountDoc = await db.collection('accounts').doc(accountId).get();
    if (!accountDoc.exists) return res.status(404).json({ error: 'Account not found' });

    const contactDoc = await db.collection('contacts').doc(contactId).get();
    if (!contactDoc.exists) return res.status(404).json({ error: 'Contact not found' });

    // Run AI Engine Analysis
    const analysis = await analyzeCommunication(messageText);

    const interactionId = 'int-' + Math.random().toString(36).substring(2, 11);
    const newInteraction = {
      interactionId,
      accountId,
      contactId,
      source,
      subject: subject || '',
      messageText,
      date: date || new Date().toISOString().split('T')[0],
      time: time || new Date().toTimeString().slice(0, 5),
      actionMentions: actionMentions || [],
      sentiment: analysis.sentiment,
      riskDetected: analysis.riskLevel === 'High' || analysis.riskLevel === 'Medium',
      riskCategory: analysis.riskCategory || '',
      timestamp: timestamp || new Date().toISOString()
    };

    await db.collection('interactions').doc(interactionId).set(newInteraction);

    // Handle risk detection
    if (newInteraction.riskDetected) {
      const riskId = 'risk-' + Math.random().toString(36).substring(2, 11);
      await db.collection('risks').doc(riskId).set({
        riskId,
        accountId,
        category: analysis.riskCategory,
        severity: analysis.riskLevel,
        description: analysis.summary,
        status: 'Open',
        createdAt: new Date().toISOString()
      });

      // Add warning real-time notification
      const notificationId = 'notif-' + Math.random().toString(36).substring(2, 11);
      await db.collection('notifications').doc(notificationId).set({
        notificationId,
        accountId,
        type: 'New Risk',
        message: `New risk alert detected: [${analysis.riskCategory}] - ${analysis.summary}`,
        severity: analysis.riskLevel,
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    // Add generic activity feed notification
    const notificationId = 'notif-' + Math.random().toString(36).substring(2, 11);
    await db.collection('notifications').doc(notificationId).set({
      notificationId,
      accountId,
      type: 'New Interaction',
      message: `New interaction (${source}) logged for ${accountDoc.data().companyName}`,
      severity: 'Low',
      read: false,
      timestamp: new Date().toISOString()
    });

    // Recalculate health
    const updatedHealth = await calculateAccountHealth(accountId);

    return res.status(201).json({
      interaction: newInteraction,
      analysis,
      health: updatedHealth
    });
  } catch (error) {
    console.error('Error logging interaction:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
