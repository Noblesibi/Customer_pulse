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
    "reportingTo" VARCHAR(50),
    "bu" VARCHAR(100),
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
