import { Router } from 'express';
import { db } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { fetchRecentMessages } from '../services/outlookSync.service.js';
import { createInteraction } from '../services/interaction.service.js';
import { google } from 'googleapis';
import {
  generateGoogleAuthUrl,
  handleGoogleCallback,
  getGoogleClientForUser
} from '../services/google.service.js';

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
import { syncTeamsMeetingsForOrganizer } from '../services/teamsSync.service.js';

// Require auth for manual sync
router.use(authenticateToken);

/**
 * POST /api/integrations/teams/sync
 * Trigger synchronization of Microsoft Teams meetings and transcripts.
 */
router.post('/teams/sync', async (req, res) => {
  try {
    const organizerEmail = req.body?.organizerEmail || req.user?.email || process.env.MICROSOFT_TEST_MAILBOX;
    if (!organizerEmail) {
      return res.status(400).json({ error: 'Organizer email is required for Teams synchronization.' });
    }

    const { daysBack = 14, daysAhead = 7 } = req.body || {};

    const outcome = await syncTeamsMeetingsForOrganizer({
      organizerEmail,
      daysBack: parseInt(daysBack, 10),
      daysAhead: parseInt(daysAhead, 10),
      user: req.user
    });

    return res.status(200).json({
      message: 'Teams synchronization complete',
      summary: outcome
    });
  } catch (error) {
    console.error('Error in Teams sync:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/integrations/teams/meetings
 * List synced Teams meetings from PostgreSQL
 */
router.get('/teams/meetings', async (req, res) => {
  try {
    const { accountId, limit = 50 } = req.query;
    let query = db.collection('teamsmeetings');
    if (accountId) {
      query = query.where('accountId', '==', accountId);
    }
    const snap = await query.limit(parseInt(limit, 10)).get();
    const meetings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return res.status(200).json(meetings);
  } catch (error) {
    console.error('Error fetching Teams meetings:', error);
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
