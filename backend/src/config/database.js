import dotenv from 'dotenv';
import { db as postgresDb, initializeDatabase as initPostgres } from './postgres.js';
import fs from 'fs';
import path from 'path';

dotenv.config();

let auth;
let isMock = false;
const dbType = (process.env.DB_TYPE || 'postgres').toLowerCase();
const isPostgres = dbType === 'postgres';

// Dynamic Database Provider — allows clean fallback to mock on connection failure
let activeDbProvider = null;

const MOCK_DB_FILE = path.resolve(process.cwd(), 'db-mock.json');

class FirestoreSQLAdapter {
  collection(name) {
    if (!activeDbProvider) {
      throw new Error('Database layer is not initialized yet!');
    }
    return activeDbProvider.collection(name);
  }
}

const db = new FirestoreSQLAdapter();

// ─────────────────────────────────────────────────────────
// High-fidelity in-memory Mock Database (dev/fallback mode)
// ─────────────────────────────────────────────────────────
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
    this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(MOCK_DB_FILE)) {
        this.data = JSON.parse(fs.readFileSync(MOCK_DB_FILE, 'utf8'));
      } else {
        this.saveData();
      }
    } catch (err) {
      console.error('Failed to load mock database:', err);
    }
  }

  saveData() {
    try {
      fs.writeFileSync(MOCK_DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save mock database:', err);
    }
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
            self.saveData();
            return { id: docId };
          },
          update: async (val) => {
            self.data[name][docId] = { ...self.data[name][docId], ...val, id: docId };
            self.saveData();
            return { id: docId };
          },
          delete: async () => {
            delete self.data[name][docId];
            self.saveData();
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
        self.saveData();
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
              .map(doc => ({ id: doc.id, exists: true, data: () => doc }));
            return { docs };
          },
          limit(num) {
            return {
              get: async () => {
                const docs = Object.values(self.data[name])
                  .filter(doc => doc[field] === value)
                  .slice(0, num)
                  .map(doc => ({ id: doc.id, exists: true, data: () => doc }));
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
              .map(doc => ({ id: doc.id, exists: true, data: () => doc }));
            return { docs };
          }
        };
      }
    };
  }
}

