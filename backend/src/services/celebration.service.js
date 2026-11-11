/**
 * celebration.service.js
 *
 * Customer Celebration Intelligence — core service.
 * Handles:
 *   - CRUD for CelebrationEvents (stored in db.collection('celebrationEvents'))
 *   - Detection of upcoming events from existing CustomerPulse contacts
 *   - Source tracking and verification
 *   - AI greeting draft generation (reuses existing ai.service.js)
 *   - Send via existing EmailQueue
 *   - Post-send Interaction log creation
 *   - Gentle reminder calculation (no new scheduler needed)
 *
 * This service does NOT modify or duplicate:
 *   - Task reminders
 *   - Interaction assignment notifications
 *   - General operational notifications
 */

import { db, logActivity } from '../config/database.js';
import { fetchGoogleContacts, fetchGoogleCalendarEvents, getAllActiveGoogleIntegrations } from './google.service.js';
import { fetchMicrosoftContacts } from './microsoftGraph.service.js';
import { getSystemDateString, getSystemTimeString } from '../utils/dateUtils.js';
import { syncFestivalOccasionsForAccounts } from './festivalCelebration.service.js';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

export const EVENT_TYPES = {
  BIRTHDAY: 'BIRTHDAY',
  WORK_ANNIVERSARY: 'WORK_ANNIVERSARY',
  COMPANY_ANNIVERSARY: 'COMPANY_ANNIVERSARY',
  PROMOTION: 'PROMOTION',
  NEW_ROLE: 'NEW_ROLE',
  AWARD: 'AWARD',
  ACHIEVEMENT: 'ACHIEVEMENT',
  CERTIFICATION: 'CERTIFICATION',
  GRADUATION: 'GRADUATION',
  BUSINESS_MILESTONE: 'BUSINESS_MILESTONE',
  PROJECT_MILESTONE: 'PROJECT_MILESTONE',
  PARTNERSHIP_MILESTONE: 'PARTNERSHIP_MILESTONE',
  FESTIVAL: 'FESTIVAL',
  HOLIDAY: 'HOLIDAY',
  SPECIAL_RECOGNITION: 'SPECIAL_RECOGNITION',
  CUSTOM_APPRECIATION: 'CUSTOM_APPRECIATION',
  OTHER: 'OTHER',
};

export const SOURCE_TYPES = {
  CUSTOMERPULSE: 'CUSTOMERPULSE',
  PUBLIC_NEWS: 'PUBLIC_NEWS',
  OFFICIAL_WEBSITE: 'OFFICIAL_WEBSITE',
  CRM_EMAIL: 'CRM_EMAIL',
  CUSTOMER_VERIFIED: 'CUSTOMER_VERIFIED',
  MICROSOFT: 'MICROSOFT',
  GOOGLE: 'GOOGLE',
  GOOGLE_CONTACTS: 'GOOGLE_CONTACTS',
  GOOGLE_CALENDAR: 'GOOGLE_CALENDAR',
  LINKEDIN: 'LINKEDIN',
  COMPANY_WEBSITE: 'COMPANY_WEBSITE',
  PUBLIC_SOURCE: 'PUBLIC_SOURCE',
  MANUAL: 'MANUAL',
  ADMIN: 'ADMIN',
};

export const VERIFICATION_STATUS = {
  VERIFIED: 'VERIFIED',
  PENDING_REVIEW: 'PENDING_REVIEW',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  REJECTED: 'REJECTED',
  AUTO_VERIFIED: 'AUTO_VERIFIED',
};

export const CELEBRATION_STATUS = {
  DETECTED: 'DETECTED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  VERIFIED: 'VERIFIED',
  UPCOMING: 'UPCOMING',
  DRAFTED: 'DRAFTED',
  APPROVED: 'APPROVED',
  SCHEDULED: 'SCHEDULED',
  SENT: 'SENT',
  DISMISSED: 'DISMISSED',
  EXPIRED: 'EXPIRED',
  FAILED: 'FAILED',
};

export const EVENT_ICONS = {
  BIRTHDAY: '🎂',
  WORK_ANNIVERSARY: '🏆',
  COMPANY_ANNIVERSARY: '🏢',
  PROMOTION: '🚀',
  NEW_ROLE: '💼',
  AWARD: '🥇',
  ACHIEVEMENT: '⭐',
  CERTIFICATION: '🎓',
  GRADUATION: '🎓',
  BUSINESS_MILESTONE: '📈',
  PROJECT_MILESTONE: '🎯',
  PARTNERSHIP_MILESTONE: '🤝',
  FESTIVAL: '🎉',
  HOLIDAY: '🌟',
  SPECIAL_RECOGNITION: '🏅',
  CUSTOM_APPRECIATION: '💌',
  OTHER: '✨',
};

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

function newId(prefix = 'cel') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Calculates days until the next occurrence of a MM-DD date string (or YYYY-MM-DD).
 * Returns null if date cannot be parsed.
 */
export function daysUntilNextOccurrence(dateStr, eventType) {
  if (!dateStr) return null;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let year = null, month, day;

    // Support YYYY-MM-DD or MM-DD or DD/MM/YYYY
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const parts = dateStr.split('-');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else if (/^\d{2}-\d{2}$/.test(dateStr)) {
      const parts = dateStr.split('-');
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      const parts = dateStr.split('/');
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    } else {
      // Try natural language parse: "25 September" or "September 25"
      const parsed = new Date(dateStr + (dateStr.includes('20') ? '' : ' ' + today.getFullYear()));
      if (isNaN(parsed.getTime())) return null;
      month = parsed.getMonth() + 1;
      day = parsed.getDate();
      year = parsed.getFullYear();
    }

    if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;

    const thisYear = new Date(today.getFullYear(), month - 1, day);
    thisYear.setHours(0, 0, 0, 0);

    const diffDays = Math.round((thisYear - today) / 86400000);

    // If it is in the current calendar week or recent (-7 to +7 days), keep relative difference
    // so it doesn't artificially wrap 364 days into next year
    if (diffDays >= -7 && diffDays <= 7) {
      return diffDays;
    }

    // For non-recurring milestones with an explicit past year, do not wrap into next year
    const isOneTimeEvent = ['SPECIAL_RECOGNITION', 'PROJECT_MILESTONE', 'AWARD', 'ACHIEVEMENT', 'BUSINESS_MILESTONE', 'PROMOTION', 'NEW_ROLE', 'CERTIFICATION'].includes(eventType);
    if (isOneTimeEvent && year && year < today.getFullYear()) {
      const pastEventDate = new Date(year, month - 1, day);
      pastEventDate.setHours(0, 0, 0, 0);
      return Math.round((pastEventDate - today) / 86400000);
    }

    // For annual recurring events that passed earlier in the year, calculate next occurrence
    if (thisYear < today) {
      const nextYear = new Date(today.getFullYear() + 1, month - 1, day);
      nextYear.setHours(0, 0, 0, 0);
      return Math.round((nextYear - today) / 86400000);
    }

    return diffDays;
  } catch (e) {
    return null;
  }
}

/**
 * Returns the reminder "urgency" label based on days remaining.
 */
export function getReminderUrgency(daysUntil) {
  if (daysUntil === null || daysUntil === undefined) return 'unknown';
  if (daysUntil === 0) return 'today';
  if (daysUntil === 1) return 'tomorrow';
  if (daysUntil >= -7 && daysUntil <= 7) return 'this_week';
  if (daysUntil > 7 && daysUntil <= 14) return 'next_week';
  if (daysUntil > 14 && daysUntil <= 30) return 'this_month';
  return 'future';
}

// ─── CORE CRUD ────────────────────────────────────────────────────────────────

/**
 * List all CelebrationEvents, optionally filtered.
 */
