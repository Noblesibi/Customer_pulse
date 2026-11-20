/**
 * organizerSync.service.js
 *
 * Automated Account Owner & Key Contact Owner Identification and
 * Microsoft Teams Organizer Lifecycle Engine (Phases 2, 3, 4 & 11).
 *
 * Key Guarantees:
 *  - Zero manual employee approval, zero manual organizer selection, zero CSV re-uploads.
 *  - Automatically identifies Account Owners and Key Contact Owners from CRM Accounts & Contacts.
 *  - Matches against `Users` using Employee ID, corporate Email, and verified UID (never ambiguous names).
 *  - Deduplicates employees across multiple accounts/contacts and duplicate `Users` rows.
 *  - Excludes inactive employees and invalid Teams accounts.
 *  - Tracks ownership changes in `OrganizerOwnershipHistory` without losing history.
 *  - Manages policy assignment & revocation queue (`OrganizerPolicySync`) and audit trail (`OrganizerApprovalHistory`).
 */

import { db, logActivity } from '../config/database.js';
import { normalizeEmail, extractDomain } from './entityMatching.service.js';
import { microsoftTeamsConfig } from '../config/microsoft.js';
import {
  getTeamsPolicyAdapter,
  getReusablePolicyName,
  getPolicyApplicationId,
  isMockAutoGrantEnabled,
} from './teamsPolicyAdapter.service.js';
import {
  OUTLOOK_STATUS,
  getOutlookMailboxAdapter,
  getExchangeApplicationScopeName,
  isMockOutlookAutoGrantEnabled,
} from './outlookMailboxAdapter.service.js';

export { OUTLOOK_STATUS };

export const ORGANIZER_STATUS = {
  NOT_ELIGIBLE: 'Not Eligible',
  PENDING_ASSIGNMENT: 'Pending Assignment',
  AUTHORIZED: 'Authorized',
  ASSIGNMENT_FAILED: 'Assignment Failed',
  FAILED: 'Assignment Failed',
  PENDING_REVOCATION: 'Pending Revocation',
  REVOKED: 'Revoked',
  EMPLOYEE_NOT_MATCHED: 'Employee Not Matched',
  INVALID_TEAMS_ACCOUNT: 'Invalid Teams Account',
};

let isRecalculationRunning = false;

export function isEmployeeActive(user) {
  if (!user) return false;
  if (user.isActive === false || user.isactive === 0 || user.isactive === '0' || user.active === false) {
    return false;
  }
  const statusStr = String(user.status || '').trim().toLowerCase();
  if (['inactive', 'terminated', 'disabled', 'suspended', 'deactivated', 'resigned'].includes(statusStr)) {
    return false;
  }
  return true;
}

export function isCrmEntityActive(entity) {
  if (!entity) return false;
  if (entity.isActive === false || entity.active === false) return false;
  const statusStr = String(entity.status || '').trim().toLowerCase();
  if (['inactive', 'deactivated', 'archived', 'deleted', 'closed'].includes(statusStr)) {
    return false;
  }
  return true;
}

export function isEligibleKeyContact(contact) {
  if (!isCrmEntityActive(contact)) return false;
  const kc = String(contact.keyContact ?? '').trim().toLowerCase();
  if (kc === 'no' || kc === 'false' || kc === '0') {
    return false;
  }
  return true;
}

export function isInternalCorporateEmail(email) {
  const clean = normalizeEmail(email);
  const domain = extractDomain(clean);
  if (!domain) return false;
  const allowedDomains = new Set([
    ...(microsoftTeamsConfig.internalDomains || []),
    'nestgroup.net',
    'sfotechnologies.net',
    'nestdigital.com',
    'nestgroup.com',
  ]);
  for (const d of allowedDomains) {
    if (domain === d || domain.endsWith(`.${d}`)) return true;
  }
  return false;
}

/**
 * Deduplicates `Users` rows that share the same corporate email address (Test #12),
 * preferring active records with a populated `employeeId`.
 */
export function buildEmployeeDirectoryIndex(rawUsers = []) {
  const byEmail = new Map();
  const byEmployeeId = new Map();
  const byUid = new Map();
  const byNormalizedName = new Map();
  let duplicateEmailCount = 0;

  // Exclude synthetic system seed admin if real employees exist
  const validUsers = (rawUsers || []).filter(u => u && (u.uid || u.email));

  for (const rawUser of validUsers) {
    const email = normalizeEmail(rawUser.email);
    const empId = String(rawUser.employeeId || rawUser.empId || '').trim();
    const uid = String(rawUser.uid || rawUser.id || '').trim();

    if (email && byEmail.has(email)) {
      duplicateEmailCount++;
      const prev = byEmail.get(email);
      const prevScore = (isEmployeeActive(prev) ? 10 : 0) + (prev.employeeId ? 5 : 0);
      const currScore = (isEmployeeActive(rawUser) ? 10 : 0) + (empId ? 5 : 0);
      const chosen = currScore > prevScore ? { ...prev, ...rawUser, uid: prev.uid || uid } : { ...rawUser, ...prev };
      byEmail.set(email, chosen);
      if (chosen.uid) byUid.set(chosen.uid, chosen);
      if (chosen.employeeId) byEmployeeId.set(String(chosen.employeeId).trim().toLowerCase(), chosen);
      continue;
    }

    const canonical = {
      ...rawUser,
      uid: uid || (email ? `emp_${email.replace(/[^a-z0-9]/g, '_')}` : ''),
      email,
      employeeId: empId,
      name: String(rawUser.name || '').trim(),
    };

    if (email) byEmail.set(email, canonical);
    if (canonical.uid) byUid.set(canonical.uid, canonical);
    if (empId) byEmployeeId.set(empId.toLowerCase(), canonical);
  }

  // Build name map from deduplicated employees (only used when unambiguous)
  const uniqueEmployees = Array.from(new Set([...byEmail.values(), ...byUid.values()]));
  for (const emp of uniqueEmployees) {
    const normName = String(emp.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!normName || normName === 'admin user' || normName === 'system user') continue;
    const list = byNormalizedName.get(normName) || [];
    if (!list.some(e => e.uid === emp.uid || (e.email && e.email === emp.email))) {
      list.push(emp);
      byNormalizedName.set(normName, list);
    }
  }

  return {
    byEmail,
    byEmployeeId,
    byUid,
    byNormalizedName,
    uniqueEmployees,
    duplicateEmailCount,
  };
}

/**
 * Matches an Account Owner or Key Contact Owner reference against the `Users` directory.
 * Priority:
 *  1. Employee ID (`ownerEmployeeId` or `ownerId` matching `Users.employeeId`)
 *  2. Corporate Email (`ownerEmail` matching `Users.email`)
 *  3. Direct UID (`ownerId` matching `Users.uid`, only if it does not contradict explicit email/name)
 *  4. Unambiguous exact Name (only if no email/employeeId was provided AND exactly 1 employee has that name)
 */
