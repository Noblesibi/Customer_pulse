import { db, logActivity } from '../config/database.js';
import { analyzeCommunication, generateTaskHeader } from './ai.service.js';
import { calculateAccountHealth } from './health.service.js';
import { sendTaskAssignmentEmail, sendInteractionLoggedEmail } from './email.service.js';
import { getSystemDateString, getSystemTimeString } from '../utils/dateUtils.js';

/**
 * Creates an interaction, runs AI analysis, updates health, and triggers notifications.
 * @param {Object} data The interaction data
 * @param {Object} user The user logging the interaction ({ uid, name, email })
 * @returns {Object} { interaction, analysis, health }
 */
export async function createInteraction(data, user) {
  const { accountId, contactId, source, messageText, subject, date, time, actionMentions, attachments, internetMessageId } = data;

  const validSources = ['Outlook Mail', 'Teams Chat', 'Phone', 'Face to Face', 'Teams Meeting', 'Other'];

  if (!accountId || typeof accountId !== 'string' || !accountId.trim()) {
    throw new Error('Account selection is required.');
  }
  if (!source || typeof source !== 'string' || !source.trim()) {
    throw new Error('Interaction channel/source is required.');
  }
  if (!messageText || typeof messageText !== 'string' || !messageText.trim()) {
    throw new Error('Interaction notes / message text is required.');
  }
  if (messageText.trim().length < 5) {
    throw new Error('Interaction notes must be at least 5 characters long.');
  }

  // Verify account exist
  const accountDoc = await db.collection('accounts').doc(accountId).get();
  if (!accountDoc.exists) throw new Error('Account not found');

  let contactName = '';
  if (contactId && typeof contactId === 'string' && contactId.trim()) {
    const contactDoc = await db.collection('contacts').doc(contactId).get();
    if (!contactDoc.exists) throw new Error('Contact not found');
    contactName = contactDoc.data().name || contactDoc.data().email || '';
  }

  const companyName = accountDoc.data().companyName;
  const loggedByName = user.name || user.email || 'System Sync';

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

  const interactionId = 'int-' + Math.random().toString(36).substring(2, 11);
  const newInteraction = {
    interactionId,
    accountId,
    contactId,
    source,
    subject: cleanSubject,
    messageText,
    date: date || getKolkataDateString(),
    time: time || getKolkataTimeString(),
    actionMentions: enrichedActionMentions,
    loggedByUid: user.uid,
    loggedByName,
    sentiment: analysis.sentiment,
    riskDetected: analysis.riskLevel === 'High' || analysis.riskLevel === 'Medium',
    riskCategory: analysis.riskCategory || '',
    attachments: attachments || [],
    internetMessageId: internetMessageId || null,
    isManual: data.isManual !== undefined ? Boolean(data.isManual) : (!internetMessageId && source !== 'System Activity' && source !== 'System'),
    businessOpportunities: analysis.businessOpportunities || [],
    commitments: analysis.commitments || [],
    followUpSignals: analysis.followUpSignals || [],
    timestamp: new Date().toISOString()
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
      source: 'AI',
      interactionId,
      interactionSource: source,
      interactionSubject: cleanSubject || '',
      involvedEmployee: loggedByName || '',
      involvedContact: contactName || '',
      createdAt: new Date().toISOString()
    });

    // Add risk notification for the account owner
    const riskNotifId = 'notif-' + Math.random().toString(36).substring(2, 11);
    const ownerId = accountDoc.data().ownerId;
    await db.collection('notifications').doc(riskNotifId).set({
      notificationId: riskNotifId,
      accountId,
      toUserId: ownerId || null, // notify the responsible person
      riskId,
      type: 'New Risk',
      message: `New risk alert detected: [${analysis.riskCategory}] - ${analysis.summary}`,
      severity: analysis.riskLevel,
      read: false,
      readAt: null,
      date: getSystemDateString(),
      time: getSystemTimeString(),
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
    date: getSystemDateString(),
    time: getSystemTimeString(),
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
        date: getSystemDateString(),
        time: getSystemTimeString(),
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

  // ── INTERACTION LOG EMAILS ──
  // Notify the account owner + all stakeholders (contact owners for this account)
  // asynchronously so it never blocks the response.
  (async () => {
    try {
      const ownerId = accountDoc.data().ownerId;
      const contactsSnap = await db.collection('contacts').where('accountId', '==', accountId).get();
      const stakeholderUids = contactsSnap.docs.map(d => d.data().ownerId).filter(Boolean);

      const notifySet = new Set([ownerId, ...stakeholderUids].filter(uid => uid && uid !== user.uid));
      const notifyUids = [...notifySet];

      if (notifyUids.length > 0) {
        await sendInteractionLoggedEmail(notifyUids, {
          companyName,
          source,
          subject: cleanSubject,
          date: newInteraction.date,
          time: newInteraction.time,
          loggedBy: loggedByName,
          messageSummary: messageText.length > 200 ? messageText.slice(0, 200) + '...' : messageText,
          sentiment: analysis.sentiment,
          accountId
        });
      }
    } catch (emailErr) {
      console.error('[interaction.service] sendInteractionLoggedEmail error:', emailErr.message);
    }
  })();

  const assigneeNames = Array.isArray(actionMentions) && actionMentions.length > 0
    ? actionMentions.map(m => m.name).join(', ')
    : '';
  const detailsSuffix = assigneeNames ? ` (Assigned to: ${assigneeNames})` : '';

  await logActivity(user.uid, user.name, 'Create Interaction', `Logged ${source} interaction "${cleanSubject || 'No Subject'}" for account ${companyName}${detailsSuffix}`);

  return {
    interaction: {
      ...newInteraction,
      notifications: mentionNotifications
    },
    analysis,
    health: updatedHealth
  };
}