export async function listCelebrations(filters = {}) {
  const [snap, contactsSnap, accountsSnap, interactionsSnap] = await Promise.all([
    db.collection('celebrationEvents').get(),
    db.collection('contacts').get().catch(() => ({ docs: [] })),
    db.collection('accounts').get().catch(() => ({ docs: [] })),
    db.collection('interactions').get().catch(() => ({ docs: [] })),
  ]);

  let events = snap.docs.map(d => d.data());

  // Lookup maps for contacts and accounts
  const contactMap = new Map();
  for (const doc of contactsSnap.docs) {
    const c = doc.data();
    const cid = c.contactId || c.id || doc.id;
    if (cid) contactMap.set(cid, c);
  }

  const accountMap = new Map();
  for (const doc of accountsSnap.docs) {
    const a = doc.data();
    const aid = a.accountId || a.id || doc.id;
    if (aid) accountMap.set(aid, a);
  }

  // Celebration interactions created when greetings were sent
  const celInteractions = interactionsSnap.docs
    .map(d => d.data())
    .filter(i =>
      i &&
      (i.isCelebration === true ||
        i.isCelebration === 'true' ||
        i.interactionType === 'Customer Celebration')
    )
    .sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0));

  const matchedInteractionIds = new Set();

  // Enrich events with contact/account details and sent greeting content
  events = events.map(e => {
    const contact = e.contactId ? contactMap.get(e.contactId) : null;
    const account = e.accountId ? accountMap.get(e.accountId) : null;

    // Match corresponding sent interaction if one exists
    const matchingInt = celInteractions.find(i => {
      const iid = i.interactionId || i.id;
      if (matchedInteractionIds.has(iid)) return false;
      const sameAccount = !e.accountId || i.accountId === e.accountId;
      const sameContact = !e.contactId || i.contactId === e.contactId;
      const sameType = !i.celebrationEventType || i.celebrationEventType === e.eventType;
      return sameAccount && sameContact && sameType && (e.status === CELEBRATION_STATUS.SENT || Boolean(e.sentAt));
    });

    if (matchingInt) {
      matchedInteractionIds.add(matchingInt.interactionId || matchingInt.id);
    }

    // If a greeting was actually sent (sentAt recorded + sent interaction exists) before being dismissed, surface it as SENT history
    const effectiveStatus =
      e.status === CELEBRATION_STATUS.DISMISSED && (e.sentAt || matchingInt)
        ? CELEBRATION_STATUS.SENT
        : e.status;

    const days = daysUntilNextOccurrence(e.eventDate, e.eventType);
    return {
      ...e,
      status: effectiveStatus,
      contactName: e.contactName || contact?.name || '',
      contactEmail: e.contactEmail || contact?.email || '',
      accountName: e.accountName || account?.companyName || account?.name || '',
      draftSubject: e.draftSubject || matchingInt?.subject || '',
      draftMessage: e.draftMessage || matchingInt?.messageText || '',
      sentDate: matchingInt?.date || (e.sentAt ? String(e.sentAt).slice(0, 10) : null),
      daysUntil: days,
      urgency: getReminderUrgency(days),
    };
  });

  // Also include any sent celebration interactions in PostgreSQL that lack a CelebrationEvents row
  for (const i of celInteractions) {
    const iid = i.interactionId || i.id;
    if (matchedInteractionIds.has(iid)) continue;
    const contact = i.contactId ? contactMap.get(i.contactId) : null;
    const account = i.accountId ? accountMap.get(i.accountId) : null;
    const evDate = i.date || (i.timestamp ? String(i.timestamp).slice(0, 10) : null);
    const evType = i.celebrationEventType || 'SPECIAL_RECOGNITION';
    const days = daysUntilNextOccurrence(evDate, evType);
    events.push({
      id: iid,
      accountId: i.accountId,
      contactId: i.contactId,
      contactName: contact?.name || '',
      contactEmail: contact?.email || '',
      accountName: account?.companyName || account?.name || '',
      eventType: i.celebrationEventType || EVENT_TYPES.SPECIAL_RECOGNITION,
      eventTitle: i.subject || 'Sent Celebration Greeting',
      eventDescription: '',
      eventDate: evDate,
      sourceType: SOURCE_TYPES.CUSTOMERPULSE,
      sourceName: 'CustomerPulse',
      verificationStatus: VERIFICATION_STATUS.VERIFIED,
      status: CELEBRATION_STATUS.SENT,
      sentAt: i.timestamp || i.createdAt || evDate,
      sentDate: i.date || evDate,
      draftSubject: i.subject || '',
      draftMessage: i.messageText || '',
      daysUntil: days,
      urgency: getReminderUrgency(days),
    });
  }

  const { accountId, contactId, eventType, status, verificationStatus, sourceType } = filters;

  if (accountId) events = events.filter(e => e.accountId === accountId);
  if (contactId) events = events.filter(e => e.contactId === contactId);
  if (eventType) events = events.filter(e => e.eventType === eventType);
  if (status) events = events.filter(e => e.status === status);
  if (verificationStatus) events = events.filter(e => e.verificationStatus === verificationStatus);
  if (sourceType) {
    if (sourceType === 'GOOGLE') {
      events = events.filter(e => e.sourceType === 'GOOGLE' || e.sourceType === 'GOOGLE_CONTACTS' || e.sourceType === 'GOOGLE_CALENDAR');
    } else {
      events = events.filter(e => e.sourceType === sourceType);
    }
  }

  // Sort by proximity
  events.sort((a, b) => {
    const da = a.daysUntil ?? 9999;
    const db2 = b.daysUntil ?? 9999;
    return da - db2;
  });

  return events;
}

/**
 * Get a single CelebrationEvent by id.
 */
export async function getCelebration(id) {
  const doc = await db.collection('celebrationEvents').doc(id).get();
  if (!doc.exists) return null;
  const data = doc.data();
  const days = daysUntilNextOccurrence(data.eventDate, data.eventType);
  return {
    ...data,
    daysUntil: days,
    urgency: getReminderUrgency(days),
  };
}

/**
 * Create a new CelebrationEvent (manual entry).
 */
