import { Router } from 'express';
import { db, auth, isMock } from '../config/firebase.js';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'customer-pulse-super-secret-key';

// Mock password map for local database simplicity
const MOCK_PASSWORDS = {
  'admin@pulse.com': 'admin123',
  'executive@pulse.com': 'exec123',
  'manager@pulse.com': 'manager123',
  'employee@pulse.com': 'employee123'
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
      const newUser = { uid, email, name, role: selectedRole, createdAt: new Date().toISOString() };
      
      // Save to mock database
      await db.collection('users').doc(uid).set(newUser);
      MOCK_PASSWORDS[email] = password; // store temporarily in memory

      const token = generateMockToken(newUser);
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
        createdAt: new Date().toISOString()
      };

      await db.collection('users').doc(userRecord.uid).set(newUser);
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
    // Hardcoded Admin Access (works even with real Firebase)
    if (email === 'admin@pulse.com' && password === 'admin123') {
      const adminUser = {
        uid: 'hardcoded-admin-uid',
        email: 'admin@pulse.com',
        role: 'Admin',
        name: 'System Admin',
        userType: 'Admin'
      };
      
      // Ensure this admin exists in Firestore so other queries don't break
      await db.collection('users').doc(adminUser.uid).set(adminUser, { merge: true });
      
      const token = generateMockToken(adminUser);
      return res.json({ token, user: adminUser });
    }

    if (isMock) {
      // Validate with mock password db
      const expectedPassword = MOCK_PASSWORDS[email];
      if (!expectedPassword || expectedPassword !== password) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Fetch user profile from database
      const usersSnap = await db.collection('users').get();
      const userDoc = usersSnap.docs.find(doc => doc.data().email === email);
      if (!userDoc) {
        return res.status(404).json({ error: 'User profile not found' });
      }

      const user = userDoc.data();
      const token = generateMockToken(user);
      return res.json({ token, user });
    } else {
      // In real firebase, auth login is handled client-side. The client sends token to backend.
      // This endpoint behaves as ID token verification and database check.
      return res.status(400).json({ error: 'Firebase authentication is performed directly via client SDK. Use the hardcoded admin credentials for now.' });
    }
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
router.get('/users', authenticateToken, requireRole(['Admin']), async (req, res) => {
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
    if (userType === 'CEO') selectedRole = 'Executive';
    else if (userType === 'BU Head') selectedRole = 'Sales Manager';
    else if (userType === 'Project Manager') selectedRole = 'Sales Manager';
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
        return res.status(400).json({ error: 'User already exists' });
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
        createdAt: new Date().toISOString() 
      };
      
      await db.collection('users').doc(uid).set(newUser);
      MOCK_PASSWORDS[email] = password;

      return res.status(201).json(newUser);
    } else {
      const userRecord = await auth.createUser({
        email,
        password,
        displayName: name
      });

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
        createdAt: new Date().toISOString()
      };

      await db.collection('users').doc(userRecord.uid).set(newUser);
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

      return res.json({ success: true, message: `User ${uid} deleted successfully (mock)` });
    } else {
      // Real Firebase Delete User from Auth + Firestore
      await auth.deleteUser(uid);
      await db.collection('users').doc(uid).delete();
      return res.json({ success: true, message: `User ${uid} deleted successfully` });
    }
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
