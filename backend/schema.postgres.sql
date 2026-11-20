-- ─────────────────────────────────────────────────────────
-- Customer Pulse CRM — PostgreSQL Schema
-- Nest Digital Internal | PostgreSQL + LDAP + RBAC
-- ─────────────────────────────────────────────────────────

-- Accounts Table
CREATE TABLE IF NOT EXISTS "Accounts" (
    "accountId" VARCHAR(50) PRIMARY KEY,
    "companyName" VARCHAR(150) NOT NULL,
    "industry" VARCHAR(100),
    "region" VARCHAR(100),
    "healthScore" INT DEFAULT 70,
    "status" VARCHAR(50) DEFAULT 'Warning',
    "email" VARCHAR(150),
    "phone" VARCHAR(50),
    "ceoName" VARCHAR(150),
    "domain" VARCHAR(150),
    "projectName" VARCHAR(150),
    "journeyStage" VARCHAR(50) DEFAULT 'Awareness',
    "previousJourneyStage" VARCHAR(50) NULL,
    "journeyUpdatedAt" TIMESTAMP NULL,
    "journeyReason" TEXT NULL,
    "journeyTrigger" VARCHAR(50) NULL,
    "journeyManualOverrideAt" TIMESTAMP NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users Table
CREATE TABLE IF NOT EXISTS "Users" (
    "uid" VARCHAR(50) PRIMARY KEY,
    "email" VARCHAR(150) UNIQUE NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "role" VARCHAR(50) DEFAULT 'Employee',
    "position" VARCHAR(150),
    "userType" VARCHAR(100),
    "department" VARCHAR(100),
    "password" VARCHAR(150),
    "reportingTo" VARCHAR(150),
    "reportingManagerName" VARCHAR(150),
    "bu" VARCHAR(100),
    "buHeadName" VARCHAR(150),
    "buHeadEmail" VARCHAR(150),
    "phone" VARCHAR(50),
    "employeeId" VARCHAR(50),
    "jobRole" VARCHAR(150),
    "project" VARCHAR(150),
    "projects" TEXT,
    "employees" TEXT,
    "ldap_provisioned" BOOLEAN DEFAULT FALSE,
    "last_login" TIMESTAMP NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contacts Table
CREATE TABLE IF NOT EXISTS "Contacts" (
    "contactId" VARCHAR(50) PRIMARY KEY,
    "accountId" VARCHAR(50) REFERENCES "Accounts"("accountId") ON DELETE CASCADE,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(150),
    "phone" VARCHAR(50),
    "designation" VARCHAR(150),
    "department" VARCHAR(100),
    "projectName" VARCHAR(150),
    "journeyStage" VARCHAR(50) DEFAULT 'Awareness',
    "previousJourneyStage" VARCHAR(50) NULL,
    "journeyUpdatedAt" TIMESTAMP NULL,
    "journeyReason" TEXT NULL,
    "journeyTrigger" VARCHAR(50) NULL,
    "journeyManualOverrideAt" TIMESTAMP NULL,
    "projectIndustry" VARCHAR(100),
    "projectType" VARCHAR(100),
    "hierarchyTag" VARCHAR(50),
    "influenceTag" VARCHAR(50),
    "ownerId" VARCHAR(50) NULL,
    "ownerName" VARCHAR(150) NULL,
    "birthday" VARCHAR(50) NULL,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Interactions Table
CREATE TABLE IF NOT EXISTS "Interactions" (
    "interactionId" VARCHAR(50) PRIMARY KEY,
    "accountId" VARCHAR(50) REFERENCES "Accounts"("accountId") ON DELETE CASCADE,
    "contactId" VARCHAR(50) REFERENCES "Contacts"("contactId"),
    "source" VARCHAR(50) NOT NULL,
    "subject" VARCHAR(250),
    "messageText" TEXT NOT NULL,
    "date" VARCHAR(50),
    "time" VARCHAR(50),
    "loggedByUid" VARCHAR(50),
    "loggedByName" VARCHAR(150),
    "sentiment" VARCHAR(50),
    "riskDetected" BOOLEAN DEFAULT FALSE,
    "riskCategory" VARCHAR(150),
    "actionMentions" TEXT,
    "attachments" TEXT NULL,
    "internetMessageId" VARCHAR(250) NULL,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Replies Table
CREATE TABLE IF NOT EXISTS "Replies" (
    "replyId" VARCHAR(50) PRIMARY KEY,
    "interactionId" VARCHAR(50) REFERENCES "Interactions"("interactionId") ON DELETE CASCADE,
    "authorUid" VARCHAR(50) NOT NULL,
    "authorName" VARCHAR(150) NOT NULL,
    "text" TEXT NOT NULL,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teams Meetings & Transcripts Table
CREATE TABLE IF NOT EXISTS "TeamsMeetings" (
    "meetingId" VARCHAR(150) PRIMARY KEY,
    "onlineMeetingId" VARCHAR(255) NULL,
    "organizerEmployeeId" VARCHAR(100) NULL,
    "organizerEmail" VARCHAR(150) NOT NULL,
    "subject" VARCHAR(300),
    "startDateTime" TIMESTAMP WITH TIME ZONE,
    "endDateTime" TIMESTAMP WITH TIME ZONE,
    "joinWebUrl" TEXT,
    "transcriptId" VARCHAR(150),
    "transcriptStatus" VARCHAR(60) DEFAULT 'PENDING',
    "rawTranscript" TEXT,
    "parsedDialogue" JSONB,
    "speakers" JSONB,
    "attendees" JSONB,
    "externalAttendees" JSONB,
    "internalAttendees" JSONB,
    "relatedContactIds" JSONB NULL,
    "aiSummary" TEXT NULL,
    "keyTopics" JSONB NULL,
    "keyDecisions" JSONB NULL,
    "actionItems" JSONB NULL,
    "customerRequirements" JSONB NULL,
    "commitments" JSONB NULL,
    "risksIdentified" JSONB NULL,
    "sentiment" VARCHAR(50) NULL,
    "aiStatus" VARCHAR(50) DEFAULT 'PENDING',
    "aiError" TEXT NULL,
    "hasRecording" BOOLEAN DEFAULT FALSE,
    "durationSeconds" INT DEFAULT 0,
    "wordCount" INT DEFAULT 0,
    "accountId" VARCHAR(50) REFERENCES "Accounts"("accountId") ON DELETE SET NULL,
    "contactId" VARCHAR(50) REFERENCES "Contacts"("contactId") ON DELETE SET NULL,
    "interactionId" VARCHAR(50) REFERENCES "Interactions"("interactionId") ON DELETE SET NULL,
    "matchConfidence" INT NULL,
    "matchReason" VARCHAR(100) NULL,
    "associatedAccountIds" JSONB NULL,
    "syncStatus" VARCHAR(50) DEFAULT 'SYNCED',
    "lastError" TEXT NULL,
    "lastSyncedAt" TIMESTAMP WITH TIME ZONE NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teamsmeetings_account ON "TeamsMeetings"("accountId");
CREATE INDEX IF NOT EXISTS idx_teamsmeetings_organizer ON "TeamsMeetings"("organizerEmail");
CREATE INDEX IF NOT EXISTS idx_teamsmeetings_onlinemeetingid ON "TeamsMeetings"("onlineMeetingId");
CREATE INDEX IF NOT EXISTS idx_teamsmeetings_startdatetime ON "TeamsMeetings"("startDateTime");
CREATE INDEX IF NOT EXISTS idx_teamsmeetings_transcriptstatus ON "TeamsMeetings"("transcriptStatus");

-- Automated Eligible Teams Organizers (Derived from Account Owners & Key Contact Owners)
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
    "teamsStatus" VARCHAR(60) NULL,
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_authorizedorganizers_email ON "AuthorizedOrganizers"("email") WHERE "email" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_authorizedorganizers_status ON "AuthorizedOrganizers"("eligibilityStatus");

-- Dynamic Ownership Change History
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

-- Automated Teams Application Access Policy Sync Queue
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

-- Technical Organizer Status & Policy Lifecycle History
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

-- Incremental Synchronization Checkpoints
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

-- Unmatched & Ambiguous Communication Review Queue
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

-- AI Recommendations & Employee Review Queue (Approve, Edit, Reject, Defer)
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

-- User OAuth Integrations Table
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

-- Risks Table
CREATE TABLE IF NOT EXISTS "Risks" (
    "riskId" VARCHAR(50) PRIMARY KEY,
    "accountId" VARCHAR(50) REFERENCES "Accounts"("accountId") ON DELETE CASCADE,
    "category" VARCHAR(150),
    "severity" VARCHAR(50),
    "description" TEXT,
    "status" VARCHAR(50) DEFAULT 'Open',
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS "Notifications" (
    "notificationId" VARCHAR(50) PRIMARY KEY,
    "toUserId" VARCHAR(50) NULL,
    "accountId" VARCHAR(50) NULL REFERENCES "Accounts"("accountId") ON DELETE CASCADE,
    "interactionId" VARCHAR(50) NULL REFERENCES "Interactions"("interactionId") ON DELETE CASCADE,
    "taskId" VARCHAR(50) NULL,
    "fromAdminUid" VARCHAR(50) NULL,
    "fromAdminName" VARCHAR(150) NULL,
    "link" TEXT NULL,
    "path" TEXT NULL,
    "type" VARCHAR(100) NOT NULL,
    "message" TEXT NOT NULL,
    "severity" VARCHAR(50) NULL,
    "read" BOOLEAN DEFAULT FALSE,
    "readAt" TIMESTAMP NULL,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- HealthScores Table
CREATE TABLE IF NOT EXISTS "HealthScores" (
    "id" SERIAL PRIMARY KEY,
    "accountId" VARCHAR(50) REFERENCES "Accounts"("accountId") ON DELETE CASCADE,
    "healthScore" INT NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Summaries Table
CREATE TABLE IF NOT EXISTS "Summaries" (
    "summaryId" VARCHAR(50) PRIMARY KEY,
    "accountId" VARCHAR(50) REFERENCES "Accounts"("accountId") ON DELETE CASCADE,
    "summaryText" TEXT NOT NULL,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ActivityLogs Table
CREATE TABLE IF NOT EXISTS "ActivityLogs" (
    "logId" VARCHAR(50) PRIMARY KEY,
    "userId" VARCHAR(50) NOT NULL,
    "userName" VARCHAR(150),
    "action" VARCHAR(100) NOT NULL,
    "details" TEXT,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks Table
CREATE TABLE IF NOT EXISTS "Tasks" (
    "taskId" VARCHAR(50) PRIMARY KEY,
    "title" VARCHAR(250) NOT NULL,
    "description" TEXT NOT NULL,
    "assignedByUid" VARCHAR(50) NOT NULL,
    "assignedByName" VARCHAR(150),
    "assignedToUid" VARCHAR(50) NOT NULL,
    "assignedToName" VARCHAR(150),
    "priority" VARCHAR(50) DEFAULT 'Medium',
    "status" VARCHAR(50) DEFAULT 'Pending',
    "dueDate" VARCHAR(50),
    "completionNote" TEXT,
    "accountId" VARCHAR(50) NULL,
    "contactId" VARCHAR(50) NULL,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TaskReplies Table
CREATE TABLE IF NOT EXISTS "TaskReplies" (
    "replyId" VARCHAR(50) PRIMARY KEY,
    "taskId" VARCHAR(50) REFERENCES "Tasks"("taskId") ON DELETE CASCADE,
    "authorUid" VARCHAR(50) NOT NULL,
    "authorName" VARCHAR(150) NOT NULL,
    "text" TEXT NOT NULL,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- EmailQueue Table
CREATE TABLE IF NOT EXISTS "EmailQueue" (
    "queueId" VARCHAR(50) PRIMARY KEY,
    "recipientUid" VARCHAR(50),
    "recipientEmail" VARCHAR(150),
    "recipientName" VARCHAR(150),
    "eventType" VARCHAR(100),
    "templateId" VARCHAR(100),
    "subject" VARCHAR(250),
    "htmlBody" TEXT,
    "textBody" TEXT,
    "variables" TEXT,
    "relatedTaskId" VARCHAR(50),
    "relatedAccountId" VARCHAR(50),
    "status" VARCHAR(50) DEFAULT 'queued',
    "retryCount" INT DEFAULT 0,
    "maxRetries" INT DEFAULT 3,
    "scheduledAt" VARCHAR(50),
    "processedAt" VARCHAR(50),
    "failureReason" TEXT,
    "smtpResponse" TEXT,
    "error" TEXT,
    "createdAt" VARCHAR(50) DEFAULT CURRENT_TIMESTAMP
);

-- EmailTemplates Table
CREATE TABLE IF NOT EXISTS "EmailTemplates" (
    "templateId" VARCHAR(50) PRIMARY KEY,
    "name" VARCHAR(150) NOT NULL,
    "subject" VARCHAR(250) NOT NULL,
    "body" TEXT NOT NULL,
    "category" VARCHAR(100),
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- EmailLogs Table
CREATE TABLE IF NOT EXISTS "EmailLogs" (
    "logId" VARCHAR(50) PRIMARY KEY,
    "queueId" VARCHAR(50),
    "recipientUid" VARCHAR(50),
    "recipientEmail" VARCHAR(150),
    "recipientName" VARCHAR(150),
    "subject" VARCHAR(250),
    "eventType" VARCHAR(100),
    "templateId" VARCHAR(100),
    "status" VARCHAR(50),
    "sentAt" VARCHAR(50),
    "smtpResponse" TEXT,
    "failureReason" TEXT,
    "error" TEXT,
    "isMock" BOOLEAN DEFAULT FALSE,
    "createdAt" VARCHAR(50) DEFAULT CURRENT_TIMESTAMP
);

-- NotificationPreferences Table
CREATE TABLE IF NOT EXISTS "NotificationPreferences" (
    "uid" VARCHAR(50) PRIMARY KEY,
    "taskAssigned" BOOLEAN DEFAULT TRUE,
    "taskReassigned" BOOLEAN DEFAULT TRUE,
    "taskUpdated" BOOLEAN DEFAULT TRUE,
    "taskReminders" BOOLEAN DEFAULT TRUE,
    "taskStatusUpdates" BOOLEAN DEFAULT TRUE,
    "taskComments" BOOLEAN DEFAULT TRUE,
    "taskAttachments" BOOLEAN DEFAULT TRUE,
    "taskOverdue" BOOLEAN DEFAULT TRUE,
    "taskCompleted" BOOLEAN DEFAULT TRUE,
    "taskCancelled" BOOLEAN DEFAULT TRUE,
    "greetingEmails" BOOLEAN DEFAULT TRUE,
    "companyAnnouncements" BOOLEAN DEFAULT TRUE,
    "customerFollowups" BOOLEAN DEFAULT TRUE,
    "updatedAt" VARCHAR(50) DEFAULT CURRENT_TIMESTAMP
);

-- Risk Notifications Audit Table
CREATE TABLE IF NOT EXISTS risk_notifications (
    id VARCHAR(255) PRIMARY KEY,
    "accountId" VARCHAR(255),
    "riskKey" VARCHAR(255),
    "riskTitle" VARCHAR(255),
    severity VARCHAR(50),
    "senderUid" VARCHAR(255),
    "senderName" VARCHAR(255),
    "senderRole" VARCHAR(255),
    recipients TEXT,
    date VARCHAR(50),
    time VARCHAR(50),
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_risk_notifications_account ON risk_notifications("accountId");
CREATE INDEX IF NOT EXISTS idx_risk_notifications_riskkey ON risk_notifications("riskKey");
