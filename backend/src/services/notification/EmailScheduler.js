import { db } from '../../config/database.js';
import { smtpProvider } from './SmtpEmailProvider.js';
import { NotificationEngine } from './NotificationEngine.js';

const QUEUE_INTERVAL_MS  = 30 * 1000;        // Process queue every 30 seconds
const REMINDER_INTERVAL_MS = 5 * 60 * 1000; // Scan for reminders every 5 minutes
const BATCH_SIZE = 10;                        // Max emails per queue run

let queueTimer = null;
let reminderTimer = null;
let isProcessing = false;

// ─────────────────────────────────────────────────────────────────────────────
// Queue Processor — picks up 'queued' items, sends, logs result
// ─────────────────────────────────────────────────────────────────────────────
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const snapshot = await db.collection('emailqueue').get();
    const now = new Date();

    const pending = snapshot.docs
      .map(d => d.data())
      .filter(item =>
        item.status === 'queued' &&
        item.retryCount < (item.maxRetries || 3) &&
        new Date(item.scheduledAt || item.createdAt) <= now
      )
      .slice(0, BATCH_SIZE);

    if (pending.length === 0) {
      isProcessing = false;
      return;
    }

    console.log(`📬 [EmailScheduler] Processing ${pending.length} queued email(s)...`);

    for (const item of pending) {
      // Mark as processing
      await db.collection('emailqueue').doc(item.queueId).update({
        status: 'processing',
        processedAt: new Date().toISOString()
      });

      const result = await smtpProvider.send({
        to: item.recipientEmail,
        subject: item.subject,
        html: item.htmlBody
      });

      const sentAt = new Date().toISOString();

      if (result.success) {
        // Mark queue item as sent
        await db.collection('emailqueue').doc(item.queueId).update({
          status: result.mock ? 'mock_sent' : 'sent',
          processedAt: sentAt,
          smtpResponse: result.messageId || 'mock'
        });

        // Write email log
        await writeEmailLog(item, 'sent', sentAt, result.messageId, null, result.mock);

      } else {
        const newRetry = (item.retryCount || 0) + 1;
        const isFinal = newRetry >= (item.maxRetries || 3);

        await db.collection('emailqueue').doc(item.queueId).update({
          status: isFinal ? 'failed' : 'queued',
          retryCount: newRetry,
          failureReason: result.error,
          processedAt: sentAt
        });

        if (isFinal) {
          await writeEmailLog(item, 'failed', sentAt, null, result.error, false);
          console.error(`❌ [EmailScheduler] Permanently failed after ${newRetry} retries: ${item.recipientEmail} | ${result.error}`);
        } else {
          console.warn(`⚠️  [EmailScheduler] Retry ${newRetry}/${item.maxRetries} queued for: ${item.recipientEmail}`);
        }
      }
    }
  } catch (err) {
    console.error('[EmailScheduler] Queue processing error:', err.message);
  } finally {
    isProcessing = false;
  }
}