export async function createCelebration(data, user) {
  const {
    accountId, contactId, eventType, eventTitle, eventDescription, eventDate,
    sourceType = SOURCE_TYPES.MANUAL, sourceName, sourceUrl, sourceReference, sourceDate,
    sourceEventId = null, lastSyncStatus = null, syncError = null, lastSyncedAt = null,
    confidence = 'High', verificationStatus = VERIFICATION_STATUS.VERIFIED,
    evidenceSummary = null, matchedEntity = null, verifiedByUid = null, verifiedByName = null
  } = data;

  if (!accountId) throw new Error('accountId is required');
  if (!eventType) throw new Error('eventType is required');
  if (!eventDate) throw new Error('eventDate is required');

  // Duplicate check: match by contactId if present, else by accountId
  const filterQuery = contactId ? { contactId, eventType } : { accountId, eventType };
  const existing = await listCelebrations(filterQuery);
  const isAnnualRecurring = [
    EVENT_TYPES.BIRTHDAY,
    EVENT_TYPES.WORK_ANNIVERSARY,
    EVENT_TYPES.COMPANY_ANNIVERSARY
  ].includes(eventType);

  const getMonthDay = (d) => {
    if (!d) return '';
    const clean = String(d).split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) return `${parts[1]}-${parts[2]}`;
    if (parts.length === 2) return `${parts[0]}-${parts[1]}`;
    return clean;
  };

  const newMonthDay = getMonthDay(eventDate);

  const dup = existing.find(e => {
    if (e.status === CELEBRATION_STATUS.DISMISSED || e.status === CELEBRATION_STATUS.EXPIRED) {
      return false;
    }
    if (e.eventDate === eventDate) return true;
    if (isAnnualRecurring && newMonthDay && getMonthDay(e.eventDate) === newMonthDay) {
      return true;
    }
    return false;
  });

  if (dup) {
    throw new Error(`A ${eventType} event for this contact on ${eventDate} already exists (id: ${dup.id}).`);
  }

  const id = newId('cel');
  const now = new Date().toISOString();

  const event = {
    id,
    accountId,
    contactId,
    eventType,
    eventTitle: eventTitle || '',
    eventDescription: eventDescription || '',
    draftSubject: data.draftSubject || null,
    draftMessage: data.draftMessage || null,
    eventDate,
    sourceType,
    sourceName: sourceName || 'CustomerPulse',
    sourceUrl: sourceUrl || null,
    sourceReference: sourceReference || null,
    sourceDate: sourceDate || getSystemDateString(),
    sourceEventId,
    lastSyncStatus,
    syncError,
    lastSyncedAt,
    confidence,
    evidenceSummary: evidenceSummary || data.evidenceSummary || null,
    matchedEntity: matchedEntity || data.matchedEntity || null,
    verifiedByUid: verifiedByUid || data.verifiedByUid || null,
    verifiedByName: verifiedByName || data.verifiedByName || null,
    verificationStatus,
    status: verificationStatus === VERIFICATION_STATUS.VERIFIED
      ? CELEBRATION_STATUS.VERIFIED
      : CELEBRATION_STATUS.PENDING_VERIFICATION,
    detectedAt: now,
    lastCheckedAt: now,
    reminderDate: null,
    draftedAt: null,
    approvedAt: null,
    scheduledAt: null,
    sentAt: null,
    dismissedAt: null,
    createdBy: user?.uid || 'system',
    updatedBy: user?.uid || 'system',
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('celebrationEvents').doc(id).set(event);

  await logActivity({
    userId: user?.uid,
    userName: user?.name,
    action: 'CELEBRATION_CREATED',
    entityType: 'CelebrationEvent',
    entityId: id,
    details: `Celebration event created: ${eventType} for contact ${contactId}`,
  });

  const createdDays = daysUntilNextOccurrence(eventDate, eventType);
  return { ...event, daysUntil: createdDays, urgency: getReminderUrgency(createdDays) };
}

/**
 * Update a CelebrationEvent.
 */
export async function updateCelebration(id, data, user) {
  const doc = await db.collection('celebrationEvents').doc(id).get();
  if (!doc.exists) throw new Error(`Celebration event ${id} not found`);

  const now = new Date().toISOString();
  const updated = {
    ...doc.data(),
    ...data,
    id,
    updatedBy: user?.uid || 'system',
    updatedAt: now,
  };

  await db.collection('celebrationEvents').doc(id).set(updated);
  const updatedDays = daysUntilNextOccurrence(updated.eventDate, updated.eventType);
  return { ...updated, daysUntil: updatedDays, urgency: getReminderUrgency(updatedDays) };
}

// ─── LIFECYCLE TRANSITIONS ────────────────────────────────────────────────────

export async function verifyCelebration(id, user) {
  return updateCelebration(id, {
    verificationStatus: VERIFICATION_STATUS.VERIFIED,
    status: CELEBRATION_STATUS.VERIFIED,
    verifiedByUid: user?.uid || null,
    verifiedByName: user?.name || user?.email || null,
    lastCheckedAt: new Date().toISOString(),
  }, user);
}

export async function rejectCelebration(id, reason, user) {
  await logActivity({
    userId: user?.uid,
    userName: user?.name,
    action: 'CELEBRATION_REJECTED',
    entityType: 'CelebrationEvent',
    entityId: id,
    details: reason || 'Event rejected by user',
  });
  return updateCelebration(id, {
    verificationStatus: VERIFICATION_STATUS.REJECTED,
    status: CELEBRATION_STATUS.DISMISSED,
    dismissedAt: new Date().toISOString(),
  }, user);
}

export async function dismissCelebration(id, user) {
  await logActivity({
    userId: user?.uid,
    userName: user?.name,
    action: 'CELEBRATION_DISMISSED',
    entityType: 'CelebrationEvent',
    entityId: id,
    details: 'Celebration dismissed by user',
  });
  return updateCelebration(id, {
    status: CELEBRATION_STATUS.DISMISSED,
    dismissedAt: new Date().toISOString(),
  }, user);
}

export async function markDrafted(id, user) {
  return updateCelebration(id, {
    status: CELEBRATION_STATUS.DRAFTED,
    draftedAt: new Date().toISOString(),
  }, user);
}

// ─── UPCOMING DETECTION ───────────────────────────────────────────────────────

/**
 * Scans existing CustomerPulse contacts for upcoming birthday/work-anniversary events
 * and auto-creates CelebrationEvents that don't already exist.
 *
 * Source = CUSTOMERPULSE, verification = AUTO_VERIFIED.
 * Only creates events for contacts with eventDate data populated.
 */
