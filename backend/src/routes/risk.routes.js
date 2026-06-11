import { Router } from 'express';
import { db } from '../config/firebase.js';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';
import { calculateAccountHealth } from '../services/health.service.js';

const router = Router();

router.use(authenticateToken);

/**
 * GET /api/risks
 * Fetch active/resolved risks. Supports accountId filter and severity filters.
 */
router.get('/', async (req, res) => {
  try {
    const { accountId, severity, status } = req.query;
    
    let snapshot;
    if (accountId) {
      snapshot = await db.collection('risks').where('accountId', '==', accountId).get();
    } else {
      snapshot = await db.collection('risks').get();
    }

    let risks = snapshot.docs.map(doc => doc.data());

    // Filter by User Profile permissions / assigned projects (Secure-by-default)
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : null;

    const isAdmin = req.user.role === 'Admin' || (userProfile && (userProfile.userType === 'Admin' || userProfile.role === 'Admin'));
    const isCeo = userProfile && userProfile.userType === 'CEO';

    if (!isAdmin && !isCeo) {
      const accountsSnap = await db.collection('accounts').get();
      let accounts = accountsSnap.docs.map(doc => doc.data());

      if (userProfile && userProfile.userType === 'BU Head') {
        const targetBu = userProfile.bu || '';
        const targetProjects = userProfile.projects || [];
        accounts = accounts.filter(a => 
          (targetBu && a.industry.toLowerCase() === targetBu.toLowerCase()) || 
          (targetProjects.length > 0 && targetProjects.some(tp => {
            const tpName = typeof tp === 'string' ? tp : tp.name;
            return tpName && (a.companyName.toLowerCase().includes(tpName.toLowerCase()) || tpName.toLowerCase().includes(a.companyName.toLowerCase()));
          }))
        );
      } else {
        // Fallback filter for Functional Heads, Project Managers, Delivery Heads, Employees, etc.
        const projectsList = userProfile ? (userProfile.projects || []) : [];
        const targetProjects = projectsList.map(p => typeof p === 'string' ? p : p.name).filter(Boolean);
        
        accounts = accounts.filter(a => 
          targetProjects.some(tp => 
            a.companyName.toLowerCase().includes(tp.toLowerCase()) || 
            tp.toLowerCase().includes(a.companyName.toLowerCase())
          )
        );
      }

      const allowedAccountIds = accounts.map(a => a.accountId || a.id);
      risks = risks.filter(r => allowedAccountIds.includes(r.accountId));
    }

    if (severity) {
      risks = risks.filter(r => r.severity === severity);
    }

    if (status) {
      risks = risks.filter(r => r.status === status);
    }

    // Enrich with company name
    const enriched = await Promise.all(risks.map(async (r) => {
      const accountDoc = await db.collection('accounts').doc(r.accountId).get();
      return {
        ...r,
        companyName: accountDoc.exists ? accountDoc.data().companyName : 'Unknown Company'
      };
    }));

    return res.json(enriched);
  } catch (error) {
    console.error('Error fetching risks:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/risks/:id
 * Update risk status (e.g. resolve it)
 */
router.put('/:id', requireRole(['Admin', 'Sales Manager']), async (req, res) => {
  const { id } = req.params;
  const { status, description, severity } = req.body;

  try {
    const docRef = db.collection('risks').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Risk not found' });
    }

    const currentRisk = doc.data();
    const updates = {};
    if (status) updates.status = status; // e.g. 'Resolved' or 'Open'
    if (description) updates.description = description;
    if (severity) updates.severity = severity;

    await docRef.update(updates);

    // Notify of risk resolution status
    if (status === 'Resolved') {
      const notificationId = 'notif-' + Math.random().toString(36).substring(2, 11);
      await db.collection('notifications').doc(notificationId).set({
        notificationId,
        accountId: currentRisk.accountId,
        type: 'Risk Resolved',
        message: `Risk [${currentRisk.category}] resolved successfully.`,
        severity: 'Low',
        read: false,
        timestamp: new Date().toISOString()
      });
    }

    // Recalculate health since a risk is resolved/updated
    await calculateAccountHealth(currentRisk.accountId);

    const updatedDoc = await docRef.get();
    return res.json(updatedDoc.data());
  } catch (error) {
    console.error('Error updating risk:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
