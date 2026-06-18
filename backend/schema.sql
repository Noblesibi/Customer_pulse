-- Customer Pulse CRM Database Schema for Microsoft SQL Server

-- Accounts Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Accounts')
BEGIN
    CREATE TABLE Accounts (
        accountId NVARCHAR(50) PRIMARY KEY,
        companyName NVARCHAR(150) NOT NULL,
        industry NVARCHAR(100),
        region NVARCHAR(100),
        healthScore INT DEFAULT 70,
        status NVARCHAR(50) DEFAULT 'Warning',
        email NVARCHAR(150),
        phone NVARCHAR(50),
        ceoName NVARCHAR(150),
        domain NVARCHAR(150),
        projectName NVARCHAR(150),
        createdAt DATETIME2 DEFAULT GETDATE()
    );
END;

-- Users Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
BEGIN
    CREATE TABLE Users (
        uid NVARCHAR(50) PRIMARY KEY,
        email NVARCHAR(150) UNIQUE NOT NULL,
        name NVARCHAR(150) NOT NULL,
        role NVARCHAR(50) DEFAULT 'Employee', -- Admin, Executive, Sales Manager, Employee
        position NVARCHAR(150),
        userType NVARCHAR(100),
        department NVARCHAR(100),
        password NVARCHAR(150), -- Local auth password hash/fallback
        reportingTo NVARCHAR(50),
        bu NVARCHAR(100),
        project NVARCHAR(150),
        projects NVARCHAR(MAX), -- JSON stringified array of objects
        employees NVARCHAR(MAX), -- JSON stringified array of strings
        createdAt DATETIME2 DEFAULT GETDATE()
    );
END;

-- Contacts Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Contacts')
BEGIN
    CREATE TABLE Contacts (
        contactId NVARCHAR(50) PRIMARY KEY,
        accountId NVARCHAR(50) FOREIGN KEY REFERENCES Accounts(accountId) ON DELETE CASCADE,
        name NVARCHAR(150) NOT NULL,
        email NVARCHAR(150),
        phone NVARCHAR(50),
        designation NVARCHAR(150),
        department NVARCHAR(100),
        projectName NVARCHAR(150),
        projectIndustry NVARCHAR(100),
        hierarchyTag NVARCHAR(50),
        influenceTag NVARCHAR(50),
        createdAt DATETIME2 DEFAULT GETDATE()
    );
END;

-- Interactions Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Interactions')
BEGIN
    CREATE TABLE Interactions (
        interactionId NVARCHAR(50) PRIMARY KEY,
        accountId NVARCHAR(50) FOREIGN KEY REFERENCES Accounts(accountId) ON DELETE CASCADE,
        contactId NVARCHAR(50) FOREIGN KEY REFERENCES Contacts(contactId),
        source NVARCHAR(50) NOT NULL,
        subject NVARCHAR(250),
        messageText NVARCHAR(MAX) NOT NULL,
        date NVARCHAR(50),
        time NVARCHAR(50),
        loggedByUid NVARCHAR(50),
        loggedByName NVARCHAR(150),
        sentiment NVARCHAR(50),
        riskDetected BIT DEFAULT 0,
        riskCategory NVARCHAR(150),
        actionMentions NVARCHAR(MAX), -- JSON stringified array of objects
        timestamp DATETIME2 DEFAULT GETDATE()
    );
END;

-- Replies Table (for nested interaction comments/replies)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Replies')
BEGIN
    CREATE TABLE Replies (
        replyId NVARCHAR(50) PRIMARY KEY,
        interactionId NVARCHAR(50) FOREIGN KEY REFERENCES Interactions(interactionId) ON DELETE CASCADE,
        authorUid NVARCHAR(50) NOT NULL,
        authorName NVARCHAR(150) NOT NULL,
        text NVARCHAR(MAX) NOT NULL,
        timestamp DATETIME2 DEFAULT GETDATE()
    );
END;

-- Risks Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Risks')
BEGIN
    CREATE TABLE Risks (
        riskId NVARCHAR(50) PRIMARY KEY,
        accountId NVARCHAR(50) FOREIGN KEY REFERENCES Accounts(accountId) ON DELETE CASCADE,
        category NVARCHAR(150),
        severity NVARCHAR(50),
        description NVARCHAR(MAX),
        status NVARCHAR(50) DEFAULT 'Open', -- Open, Resolved
        createdAt DATETIME2 DEFAULT GETDATE()
    );
END;

-- Notifications Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Notifications')
BEGIN
    CREATE TABLE Notifications (
        notificationId NVARCHAR(50) PRIMARY KEY,
        toUserId NVARCHAR(50) NULL,
        accountId NVARCHAR(50) NULL FOREIGN KEY REFERENCES Accounts(accountId) ON DELETE CASCADE,
        interactionId NVARCHAR(50) NULL FOREIGN KEY REFERENCES Interactions(interactionId) ON DELETE CASCADE,
        type NVARCHAR(100) NOT NULL,
        message NVARCHAR(MAX) NOT NULL,
        severity NVARCHAR(50) NULL,
        read BIT DEFAULT 0,
        readAt DATETIME2 NULL,
        timestamp DATETIME2 DEFAULT GETDATE()
    );
END;

-- HealthScores Table (Historical Log)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'HealthScores')
BEGIN
    CREATE TABLE HealthScores (
        id INT IDENTITY(1,1) PRIMARY KEY,
        accountId NVARCHAR(50) FOREIGN KEY REFERENCES Accounts(accountId) ON DELETE CASCADE,
        healthScore INT NOT NULL,
        status NVARCHAR(50) NOT NULL,
        timestamp DATETIME2 DEFAULT GETDATE()
    );
END;

-- Summaries Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Summaries')
BEGIN
    CREATE TABLE Summaries (
        summaryId NVARCHAR(50) PRIMARY KEY,
        accountId NVARCHAR(50) FOREIGN KEY REFERENCES Accounts(accountId) ON DELETE CASCADE,
        summaryText NVARCHAR(MAX) NOT NULL,
        timestamp DATETIME2 DEFAULT GETDATE()
    );
END;

-- ActivityLogs Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ActivityLogs')
BEGIN
    CREATE TABLE ActivityLogs (
        logId NVARCHAR(50) PRIMARY KEY,
        userId NVARCHAR(50) NOT NULL,
        userName NVARCHAR(150),
        action NVARCHAR(100) NOT NULL,
        details NVARCHAR(MAX),
        timestamp DATETIME2 DEFAULT GETDATE()
    );
END;