export async function detectFromContacts(accountId) {
  // Sync upcoming public celebrations & festivals for accounts
  try {
    await syncFestivalOccasionsForAccounts({ accountId, lookaheadDays: 90 });
  } catch (festErr) {
    console.warn('[CelebrationService] Festival sync warning:', festErr.message);
  }

  // 1. Fetch Accounts
  let accountsQuery = db.collection('accounts');
  if (accountId) {
    accountsQuery = accountsQuery.where('accountId', '==', accountId);
  }
  const accountsSnap = await accountsQuery.get();
  const accounts = accountsSnap.docs.map(d => d.data());

  const created = [];

  // 2. Prepare Adapters
  const adapters = [];
  if ((process.env.MICROSOFT_CELEBRATION_SOURCE_ENABLED || 'false') === 'true') {
    adapters.push(new MicrosoftCelebrationAdapter());
  }
  if ((process.env.GOOGLE_CELEBRATION_SOURCE_ENABLED || 'false') === 'true') {
    adapters.push(new GoogleCelebrationAdapter());
  }

  for (const account of accounts) {
    const aId = account.accountId || account.id;

    // Determine account owner
    const owner = {
      uid: account.ownerId || null,
      email: account.ownerEmail || null,
      name: account.ownerName || null
    };

    // 3. Fetch contacts belonging only to this account
    const contactsSnap = await db.collection('contacts').where('accountId', '==', aId).get();
    const contacts = contactsSnap.docs.map(d => d.data());

    for (const contact of contacts) {
      const cId = contact.contactId || contact.id;
      if (!cId) continue;

      // Process CustomerPulse native fields
      const bd = contact.birthday || contact.dateOfBirth || contact.dob;
      if (bd) {
        try {
          await createCelebration({
            accountId: aId,
            contactId: cId,
            eventType: EVENT_TYPES.BIRTHDAY,
            eventTitle: `${contact.name || 'Contact'}'s Birthday`,
            eventDate: bd,
            sourceType: SOURCE_TYPES.CUSTOMERPULSE,
            sourceName: 'CustomerPulse Contact',
            confidence: 'High',
            matchConfidence: 100,
            verificationStatus: VERIFICATION_STATUS.AUTO_VERIFIED,
          }, { uid: 'system', name: 'System Detector' });
          created.push({ contactId: cId, eventType: EVENT_TYPES.BIRTHDAY, source: 'CUSTOMERPULSE' });
        } catch (e) { }
      }

      const wa = contact.workAnniversary || contact.joinDate || contact.startDate;
      if (wa) {
        try {
          await createCelebration({
            accountId: aId,
            contactId: cId,
            eventType: EVENT_TYPES.WORK_ANNIVERSARY,
            eventTitle: `${contact.name || 'Contact'}'s Work Anniversary`,
            eventDate: wa,
            sourceType: SOURCE_TYPES.CUSTOMERPULSE,
            sourceName: 'CustomerPulse Contact',
            confidence: 'High',
            matchConfidence: 100,
            verificationStatus: VERIFICATION_STATUS.AUTO_VERIFIED,
          }, { uid: 'system', name: 'System Detector' });
          created.push({ contactId: cId, eventType: EVENT_TYPES.WORK_ANNIVERSARY, source: 'CUSTOMERPULSE' });
        } catch (e) { }
      }

      // 4. Enrich existing contact via external adapters
      for (const adapter of adapters) {
        if (typeof adapter.enrichContact !== 'function') continue;
        try {
          // Adapters only return celebration info, they do not create DB contacts
          const enrichmentEvents = await adapter.enrichContact({ contact, account, owner });

          for (const ev of enrichmentEvents) {
            try {
              await createCelebration({
                accountId: aId,
                contactId: cId, // Guaranteed to link to existing contact
                eventType: ev.eventType,
                eventTitle: ev.eventTitle,
                eventDate: ev.eventDate,
                sourceType: ev.sourceType || adapter.sourceType,
                sourceName: ev.sourceName || adapter.sourceName,
                sourceEventId: ev.sourceEventId || null,
                sourceUrl: ev.sourceUrl || null,
                confidence: ev.confidence || 'High',
                matchConfidence: ev.matchConfidence || 100,
                verificationStatus: VERIFICATION_STATUS.PENDING_VERIFICATION, // Always require review for external
                lastSyncStatus: 'SUCCESS',
                lastSyncedAt: new Date().toISOString(),
              }, { uid: 'system', name: 'System Auto-Sync' });

              created.push({ contactId: cId, eventType: ev.eventType, source: ev.sourceType || adapter.sourceType });
            } catch (e) { }
          }
        } catch (err) {
          console.error(`[CelebrationService] Adapter ${adapter.sourceType} error for contact ${cId}:`, err.message);
        }
      }
    }
  }

  // 5. Run global external source upcoming celebration scans
  for (const adapter of adapters) {
    if (typeof adapter.getUpcomingCelebrations === 'function') {
      try {
        const extEvents = await adapter.getUpcomingCelebrations();
        for (const ev of (extEvents || [])) {
          created.push(ev);
        }
      } catch (err) {
        console.error(`[CelebrationService] Global scan error for adapter ${adapter.sourceType}:`, err.message);
      }
    }
  }

  // GENERATE REMINDER NOTIFICATIONS FOR TODAY/TOMORROW
  const upcoming = await listCelebrations(accountId ? { accountId } : {});
  const now = new Date().toISOString();

  for (const cel of upcoming) {
    if (cel.status === CELEBRATION_STATUS.SENT || cel.status === CELEBRATION_STATUS.DISMISSED) continue;

    if (cel.daysUntil === 0 || cel.daysUntil === 1) {
      const urgencyStr = cel.daysUntil === 0 ? 'Today' : 'Tomorrow';
      const notifId = `notif_cel_${cel.id}_${cel.daysUntil}`;

      // Fetch contact name & account owner for notification
      let contactName = 'a contact';
      let accountOwnerId = 'system';
      try {
        const cDoc = await db.collection('contacts').doc(cel.contactId).get();
        if (cDoc.exists) contactName = cDoc.data().name;

        const aDoc = await db.collection('accounts').doc(cel.accountId).get();
        if (aDoc.exists) accountOwnerId = aDoc.data().ownerId || 'system';
      } catch (e) { }

      const notifMsg = `Reminder: ${contactName} has a ${cel.eventType.replace(/_/g, ' ').toLowerCase()} ${urgencyStr.toLowerCase()}!`;

      // Upsert notification routed directly to account owner
      await db.collection('notifications').doc(notifId).set({
        notificationId: notifId,
        type: 'Celebration Reminder',
        message: notifMsg,
        accountId: cel.accountId,
        contactId: cel.contactId,
        userId: accountOwnerId, // Route specifically to Account Owner
        read: false,
        timestamp: now,
        createdAt: now
      }, { merge: true });
    }
  }

  return created;
}

// ─── AI GREETING DRAFT ────────────────────────────────────────────────────────

/**
 * Generates a professional congratulatory email draft using the existing AI service.
 * Only uses verified / provided context. Never invents facts.
 */
