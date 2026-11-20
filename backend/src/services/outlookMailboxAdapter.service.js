import { microsoftConfig, microsoftDevConfig, microsoftTeamsConfig } from '../config/microsoft.js';
import { probeLiveGraphOutlookAccess } from './microsoftGraph.service.js';

export const OUTLOOK_STATUS = {
  NOT_ELIGIBLE: 'Not Eligible',
  PENDING_CONFIGURATION: 'Pending Approval/Configuration',
  AUTHORIZED: 'Authorized',
  FAILED: 'Failed',
  PENDING_REVOCATION: 'Pending Revocation',
  REVOKED: 'Revoked',
};

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function getExchangeApplicationScopeName() {
  return (process.env.EXCHANGE_RBAC_SCOPE_NAME || 'CustomerPulseApprovedOrganizersScope').trim();
}

export function getOutlookPolicyApplicationId() {
  return microsoftDevConfig.clientId || microsoftConfig.clientId || '<IT_PROVISIONED_CLIENT_ID>';
}

/**
 * In-memory simulation state for MockOutlookMailboxAdapter.
 * Allows tests to simulate:
 *  - Pending Exchange RBAC / Mail.Read configuration (default)
 *  - Independent Outlook authorization (Exchange RBAC + Mail.Read verified)
 *  - Missing Mail.Read permission (even when Calendars.Read / Contacts.Read exist)
 *  - Transient Exchange admin failures and retries
 */
const mockMailboxState = new Map();
let customOutlookAdapter = null;
let mockOutlookAutoGrantOverride = null;

function getMockAutoGrantEnvDefault() {
  return String(process.env.MOCK_AUTO_GRANT_ENABLED || 'false').trim().toLowerCase() === 'true';
}

export function setMockOutlookAutoGrantEnabled(enabled) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Security Violation: setMockOutlookAutoGrantEnabled() is restricted to automated test environments (NODE_ENV=test).');
  }
  mockOutlookAutoGrantOverride = Boolean(enabled);
}

export function isMockOutlookAutoGrantEnabled() {
  if (process.env.NODE_ENV === 'test' && mockOutlookAutoGrantOverride !== null) {
    return mockOutlookAutoGrantOverride;
  }
  return getMockAutoGrantEnvDefault();
}

export function configureMockOutlookMailbox(email, config = {}) {
  const clean = normalizeEmail(email);
  if (!clean) return;
  const current = mockMailboxState.get(clean) || {};
  mockMailboxState.set(clean, { ...current, ...config });
}

export function resetMockOutlookMailboxState() {
  mockMailboxState.clear();
  customOutlookAdapter = null;
  mockOutlookAutoGrantOverride = null;
}

export function setCustomOutlookMailboxAdapter(adapter) {
  customOutlookAdapter = adapter;
}

