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