async function writeEmailLog(item, status, sentAt, smtpResponse, failureReason, isMock) {
  try {
    const logId = 'log-' + Math.random().toString(36).substring(2, 13);
    await db.collection('emaillogs').doc(logId).set({
      logId,
      queueId: item.queueId,
      recipientEmail: item.recipientEmail,
      recipientName: item.recipientName,
      recipientUid: item.recipientUid,
      subject: item.subject,
      htmlBody: item.htmlBody,
      eventType: item.eventType,
      templateId: item.templateId,
      status,
      smtpResponse: smtpResponse || null,
      retryCount: item.retryCount || 0,
      failureReason: failureReason || null,
      isMock: isMock || false,
      relatedTaskId: item.relatedTaskId || null,
      relatedAccountId: item.relatedAccountId || null,
      createdAt: item.createdAt,
      sentAt
    });
  } catch (err) {
    console.error('[EmailScheduler] Failed to write email log:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reminder & Greeting Scanner
// ─────────────────────────────────────────────────────────────────────────────
async function scanRemindersAndGreetings() {
  try {
    await scanTaskReminders();
    await scanBirthdaysAndAnniversaries();
  } catch (err) {
    console.error('[EmailScheduler] Reminder scan error:', err.message);
  }
}

async function scanTaskReminders() {
  const snapshot = await db.collection('tasks').get();
  const tasks = snapshot.docs.map(d => d.data());
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  for (const task of tasks) {
    if (!task.dueDate || ['Completed', 'Cancelled', 'Declined', 'Decline'].includes(task.status)) continue;

    const due = new Date(task.dueDate);
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

    // 1-day reminder
    if (diffDays === 1) {
      const reminderKey = `reminder-1d-${task.taskId}-${todayStr}`;
      const existing = await db.collection('emailqueue').where('queueId', '==', reminderKey).get();
      if (existing.docs.length === 0) {
        await NotificationEngine.publishEvent('task_reminder', {
          TaskTitle: task.title || task.description,
          TaskId: task.taskId,
          Priority: task.priority || 'Normal',
          DueDate: task.dueDate,
          ReminderLabel: '1 day before due date',
          InAppMessage: `Reminder: Task "${task.title}" is due tomorrow.`
        }, [task.assignedToUid].filter(Boolean), {
          relatedTaskId: task.taskId,
          skipInAppNotification: false
        });
        // Mark in queue with fixed ID so we don't re-send today
        await db.collection('emailqueue').doc(reminderKey).set({
          queueId: reminderKey,
          status: 'scheduled_marker',
          createdAt: new Date().toISOString()
        });
      }
    }

    // Overdue notification (1 day past due)
    if (diffDays < 0 && diffDays >= -1) {
      const overdueKey = `overdue-${task.taskId}-${todayStr}`;
      const existing = await db.collection('emailqueue').where('queueId', '==', overdueKey).get();
      if (existing.docs.length === 0) {
        await NotificationEngine.publishEvent('task_overdue', {
          TaskTitle: task.title || task.description,
          TaskId: task.taskId,
          Priority: task.priority || 'Normal',
          DueDate: task.dueDate,
          DaysOverdue: Math.abs(diffDays),
          InAppMessage: `Task "${task.title}" is overdue by ${Math.abs(diffDays)} day(s).`
        }, [task.assignedToUid, task.assignedByUid].filter(Boolean), {
          relatedTaskId: task.taskId
        });
        await db.collection('emailqueue').doc(overdueKey).set({
          queueId: overdueKey,
          status: 'scheduled_marker',
          createdAt: new Date().toISOString()
        });
      }
    }
  }
}

async function scanBirthdaysAndAnniversaries() {
  const snapshot = await db.collection('users').get();
  const users = snapshot.docs.map(d => d.data());
  const today = new Date();
  const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const todayStr = today.toISOString().split('T')[0];

  for (const user of users) {
    if (!user.uid || !user.email) continue;

    // Birthday check
    if (user.birthday) {
      const bdayMD = user.birthday.substring(5, 10); // MM-DD from YYYY-MM-DD
      if (bdayMD === todayMD) {
        const bdayKey = `birthday-${user.uid}-${todayStr}`;
        const existing = await db.collection('emailqueue').doc(bdayKey).get();
        if (!existing.exists) {
          await NotificationEngine.publishEvent('birthday', {
            EmployeeName: user.name || user.email,
            InAppMessage: `🎂 Happy Birthday, ${user.name}!`
          }, [user.uid], { skipInAppNotification: false });
          // Use fixed ID to prevent duplicate sends today
          await db.collection('emailqueue').doc(bdayKey).set({
            queueId: bdayKey, status: 'scheduled_marker', createdAt: new Date().toISOString()
          });
          console.log(`🎂 [EmailScheduler] Birthday email queued for ${user.name}`);
        }
      }
    }

    // Work anniversary check
    if (user.workStartDate) {
      const startMD = user.workStartDate.substring(5, 10);
      if (startMD === todayMD) {
        const startYear = parseInt(user.workStartDate.substring(0, 4));
        const years = today.getFullYear() - startYear;
        if (years > 0) {
          const annivKey = `anniversary-${user.uid}-${todayStr}`;
          const existing = await db.collection('emailqueue').doc(annivKey).get();
          if (!existing.exists) {
            await NotificationEngine.publishEvent('work_anniversary', {
              EmployeeName: user.name || user.email,
              Years: years,
              InAppMessage: `🏆 Congratulations on your ${years}-year work anniversary, ${user.name}!`
            }, [user.uid], { skipInAppNotification: false });
            await db.collection('emailqueue').doc(annivKey).set({
              queueId: annivKey, status: 'scheduled_marker', createdAt: new Date().toISOString()
            });
            console.log(`🏆 [EmailScheduler] Work anniversary email queued for ${user.name} (${years} year(s))`);
          }
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — start / stop the scheduler
// ─────────────────────────────────────────────────────────────────────────────
export function startEmailScheduler() {
  if (queueTimer) return; // already running

  console.log('🕐 [EmailScheduler] Starting email queue processor (interval: 30s)');
  console.log('📅 [EmailScheduler] Starting reminder/greeting scanner (interval: 5min)');

  // Run immediately on startup, then on interval
  processQueue();
  queueTimer = setInterval(processQueue, QUEUE_INTERVAL_MS);

  scanRemindersAndGreetings();
  reminderTimer = setInterval(scanRemindersAndGreetings, REMINDER_INTERVAL_MS);
}

export function stopEmailScheduler() {
  if (queueTimer) { clearInterval(queueTimer); queueTimer = null; }
  if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; }
  console.log('🛑 [EmailScheduler] Stopped.');
}
