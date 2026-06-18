import { Router } from 'express';
import { db, auth, isMock, logActivity } from '../config/database.js';
import jwt from 'jsonwebtoken';
import { authenticateLdapUser } from '../services/ldap.service.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'customer-pulse-super-secret-key';

// Mock password map for local database simplicity
const MOCK_PASSWORDS = {
  'admin@pulse.com': 'admin123',
  'executive@pulse.com': 'exec123',
  'manager@pulse.com': 'manager123',
  'employee@pulse.com': 'employee123',
  'nj@gmail.com': 'nj123',
  'financehead@gmail.com': 'financehead123',
  'globalhrhead@gmail.com': 'globalhrhead123',
  'itghead@gmail.com': 'itghead123',
  'ndahead@gmail.com': 'ndahead123',
  'tchead@gmail.com': 'tchead123',
  'qualityhead@gmail.com': 'qualityhead123'
};

const HARDCODED_HEADS = {
  'nj@gmail.com': {
    uid: 'mock-nazneen-ceo-uid',
    email: 'nj@gmail.com',
    role: 'Executive',
    position: 'CEO',
    userType: 'CEO',
    name: 'Nazneen Jahangir',
    department: 'Executive Office',
    password: 'nj123'
  },
  'financehead@gmail.com': {
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
    password: 'financehead123'
  },
  'globalhrhead@gmail.com': {
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
    password: 'globalhrhead123'
  },
  'itghead@gmail.com': {
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
    password: 'itghead123'
  },
  'ndahead@gmail.com': {
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
    password: 'ndahead123'
  },
  'tchead@gmail.com': {
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
    password: 'tchead123'
  },
  'qualityhead@gmail.com': {
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
    password: 'qualityhead123'
  }
};

/**
 * Helper to generate JWT token for mockup
 */
