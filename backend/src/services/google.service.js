import { google } from 'googleapis';
import crypto from 'crypto';
import { db } from '../config/database.js';

export function getGoogleOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth configuration is missing in environment variables');
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
}

export function generateGoogleAuthUrl(uid, origin) {
  const oauth2Client = getGoogleOAuth2Client();
  
  // Create a secure state with AES-256 containing uid, origin, and timestamp.
  const state = encryptState({ 
    uid, 
    origin: origin || process.env.FRONTEND_URL || 'http://localhost:5173',
    timestamp: Date.now() 
  });

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // For refresh token
    scope: [
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/calendar.readonly'
    ],
    state,
    prompt: 'consent' // Force consent to ensure we get a refresh token
  });

  return url;
}

export async function handleGoogleCallback(code, state) {
  const decrypted = decryptState(state);
  if (!decrypted || !decrypted.uid) {
    throw new Error('Invalid or expired state');
  }
  
  // Optional: check expiration of state (e.g., 10 minutes)
  if (Date.now() - decrypted.timestamp > 10 * 60 * 1000) {
    throw new Error('OAuth state expired');
  }

  const oauth2Client = getGoogleOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  
  oauth2Client.setCredentials(tokens);

  const uid = decrypted.uid;

  // Store in userintegrations
  const integrationsRef = db.collection('userintegrations');
  const existingDocs = await integrationsRef.where('userId', '==', uid).get();
  
  let googleIntegration = existingDocs.docs
    .map(d => d.data())
    .find(i => i.provider === 'GOOGLE');

  const now = new Date().toISOString();

  if (googleIntegration) {
    // Update existing
    await integrationsRef.doc(googleIntegration.id).update({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || googleIntegration.refreshToken, // Google might not send refresh token if already authorized
      tokenExpiry: tokens.expiry_date || null,
      scope: tokens.scope || '',
      status: 'ACTIVE',
      updatedAt: now
    });
  } else {
    // Create new
    const id = 'uint-' + Math.random().toString(36).substring(2, 11);
    await integrationsRef.doc(id).set({
      id,
      userId: uid,
      provider: 'GOOGLE',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || '',
      tokenExpiry: tokens.expiry_date || null,
      scope: tokens.scope || '',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    });
  }

  return { uid, origin: decrypted.origin || 'http://localhost:5173' };
}

export async function getGoogleClientForUser(uid) {
  const integrationsRef = db.collection('userintegrations');
  const existingDocs = await integrationsRef.where('userId', '==', uid).get();
  
  const googleIntegration = existingDocs.docs
    .map(d => d.data())
    .find(i => i.provider === 'GOOGLE' && i.status === 'ACTIVE');

  if (!googleIntegration || !googleIntegration.accessToken) {
    throw new Error('User has no active Google integration');
  }

  const oauth2Client = getGoogleOAuth2Client();
  oauth2Client.setCredentials({
    access_token: googleIntegration.accessToken,
    refresh_token: googleIntegration.refreshToken,
    expiry_date: googleIntegration.tokenExpiry
  });

  // Automatically refresh token if it's expired
  oauth2Client.on('tokens', async (tokens) => {
    const updateData = {
      accessToken: tokens.access_token,
      updatedAt: new Date().toISOString()
    };
    if (tokens.refresh_token) {
      updateData.refreshToken = tokens.refresh_token;
    }
    if (tokens.expiry_date) {
      updateData.tokenExpiry = tokens.expiry_date;
    }
    await integrationsRef.doc(googleIntegration.id).update(updateData);
  });

  // Proactively refresh if token is expired or expiring within 60 seconds
  if (googleIntegration.tokenExpiry && Date.now() >= (googleIntegration.tokenExpiry - 60000) && googleIntegration.refreshToken) {
    try {
      const refreshed = await oauth2Client.refreshAccessToken();
      if (refreshed?.credentials) {
        oauth2Client.setCredentials(refreshed.credentials);
        await integrationsRef.doc(googleIntegration.id).update({
          accessToken: refreshed.credentials.access_token,
          refreshToken: refreshed.credentials.refresh_token || googleIntegration.refreshToken,
          tokenExpiry: refreshed.credentials.expiry_date || null,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (refreshErr) {
      console.warn(`[GoogleOAuth] Proactive token refresh failed for user ${uid}:`, refreshErr.message);
    }
  }

  return oauth2Client;
}

export async function getAllActiveGoogleIntegrations() {
  const integrationsRef = db.collection('userintegrations');
  const snap = await integrationsRef.get();
  return snap.docs
    .map(d => d.data())
    .filter(i => i.provider === 'GOOGLE' && i.status === 'ACTIVE');
}

export async function fetchGoogleContacts(uid) {
  const oauth2Client = await getGoogleClientForUser(uid);
  const people = google.people({ version: 'v1', auth: oauth2Client });
  
  const allConnections = [];
  let pageToken = null;
  
  do {
    const res = await people.people.connections.list({
      resourceName: 'people/me',
      personFields: 'names,emailAddresses,birthdays,organizations',
      pageSize: 1000,
      pageToken: pageToken
    });
    
    if (res.data.connections) {
      allConnections.push(...res.data.connections);
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  
  return allConnections;
}

export async function fetchGoogleCalendarEvents(uid, daysAhead = 90) {
  const oauth2Client = await getGoogleClientForUser(uid);
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  const allEvents = [];
  let pageToken = null;
  const timeMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
  
  do {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      pageToken: pageToken
    });
    
    const items = response.data.items || [];
    const events = items.map(e => ({
      id: e.id,
      iCalUID: e.iCalUID,
      summary: e.summary || '(No title)',
      description: e.description || '',
      start: e.start || {},
      end: e.end || {},
      attendees: (e.attendees || []).map(a => ({ email: a.email, displayName: a.displayName })),
      organizer: e.organizer ? { email: e.organizer.email, displayName: e.organizer.displayName } : null,
      location: e.location || '',
      htmlLink: e.htmlLink || ''
    }));
    
    allEvents.push(...events);
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  
  return allEvents;
}

// AES Encryption for secure OAuth state (prevents CSRF and tampering)
const ENCRYPTION_KEY = process.env.JWT_SECRET ? crypto.createHash('sha256').update(String(process.env.JWT_SECRET)).digest('base64').substring(0, 32) : crypto.randomBytes(32);
const IV_LENGTH = 16;

function encryptState(obj) {
  const text = JSON.stringify(obj);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptState(text) {
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return JSON.parse(decrypted.toString());
  } catch (err) {
    return null;
  }
}
