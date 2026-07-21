import { Router } from 'express';
import { db, logActivity } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { analyzeCommunication, generateTaskHeader } from '../services/ai.service.js';
import { calculateAccountHealth } from '../services/health.service.js';
import { sendTaskAssignmentEmail } from '../services/email.service.js';
import fs from 'fs';
import path from 'path';

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

    const isTrueAdmin = userProfile && (userProfile.userType === 'Admin' || userProfile.role === 'Admin');
    const isCeo = userProfile && (userProfile.userType === 'CEO' || userProfile.position === 'CEO' || userProfile.position === 'Chief Executive Officer');

    if (!isTrueAdmin && !isCeo) {
      const accountsSnap = await db.collection('accounts').get();
      const accounts = accountsSnap.docs.map(doc => doc.data());

      const ownedAccountIds = new Set(
        accounts
          .filter(a => a.ownerId === req.user.uid)
          .map(a => a.accountId || a.id)
      );

      const contactsSnap = await db.collection('contacts').get();
      const stakeholderAccountIds = new Set(
        contactsSnap.docs
          .map(d => d.data())
          .filter(c => c.ownerId === req.user.uid)
          .map(c => c.accountId)
      );

      const allowedIds = new Set([...ownedAccountIds, ...stakeholderAccountIds]);
      interactions = interactions.filter(i =>
        allowedIds.has(i.accountId) ||
        (Array.isArray(i.actionMentions) && i.actionMentions.some(m => m.uid === req.user.uid))
      );
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

    // Enrich with contact name, account name, notifications and replies
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

      let replies = [];
      try {
        const repliesSnap = await db.collection('interactions').doc(i.interactionId).collection('replies').get();
        replies = repliesSnap.docs.map(doc => doc.data());
      } catch (err) {
        console.error('Error fetching replies for interaction:', err);
      }

      return {
        ...i,
        contactName: contactDoc.exists ? contactDoc.data().name : 'System/Unknown',
        companyName: accountDoc.exists ? accountDoc.data().companyName : 'External Account',
        notifications,
        replies
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
 * PUT /api/interactions/:id/task-status
 * Updates the status of an assigned task mention.
 */
router.put('/:id/task-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { mentionUid, status, forwardToUid, forwardToName, completionNote, completionDate } = req.body;

    if (!mentionUid || !status) {
      return res.status(400).json({ error: 'mentionUid and status are required.' });
    }

    const doc = await db.collection('interactions').doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Interaction not found.' });

    const interaction = doc.data();
    let actionMentions = interaction.actionMentions || [];

    let updated = false;
    let targetMentionTask = '';
    let originalDueDate = null;
    let originalPriority = 'Medium';

    actionMentions = actionMentions.map(m => {
      if (m.uid === mentionUid) {
        updated = true;
        targetMentionTask = m.task;
        originalDueDate = m.dueDate || null;
        originalPriority = m.priority || 'Medium';
        
        const updatedMention = { ...m, status };
        if (completionNote !== undefined) {
          updatedMention.completionNote = completionNote;
          updatedMention.comments = completionNote;
        }
        if (status === 'Completed') {
          updatedMention.completionDate = completionDate || new Date().toISOString().split('T')[0];
        }
        if (status === 'Forwarded' && forwardToUid && forwardToName) {
          updatedMention.forwardedToUid = forwardToUid;
          updatedMention.forwardedToName = forwardToName;
        }
        return updatedMention;
      }
      return m;
    });

    if (!updated) {
      return res.status(404).json({ error: 'Task mention not found for this user in this interaction.' });
    }

    if (status === 'Forwarded' && forwardToUid && forwardToName) {
      // Only add if not already present (prevent duplicates on re-forward)
      const alreadyMentioned = actionMentions.some(m => m.uid === forwardToUid && m.status === 'Task Assigned');
      let header = '';
      if (!alreadyMentioned) {
        header = await generateTaskHeader(targetMentionTask);
        actionMentions.push({
          uid: forwardToUid,
          name: forwardToName,
          task: targetMentionTask,
          taskHeader: header,
          status: 'Task Assigned',
          dueDate: originalDueDate,
          priority: originalPriority,
          comments: '',
          completionDate: null
        });
      } else {
        const existing = actionMentions.find(m => m.uid === forwardToUid && m.status === 'Task Assigned');
        header = existing?.taskHeader || '';
      }

      const notifId = 'notif-' + Math.random().toString(36).substring(2, 11);
      await db.collection('notifications').doc(notifId).set({
        notificationId: notifId,
        toUserId: forwardToUid,
        accountId: interaction.accountId,
        interactionId: id,
        type: 'Task Assigned',
        message: `${req.user.name} forwarded a task to you: "${targetMentionTask}"`,
        read: false,
        timestamp: new Date().toISOString()
      });

      // Send email alert asynchronously
      sendTaskAssignmentEmail(forwardToUid, {
        task: targetMentionTask,
        taskHeader: header,
        accountName: interaction.companyName || 'External Account',
        priority: originalPriority,
        dueDate: originalDueDate,
        assignerName: req.user.name || req.user.email
      });
    }

    await db.collection('interactions').doc(id).update({ actionMentions });

    // Recalculate account health upon task status change
    await calculateAccountHealth(interaction.accountId);

    await logActivity(
      req.user.uid,
      req.user.name,
      'Update Task Status',
      `Updated task status to "${status}" in interaction "${interaction.subject || 'Interaction'}"`
    );

    return res.json({ success: true, actionMentions });
  } catch (error) {
    console.error('Error updating task status:', error);
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

    await logActivity(req.user.uid, req.user.name, 'Reply to Interaction', `Replied to task for interaction: "${text.slice(0, 55)}${text.length > 55 ? '...' : ''}"`);
    return res.status(201).json(reply);
  } catch (error) {
    console.error('Error saving reply:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/interactions/upload
 * Accept base64 encoded file and save it locally to /uploads.
 */
router.post('/upload', async (req, res) => {
  try {
    const { name, type, base64 } = req.body;
    if (!name || !base64) {
      return res.status(400).json({ error: 'name and base64 string are required' });
    }

    // Ensure uploads directory exists
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Clean filename and generate a unique suffix
    const fileExt = path.extname(name);
    const baseName = path.basename(name, fileExt).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50);
    const uniqueName = `${baseName}-${Date.now()}${fileExt}`;
    const filePath = path.join(uploadDir, uniqueName);

    // Parse base64 string
    const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let dataBuffer;
    if (matches && matches.length === 3) {
      dataBuffer = Buffer.from(matches[2], 'base64');
    } else {
      dataBuffer = Buffer.from(base64, 'base64');
    }

    // Write file
    fs.writeFileSync(filePath, dataBuffer);

    // Form static URL
    const host = req.get('host') || 'localhost:5000';
    const protocol = req.protocol || 'http';
    const fileUrl = `${protocol}://${host}/uploads/${uniqueName}`;

    return res.status(200).json({
      url: fileUrl,
      name,
      type: type || 'application/octet-stream',
      size: dataBuffer.length
    });
  } catch (error) {
    console.error('File upload error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/interactions
 * Create manual interaction. Triggers AI Engine, saves risks/notifications, updates health.
 */
router.post('/', async (req, res) => {
  const { accountId, contactId, source, messageText, timestamp, subject, date, time, actionMentions, attachments } = req.body;

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

    const enrichedActionMentions = await Promise.all(
      (actionMentions || []).map(async (m) => {
        const header = await generateTaskHeader(m.task || messageText);
        return {
          ...m,
          taskHeader: header,
          status: m.status || 'Task Assigned',
          dueDate: m.dueDate || null,
          priority: m.priority || 'Medium',
          comments: m.comments || '',
          completionDate: m.completionDate || null
        };
      })
    );

    let cleanSubject = subject || '';
    if (!cleanSubject || cleanSubject === 'Interaction Note' || cleanSubject.split(/\s+/).length > 4 || cleanSubject.length > 30) {
      try {
        const generated = await generateTaskHeader(messageText);
        if (generated && generated !== 'Task Assignment') {
          cleanSubject = generated;
        }
      } catch (e) {
        console.error('Error generating clean subject:', e);
      }
    }

    const getLocalDateString = () => {
      const d = new Date();
      const offset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - offset).toISOString().split('T')[0];
    };
    
    const getLocalTimeString = () => {
      const d = new Date();
      const offset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - offset).toISOString().split('T')[1].slice(0, 5);
    };

    const interactionId = 'int-' + Math.random().toString(36).substring(2, 11);
    const newInteraction = {
      interactionId,
      accountId,
      contactId,
      source,
      subject: cleanSubject,
      messageText,
      date: date || getLocalDateString(),
      time: time || getLocalTimeString(),
      actionMentions: enrichedActionMentions,
      loggedByUid: req.user.uid,
      loggedByName,
      sentiment: analysis.sentiment,
      riskDetected: analysis.riskLevel === 'High' || analysis.riskLevel === 'Medium',
      riskCategory: analysis.riskCategory || '',
      attachments: attachments || [],
      timestamp: timestamp || (date && time ? (() => {
        try {
          const d = new Date(`${date}T${time}:00`);
          return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        } catch (e) {
          return new Date().toISOString();
        }
      })() : new Date().toISOString())
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

        // Send email alert asynchronously
        sendTaskAssignmentEmail(mention.uid, {
          task: taskText,
          taskHeader: mention.taskHeader,
          accountName: companyName,
          priority: mention.priority || 'Medium',
          dueDate: mention.dueDate,
          assignerName: loggedByName
        });

        return notifDoc;
      });
      mentionNotifications = await Promise.all(mentionNotifPromises);
    }

    // Recalculate health
    const updatedHealth = await calculateAccountHealth(accountId);

    const assigneeNames = Array.isArray(actionMentions) && actionMentions.length > 0
      ? actionMentions.map(m => m.name).join(', ')
      : '';
    const detailsSuffix = assigneeNames ? ` (Assigned to: ${assigneeNames})` : '';

    await logActivity(req.user.uid, req.user.name, 'Create Interaction', `Logged ${source} interaction "${subject || 'No Subject'}" for account ${companyName}${detailsSuffix}`);
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
