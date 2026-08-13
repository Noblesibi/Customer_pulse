/**
 * email.service.js — Backward-compatible email service wrapper.
 *
 * The original direct-SMTP implementation has been replaced by delegation
 * to the centralized NotificationEngine. The public function signatures
 * are unchanged so existing callers continue to work without modification.
 *
 * For new code, prefer calling NotificationEngine.publishEvent() directly.
 */
import { db } from '../config/database.js';
import { NotificationEngine } from './notification/NotificationEngine.js';

/**
 * Formats date to DD-MM-YYYY
 */
function formatEmailDate(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr).trim())) {
    const [yyyy, mm, dd] = String(dateStr).trim().split('-');
    return `${dd}-${mm}-${yyyy}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Formats time to 12-hour hh:mm am/pm
 */
function formatEmailTime(timeStr) {
  if (!timeStr) return '';
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(timeStr).trim())) {
    const parts = String(timeStr).trim().split(':');
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1].substring(0, 2);
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  }
  return String(timeStr);
}

/**
 * Dispatches a task assignment email notification via the NotificationEngine.
 * @param {string} toUserId - UID of the recipient user
 * @param {object} taskDetails - { task, taskHeader, accountName, priority, dueDate, assignerName }
 */
export async function sendTaskAssignmentEmail(toUserId, taskDetails) {
  try {
    if (!toUserId) return;

    const { task, taskHeader, accountName, priority, dueDate, assignerName, isAssociated } = taskDetails;

    const formattedDueDate = dueDate
      ? formatEmailDate(dueDate)
      : 'No deadline set';

    const isAssoc = Boolean(isAssociated || (accountName && accountName !== 'Internal Staff Assignment' && accountName !== 'Internal'));
    const eventType = isAssoc ? 'associated_task_assigned' : 'staff_task_assigned';

    await NotificationEngine.publishEvent(
      eventType,
      {
        TaskTitle: taskHeader || 'New Task Assigned',
        TaskDescription: task || '',
        TaskType: isAssoc ? 'Associated Task' : 'Staff Task',
        Priority: priority || 'Medium',
        DueDate: formattedDueDate,
        AssignedBy: assignerName || 'System',
        CompanyName: accountName || 'Internal',
        CustomerName: accountName || 'Internal',
        InAppMessage: `${assignerName || 'System'} assigned you a ${isAssoc ? 'associated' : 'staff'} task: "${taskHeader || task}"`
      },
      [toUserId],
      { skipInAppNotification: true } // in-app notif created separately by route
    );
  } catch (err) {
    console.error('[email.service] sendTaskAssignmentEmail delegation error:', err.message);
  }
}

/**
 * Sends an "interaction logged" email to all users associated with the account
 * (account owner + stakeholders) whenever a new interaction is created.
 * @param {string[]} toUserIds - Array of UIDs (account owner + stakeholders)
 * @param {object} interactionDetails - { companyName, source, subject, date, time, loggedBy, messageSummary, sentiment, accountId }
 */
export async function sendInteractionLoggedEmail(toUserIds, interactionDetails) {
  try {
    if (!toUserIds || toUserIds.length === 0) return;

    const {
      companyName,
      source,
      subject,
      date,
      time,
      loggedBy,
      messageSummary,
      sentiment,
      accountId
    } = interactionDetails;

    const formattedDate = date ? formatEmailDate(date) : formatEmailDate(new Date());
    const formattedTime = time ? formatEmailTime(time) : '';

    await NotificationEngine.publishEvent(
      'interaction_logged',
      {
        CompanyName: companyName || 'Account',
        Source: source || '-',
        Subject: subject || 'Interaction Note',
        Date: formattedDate,
        Time: formattedTime,
        LoggedBy: loggedBy || 'System',
        MessageSummary: messageSummary || '',
        Sentiment: sentiment || 'Neutral',
        AccountId: accountId || null,
        InAppMessage: `New interaction logged for ${companyName || 'your account'} by ${loggedBy || 'System'}`
      },
      toUserIds,
      { skipInAppNotification: true, relatedAccountId: accountId }
    );
  } catch (err) {
    console.error('[email.service] sendInteractionLoggedEmail delegation error:', err.message);
  }
}
