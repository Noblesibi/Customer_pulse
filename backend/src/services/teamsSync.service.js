/**
 * teamsSync.service.js
 *
 * Microsoft Teams Meeting & Transcript Synchronization Engine.
 * Comprehensive 6-Phase Pipeline:
 *  - Phase 1: Meeting discovery from organizer's calendar and onlineMeetings API
 *  - Phase 2: Meeting details & participant extraction (internal vs external)
 *  - Phase 3: Transcript retrieval (WebVTT content fetching from Graph)
 *  - Phase 4: Transcript parsing via teamsTranscriptParser (speakers, cues, clean text)
 *  - Phase 5: CRM entity matching (maps external participants to Contacts & Accounts)
 *  - Phase 6: PostgreSQL database ingestion ("TeamsMeetings" + "Interactions" pipeline)
 */

import { db, logActivity } from '../config/database.js';
import { getDevGraphClient } from './microsoftGraph.service.js';
import { parseTeamsTranscript } from './teamsTranscriptParser.js';
import { normalizeEmail, extractDomain, normalizeCompanyName } from './entityMatching.service.js';
import { createInteraction } from './interaction.service.js';

const INTERNAL_DOMAIN = '@nestgroup.net';

/**
 * PHASE 1: Meeting Discovery from Organizer's Calendar
 * Fetches calendar events marked as online meetings or containing Teams join URLs.
 */
export async function discoverTeamsMeetings({
  organizerEmail,
  daysBack = 14,
  daysAhead = 7,
  limit = 50
}) {
  if (!organizerEmail) {
    throw new Error('Organizer email is required for Teams meeting discovery.');
  }

  const now = new Date();
  const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  const endDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

  const discovered = [];

  try {
    const graphClient = await getDevGraphClient();

    // 1. Fetch Calendar Events that are Teams Meetings
    const calendarEventsRes = await graphClient
      .api(`/users/${encodeURIComponent(organizerEmail)}/calendar/events`)
      .filter(`start/dateTime ge '${startDate}' and end/dateTime le '${endDate}'`)
      .select([
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
        'webLink'
      ].join(','))
      .top(limit)
      .get();

    const rawEvents = calendarEventsRes.value || [];

    for (const ev of rawEvents) {
      // Check if it is a Teams meeting
      const isTeams =
        ev.isOnlineMeeting ||
        ev.onlineMeetingProvider?.toLowerCase().includes('teams') ||
        ev.onlineMeeting?.joinUrl?.includes('teams.microsoft.com') ||
        ev.bodyPreview?.includes('teams.microsoft.com');

      if (!isTeams) continue;

      const meetingDetails = extractMeetingDetails(ev, organizerEmail);
      discovered.push(meetingDetails);
    }
  } catch (err) {
    const isPermissionError =
      err.statusCode === 403 ||
      err.message?.includes('AccessDenied') ||
      err.message?.includes('Authorization_RequestDenied') ||
      err.message?.includes('invalid');

    if (isPermissionError) {
      console.warn(
        `⚠️ [TeamsSync] Microsoft Graph permission or Application Access Policy pending for ${organizerEmail}: ${err.message}`
      );
    } else {
      console.error(`❌ [TeamsSync] Failed to discover meetings for ${organizerEmail}:`, err.message);
    }
  }

  return discovered;
}

/**
 * PHASE 2: Meeting Details & Participant Extraction
 * Normalizes event/meeting object into a standardized schema and separates internal vs external attendees.
 */
