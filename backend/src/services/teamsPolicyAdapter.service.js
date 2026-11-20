/**
 * teamsPolicyAdapter.service.js
 *
 * Modular Microsoft Teams Application Access Policy Administration Adapter (Phase 4).
 *
 * Architectural Separation & Security Invariants:
 *  1. Separates Teams policy administration from organizer eligibility and Graph meeting calls.
 *  2. Uses one reusable Teams Application Access Policy (`CustomerPulseDevPolicy`) for all eligible employees.
 *     Never creates per-employee policies and never uses global policy assignment.
 *  3. Checks a user's existing Teams Application Access Policy before assignment and refuses to
 *     overwrite a conflicting policy.
 *  4. Never stores or accepts interactive administrator username/password credentials.
 *  5. Never assumes a Microsoft Graph token can execute Teams PowerShell policy commands.
 *  6. Uses a mock adapter (`MockTeamsPolicyAdapter`) by default until IT configures certificate-based
 *     Teams administration (`TEAMS_POLICY_ADAPTER_MODE=live` + `TEAMS_ADMIN_CERT_THUMBPRINT`).
 *  7. Marks mock assignments with `adapterMode: 'MOCK'` and `livePolicyVerified: false` so mock
 *     success never falsely marks a real employee as live-authorized in production.
 */

import { microsoftDevConfig, microsoftTeamsConfig } from '../config/microsoft.js';
import { probeLiveGraphTeamsAccess } from './microsoftGraph.service.js';
import { normalizeEmail, extractDomain } from './entityMatching.service.js';

export const DEFAULT_TEAMS_POLICY_NAME = 'CustomerPulseDevPolicy';

// In-memory state for the Mock Teams Policy Adapter (used in dev & automated test suites)
const mockDirectoryState = new Map();
let customPolicyAdapter = null;
let mockAutoGrantOverride = null;

function getMockAutoGrantEnvDefault() {
  return String(process.env.MOCK_AUTO_GRANT_ENABLED || 'false').trim().toLowerCase() === 'true';
}

/**
 * Configures simulated Teams user behavior in Mock mode (for testing conflicts, retries, invalid accounts, pre-verified grants, etc.).
 */
export function configureMockTeamsUser(email, config = {}) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return;
  const existing = mockDirectoryState.get(cleanEmail) || {};
  mockDirectoryState.set(cleanEmail, {
    ...existing,
    ...config,
  });
}

export function setMockAutoGrantEnabled(enabled) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Security Violation: setMockAutoGrantEnabled() is restricted to automated test environments (NODE_ENV=test).');
  }
  mockAutoGrantOverride = Boolean(enabled);
}

export function isMockAutoGrantEnabled() {
  if (process.env.NODE_ENV === 'test' && mockAutoGrantOverride !== null) {
    return mockAutoGrantOverride;
  }
  return getMockAutoGrantEnvDefault();
}

export function resetMockTeamsPolicyState() {
  mockDirectoryState.clear();
  customPolicyAdapter = null;
  mockAutoGrantOverride = null;
}

export function setCustomTeamsPolicyAdapter(adapter) {
  customPolicyAdapter = adapter;
}

export function getPolicyApplicationId() {
  return microsoftDevConfig.clientId || process.env.MICROSOFT_DEV_CLIENT_ID || 'cp-dev-app';
}

export function getReusablePolicyName() {
  return microsoftTeamsConfig.policyName || DEFAULT_TEAMS_POLICY_NAME;
}

