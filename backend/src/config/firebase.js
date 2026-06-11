import admin from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

let db;
let auth;
let isMock = false;

// Mock database class to replicate Firestore behaviors
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
      healthScores: {}
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
            self._triggerListeners(name);
            return { id: docId };
          },
          update: async (val) => {
            self.data[name][docId] = { ...self.data[name][docId], ...val, id: docId };
            self._triggerListeners(name);
            return { id: docId };
          },
          delete: async () => {
            delete self.data[name][docId];
            self._triggerListeners(name);
            return { id: docId };
          }
        };
      },
      add: async (val) => {
        const id = Math.random().toString(36).substring(2, 15);
        self.data[name][id] = { ...val, id };
        self._triggerListeners(name);
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

  _triggerListeners(collectionName) {
    this.listeners.forEach(listener => {
      if (listener.collection === collectionName) {
        listener.callback(Object.values(this.data[collectionName]));
      }
    });
  }

  // Support local push listening
  onSnapshot(collectionName, callback) {
    const listener = { collection: collectionName, callback };
    this.listeners.push(listener);
    // Initial call
    callback(Object.values(this.data[collectionName] || {}));
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
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
    // Simple mock decoding
    try {
      const parsed = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return parsed;
    } catch (e) {
      throw new Error('Invalid mock token');
    }
  }
}

// Try initializing real Firebase Admin SDK
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    auth = admin.auth();
    console.log('🔥 Real Firebase Admin SDK initialized successfully!');
    
    // Seed production database if missing seed values
    seedProductionDatabase(db);
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK, falling back to mock:', error.message);
    isMock = true;
  }
} else {
  console.log('⚠️ No firebase service key found. Using mock Firestore + mock Auth.');
  isMock = true;
}

