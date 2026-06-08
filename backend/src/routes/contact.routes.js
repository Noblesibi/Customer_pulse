import { Router } from 'express';
import { db } from '../config/firebase.js';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';
import { calculateAccountHealth } from '../services/health.service.js';

const router = Router();

// Require auth
router.use(authenticateToken);

/**
 * GET /api/contacts
 * Get all contacts, filter by account, or search.
 */
router.get('/', async (req, res) => {
  try {
    const { accountId, search } = req.query;
    let querySnap;

    if (accountId) {
      querySnap = await db.collection('contacts').where('accountId', '==', accountId).get();
    } else {
      querySnap = await db.collection('contacts').get();
    }

    let contacts = querySnap.docs.map(doc => doc.data());

    if (search) {
      const q = search.toLowerCase();
      contacts = contacts.filter(c => 
        c.name.toLowerCase().includes(q) || 
        c.email.toLowerCase().includes(q) ||
        c.designation.toLowerCase().includes(q)
      );
    }

    return res.json(contacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/contacts/:id
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const doc = await db.collection('contacts').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    return res.json(doc.data());
  } catch (error) {
    console.error('Error fetching contact:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/contacts
 * Create contact (restricted to Admin, Manager, and Employee).
 */
router.post('/', requireRole(['Admin', 'Sales Manager', 'Employee']), async (req, res) => {
  const { accountId, name, email, designation, hierarchyTag, influenceTag, phone } = req.body;

  if (!accountId || !name || !email) {
    return res.status(400).json({ error: 'Missing accountId, name, or email' });
  }

  // Enforce valid tags
  const validHierarchy = ['CXO', 'VP', 'Director', 'Manager', 'Staff'];
  const validInfluence = ['Decision Maker', 'Influencer', 'Champion', 'Gatekeeper', 'Observer'];

  const hTag = validHierarchy.includes(hierarchyTag) ? hierarchyTag : 'Staff';
  const iTag = validInfluence.includes(influenceTag) ? influenceTag : 'Observer';

  try {
    // Verify account exists
    const accountDoc = await db.collection('accounts').doc(accountId).get();
    if (!accountDoc.exists) {
      return res.status(404).json({ error: 'Associated Account not found' });
    }

    const contactId = 'con-' + Math.random().toString(36).substring(2, 11);
    const newContact = {
      contactId,
      accountId,
      name,
      email,
      designation: designation || 'Staff Member',
      hierarchyTag: hTag,
      influenceTag: iTag,
      phone: phone || ''
    };

    await db.collection('contacts').doc(contactId).set(newContact);

    // Update health score since relationship depth might have changed
    await calculateAccountHealth(accountId);

    return res.status(201).json(newContact);
  } catch (error) {
    console.error('Error creating contact:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/contacts/:id
 * Edit contact details.
 */
router.put('/:id', requireRole(['Admin', 'Sales Manager', 'Employee']), async (req, res) => {
  const { id } = req.params;
  const { name, email, designation, hierarchyTag, influenceTag, phone } = req.body;

  try {
    const docRef = db.collection('contacts').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const currentData = doc.data();
    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email;
    if (designation) updates.designation = designation;
    if (hierarchyTag) updates.hierarchyTag = hierarchyTag;
    if (influenceTag) updates.influenceTag = influenceTag;
    if (phone !== undefined) updates.phone = phone;

    await docRef.update(updates);

    // Recalculate health since tags might have changed
    await calculateAccountHealth(currentData.accountId);

    const updatedDoc = await docRef.get();
    return res.json(updatedDoc.data());
  } catch (error) {
    console.error('Error updating contact:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/contacts/:id
 */
router.delete('/:id', requireRole(['Admin', 'Sales Manager']), async (req, res) => {
  const { id } = req.params;
  try {
    const docRef = db.collection('contacts').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const accountId = doc.data().accountId;
    await docRef.delete();

    // Recalculate health
    await calculateAccountHealth(accountId);

    return res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
