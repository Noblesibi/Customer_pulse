import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { microsoftConfig, microsoftDevConfig } from '../config/microsoft.js';

// ── Primary Production Client (Preserved for Outlook Mail.Read) ───────────────
const msalClient = new ConfidentialClientApplication({
  auth: {
    clientId: microsoftConfig.clientId,
    authority: microsoftConfig.authority,
    clientSecret: microsoftConfig.clientSecret,
  },
});

export async function getMicrosoftAccessToken() {
  const result = await msalClient.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });

  if (!result?.accessToken) {
    throw new Error('Microsoft Graph access token was not returned.');
  }

  return result.accessToken;
}

export async function getGraphClient() {
  const accessToken = await getMicrosoftAccessToken();

  return Client.init({
    authProvider: done => done(null, accessToken),
  });
}

// ── CustomerPulse-Dev Client (Contacts.Read & Teams Transcripts) ─────────────
let devMsalClient = null;
if (microsoftDevConfig.isConfigured) {
  devMsalClient = new ConfidentialClientApplication({
    auth: {
      clientId: microsoftDevConfig.clientId,
      authority: microsoftDevConfig.authority,
      clientSecret: microsoftDevConfig.clientSecret,
    },
  });
}

export async function getMicrosoftDevAccessToken() {
  if (!microsoftDevConfig.isConfigured || !devMsalClient) {
    throw new Error(
      'CustomerPulse-Dev credentials are not fully configured in backend/.env. Please ensure MICROSOFT_DEV_CLIENT_ID and MICROSOFT_DEV_CLIENT_SECRET are set.'
    );
  }

  const result = await devMsalClient.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });

  if (!result?.accessToken) {
    throw new Error('CustomerPulse-Dev Microsoft Graph access token was not returned.');
  }

  return result.accessToken;
}

export async function getDevGraphClient() {
  if (!microsoftDevConfig.isConfigured) {
    // Graceful fallback to production Graph client if dev credentials are not set
    return getGraphClient();
  }

  const accessToken = await getMicrosoftDevAccessToken();

  return Client.init({
    authProvider: done => done(null, accessToken),
  });
}

export async function fetchMicrosoftContacts(mailbox) {
  if (!mailbox) {
    throw new Error('Mailbox is required to fetch Microsoft Contacts.');
  }

  // Uses the development client where Contacts.Read application permission is granted
  const graphClient = await getDevGraphClient();
  const contacts = [];
  let requestPath = `/users/${encodeURIComponent(mailbox)}/contacts?$select=id,displayName,emailAddresses,birthday,companyName`;

  try {
    while (requestPath) {
      const response = await graphClient.api(requestPath).get();

      if (response.value && response.value.length > 0) {
        for (const contact of response.value) {
          contacts.push({
            id: contact.id,
            displayName: contact.displayName,
            emailAddresses: contact.emailAddresses || [],
            birthday: contact.birthday,
            companyName: contact.companyName
          });
        }
      }

      requestPath = response['@odata.nextLink'] || null;
    }
  } catch (error) {
    console.error(`[Microsoft Graph] Failed to fetch contacts for ${mailbox}:`, error.message);
    throw new Error(`Failed to fetch Microsoft Contacts: ${error.message}`);
  }

  return contacts;
}
