import jwt from 'jsonwebtoken';
import { PERMISSIONS } from '../config/rbac.js';

const JWT_SECRET = process.env.JWT_SECRET || 'customer-pulse-super-secret-key';

/**
 * Authentication middleware.
 * Verifies the JWT Bearer token attached to the Authorization header.
 * Returns 401 when no token or invalid/expired token so the frontend
 * can intercept and redirect to login automatically.
 */
export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid token — please log in again' });
  }
}

/**
 * Role guard — restricts access to routes based on allowed roles.
 * Pass an array of role strings (from ROLES constants in rbac.js).
 *
 * Example:
 *   router.delete('/users/:uid', authenticateToken, requireRole(['Admin']), handler);
 *
 * @param {string[]} allowedRoles - Array of allowed role strings
 */
export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User is not authenticated' });
    }
    if (req.user.role === 'Admin' || allowedRoles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({
      error: `Forbidden: requires one of [${allowedRoles.join(', ')}]. Your role: ${req.user.role}`
    });
  };
}

/**
 * Permission guard — restricts access using semantic PERMISSIONS keys from rbac.js.
 * This is the preferred guard for new routes as it decouples route code from role strings.
 *
 * Example:
 *   import { PERMISSIONS } from '../config/rbac.js';
 *   router.get('/reports', authenticateToken, requirePermission(PERMISSIONS.VIEW_REPORTS), handler);
 *
 * @param {string[]} allowedRoles - The roles array from a PERMISSIONS entry
 */
export function requirePermission(allowedRoles) {
  return requireRole(allowedRoles);
}

/**
 * Verifies Admin privilege against the live DB Users profile (in addition to JWT).
 */
export async function requireDbAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'User is not authenticated' });
  }
  try {
    const { db } = await import('../config/database.js');
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : null;
    const isAdmin =
      (userProfile && (userProfile.role === 'Admin' || userProfile.userType === 'Admin')) ||
      (!userProfile && (req.user.role === 'Admin' || req.user.userType === 'Admin'));

    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Administrator authorization is required.' });
    }
    req.userProfile = userProfile;
    return next();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify administrator permissions.' });
  }
}

/**
 * Resolves the set of accountIds a user may view under CRM RBAC rules
 * (Admin and CEO see all; other roles see owned accounts and stakeholder accounts).
 */
export async function getPermittedAccountIdsForUser(user) {
  const { db } = await import('../config/database.js');
  const userDoc = await db.collection('users').doc(user.uid).get();
  const userProfile = userDoc.exists ? userDoc.data() : null;

  const isTrueAdmin =
    (userProfile && (userProfile.userType === 'Admin' || userProfile.role === 'Admin')) ||
    (!userProfile && (user.role === 'Admin' || user.userType === 'Admin'));
  const isCeo =
    (userProfile && (userProfile.userType === 'CEO' || userProfile.position === 'CEO' || userProfile.position === 'Chief Executive Officer')) ||
    (!userProfile && (user.userType === 'CEO' || user.position === 'CEO'));

  if (isTrueAdmin || isCeo) {
    return { unrestricted: true, accountIds: null };
  }

  const userEmail = user.email?.toLowerCase();
  const userName = user.name?.toLowerCase();
  const isMatch = (entity) => {
    if (entity.ownerId === user.uid || entity.assignedTo === user.uid || entity.userId === user.uid) return true;
    if (userEmail && (entity.ownerEmail?.toLowerCase() === userEmail || entity.assignedToEmail?.toLowerCase() === userEmail || entity.email?.toLowerCase() === userEmail)) return true;
    if (userName && (entity.ownerName?.toLowerCase().includes(userName.split(' ')[0]) || entity.assignedToName?.toLowerCase().includes(userName.split(' ')[0]))) return true;
    return false;
  };

  const [accountsSnap, contactsSnap] = await Promise.all([
    db.collection('accounts').get(),
    db.collection('contacts').get(),
  ]);

  const ownedAccountIds = new Set(
    accountsSnap.docs.map(d => d.data()).filter(a => isMatch(a)).map(a => a.accountId || a.id)
  );
  const stakeholderAccountIds = new Set(
    contactsSnap.docs.map(d => d.data()).filter(c => isMatch(c)).map(c => c.accountId).filter(Boolean)
  );

  return {
    unrestricted: false,
    accountIds: new Set([...ownedAccountIds, ...stakeholderAccountIds]),
  };
}

/**
 * Verifies whether req.user has RBAC read access to the specified accountId.
 */
export async function canUserAccessAccount(user, accountId) {
  if (!user || !accountId) return false;
  const { unrestricted, accountIds } = await getPermittedAccountIdsForUser(user);
  if (unrestricted) return true;
  return accountIds.has(accountId);
}
