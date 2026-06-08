import { Router } from 'express';
import { db } from '../config/firebase.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticateToken);

/**
 * GET /api/notifications
 */
router.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('notifications').get();
    const notifications = snapshot.docs.map(doc => doc.data());

    // Sort descending by timestamp
    notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit to latest 50 notifications
    return res.json(notifications.slice(0, 50));
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/notifications/:id/read
 */
router.put('/:id/read', async (req, res) => {
  const { id } = req.params;
  try {
    const docRef = db.collection('notifications').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await docRef.update({ read: true });
    
    const updated = await docRef.get();
    return res.json(updated.data());
  } catch (error) {
    console.error('Error updating notification read state:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/notifications/read-all
 */
router.put('/read-all', async (req, res) => {
  try {
    const snapshot = await db.collection('notifications').get();
    const batchPromises = snapshot.docs.map(doc => {
      if (!doc.data().read) {
        return doc.ref.update({ read: true });
      }
      return null;
    }).filter(Boolean);

    await Promise.all(batchPromises);
    return res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
