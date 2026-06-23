import { Router } from 'express';
import { db } from '../config/database.js';
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

    // Get user profile for true role check
    const userDoc = await db.collection('users').doc(uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : null;

    const isTrueAdmin = userProfile && (userProfile.userType === 'Admin' || userProfile.role === 'Admin');
    const isCeo = userProfile && (userProfile.userType === 'CEO' || userProfile.position === 'CEO' || userProfile.position === 'Chief Executive Officer');

    if (!isTrueAdmin && !isCeo) {
      // Get all accounts this user has ownership/contact-ownership of
      const accountsSnap = await db.collection('accounts').get();
      const accounts = accountsSnap.docs.map(doc => doc.data());

      const ownedAccountIds = new Set(
        accounts
          .filter(a => a.ownerId === uid)
          .map(a => a.accountId || a.id)
      );

      const contactsSnap = await db.collection('contacts').get();
      const stakeholderAccountIds = new Set(
        contactsSnap.docs
          .map(d => d.data())
          .filter(c => c.ownerId === uid)
          .map(c => c.accountId)
      );

      const allowedIds = new Set([...ownedAccountIds, ...stakeholderAccountIds]);

      // Filter:
      // 1. toUserId must match uid (if toUserId is set)
      // 2. accountId must be in allowedIds (if accountId is set)
      notifications = notifications.filter(n => {
        const isToMe = !n.toUserId || n.toUserId === uid;
        const isAllowedAcc = !n.accountId || allowedIds.has(n.accountId);
        return isToMe && isAllowedAcc;
      });
    } else {
      // For Admin or CEO:
      // Just filter by toUserId (if toUserId is set, it must be for them)
      notifications = notifications.filter(n =>
        !n.toUserId || n.toUserId === uid
      );
    }

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

    // Get user profile for true role check
    const userDoc = await db.collection('users').doc(uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : null;

    const isTrueAdmin = userProfile && (userProfile.userType === 'Admin' || userProfile.role === 'Admin');
    const isCeo = userProfile && (userProfile.userType === 'CEO' || userProfile.position === 'CEO' || userProfile.position === 'Chief Executive Officer');

    let allowedIds = null;
    if (!isTrueAdmin && !isCeo) {
      const accountsSnap = await db.collection('accounts').get();
      const accounts = accountsSnap.docs.map(doc => doc.data());

      const ownedAccountIds = new Set(
        accounts
          .filter(a => a.ownerId === uid)
          .map(a => a.accountId || a.id)
      );

      const contactsSnap = await db.collection('contacts').get();
      const stakeholderAccountIds = new Set(
        contactsSnap.docs
          .map(d => d.data())
          .filter(c => c.ownerId === uid)
          .map(c => c.accountId)
      );

      allowedIds = new Set([...ownedAccountIds, ...stakeholderAccountIds]);
    }

    const batchPromises = snapshot.docs
      .filter(doc => {
        const n = doc.data();
        if (n.read) return false;
        
        const isToMe = !n.toUserId || n.toUserId === uid;
        const isAllowedAcc = !allowedIds || !n.accountId || allowedIds.has(n.accountId);
        return isToMe && isAllowedAcc;
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