// ─────────────────────────────────────────────────────────
// Mock Auth (used in PostgreSQL mode since we issue JWTs
// ourselves — no Firebase dependency required)
// ─────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────
// Mock database seed data (used only in fallback mode)
// ─────────────────────────────────────────────────────────
function seedMockData(mockDb) {
  mockDb.data.users['mock-admin-uid'] = { uid: 'mock-admin-uid', email: 'admin@pulse.com', role: 'Admin', position: 'System Administrator', userType: 'Admin', name: 'Admin User' };
  mockDb.data.users['mock-nazneen-ceo-uid'] = { uid: 'mock-nazneen-ceo-uid', email: 'nj@gmail.com', role: 'Executive', position: 'CEO', userType: 'CEO', name: 'Nazneen Jahangir', department: 'Executive Office' };
  mockDb.data.users['mock-exec-uid'] = { uid: 'mock-exec-uid', email: 'executive@pulse.com', role: 'Executive', position: 'Chief Executive Officer', userType: 'CEO', name: 'Executive User' };
  mockDb.data.users['mock-manager-uid'] = { uid: 'mock-manager-uid', email: 'manager@pulse.com', role: 'Sales Manager', position: 'Logistics Division Lead', userType: 'BU Head', name: 'Manager User' };
  mockDb.data.users['mock-employee-uid'] = { uid: 'mock-employee-uid', email: 'employee@pulse.com', role: 'Employee', position: 'Frontend Engineer', userType: 'Employee', name: 'Employee User' };
  mockDb.data.users['mock-finance-head-uid'] = { uid: 'mock-finance-head-uid', email: 'financehead@gmail.com', role: 'Executive', position: 'Finance Head', userType: 'Functional Head', name: 'Finance Head', department: 'Finance' };
  mockDb.data.users['mock-global-hr-head-uid'] = { uid: 'mock-global-hr-head-uid', email: 'globalhrhead@gmail.com', role: 'Executive', position: 'Global HR Head', userType: 'Functional Head', name: 'Global HR Head', department: 'HR' };
  mockDb.data.users['mock-itg-head-uid'] = { uid: 'mock-itg-head-uid', email: 'itghead@gmail.com', role: 'Executive', position: 'ITG Head', userType: 'Functional Head', name: 'ITG Head', department: 'ITG' };
  mockDb.data.users['mock-nda-head-uid'] = { uid: 'mock-nda-head-uid', email: 'ndahead@gmail.com', role: 'Executive', position: 'NDA Head', userType: 'Functional Head', name: 'NDA Head', department: 'Legal' };
  mockDb.data.users['mock-tc-head-uid'] = { uid: 'mock-tc-head-uid', email: 'tchead@gmail.com', role: 'Executive', position: 'TC Head', userType: 'Functional Head', name: 'TC Head', department: 'TC' };
  mockDb.data.users['mock-quality-head-uid'] = { uid: 'mock-quality-head-uid', email: 'qualityhead@gmail.com', role: 'Executive', position: 'Quality Head', userType: 'Functional Head', name: 'Quality Head', department: 'Quality' };

  const abcAnniv = new Date();
  abcAnniv.setFullYear(abcAnniv.getFullYear() - 5);
  abcAnniv.setDate(abcAnniv.getDate() + 3);
  const abcCreated = abcAnniv.toISOString();

  const bday = new Date();
  bday.setDate(bday.getDate() + 7);
  const bdayStr = bday.toISOString().split('T')[0];

  mockDb.data.accounts['acc-1'] = { id: 'acc-1', accountId: 'acc-1', companyName: 'Acme Corporation', industry: 'Technology', region: 'North America', healthScore: 88, status: 'Healthy', ownerId: 'mock-admin-uid', ownerName: 'Admin User', createdAt: new Date().toISOString() };
  mockDb.data.accounts['acc-2'] = { id: 'acc-2', accountId: 'acc-2', companyName: 'Global Logistics Inc', industry: 'Logistics', region: 'Europe', healthScore: 42, status: 'Critical', ownerId: 'mock-manager-uid', ownerName: 'Manager User', createdAt: new Date().toISOString() };
  mockDb.data.accounts['acc-3'] = { id: 'acc-3', accountId: 'acc-3', companyName: 'Apex Financial Services', industry: 'Finance', region: 'Asia Pacific', healthScore: 68, status: 'Warning', ownerId: 'mock-employee-uid', ownerName: 'Employee User', createdAt: new Date().toISOString() };
  mockDb.data.accounts['acc-abc'] = { id: 'acc-abc', accountId: 'acc-abc', companyName: 'ABC Bank', industry: 'Finance', region: 'North America', healthScore: 78, status: 'Healthy', email: 'corporate@abcbank.com', phone: '+1 555-9876', ceoName: 'John Pierpont', domain: 'abcbank.com', ownerId: 'mock-admin-uid', ownerName: 'Admin User', createdAt: abcCreated };

  mockDb.data.contacts['con-1'] = { id: 'con-1', contactId: 'con-1', accountId: 'acc-1', name: 'Sarah Jenkins', email: 's.jenkins@acme.com', designation: 'VP of Engineering', hierarchyTag: 'VP', influenceTag: 'Decision Maker', phone: '+1 555-0199', ownerId: 'mock-admin-uid', ownerName: 'Admin User', birthday: null, createdAt: new Date().toISOString() };
  mockDb.data.contacts['con-2'] = { id: 'con-2', contactId: 'con-2', accountId: 'acc-2', name: 'Robert Miller', email: 'r.miller@globallogistics.com', designation: 'IT Director', hierarchyTag: 'Director', influenceTag: 'Champion', phone: '+44 20 7946 0958', ownerId: 'mock-manager-uid', ownerName: 'Manager User', birthday: null, createdAt: new Date().toISOString() };
  mockDb.data.contacts['con-cio'] = { id: 'con-cio', contactId: 'con-cio', accountId: 'acc-1', name: 'John Doe', email: 'j.doe@acme.com', designation: 'CIO', hierarchyTag: 'CXO', influenceTag: 'Decision Maker', phone: '+1 555-0155', ownerId: 'mock-admin-uid', ownerName: 'Admin User', birthday: bdayStr, createdAt: new Date().toISOString() };
  mockDb.data.contacts['con-abc-cio'] = { id: 'con-abc-cio', contactId: 'con-abc-cio', accountId: 'acc-abc', name: 'David Vance', email: 'd.vance@abcbank.com', designation: 'Chief Information Officer', hierarchyTag: 'CXO', influenceTag: 'Decision Maker', phone: '+1 555-0255', ownerId: 'mock-admin-uid', ownerName: 'Admin User', birthday: null, createdAt: new Date().toISOString() };

  mockDb.data.activitylogs['act-init-1'] = {
    logId: 'act-init-1', userId: 'mock-admin-uid', userName: 'Admin User',
    action: 'User Login', details: 'Logged in successfully via mock credentials: admin@pulse.com',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString()
  };
}

// ─────────────────────────────────────────────────────────
// Provider Initialization
// ─────────────────────────────────────────────────────────
auth = new MockAuth();

if (isPostgres) {
  // PostgreSQL mode — primary production path for Nest Digital CRM
  activeDbProvider = postgresDb;
  isMock = true; // JWT-based auth, not Firebase; isMock means "we manage our own JWTs"

  initPostgres().catch(err => {
    const detail = err.message || (err.errors && err.errors.map(e => e.message).join('; ')) || String(err);
    console.error('\n❌ Failed to initialize PostgreSQL database:', detail);
    if (err.errors) {
      err.errors.forEach((e, i) => console.error(`  Sub-error [${i}]:`, e.message || e));
    }
    console.warn('\n⚠️  FALLING BACK TO MOCK IN-MEMORY DATABASE.');
    console.warn('To fix PostgreSQL connectivity, ensure:');
    console.warn('  1. PostgreSQL is running on the configured DB_HOST:DB_PORT.');
    console.warn('  2. DB_USER, DB_PASSWORD, DB_DATABASE are correct in backend/.env');
    console.warn('  3. The database was created: createdb -U postgres customer_pulse\n');

    // Swap to in-memory mock on failure
    const fileExists = fs.existsSync(MOCK_DB_FILE);
    const mockDb = new MockFirestore();
    activeDbProvider = mockDb;
    if (!fileExists) {
      seedMockData(mockDb);
      mockDb.saveData();
    }
  });
} else {
  // Developer mock mode (no database required)
  console.log('⚠️  Running in Mock In-Memory mode. Set DB_TYPE=postgres in backend/.env to connect to PostgreSQL.');
  const fileExists = fs.existsSync(MOCK_DB_FILE);
  const mockDb = new MockFirestore();
  activeDbProvider = mockDb;
  isMock = true;
  if (!fileExists) {
    seedMockData(mockDb);
    mockDb.saveData();
  }
}

// ─────────────────────────────────────────────────────────
// Activity Logger (shared across all route modules)
// ─────────────────────────────────────────────────────────
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
