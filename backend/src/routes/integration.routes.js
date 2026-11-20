import { Router } from 'express';
import { db, logActivity } from '../config/database.js';
import { authenticateToken, requireDbAdmin, getPermittedAccountIdsForUser } from '../middleware/auth.middleware.js';
import { fetchRecentMessages } from '../services/outlookSync.service.js';
import { createInteraction } from '../services/interaction.service.js';
import { google } from 'googleapis';
import {
  generateGoogleAuthUrl,
  handleGoogleCallback,
  getGoogleClientForUser
} from '../services/google.service.js';
import { inspectDevGraphConfigReadiness } from '../services/microsoftGraph.service.js';
import {
  listAuthorizedOrganizers,
  recalculateEligibleOrganizers,
} from '../services/organizerSync.service.js';
import {
  syncTeamsMeetingsForOrganizer,
  resolveTeamsReviewItem,
  getTeamsOperationalStatus,
  retryFailedTeamsOperations,
} from '../services/teamsSync.service.js';

const router = Router();

// ─────────────────────────────────────────────────────────────
// GOOGLE INTEGRATION (Phase 1 OAuth)
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/integrations/google/connect
 * Returns Google OAuth consent URL for authenticated user.
 */
router.get('/google/connect', authenticateToken, (req, res) => {
  try {
    if ((process.env.GOOGLE_ENABLED || '').trim() !== 'true') {
      return res.status(403).json({ error: 'Google integration is disabled.' });
    }
    const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
    const url = generateGoogleAuthUrl(req.user.uid, origin);
    res.json({ url });
  } catch (err) {
    console.error('[Google Connect]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/integrations/google/callback
 * Handles Google OAuth callback (Unprotected by authenticateToken because Google redirects directly here).
 */
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).send(`Google authorization failed: ${error}`);
    }

    if (!code || !state) {
      return res.status(400).send('Missing authorization code or state');
    }

    const { origin } = await handleGoogleCallback(code, state);

    // Determine the actual frontend origin: priority to decrypted state origin, then FRONTEND_URL env, then 5173
    let baseOrigin = (origin || process.env.FRONTEND_URL || 'http://localhost:5173').trim();
    // Safety check: Never redirect to dead port 3000 if active frontend is Vite (5173)
    if (baseOrigin.includes(':3000') && !process.env.FRONTEND_URL?.includes(':3000')) {
      baseOrigin = baseOrigin.replace(':3000', ':5173');
    }
    baseOrigin = baseOrigin.replace(/\/+$/, '');

    res.redirect(`${baseOrigin}/CustomerPulse/dashboard?google_connected=true`);
  } catch (err) {
    console.error('[Google Callback]', err);
    res.status(400).send(`Integration failed: ${err.message}`);
  }
});

/**
 * GET /api/integrations/google/status
 * Returns connection status.
 */
router.get('/google/status', authenticateToken, async (req, res) => {
  try {
    const { db } = await import('../config/database.js');
    const integrationsRef = db.collection('userintegrations');
    const existingDocs = await integrationsRef.where('userId', '==', req.user.uid).get();

    const googleIntegration = existingDocs.docs
      .map(d => d.data())
      .find(i => i.provider === 'GOOGLE' && i.status === 'ACTIVE');

    if (!googleIntegration || !googleIntegration.accessToken) {
      return res.json({ connected: false });
    }

    let formattedExpiry = null;
    if (googleIntegration.tokenExpiry) {
      const numExpiry = Number(googleIntegration.tokenExpiry);
      const parsedDate = !isNaN(numExpiry) ? new Date(numExpiry) : new Date(googleIntegration.tokenExpiry);
      if (!isNaN(parsedDate.getTime())) {
        formattedExpiry = parsedDate.toISOString();
      }
    }

    res.json({
      connected: true,
      provider: 'GOOGLE',
      scopes: googleIntegration.scope ? googleIntegration.scope.split(' ') : [],
      expiresAt: formattedExpiry,
      lastCheckedAt: googleIntegration.updatedAt
    });
  } catch (err) {
    console.error('[Google Status]', err);
    res.status(500).json({ error: 'Failed to retrieve integration status' });
  }
});

/**
 * GET /api/integrations/google/test/contacts
 * Tests Google People API connectivity.
 */
