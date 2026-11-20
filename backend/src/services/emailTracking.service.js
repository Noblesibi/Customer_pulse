import { db } from '../config/database.js';
import { fetchRecentMessages, assertAuthorizedOutlookMailbox } from './outlookSync.service.js';
import {
  listAuthorizedOutlookMailboxes,
  isInternalCorporateEmail,
} from './organizerSync.service.js';
import { createInteraction } from './interaction.service.js';
import dotenv from 'dotenv';

dotenv.config();

// Default background sync interval: 30 seconds
const SYNC_INTERVAL = parseInt(process.env.EMAIL_TRACKING_INTERVAL_MS) || 30000;
let syncTimer = null;
let isSyncing = false;
let lastSyncTimestamp = 0;

export function getLastSyncTimestamp() {
  return lastSyncTimestamp;
}

export function isSyncInProgress() {
  return isSyncing;
}

async function getOutlookSyncCheckpoint(mailboxEmail) {
  const cleanEmail = String(mailboxEmail || '').trim().toLowerCase();
  const checkpointId = `outlook:${cleanEmail}`;
  const doc = await db.collection('synccheckpoints').doc(checkpointId).get();
  return doc.exists ? doc.data() : null;
}

async function saveOutlookSyncCheckpoint(mailboxEmail, { status, itemsProcessed = 0, lastSyncedAt = null, lastError = null } = {}) {
  const cleanEmail = String(mailboxEmail || '').trim().toLowerCase();
  const checkpointId = `outlook:${cleanEmail}`;
  const nowIso = new Date().toISOString();
  const existing = await getOutlookSyncCheckpoint(cleanEmail);
  const record = {
    checkpointId,
    provider: 'OUTLOOK_MAIL',
    organizerEmail: cleanEmail,
    deltaLink: existing?.deltaLink || null,
    lastSyncedAt: lastSyncedAt || existing?.lastSyncedAt || nowIso,
    lastStatus: status || 'SUCCESS',
    lastError: lastError || null,
    itemsProcessed: (existing?.itemsProcessed || 0) + itemsProcessed,
    updatedAt: nowIso,
  };
  await db.collection('synccheckpoints').doc(checkpointId).set(record, { merge: true });
  return record;
}

/**
 * Core automatic email sync:
 * Ingests recent emails (Inbox & Sent Items) ONLY for organizers whose Outlook mailbox
 * authorization (`outlookStatus === 'Authorized'`) and `Mail.Read` permission have been verified.
 * Supports incremental `SyncCheckpoints` (`provider = 'OUTLOOK_MAIL'`) and routes ambiguous
 * multi-account messages to `CommunicationReviewQueue`.
 */
