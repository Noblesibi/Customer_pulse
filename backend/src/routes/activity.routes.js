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
router.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('activitylogs').get();
    let logs = snapshot.docs.map(doc => doc.data());
    
    // Sort descending by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Filter by User Profile permissions / assigned projects (Secure-by-default)
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : null;

    const isTrueAdmin = userProfile && (userProfile.userType === 'Admin' || userProfile.role === 'Admin');
    const isCeo = userProfile && (userProfile.userType === 'CEO' || userProfile.position === 'CEO' || userProfile.position === 'Chief Executive Officer');

    if (!isTrueAdmin && !isCeo) {
      const currentUserName = (req.user.name || userProfile?.name || '').toLowerCase();
      logs = logs.filter(log => {
        if (!log.details) return false;
        const match = log.details.match(/\(Assigned to: ([^\)]+)\)$/);
        const assignee = match ? match[1] : null;
        if (!assignee) return false;
        const assigneeNames = assignee.split(',').map(name => name.trim().toLowerCase());
        return assigneeNames.includes(currentUserName);
      });
    }
    
    return res.json(logs);
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
