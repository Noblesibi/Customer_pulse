/**
 * teamsSync.service.js
 *
 * Microsoft Teams Meeting & Transcript Synchronization Engine (Phase 2).
 *
 * Security & Permission Boundaries:
 *  - Strictly validates every organizer against IT-approved `AuthorizedMailboxes`
 *    (`teamsSyncEnabled === true`) BEFORE any Microsoft Graph API request.
 *  - Uses `getTeamsGraphClient()` bound exclusively to `CustomerPulse-Dev`
 *    (or injected mock client in test mode). Never falls back to primary Outlook tenant.
 *  - Calendar discovery (`/calendar/events`) is DISABLED by default via
 *    `GRAPH_CALENDAR_DISCOVERY_ENABLED=false` until `Calendars.Read` is granted.
 *  - Supports JoinWebUrl-based `onlineMeeting` ID resolution and direct `onlineMeetingId` input.
 *  - Clearly separates meeting metadata (`OnlineMeetings.Read.All`) and transcripts
 *    (`OnlineMeetingTranscript.Read.All`) from recordings and Teams chats (not granted).
 *  - Never assigns ambiguous (multi-account) or unmatched meetings to `acc-1` or arbitrary accounts;
 *    routes them to `CommunicationReviewQueue`.
 */

import { db, logActivity } from '../config/database.js';
import { microsoftTeamsConfig } from '../config/microsoft.js';
import {
  getTeamsGraphClient,
  executeGraphRequest,
  fetchAllGraphPages,
  classifyGraphError,
  verifyGraphTokenClaims,
  inspectDevGraphConfigReadiness,
} from './microsoftGraph.service.js';
import {
  isOrganizerAuthorizedForTeams,
  listAuthorizedTeamsOrganizers,
  listAuthorizedOrganizers,
  recalculateEligibleOrganizers,
  processPolicySyncQueue,
  ORGANIZER_STATUS,
  OUTLOOK_STATUS,
} from './organizerSync.service.js';
import { parseTeamsTranscript } from './teamsTranscriptParser.js';
import {
  normalizeEmail,
  extractDomain,
  matchAccountEntity,
  matchContactEntity,
} from './entityMatching.service.js';
import { generateTeamsMeetingSummary } from './ai.service.js';
import { stageAiRecommendationsFromAnalysis } from './aiRecommendationReview.service.js';
import { createInteraction } from './interaction.service.js';

export const TRANSCRIPT_STATUS = {
  AVAILABLE: 'AVAILABLE',
  NOT_RECORDED: 'NOT_RECORDED',
  PROCESSING_PENDING: 'PROCESSING_PENDING',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  MEETING_NOT_FOUND: 'MEETING_NOT_FOUND',
  MEETING_ID_UNRESOLVED: 'MEETING_ID_UNRESOLVED',
  ERROR: 'ERROR',
};

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'yandex.com',
  'gmx.com',
]);

let teamsSyncTimer = null;
let isTeamsSyncRunning = false;
let lastTeamsSyncAt = null;

export function isTeamsSyncInProgress() {
  return isTeamsSyncRunning;
}

export function getLastTeamsSyncTimestamp() {
  return lastTeamsSyncAt;
}

