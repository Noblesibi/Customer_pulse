import { ConfidentialClientApplication } from '@azure/msal-node';
import { Client } from '@microsoft/microsoft-graph-client';
import { microsoftConfig, microsoftDevConfig, microsoftTeamsConfig } from '../config/microsoft.js';

// ── Primary Production Client (Preserved for Outlook Mail.Read) ───────────────
let msalClient = null;
if (microsoftConfig.isConfigured) {
  msalClient = new ConfidentialClientApplication({
    auth: {
      clientId: microsoftConfig.clientId,
      authority: microsoftConfig.authority,
      clientSecret: microsoftConfig.clientSecret,
    },
  });
}

export async function getMicrosoftAccessToken() {
  if (!microsoftConfig.isConfigured || !msalClient) {
    throw new Error(
      'Primary Microsoft Graph credentials (MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET) are not configured.'
    );
  }

  const result = await msalClient.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });

  if (!result?.accessToken) {
    throw new Error('Microsoft Graph access token was not returned.');
  }

  return result.accessToken;
}

export async function getGraphClient() {
  if (mockTeamsGraphClientFactory) {
    return mockTeamsGraphClientFactory();
  }

  if (microsoftTeamsConfig.mockMode) {
    throw new Error('MICROSOFT_TEAMS_MOCK is enabled, but no mock Graph client was registered.');
  }

  // Prefer the active CustomerPulse-Dev client when configured (since legacy primary app is disabled)
  if (microsoftDevConfig.isConfigured) {
    return getTeamsGraphClient();
  }

  const accessToken = await getMicrosoftAccessToken();

  return Client.init({
    authProvider: done => done(null, accessToken),
  });
}

// ── CustomerPulse-Dev Client (Contacts.Read & Teams Meetings/Transcripts) ──────
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

// Optional test/mock Graph client override (used exclusively in test suites & mock fixtures)
let mockTeamsGraphClientFactory = null;
let cachedDevToken = null;
let cachedDevTokenExpiresAt = 0;
let mockTokenClaimsOverride = null;

export function setMockTeamsGraphClient(factoryOrClient, tokenClaimsOverride = null) {
  if (typeof factoryOrClient === 'function') {
    mockTeamsGraphClientFactory = factoryOrClient;
  } else if (factoryOrClient) {
    mockTeamsGraphClientFactory = () => factoryOrClient;
  } else {
    mockTeamsGraphClientFactory = null;
  }
  mockTokenClaimsOverride = tokenClaimsOverride;
}

export function resetMockTeamsGraphClient() {
  mockTeamsGraphClientFactory = null;
  mockTokenClaimsOverride = null;
  cachedDevToken = null;
  cachedDevTokenExpiresAt = 0;
}

export function invalidateTeamsTokenCache() {
  cachedDevToken = null;
  cachedDevTokenExpiresAt = 0;
}

/**
 * Decodes and verifies JWT token claims without exposing raw token secrets.
 * Distinguishes application `roles` from delegated `scp`.
 */
export function verifyGraphTokenClaims(accessToken = null) {
  let claims = mockTokenClaimsOverride;
  const effectiveToken = accessToken || cachedDevToken;

  if (!claims && effectiveToken && typeof effectiveToken === 'string' && effectiveToken.split('.').length === 3) {
    try {
      claims = JSON.parse(Buffer.from(effectiveToken.split('.')[1], 'base64url').toString('utf8'));
    } catch (_) {
      claims = null;
    }
  }

  const roles = Array.isArray(claims?.roles) ? claims.roles : [];
  const delegatedScopes = typeof claims?.scp === 'string' ? claims.scp.split(/\s+/).filter(Boolean) : [];
  const tokenTenantId = claims?.tid || microsoftDevConfig.tenantId || null;
  const resourceTenantId = microsoftDevConfig.tenantId || microsoftConfig.tenantId || null;
  const matchesConfiguredTenant =
    (microsoftDevConfig.tenantId && tokenTenantId === microsoftDevConfig.tenantId) ||
    (microsoftConfig.tenantId && tokenTenantId === microsoftConfig.tenantId);
  const tenantMismatch = Boolean(
    tokenTenantId &&
    resourceTenantId &&
    !matchesConfiguredTenant &&
    !microsoftTeamsConfig.resourceTenantVerified
  );

  return {
    verified: Boolean(claims),
    appId: claims?.appid || claims?.azp || microsoftDevConfig.clientId || null,
    tokenTenantId,
    resourceTenantId,
    tenantMismatch,
    isClientCredentialsToken: roles.length > 0 || delegatedScopes.length === 0,
    applicationRoles: roles,
    delegatedScopesIgnored: delegatedScopes,
    hasOnlineMeetingsReadAll: roles.includes('OnlineMeetings.Read.All'),
    hasOnlineMeetingTranscriptReadAll: roles.includes('OnlineMeetingTranscript.Read.All'),
    hasCalendarsRead: roles.includes('Calendars.Read'),
    hasContactsRead: roles.includes('Contacts.Read'),
    hasMailRead: roles.includes('Mail.Read') || roles.includes('Mail.ReadBasic.All'),
  };
}

