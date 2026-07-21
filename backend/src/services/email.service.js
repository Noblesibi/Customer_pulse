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
 * Dispatches a task assignment email notification via the NotificationEngine.
 * @param {string} toUserId - UID of the recipient user
 * @param {object} taskDetails - { task, taskHeader, accountName, priority, dueDate, assignerName }
 */
export async function sendTaskAssignmentEmail(toUserId, taskDetails) {
  try {
    if (!toUserId) return;

    const { task, taskHeader, accountName, priority, dueDate, assignerName } = taskDetails;

    const formattedDueDate = dueDate
      ? new Date(dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'No deadline set';

    await NotificationEngine.publishEvent(
      'task_assigned',
      {
        TaskTitle: taskHeader || 'New Task Assigned',
        TaskDescription: task || '',
        Priority: priority || 'Medium',
        DueDate: formattedDueDate,
        AssignedBy: assignerName || 'System',
        CompanyName: accountName || 'Internal',
        CustomerName: accountName || 'Internal',
        InAppMessage: `${assignerName || 'System'} assigned you a task: "${taskHeader || task}"`
      },
      [toUserId],
      { skipInAppNotification: true } // in-app notif created separately by route
    );
  } catch (err) {
    console.error('[email.service] sendTaskAssignmentEmail delegation error:', err.message);
  }
}
