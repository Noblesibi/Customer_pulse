import { Router } from 'express';
import { db, logActivity } from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';
import { calculateAccountHealth, getAccountHealthExplanation } from '../services/health.service.js';

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

    // Use DB userProfile (not JWT role) for true role determination
    // JWT role is hardcoded to 'Admin' for all users; real role is in the DB profile
    const isTrueAdmin = userProfile && (userProfile.userType === 'Admin' || userProfile.role === 'Admin');
    const isCeo = userProfile && userProfile.userType === 'CEO';

    if (!isTrueAdmin && !isCeo) {
      // 1. Accounts where this user is the Account Owner
      const ownedAccountIds = new Set(
        accounts
          .filter(a => a.ownerId === req.user.uid)
          .map(a => a.accountId || a.id)
      );

      // 2. Accounts where this user is a Stakeholder Owner (any contact ownerId matches)
      const allContactsSnap = await db.collection('contacts').get();
      const stakeholderAccountIds = new Set(
        allContactsSnap.docs
          .map(d => d.data())
          .filter(c => c.ownerId === req.user.uid)
          .map(c => c.accountId)
      );

      const allowedIds = new Set([...ownedAccountIds, ...stakeholderAccountIds]);
      accounts = accounts.filter(a => allowedIds.has(a.accountId || a.id));
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
router.post('/', (req, res, next) => {
  const isTrueAdmin = req.user.role === 'Admin';
  const isCeoNazneen = req.user.email?.toLowerCase() === 'nj@gmail.com';
  if (!isTrueAdmin && !isCeoNazneen) {
    return res.status(403).json({ error: 'Forbidden: Only Admin and CEO Nazneen are allowed to add accounts' });
  }
  next();
}, async (req, res) => {
  const {
    companyName, industry, region, email, phone, ceoName, domain, ownerId, ownerName, contacts,
    contactName, contactEmail, contactPhone, contactPosition, contactDepartment, contactProjects
  } = req.body;

  // ── Input Validation ───────────────────────────────────────
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^[\+\d\s\-\(\)\.]{7,25}$/;

  if (!companyName || typeof companyName !== 'string' || !companyName.trim()) {
    return res.status(400).json({ error: 'Company Name is required and cannot be empty.' });
  }
  if (companyName.trim().length < 2) {
    return res.status(400).json({ error: 'Company Name must be at least 2 characters.' });
  }
  if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
    return res.status(400).json({ error: 'A valid corporate Email address is required.' });
  }
  if (phone && (typeof phone !== 'string' || !phoneRegex.test(phone.trim()))) {
    return res.status(400).json({ error: 'Phone number format is invalid.' });
  }
  if (!industry || typeof industry !== 'string' || !industry.trim()) {
    return res.status(400).json({ error: 'Industry selection is required.' });
  }
  if (!region || typeof region !== 'string' || !region.trim()) {
    return res.status(400).json({ error: 'Region selection is required.' });
  }
  if (!domain || typeof domain !== 'string' || !domain.trim()) {
    return res.status(400).json({ error: 'NeST Business Unit Domain selection is required.' });
  }

  try {
    const existingSnap = await db.collection('accounts').get();
    const nameExists = existingSnap.docs.some(doc => {
      const data = doc.data();
      return data.companyName && data.companyName.toLowerCase().trim() === companyName.toLowerCase().trim();
    });
    if (nameExists) {
      return res.status(400).json({ error: `Account with company name "${companyName}" already exists.` });
    }

    // Check if any incoming employee already exists in another company
    const contactsSnap = await db.collection('contacts').get();
    const existingContacts = contactsSnap.docs.map(doc => doc.data());
    
    const incomingContactNames = [];
    if (contacts && Array.isArray(contacts)) {
      contacts.forEach(c => { if (c.name) incomingContactNames.push(c.name); });
    } else if (contactName) {
      incomingContactNames.push(contactName);
    }
    
    for (const name of incomingContactNames) {
      const duplicate = existingContacts.find(c => c.name && c.name.toLowerCase().trim() === name.toLowerCase().trim());
      if (duplicate) {
        const otherAccountDoc = await db.collection('accounts').doc(duplicate.accountId).get();
        const otherCompName = otherAccountDoc.exists ? otherAccountDoc.data().companyName : 'another company';
        return res.status(400).json({ error: `Employee "${name}" already exists in ${otherCompName}.` });
      }
    }

    let finalOwnerId = ownerId || req.user.uid;
    let finalOwnerName = ownerName;
    if (ownerId && !ownerName) {
      const ownerUserDoc = await db.collection('users').doc(ownerId).get();
      if (ownerUserDoc.exists) {
        finalOwnerName = ownerUserDoc.data().name;
      }
    }
    if (!finalOwnerName) {
      finalOwnerName = req.user.name || 'System User';
    }

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
      ownerId: finalOwnerId,
      ownerName: finalOwnerName,
      createdAt: new Date().toISOString()
    };

    await db.collection('accounts').doc(accountId).set(newAccount);

    // If contacts array is provided, create multiple contacts
    if (contacts && Array.isArray(contacts)) {
      for (const contact of contacts) {
        if (contact.name) {
          const contactId = 'con-' + Math.random().toString(36).substring(2, 11);
          let cOwnerId = contact.ownerId || finalOwnerId;
          let cOwnerName = contact.ownerName;
          if (contact.ownerId && !contact.ownerName) {
            const ownerUserDoc = await db.collection('users').doc(contact.ownerId).get();
            if (ownerUserDoc.exists) {
              cOwnerName = ownerUserDoc.data().name;
            }
          }
          if (!cOwnerName) {
            cOwnerName = finalOwnerName;
          }

          const newContact = {
            contactId,
            accountId,
            name: contact.name,
            email: contact.email || '',
            phone: contact.phone || '',
            designation: contact.position || '',
            department: contact.department || '',
            projectName: contact.projectName || '',
            projectIndustry: contact.projectIndustry || '',
            projectType: contact.projectType || '',
            hierarchyTag: contact.hierarchyTag || 'Staff',
            influenceTag: contact.influenceTag || 'Observer',
            ownerId: cOwnerId,
            ownerName: cOwnerName,
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
        ownerId: finalOwnerId,
        ownerName: finalOwnerName,
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
router.put('/:id', requireRole(['Admin', 'Sales Manager', 'Executive']), async (req, res) => {
  const { id } = req.params;
  const { companyName, industry, region, email, phone, ceoName, domain, contacts, ownerId, ownerName } = req.body;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^[\+\d\s\-\(\)\.]{7,25}$/;

  if (companyName !== undefined && (!companyName || typeof companyName !== 'string' || !companyName.trim())) {
    return res.status(400).json({ error: 'Company Name cannot be empty.' });
  }
  if (email !== undefined && (!email || typeof email !== 'string' || !emailRegex.test(email.trim()))) {
    return res.status(400).json({ error: 'A valid corporate Email address is required.' });
  }
  if (phone !== undefined && phone && (typeof phone !== 'string' || !phoneRegex.test(phone.trim()))) {
    return res.status(400).json({ error: 'Phone number format is invalid.' });
  }

  try {
    const docRef = db.collection('accounts').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Check if any incoming employee already exists in another company (excluding the current account)
    if (contacts && Array.isArray(contacts)) {
      const contactsSnap = await db.collection('contacts').get();
      const existingContacts = contactsSnap.docs.map(doc => doc.data());
      
      for (const contact of contacts) {
        if (contact.name) {
          const duplicate = existingContacts.find(c => 
            c.name && c.name.toLowerCase().trim() === contact.name.toLowerCase().trim() &&
            c.accountId !== id
          );
          if (duplicate) {
            const accountDoc = await db.collection('accounts').doc(duplicate.accountId).get();
            const otherCompName = accountDoc.exists ? accountDoc.data().companyName : 'another company';
            return res.status(400).json({ error: `Employee "${contact.name}" already exists in ${otherCompName}.` });
          }
        }
      }
    }

    const updates = {};
    if (companyName) {
      const existingSnap = await db.collection('accounts').get();
      const nameExists = existingSnap.docs.some(doc => {
        const data = doc.data();
        return (data.accountId !== id && data.id !== id) && 
               data.companyName && 
               data.companyName.toLowerCase().trim() === companyName.toLowerCase().trim();
      });
      if (nameExists) {
        return res.status(400).json({ error: `Account with company name "${companyName}" already exists.` });
      }
      updates.companyName = companyName;
    }
    if (industry) updates.industry = industry;
    if (region) updates.region = region;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (ceoName !== undefined) updates.ceoName = ceoName;
    if (domain !== undefined) updates.domain = domain;

    if (ownerId !== undefined) {
      updates.ownerId = ownerId;
      if (ownerName) {
        updates.ownerName = ownerName;
      } else if (ownerId) {
        const ownerUserDoc = await db.collection('users').doc(ownerId).get();
        if (ownerUserDoc.exists) {
          updates.ownerName = ownerUserDoc.data().name;
        } else {
          updates.ownerName = 'Unknown User';
        }
      } else {
        updates.ownerName = null;
      }
    }

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
          const contactUpdates = {
            name: contact.name,
            email: contact.email || '',
            phone: contact.phone || '',
            designation: contact.position || contact.designation || '',
            department: contact.department || '',
            projectName: contact.projectName || '',
            projectIndustry: contact.projectIndustry || '',
            projectType: contact.projectType || '',
            hierarchyTag: contact.hierarchyTag || 'Staff',
            influenceTag: contact.influenceTag || 'Observer'
          };
          if (contact.ownerId !== undefined) {
            contactUpdates.ownerId = contact.ownerId;
            if (contact.ownerName) {
              contactUpdates.ownerName = contact.ownerName;
            } else if (contact.ownerId) {
              const ownerUserDoc = await db.collection('users').doc(contact.ownerId).get();
              if (ownerUserDoc.exists) {
                contactUpdates.ownerName = ownerUserDoc.data().name;
              } else {
                contactUpdates.ownerName = 'Unknown User';
              }
            } else {
              contactUpdates.ownerName = null;
            }
          }
          await db.collection('contacts').doc(contact.contactId).update(contactUpdates);
        } else {
          const contactId = 'con-' + Math.random().toString(36).substring(2, 11);
          let cOwnerId = contact.ownerId || ownerId || doc.data().ownerId || req.user.uid;
          let cOwnerName = contact.ownerName || ownerName || doc.data().ownerName || req.user.name;
          if (contact.ownerId && !contact.ownerName) {
            const ownerUserDoc = await db.collection('users').doc(contact.ownerId).get();
            if (ownerUserDoc.exists) {
              cOwnerName = ownerUserDoc.data().name;
            }
          }
          await db.collection('contacts').doc(contactId).set({
            contactId,
            accountId: id,
            name: contact.name,
            email: contact.email || '',
            phone: contact.phone || '',
            designation: contact.position || contact.designation || '',
            department: contact.department || '',
            projectName: contact.projectName || '',
            projectIndustry: contact.projectIndustry || '',
            projectType: contact.projectType || '',
            hierarchyTag: contact.hierarchyTag || 'Staff',
            influenceTag: contact.influenceTag || 'Observer',
            ownerId: cOwnerId,
            ownerName: cOwnerName,
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
router.delete('/:id', requireRole(['Admin', 'Executive']), async (req, res) => {
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

/**
 * GET /api/accounts/:id/health-explanation
 * Get detailed sub-score breakdown explaining account health.
 */
router.get('/:id/health-explanation', async (req, res) => {
  const { id } = req.params;
  try {
    const explanation = await getAccountHealthExplanation(id);
    if (!explanation) {
      return res.status(404).json({ error: 'Account health details not found' });
    }
    return res.json(explanation);
  } catch (error) {
    console.error('Error fetching account health explanation:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