export function matchOwnerReferenceToEmployee(ownerRef = {}, directoryIndex) {
  const rawId = String(ownerRef.ownerId || '').trim();
  const rawEmpId = String(ownerRef.ownerEmployeeId || ownerRef.employeeId || '').trim();
  const rawEmail = normalizeEmail(ownerRef.ownerEmail || ownerRef.email || '');
  const rawName = String(ownerRef.ownerName || ownerRef.name || '').trim();
  const normName = rawName.toLowerCase().replace(/\s+/g, ' ');

  if (!rawId && !rawEmpId && !rawEmail && !rawName) {
    return { matched: false, isSystemPlaceholder: true, reason: 'EMPTY_OWNER_REFERENCE', employee: null };
  }

  // Ignore synthetic seed admin placeholder when no corporate email was specified
  if (
    !rawEmail &&
    !rawEmpId &&
    (rawId === 'mock-admin-uid' || ['admin user', 'system user', 'auto-assigned admin'].includes(normName))
  ) {
    return { matched: false, isSystemPlaceholder: true, reason: 'SYSTEM_DEFAULT_PLACEHOLDER', employee: null };
  }

  // 1. Match by explicit Employee ID
  if (rawEmpId) {
    const empByCode = directoryIndex.byEmployeeId.get(rawEmpId.toLowerCase());
    if (empByCode) {
      return {
        matched: true,
        matchMethod: 'EMPLOYEE_ID',
        isActive: isEmployeeActive(empByCode),
        employee: empByCode,
      };
    }
    // If an explicit employeeId was provided alongside an email, still allow exact corporate email match
    if (!rawEmail) {
      return {
        matched: false,
        reason: 'EMPLOYEE_ID_NOT_FOUND',
        employee: null,
        rawReference: { ownerEmployeeId: rawEmpId, ownerEmail: rawEmail, ownerName: rawName },
      };
    }
  }

  // Also check if `ownerId` is actually an Employee ID in Users
  if (rawId && directoryIndex.byEmployeeId.has(rawId.toLowerCase())) {
    const empByCode = directoryIndex.byEmployeeId.get(rawId.toLowerCase());
    return {
      matched: true,
      matchMethod: 'EMPLOYEE_ID',
      isActive: isEmployeeActive(empByCode),
      employee: empByCode,
    };
  }

  // 2. Match by Corporate Email Address
  if (rawEmail) {
    const empByEmail = directoryIndex.byEmail.get(rawEmail);
    if (empByEmail) {
      return {
        matched: true,
        matchMethod: 'CORPORATE_EMAIL',
        isActive: isEmployeeActive(empByEmail),
        employee: empByEmail,
      };
    }
    return {
      matched: false,
      reason: 'EMAIL_NOT_FOUND_IN_USERS',
      employee: null,
      rawReference: { ownerId: rawId, ownerEmployeeId: rawEmpId, ownerEmail: rawEmail, ownerName: rawName },
    };
  }

  // 3. Match by UID (only when it does not conflict with an explicit different ownerName)
  if (rawId && rawId !== 'mock-admin-uid') {
    const empByUid = directoryIndex.byUid.get(rawId);
    if (empByUid) {
      const uidName = String(empByUid.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const nameConflicts = normName && normName !== 'system user' && uidName && normName !== uidName;
      if (!nameConflicts) {
        return {
          matched: true,
          matchMethod: 'USER_UID',
          isActive: isEmployeeActive(empByUid),
          employee: empByUid,
        };
      }
    }
  }

  // 4. Unambiguous Name fallback (NEVER match if >= 2 employees share the name)
  if (normName && normName !== 'system user' && normName !== 'admin user' && normName !== 'unknown user') {
    const candidates = directoryIndex.byNormalizedName.get(normName) || [];
    if (candidates.length === 1) {
      return {
        matched: true,
        matchMethod: 'UNAMBIGUOUS_NAME',
        isActive: isEmployeeActive(candidates[0]),
        employee: candidates[0],
      };
    }
    if (candidates.length > 1) {
      return {
        matched: false,
        reason: 'AMBIGUOUS_EMPLOYEE_NAME',
        employee: null,
        rawReference: { ownerId: rawId, ownerName: rawName },
      };
    }
  }

  return {
    matched: false,
    reason: 'EMPLOYEE_NOT_FOUND',
    employee: null,
    rawReference: { ownerId: rawId, ownerEmployeeId: rawEmpId, ownerEmail: rawEmail, ownerName: rawName },
  };
}

async function recordApprovalAudit({
  organizerKey,
  uid = null,
  employeeId = null,
  email = null,
  previousStatus = null,
  newStatus,
  action,
  policyName = getReusablePolicyName(),
  adapterMode = 'MOCK',
  reason = null,
  details = null,
}) {
  const auditId = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  await db.collection('organizerapprovalhistory').doc(auditId).set({
    auditId,
    organizerKey,
    uid,
    employeeId,
    email,
    previousStatus,
    newStatus,
    action,
    policyName,
    adapterMode,
    reason,
    details,
    createdAt: new Date().toISOString(),
  });
}

async function recordOwnershipChange({
  entityType,
  entityId,
  entityName,
  accountId = null,
  previousOwner = null,
  newOwner = null,
  changeType,
  triggerSource = 'SYSTEM',
}) {
  const historyId = `own_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  await db.collection('organizerownershiphistory').doc(historyId).set({
    historyId,
    entityType,
    entityId,
    entityName: entityName || null,
    accountId: accountId || (entityType === 'ACCOUNT' ? entityId : null),
    previousOwnerUid: previousOwner?.uid || null,
    previousOwnerEmail: previousOwner?.email || null,
    previousOwnerEmployeeId: previousOwner?.employeeId || null,
    previousOwnerName: previousOwner?.name || null,
    newOwnerUid: newOwner?.uid || null,
    newOwnerEmail: newOwner?.email || null,
    newOwnerEmployeeId: newOwner?.employeeId || null,
    newOwnerName: newOwner?.name || null,
    changeType,
    triggerSource,
    createdAt: new Date().toISOString(),
  });
}

async function enqueuePolicySyncJob({
  organizerKey,
  uid = null,
  employeeId = null,
  email,
  channel = 'TEAMS',
  action,
  policyName = getReusablePolicyName(),
  applicationId = getPolicyApplicationId(),
}) {
  const existingSnap = await db.collection('organizerpolicysync').where('organizerKey', '==', organizerKey).get();
  const existingJobs = existingSnap.docs.map(d => d.data());
  const activeJob = existingJobs.find(
    j =>
      j.action === action &&
      (j.status === 'QUEUED' ||
        j.status === 'IN_PROGRESS' ||
        j.status === 'PENDING_ASSIGNMENT' ||
        j.status === 'PENDING_CONFIGURATION')
  );
  if (activeJob) {
    return activeJob;
  }

  // If queuing REVOKE_POLICY, cancel any open pending ASSIGN_POLICY jobs for this organizer
  if (action === 'REVOKE_POLICY') {
    const nowCancelIso = new Date().toISOString();
    for (const j of existingJobs) {
      if (j.action === 'ASSIGN_POLICY' && (j.status === 'QUEUED' || j.status === 'PENDING_ASSIGNMENT')) {
        await db.collection('organizerpolicysync').doc(j.jobId).update({
          status: 'CANCELLED',
          lastError: 'Superseded by REVOKE_POLICY after ownership removal.',
          updatedAt: nowCancelIso,
        });
      }
    }
  }

  // If queuing REVOKE_OUTLOOK_MAILBOX, cancel any open pending ASSIGN_OUTLOOK_MAILBOX jobs for this organizer
  if (action === 'REVOKE_OUTLOOK_MAILBOX') {
    const nowCancelIso = new Date().toISOString();
    for (const j of existingJobs) {
      if (j.action === 'ASSIGN_OUTLOOK_MAILBOX' && (j.status === 'QUEUED' || j.status === 'PENDING_CONFIGURATION')) {
        await db.collection('organizerpolicysync').doc(j.jobId).update({
          status: 'CANCELLED',
          lastError: 'Superseded by REVOKE_OUTLOOK_MAILBOX after ownership removal.',
          updatedAt: nowCancelIso,
        });
      }
    }
  }

  const adapterMode =
    channel === 'OUTLOOK'
      ? (getOutlookMailboxAdapter().mode || 'MOCK')
      : (getTeamsPolicyAdapter().mode || 'MOCK');

  const jobId = `pol_${action.toLowerCase()}_${organizerKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)}_${Date.now()}`;
  const now = new Date().toISOString();
  const job = {
    jobId,
    organizerKey,
    uid,
    employeeId,
    email: normalizeEmail(email),
    channel,
    action,
    policyName,
    applicationId,
    status: 'QUEUED',
    adapterMode,
    existingPolicyBefore: null,
    dependentWorkflows: [],
    attemptCount: 0,
    maxAttempts: 3,
    nextRetryAt: now,
    lastError: null,
    verificationResult: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('organizerpolicysync').doc(jobId).set(job);
  return job;
}

/**
 * Processes pending policy assignment & revocation jobs in `OrganizerPolicySync`
 * using the configured Teams Policy Adapter and Outlook Exchange RBAC Adapter independently.
 */
export async function processPolicySyncQueue({
  forceRetryAllFailed = false,
  simulateGrant = false,
  simulateTeamsGrant = undefined,
  simulateOutlookGrant = undefined,
  recheckLiveGraph = process.env.NODE_ENV !== 'test',
} = {}) {
  const effectiveSimulateTeams = simulateTeamsGrant !== undefined ? Boolean(simulateTeamsGrant) : Boolean(simulateGrant);
  const effectiveSimulateOutlook = simulateOutlookGrant !== undefined ? Boolean(simulateOutlookGrant) : Boolean(simulateGrant);

  const adapter = getTeamsPolicyAdapter();
  const outlookAdapter = getOutlookMailboxAdapter();
  const policyName = getReusablePolicyName();
  const outlookScopeName = getExchangeApplicationScopeName();
  const applicationId = getPolicyApplicationId();

  await adapter.ensureReusablePolicyExists({ policyName, applicationId }).catch(() => { });

  const jobsSnap = await db.collection('organizerpolicysync').get();
  const allJobs = jobsSnap.docs.map(d => d.data());
  const nowMs = Date.now();

  const runnableJobs = allJobs.filter(job => {
    if (job.status === 'QUEUED') return true;
    if ((effectiveSimulateTeams || recheckLiveGraph) && job.status === 'PENDING_ASSIGNMENT' && job.action === 'ASSIGN_POLICY') return true;
    if ((effectiveSimulateOutlook || recheckLiveGraph) && job.status === 'PENDING_CONFIGURATION' && job.action === 'ASSIGN_OUTLOOK_MAILBOX') return true;
    if (forceRetryAllFailed && job.status === 'FAILED' && !job.conflictBlocked) return true;
    if (
      job.status === 'FAILED' &&
      job.attemptCount < (job.maxAttempts || 3) &&
      job.nextRetryAt &&
      new Date(job.nextRetryAt).getTime() <= nowMs
    ) {
      return true;
    }
    return false;
  });

  const summary = {
    processed: 0,
    authorized: 0,
    pendingAssignments: 0,
    revoked: 0,
    failed: 0,
    conflicts: 0,
    invalidAccounts: 0,
    outlookAuthorized: 0,
    outlookPendingConfigurations: 0,
    outlookRevoked: 0,
    outlookFailed: 0,
  };

  for (const job of runnableJobs) {
    summary.processed++;
    const nowIso = new Date().toISOString();
    const attemptCount = (job.attemptCount || 0) + 1;

    await db.collection('organizerpolicysync').doc(job.jobId).update({
      status: 'IN_PROGRESS',
      attemptCount,
      updatedAt: nowIso,
    });

    const orgDoc = await db.collection('authorizedorganizers').doc(job.organizerKey).get();
    const orgRecord = orgDoc.exists ? orgDoc.data() : null;
    if (!orgRecord) {
      await db.collection('organizerpolicysync').doc(job.jobId).update({
        status: 'CANCELLED',
        updatedAt: nowIso,
      });
      continue;
    }

    const previousStatus = orgRecord.eligibilityStatus;

    if (job.action === 'ASSIGN_POLICY') {
      try {
        const assignRes = await adapter.assignPolicyToUser({
          email: orgRecord.email,
          policyName,
          simulateGrant: effectiveSimulateTeams,
        });

        if (assignRes.invalidTeamsAccount) {
          summary.invalidAccounts++;
          await db.collection('authorizedorganizers').doc(job.organizerKey).update({
            eligibilityStatus: ORGANIZER_STATUS.INVALID_TEAMS_ACCOUNT,
            teamsStatus: ORGANIZER_STATUS.NOT_ELIGIBLE,
            lastError: assignRes.error || 'Invalid Teams account',
            updatedAt: nowIso,
          });
          await db.collection('organizerpolicysync').doc(job.jobId).update({
            status: 'FAILED',
            lastError: assignRes.error || 'Invalid Teams account',
            maxAttempts: attemptCount, // Non-retryable
            updatedAt: nowIso,
          });
          await recordApprovalAudit({
            organizerKey: job.organizerKey,
            uid: orgRecord.uid,
            employeeId: orgRecord.employeeId,
            email: orgRecord.email,
            previousStatus,
            newStatus: ORGANIZER_STATUS.INVALID_TEAMS_ACCOUNT,
            action: 'POLICY_ASSIGNMENT_INVALID_ACCOUNT',
            policyName,
            adapterMode: assignRes.adapterMode || adapter.mode,
            reason: assignRes.error,
          });
          continue;
        }

        if (assignRes.conflict) {
          summary.conflicts++;
          summary.failed++;
          await db.collection('authorizedorganizers').doc(job.organizerKey).update({
            eligibilityStatus: ORGANIZER_STATUS.ASSIGNMENT_FAILED,
            teamsStatus: ORGANIZER_STATUS.ASSIGNMENT_FAILED,
            existingTeamsPolicy: assignRes.existingPolicy || null,
            policyConflictDetected: true,
            lastError: assignRes.error,
            updatedAt: nowIso,
          });
          await db.collection('organizerpolicysync').doc(job.jobId).update({
            status: 'CONFLICT_BLOCKED',
            existingPolicyBefore: assignRes.existingPolicy || null,
            lastError: assignRes.error,
            updatedAt: nowIso,
          });
          await recordApprovalAudit({
            organizerKey: job.organizerKey,
            uid: orgRecord.uid,
            employeeId: orgRecord.employeeId,
            email: orgRecord.email,
            previousStatus,
            newStatus: ORGANIZER_STATUS.ASSIGNMENT_FAILED,
            action: 'POLICY_CONFLICT_DETECTED',
            policyName,
            adapterMode: assignRes.adapterMode || adapter.mode,
            reason: assignRes.error,
            details: { existingPolicy: assignRes.existingPolicy },
          });
          continue;
        }

        if (assignRes.pendingAdminAutomation) {
          summary.pendingAssignments++;
          await db.collection('authorizedorganizers').doc(job.organizerKey).update({
            eligibilityStatus: ORGANIZER_STATUS.PENDING_ASSIGNMENT,
            teamsStatus: ORGANIZER_STATUS.PENDING_ASSIGNMENT,
            policyName,
            applicationId,
            policyConflictDetected: false,
            adapterMode: assignRes.adapterMode || adapter.mode,
            livePolicyVerified: false,
            lastError: null,
            updatedAt: nowIso,
          });
          await db.collection('organizerpolicysync').doc(job.jobId).update({
            status: 'PENDING_ASSIGNMENT',
            lastError: null,
            verificationResult: {
              pendingAdminAutomation: true,
              policyCreatedInTenant: true,
              policyName,
              grantCommand: assignRes.grantCommand,
              adapterMode: assignRes.adapterMode || adapter.mode,
            },
            updatedAt: nowIso,
          });
          await recordApprovalAudit({
            organizerKey: job.organizerKey,
            uid: orgRecord.uid,
            employeeId: orgRecord.employeeId,
            email: orgRecord.email,
            previousStatus,
            newStatus: ORGANIZER_STATUS.PENDING_ASSIGNMENT,
            action: 'PENDING_ASSIGNMENT_RECORDED_IN_QUEUE',
            policyName,
            adapterMode: assignRes.adapterMode || adapter.mode,
            reason: `Recorded pending assignment for ${policyName} awaiting secure Teams administrative automation.`,
            details: { grantCommand: assignRes.grantCommand },
          });
          continue;
        }

        // Verify policy assignment
        const verifyRes = await adapter.verifyUserPolicyAssignment({
          email: orgRecord.email,
          policyName,
        });

        if (verifyRes.verified) {
          summary.authorized++;
          await db.collection('authorizedorganizers').doc(job.organizerKey).update({
            eligibilityStatus: ORGANIZER_STATUS.AUTHORIZED,
            teamsStatus: ORGANIZER_STATUS.AUTHORIZED,
            policyName,
            applicationId,
            existingTeamsPolicy: policyName,
            policyConflictDetected: false,
            adapterMode: verifyRes.adapterMode || adapter.mode,
            livePolicyVerified: Boolean(verifyRes.livePolicyVerified),
            lastError: null,
            authorizedAt: orgRecord.authorizedAt || nowIso,
            lastVerifiedAt: verifyRes.verifiedAt || nowIso,
            updatedAt: nowIso,
          });
          await db.collection('organizerpolicysync').doc(job.jobId).update({
            status: 'SUCCEEDED',
            lastError: null,
            verificationResult: verifyRes,
            updatedAt: nowIso,
          });
          await recordApprovalAudit({
            organizerKey: job.organizerKey,
            uid: orgRecord.uid,
            employeeId: orgRecord.employeeId,
            email: orgRecord.email,
            previousStatus,
            newStatus: ORGANIZER_STATUS.AUTHORIZED,
            action: assignRes.alreadyAssigned ? 'POLICY_ALREADY_ASSIGNED_VERIFIED' : 'POLICY_ASSIGNED_AND_VERIFIED',
            policyName,
            adapterMode: verifyRes.adapterMode || adapter.mode,
            reason: 'Automatic ownership-based policy assignment verified.',
          });
        } else {
          throw new Error('Policy assignment verification returned false.');
        }
      } catch (err) {
        summary.failed++;
        const backoffMs = Math.min(60000, Math.pow(2, attemptCount) * 1000);
        const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
        const retryCount = (orgRecord.retryCount || 0) + 1;

        await db.collection('authorizedorganizers').doc(job.organizerKey).update({
          eligibilityStatus: ORGANIZER_STATUS.ASSIGNMENT_FAILED,
          teamsStatus: ORGANIZER_STATUS.ASSIGNMENT_FAILED,
          retryCount,
          lastError: err.message,
          updatedAt: nowIso,
        });
        await db.collection('organizerpolicysync').doc(job.jobId).update({
          status: 'FAILED',
          lastError: err.message,
          nextRetryAt,
          updatedAt: nowIso,
        });
        await recordApprovalAudit({
          organizerKey: job.organizerKey,
          uid: orgRecord.uid,
          employeeId: orgRecord.employeeId,
          email: orgRecord.email,
          previousStatus,
          newStatus: ORGANIZER_STATUS.ASSIGNMENT_FAILED,
          action: 'POLICY_ASSIGNMENT_FAILED',
          policyName,
          adapterMode: adapter.mode,
          reason: err.message,
          details: { attemptCount, nextRetryAt },
        });
      }
    } else if (job.action === 'REVOKE_POLICY') {
      // Safety check: Never revoke if organizer still owns any active account or key contact
      if ((orgRecord.ownedAccountsCount || 0) > 0 || (orgRecord.ownedContactsCount || 0) > 0) {
        await db.collection('authorizedorganizers').doc(job.organizerKey).update({
          eligibilityStatus: ORGANIZER_STATUS.AUTHORIZED,
          teamsStatus: ORGANIZER_STATUS.AUTHORIZED,
          updatedAt: nowIso,
        });
        await db.collection('organizerpolicysync').doc(job.jobId).update({
          status: 'CANCELLED',
          lastError: 'Organizer regained active ownership before revocation.',
          updatedAt: nowIso,
        });
        continue;
      }

      try {
        const revokeRes = await adapter.revokePolicyFromUser({
          email: orgRecord.email,
          policyName,
        });

        summary.revoked++;
        await db.collection('authorizedorganizers').doc(job.organizerKey).update({
          eligibilityStatus: ORGANIZER_STATUS.REVOKED,
          teamsStatus: ORGANIZER_STATUS.REVOKED,
          existingTeamsPolicy: revokeRes.retainedForDependency ? orgRecord.existingTeamsPolicy : null,
          dependentWorkflows: revokeRes.dependentWorkflows || [],
          revokedAt: nowIso,
          lastError: revokeRes.retainedForDependency ? revokeRes.error : null,
          updatedAt: nowIso,
        });
        await db.collection('organizerpolicysync').doc(job.jobId).update({
          status: 'SUCCEEDED',
          dependentWorkflows: revokeRes.dependentWorkflows || [],
          verificationResult: revokeRes,
          updatedAt: nowIso,
        });
        await recordApprovalAudit({
          organizerKey: job.organizerKey,
          uid: orgRecord.uid,
          employeeId: orgRecord.employeeId,
          email: orgRecord.email,
          previousStatus,
          newStatus: ORGANIZER_STATUS.REVOKED,
          action: revokeRes.retainedForDependency ? 'ORGANIZER_REVOKED_POLICY_RETAINED_FOR_DEPENDENCY' : 'POLICY_REVOKED',
          policyName,
          adapterMode: revokeRes.adapterMode || adapter.mode,
          reason: revokeRes.error || 'Employee no longer owns any active customer account or key contact.',
        });
      } catch (err) {
        summary.failed++;
        const backoffMs = Math.min(60000, Math.pow(2, attemptCount) * 1000);
        await db.collection('organizerpolicysync').doc(job.jobId).update({
          status: 'FAILED',
          lastError: err.message,
          nextRetryAt: new Date(Date.now() + backoffMs).toISOString(),
          updatedAt: nowIso,
        });
      }
    } else if (job.action === 'ASSIGN_OUTLOOK_MAILBOX') {
      const prevOutlookStatus = orgRecord.outlookStatus || OUTLOOK_STATUS.NOT_ELIGIBLE;
      try {
        const assignRes = await outlookAdapter.assignMailboxAccess({
          email: orgRecord.email,
          scopeName: outlookScopeName,
          simulateGrant: effectiveSimulateOutlook,
        });

        if (assignRes.invalidMailbox) {
          summary.outlookFailed++;
          await db.collection('authorizedorganizers').doc(job.organizerKey).update({
            outlookStatus: OUTLOOK_STATUS.NOT_ELIGIBLE,
            outlookLastError: assignRes.error || 'Invalid Exchange Online mailbox',
            updatedAt: nowIso,
          });
          await db.collection('organizerpolicysync').doc(job.jobId).update({
            status: 'FAILED',
            lastError: assignRes.error || 'Invalid Exchange Online mailbox',
            maxAttempts: attemptCount,
            updatedAt: nowIso,
          });
          await recordApprovalAudit({
            organizerKey: job.organizerKey,
            uid: orgRecord.uid,
            employeeId: orgRecord.employeeId,
            email: orgRecord.email,
            previousStatus: prevOutlookStatus,
            newStatus: OUTLOOK_STATUS.NOT_ELIGIBLE,
            action: 'OUTLOOK_MAILBOX_INVALID',
            policyName: outlookScopeName,
            adapterMode: assignRes.adapterMode || outlookAdapter.mode,
            reason: assignRes.error,
          });
          continue;
        }

        if (assignRes.pendingConfiguration) {
          summary.outlookPendingConfigurations++;
          await db.collection('authorizedorganizers').doc(job.organizerKey).update({
            outlookStatus: OUTLOOK_STATUS.PENDING_CONFIGURATION,
            outlookScopeName,
            outlookRbacVerified: false,
            outlookMailReadGranted: false,
            outlookLiveVerified: false,
            outlookAdapterMode: assignRes.adapterMode || outlookAdapter.mode,
            outlookLastError: null,
            updatedAt: nowIso,
          });
          await db.collection('organizerpolicysync').doc(job.jobId).update({
            status: 'PENDING_CONFIGURATION',
            lastError: null,
            verificationResult: {
              pendingConfiguration: true,
              scopeName: outlookScopeName,
              rbacCommand: assignRes.rbacCommand,
              adapterMode: assignRes.adapterMode || outlookAdapter.mode,
            },
            updatedAt: nowIso,
          });
          await recordApprovalAudit({
            organizerKey: job.organizerKey,
            uid: orgRecord.uid,
            employeeId: orgRecord.employeeId,
            email: orgRecord.email,
            previousStatus: prevOutlookStatus,
            newStatus: OUTLOOK_STATUS.PENDING_CONFIGURATION,
            action: 'OUTLOOK_PENDING_CONFIGURATION_QUEUED',
            policyName: outlookScopeName,
            adapterMode: assignRes.adapterMode || outlookAdapter.mode,
            reason: `Recorded pending Outlook mailbox scope configuration (${outlookScopeName}) awaiting Exchange Online RBAC and Mail.Read verification.`,
            details: { rbacCommand: assignRes.rbacCommand },
          });
          continue;
        }

        const verifyRes = await outlookAdapter.verifyMailboxAccess({
          email: orgRecord.email,
          scopeName: outlookScopeName,
        });

        if (verifyRes.verified) {
          summary.outlookAuthorized++;
          await db.collection('authorizedorganizers').doc(job.organizerKey).update({
            outlookStatus: OUTLOOK_STATUS.AUTHORIZED,
            outlookScopeName,
            outlookRbacVerified: true,
            outlookMailReadGranted: true,
            outlookLiveVerified: Boolean(verifyRes.liveOutlookVerified),
            outlookAdapterMode: verifyRes.adapterMode || outlookAdapter.mode,
            outlookLastError: null,
            outlookAuthorizedAt: orgRecord.outlookAuthorizedAt || nowIso,
            updatedAt: nowIso,
          });
          await db.collection('organizerpolicysync').doc(job.jobId).update({
            status: 'SUCCEEDED',
            lastError: null,
            verificationResult: verifyRes,
            updatedAt: nowIso,
          });
          await recordApprovalAudit({
            organizerKey: job.organizerKey,
            uid: orgRecord.uid,
            employeeId: orgRecord.employeeId,
            email: orgRecord.email,
            previousStatus: prevOutlookStatus,
            newStatus: OUTLOOK_STATUS.AUTHORIZED,
            action: 'OUTLOOK_MAILBOX_AUTHORIZED_VERIFIED',
            policyName: outlookScopeName,
            adapterMode: verifyRes.adapterMode || outlookAdapter.mode,
            reason: 'Automatic ownership-based Exchange Online RBAC scope and Mail.Read authorization verified.',
          });
        } else {
          throw new Error('Outlook Exchange Online RBAC verification returned false.');
        }
      } catch (err) {
        summary.outlookFailed++;
        const backoffMs = Math.min(60000, Math.pow(2, attemptCount) * 1000);
        const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
        const outlookRetryCount = (orgRecord.outlookRetryCount || 0) + 1;

        await db.collection('authorizedorganizers').doc(job.organizerKey).update({
          outlookStatus: OUTLOOK_STATUS.FAILED,
          outlookRetryCount,
          outlookLastError: err.message,
          updatedAt: nowIso,
        });
        await db.collection('organizerpolicysync').doc(job.jobId).update({
          status: 'FAILED',
          lastError: err.message,
          nextRetryAt,
          updatedAt: nowIso,
        });
        await recordApprovalAudit({
          organizerKey: job.organizerKey,
          uid: orgRecord.uid,
          employeeId: orgRecord.employeeId,
          email: orgRecord.email,
          previousStatus: prevOutlookStatus,
          newStatus: OUTLOOK_STATUS.FAILED,
          action: 'OUTLOOK_AUTHORIZATION_FAILED',
          policyName: outlookScopeName,
          adapterMode: outlookAdapter.mode,
          reason: err.message,
          details: { attemptCount, nextRetryAt },
        });
      }
    } else if (job.action === 'REVOKE_OUTLOOK_MAILBOX') {
      if ((orgRecord.ownedAccountsCount || 0) > 0 || (orgRecord.ownedContactsCount || 0) > 0) {
        await db.collection('authorizedorganizers').doc(job.organizerKey).update({
          outlookStatus: OUTLOOK_STATUS.AUTHORIZED,
          updatedAt: nowIso,
        });
        await db.collection('organizerpolicysync').doc(job.jobId).update({
          status: 'CANCELLED',
          lastError: 'Organizer regained active ownership before Outlook revocation.',
          updatedAt: nowIso,
        });
        continue;
      }

      try {
        const revokeRes = await outlookAdapter.revokeMailboxAccess({
          email: orgRecord.email,
          scopeName: outlookScopeName,
        });

        summary.outlookRevoked++;
        await db.collection('authorizedorganizers').doc(job.organizerKey).update({
          outlookStatus: OUTLOOK_STATUS.REVOKED,
          outlookRbacVerified: false,
          outlookRevokedAt: nowIso,
          outlookLastError: null,
          updatedAt: nowIso,
        });
        await db.collection('organizerpolicysync').doc(job.jobId).update({
          status: 'SUCCEEDED',
          verificationResult: revokeRes,
          updatedAt: nowIso,
        });
        await recordApprovalAudit({
          organizerKey: job.organizerKey,
          uid: orgRecord.uid,
          employeeId: orgRecord.employeeId,
          email: orgRecord.email,
          previousStatus: orgRecord.outlookStatus,
          newStatus: OUTLOOK_STATUS.REVOKED,
          action: 'OUTLOOK_MAILBOX_ACCESS_REVOKED',
          policyName: outlookScopeName,
          adapterMode: revokeRes.adapterMode || outlookAdapter.mode,
          reason: 'Employee no longer owns any active customer account or key contact.',
        });
      } catch (err) {
        summary.outlookFailed++;
        const backoffMs = Math.min(60000, Math.pow(2, attemptCount) * 1000);
        await db.collection('organizerpolicysync').doc(job.jobId).update({
          status: 'FAILED',
          lastError: err.message,
          nextRetryAt: new Date(Date.now() + backoffMs).toISOString(),
          updatedAt: nowIso,
        });
      }
    }
  }

  return summary;
}

/**
 * Core Engine (Phases 2 & 3):
 * Scans all CRM Accounts, Contacts, and Users to automatically identify Account Owners
 * and Key Contact Owners, track ownership changes, update `AuthorizedOrganizers`, and
 * execute Teams policy assignments/revocations.
 */
export async function recalculateEligibleOrganizers({ triggerSource = 'AUTO_SYNC' } = {}) {
  if (isRecalculationRunning) {
    return { skipped: true, reason: 'RECALCULATION_IN_PROGRESS' };
  }
  isRecalculationRunning = true;

  try {
    const [usersSnap, accountsSnap, contactsSnap, orgsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('accounts').get(),
      db.collection('contacts').get(),
      db.collection('authorizedorganizers').get(),
    ]);

    const rawUsers = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
    const allAccounts = accountsSnap.docs.map(d => ({ accountId: d.id, ...d.data() }));
    const allContacts = contactsSnap.docs.map(d => ({ contactId: d.id, ...d.data() }));
    const existingOrgs = orgsSnap.docs.map(d => ({ organizerKey: d.id, ...d.data() }));

    const directoryIndex = buildEmployeeDirectoryIndex(rawUsers);
    const existingOrgsByKey = new Map(existingOrgs.map(o => [o.organizerKey, o]));
    const existingOrgsByEmail = new Map(
      existingOrgs.filter(o => o.email).map(o => [normalizeEmail(o.email), o])
    );

    // Map previous ownership by accountId / contactId from existingOrgs
    const prevAccountOwnerMap = new Map();
    const prevContactOwnerMap = new Map();
    for (const org of existingOrgs) {
      if (org.eligibilityStatus === ORGANIZER_STATUS.EMPLOYEE_NOT_MATCHED) continue;
      for (const accId of org.ownedAccountIds || []) {
        prevAccountOwnerMap.set(accId, org);
      }
      for (const conId of org.ownedContactIds || []) {
        prevContactOwnerMap.set(conId, org);
      }
    }

    // Track current eligible employees and unmatched/inactive references
    const eligibleMap = new Map(); // organizerKey -> { employee, accountIds: Set, contactIds: Set }
    const inactiveMap = new Map(); // organizerKey -> { employee, accountIds: Set, contactIds: Set }
    const unmatchedMap = new Map(); // organizerKey -> { rawRef, accountIds: Set, contactIds: Set, reason }

    const activeAccountIds = new Set();

    // 1. Process Account Owners
    for (const acc of allAccounts) {
      const accountId = acc.accountId || acc.id;
      const prevOwner = prevAccountOwnerMap.get(accountId) || null;

      if (!isCrmEntityActive(acc)) {
        if (prevOwner) {
          await recordOwnershipChange({
            entityType: 'ACCOUNT',
            entityId: accountId,
            entityName: acc.companyName,
            accountId,
            previousOwner: prevOwner,
            newOwner: null,
            changeType: 'ACCOUNT_DEACTIVATED',
            triggerSource,
          });
        }
        continue;
      }

      activeAccountIds.add(accountId);

      const matchRes = matchOwnerReferenceToEmployee(
        {
          ownerId: acc.ownerId,
          ownerEmployeeId: acc.ownerEmployeeId,
          ownerEmail: acc.ownerEmail,
          ownerName: acc.ownerName,
        },
        directoryIndex
      );

      if (!matchRes.matched) {
        if (matchRes.isSystemPlaceholder) continue;
        const rawKeySource = normalizeEmail(acc.ownerEmail) || String(acc.ownerEmployeeId || acc.ownerName || acc.ownerId || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '_');
        const unmKey = `unmatched:${rawKeySource}`;
        const entry = unmatchedMap.get(unmKey) || {
          organizerKey: unmKey,
          email: normalizeEmail(acc.ownerEmail) || null,
          employeeId: acc.ownerEmployeeId || null,
          name: acc.ownerName || 'Unmatched Owner',
          reason: matchRes.reason,
          accountIds: new Set(),
          contactIds: new Set(),
        };
        entry.accountIds.add(accountId);
        unmatchedMap.set(unmKey, entry);
        continue;
      }

      const emp = matchRes.employee;
      const orgKey = emp.uid || emp.email;

      // Enrich account record with resolved employee metadata if missing
      if (
        acc.ownerId !== emp.uid ||
        normalizeEmail(acc.ownerEmail) !== emp.email ||
        (emp.employeeId && acc.ownerEmployeeId !== emp.employeeId)
      ) {
        await db.collection('accounts').doc(accountId).update({
          ownerId: emp.uid,
          ownerEmail: emp.email,
          ownerEmployeeId: emp.employeeId || acc.ownerEmployeeId || null,
          ownerName: emp.name || acc.ownerName,
        }).catch(() => { });
      }

      // Check ownership change history
      if (!prevOwner) {
        await recordOwnershipChange({
          entityType: 'ACCOUNT',
          entityId: accountId,
          entityName: acc.companyName,
          accountId,
          previousOwner: null,
          newOwner: emp,
          changeType: 'ACCOUNT_OWNER_ADDED',
          triggerSource,
        });
      } else if (prevOwner.uid !== emp.uid && normalizeEmail(prevOwner.email) !== emp.email) {
        await recordOwnershipChange({
          entityType: 'ACCOUNT',
          entityId: accountId,
          entityName: acc.companyName,
          accountId,
          previousOwner: prevOwner,
          newOwner: emp,
          changeType: 'ACCOUNT_OWNER_CHANGED',
          triggerSource,
        });
      }

      if (!matchRes.isActive) {
        const inact = inactiveMap.get(orgKey) || { employee: emp, accountIds: new Set(), contactIds: new Set() };
        inact.accountIds.add(accountId);
        inactiveMap.set(orgKey, inact);
        continue;
      }

      const current = eligibleMap.get(orgKey) || { employee: emp, accountIds: new Set(), contactIds: new Set() };
      current.accountIds.add(accountId);
      eligibleMap.set(orgKey, current);
    }

    // 2. Process Key Contact Owners
    for (const con of allContacts) {
      const contactId = con.contactId || con.id;
      const prevOwner = prevContactOwnerMap.get(contactId) || null;
      const parentAccountActive = !con.accountId || activeAccountIds.has(con.accountId);

      if (!parentAccountActive || !isEligibleKeyContact(con)) {
        if (prevOwner) {
          await recordOwnershipChange({
            entityType: 'CONTACT',
            entityId: contactId,
            entityName: con.name,
            accountId: con.accountId,
            previousOwner: prevOwner,
            newOwner: null,
            changeType: 'CONTACT_DEACTIVATED',
            triggerSource,
          });
        }
        continue;
      }

      const matchRes = matchOwnerReferenceToEmployee(
        {
          ownerId: con.ownerId,
          ownerEmployeeId: con.ownerEmployeeId,
          ownerEmail: con.ownerEmail,
          ownerName: con.ownerName,
        },
        directoryIndex
      );

      if (!matchRes.matched) {
        if (matchRes.isSystemPlaceholder) continue;
        const rawKeySource = normalizeEmail(con.ownerEmail) || String(con.ownerEmployeeId || con.ownerName || con.ownerId || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '_');
        const unmKey = `unmatched:${rawKeySource}`;
        const entry = unmatchedMap.get(unmKey) || {
          organizerKey: unmKey,
          email: normalizeEmail(con.ownerEmail) || null,
          employeeId: con.ownerEmployeeId || null,
          name: con.ownerName || 'Unmatched Contact Owner',
          reason: matchRes.reason,
          accountIds: new Set(),
          contactIds: new Set(),
        };
        entry.contactIds.add(contactId);
        unmatchedMap.set(unmKey, entry);
        continue;
      }

      const emp = matchRes.employee;
      const orgKey = emp.uid || emp.email;

      if (
        con.ownerId !== emp.uid ||
        normalizeEmail(con.ownerEmail) !== emp.email ||
        (emp.employeeId && con.ownerEmployeeId !== emp.employeeId)
      ) {
        await db.collection('contacts').doc(contactId).update({
          ownerId: emp.uid,
          ownerEmail: emp.email,
          ownerEmployeeId: emp.employeeId || con.ownerEmployeeId || null,
          ownerName: emp.name || con.ownerName,
        }).catch(() => { });
      }

      if (!prevOwner) {
        await recordOwnershipChange({
          entityType: 'CONTACT',
          entityId: contactId,
          entityName: con.name,
          accountId: con.accountId,
          previousOwner: null,
          newOwner: emp,
          changeType: 'CONTACT_OWNER_ADDED',
          triggerSource,
        });
      } else if (prevOwner.uid !== emp.uid && normalizeEmail(prevOwner.email) !== emp.email) {
        await recordOwnershipChange({
          entityType: 'CONTACT',
          entityId: contactId,
          entityName: con.name,
          accountId: con.accountId,
          previousOwner: prevOwner,
          newOwner: emp,
          changeType: 'CONTACT_OWNER_CHANGED',
          triggerSource,
        });
      }

      if (!matchRes.isActive) {
        const inact = inactiveMap.get(orgKey) || { employee: emp, accountIds: new Set(), contactIds: new Set() };
        inact.contactIds.add(contactId);
        inactiveMap.set(orgKey, inact);
        continue;
      }

      const current = eligibleMap.get(orgKey) || { employee: emp, accountIds: new Set(), contactIds: new Set() };
      current.contactIds.add(contactId);
      eligibleMap.set(orgKey, current);
    }

    const nowIso = new Date().toISOString();
    const policyName = getReusablePolicyName();
    const outlookScopeName = getExchangeApplicationScopeName();
    const applicationId = getPolicyApplicationId();

    let newlyQueuedCount = 0;
    let retainedAuthorizedCount = 0;
    let revocationQueuedCount = 0;

    // 3. Upsert Eligible Active Organizers (Maintaining Separate Teams & Outlook Statuses)
    for (const [orgKey, item] of eligibleMap.entries()) {
      const emp = item.employee;
      const ownedAccountIds = Array.from(item.accountIds);
      const ownedContactIds = Array.from(item.contactIds);
      const existing = existingOrgsByKey.get(orgKey) || existingOrgsByEmail.get(emp.email) || null;
      const targetKey = existing ? existing.organizerKey : orgKey;

      const alreadyAuthorized =
        existing &&
        (existing.teamsStatus === ORGANIZER_STATUS.AUTHORIZED || existing.eligibilityStatus === ORGANIZER_STATUS.AUTHORIZED) &&
        !existing.policyConflictDetected &&
        (existing.livePolicyVerified === true || isMockAutoGrantEnabled());

      const alreadyPending =
        existing &&
        existing.eligibilityStatus === ORGANIZER_STATUS.PENDING_ASSIGNMENT &&
        !existing.policyConflictDetected;

      const nextStatus = alreadyAuthorized
        ? ORGANIZER_STATUS.AUTHORIZED
        : existing?.eligibilityStatus === ORGANIZER_STATUS.ASSIGNMENT_FAILED && existing?.policyConflictDetected
          ? ORGANIZER_STATUS.ASSIGNMENT_FAILED
          : ORGANIZER_STATUS.PENDING_ASSIGNMENT;

      const alreadyOutlookAuthorized =
        existing &&
        existing.outlookStatus === OUTLOOK_STATUS.AUTHORIZED &&
        (existing.outlookLiveVerified === true || isMockOutlookAutoGrantEnabled());

      const nextOutlookStatus = alreadyOutlookAuthorized
        ? OUTLOOK_STATUS.AUTHORIZED
        : OUTLOOK_STATUS.PENDING_CONFIGURATION;

      const record = {
        ...(existing || {}),
        organizerKey: targetKey,
        uid: emp.uid,
        employeeId: emp.employeeId || null,
        email: emp.email,
        name: emp.name,
        isAccountOwner: ownedAccountIds.length > 0,
        isKeyContactOwner: ownedContactIds.length > 0,
        ownedAccountIds,
        ownedContactIds,
        ownedAccountsCount: ownedAccountIds.length,
        ownedContactsCount: ownedContactIds.length,
        eligibilityStatus: nextStatus,
        teamsStatus: nextStatus,
        livePolicyVerified: existing?.livePolicyVerified === true,
        policyName,
        applicationId,
        outlookStatus: nextOutlookStatus,
        outlookLiveVerified: existing?.outlookLiveVerified === true,
        outlookScopeName: existing?.outlookScopeName || outlookScopeName,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      await db.collection('authorizedorganizers').doc(targetKey).set(record, { merge: true });

      if (alreadyAuthorized) {
        retainedAuthorizedCount++;
      } else if (nextStatus === ORGANIZER_STATUS.PENDING_ASSIGNMENT) {
        if (!alreadyPending) {
          newlyQueuedCount++;
          await recordApprovalAudit({
            organizerKey: targetKey,
            uid: emp.uid,
            employeeId: emp.employeeId,
            email: emp.email,
            previousStatus: existing?.eligibilityStatus || null,
            newStatus: ORGANIZER_STATUS.PENDING_ASSIGNMENT,
            action: 'ELIGIBLE_ORGANIZER_IDENTIFIED',
            policyName,
            reason: `Owns ${ownedAccountIds.length} active account(s) and ${ownedContactIds.length} active key contact(s).`,
          });
        }
        await enqueuePolicySyncJob({
          organizerKey: targetKey,
          uid: emp.uid,
          employeeId: emp.employeeId,
          email: emp.email,
          channel: 'TEAMS',
          action: 'ASSIGN_POLICY',
          policyName,
          applicationId,
        });
      }

      if (!alreadyOutlookAuthorized) {
        await enqueuePolicySyncJob({
          organizerKey: targetKey,
          uid: emp.uid,
          employeeId: emp.employeeId,
          email: emp.email,
          channel: 'OUTLOOK',
          action: 'ASSIGN_OUTLOOK_MAILBOX',
          policyName: outlookScopeName,
          applicationId,
        });
      }
    }

    // 4. Handle Inactive Employees
    for (const [orgKey, item] of inactiveMap.entries()) {
      const emp = item.employee;
      const existing = existingOrgsByKey.get(orgKey) || existingOrgsByEmail.get(emp.email) || null;
      const targetKey = existing ? existing.organizerKey : orgKey;
      const wasAuthorized = existing?.eligibilityStatus === ORGANIZER_STATUS.AUTHORIZED;
      const wasOutlookAuthorized = existing?.outlookStatus === OUTLOOK_STATUS.AUTHORIZED;

      const nextStatus = wasAuthorized
        ? ORGANIZER_STATUS.PENDING_REVOCATION
        : ORGANIZER_STATUS.INVALID_TEAMS_ACCOUNT;

      const nextTeamsStatus = wasAuthorized
        ? ORGANIZER_STATUS.PENDING_REVOCATION
        : ORGANIZER_STATUS.NOT_ELIGIBLE;

      const nextOutlookStatus = wasOutlookAuthorized
        ? OUTLOOK_STATUS.PENDING_REVOCATION
        : OUTLOOK_STATUS.NOT_ELIGIBLE;

      await db.collection('authorizedorganizers').doc(targetKey).set(
        {
          ...(existing || {}),
          organizerKey: targetKey,
          uid: emp.uid,
          employeeId: emp.employeeId || null,
          email: emp.email,
          name: emp.name,
          isAccountOwner: false,
          isKeyContactOwner: false,
          ownedAccountIds: [],
          ownedContactIds: [],
          ownedAccountsCount: 0,
          ownedContactsCount: 0,
          eligibilityStatus: nextStatus,
          teamsStatus: nextTeamsStatus,
          outlookStatus: nextOutlookStatus,
          lastError: 'Employee is marked inactive in Users directory.',
          outlookLastError: 'Employee is marked inactive in Users directory.',
          createdAt: existing?.createdAt || nowIso,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      await recordOwnershipChange({
        entityType: 'EMPLOYEE',
        entityId: emp.uid || emp.email,
        entityName: emp.name,
        previousOwner: emp,
        newOwner: null,
        changeType: 'EMPLOYEE_STATUS_CHANGED',
        triggerSource,
      });

      if (wasAuthorized) {
        revocationQueuedCount++;
        await enqueuePolicySyncJob({
          organizerKey: targetKey,
          uid: emp.uid,
          employeeId: emp.employeeId,
          email: emp.email,
          channel: 'TEAMS',
          action: 'REVOKE_POLICY',
          policyName,
          applicationId,
        });
      }

      if (wasOutlookAuthorized) {
        await enqueuePolicySyncJob({
          organizerKey: targetKey,
          uid: emp.uid,
          employeeId: emp.employeeId,
          email: emp.email,
          channel: 'OUTLOOK',
          action: 'REVOKE_OUTLOOK_MAILBOX',
          policyName: outlookScopeName,
          applicationId,
        });
      }
    }

    // 5. Handle Unmatched Employee References
    for (const [unmKey, item] of unmatchedMap.entries()) {
      const existing = existingOrgsByKey.get(unmKey);
      const ownedAccountIds = Array.from(item.accountIds);
      const ownedContactIds = Array.from(item.contactIds);

      await db.collection('authorizedorganizers').doc(unmKey).set(
        {
          organizerKey: unmKey,
          uid: null,
          employeeId: item.employeeId || null,
          email: item.email || null,
          name: item.name,
          isAccountOwner: ownedAccountIds.length > 0,
          isKeyContactOwner: ownedContactIds.length > 0,
          ownedAccountIds,
          ownedContactIds,
          ownedAccountsCount: ownedAccountIds.length,
          ownedContactsCount: ownedContactIds.length,
          eligibilityStatus: ORGANIZER_STATUS.EMPLOYEE_NOT_MATCHED,
          teamsStatus: ORGANIZER_STATUS.NOT_ELIGIBLE,
          outlookStatus: OUTLOOK_STATUS.NOT_ELIGIBLE,
          lastError: `Unmatched owner reference (${item.reason})`,
          outlookLastError: `Unmatched owner reference (${item.reason})`,
          createdAt: existing?.createdAt || nowIso,
          updatedAt: nowIso,
        },
        { merge: true }
      );

      if (!existing || existing.eligibilityStatus !== ORGANIZER_STATUS.EMPLOYEE_NOT_MATCHED) {
        await recordApprovalAudit({
          organizerKey: unmKey,
          email: item.email,
          employeeId: item.employeeId,
          previousStatus: existing?.eligibilityStatus || null,
          newStatus: ORGANIZER_STATUS.EMPLOYEE_NOT_MATCHED,
          action: 'OWNER_NOT_MATCHED_IN_USERS',
          reason: item.reason,
        });
      }
    }

    // 6. Check Previously Authorized Organizers Who Lost All Active Ownership
    for (const existing of existingOrgs) {
      const key = existing.organizerKey;
      if (
        eligibleMap.has(key) ||
        (existing.email && Array.from(eligibleMap.values()).some(e => e.employee.email === normalizeEmail(existing.email))) ||
        inactiveMap.has(key) ||
        unmatchedMap.has(key)
      ) {
        continue;
      }

      if (existing.eligibilityStatus === ORGANIZER_STATUS.EMPLOYEE_NOT_MATCHED) {
        // Stale unmatched reference that no longer owns any account/contact
        await db.collection('authorizedorganizers').doc(key).delete().catch(() => { });
        continue;
      }

      const needsTeamsRevoke =
        existing.eligibilityStatus === ORGANIZER_STATUS.AUTHORIZED ||
        existing.eligibilityStatus === ORGANIZER_STATUS.PENDING_ASSIGNMENT ||
        existing.eligibilityStatus === ORGANIZER_STATUS.ASSIGNMENT_FAILED;

      const needsOutlookRevoke =
        existing.outlookStatus === OUTLOOK_STATUS.AUTHORIZED ||
        existing.outlookStatus === OUTLOOK_STATUS.PENDING_CONFIGURATION ||
        existing.outlookStatus === OUTLOOK_STATUS.FAILED;

      if (needsTeamsRevoke || needsOutlookRevoke) {
        if (needsTeamsRevoke) revocationQueuedCount++;

        await db.collection('authorizedorganizers').doc(key).update({
          isAccountOwner: false,
          isKeyContactOwner: false,
          ownedAccountIds: [],
          ownedContactIds: [],
          ownedAccountsCount: 0,
          ownedContactsCount: 0,
          eligibilityStatus: needsTeamsRevoke ? ORGANIZER_STATUS.PENDING_REVOCATION : existing.eligibilityStatus,
          teamsStatus: needsTeamsRevoke ? ORGANIZER_STATUS.PENDING_REVOCATION : (existing.teamsStatus || existing.eligibilityStatus),
          outlookStatus: needsOutlookRevoke ? OUTLOOK_STATUS.PENDING_REVOCATION : (existing.outlookStatus || OUTLOOK_STATUS.NOT_ELIGIBLE),
          updatedAt: nowIso,
        });

        await recordApprovalAudit({
          organizerKey: key,
          uid: existing.uid,
          employeeId: existing.employeeId,
          email: existing.email,
          previousStatus: existing.eligibilityStatus,
          newStatus: ORGANIZER_STATUS.PENDING_REVOCATION,
          action: 'ALL_ACTIVE_OWNERSHIP_REMOVED',
          policyName,
          reason: 'Employee no longer owns any active customer account or key contact.',
        });

        if (needsTeamsRevoke) {
          await enqueuePolicySyncJob({
            organizerKey: key,
            uid: existing.uid,
            employeeId: existing.employeeId,
            email: existing.email,
            channel: 'TEAMS',
            action: 'REVOKE_POLICY',
            policyName,
            applicationId,
          });
        }

        if (needsOutlookRevoke) {
          await enqueuePolicySyncJob({
            organizerKey: key,
            uid: existing.uid,
            employeeId: existing.employeeId,
            email: existing.email,
            channel: 'OUTLOOK',
            action: 'REVOKE_OUTLOOK_MAILBOX',
            policyName: outlookScopeName,
            applicationId,
          });
        }
      }
    }

    // 7. Execute Policy Sync Queue Automatically
    const policyQueueSummary = await processPolicySyncQueue();

    await logActivity(
      'system',
      'Organizer Sync Engine',
      'ORGANIZER_ELIGIBILITY_RECALCULATED',
      `Source=${triggerSource}: ${eligibleMap.size} eligible, ${newlyQueuedCount} newly queued, ${retainedAuthorizedCount} retained, ${revocationQueuedCount} queued for revocation, ${unmatchedMap.size} unmatched.`
    ).catch(() => { });

    return {
      triggerSource,
      eligibleOrganizersCount: eligibleMap.size,
      newlyQueuedCount,
      retainedAuthorizedCount,
      revocationQueuedCount,
      inactiveExcludedCount: inactiveMap.size,
      unmatchedCount: unmatchedMap.size,
      duplicateEmailsDeduplicated: directoryIndex.duplicateEmailCount,
      policyQueueSummary,
    };
  } finally {
    isRecalculationRunning = false;
  }
}

/**
 * Checks whether a specific organizer email is currently Authorized for Teams in `AuthorizedOrganizers`.
 */
export async function isOrganizerAuthorizedForTeams(organizerEmail, { requireLiveVerification = false } = {}) {
  const email = normalizeEmail(organizerEmail);
  if (!email) {
    return {
      authorized: false,
      liveMicrosoftVerified: false,
      email: '',
      reason: 'MISSING_ORGANIZER_EMAIL',
      record: null,
    };
  }

  const snap = await db.collection('authorizedorganizers').get();
  const record = snap.docs
    .map(d => d.data())
    .find(o => normalizeEmail(o.email) === email);

  if (!record) {
    return {
      authorized: false,
      liveMicrosoftVerified: false,
      email,
      reason: 'NOT_AN_ELIGIBLE_OWNER',
      record: null,
    };
  }

  const teamsStatus = record.teamsStatus || record.eligibilityStatus;
  const liveMicrosoftVerified = record.livePolicyVerified === true;
  const adapterMode = record.adapterMode || 'MOCK';

  if (teamsStatus !== ORGANIZER_STATUS.AUTHORIZED) {
    return {
      authorized: false,
      liveMicrosoftVerified,
      adapterMode,
      email,
      reason: `ORGANIZER_STATUS_${String(teamsStatus).toUpperCase().replace(/\s+/g, '_')}`,
      record,
    };
  }

  // Safeguard: When MOCK_AUTO_GRANT_ENABLED is false/unset (or requireLiveVerification is true),
  // Teams authorization strictly requires teamsStatus === 'Authorized' AND livePolicyVerified === true.
  // Missing verification fields default to false so old mock-generated Authorized records are never trusted.
  if (!liveMicrosoftVerified && (requireLiveVerification || !isMockAutoGrantEnabled())) {
    return {
      authorized: false,
      liveMicrosoftVerified: false,
      adapterMode,
      email,
      reason: 'TEAMS_LIVE_VERIFICATION_REQUIRED',
      record,
    };
  }

  return {
    authorized: true,
    liveMicrosoftVerified,
    adapterMode,
    email,
    reason: liveMicrosoftVerified ? 'AUTHORIZED_LIVE_VERIFIED' : 'AUTHORIZED',
    record,
  };
}

/**
 * Checks whether a specific employee mailbox is currently Authorized for Outlook in `AuthorizedOrganizers`.
 */
export async function isMailboxAuthorizedForOutlook(mailboxEmail, { requireLiveVerification = false } = {}) {
  const email = normalizeEmail(mailboxEmail);
  if (!email) {
    return {
      authorized: false,
      liveMicrosoftVerified: false,
      email: '',
      reason: 'MISSING_MAILBOX_EMAIL',
      record: null,
    };
  }

  const snap = await db.collection('authorizedorganizers').get();
  const record = snap.docs
    .map(d => d.data())
    .find(o => normalizeEmail(o.email) === email);

  if (!record) {
    return {
      authorized: false,
      liveMicrosoftVerified: false,
      email,
      reason: 'NOT_AN_ELIGIBLE_OWNER',
      record: null,
    };
  }

  const outlookStatus = record.outlookStatus || OUTLOOK_STATUS.NOT_ELIGIBLE;
  const liveMicrosoftVerified = record.outlookLiveVerified === true;
  const adapterMode = record.outlookAdapterMode || 'MOCK';

  if (outlookStatus !== OUTLOOK_STATUS.AUTHORIZED) {
    return {
      authorized: false,
      liveMicrosoftVerified,
      adapterMode,
      email,
      reason: `OUTLOOK_STATUS_${String(outlookStatus).toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
      record,
    };
  }

  // Safeguard: When MOCK_AUTO_GRANT_ENABLED is false/unset (or requireLiveVerification is true),
  // Outlook authorization strictly requires outlookStatus === 'Authorized' AND outlookLiveVerified === true.
  // Missing verification fields default to false so old mock-generated Authorized records are never trusted.
  if (!liveMicrosoftVerified && (requireLiveVerification || !isMockOutlookAutoGrantEnabled())) {
    return {
      authorized: false,
      liveMicrosoftVerified: false,
      adapterMode,
      email,
      reason: 'OUTLOOK_LIVE_VERIFICATION_REQUIRED',
      record,
    };
  }

  return {
    authorized: true,
    liveMicrosoftVerified,
    adapterMode,
    email,
    reason: liveMicrosoftVerified ? 'AUTHORIZED_LIVE_VERIFIED' : 'AUTHORIZED',
    record,
  };
}

