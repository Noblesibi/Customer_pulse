import { getGraphClient } from './microsoftGraph.service.js';

export async function fetchRecentMessages(mailbox, limit = 10) {
  if (!mailbox) {
    throw new Error('Mailbox is required.');
  }

  const graph = await getGraphClient();

  const response = await graph
    .api(`/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages`)
    .top(limit)
    .select([
      'id',
      'internetMessageId',
      'conversationId',
      'subject',
      'from',
      'toRecipients',
      'ccRecipients',
      'receivedDateTime',
      'body',
      'hasAttachments',
    ].join(','))
    .orderby('receivedDateTime DESC')
    .get();

  return response.value || [];
}
