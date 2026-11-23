/**
 * celebration.routes.js
 *
 * REST API for Customer Celebration Intelligence.
 * Mounted at: /api/celebrations
 *
 * Reuses:
 *  - authenticateToken (existing auth middleware)
 *  - requireRole       (existing RBAC middleware)
 *  - db                (existing database adapter)
 *  - celebration.service.js (new service, wraps existing email queue + interactions)
 *
 * Does NOT duplicate:
 *  - Email queue/service
 *  - Interaction logging
 *  - General task/notification system
 */

import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';
import {
  listCelebrations,
  getCelebration,
  createCelebration,
  updateCelebration,
  verifyCelebration,
  rejectCelebration,
  dismissCelebration,
  sendCelebrationGreeting,
  generateGreetingDraft,
  detectFromContacts,
  getCelebrationSummary,
  markCelebrationSentExternal,
  EVENT_TYPES,
  SOURCE_TYPES,
  CELEBRATION_STATUS,
} from '../services/celebration.service.js';

const router = Router();
router.use(authenticateToken);

// ─── GET /api/celebrations ────────────────────────────────────────────────────
// List all celebrations with optional filters
router.get('/', async (req, res) => {
  try {
    const { accountId, contactId, eventType, status, verificationStatus, sourceType } = req.query;
    const events = await listCelebrations({ accountId, contactId, eventType, status, verificationStatus, sourceType });

    // For non-admins, filter to own accounts only (1. Account Owner, 2. Stakeholder Contact Owner)
    const isAdmin = req.user?.role === 'Admin' || req.user?.userType === 'Admin';
    if (!isAdmin) {
      const { db } = await import('../config/database.js');
      const userEmail = req.user.email?.toLowerCase();
      const userName = req.user.name?.toLowerCase();

      const isMatch = (entity) => {
        if (entity.ownerId === req.user.uid) return true;
        if (userEmail && entity.ownerEmail?.toLowerCase() === userEmail) return true;
        if (userName && entity.ownerName?.toLowerCase().includes(userName.split(' ')[0])) return true;
        return false;
      };

      const accsSnap = await db.collection('accounts').get();
      const ownedAccountIds = new Set(
        accsSnap.docs.map(d => d.data()).filter(a => isMatch(a)).map(a => a.accountId || a.id)
      );

      const contactsSnap = await db.collection('contacts').get();
      const stakeholderAccountIds = new Set(
        contactsSnap.docs.map(d => d.data()).filter(c => isMatch(c)).map(c => c.accountId).filter(Boolean)
      );

      const allowedAccountIds = new Set([...ownedAccountIds, ...stakeholderAccountIds]);
      return res.json(events.filter(e => allowedAccountIds.has(e.accountId)));
    }

    return res.json(events);
  } catch (err) {
    console.error('[Celebrations] GET / error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/celebrations/summary ───────────────────────────────────────────
// Dashboard summary counts
router.get('/summary', async (req, res) => {
  try {
    const { accountId } = req.query;
    const summary = await getCelebrationSummary(accountId ? { accountId } : {});
    return res.json(summary);
  } catch (err) {
    console.error('[Celebrations] GET /summary error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/celebrations/upcoming ──────────────────────────────────────────
// Celebrations in the next 30 days (for dashboard & reminders)
router.get('/upcoming', async (req, res) => {
  try {
    const { accountId, days = 30 } = req.query;
    const all = await listCelebrations(accountId ? { accountId } : {});
    const maxDays = parseInt(days, 10);
    const upcoming = all.filter(e =>
      e.daysUntil !== null &&
      e.daysUntil <= maxDays &&
      e.status !== CELEBRATION_STATUS.DISMISSED &&
      e.status !== CELEBRATION_STATUS.SENT &&
      e.status !== CELEBRATION_STATUS.EXPIRED
    );
    return res.json(upcoming);
  } catch (err) {
    console.error('[Celebrations] GET /upcoming error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/celebrations/sources ───────────────────────────────────────────
// Live intelligence source status & deduplicated counts directly from database
router.get('/sources', async (req, res) => {
  try {
    const { accountId } = req.query;
    const { db } = await import('../config/database.js');

    // Use deduplicated celebrations so source counts match the UI 1:1
    const allEvents = await listCelebrations(accountId ? { accountId } : {});
    const activeEvents = allEvents.filter(e =>
      e.status !== 'DISMISSED' && e.status !== 'REJECTED' && e.status !== 'EXPIRED'
    );

    const countsBySource = {};
    for (const ev of activeEvents) {
      const key = ev.sourceType || SOURCE_TYPES.CUSTOMERPULSE;
      countsBySource[key] = (countsBySource[key] || 0) + 1;
    }

    // Check real DB records for account, contacts, and email interactions
    let hasAccountDomain = false;
    let hasContacts = false;
    let emailInteractionCount = 0;

    if (accountId) {
      const [accDoc, contactsSnap, intsSnap] = await Promise.all([
        db.collection('accounts').doc(accountId).get().catch(() => ({ exists: false })),
        db.collection('contacts').where('accountId', '==', accountId).get().catch(() => ({ docs: [] })),
        db.collection('interactions').where('accountId', '==', accountId).get().catch(() => ({ docs: [] })),
      ]);
      const acc = accDoc.exists ? accDoc.data() : null;
      hasAccountDomain = Boolean(acc?.website || (acc?.email && acc.email.includes('@')));
      hasContacts = contactsSnap.docs.length > 0;
      emailInteractionCount = intsSnap.docs.filter(d => {
        const i = d.data();
        const src = String(i.source || i.channel || '').toLowerCase();
        return src.includes('mail') || src.includes('outlook');
      }).length;
    } else {
      const [accsSnap, contactsSnap, intsSnap] = await Promise.all([
        db.collection('accounts').get().catch(() => ({ docs: [] })),
        db.collection('contacts').get().catch(() => ({ docs: [] })),
        db.collection('interactions').get().catch(() => ({ docs: [] })),
      ]);
      hasAccountDomain = accsSnap.docs.some(d => {
        const a = d.data();
        return Boolean(a?.website || (a?.email && a.email.includes('@')));
      });
      hasContacts = contactsSnap.docs.length > 0;
      emailInteractionCount = intsSnap.docs.filter(d => {
        const i = d.data();
        const src = String(i.source || i.channel || '').toLowerCase();
        return src.includes('mail') || src.includes('outlook');
      }).length;
    }

    const crmCount = countsBySource[SOURCE_TYPES.CUSTOMERPULSE] || 0;
    const newsCount = countsBySource[SOURCE_TYPES.PUBLIC_NEWS] || 0;
    const websiteCount = countsBySource[SOURCE_TYPES.OFFICIAL_WEBSITE] || 0;
    const emailCount = countsBySource[SOURCE_TYPES.CRM_EMAIL] || 0;
    const verifiedCount = countsBySource[SOURCE_TYPES.CUSTOMER_VERIFIED] || 0;
    const manualCount = countsBySource[SOURCE_TYPES.MANUAL] || 0;

    return res.json([
      {
        sourceType: SOURCE_TYPES.CUSTOMERPULSE,
        name: 'CustomerPulse CRM',
        enabled: crmCount > 0 || hasContacts,
        statusLabel: crmCount > 0 ? 'Active' : (hasContacts ? 'Ready' : 'No records'),
        activeCount: crmCount,
        description: 'CRM Account & Contact milestones.',
      },
      {
        sourceType: SOURCE_TYPES.PUBLIC_NEWS,
        name: 'Public News Monitoring',
        enabled: newsCount > 0,
        statusLabel: newsCount > 0 ? 'Active' : 'No events',
        activeCount: newsCount,
        description: 'Verified business news, awards, and appointments.',
      },
      {
        sourceType: SOURCE_TYPES.OFFICIAL_WEBSITE,
        name: 'Official Customer Website',
        enabled: websiteCount > 0,
        statusLabel: websiteCount > 0 ? 'Active' : (hasAccountDomain ? 'Ready' : 'No website'),
        activeCount: websiteCount,
        description: 'Press releases, company milestones, and certifications.',
      },
      {
        sourceType: SOURCE_TYPES.CRM_EMAIL,
        name: 'CRM Email Intelligence',
        enabled: emailCount > 0 || emailInteractionCount > 0,
        statusLabel: emailCount > 0 ? 'Active' : (emailInteractionCount > 0 ? 'Monitoring' : 'No emails'),
        activeCount: emailCount,
        description: 'Milestones detected from authorized customer email interactions.',
      },
      {
        sourceType: SOURCE_TYPES.CUSTOMER_VERIFIED,
        name: 'Customer-Verified',
        enabled: verifiedCount > 0,
        statusLabel: verifiedCount > 0 ? 'Active' : 'No records',
        activeCount: verifiedCount,
        description: 'Customer-provided and employee-verified occasions.',
      },
      {
        sourceType: SOURCE_TYPES.MANUAL,
        name: 'Manual Entry',
        enabled: manualCount > 0,
        statusLabel: manualCount > 0 ? 'Active' : 'Ready',
        activeCount: manualCount,
        description: 'Manually entered celebration events.',
      },
    ]);
  } catch (e) {
    console.warn('[Celebrations] Error fetching live sources:', e.message);
    return res.status(500).json({ error: 'Failed to load intelligence sources from database.' });
  }
});

// ─── GET & PUT /api/celebrations/safeguards ──────────────────────────────────
// Persist safeguards directly in PostgreSQL
router.get('/safeguards', async (req, res) => {
  try {
    const { getPostgresPool } = await import('../config/postgres.js');
    const pool = getPostgresPool();
    if (pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "CelebrationSettings" (
          "key" VARCHAR(100) PRIMARY KEY,
          "value" JSONB NOT NULL,
          "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `).catch(() => {});
      const result = await pool.query(`SELECT value FROM "CelebrationSettings" WHERE "key" = 'safeguards'`);
      if (result.rows.length > 0) {
        return res.json(result.rows[0].value);
      }
    }
    return res.json({ autoCreateDrafts: true, autoSend: false });
  } catch (err) {
    console.warn('[Celebrations] Error fetching safeguards:', err.message);
    return res.json({ autoCreateDrafts: true, autoSend: false });
  }
});

router.put('/safeguards', async (req, res) => {
  try {
    const { autoCreateDrafts, autoSend } = req.body;
    const value = {
      autoCreateDrafts: Boolean(autoCreateDrafts),
      autoSend: Boolean(autoSend),
      updatedBy: req.user?.uid || 'user',
      updatedAt: new Date().toISOString()
    };
    const { getPostgresPool } = await import('../config/postgres.js');
    const pool = getPostgresPool();
    if (pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "CelebrationSettings" (
          "key" VARCHAR(100) PRIMARY KEY,
          "value" JSONB NOT NULL,
          "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `).catch(() => {});
      await pool.query(`
        INSERT INTO "CelebrationSettings" ("key", "value", "updatedAt")
        VALUES ('safeguards', $1, NOW())
        ON CONFLICT ("key") DO UPDATE SET "value" = $1, "updatedAt" = NOW()
      `, [JSON.stringify(value)]);
    }
    return res.json({ success: true, safeguards: value });
  } catch (err) {
    console.error('[Celebrations] Error updating safeguards:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Trigger customer intelligence sync
router.post('/intelligence/sync', async (req, res) => {
  try {
    const { runCustomerIntelligenceSync } = await import('../services/customerIntelligence.service.js');
    const result = await runCustomerIntelligenceSync({
      accountId: req.body?.accountId,
      userId: req.user?.uid
    });
    return res.json({ success: true, result });
  } catch (err) {
    console.error('[Celebrations] Intelligence sync error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Trigger festival and public celebration sync
router.post('/festivals/sync', async (req, res) => {
  try {
    const { syncFestivalOccasionsForAccounts } = await import('../services/festivalCelebration.service.js');
    const result = await syncFestivalOccasionsForAccounts({
      accountId: req.body?.accountId,
      lookaheadDays: req.body?.lookaheadDays || 90,
      userId: req.user?.uid
    });
    return res.json({ success: true, result });
  } catch (err) {
    console.error('[Celebrations] Festival sync error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/celebrations/event-types ───────────────────────────────────────
router.get('/event-types', async (_req, res) => {
  return res.json(Object.values(EVENT_TYPES).map(type => ({
    value: type,
    label: type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
  })));
});

// ─── POST /api/celebrations/launch-system-outlook ─────────────────────────────
// Attempts to open the system's registered desktop Outlook application
router.post('/launch-system-outlook', async (req, res) => {
  try {
    const { recipientEmail = '', subject = '', message = '' } = req.body;
    const { exec } = await import('child_process');

    const mailto = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;

    if (process.platform === 'win32') {
      exec(`start "" "${mailto}"`, (err) => {
        if (err) {
          console.warn('[Celebrations] Could not launch system mail client via shell:', err.message);
        }
      });
    } else if (process.platform === 'darwin') {
      exec(`open "${mailto}"`);
    } else {
      exec(`xdg-open "${mailto}"`);
    }

    return res.json({ success: true, launched: true });
  } catch (err) {
    console.warn('[Celebrations] launch-system-outlook error:', err.message);
    return res.json({ success: false, error: err.message });
  }
});

// ─── GET /api/celebrations/:id ────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const event = await getCelebration(req.params.id);
    if (!event) return res.status(404).json({ error: 'Celebration event not found' });
    return res.json(event);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/celebrations ───────────────────────────────────────────────────
// Create a new celebration event (manual entry)
router.post('/', async (req, res) => {
  try {
    const event = await createCelebration(req.body, req.user);
    return res.status(201).json(event);
  } catch (err) {
    console.error('[Celebrations] POST / error:', err);
    const isValidationError = err.message.includes('required') || err.message.includes('already exists');
    return res.status(isValidationError ? 400 : 500).json({ error: err.message });
  }
});

// ─── PUT /api/celebrations/:id ────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const updated = await updateCelebration(req.params.id, req.body, req.user);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/celebrations/:id/verify ───────────────────────────────────────
router.post('/:id/verify', async (req, res) => {
  try {
    const updated = await verifyCelebration(req.params.id, req.user);
    return res.json({ success: true, event: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/celebrations/:id/reject ───────────────────────────────────────
router.post('/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const updated = await rejectCelebration(req.params.id, reason, req.user);
    return res.json({ success: true, event: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/celebrations/:id/dismiss ──────────────────────────────────────
router.post('/:id/dismiss', async (req, res) => {
  try {
    const updated = await dismissCelebration(req.params.id, req.user);
    return res.json({ success: true, event: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/celebrations/:id/draft ────────────────────────────────────────
// Generate an AI greeting draft for this celebration event
router.post('/:id/draft', async (req, res) => {
  try {
    const draft = await generateGreetingDraft(req.params.id, req.body || {});
    return res.json(draft);
  } catch (err) {
    console.error('[Celebrations] POST /:id/draft error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/celebrations/:id/send ─────────────────────────────────────────
// Send or schedule a celebration greeting (reuses EmailQueue)
router.post('/:id/send', async (req, res) => {
  try {
    const { recipientEmail, subject, message, scheduledFor } = req.body;
    const result = await sendCelebrationGreeting(
      req.params.id,
      { recipientEmail, subject, message, scheduledFor },
      req.user
    );
    return res.json(result);
  } catch (err) {
    console.error('[Celebrations] POST /:id/send error:', err);
    const isValidationError = err.message.includes('already') || err.message.includes('required');
    return res.status(isValidationError ? 400 : 500).json({ error: err.message });
  }
});

// ─── POST /api/celebrations/:id/mark-sent ────────────────────────────────────
// Bypass EmailQueue, just log interaction and mark as sent (for mailto/Outlook drafts)
router.post('/:id/mark-sent', async (req, res) => {
  try {
    const { recipientEmail, subject, message } = req.body;
    const result = await markCelebrationSentExternal(
      req.params.id,
      { recipientEmail, subject, message },
      req.user
    );
    return res.json(result);
  } catch (err) {
    console.error('[Celebrations] POST /:id/mark-sent error:', err);
    const isValidationError = err.message.includes('already') || err.message.includes('required');
    return res.status(isValidationError ? 400 : 500).json({ error: err.message });
  }
});

// ─── POST /api/celebrations/:id/schedule ─────────────────────────────────────
// Alias for send with scheduledFor
router.post('/:id/schedule', async (req, res) => {
  try {
    const { recipientEmail, subject, message, scheduledFor } = req.body;
    if (!scheduledFor) return res.status(400).json({ error: 'scheduledFor date/time is required for scheduling' });
    const result = await sendCelebrationGreeting(
      req.params.id,
      { recipientEmail, subject, message, scheduledFor },
      req.user
    );
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/celebrations/detect ───────────────────────────────────────────
// Trigger detection of celebrations from existing CustomerPulse contacts
// Admin-only since it scans all contacts
router.post('/detect', requireRole(['Admin', 'Manager']), async (req, res) => {
  try {
    const { accountId } = req.body;
    const created = await detectFromContacts(accountId || null);
    return res.json({ success: true, detected: created.length, events: created });
  } catch (err) {
    console.error('[Celebrations] POST /detect error:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
