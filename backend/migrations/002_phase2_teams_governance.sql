-- ─────────────────────────────────────────────────────────────────────────────
-- CustomerPulse Phase 2 — Automated Microsoft Teams & Organizer Governance Migration
-- Target: PostgreSQL (Transaction-safe & strictly idempotent)
-- Rules:
--   - Uses ADD COLUMN IF NOT EXISTS and CREATE TABLE IF NOT EXISTS
--   - Never modifies or resets Users or Sentrifugo employee records
--   - Zero duplicate organizer tables
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Safe Ownership & Status Columns on Accounts and Contacts
ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "ownerId" VARCHAR(50) NULL;
ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "ownerName" VARCHAR(150) NULL;
ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "ownerEmail" VARCHAR(150) NULL;
ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "ownerEmployeeId" VARCHAR(100) NULL;
ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT TRUE;
ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE NULL;

ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "ownerId" VARCHAR(50) NULL;
ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "ownerName" VARCHAR(150) NULL;
ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "ownerEmail" VARCHAR(150) NULL;
ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "ownerEmployeeId" VARCHAR(100) NULL;
ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "keyContact" VARCHAR(20) NULL;
ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT TRUE;
ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "status" VARCHAR(50) DEFAULT 'Active';
ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE NULL;

-- 2. Extend TeamsMeetings with Phase 2 metadata, AI intelligence, and transcript status fields
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "onlineMeetingId" VARCHAR(255) NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "organizerEmployeeId" VARCHAR(100) NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "relatedContactIds" JSONB NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "aiSummary" TEXT NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "keyTopics" JSONB NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "keyDecisions" JSONB NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "actionItems" JSONB NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "customerRequirements" JSONB NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "commitments" JSONB NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "risksIdentified" JSONB NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "sentiment" VARCHAR(50) NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "aiStatus" VARCHAR(50) DEFAULT 'PENDING';
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "aiError" TEXT NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "externalAttendees" JSONB NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "internalAttendees" JSONB NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "transcriptStatus" VARCHAR(60) DEFAULT 'PENDING';
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "hasRecording" BOOLEAN DEFAULT FALSE;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "durationSeconds" INT DEFAULT 0;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "wordCount" INT DEFAULT 0;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "matchConfidence" INT NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "matchReason" VARCHAR(100) NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "associatedAccountIds" JSONB NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "lastError" TEXT NULL;
ALTER TABLE "TeamsMeetings" ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP WITH TIME ZONE NULL;

CREATE INDEX IF NOT EXISTS idx_teamsmeetings_onlinemeetingid ON "TeamsMeetings"("onlineMeetingId");
CREATE INDEX IF NOT EXISTS idx_teamsmeetings_startdatetime ON "TeamsMeetings"("startDateTime");
CREATE INDEX IF NOT EXISTS idx_teamsmeetings_transcriptstatus ON "TeamsMeetings"("transcriptStatus");

-- 3. Unique partial index on Interactions.internetMessageId for deduplication
ALTER TABLE "Interactions" ADD COLUMN IF NOT EXISTS "isManual" BOOLEAN NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_interactions_internet_msg_id
  ON "Interactions"("internetMessageId")
  WHERE "internetMessageId" IS NOT NULL;