function isCorporateTeamsDomain(email) {
  const domain = extractDomain(email);
  if (!domain) return false;
  return microsoftTeamsConfig.internalDomains.some(d => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Default Mock Teams Policy Adapter (Development & Automated Test Mode).
 * Simulates Teams user inspection, policy assignment, verification, conflict detection,
 * transient failures, and safe policy revocation.
 */
const mockTeamsPolicyAdapter = {
  mode: 'MOCK',

  async inspectUserTeamsAccount(email) {
    const cleanEmail = normalizeEmail(email);
    const sim = mockDirectoryState.get(cleanEmail) || {};

    if (sim.invalidTeamsAccount === true || !cleanEmail || !isCorporateTeamsDomain(cleanEmail)) {
      return {
        validTeamsAccount: false,
        email: cleanEmail,
        existingPolicy: null,
        dependentWorkflows: [],
        reason: sim.invalidReason || 'User does not have a valid corporate Microsoft Teams license/account.',
      };
    }

    return {
      validTeamsAccount: true,
      email: cleanEmail,
      existingPolicy: sim.existingPolicy || null,
      dependentWorkflows: Array.isArray(sim.dependentWorkflows) ? sim.dependentWorkflows : [],
      adapterMode: 'MOCK',
    };
  },

  async ensureReusablePolicyExists({ policyName, applicationId }) {
    // CustomerPulseDevPolicy is verified as created in the MSFT tenant; never creates per-user policies or global grants
    return {
      exists: true,
      policyCreatedInTenant: true,
      policyName: policyName || getReusablePolicyName(),
      applicationId: applicationId || getPolicyApplicationId(),
      scope: 'PER_USER_GRANT_ONLY',
      adapterMode: 'MOCK',
    };
  },

  async assignPolicyToUser({ email, policyName, simulateGrant = false }) {
    const cleanEmail = normalizeEmail(email);
    const targetPolicy = policyName || getReusablePolicyName();
    const sim = mockDirectoryState.get(cleanEmail) || {};

    // Check transient or permanent simulated failures
    if (typeof sim.failuresRemaining === 'number' && sim.failuresRemaining > 0) {
      sim.failuresRemaining -= 1;
      mockDirectoryState.set(cleanEmail, sim);
      const err = new Error(sim.failureMessage || 'Simulated transient Teams PowerShell administration timeout.');
      err.code = 'TEAMS_POLICY_TRANSIENT_ERROR';
      err.retryable = true;
      throw err;
    }

    if (sim.permanentFailure === true) {
      const err = new Error(sim.failureMessage || 'Simulated Teams policy assignment failure.');
      err.code = 'TEAMS_POLICY_ASSIGNMENT_FAILED';
      err.retryable = false;
      throw err;
    }

    const inspection = await this.inspectUserTeamsAccount(cleanEmail);
    if (!inspection.validTeamsAccount) {
      return {
        success: false,
        invalidTeamsAccount: true,
        conflict: false,
        error: inspection.reason,
        adapterMode: 'MOCK',
      };
    }

    // Never overwrite a different existing ApplicationAccessPolicy
    if (inspection.existingPolicy && inspection.existingPolicy !== targetPolicy) {
      return {
        success: false,
        conflict: true,
        existingPolicy: inspection.existingPolicy,
        error: `Existing ApplicationAccessPolicy "${inspection.existingPolicy}" conflicts with "${targetPolicy}". Will not overwrite.`,
        adapterMode: 'MOCK',
      };
    }

    const alreadyAssigned = inspection.existingPolicy === targetPolicy;

    // In live runtime (non-test), probe Microsoft Graph to detect if IT has already assigned CustomerPulseDevPolicy to this user
    const autoGrantActive = isMockAutoGrantEnabled();
    let liveGraphVerified = Boolean(sim.verifiedInTenant);
    let liveProbeReason = null;
    if (!alreadyAssigned && !simulateGrant && !autoGrantActive && !sim.simulateGrant && !liveGraphVerified) {
      const probeRes = await probeLiveGraphTeamsAccess(cleanEmail);
      if (probeRes.verified) {
        liveGraphVerified = true;
      } else {
        liveProbeReason = probeRes.reason || null;
      }
    }

    const shouldSimulateGrant = Boolean(
      alreadyAssigned ||
      simulateGrant ||
      autoGrantActive ||
      sim.simulateGrant === true ||
      liveGraphVerified
    );

    if (!shouldSimulateGrant) {
      // Default Mock Queue behavior (Requirement #7):
      // Validate account & policy readiness and record pending assignment in queue without making live Teams policy assignments.
      return {
        success: true,
        pendingAdminAutomation: true,
        alreadyAssigned: false,
        conflict: false,
        policyName: targetPolicy,
        applicationId: getPolicyApplicationId(),
        grantCommand: `Grant-CsApplicationAccessPolicy -Identity "${cleanEmail}" -PolicyName "${targetPolicy}"`,
        liveProbeReason,
        adapterMode: 'MOCK',
        livePolicyVerified: false,
      };
    }

    mockDirectoryState.set(cleanEmail, {
      ...sim,
      existingPolicy: targetPolicy,
      verifiedInTenant: liveGraphVerified,
      assignedAt: new Date().toISOString(),
    });

    return {
      success: true,
      pendingAdminAutomation: false,
      alreadyAssigned,
      conflict: false,
      policyName: targetPolicy,
      applicationId: getPolicyApplicationId(),
      adapterMode: liveGraphVerified ? 'LIVE_GRAPH_VERIFIED' : 'MOCK',
      livePolicyVerified: liveGraphVerified,
    };
  },

  async verifyUserPolicyAssignment({ email, policyName }) {
    const cleanEmail = normalizeEmail(email);
    const targetPolicy = policyName || getReusablePolicyName();
    const sim = mockDirectoryState.get(cleanEmail) || {};

    const assignedPolicy = sim.existingPolicy || null;
    const verified = assignedPolicy === targetPolicy;

    return {
      verified,
      assignedPolicy,
      expectedPolicy: targetPolicy,
      adapterMode: sim.verifiedInTenant ? 'LIVE_GRAPH_VERIFIED' : 'MOCK',
      livePolicyVerified: Boolean(sim.verifiedInTenant),
      verifiedAt: new Date().toISOString(),
    };
  },

  async revokePolicyFromUser({ email, policyName }) {
    const cleanEmail = normalizeEmail(email);
    const targetPolicy = policyName || getReusablePolicyName();
    const sim = mockDirectoryState.get(cleanEmail) || {};

    // Do not remove if another workflow depends on the user's policy or if the policy belongs to another app
    if (Array.isArray(sim.dependentWorkflows) && sim.dependentWorkflows.length > 0) {
      return {
        success: false,
        retainedForDependency: true,
        dependentWorkflows: sim.dependentWorkflows,
        error: `Policy retained because dependent workflow(s) require it: ${sim.dependentWorkflows.join(', ')}`,
        adapterMode: 'MOCK',
      };
    }

    if (sim.existingPolicy && sim.existingPolicy !== targetPolicy) {
      return {
        success: false,
        conflict: true,
        existingPolicy: sim.existingPolicy,
        error: `User is assigned to external policy "${sim.existingPolicy}", not "${targetPolicy}". Skipping removal.`,
        adapterMode: 'MOCK',
      };
    }

    mockDirectoryState.set(cleanEmail, {
      ...sim,
      existingPolicy: null,
      revokedAt: new Date().toISOString(),
    });

    return {
      success: true,
      revokedPolicy: targetPolicy,
      adapterMode: 'MOCK',
      revokedAt: new Date().toISOString(),
    };
  },
};

/**
 * Certificate-based Production Teams Policy Adapter skeleton.
 * Never uses interactive username/password or Microsoft Graph tokens.
 * Refuses execution until IT provisions certificate thumbprint + Teams Admin service principal.
 */
const liveCertificateTeamsPolicyAdapter = {
  mode: 'LIVE',

  assertConfigured() {
    if (process.env.TEAMS_ADMIN_USERNAME || process.env.TEAMS_ADMIN_PASSWORD) {
      throw new Error(
        'Security Violation: Interactive administrator username/password credentials are forbidden. Use certificate-based service principal authentication.'
      );
    }
    if (!microsoftTeamsConfig.adminCertThumbprint || !microsoftDevConfig.clientId || !microsoftDevConfig.tenantId) {
      const err = new Error(
        'Live Teams Policy Adapter requires TEAMS_ADMIN_CERT_THUMBPRINT, MICROSOFT_DEV_CLIENT_ID, and MICROSOFT_DEV_TENANT_ID.'
      );
      err.code = 'TEAMS_ADMIN_NOT_CONFIGURED';
      throw err;
    }
  },

  async inspectUserTeamsAccount(email) {
    this.assertConfigured();
    throw new Error(`Live Teams PowerShell bridge not yet enabled by IT for ${normalizeEmail(email)}.`);
  },

  async ensureReusablePolicyExists() {
    this.assertConfigured();
    throw new Error('Live Teams PowerShell bridge not yet enabled by IT.');
  },

  async assignPolicyToUser() {
    this.assertConfigured();
    throw new Error('Live Teams PowerShell bridge not yet enabled by IT.');
  },

  async verifyUserPolicyAssignment() {
    this.assertConfigured();
    throw new Error('Live Teams PowerShell bridge not yet enabled by IT.');
  },

  async revokePolicyFromUser() {
    this.assertConfigured();
    throw new Error('Live Teams PowerShell bridge not yet enabled by IT.');
  },
};

export function getTeamsPolicyAdapter() {
  if (customPolicyAdapter) return customPolicyAdapter;
  if (microsoftTeamsConfig.policyAdapterMode === 'live') {
    return liveCertificateTeamsPolicyAdapter;
  }
  return mockTeamsPolicyAdapter;
}

