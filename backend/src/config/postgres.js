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
  database: process.env.DB_DATABASE || 'customer_pulse'
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
  summaries: 'Summaries',
  activitylogs: 'ActivityLogs',
  tasks: 'Tasks',
  taskreplies: 'TaskReplies',
  emailqueue: 'EmailQueue',
  emailtemplates: 'EmailTemplates',
  emaillogs: 'EmailLogs',
  notificationpreferences: 'NotificationPreferences'
};

// Map collection names to primary key fields
const keyFields = {
  users: 'uid',
  accounts: 'accountId',
  contacts: 'contactId',
  interactions: 'interactionId',
  replies: 'replyId',
  risks: 'riskId',
  notifications: 'notificationId',
  healthscores: 'id',
  summaries: 'summaryId',
  activitylogs: 'logId',
  tasks: 'taskId',
  taskreplies: 'replyId',
  emailqueue: 'queueId',
  emailtemplates: 'templateId',
  emaillogs: 'logId',
  notificationpreferences: 'uid'
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
    
    const res = await connection.query(queryStr, params);
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
    pool.on('connect', (client) => {
      client.query("SET TIMEZONE = 'UTC'").catch(() => {});
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
      `ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "ownerId" VARCHAR(50) NULL`,
      `ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "ownerName" VARCHAR(150) NULL`,
      `ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "birthday" VARCHAR(50) NULL`,
      `ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "projectType" VARCHAR(100) NULL`,
      `ALTER TABLE "Interactions" ADD COLUMN IF NOT EXISTS "attachments" TEXT NULL`,
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
      )`
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

    // Check if the dummy task already exists
    const dummyCheck = await connection.query('SELECT COUNT(*) as count FROM "Interactions" WHERE "interactionId" = $1', ['int-dummy-all-users']);
    const dummyExists = parseInt(dummyCheck.rows[0].count, 10) > 0;
    
    if (!dummyExists) {
      console.log('🌱 Seeding dummy task for all 14 users in PostgreSQL...');
      
      const getKolkataDateString = (d = new Date()) => {
        const dateObj = d instanceof Date ? d : new Date(d);
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };
      
      const getKolkataTimeString = (d = new Date()) => {
        const dateObj = d instanceof Date ? d : new Date(d);
        const hh = String(dateObj.getHours()).padStart(2, '0');
        const min = String(dateObj.getMinutes()).padStart(2, '0');
        return `${hh}:${min}`;
      };

      const taskDueDate = new Date();
      taskDueDate.setDate(taskDueDate.getDate() + 7);
      const taskDueDateStr = getKolkataDateString(taskDueDate);

      const dummyAllUsersMentions = [
        { uid: 'mock-admin-uid', name: 'Admin User', task: 'Review all accounts and verify global access permissions', taskHeader: 'Review Admin Access', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null },
        { uid: 'mock-nazneen-ceo-uid', name: 'Nazneen Jahangir', task: 'Review high-level executive dashboard and quarterly risk report', taskHeader: 'Review Exec Dashboard', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null },
        { uid: 'mock-exec-uid', name: 'Executive User', task: 'Approve project budget and review overall alignment', taskHeader: 'Approve Budget', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null },
        { uid: 'mock-finance-head-uid', name: 'Finance Head', task: 'Perform finance audit for Apex Financial Services and billing integration', taskHeader: 'Finance Audit', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'Medium', comments: '', completionDate: null },
        { uid: 'mock-global-hr-head-uid', name: 'Global HR Head', task: 'Initiate performance appraisals and review Acme Corporation HR roadmap', taskHeader: 'Appraisal Review', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'Medium', comments: '', completionDate: null },
        { uid: 'mock-itg-head-uid', name: 'ITG Head', task: 'Audit cybersecurity protocol and IT infrastructure on Global Logistics Inc', taskHeader: 'Security Audit', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null },
        { uid: 'mock-nda-head-uid', name: 'NDA Head', task: 'Review NDA agreements and compliance training roadmap', taskHeader: 'NDA Review', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null },
        { uid: 'mock-tc-head-uid', name: 'TC Head', task: 'Evaluate AI/ML platform R&D roadmap and quality gates', taskHeader: 'Evaluate Platform', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'Medium', comments: '', completionDate: null },
        { uid: 'mock-quality-head-uid', name: 'Quality Head', task: 'Oversee performance regression suite results and quality audit', taskHeader: 'Quality Audit', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'Medium', comments: '', completionDate: null },
        { uid: 'mock-manager-uid', name: 'Manager User', task: 'Sync with employee on frontend milestones and verify deliverables', taskHeader: 'Manager Sync', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'Medium', comments: '', completionDate: null },
        { uid: 'mock-employee-uid', name: 'Employee User', task: 'Implement frontend components and run regression tests', taskHeader: 'Implement UI', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'Medium', comments: '', completionDate: null },
        { uid: 'ldap-3cm36onhw', name: 'Albert S Joseph', task: 'Coordinate load testing and API stability check for dashboard widgets', taskHeader: 'Dashboard Load Test', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null },
        { uid: 'ldap-rhkufekom', name: 'Amina Rashad', task: 'Perform regression suite execution and validation of CRM flows', taskHeader: 'Run Regression', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null },
        { uid: 'ldap-2jm2pvhe0', name: 'Noble Sibi', task: 'Evaluate CRM security posture and RBAC policy definitions', taskHeader: 'Verify Security', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null }
      ];

      await connection.query(`
        INSERT INTO "Interactions" ("interactionId", "accountId", "contactId", source, subject, "messageText", date, time, "loggedByUid", "loggedByName", sentiment, "riskDetected", "riskCategory", "actionMentions", timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        'int-dummy-all-users',
        'acc-1',
        'con-1',
        'Meeting',
        'All-Hands Portfolio Review',
        'We held a portfolio review meeting with Acme Corporation. All team members must review their client updates and key deliverables.',
        getKolkataDateString(),
        getKolkataTimeString(),
        'mock-admin-uid',
        'Admin User',
        'Neutral',
        false,
        '',
        JSON.stringify(dummyAllUsersMentions),
        new Date().toISOString()
      ]);
      console.log('✅ Dummy task for all 14 users seeded successfully.');
    } else {
      console.log('🌱 Dummy task "int-dummy-all-users" already exists in PostgreSQL, skipping seed.');
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
  // 1. Users
  const users = [
    { uid: 'mock-admin-uid', email: 'admin@pulse.com', role: 'Admin', position: 'System Administrator', userType: 'Admin', name: 'Admin User', password: 'admin123' },
    { uid: 'mock-exec-uid', email: 'executive@pulse.com', role: 'Executive', position: 'Chief Executive Officer', userType: 'CEO', name: 'Executive User', password: 'exec123' },
    { uid: 'mock-manager-uid', email: 'manager@pulse.com', role: 'Sales Manager', position: 'Logistics Division Lead', userType: 'BU Head', name: 'Manager User', password: 'manager123' },
    { uid: 'mock-employee-uid', email: 'employee@pulse.com', role: 'Employee', position: 'Frontend Engineer', userType: 'Employee', name: 'Employee User', password: 'employee123' }
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
  
  // 2. Accounts
  const abcAnniv = new Date();
  abcAnniv.setFullYear(abcAnniv.getFullYear() - 5);
  abcAnniv.setDate(abcAnniv.getDate() + 3);
  const abcCreated = abcAnniv.toISOString();

  const accounts = [
    { accountId: 'acc-1', companyName: 'Acme Corporation', industry: 'Technology', region: 'USA', healthScore: 88, status: 'Healthy', email: 'info@acme.com', phone: '+1 555-0199', ceoName: 'Sarah Jenkins', domain: 'acme.com', ownerId: 'mock-admin-uid', ownerName: 'Admin User', createdAt: new Date().toISOString() },
    { accountId: 'acc-2', companyName: 'Global Logistics Inc', industry: 'Logistics', region: 'UK', healthScore: 42, status: 'Critical', email: 'support@globallogistics.com', phone: '+44 20 7946 0958', ceoName: 'Robert Miller', domain: 'globallogistics.com', ownerId: 'mock-manager-uid', ownerName: 'Manager User', createdAt: new Date().toISOString() },
    { accountId: 'acc-3', companyName: 'Apex Financial Services', industry: 'Finance', region: 'Singapore', healthScore: 68, status: 'Warning', email: 'contact@apex.com', phone: '+65 6789 0123', ceoName: 'Alan Turing', domain: 'apex.com', ownerId: 'mock-employee-uid', ownerName: 'Employee User', createdAt: new Date().toISOString() },
    { accountId: 'acc-abc', companyName: 'ABC Bank', industry: 'Finance', region: 'USA', healthScore: 78, status: 'Healthy', email: 'corporate@abcbank.com', phone: '+1 555-9876', ceoName: 'John Pierpont', domain: 'abcbank.com', ownerId: 'mock-admin-uid', ownerName: 'Admin User', createdAt: abcCreated }
  ];
  for (const a of accounts) {
    await connection.query(`
      INSERT INTO "Accounts" ("accountId", "companyName", industry, region, "healthScore", status, email, phone, "ceoName", domain, "ownerId", "ownerName", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      a.accountId,
      a.companyName,
      a.industry,
      a.region,
      a.healthScore,
      a.status,
      a.email,
      a.phone,
      a.ceoName,
      a.domain,
      a.ownerId,
      a.ownerName,
      a.createdAt
    ]);
  }
  
  // 3. Contacts
  const bday = new Date();
  bday.setDate(bday.getDate() + 7);
  const bdayStr = bday.toISOString().split('T')[0];

  const contacts = [
    { contactId: 'con-1', accountId: 'acc-1', name: 'Sarah Jenkins', email: 's.jenkins@acme.com', designation: 'VP of Engineering', hierarchyTag: 'VP', influenceTag: 'Decision Maker', phone: '+1 555-0199', department: 'Engineering', projectName: 'Acme Portal', projectIndustry: 'Technology', ownerId: 'mock-admin-uid', ownerName: 'Admin User', birthday: null, createdAt: new Date().toISOString() },
    { contactId: 'con-2', accountId: 'acc-2', name: 'Robert Miller', email: 'r.miller@globallogistics.com', designation: 'IT Director', hierarchyTag: 'Director', influenceTag: 'Champion', phone: '+44 20 7946 0958', department: 'IT', projectName: 'Logistics Pipeline', projectIndustry: 'Logistics', ownerId: 'mock-manager-uid', ownerName: 'Manager User', birthday: null, createdAt: new Date().toISOString() },
    { contactId: 'con-cio', accountId: 'acc-1', name: 'John Doe', email: 'j.doe@acme.com', designation: 'CIO', hierarchyTag: 'CXO', influenceTag: 'Decision Maker', phone: '+1 555-0155', department: 'IT', projectName: 'Acme Portal', projectIndustry: 'Technology', ownerId: 'mock-admin-uid', ownerName: 'Admin User', birthday: bdayStr, createdAt: new Date().toISOString() },
    { contactId: 'con-abc-cio', accountId: 'acc-abc', name: 'David Vance', email: 'd.vance@abcbank.com', designation: 'Chief Information Officer', hierarchyTag: 'CXO', influenceTag: 'Decision Maker', phone: '+1 555-0255', department: 'IT', projectName: 'Banking App Core', projectIndustry: 'Finance', ownerId: 'mock-admin-uid', ownerName: 'Admin User', birthday: null, createdAt: new Date().toISOString() }
  ];
  for (const c of contacts) {
    await connection.query(`
      INSERT INTO "Contacts" ("contactId", "accountId", name, email, phone, designation, department, "projectName", "projectIndustry", "hierarchyTag", "influenceTag", "ownerId", "ownerName", "birthday", "createdAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      c.contactId,
      c.accountId,
      c.name,
      c.email,
      c.phone,
      c.designation,
      c.department,
      c.projectName,
      c.projectIndustry,
      c.hierarchyTag,
      c.influenceTag,
      c.ownerId,
      c.ownerName,
      c.birthday,
      c.createdAt
    ]);
  }
  
  // 4. Interactions
  const interactions = [
    {
      interactionId: 'int-1',
      accountId: 'acc-1',
      contactId: 'con-1',
      source: 'Email',
      subject: 'Platform Stability Feedback',
      messageText: "We are extremely pleased with the platform's stability. Our onboarding went incredibly well.",
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().slice(0, 5),
      loggedByUid: 'mock-admin-uid',
      loggedByName: 'System Admin',
      sentiment: 'Positive',
      riskDetected: false,
      riskCategory: '',
      actionMentions: '[]',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2)
    },
    {
      interactionId: 'int-2',
      accountId: 'acc-2',
      contactId: 'con-2',
      source: 'Meeting',
      subject: 'Cargo Reports Issue',
      messageText: "The system has been experiencing major downtime, which delayed our cargo reports. We are actively reviewing competitor packages.",
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().slice(0, 5),
      loggedByUid: 'mock-admin-uid',
      loggedByName: 'System Admin',
      sentiment: 'Negative',
      riskDetected: true,
      riskCategory: 'Competitor Mentions',
      actionMentions: '[]',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24)
    },
    {
      interactionId: 'int-dummy-all-users',
      accountId: 'acc-1',
      contactId: 'con-1',
      source: 'Meeting',
      subject: 'All-Hands Portfolio Review',
      messageText: 'We held a portfolio review meeting with Acme Corporation. All team members must review their client updates and key deliverables.',
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().slice(0, 5),
      loggedByUid: 'mock-admin-uid',
      loggedByName: 'Admin User',
      sentiment: 'Neutral',
      riskDetected: false,
      riskCategory: '',
      actionMentions: (() => {
        const taskDueDate = new Date();
        taskDueDate.setDate(taskDueDate.getDate() + 7);
        const taskDueDateStr = taskDueDate.toISOString().split('T')[0];
        return JSON.stringify([
          { uid: 'mock-admin-uid', name: 'Admin User', task: 'Review all accounts and verify global access permissions', taskHeader: 'Review Admin Access', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null },
          { uid: 'mock-nazneen-ceo-uid', name: 'Nazneen Jahangir', task: 'Review high-level executive dashboard and quarterly risk report', taskHeader: 'Review Exec Dashboard', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null },
          { uid: 'mock-exec-uid', name: 'Executive User', task: 'Approve project budget and review overall alignment', taskHeader: 'Approve Budget', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null },
          { uid: 'mock-finance-head-uid', name: 'Finance Head', task: 'Perform finance audit for Apex Financial Services and billing integration', taskHeader: 'Finance Audit', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'Medium', comments: '', completionDate: null },
          { uid: 'mock-global-hr-head-uid', name: 'Global HR Head', task: 'Initiate performance appraisals and review Acme Corporation HR roadmap', taskHeader: 'Appraisal Review', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'Medium', comments: '', completionDate: null },
          { uid: 'mock-itg-head-uid', name: 'ITG Head', task: 'Audit cybersecurity protocol and IT infrastructure on Global Logistics Inc', taskHeader: 'Security Audit', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null },
          { uid: 'mock-nda-head-uid', name: 'NDA Head', task: 'Review NDA agreements and compliance training roadmap', taskHeader: 'NDA Review', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null },
          { uid: 'mock-tc-head-uid', name: 'TC Head', task: 'Evaluate AI/ML platform R&D roadmap and quality gates', taskHeader: 'Evaluate Platform', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'Medium', comments: '', completionDate: null },
          { uid: 'mock-quality-head-uid', name: 'Quality Head', task: 'Oversee performance regression suite results and quality audit', taskHeader: 'Quality Audit', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'Medium', comments: '', completionDate: null },
          { uid: 'mock-manager-uid', name: 'Manager User', task: 'Sync with employee on frontend milestones and verify deliverables', taskHeader: 'Manager Sync', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'Medium', comments: '', completionDate: null },
          { uid: 'mock-employee-uid', name: 'Employee User', task: 'Implement frontend components and run regression tests', taskHeader: 'Implement UI', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'Medium', comments: '', completionDate: null },
          { uid: 'ldap-3cm36onhw', name: 'Albert S Joseph', task: 'Coordinate load testing and API stability check for dashboard widgets', taskHeader: 'Dashboard Load Test', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null },
          { uid: 'ldap-rhkufekom', name: 'Amina Rashad', task: 'Perform regression suite execution and validation of CRM flows', taskHeader: 'Run Regression', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null },
          { uid: 'ldap-2jm2pvhe0', name: 'Noble Sibi', task: 'Evaluate CRM security posture and RBAC policy definitions', taskHeader: 'Verify Security', status: 'Task Assigned', dueDate: taskDueDateStr, priority: 'High', comments: '', completionDate: null }
        ]);
      })(),
      timestamp: new Date().toISOString()
    }
  ];
  for (const i of interactions) {
    await connection.query(`
      INSERT INTO "Interactions" ("interactionId", "accountId", "contactId", source, subject, "messageText", date, time, "loggedByUid", "loggedByName", sentiment, "riskDetected", "riskCategory", "actionMentions", timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      i.interactionId,
      i.accountId,
      i.contactId,
      i.source,
      i.subject,
      i.messageText,
      i.date,
      i.time,
      i.loggedByUid,
      i.loggedByName,
      i.sentiment,
      i.riskDetected,
      i.riskCategory,
      i.actionMentions,
      i.timestamp
    ]);
  }
  
  // 5. Risks
  const risks = [
    { riskId: 'risk-1', accountId: 'acc-2', category: 'Competitor Mentions', severity: 'High', description: 'Client is actively reviewing competitor packages due to repeated downtime issues.', status: 'Open' }
  ];
  for (const r of risks) {
    await connection.query(`
      INSERT INTO "Risks" ("riskId", "accountId", category, severity, description, status)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      r.riskId,
      r.accountId,
      r.category,
      r.severity,
      r.description,
      r.status
    ]);
  }
  
  // 6. Seed default Notifications
  const notifications = [
    {
      notificationId: 'notif-1',
      accountId: 'acc-2',
      type: 'New Risk',
      message: 'New risk alert detected: [Competitor Mentions] - Client is actively reviewing competitor packages due to repeated downtime issues.',
      severity: 'High',
      read: false,
      timestamp: new Date()
    }
  ];
  for (const n of notifications) {
    await connection.query(`
      INSERT INTO "Notifications" ("notificationId", "accountId", type, message, severity, read, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      n.notificationId,
      n.accountId,
      n.type,
      n.message,
      n.severity,
      n.read,
      n.timestamp
    ]);
  }
}

export { db, initializeDatabase };