/**
 * Lists all organizers in `AuthorizedOrganizers`, with optional filtering.
 */
export async function listAuthorizedOrganizers({ status = null, outlookStatus = null, eligibleOnly = false } = {}) {
  const snap = await db.collection('authorizedorganizers').get();
  let list = snap.docs.map(d => d.data());

  if (status) {
    list = list.filter(o => o.eligibilityStatus === status || o.teamsStatus === status);
  }
  if (outlookStatus) {
    list = list.filter(o => o.outlookStatus === outlookStatus);
  }
  if (eligibleOnly) {
    list = list.filter(
      o => (o.ownedAccountsCount || 0) > 0 || (o.ownedContactsCount || 0) > 0
    );
  }

  return list.sort((a, b) => String(a.name || a.email || '').localeCompare(String(b.name || b.email || '')));
}

export async function listAuthorizedTeamsOrganizers() {
  const list = await listAuthorizedOrganizers({ status: ORGANIZER_STATUS.AUTHORIZED, eligibleOnly: true });
  if (isMockAutoGrantEnabled()) return list;
  return list.filter(o => o.livePolicyVerified === true);
}

export async function listAuthorizedOutlookMailboxes() {
  const list = await listAuthorizedOrganizers({ outlookStatus: OUTLOOK_STATUS.AUTHORIZED, eligibleOnly: true });
  if (isMockOutlookAutoGrantEnabled()) return list;
  return list.filter(o => o.outlookLiveVerified === true);
}


