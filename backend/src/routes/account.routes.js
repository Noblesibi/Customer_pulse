import { Router } from 'express';
import { db, logActivity } from '../config/database.js';
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

    // Filter by User Profile permissions / assigned projects (Secure-by-default)
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : null;

    const isAdmin = req.user.role === 'Admin' || (userProfile && (userProfile.userType === 'Admin' || userProfile.role === 'Admin'));
    const isCeo = userProfile && userProfile.userType === 'CEO';

    if (!isAdmin && !isCeo) {
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
    }

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
    email, phone, ceoName, domain, projectName,
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
      domain: domain || '',
      projectName: '',
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
            projectName: contact.projectName || '',
            projectIndustry: contact.projectIndustry || 'Technology',
            hierarchyTag: contact.hierarchyTag || 'Staff',
            influenceTag: contact.influenceTag || 'Observer',
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
        projectName: contactProjects || '',
        projectIndustry: 'Technology',
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
    await logActivity(req.user.uid, req.user.name, 'Create Account', `Created account ${companyName} (ID: ${accountId})`);
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
  const { companyName, industry, region, email, phone, ceoName, domain, contacts } = req.body;

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
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (ceoName !== undefined) updates.ceoName = ceoName;
    if (domain !== undefined) updates.domain = domain;

    await docRef.update(updates);

    // Sync contacts
    if (contacts && Array.isArray(contacts)) {
      const existingSnap = await db.collection('contacts').where('accountId', '==', id).get();
      const existingDocs = existingSnap.docs.map(d => d.data());
      const existingIds = existingDocs.map(c => c.contactId);

      const incomingIds = contacts.map(c => c.contactId).filter(Boolean);

      // Delete removed
      const deletedIds = existingIds.filter(eid => !incomingIds.includes(eid));
      for (const delId of deletedIds) {
        await db.collection('contacts').doc(delId).delete();
      }

      // Create or update incoming
      for (const contact of contacts) {
        if (contact.contactId) {
          await db.collection('contacts').doc(contact.contactId).update({
            name: contact.name,
            email: contact.email || '',
            phone: contact.phone || '',
            designation: contact.position || contact.designation || '',
            department: contact.department || '',
            projectName: contact.projectName || '',
            projectIndustry: contact.projectIndustry || 'Technology',
            hierarchyTag: contact.hierarchyTag || 'Staff',
            influenceTag: contact.influenceTag || 'Observer'
          });
        } else {
          const contactId = 'con-' + Math.random().toString(36).substring(2, 11);
          await db.collection('contacts').doc(contactId).set({
            contactId,
            accountId: id,
            name: contact.name,
            email: contact.email || '',
            phone: contact.phone || '',
            designation: contact.position || contact.designation || '',
            department: contact.department || '',
            projectName: contact.projectName || '',
            projectIndustry: contact.projectIndustry || 'Technology',
            hierarchyTag: contact.hierarchyTag || 'Staff',
            influenceTag: contact.influenceTag || 'Observer',
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    // Recalculate health to update states
    await calculateAccountHealth(id);

    const updatedDoc = await docRef.get();
    await logActivity(req.user.uid, req.user.name, 'Update Account', `Updated account ${updatedDoc.data().companyName} (ID: ${id})`);
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

    await logActivity(req.user.uid, req.user.name, 'Delete Account', `Deleted account ${doc.data().companyName} (ID: ${id})`);
    return res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
