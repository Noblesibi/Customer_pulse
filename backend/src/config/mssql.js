import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'YourStrongPasswordHere',
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_DATABASE || 'CustomerPulse',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false'
  }
};

if (process.env.DB_INSTANCE) {
  config.options.instanceName = process.env.DB_INSTANCE;
}

let pool;
let isConnected = false;

// Table mapping to map collection names to SQL Server table names
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
 * Rehydrates JSON strings to Javascript objects/arrays, maps bit fields to booleans.
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
  const checkReq = connection.request();
  checkReq.input('keyVal', sql.NVarChar, keyVal);
  const checkResult = await checkReq.query(`SELECT 1 FROM ${tableName} WHERE ${keyColumn} = @keyVal`);
  
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
      formattedData[col] = val ? 1 : 0;
    } else {
      formattedData[col] = val;
    }
  }
  
  const writeReq = connection.request();
  writeReq.input('keyVal', sql.NVarChar, keyVal);
  
  const colsToBind = Object.keys(formattedData);
  colsToBind.forEach(col => {
    writeReq.input(col, formattedData[col]);
  });
  
  if (checkResult.recordset.length > 0) {
    // Perform UPDATE
    const setClause = colsToBind.map(col => `${col} = @${col}`).join(', ');
    if (setClause) {
      await writeReq.query(`UPDATE ${tableName} SET ${setClause} WHERE ${keyColumn} = @keyVal`);
    }
  } else {
    // Perform INSERT
    if (!colsToBind.includes(keyColumn)) {
      colsToBind.push(keyColumn);
      writeReq.input(keyColumn, keyVal);
    }
    
    const colList = colsToBind.join(', ');
    const paramList = colsToBind.map(col => `@${col}`).join(', ');
    await writeReq.query(`INSERT INTO ${tableName} (${colList}) VALUES (${paramList})`);
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
      formattedData[col] = val ? 1 : 0;
    } else {
      formattedData[col] = val;
    }
  }
  
  const writeReq = connection.request();
  writeReq.input('keyVal', sql.NVarChar, keyVal);
  
  const colsToBind = Object.keys(formattedData);
  colsToBind.forEach(col => {
    writeReq.input(col, formattedData[col]);
  });
  
  const setClause = colsToBind.map(col => `${col} = @${col}`).join(', ');
  if (setClause) {
    await writeReq.query(`UPDATE ${tableName} SET ${setClause} WHERE ${keyColumn} = @keyVal`);
  }
}

/**
 * Gets a single row by its primary key.
 */