export async function generateGreetingDraft(celebrationId, contextOverrides = {}) {
  const event = await getCelebration(celebrationId);
  if (!event) throw new Error('Celebration event not found');

  // Fetch contact & account context
  let contactName = contextOverrides.contactName || '';
  let companyName = contextOverrides.companyName || '';
  let designation = contextOverrides.designation || '';

  if (!contactName && event.contactId) {
    try {
      const cDoc = await db.collection('contacts').doc(event.contactId).get();
      if (cDoc.exists) {
        const c = cDoc.data();
        contactName = c.name || '';
        designation = c.designation || c.title || c.position || '';
      }
    } catch (_) { }
  }

  if (!companyName && event.accountId) {
    try {
      const aDoc = await db.collection('accounts').doc(event.accountId).get();
      if (aDoc.exists) companyName = aDoc.data().companyName || '';
    } catch (_) { }
  }

  const icon = EVENT_ICONS[event.eventType] || '✨';
  const eventLabel = event.eventType.replace(/_/g, ' ').toLowerCase()
    .replace(/\b\w/g, l => l.toUpperCase());

  // Build a grounding context for AI — only verified / provided facts
  const groundingContext = [
    contactName ? `Contact name: ${contactName}` : null,
    designation ? `Designation: ${designation}` : null,
    companyName ? `Company: ${companyName}` : null,
    `Event type: ${eventLabel}`,
    event.eventTitle ? `Event title: ${event.eventTitle}` : null,
    event.eventDescription ? `Additional context: ${event.eventDescription}` : null,
    event.eventDate ? `Event date: ${event.eventDate}` : null,
  ].filter(Boolean).join('\n');

  // Try Gemini AI if available
  let subject = `${icon} ${eventLabel} — Best Wishes from NeST Digital!`;
  let message = buildFallbackMessage(contactName, companyName, eventLabel, event.eventTitle);

  try {
    // Dynamic import to avoid circular dep
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey.trim() !== '' && apiKey !== 'your_gemini_api_key_here') {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

      const prompt = `
You are a professional CRM assistant for NeST Digital, a technology services company.
Generate a warm, professional congratulatory email for a customer celebration.

RULES:
- Keep the tone warm, professional, and genuine.
- Do NOT invent any facts, awards, projects, or achievements not listed below.
- If information is uncertain or missing, use a generic but sincere message.
- Keep the message to 3-5 short sentences total.
- Do NOT use placeholders like [Name] or [Company]. Use the actual values provided.
- Do NOT use excessive exclamation marks — keep it professional.
- CRITICAL: Format the email properly with line breaks (\\n\\n) between the salutation, the body, and the sign-off! Do NOT put everything in one massive paragraph.

CONTEXT (only use verified facts listed here):
${groundingContext}

Sender signature:
Best regards,
NeST Digital Team

Respond ONLY with a valid JSON object (no markdown). Schema:
{
  "subject": "Email subject line",
  "message": "Properly formatted email body with \\n\\n for paragraphs"
}
      `;

      const result = await model.generateContent(prompt);
      let responseText = result.response.text().trim();
      if (responseText.startsWith('\`\`\`')) {
        responseText = responseText.replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\`\`\`$/, '').trim();
      }
      const parsed = JSON.parse(responseText);

      // Ensure any literal "\n" strings from the JSON are treated as actual newlines
      let parsedMessage = parsed.message || message;
      if (typeof parsedMessage === 'string') {
        parsedMessage = parsedMessage.replace(/\\n/g, '\n');
      }

      subject = parsed.subject || subject;
      message = parsedMessage;
    }
  } catch (e) {
    console.warn('[CelebrationService] AI draft generation failed, using fallback:', e.message);
  }

  // Mark as drafted
  await markDrafted(celebrationId, { uid: 'system', name: 'AI Generator' });

  return {
    subject,
    message,
    recipientName: contactName,
    companyName,
    eventType: event.eventType,
    celebrationId,
  };
}

function buildFallbackMessage(contactName, companyName, eventLabel, eventTitle) {
  const greeting = contactName ? `Hello ${contactName},` : 'Dear Valued Partner,';
  const companyLine = companyName ? ` and the ${companyName} team` : '';

  if (eventTitle) {
    return `${greeting}\n\nCongratulations on this wonderful occasion — ${eventTitle}!\n\nWe truly value our partnership with you${companyLine} and extend our warmest wishes on this special milestone. We look forward to many more successful years together.\n\nWarm regards,\nNeST Digital Team`;
  }

  return `${greeting}\n\nWishing you a heartfelt congratulations on your ${eventLabel}!\n\nWe deeply appreciate our relationship with you${companyLine} and hope this occasion brings you great joy and continued success.\n\nWarm regards,\nNeST Digital Team`;
}

// ─── SEND (reuses EmailQueue) ─────────────────────────────────────────────────

/**
 * Marks a celebration as SENT without queuing an email (e.g., when sent via mailto/Outlook).
 */
export async function markCelebrationSentExternal(celebrationId, { recipientEmail, subject, message }, user) {
  const event = await getCelebration(celebrationId);
  if (!event) throw new Error('Celebration event not found');

  if (event.status === CELEBRATION_STATUS.SENT) {
    throw new Error('This greeting has already been marked as sent.');
  }

  let contactName = '';
  try {
    const cDoc = await db.collection('contacts').doc(event.contactId).get();
    if (cDoc.exists) contactName = cDoc.data().name || '';
  } catch (_) { }

  const now = new Date().toISOString();

  // Log audit
  await logActivity({
    userId: user?.uid,
    userName: user?.name,
    action: 'CELEBRATION_GREETING_SENT_EXTERNAL',
    entityType: 'CelebrationEvent',
    entityId: celebrationId,
    details: `Greeting sent via external client to ${recipientEmail}.`,
  });

  // Create Interaction record
  await _createCelebrationInteraction(event, { subject, message, contactName }, user);

  // Update status to SENT
  await updateCelebration(celebrationId, { status: CELEBRATION_STATUS.SENT, sentAt: now }, user);

  return { success: true, status: CELEBRATION_STATUS.SENT };
}

/**
 * Queues a celebration greeting via the existing EmailQueue.
 * Also creates an Interaction record on the account timeline.
 * Prevents duplicate sends for the same celebration event.
 */
export async function sendCelebrationGreeting(celebrationId, { recipientEmail, subject, message, scheduledFor }, user) {
  const event = await getCelebration(celebrationId);
  if (!event) throw new Error('Celebration event not found');

  // Duplicate send guard
  if (event.status === CELEBRATION_STATUS.SENT) {
    throw new Error('A greeting has already been sent for this celebration event.');
  }
  if (event.status === CELEBRATION_STATUS.SCHEDULED) {
    throw new Error('A greeting is already scheduled for this celebration event.');
  }

  if (!recipientEmail) throw new Error('recipientEmail is required');
  if (!subject) throw new Error('subject is required');
  if (!message) throw new Error('message is required');

  // Fetch contact name for queue
  let contactName = '';
  try {
    const cDoc = await db.collection('contacts').doc(event.contactId).get();
    if (cDoc.exists) contactName = cDoc.data().name || '';
  } catch (_) { }

  const queueId = `celgreet_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const queueItem = {
    queueId,
    recipientEmail,
    recipientName: contactName || 'Valued Partner',
    eventType: event.eventType.toLowerCase(),
    subject,
    bodyVars: {
      EmployeeName: contactName || 'Valued Partner',
      GreetingTitle: subject,
      GreetingMessage: message,
    },
    status: scheduledFor ? 'scheduled_marker' : 'queued',
    scheduledFor: scheduledFor || null,
    createdAt: now,
    sentByUid: user?.uid || 'system',
    sentByName: user?.name || 'System',
    // Extra metadata for celebration tracking
    celebrationId,
    accountId: event.accountId,
    contactId: event.contactId,
  };

  await db.collection('emailqueue').doc(queueId).set(queueItem);

  // Update celebration status
  const newStatus = scheduledFor ? CELEBRATION_STATUS.SCHEDULED : CELEBRATION_STATUS.APPROVED;
  await updateCelebration(celebrationId, {
    status: newStatus,
    approvedAt: now,
    scheduledAt: scheduledFor ? now : null,
  }, user);

  // Log audit
  await logActivity({
    userId: user?.uid,
    userName: user?.name,
    action: scheduledFor ? 'CELEBRATION_SCHEDULED' : 'CELEBRATION_GREETING_SENT',
    entityType: 'CelebrationEvent',
    entityId: celebrationId,
    details: `Greeting queued (${queueId}) for ${recipientEmail}. Scheduled: ${scheduledFor || 'immediate'}`,
  });

  // If immediate (not scheduled), create Interaction record now
  if (!scheduledFor) {
    await _createCelebrationInteraction(event, { subject, message, contactName }, user);
    await updateCelebration(celebrationId, { status: CELEBRATION_STATUS.SENT, sentAt: now }, user);
  }

  return { success: true, queueId, status: newStatus };
}

/**
 * Creates an Interaction record after a successful send.
 * This appears in Account Overview, Interaction Timeline, Customer Journey, etc.
 */
async function _createCelebrationInteraction(event, { subject, message, contactName }, user) {
  try {
    const interactionId = `int_cel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const interaction = {
      interactionId,
      accountId: event.accountId,
      contactId: event.contactId,
      source: 'Email',
      interactionType: 'Customer Celebration',
      subject: subject || 'Customer Celebration Greeting',
      messageText: message || 'Celebration greeting sent.',
      date: getSystemDateString(),
      time: getSystemTimeString(),
      loggedByUid: user?.uid || 'system',
      loggedByName: user?.name || 'System',
      isManual: false,
      isCelebration: true,
      celebrationEventType: event.eventType,
      actionMentions: [],
      attachments: [],
      timestamp: now,
      createdAt: now,
    };

    await db.collection('interactions').doc(interactionId).set(interaction);
  } catch (e) {
    console.error('[CelebrationService] Failed to create interaction record:', e.message);
    // Non-fatal — greeting was still sent
  }
}

// ─── UPCOMING SUMMARY ─────────────────────────────────────────────────────────

/**
 * Returns a summary object for the celebrations dashboard.
 */
export async function getCelebrationSummary(filters = {}) {
  const all = await listCelebrations(filters);
  const active = all.filter(e =>
    e.status !== CELEBRATION_STATUS.DISMISSED &&
    e.status !== CELEBRATION_STATUS.EXPIRED &&
    e.status !== CELEBRATION_STATUS.REJECTED
  );
  const actionable = active.filter(e => e.status !== CELEBRATION_STATUS.SENT);

  // Greeting impact: accurately reflects all sent celebration greetings and replies in database
  const sentEvents = all.filter(e => e.status === CELEBRATION_STATUS.SENT);
  const totalSentCount = sentEvents.length;

  let repliesReceived = 0;
  if (filters.accountId) {
    try {
      const intsSnap = await db.collection('interactions').get();
      repliesReceived = intsSnap.docs
        .map(d => d.data())
        .filter(i => {
          if (i.accountId !== filters.accountId) return false;
          const dir = String(i.direction || '').toLowerCase();
          if (dir !== 'inbound') return false;
          const subj = String(i.subject || '').toLowerCase();
          return (
            (subj.includes('re:') || subj.includes('reply') || subj.includes('thank')) &&
            (subj.includes('birthday') || subj.includes('anniversary') || subj.includes('congratulations') || subj.includes('wishes') || subj.includes('greeting'))
          );
        }).length;
    } catch (_) {
      repliesReceived = 0;
    }
  }

  const healthPointsEarned = repliesReceived * 8 + Math.max(0, totalSentCount - repliesReceived) * 1;

  return {
    today: actionable.filter(e => e.daysUntil === 0).length,
    tomorrow: actionable.filter(e => e.daysUntil === 1).length,
    thisWeek: active.filter(e => e.daysUntil !== null && e.daysUntil >= -7 && e.daysUntil <= 7).length,
    nextWeek: active.filter(e => e.daysUntil !== null && e.daysUntil > 7 && e.daysUntil <= 14).length,
    needsVerification: actionable.filter(e => e.verificationStatus === VERIFICATION_STATUS.PENDING_REVIEW || e.status === CELEBRATION_STATUS.PENDING_VERIFICATION).length,
    pendingReview: actionable.filter(e => e.status === CELEBRATION_STATUS.PENDING_VERIFICATION).length,
    draftsWaiting: active.filter(e => e.status === CELEBRATION_STATUS.DRAFTED).length,
    scheduled: active.filter(e => e.status === CELEBRATION_STATUS.SCHEDULED).length,
    sent: sentEvents.length,
    total: active.length,
    impact: {
      greetingsSent: totalSentCount,
      repliesReceived,
      healthPointsEarned,
    },
  };
}

// ─── EXTERNAL SOURCE ADAPTER INTERFACE ───────────────────────────────────────
//
// Architecture prepared for future external source integrations.
// Only activate when valid credentials/API permissions are configured.
// Each adapter must implement:
//   getUpcomingCelebrations()
//   getContactCelebrations(contactId)
//   getCompanyMilestones(accountId)
//   getLastChecked()
//   validateSourceData(data)
//
// Environment variables to enable sources (all disabled by default):
//   MICROSOFT_CELEBRATION_SOURCE_ENABLED=false
//   GOOGLE_CELEBRATION_SOURCE_ENABLED=false
//   LINKEDIN_CELEBRATION_SOURCE_ENABLED=false   -- Only via official API, no scraping
//
// ─────────────────────────────────────────────────────────────────────────────

export class CelebrationSourceAdapter {
  constructor(sourceType, sourceName) {
    this.sourceType = sourceType;
    this.sourceName = sourceName;
    this.enabled = false;
  }
  async enrichContact({ contact, account, owner }) { return []; }
  async getUpcomingCelebrations() { return []; }
  async getContactCelebrations(_contactId) { return []; }
  async getCompanyMilestones(_accountId) { return []; }
  getLastChecked() { return null; }
  validateSourceData(_data) { return false; }
}

// CustomerPulse internal adapter (always enabled)
export class CustomerPulseSourceAdapter extends CelebrationSourceAdapter {
  constructor() {
    super(SOURCE_TYPES.CUSTOMERPULSE, 'CustomerPulse');
    this.enabled = true;
  }
  async getUpcomingCelebrations() {
    return listCelebrations({ sourceType: SOURCE_TYPES.CUSTOMERPULSE });
  }
  async getContactCelebrations(contactId) {
    return listCelebrations({ contactId, sourceType: SOURCE_TYPES.CUSTOMERPULSE });
  }
  async getCompanyMilestones(accountId) {
    return listCelebrations({ accountId, sourceType: SOURCE_TYPES.CUSTOMERPULSE });
  }
}

// Microsoft Graph adapter (disabled until MS_CELEBRATION_SOURCE_ENABLED=true)
export class MicrosoftCelebrationAdapter extends CelebrationSourceAdapter {
  constructor() {
    super(SOURCE_TYPES.MICROSOFT, 'Microsoft 365');
    this.enabled = (process.env.MICROSOFT_CELEBRATION_SOURCE_ENABLED || 'false') === 'true';
    this.contactsCache = new Map();
    this.authDisabled = false;
  }

  async enrichContact({ contact, account, owner }) {
    if (!this.enabled || this.authDisabled) return [];

    const ownerEmail = owner && owner.email;
    if (!ownerEmail) {
      return [];
    }

    const enrichmentEvents = [];
    try {
      let msContacts = this.contactsCache.get(ownerEmail);
      if (!msContacts) {
        msContacts = await fetchMicrosoftContacts(ownerEmail);
        this.contactsCache.set(ownerEmail, msContacts || []);
      }

      for (const mc of msContacts) {
        if (!mc.birthday) continue;

        let bdayStr = mc.birthday;
        if (bdayStr.includes('T')) {
          bdayStr = bdayStr.split('T')[0];
        }

        const sourceEventId = mc.id;
        let isMatch = false;

        // 6. Matching priority: exact normalized email match first
        if (mc.emailAddresses && mc.emailAddresses.length > 0) {
          for (const emailObj of mc.emailAddresses) {
            const email = (emailObj.address || emailObj).toLowerCase();
            if (contact.email && contact.email.toLowerCase() === email) {
              isMatch = true;
              break;
            }
          }
        }

        // if no email match, do not create a Microsoft-derived celebration from name alone unless the existing implementation already explicitly supports that fallback.
        // Existing implementation did support name fallback, so preserving it.
        if (!isMatch && mc.displayName && contact.name) {
          if (mc.displayName.toLowerCase() === contact.name.toLowerCase()) {
            isMatch = true;
          }
        }

        if (isMatch) {
          enrichmentEvents.push({
            eventType: EVENT_TYPES.BIRTHDAY,
            eventTitle: `${contact.name}'s Birthday`,
            eventDate: bdayStr,
            sourceEventId: sourceEventId,
            confidence: 'High',
            matchConfidence: 70
          });
        }
      }
    } catch (err) {
      if (err.message && (err.message.includes('AADSTS7000112') || err.message.includes('unauthorized_client'))) {
        this.authDisabled = true;
        console.warn(`[MicrosoftCelebrationAdapter] Azure AD Application (${process.env.MICROSOFT_CLIENT_ID || 'CustomerPulse'}) is disabled or unauthorized in Azure tenant. Disabling Microsoft celebration sync for this run.`);
      } else {
        console.error(`[MicrosoftCelebrationAdapter] Failed to sync Microsoft contacts for owner ${ownerEmail}:`, err.message);
      }
    }
    return enrichmentEvents;
  }
}

