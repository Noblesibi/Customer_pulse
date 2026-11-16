import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'customer_pulse',
  options: '-c timezone=UTC'
};

let pool;
let isConnected = false;

// Table mapping to map collection names to PostgreSQL table names
const tableMap = {
  users: 'Users',
  accounts: 'Accounts',
  contacts: 'Contacts',
  interactions: 'Interactions',
  replies: 'Replies',
  risks: 'Risks',
  notifications: 'Notifications',
  healthscores: 'HealthScores',
  accountsignals: 'AccountSignals',
  summaries: 'Summaries',
  activitylogs: 'ActivityLogs',
  tasks: 'Tasks',
  taskreplies: 'TaskReplies',
  emailqueue: 'EmailQueue',
  emailtemplates: 'EmailTemplates',
  emaillogs: 'EmailLogs',
  notificationpreferences: 'NotificationPreferences',
  synchistory: 'SyncHistory',
  celebrationevents: 'CelebrationEvents',
  userintegrations: 'UserIntegrations',
  healthscoreconfigs: 'HealthScoreConfigs',
  scoring_profiles: 'scoring_profiles',
  scoring_rules: 'scoring_rules',
  account_scoring_overrides: 'account_scoring_overrides',
  custom_signals: 'custom_signals',
  account_scores_history: 'account_scores_history',
  risk_rules: 'risk_rules',
  risk_flags: 'risk_flags',
  journeyhistory: 'JourneyHistory',
  risk_notifications: 'risk_notifications',
  teamsmeetings: 'TeamsMeetings'
};

// Map collection names to primary key fields
const keyFields = {
  users: 'uid',
  accounts: 'accountId',
  contacts: 'contactId',
  interactions: 'interactionId',
  teamsmeetings: 'meetingId',
  replies: 'replyId',
  risks: 'riskId',
  notifications: 'notificationId',
  healthscores: 'id',
  accountsignals: 'accountId',
  summaries: 'summaryId',
  activitylogs: 'logId',
  tasks: 'taskId',
  taskreplies: 'replyId',
  emailqueue: 'queueId',
  emailtemplates: 'templateId',
  emaillogs: 'logId',
  notificationpreferences: 'uid',
  synchistory: 'syncId',
  celebrationevents: 'id',
  userintegrations: 'id',
  healthscoreconfigs: 'id',
  scoring_profiles: 'id',
  scoring_rules: 'id',
  account_scoring_overrides: 'id',
  custom_signals: 'id',
  account_scores_history: 'id',
  risk_rules: 'id',
  risk_flags: 'id',
  journeyhistory: 'id',
  risk_notifications: 'id'
};

/**
 * Parses database rows back into format expected by application.
 * Rehydrates JSON strings to Javascript objects/arrays, maps boolean fields.
 */
function parseRow(tableName, row) {
  if (!row) return null;
  const data = { ...row };
  
  if (tableName === 'Users') {
    if (typeof data.projects === 'string') {
      try { data.projects = JSON.parse(data.projects); } catch (e) { data.projects = []; }
    }
    if (typeof data.employees === 'string') {
      try { data.employees = JSON.parse(data.employees); } catch (e) { data.employees = []; }
    }
  }
  
  if (tableName === 'Interactions') {
    if (typeof data.actionMentions === 'string') {
      try { data.actionMentions = JSON.parse(data.actionMentions); } catch (e) { data.actionMentions = []; }
    }
    if (typeof data.attachments === 'string') {
      try { data.attachments = JSON.parse(data.attachments); } catch (e) { data.attachments = []; }
    }
    if (typeof data.businessOpportunities === 'string') {
      try { data.businessOpportunities = JSON.parse(data.businessOpportunities); } catch (e) { data.businessOpportunities = []; }
    }
    if (typeof data.commitments === 'string') {
      try { data.commitments = JSON.parse(data.commitments); } catch (e) { data.commitments = []; }
    }
    if (typeof data.followUpSignals === 'string') {
      try { data.followUpSignals = JSON.parse(data.followUpSignals); } catch (e) { data.followUpSignals = []; }
    }
    data.riskDetected = !!data.riskDetected;
  }
  
  if (tableName === 'Notifications') {
    data.read = !!data.read;
  }

  if (tableName === 'EmailQueue') {
    if (typeof data.variables === 'string') {
      try { data.variables = JSON.parse(data.variables); } catch (e) { data.variables = {}; }
    }
  }
  
  // Ensure dates are stringified back into ISO strings for application uniformity
  for (const key of Object.keys(data)) {
    if (data[key] instanceof Date) {
      data[key] = data[key].toISOString();
    }
  }

  // Set the Firestore-like virtual `id` property
  const keyCol = keyFields[tableName.toLowerCase()] || 'id';
  data.id = data[keyCol];
  
  return data;
}