export async function getMicrosoftDevAccessToken({ forceRefresh = false } = {}) {
  const now = Date.now();
  const expiryBufferMs = 5 * 60 * 1000;

  if (!forceRefresh && cachedDevToken && cachedDevTokenExpiresAt - expiryBufferMs > now) {
    return cachedDevToken;
  }

  if (!microsoftDevConfig.isConfigured || !devMsalClient) {
    throw new Error(
      'CustomerPulse-Dev credentials are not configured. Set MICROSOFT_DEV_TENANT_ID, MICROSOFT_DEV_CLIENT_ID, and MICROSOFT_DEV_CLIENT_SECRET.'
    );
  }

  const result = await devMsalClient.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
    skipCache: Boolean(forceRefresh),
  });

  if (!result?.accessToken) {
    throw new Error('CustomerPulse-Dev Microsoft Graph access token was not returned.');
  }

  cachedDevToken = result.accessToken;
  cachedDevTokenExpiresAt = result.expiresOn instanceof Date
    ? result.expiresOn.getTime()
    : now + 55 * 60 * 1000;

  return cachedDevToken;
}

/**
 * Returns a Graph client bound strictly to CustomerPulse-Dev (or a test mock when injected).
 * Intentionally NEVER falls back to the primary Outlook tenant client.
 */
export async function getTeamsGraphClient() {
  if (mockTeamsGraphClientFactory) {
    return mockTeamsGraphClientFactory();
  }

  if (microsoftTeamsConfig.mockMode) {
    throw new Error('MICROSOFT_TEAMS_MOCK is enabled, but no mock Graph client was registered.');
  }

  const accessToken = await getMicrosoftDevAccessToken();

  return Client.init({
    authProvider: done => done(null, accessToken),
  });
}

export async function getDevGraphClient() {
  return getTeamsGraphClient();
}

/**
 * Classifies Microsoft Graph errors into explicit status categories.
 */
export function classifyGraphError(error) {
  const statusCode = error?.statusCode ?? error?.status ?? error?.response?.status ?? null;
  const code = String(error?.code || error?.body?.error?.code || '').trim();
  const message = String(error?.message || error?.body?.error?.message || 'Unknown Graph error');
  const combined = `${code} ${message}`.toLowerCase();

  if (statusCode === 429 || combined.includes('throttl') || combined.includes('too many requests')) {
    return { category: 'THROTTLED', statusCode: 429, code, message };
  }

  if (
    statusCode === 403 ||
    combined.includes('accessdenied') ||
    combined.includes('authorization_requestdenied') ||
    combined.includes('applicationaccesspolicy') ||
    combined.includes('forbidden') ||
    combined.includes('insufficient privileges')
  ) {
    return { category: 'PERMISSION_DENIED', statusCode: 403, code, message };
  }

  if (
    statusCode === 404 ||
    combined.includes('itemnotfound') ||
    combined.includes('resourcenotfound') ||
    combined.includes('not found') ||
    combined.includes('erroritemnotfound')
  ) {
    if (combined.includes('transcript')) {
      return { category: 'TRANSCRIPT_NOT_FOUND', statusCode: 404, code, message };
    }
    return { category: 'MEETING_NOT_FOUND', statusCode: 404, code, message };
  }

  if (
    statusCode === 401 ||
    combined.includes('aadsts') ||
    combined.includes('unauthorized') ||
    combined.includes('invalid_client')
  ) {
    return { category: 'AUTH_ERROR', statusCode: statusCode || 401, code, message };
  }

  if (statusCode === 409 || combined.includes('processing') || combined.includes('not ready')) {
    return { category: 'PROCESSING_PENDING', statusCode: statusCode || 409, code, message };
  }

  return { category: 'UNKNOWN', statusCode, code, message };
}

function getRetryAfterMs(error, attempt, baseDelayMs) {
  const headers = error?.headers || error?.response?.headers;
  let retryAfterSec = null;

  if (headers) {
    if (typeof headers.get === 'function') {
      retryAfterSec = headers.get('retry-after') || headers.get('Retry-After');
    } else {
      retryAfterSec = headers['retry-after'] || headers['Retry-After'];
    }
  }

  const parsedSec = retryAfterSec ? parseInt(retryAfterSec, 10) : NaN;
  if (!isNaN(parsedSec) && parsedSec >= 0) {
    return Math.min(parsedSec * 1000, 60000);
  }
  return Math.min(baseDelayMs * Math.pow(2, attempt), 30000);
}

