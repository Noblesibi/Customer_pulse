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

    // Filter by User Profile permissions / assigned projects (Secure-by-default)
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : null;

    const isAdmin = req.user.role === 'Admin' || (userProfile && (userProfile.userType === 'Admin' || userProfile.role === 'Admin'));
    const isCeo = userProfile && userProfile.userType === 'CEO';

    if (!isAdmin && !isCeo) {
      const accountsSnap = await db.collection('accounts').get();
      let accounts = accountsSnap.docs.map(doc => doc.data());

      if (userProfile && userProfile.userType === 'BU Head') {
        const targetBu = userProfile.bu || '';
        const targetProjects = userProfile.projects || [];
        accounts = accounts.filter(a => 
          (targetBu && a.industry.toLowerCase() === targetBu.toLowerCase()) || 
          (targetProjects.length > 0 && targetProjects.some(tp => {
            const tpName = typeof tp === 'string' ? tp : tp.name;
            return tpName && (a.companyName.toLowerCase().includes(tpName.toLowerCase()) || tpName.toLowerCase().includes(a.companyName.toLowerCase()));
          }))
        );
      } else {
        // Fallback filter for Functional Heads, Project Managers, Delivery Heads, Employees, etc.
        const projectsList = userProfile ? (userProfile.projects || []) : [];
        const targetProjects = projectsList.map(p => typeof p === 'string' ? p : p.name).filter(Boolean);
        
        accounts = accounts.filter(a => 
          targetProjects.some(tp => 
            a.companyName.toLowerCase().includes(tp.toLowerCase()) || 
            tp.toLowerCase().includes(a.companyName.toLowerCase())
          )
        );
      }

      const allowedAccountIds = accounts.map(a => a.accountId || a.id);
      interactions = interactions.filter(i => allowedAccountIds.includes(i.accountId));
    }

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

    // Enrich with contact name, account name and notifications
    const enriched = await Promise.all(limitedInteractions.map(async (i) => {
      const contactDoc = await db.collection('contacts').doc(i.contactId).get();
      const accountDoc = await db.collection('accounts').doc(i.accountId).get();
      
      let notifications = [];
      try {
        const notifSnap = await db.collection('notifications').where('interactionId', '==', i.interactionId).get();
        notifications = notifSnap.docs.map(doc => doc.data());
      } catch (err) {
        console.error('Error fetching notifications for interaction:', err);
      }

      return {
        ...i,
        contactName: contactDoc.exists ? contactDoc.data().name : 'System/Unknown',
        companyName: accountDoc.exists ? accountDoc.data().companyName : 'External Account',
        notifications
      };
    }));

    return res.json(enriched);
  } catch (error) {
    console.error('Error fetching interactions timeline:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/interactions/my-tasks
 * Returns all interactions where the current user is mentioned in actionMentions.
 */
router.get('/my-tasks', async (req, res) => {
  try {
    const uid = req.user.uid;
    const snapshot = await db.collection('interactions').get();
    const all = snapshot.docs.map(doc => doc.data());

    // Filter interactions where the user is in actionMentions
    const myTasks = all.filter(i =>
      Array.isArray(i.actionMentions) && i.actionMentions.some(m => m.uid === uid)
    );

    // Sort newest first
    myTasks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Enrich with company name and assigner info
    const enriched = await Promise.all(myTasks.map(async (i) => {
      const accountDoc = await db.collection('accounts').doc(i.accountId).get();
      // Fetch replies for this interaction to check status
      const repliesSnap = await db.collection('interactions').doc(i.interactionId).collection('replies').get();
      const replies = repliesSnap.docs.map(d => d.data());
      const myReply = replies.find(r => r.authorUid === uid);
      return {
        ...i,
        companyName: accountDoc.exists ? accountDoc.data().companyName : 'Unknown',
        replyStatus: myReply ? 'Replied' : 'Pending',
        replies
      };
    }));

    return res.json(enriched);
  } catch (error) {
    console.error('Error fetching my tasks:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/interactions/:id/replies
 * Returns all replies for a given interaction.
 */
router.get('/:id/replies', async (req, res) => {
  try {
    const { id } = req.params;
    const snap = await db.collection('interactions').doc(id).collection('replies').get();

    const replies = snap.docs.map(d => d.data());
    replies.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return res.json(replies);
  } catch (error) {
    console.error('Error fetching replies:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/interactions/:id/reply
 * Melbin (or any mentioned user) posts a reply to an interaction.
 * Fires a notification back to admin/all-admin users.
 */
router.post('/:id/reply', async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Reply text is required.' });

    const interactionDoc = await db.collection('interactions').doc(id).get();
    if (!interactionDoc.exists) return res.status(404).json({ error: 'Interaction not found.' });

    const interaction = interactionDoc.data();

    const replyId = 'reply-' + Math.random().toString(36).substring(2, 11);
    const reply = {
      replyId,
      interactionId: id,
      authorUid: req.user.uid,
      authorName: req.user.name || req.user.email,
      text: text.trim(),
      timestamp: new Date().toISOString()
    };

    // Save reply to sub-collection
    await db.collection('interactions').doc(id).collection('replies').doc(replyId).set(reply);

    // Notify all admins that a reply has been posted
    const adminSnap = await db.collection('users').where('role', '==', 'Admin').get();
    const notifPromises = adminSnap.docs.map(adminDoc => {
      const adminData = adminDoc.data();
      const notifId = 'notif-' + Math.random().toString(36).substring(2, 11);
      return db.collection('notifications').doc(notifId).set({
        notificationId: notifId,
        toUserId: adminData.uid,
        type: 'Task Reply',
        accountId: interaction.accountId,
        interactionId: id,
        message: `${reply.authorName} replied to the task for ${interaction.subject || 'an interaction'}: "${text.slice(0, 80)}"`,
        read: false,
        readAt: null,
        timestamp: new Date().toISOString()
      });
    });
    await Promise.all(notifPromises);

    return res.status(201).json(reply);
  } catch (error) {
    console.error('Error saving reply:', error);
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

    const companyName = accountDoc.data().companyName;
    const loggedByName = req.user.name || req.user.email;

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
      loggedByUid: req.user.uid,
      loggedByName,
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

      // Add risk notification (system-wide, no toUserId = visible to all admins)
      const riskNotifId = 'notif-' + Math.random().toString(36).substring(2, 11);
      await db.collection('notifications').doc(riskNotifId).set({
        notificationId: riskNotifId,
        accountId,
        type: 'New Risk',
        message: `New risk alert detected: [${analysis.riskCategory}] - ${analysis.summary}`,
        severity: analysis.riskLevel,
        read: false,
        readAt: null,
        timestamp: new Date().toISOString()
      });
    }

    // Add generic activity feed notification (system-wide)
    const activityNotifId = 'notif-' + Math.random().toString(36).substring(2, 11);
    await db.collection('notifications').doc(activityNotifId).set({
      notificationId: activityNotifId,
      accountId,
      type: 'New Interaction',
      message: `New interaction (${source}) logged for ${companyName}`,
      severity: 'Low',
      read: false,
      readAt: null,
      timestamp: new Date().toISOString()
    });

    // ── MENTION TASK NOTIFICATIONS ──
    // Create a personal task notification for each @mentioned staff member
    let mentionNotifications = [];
    if (actionMentions && actionMentions.length > 0) {
      const mentionNotifPromises = actionMentions.map(async (mention) => {
        const taskNotifId = 'notif-' + Math.random().toString(36).substring(2, 11);
        const taskText = mention.task || (messageText.slice(0, 100) + (messageText.length > 100 ? '...' : ''));
        const message = `${loggedByName} assigned you a task for ${companyName}: "${taskText}"`;
        const notifDoc = {
          notificationId: taskNotifId,
          toUserId: mention.uid,           // Personal — only Melbin sees this
          type: 'Task Assigned',
          accountId,
          interactionId,
          message,
          read: false,
          readAt: null,
          timestamp: new Date().toISOString()
        };
        await db.collection('notifications').doc(taskNotifId).set(notifDoc);
        return notifDoc;
      });
      mentionNotifications = await Promise.all(mentionNotifPromises);
    }

    // Recalculate health
    const updatedHealth = await calculateAccountHealth(accountId);

    return res.status(201).json({
      interaction: {
        ...newInteraction,
        notifications: mentionNotifications
      },
      analysis,
      health: updatedHealth
    });
  } catch (error) {
    console.error('Error logging interaction:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