const tableColumnCache = new Map();

async function ensureTableColumns(connection, tableName, columns) {
  let existingCols = tableColumnCache.get(tableName.toLowerCase());
  if (!existingCols) {
    try {
      const res = await connection.query(`
        SELECT column_name FROM information_schema.columns WHERE lower(table_name) = lower($1)
      `, [tableName]);
      existingCols = new Set(res.rows.map(r => r.column_name));
      tableColumnCache.set(tableName.toLowerCase(), existingCols);
    } catch (e) {
      existingCols = new Set();
    }
  }

  for (const col of columns) {
    if (col === 'id') continue;
    if (!existingCols.has(col) && !existingCols.has(col.toLowerCase())) {
      try {
        await connection.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${col}" TEXT NULL`);
        existingCols.add(col);
        existingCols.add(col.toLowerCase());
        console.log(`✨ [Postgres Schema] Auto-added missing column "${col}" to "${tableName}" table.`);
      } catch (e) {
        console.warn(`Column add warning for "${col}" on "${tableName}":`, e.message);
      }
    }
  }
}

/**
 * Inserts or updates (Upsert) a row in the database with dynamic parameter binding.
 */
async function upsertRow(tableName, keyColumn, keyVal, data) {
  const connection = await getPool();
  
  // Check if row already exists
  const checkResult = await connection.query(`SELECT 1 FROM "${tableName}" WHERE "${keyColumn}" = $1`, [keyVal]);
  
  // Prepare input variables
  const columns = Object.keys(data).filter(col => col !== 'id');
  const formattedData = {};
  for (const col of columns) {
    let val = data[col];
    if (val === undefined) continue;
    if (val === null) {
      formattedData[col] = null;
    } else if (Array.isArray(val) || (typeof val === 'object' && !(val instanceof Date))) {
      formattedData[col] = JSON.stringify(val);
    } else if (typeof val === 'boolean') {
      formattedData[col] = val;
    } else {
      formattedData[col] = val;
    }
  }
  
  const colsToBind = Object.keys(formattedData);
  if (!colsToBind.includes(keyColumn)) {
    colsToBind.push(keyColumn);
    formattedData[keyColumn] = keyVal;
  }

  // Self-heal table schema if any new column is missing
  await ensureTableColumns(connection, tableName, colsToBind);

  const values = colsToBind.map(col => formattedData[col]);
  
  if (checkResult.rows.length > 0) {
    // Perform UPDATE
    const setClause = colsToBind.filter(col => col !== keyColumn).map((col, idx) => `"${col}" = $${idx + 1}`).join(', ');
    if (setClause) {
      const updateValues = colsToBind.filter(col => col !== keyColumn).map(col => formattedData[col]);
      updateValues.push(keyVal);
      try {
        await connection.query(`UPDATE "${tableName}" SET ${setClause} WHERE "${keyColumn}" = $${updateValues.length}`, updateValues);
      } catch (upErr) {
        if (upErr.message && upErr.message.includes('does not exist')) {
          for (const col of colsToBind) {
            try { await connection.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${col}" TEXT NULL`); } catch (e) {}
          }
          await connection.query(`UPDATE "${tableName}" SET ${setClause} WHERE "${keyColumn}" = $${updateValues.length}`, updateValues);
        } else {
          throw upErr;
        }
      }
    }
  } else {
    // Perform INSERT
    const colList = colsToBind.map(col => `"${col}"`).join(', ');
    const placeholderList = colsToBind.map((_, idx) => `$${idx + 1}`).join(', ');
    try {
      await connection.query(`INSERT INTO "${tableName}" (${colList}) VALUES (${placeholderList})`, values);
    } catch (insErr) {
      if (insErr.message && insErr.message.includes('does not exist')) {
        for (const col of colsToBind) {
          try { await connection.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${col}" TEXT NULL`); } catch (e) {}
        }
        await connection.query(`INSERT INTO "${tableName}" (${colList}) VALUES (${placeholderList})`, values);
      } else {
        throw insErr;
      }
    }
  }
}

/**
 * Updates columns for an existing row in the database.
 */
async function updateRow(tableName, keyColumn, keyVal, data) {
  const connection = await getPool();
  const columns = Object.keys(data).filter(col => col !== 'id');
  const formattedData = {};
  for (const col of columns) {
    let val = data[col];
    if (val === undefined) continue;
    if (val === null) {
      formattedData[col] = null;
    } else if (Array.isArray(val) || (typeof val === 'object' && !(val instanceof Date))) {
      formattedData[col] = JSON.stringify(val);
    } else if (typeof val === 'boolean') {
      formattedData[col] = val;
    } else {
      formattedData[col] = val;
    }
  }
  
  const colsToBind = Object.keys(formattedData);
  if (colsToBind.length === 0) return;

  // Self-heal table schema if any column is missing
  await ensureTableColumns(connection, tableName, colsToBind);

  const values = colsToBind.map(col => formattedData[col]);
  const setClause = colsToBind.map((col, idx) => `"${col}" = $${idx + 1}`).join(', ');
  if (setClause) {
    values.push(keyVal);
    await connection.query(`UPDATE "${tableName}" SET ${setClause} WHERE "${keyColumn}" = $${values.length}`, values);
  }
}

/**
 * Gets a single row by its primary key.
 */
async function getRow(tableName, keyColumn, keyVal) {
  const connection = await getPool();
  const res = await connection.query(`SELECT * FROM "${tableName}" WHERE "${keyColumn}" = $1`, [keyVal]);
  if (res.rows.length === 0) return null;
  return parseRow(tableName, res.rows[0]);
}

/**
 * Generates an ID with correct prefix for new records.
 */
function generateId(collectionName) {
  if (collectionName.toLowerCase() === 'healthscores') {
    return Math.floor(Math.random() * 100000000);
  }
  const prefix = {
    users: 'user-',
    accounts: 'acc-',
    contacts: 'con-',
    interactions: 'int-',
    replies: 'reply-',
    risks: 'risk-',
    notifications: 'notif-',
    summaries: 'sum-',
    activitylogs: 'act-',
    emailqueue: 'eq-',
    emailtemplates: 'et-',
    emaillogs: 'el-'
  }[collectionName.toLowerCase()] || '';
  return prefix + Math.random().toString(36).substring(2, 11);
}

/**
 * Query helper class mimicking Firestore Query behaviors.
 */
class PostgreSQLQuery {
  constructor(collectionName) {
    this.collectionName = collectionName;
    this.tableName = tableMap[collectionName.toLowerCase()] || collectionName;
    this.filters = [];
    this.orderByField = null;
    this.orderByDir = 'ASC';
    this.limitNum = null;
  }
  
  where(field, op, val) {
    this.filters.push({ field, op, val });
    return this;
  }
  
  orderBy(field, dir = 'asc') {
    this.orderByField = field;
    this.orderByDir = dir.toUpperCase();
    return this;
  }
  
  limit(num) {
    this.limitNum = num;
    return this;
  }
  
  async get() {
    const connection = await getPool();
    let queryStr = `SELECT * FROM "${this.tableName}"`;
    const whereClauses = [];
    const params = [];
    
    this.filters.forEach((filter, index) => {
      let sqlOp = '=';
      if (filter.op === '==') sqlOp = '=';
      
      whereClauses.push(`"${filter.field}" ${sqlOp} $${index + 1}`);
      params.push(filter.val);
    });
    
    if (whereClauses.length > 0) {
      queryStr += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    if (this.orderByField) {
      queryStr += ` ORDER BY "${this.orderByField}" ${this.orderByDir}`;
    }
    
    if (this.limitNum !== null) {
      queryStr += ` LIMIT $${params.length + 1}`;
      params.push(parseInt(this.limitNum));
    }
    
    let res;
    try {
      res = await connection.query(queryStr, params);
    } catch (err) {
      if (err.message && err.message.includes('does not exist')) {
        return { docs: [], size: 0, forEach: () => {}, empty: true };
      }
      throw err;
    }
    const tableName = this.tableName;
    const keyCol = keyFields[this.collectionName.toLowerCase()] || 'id';
    
    const docs = res.rows.map(row => {
      const dataObj = parseRow(tableName, row);
      const docId = dataObj[keyCol];
      
      return {
        id: docId,
        exists: true,
        data: () => dataObj,
        ref: {
          delete: async () => {
            const poolConn = await getPool();
            await poolConn.query(`DELETE FROM "${tableName}" WHERE "${keyCol}" = $1`, [docId]);
          },
          update: async (updates) => {
            await updateRow(tableName, keyCol, docId, updates);
          }
        }
      };
    });
    
    return { 
      docs, 
      size: docs.length,
      empty: docs.length === 0,
      forEach(callback) {
        docs.forEach(callback);
      }
    };
  }
}

/**
 * Nested collection helper mimicking sub-collections (e.g. replies inside interactions).
 */
class PostgreSQLSubCollection {
  constructor(parentTableName, parentId, subColName) {
    this.parentTableName = parentTableName;
    this.parentId = parentId;
    this.subColName = subColName;
    this.isTaskReply = parentTableName === 'Tasks';
    this.targetTable = this.isTaskReply ? 'TaskReplies' : 'Replies';
    this.keyField = 'replyId';
    this.parentField = this.isTaskReply ? 'taskId' : 'interactionId';
  }
  
  doc(replyId) {
    const self = this;
    const id = replyId || generateId('replies');
    return {
      id,
      get: async () => {
        const row = await getRow(self.targetTable, self.keyField, id);
        return {
          exists: !!row,
          id,
          data: () => row
        };
      },
      set: async (val) => {
        const data = { ...val };
        data[self.parentField] = self.parentId;
        data[self.keyField] = id;
        await upsertRow(self.targetTable, self.keyField, id, data);
        return { id };
      },
      update: async (val) => {
        await updateRow(self.targetTable, self.keyField, id, val);
        return { id };
      },
      delete: async () => {
        const connection = await getPool();
        await connection.query(`DELETE FROM "${self.targetTable}" WHERE "${self.keyField}" = $1`, [id]);
        return { id };
      }
    };
  }
  
  async get() {
    const connection = await getPool();
    const res = await connection.query(`SELECT * FROM "${this.targetTable}" WHERE "${this.parentField}" = $1`, [this.parentId]);
    const docs = res.rows.map(row => {
      const dataObj = parseRow(this.targetTable, row);
      return {
        id: dataObj[this.keyField],
        exists: true,
        data: () => dataObj
      };
    });
    return { docs, size: docs.length };
  }
}

/**
 * Firestore-compatible collection interface for top-level tables.
 */
class PostgreSQLCollection {
  constructor(collectionName) {
    this.collectionName = collectionName;
    this.tableName = tableMap[collectionName.toLowerCase()] || collectionName;
  }
  
  doc(id) {
    const self = this;
    const docId = id || generateId(self.collectionName);
    const keyCol = keyFields[self.collectionName.toLowerCase()] || 'id';
    
    return {
      id: docId,
      get: async () => {
        const row = await getRow(self.tableName, keyCol, docId);
        return {
          exists: !!row,
          id: docId,
          data: () => row
        };
      },
      set: async (val) => {
        const data = { ...val };
        data[keyCol] = docId;
        await upsertRow(self.tableName, keyCol, docId, data);
        return { id: docId };
      },
      update: async (val) => {
        await updateRow(self.tableName, keyCol, docId, val);
        return { id: docId };
      },
      delete: async () => {
        const connection = await getPool();
        await connection.query(`DELETE FROM "${self.tableName}" WHERE "${keyCol}" = $1`, [docId]);
        return { id: docId };
      },
      collection(subColName) {
        return new PostgreSQLSubCollection(self.tableName, docId, subColName);
      }
    };
  }
  
  async add(val) {
    const id = generateId(this.collectionName);
    await this.doc(id).set(val);
    return {
      id,
      get: async () => {
        const row = await getRow(this.tableName, keyFields[this.collectionName.toLowerCase()] || 'id', id);
        return {
          exists: true,
          id,
          data: () => row
        };
      }
    };
  }
  
  where(field, op, val) {
    return new PostgreSQLQuery(this.collectionName).where(field, op, val);
  }
  
  orderBy(field, dir) {
    return new PostgreSQLQuery(this.collectionName).orderBy(field, dir);
  }
  
  limit(num) {
    return new PostgreSQLQuery(this.collectionName).limit(num);
  }
  
  async get() {
    return new PostgreSQLQuery(this.collectionName).get();
  }
}

/**
 * Replicates Firestore DB interface.
 */
class FirestoreSQLAdapter {
  collection(name) {
    return new PostgreSQLCollection(name);
  }
}

const db = new FirestoreSQLAdapter();

/**
 * Ensures target database exists, creating it via postgres default DB if missing.
 */
async function ensureDatabaseExists() {
  const targetDb = config.database;
  if (!targetDb) return;
  const bootstrapConfig = { ...config, database: 'postgres' };
  const client = new pg.Client(bootstrapConfig);
  try {
    await client.connect();
    const checkRes = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDb]);
    if (checkRes.rows.length === 0) {
      console.log(`🛠️ Database "${targetDb}" does not exist. Creating database...`);
      const safeDbName = targetDb.replace(/"/g, '""');
      await client.query(`CREATE DATABASE "${safeDbName}"`);
      console.log(`✅ Database "${targetDb}" created successfully.`);
    }
  } catch (err) {
    console.warn(`⚠️ Warning during database existence check: ${err.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Retrieves the initialized PostgreSQL pool, connecting if needed.
 */
async function getPool() {
  if (!isConnected) {
    pool = new pg.Pool(config);
    pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL idle client error:', err.message);
    });
    isConnected = true;
  }
  return pool;
}

/**
 * Initializes schema and runs auto-seeding.
 */
async function initializeDatabase() {
  let connection;
  try {
    await ensureDatabaseExists();
    connection = await getPool();
    console.log('\uD83D\uDD0C Connected to PostgreSQL Server successfully.');
    
    console.log('\u2699\uFE0F Verifying database tables...');
    const schemaPath = path.resolve(__dirname, '../../schema.postgres.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      
      // Split on semicolons, strip pure comment blocks, execute each statement
      const cleanSql = schemaSql
        .replace(/--.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      const statements = cleanSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
        
      for (const statement of statements) {
        try {
          await connection.query(statement);
        } catch (stmtErr) {
          // Log schema warnings but continue — most are benign "already exists" notices
          console.warn('Schema statement warning:', stmtErr.message || stmtErr);
        }
      }
      console.log('\u2705 Schema check/creation complete.');
    }

    // ── Migration: add new columns to existing Users table safely ──────────
    const migrations = [
      `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS ldap_provisioned BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS last_login TIMESTAMP NULL`,
      `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "reportingManagerName" VARCHAR(150) NULL`,
      `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "buHeadName" VARCHAR(150) NULL`,
      `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "buHeadEmail" VARCHAR(150) NULL`,
      `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(50) NULL`,
      `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "employeeId" VARCHAR(50) NULL`,
      `ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "jobRole" VARCHAR(150) NULL`,
      `ALTER TABLE "Users" ALTER COLUMN "reportingTo" TYPE VARCHAR(150)`,
      `ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "ownerId" VARCHAR(50) NULL`,
      `ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "ownerName" VARCHAR(150) NULL`,
      `ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "journeyStage" VARCHAR(50) DEFAULT 'Awareness'`,
      `ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "previousJourneyStage" VARCHAR(50) NULL`,
      `ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "journeyUpdatedAt" TIMESTAMP NULL`,
      `ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "journeyReason" TEXT NULL`,
      `ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "journeyTrigger" VARCHAR(50) NULL`,
      `ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "journeyManualOverrideAt" TIMESTAMP NULL`,
      `CREATE TABLE IF NOT EXISTS "JourneyHistory" (
        "id" VARCHAR(100) PRIMARY KEY,
        "accountId" VARCHAR(50) NOT NULL,
        "fromStage" VARCHAR(50),
        "toStage" VARCHAR(50) NOT NULL,
        "reason" TEXT,
        "triggerType" VARCHAR(50),
        "changedBy" VARCHAR(100),
        "changedByName" VARCHAR(150),
        "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "ownerId" VARCHAR(50) NULL`,
      `ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "ownerName" VARCHAR(150) NULL`,
      `ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "birthday" VARCHAR(50) NULL`,
      `ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "projectType" VARCHAR(100) NULL`,
      `ALTER TABLE "Interactions" ADD COLUMN IF NOT EXISTS "attachments" TEXT NULL`,
      `ALTER TABLE "Interactions" ADD COLUMN IF NOT EXISTS "internetMessageId" VARCHAR(250) NULL`,
      `ALTER TABLE "Interactions" ADD COLUMN IF NOT EXISTS "isManual" BOOLEAN NULL`,
      `ALTER TABLE "Tasks" ADD COLUMN IF NOT EXISTS "accountId" VARCHAR(50) NULL`,
      `ALTER TABLE "Tasks" ADD COLUMN IF NOT EXISTS "contactId" VARCHAR(50) NULL`,
      `ALTER TABLE "Notifications" ADD COLUMN IF NOT EXISTS "taskId" VARCHAR(100) NULL`,
      `ALTER TABLE "Notifications" ADD COLUMN IF NOT EXISTS "toUserId" VARCHAR(100) NULL`,
      `ALTER TABLE "Notifications" ADD COLUMN IF NOT EXISTS "fromAdminUid" VARCHAR(100) NULL`,
      `ALTER TABLE "Notifications" ADD COLUMN IF NOT EXISTS "fromAdminName" VARCHAR(150) NULL`,
      `ALTER TABLE "Notifications" ADD COLUMN IF NOT EXISTS "link" TEXT NULL`,
      `ALTER TABLE "Notifications" ADD COLUMN IF NOT EXISTS "path" TEXT NULL`,
      `CREATE TABLE IF NOT EXISTS "EmailQueue" (
        "queueId" VARCHAR(50) PRIMARY KEY,
        "recipientEmail" VARCHAR(150) NOT NULL,
        "subject" VARCHAR(250) NOT NULL,
        "htmlBody" TEXT NOT NULL,
        "status" VARCHAR(50) DEFAULT 'queued',
        "eventType" VARCHAR(100),
        "retryCount" INT DEFAULT 0,
        "maxRetries" INT DEFAULT 3,
        "scheduledAt" VARCHAR(50),
        "processedAt" VARCHAR(50),
        "smtpResponse" TEXT,
        "error" TEXT,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "EmailTemplates" (
        "templateId" VARCHAR(50) PRIMARY KEY,
        "name" VARCHAR(150) NOT NULL,
        "subject" VARCHAR(250) NOT NULL,
        "body" TEXT NOT NULL,
        "category" VARCHAR(100),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "EmailLogs" (
        "logId" VARCHAR(50) PRIMARY KEY,
        "recipientEmail" VARCHAR(150) NOT NULL,
        "subject" VARCHAR(250) NOT NULL,
        "eventType" VARCHAR(100),
        "status" VARCHAR(50) NOT NULL,
        "isMock" BOOLEAN DEFAULT FALSE,
        "sentAt" VARCHAR(50),
        "error" TEXT,
        "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "SyncHistory" (
        "syncId" VARCHAR(50) PRIMARY KEY,
        "provider" VARCHAR(100),
        "mailbox" VARCHAR(150),
        "triggeredByUid" VARCHAR(50),
        "triggeredByName" VARCHAR(150),
        "results" TEXT,
        "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `ALTER TABLE "HealthScores" ADD COLUMN IF NOT EXISTS "factors" JSONB NULL`,
      `CREATE TABLE IF NOT EXISTS "AccountSignals" (
        "accountId" VARCHAR(50) PRIMARY KEY REFERENCES "Accounts"("accountId") ON DELETE CASCADE,
        "customerInitiatedCount" INT DEFAULT 0,
        "employeeInitiatedCount" INT DEFAULT 0,
        "avgResponseTimeMs" BIGINT DEFAULT 0,
        "unansweredFollowUps" INT DEFAULT 0,
        "commitmentsCompletedOnTime" INT DEFAULT 0,
        "commitmentsOverdue" INT DEFAULT 0,
        "expansionSignalsCount" INT DEFAULT 0,
        "referralSignalsCount" INT DEFAULT 0,
        "lastCalculated" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS "CelebrationEvents" (
        "id" VARCHAR(255) PRIMARY KEY,
        "accountId" VARCHAR(255) NOT NULL,
        "contactId" VARCHAR(255) NOT NULL,
        "eventType" VARCHAR(100) NOT NULL,
        "eventTitle" TEXT,
        "eventDescription" TEXT,
        "eventDate" VARCHAR(100),
        "sourceType" VARCHAR(100),
        "sourceName" VARCHAR(255),
        "sourceUrl" TEXT,
        "sourceReference" TEXT,
        "sourceDate" VARCHAR(100),
        "sourceEventId" VARCHAR(255),
        "lastSyncStatus" VARCHAR(50),
        "syncError" TEXT,
        "lastSyncedAt" TIMESTAMP,
        "confidence" VARCHAR(50),
        "verificationStatus" VARCHAR(50),
        "status" VARCHAR(50),
        "detectedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "lastCheckedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "reminderDate" TIMESTAMP,
        "draftedAt" TIMESTAMP,
        "approvedAt" TIMESTAMP,
        "scheduledAt" TIMESTAMP,
        "sentAt" TIMESTAMP,
        "dismissedAt" TIMESTAMP,
        "createdBy" VARCHAR(255),
        "updatedBy" VARCHAR(255),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_celeb_account ON "CelebrationEvents"("accountId")`,
      `CREATE INDEX IF NOT EXISTS idx_celeb_contact ON "CelebrationEvents"("contactId")`,
      `CREATE INDEX IF NOT EXISTS idx_celeb_date ON "CelebrationEvents"("eventDate")`,
      `ALTER TABLE "CelebrationEvents" ADD COLUMN IF NOT EXISTS "sourceEventId" VARCHAR(255) NULL`,
      `ALTER TABLE "CelebrationEvents" ADD COLUMN IF NOT EXISTS "lastSyncStatus" VARCHAR(50) NULL`,
      `ALTER TABLE "CelebrationEvents" ADD COLUMN IF NOT EXISTS "syncError" TEXT NULL`,
      `ALTER TABLE "CelebrationEvents" ADD COLUMN IF NOT EXISTS "lastSyncedAt" TIMESTAMP NULL`,
      `ALTER TABLE "CelebrationEvents" ALTER COLUMN "contactId" DROP NOT NULL`,
      `ALTER TABLE "CelebrationEvents" ADD COLUMN IF NOT EXISTS "evidenceSummary" TEXT NULL`,
      `ALTER TABLE "CelebrationEvents" ADD COLUMN IF NOT EXISTS "matchedEntity" VARCHAR(255) NULL`,
      `ALTER TABLE "CelebrationEvents" ADD COLUMN IF NOT EXISTS "verifiedByUid" VARCHAR(100) NULL`,
      `ALTER TABLE "CelebrationEvents" ADD COLUMN IF NOT EXISTS "verifiedByName" VARCHAR(150) NULL`,
      `ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "website" VARCHAR(255) NULL`,
      `ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "aliases" TEXT NULL`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_celeb_source_event ON "CelebrationEvents"("sourceType", "sourceEventId") WHERE "sourceEventId" IS NOT NULL`,
      `CREATE TABLE IF NOT EXISTS "TeamsMeetings" (
        "meetingId" VARCHAR(150) PRIMARY KEY,
        "organizerEmail" VARCHAR(150) NOT NULL,
        "subject" VARCHAR(300),
        "startDateTime" TIMESTAMP WITH TIME ZONE,
        "endDateTime" TIMESTAMP WITH TIME ZONE,
        "joinWebUrl" TEXT,
        "transcriptId" VARCHAR(150),
        "rawTranscript" TEXT,
        "parsedDialogue" JSONB,
        "speakers" JSONB,
        "attendees" JSONB,
        "accountId" VARCHAR(50) REFERENCES "Accounts"("accountId") ON DELETE SET NULL,
        "contactId" VARCHAR(50) REFERENCES "Contacts"("contactId") ON DELETE SET NULL,
        "interactionId" VARCHAR(50) REFERENCES "Interactions"("interactionId") ON DELETE SET NULL,
        "syncStatus" VARCHAR(50) DEFAULT 'SYNCED',
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_teamsmeetings_account ON "TeamsMeetings"("accountId")`,
      `CREATE INDEX IF NOT EXISTS idx_teamsmeetings_organizer ON "TeamsMeetings"("organizerEmail")`
    ];
    for (const migration of migrations) {
      try {
        await connection.query(migration);
      } catch (migErr) {
        console.warn('Migration warning (non-fatal):', migErr.message || migErr);
      }
    }
    
    // Auto seed if users table is empty
    const usersCheck = await connection.query('SELECT COUNT(*) as count FROM "Users"');
    const userCount = parseInt(usersCheck.rows[0].count, 10);
    if (userCount === 0) {
      console.log('\uD83C\uDF31 Seeding database tables with initial CRM data...');
      await seedPostgresData(connection);
      console.log('\u2705 Database seeding complete.');
    } else {
      console.log(`\uD83D\uDCC2 Database ready — ${userCount} existing user(s) found, skipping seed.`);
    }




  } catch (err) {
    // AggregateError (pg pool errors) may have empty .message but store errors in .errors[]
    const detail = err.message || (err.errors && err.errors.map(e => e.message).join('; ')) || String(err);
    console.error('\u274C Failed to initialize PostgreSQL database:', detail);
    if (err.errors) {
      err.errors.forEach((e, i) => console.error(`  Sub-error [${i}]:`, e.message || e));
    }
    throw err;
  }
}

/**
 * Seeds initial CRM dataset.
 */
async function seedPostgresData(connection) {
  // Only insert the baseline system admin if empty
  const users = [
    { uid: 'mock-admin-uid', email: 'admin@pulse.com', role: 'Admin', position: 'System Administrator', userType: 'Admin', name: 'Admin User', password: 'Admin123' }
  ];
  
  for (const u of users) {
    await connection.query(`
      INSERT INTO "Users" (uid, email, name, role, position, "userType", department, password, projects, employees)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      u.uid,
      u.email,
      u.name,
      u.role,
      u.position || null,
      u.userType || null,
      u.department || null,
      u.password || null,
      u.projects || '[]',
      u.employees || '[]'
    ]);
  }
}

export { db, initializeDatabase };