/**
 * Executes a Microsoft Graph request with automatic 429/503/504 throttling backoff.
 */
export async function executeGraphRequest(requestFn, { maxRetries = 3, baseDelayMs = 500, context = 'GraphRequest' } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (err) {
      lastErr = err;
      const status = err?.statusCode ?? err?.status ?? err?.response?.status;
      const isTransient = status === 429 || status === 503 || status === 504;

      if (!isTransient || attempt >= maxRetries) {
        throw err;
      }

      const waitMs = getRetryAfterMs(err, attempt, baseDelayMs);
      console.warn(`⏳ [${context}] Graph returned HTTP ${status}. Retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
  throw lastErr;
}

/**
 * Fetches all pages for a Graph collection endpoint via @odata.nextLink with throttling protection.
 */
export async function fetchAllGraphPages(graphClient, initialPath, { maxPages = 20, maxRetries = 3, baseDelayMs = 500, context = 'GraphPagination' } = {}) {
  const items = [];
  let nextPath = initialPath;
  let pageCount = 0;

  while (nextPath && pageCount < maxPages) {
    pageCount++;
    const currentPath = nextPath;
    const response = await executeGraphRequest(
      () => graphClient.api(currentPath).get(),
      { maxRetries, baseDelayMs, context: `${context}:page${pageCount}` }
    );

    if (Array.isArray(response?.value)) {
      items.push(...response.value);
    }

    nextPath = response?.['@odata.nextLink'] || null;
  }

  return {
    items,
    pagesFetched: pageCount,
    truncated: Boolean(nextPath),
  };
}

/**
 * Returns non-secret readiness metadata for the CustomerPulse-Dev Teams configuration.
 * Never exposes client secrets, tenant IDs, or access tokens.
 */
export function inspectDevGraphConfigReadiness() {
  const separateFromPrimaryTenant = Boolean(
    microsoftDevConfig.tenantId &&
    microsoftConfig.tenantId &&
    microsoftDevConfig.tenantId !== microsoftConfig.tenantId
  );
  const claimsStatus = verifyGraphTokenClaims(cachedDevToken);

  return {
    appConfigured: microsoftDevConfig.isConfigured,
    hasDevTenantId: Boolean(microsoftDevConfig.tenantId),
    hasDevClientId: Boolean(microsoftDevConfig.clientId),
    hasDevClientSecret: Boolean(microsoftDevConfig.clientSecret),
    separateFromPrimaryTenant,
    tenantMismatchDetected: separateFromPrimaryTenant && !microsoftTeamsConfig.resourceTenantVerified,
    resourceTenantVerified: microsoftTeamsConfig.resourceTenantVerified,
    authFlow: 'MSAL Client Credentials (Application Permissions)',
    requestedScope: 'https://graph.microsoft.com/.default',
    tokenCached: Boolean(cachedDevToken && cachedDevTokenExpiresAt > Date.now()),
    tokenClaims: claimsStatus,
    teamsSourceEnabled: microsoftTeamsConfig.enabled,
    calendarDiscoveryEnabled: microsoftTeamsConfig.calendarDiscoveryEnabled,
    policyName: microsoftTeamsConfig.policyName,
    policyCreatedInTenant: true,
    policyAdapterMode: microsoftTeamsConfig.policyAdapterMode,
    policyAssignmentStatus:
      microsoftTeamsConfig.policyAdapterMode === 'live' && microsoftTeamsConfig.adminCertThumbprint
        ? 'LIVE_CERTIFICATE_ADAPTER_CONFIGURED'
        : 'MOCK_QUEUE_RECORDING_PENDING_ASSIGNMENTS',
    outlookMailReadGranted: Boolean(claimsStatus.hasMailRead),
    outlookAdapterMode: (process.env.OUTLOOK_RBAC_ADAPTER_MODE || 'mock').trim().toUpperCase(),
    exchangeRbacScopeName: (process.env.EXCHANGE_RBAC_SCOPE_NAME || 'CustomerPulseApprovedOrganizersScope').trim(),
    outlookAssignmentStatus:
      (process.env.OUTLOOK_RBAC_ADAPTER_MODE || 'mock').trim().toLowerCase() === 'live' && microsoftTeamsConfig.adminCertThumbprint
        ? 'LIVE_EXCHANGE_RBAC_CONFIGURED'
        : 'MOCK_QUEUE_RECORDING_PENDING_OUTLOOK_CONFIGURATIONS',
    internalDomains: microsoftTeamsConfig.internalDomains,
    mockClientActive: Boolean(mockTeamsGraphClientFactory),
  };
}

export async function fetchMicrosoftContacts(mailbox) {
  if (!mailbox) {
    throw new Error('Mailbox is required to fetch Microsoft Contacts.');
  }

  // Uses the development client where Contacts.Read application permission is granted
  const graphClient = await getTeamsGraphClient();
  const initialPath = `/users/${encodeURIComponent(mailbox)}/contacts?$select=id,displayName,emailAddresses,birthday,companyName`;

  try {
    const { items } = await fetchAllGraphPages(graphClient, initialPath, { context: 'ContactsSync' });
    return items.map(contact => ({
      id: contact.id,
      displayName: contact.displayName,
      emailAddresses: contact.emailAddresses || [],
      birthday: contact.birthday,
      companyName: contact.companyName,
    }));
  } catch (error) {
    console.error(`[Microsoft Graph] Failed to fetch contacts for ${mailbox}:`, error.message);
    throw new Error(`Failed to fetch Microsoft Contacts: ${error.message}`);
  }
}

/**
 * Probes Microsoft Graph using the app-only CustomerPulse-Dev client to verify whether
 * `CustomerPulseDevPolicy` (`OnlineMeetings.Read.All`) is actively granted for a user in the tenant.
 * Never uses interactive administrator credentials.
 */
export async function probeLiveGraphTeamsAccess(organizerEmail) {
  if (process.env.NODE_ENV === 'test' || microsoftTeamsConfig.mockMode || !microsoftDevConfig.isConfigured) {
    return { verified: false, skipped: true, reason: 'MOCK_OR_TEST_MODE' };
  }

  const cleanEmail = String(organizerEmail || '').trim().toLowerCase();
  if (!cleanEmail) return { verified: false, reason: 'MISSING_EMAIL' };

  try {
    const token = await getMicrosoftDevAccessToken();
    const claims = verifyGraphTokenClaims(token);
    if (!claims.hasOnlineMeetingsReadAll) {
      return { verified: false, reason: 'MISSING_ONLINE_MEETINGS_READ_ALL' };
    }

    const client = await getTeamsGraphClient();
    const probeUrl = `https://teams.microsoft.com/l/meetup-join/policy-probe-${Date.now()}`;
    const filterExpr = `JoinWebUrl eq '${probeUrl}'`;
    await client
      .api(`/users/${encodeURIComponent(cleanEmail)}/onlineMeetings?$filter=${encodeURIComponent(filterExpr)}`)
      .get();

    return {
      verified: true,
      livePolicyVerified: true,
      status: 200,
      reason: 'LIVE_GRAPH_POLICY_VERIFIED',
    };
  } catch (err) {
    const classified = classifyGraphError(err);
    return {
      verified: false,
      livePolicyVerified: false,
      status: classified.statusCode || 403,
      reason:
        classified.statusCode === 404
          ? 'USER_NOT_FOUND_IN_DEV_TENANT'
          : classified.category === 'PERMISSION_DENIED'
            ? 'POLICY_NOT_ASSIGNED_IN_TENANT'
            : classified.category,
      error: classified.message,
    };
  }
}

/**
 * Probes Microsoft Graph using the app-only client to verify whether `Mail.Read` and
 * Exchange Online Application RBAC allow reading the specified organizer's mailbox.
 */
export async function probeLiveGraphOutlookAccess(mailboxEmail) {
  if (process.env.NODE_ENV === 'test' || microsoftTeamsConfig.mockMode || !microsoftDevConfig.isConfigured) {
    return { verified: false, skipped: true, reason: 'MOCK_OR_TEST_MODE' };
  }

  const cleanEmail = String(mailboxEmail || '').trim().toLowerCase();
  if (!cleanEmail) return { verified: false, reason: 'MISSING_EMAIL' };

  try {
    const token = await getMicrosoftDevAccessToken();
    const claims = verifyGraphTokenClaims(token);
    if (!claims.hasMailRead) {
      return {
        verified: false,
        exchangeRbacVerified: false,
        mailReadGranted: false,
        reason: 'MISSING_MAIL_READ_ON_TOKEN',
      };
    }

    const client = await getTeamsGraphClient();
    await client
      .api(`/users/${encodeURIComponent(cleanEmail)}/mailFolders/inbox/messages?$top=1&$select=id`)
      .get();

    return {
      verified: true,
      exchangeRbacVerified: true,
      mailReadGranted: true,
      status: 200,
      reason: 'LIVE_GRAPH_OUTLOOK_VERIFIED',
    };
  } catch (err) {
    const classified = classifyGraphError(err);
    return {
      verified: false,
      exchangeRbacVerified: false,
      mailReadGranted: false,
      status: classified.statusCode || 403,
      reason:
        classified.statusCode === 404
          ? 'USER_NOT_FOUND_IN_DEV_TENANT'
          : 'EXCHANGE_RBAC_NOT_GRANTED',
      error: classified.message,
    };
  }
}
