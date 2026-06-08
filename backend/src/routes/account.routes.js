import { Router } from 'express';
import { db } from '../config/firebase.js';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';
import { calculateAccountHealth } from '../services/health.service.js';

const router = Router();

// Apply auth middleware to all account routes
router.use(authenticateToken);

/**
 * GET /api/accounts
 * Search, filter, and paginate accounts.
 */
router.get('/', async (req, res) => {
  try {
    const { search, industry, region, status, page = 1, limit = 10 } = req.query;
    
    // Fetch all accounts to filter in memory (or query directly if needed)
    const snapshot = await db.collection('accounts').get();
    let accounts = snapshot.docs.map(doc => doc.data());

    // Filter by search query (companyName)
    if (search) {
      const q = search.toLowerCase();
      accounts = accounts.filter(acc => acc.companyName.toLowerCase().includes(q));
    }

    // Filter by industry
    if (industry) {
      accounts = accounts.filter(acc => acc.industry === industry);
    }

    // Filter by region
    if (region) {
      accounts = accounts.filter(acc => acc.region === region);
    }

    // Filter by status
    if (status) {
      accounts = accounts.filter(acc => acc.status === status);
    }

    // Sort by companyName
    accounts.sort((a, b) => a.companyName.localeCompare(b.companyName));

    // Pagination
    const total = accounts.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginatedAccounts = accounts.slice(startIndex, startIndex + parseInt(limit));

    return res.json({
      accounts: paginatedAccounts,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/accounts/:id
 * Get single account with details.
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const doc = await db.collection('accounts').doc(id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }
    return res.json(doc.data());
  } catch (error) {
    console.error('Error fetching account:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/accounts
 * Add Account (Admin or Sales Manager only).
 */
router.post('/', requireRole(['Admin', 'Sales Manager']), async (req, res) => {
  const { 
    companyName, industry, region,
    email, phone, ceoName,
    contactName, contactEmail, contactPhone, contactPosition, contactDepartment, contactProjects,
    contacts
  } = req.body;

  if (!companyName) {
    return res.status(400).json({ error: 'Missing companyName' });
  }

  try {
    const accountId = 'acc-' + Math.random().toString(36).substring(2, 11);
    const newAccount = {
      accountId,
      companyName,
      industry: industry || 'Technology',
      region: region || 'North America',
      email: email || '',
      phone: phone || '',
      ceoName: ceoName || '',
      healthScore: 70, // baseline
      status: 'Warning',
      createdAt: new Date().toISOString()
    };

    await db.collection('accounts').doc(accountId).set(newAccount);

    // If contacts array is provided, create multiple contacts
    if (contacts && Array.isArray(contacts)) {
      for (const contact of contacts) {
        if (contact.name) {
          const contactId = 'con-' + Math.random().toString(36).substring(2, 11);
          const newContact = {
            contactId,
            accountId,
            name: contact.name,
            email: contact.email || '',
            phone: contact.phone || '',
            designation: contact.position || '',
            department: contact.department || '',
            projects: contact.projects || '',
            hierarchyTag: 'Staff',
            influenceTag: 'Observer',
            createdAt: new Date().toISOString()
          };
          await db.collection('contacts').doc(contactId).set(newContact);
        }
      }
    } else if (contactName) {
      // Fallback for single contact
      const contactId = 'con-' + Math.random().toString(36).substring(2, 11);
      const newContact = {
        contactId,
        accountId,
        name: contactName,
        email: contactEmail || '',
        phone: contactPhone || '',
        designation: contactPosition || '',
        department: contactDepartment || '',
        projects: contactProjects || '',
        hierarchyTag: 'Staff', // Default, can be updated later
        influenceTag: 'Observer', // Default
        createdAt: new Date().toISOString()
      };
      await db.collection('contacts').doc(contactId).set(newContact);
    }

    // Run initial health calculation
    await calculateAccountHealth(accountId);

    // Notify of new account creation
    const notificationId = 'notif-' + Math.random().toString(36).substring(2, 11);
    await db.collection('notifications').doc(notificationId).set({
      notificationId,
      accountId,
      type: 'New Account',
      message: `New account ${companyName} has been created.`,
      severity: 'Low',
      read: false,
      timestamp: new Date().toISOString()
    });

    const doc = await db.collection('accounts').doc(accountId).get();
    return res.status(201).json(doc.data());
  } catch (error) {
    console.error('Error creating account:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/accounts/:id
 * Edit Account (Admin or Sales Manager only).
 */
router.put('/:id', requireRole(['Admin', 'Sales Manager']), async (req, res) => {
  const { id } = req.params;
  const { companyName, industry, region } = req.body;

  try {
    const docRef = db.collection('accounts').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const updates = {};
    if (companyName) updates.companyName = companyName;
    if (industry) updates.industry = industry;
    if (region) updates.region = region;

    await docRef.update(updates);

    // Recalculate health to update states
    await calculateAccountHealth(id);

    const updatedDoc = await docRef.get();
    return res.json(updatedDoc.data());
  } catch (error) {
    console.error('Error updating account:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/accounts/:id
 * Delete Account (Admin only).
 */
router.delete('/:id', requireRole(['Admin']), async (req, res) => {
  const { id } = req.params;
  try {
    const docRef = db.collection('accounts').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }

    await docRef.delete();

    // Clean up associated contacts and risks
    const contactsSnap = await db.collection('contacts').where('accountId', '==', id).get();
    const cleanContacts = contactsSnap.docs.map(doc => doc.ref.delete());
    
    const risksSnap = await db.collection('risks').where('accountId', '==', id).get();
    const cleanRisks = risksSnap.docs.map(doc => doc.ref.delete());

    await Promise.all([...cleanContacts, ...cleanRisks]);

    return res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
