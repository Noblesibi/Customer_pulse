import dotenv from 'dotenv';
import { db as postgresDb, initializeDatabase as initPostgres } from './postgres.js';
import { NESTGROUP_EMPLOYEES } from '../services/nestgroup.seed.js';
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
      activitylogs: {},
      tasks: {},
      taskreplies: {},
      emailqueue: {},
      emaillogs: {},
      notificationpreferences: {},
      celebrationEvents: {},
      userintegrations: {}
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

  NESTGROUP_EMPLOYEES.forEach(emp => {
    mockDb.data.users[emp.uid] = { ...emp };
  });

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
export async function logActivity(userIdOrObj, userName, action, details) {
  try {
    let uId = userIdOrObj;
    let uName = userName;
    let act = action;
    let det = details;

    if (typeof userIdOrObj === 'object' && userIdOrObj !== null) {
      uId = userIdOrObj.userId || userIdOrObj.uid || 'system';
      uName = userIdOrObj.userName || userIdOrObj.name || 'System';
      act = userIdOrObj.action || 'ACTIVITY';
      det = userIdOrObj.details || (userIdOrObj.entityType ? `${userIdOrObj.entityType} ${userIdOrObj.entityId || ''}` : '');
    }

    const logId = 'act-' + Math.random().toString(36).substring(2, 11);
    await db.collection('activitylogs').doc(logId).set({
      logId,
      userId: typeof uId === 'string' ? uId.slice(0, 50) : 'system',
      userName: typeof uName === 'string' ? uName.slice(0, 100) : 'System',
      action: typeof act === 'string' ? act.slice(0, 50) : 'ACTIVITY',
      details: typeof det === 'string' ? det : JSON.stringify(det || ''),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

export { db, auth, isMock };