const mockOutlookMailboxAdapter = {
  mode: 'MOCK',

  async inspectUserMailbox(email) {
    const clean = normalizeEmail(email);
    const sim = mockMailboxState.get(clean) || {};

    if (!clean || !clean.includes('@')) {
      return {
        valid: false,
        email: clean,
        reason: 'INVALID_EMAIL_FORMAT',
      };
    }

    if (clean === '*' || clean === 'all') {
      return {
        valid: false,
        email: clean,
        reason: 'UNRESTRICTED_TENANT_WIDE_ACCESS_FORBIDDEN',
      };
    }

    if (sim.invalidMailbox) {
      return {
        valid: false,
        email: clean,
        reason: sim.invalidReason || 'MAILBOX_NOT_PROVISIONED',
      };
    }

    return {
      valid: true,
      email: clean,
      inExchangeScope: Boolean(sim.inExchangeScope),
      scopeName: sim.scopeName || null,
      mailReadGranted: sim.mailReadGranted !== undefined ? Boolean(sim.mailReadGranted) : true,
    };
  },

  async assignMailboxAccess({ email, scopeName, simulateGrant = false }) {
    const cleanEmail = normalizeEmail(email);
    const targetScope = scopeName || getExchangeApplicationScopeName();

    if (!cleanEmail || cleanEmail === '*' || cleanEmail === 'all' || targetScope === '*' || targetScope.toLowerCase() === 'global') {
      throw new Error(
        'Security Violation: Unrestricted tenant-wide Outlook mailbox access is forbidden. Mailboxes must be explicitly scoped via Exchange Online Application RBAC.'
      );
    }

    const sim = mockMailboxState.get(cleanEmail) || {};

    if (sim.invalidMailbox) {
      return {
        success: false,
        invalidMailbox: true,
        error: sim.invalidReason || `Employee ${cleanEmail} does not have a valid Exchange Online mailbox.`,
        adapterMode: 'MOCK',
      };
    }

    if (typeof sim.failuresRemaining === 'number' && sim.failuresRemaining > 0) {
      sim.failuresRemaining -= 1;
      mockMailboxState.set(cleanEmail, sim);
      throw new Error(sim.failureMessage || `Simulated Exchange Online RBAC timeout for ${cleanEmail}`);
    }

    if (sim.mailReadGranted === false) {
      throw new Error(
        `Missing Microsoft Graph Mail.Read application permission for ${cleanEmail}. Calendars.Read and Contacts.Read do not grant email-reading access.`
      );
    }

    const autoGrantActive = isMockOutlookAutoGrantEnabled();
    let liveGraphVerified = Boolean(sim.verifiedInExchange);
    let liveProbeReason = null;
    if (!simulateGrant && !autoGrantActive && !sim.simulateGrant && !liveGraphVerified) {
      const probeRes = await probeLiveGraphOutlookAccess(cleanEmail);
      if (probeRes.verified) {
        liveGraphVerified = true;
      } else {
        liveProbeReason = probeRes.reason || null;
      }
    }

    const shouldSimulateGrant = Boolean(
      simulateGrant ||
      autoGrantActive ||
      sim.simulateGrant === true ||
      liveGraphVerified
    );

    const appId = getOutlookPolicyApplicationId();
    const rbacCommand =
      `New-ManagementScope -Name "${targetScope}" -RecipientRestrictionFilter "PrimarySmtpAddress -eq '${cleanEmail}'"; ` +
      `New-ManagementRoleAssignment -App "${appId}" -Role "Application Mail.Read" -CustomResourceScope "${targetScope}"`;

    if (!shouldSimulateGrant) {
      mockMailboxState.set(cleanEmail, {
        ...sim,
        pendingScope: targetScope,
        queuedAt: new Date().toISOString(),
      });

      return {
        success: true,
        pendingConfiguration: true,
        scopeName: targetScope,
        applicationId: appId,
        rbacCommand,
        liveProbeReason,
        adapterMode: 'MOCK',
        exchangeRbacVerified: false,
        mailReadGranted: false,
        liveOutlookVerified: false,
      };
    }

    mockMailboxState.set(cleanEmail, {
      ...sim,
      inExchangeScope: true,
      verifiedInExchange: liveGraphVerified,
      scopeName: targetScope,
      mailReadGranted: true,
      assignedAt: new Date().toISOString(),
    });

    return {
      success: true,
      pendingConfiguration: false,
      scopeName: targetScope,
      applicationId: appId,
      rbacCommand,
      adapterMode: liveGraphVerified ? 'LIVE_GRAPH_VERIFIED' : 'MOCK',
      exchangeRbacVerified: true,
      mailReadGranted: true,
      liveOutlookVerified: liveGraphVerified,
    };
  },

  async verifyMailboxAccess({ email, scopeName }) {
    const cleanEmail = normalizeEmail(email);
    const targetScope = scopeName || getExchangeApplicationScopeName();
    const sim = mockMailboxState.get(cleanEmail) || {};

    const verified = Boolean(sim.inExchangeScope && sim.scopeName === targetScope && sim.mailReadGranted !== false);
    const liveOutlookVerified = Boolean(verified && sim.verifiedInExchange);
    return {
      verified,
      scopeName: sim.scopeName || null,
      expectedScope: targetScope,
      exchangeRbacVerified: Boolean(sim.inExchangeScope),
      mailReadGranted: Boolean(sim.mailReadGranted !== false && sim.inExchangeScope),
      liveOutlookVerified,
      adapterMode: liveOutlookVerified ? 'LIVE_GRAPH_VERIFIED' : 'MOCK',
      verifiedAt: new Date().toISOString(),
    };
  },

  async revokeMailboxAccess({ email, scopeName }) {
    const cleanEmail = normalizeEmail(email);
    const targetScope = scopeName || getExchangeApplicationScopeName();
    const sim = mockMailboxState.get(cleanEmail) || {};

    mockMailboxState.set(cleanEmail, {
      ...sim,
      inExchangeScope: false,
      scopeName: null,
      revokedAt: new Date().toISOString(),
    });

    return {
      success: true,
      revokedScope: targetScope,
      adapterMode: 'MOCK',
      revokedAt: new Date().toISOString(),
    };
  },
};

const liveExchangeRbacAdapter = {
  mode: 'LIVE',

  assertConfigured() {
    if (
      process.env.TEAMS_ADMIN_USERNAME ||
      process.env.TEAMS_ADMIN_PASSWORD ||
      process.env.EXCHANGE_ADMIN_USERNAME ||
      process.env.EXCHANGE_ADMIN_PASSWORD
    ) {
      throw new Error(
        'Security Violation: Interactive administrator username/password credentials are forbidden. Use certificate-based Exchange Online service principal authentication.'
      );
    }
    if (!microsoftTeamsConfig.adminCertThumbprint) {
      const err = new Error(
        'Live Exchange Online RBAC Adapter requires certificate-based service principal configuration (TEAMS_ADMIN_CERT_THUMBPRINT).'
      );
      err.code = 'EXCHANGE_RBAC_NOT_CONFIGURED';
      throw err;
    }
  },

  async inspectUserMailbox(email) {
    this.assertConfigured();
    throw new Error(`Live Exchange Online RBAC bridge not yet enabled by IT for ${normalizeEmail(email)}.`);
  },

  async assignMailboxAccess() {
    this.assertConfigured();
    throw new Error('Live Exchange Online RBAC bridge not yet enabled by IT.');
  },

  async verifyMailboxAccess() {
    this.assertConfigured();
    throw new Error('Live Exchange Online RBAC bridge not yet enabled by IT.');
  },

  async revokeMailboxAccess() {
    this.assertConfigured();
    throw new Error('Live Exchange Online RBAC bridge not yet enabled by IT.');
  },
};

export function getOutlookMailboxAdapter() {
  if (customOutlookAdapter) return customOutlookAdapter;
  if ((process.env.OUTLOOK_RBAC_ADAPTER_MODE || 'mock').trim().toLowerCase() === 'live') {
    return liveExchangeRbacAdapter;
  }
  return mockOutlookMailboxAdapter;
}