function isInternalEmployeeEmail(email) {
  const domain = extractDomain(email);
  if (!domain) return false;
  return microsoftTeamsConfig.internalDomains.some(d => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Enforces automated organizer authorization and runtime Graph tenant/permission claims
 * before ANY Graph request is issued.
 */
async function assertAuthorizedOrganizer(organizerEmail, requiredPermission = 'OnlineMeetings.Read.All') {
  const check = await isOrganizerAuthorizedForTeams(organizerEmail);
  if (!check.authorized) {
    const err = new Error(
      `Organizer "${organizerEmail || ''}" is not authorized for Teams synchronization (${check.reason}).`
    );
    err.code = 'UNAUTHORIZED_ORGANIZER';
    err.reason = check.reason;
    err.statusCode = 403;
    throw err;
  }

  // Verify runtime token claims / tenant alignment when claims are present
  const claims = verifyGraphTokenClaims();
  if (claims.verified) {
    if (claims.tenantMismatch) {
      const err = new Error(
        `Tenant mismatch detected: token tenant (${claims.tokenTenantId}) does not match resource tenant (${claims.resourceTenantId}).`
      );
      err.code = 'TENANT_MISMATCH_UNVERIFIED';
      err.statusCode = 403;
      throw err;
    }

    if (
      requiredPermission &&
      Array.isArray(claims.applicationRoles) &&
      !claims.applicationRoles.includes(requiredPermission)
    ) {
      const err = new Error(
        `Missing required Microsoft Graph Application permission "${requiredPermission}". Delegated scopes cannot be used in client-credentials flow.`
      );
      err.code = 'MISSING_GRAPH_APPLICATION_PERMISSION';
      err.missingPermission = requiredPermission;
      err.statusCode = 403;
      throw err;
    }
  }

  return check;
}

/**
 * Verifies that a retrieved onlineMeeting actually belongs to the authorized organizer
 * and internal corporate tenant before retrieving transcripts or associating with CRM.
 */
export function verifyMeetingAuthorization(meetingDetails, authorizedOrganizerRecord) {
  const expectedEmail = normalizeEmail(authorizedOrganizerRecord?.email);
  const actualEmail = normalizeEmail(meetingDetails?.organizerEmail);

  if (!actualEmail || !isInternalEmployeeEmail(actualEmail)) {
    return {
      authorized: false,
      reason: 'EXTERNAL_OR_INVALID_MEETING_ORGANIZER',
      error: `Meeting organizer "${actualEmail || 'unknown'}" does not belong to an authorized internal corporate domain.`,
    };
  }

  if (expectedEmail && actualEmail !== expectedEmail) {
    return {
      authorized: false,
      reason: 'MEETING_ORGANIZER_MISMATCH',
      error: `Meeting organizer "${actualEmail}" does not match the authorized organizer "${expectedEmail}".`,
    };
  }

  return { authorized: true, reason: 'VERIFIED' };
}

function computeDurationSeconds(startIso, endIso, transcriptDurationSeconds = 0) {
  if (startIso && endIso) {
    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
      return Math.round((endMs - startMs) / 1000);
    }
  }
  if (transcriptDurationSeconds > 0) return transcriptDurationSeconds;
  return 0;
}

/**
 * Normalizes either a Graph `/onlineMeetings` object or a `/calendar/events` + resolved `onlineMeeting`
 * pair into a consistent CRM meeting descriptor.
 * Note: NEVER sets `onlineMeetingId` from a calendar event ID (`rawEvent.id`).
 */
export function extractMeetingDetails(rawSource, defaultOrganizerEmail = '', resolvedOnlineMeeting = null) {
  const onlineMeetingObj = resolvedOnlineMeeting || (rawSource?.participants ? rawSource : null);
  const rawEvent = rawSource?.participants ? null : rawSource;

  const organizerEmail =
    normalizeEmail(onlineMeetingObj?.participants?.organizer?.upn) ||
    normalizeEmail(onlineMeetingObj?.participants?.organizer?.identity?.user?.userPrincipalName) ||
    normalizeEmail(rawEvent?.organizer?.emailAddress?.address) ||
    normalizeEmail(defaultOrganizerEmail) ||
    '';

  const organizerName =
    onlineMeetingObj?.participants?.organizer?.identity?.user?.displayName ||
    rawEvent?.organizer?.emailAddress?.name ||
    organizerEmail.split('@')[0] ||
    'Meeting Organizer';

  const attendeesMap = new Map();
  const pushAttendee = (emailRaw, nameRaw, type = 'required', response = 'none') => {
    const email = normalizeEmail(emailRaw);
    if (!email) return;
    if (attendeesMap.has(email)) return;
    const isInternal = isInternalEmployeeEmail(email);
    attendeesMap.set(email, {
      email,
      name: nameRaw || email.split('@')[0],
      type,
      response,
      isInternal,
      isExternal: !isInternal,
    });
  };

  // Prefer onlineMeeting participants when available
  if (Array.isArray(onlineMeetingObj?.participants?.attendees)) {
    for (const att of onlineMeetingObj.participants.attendees) {
      const email = att.upn || att.identity?.user?.userPrincipalName || att.emailAddress?.address;
      const name = att.identity?.user?.displayName || att.emailAddress?.name;
      pushAttendee(email, name, att.role || 'attendee', 'accepted');
    }
  }

  // Merge calendar event attendees if present
  if (Array.isArray(rawEvent?.attendees)) {
    for (const att of rawEvent.attendees) {
      pushAttendee(
        att.emailAddress?.address,
        att.emailAddress?.name,
        att.type || 'required',
        att.status?.response || 'none'
      );
    }
  }

  // Ensure organizer is represented
  if (organizerEmail && !attendeesMap.has(organizerEmail)) {
    pushAttendee(organizerEmail, organizerName, 'organizer', 'accepted');
  }

  const attendees = Array.from(attendeesMap.values());
  const joinWebUrl =
    onlineMeetingObj?.joinWebUrl ||
    onlineMeetingObj?.joinUrl ||
    rawEvent?.onlineMeeting?.joinUrl ||
    rawEvent?.onlineMeeting?.joinWebUrl ||
    null;

  // CRITICAL: Only use true onlineMeeting resource ID — never fall back to calendar event ID!
  const onlineMeetingId =
    onlineMeetingObj?.id ||
    rawEvent?.onlineMeeting?.id ||
    null;

  const startRaw = onlineMeetingObj?.startDateTime || rawEvent?.start?.dateTime || null;
  const endRaw = onlineMeetingObj?.endDateTime || rawEvent?.end?.dateTime || null;

  const startDateTime = startRaw ? new Date(startRaw).toISOString() : new Date().toISOString();
  const endDateTime = endRaw ? new Date(endRaw).toISOString() : startDateTime;

  const meetingId = onlineMeetingId || (rawEvent?.id ? `cal_${rawEvent.id}` : `teams_${Date.now()}`);

  return {
    meetingId,
    onlineMeetingId,
    eventId: rawEvent?.id || null,
    subject: onlineMeetingObj?.subject || rawEvent?.subject || 'Microsoft Teams Meeting',
    startDateTime,
    endDateTime,
    durationSeconds: computeDurationSeconds(startDateTime, endDateTime, 0),
    joinWebUrl,
    organizerEmail,
    organizerName,
    attendees,
    externalAttendees: attendees.filter(a => a.isExternal),
    internalAttendees: attendees.filter(a => a.isInternal),
    hasRecording: false, // OnlineMeetingRecording.Read.All is not granted; recordings are strictly separate
  };
}

/**
 * PHASE 1A (Approved Alternative): Resolve an onlineMeeting resource ID using JoinWebUrl.
 * Uses Graph: GET /users/{organizerEmail}/onlineMeetings?$filter=JoinWebUrl eq '{joinWebUrl}'
 */
export async function resolveOnlineMeetingByJoinUrl({ organizerEmail, joinWebUrl }) {
  const { email: authorizedEmail } = await assertAuthorizedOrganizer(organizerEmail);
  if (!joinWebUrl || typeof joinWebUrl !== 'string') {
    throw new Error('joinWebUrl is required to resolve a Teams onlineMeeting ID.');
  }

  const cleanJoinUrl = joinWebUrl.trim();
  const escapedUrl = cleanJoinUrl.replace(/'/g, "''");
  const filterExpr = `JoinWebUrl eq '${escapedUrl}'`;
  const path = `/users/${encodeURIComponent(authorizedEmail)}/onlineMeetings?$filter=${encodeURIComponent(filterExpr)}`;

  try {
    const graphClient = await getTeamsGraphClient();
    const { items } = await fetchAllGraphPages(graphClient, path, {
      maxPages: 3,
      context: `ResolveOnlineMeeting:${authorizedEmail}`,
    });

    if (!items || items.length === 0) {
      return {
        resolved: false,
        status: TRANSCRIPT_STATUS.MEETING_NOT_FOUND,
        onlineMeeting: null,
        error: 'No matching onlineMeeting found for the provided JoinWebUrl.',
      };
    }

    const msMeeting = items[0];
    return {
      resolved: true,
      status: 'RESOLVED',
      onlineMeetingId: msMeeting.id,
      onlineMeeting: msMeeting,
    };
  } catch (err) {
    const classified = classifyGraphError(err);
    return {
      resolved: false,
      status:
        classified.category === 'PERMISSION_DENIED'
          ? TRANSCRIPT_STATUS.PERMISSION_DENIED
          : classified.category === 'MEETING_NOT_FOUND'
            ? TRANSCRIPT_STATUS.MEETING_NOT_FOUND
            : TRANSCRIPT_STATUS.ERROR,
      onlineMeeting: null,
      error: classified.message,
      errorCategory: classified.category,
    };
  }
}

/**
 * PHASE 1B (Direct onlineMeetingId Input): Retrieve onlineMeeting metadata by exact onlineMeetingId.
 * Uses Graph: GET /users/{organizerEmail}/onlineMeetings/{onlineMeetingId}
 */
export async function fetchOnlineMeetingById({ organizerEmail, onlineMeetingId }) {
  const { email: authorizedEmail } = await assertAuthorizedOrganizer(organizerEmail);
  if (!onlineMeetingId || typeof onlineMeetingId !== 'string') {
    throw new Error('onlineMeetingId is required.');
  }

  const cleanId = onlineMeetingId.trim();
  const path = `/users/${encodeURIComponent(authorizedEmail)}/onlineMeetings/${encodeURIComponent(cleanId)}`;

  try {
    const graphClient = await getTeamsGraphClient();
    const msMeeting = await executeGraphRequest(
      () => graphClient.api(path).get(),
      { context: `FetchOnlineMeeting:${authorizedEmail}` }
    );

    if (!msMeeting || !msMeeting.id) {
      return {
        resolved: false,
        status: TRANSCRIPT_STATUS.MEETING_NOT_FOUND,
        onlineMeeting: null,
        error: 'Online meeting metadata was empty.',
      };
    }

    return {
      resolved: true,
      status: 'RESOLVED',
      onlineMeetingId: msMeeting.id,
      onlineMeeting: msMeeting,
    };
  } catch (err) {
    const classified = classifyGraphError(err);
    return {
      resolved: false,
      status:
        classified.category === 'PERMISSION_DENIED'
          ? TRANSCRIPT_STATUS.PERMISSION_DENIED
          : classified.category === 'MEETING_NOT_FOUND'
            ? TRANSCRIPT_STATUS.MEETING_NOT_FOUND
            : TRANSCRIPT_STATUS.ERROR,
      onlineMeeting: null,
      error: classified.message,
      errorCategory: classified.category,
    };
  }
}

/**
 * PHASE 1C (Gated Calendar Discovery): Discovers Teams meetings from organizer's calendar.
 * STRICTLY DISABLED when GRAPH_CALENDAR_DISCOVERY_ENABLED !== 'true'.
 * When enabled, resolves each event's JoinWebUrl to a real onlineMeetingId (never uses event.id).
 */
export async function discoverTeamsMeetings({
  organizerEmail,
  daysBack = 14,
  daysAhead = 7,
  limit = 50,
}) {
  const { email: authorizedEmail } = await assertAuthorizedOrganizer(organizerEmail, 'Calendars.Read');

  if (!microsoftTeamsConfig.calendarDiscoveryEnabled) {
    return {
      skipped: true,
      reason: 'CALENDAR_DISCOVERY_DISABLED_REQUIRES_CALENDARS_READ',
      meetings: [],
    };
  }

  const now = new Date();
  const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  const endDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

  const filterExpr = `start/dateTime ge '${startDate}' and end/dateTime le '${endDate}'`;
  const selectFields = [
    'id',
    'subject',
    'bodyPreview',
    'start',
    'end',
    'isOnlineMeeting',
    'onlineMeeting',
    'onlineMeetingProvider',
    'organizer',
    'attendees',
    'webLink',
  ].join(',');

  const initialPath =
    `/users/${encodeURIComponent(authorizedEmail)}/calendar/events` +
    `?$filter=${encodeURIComponent(filterExpr)}` +
    `&$select=${encodeURIComponent(selectFields)}` +
    `&$top=${Math.min(Math.max(1, parseInt(limit, 10) || 50), 100)}`;

  const discovered = [];
  const graphClient = await getTeamsGraphClient();

  try {
    const { items: rawEvents } = await fetchAllGraphPages(graphClient, initialPath, {
      maxPages: 10,
      context: `CalendarDiscovery:${authorizedEmail}`,
    });

    for (const ev of rawEvents) {
      const isTeams =
        ev.isOnlineMeeting ||
        ev.onlineMeetingProvider?.toLowerCase().includes('teams') ||
        ev.onlineMeeting?.joinUrl?.includes('teams.microsoft.com') ||
        ev.onlineMeeting?.joinWebUrl?.includes('teams.microsoft.com');

      if (!isTeams) continue;

      const joinUrl = ev.onlineMeeting?.joinUrl || ev.onlineMeeting?.joinWebUrl || null;
      let resolvedOnlineMeeting = null;
      let resolutionStatus = joinUrl ? 'UNRESOLVED' : 'NO_JOIN_URL';
      let resolutionError = null;

      if (joinUrl) {
        const res = await resolveOnlineMeetingByJoinUrl({
          organizerEmail: authorizedEmail,
          joinWebUrl: joinUrl,
        });
        if (res.resolved && res.onlineMeeting) {
          resolvedOnlineMeeting = res.onlineMeeting;
          resolutionStatus = 'RESOLVED';
        } else {
          resolutionStatus = res.status || TRANSCRIPT_STATUS.MEETING_ID_UNRESOLVED;
          resolutionError = res.error || null;
        }
      }

      const meetingDetails = extractMeetingDetails(ev, authorizedEmail, resolvedOnlineMeeting);
      meetingDetails.resolutionStatus = resolutionStatus;
      meetingDetails.resolutionError = resolutionError;
      discovered.push(meetingDetails);
    }

    return {
      skipped: false,
      meetings: discovered,
    };
  } catch (err) {
    const classified = classifyGraphError(err);
    return {
      skipped: false,
      error: classified.message,
      errorCategory: classified.category,
      meetings: discovered,
    };
  }
}

/**
 * PHASE 3: Transcript Retrieval using resolved onlineMeetingId ONLY.
 * Calls:
 *   GET /users/{organizerEmail}/onlineMeetings/{onlineMeetingId}/transcripts
 *   GET /users/{organizerEmail}/onlineMeetings/{onlineMeetingId}/transcripts/{transcriptId}/content?$format=text/vtt
 *
 * Explicitly classifies:
 *   AVAILABLE | NOT_RECORDED | PROCESSING_PENDING | PERMISSION_DENIED | MEETING_NOT_FOUND | MEETING_ID_UNRESOLVED | ERROR
 */
export async function fetchMeetingTranscriptContent({
  organizerEmail,
  onlineMeetingId,
  endDateTime = null,
}) {
  const { email: authorizedEmail } = await assertAuthorizedOrganizer(
    organizerEmail,
    'OnlineMeetingTranscript.Read.All'
  );

  if (!onlineMeetingId || String(onlineMeetingId).startsWith('cal_')) {
    return {
      transcriptStatus: TRANSCRIPT_STATUS.MEETING_ID_UNRESOLVED,
      transcriptId: null,
      rawContent: null,
      error: 'Valid onlineMeetingId is required; calendar event IDs cannot be used for transcript retrieval.',
    };
  }

  const cleanMeetingId = String(onlineMeetingId).trim();
  const listPath = `/users/${encodeURIComponent(authorizedEmail)}/onlineMeetings/${encodeURIComponent(cleanMeetingId)}/transcripts`;

  try {
    const graphClient = await getTeamsGraphClient();
    const { items: transcriptsList } = await fetchAllGraphPages(graphClient, listPath, {
      maxPages: 5,
      context: `ListTranscripts:${authorizedEmail}`,
    });

    if (!transcriptsList || transcriptsList.length === 0) {
      // Distinguish PROCESSING_PENDING (recently ended / ongoing) vs NOT_RECORDED
      const endMs = endDateTime ? new Date(endDateTime).getTime() : NaN;
      const nowMs = Date.now();
      const graceWindowMs = 45 * 60 * 1000;
      const isPending = !isNaN(endMs) && nowMs - endMs <= graceWindowMs;

      return {
        transcriptStatus: isPending ? TRANSCRIPT_STATUS.PROCESSING_PENDING : TRANSCRIPT_STATUS.NOT_RECORDED,
        transcriptId: null,
        rawContent: null,
        format: null,
      };
    }

    // Prefer the most recent transcript if multiple exist
    const sorted = [...transcriptsList].sort(
      (a, b) => new Date(b.createdDateTime || 0) - new Date(a.createdDateTime || 0)
    );
    const chosen = sorted[0];
    const transcriptId = chosen.id;

    const contentPath = `/users/${encodeURIComponent(authorizedEmail)}/onlineMeetings/${encodeURIComponent(cleanMeetingId)}/transcripts/${encodeURIComponent(transcriptId)}/content?$format=text/vtt`;

    const contentStream = await executeGraphRequest(
      () => graphClient.api(contentPath).get(),
      { context: `FetchTranscriptContent:${transcriptId}` }
    );

    let rawVtt = '';
    if (typeof contentStream === 'string') {
      rawVtt = contentStream;
    } else if (Buffer.isBuffer(contentStream)) {
      rawVtt = contentStream.toString('utf8');
    } else if (contentStream && typeof contentStream.text === 'function') {
      rawVtt = await contentStream.text();
    } else if (contentStream && typeof contentStream.content === 'string') {
      rawVtt = contentStream.content;
    } else {
      rawVtt = String(contentStream || '');
    }

    if (!rawVtt.trim()) {
      return {
        transcriptStatus: TRANSCRIPT_STATUS.PROCESSING_PENDING,
        transcriptId,
        rawContent: null,
        format: 'text/vtt',
      };
    }

    return {
      transcriptStatus: TRANSCRIPT_STATUS.AVAILABLE,
      transcriptId,
      createdDateTime: chosen.createdDateTime || null,
      rawContent: rawVtt,
      format: 'text/vtt',
    };
  } catch (err) {
    const classified = classifyGraphError(err);

    if (classified.category === 'PERMISSION_DENIED') {
      return {
        transcriptStatus: TRANSCRIPT_STATUS.PERMISSION_DENIED,
        transcriptId: null,
        rawContent: null,
        error: classified.message,
      };
    }
    if (classified.category === 'TRANSCRIPT_NOT_FOUND' || classified.category === 'PROCESSING_PENDING') {
      return {
        transcriptStatus: TRANSCRIPT_STATUS.PROCESSING_PENDING,
        transcriptId: null,
        rawContent: null,
        error: classified.message,
      };
    }
    if (classified.category === 'MEETING_NOT_FOUND') {
      return {
        transcriptStatus: TRANSCRIPT_STATUS.MEETING_NOT_FOUND,
        transcriptId: null,
        rawContent: null,
        error: classified.message,
      };
    }

    return {
      transcriptStatus: TRANSCRIPT_STATUS.ERROR,
      transcriptId: null,
      rawContent: null,
      error: classified.message,
    };
  }
}

/**
 * PHASE 4: Transcript Parsing (reuses teamsTranscriptParser.js).
 */
export function parseMeetingTranscript(rawVttContent) {
  return parseTeamsTranscript(rawVttContent);
}

/**
 * PHASE 5: CRM Customer Matching via entityMatching.service.js.
 * - Matches external attendees to existing Contacts (exact email) and Accounts (domain).
 * - Rejects multi-account ambiguity (never assigns to first account).
 * - Never falls back to any default account such as `acc-1`.
 */
export async function matchMeetingParticipantsToCrm(attendees, cachedData = null, meetingContext = {}) {
  let contacts = [];
  let accounts = [];

  if (cachedData?.contacts && cachedData?.accounts) {
    contacts = cachedData.contacts;
    accounts = cachedData.accounts;
  } else {
    const [cSnap, aSnap] = await Promise.all([
      db.collection('contacts').get(),
      db.collection('accounts').get(),
    ]);
    contacts = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    accounts = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const externalAttendees = (attendees || []).filter(
    a => a && a.email && !isInternalEmployeeEmail(a.email)
  );

  if (externalAttendees.length === 0) {
    return {
      matched: false,
      needsReview: false,
      reason: 'INTERNAL_ONLY_MEETING',
      details: 'Meeting contains only internal employee participants.',
    };
  }

  const matchedContacts = [];
  const matchedAccountIds = new Set();
  const candidateAccountsMap = new Map();
  let matchReason = null;
  let matchConfidence = 0;

  const addCandidateAccount = (account, reason, score) => {
    const aid = account.accountId || account.id;
    if (!aid) return;
    matchedAccountIds.add(aid);
    if (!candidateAccountsMap.has(aid)) {
      candidateAccountsMap.set(aid, {
        accountId: aid,
        companyName: account.companyName || account.name || 'Customer Account',
        reason,
        score,
      });
    }
  };

  // 1. Exact Contact Email Matching via entityMatching.service.js
  for (const att of externalAttendees) {
    const attEmail = normalizeEmail(att.email);
    const contactRes = matchContactEntity(attEmail, contacts);

    if (contactRes.matched && contactRes.accountId) {
      matchedContacts.push({
        contactId: contactRes.contactId,
        contactName: contactRes.contactName || att.name,
        accountId: contactRes.accountId,
        email: attEmail,
      });
      const parentAccount = accounts.find(a => (a.accountId || a.id) === contactRes.accountId);
      if (parentAccount) {
        addCandidateAccount(parentAccount, 'CONTACT_EMAIL_MATCH', 100);
        matchReason = matchReason || 'CONTACT_EMAIL_MATCH';
        matchConfidence = Math.max(matchConfidence, 100);
      }
    } else if (contactRes.isAmbiguous && Array.isArray(contactRes.candidates)) {
      for (const cand of contactRes.candidates) {
        const acc = accounts.find(a => (a.accountId || a.id) === cand.accountId);
        if (acc) addCandidateAccount(acc, 'AMBIGUOUS_CONTACT_MATCH', 70);
      }
    }
  }

  // 2. Domain-based Account Matching via entityMatching.service.js (for remaining external attendees)
  for (const att of externalAttendees) {
    const attEmail = normalizeEmail(att.email);
    const domain = extractDomain(attEmail);
    if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain) || isInternalEmployeeEmail(attEmail)) {
      continue;
    }

    // Direct email match against Account corporate email first
    const accountByEmail = accounts.find(a =>
      [a.email, a.generalEmail, a.directiveEmail]
        .filter(Boolean)
        .some(e => normalizeEmail(e) === attEmail)
    );
    if (accountByEmail) {
      addCandidateAccount(accountByEmail, 'ACCOUNT_EMAIL_MATCH', 98);
      matchReason = matchReason || 'ACCOUNT_EMAIL_MATCH';
      matchConfidence = Math.max(matchConfidence, 98);
      continue;
    }

    // Domain match against Accounts (website / domain) via matchAccountEntity
    const domainMatches = [];
    for (const acc of accounts) {
      const accDomain = extractDomain(acc.website || acc.domain || acc.email || '');
      if (accDomain && accDomain === domain) {
        domainMatches.push(acc);
      }
    }

    if (domainMatches.length === 1) {
      addCandidateAccount(domainMatches[0], 'ACCOUNT_DOMAIN_MATCH', 95);
      matchReason = matchReason || 'ACCOUNT_DOMAIN_MATCH';
      matchConfidence = Math.max(matchConfidence, 95);
    } else if (domainMatches.length > 1) {
      for (const acc of domainMatches) {
        addCandidateAccount(acc, 'AMBIGUOUS_DOMAIN_MATCH', 75);
      }
    } else {
      // Fallback to strict normalized domain name match via matchAccountEntity
      const accRes = matchAccountEntity(domain, accounts);
      if (accRes.matched && accRes.account) {
        addCandidateAccount(accRes.account, accRes.matchType || 'DOMAIN_MATCH', accRes.score || 90);
        matchReason = matchReason || accRes.matchType || 'DOMAIN_MATCH';
        matchConfidence = Math.max(matchConfidence, accRes.score || 90);
      } else if (accRes.isAmbiguous && Array.isArray(accRes.candidates)) {
        for (const cand of accRes.candidates) {
          const acc = accounts.find(a => (a.accountId || a.id) === cand.accountId);
          if (acc) addCandidateAccount(acc, 'AMBIGUOUS_DOMAIN_MATCH', 70);
        }
      }
    }
  }

  // 3. Supplementary Signal: Meeting Subject + Verified Organizer CRM Ownership (Phase 8 #6)
  if (matchedAccountIds.size === 0 && meetingContext?.subject && meetingContext?.organizerRecord) {
    const subjLower = String(meetingContext.subject || '').toLowerCase();
    const ownedIds = new Set(meetingContext.organizerRecord.ownedAccountIds || []);
    const subjectOwnedMatches = accounts.filter(a => {
      const aid = a.accountId || a.id;
      const cName = String(a.companyName || '').trim().toLowerCase();
      return ownedIds.has(aid) && cName.length >= 3 && subjLower.includes(cName);
    });

    if (subjectOwnedMatches.length === 1) {
      addCandidateAccount(subjectOwnedMatches[0], 'SUBJECT_AND_ORGANIZER_OWNERSHIP_MATCH', 85);
      matchReason = 'SUBJECT_AND_ORGANIZER_OWNERSHIP_MATCH';
      matchConfidence = 85;
    } else if (subjectOwnedMatches.length > 1) {
      for (const acc of subjectOwnedMatches) {
        addCandidateAccount(acc, 'AMBIGUOUS_SUBJECT_OWNERSHIP_MATCH', 65);
      }
    }
  }

  const candidateAccounts = Array.from(candidateAccountsMap.values());

  // Multi-account ambiguity: NEVER assign automatically to [0]
  if (matchedAccountIds.size > 1) {
    return {
      matched: false,
      needsReview: true,
      isAmbiguous: true,
      reason: 'AMBIGUOUS_MULTIPLE_ACCOUNTS',
      candidateAccounts,
      externalAttendees: externalAttendees.map(a => ({ email: a.email, name: a.name })),
      details: `External attendees matched ${matchedAccountIds.size} distinct CRM accounts; sent to review queue.`,
    };
  }

  // Unmatched: NEVER assign to default account (such as acc-1)
  if (matchedAccountIds.size === 0) {
    return {
      matched: false,
      needsReview: true,
      isAmbiguous: false,
      reason: 'NO_CRM_ACCOUNT_MATCH',
      candidateAccounts: [],
      externalAttendees: externalAttendees.map(a => ({ email: a.email, name: a.name })),
      details: 'No CRM Contact or Account matched the external participants; sent to review queue.',
    };
  }

  const primaryAccountId = Array.from(matchedAccountIds)[0];
  const primaryAccount = accounts.find(a => (a.accountId || a.id) === primaryAccountId);
  const accountMatchedContacts = matchedContacts.filter(c => c.accountId === primaryAccountId);
  const primaryContact = accountMatchedContacts[0] || matchedContacts[0] || null;

  return {
    matched: true,
    needsReview: false,
    accountId: primaryAccountId,
    companyName: primaryAccount?.companyName || primaryAccount?.name || 'Customer Account',
    contactId: primaryContact?.contactId || null,
    contactName: primaryContact?.contactName || null,
    relatedContactIds: Array.from(new Set(accountMatchedContacts.map(c => c.contactId).filter(Boolean))),
    allMatchedContacts: matchedContacts,
    externalAttendees: externalAttendees.map(a => ({ email: a.email, name: a.name })),
    associatedAccountIds: [primaryAccountId],
    matchReason: matchReason || 'CONTACT_EMAIL_MATCH',
    matchConfidence: matchConfidence || 95,
  };
}

/**
 * Stores an unmatched or ambiguous meeting in `CommunicationReviewQueue` for Admin review.
 */
export async function queueMeetingForReview({
  meetingDetails,
  parsedTranscript = null,
  transcriptStatus = TRANSCRIPT_STATUS.NOT_RECORDED,
  aiSummaryData = null,
  crmMatch,
}) {
  const externalResourceId = meetingDetails.onlineMeetingId || meetingDetails.meetingId;
  const reviewId = `rev_teams_${externalResourceId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}`;

  const existingDoc = await db.collection('communicationreviewqueue').doc(reviewId).get();
  if (existingDoc.exists && existingDoc.data()?.status === 'RESOLVED') {
    return { alreadyResolved: true, reviewId, resolvedAccountId: existingDoc.data().resolvedAccountId };
  }

  const now = new Date().toISOString();
  const record = {
    reviewId,
    channel: 'TEAMS_MEETING',
    externalResourceId,
    organizerEmail: meetingDetails.organizerEmail,
    subject: meetingDetails.subject,
    occurredAt: meetingDetails.startDateTime,
    externalParticipants: meetingDetails.externalAttendees || [],
    internalParticipants: meetingDetails.internalAttendees || [],
    candidateAccounts: crmMatch?.candidateAccounts || [],
    reason: crmMatch?.reason || 'NO_CRM_ACCOUNT_MATCH',
    payload: {
      meetingDetails,
      parsedTranscript: parsedTranscript
        ? {
            transcriptId: parsedTranscript.transcriptId || null,
            speakers: parsedTranscript.speakers || [],
            cues: parsedTranscript.cues || [],
            cleanFullText: parsedTranscript.cleanFullText || '',
            rawContent: parsedTranscript.rawContent || null,
            durationSeconds: parsedTranscript.durationSeconds || 0,
            wordCount: parsedTranscript.wordCount || 0,
          }
        : null,
      transcriptStatus,
      aiSummaryData,
    },
    status: existingDoc.exists && existingDoc.data()?.status === 'IGNORED' ? 'IGNORED' : 'PENDING_REVIEW',
    resolvedAccountId: null,
    resolvedByUid: null,
    resolvedAt: null,
    createdAt: existingDoc.exists ? existingDoc.data().createdAt : now,
    updatedAt: now,
  };

  await db.collection('communicationreviewqueue').doc(reviewId).set(record, { merge: true });
  return { queued: true, reviewId, reason: record.reason };
}

/**
 * PHASE 6: PostgreSQL Ingestion & Interaction Creation with duplicate prevention.
 */
export async function ingestTeamsMeetingAsInteraction({
  meetingDetails,
  parsedTranscript = null,
  transcriptStatus = TRANSCRIPT_STATUS.NOT_RECORDED,
  aiSummaryData = null,
  aiStatus = 'SKIPPED_NO_TRANSCRIPT',
  aiError = null,
  crmMatch,
  organizerRecord = null,
  user = { uid: 'system', name: 'Teams Auto-Sync', email: 'system@pulse.com' },
  lastError = null,
}) {
  if (!crmMatch || !crmMatch.matched || !crmMatch.accountId) {
    return { skipped: true, reason: 'Meeting is not associated with an existing CRM Account.' };
  }

  const stableMeetingId = meetingDetails.onlineMeetingId || meetingDetails.meetingId;
  const dedupMessageId = `teams_meeting_${stableMeetingId}`;
  const durationSeconds = computeDurationSeconds(
    meetingDetails.startDateTime,
    meetingDetails.endDateTime,
    parsedTranscript?.durationSeconds || 0
  );

  // Check existing TeamsMeetings and Interactions records for duplicates & transcript updates
  const [existingMeetingDoc, existingInteractions] = await Promise.all([
    db.collection('teamsmeetings').doc(stableMeetingId).get(),
    db.collection('interactions').where('internetMessageId', '==', dedupMessageId).limit(1).get(),
  ]);

  const existingMeeting = existingMeetingDoc.exists ? existingMeetingDoc.data() : null;
  const existingInteractionDoc = !existingInteractions.empty ? existingInteractions.docs[0] : null;

  const isTranscriptUpgrade = Boolean(
    existingMeeting &&
    transcriptStatus === TRANSCRIPT_STATUS.AVAILABLE &&
    (existingMeeting.transcriptStatus !== TRANSCRIPT_STATUS.AVAILABLE ||
      (parsedTranscript?.transcriptId && parsedTranscript.transcriptId !== existingMeeting.transcriptId) ||
      (parsedTranscript?.rawContent && parsedTranscript.rawContent !== existingMeeting.rawTranscript))
  );

  if (existingInteractionDoc && !isTranscriptUpgrade) {
    return {
      duplicate: true,
      meetingId: stableMeetingId,
      interactionId: existingInteractionDoc.data().interactionId || existingInteractionDoc.id,
      message: 'Meeting interaction already exists in CRM.',
    };
  }

  const hasValidAiSummary = Boolean(
    transcriptStatus === TRANSCRIPT_STATUS.AVAILABLE &&
    aiSummaryData &&
    !aiSummaryData.skipped &&
    aiSummaryData.summary
  );

  const cleanDialogueText = parsedTranscript?.cleanFullText
    ? `${hasValidAiSummary ? `AI Summary: ${aiSummaryData.summary}\n\n` : ''}${parsedTranscript.cleanFullText}`
    : `[Teams Meeting Metadata]\nOrganizer: ${meetingDetails.organizerName} (${meetingDetails.organizerEmail})\nExternal Participants: ${(meetingDetails.externalAttendees || []).map(a => `${a.name} <${a.email}>`).join(', ')}\nTranscript Status: ${transcriptStatus}`;

  const startDate = new Date(meetingDetails.startDateTime);
  const dateStr = !isNaN(startDate.getTime()) ? startDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
  const timeStr = !isNaN(startDate.getTime()) ? startDate.toISOString().slice(11, 16) : '00:00';

  const metadataPayload = {
    meetingId: stableMeetingId,
    onlineMeetingId: meetingDetails.onlineMeetingId || null,
    joinWebUrl: meetingDetails.joinWebUrl,
    durationSeconds,
    wordCount: parsedTranscript?.wordCount || 0,
    transcriptStatus,
    hasRecording: false,
    speakers: parsedTranscript?.speakers || [],
    externalAttendees: meetingDetails.externalAttendees || [],
    internalAttendees: meetingDetails.internalAttendees || [],
    organizer: {
      name: meetingDetails.organizerName,
      email: meetingDetails.organizerEmail,
      employeeId: organizerRecord?.employeeId || null,
    },
    aiSummary: hasValidAiSummary ? aiSummaryData.summary : null,
    keyTopics: hasValidAiSummary ? aiSummaryData.keyTopics || [] : [],
    keyDecisions: hasValidAiSummary ? aiSummaryData.keyDecisions || [] : [],
    actionItems: hasValidAiSummary ? aiSummaryData.actionItems || [] : [],
    customerRequirements: hasValidAiSummary ? aiSummaryData.customerRequirements || [] : [],
    commitments: hasValidAiSummary ? aiSummaryData.commitments || [] : [],
    risksIdentified: hasValidAiSummary ? aiSummaryData.risksIdentified || [] : [],
    aiStatus,
  };

  let interactionId = existingInteractionDoc ? (existingInteractionDoc.data().interactionId || existingInteractionDoc.id) : null;
  let interactionResult = null;

  if (isTranscriptUpgrade && interactionId) {
    // Upgrade existing interaction cleanly when transcript arrives or updates
    await db.collection('interactions').doc(interactionId).update({
      messageText: cleanDialogueText,
      attachments: JSON.stringify(metadataPayload),
      sentiment: (hasValidAiSummary && aiSummaryData?.sentiment) || existingInteractionDoc.data().sentiment || 'Neutral',
    });
  } else {
    const interactionData = {
      accountId: crmMatch.accountId,
      contactId: crmMatch.contactId || null,
      source: 'Teams Meeting',
      subject: meetingDetails.subject || 'Microsoft Teams Cadence',
      messageText: cleanDialogueText,
      date: dateStr,
      time: timeStr,
      internetMessageId: dedupMessageId,
      isManual: false,
      attachments: JSON.stringify(metadataPayload),
      actionMentions: [],
    };
    interactionResult = await createInteraction(interactionData, user);
    interactionId = interactionResult.interaction?.interactionId || interactionResult.interactionId;
  }

  const now = new Date().toISOString();
  const meetingRecord = {
    meetingId: stableMeetingId,
    onlineMeetingId: meetingDetails.onlineMeetingId || null,
    organizerEmployeeId: organizerRecord?.employeeId || meetingDetails.organizerEmployeeId || null,
    organizerEmail: meetingDetails.organizerEmail,
    subject: meetingDetails.subject,
    startDateTime: meetingDetails.startDateTime,
    endDateTime: meetingDetails.endDateTime,
    joinWebUrl: meetingDetails.joinWebUrl,
    transcriptId: parsedTranscript?.transcriptId || null,
    transcriptStatus,
    rawTranscript: parsedTranscript?.rawContent || null,
    parsedDialogue: parsedTranscript?.cues || [],
    speakers: parsedTranscript?.speakers || [],
    attendees: meetingDetails.attendees || [],
    externalAttendees: meetingDetails.externalAttendees || [],
    internalAttendees: meetingDetails.internalAttendees || [],
    relatedContactIds: crmMatch.relatedContactIds || (crmMatch.contactId ? [crmMatch.contactId] : []),
    aiSummary: hasValidAiSummary ? aiSummaryData.summary : null,
    keyTopics: hasValidAiSummary ? aiSummaryData.keyTopics || [] : [],
    keyDecisions: hasValidAiSummary ? aiSummaryData.keyDecisions || [] : [],
    actionItems: hasValidAiSummary ? aiSummaryData.actionItems || [] : [],
    customerRequirements: hasValidAiSummary ? aiSummaryData.customerRequirements || [] : [],
    commitments: hasValidAiSummary ? aiSummaryData.commitments || [] : [],
    risksIdentified: hasValidAiSummary ? aiSummaryData.risksIdentified || [] : [],
    sentiment: hasValidAiSummary ? aiSummaryData.sentiment || 'Neutral' : null,
    aiStatus,
    aiError: aiError || null,
    hasRecording: false,
    durationSeconds,
    wordCount: parsedTranscript?.wordCount || 0,
    accountId: crmMatch.accountId,
    contactId: crmMatch.contactId || null,
    interactionId: interactionId || null,
    matchConfidence: crmMatch.matchConfidence || 95,
    matchReason: crmMatch.matchReason || 'CONTACT_EMAIL_MATCH',
    associatedAccountIds: crmMatch.associatedAccountIds || [crmMatch.accountId],
    syncStatus: transcriptStatus === TRANSCRIPT_STATUS.PERMISSION_DENIED ? 'PERMISSION_DENIED' : 'SYNCED',
    lastError: lastError || null,
    lastSyncedAt: now,
    createdAt: existingMeeting?.createdAt || now,
    updatedAt: now,
  };

  await db.collection('teamsmeetings').doc(stableMeetingId).set(meetingRecord, { merge: true });

  if (hasValidAiSummary) {
    await stageAiRecommendationsFromAnalysis({
      accountId: crmMatch.accountId,
      contactId: crmMatch.contactId || null,
      sourceType: 'TEAMS_MEETING',
      sourceId: stableMeetingId,
      interactionId: interactionId || null,
      meetingId: stableMeetingId,
      internetMessageId: dedupMessageId,
      sourceTimestamp: meetingDetails.startDateTime,
      evidenceExcerpt: aiSummaryData.summary || '',
      defaultOwnerUid: organizerRecord?.uid || user.uid || null,
      defaultOwnerName: meetingDetails.organizerName || user.name || null,
      followUpTasks: aiSummaryData.actionItems || [],
      businessOpportunities: [],
      risks: (aiSummaryData.risksIdentified || []).map(r => ({
        title: typeof r === 'string' ? r : (r.title || 'Meeting Risk'),
        description: typeof r === 'string' ? r : (r.description || ''),
        severity: aiSummaryData.riskLevel || 'Medium',
      })),
      engagementInsights: [
        ...(aiSummaryData.customerRequirements || []),
        ...(aiSummaryData.commitments || []),
      ],
    }).catch(() => {});
  }

  await logActivity(
    user.uid || 'system',
    user.name || 'Teams Auto-Sync',
    isTranscriptUpgrade ? 'TEAMS_TRANSCRIPT_UPDATED' : 'TEAMS_MEETING_SYNCED',
    `${isTranscriptUpgrade ? 'Updated transcript for' : 'Synced'} Teams meeting "${meetingDetails.subject}" (status=${transcriptStatus}, ai=${aiStatus}, account=${crmMatch.accountId})`
  ).catch(() => {});

  return {
    success: true,
    updatedTranscript: Boolean(isTranscriptUpgrade),
    meetingId: stableMeetingId,
    onlineMeetingId: meetingDetails.onlineMeetingId,
    transcriptStatus,
    aiStatus,
    aiError,
    interactionId,
    accountId: crmMatch.accountId,
    contactId: crmMatch.contactId,
    aiSummaryData: hasValidAiSummary ? aiSummaryData : null,
    analysis: interactionResult?.analysis || null,
    health: interactionResult?.health || null,
  };
}

async function saveSyncCheckpoint(organizerEmail, status, itemsProcessed, lastError = null) {
  const cleanEmail = normalizeEmail(organizerEmail);
  const checkpointId = `teams:${cleanEmail}`;
  const now = new Date().toISOString();
  await db.collection('synccheckpoints').doc(checkpointId).set(
    {
      checkpointId,
      provider: 'MICROSOFT_TEAMS',
      organizerEmail: cleanEmail,
      lastSyncedAt: now,
      lastStatus: status,
      lastError: lastError || null,
      itemsProcessed,
      updatedAt: now,
    },
    { merge: true }
  );
}

/**
 * MASTER ORCHESTRATOR: Synchronizes Teams meetings and transcripts for a single IT-authorized organizer.
 * Supports:
 *   - Explicit `meetingRefs`: [{ joinWebUrl?, onlineMeetingId?, subject?, startDateTime?, endDateTime?, attendees? }]
 *   - Pending transcript retries on existing `TeamsMeetings` for that organizer (`PROCESSING_PENDING`)
 *   - Calendar discovery ONLY if `GRAPH_CALENDAR_DISCOVERY_ENABLED=true`
 */
export async function syncTeamsMeetingsForOrganizer({
  organizerEmail,
  meetingRefs = [],
  daysBack = 14,
  daysAhead = 7,
  user = { uid: 'system', name: 'Teams Auto-Sync' },
}) {
  const { email: authorizedEmail, record: organizerRecord } = await assertAuthorizedOrganizer(organizerEmail);

  const summary = {
    organizerEmail: authorizedEmail,
    organizerEmployeeId: organizerRecord?.employeeId || null,
    calendarDiscoveryEnabled: microsoftTeamsConfig.calendarDiscoveryEnabled,
    meetingsDiscovered: 0,
    meetingsResolved: 0,
    crmMatched: 0,
    queuedForReview: 0,
    transcriptsAvailable: 0,
    transcriptsPending: 0,
    transcriptsNotRecorded: 0,
    permissionDenied: 0,
    interactionsCreated: 0,
    transcriptsUpgraded: 0,
    duplicatesSkipped: 0,
    internalSkipped: 0,
    aiFailures: 0,
    errors: 0,
    results: [],
  };

  const meetingsQueue = [];

  // 1. Resolve explicit meetingRefs (JoinWebUrl and/or direct onlineMeetingId)
  for (const ref of meetingRefs || []) {
    if (!ref) continue;
    let resolvedRes = null;
    if (ref.onlineMeetingId) {
      resolvedRes = await fetchOnlineMeetingById({
        organizerEmail: authorizedEmail,
        onlineMeetingId: ref.onlineMeetingId,
      });
    } else if (ref.joinWebUrl) {
      resolvedRes = await resolveOnlineMeetingByJoinUrl({
        organizerEmail: authorizedEmail,
        joinWebUrl: ref.joinWebUrl,
      });
    } else {
      continue;
    }

    if (resolvedRes.resolved && resolvedRes.onlineMeeting) {
      summary.meetingsResolved++;
      const details = extractMeetingDetails(resolvedRes.onlineMeeting, authorizedEmail, resolvedRes.onlineMeeting);
      if (ref.subject && (!details.subject || details.subject === 'Microsoft Teams Meeting')) {
        details.subject = ref.subject;
      }
      if (Array.isArray(ref.attendees) && ref.attendees.length > 0 && details.externalAttendees.length === 0) {
        const merged = extractMeetingDetails({ attendees: ref.attendees, subject: details.subject }, authorizedEmail, resolvedRes.onlineMeeting);
        details.attendees = merged.attendees;
        details.externalAttendees = merged.externalAttendees;
        details.internalAttendees = merged.internalAttendees;
      }
      meetingsQueue.push(details);
    } else {
      if (resolvedRes.status === TRANSCRIPT_STATUS.PERMISSION_DENIED) summary.permissionDenied++;
      else summary.errors++;
      summary.results.push({
        joinWebUrl: ref.joinWebUrl || null,
        onlineMeetingId: ref.onlineMeetingId || null,
        status: resolvedRes.status || TRANSCRIPT_STATUS.ERROR,
        error: resolvedRes.error || 'Failed to resolve Teams online meeting.',
      });
    }
  }

  // 2. Gated Calendar Discovery (only runs if GRAPH_CALENDAR_DISCOVERY_ENABLED === 'true')
  if (microsoftTeamsConfig.calendarDiscoveryEnabled) {
    const calResult = await discoverTeamsMeetings({
      organizerEmail: authorizedEmail,
      daysBack,
      daysAhead,
    });
    if (calResult.error) {
      summary.errors++;
      summary.results.push({ status: calResult.errorCategory || 'ERROR', error: calResult.error });
    }
    for (const m of calResult.meetings || []) {
      if (m.onlineMeetingId) summary.meetingsResolved++;
      meetingsQueue.push(m);
    }
  }

  // 3. Re-check existing PROCESSING_PENDING meetings for this organizer (uses OnlineMeetings/Transcripts only)
  try {
    const existingSnap = await db.collection('teamsmeetings').where('organizerEmail', '==', authorizedEmail).get();
    for (const doc of existingSnap.docs) {
      const m = doc.data();
      if (
        m.transcriptStatus === TRANSCRIPT_STATUS.PROCESSING_PENDING &&
        m.onlineMeetingId &&
        !meetingsQueue.some(q => q.onlineMeetingId === m.onlineMeetingId)
      ) {
        const fetched = await fetchOnlineMeetingById({
          organizerEmail: authorizedEmail,
          onlineMeetingId: m.onlineMeetingId,
        });
        if (fetched.resolved && fetched.onlineMeeting) {
          meetingsQueue.push(extractMeetingDetails(fetched.onlineMeeting, authorizedEmail, fetched.onlineMeeting));
        }
      }
    }
  } catch (_) {}

  summary.meetingsDiscovered = meetingsQueue.length;

  if (meetingsQueue.length === 0) {
    const status = summary.permissionDenied > 0 ? 'PERMISSION_DENIED' : summary.errors > 0 ? 'ERROR' : 'NO_MEETINGS';
    await saveSyncCheckpoint(authorizedEmail, status, 0, summary.results[0]?.error || null);
    return summary;
  }

  // Load CRM entities once
  const [cSnap, aSnap] = await Promise.all([
    db.collection('contacts').get(),
    db.collection('accounts').get(),
  ]);
  const cachedCrm = {
    contacts: cSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    accounts: aSnap.docs.map(d => ({ id: d.id, ...d.data() })),
  };

  for (const meeting of meetingsQueue) {
    // Phase 6.3: Verify meeting organizer & tenant eligibility before retrieving transcripts
    const meetingAuth = verifyMeetingAuthorization(meeting, organizerRecord);
    if (!meetingAuth.authorized) {
      summary.permissionDenied++;
      summary.results.push({
        meetingId: meeting.meetingId,
        onlineMeetingId: meeting.onlineMeetingId,
        subject: meeting.subject,
        status: 'MEETING_UNAUTHORIZED',
        reason: meetingAuth.reason,
        error: meetingAuth.error,
      });
      continue;
    }

    const crmMatch = await matchMeetingParticipantsToCrm(meeting.attendees, cachedCrm, {
      subject: meeting.subject,
      organizerRecord,
    });

    if (!crmMatch.matched && !crmMatch.needsReview) {
      summary.internalSkipped++;
      summary.results.push({
        meetingId: meeting.meetingId,
        onlineMeetingId: meeting.onlineMeetingId,
        subject: meeting.subject,
        status: 'INTERNAL_SKIPPED',
        reason: crmMatch.reason,
      });
      continue;
    }

    // Check existing meeting record before transcript / AI work so duplicate meetings skip redundant AI calls
    const stableMeetingId = meeting.onlineMeetingId || meeting.meetingId;
    const existingMeetingDoc = await db.collection('teamsmeetings').doc(stableMeetingId).get();
    const existingMeeting = existingMeetingDoc.exists ? existingMeetingDoc.data() : null;

    // Retrieve Transcript (only if onlineMeetingId is cleanly resolved)
    let transcriptPayload = null;
    let transcriptStatus = TRANSCRIPT_STATUS.MEETING_ID_UNRESOLVED;
    let parsedTranscript = null;

    if (meeting.onlineMeetingId) {
      transcriptPayload = await fetchMeetingTranscriptContent({
        organizerEmail: authorizedEmail,
        onlineMeetingId: meeting.onlineMeetingId,
        endDateTime: meeting.endDateTime,
      });
      transcriptStatus = transcriptPayload.transcriptStatus;
    }

    if (transcriptStatus === TRANSCRIPT_STATUS.AVAILABLE && transcriptPayload?.rawContent) {
      parsedTranscript = parseMeetingTranscript(transcriptPayload.rawContent);
      parsedTranscript.transcriptId = transcriptPayload.transcriptId;
      parsedTranscript.rawContent = transcriptPayload.rawContent;
      summary.transcriptsAvailable++;
    } else if (transcriptStatus === TRANSCRIPT_STATUS.PROCESSING_PENDING) {
      summary.transcriptsPending++;
    } else if (transcriptStatus === TRANSCRIPT_STATUS.NOT_RECORDED) {
      summary.transcriptsNotRecorded++;
    } else if (transcriptStatus === TRANSCRIPT_STATUS.PERMISSION_DENIED) {
      summary.permissionDenied++;
    }

    // Prevent duplicate AI processing when meeting + transcript are already stored & unchanged
    const isUnchangedDuplicate = Boolean(
      existingMeeting &&
      crmMatch.matched &&
      existingMeeting.transcriptStatus === transcriptStatus &&
      (!parsedTranscript ||
        (existingMeeting.transcriptId === parsedTranscript.transcriptId &&
          existingMeeting.rawTranscript === parsedTranscript.rawContent &&
          existingMeeting.aiStatus === 'COMPLETED'))
    );

    if (isUnchangedDuplicate) {
      summary.crmMatched++;
      summary.duplicatesSkipped++;
      summary.results.push({
        meetingId: stableMeetingId,
        onlineMeetingId: meeting.onlineMeetingId,
        subject: meeting.subject,
        status: 'DUPLICATE',
        transcriptStatus,
        interactionId: existingMeeting.interactionId || null,
      });
      continue;
    }

    // Phase 9: AI Customer Intelligence (ONLY when transcript is available; never fabricate summaries)
    let aiSummaryData = null;
    let aiStatus = 'SKIPPED_NO_TRANSCRIPT';
    let aiError = null;

    if (transcriptStatus === TRANSCRIPT_STATUS.AVAILABLE && parsedTranscript?.cleanFullText) {
      try {
        aiSummaryData = await generateTeamsMeetingSummary({
          subject: meeting.subject,
          organizerName: meeting.organizerName,
          attendees: meeting.attendees,
          transcriptText: parsedTranscript.cleanFullText,
          meetingDate: meeting.startDateTime,
          durationSeconds: computeDurationSeconds(
            meeting.startDateTime,
            meeting.endDateTime,
            parsedTranscript.durationSeconds || 0
          ),
        });
        aiStatus = aiSummaryData && !aiSummaryData.skipped ? 'COMPLETED' : 'SKIPPED_NO_TRANSCRIPT';
      } catch (aiErr) {
        aiStatus = 'FAILED';
        aiError = aiErr.message || 'AI summary generation failed.';
        summary.aiFailures++;
      }
    }

    // If unmatched or ambiguous across multiple accounts -> Review Queue (NEVER default account)
    if (!crmMatch.matched && crmMatch.needsReview) {
      const qRes = await queueMeetingForReview({
        meetingDetails: meeting,
        parsedTranscript,
        transcriptStatus,
        aiSummaryData,
        crmMatch,
      });
      summary.queuedForReview++;
      summary.results.push({
        meetingId: meeting.meetingId,
        onlineMeetingId: meeting.onlineMeetingId,
        subject: meeting.subject,
        status: 'NEEDS_REVIEW',
        reason: crmMatch.reason,
        reviewId: qRes.reviewId,
        transcriptStatus,
      });
      continue;
    }

    summary.crmMatched++;

    const ingestOutcome = await ingestTeamsMeetingAsInteraction({
      meetingDetails: meeting,
      parsedTranscript,
      transcriptStatus,
      aiSummaryData,
      aiStatus,
      aiError,
      crmMatch,
      organizerRecord,
      user,
      lastError: transcriptPayload?.error || null,
    });

    if (ingestOutcome.duplicate) {
      summary.duplicatesSkipped++;
      summary.results.push({
        meetingId: ingestOutcome.meetingId,
        onlineMeetingId: meeting.onlineMeetingId,
        subject: meeting.subject,
        status: 'DUPLICATE',
        transcriptStatus,
        interactionId: ingestOutcome.interactionId,
      });
    } else if (ingestOutcome.updatedTranscript) {
      summary.transcriptsUpgraded++;
      summary.results.push({
        meetingId: ingestOutcome.meetingId,
        onlineMeetingId: meeting.onlineMeetingId,
        subject: meeting.subject,
        status: 'TRANSCRIPT_UPGRADED',
        transcriptStatus,
        aiStatus,
        interactionId: ingestOutcome.interactionId,
        accountId: ingestOutcome.accountId,
      });
    } else if (ingestOutcome.success) {
      summary.interactionsCreated++;
      summary.results.push({
        meetingId: ingestOutcome.meetingId,
        onlineMeetingId: meeting.onlineMeetingId,
        subject: meeting.subject,
        status: 'SYNCED',
        transcriptStatus,
        aiStatus,
        interactionId: ingestOutcome.interactionId,
        accountId: ingestOutcome.accountId,
        sentiment: aiSummaryData?.sentiment || 'Neutral',
      });
    }
  }

  // Record SyncHistory and SyncCheckpoints
  const syncId = 'sync-teams-' + Math.random().toString(36).substring(2, 11);
  await db.collection('synchistory').doc(syncId).set({
    syncId,
    provider: 'Microsoft Teams',
    mailbox: authorizedEmail,
    triggeredByUid: user?.uid || 'system',
    triggeredByName: user?.name || 'Teams Auto-Sync',
    results: JSON.stringify(summary),
    timestamp: new Date().toISOString(),
  });

  const checkpointStatus = summary.permissionDenied > 0 ? 'PARTIAL_PERMISSION_DENIED' : summary.errors > 0 ? 'ERROR' : 'SUCCESS';
  const lastErrText = summary.results.find(r => r.error)?.error || null;
  await saveSyncCheckpoint(authorizedEmail, checkpointStatus, summary.meetingsDiscovered, lastErrText);

  return summary;
}

/**
 * Resolves a pending CommunicationReviewQueue item to a specific CRM Account.
 */
export async function resolveTeamsReviewItem({ reviewId, accountId, contactId = null, user }) {
  const revDoc = await db.collection('communicationreviewqueue').doc(reviewId).get();
  if (!revDoc.exists) {
    throw new Error('Review queue item not found.');
  }

  const item = revDoc.data();
  if (item.status === 'RESOLVED') {
    throw new Error('Review item is already resolved.');
  }

  const accDoc = await db.collection('accounts').doc(accountId).get();
  if (!accDoc.exists) {
    throw new Error('Target CRM account not found.');
  }

  const account = accDoc.data();
  const payload = item.payload || {};
  const meetingDetails = payload.meetingDetails;
  if (!meetingDetails) {
    throw new Error('Review item payload is missing meetingDetails.');
  }

  const crmMatch = {
    matched: true,
    accountId: account.accountId || account.id,
    companyName: account.companyName || account.name,
    contactId: contactId || null,
    externalAttendees: item.externalParticipants || [],
    associatedAccountIds: [account.accountId || account.id],
    matchReason: 'MANUAL_ADMIN_REVIEW',
    matchConfidence: 100,
  };

  const ingestOutcome = await ingestTeamsMeetingAsInteraction({
    meetingDetails,
    parsedTranscript: payload.parsedTranscript || null,
    transcriptStatus: payload.transcriptStatus || TRANSCRIPT_STATUS.NOT_RECORDED,
    aiSummaryData: payload.aiSummaryData || null,
    crmMatch,
    user,
  });

  const now = new Date().toISOString();
  await db.collection('communicationreviewqueue').doc(reviewId).update({
    status: 'RESOLVED',
    resolvedAccountId: crmMatch.accountId,
    resolvedByUid: user?.uid || 'admin',
    resolvedAt: now,
    updatedAt: now,
  });

  return { resolved: true, reviewId, accountId: crmMatch.accountId, ingestOutcome };
}

/**
 * Retries AI Customer Intelligence processing for meetings whose transcript was retrieved
 * (`transcriptStatus === 'AVAILABLE'`) but AI processing previously failed (`aiStatus === 'FAILED'`).
 */
export async function retryFailedAiProcessing() {
  const snap = await db.collection('teamsmeetings').get();
  const failedMeetings = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(m => m.transcriptStatus === TRANSCRIPT_STATUS.AVAILABLE && m.aiStatus === 'FAILED' && m.rawTranscript);

  let retried = 0;
  let succeeded = 0;
  let failed = 0;

  for (const m of failedMeetings) {
    retried++;
    try {
      const parsed = parseMeetingTranscript(m.rawTranscript);
      const aiSummaryData = await generateTeamsMeetingSummary({
        subject: m.subject,
        organizerName: m.organizerEmail,
        attendees: m.attendees || [],
        transcriptText: parsed.cleanFullText,
        meetingDate: m.startDateTime,
        durationSeconds: m.durationSeconds || 0,
      });

      if (aiSummaryData && !aiSummaryData.skipped && aiSummaryData.summary) {
        succeeded++;
        const now = new Date().toISOString();
        await db.collection('teamsmeetings').doc(m.meetingId || m.id).update({
          aiSummary: aiSummaryData.summary,
          keyTopics: aiSummaryData.keyTopics || [],
          keyDecisions: aiSummaryData.keyDecisions || [],
          actionItems: aiSummaryData.actionItems || [],
          customerRequirements: aiSummaryData.customerRequirements || [],
          commitments: aiSummaryData.commitments || [],
          risksIdentified: aiSummaryData.risksIdentified || [],
          sentiment: aiSummaryData.sentiment || 'Neutral',
          aiStatus: 'COMPLETED',
          aiError: null,
          updatedAt: now,
        });

        if (m.interactionId) {
          await db.collection('interactions').doc(m.interactionId).update({
            messageText: `AI Summary: ${aiSummaryData.summary}\n\n${parsed.cleanFullText}`,
            sentiment: aiSummaryData.sentiment || 'Neutral',
          }).catch(() => {});
        }
      }
    } catch (err) {
      failed++;
      await db.collection('teamsmeetings').doc(m.meetingId || m.id).update({
        aiStatus: 'FAILED',
        aiError: err.message,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return { retried, succeeded, failed };
}

/**
 * Retries all failed technical synchronization operations:
 *  1. Recalculates organizer eligibility & processes pending policy queue
 *  2. Retries failed policy assignments (`forceRetryAllFailed: true`)
 *  3. Retries failed AI summary generation
 */
export async function retryFailedTeamsOperations({ user = { uid: 'system', name: 'Technical Retry' } } = {}) {
  const recalc = await recalculateEligibleOrganizers({ triggerSource: 'TECHNICAL_RETRY' });
  const policyRetry = await processPolicySyncQueue({ forceRetryAllFailed: true });
  const aiRetry = await retryFailedAiProcessing();

  await logActivity(
    user.uid || 'system',
    user.name || 'Technical Retry',
    'TEAMS_FAILED_OPS_RETRIED',
    `Retried policy queue (${policyRetry.processed} processed, ${policyRetry.authorized} authorized) and AI queue (${aiRetry.succeeded}/${aiRetry.retried} recovered).`
  ).catch(() => {});

  return {
    recalculation: recalc,
    policyRetry,
    aiRetry,
  };
}

/**
 * Returns complete operational metrics for Customer Intelligence / Teams Integration (Phase 12).
 * Contains only technical operational metrics (zero manual employee approval states).
 */
export async function getTeamsOperationalStatus() {
  const readiness = inspectDevGraphConfigReadiness();
  const [orgsSnap, meetingsSnap, reviewSnap, cpSnap] = await Promise.all([
    db.collection('authorizedorganizers').get(),
    db.collection('teamsmeetings').get(),
    db.collection('communicationreviewqueue').get(),
    db.collection('synccheckpoints').get(),
  ]);

  const organizers = orgsSnap.docs.map(d => d.data());
  const meetings = meetingsSnap.docs.map(d => d.data());
  const reviews = reviewSnap.docs.map(d => d.data()).filter(r => r.channel === 'TEAMS_MEETING');
  const checkpoints = cpSnap.docs.map(d => d.data()).filter(c => c.provider === 'MICROSOFT_TEAMS');

  const eligibleOrganizers = organizers.filter(
    o =>
      o.eligibilityStatus !== ORGANIZER_STATUS.EMPLOYEE_NOT_MATCHED &&
      o.eligibilityStatus !== ORGANIZER_STATUS.REVOKED &&
      ((o.ownedAccountsCount || 0) > 0 || (o.ownedContactsCount || 0) > 0)
  );
  const authorizedOrganizers = organizers.filter(o => o.eligibilityStatus === ORGANIZER_STATUS.AUTHORIZED);
  const pendingPolicyAssignments = organizers.filter(o => o.eligibilityStatus === ORGANIZER_STATUS.PENDING_ASSIGNMENT);
  const failedAssignments = organizers.filter(
    o =>
      o.eligibilityStatus === ORGANIZER_STATUS.ASSIGNMENT_FAILED ||
      o.eligibilityStatus === ORGANIZER_STATUS.INVALID_TEAMS_ACCOUNT
  );
  const pendingRevocations = organizers.filter(o => o.eligibilityStatus === ORGANIZER_STATUS.PENDING_REVOCATION);
  const revokedOrganizers = organizers.filter(o => o.eligibilityStatus === ORGANIZER_STATUS.REVOKED);
  const unmatchedEmployees = organizers.filter(o => o.eligibilityStatus === ORGANIZER_STATUS.EMPLOYEE_NOT_MATCHED);

  const outlookAuthorized = organizers.filter(o => o.outlookStatus === OUTLOOK_STATUS.AUTHORIZED);
  const outlookPendingConfigurations = organizers.filter(o => o.outlookStatus === OUTLOOK_STATUS.PENDING_CONFIGURATION);
  const outlookFailed = organizers.filter(o => o.outlookStatus === OUTLOOK_STATUS.FAILED);
  const outlookPendingRevocations = organizers.filter(o => o.outlookStatus === OUTLOOK_STATUS.PENDING_REVOCATION);
  const outlookRevoked = organizers.filter(o => o.outlookStatus === OUTLOOK_STATUS.REVOKED);

  const transcriptsRetrieved = meetings.filter(m => m.transcriptStatus === TRANSCRIPT_STATUS.AVAILABLE).length;
  const pendingReviewMatches = reviews.filter(r => r.status === 'PENDING_REVIEW').length;
  const aiFailedCount = meetings.filter(m => m.aiStatus === 'FAILED').length;

  const sortedCheckpoints = [...checkpoints].sort(
    (a, b) => new Date(b.lastSyncedAt || 0) - new Date(a.lastSyncedAt || 0)
  );
  const lastSuccessCp = sortedCheckpoints.find(c => c.lastStatus === 'SUCCESS');
  const lastErrorCp = sortedCheckpoints.find(c => c.lastError);
  const orgError = organizers.find(o => o.lastError)?.lastError || null;
  const meetingError = meetings.find(m => m.lastError || m.aiError);

  return {
    ...readiness,
    totalEligibleOrganizers: eligibleOrganizers.length,
    authorizedOrganizersCount: authorizedOrganizers.length,
    pendingPolicyAssignmentsCount: pendingPolicyAssignments.length,
    failedAssignmentsCount: failedAssignments.length,
    pendingRevocationsCount: pendingRevocations.length,
    revokedOrganizersCount: revokedOrganizers.length,
    unmatchedEmployeesCount: unmatchedEmployees.length,
    outlookAuthorizedCount: outlookAuthorized.length,
    outlookPendingConfigurationsCount: outlookPendingConfigurations.length,
    outlookFailedCount: outlookFailed.length,
    outlookPendingRevocationsCount: outlookPendingRevocations.length,
    outlookRevokedCount: outlookRevoked.length,
    meetingsDiscoveredCount: meetings.length + pendingReviewMatches,
    transcriptsRetrievedCount: transcriptsRetrieved,
    meetingsAwaitingAccountMatchingCount: pendingReviewMatches,
    aiFailedCount,
    lastSuccessfulSyncAt: lastSuccessCp?.lastSyncedAt || lastTeamsSyncAt || null,
    lastSyncError:
      lastErrorCp?.lastError ||
      meetingError?.lastError ||
      meetingError?.aiError ||
      orgError ||
      null,
    syncInProgress: isTeamsSyncInProgress(),
    organizers,
    checkpoints: sortedCheckpoints,
  };
}

/**
 * Runs one synchronization cycle across ONLY automatically authorized organizers (`AuthorizedOrganizers`).
 * Never loops over the general `Users` table.
 */
export async function runAuthorizedTeamsSyncCycle({ user = { uid: 'system', name: 'Teams Auto-Sync' } } = {}) {
  if (!microsoftTeamsConfig.enabled) {
    return { skipped: true, reason: 'MICROSOFT_TEAMS_SOURCE_DISABLED' };
  }

  if (isTeamsSyncRunning) {
    return { skipped: true, reason: 'TEAMS_SYNC_ALREADY_IN_PROGRESS' };
  }

  isTeamsSyncRunning = true;
  lastTeamsSyncAt = new Date().toISOString();

  try {
    await recalculateEligibleOrganizers({ triggerSource: 'SCHEDULER_CYCLE' }).catch(() => {});
    await retryFailedAiProcessing().catch(() => {});

    const organizers = await listAuthorizedTeamsOrganizers();
    if (organizers.length === 0) {
      console.log('ℹ️ [TeamsSyncScheduler] No authorized Teams organizers currently active in AuthorizedOrganizers.');
      return { skipped: false, organizersProcessed: 0, summaries: [] };
    }

    const summaries = [];
    for (const org of organizers) {
      try {
        const res = await syncTeamsMeetingsForOrganizer({
          organizerEmail: org.email,
          user,
        });
        summaries.push(res);
      } catch (orgErr) {
        console.error(`❌ [TeamsSyncScheduler] Failed syncing organizer ${org.email}:`, orgErr.message);
        summaries.push({ organizerEmail: org.email, error: orgErr.message });
      }
    }

    return {
      skipped: false,
      organizersProcessed: organizers.length,
      summaries,
    };
  } finally {
    isTeamsSyncRunning = false;
  }
}

export function startTeamsSyncScheduler() {
  if (teamsSyncTimer) {
    clearInterval(teamsSyncTimer);
    teamsSyncTimer = null;
  }

  if (!microsoftTeamsConfig.enabled) {
    console.log('ℹ️ [TeamsSyncScheduler] Disabled (set MICROSOFT_TEAMS_SOURCE_ENABLED=true after IT policy confirmation to enable).');
    return;
  }

  const intervalMs = microsoftTeamsConfig.syncIntervalMs;
  console.log(`⏰ [TeamsSyncScheduler] Initialized (interval=${Math.round(intervalMs / 60000)}m, calendarDiscovery=${microsoftTeamsConfig.calendarDiscoveryEnabled}).`);

  setTimeout(() => {
    runAuthorizedTeamsSyncCycle().catch(err => {
      console.error('❌ [TeamsSyncScheduler] Startup run error:', err.message);
    });
  }, 15000);

  teamsSyncTimer = setInterval(() => {
    runAuthorizedTeamsSyncCycle().catch(err => {
      console.error('❌ [TeamsSyncScheduler] Periodic run error:', err.message);
    });
  }, intervalMs);
}

export function stopTeamsSyncScheduler() {
  if (teamsSyncTimer) {
    clearInterval(teamsSyncTimer);
    teamsSyncTimer = null;
    console.log('🛑 [TeamsSyncScheduler] Stopped.');
  }
}
