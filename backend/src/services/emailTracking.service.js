import { db } from '../config/database.js';
import { fetchRecentMessages } from './outlookSync.service.js';
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

/**
 * Core automatic email sync:
 * Ingests recent emails from Microsoft 365, matching them by contact/account
 * and automatically logs them as interactions in real-time.
 */
export async function syncEmails(invokedByUser = null) {
  if (isSyncing) {
    console.log('🔄 [EmailTrackingService] Auto-sync already in progress, skipping concurrent run.');
    return { skipped: true, reason: 'Already in progress' };
  }

  isSyncing = true;
  lastSyncTimestamp = Date.now();

  try {
    const mailbox = process.env.MICROSOFT_TEST_MAILBOX;
    if (!mailbox) {
      console.warn('⚠️ [EmailTrackingService] MICROSOFT_TEST_MAILBOX is not configured. Skipping sync.');
      return { error: 'MICROSOFT_TEST_MAILBOX is not configured' };
    }

    // Identify fallback user
    let defaultUser = invokedByUser || { uid: 'system', name: 'System Auto-Sync', email: mailbox };
    if (!invokedByUser) {
      const userQuery = await db.collection('users').where('email', '==', mailbox).limit(1).get();
      if (!userQuery.empty) {
        const u = userQuery.docs[0].data();
        defaultUser = { uid: u.uid, name: u.name, email: u.email };
      }
    }

    // Fetch recent emails from Outlook
    const messages = await fetchRecentMessages(mailbox, 50);

    const results = {
      totalRead: messages.length,
      internalSkipped: 0,
      unmatchedSkipped: 0,
      duplicatesSkipped: 0,
      synced: 0,
      errors: 0
    };

    // Pre-fetch users for fast attribution mapping
    const usersSnap = await db.collection('users').get();
    const allUsers = usersSnap.docs.map(d => d.data());

    for (const msg of messages) {
      const allEmails = [
        msg.from?.emailAddress?.address,
        ...(msg.toRecipients || []).map(r => r.emailAddress?.address),
        ...(msg.ccRecipients || []).map(r => r.emailAddress?.address)
      ].filter(Boolean).map(e => e.toLowerCase());

      const externalEmails = allEmails.filter(e => !e.endsWith('@nestgroup.net'));

      // If there are no external emails, this is an internal-only email
      if (externalEmails.length === 0) {
        results.internalSkipped++;
        continue;
      }

      // Duplicate Check (by internetMessageId)
      const existingQuery = await db.collection('interactions')
        .where('internetMessageId', '==', msg.internetMessageId)
        .limit(1)
        .get();

      if (!existingQuery.empty) {
        results.duplicatesSkipped++;
        continue;
      }

      let matchedAccountId = null;
      let matchedContactId = null;

      // 1. Match Contact by Email first
      for (const extEmail of externalEmails) {
        const contactQuery = await db.collection('contacts').where('email', '==', extEmail).limit(1).get();
        if (!contactQuery.empty) {
          const contact = contactQuery.docs[0].data();
          matchedAccountId = contact.accountId;
          matchedContactId = contact.contactId || contactQuery.docs[0].id;
          break;
        }
      }

      // 2. If no contact match, check Account's general email
      if (!matchedAccountId) {
        for (const extEmail of externalEmails) {
          const accountQuery = await db.collection('accounts').where('email', '==', extEmail).limit(1).get();
          if (!accountQuery.empty) {
            matchedAccountId = accountQuery.docs[0].data().accountId || accountQuery.docs[0].id;
            break;
          }
        }
      }

      if (!matchedAccountId) {
        results.unmatchedSkipped++;
        continue;
      }

      // Ensure Account exists
      const accountDoc = await db.collection('accounts').doc(matchedAccountId).get();
      if (!accountDoc.exists) {
        results.unmatchedSkipped++;
        continue;
      }
      const accountData = accountDoc.data();

      // Determine who logged this interaction
      let userToLog = defaultUser;
      const senderEmail = msg.from?.emailAddress?.address?.toLowerCase();
      if (senderEmail && senderEmail.endsWith('@nestgroup.net')) {
        const matchedSender = allUsers.find(u => u.email?.toLowerCase() === senderEmail);
        if (matchedSender) {
          userToLog = { uid: matchedSender.uid, name: matchedSender.name, email: matchedSender.email };
        }
      } else if (accountData.ownerId) {
        userToLog = {
          uid: accountData.ownerId,
          name: accountData.ownerName || 'Account Owner',
          email: accountData.ownerEmail || ''
        };
      }

      // Create Interaction in DB
      try {
        await createInteraction({
          accountId: matchedAccountId,
          contactId: matchedContactId,
          source: 'Outlook Mail',
          subject: msg.subject || '(No Subject)',
          messageText: msg.body?.content || '(No Content)',
          internetMessageId: msg.internetMessageId,
          isManual: false,
          date: new Date(msg.receivedDateTime).toISOString().split('T')[0],
          time: new Date(msg.receivedDateTime).toTimeString().slice(0, 5)
        }, userToLog);

        results.synced++;
      } catch (interactionError) {
        console.error('❌ [EmailTrackingService] Error creating interaction for message:', msg.internetMessageId, interactionError.message);
        results.errors++;
      }
    }

    // Save SyncHistory for auditability
    const syncId = 'sync-auto-' + Math.random().toString(36).substring(2, 11);
    const syncRecord = {
      syncId,
      provider: 'Microsoft 365',
      mailbox,
      triggeredByUid: defaultUser.uid,
      triggeredByName: invokedByUser ? (invokedByUser.name || 'User') : 'Automated Scheduler',
      timestamp: new Date().toISOString(),
      results
    };

    await db.collection('syncHistory').doc(syncId).set(syncRecord);
    
    if (results.synced > 0) {
      console.log(`✅ [EmailTrackingService] Auto-sync complete. Synced ${results.synced} new interaction(s).`);
    }

    return { success: true, syncRecord };
  } catch (error) {
    const msg = error?.message || String(error);
    if (msg.includes('AADSTS7000112') || msg.includes('unauthorized_client')) {
      console.warn(`⚠️ [EmailTrackingService] Azure AD Application (${process.env.MICROSOFT_CLIENT_ID || 'CustomerPulse'}) is disabled or unauthorized in Azure tenant. Pausing background Outlook sync until re-enabled.`);
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