router.get('/google/test/contacts', authenticateToken, async (req, res) => {
  try {
    const oauth2Client = await getGoogleClientForUser(req.user.uid);
    const people = google.people({ version: 'v1', auth: oauth2Client });

    const response = await people.people.connections.list({
      resourceName: 'people/me',
      personFields: 'names,emailAddresses,birthdays',
      pageSize: 100
    });

    const connections = response.data.connections || [];

    const contacts = connections.map(c => {
      const name = c.names?.[0]?.displayName || 'Unknown';
      const emails = (c.emailAddresses || []).map(e => e.value);
      const birthdays = (c.birthdays || []).map(b => b.date ? `${b.date.year ? b.date.year + '-' : ''}${b.date.month}-${b.date.day}` : 'Unknown');
      return { name, emails, birthdays };
    });

    res.json({
      success: true,
      count: contacts.length,
      contacts
    });
  } catch (err) {
    console.error('[Google Contacts Test]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/integrations/google/test/calendar
 * Tests Google Calendar API connectivity.
 */
router.get('/google/test/calendar', authenticateToken, async (req, res) => {
  try {
    const oauth2Client = await getGoogleClientForUser(req.user.uid);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const items = response.data.items || [];

    const events = items.map(e => ({
      id: e.id,
      summary: e.summary || '(No title)',
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      attendees: (e.attendees || []).map(a => ({ email: a.email }))
    }));

    res.json({
      success: true,
      count: events.length,
      events
    });
  } catch (err) {
    console.error('[Google Calendar Test]', err);
    res.status(500).json({ error: err.message });
  }
});

import { syncEmails } from '../services/emailTracking.service.js';

// Require auth for Microsoft/Teams integration endpoints
router.use(authenticateToken);

/**
 * GET /api/integrations/teams/readiness
 * GET /api/integrations/teams/status
 * Operational visibility for automated Microsoft Teams integration (Phase 12).
 * Zero manual employee approval controls.
 */
router.get(['/teams/readiness', '/teams/status'], async (_req, res) => {
  try {
    const status = await getTeamsOperationalStatus();
    return res.json(status);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/integrations/teams/authorized-organizers
 * Read-only list of automatically calculated Account Owner & Key Contact Owner organizers.
 */
router.get('/teams/authorized-organizers', async (req, res) => {
  try {
    const list = await listAuthorizedOrganizers({
      status: req.query.status || null,
      eligibleOnly: req.query.eligibleOnly === 'true',
    });
    return res.json(list);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/integrations/teams/retry
 * Retries failed technical synchronization operations (policy queue, AI intelligence, eligibility recalculation).
 * Does NOT allow manual employee approval or manual organizer additions.
 */
router.post('/teams/retry', requireDbAdmin, async (req, res) => {
  try {
    const outcome = await retryFailedTeamsOperations({ user: req.user });
    const status = await getTeamsOperationalStatus();
    return res.status(200).json({
      success: true,
      outcome,
      status,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/integrations/teams/recalculate-organizers
 * Triggers automatic ownership recalculation from CRM Accounts and Contacts.
 */
router.post('/teams/recalculate-organizers', requireDbAdmin, async (_req, res) => {
  try {
    const summary = await recalculateEligibleOrganizers({ triggerSource: 'TECHNICAL_RECALCULATION' });
    return res.status(200).json({ success: true, summary });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/integrations/teams/sync
 * Admin-only controlled synchronization of Microsoft Teams meetings & transcripts.
 * Validates organizerEmail against IT-approved AuthorizedMailboxes before any Graph call.
 */
router.post('/teams/sync', requireDbAdmin, async (req, res) => {
  try {
    const { organizerEmail, joinWebUrl, onlineMeetingId, meetingRefs = [], daysBack = 14, daysAhead = 7 } = req.body || {};

    if (!organizerEmail || typeof organizerEmail !== 'string' || !organizerEmail.trim()) {
      return res.status(400).json({ error: 'Explicit IT-approved organizerEmail is required for Teams synchronization.' });
    }

    const combinedRefs = Array.isArray(meetingRefs) ? [...meetingRefs] : [];
    if (joinWebUrl || onlineMeetingId) {
      combinedRefs.push({
        ...(joinWebUrl ? { joinWebUrl } : {}),
        ...(onlineMeetingId ? { onlineMeetingId } : {}),
      });
    }

    const outcome = await syncTeamsMeetingsForOrganizer({
      organizerEmail: organizerEmail.trim(),
      meetingRefs: combinedRefs,
      daysBack: parseInt(daysBack, 10) || 14,
      daysAhead: parseInt(daysAhead, 10) || 7,
      user: req.user,
    });

    await logActivity(
      req.user.uid,
      req.user.name || req.user.email,
      'ADMIN_TEAMS_SYNC',
      `Triggered Teams sync for ${outcome.organizerEmail}: ${outcome.interactionsCreated} created, ${outcome.duplicatesSkipped} duplicate(s), ${outcome.queuedForReview} review`
    ).catch(() => { });

    return res.status(200).json({
      message: 'Teams synchronization complete',
      summary: outcome,
    });
  } catch (error) {
    if (error.code === 'UNAUTHORIZED_ORGANIZER') {
      await logActivity(
        req.user?.uid || 'unknown',
        req.user?.name || req.user?.email || 'Unknown',
        'UNAUTHORIZED_TEAMS_SYNC_BLOCKED',
        `Blocked unauthorized Teams sync attempt for organizer: ${req.body?.organizerEmail || 'none'} (${error.reason})`
      ).catch(() => { });
      return res.status(403).json({ error: error.message, reason: error.reason });
    }
    console.error('Error in Teams sync:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/integrations/teams/meetings
 * List synced Teams meetings from PostgreSQL, enforced by account-level RBAC.
 */
router.get('/teams/meetings', async (req, res) => {
  try {
    const { accountId, limit = 50 } = req.query;
    const { unrestricted, accountIds } = await getPermittedAccountIdsForUser(req.user);

    if (accountId && !unrestricted && !accountIds.has(accountId)) {
      return res.status(403).json({ error: 'Forbidden: you do not have access to this account.' });
    }

    let query = db.collection('teamsmeetings');
    if (accountId) {
      query = query.where('accountId', '==', accountId);
    }
    const snap = await query.get();
    let meetings = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(m => {
        const mId = String(m.meetingId || m.id || '');
        const url = String(m.joinWebUrl || '').toLowerCase();
        if (url.includes('/test-qbr-cadence') || url.includes('/dummy')) return false;
        if (mId === 'mtg_1794247825656' || mId.toLowerCase().includes('dummy')) return false;
        return true;
      });

    if (!unrestricted) {
      meetings = meetings.filter(m => m.accountId && accountIds.has(m.accountId));
    }

    meetings.sort((a, b) => new Date(b.startDateTime || 0) - new Date(a.startDateTime || 0));
    return res.status(200).json(meetings.slice(0, parseInt(limit, 10) || 50));
  } catch (error) {
    console.error('Error fetching Teams meetings:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/integrations/teams/sync-history
 * Admin-only history of Teams synchronization runs.
 */
router.get('/teams/sync-history', requireDbAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 30;
    const snap = await db.collection('synchistory').get();
    const rows = snap.docs
      .map(d => d.data())
      .filter(r => r.provider === 'Microsoft Teams')
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, limit);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/integrations/teams/review-queue
 * Admin-only queue of unmatched / multi-account ambiguous Teams meetings.
 */
router.get('/teams/review-queue', requireDbAdmin, async (req, res) => {
  try {
    const statusFilter = req.query.status || 'PENDING_REVIEW';
    const snap = await db.collection('communicationreviewqueue').get();
    let rows = snap.docs.map(d => d.data()).filter(r => r.channel === 'TEAMS_MEETING');
    if (statusFilter !== 'ALL') {
      rows = rows.filter(r => r.status === statusFilter);
    }
    rows.sort((a, b) => new Date(b.occurredAt || b.createdAt || 0) - new Date(a.occurredAt || a.createdAt || 0));
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/integrations/teams/review-queue/:reviewId/resolve
 * Admin-only association of a queued Teams meeting to a verified CRM Account.
 */
router.post('/teams/review-queue/:reviewId/resolve', requireDbAdmin, async (req, res) => {
  try {
    const { accountId, contactId = null } = req.body || {};
    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required to resolve review item.' });
    }
    const result = await resolveTeamsReviewItem({
      reviewId: req.params.reviewId,
      accountId,
      contactId,
      user: req.user,
    });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/integrations/teams/review-queue/:reviewId/ignore
 * Admin-only dismissal of an unrelated Teams meeting in the review queue.
 */
router.post('/teams/review-queue/:reviewId/ignore', requireDbAdmin, async (req, res) => {
  try {
    const doc = await db.collection('communicationreviewqueue').doc(req.params.reviewId).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Review queue item not found.' });
    }
    const now = new Date().toISOString();
    await db.collection('communicationreviewqueue').doc(req.params.reviewId).update({
      status: 'IGNORED',
      resolvedByUid: req.user.uid,
      resolvedAt: now,
      updatedAt: now,
    });
    return res.json({ success: true, reviewId: req.params.reviewId, status: 'IGNORED' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/integrations/microsoft/sync
 * Trigger synchronization of the Microsoft 365 mailbox.
 */
router.post('/microsoft/sync', async (req, res) => {
  try {
    const outcome = await syncEmails(req.user);
    if (outcome.error) {
      return res.status(500).json({ error: outcome.error });
    }
    return res.status(200).json({
      message: 'Synchronization complete',
      syncRecord: outcome.syncRecord || { results: { synced: 0 } }
    });
  } catch (error) {
    console.error('Error in Microsoft sync:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
