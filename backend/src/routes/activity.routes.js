import { Router } from 'express';
import { db } from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Require authentication for all activity log operations
router.use(authenticateToken);

/**
 * GET /api/activity-logs
 * Retrieves all activity log entries, sorted by timestamp descending.
 * Access is restricted to Admin and Executive roles to protect audit/security trails.
 */
router.get('/', requireRole(['Admin', 'Executive']), async (req, res) => {
  try {
    const snapshot = await db.collection('activitylogs').get();
    const logs = snapshot.docs.map(doc => doc.data());
    
    // Sort descending by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return res.json(logs);
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