function generateMockToken(user) {
  return jwt.sign(
    { uid: user.uid, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * POST /api/auth/signup
 */
router.post('/signup', async (req, res) => {
  const { email, password, name, role } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Missing required signup fields' });
  }

  // Ensure role is a valid CRM role
  const selectedRole = ['Admin', 'Executive', 'Sales Manager', 'Employee'].includes(role) ? role : 'Employee';

  try {
    if (isMock) {
      // Check if user exists
      const usersSnap = await db.collection('users').get();
      const userExists = usersSnap.docs.some(doc => doc.data().email === email);
      if (userExists) {
        return res.status(400).json({ error: 'User already exists' });
      }

      const uid = 'user-' + Math.random().toString(36).substring(2, 11);
      const newUser = { uid, email, name, role: selectedRole, password, createdAt: new Date().toISOString() };
      
      // Save to mock database
      await db.collection('users').doc(uid).set(newUser);
      MOCK_PASSWORDS[email] = password; // store temporarily in memory

      const token = generateMockToken(newUser);
      await logActivity(newUser.uid, newUser.name, 'User Signup', `Created user account: ${email}`);
      return res.status(201).json({ token, user: newUser });
    } else {
      // Real Firebase Create User
      const userRecord = await auth.createUser({
        email,
        password,
        displayName: name
      });

      // Set custom user claim for role-based security
      await auth.setCustomUserClaims(userRecord.uid, { role: selectedRole });

      const newUser = {
        uid: userRecord.uid,
        email,
        name,
        role: selectedRole,
        password, // Save password for login verification
        createdAt: new Date().toISOString()
      };

      await db.collection('users').doc(userRecord.uid).set(newUser);
      await logActivity(newUser.uid, newUser.name, 'User Signup', `Created user account: ${email}`);
      return res.status(201).json({ user: newUser });
    }
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  try {
    // 1. LDAP Authentication (if enabled in .env)
    let ldapResult = null;
    if (process.env.LDAP_ENABLED === 'true') {
      try {
        ldapResult = await authenticateLdapUser(email, password);
      } catch (ldapErr) {
        console.error('LDAP auth server error, checking local fallback:', ldapErr.message);
      }
    }

    if (ldapResult && ldapResult.authenticated) {
      const normalizedEmail = email.toLowerCase().trim();
      const usersSnap = await db.collection('users').get();
      let userDoc = usersSnap.docs.find(doc => doc.data().email.toLowerCase() === normalizedEmail);
      let user;

      if (!userDoc) {
        // Automatically provision user record in the SQL Server database upon successful LDAP login
        const uid = 'ldap-' + Math.random().toString(36).substring(2, 11);
        user = {
          uid,
          email: ldapResult.user.email,
          name: ldapResult.user.name,
          role: ldapResult.user.role,
          position: ldapResult.user.position,
          userType: ldapResult.user.role === 'Executive' ? 'CEO' : ldapResult.user.role === 'Admin' ? 'Admin' : 'Employee',
          department: ldapResult.user.department,
          createdAt: new Date().toISOString()
        };
        await db.collection('users').doc(uid).set(user);
        console.log(`👤 Auto-provisioned LDAP user in database: ${email}`);
      } else {
        user = userDoc.data();
      }

      const userResponse = { ...user };
      delete userResponse.password;

      const token = generateMockToken(userResponse);
      await logActivity(userResponse.uid, userResponse.name, 'User Login', `Logged in via LDAP: ${email}`);
      return res.json({ token, user: userResponse });
    }

    // 2. Local/Pre-seeded DB Authentication Fallback
    // Hardcoded Admin Access (works even with real Firebase)
    if (email === 'admin@pulse.com' && password === 'admin123') {
      const adminUser = {
        uid: 'mock-admin-uid',
        email: 'admin@pulse.com',
        role: 'Admin',
        name: 'Admin User',
        userType: 'Admin'
      };
      
      // Ensure this admin exists in Firestore so other queries don't break
      try {
        await db.collection('users').doc(adminUser.uid).set(adminUser, { merge: true });
      } catch (dbErr) {
        console.warn('⚠️ Failed to save hardcoded admin to database:', dbErr.message);
      }
      
      const token = generateMockToken(adminUser);
      await logActivity(adminUser.uid, adminUser.name, 'User Login', `Logged in via hardcoded admin: ${email}`);
      return res.json({ token, user: adminUser });
    }

    // Hardcoded Heads Access (works even with real Firebase)
    const normalizedEmail = email.toLowerCase().trim();
    if (HARDCODED_HEADS[normalizedEmail]) {
      const headUser = HARDCODED_HEADS[normalizedEmail];
      if (headUser.password === password) {
        const userProfile = { ...headUser };
        delete userProfile.password;

        // Ensure this user exists in Firestore
        try {
          await db.collection('users').doc(userProfile.uid).set(userProfile, { merge: true });
        } catch (dbErr) {
          console.warn(`⚠️ Failed to save hardcoded head ${userProfile.email} to database:`, dbErr.message);
        }

        const token = generateMockToken(userProfile);
        await logActivity(userProfile.uid, userProfile.name, 'User Login', `Logged in via functional head credentials: ${email}`);
        return res.json({ token, user: userProfile });
      } else {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
    }

    // Fetch user profile from database
    const usersSnap = await db.collection('users').get();
    const userDoc = usersSnap.docs.find(doc => doc.data().email.toLowerCase() === email.toLowerCase().trim());
    if (!userDoc) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const user = userDoc.data();
    
    // Validate password
    let expectedPassword = user.password;
    if (isMock) {
      expectedPassword = MOCK_PASSWORDS[email] || user.password;
    }
    
    if (!expectedPassword || expectedPassword !== password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Prepare response, stripping password
    const userResponse = { ...user };
    delete userResponse.password;

    const token = generateMockToken(userResponse);
    await logActivity(userResponse.uid, userResponse.name, 'User Login', `Logged in via database credentials: ${email}`);
    return res.json({ token, user: userResponse });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/microsoft-login
 * Mock Microsoft SSO auth endpoint
 */
router.post('/microsoft-login', async (req, res) => {
  const { microsoftToken, email, name } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'Missing required Microsoft details' });
  }

  try {
    // Look up user by email
    const usersSnap = await db.collection('users').get();
    let userDoc = usersSnap.docs.find(doc => doc.data().email === email);
    let user;

    if (!userDoc) {
      // Create user if they don't exist
      const uid = 'ms-' + Math.random().toString(36).substring(2, 11);
      // Microsoft domains usually map to Executive or Sales Manager or standard Employee
      let role = 'Employee';
      if (email.endsWith('@pulseexecutive.com')) role = 'Executive';
      else if (email.endsWith('@pulsesales.com')) role = 'Sales Manager';

      user = { uid, email, name, role, createdAt: new Date().toISOString() };
      await db.collection('users').doc(uid).set(user);
    } else {
      user = userDoc.data();
    }

    const token = generateMockToken(user);
    await logActivity(user.uid, user.name, 'User Login', `Logged in via Microsoft SSO: ${email}`);
    return res.json({ token, user });
  } catch (error) {
    console.error('Microsoft login error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auth/staff
 * Returns basic staff directory for all authenticated users (used for internal mentions/action tracking).
 */
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';
router.get('/staff', authenticateToken, async (req, res) => {
  try {
    const usersSnap = await db.collection('users').get();
    const staff = usersSnap.docs.map(doc => {
      const u = doc.data();
      return {
        uid: u.uid,
        name: u.name,
        email: u.email,
        role: u.role,
        position: u.position || '',
        department: u.department || ''
      };
    });
    return res.json(staff);
  } catch (error) {
    console.error('Error fetching staff directory:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/auth/users
 * Retrieves list of registered users. Restricted to Admin only.
 */
router.get('/users', authenticateToken, requireRole(['Admin', 'Executive']), async (req, res) => {
  try {
    const usersSnap = await db.collection('users').get();
    const users = usersSnap.docs.map(doc => {
      const u = doc.data();
      return {
        uid: u.uid,
        email: u.email,
        name: u.name,
        role: u.role,
        position: u.position || '',
        userType: u.userType || '',
        department: u.department || '',
        reportingTo: u.reportingTo || '',
        bu: u.bu || '',
        project: u.project || '',
        projects: u.projects || [],
        projectManagers: u.projectManagers || [],
        employees: u.employees || [],
        createdAt: u.createdAt || new Date().toISOString()
      };
    });
    return res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/auth/users
 * Creates a new user record. Restricted to Admin only.
 */
router.post('/users', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const { 
    email, 
    password, 
    name, 
    role, 
    position, 
    userType,
    department,
    reportingTo,
    projects,
    projectManagers,
    employees,
    bu,
    project
  } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Missing email, password, or name' });
  }

  // Determine user permission role based on User Type if role is not passed
  let selectedRole = role;
  if (!selectedRole && userType) {
    if (['CEO', 'Functional Head'].includes(userType)) selectedRole = 'Executive';
    else if (['BU Head', 'Delivery Head', 'Delivery Manager', 'Sales Manager', 'Account Manager', 'Project Manager'].includes(userType)) selectedRole = 'Sales Manager';
    else if (userType === 'Admin') selectedRole = 'Admin';
    else selectedRole = 'Employee';
  }
  if (!selectedRole) {
    selectedRole = 'Employee';
  }

  try {
    if (isMock) {
      const usersSnap = await db.collection('users').get();
      const userExists = usersSnap.docs.some(doc => doc.data().email === email);
      if (userExists) {
        // Overwrite/update details & password
        const existingDoc = usersSnap.docs.find(doc => doc.data().email === email);
        const uid = existingDoc.id;
        const updatedUser = {
          ...existingDoc.data(),
          name,
          role: selectedRole,
          position: position || '',
          userType: userType || 'Employee',
          department: department || '',
          reportingTo: reportingTo || '',
          projects: projects || [],
          projectManagers: projectManagers || [],
          employees: employees || [],
          bu: bu || '',
          project: project || '',
          password
        };
        await db.collection('users').doc(uid).set(updatedUser);
        MOCK_PASSWORDS[email] = password;
        await logActivity(req.user.uid, req.user.name, 'Update User', `Admin updated user profile: ${email}`);
        return res.status(200).json(updatedUser);
      }

      const uid = 'user-' + Math.random().toString(36).substring(2, 11);
      const newUser = { 
        uid, 
        email, 
        name, 
        role: selectedRole, 
        position: position || '', 
        userType: userType || 'Employee', 
        department: department || '',
        reportingTo: reportingTo || '',
        projects: projects || [],
        projectManagers: projectManagers || [],
        employees: employees || [],
        bu: bu || '',
        project: project || '',
        password,
        createdAt: new Date().toISOString() 
      };
      
      await db.collection('users').doc(uid).set(newUser);
      MOCK_PASSWORDS[email] = password;
      await logActivity(req.user.uid, req.user.name, 'Create User', `Admin created user profile: ${email}`);

      return res.status(201).json(newUser);
    } else {
      let userRecord;
      try {
        userRecord = await auth.createUser({
          email,
          password,
          displayName: name
        });
      } catch (err) {
        if (err.code === 'auth/email-already-exists') {
          userRecord = await auth.getUserByEmail(email);
          await auth.updateUser(userRecord.uid, { password, displayName: name });
        } else {
          throw err;
        }
      }

      await auth.setCustomUserClaims(userRecord.uid, { role: selectedRole });

      const newUser = {
        uid: userRecord.uid,
        email,
        name,
        role: selectedRole,
        position: position || '',
        userType: userType || 'Employee',
        department: department || '',
        reportingTo: reportingTo || '',
        projects: projects || [],
        projectManagers: projectManagers || [],
        employees: employees || [],
        bu: bu || '',
        project: project || '',
        password,
        createdAt: new Date().toISOString()
      };

      await db.collection('users').doc(userRecord.uid).set(newUser, { merge: true });
      await logActivity(req.user.uid, req.user.name, 'Create/Update User', `Admin created/updated user profile: ${email}`);
      return res.status(201).json(newUser);
    }
  } catch (error) {
    console.error('Admin create user error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/auth/users/:uid
 * Deletes a user record. Restricted to Admin only.
 */
router.delete('/users/:uid', authenticateToken, requireRole(['Admin']), async (req, res) => {
  const { uid } = req.params;

  try {
    if (isMock) {
      // Find the user first to make sure they exist
      const userDocSnap = await db.collection('users').doc(uid).get();
      if (!userDocSnap.exists) {
        return res.status(404).json({ error: 'User not found' });
      }

      const userData = userDocSnap.data();
      
      // Delete user document
      await db.collection('users').doc(uid).delete();
      
      // Remove mock password from temporary mapping
      if (userData && userData.email && MOCK_PASSWORDS[userData.email]) {
        delete MOCK_PASSWORDS[userData.email];
      }

      await logActivity(req.user.uid, req.user.name, 'Delete User', `Admin deleted user profile: ${userData.email} (UID: ${uid})`);
      return res.json({ success: true, message: `User ${uid} deleted successfully (mock)` });
    } else {
      // Real Firebase Delete User from Auth + Firestore
      const userDocSnap = await db.collection('users').doc(uid).get();
      const userData = userDocSnap.exists ? userDocSnap.data() : null;
      const userEmail = userData ? userData.email : 'Unknown';

      await auth.deleteUser(uid);
      await db.collection('users').doc(uid).delete();
      await logActivity(req.user.uid, req.user.name, 'Delete User', `Admin deleted user profile: ${userEmail} (UID: ${uid})`);
      return res.json({ success: true, message: `User ${uid} deleted successfully` });
    }
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