async function getRow(tableName, keyColumn, keyVal) {
  const connection = await getPool();
  const req = connection.request();
  req.input('keyVal', sql.NVarChar, keyVal);
  const res = await req.query(`SELECT * FROM ${tableName} WHERE ${keyColumn} = @keyVal`);
  if (res.recordset.length === 0) return null;
  return parseRow(tableName, res.recordset[0]);
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
class MSSQLQuery {
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
    const req = connection.request();
    
    let selectClause = 'SELECT';
    if (this.limitNum) {
      selectClause += ` TOP ${parseInt(this.limitNum)}`;
    }
    
    let queryStr = `${selectClause} * FROM ${this.tableName}`;
    const whereClauses = [];
    
    this.filters.forEach((filter, index) => {
      const paramName = `val_${index}`;
      let sqlOp = '=';
      if (filter.op === '==') sqlOp = '=';
      
      whereClauses.push(`${filter.field} ${sqlOp} @${paramName}`);
      req.input(paramName, filter.val);
    });
    
    if (whereClauses.length > 0) {
      queryStr += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    if (this.orderByField) {
      queryStr += ` ORDER BY ${this.orderByField} ${this.orderByDir}`;
    }
    
    const res = await req.query(queryStr);
    const tableName = this.tableName;
    const keyCol = keyFields[this.collectionName.toLowerCase()] || 'id';
    
    const docs = res.recordset.map(row => {
      const dataObj = parseRow(tableName, row);
      const docId = dataObj[keyCol];
      
      return {
        id: docId,
        exists: true,
        data: () => dataObj,
        ref: {
          delete: async () => {
            const delReq = connection.request();
            delReq.input('id', docId);
            await delReq.query(`DELETE FROM ${tableName} WHERE ${keyCol} = @id`);
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
class MSSQLSubCollection {
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
        const delReq = connection.request();
        delReq.input('replyId', id);
        await delReq.query(`DELETE FROM Replies WHERE replyId = @replyId`);
        return { id };
      }
    };
  }
  
  async get() {
    const connection = await getPool();
    const req = connection.request();
    req.input('parentId', this.parentId);
    const res = await req.query(`SELECT * FROM Replies WHERE interactionId = @parentId`);
    const docs = res.recordset.map(row => {
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
class MSSQLCollection {
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
        // Map Virtual id or ensure keyCol is inside val
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
        const delReq = connection.request();
        delReq.input('id', docId);
        await delReq.query(`DELETE FROM ${self.tableName} WHERE ${keyCol} = @id`);
        return { id: docId };
      },
      // Support subcollections (e.g. replies)
      collection(subColName) {
        return new MSSQLSubCollection(self.tableName, docId, subColName);
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
  
  // Delegate query capability directly to the helper
  where(field, op, val) {
    return new MSSQLQuery(this.collectionName).where(field, op, val);
  }
  
  orderBy(field, dir) {
    return new MSSQLQuery(this.collectionName).orderBy(field, dir);
  }
  
  limit(num) {
    return new MSSQLQuery(this.collectionName).limit(num);
  }
  
  async get() {
    return new MSSQLQuery(this.collectionName).get();
  }
}

/**
 * Replicates Firestore DB interface.
 */
class FirestoreSQLAdapter {
  collection(name) {
    return new MSSQLCollection(name);
  }
}

const db = new FirestoreSQLAdapter();

/**
 * Retrieves the initialized SQL Server pool, connecting if needed.
 */
async function getPool() {
  if (!isConnected) {
    pool = await sql.connect(config);
    isConnected = true;
  }
  return pool;
}

/**
 * Initializes schema and runs auto-seeding.
 */
async function initializeDatabase() {
  try {
    const connection = await getPool();
    console.log('🔌 Connected to Microsoft SQL Server successfully.');
    
    console.log('⚙️ Verifying database tables...');
    const schemaPath = path.resolve(__dirname, '../../schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      
      // Split statements on semicolon and run them one by one
      const statements = schemaSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
        
      for (const statement of statements) {
        try {
          await connection.query(statement);
        } catch (err) {
          console.error('Warning running schema statement:', err.message);
        }
      }
      console.log('✅ Schema check/creation complete.');
    }
    
    // Auto seed if users table is empty
    const usersCheck = await connection.query('SELECT COUNT(*) as count FROM Users');
    if (usersCheck.recordset[0].count === 0) {
      console.log('🌱 Seeding database tables with initial CRM data...');
      await seedMssqlData(connection);
      console.log('✅ Database seeding complete.');
    }
  } catch (err) {
    console.error('❌ Failed to initialize database:', err.message);
    throw err;
  }
}

/**
 * Seeds initial CRM dataset.
 */
async function seedMssqlData(connection) {
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
    const req = connection.request();
    req.input('uid', u.uid);
    req.input('email', u.email);
    req.input('name', u.name);
    req.input('role', u.role);
    req.input('position', u.position || null);
    req.input('userType', u.userType || null);
    req.input('department', u.department || null);
    req.input('password', u.password || null);
    req.input('projects', u.projects || '[]');
    req.input('employees', u.employees || '[]');
    
    await req.query(`
      INSERT INTO Users (uid, email, name, role, position, userType, department, password, projects, employees)
      VALUES (@uid, @email, @name, @role, @position, @userType, @department, @password, @projects, @employees)
    `);
  }
  
  // 2. Accounts
  const accounts = [
    { accountId: 'acc-1', companyName: 'Acme Corporation', industry: 'Technology', region: 'North America', healthScore: 88, status: 'Healthy', email: 'info@acme.com', phone: '+1 555-0199', ceoName: 'Sarah Jenkins', domain: 'acme.com' },
    { accountId: 'acc-2', companyName: 'Global Logistics Inc', industry: 'Logistics', region: 'Europe', healthScore: 42, status: 'Critical', email: 'support@globallogistics.com', phone: '+44 20 7946 0958', ceoName: 'Robert Miller', domain: 'globallogistics.com' },
    { accountId: 'acc-3', companyName: 'Apex Financial Services', industry: 'Finance', region: 'Asia Pacific', healthScore: 68, status: 'Warning', email: 'contact@apex.com', phone: '+65 6789 0123', ceoName: 'Alan Turing', domain: 'apex.com' }
  ];
  for (const a of accounts) {
    const req = connection.request();
    req.input('accountId', a.accountId);
    req.input('companyName', a.companyName);
    req.input('industry', a.industry);
    req.input('region', a.region);
    req.input('healthScore', a.healthScore);
    req.input('status', a.status);
    req.input('email', a.email);
    req.input('phone', a.phone);
    req.input('ceoName', a.ceoName);
    req.input('domain', a.domain);
    await req.query(`
      INSERT INTO Accounts (accountId, companyName, industry, region, healthScore, status, email, phone, ceoName, domain)
      VALUES (@accountId, @companyName, @industry, @region, @healthScore, @status, @email, @phone, @ceoName, @domain)
    `);
  }
  
  // 3. Contacts
  const contacts = [
    { contactId: 'con-1', accountId: 'acc-1', name: 'Sarah Jenkins', email: 's.jenkins@acme.com', designation: 'VP of Engineering', hierarchyTag: 'VP', influenceTag: 'Decision Maker', phone: '+1 555-0199', department: 'Engineering', projectName: 'Acme Portal', projectIndustry: 'Technology' },
    { contactId: 'con-2', accountId: 'acc-2', name: 'Robert Miller', email: 'r.miller@globallogistics.com', designation: 'IT Director', hierarchyTag: 'Director', influenceTag: 'Champion', phone: '+44 20 7946 0958', department: 'IT', projectName: 'Logistics Pipeline', projectIndustry: 'Logistics' }
  ];
  for (const c of contacts) {
    const req = connection.request();
    req.input('contactId', c.contactId);
    req.input('accountId', c.accountId);
    req.input('name', c.name);
    req.input('email', c.email);
    req.input('phone', c.phone);
    req.input('designation', c.designation);
    req.input('department', c.department);
    req.input('projectName', c.projectName);
    req.input('projectIndustry', c.projectIndustry);
    req.input('hierarchyTag', c.hierarchyTag);
    req.input('influenceTag', c.influenceTag);
    await req.query(`
      INSERT INTO Contacts (contactId, accountId, name, email, phone, designation, department, projectName, projectIndustry, hierarchyTag, influenceTag)
      VALUES (@contactId, @accountId, @name, @email, @phone, @designation, @department, @projectName, @projectIndustry, @hierarchyTag, @influenceTag)
    `);
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
      riskDetected: 0,
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
      riskDetected: 1,
      riskCategory: 'Competitor Mentions',
      actionMentions: '[]',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24)
    }
  ];
  for (const i of interactions) {
    const req = connection.request();
    req.input('interactionId', i.interactionId);
    req.input('accountId', i.accountId);
    req.input('contactId', i.contactId);
    req.input('source', i.source);
    req.input('subject', i.subject);
    req.input('messageText', i.messageText);
    req.input('date', i.date);
    req.input('time', i.time);
    req.input('loggedByUid', i.loggedByUid);
    req.input('loggedByName', i.loggedByName);
    req.input('sentiment', i.sentiment);
    req.input('riskDetected', i.riskDetected);
    req.input('riskCategory', i.riskCategory);
    req.input('actionMentions', i.actionMentions);
    req.input('timestamp', i.timestamp);
    await req.query(`
      INSERT INTO Interactions (interactionId, accountId, contactId, source, subject, messageText, date, time, loggedByUid, loggedByName, sentiment, riskDetected, riskCategory, actionMentions, timestamp)
      VALUES (@interactionId, @accountId, @contactId, @source, @subject, @messageText, @date, @time, @loggedByUid, @loggedByName, @sentiment, @riskDetected, @riskCategory, @actionMentions, @timestamp)
    `);
  }
  
  // 5. Risks
  const risks = [
    { riskId: 'risk-1', accountId: 'acc-2', category: 'Competitor Mentions', severity: 'High', description: 'Client is actively reviewing competitor packages due to repeated downtime issues.', status: 'Open' }
  ];
  for (const r of risks) {
    const req = connection.request();
    req.input('riskId', r.riskId);
    req.input('accountId', r.accountId);
    req.input('category', r.category);
    req.input('severity', r.severity);
    req.input('description', r.description);
    req.input('status', r.status);
    await req.query(`
      INSERT INTO Risks (riskId, accountId, category, severity, description, status)
      VALUES (@riskId, @accountId, @category, @severity, @description, @status)
    `);
  }

  // 6. Seed default Notifications
  const notifications = [
    {
      notificationId: 'notif-1',
      accountId: 'acc-2',
      type: 'New Risk',
      message: 'New risk alert detected: [Competitor Mentions] - Client is actively reviewing competitor packages due to repeated downtime issues.',
      severity: 'High',
      read: 0,
      timestamp: new Date()
    }
  ];
  for (const n of notifications) {
    const req = connection.request();
    req.input('notificationId', n.notificationId);
    req.input('accountId', n.accountId);
    req.input('type', n.type);
    req.input('message', n.message);
    req.input('severity', n.severity);
    req.input('read', n.read);
    req.input('timestamp', n.timestamp);
    await req.query(`
      INSERT INTO Notifications (notificationId, accountId, type, message, severity, [read], timestamp)
      VALUES (@notificationId, @accountId, @type, @message, @severity, @read, @timestamp)
    `);
  }
}

export { db, initializeDatabase };