export function mapGoogleCalendarEventToType(summary, eventObj = null) {
  if (!summary) return null;
  const s = summary.toLowerCase().trim();

  // 1. Exclude private / confidential events
  if (eventObj) {
    if (eventObj.visibility === 'private' || eventObj.visibility === 'confidential') {
      return null;
    }
  }

  // 2. Strict Calendar Filtering: Exclude personal appointments, medical, travel, and routine meetings
  const isPersonalOrRoutine = (
    s.match(/\b(doctor|dentist|dental|clinic|hospital|physician|therapy|prescription|health|medical|optometrist|surgery)\b/) ||
    s.match(/\b(flight|airport|boarding|hotel|airbnb|vacation|trip|travel|train|uber|taxi)\b/) ||
    s.match(/\b(pto|ooo|out\s+of\s+office|on\s+leave|annual\s+leave|sick\s+leave|day\s+off|holiday\s+leave)\b/) ||
    s.match(/\b(personal|private|errand|gym|workout|haircut|dry\s*cleaning|bank|groceries)\b/) ||
    s.match(/\b(standup|stand-up|daily\s+sync|sprint\s+planning|sprint\s+review|backlog|retro|retrospective)\b/) ||
    s.match(/\b(1:1|1-on-1|one\s+on\s+one|catch-up|catchup|sync-up|team\s+meeting|weekly\s+sync|status\s+call)\b/) ||
    s.match(/\b(interview|screening|onboarding|code\s+review|tech\s+sync|architecture\s+review|design\s+review)\b/) ||
    s.match(/\b(lunch|dinner|breakfast|coffee\s+chat|drinks)\b(?!\s+(?:celebration|milestone|anniversary|award))/i)
  );

  // Exclude operational / planning meetings about occasions (e.g. "Team Birthday Planning Meeting")
  const isMeetingAboutOccasion = (
    s.match(/\b(planning|prep|agenda|discussion|review|sync|committee|budget)\b/) &&
    s.match(/\b(meeting|call|session|sync)\b/)
  );
  if (isMeetingAboutOccasion) {
    return null;
  }

  const hasExplicitOccasion = (
    s.match(/\b(birthday|bday)\b/) ||
    s.match(/\b(work\s+anniversary|employment\s+anniversary|service\s+anniversary)\b/) ||
    s.match(/\b(company\s+anniversary|founding\s+anniversary|corporate\s+anniversary)\b/) ||
    s.match(/\b(promotion|promoted|new\s+role)\b/) ||
    s.match(/\b(award|awarded|hall\s+of\s+fame|excellence\s+award)\b/) ||
    s.match(/\b(certification|certified)\b/) ||
    s.match(/\b(business\s+milestone|project\s+milestone|partnership\s+milestone)\b/)
  );

  if (isPersonalOrRoutine && !hasExplicitOccasion) {
    return null;
  }

  // 3. Classify genuine customer occasions
  if (s.match(/\b(birthday|bday)\b/)) return EVENT_TYPES.BIRTHDAY;
  if (s.match(/\b(work\s+anniversary|employment\s+anniversary|service\s+anniversary|\d+\s*(?:st|nd|rd|th)?\s+year\s+anniversary)\b/)) return EVENT_TYPES.WORK_ANNIVERSARY;
  if (s.match(/\b(company\s+anniversary|founding\s+anniversary|corporate\s+anniversary)\b/)) return EVENT_TYPES.COMPANY_ANNIVERSARY;
  if (s.match(/\b(promotion|promoted|appointed\s+as\s+vp|promoted\s+to|new\s+role)\b/)) return EVENT_TYPES.PROMOTION;
  if (s.match(/\b(award|awarded|honored|recognition|excellence\s+award|achievement)\b/)) return EVENT_TYPES.AWARD;
  if (s.match(/\b(certification|certified|passed\s+exam)\b/)) return EVENT_TYPES.CERTIFICATION;
  if (s.match(/\b(business\s+milestone|project\s+milestone|partnership\s+milestone|product\s+launch|go-live|golive)\b/)) return EVENT_TYPES.BUSINESS_MILESTONE;

  return null;
}

