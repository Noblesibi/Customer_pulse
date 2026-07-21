import { Router } from 'express';
import { db } from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';
import { NotificationEngine } from '../services/notification/NotificationEngine.js';
import { smtpProvider } from '../services/notification/SmtpEmailProvider.js';
import { listTemplates, renderTemplate } from '../services/notification/TemplateEngine.js';

const router = Router();
router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/email-engine/stats
// Dashboard statistics — sent today, pending, failed, queued, etc.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [queueSnap, logSnap] = await Promise.all([
      db.collection('emailqueue').get(),
      db.collection('emaillogs').get()
    ]);

    const queued = queueSnap.docs.map(d => d.data());
    const logs   = logSnap.docs.map(d => d.data());

    const todayStr = new Date().toISOString().split('T')[0];

    const stats = {
      totalQueued:   queued.filter(q => q.status === 'queued').length,
      totalPending:  queued.filter(q => ['queued', 'processing'].includes(q.status)).length,
      totalFailed:   queued.filter(q => q.status === 'failed').length,
      totalSentToday: logs.filter(l => l.status === 'sent' && (l.sentAt || '').startsWith(todayStr)).length,
      totalMockSentToday: logs.filter(l => l.isMock && (l.sentAt || '').startsWith(todayStr)).length,
      totalSentAllTime: logs.filter(l => l.status === 'sent').length,
      totalFailedAllTime: logs.filter(l => l.status === 'failed').length,
      reminderEmails: logs.filter(l => l.eventType === 'task_reminder').length,
      greetingEmails: logs.filter(l => ['birthday', 'work_anniversary', 'festival', 'welcome', 'farewell', 'promotion', 'achievement', 'custom_greeting'].includes(l.eventType)).length,
      taskNotifications: logs.filter(l => l.eventType && l.eventType.startsWith('task_')).length,
      smtpMode: smtpProvider.getProviderName()
    };

    // Monthly breakdown (last 6 months)
    const monthly = {};
    logs.forEach(l => {
      if (!l.sentAt) return;
      const month = l.sentAt.substring(0, 7); // YYYY-MM
      if (!monthly[month]) monthly[month] = { sent: 0, failed: 0 };
      if (l.status === 'sent') monthly[month].sent++;
      else if (l.status === 'failed') monthly[month].failed++;
    });
    stats.monthly = Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, data]) => ({ month, ...data }));

    return res.json(stats);
  } catch (err) {
    console.error('[EmailEngine] /stats error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/email-engine/queue
// List email queue items with optional status filter
// ─────────────────────────────────────────────────────────────────────────────
router.get('/queue', async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    const snap = await db.collection('emailqueue').get();
    let items = snap.docs
      .map(d => d.data())
      .filter(item => item.status !== 'scheduled_marker'); // hide internal markers

    if (status) {
      items = items.filter(i => i.status === status);
    }

    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(items.slice(0, parseInt(limit)));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/email-engine/logs
// Email history with search / filter
// ─────────────────────────────────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  try {
    const { status, eventType, search, limit = 200 } = req.query;
    const snap = await db.collection('emaillogs').get();
    let logs = snap.docs.map(d => d.data());

    if (status)    logs = logs.filter(l => l.status === status);
    if (eventType) logs = logs.filter(l => l.eventType === eventType);
    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(l =>
        (l.recipientEmail || '').toLowerCase().includes(q) ||
        (l.subject || '').toLowerCase().includes(q) ||
        (l.recipientName || '').toLowerCase().includes(q)
      );
    }

    logs.sort((a, b) => new Date(b.sentAt || b.createdAt) - new Date(a.sentAt || a.createdAt));
    return res.json(logs.slice(0, parseInt(limit)));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/email-engine/retry/:id
// Retry a single failed queue item
// ─────────────────────────────────────────────────────────────────────────────
router.post('/retry/:id', requireRole(['Admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const doc = await db.collection('emailqueue').doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Queue item not found' });
    const item = doc.data();
    if (!['failed', 'queued'].includes(item.status)) {
      return res.status(400).json({ error: `Cannot retry item with status '${item.status}'` });
    }
    await db.collection('emailqueue').doc(id).update({
      status: 'queued',
      retryCount: 0,
      failureReason: null,
      scheduledAt: new Date().toISOString()
    });
    return res.json({ success: true, message: 'Email requeued for delivery.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/email-engine/retry-all
// Bulk retry all failed emails
// ─────────────────────────────────────────────────────────────────────────────
router.post('/retry-all', requireRole(['Admin']), async (req, res) => {
  try {
    const snap = await db.collection('emailqueue').get();
    const failed = snap.docs.filter(d => d.data().status === 'failed');
    await Promise.all(
      failed.map(d => d.ref.update({
        status: 'queued',
        retryCount: 0,
        failureReason: null,
        scheduledAt: new Date().toISOString()
      }))
    );
    return res.json({ success: true, requeued: failed.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/email-engine/queue/:id
// Cancel a queued email
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/queue/:id', requireRole(['Admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const doc = await db.collection('emailqueue').doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Queue item not found' });
    await db.collection('emailqueue').doc(id).update({ status: 'cancelled' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/email-engine/bulk-cancel
// Cancel all queued emails
// ─────────────────────────────────────────────────────────────────────────────
router.post('/bulk-cancel', requireRole(['Admin']), async (req, res) => {
  try {
    const snap = await db.collection('emailqueue').get();
    const toCancel = snap.docs.filter(d => d.data().status === 'queued');
    await Promise.all(toCancel.map(d => d.ref.update({ status: 'cancelled' })));
    return res.json({ success: true, cancelled: toCancel.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/email-engine/templates
// List all registered templates
// ─────────────────────────────────────────────────────────────────────────────
router.get('/templates', async (req, res) => {
  try {
    return res.json(listTemplates());
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/email-engine/templates/:id/preview
// Preview a rendered template with sample data
// ─────────────────────────────────────────────────────────────────────────────
router.get('/templates/:id/preview', async (req, res) => {
  const { id } = req.params;
  try {
    const sample = {
      EmployeeName: req.user.name || 'John Doe',
      TaskTitle: 'Complete Q3 Client Report',
      TaskDescription: 'Prepare the comprehensive Q3 client satisfaction report for Acme Corporation.',
      Priority: 'High',
      DueDate: '2026-08-15',
      AssignedBy: 'Alice Manager',
      CompanyName: 'Acme Corporation',
      CustomerName: 'Acme Corporation',
      Status: 'In Progress',
      UpdatedBy: 'Alice Manager',
      AuthorName: 'Alice Manager',
      CommentText: 'Please prioritize this task and ensure it is completed before the deadline.',
      Years: 3,
      FestivalName: 'Eid Al Adha',
      FestivalEmoji: '🕌',
      AnnouncementTitle: 'Company Town Hall — Q3 2026',
      AnnouncementBody: 'We are pleased to invite all employees to our Q3 Town Hall meeting scheduled for next Friday at 3:00 PM.',
      GreetingTitle: 'Special Recognition',
      GreetingMessage: 'Thank you for your outstanding contributions to the team this quarter.',
      CurrentYear: new Date().getFullYear()
    };
    const rendered = renderTemplate(id, sample);
    return res.json(rendered);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/email-engine/preferences/:uid
// Get notification preferences for a user
// ─────────────────────────────────────────────────────────────────────────────
router.get('/preferences/:uid', async (req, res) => {
  const { uid } = req.params;
  // Users can only read their own prefs; Admins can read anyone's
  if (req.user.uid !== uid && req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const prefs = await NotificationEngine.getPreferences(uid);
    return res.json(prefs);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/email-engine/preferences/:uid
// Update notification preferences for a user
// ─────────────────────────────────────────────────────────────────────────────
router.put('/preferences/:uid', async (req, res) => {
  const { uid } = req.params;
  if (req.user.uid !== uid && req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const updated = await NotificationEngine.updatePreferences(uid, req.body);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/email-engine/test
// Send a test email to the currently logged-in user
// ─────────────────────────────────────────────────────────────────────────────
router.post('/test', requireRole(['Admin']), async (req, res) => {
  const { templateId = 'task_assigned', recipientUid } = req.body;
  const targetUid = recipientUid || req.user.uid;
  try {
    await NotificationEngine.publishEvent(templateId, {
      TaskTitle: 'Test Task — Email Engine Verification',
      Priority: 'High',
      DueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      AssignedBy: req.user.name || 'System',
      CompanyName: 'Internal Test',
      InAppMessage: `Test email sent via NotificationEngine using template: ${templateId}`
    }, [targetUid], { skipInAppNotification: false });
    return res.json({ success: true, message: `Test notification queued for uid: ${targetUid}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/email-engine/smtp-status
// Verify SMTP connectivity
// ─────────────────────────────────────────────────────────────────────────────
router.get('/smtp-status', requireRole(['Admin']), async (req, res) => {
  try {
    const result = await smtpProvider.verify();
    return res.json({ ...result, provider: smtpProvider.getProviderName() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
