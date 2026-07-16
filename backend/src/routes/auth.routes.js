import { Router } from 'express';
import { db, isMock, logActivity } from '../config/database.js';
import { PERMISSIONS, ROLES, userTypeToRole } from '../config/rbac.js';
import { authenticateToken, requirePermission } from '../middleware/auth.middleware.js';
import { authenticateLdapUser } from '../services/ldap.service.js';
import { ensureNestGroupEmployees } from '../services/nestgroup.seed.js';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'customer-pulse-super-secret-key';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

/** Issues a signed JWT valid for 24 hours */
function issueToken(user) {
  return jwt.sign(
    { 
      uid: user.uid, 
      email: user.email, 
      role: user.role, 
      name: user.name, 
      userType: user.userType || user.position || user.role 
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/** Strips sensitive fields before sending to the client */
function sanitizeUser(user) {
  const safe = { ...user };
  delete safe.password;
  return safe;
}

/** Looks up a user by email across the Users collection */
async function findUserByEmail(email) {
  const snap = await db.collection('users').get();
  const doc = snap.docs.find(d => d.data().email?.toLowerCase() === email.toLowerCase().trim());
  return doc ? doc.data() : null;
}

/** Updates the last_login timestamp for a user record */
async function touchLastLogin(uid) {
  try {
    await db.collection('users').doc(uid).update({ last_login: new Date().toISOString() });
  } catch (_) {
    // Non-fatal — do not block login if this fails
  }
}

// ─────────────────────────────────────────────────────────
// POST /api/auth/login
// Tries LDAP first (if enabled), falls back to local DB auth.
// ─────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // ── 1. LDAP Authentication (Nest Digital Active Directory) ─────────────
    if (process.env.LDAP_ENABLED && process.env.LDAP_ENABLED !== 'false') {
      let ldapResult = null;
      try {
        ldapResult = await authenticateLdapUser(email, password);
      } catch (ldapErr) {
        console.error('LDAP error, falling back to local auth:', ldapErr.message);
      }

      if (ldapResult?.authenticated) {
        // Find or auto-provision user record in PostgreSQL
        let user = await findUserByEmail(ldapResult.user.email);

        if (!user) {
          // Auto-provision: new LDAP user gets a DB record on first login
          const uid = 'ldap-' + Math.random().toString(36).substring(2, 11);
          user = {
            uid,
            email:            ldapResult.user.email,
            name:             ldapResult.user.name,
            role:             ldapResult.user.role,
            position:         ldapResult.user.position || 'Nest Digital Professional',
            userType:         ldapResult.user.role === ROLES.EXECUTIVE ? 'Functional Head'
                            : ldapResult.user.role === ROLES.ADMIN     ? 'Admin'
                            : ldapResult.user.role === ROLES.MANAGER   ? 'BU Head'
                            : 'Employee',
            department:       ldapResult.user.department || 'Corporate',
            ldap_provisioned: true,
            createdAt:        new Date().toISOString()
          };
          await db.collection('users').doc(uid).set(user);
          console.log(`👤 Auto-provisioned LDAP user in PostgreSQL: ${user.email} (role: ${user.role})`);
        }

        await touchLastLogin(user.uid);
        const enrichedUser = { ...user, userType: user.userType || user.position || user.role };
        const token = issueToken(enrichedUser);
        await logActivity(user.uid, user.name, 'User Login', `LDAP login: ${user.email}`);
        return res.json({ token, user: sanitizeUser(enrichedUser) });
      }
      // LDAP returned unauthenticated → fall through to local DB auth
    }

    // ── 2. Local PostgreSQL Authentication ─────────────────────────────────
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.password || user.password !== password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const enrichedUser = { ...user, userType: user.userType || user.position || user.role };
    await touchLastLogin(user.uid);
    const token = issueToken(enrichedUser);
    await logActivity(user.uid, user.name, 'User Login', `Local DB login: ${email}`);
    return res.json({ token, user: sanitizeUser(enrichedUser) });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/signup
// Creates a new local user (Admin-invited or self-service).
// LDAP users are provisioned automatically on first login.
// ─────────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { email, password, name, role } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password, and name are required' });
  }

  const selectedRole = Object.values(ROLES).includes(role) ? role : ROLES.EMPLOYEE;

  try {
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    const uid = 'user-' + Math.random().toString(36).substring(2, 11);
    const newUser = {
      uid, email, name,
      role: selectedRole,
      password,
      ldap_provisioned: false,
      createdAt: new Date().toISOString()
    };

    await db.collection('users').doc(uid).set(newUser);
    const enrichedUser = { ...newUser, userType: newUser.userType || newUser.position || newUser.role };
    const token = issueToken(enrichedUser);
    await logActivity(uid, name, 'User Signup', `Self-service signup: ${email}`);
    return res.status(201).json({ token, user: sanitizeUser(enrichedUser) });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/auth/me
// Returns the currently authenticated user's full profile.
// ─────────────────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const snap = await db.collection('users').doc(req.user.uid).get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'User profile not found' });
    }
    const userData = snap.data();
    const enrichedUser = { ...userData, userType: userData.userType || userData.position || userData.role };
    return res.json(sanitizeUser(enrichedUser));
  } catch (error) {
    console.error('GET /me error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/refresh
// Refreshes a valid JWT, extending its expiry by 24 hours.
// ─────────────────────────────────────────────────────────
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const token = issueToken(req.user);
    return res.json({ token });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/microsoft-login
// Microsoft SSO entry point (mock — for demo/UI testing).
// ─────────────────────────────────────────────────────────
router.post('/microsoft-login', async (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: 'email and name are required' });
  }

  try {
    let user = await findUserByEmail(email);
    if (!user) {
      let role = ROLES.EMPLOYEE;
      if (email.endsWith('@pulseexecutive.com')) role = ROLES.EXECUTIVE;
      else if (email.endsWith('@pulsesales.com'))  role = ROLES.MANAGER;

      const uid = 'ms-' + Math.random().toString(36).substring(2, 11);
      user = { uid, email, name, role, ldap_provisioned: false, createdAt: new Date().toISOString() };
      await db.collection('users').doc(uid).set(user);
    }

    const enrichedUser = { ...user, userType: user.userType || user.position || user.role };
    await touchLastLogin(user.uid);
    const token = issueToken(enrichedUser);
    await logActivity(user.uid, user.name, 'User Login', `Microsoft SSO login: ${email}`);
    return res.json({ token, user: sanitizeUser(enrichedUser) });
  } catch (error) {
    console.error('Microsoft login error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/auth/staff
// Staff directory — all authenticated users can access (for @mentions).
// ─────────────────────────────────────────────────────────
router.get('/staff', authenticateToken, requirePermission(PERMISSIONS.VIEW_STAFF_DIRECTORY), async (req, res) => {
  try {
    await ensureNestGroupEmployees(db);
    const snap = await db.collection('users').get();
    const staff = snap.docs.map(doc => {
      const u = doc.data();
      return {
        ...u,
        uid:                  u.uid,
        name:                 u.name,
        email:                u.email,
        role:                 u.role,
        position:             u.position             || '',
        userType:             u.userType             || '',
        department:           u.department           || '',
        reportingTo:          u.reportingTo          || '',
        reportingManagerName: u.reportingManagerName || '',
        bu:                   u.bu                   || '',
        buHeadName:           u.buHeadName           || '',
        buHeadEmail:          u.buHeadEmail          || '',
        phone:                u.phone                || '',
        employeeId:           u.employeeId           || '',
        jobRole:              u.jobRole              || '',
        project:              u.project              || '',
        projects:             u.projects             || [],
        employees:            u.employees            || []
      };
    });
    return res.json(staff);
  } catch (error) {
    console.error('GET /staff error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/auth/users
// Full user list — Admin and Executive only.
// ─────────────────────────────────────────────────────────
router.get('/users', authenticateToken, requirePermission(PERMISSIONS.VIEW_ALL_USERS), async (req, res) => {
  try {
    await ensureNestGroupEmployees(db);
    const snap = await db.collection('users').get();
    const users = snap.docs.map(doc => {
      const u = doc.data();
      return {
        ...u,
        uid:                  u.uid,
        email:                u.email,
        name:                 u.name,
        role:                 u.role,
        position:             u.position             || '',
        userType:             u.userType             || '',
        department:           u.department           || '',
        reportingTo:          u.reportingTo          || '',
        reportingManagerName: u.reportingManagerName || '',
        bu:                   u.bu                   || '',
        buHeadName:           u.buHeadName           || '',
        buHeadEmail:          u.buHeadEmail          || '',
        phone:                u.phone                || '',
        employeeId:           u.employeeId           || '',
        jobRole:              u.jobRole              || '',
        project:              u.project              || '',
        projects:             u.projects             || [],
        employees:            u.employees            || [],
        ldap_provisioned:     u.ldap_provisioned     || false,
        last_login:           u.last_login           || null,
        createdAt:            u.createdAt            || new Date().toISOString()
      };
    });
    return res.json(users);
  } catch (error) {
    console.error('GET /users error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/users
// Create or update a user record — Admin only.
// ─────────────────────────────────────────────────────────
router.post('/users', authenticateToken, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
  const {
    email, password, name, role, position, userType,
    department, reportingTo, projects, employees, bu, project
  } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'email and name are required' });
  }

  // Derive CRM role from userType if explicit role not provided
  const selectedRole = role && Object.values(ROLES).includes(role)
    ? role
    : userTypeToRole(userType);

  try {
    const existing = await findUserByEmail(email);

    if (existing) {
      // Update existing user
      const updated = {
        ...existing,
        name, role: selectedRole,
        position:   position   || existing.position   || '',
        userType:   userType   || existing.userType   || 'Employee',
        department: department || existing.department || '',
        reportingTo:reportingTo|| existing.reportingTo|| '',
        projects:   projects   || existing.projects   || [],
        employees:  employees  || existing.employees  || [],
        bu:         bu         || existing.bu         || '',
        project:    project    || existing.project    || '',
        ...(password && { password })
      };
      await db.collection('users').doc(existing.uid).set(updated);
      await logActivity(req.user.uid, req.user.name, 'Update User', `Updated user: ${email}`);
      return res.status(200).json(sanitizeUser(updated));
    }

    // Create new user
    if (!password) {
      return res.status(400).json({ error: 'password is required when creating a new user' });
    }

    const uid = 'user-' + Math.random().toString(36).substring(2, 11);
    const newUser = {
      uid, email, name,
      role:             selectedRole,
      position:         position    || '',
      userType:         userType    || 'Employee',
      department:       department  || '',
      reportingTo:      reportingTo || '',
      projects:         projects    || [],
      employees:        employees   || [],
      bu:               bu          || '',
      project:          project     || '',
      password,
      ldap_provisioned: false,
      createdAt:        new Date().toISOString()
    };

    await db.collection('users').doc(uid).set(newUser);
    await logActivity(req.user.uid, req.user.name, 'Create User', `Created user: ${email} (role: ${selectedRole})`);
    return res.status(201).json(sanitizeUser(newUser));

  } catch (error) {
    console.error('POST /users error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// DELETE /api/auth/users/:uid
// Removes a user record — Admin only.
// ─────────────────────────────────────────────────────────
router.delete('/users/:uid', authenticateToken, requirePermission(PERMISSIONS.DELETE_USER), async (req, res) => {
  const { uid } = req.params;

  if (uid === req.user.uid) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  try {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = snap.data();
    await db.collection('users').doc(uid).delete();
    await logActivity(req.user.uid, req.user.name, 'Delete User', `Deleted user: ${userData.email} (UID: ${uid})`);
    return res.json({ success: true, message: `User ${uid} deleted` });

  } catch (error) {
    console.error('DELETE /users/:uid error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
