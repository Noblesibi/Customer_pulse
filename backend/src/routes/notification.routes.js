import { Router } from 'express';
import { db } from '../config/firebase.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticateToken);

/**
 * GET /api/notifications
 * Returns notifications relevant to the current user:
 * - System-wide notifications (no toUserId) for all users
 * - Personal task notifications (toUserId === current user's uid)
 */
router.get('/', async (req, res) => {
  try {
    const uid = req.user.uid;
    const snapshot = await db.collection('notifications').get();
    let notifications = snapshot.docs.map(doc => doc.data());

    // Filter: show system-wide (no toUserId) OR personal (toUserId matches)
    notifications = notifications.filter(n =>
      !n.toUserId || n.toUserId === uid
    );

    // Sort descending by timestamp
    notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit to latest 50
    return res.json(notifications.slice(0, 50));
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Marks a single notification as read and records readAt timestamp.
 */
router.put('/:id/read', async (req, res) => {
  const { id } = req.params;
  try {
    const docRef = db.collection('notifications').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await docRef.update({
      read: true,
      readAt: new Date().toISOString()
    });

    const updated = await docRef.get();
    return res.json(updated.data());
  } catch (error) {
    console.error('Error updating notification read state:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/notifications/read-all
 * Marks all of the current user's notifications as read.
 */
router.put('/read-all', async (req, res) => {
  try {
    const uid = req.user.uid;
    const snapshot = await db.collection('notifications').get();

    const batchPromises = snapshot.docs
      .filter(doc => {
        const n = doc.data();
        return !n.read && (!n.toUserId || n.toUserId === uid);
      })
      .map(doc => doc.ref.update({ read: true, readAt: new Date().toISOString() }));

    await Promise.all(batchPromises);
    return res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
