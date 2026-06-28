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
  activitylogs: 'ActivityLogs'
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
  activitylogs: 'logId'
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
  const values = colsToBind.map(col => formattedData[col]);
  
  if (checkResult.rows.length > 0) {
    // Perform UPDATE
    const setClause = colsToBind.map((col, idx) => `"${col}" = $${idx + 1}`).join(', ');
    if (setClause) {
      values.push(keyVal);
      await connection.query(`UPDATE "${tableName}" SET ${setClause} WHERE "${keyColumn}" = $${values.length}`, values);
    }
  } else {
    // Perform INSERT
    if (!colsToBind.includes(keyColumn)) {
      colsToBind.push(keyColumn);
      values.push(keyVal);
    }
    
    const colList = colsToBind.map(col => `"${col}"`).join(', ');
    const placeholderList = colsToBind.map((_, idx) => `$${idx + 1}`).join(', ');
    await connection.query(`INSERT INTO "${tableName}" (${colList}) VALUES (${placeholderList})`, values);
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
  const prefix = {
    users: 'user-',
    accounts: 'acc-',
    contacts: 'con-',
    interactions: 'int-',
    replies: 'reply-',
    risks: 'risk-',
    notifications: 'notif-',
    summaries: 'sum-',
    activitylogs: 'act-'
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
  }
  
  doc(replyId) {
    const self = this;
    const id = replyId || generateId('replies');
    return {
      id,
      get: async () => {
        const row = await getRow('Replies', 'replyId', id);
        return {
          exists: !!row,
          id,
          data: () => row
        };
      },
      set: async (val) => {
        const data = { ...val, interactionId: self.parentId, replyId: id };
        await upsertRow('Replies', 'replyId', id, data);
        return { id };
      },
      update: async (val) => {
        await updateRow('Replies', 'replyId', id, val);
        return { id };
      },
      delete: async () => {
        const connection = await getPool();
        await connection.query('DELETE FROM "Replies" WHERE "replyId" = $1', [id]);
        return { id };
      }
    };
  }
  
  async get() {
    const connection = await getPool();
    const res = await connection.query('SELECT * FROM "Replies" WHERE "interactionId" = $1', [this.parentId]);
    const docs = res.rows.map(row => {
      const dataObj = parseRow('Replies', row);
      return {
        id: dataObj.replyId,
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
 * Retrieves the initialized PostgreSQL pool, connecting if needed.
 */
async function getPool() {
  if (!isConnected) {
    pool = new pg.Pool(config);
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
      `ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "ownerId" VARCHAR(50) NULL`,
      `ALTER TABLE "Accounts" ADD COLUMN IF NOT EXISTS "ownerName" VARCHAR(150) NULL`,
      `ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "ownerId" VARCHAR(50) NULL`,
      `ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "ownerName" VARCHAR(150) NULL`,
      `ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "birthday" VARCHAR(50) NULL`,
      `ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS "projectType" VARCHAR(100) NULL`,
      `ALTER TABLE "Interactions" ADD COLUMN IF NOT EXISTS "attachments" TEXT NULL`
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
  // 1. Users
  const users = [
    { uid: 'mock-admin-uid', email: 'admin@pulse.com', role: 'Admin', position: 'System Administrator', userType: 'Admin', name: 'Admin User', password: 'admin123' },
    { uid: 'mock-nazneen-ceo-uid', email: 'nj@gmail.com', role: 'Executive', position: 'CEO', userType: 'CEO', name: 'Nazneen Jahangir', department: 'Executive Office', password: 'nj123' },
    { uid: 'mock-exec-uid', email: 'executive@pulse.com', role: 'Executive', position: 'Chief Executive Officer', userType: 'CEO', name: 'Executive User', password: 'exec123' },
    {
      uid: 'mock-finance-head-uid',
      email: 'financehead@gmail.com',
      role: 'Executive',
      position: 'Finance Head',
      userType: 'Functional Head',
      name: 'Finance Head',
      department: 'Finance',
      projects: JSON.stringify([
        { name: 'Apex Financial Services', projectManagers: [], employees: ['John Smith', 'Alice Cooper'] },
        { name: 'Quarterly Financial Planning', projectManagers: [], employees: ['John Smith'] },
        { name: 'Billing Integration', projectManagers: [], employees: ['Alice Cooper'] }
      ]),
      employees: JSON.stringify(['John Smith', 'Alice Cooper']),
      password: 'financehead123'
    },
    {
      uid: 'mock-global-hr-head-uid',
      email: 'globalhrhead@gmail.com',
      role: 'Executive',
      position: 'Global HR Head',
      userType: 'Functional Head',
      name: 'Global HR Head',
      department: 'HR',
      projects: JSON.stringify([
        { name: 'Acme Corporation', projectManagers: [], employees: ['Jane Doe'] },
        { name: 'Annual Appraisal System', projectManagers: [], employees: ['Bob Marley'] }
      ]),
      employees: JSON.stringify(['Jane Doe', 'Bob Marley']),
      password: 'globalhrhead123'
    },
    {
      uid: 'mock-itg-head-uid',
      email: 'itghead@gmail.com',
      role: 'Executive',
      position: 'ITG Head',
      userType: 'Functional Head',
      name: 'ITG Head',
      department: 'ITG',
      projects: JSON.stringify([
        { name: 'Global Logistics Inc', projectManagers: [], employees: ['Linus Torvalds'] },
        { name: 'Cybersecurity Audit', projectManagers: [], employees: ['Steve Wozniak'] }
      ]),
      employees: JSON.stringify(['Linus Torvalds', 'Steve Wozniak']),
      password: 'itghead123'
    },
    {
      uid: 'mock-nda-head-uid',
      email: 'ndahead@gmail.com',
      role: 'Executive',
      position: 'NDA Head',
      userType: 'Functional Head',
      name: 'NDA Head',
      department: 'Legal',
      projects: JSON.stringify([
        { name: 'Acme Corporation', projectManagers: [], employees: ['Harvey Specter'] },
        { name: 'Compliance Training', projectManagers: [], employees: ['Mike Ross'] }
      ]),
      employees: JSON.stringify(['Harvey Specter', 'Mike Ross']),
      password: 'ndahead123'
    },
    {
      uid: 'mock-tc-head-uid',
      email: 'tchead@gmail.com',
      role: 'Executive',
      position: 'TC Head',
      userType: 'Functional Head',
      name: 'TC Head',
      department: 'TC',
      projects: JSON.stringify([
        { name: 'Global Logistics Inc', projectManagers: [], employees: ['Alan Turing'] },
        { name: 'AI/ML Platform R&D', projectManagers: [], employees: ['Grace Hopper'] }
      ]),
      employees: JSON.stringify(['Alan Turing', 'Grace Hopper']),
      password: 'tchead123'
    },
    {
      uid: 'mock-quality-head-uid',
      email: 'qualityhead@gmail.com',
      role: 'Executive',
      position: 'Quality Head',
      userType: 'Functional Head',
      name: 'Quality Head',
      department: 'Quality',
      projects: JSON.stringify([
        { name: 'Apex Financial Services', projectManagers: [], employees: ['Dennis Ritchie'] },
        { name: 'Performance Regression Suite', projectManagers: [], employees: ['Ken Thompson'] }
      ]),
      employees: JSON.stringify(['Dennis Ritchie', 'Ken Thompson']),
      password: 'qualityhead123'
    },
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
    { accountId: 'acc-1', companyName: 'Acme Corporation', industry: 'Technology', region: 'North America', healthScore: 88, status: 'Healthy', email: 'info@acme.com', phone: '+1 555-0199', ceoName: 'Sarah Jenkins', domain: 'acme.com', ownerId: 'mock-admin-uid', ownerName: 'Admin User', createdAt: new Date().toISOString() },
    { accountId: 'acc-2', companyName: 'Global Logistics Inc', industry: 'Logistics', region: 'Europe', healthScore: 42, status: 'Critical', email: 'support@globallogistics.com', phone: '+44 20 7946 0958', ceoName: 'Robert Miller', domain: 'globallogistics.com', ownerId: 'mock-manager-uid', ownerName: 'Manager User', createdAt: new Date().toISOString() },
    { accountId: 'acc-3', companyName: 'Apex Financial Services', industry: 'Finance', region: 'Asia Pacific', healthScore: 68, status: 'Warning', email: 'contact@apex.com', phone: '+65 6789 0123', ceoName: 'Alan Turing', domain: 'apex.com', ownerId: 'mock-employee-uid', ownerName: 'Employee User', createdAt: new Date().toISOString() },
    { accountId: 'acc-abc', companyName: 'ABC Bank', industry: 'Finance', region: 'North America', healthScore: 78, status: 'Healthy', email: 'corporate@abcbank.com', phone: '+1 555-9876', ceoName: 'John Pierpont', domain: 'abcbank.com', ownerId: 'mock-admin-uid', ownerName: 'Admin User', createdAt: abcCreated }
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
