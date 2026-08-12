import { db } from '../../config/database.js';
import { renderTemplate } from './TemplateEngine.js';
import { triggerQueueProcessing } from './EmailScheduler.js';
import { getSystemDateString, getSystemTimeString } from '../../utils/dateUtils.js';

// Default notification preferences — used when a user has not configured their own
const DEFAULT_PREFERENCES = {
  taskAssigned: true,
  taskReassigned: true,
  taskUpdated: true,
  taskReminders: true,
  taskStatusUpdates: true,
  taskComments: true,
  taskAttachments: true,
  taskOverdue: true,
  taskCompleted: true,
  taskCancelled: true,
  greetingEmails: true,
  companyAnnouncements: true,
  customerFollowups: true,
  interactionLogged: true
};

// Maps event types to preference keys so preferences are respected per-event
const EVENT_PREF_MAP = {
  task_assigned:             'taskAssigned',
  staff_task_assigned:       'taskAssigned',
  staff_task_accepted:       'taskStatusUpdates',
  staff_task_forwarded:      'taskReassigned',
  staff_task_declined:       'taskStatusUpdates',
  staff_task_completed:      'taskCompleted',
  staff_task_overdue:        'taskOverdue',
  staff_task_comment:        'taskComments',
  associated_task_assigned:  'taskAssigned',
  associated_task_accepted:  'taskStatusUpdates',
  associated_task_forwarded: 'taskReassigned',
  associated_task_declined:  'taskStatusUpdates',
  associated_task_completed: 'taskCompleted',
  associated_task_overdue:   'taskOverdue',
  associated_task_comment:   'taskComments',
  task_reassigned:           'taskReassigned',
  task_updated:              'taskUpdated',
  task_reminder:             'taskReminders',
  status_changed:            'taskStatusUpdates',
  task_comment:              'taskComments',
  task_attachment:           'taskAttachments',
  task_overdue:              'taskOverdue',
  task_completed:            'taskCompleted',
  task_cancelled:            'taskCancelled',
  birthday:                  'greetingEmails',
  work_anniversary:          'greetingEmails',
  festival:                  'greetingEmails',
  welcome:                   'greetingEmails',
  farewell:                  'greetingEmails',
  promotion:                 'greetingEmails',
  achievement:               'greetingEmails',
  custom_greeting:           'greetingEmails',
  company_announcement:      'companyAnnouncements',
  interaction_logged:        'interactionLogged'
};

/**
 * NotificationEngine — Central event publisher for all CRM notification events.
 *
 * Usage from any CRM module:
 *   import { NotificationEngine } from '../services/notification/NotificationEngine.js';
 *
 *   await NotificationEngine.publishEvent('task_assigned', {
 *     TaskTitle: 'Complete report',
 *     Priority: 'High',
 *     DueDate: '2026-08-01',
 *     AssignedBy: 'Alice',
 *     CompanyName: 'Acme Corp'
 *   }, ['uid-of-assignee']);
 */
class NotificationEngineClass {

  /**
   * Publish a notification event. Creates an email queue entry per recipient
   * and also writes the existing in-app notification document.
   *
   * @param {string} eventType - Template ID (e.g. 'task_assigned', 'birthday')
   * @param {object} payload - Template variables + metadata
   * @param {string[]} recipientUids - Array of user UIDs to notify
   * @param {object} [options]
   * @param {string} [options.scheduledAt] - ISO string for scheduled/delayed delivery
   * @param {string} [options.relatedTaskId]
   * @param {string} [options.relatedAccountId]
   * @param {boolean} [options.skipInAppNotification] - Don't write bell notification
   */
  async publishEvent(eventType, payload = {}, recipientUids = [], options = {}) {
    if (!recipientUids || recipientUids.length === 0) return;

    for (const uid of recipientUids) {
      try {
        await this._processRecipient(eventType, payload, uid, options);
      } catch (err) {
        console.error(`[NotificationEngine] Failed to queue notification for uid=${uid}: ${err.message}`);
      }
    }
  }

  async _processRecipient(eventType, payload, uid, options) {
    // 1. Load user profile with robust multi-tiered fallback
    let user = null;
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      if (userDoc && userDoc.exists) {
        user = userDoc.data();
      }
    } catch (err) {}

