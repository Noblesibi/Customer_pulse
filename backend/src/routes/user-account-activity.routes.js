import { Router } from 'express';
import { db } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

import { syncEmails, getLastSyncTimestamp, isSyncInProgress } from '../services/emailTracking.service.js';

const router = Router();

/**
 * Clean raw HTML email content into clean, professional, readable plain text.
 * Strips header branding, navigation logos, buttons, styling, and decodes entities.
 */
function cleanHtmlEmail(html, maxLength = 600) {
  if (!html) return '';
  let str = String(html);

  // 1. Try to extract just the actual email body content (inside <div class="body">...</div>)
  const bodyMatch = str.match(/<div[^>]*class=["'][^"']*body[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["'][^"']*footer/i)
    || str.match(/<div[^>]*class=["'][^"']*body[^"']*["'][^>]*>([\s\S]*?)<\/body>/i)
    || str.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  if (bodyMatch && bodyMatch[1]) {
    str = bodyMatch[1];
  }

  // 2. Remove <head>, <style>, <script>, buttons, footers
  str = str.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, ' ');
  str = str.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
  str = str.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
  str = str.replace(/<div[^>]*class=["'][^"']*btn-container[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, ' ');
  str = str.replace(/<a[^>]*class=["'][^"']*btn[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, ' ');
  str = str.replace(/<div[^>]*class=["'][^"']*header[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, ' ');
  str = str.replace(/<div[^>]*class=["'][^"']*footer[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, ' ');

  // 3. Remove unwanted branding/header artifacts if any leaked through
  str = str.replace(/CustomerPulse\s*RELATIONSHIPS,\s*MEASURED/gi, ' ');
  str = str.replace(/RELATIONSHIPS,\s*MEASURED/gi, ' ');

  // 4. Transform key field pairs cleanly: "Field Label: Value. "
  str = str.replace(/<div[^>]*class=["'][^"']*field-label[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class=["'][^"']*field-value[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, ' $1: $2. ');
  str = str.replace(/<div[^>]*class=["'][^"']*card-title[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi, ' ');

  // 5. Replace block closing tags and breaks with spaces
  str = str.replace(/<\/(p|div|h[1-6]|tr|li|blockquote)>/gi, ' ');
  str = str.replace(/<(br|hr)\s*\/?>/gi, ' ');

  // 6. Strip remaining HTML tags
  str = str.replace(/<[^>]+>/g, ' ');

  // 7. Decode HTML entities
  str = str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x[0-9a-fA-F]+;/gi, '')
    .replace(/&#[0-9]+;/g, '');

  // 8. Collapse whitespace
  str = str.replace(/\s+/g, ' ').trim();

  // 9. Remove redundant header prefixes if duplicated at start of text
  str = str.replace(/^(Associated Task Assigned|Task Assigned|Notification|System Email)\s*[-:]?\s*/i, '');
  str = str.replace(/^CustomerPulse\s*/i, '');

  if (maxLength && str.length > maxLength) {
    const truncated = str.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    str = (lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated) + '...';
  }

  return str || 'No content';
}

// Require auth
router.use(authenticateToken);

function toKolkataDateTime(isoStr) {
  if (!isoStr) return { date: '', time: '' };
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return { date: '', time: '' };
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(d);
    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });
    const yyyy = map.year;
    const mm = map.month;
    const dd = map.day;
    let hh = map.hour || '00';
    if (hh === '24') hh = '00';
    const min = map.minute || '00';
    return {
      date: `${yyyy}-${mm}-${dd}`,
      time: `${String(hh).padStart(2, '0')}:${String(min).padStart(2, '0')}`
    };
  } catch (e) {
    return {
      date: String(isoStr).split('T')[0] || '',
      time: String(isoStr).split('T')[1]?.substring(0, 5) || ''
    };
  }
}

/**
 * GET /api/user-account/:accountId/:userId/interactions
 * Fetch manually entered interactions and real emails from emaillogs (excluding dummy/mock data).
 */
router.get('/:accountId/:userId/interactions', async (req, res) => {
  try {
    const { accountId, userId } = req.params;

    // Trigger auto-sync if more than 15s since last sync
    if (Date.now() - getLastSyncTimestamp() > 15000 && !isSyncInProgress()) {
      syncEmails().catch(err => console.error('Background auto-sync error:', err));
    }
    
    // 1. Fetch from Interactions (manually entered & synced via MS Graph)
    const intSnap = await db.collection('interactions').where('accountId', '==', accountId).get();
    let dbInteractions = intSnap.docs.map(doc => doc.data());

    // Exclude dummy interactions (like int-dummy-all-users)
    dbInteractions = dbInteractions.filter(i => !i.interactionId.includes('dummy'));

    if (userId !== 'all') {
      dbInteractions = dbInteractions.filter(i => 
        i.loggedByUid === userId || 
        (Array.isArray(i.actionMentions) && i.actionMentions.some(m => m.uid === userId))
      );
    }

    // Enrich DB interactions with contact name, company name, and replies
    const enrichedDbInteractions = await Promise.all(dbInteractions.map(async (i) => {
      let contactName = 'Unknown';
      let companyName = 'Unknown';
      let replies = [];
      try {
        if (i.contactId) {
          const contactDoc = await db.collection('contacts').doc(i.contactId).get();
          if (contactDoc.exists) contactName = contactDoc.data().name;
        }
        if (i.accountId) {
          const accountDoc = await db.collection('accounts').doc(i.accountId).get();
          if (accountDoc.exists) companyName = accountDoc.data().companyName;
        }
        const repliesSnap = await db.collection('interactions').doc(i.interactionId).collection('replies').get();
        replies = repliesSnap.docs.map(doc => doc.data());
        replies.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      } catch (err) {
        console.error('Error fetching relations/replies for interaction:', err);
      }
      return { ...i, contactName, companyName, replies };
    }));

    // 2. Fetch from Emaillogs (system sent emails)
    const emailSnap = await db.collection('emaillogs').get();
    let emails = emailSnap.docs.map(doc => doc.data());

    // Exclude all dummy/mock data
    emails = emails.filter(e => !e.isMock);

    // Filter by user if a specific user is selected
    if (userId !== 'all') {
      emails = emails.filter(e => e.recipientUid === userId);
    }

    // Filter strictly by accountId so unrelated global emails are not injected
    emails = emails.filter(e => e.relatedAccountId && String(e.relatedAccountId) === String(accountId));

    // Batch resolve related tasks to get the actual assignedBy / author
    const taskIds = emails.map(e => e.relatedTaskId).filter(Boolean);
    const taskMap = new Map();
    if (taskIds.length > 0) {
      await Promise.all(taskIds.map(async (tid) => {
        try {
          const tDoc = await db.collection('tasks').doc(tid).get();
          if (tDoc.exists) taskMap.set(tid, tDoc.data());
        } catch (e) {}
      }));
    }

    // Map emaillogs to interaction format expected by the frontend
    const emailInteractions = emails.map(e => {
      const relatedTask = e.relatedTaskId ? taskMap.get(e.relatedTaskId) : null;
      const { date: kDate, time: kTime } = toKolkataDateTime(e.sentAt || e.createdAt);

      let loggedByName = 'Admin User';
      let loggedByUid = 'admin-uid';
      if (relatedTask?.assignedByName) {
        loggedByName = relatedTask.assignedByName;
        loggedByUid = relatedTask.assignedByUid || 'admin-uid';
      } else if (e.senderName) {
        loggedByName = e.senderName;
        loggedByUid = e.senderUid || 'admin-uid';
      } else if (e.eventType === 'birthday' || e.eventType === 'work_anniversary') {
        loggedByName = 'NeST Digital Team';
        loggedByUid = 'system';
      }

      return {
        interactionId: e.logId,
        accountId: accountId,
        contactId: null,
        source: 'System Email',
        eventType: e.eventType || '',
        relatedTaskId: e.relatedTaskId || null,
        subject: e.subject || 'System Notification',
        messageText: cleanHtmlEmail(e.htmlBody),
        date: kDate,
        time: kTime,
        timestamp: e.sentAt || e.createdAt,
        loggedByUid,
        loggedByName,
        recipientUid: e.recipientUid,
        recipientName: e.recipientName || 'User',
        sentiment: 'Neutral',
        riskDetected: false,
        riskCategory: '',
        actionMentions: [],
        replies: []
      };
    });

    // Combine both sets
    let allInteractions = [...enrichedDbInteractions, ...emailInteractions];

    // Sort descending by timestamp
    allInteractions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.json(allInteractions);
  } catch (error) {
    console.error('Error fetching combined interactions:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/user-account/:accountId/:userId/tasks
 * Fetch real tasks for account, enriched with replies.
 */
router.get('/:accountId/:userId/tasks', async (req, res) => {
  try {
    const { accountId, userId } = req.params;
    
    const snapshot = await db.collection('tasks').where('accountId', '==', accountId).get();
    let tasks = snapshot.docs.map(doc => doc.data());

    // Exclude dummy datas
    tasks = tasks.filter(t => !t.taskId.includes('DUMMY'));

    if (userId !== 'all') {
      tasks = tasks.filter(t => 
        t.assignedToUid === userId || 
        t.assignedByUid === userId || 
        t.forwardedToUid === userId ||
        t.forwardedByUid === userId
      );
    }

    const enrichedTasks = await Promise.all(tasks.map(async (t) => {
      let replies = [];
      try {
        const snap = await db.collection('tasks').doc(t.taskId).collection('taskreplies').get();
        replies = snap.docs.map(d => d.data());
        replies.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      } catch (e) {
        console.error('Error fetching task replies:', e);
      }
      return { ...t, replies };
    }));

    enrichedTasks.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.json(enrichedTasks);
  } catch (error) {
    console.error('Error fetching user account tasks:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/user-account/:accountId/:userId/other-activities
 * Fetch real emails sent to other employees for the same account.
 */
router.get('/:accountId/:userId/other-activities', async (req, res) => {
  try {
    const { accountId, userId } = req.params;
    
    if (userId === 'all') {
      return res.json([]);
    }

    const snapshot = await db.collection('emaillogs').get();
    let emails = snapshot.docs.map(doc => doc.data());

    // Exclude dummy data and current user, strictly scoped to this account
    emails = emails.filter(e => !e.isMock && e.recipientUid !== userId && e.relatedAccountId && String(e.relatedAccountId) === String(accountId));

    const otherTaskIds = emails.map(e => e.relatedTaskId).filter(Boolean);
    const otherTaskMap = new Map();
    if (otherTaskIds.length > 0) {
      await Promise.all(otherTaskIds.map(async (tid) => {
        try {
          const tDoc = await db.collection('tasks').doc(tid).get();
          if (tDoc.exists) otherTaskMap.set(tid, tDoc.data());
        } catch (e) {}
      }));
    }

    const otherInteractions = emails.map(e => {
      const relatedTask = e.relatedTaskId ? otherTaskMap.get(e.relatedTaskId) : null;
      const { date: kDate, time: kTime } = toKolkataDateTime(e.sentAt || e.createdAt);

      let loggedByName = 'Admin User';
      let loggedByUid = 'admin-uid';
      if (relatedTask?.assignedByName) {
        loggedByName = relatedTask.assignedByName;
        loggedByUid = relatedTask.assignedByUid || 'admin-uid';
      } else if (e.senderName) {
        loggedByName = e.senderName;
        loggedByUid = e.senderUid || 'admin-uid';
      }

      return {
        interactionId: e.logId,
        accountId: accountId,
        source: 'Outlook Mail',
        subject: e.subject || 'System Notification',
        messageText: cleanHtmlEmail(e.htmlBody),
        date: kDate,
        time: kTime,
        timestamp: e.sentAt || e.createdAt,
        loggedByUid,
        loggedByName,
        recipientUid: e.recipientUid,
        recipientName: e.recipientName || 'Other User'
      };
    });
    
    otherInteractions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.json(otherInteractions);
  } catch (error) {
    console.error('Error fetching other activities:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;

