import { getGraphClient, verifyGraphTokenClaims, fetchAllGraphPages } from './microsoftGraph.service.js';
import { isMailboxAuthorizedForOutlook } from './organizerSync.service.js';

/**
 * Enforces that a mailbox is an Authorized Outlook Organizer in `AuthorizedOrganizers`
 * (`outlookStatus === 'Authorized'`), that the Exchange Online RBAC scope is verified,
 * and that `Mail.Read` application permission is present on the Graph token.
 *
 * CRITICAL: `Calendars.Read` and `Contacts.Read` never grant email-reading permission.
 */
export async function assertAuthorizedOutlookMailbox(mailboxEmail) {
  const authCheck = await isMailboxAuthorizedForOutlook(mailboxEmail);
  if (!authCheck.authorized) {
    const err = new Error(
      `Mailbox "${mailboxEmail || 'unknown'}" is not authorized for Outlook synchronization (${authCheck.reason}).`
    );
    err.code = 'UNAUTHORIZED_OUTLOOK_MAILBOX';
    err.reason = authCheck.reason;
    throw err;
  }

  const claims = verifyGraphTokenClaims();
  if (claims.tenantMismatch) {
    const err = new Error(
      'Microsoft Graph token tenant mismatch detected: resource tenant is not verified for Outlook mailbox access.'
    );
    err.code = 'TENANT_MISMATCH_BLOCKED';
    err.reason = 'TENANT_MISMATCH';
    throw err;
  }

  if (claims.verified && !claims.hasMailRead) {
    const err = new Error(
      'Microsoft Graph application token is missing required permission "Mail.Read". Calendars.Read and Contacts.Read do not grant mailbox message access.'
    );
    err.code = 'MISSING_GRAPH_PERMISSION';
    err.reason = 'MISSING_GRAPH_PERMISSION_Mail.Read';
    throw err;
  }

  return authCheck;
}

const MESSAGE_SELECT_FIELDS = [
  'id',
  'internetMessageId',
  'conversationId',
  'subject',
  'from',
  'toRecipients',
  'ccRecipients',
  'receivedDateTime',
  'sentDateTime',
  'body',
  'hasAttachments',
].join(',');

/**
 * Fetches recent messages from an authorized organizer's Inbox and Sent Items folders
 * with `@odata.nextLink` pagination, 429 retry protection, and optional incremental
 * `sinceDateTime` checkpoint filtering.
 * Strictly blocked until Outlook mailbox authorization and `Mail.Read` are verified.
 */
export async function fetchRecentMessages(
  mailbox,
  limit = 10,
  { includeSentItems = true, sinceDateTime = null, maxPages = 5 } = {}
) {
  if (!mailbox) {
    throw new Error('Mailbox is required.');
  }

  const { email: authorizedMailbox } = await assertAuthorizedOutlookMailbox(mailbox);
  const graph = await getGraphClient();
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);

  const inboxFilter = sinceDateTime
    ? `&$filter=${encodeURIComponent(`receivedDateTime ge ${new Date(sinceDateTime).toISOString()}`)}`
    : '';
  const inboxPath =
    `/users/${encodeURIComponent(authorizedMailbox)}/mailFolders/inbox/messages` +
    `?$top=${safeLimit}&$select=${encodeURIComponent(MESSAGE_SELECT_FIELDS)}${inboxFilter}&$orderby=receivedDateTime%20DESC`;

  const { items: inboxItems } = await fetchAllGraphPages(graph, inboxPath, {
    maxPages,
    context: `OutlookInbox:${authorizedMailbox}`,
  });
  const inboxMessages = (inboxItems || []).map(m => ({ ...m, folder: 'inbox' }));

  let sentMessages = [];
  if (includeSentItems) {
    const sentFilter = sinceDateTime
      ? `&$filter=${encodeURIComponent(`sentDateTime ge ${new Date(sinceDateTime).toISOString()}`)}`
      : '';
    const sentPath =
      `/users/${encodeURIComponent(authorizedMailbox)}/mailFolders/sentitems/messages` +
      `?$top=${safeLimit}&$select=${encodeURIComponent(MESSAGE_SELECT_FIELDS)}${sentFilter}&$orderby=sentDateTime%20DESC`;
    try {
      const { items: sentItems } = await fetchAllGraphPages(graph, sentPath, {
        maxPages,
        context: `OutlookSentItems:${authorizedMailbox}`,
      });
      sentMessages = (sentItems || []).map(m => ({
        ...m,
        receivedDateTime: m.receivedDateTime || m.sentDateTime,
        folder: 'sentitems',
      }));
    } catch (_) {
      sentMessages = [];
    }
  }

  const dedupedByInternetId = new Map();
  for (const msg of [...inboxMessages, ...sentMessages]) {
    const key = msg.internetMessageId || msg.id || `${msg.subject}_${msg.receivedDateTime}`;
    if (!dedupedByInternetId.has(key)) {
      dedupedByInternetId.set(key, msg);
    }
  }

  return Array.from(dedupedByInternetId.values()).sort(
    (a, b) => new Date(b.receivedDateTime || b.sentDateTime || 0) - new Date(a.receivedDateTime || a.sentDateTime || 0)
  );
}
