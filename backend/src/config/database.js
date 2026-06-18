import dotenv from 'dotenv';
import { db as mssqlDb, initializeDatabase as initMssql } from './mssql.js';
import { db as mysqlDb, initializeDatabase as initMysql } from './mysql.js';

dotenv.config();

let auth;
let isMock = false;
const isMssql = process.env.DB_TYPE === 'mssql';
const isMysql = process.env.DB_TYPE === 'mysql';

// Dynamic Database Provider to allow clean hot-swap on connection failure
let activeDbProvider = null;

class FirestoreSQLAdapter {
  collection(name) {
    if (!activeDbProvider) {
      throw new Error('Database layer is not initialized yet!');
    }
    return activeDbProvider.collection(name);
  }
}

const db = new FirestoreSQLAdapter();

// High-fidelity in-memory Mock Database class to replicate Firestore behaviors for dev mode
class MockFirestore {
  constructor() {
    this.data = {
      users: {},
      accounts: {},
      contacts: {},
      interactions: {},
      risks: {},
      notifications: {},
      summaries: {},
      healthScores: {},
      activitylogs: {}
    };
    this.listeners = [];
  }

  collection(name) {
    if (!this.data[name]) {
      this.data[name] = {};
    }
    const self = this;
    return {
      doc(id) {
        const docId = id || Math.random().toString(36).substring(2, 15);
        return {
          id: docId,
          get: async () => ({
            exists: !!self.data[name][docId],
            id: docId,
            data: () => self.data[name][docId] || null
          }),
          set: async (val) => {
            self.data[name][docId] = { ...val, id: docId };
            return { id: docId };
          },
          update: async (val) => {
            self.data[name][docId] = { ...self.data[name][docId], ...val, id: docId };
            return { id: docId };
          },
          delete: async () => {
            delete self.data[name][docId];
            return { id: docId };
          },
          collection(subName) {
            const subCollectionKey = `${name}/${docId}/${subName}`;
            return self.collection(subCollectionKey);
          }
        };
      },
      add: async (val) => {
        const id = Math.random().toString(36).substring(2, 15);
        self.data[name][id] = { ...val, id };
        return { id, get: async () => ({ exists: true, id, data: () => self.data[name][id] }) };
      },
      get: async () => {
        const docs = Object.values(self.data[name]).map(doc => ({
          id: doc.id,
          exists: true,
          data: () => doc
        }));
        return { docs };
      },
      where(field, operator, value) {
        return {
          get: async () => {
            const docs = Object.values(self.data[name])
              .filter(doc => {
                if (operator === '==') return doc[field] === value;
                if (operator === 'array-contains') return Array.isArray(doc[field]) && doc[field].includes(value);
                return true;
              })
              .map(doc => ({
                id: doc.id,
                exists: true,
                data: () => doc
              }));
            return { docs };
          },
          limit(num) {
            return {
              get: async () => {
                const docs = Object.values(self.data[name])
                  .filter(doc => doc[field] === value)
                  .slice(0, num)
                  .map(doc => ({
                    id: doc.id,
                    exists: true,
                    data: () => doc
                  }));
                return { docs };
              }
            };
          }
        };
      },
      orderBy(field, direction = 'asc') {
        return {
          get: async () => {
            const docs = Object.values(self.data[name])
              .sort((a, b) => {
                if (a[field] < b[field]) return direction === 'asc' ? -1 : 1;
                if (a[field] > b[field]) return direction === 'asc' ? 1 : -1;
                return 0;
              })
              .map(doc => ({
                id: doc.id,
                exists: true,
                data: () => doc
              }));
            return { docs };
          }
        };
      }
    };
  }
}

class MockAuth {
  constructor() {
    this.users = {};
  }
  async createUser(properties) {
    const uid = Math.random().toString(36).substring(2, 15);
    this.users[uid] = { uid, ...properties };
    return this.users[uid];
  }
  async verifyIdToken(token) {
    if (token === 'mock-admin-token') {
      return { uid: 'mock-admin-uid', email: 'admin@pulse.com', role: 'Admin' };
    }
    try {
      const parsed = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return parsed;
    } catch (e) {
      throw new Error('Invalid mock token');
    }
  }
}