// Google Contacts & Calendar adapter
export class GoogleCelebrationAdapter extends CelebrationSourceAdapter {
  constructor() {
    super(SOURCE_TYPES.GOOGLE_CONTACTS, 'Google Contacts');
    this.enabled = (process.env.GOOGLE_CELEBRATION_SOURCE_ENABLED || 'false') === 'true';
    this.contactsCache = new Map();
    this.activeUserIdsPromise = null;
  }

  async getActiveUserIds() {
    if (!this.activeUserIdsPromise) {
      this.activeUserIdsPromise = getAllActiveGoogleIntegrations()
        .then(list => new Set((list || []).map(i => i.userId).filter(Boolean)))
        .catch(() => null);
    }
    return this.activeUserIdsPromise;
  }

  async enrichContact({ contact, account, owner }) {
    if (!this.enabled || !owner || !owner.uid) return [];

    const activeUserIds = await this.getActiveUserIds();
    if (activeUserIds && !activeUserIds.has(owner.uid)) {
      return [];
    }

    const events = [];
    const targetEmail = (contact.email || '').trim().toLowerCase();
    if (!targetEmail) return [];

    try {
      // 1. Google Contacts (People API)
      let googleContacts = this.contactsCache.get(`contacts:${owner.uid}`);
      if (googleContacts === undefined) {
        googleContacts = await fetchGoogleContacts(owner.uid);
        this.contactsCache.set(`contacts:${owner.uid}`, googleContacts || []);
      }

      for (const gc of (googleContacts || [])) {
        if (!gc.birthdays || gc.birthdays.length === 0) continue;

        const emails = gc.emailAddresses
          ? gc.emailAddresses.map(e => (e.value || '').trim().toLowerCase()).filter(Boolean)
          : [];

        if (emails.includes(targetEmail)) {
          const bdayObj = gc.birthdays[0].date;
          if (!bdayObj || !bdayObj.month || !bdayObj.day) continue;

          const bdayStr = bdayObj.year
            ? `${bdayObj.year}-${String(bdayObj.month).padStart(2, '0')}-${String(bdayObj.day).padStart(2, '0')}`
            : `${String(bdayObj.month).padStart(2, '0')}-${String(bdayObj.day).padStart(2, '0')}`;

          events.push({
            eventType: EVENT_TYPES.BIRTHDAY,
            eventTitle: `${contact.name || 'Contact'}'s Birthday`,
            eventDate: bdayStr,
            sourceType: SOURCE_TYPES.GOOGLE_CONTACTS,
            sourceName: 'Google Contacts',
            sourceEventId: gc.resourceName,
            confidence: 'High',
            matchConfidence: 100,
            verificationStatus: VERIFICATION_STATUS.PENDING_VERIFICATION,
          });
        }
      }

      // 2. Google Calendar (Calendar API - 90-day window)
      let calendarEvents = this.contactsCache.get(`calendar:${owner.uid}`);
      if (calendarEvents === undefined) {
        calendarEvents = await fetchGoogleCalendarEvents(owner.uid, 90);
        this.contactsCache.set(`calendar:${owner.uid}`, calendarEvents || []);
      }

      for (const ev of (calendarEvents || [])) {
        const evType = mapGoogleCalendarEventToType(ev.summary, ev);
        if (!evType) continue; // Ignore unrelated calendar events

        const attendees = (ev.attendees || []).map(a => (a.email || '').trim().toLowerCase()).filter(Boolean);
        const summaryLower = (ev.summary || '').toLowerCase();
        const descLower = (ev.description || '').toLowerCase();
        const contactNameLower = (contact.name || '').trim().toLowerCase();
        const isAttendee = attendees.includes(targetEmail);
        const mentionsEmail = summaryLower.includes(targetEmail) || descLower.includes(targetEmail);
        const mentionsName = contactNameLower && contactNameLower.length > 3 && (summaryLower.includes(contactNameLower) || descLower.includes(contactNameLower));

        if (!isAttendee && !mentionsEmail && !mentionsName) continue;

        const eventDate = ev.start?.dateTime ? ev.start.dateTime.split('T')[0] : ev.start?.date;
        if (!eventDate) continue;

        events.push({
          eventType: evType,
          eventTitle: ev.summary,
          eventDescription: ev.description || '',
          eventDate,
          sourceType: SOURCE_TYPES.GOOGLE_CALENDAR,
          sourceName: 'Google Calendar',
          sourceEventId: `google:${owner.uid}:primary:${ev.id}`,
          sourceUrl: ev.htmlLink || '',
          confidence: 'High',
          matchConfidence: 100,
          verificationStatus: VERIFICATION_STATUS.PENDING_VERIFICATION,
        });
      }
    } catch (err) {
      if (err.message && err.message.includes('no active Google integration')) {
        this.contactsCache.set(`contacts:${owner.uid}`, []);
        this.contactsCache.set(`calendar:${owner.uid}`, []);
      } else {
        console.error(`[GoogleCelebrationAdapter] Failed to enrich contact for user ${owner.uid}:`, err.message);
      }
    }
    return events;
  }