    // Fallback 1: Search users collection by id, uid, email, or name
    if (!user) {
      try {
        const allUsersSnap = await db.collection('users').get();
        if (allUsersSnap && allUsersSnap.docs) {
          const targetClean = String(uid).toLowerCase();
          const targetName = (payload.AssignedTo || payload.EmployeeName) ? String(payload.AssignedTo || payload.EmployeeName).toLowerCase() : null;

          const foundDoc = allUsersSnap.docs.find(d => {
            const data = d.data();
            const dId = String(d.id || '').toLowerCase();
            const dUid = String(data.uid || '').toLowerCase();
            const dEmail = String(data.email || '').toLowerCase();
            const dName = String(data.name || '').toLowerCase();

            if (dId === targetClean || dUid === targetClean || dEmail === targetClean) return true;
            if (targetName && dName === targetName) return true;
            if (dEmail && dEmail.includes('@') && targetClean.includes(dEmail.split('@')[0])) return true;
            return false;
          });

          if (foundDoc) {
            user = foundDoc.data();
          }
        }
      } catch (err) {}
    }

    // Fallback 2: Construct virtual recipient for email addresses or sec- IDs
    if (!user && typeof uid === 'string') {
      let derivedEmail = null;
      if (uid.includes('@')) {
        derivedEmail = uid;
      } else if (uid.startsWith('sec-')) {
        const clean = uid.replace('sec-', '');
        const lastUnderscore = clean.lastIndexOf('_');
        if (lastUnderscore !== -1) {
          const userPart = clean.substring(0, lastUnderscore).replace(/_/g, '.');
          const domainPart = clean.substring(lastUnderscore + 1);
          derivedEmail = `${userPart}@${domainPart}`;
        }
      }

      if (derivedEmail) {
        user = {
          uid,
          email: derivedEmail,
          name: payload.AssignedTo || payload.EmployeeName || uid
        };
      }
    }

    if (!user) {
      console.warn(`[NotificationEngine] User ${uid} not found — skipping.`);
      return;
    }
    if (!user.email) {
      console.warn(`[NotificationEngine] User ${user.name || uid} has no email — skipping email queue.`);
      return;
    }

    // 2. Check notification preferences
    const prefDoc = await db.collection('notificationPreferences').doc(uid).get();
    const prefs = prefDoc.exists ? { ...DEFAULT_PREFERENCES, ...prefDoc.data() } : DEFAULT_PREFERENCES;

    const prefKey = EVENT_PREF_MAP[eventType];
    if (prefKey && prefs[prefKey] === false) {
      console.log(`[NotificationEngine] User ${user.name} has disabled '${prefKey}' — skipping.`);
      return;
    }

    // 3. Build template variables
    const variables = {
      EmployeeName: user.name || user.email || 'Team Member',
      CurrentYear: new Date().getFullYear(),
      ...payload
    };

    // 4. Render template to get subject & HTML
    const { subject, html } = renderTemplate(eventType, variables);

    // 5. Queue email if user has an email address
    if (user.email) {
      const queueId = 'eq-' + Math.random().toString(36).substring(2, 13);
      await db.collection('emailqueue').doc(queueId).set({
        queueId,
        recipientUid: uid,
        recipientEmail: user.email,
        recipientName: user.name || user.email,
        eventType,
        templateId: eventType,
        subject,
        htmlBody: html,
        variables,
        relatedTaskId: options.relatedTaskId || payload.TaskId || null,
        relatedAccountId: options.relatedAccountId || payload.AccountId || null,
        status: 'queued',
        retryCount: 0,
        maxRetries: 3,
        scheduledAt: options.scheduledAt || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        processedAt: null,
        failureReason: null
      });

      // Trigger queue processing asynchronously to send email immediately
      try {
        triggerQueueProcessing();
      } catch (e) {}
    }

    // 6. Write in-app bell notification (preserves existing behaviour)
    if (!options.skipInAppNotification) {
      const notifId = 'notif-' + Math.random().toString(36).substring(2, 11);
      const inAppMessage = payload.InAppMessage || `${eventType.replace(/_/g, ' ')} — ${payload.TaskTitle || payload.AnnouncementTitle || ''}`;
      await db.collection('notifications').doc(notifId).set({
        notificationId: notifId,
        toUserId: uid,
        type: eventType,
        message: inAppMessage,
        read: false,
        relatedTaskId: options.relatedTaskId || payload.TaskId || null,
        date: getSystemDateString(),
        time: getSystemTimeString(),
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get or create default notification preferences for a user.
   */
  async getPreferences(uid) {
    const doc = await db.collection('notificationPreferences').doc(uid).get();
    return doc.exists ? { ...DEFAULT_PREFERENCES, ...doc.data() } : { ...DEFAULT_PREFERENCES, uid };
  }

  /**
   * Update notification preferences for a user.
   */
  async updatePreferences(uid, updates) {
    const existing = await this.getPreferences(uid);
    const merged = { ...existing, ...updates, uid, updatedAt: new Date().toISOString() };
    await db.collection('notificationPreferences').doc(uid).set(merged);
    return merged;
  }
}

export const NotificationEngine = new NotificationEngineClass();