export async function syncEmails(invokedByUser = null, { mailboxEmail = null, limit = 50, useIncrementalCheckpoint = false } = {}) {
  if (isSyncing) {
    console.log('🔄 [EmailTrackingService] Auto-sync already in progress, skipping concurrent run.');
    return { skipped: true, reason: 'Already in progress' };
  }

  isSyncing = true;
  lastSyncTimestamp = Date.now();

  try {
    let targetMailboxes = [];

    if (mailboxEmail) {
      const authRes = await assertAuthorizedOutlookMailbox(mailboxEmail);
      targetMailboxes = [authRes.record || { email: authRes.email }];
    } else {
      const authorizedRecords = await listAuthorizedOutlookMailboxes();
      if (authorizedRecords.length > 0) {
        targetMailboxes = authorizedRecords;
      } else if (process.env.MICROSOFT_TEST_MAILBOX) {
        // Even if MICROSOFT_TEST_MAILBOX is set, enforce authorization check before reading
        const authRes = await assertAuthorizedOutlookMailbox(process.env.MICROSOFT_TEST_MAILBOX);
        targetMailboxes = [authRes.record || { email: authRes.email }];
      }
    }

    if (targetMailboxes.length === 0) {
      return {
        skipped: true,
        reason: 'NO_AUTHORIZED_OUTLOOK_MAILBOXES',
        syncRecord: {
          results: {
            mailboxesChecked: 0,
            totalRead: 0,
            synced: 0,
            queuedForReview: 0,
          },
        },
      };
    }

    const [usersSnap, contactsSnap, accountsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('contacts').get(),
      db.collection('accounts').get(),
    ]);
    const allUsers = usersSnap.docs.map(d => d.data());
    const allContacts = contactsSnap.docs.map(d => ({ contactId: d.id, ...d.data() }));
    const allAccounts = accountsSnap.docs.map(d => ({ accountId: d.id, ...d.data() }));

    const aggregateResults = {
      mailboxesChecked: targetMailboxes.length,
      totalRead: 0,
      internalSkipped: 0,
      unmatchedSkipped: 0,
      duplicatesSkipped: 0,
      queuedForReview: 0,
      synced: 0,
      errors: 0,
    };

    for (const orgRecord of targetMailboxes) {
      const mailbox = String(orgRecord.email || '').trim().toLowerCase();
      if (!mailbox) continue;

      let defaultUser = invokedByUser || {
        uid: orgRecord.uid || 'system',
        name: orgRecord.name || 'System Auto-Sync',
        email: mailbox,
      };
      if (!invokedByUser) {
        const matchedUser = allUsers.find(u => u.email?.toLowerCase() === mailbox);
        if (matchedUser) {
          defaultUser = { uid: matchedUser.uid, name: matchedUser.name, email: matchedUser.email };
        }
      }

      const existingCheckpoint = await getOutlookSyncCheckpoint(mailbox);
      const sinceDateTime = useIncrementalCheckpoint ? (existingCheckpoint?.lastSyncedAt || null) : null;

      let messages = [];
      try {
        messages = await fetchRecentMessages(mailbox, limit, {
          includeSentItems: true,
          sinceDateTime,
        });
      } catch (fetchErr) {
        await saveOutlookSyncCheckpoint(mailbox, {
          status: 'FAILED',
          itemsProcessed: 0,
          lastError: fetchErr.message,
        });
        throw fetchErr;
      }

      aggregateResults.totalRead += messages.length;
      let mailboxSyncedCount = 0;
      let latestMessageIso = existingCheckpoint?.lastSyncedAt || null;

      for (const msg of messages) {
        const msgTimestamp = msg.receivedDateTime || msg.sentDateTime || new Date().toISOString();
        if (!latestMessageIso || new Date(msgTimestamp) > new Date(latestMessageIso)) {
          latestMessageIso = new Date(msgTimestamp).toISOString();
        }

        const allEmails = [
          msg.from?.emailAddress?.address,
          ...(msg.toRecipients || []).map(r => r.emailAddress?.address),
          ...(msg.ccRecipients || []).map(r => r.emailAddress?.address),
        ]
          .filter(Boolean)
          .map(e => e.toLowerCase());

        const externalEmails = Array.from(new Set(allEmails.filter(e => !isInternalCorporateEmail(e))));
        const internalEmails = Array.from(new Set(allEmails.filter(e => isInternalCorporateEmail(e))));

        // Skip internal-only emails
        if (externalEmails.length === 0) {
          aggregateResults.internalSkipped++;
          continue;
        }

        // Duplicate Check (by internetMessageId)
        if (msg.internetMessageId) {
          const existingQuery = await db
            .collection('interactions')
            .where('internetMessageId', '==', msg.internetMessageId)
            .limit(1)
            .get();

          if (!existingQuery.empty) {
            aggregateResults.duplicatesSkipped++;
            continue;
          }
        }

        // Match external emails against all CRM Contacts and Accounts to detect multi-account ambiguity
        const matchedAccountIdsSet = new Set();
        const matchedContactsList = [];

        for (const extEmail of externalEmails) {
          const matchingContacts = allContacts.filter(
            c => c.email && c.email.trim().toLowerCase() === extEmail
          );
          for (const mc of matchingContacts) {
            if (mc.accountId) {
              matchedAccountIdsSet.add(mc.accountId);
              matchedContactsList.push(mc);
            }
          }

          const matchingAccounts = allAccounts.filter(
            a => a.email && a.email.trim().toLowerCase() === extEmail
          );
          for (const ma of matchingAccounts) {
            const aId = ma.accountId || ma.id;
            if (aId) matchedAccountIdsSet.add(aId);
          }
        }

        const candidateAccountIds = Array.from(matchedAccountIdsSet);

        if (candidateAccountIds.length === 0) {
          aggregateResults.unmatchedSkipped++;
          continue;
        }

        // If external participants span 2+ distinct CRM accounts, route to CommunicationReviewQueue instead of guessing
        if (candidateAccountIds.length > 1) {
          const extResId = msg.internetMessageId || msg.id || `outlook_${Date.now()}`;
          const reviewId = `rev_outlook_${extResId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 65)}`;
          const nowIso = new Date().toISOString();
          await db.collection('communicationreviewqueue').doc(reviewId).set(
            {
              reviewId,
              channel: 'OUTLOOK_MAIL',
              externalResourceId: extResId,
              organizerEmail: mailbox,
              subject: msg.subject || '(No Subject)',
              occurredAt: msgTimestamp,
              externalParticipants: externalEmails.map(e => ({ email: e })),
              internalParticipants: internalEmails.map(e => ({ email: e })),
              candidateAccounts: candidateAccountIds.map(accId => {
                const accObj = allAccounts.find(a => (a.accountId || a.id) === accId);
                return { accountId: accId, companyName: accObj?.companyName || accId };
              }),
              reason: 'AMBIGUOUS_MULTIPLE_ACCOUNTS',
              payload: {
                internetMessageId: msg.internetMessageId || null,
                subject: msg.subject || '(No Subject)',
                messageText: msg.body?.content || '',
                receivedDateTime: msgTimestamp,
                folder: msg.folder || 'inbox',
              },
              status: 'PENDING_REVIEW',
              createdAt: nowIso,
              updatedAt: nowIso,
            },
            { merge: true }
          );
          aggregateResults.queuedForReview++;
          continue;
        }

        const matchedAccountId = candidateAccountIds[0];
        const matchedContactId =
          matchedContactsList.find(c => c.accountId === matchedAccountId)?.contactId || null;

        const accountDoc = await db.collection('accounts').doc(matchedAccountId).get();
        if (!accountDoc.exists) {
          aggregateResults.unmatchedSkipped++;
          continue;
        }
        const accountData = accountDoc.data();

        let userToLog = defaultUser;
        const senderEmail = msg.from?.emailAddress?.address?.toLowerCase();
        if (senderEmail && isInternalCorporateEmail(senderEmail)) {
          const matchedSender = allUsers.find(u => u.email?.toLowerCase() === senderEmail);
          if (matchedSender) {
            userToLog = { uid: matchedSender.uid, name: matchedSender.name, email: matchedSender.email };
          }
        } else if (accountData.ownerId) {
          userToLog = {
            uid: accountData.ownerId,
            name: accountData.ownerName || 'Account Owner',
            email: accountData.ownerEmail || '',
          };
        }

        try {
          await createInteraction(
            {
              accountId: matchedAccountId,
              contactId: matchedContactId,
              source: 'Outlook Mail',
              subject: msg.subject || '(No Subject)',
              messageText: msg.body?.content || '(No Content)',
              internetMessageId: msg.internetMessageId,
              isManual: false,
              date: new Date(msgTimestamp).toISOString().split('T')[0],
              time: new Date(msgTimestamp).toTimeString().slice(0, 5),
            },
            userToLog
          );

          aggregateResults.synced++;
          mailboxSyncedCount++;
        } catch (interactionError) {
          console.error(
            '❌ [EmailTrackingService] Error creating interaction for message:',
            msg.internetMessageId,
            interactionError.message
          );
          aggregateResults.errors++;
        }
      }

      await saveOutlookSyncCheckpoint(mailbox, {
        status: 'SUCCESS',
        itemsProcessed: mailboxSyncedCount,
        lastSyncedAt: latestMessageIso || new Date().toISOString(),
        lastError: null,
      });
    }

    const syncId = 'sync-auto-' + Math.random().toString(36).substring(2, 11);
    const syncRecord = {
      syncId,
      provider: 'Microsoft 365',
      mailbox: targetMailboxes.map(m => m.email).join(','),
      triggeredByUid: invokedByUser?.uid || 'system',
      triggeredByName: invokedByUser ? invokedByUser.name || 'User' : 'Automated Scheduler',
      timestamp: new Date().toISOString(),
      results: aggregateResults,
    };

    await db.collection('syncHistory').doc(syncId).set(syncRecord);

    if (aggregateResults.synced > 0) {
      console.log(`✅ [EmailTrackingService] Auto-sync complete. Synced ${aggregateResults.synced} new interaction(s).`);
    }

    return { success: true, syncRecord };
  } catch (error) {
    const msg = error?.message || String(error);
    if (error.code === 'UNAUTHORIZED_OUTLOOK_MAILBOX' || error.code === 'MISSING_GRAPH_PERMISSION' || error.code === 'TENANT_MISMATCH_BLOCKED') {
      return {
        error: msg,
        code: error.code,
        reason: error.reason,
      };
    }
    if (msg.includes('AADSTS7000112') || msg.includes('unauthorized_client')) {
      console.warn(
        `⚠️ [EmailTrackingService] Azure AD Application (${process.env.MICROSOFT_CLIENT_ID || 'CustomerPulse'}) is disabled or unauthorized in Azure tenant. Pausing background Outlook sync until re-enabled.`
      );
      if (!invokedByUser && syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
      }
      return { skipped: true, error: 'Azure AD application is disabled in tenant (AADSTS7000112)' };
    }
    console.error('❌ [EmailTrackingService] Error during email synchronization:', msg);
    return { error: msg };
  } finally {
    isSyncing = false;
  }
}

export function startEmailTrackingScheduler() {
  if (syncTimer) {
    clearInterval(syncTimer);
  }

  // Run synchronization immediately on startup
  syncEmails();

  // Set up periodic background sync
  syncTimer = setInterval(() => {
    syncEmails();
  }, SYNC_INTERVAL);

  console.log(`⏰ [EmailTrackingService] Live background scheduler started. Interval: ${SYNC_INTERVAL / 1000}s.`);
}

export function stopEmailTrackingScheduler() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('🛑 [EmailTrackingService] Scheduler stopped.');
  }
}