  async getUpcomingCelebrations() {
    if (!this.enabled) return [];
    const createdEvents = [];
    try {
      const integrations = await getAllActiveGoogleIntegrations();
      if (!integrations || integrations.length === 0) return [];

      // Build in-memory normalized email lookup map from CustomerPulse CRM contacts
      const allContactsSnap = await db.collection('contacts').get();
      const crmContactsByEmail = new Map();
      allContactsSnap.docs.forEach(doc => {
        const c = doc.data();
        if (c.email) {
          crmContactsByEmail.set(c.email.trim().toLowerCase(), c);
        }
      });

      for (const integration of integrations) {
        const uid = integration.userId;

        // 1. Google Contacts (People API)
        try {
          const googleContacts = await fetchGoogleContacts(uid);

          for (const gc of (googleContacts || [])) {
            if (!gc.birthdays || gc.birthdays.length === 0) continue;

            const bdayObj = gc.birthdays[0].date;
            if (!bdayObj || !bdayObj.month || !bdayObj.day) continue;

            const bdayStr = bdayObj.year
              ? `${bdayObj.year}-${String(bdayObj.month).padStart(2, '0')}-${String(bdayObj.day).padStart(2, '0')}`
              : `${String(bdayObj.month).padStart(2, '0')}-${String(bdayObj.day).padStart(2, '0')}`;

            const sourceEventId = gc.resourceName;
            const emails = (gc.emailAddresses || []).map(e => (e.value || '').trim().toLowerCase()).filter(Boolean);
            if (emails.length === 0) continue;

            // Match ONLY existing CustomerPulse CRM contacts using normalized email addresses
            let cpContact = null;
            for (const email of emails) {
              const matched = crmContactsByEmail.get(email);
              if (matched) {
                cpContact = matched;
                break;
              }
            }

            // If no match in CustomerPulse CRM contacts, NEVER create contact or celebration
            if (cpContact) {
              try {
                await createCelebration({
                  accountId: cpContact.accountId || cpContact.account_id,
                  contactId: cpContact.contactId || cpContact.id,
                  eventType: EVENT_TYPES.BIRTHDAY,
                  eventTitle: `${cpContact.name || 'Contact'}'s Birthday`,
                  eventDate: bdayStr,
                  sourceType: SOURCE_TYPES.GOOGLE_CONTACTS,
                  sourceName: 'Google Contacts',
                  sourceEventId: sourceEventId,
                  lastSyncStatus: 'SUCCESS',
                  lastSyncedAt: new Date().toISOString(),
                  confidence: 'High',
                  verificationStatus: VERIFICATION_STATUS.PENDING_VERIFICATION,
                }, { uid: 'system', name: 'System Auto-Sync' });

                createdEvents.push({
                  contactId: cpContact.contactId || cpContact.id,
                  eventType: EVENT_TYPES.BIRTHDAY,
                  source: SOURCE_TYPES.GOOGLE_CONTACTS
                });
              } catch (e) {
                // duplicate prevented or skipped
              }
            }
          }
        } catch (err) {
          console.error(`[GoogleCelebrationAdapter] Failed to sync contacts for user ${uid}:`, err.message);
        }

        // 2. Google Calendar (Calendar API - 90-day window)
        try {
          const calendarEvents = await fetchGoogleCalendarEvents(uid, 90);
          for (const ev of (calendarEvents || [])) {
            const eventType = mapGoogleCalendarEventToType(ev.summary, ev);
            if (!eventType) continue; // Ignore non-milestone/personal events

            const eventDate = ev.start?.dateTime ? ev.start.dateTime.split('T')[0] : ev.start?.date;
            if (!eventDate) continue;

            const sourceEventId = `google:${uid}:primary:${ev.id}`;
            const attendees = (ev.attendees || []).map(a => (a.email || '').trim().toLowerCase()).filter(Boolean);

            // Match CRM contact: 1) by attendee email, or 2) by contact email / full name in title or description
            let cpContact = null;
            if (attendees.length > 0) {
              for (const email of attendees) {
                const matched = crmContactsByEmail.get(email);
                if (matched) {
                  cpContact = matched;
                  break;
                }
              }
            }

            if (!cpContact) {
              const summaryLower = (ev.summary || '').toLowerCase();
              const descLower = (ev.description || '').toLowerCase();
              for (const [email, c] of crmContactsByEmail.entries()) {
                if (summaryLower.includes(email) || descLower.includes(email)) {
                  cpContact = c;
                  break;
                }
                const nameLower = (c.name || '').trim().toLowerCase();
                if (nameLower && nameLower.length > 3 && (summaryLower.includes(nameLower) || descLower.includes(nameLower))) {
                  cpContact = c;
                  break;
                }
              }
            }

            // Only matched CRM contacts generate celebrations; ignore unrelated/personal events
            if (cpContact) {
              try {
                await createCelebration({
                  accountId: cpContact.accountId || cpContact.account_id,
                  contactId: cpContact.contactId || cpContact.id,
                  eventType: eventType,
                  eventTitle: ev.summary,
                  eventDescription: ev.description || '',
                  eventDate: eventDate,
                  sourceType: SOURCE_TYPES.GOOGLE_CALENDAR,
                  sourceName: 'Google Calendar',
                  sourceEventId: sourceEventId,
                  sourceUrl: ev.htmlLink || '',
                  lastSyncStatus: 'SUCCESS',
                  lastSyncedAt: new Date().toISOString(),
                  confidence: 'High',
                  verificationStatus: VERIFICATION_STATUS.PENDING_VERIFICATION,
                }, { uid: 'system', name: 'System Auto-Sync' });

                createdEvents.push({
                  contactId: cpContact.contactId || cpContact.id,
                  eventType: eventType,
                  source: SOURCE_TYPES.GOOGLE_CALENDAR
                });
              } catch (e) {
                // duplicate prevented or skipped
              }
            }
          }
        } catch (err) {
          console.error(`[GoogleCelebrationAdapter] Failed to sync calendar for user ${uid}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[GoogleCelebrationAdapter] Global sync failure:', err.message);
    }
    return createdEvents;
  }
}

// LinkedIn adapter
export class LinkedInCelebrationAdapter extends CelebrationSourceAdapter {
  constructor() {
    super(SOURCE_TYPES.LINKEDIN, 'LinkedIn API');
    this.enabled = (process.env.LINKEDIN_CELEBRATION_SOURCE_ENABLED || 'false') === 'true';
  }
  // Example integration structure:
  // Note: LinkedIn strictly restricts data scraping. 
  // You must use the official 'Sign In with LinkedIn v2' and 'r_liteprofile' / 'r_basicprofile' 
  // to fetch connections IF approved by LinkedIn's partner program.
  // async getUpcomingCelebrations() {
  //   const axios = require('axios');
  //   const response = await axios.get('https://api.linkedin.com/v2/connections?q=viewer&projection=(elements*(id,firstName,lastName,positions))', {
  //     headers: { Authorization: `Bearer ${USER_LINKEDIN_TOKEN}` }
  //   });
  //   // Map positions array to WORK_ANNIVERSARY events
  // }
}

// ─── BACKGROUND SYNC SCHEDULER ───────────────────────────────────────────────

let syncCronTimer = null;

/**
 * Initializes the background scheduled job for daily celebration synchronization.
 * Should be called once during server startup (e.g. in server.js).
 */
export function startCelebrationSyncCron() {
  if (syncCronTimer) return;
  console.log('🔄 [CelebrationService] Starting daily celebration background sync...');

  // Run once immediately, then every 24 hours
  detectFromContacts().catch(err => console.error('[CelebrationService] Sync error:', err));
  syncCronTimer = setInterval(() => {
    console.log('🔄 [CelebrationService] Running scheduled celebration sync...');
    detectFromContacts().catch(err => console.error('[CelebrationService] Sync error:', err));
  }, 24 * 60 * 60 * 1000); // 24 hours
}

export function stopCelebrationSyncCron() {
  if (syncCronTimer) {
    clearInterval(syncCronTimer);
    syncCronTimer = null;
    console.log('🛑 [CelebrationService] Background sync stopped.');
  }
}