async function seedProductionDatabase(db) {
  try {
    console.log('🌱 Checking and seeding production Firestore data...');
    
    // Seed users
    const users = {
      'mock-admin-uid': {
        email: 'admin@pulse.com',
        role: 'Admin',
        position: 'System Administrator',
        userType: 'Admin',
        name: 'Admin User',
        password: 'admin123'
      },
      'mock-nazneen-ceo-uid': {
        email: 'nj@gmail.com',
        role: 'Executive',
        position: 'CEO',
        userType: 'CEO',
        name: 'Nazneen Jahangir',
        department: 'Executive Office',
        password: 'nj123',
        createdAt: new Date().toISOString()
      },
      'mock-exec-uid': {
        email: 'executive@pulse.com',
        role: 'Executive',
        position: 'Chief Executive Officer',
        userType: 'CEO',
        name: 'Executive User',
        password: 'exec123',
        createdAt: new Date().toISOString()
      },
      'mock-finance-head-uid': {
        email: 'financehead@gmail.com',
        role: 'Executive',
        position: 'Finance Head',
        userType: 'Functional Head',
        name: 'Finance Head',
        department: 'Finance',
        projects: [
          { name: 'Apex Financial Services', projectManagers: [], employees: ['John Smith', 'Alice Cooper'] },
          { name: 'Quarterly Financial Planning', projectManagers: [], employees: ['John Smith'] },
          { name: 'Billing Integration', projectManagers: [], employees: ['Alice Cooper'] }
        ],
        employees: ['John Smith', 'Alice Cooper'],
        password: 'financehead123',
        createdAt: new Date().toISOString()
      },
      'mock-global-hr-head-uid': {
        email: 'globalhrhead@gmail.com',
        role: 'Executive',
        position: 'Global HR Head',
        userType: 'Functional Head',
        name: 'Global HR Head',
        department: 'HR',
        projects: [
          { name: 'Acme Corporation', projectManagers: [], employees: ['Jane Doe'] },
          { name: 'Annual Appraisal System', projectManagers: [], employees: ['Bob Marley'] }
        ],
        employees: ['Jane Doe', 'Bob Marley'],
        password: 'globalhrhead123',
        createdAt: new Date().toISOString()
      },
      'mock-itg-head-uid': {
        email: 'itghead@gmail.com',
        role: 'Executive',
        position: 'ITG Head',
        userType: 'Functional Head',
        name: 'ITG Head',
        department: 'ITG',
        projects: [
          { name: 'Global Logistics Inc', projectManagers: [], employees: ['Linus Torvalds'] },
          { name: 'Cybersecurity Audit', projectManagers: [], employees: ['Steve Wozniak'] }
        ],
        employees: ['Linus Torvalds', 'Steve Wozniak'],
        password: 'itghead123',
        createdAt: new Date().toISOString()
      },
      'mock-nda-head-uid': {
        email: 'ndahead@gmail.com',
        role: 'Executive',
        position: 'NDA Head',
        userType: 'Functional Head',
        name: 'NDA Head',
        department: 'Legal',
        projects: [
          { name: 'Acme Corporation', projectManagers: [], employees: ['Harvey Specter'] },
          { name: 'Compliance Training', projectManagers: [], employees: ['Mike Ross'] }
        ],
        employees: ['Harvey Specter', 'Mike Ross'],
        password: 'ndahead123',
        createdAt: new Date().toISOString()
      },
      'mock-tc-head-uid': {
        email: 'tchead@gmail.com',
        role: 'Executive',
        position: 'TC Head',
        userType: 'Functional Head',
        name: 'TC Head',
        department: 'TC',
        projects: [
          { name: 'Global Logistics Inc', projectManagers: [], employees: ['Alan Turing'] },
          { name: 'AI/ML Platform R&D', projectManagers: [], employees: ['Grace Hopper'] }
        ],
        employees: ['Alan Turing', 'Grace Hopper'],
        password: 'tchead123',
        createdAt: new Date().toISOString()
      },
      'mock-quality-head-uid': {
        email: 'qualityhead@gmail.com',
        role: 'Executive',
        position: 'Quality Head',
        userType: 'Functional Head',
        name: 'Quality Head',
        department: 'Quality',
        projects: [
          { name: 'Apex Financial Services', projectManagers: [], employees: ['Dennis Ritchie'] },
          { name: 'Performance Regression Suite', projectManagers: [], employees: ['Ken Thompson'] }
        ],
        employees: ['Dennis Ritchie', 'Ken Thompson'],
        password: 'qualityhead123',
        createdAt: new Date().toISOString()
      },
      'mock-manager-uid': {
        email: 'manager@pulse.com',
        role: 'Sales Manager',
        position: 'Logistics Division Lead',
        userType: 'BU Head',
        name: 'Manager User',
        password: 'manager123'
      },
      'mock-employee-uid': {
        email: 'employee@pulse.com',
        role: 'Employee',
        position: 'Frontend Engineer',
        userType: 'Employee',
        name: 'Employee User',
        password: 'employee123'
      }
    };

    for (const [defaultUid, uData] of Object.entries(users)) {
      const emailSnap = await db.collection('users').where('email', '==', uData.email).get();
      if (emailSnap.size > 0) {
        const existingDoc = emailSnap.docs[0];
        await existingDoc.ref.update({
          role: uData.role,
          position: uData.position || '',
          userType: uData.userType || '',
          name: uData.name || existingDoc.data().name,
          department: uData.department || '',
          password: uData.password || existingDoc.data().password || '',
          projects: uData.projects || existingDoc.data().projects || [],
          employees: uData.employees || existingDoc.data().employees || []
        });
        console.log(`  Updated existing user: ${uData.email}`);
      } else {
        await db.collection('users').doc(defaultUid).set({
          uid: defaultUid,
          ...uData
        });
        console.log(`  Added user seed: ${uData.email}`);
      }
    }

    // Seed accounts
    const accounts = {
      'acc-1': {
        accountId: 'acc-1',
        companyName: 'Acme Corporation',
        industry: 'Technology',
        region: 'North America',
        healthScore: 88,
        status: 'Healthy',
        createdAt: new Date().toISOString()
      },
      'acc-2': {
        accountId: 'acc-2',
        companyName: 'Global Logistics Inc',
        industry: 'Logistics',
        region: 'Europe',
        healthScore: 42,
        status: 'Critical',
        createdAt: new Date().toISOString()
      },
      'acc-3': {
        accountId: 'acc-3',
        companyName: 'Apex Financial Services',
        industry: 'Finance',
        region: 'Asia Pacific',
        healthScore: 68,
        status: 'Warning',
        createdAt: new Date().toISOString()
      }
    };

    for (const [accId, accData] of Object.entries(accounts)) {
      const accRef = db.collection('accounts').doc(accId);
      const accDoc = await accRef.get();
      if (!accDoc.exists) {
        await accRef.set(accData);
        console.log(`  Added account seed: ${accData.companyName}`);
      }
    }

    // Seed contacts
    const contacts = {
      'con-1': {
        contactId: 'con-1',
        accountId: 'acc-1',
        name: 'Sarah Jenkins',
        email: 's.jenkins@acme.com',
        designation: 'VP of Engineering',
        hierarchyTag: 'VP',
        influenceTag: 'Decision Maker',
        phone: '+1 555-0199'
      },
      'con-2': {
        contactId: 'con-2',
        accountId: 'acc-2',
        name: 'Robert Miller',
        email: 'r.miller@globallogistics.com',
        designation: 'IT Director',
        hierarchyTag: 'Director',
        influenceTag: 'Champion',
        phone: '+44 20 7946 0958'
      }
    };

    for (const [conId, conData] of Object.entries(contacts)) {
      const conRef = db.collection('contacts').doc(conId);
      const conDoc = await conRef.get();
      if (!conDoc.exists) {
        await conRef.set(conData);
        console.log(`  Added contact seed: ${conData.name}`);
      }
    }

    // Seed interactions
    const interactions = {
      'int-1': {
        interactionId: 'int-1',
        accountId: 'acc-1',
        contactId: 'con-1',
        source: 'Email',
        messageText: "We are extremely pleased with the platform's stability. Our onboarding went incredibly well.",
        sentiment: 'Positive',
        riskDetected: false,
        riskCategory: '',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()
      },
      'int-2': {
        interactionId: 'int-2',
        accountId: 'acc-2',
        contactId: 'con-2',
        source: 'Meeting',
        messageText: "The system has been experiencing major downtime, which delayed our cargo reports. We are actively reviewing competitor packages.",
        sentiment: 'Negative',
        riskDetected: true,
        riskCategory: 'Competitor Mentions',
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
      }
    };

    for (const [intId, intData] of Object.entries(interactions)) {
      const intRef = db.collection('interactions').doc(intId);
      const intDoc = await intRef.get();
      if (!intDoc.exists) {
        await intRef.set(intData);
        console.log(`  Added interaction seed: ${intId}`);
      }
    }

    // Seed risks
    const risks = {
      'risk-1': {
        riskId: 'risk-1',
        accountId: 'acc-2',
        category: 'Competitor Mentions',
        severity: 'High',
        description: 'Client is actively reviewing competitor packages due to repeated downtime issues.',
        status: 'Open'
      }
    };

    for (const [riskId, riskData] of Object.entries(risks)) {
      const riskRef = db.collection('risks').doc(riskId);
      const riskDoc = await riskRef.get();
      if (!riskDoc.exists) {
        await riskRef.set(riskData);
        console.log(`  Added risk seed: ${riskId}`);
      }
    }

    console.log('✅ Firestore seeding verification finished.');
  } catch (err) {
    console.error('❌ Failed to seed production database:', err.message);
  }
}