function seedMockData(mockDb) {
  // Seed in-memory mock database users
  mockDb.data.users['mock-admin-uid'] = { uid: 'mock-admin-uid', email: 'admin@pulse.com', role: 'Admin', position: 'System Administrator', userType: 'Admin', name: 'Admin User' };
  mockDb.data.users['mock-nazneen-ceo-uid'] = { uid: 'mock-nazneen-ceo-uid', email: 'nj@gmail.com', role: 'Executive', position: 'CEO', userType: 'CEO', name: 'Nazneen Jahangir', department: 'Executive Office' };
  mockDb.data.users['mock-exec-uid'] = { uid: 'mock-exec-uid', email: 'executive@pulse.com', role: 'Executive', position: 'Chief Executive Officer', userType: 'CEO', name: 'Executive User' };
  mockDb.data.users['mock-manager-uid'] = { uid: 'mock-manager-uid', email: 'manager@pulse.com', role: 'Sales Manager', position: 'Logistics Division Lead', userType: 'BU Head', name: 'Manager User' };
  mockDb.data.users['mock-employee-uid'] = { uid: 'mock-employee-uid', email: 'employee@pulse.com', role: 'Employee', position: 'Frontend Engineer', userType: 'Employee', name: 'Employee User' };
  
  // Seed department heads
  mockDb.data.users['mock-finance-head-uid'] = { uid: 'mock-finance-head-uid', email: 'financehead@gmail.com', role: 'Executive', position: 'Finance Head', userType: 'Functional Head', name: 'Finance Head', department: 'Finance' };
  mockDb.data.users['mock-global-hr-head-uid'] = { uid: 'mock-global-hr-head-uid', email: 'globalhrhead@gmail.com', role: 'Executive', position: 'Global HR Head', userType: 'Functional Head', name: 'Global HR Head', department: 'HR' };
  mockDb.data.users['mock-itg-head-uid'] = { uid: 'mock-itg-head-uid', email: 'itghead@gmail.com', role: 'Executive', position: 'ITG Head', userType: 'Functional Head', name: 'ITG Head', department: 'ITG' };
  mockDb.data.users['mock-nda-head-uid'] = { uid: 'mock-nda-head-uid', email: 'ndahead@gmail.com', role: 'Executive', position: 'NDA Head', userType: 'Functional Head', name: 'NDA Head', department: 'Legal' };
  mockDb.data.users['mock-tc-head-uid'] = { uid: 'mock-tc-head-uid', email: 'tchead@gmail.com', role: 'Executive', position: 'TC Head', userType: 'Functional Head', name: 'TC Head', department: 'TC' };
  mockDb.data.users['mock-quality-head-uid'] = { uid: 'mock-quality-head-uid', email: 'qualityhead@gmail.com', role: 'Executive', position: 'Quality Head', userType: 'Functional Head', name: 'Quality Head', department: 'Quality' };
  
  // Seed Project Managers
  mockDb.data.users['mock-nda-pm-uid'] = { uid: 'mock-nda-pm-uid', email: 'ndapm@pulse.com', role: 'Sales Manager', position: 'NDA Project Manager', userType: 'Project Manager', name: 'NDA PM', department: 'Legal' };
  mockDb.data.users['mock-itg-pm-uid'] = { uid: 'mock-itg-pm-uid', email: 'itgpm@pulse.com', role: 'Sales Manager', position: 'ITG Project Manager', userType: 'Project Manager', name: 'ITG PM', department: 'ITG' };
  
  // Seed standard accounts
  mockDb.data.accounts['acc-1'] = { id: 'acc-1', accountId: 'acc-1', companyName: 'Acme Corporation', industry: 'Technology', region: 'North America', healthScore: 88, status: 'Healthy', createdAt: new Date().toISOString() };
  mockDb.data.accounts['acc-2'] = { id: 'acc-2', accountId: 'acc-2', companyName: 'Global Logistics Inc', industry: 'Logistics', region: 'Europe', healthScore: 42, status: 'Critical', createdAt: new Date().toISOString() };
  mockDb.data.accounts['acc-3'] = { id: 'acc-3', accountId: 'acc-3', companyName: 'Apex Financial Services', industry: 'Finance', region: 'Asia Pacific', healthScore: 68, status: 'Warning', createdAt: new Date().toISOString() };

  // Seed contacts
  mockDb.data.contacts['con-1'] = { id: 'con-1', contactId: 'con-1', accountId: 'acc-1', name: 'Sarah Jenkins', email: 's.jenkins@acme.com', designation: 'VP of Engineering', hierarchyTag: 'VP', influenceTag: 'Decision Maker', phone: '+1 555-0199' };
  mockDb.data.contacts['con-2'] = { id: 'con-2', contactId: 'con-2', accountId: 'acc-2', name: 'Robert Miller', email: 'r.miller@globallogistics.com', designation: 'IT Director', hierarchyTag: 'Director', influenceTag: 'Champion', phone: '+44 20 7946 0958' };

  // Seed mock activity logs
  mockDb.data.activitylogs['act-init-1'] = {
    logId: 'act-init-1',
    userId: 'mock-admin-uid',
    userName: 'Admin User',
    action: 'User Login',
    details: 'Logged in successfully via database credentials: admin@pulse.com',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString()
  };
  mockDb.data.activitylogs['act-init-2'] = {
    logId: 'act-init-2',
    userId: 'mock-admin-uid',
    userName: 'Admin User',
    action: 'Create Account',
    details: 'Created client account Acme Corporation (ID: acc-1)',
    timestamp: new Date(Date.now() - 1000 * 60 * 40).toISOString()
  };
  mockDb.data.activitylogs['act-init-3'] = {
    logId: 'act-init-3',
    userId: 'mock-admin-uid',
    userName: 'Admin User',
    action: 'Create Contact',
    details: 'Created VP of Engineering contact Sarah Jenkins for Acme Corporation',
    timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString()
  };
  mockDb.data.activitylogs['act-init-4'] = {
    logId: 'act-init-4',
    userId: 'mock-employee-uid',
    userName: 'Employee User',
    action: 'Create Interaction',
    details: 'Logged Email interaction "Platform Stability Feedback" for Acme Corporation (Assigned to: NDA Head)',
    timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString()
  };
  mockDb.data.activitylogs['act-init-5'] = {
    logId: 'act-init-5',
    userId: 'mock-admin-uid',
    userName: 'Admin User',
    action: 'Resolve Risk',
    details: 'Updated risk ID risk-1 status to: Resolved. Description: Downtime issues addressed; server stabilized.',
    timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString()
  };

  // Seed Mock Client Interactions for Dashboard Tracker
  // Interaction 1: Sent (Logged) only
  mockDb.data.interactions['int-mock-1'] = {
    interactionId: 'int-mock-1',
    accountId: 'acc-1',
    contactId: 'con-1',
    source: 'Outlook Mail',
    subject: 'Project Kickoff & Compliance Requirement',
    messageText: 'Discussed project kickoff. Need the NDA Head to review the compliance requirements ASAP.',
    actionMentions: [{ uid: 'mock-nda-head-uid', name: 'NDA Head', task: 'review compliance requirements' }],
    loggedByUid: 'mock-admin-uid',
    loggedByName: 'Admin User',
    sentiment: 'Neutral',
    riskDetected: false,
    timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString()
  };
  mockDb.data.notifications['notif-mock-1'] = {
    notificationId: 'notif-mock-1',
    interactionId: 'int-mock-1',
    toUserId: 'mock-nda-head-uid',
    type: 'Task Assigned',
    message: 'Admin User assigned you a task: "review compliance requirements"',
    read: false,
    timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString()
  };

  // Interaction 2: Sent ➜ Seen
  mockDb.data.interactions['int-mock-2'] = {
    interactionId: 'int-mock-2',
    accountId: 'acc-2',
    contactId: 'con-2',
    source: 'Teams Chat',
    subject: 'Server Migration Schedule Coordination',
    messageText: '@ITG Head please coordinate the server migration schedule for Global Logistics.',
    actionMentions: [{ uid: 'mock-itg-head-uid', name: 'ITG Head', task: 'coordinate server migration' }],
    loggedByUid: 'mock-admin-uid',
    loggedByName: 'Admin User',
    sentiment: 'Positive',
    riskDetected: false,
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString()
  };
  mockDb.data.notifications['notif-mock-2'] = {
    notificationId: 'notif-mock-2',
    interactionId: 'int-mock-2',
    toUserId: 'mock-itg-head-uid',
    type: 'Task Assigned',
    message: 'Admin User assigned you a task: "coordinate server migration"',
    read: true,
    readAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString()
  };

  // Interaction 3: Sent ➜ Seen ➜ Replied ➜ Received
  mockDb.data.interactions['int-mock-3'] = {
    interactionId: 'int-mock-3',
    accountId: 'acc-3',
    contactId: 'con-1',
    source: 'Teams Meeting',
    subject: 'Feedback on Sandbox Billing Integration',
    messageText: '@Finance Head please review sandbox billing integration issues.',
    actionMentions: [{ uid: 'mock-finance-head-uid', name: 'Finance Head', task: 'review sandbox billing integration issues' }],
    loggedByUid: 'mock-admin-uid',
    loggedByName: 'Admin User',
    sentiment: 'Negative',
    riskDetected: true,
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString()
  };
  mockDb.data.notifications['notif-mock-3'] = {
    notificationId: 'notif-mock-3',
    interactionId: 'int-mock-3',
    toUserId: 'mock-finance-head-uid',
    type: 'Task Assigned',
    message: 'Admin User assigned you a task: "review sandbox billing integration issues"',
    read: true,
    readAt: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString()
  };
  
  // Replied state: seed replies sub-collection flat key
  mockDb.data['interactions/int-mock-3/replies'] = {
    'reply-mock-3': {
      replyId: 'reply-mock-3',
      interactionId: 'int-mock-3',
      authorUid: 'mock-finance-head-uid',
      authorName: 'Finance Head',
      text: 'I have looked at the logs and fixed the integration parameters on the sandbox environment.',
      timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString()
    }
  };
  
  // Received state: task reply notification marked read by admin
  mockDb.data.notifications['notif-mock-4'] = {
    notificationId: 'notif-mock-4',
    interactionId: 'int-mock-3',
    toUserId: 'mock-admin-uid',
    type: 'Task Reply',
    message: 'Finance Head replied to the task: "I have looked at the logs..."',
    read: true,
    readAt: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
    timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString()
  };
}

