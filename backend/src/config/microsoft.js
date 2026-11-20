import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is resolved reliably from backend root regardless of invocation directory.
// Do not override explicit test environment variables when NODE_ENV === 'test'.
dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  override: process.env.NODE_ENV !== 'test',
});

function isRealValue(val) {
  return Boolean(
    val &&
    typeof val === 'string' &&
    val.trim().length > 0 &&
    !val.trim().startsWith('<') &&
    !val.trim().startsWith('your_')
  );
}

// Primary / Production Microsoft App configuration (Preserved for Outlook Mail.Read)
const primaryTenantId = process.env.MICROSOFT_TENANT_ID || null;
const primaryClientId = process.env.MICROSOFT_CLIENT_ID || null;
const primaryClientSecret = process.env.MICROSOFT_CLIENT_SECRET || null;

const isPrimaryConfigured = Boolean(
  isRealValue(primaryTenantId) &&
  isRealValue(primaryClientId) &&
  isRealValue(primaryClientSecret)
);

export const microsoftConfig = {
  tenantId: primaryTenantId,
  clientId: primaryClientId,
  clientSecret: primaryClientSecret,
  authority: primaryTenantId ? `https://login.microsoftonline.com/${primaryTenantId}` : null,
  graphBaseUrl: 'https://graph.microsoft.com/v1.0',
  isConfigured: isPrimaryConfigured,
};

// CustomerPulse-Dev Microsoft App configuration (Contacts.Read & Teams Meetings/Transcripts)
// Note: Intentionally does NOT fall back to primary tenant/client credentials so Teams calls
// never accidentally target the primary Outlook tenant.
const devTenantId = process.env.MICROSOFT_DEV_TENANT_ID || null;
const devClientId = process.env.MICROSOFT_DEV_CLIENT_ID || null;
const devClientSecret = process.env.MICROSOFT_DEV_CLIENT_SECRET || null;

const isDevConfigured = Boolean(
  isRealValue(devTenantId) &&
  isRealValue(devClientId) &&
  isRealValue(devClientSecret)
);

export const microsoftDevConfig = {
  tenantId: devTenantId,
  clientId: devClientId,
  clientSecret: devClientSecret,
  authority: devTenantId ? `https://login.microsoftonline.com/${devTenantId}` : null,
  graphBaseUrl: 'https://graph.microsoft.com/v1.0',
  isConfigured: isDevConfigured,
};

// Feature & Governance Flags for Microsoft Teams Integration
export const microsoftTeamsConfig = {
  get enabled() {
    if (process.env.MICROSOFT_TEAMS_SOURCE_ENABLED !== undefined) {
      return process.env.MICROSOFT_TEAMS_SOURCE_ENABLED.trim().toLowerCase() === 'true';
    }
    return process.env.NODE_ENV !== 'test' && isDevConfigured;
  },
  get calendarDiscoveryEnabled() {
    if (process.env.GRAPH_CALENDAR_DISCOVERY_ENABLED !== undefined) {
      return process.env.GRAPH_CALENDAR_DISCOVERY_ENABLED.trim().toLowerCase() === 'true';
    }
    return process.env.NODE_ENV !== 'test' && isDevConfigured;
  },
  get resourceTenantVerified() {
    if (process.env.MICROSOFT_RESOURCE_TENANT_VERIFIED !== undefined) {
      return process.env.MICROSOFT_RESOURCE_TENANT_VERIFIED.trim().toLowerCase() === 'true';
    }
    return false;
  },
  get syncIntervalMs() {
    return parseInt(process.env.TEAMS_SYNC_INTERVAL_MS, 10) || (15 * 60 * 1000);
  },
  get policyName() {
    return (process.env.MICROSOFT_TEAMS_POLICY_NAME || 'CustomerPulseDevPolicy').trim();
  },
  get policyAdapterMode() {
    return (process.env.TEAMS_POLICY_ADAPTER_MODE || 'mock').trim().toLowerCase();
  },
  get adminCertThumbprint() {
    return (process.env.TEAMS_ADMIN_CERT_THUMBPRINT || '').trim() || null;
  },
  get mockMode() {
    return (process.env.MICROSOFT_TEAMS_MOCK || 'false').trim().toLowerCase() === 'true';
  },
  get mockAutoGrantEnabled() {
    return (process.env.MOCK_AUTO_GRANT_ENABLED || 'false').trim().toLowerCase() === 'true';
  },
  get internalDomains() {
    return (process.env.INTERNAL_EMPLOYEE_DOMAINS || 'nestgroup.net,sfotechnologies.net,nestdigital.com')
      .split(',')
      .map(d => d.trim().toLowerCase())
      .filter(Boolean);
  },
};
