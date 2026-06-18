-- Customer Pulse CRM Database Schema for MySQL / Percona Server

-- Accounts Table
CREATE TABLE IF NOT EXISTS Accounts (
    accountId VARCHAR(50) PRIMARY KEY,
    companyName VARCHAR(150) NOT NULL,
    industry VARCHAR(100),
    region VARCHAR(100),
    healthScore INT DEFAULT 70,
    status VARCHAR(50) DEFAULT 'Warning',
    email VARCHAR(150),
    phone VARCHAR(50),
    ceoName VARCHAR(150),
    domain VARCHAR(150),
    projectName VARCHAR(150),
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Users Table
CREATE TABLE IF NOT EXISTS Users (
    uid VARCHAR(50) PRIMARY KEY,
    email VARCHAR(150) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    role VARCHAR(50) DEFAULT 'Employee', -- Admin, Executive, Sales Manager, Employee
    position VARCHAR(150),
    userType VARCHAR(100),
    department VARCHAR(100),
    password VARCHAR(150), -- Local auth password hash/fallback
    reportingTo VARCHAR(50),
    bu VARCHAR(100),
    project VARCHAR(150),
    projects JSON, -- JSON array of objects
    employees JSON, -- JSON array of strings
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Contacts Table
CREATE TABLE IF NOT EXISTS Contacts (
    contactId VARCHAR(50) PRIMARY KEY,
    accountId VARCHAR(50),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150),
    phone VARCHAR(50),
    designation VARCHAR(150),
    department VARCHAR(100),
    projectName VARCHAR(150),
    projectIndustry VARCHAR(100),
    hierarchyTag VARCHAR(50),
    influenceTag VARCHAR(50),
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accountId) REFERENCES Accounts(accountId) ON DELETE CASCADE
);

-- Interactions Table
CREATE TABLE IF NOT EXISTS Interactions (
    interactionId VARCHAR(50) PRIMARY KEY,
    accountId VARCHAR(50),
    contactId VARCHAR(50),
    source VARCHAR(50) NOT NULL,
    subject VARCHAR(250),
    messageText LONGTEXT NOT NULL,
    date VARCHAR(50),
    time VARCHAR(50),
    loggedByUid VARCHAR(50),
    loggedByName VARCHAR(150),
    sentiment VARCHAR(50),
    riskDetected BOOLEAN DEFAULT FALSE,
    riskCategory VARCHAR(150),
    actionMentions JSON, -- JSON array of objects
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accountId) REFERENCES Accounts(accountId) ON DELETE CASCADE,
    FOREIGN KEY (contactId) REFERENCES Contacts(contactId) ON DELETE SET NULL
);

-- Replies Table (for nested interaction comments/replies)
CREATE TABLE IF NOT EXISTS Replies (
    replyId VARCHAR(50) PRIMARY KEY,
    interactionId VARCHAR(50),
    authorUid VARCHAR(50) NOT NULL,
    authorName VARCHAR(150) NOT NULL,
    text LONGTEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (interactionId) REFERENCES Interactions(interactionId) ON DELETE CASCADE
);

-- Risks Table
CREATE TABLE IF NOT EXISTS Risks (
    riskId VARCHAR(50) PRIMARY KEY,
    accountId VARCHAR(50),
    category VARCHAR(150),
    severity VARCHAR(50),
    description LONGTEXT,
    status VARCHAR(50) DEFAULT 'Open', -- Open, Resolved
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accountId) REFERENCES Accounts(accountId) ON DELETE CASCADE
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS Notifications (
    notificationId VARCHAR(50) PRIMARY KEY,
    toUserId VARCHAR(50) NULL,
    accountId VARCHAR(50) NULL,
    interactionId VARCHAR(50) NULL,
    type VARCHAR(100) NOT NULL,
    message LONGTEXT NOT NULL,
    severity VARCHAR(50) NULL,
    `read` BOOLEAN DEFAULT FALSE,
    readAt DATETIME NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accountId) REFERENCES Accounts(accountId) ON DELETE CASCADE,
    FOREIGN KEY (interactionId) REFERENCES Interactions(interactionId) ON DELETE CASCADE
);

-- HealthScores Table (Historical Log)
CREATE TABLE IF NOT EXISTS HealthScores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    accountId VARCHAR(50),
    healthScore INT NOT NULL,
    status VARCHAR(50) NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accountId) REFERENCES Accounts(accountId) ON DELETE CASCADE
);

-- Summaries Table
CREATE TABLE IF NOT EXISTS Summaries (
    summaryId VARCHAR(50) PRIMARY KEY,
    accountId VARCHAR(50),
    summaryText LONGTEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (accountId) REFERENCES Accounts(accountId) ON DELETE CASCADE
);

-- ActivityLogs Table
CREATE TABLE IF NOT EXISTS ActivityLogs (
    logId VARCHAR(50) PRIMARY KEY,
    userId VARCHAR(50) NOT NULL,
    userName VARCHAR(150),
    action VARCHAR(100) NOT NULL,
    details LONGTEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