if (isMssql) {
  activeDbProvider = mssqlDb;
  isMock = true;
  auth = new MockAuth();
  
  initMssql().catch(err => {
    console.error('\n❌ Failed to initialize SQL Server database:', err.message);
    console.warn('\n⚠️ FALLING BACK TO MOCK IN-MEMORY DATABASE to keep the server running.');
    console.warn('To fix SQL Server connectivity, follow the steps in walkthrough.md:');
    console.warn('  1. Enable TCP/IP in SQL Server Configuration Manager.');
    console.warn('  2. Set TCP Port to 1433 under TCP/IP Properties -> IP Addresses -> IPAll.');
    console.warn('  3. Restart the SQL Server service.');
    console.warn('  4. Set Mixed Mode Authentication and verify your SA credentials in backend/.env.\n');
    
    // Swap provider to mock
    activeDbProvider = new MockFirestore();
    seedMockData(activeDbProvider);
  });
} else if (isMysql) {
  activeDbProvider = mysqlDb;
  isMock = true;
  auth = new MockAuth();
  
  initMysql().catch(err => {
    console.error('\n❌ Failed to initialize MySQL/Percona database:', err.message);
    console.warn('\n⚠️ FALLING BACK TO MOCK IN-MEMORY DATABASE to keep the server running.');
    
    // Swap provider to mock
    activeDbProvider = new MockFirestore();
    seedMockData(activeDbProvider);
  });
} else {
  console.log('⚠️ Running in Mock Database mode (In-Memory). Configure DB_TYPE=mssql or mysql to use a database.');
  const mockDb = new MockFirestore();
  activeDbProvider = mockDb;
  auth = new MockAuth();
  isMock = true;
  seedMockData(mockDb);
}

export async function logActivity(userId, userName, action, details) {
  try {
    const logId = 'act-' + Math.random().toString(36).substring(2, 11);
    await db.collection('activitylogs').doc(logId).set({
      logId,
      userId,
      userName,
      action,
      details,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

export { db, auth, isMock };
