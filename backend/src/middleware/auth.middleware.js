import { auth, isMock } from '../config/database.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'customer-pulse-super-secret-key';

/**
 * Authentication middleware.
 * Verifies JWT token or Firebase ID Token and appends user info to request.
 */
export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // 1. First attempt to decode as our custom JWT (for the hardcoded admin or mock mode)
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (jwtErr) {
      // If JWT fails and we are in mock mode, it could be a raw mock-admin-token string
      if (isMock) {
        if (token === 'mock-admin-token') {
          req.user = { uid: 'mock-admin-uid', email: 'admin@pulse.com', role: 'Admin', name: 'Admin User' };
          return next();
        }
        return res.status(403).json({ error: 'Invalid or expired mock token' });
      }
      
      // 2. If JWT fails and we are in real Firebase mode, verify as Firebase ID Token
      const decodedToken = await auth.verifyIdToken(token);
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: decodedToken.role || 'Employee', // fallback role
        name: decodedToken.name || decodedToken.email
      };
      return next();
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(403).json({ error: 'Invalid or expired credentials' });
  }
}

/**
 * Role authorization helper.
 * Restricts access to specific roles.
 */
export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User is not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: Access restricted to roles: [${allowedRoles.join(', ')}]` });
    }

    next();
  };
}
