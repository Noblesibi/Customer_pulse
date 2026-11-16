import { Router } from 'express';
import { db, logActivity } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { sendTaskAssignmentEmail } from '../services/email.service.js';
import { generateTaskHeader } from '../services/ai.service.js';
import { NotificationEngine } from '../services/notification/NotificationEngine.js';
import { getSystemDateString, getSystemTimeString } from '../utils/dateUtils.js';

const router = Router();
router.use(authenticateToken);

function fmtDateDDMMYYYY(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function computeContactEngagementContext(contact, accountName, interactionsList = [], emailLogsList = [], tasksList = []) {
  if (!contact) return null;
  const cid = contact.contactId || contact.id;
  const contactEmail = String(contact.email || '').toLowerCase().trim();
  const cName = contact.name || 'Key Contact';
  const accLabel = accountName && accountName !== 'Internal' ? accountName : 'this account';

  const matchedInteractions = interactionsList
    .filter(i => {
      if ((i.interactionId || '').includes('DUMMY')) return false;
      if (i.contactId === cid) return true;
      if (Array.isArray(i.participants) && i.participants.some(p => p.contactId === cid || (contactEmail && String(p.email || '').toLowerCase() === contactEmail))) return true;
      return false;
    })
    .map(i => ({
      title: i.subject || i.title || i.channel || i.source || 'Customer Interaction',
      channel: i.channel || i.source || 'Interaction',
      timestamp: i.timestamp || i.date
    }));

  const matchedEmails = emailLogsList
    .filter(e =>
      e.status === 'SENT' &&
      contactEmail &&
      String(e.recipientEmail || '').toLowerCase().includes(contactEmail)
    )
    .map(e => ({
      title: e.subject || 'System Email',
      channel: 'Email',
      timestamp: e.sentAt || e.createdAt
    }));

  const matchedTasks = tasksList
    .filter(t => !(t.taskId || '').includes('DUMMY') && t.contactId === cid)
    .map(t => ({
      title: t.title || t.taskHeader || 'Assigned Task',
      channel: 'Task',
      timestamp: t.timestamp || t.createdAt || t.dueDate
    }));

  const combined = [...matchedInteractions, ...matchedEmails, ...matchedTasks]
    .filter(a => a.timestamp && !isNaN(new Date(a.timestamp).getTime()))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recent30 = combined.filter(a => new Date(a.timestamp) >= thirtyDaysAgo);
  const count30 = recent30.length;

  let status = 'Not Engaged';
  if (count30 > 3) status = 'Active';
  else if (count30 > 0) status = 'Needs Attention';

  const latest = combined[0] || null;
  let lastDateStr = '';
  let daysAgoText = '';
  if (latest) {
    const lDate = new Date(latest.timestamp);
    lastDateStr = fmtDateDDMMYYYY(lDate);
    const diffDays = Math.ceil(Math.abs(now - lDate) / (1000 * 60 * 60 * 24));
    daysAgoText = diffDays === 0 ? 'today' : `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  }

  const roleDesc = [contact.designation, contact.influenceTag].filter(Boolean).join(' · ');
  let reason = '';
  if (status === 'Active') {
    reason = `${cName}${roleDesc ? ` (${roleDesc})` : ''} is actively engaged on ${accLabel} with ${count30} recorded touchpoints in the last 30 days (meets 4+ threshold for Active)${latest ? ` — latest: "${latest.title}" (${latest.channel}) on ${lastDateStr} (${daysAgoText})` : ''}.`;
  } else if (status === 'Needs Attention') {
    reason = `${cName}${roleDesc ? ` (${roleDesc})` : ''} has only ${count30} ${count30 === 1 ? 'interaction' : 'interactions'} recorded on ${accLabel} in the last 30 days (4+ touchpoints required for Active)${latest ? ` — last touchpoint: "${latest.title}" (${latest.channel}) on ${lastDateStr} (${daysAgoText})` : ''}.`;
  } else {
    reason = combined.length > 0
      ? `0 interactions recorded with ${cName}${roleDesc ? ` (${roleDesc})` : ''} on ${accLabel} in the last 30 days — last touchpoint "${latest.title}" was on ${lastDateStr} (${daysAgoText}).`
      : `0 interactions or touchpoints recorded in the database with ${cName}${roleDesc ? ` (${roleDesc})` : ''} for ${accLabel}.`;
  }

  return { status, reason };
}

/**
 * POST /api/tasks
 * Create a new task.
 */
router.post('/', async (req, res) => {
  let { title, description, assignedToUid, priority, dueDate, accountId, contactId } = req.body;

  const validPriorities = ['Low', 'Medium', 'High', 'Critical'];

  if (!description || typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'Task Description is required.' });
  }
  if (!title || typeof title !== 'string' || !title.trim() || title.trim().length < 2) {
    title = description.trim().slice(0, 50) || 'Task Assignment';
  }
  if (!assignedToUid || typeof assignedToUid !== 'string' || !assignedToUid.trim()) {
    return res.status(400).json({ error: 'Assignee team member selection is required.' });
  }
  if (priority && !validPriorities.includes(priority)) {
    return res.status(400).json({ error: 'Priority must be one of: Low, Medium, High, Critical.' });
  }

  try {
    // Verify assignee exists with fallback search
    let assignee = null;
    try {
      const assigneeDoc = await db.collection('users').doc(assignedToUid).get();
      if (assigneeDoc && assigneeDoc.exists) {
        assignee = assigneeDoc.data();
      }
    } catch (err) {
      console.warn('Direct doc lookup for assignee:', err.message);
    }

    if (!assignee) {
      try {
        const allUsersSnap = await db.collection('users').get();
        if (allUsersSnap && allUsersSnap.docs) {
          const foundDoc = allUsersSnap.docs.find(d => {
            const data = d.data();
            return d.id === assignedToUid || data.uid === assignedToUid || data.email === assignedToUid || (data.name && data.name.toLowerCase() === (req.body.assignedToName || '').toLowerCase());
          });
          if (foundDoc) {
            assignee = foundDoc.data();
          }
        }
      } catch (err) {
        console.warn('Fallback search for assignee:', err.message);
      }
    }

    const taskId = 'task-' + Math.random().toString(36).substring(2, 11);
    const assignedByName = req.user.name || req.user.email || 'User';
    const assignedToName = assignee?.name || assignee?.email || req.body.assignedToName || 'Staff Member';

    let cleanTitle = title;
    if (cleanTitle === 'Task Assignment' || cleanTitle === description.trim().slice(0, 50)) {
      try {
        const generated = await generateTaskHeader(description);
        if (generated && generated !== 'Task Assignment') {
          cleanTitle = generated;
        }
      } catch (e) {
        console.error('Error generating task title:', e);
      }
    }

    const getKolkataDateString = (d = new Date()) => {
      try {
        const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
        return formatter.format(d);
      } catch (e) {
        return d.toISOString().split('T')[0];
      }
    };

    const getKolkataTimeString = (d = new Date()) => {
      try {
        const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
        return formatter.format(d);
      } catch (e) {
        return d.toTimeString().slice(0, 5);
      }
    };

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
      date: getKolkataDateString(),
      time: getKolkataTimeString(),
      timestamp: new Date().toISOString()
    };

    let resolvedCompanyName = req.body.companyName || 'Internal';
    if (accountId) {
      try {
        const accDoc = await db.collection('accounts').doc(accountId).get();
        if (accDoc && accDoc.exists) {
          resolvedCompanyName = accDoc.data().companyName || resolvedCompanyName || 'Account';
        }
      } catch (accErr) { }
    }

    let resolvedContactName = req.body.contactName || 'N/A';
    let contactDataObj = null;
    if (contactId) {
      try {
        const conDoc = await db.collection('contacts').doc(contactId).get();
        if (conDoc && conDoc.exists) {
          contactDataObj = conDoc.data();
          resolvedContactName = contactDataObj.name || resolvedContactName;
        }
      } catch (conErr) { }
    }

    let resolvedEngagementStatus = req.body.contactEngagementStatus || '';
    let resolvedEngagementReason = req.body.contactEngagementReason || '';
    if (contactDataObj && (!resolvedEngagementStatus || !resolvedEngagementReason)) {
      try {
        const [intSnap, emailSnap, existingTaskSnap] = await Promise.all([
          accountId
            ? db.collection('interactions').where('accountId', '==', accountId).get()
            : db.collection('interactions').get(),
          accountId
            ? db.collection('emaillogs').where('accountId', '==', accountId).get()
            : Promise.resolve({ docs: [] }),
          accountId
            ? db.collection('tasks').where('accountId', '==', accountId).get()
            : Promise.resolve({ docs: [] })
        ]);
        const computed = computeContactEngagementContext(
          contactDataObj,
          resolvedCompanyName,
          intSnap.docs.map(d => d.data()),
          emailSnap.docs.map(d => d.data()),
          existingTaskSnap.docs.map(d => d.data())
        );
        if (computed) {
          if (!resolvedEngagementStatus) resolvedEngagementStatus = computed.status;
          if (!resolvedEngagementReason) resolvedEngagementReason = computed.reason;
        }
      } catch (engErr) { }
    }

    newTask.companyName = resolvedCompanyName;
    newTask.contactName = resolvedContactName;
    if (resolvedEngagementStatus) newTask.contactEngagementStatus = resolvedEngagementStatus;
    if (resolvedEngagementReason) newTask.contactEngagementReason = resolvedEngagementReason;

    await db.collection('tasks').doc(taskId).set(newTask);

    // 1. Publish event through NotificationEngine (Queues HTML Email + Writes In-App Notification)
    try {
      let resolvedCompanyName = 'Internal';
      if (accountId) {
        try {
          const accDoc = await db.collection('accounts').doc(accountId).get();
          if (accDoc && accDoc.exists) {
            resolvedCompanyName = accDoc.data().companyName || 'Account';
          }
        } catch (accErr) { }
      }

      const eventName = accountId ? 'associated_task_assigned' : 'staff_task_assigned';
      await NotificationEngine.publishEvent(eventName, {
        TaskTitle: cleanTitle,
        TaskDescription: description,
        Priority: priority || 'Medium',
        DueDate: dueDate || 'Not specified',
        AssignedBy: assignedByName,
        AssignedTo: assignedToName,
        CompanyName: resolvedCompanyName,
        InAppMessage: `${assignedByName} assigned you a ${accountId ? 'associated' : 'staff'} task: "${cleanTitle}"`
      }, [assignedToUid], { relatedTaskId: taskId, relatedAccountId: accountId });
    } catch (engineErr) {
      console.error('[TaskRoutes] NotificationEngine publishEvent error:', engineErr.message);
    }

    // 2. Direct in-app notification fallback
    try {
      const notifId = 'notif-' + Math.random().toString(36).substring(2, 11);
      await db.collection('notifications').doc(notifId).set({
        notificationId: notifId,
        toUserId: assignedToUid,
        type: 'Task Assigned',
        message: `${assignedByName} assigned you a staff task: "${cleanTitle}"`,
        read: false,
        date: getSystemDateString(),
        time: getSystemTimeString(),
        timestamp: new Date().toISOString()
      });
    } catch (notifErr) {
      console.error('[TaskRoutes] Direct notification fallback error:', notifErr.message);
    }

    try {
      await logActivity(req.user.uid, req.user.name, 'Create Staff Task', `Assigned task "${cleanTitle}" to @${assignedToName}`);
    } catch (logErr) {
      console.error('[TaskRoutes] Log activity error:', logErr.message);
    }

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
      // Regular staff only see tasks assigned to them, created by them, or forwarded to them
      tasks = tasks.filter(t =>
        t.assignedToUid === req.user.uid ||
        t.assignedByUid === req.user.uid ||
        t.forwardedToUid === req.user.uid ||
        (userProfile?.name && t.forwardedToName && t.forwardedToName.toLowerCase() === userProfile.name.toLowerCase())
      );
    }

    if (filter === 'assigned-to-me') {
      tasks = tasks.filter(t =>
        t.assignedToUid === req.user.uid ||
        t.forwardedToUid === req.user.uid ||
        (userProfile?.name && t.forwardedToName && t.forwardedToName.toLowerCase() === userProfile.name.toLowerCase())
      );
    } else if (filter === 'created-by-me') {
      tasks = tasks.filter(t =>
        t.assignedByUid === req.user.uid ||
        t.forwardedByUid === req.user.uid ||
        (userProfile?.name && t.forwardedByName && t.forwardedByName.toLowerCase() === userProfile.name.toLowerCase())
      );
    }

    function parseDateToTime(raw) {
      if (!raw) return 0;
      if (raw instanceof Date) return isNaN(raw.getTime()) ? 0 : raw.getTime();
      if (typeof raw === 'number') return raw;

      const str = String(raw).trim();
      if (!str) return 0;

      const direct = Date.parse(str);
      if (!isNaN(direct)) return direct;

      const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i);
      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const year = parseInt(match[3], 10);
        let hours = match[4] ? parseInt(match[4], 10) : 0;
        const minutes = match[5] ? parseInt(match[5], 10) : 0;
        const seconds = match[6] ? parseInt(match[6], 10) : 0;
        const ampm = match[7] ? match[7].toLowerCase() : null;

        if (ampm === 'pm' && hours < 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;

        const d = new Date(year, month, day, hours, minutes, seconds);
        if (!isNaN(d.getTime())) return d.getTime();
      }
      return 0;
    }

    function getTaskTime(task) {
      if (!task) return 0;
      let t = 0;
      if (task.timestamp) t = parseDateToTime(task.timestamp);
      if (!t && task.createdAt) t = parseDateToTime(task.createdAt);
      if (!t && task.date) {
        const combined = task.time ? `${task.date} ${task.time}` : task.date;
        t = parseDateToTime(combined);
      }
      if (!t && task.dueDate) t = parseDateToTime(task.dueDate);
      return t;
    }

    // Sort descending by timestamp (newest first)
    tasks.sort((a, b) => getTaskTime(b) - getTaskTime(a));

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

    if (tasks.some(t => t.contactId)) {
      try {
        const contactObjectsMap = {};
        contactsSnapshot.docs.forEach(doc => {
          const cData = doc.data();
          contactObjectsMap[cData.contactId || doc.id] = cData;
        });

        const [allInteractionsSnap, allEmailLogsSnap] = await Promise.all([
          db.collection('interactions').get(),
          db.collection('emaillogs').get()
        ]);
        const allInteractionsList = allInteractionsSnap.docs.map(d => d.data());
        const allEmailLogsList = allEmailLogsSnap.docs.map(d => d.data());
        const allTasksList = snapshot.docs.map(d => d.data());

        const engagementCache = new Map();
        tasks = tasks.map(t => {
          if (!t.contactId || !contactObjectsMap[t.contactId]) return t;
          const cacheKey = `${t.accountId || ''}:${t.contactId}`;
          let liveEng = engagementCache.get(cacheKey);
          if (!liveEng) {
            liveEng = computeContactEngagementContext(
              contactObjectsMap[t.contactId],
              t.companyName,
              allInteractionsList,
              allEmailLogsList,
              allTasksList
            );
            engagementCache.set(cacheKey, liveEng);
          }
          if (!liveEng) return t;

          const storedReason = t.contactEngagementReason || '';
          const storedStatus = t.contactEngagementStatus || '';
          const sameStatus = storedStatus && storedStatus === liveEng.status;

          return {
            ...t,
            contactEngagementStatus: liveEng.status,
            contactEngagementReason: sameStatus && storedReason ? storedReason : liveEng.reason,
            contactCreatedReason: !sameStatus && storedReason ? storedReason : ''
          };
        });
      } catch (engErr) {
        console.warn('[TaskRoutes] Contact engagement enrichment warning:', engErr.message);
      }
    }

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
    if (task.assignedToUid !== req.user.uid && task.assignedByUid !== req.user.uid && task.forwardedToUid !== req.user.uid && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Unauthorized to update this task' });
    }

    // Block status updates if task is already Completed or Declined
    const currentStatusClean = String(task.status || '').trim().toLowerCase();
    if (
      currentStatusClean === 'completed' ||
      currentStatusClean === 'complete' ||
      currentStatusClean === 'declined' ||
      currentStatusClean === 'decline' ||
      currentStatusClean === 'accepted & completed'
    ) {
      return res.status(400).json({ error: `Task status is final (${task.status}) and cannot be changed.` });
    }

    const nowStatusIso = new Date().toISOString();
    const updates = {
      status,
      updatedAt: nowStatusIso,
      ...(String(status).toLowerCase().includes('complete') ? { completedAt: nowStatusIso } : {})
    };
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

      // Notify the other party about the comment via email
      const commentRecipient = req.user.uid === task.assignedToUid ? task.assignedByUid : task.assignedToUid;
      if (commentRecipient) {
        NotificationEngine.publishEvent('task_comment', {
          TaskTitle: task.title || task.description,
          TaskId: id,
          AuthorName: req.user.name || req.user.email,
          CommentText: note.trim().substring(0, 200),
          InAppMessage: `${req.user.name} commented on task "${task.title}": "${note.trim().substring(0, 80)}"`
        }, [commentRecipient], { relatedTaskId: id, skipInAppNotification: true });
      }
    }

    // Handle Forwarding
    if (status === 'Forwarded' && forwardToUid && forwardToName) {
      updates.forwardedByUid = req.user.uid;
      updates.forwardedByName = req.user.name;
      updates.forwardedToUid = forwardToUid;
      updates.forwardedToName = forwardToName;
      updates.originalAssignedToUid = task.originalAssignedToUid || task.assignedToUid;
      updates.originalAssignedToName = task.originalAssignedToName || task.assignedToName;
      updates.assignedToUid = forwardToUid;
      updates.assignedToName = forwardToName;
      updates.status = 'Task Assigned';

      // Notify the new assignee via email
      NotificationEngine.publishEvent('task_reassigned', {
        TaskTitle: task.title || task.description,
        TaskId: id,
        Priority: task.priority || 'Medium',
        DueDate: task.dueDate,
        AssignedBy: req.user.name || req.user.email,
        PreviousAssignee: task.assignedToName,
        InAppMessage: `${req.user.name || req.user.email} forwarded a task to you: "${task.title}"`
      }, [forwardToUid], { relatedTaskId: id, skipInAppNotification: true });

      // Create bell notification for the new assignee
      const notifId = 'notif-' + Math.random().toString(36).substring(2, 11);
      await db.collection('notifications').doc(notifId).set({
        notificationId: notifId,
        toUserId: forwardToUid,
        taskId: id,
        type: 'Task Assigned',
        message: `${req.user.name || req.user.email} forwarded a task to you: "${task.title}"`,
        read: false,
        date: getSystemDateString(),
        time: getSystemTimeString(),
        timestamp: new Date().toISOString()
      });
    }

    await db.collection('tasks').doc(id).update(updates);

    // Publish status change email notification to the assigner
    if (req.user.uid !== task.assignedByUid) {
      // Format status string (e.g. Accept -> Accepted, Decline -> Declined, Complete -> Completed)
      const rawStatus = updates.status || status;
      const displayStatus = (rawStatus === 'Accept' || rawStatus === 'accept' || rawStatus === 'in progress') ? 'Accepted' :
        (rawStatus === 'Decline' || rawStatus === 'decline') ? 'Declined' :
          (rawStatus === 'Complete' || rawStatus === 'completed') ? 'Completed' :
            (rawStatus === 'Forward' || rawStatus === 'forwarded') ? 'Forwarded' :
              rawStatus;

      const notifId = 'notif-' + Math.random().toString(36).substring(2, 11);
      await db.collection('notifications').doc(notifId).set({
        notificationId: notifId,
        toUserId: task.assignedByUid,
        taskId: id,
        type: 'Task Status Updated',
        message: `${req.user.name} updated task "${task.title}" status to: ${displayStatus}`,
        read: false,
        date: getSystemDateString(),
        time: getSystemTimeString(),
        timestamp: new Date().toISOString()
      });

      // Email notification for status change (distinguish staff vs associated tasks)
      const isAssociatedTask = Boolean(task.accountId || task.contactId || task.companyName);
      let emailEvent = 'status_changed';
      if (displayStatus === 'Completed') {
        emailEvent = isAssociatedTask ? 'associated_task_completed' : 'staff_task_completed';
      } else if (displayStatus === 'Declined') {
        emailEvent = isAssociatedTask ? 'associated_task_declined' : 'staff_task_declined';
      } else if (displayStatus === 'Accepted') {
        emailEvent = isAssociatedTask ? 'associated_task_accepted' : 'staff_task_accepted';
      } else if (displayStatus === 'Forwarded') {
        emailEvent = isAssociatedTask ? 'associated_task_forwarded' : 'staff_task_forwarded';
      } else if (displayStatus === 'Overdue') {
        emailEvent = isAssociatedTask ? 'associated_task_overdue' : 'staff_task_overdue';
      }

      const noteText = completionNote || note || updates.completionNote || '';

      NotificationEngine.publishEvent(emailEvent, {
        TaskTitle: task.title || task.description,
        TaskId: id,
        Status: displayStatus,
        PreviousStatus: task.status,
        UpdatedBy: req.user.name || req.user.email,
        AssignedBy: task.assignedByName || 'System',
        CompanyName: task.companyName || 'Internal',
        CompletedBy: req.user.name || req.user.email,
        CompletionDate: new Date().toISOString(),
        Note: noteText,
        StatusNote: noteText,
        CompletionNote: noteText,
        InAppMessage: `${req.user.name} updated task "${task.title}" status to: ${displayStatus}`
      }, [task.assignedByUid], { relatedTaskId: id, skipInAppNotification: true });
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

    const replyRecipient = req.user.uid === task.assignedToUid ? task.assignedByUid : task.assignedToUid;
    if (replyRecipient) {
      try {
        const isAssociatedTask = Boolean(task.accountId || task.contactId);
        await NotificationEngine.publishEvent(
          isAssociatedTask ? 'associated_task_comment' : 'staff_task_comment',
          {
            TaskTitle: task.title || task.description,
            TaskId: id,
            CompanyName: task.companyName || 'Internal',
            AuthorName: newReply.authorName,
            CommentText: text.trim().substring(0, 200),
            InAppMessage: `${newReply.authorName} commented on task "${task.title}": "${text.trim().slice(0, 80)}"`
          },
          [replyRecipient],
          { relatedTaskId: id, relatedAccountId: task.accountId || null, skipInAppNotification: true }
        );
      } catch (replyMailErr) {
        console.error('[TaskRoutes] Reply email notification error:', replyMailErr.message);
      }
    }

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
        date: getSystemDateString(),
        time: getSystemTimeString(),
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