export function extractMeetingDetails(rawEvent, defaultOrganizerEmail) {
  const organizerEmail =
    normalizeEmail(rawEvent.organizer?.emailAddress?.address) ||
    normalizeEmail(defaultOrganizerEmail) ||
    '';
  const organizerName = rawEvent.organizer?.emailAddress?.name || organizerEmail.split('@')[0] || 'Meeting Organizer';

  const rawAttendees = rawEvent.attendees || [];
  const attendees = [];

  for (const att of rawAttendees) {
    const email = normalizeEmail(att.emailAddress?.address);
    if (!email) continue;
    const name = att.emailAddress?.name || email.split('@')[0];
    const isInternal = email.endsWith(INTERNAL_DOMAIN);

    attendees.push({
      email,
      name,
      type: att.type || 'required',
      response: att.status?.response || 'none',
      isInternal,
      isExternal: !isInternal
    });
  }

  // Ensure organizer is in attendees list
  if (organizerEmail && !attendees.some(a => a.email === organizerEmail)) {
    attendees.push({
      email: organizerEmail,
      name: organizerName,
      type: 'organizer',
      response: 'accepted',
      isInternal: organizerEmail.endsWith(INTERNAL_DOMAIN),
      isExternal: !organizerEmail.endsWith(INTERNAL_DOMAIN)
    });
  }

  const joinWebUrl =
    rawEvent.onlineMeeting?.joinUrl ||
    rawEvent.onlineMeeting?.joinWebUrl ||
    rawEvent.webLink ||
    null;

  const meetingId =
    rawEvent.onlineMeeting?.id ||
    rawEvent.id ||
    `teams_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  return {
    meetingId,
    eventId: rawEvent.id || null,
    subject: rawEvent.subject || 'Microsoft Teams Meeting',
    startDateTime: rawEvent.start?.dateTime ? new Date(rawEvent.start.dateTime).toISOString() : new Date().toISOString(),
    endDateTime: rawEvent.end?.dateTime ? new Date(rawEvent.end.dateTime).toISOString() : new Date().toISOString(),
    joinWebUrl,
    organizerEmail,
    organizerName,
    attendees,
    externalAttendees: attendees.filter(a => a.isExternal),
    internalAttendees: attendees.filter(a => a.isInternal)
  };
}

/**
 * PHASE 3: Transcript Retrieval
 * Fetches transcript metadata and raw WebVTT content from Microsoft Graph.
 */
export async function fetchMeetingTranscriptContent({
  organizerEmail,
  meetingId
}) {
  try {
    const graphClient = await getDevGraphClient();

    // 1. List transcripts for meeting
    const transcriptsRes = await graphClient
      .api(`/users/${encodeURIComponent(organizerEmail)}/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`)
      .get();

    const transcriptsList = transcriptsRes.value || [];
    if (transcriptsList.length === 0) {
      return null;
    }

    const transcriptId = transcriptsList[0].id;

    // 2. Fetch actual WebVTT content
    const contentStream = await graphClient
      .api(`/users/${encodeURIComponent(organizerEmail)}/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts/${encodeURIComponent(transcriptId)}/content`)
      .query({ $format: 'text/vtt' })
      .get();

    let rawVtt = '';
    if (typeof contentStream === 'string') {
      rawVtt = contentStream;
    } else if (contentStream && typeof contentStream.text === 'function') {
      rawVtt = await contentStream.text();
    } else {
      rawVtt = String(contentStream || '');
    }

    return {
      transcriptId,
      rawContent: rawVtt,
      format: 'text/vtt'
    };
  } catch (err) {
    console.warn(
      `⚠️ [TeamsSync] Transcript fetch for meeting ${meetingId} (${organizerEmail}) unavailable: ${err.message}`
    );
    return null;
  }
}

/**
 * PHASE 4: Transcript Parsing
 * Uses teamsTranscriptParser to convert raw VTT into clean LLM text, dialogue cues, and speaker lists.
 */
export function parseMeetingTranscript(rawVttContent) {
  return parseTeamsTranscript(rawVttContent);
}

/**
 * PHASE 5: CRM Entity Matcher
 * Matches external meeting participants against CRM Contacts and Accounts.
 * Strictly ignores internal @nestgroup.net attendees for CRM account matching.
 */
export async function matchMeetingParticipantsToCrm(attendees, cachedData = null) {
  let contacts = [];
  let accounts = [];

  if (cachedData?.contacts && cachedData?.accounts) {
    contacts = cachedData.contacts;
    accounts = cachedData.accounts;
  } else {
    const [cSnap, aSnap] = await Promise.all([
      db.collection('contacts').get(),
      db.collection('accounts').get()
    ]);
    contacts = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    accounts = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const externalAttendees = (attendees || []).filter(a => a.isExternal || !a.email?.endsWith(INTERNAL_DOMAIN));

  if (externalAttendees.length === 0) {
    return {
      matched: false,
      reason: 'INTERNAL_ONLY_MEETING',
      details: 'Meeting contains only internal NeST Digital participants.'
    };
  }

  // 1. Direct Email Matching against Contacts.email
  const matchedContacts = [];
  const matchedAccountIds = new Set();

  for (const att of externalAttendees) {
    const attEmail = normalizeEmail(att.email);
    for (const c of contacts) {
      const cEmail = normalizeEmail(c.email);
      if (attEmail && cEmail && attEmail === cEmail) {
        matchedContacts.push({
          contactId: c.contactId || c.id,
          contactName: c.name || att.name,
          accountId: c.accountId,
          email: attEmail
        });
        if (c.accountId) {
          matchedAccountIds.add(c.accountId);
        }
      }
    }
  }

  // 2. Domain-based Account Fallback if no contact email matched
  if (matchedAccountIds.size === 0) {
    for (const att of externalAttendees) {
      const attDomain = extractDomain(att.email);
      if (!attDomain || attDomain === 'gmail.com' || attDomain === 'yahoo.com' || attDomain === 'outlook.com') {
        continue;
      }

      for (const a of accounts) {
        const aid = a.accountId || a.id;
        const aWebsite = a.website || a.domain || '';
        const aDomain = extractDomain(aWebsite);

        if (aDomain && aDomain === attDomain) {
          matchedAccountIds.add(aid);
          break;
        }

        // Check if company name matches domain stem (e.g., zeiss.com -> zeiss)
        const domainStem = attDomain.split('.')[0];
        const normComp = normalizeCompanyName(a.companyName || a.name || '');
        if (normComp && (normComp.includes(domainStem) || domainStem.includes(normComp))) {
          matchedAccountIds.add(aid);
          break;
        }
      }
    }
  }

  if (matchedAccountIds.size === 0) {
    return {
      matched: false,
      reason: 'NO_CRM_ACCOUNT_MATCH',
      externalAttendees: externalAttendees.map(a => a.email),
      details: 'No CRM Contact or Account matched the external participants.'
    };
  }

  // Resolve best account
  const primaryAccountId = Array.from(matchedAccountIds)[0];
  const primaryAccount = accounts.find(a => (a.accountId || a.id) === primaryAccountId);
  const primaryContact = matchedContacts.find(c => c.accountId === primaryAccountId) || matchedContacts[0] || null;

  return {
    matched: true,
    accountId: primaryAccountId,
    companyName: primaryAccount?.companyName || primaryAccount?.name || 'Customer Account',
    contactId: primaryContact?.contactId || null,
    contactName: primaryContact?.contactName || null,
    allMatchedContacts: matchedContacts,
    externalAttendees: externalAttendees.map(a => ({ email: a.email, name: a.name })),
    hasMultipleAccounts: matchedAccountIds.size > 1,
    associatedAccountIds: Array.from(matchedAccountIds)
  };
}

/**
 * PHASE 6: PostgreSQL Database Ingestion & Interaction Creation
 * Ingests the meeting and transcript into "TeamsMeetings" and writes to "Interactions"
 * triggering the downstream AI sentiment, risk detection, and health score calculations.
 */
export async function ingestTeamsMeetingAsInteraction({
  meetingDetails,
  parsedTranscript,
  crmMatch,
  user = { uid: 'system', name: 'Teams Auto-Sync', email: 'system@pulse.com' }
}) {
  if (!crmMatch || !crmMatch.matched || !crmMatch.accountId) {
    return { skipped: true, reason: 'Meeting is not associated with an existing CRM Account.' };
  }

  const meetingId = meetingDetails.meetingId;
  const dedupMessageId = `teams_meeting_${meetingId}`;

  // 1. Check if already ingested in Interactions to prevent duplicates
  const existingInteractions = await db.collection('interactions')
    .where('internetMessageId', '==', dedupMessageId)
    .limit(1)
    .get();

  if (!existingInteractions.empty) {
    return {
      duplicate: true,
      interactionId: existingInteractions.docs[0].data().interactionId || existingInteractions.docs[0].id,
      message: 'Meeting interaction already exists in CRM.'
    };
  }

  // 2. Prepare Clean Transcript Dialogue and Metadata
  const cleanDialogueText = parsedTranscript?.cleanFullText ||
    `[Teams Meeting Recorded]\nOrganizer: ${meetingDetails.organizerName} (${meetingDetails.organizerEmail})\nParticipants: ${(meetingDetails.attendees || []).map(a => a.name || a.email).join(', ')}\nNo spoken transcript text was recorded.`;

  const startDate = new Date(meetingDetails.startDateTime);
  const dateStr = startDate.toISOString().split('T')[0];
  const timeStr = startDate.toTimeString().slice(0, 5);

  const metadataPayload = {
    meetingId,
    joinWebUrl: meetingDetails.joinWebUrl,
    durationSeconds: parsedTranscript?.durationSeconds || 0,
    wordCount: parsedTranscript?.wordCount || 0,
    speakers: parsedTranscript?.speakers || [],
    externalAttendees: crmMatch.externalAttendees || [],
    organizer: {
      name: meetingDetails.organizerName,
      email: meetingDetails.organizerEmail
    }
  };

  // 3. Create Interaction (powers AI analysis, sentiment, risks, health scores)
  const interactionData = {
    accountId: crmMatch.accountId,
    contactId: crmMatch.contactId || null,
    source: 'Teams Meeting',
    subject: meetingDetails.subject || 'Microsoft Teams Cadence',
    messageText: cleanDialogueText,
    date: dateStr,
    time: timeStr,
    internetMessageId: dedupMessageId,
    attachments: JSON.stringify(metadataPayload),
    actionMentions: []
  };

  const interactionResult = await createInteraction(interactionData, user);
  const interactionId = interactionResult.interaction?.interactionId || interactionResult.interactionId;

  // 4. Upsert into dedicated "TeamsMeetings" PostgreSQL table
  try {
    const meetingRecord = {
      meetingId,
      organizerEmail: meetingDetails.organizerEmail,
      subject: meetingDetails.subject,
      startDateTime: meetingDetails.startDateTime,
      endDateTime: meetingDetails.endDateTime,
      joinWebUrl: meetingDetails.joinWebUrl,
      transcriptId: parsedTranscript?.transcriptId || null,
      rawTranscript: parsedTranscript?.rawContent || null,
      parsedDialogue: JSON.stringify(parsedTranscript?.cues || []),
      speakers: JSON.stringify(parsedTranscript?.speakers || []),
      attendees: JSON.stringify(meetingDetails.attendees || []),
      accountId: crmMatch.accountId,
      contactId: crmMatch.contactId || null,
      interactionId: interactionId || null,
      syncStatus: 'SYNCED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.collection('teamsmeetings').doc(meetingId).set(meetingRecord, { merge: true });
  } catch (err) {
    console.warn(`⚠️ [TeamsSync] Non-fatal error caching to TeamsMeetings table:`, err.message);
  }

  // 5. Activity Log
  await logActivity({
    userId: user.uid || 'system',
    userName: user.name || 'Teams Auto-Sync',
    action: 'TEAMS_MEETING_SYNCED',
    entityType: 'Interaction',
    entityId: interactionId,
    accountId: crmMatch.accountId,
    contactId: crmMatch.contactId,
    details: `Synced Teams meeting "${meetingDetails.subject}" with ${parsedTranscript?.speakers?.length || 0} speaker(s) and logged CRM interaction.`
  }).catch(() => {});

  return {
    success: true,
    interactionId,
    accountId: crmMatch.accountId,
    contactId: crmMatch.contactId,
    analysis: interactionResult.analysis,
    health: interactionResult.health
  };
}

/**
 * MASTER ORCHESTRATOR: Synchronizes Teams meetings and transcripts for an organizer.
 * Executes Phases 1 through 6 in sequence.
 */
export async function syncTeamsMeetingsForOrganizer({
  organizerEmail,
  daysBack = 14,
  daysAhead = 7,
  user = { uid: 'system', name: 'Teams Auto-Sync' }
}) {
  const summary = {
    organizerEmail,
    meetingsDiscovered: 0,
    crmMatched: 0,
    transcriptsParsed: 0,
    interactionsCreated: 0,
    duplicatesSkipped: 0,
    unmatchedSkipped: 0,
    results: []
  };

  // Phase 1 & 2: Discover meetings and extract attendees
  const meetings = await discoverTeamsMeetings({ organizerEmail, daysBack, daysAhead });

  summary.meetingsDiscovered = meetings.length;

  if (meetings.length === 0) {
    return summary;
  }

  // Load CRM Entities once for fast participant matching
  const [cSnap, aSnap] = await Promise.all([
    db.collection('contacts').get(),
    db.collection('accounts').get()
  ]);
  const cachedCrm = {
    contacts: cSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    accounts: aSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  };

  for (const meeting of meetings) {
    // Phase 5: Entity Matching
    const crmMatch = await matchMeetingParticipantsToCrm(meeting.attendees, cachedCrm);

    if (!crmMatch.matched) {
      summary.unmatchedSkipped++;
      summary.results.push({
        meetingId: meeting.meetingId,
        subject: meeting.subject,
        status: 'UNMATCHED',
        reason: crmMatch.reason
      });
      continue;
    }

    summary.crmMatched++;

    // Phase 3: Transcript Retrieval
    const transcriptPayload = await fetchMeetingTranscriptContent({
      organizerEmail,
      meetingId: meeting.meetingId
    });

    // Phase 4: Transcript Parsing
    let parsedTranscript = null;
    if (transcriptPayload?.rawContent) {
      parsedTranscript = parseMeetingTranscript(transcriptPayload.rawContent);
      parsedTranscript.transcriptId = transcriptPayload.transcriptId;
      parsedTranscript.rawContent = transcriptPayload.rawContent;
      summary.transcriptsParsed++;
    }

    // Phase 6: PostgreSQL Database Ingestion & Interaction Creation
    const ingestOutcome = await ingestTeamsMeetingAsInteraction({
      meetingDetails: meeting,
      parsedTranscript,
      crmMatch,
      user
    });

    if (ingestOutcome.duplicate) {
      summary.duplicatesSkipped++;
      summary.results.push({
        meetingId: meeting.meetingId,
        subject: meeting.subject,
        status: 'DUPLICATE',
        interactionId: ingestOutcome.interactionId
      });
    } else if (ingestOutcome.success) {
      summary.interactionsCreated++;
      summary.results.push({
        meetingId: meeting.meetingId,
        subject: meeting.subject,
        status: 'SYNCED',
        interactionId: ingestOutcome.interactionId,
        accountId: ingestOutcome.accountId,
        sentiment: ingestOutcome.analysis?.sentiment || 'Neutral'
      });
    } else {
      summary.results.push({
        meetingId: meeting.meetingId,
        subject: meeting.subject,
        status: 'SKIPPED',
        reason: ingestOutcome.reason
      });
    }
  }

  return summary;
}