-- 4. Automated Eligible Teams Organizers (Derived from Account Owners & Key Contact Owners)
CREATE TABLE IF NOT EXISTS "AuthorizedOrganizers" (
    "organizerKey" VARCHAR(150) PRIMARY KEY,
    "uid" VARCHAR(100) NULL,
    "employeeId" VARCHAR(100) NULL,
    "email" VARCHAR(150) NULL,
    "name" VARCHAR(150) NULL,
    "isAccountOwner" BOOLEAN DEFAULT FALSE,
    "isKeyContactOwner" BOOLEAN DEFAULT FALSE,
    "ownedAccountIds" JSONB DEFAULT '[]',
    "ownedContactIds" JSONB DEFAULT '[]',
    "ownedAccountsCount" INT DEFAULT 0,
    "ownedContactsCount" INT DEFAULT 0,
    "eligibilityStatus" VARCHAR(60) NOT NULL,
    "teamsStatus" VARCHAR(60) NULL,
    "policyName" VARCHAR(150) DEFAULT 'CustomerPulseDevPolicy',
    "applicationId" VARCHAR(100) NULL,
    "existingTeamsPolicy" VARCHAR(150) NULL,
    "policyConflictDetected" BOOLEAN DEFAULT FALSE,
    "adapterMode" VARCHAR(40) DEFAULT 'MOCK',
    "livePolicyVerified" BOOLEAN DEFAULT FALSE,
    "dependentWorkflows" JSONB DEFAULT '[]',
    "retryCount" INT DEFAULT 0,
    "lastError" TEXT NULL,
    "lastVerifiedAt" TIMESTAMP WITH TIME ZONE NULL,
    "authorizedAt" TIMESTAMP WITH TIME ZONE NULL,
    "revokedAt" TIMESTAMP WITH TIME ZONE NULL,
    "outlookStatus" VARCHAR(60) DEFAULT 'Not Eligible',
    "outlookScopeName" VARCHAR(150) NULL,
    "outlookRbacVerified" BOOLEAN DEFAULT FALSE,
    "outlookMailReadGranted" BOOLEAN DEFAULT FALSE,
    "outlookAdapterMode" VARCHAR(40) DEFAULT 'MOCK',
    "outlookRetryCount" INT DEFAULT 0,
    "outlookLastError" TEXT NULL,
    "outlookAuthorizedAt" TIMESTAMP WITH TIME ZONE NULL,
    "outlookRevokedAt" TIMESTAMP WITH TIME ZONE NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE "AuthorizedOrganizers" ADD COLUMN IF NOT EXISTS "teamsStatus" VARCHAR(60) NULL;
ALTER TABLE "AuthorizedOrganizers" ADD COLUMN IF NOT EXISTS "outlookStatus" VARCHAR(60) DEFAULT 'Not Eligible';
ALTER TABLE "AuthorizedOrganizers" ADD COLUMN IF NOT EXISTS "outlookScopeName" VARCHAR(150) NULL;
ALTER TABLE "AuthorizedOrganizers" ADD COLUMN IF NOT EXISTS "outlookRbacVerified" BOOLEAN DEFAULT FALSE;
ALTER TABLE "AuthorizedOrganizers" ADD COLUMN IF NOT EXISTS "outlookMailReadGranted" BOOLEAN DEFAULT FALSE;
ALTER TABLE "AuthorizedOrganizers" ADD COLUMN IF NOT EXISTS "outlookAdapterMode" VARCHAR(40) DEFAULT 'MOCK';
ALTER TABLE "AuthorizedOrganizers" ADD COLUMN IF NOT EXISTS "outlookRetryCount" INT DEFAULT 0;
ALTER TABLE "AuthorizedOrganizers" ADD COLUMN IF NOT EXISTS "outlookLastError" TEXT NULL;
ALTER TABLE "AuthorizedOrganizers" ADD COLUMN IF NOT EXISTS "outlookAuthorizedAt" TIMESTAMP WITH TIME ZONE NULL;
ALTER TABLE "AuthorizedOrganizers" ADD COLUMN IF NOT EXISTS "outlookRevokedAt" TIMESTAMP WITH TIME ZONE NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_authorizedorganizers_email
  ON "AuthorizedOrganizers"("email")
  WHERE "email" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_authorizedorganizers_status
  ON "AuthorizedOrganizers"("eligibilityStatus");

-- 5. Dynamic Ownership Change History (Preserves full audit trail across updates)
CREATE TABLE IF NOT EXISTS "OrganizerOwnershipHistory" (
    "historyId" VARCHAR(100) PRIMARY KEY,
    "entityType" VARCHAR(40) NOT NULL,
    "entityId" VARCHAR(100) NOT NULL,
    "entityName" VARCHAR(200) NULL,
    "accountId" VARCHAR(100) NULL,
    "previousOwnerUid" VARCHAR(100) NULL,
    "previousOwnerEmail" VARCHAR(150) NULL,
    "previousOwnerEmployeeId" VARCHAR(100) NULL,
    "previousOwnerName" VARCHAR(150) NULL,
    "newOwnerUid" VARCHAR(100) NULL,
    "newOwnerEmail" VARCHAR(150) NULL,
    "newOwnerEmployeeId" VARCHAR(100) NULL,
    "newOwnerName" VARCHAR(150) NULL,
    "changeType" VARCHAR(60) NOT NULL,
    "triggerSource" VARCHAR(100) NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ownershiphist_entity ON "OrganizerOwnershipHistory"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS idx_ownershiphist_created ON "OrganizerOwnershipHistory"("createdAt");

-- 6. Automated Teams Application Access Policy Sync Queue
CREATE TABLE IF NOT EXISTS "OrganizerPolicySync" (
    "jobId" VARCHAR(100) PRIMARY KEY,
    "organizerKey" VARCHAR(150) NOT NULL,
    "uid" VARCHAR(100) NULL,
    "employeeId" VARCHAR(100) NULL,
    "email" VARCHAR(150) NULL,
    "channel" VARCHAR(40) DEFAULT 'TEAMS',
    "action" VARCHAR(40) NOT NULL,
    "policyName" VARCHAR(150) NOT NULL,
    "applicationId" VARCHAR(100) NULL,
    "status" VARCHAR(60) NOT NULL,
    "adapterMode" VARCHAR(40) DEFAULT 'MOCK',
    "existingPolicyBefore" VARCHAR(150) NULL,
    "dependentWorkflows" JSONB DEFAULT '[]',
    "attemptCount" INT DEFAULT 0,
    "maxAttempts" INT DEFAULT 3,
    "nextRetryAt" TIMESTAMP WITH TIME ZONE NULL,
    "lastError" TEXT NULL,
    "verificationResult" JSONB NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orgpolicysync_status ON "OrganizerPolicySync"("status", "nextRetryAt");
CREATE INDEX IF NOT EXISTS idx_orgpolicysync_org ON "OrganizerPolicySync"("organizerKey");

-- 7. Technical Organizer Status & Policy Lifecycle History
CREATE TABLE IF NOT EXISTS "OrganizerApprovalHistory" (
    "auditId" VARCHAR(100) PRIMARY KEY,
    "organizerKey" VARCHAR(150) NOT NULL,
    "uid" VARCHAR(100) NULL,
    "employeeId" VARCHAR(100) NULL,
    "email" VARCHAR(150) NULL,
    "previousStatus" VARCHAR(60) NULL,
    "newStatus" VARCHAR(60) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "policyName" VARCHAR(150) NULL,
    "adapterMode" VARCHAR(40) NULL,
    "reason" TEXT NULL,
    "details" JSONB NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orgapprovalhist_org ON "OrganizerApprovalHistory"("organizerKey");

-- 8. Incremental Synchronization Checkpoints & Error Tracking
CREATE TABLE IF NOT EXISTS "SyncCheckpoints" (
    "checkpointId" VARCHAR(150) PRIMARY KEY,
    "provider" VARCHAR(60) NOT NULL,
    "organizerEmail" VARCHAR(150) NOT NULL,
    "deltaLink" TEXT NULL,
    "lastSyncedAt" TIMESTAMP WITH TIME ZONE NULL,
    "lastStatus" VARCHAR(40) NULL,
    "lastError" TEXT NULL,
    "itemsProcessed" INT DEFAULT 0,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_synccheckpoints_organizer ON "SyncCheckpoints"("organizerEmail");

-- 9. Unmatched & Ambiguous Communication Review Queue
CREATE TABLE IF NOT EXISTS "CommunicationReviewQueue" (
    "reviewId" VARCHAR(100) PRIMARY KEY,
    "channel" VARCHAR(50) NOT NULL,
    "externalResourceId" VARCHAR(255) NOT NULL,
    "organizerEmail" VARCHAR(150) NULL,
    "subject" VARCHAR(300) NULL,
    "occurredAt" TIMESTAMP WITH TIME ZONE NULL,
    "externalParticipants" JSONB NULL,
    "internalParticipants" JSONB NULL,
    "candidateAccounts" JSONB NULL,
    "reason" VARCHAR(100) NOT NULL,
    "payload" JSONB NULL,
    "status" VARCHAR(40) DEFAULT 'PENDING_REVIEW',
    "resolvedAccountId" VARCHAR(50) NULL REFERENCES "Accounts"("accountId") ON DELETE SET NULL,
    "resolvedByUid" VARCHAR(100) NULL,
    "resolvedAt" TIMESTAMP WITH TIME ZONE NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commreview_status ON "CommunicationReviewQueue"("status");
CREATE UNIQUE INDEX IF NOT EXISTS idx_commreview_channel_ext ON "CommunicationReviewQueue"("channel", "externalResourceId");

-- 10. AI Recommendations & Employee Review Queue (Approve, Edit, Reject, Defer)
CREATE TABLE IF NOT EXISTS "AiRecommendations" (
    "recommendationId" VARCHAR(100) PRIMARY KEY,
    "accountId" VARCHAR(50) NULL REFERENCES "Accounts"("accountId") ON DELETE CASCADE,
    "contactId" VARCHAR(50) NULL REFERENCES "Contacts"("contactId") ON DELETE SET NULL,
    "category" VARCHAR(50) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT NULL,
    "priority" VARCHAR(40) DEFAULT 'Medium',
    "severity" VARCHAR(40) NULL,
    "suggestedAssigneeUid" VARCHAR(100) NULL,
    "suggestedAssigneeName" VARCHAR(150) NULL,
    "suggestedDueDate" VARCHAR(50) NULL,
    "sourceType" VARCHAR(60) NOT NULL,
    "sourceId" VARCHAR(150) NULL,
    "interactionId" VARCHAR(100) NULL,
    "meetingId" VARCHAR(150) NULL,
    "internetMessageId" VARCHAR(255) NULL,
    "sourceTimestamp" TIMESTAMP WITH TIME ZONE NULL,
    "evidenceExcerpt" TEXT NULL,
    "sourceReferences" JSONB DEFAULT '{}',
    "status" VARCHAR(40) DEFAULT 'PENDING_REVIEW',
    "deferredUntil" TIMESTAMP WITH TIME ZONE NULL,
    "reviewedByUid" VARCHAR(100) NULL,
    "reviewedByName" VARCHAR(150) NULL,
    "reviewedAt" TIMESTAMP WITH TIME ZONE NULL,
    "reviewNotes" TEXT NULL,
    "createdEntityType" VARCHAR(50) NULL,
    "createdEntityId" VARCHAR(100) NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_airec_account_status ON "AiRecommendations"("accountId", "status");
CREATE INDEX IF NOT EXISTS idx_airec_source ON "AiRecommendations"("sourceType", "sourceId");

-- 11. SyncHistory & UserIntegrations
CREATE TABLE IF NOT EXISTS "SyncHistory" (
    "syncId" VARCHAR(50) PRIMARY KEY,
    "provider" VARCHAR(100),
    "mailbox" VARCHAR(150),
    "triggeredByUid" VARCHAR(50),
    "triggeredByName" VARCHAR(150),
    "results" TEXT,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "UserIntegrations" (
    "id" VARCHAR(100) PRIMARY KEY,
    "userId" VARCHAR(100) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiry" VARCHAR(100),
    "scope" TEXT,
    "status" VARCHAR(40) DEFAULT 'ACTIVE',
    "createdAt" VARCHAR(50),
    "updatedAt" VARCHAR(50)
);

COMMIT;

