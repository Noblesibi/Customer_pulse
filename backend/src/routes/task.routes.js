import { Router } from 'express';
import { db, logActivity } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { sendTaskAssignmentEmail } from '../services/email.service.js';
import { generateTaskHeader } from '../services/ai.service.js';

const router = Router();
router.use(authenticateToken);

/**
 * POST /api/tasks
 * Create a new task.
 */
router.post('/', async (req, res) => {
  const { title, description, assignedToUid, priority, dueDate, accountId, contactId } = req.body;

  if (!title || !description || !assignedToUid) {
    return res.status(400).json({ error: 'Missing title, description, or assignedToUid' });
  }

  try {
    // Verify assignee exists
    const assigneeDoc = await db.collection('users').doc(assignedToUid).get();
    if (!assigneeDoc.exists) {
      return res.status(404).json({ error: 'Assignee not found' });
    }
    const assignee = assigneeDoc.data();

    const taskId = 'task-' + Math.random().toString(36).substring(2, 11);
    const assignedByName = req.user.name || req.user.email;
    const assignedToName = assignee.name || assignee.email;

    let cleanTitle = title;
    try {
      const generated = await generateTaskHeader(description);
      if (generated && generated !== 'Task Assignment') {
        cleanTitle = generated;
      }
    } catch (e) {
      console.error('Error generating task title:', e);
    }

    const newTask = {
      taskId,
      title: cleanTitle,
      description,
      assignedByUid: req.user.uid,
      assignedByName,
      assignedToUid,
      assignedToName,
      priority: priority || 'Medium',
      status: 'Pending',
      dueDate: dueDate || null,
      completionNote: '',
      accountId: accountId || null,
      contactId: contactId || null,
      timestamp: new Date().toISOString()
    };

    await db.collection('tasks').doc(taskId).set(newTask);

    // Create a personal notification for the assignee
    const notifId = 'notif-' + Math.random().toString(36).substring(2, 11);
    await db.collection('notifications').doc(notifId).set({
      notificationId: notifId,
      toUserId: assignedToUid,
      type: 'Task Assigned',
      message: `${assignedByName} assigned you a staff task: "${title}"`,
      read: false,
      timestamp: new Date().toISOString()
    });

    // Send task assignment email if possible
    try {
      sendTaskAssignmentEmail(assignedToUid, {
        task: description,
        taskHeader: title,
        accountName: 'Internal Staff Assignment',
        priority: priority || 'Medium',
        dueDate,
        assignerName: assignedByName
      });
    } catch (emailErr) {
      console.error('Failed to send task email:', emailErr);
    }

    await logActivity(req.user.uid, req.user.name, 'Create Staff Task', `Assigned task "${title}" to @${assignedToName}`);

    return res.status(201).json(newTask);
  } catch (error) {
    console.error('Error creating staff task:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tasks
 * Fetch staff tasks list.
 */
router.get('/', async (req, res) => {
  const { filter } = req.query;

  try {
    const snapshot = await db.collection('tasks').get();
    let tasks = snapshot.docs.map(doc => doc.data());

    // Filter based on user profile permissions
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : null;
    const isAdmin = userProfile && (userProfile.userType === 'Admin' || userProfile.role === 'Admin');
    const isCeo = userProfile && (userProfile.userType === 'CEO' || userProfile.position === 'CEO');

    if (!isAdmin && !isCeo) {
      // Regular staff only see tasks assigned to them or created by them
      tasks = tasks.filter(t => t.assignedToUid === req.user.uid || t.assignedByUid === req.user.uid);
    }

    if (filter === 'assigned-to-me') {
      tasks = tasks.filter(t => t.assignedToUid === req.user.uid);
    } else if (filter === 'created-by-me') {
      tasks = tasks.filter(t => t.assignedByUid === req.user.uid);
    }

    // Sort descending by timestamp
    tasks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Resolve companyName and contactName
    const accountsSnapshot = await db.collection('accounts').get();
    const accountsMap = {};
    accountsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      accountsMap[data.accountId || data.id] = data.companyName;
    });

    const contactsSnapshot = await db.collection('contacts').get();
    const contactsMap = {};
    contactsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      contactsMap[data.contactId || data.id] = data.name;
    });

    tasks = tasks.map(t => {
      let resolvedCompanyName = t.companyName || accountsMap[t.accountId] || '';
      let resolvedContactName = t.contactName || contactsMap[t.contactId] || '';
      
      // Fallback: parse from title if it has " - "
      if (!resolvedCompanyName && t.title && t.title.includes(' - ')) {
        const parts = t.title.split(' - ');
        if (parts.length >= 2) {
          resolvedCompanyName = parts[0].trim();
          resolvedContactName = parts[1].trim();
        }
      }
      
      return {
        ...t,
        companyName: resolvedCompanyName || 'Internal',
        contactName: resolvedContactName || 'N/A'
      };
    });

    return res.json(tasks);
  } catch (error) {
    console.error('Error fetching staff tasks:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/tasks/:id/status
 * Update staff task status.
 */
router.put('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, completionNote, note, forwardToUid, forwardToName } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  try {
    const doc = await db.collection('tasks').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = doc.data();

    // Check permissions
    if (task.assignedToUid !== req.user.uid && task.assignedByUid !== req.user.uid) {
      return res.status(403).json({ error: 'Unauthorized to update this task' });
    }

    const updates = { status };
    if (completionNote !== undefined) {
      updates.completionNote = completionNote;
    }

    // Add note as a task reply if provided
    if (note && note.trim()) {
      const replyId = 'reply-' + Math.random().toString(36).substring(2, 11);
      const newReply = {
        replyId,
        taskId: id,
        authorUid: req.user.uid,
        authorName: req.user.name || req.user.email,
        text: note.trim(),
        timestamp: new Date().toISOString()
      };
      await db.collection('tasks').doc(id).collection('taskreplies').doc(replyId).set(newReply);
    }

    // Handle Forwarding
    if (status === 'Forwarded' && forwardToUid && forwardToName) {
      updates.assignedToUid = forwardToUid;
      updates.assignedToName = forwardToName;
      updates.status = 'Task Assigned';

      // Create notification for the new assignee
      const notifId = 'notif-' + Math.random().toString(36).substring(2, 11);
      await db.collection('notifications').doc(notifId).set({
        notificationId: notifId,
        toUserId: forwardToUid,
        type: 'Task Assigned',
        message: `${req.user.name || req.user.email} forwarded a task to you: "${task.title}"`,
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    await db.collection('tasks').doc(id).update(updates);

    // Notify the assigner (if updated by someone else)
    if (req.user.uid !== task.assignedByUid) {
      const notifId = 'notif-' + Math.random().toString(36).substring(2, 11);
      await db.collection('notifications').doc(notifId).set({
        notificationId: notifId,
        toUserId: task.assignedByUid,
        type: 'Task Status Updated',
        message: `${req.user.name} updated task "${task.title}" status to: ${status}`,
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    await logActivity(req.user.uid, req.user.name, 'Update Staff Task Status', `Updated task "${task.title}" status to "${status}"`);

    return res.json({ success: true, status: updates.status, completionNote, assignedToUid: updates.assignedToUid, assignedToName: updates.assignedToName });
  } catch (error) {
    console.error('Error updating staff task status:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tasks/:id/replies
 * Get replies for a staff task.
 */
router.get('/:id/replies', async (req, res) => {
  const { id } = req.params;
  try {
    const snap = await db.collection('tasks').doc(id).collection('taskreplies').get();
    const replies = snap.docs.map(d => d.data());
    replies.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return res.json(replies);
  } catch (error) {
    console.error('Error fetching staff task replies:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tasks/:id/reply
 * Post reply for a staff task.
 */
router.post('/:id/reply', async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Reply text is required' });
  }

  try {
    const taskDoc = await db.collection('tasks').doc(id).get();
    if (!taskDoc.exists) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const task = taskDoc.data();

    const replyId = 'reply-' + Math.random().toString(36).substring(2, 11);
    const newReply = {
      replyId,
      taskId: id,
      authorUid: req.user.uid,
      authorName: req.user.name || req.user.email,
      text: text.trim(),
      timestamp: new Date().toISOString()
    };

    await db.collection('tasks').doc(id).collection('taskreplies').doc(replyId).set(newReply);

    // Notify the other party in the task
    const notifyTargetUid = req.user.uid === task.assignedToUid ? task.assignedByUid : task.assignedToUid;
    if (notifyTargetUid) {
      const notifId = 'notif-' + Math.random().toString(36).substring(2, 11);
      await db.collection('notifications').doc(notifId).set({
        notificationId: notifId,
        toUserId: notifyTargetUid,
        type: 'Task Reply',
        message: `${newReply.authorName} commented on task "${task.title}": "${text.slice(0, 80)}"`,
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    await logActivity(req.user.uid, req.user.name, 'Reply to Staff Task', `Commented on task "${task.title}"`);

    return res.status(201).json(newReply);
  } catch (error) {
    console.error('Error creating staff task reply:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