if (isMock) {
  db = new MockFirestore();
  auth = new MockAuth();

  // Populate mock database with initial mock seed data for direct use
  db.data.users['mock-admin-uid'] = {
    uid: 'mock-admin-uid',
    email: 'admin@pulse.com',
    role: 'Admin',
    position: 'System Administrator',
    userType: 'Admin',
    name: 'Admin User'
  };
  
  db.data.users['mock-nazneen-ceo-uid'] = {
    uid: 'mock-nazneen-ceo-uid',
    email: 'nj@gmail.com',
    role: 'Executive',
    position: 'CEO',
    userType: 'CEO',
    name: 'Nazneen Jahangir',
    department: 'Executive Office',
    createdAt: new Date().toISOString()
  };

  db.data.users['mock-exec-uid'] = {
    uid: 'mock-exec-uid',
    email: 'executive@pulse.com',
    role: 'Executive',
    position: 'Chief Executive Officer',
    userType: 'CEO',
    name: 'Executive User',
    createdAt: new Date().toISOString()
  };

  db.data.users['mock-finance-head-uid'] = {
    uid: 'mock-finance-head-uid',
    email: 'financehead@gmail.com',
    role: 'Executive',
    position: 'Finance Head',
    userType: 'Functional Head',
    name: 'Finance Head',
    department: 'Finance',
    projects: [
      { name: 'Apex Financial Services', projectManagers: [], employees: ['John Smith', 'Alice Cooper'] },
      { name: 'Quarterly Financial Planning', projectManagers: [], employees: ['John Smith'] },
      { name: 'Billing Integration', projectManagers: [], employees: ['Alice Cooper'] }
    ],
    employees: ['John Smith', 'Alice Cooper'],
    createdAt: new Date().toISOString()
  };

  db.data.users['mock-global-hr-head-uid'] = {
    uid: 'mock-global-hr-head-uid',
    email: 'globalhrhead@gmail.com',
    role: 'Executive',
    position: 'Global HR Head',
    userType: 'Functional Head',
    name: 'Global HR Head',
    department: 'HR',
    projects: [
      { name: 'Acme Corporation', projectManagers: [], employees: ['Jane Doe'] },
      { name: 'Annual Appraisal System', projectManagers: [], employees: ['Bob Marley'] }
    ],
    employees: ['Jane Doe', 'Bob Marley'],
    createdAt: new Date().toISOString()
  };

  db.data.users['mock-itg-head-uid'] = {
    uid: 'mock-itg-head-uid',
    email: 'itghead@gmail.com',
    role: 'Executive',
    position: 'ITG Head',
    userType: 'Functional Head',
    name: 'ITG Head',
    department: 'ITG',
    projects: [
      { name: 'Global Logistics Inc', projectManagers: [], employees: ['Linus Torvalds'] },
      { name: 'Cybersecurity Audit', projectManagers: [], employees: ['Steve Wozniak'] }
    ],
    employees: ['Linus Torvalds', 'Steve Wozniak'],
    createdAt: new Date().toISOString()
  };

  db.data.users['mock-nda-head-uid'] = {
    uid: 'mock-nda-head-uid',
    email: 'ndahead@gmail.com',
    role: 'Executive',
    position: 'NDA Head',
    userType: 'Functional Head',
    name: 'NDA Head',
    department: 'Legal',
    projects: [
      { name: 'Acme Corporation', projectManagers: [], employees: ['Harvey Specter'] },
      { name: 'Compliance Training', projectManagers: [], employees: ['Mike Ross'] }
    ],
    employees: ['Harvey Specter', 'Mike Ross'],
    createdAt: new Date().toISOString()
  };

  db.data.users['mock-tc-head-uid'] = {
    uid: 'mock-tc-head-uid',
    email: 'tchead@gmail.com',
    role: 'Executive',
    position: 'TC Head',
    userType: 'Functional Head',
    name: 'TC Head',
    department: 'TC',
    projects: [
      { name: 'Global Logistics Inc', projectManagers: [], employees: ['Alan Turing'] },
      { name: 'AI/ML Platform R&D', projectManagers: [], employees: ['Grace Hopper'] }
    ],
    employees: ['Alan Turing', 'Grace Hopper'],
    createdAt: new Date().toISOString()
  };

  db.data.users['mock-quality-head-uid'] = {
    uid: 'mock-quality-head-uid',
    email: 'qualityhead@gmail.com',
    role: 'Executive',
    position: 'Quality Head',
    userType: 'Functional Head',
    name: 'Quality Head',
    department: 'Quality',
    projects: [
      { name: 'Apex Financial Services', projectManagers: [], employees: ['Dennis Ritchie'] },
      { name: 'Performance Regression Suite', projectManagers: [], employees: ['Ken Thompson'] }
    ],
    employees: ['Dennis Ritchie', 'Ken Thompson'],
    createdAt: new Date().toISOString()
  };

  db.data.users['mock-manager-uid'] = {
    uid: 'mock-manager-uid',
    email: 'manager@pulse.com',
    role: 'Sales Manager',
    position: 'Logistics Division Lead',
    userType: 'BU Head',
    name: 'Manager User'
  };

  db.data.users['mock-employee-uid'] = {
    uid: 'mock-employee-uid',
    email: 'employee@pulse.com',
    role: 'Employee',
    position: 'Frontend Engineer',
    userType: 'Employee',
    name: 'Employee User'
  };

  // Seed standard accounts
  db.data.accounts['acc-1'] = {
    id: 'acc-1',
    accountId: 'acc-1',
    companyName: 'Acme Corporation',
    industry: 'Technology',
    region: 'North America',
    healthScore: 88,
    status: 'Healthy',
    createdAt: new Date().toISOString()
  };

  db.data.accounts['acc-2'] = {
    id: 'acc-2',
    accountId: 'acc-2',
    companyName: 'Global Logistics Inc',
    industry: 'Logistics',
    region: 'Europe',
    healthScore: 42,
    status: 'Critical',
    createdAt: new Date().toISOString()
  };

  db.data.accounts['acc-3'] = {
    id: 'acc-3',
    accountId: 'acc-3',
    companyName: 'Apex Financial Services',
    industry: 'Finance',
    region: 'Asia Pacific',
    healthScore: 68,
    status: 'Warning',
    createdAt: new Date().toISOString()
  };

  // Seed contacts
  db.data.contacts['con-1'] = {
    id: 'con-1',
    contactId: 'con-1',
    accountId: 'acc-1',
    name: 'Sarah Jenkins',
    email: 's.jenkins@acme.com',
    designation: 'VP of Engineering',
    hierarchyTag: 'VP',
    influenceTag: 'Decision Maker',
    phone: '+1 555-0199'
  };

  db.data.contacts['con-2'] = {
    id: 'con-2',
    contactId: 'con-2',
    accountId: 'acc-2',
    name: 'Robert Miller',
    email: 'r.miller@globallogistics.com',
    designation: 'IT Director',
    hierarchyTag: 'Director',
    influenceTag: 'Champion',
    phone: '+44 20 7946 0958'
  };

  // Seed interactions
  db.data.interactions['int-1'] = {
    id: 'int-1',
    interactionId: 'int-1',
    accountId: 'acc-1',
    contactId: 'con-1',
    source: 'Email',
    messageText: "We are extremely pleased with the platform's stability. Our onboarding went incredibly well.",
    sentiment: 'Positive',
    riskDetected: false,
    riskCategory: '',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() // 2 hours ago
  };

  db.data.interactions['int-2'] = {
    id: 'int-2',
    interactionId: 'int-2',
    accountId: 'acc-2',
    contactId: 'con-2',
    source: 'Meeting',
    messageText: "The system has been experiencing major downtime, which delayed our cargo reports. We are actively reviewing competitor packages.",
    sentiment: 'Negative',
    riskDetected: true,
    riskCategory: 'Competitor Mentions',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() // 1 day ago
  };

  // Seed risks
  db.data.risks['risk-1'] = {
    id: 'risk-1',
    riskId: 'risk-1',
    accountId: 'acc-2',
    category: 'Competitor Mentions',
    severity: 'High',
    description: 'Client is actively reviewing competitor packages due to repeated downtime issues.',
    status: 'Open'
  };
}

export { db, auth, isMock };
export default admin;
