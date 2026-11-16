import { Router } from 'express';
import { db, logActivity } from '../config/database.js';
import { authenticateToken, requireRole } from '../middleware/auth.middleware.js';
import { calculateAccountHealth, getAccountHealthExplanation } from '../services/health.service.js';
import { runScoringEngine } from '../services/scoringEngine.service.js';
import { runRiskEngine } from '../services/riskEngine.service.js';
import { NotificationEngine } from '../services/notification/NotificationEngine.js';
import { getSystemDateString, getSystemTimeString } from '../utils/dateUtils.js';
import { generateNextBestActions } from '../services/nba.service.js';
import { sendNewAccountsTechTeamNotification } from '../services/email.service.js';

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
      const userEmail = req.user.email?.toLowerCase();
      const userName = req.user.name?.toLowerCase();

      const isMatch = (entity) => {
        if (entity.ownerId === req.user.uid || entity.assignedTo === req.user.uid || entity.userId === req.user.uid) return true;
        if (userEmail && (entity.ownerEmail?.toLowerCase() === userEmail || entity.assignedToEmail?.toLowerCase() === userEmail || entity.email?.toLowerCase() === userEmail)) return true;
        if (userName && (entity.ownerName?.toLowerCase().includes(userName.split(' ')[0]) || entity.assignedToName?.toLowerCase().includes(userName.split(' ')[0]))) return true;
        return false;
      };

      // 1. Accounts where this user is the Account Owner or Assigned
      const ownedAccountIds = new Set(
        accounts
          .filter(a => isMatch(a))
          .map(a => a.accountId || a.id)
      );

      // 2. Accounts where this user is a Stakeholder Owner (any contact owner matches)
      const allContactsSnap = await db.collection('contacts').get();
      const stakeholderAccountIds = new Set(
        allContactsSnap.docs
          .map(d => d.data())
          .filter(c => isMatch(c))
          .map(c => c.accountId)
          .filter(Boolean)
      );

      // Only consider: 1) Account Owner, 2) Stakeholder Contact Owner
      const allowedIds = new Set([...ownedAccountIds, ...stakeholderAccountIds]);
      accounts = accounts.filter(a => allowedIds.has(a.accountId || a.id));
    }


    // Filter by search query (companyName)
    if (search) {
      const q = search.toLowerCase();
      accounts = accounts.filter(acc => acc.companyName.toLowerCase().includes(q));
    }

    // Filter by industry (case-insensitive)
    if (industry) {
      const industryLower = industry.toLowerCase().trim();
      accounts = accounts.filter(acc => (acc.industry || acc.domain || '').toLowerCase().trim() === industryLower);
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
 * PUT /api/accounts/:id/journey
 * Update customer journey stage. (P2-F05)
 */
router.put('/:id/journey', async (req, res) => {
  const { id } = req.params;
  const { journeyStage, reason = '', triggerType = 'manual', fromStage } = req.body;
  if (!journeyStage) return res.status(400).json({ error: 'journeyStage is required' });
  
  try {
    const accRef = db.collection('accounts').doc(id);
    const doc = await accRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Account not found' });
    
    const prevData = doc.data();
    const prevStage = fromStage || prevData.journeyStage || 'Awareness';
    const nowIso = new Date().toISOString();
    const isManualAction = triggerType === 'manual' || triggerType === 'suggestion';
    const richUpdates = {
      journeyStage,
      previousJourneyStage: prevStage !== journeyStage ? prevStage : (prevData.previousJourneyStage || null),
      journeyUpdatedAt: nowIso,
      journeyReason: reason || prevData.journeyReason || null,
      journeyTrigger: triggerType,
      ...(isManualAction ? { journeyManualOverrideAt: nowIso } : {})
    };
    
    try {
      await accRef.update(richUpdates);
    } catch (colErr) {
      try { await accRef.update({ journeyStage }); } catch (e) { /* fallback */ }
    }
    await logActivity(
      req.user.uid,
      req.user.name || req.user.email,
      'Journey Stage Updated',
      `Journey moved from ${prevStage} to ${journeyStage}${reason ? ` (${reason})` : ''}`
    );
    try {
      const histId = 'jh-' + Math.random().toString(36).substring(2, 11);
      await db.collection('journeyHistory').doc(histId).set({
        id: histId,
        accountId: id,
        fromStage: prevStage,
        toStage: journeyStage,
        reason: reason || null,
        triggerType,
        changedBy: req.user.uid,
        changedByName: req.user.name || req.user.email,
        timestamp: nowIso
      });
    } catch (histErr) { /* non-fatal if table not yet migrated */ }
    return res.json({
      success: true,
      journeyStage,
      previousJourneyStage: richUpdates.previousJourneyStage,
      journeyUpdatedAt: nowIso,
      journeyReason: richUpdates.journeyReason,
      journeyTrigger: triggerType
    });

  } catch (err) {
    console.error('Error updating journey:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/accounts/:id/journey
 * Get customer journey history. (P2-F05)
 */
router.get('/:id/journey', async (req, res) => {
  const { id } = req.params;
  try {
    const snap = await db.collection('journeyHistory').where('accountId', '==', id).get();
    let history = snap.docs.map(d => d.data());
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return res.json(history);
  } catch (err) {
    return res.json([]);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/accounts/:id/nba
 * Get Next Best Actions for an account (P2-F08)
 */
router.get('/:id/nba', async (req, res) => {
  const { id } = req.params;
  try {
    const actions = await generateNextBestActions(id);
    return res.json(actions);
  } catch (err) {
    console.error('Error fetching NBA:', err);
    return res.status(500).json({ error: err.message });
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
    const data = doc.data();

    // Verify User Profile permissions: only 1) Account Owner or 2) Stakeholder Contact Owner
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userProfile = userDoc.exists ? userDoc.data() : null;
    const isTrueAdmin = userProfile && (userProfile.userType === 'Admin' || userProfile.role === 'Admin');
    const isCeo = userProfile && userProfile.userType === 'CEO';

    if (!isTrueAdmin && !isCeo) {
      const userEmail = req.user.email?.toLowerCase();
      const userName = req.user.name?.toLowerCase();
      const isMatch = (entity) => {
        if (entity.ownerId === req.user.uid || entity.assignedTo === req.user.uid || entity.userId === req.user.uid) return true;
        if (userEmail && (entity.ownerEmail?.toLowerCase() === userEmail || entity.assignedToEmail?.toLowerCase() === userEmail || entity.email?.toLowerCase() === userEmail)) return true;
        if (userName && (entity.ownerName?.toLowerCase().includes(userName.split(' ')[0]) || entity.assignedToName?.toLowerCase().includes(userName.split(' ')[0]))) return true;
        return false;
      };

      const isAccountOwner = isMatch(data);
      if (!isAccountOwner) {
        const contactsSnap = await db.collection('contacts').where('accountId', '==', id).get();
        const isStakeholderOwner = contactsSnap.docs.some(d => isMatch(d.data()));
        if (!isStakeholderOwner) {
          return res.status(403).json({ error: 'You do not have permission to view this account.' });
        }
      }
    }
    
    // Fetch active risk flags
    try {
      const flagsSnap = await db.collection('risk_flags').where('account_id', '==', id).get();
      data.activeFlags = flagsSnap.docs.map(d => d.data()).filter(f => ['active', 'acknowledged', 'snoozed'].includes(f.status));
    } catch(e) { data.activeFlags = []; }

    // Fetch account overrides
    try {
      try {
        const jhSnap = await db.collection('journeyHistory').where('accountId', '==', id).get();
        const jhList = jhSnap.docs.map(d => d.data()).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        data.journeyHistory = jhList;
        if (jhList.length > 0) {
          const latestJh = jhList[0];
          if (!data.previousJourneyStage && latestJh.fromStage && latestJh.fromStage !== data.journeyStage) data.previousJourneyStage = latestJh.fromStage;
          if (!data.journeyUpdatedAt && latestJh.timestamp) data.journeyUpdatedAt = latestJh.timestamp;
          if (!data.journeyReason && latestJh.reason) data.journeyReason = latestJh.reason;
          if (!data.journeyTrigger && latestJh.triggerType) data.journeyTrigger = latestJh.triggerType;
        }
      } catch(e) { data.journeyHistory = []; }
      const overridesSnap = await db.collection('account_scoring_overrides').where('account_id', '==', id).get();
      data.scoringOverrides = overridesSnap.docs.map(d => d.data());
    } catch(e) { data.scoringOverrides = []; }

    return res.json(data);
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
    contactName, contactEmail, contactPhone, contactPosition, contactDepartment, contactProjects, projectName
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
    let finalOwnerEmail = '';
    if (ownerId) {
      const ownerUserDoc = await db.collection('users').doc(ownerId).get();
      if (ownerUserDoc.exists) {
        const ownerData = ownerUserDoc.data();
        if (!finalOwnerName) finalOwnerName = ownerData.name;
        finalOwnerEmail = ownerData.email || '';
      }
    }
    if (!finalOwnerName) {
      finalOwnerName = req.user.name || 'System User';
    }
    if (!finalOwnerEmail && (!ownerId || ownerId === req.user.uid)) {
      finalOwnerEmail = req.user.email || '';
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
      journeyStage: 'Awareness', // P2-F05
      ownerId: finalOwnerId,
      ownerName: finalOwnerName,
      createdAt: new Date().toISOString()
    };

    await db.collection('accounts').doc(accountId).set(newAccount);

    // Create system notification for new account
    const notifId = 'notif-' + Math.random().toString(36).substring(2, 11);
    await db.collection('notifications').doc(notifId).set({
      notificationId: notifId,
      accountId,
      type: 'New Account',
      message: `${req.user.name || req.user.email} added a new account: "${companyName}"`,
      read: false,
      date: getSystemDateString(),
      time: getSystemTimeString(),
      timestamp: new Date().toISOString()
    });

    // If contacts array is provided, create multiple contacts
    const createdContacts = [];
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
          };
          await db.collection('contacts').doc(contactId).set(newContact);
          createdContacts.push(newContact);
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
      createdContacts.push(newContact);
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
      date: getSystemDateString(),
      time: getSystemTimeString(),
      timestamp: new Date().toISOString()
    });

    const doc = await db.collection('accounts').doc(accountId).get();
    await logActivity(req.user.uid, req.user.name, 'Create Account', `Created account ${companyName} (ID: ${accountId})`);

    // Automatically notify tech team & tech head for Outlook & Teams permissions
    sendNewAccountsTechTeamNotification({
      accounts: [{
        accountId,
        companyName,
        industry: industry || 'Technology',
        domain: domain || 'General',
        region: region || 'Unknown',
        email: email || '',
        phone: phone || '',
        ceoName: ceoName || '',
        ownerName: finalOwnerName,
        ownerEmail: finalOwnerEmail,
        contacts: createdContacts,
        contactsCount: createdContacts.length
      }],
      uploadedBy: {
        name: req.user?.name || req.user?.displayName || 'Administrator',
        email: req.user?.email || 'admin@pulse.com'
      },
      source: 'Account Creation'
    }).catch(err => console.error('Error triggering tech team notification for new account:', err));

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
    if (req.body.journeyStage !== undefined) updates.journeyStage = req.body.journeyStage;

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

    // If owner changed, publish account_assignment_changed event
    if (updates.ownerId && updates.ownerId !== existingAccount.ownerId) {
      try {
        await NotificationEngine.publishEvent('account_assignment_changed', {
          CompanyName: updates.companyName || existingAccount.companyName,
          NewOwnerName: updates.ownerName || 'New Owner',
          OwnerName: updates.ownerName || 'New Owner',
          PreviousOwnerName: existingAccount.ownerName || 'Previous Owner',
          UpdatedBy: req.user.name || req.user.email,
          InAppMessage: `Account "${updates.companyName || existingAccount.companyName}" owner assigned to ${updates.ownerName}`
        }, [updates.ownerId], { relatedAccountId: id });
      } catch (err) {
        console.error('[AccountRoutes] NotificationEngine owner change error:', err.message);
      }
    }

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
router.delete('/:id', requireRole(['Admin', 'Executive', 'Sales Manager']), async (req, res) => {
  const { id } = req.params;
  try {
    const docRef = db.collection('accounts').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }

    await docRef.delete();

    // Clean up all associated collections
    const relatedCollections = ['contacts', 'risks', 'interactions', 'tasks', 'notifications', 'journeyHistory'];
    for (const coll of relatedCollections) {
      const snap = await db.collection(coll).where('accountId', '==', id).get();
      if (snap && snap.docs) {
        for (const d of snap.docs) {
          await d.ref.delete();
        }
      }
    }

    await logActivity(req.user.uid, req.user.name, 'Delete Account', `Deleted account ${doc.data().companyName} (ID: ${id})`);
    return res.json({ success: true, message: 'Account deleted successfully' });
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

/**
 * GET /api/accounts/:id/health-history
 * Get historical health scores from HealthScores table for trend charting (up to 30d window).
 */
router.get('/:id/health-history', async (req, res) => {
  const { id } = req.params;
  const days = Math.min(30, parseInt(req.query.days) || 30);
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const snap = await db.collection('healthscores')
      .where('accountId', '==', id)
      .get();

    let allDocs = snap.docs.map(d => {
      const data = d.data();
      const s = typeof data.healthScore === 'number' ? data.healthScore : typeof data.score === 'number' ? data.score : 50;
      return {
        id: d.id,
        ...data,
        score: s,
        healthScore: s
      };
    });
    // Sort ascending by timestamp
    allDocs.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

    // Filter by requested days
    let filtered = allDocs.filter(h => {
      if (!h.timestamp) return true;
      const t = new Date(h.timestamp);
      return !isNaN(t.getTime()) && t >= cutoff;
    });

    // Also get current account info
    const accDoc = await db.collection('accounts').doc(id).get();
    const accData = accDoc.exists ? accDoc.data() : {};
    const currentScore = accData.healthScore ?? 65;
    const currentStatus = accData.status || (currentScore >= 80 ? 'Healthy' : currentScore >= 60 ? 'Healthy' : currentScore >= 40 ? 'Warning' : 'Critical');

    return res.json({
      accountId: id,
      days,
      currentScore,
      currentStatus,
      history: filtered.length > 0 ? filtered : allDocs
    });
  } catch (error) {
    console.error('Error fetching health history:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/accounts/:id/overrides
 * Update manual score and risk overrides for an account, and recalculate.
 */
router.put('/:id/overrides', requireRole(['Admin', 'Executive', 'Sales Manager']), async (req, res) => {
  const { id } = req.params;
  const { overrides } = req.body;
  if (!overrides) return res.status(400).json({ error: 'overrides object is required' });

  try {
    const accRef = db.collection('accounts').doc(id);
    const doc = await accRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Account not found' });

    // Store in a dedicated overrides collection mapped by account_id
    const overridesRef = db.collection('account_scoring_overrides').doc(id);
    await overridesRef.set({
      account_id: id,
      ...overrides,
      updated_at: new Date().toISOString(),
      updated_by: req.user.uid
    }, { merge: true });

    // Run engine recalculation immediately
    await runScoringEngine(id);
    await runRiskEngine(id);

    await logActivity(req.user.uid, req.user.name, 'Updated Overrides', `Updated scoring/risk overrides for account ${id}`);

    return res.json({ success: true, message: 'Overrides applied and scores recalculated' });
  } catch (error) {
    console.error('Error updating overrides:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/accounts/:id/recalculate
 * Triggers the Phase 3 Scoring and Risk Engines for the account.
 */
router.post('/:id/recalculate', async (req, res) => {
  const { id } = req.params;
  try {
    const scoreResult = await runScoringEngine(id);
    const riskResult = await runRiskEngine(id);
    
    return res.json({
      success: true,
      score: scoreResult,
      risk: riskResult
    });
  } catch (error) {
    console.error('Error recalculating account:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/accounts/:id/outlook-mails
 * Returns all Outlook Mail interactions for this account, enriched with:
 *  - account general email (account.email)
 *  - account owner's email
 *  - key contacts' emails and their ownerEmail
 * So the UI can show the full org ↔ customer conversation.
 */
router.get('/:id/outlook-mails', async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Fetch the account
    const accountDoc = await db.collection('accounts').doc(id).get();
    if (!accountDoc.exists) return res.status(404).json({ error: 'Account not found' });
    const account = accountDoc.data();

    // 2. Fetch all contacts for this account
    const contactsSnap = await db.collection('contacts').where('accountId', '==', id).get();
    const contacts = contactsSnap.docs.map(d => d.data());

    // 3. Build a set of known org emails (account owner + key contact owners)
    //    and customer emails (account general email + contacts' emails)
    const orgEmails = new Set();
    const customerEmails = new Set();

    // Account owner
    if (account.ownerEmail) orgEmails.add(account.ownerEmail.toLowerCase());

    // Account general email → customer side
    if (account.email) customerEmails.add(account.email.toLowerCase());
    if (account.generalEmail) customerEmails.add(account.generalEmail.toLowerCase());
    if (account.directiveEmail) customerEmails.add(account.directiveEmail.toLowerCase());

    // Contacts: contact.email = customer email; contact.ownerEmail = org side
    contacts.forEach(c => {
      if (c.email) customerEmails.add(c.email.toLowerCase());
      if (c.ownerEmail) orgEmails.add(c.ownerEmail.toLowerCase());
    });

    // 4. Build contact lookup maps
    const contactByEmail = {};
    contacts.forEach(c => {
      if (c.email) contactByEmail[c.email.toLowerCase()] = c;
    });

    // 5. Fetch all Outlook Mail interactions for this account
    const intSnap = await db.collection('interactions')
      .where('accountId', '==', id)
      .where('source', '==', 'Outlook Mail')
      .get();

    let mails = intSnap.docs.map(d => d.data()).filter(i => !i.interactionId?.includes('dummy'));

    // Also fetch interactions where source is 'Email' (legacy label)
    const emailSnap = await db.collection('interactions')
      .where('accountId', '==', id)
      .where('source', '==', 'Email')
      .get();
    const legacyMails = emailSnap.docs.map(d => d.data()).filter(i => !i.interactionId?.includes('dummy'));
    mails = [...mails, ...legacyMails];

    // 6. Fetch user data for org senders
    const usersSnap = await db.collection('users').get();
    const userByEmail = {};
    const userByUid = {};
    usersSnap.docs.forEach(d => {
      const u = d.data();
      if (u.email) userByEmail[u.email.toLowerCase()] = u;
      if (u.uid) userByUid[u.uid] = u;
    });

    // 7. Enrich mails
    const enriched = await Promise.all(mails.map(async (m) => {
      // Get the logged-by user details
      const loggedByUser = m.loggedByUid ? (userByUid[m.loggedByUid] || null) : null;
      const loggedByEmail = loggedByUser?.email || '';

      // Determine the matched contact
      const matchedContact = m.contactId
        ? contacts.find(c => c.contactId === m.contactId || c.id === m.contactId)
        : null;

      // Determine direction: org → customer or customer → org
      const fromEmail = m.fromEmail || loggedByEmail || account.ownerEmail || '';
      const isFromOrg = orgEmails.has(fromEmail.toLowerCase()) || (!fromEmail && !!m.loggedByUid);
      const direction = isFromOrg ? 'outbound' : 'inbound';

      // Org sender info
      const orgSender = {
        name: loggedByUser?.name || m.loggedByName || account.ownerName || 'Your Team',
        email: fromEmail || account.ownerEmail || '',
        role: loggedByUser?.role || loggedByUser?.position || 'Team Member'
      };

      // Customer recipient/sender info
      const customerContact = matchedContact || contacts[0] || null;
      const customerInfo = {
        name: customerContact?.name || m.recipientName || account.companyName,
        email: customerContact?.email || account.email || '',
        designation: customerContact?.designation || '',
        company: account.companyName
      };

      // Fetch replies
      let replies = [];
      try {
        const repliesSnap = await db.collection('interactions').doc(m.interactionId).collection('replies').get();
        replies = repliesSnap.docs.map(d => d.data()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      } catch (e) { /* ignore */ }

      return {
        interactionId: m.interactionId,
        subject: m.subject || '(No Subject)',
        messageText: m.messageText || '',
        date: m.date,
        time: m.time,
        timestamp: m.timestamp || m.createdAt,
        direction,
        orgSender,
        customerInfo,
        replies,
        sentiment: m.sentiment || 'Neutral',
        riskDetected: m.riskDetected || false,
        actionMentions: m.actionMentions || [],
        attachments: m.attachments || [],
        internetMessageId: m.internetMessageId || null,
        isManual: m.isManual !== undefined ? m.isManual : !m.internetMessageId
      };
    }));

    // Sort descending by timestamp
    enriched.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.json({
      mails: enriched,
      meta: {
        accountName: account.companyName,
        accountEmail: account.email || account.generalEmail || '',
        ownerName: account.ownerName || '',
        ownerEmail: account.ownerEmail || '',
        contactCount: contacts.length,
        orgEmails: Array.from(orgEmails),
        customerEmails: Array.from(customerEmails)
      }
    });
  } catch (error) {
    console.error('Error fetching outlook mails:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/accounts/bulk-delete
 * Bulk Delete Accounts and their related data
 */
router.post('/bulk-delete', requireRole(['Admin', 'Sales Manager', 'Executive']), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'ids array is required' });
  }
  
  try {
    const relatedCollections = ['contacts', 'risks', 'interactions', 'tasks', 'notifications', 'journeyHistory'];
    
    for (const id of ids) {
      const doc = await db.collection('accounts').doc(id).get();
      if (doc.exists) {
        await db.collection('accounts').doc(id).delete();
        
        for (const coll of relatedCollections) {
          const snap = await db.collection(coll).where('accountId', '==', id).get();
          if (snap && snap.docs) {
            for (const d of snap.docs) {
              await db.collection(coll).doc(d.id).delete();
            }
          }
        }
      }
    }
    
    await logActivity(
      req.user.uid,
      req.user.name || req.user.email,
      'Bulk Delete Accounts',
      `Deleted ${ids.length} accounts`
    );
    
    return res.json({ success: true });
  } catch (err) {
    console.error('Error bulk deleting accounts:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/accounts/bulk-import
 * Bulk Import Accounts & Contacts
 */
router.post('/bulk-import', requireRole(['Admin', 'Sales Manager']), async (req, res) => {
  const { records, preview } = req.body;
  if (!Array.isArray(records)) {
    return res.status(400).json({ error: 'records array is required' });
  }

  try {
    const existingAccountsSnap = await db.collection('accounts').get();
    const existingAccounts = existingAccountsSnap.docs.map(d => ({ accountId: d.id, ...d.data() }));

    const existingContactsSnap = await db.collection('contacts').get();
    const existingContacts = existingContactsSnap.docs.map(d => ({ contactId: d.id, ...d.data() }));

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const groupedAccounts = {};
    const warnings = [];

    records.forEach((record, index) => {
      const { companyName, industry, region, email, phone, domain, ownerName, ownerEmail, ownerId, contactName, contactEmail, contactPhone, contactDesignation, contactDepartment, keyContact, contactOwnerName, contactOwnerEmail } = record;
      
      if (!companyName) {
        warnings.push(`Row ${index + 1}: Missing Company Name. Skipped.`);
        return;
      }

      if (email && !emailRegex.test(email)) {
        warnings.push(`Row ${index + 1}: Invalid corporate email for ${companyName}`);
      }
      if (contactEmail && !emailRegex.test(contactEmail)) {
        warnings.push(`Row ${index + 1}: Invalid contact email for ${contactName}`);
      }

      const key = companyName.toLowerCase().trim();
      
      if (!groupedAccounts[key]) {
        const existing = existingAccounts.find(a => a.companyName?.toLowerCase() === key);
        if (existing) {
          warnings.push(`Company "${companyName}" already exists. It will be updated.`);
        }
        groupedAccounts[key] = {
          companyName,
          industry: industry || '',
          region: region || '',
          email: email || '',
          phone: phone || '',
          domain: domain || 'General',
          ownerName: ownerName || req.user.name || 'System User',
          ownerId: ownerId || req.user.uid,
          ownerEmail: ownerEmail || '',
          existingAccountId: existing ? existing.accountId : null,
          contacts: []
        };
      }

      if (contactName) {
        const isDuplicateContactInBatch = groupedAccounts[key].contacts.some(c => c.name.toLowerCase() === contactName.toLowerCase().trim());
        const isDuplicateContactInDB = existingContacts.some(c => c.name?.toLowerCase() === contactName.toLowerCase().trim() && c.accountId === groupedAccounts[key].existingAccountId);
        
        if (isDuplicateContactInBatch || isDuplicateContactInDB) {
          warnings.push(`Contact "${contactName}" already exists. Skipping duplicate.`);
        } else {
          groupedAccounts[key].contacts.push({
            name: contactName,
            email: contactEmail || '',
            phone: contactPhone || '',
            designation: contactDesignation || '',
            department: contactDepartment || '',
            ownerName: contactOwnerName || groupedAccounts[key].ownerName,
            ownerEmail: contactOwnerEmail || groupedAccounts[key].ownerEmail
          });
        }
      }
    });

    const accountsArr = Object.values(groupedAccounts);
    let accountsCreated = 0;
    let contactsCreated = 0;
    
    // For preview we just need to return the grouped accounts
    if (preview) {
      return res.json({
        readyAccounts: accountsArr.length,
        readyContacts: accountsArr.reduce((acc, curr) => acc + curr.contacts.length, 0),
        warnings,
        accounts: accountsArr
      });
    }

    const newlyCreatedAccounts = [];

    // Process actual insertions
    for (const acc of accountsArr) {
      let finalAccountId = acc.existingAccountId;

      if (!finalAccountId) {
        finalAccountId = 'acc-' + Math.random().toString(36).substring(2, 11);
        const newAccount = {
          accountId: finalAccountId,
          companyName: acc.companyName,
          industry: acc.industry || 'Technology',
          region: acc.region || 'Unknown',
          email: acc.email || '',
          phone: acc.phone || '',
          domain: acc.domain || 'General',
          healthScore: 70, // default
          status: 'Warning',
          journeyStage: 'Awareness',
          ownerId: acc.ownerId,
          ownerName: acc.ownerName,
          ownerEmail: acc.ownerEmail,
          createdAt: new Date().toISOString()
        };
        await db.collection('accounts').doc(finalAccountId).set(newAccount);
        accountsCreated++;
        newlyCreatedAccounts.push({
          ...newAccount,
          contacts: acc.contacts || [],
          contactsCount: acc.contacts?.length || 0
        });
      } else {
        // Update existing account
        await db.collection('accounts').doc(finalAccountId).update({
          industry: acc.industry || 'Technology',
          region: acc.region || 'Unknown',
          domain: acc.domain || 'General',
          ownerId: acc.ownerId,
          ownerName: acc.ownerName,
          ownerEmail: acc.ownerEmail,
          updatedAt: new Date().toISOString()
        });
      }

      // Create new contacts
      for (const contact of acc.contacts) {
        const contactId = 'con-' + Math.random().toString(36).substring(2, 11);
        
        const newContact = {
          contactId,
          accountId: finalAccountId,
          name: contact.name,
          email: contact.email || '',
          phone: contact.phone || '',
          designation: contact.designation || '',
          department: contact.department || '',
          hierarchyTag: 'Staff',
          influenceTag: 'Observer',
          ownerId: acc.ownerId, // inherit from account if not provided
          ownerName: contact.ownerName,
          ownerEmail: contact.ownerEmail,
          createdAt: new Date().toISOString()
        };
        await db.collection('contacts').doc(contactId).set(newContact);
        contactsCreated++;
      }

      // Re-evaluate Health Calc
      await calculateAccountHealth(finalAccountId);
    }

    if (accountsCreated > 0 || contactsCreated > 0) {
      await logActivity(req.user.uid, req.user.name, 'Bulk Import Accounts', `Processed ${accountsCreated} new accounts and ${contactsCreated} contacts`);
    }

    // Automatically trigger email notification to technical team and tech head for Outlook & Teams permissions
    if (newlyCreatedAccounts.length > 0) {
      sendNewAccountsTechTeamNotification({
        accounts: newlyCreatedAccounts,
        uploadedBy: {
          name: req.user?.name || req.user?.displayName || 'Administrator',
          email: req.user?.email || 'admin@pulse.com'
        },
        source: 'Bulk NeST BU Excel Importer'
      }).catch(err => console.error('Error triggering tech team notification for bulk accounts:', err));
    }

    return res.json({ 
      result: {
        readyAccounts: accountsCreated, 
        readyContacts: contactsCreated
      }
    });
  } catch (err) {
    console.error('Error in bulk import:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/accounts/:id/health-explanation
 * Gets the current health score factors breakdown.
 */
router.get('/:id/health-explanation', async (req, res) => {
  try {
    const explanation = await getAccountHealthExplanation(req.params.id);
    if (!explanation) {
      return res.status(404).json({ error: 'No health explanation found' });
    }
    return res.json(explanation);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/accounts/:id/health-config
 * Gets the custom health configuration for the account (or global if not set).
 */
router.get('/:id/health-config', async (req, res) => {
  try {
    const { id } = req.params;
    let doc = await db.collection('healthscoreconfigs').doc(id).get();
    if (!doc.exists) {
      doc = await db.collection('healthscoreconfigs').doc('global').get();
    }
    if (!doc.exists) {
      return res.json({ config: null });
    }
    return res.json(doc.data());
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/accounts/:id/health-config
 * Updates the custom health configuration for the account (or global if id=global).
 */
router.put('/:id/health-config', async (req, res) => {
  try {
    const { id } = req.params;
    const { config } = req.body;
    
    if (!config) return res.status(400).json({ error: 'Config object required' });

    const isGlobal = id === 'global';
    await db.collection('healthscoreconfigs').doc(id).set({
      id,
      accountId: isGlobal ? null : id,
      isGlobal,
      config,
      updatedAt: new Date().toISOString()
    });

    let calcResult = null;
    let updatedExplanation = null;
    if (!isGlobal) {
      calcResult = await calculateAccountHealth(id);
      updatedExplanation = await getAccountHealthExplanation(id);
    }

    return res.json({ 
      success: true, 
      id,
      healthScore: calcResult ? calcResult.healthScore : null,
      status: calcResult ? calcResult.status : null,
      tier: calcResult ? calcResult.tier : null,
      explanation: updatedExplanation
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/accounts/:id/recalculate
 * Triggers recalculation of account health using the 7-factor engine from live DB signals.
 */
router.post('/:id/recalculate', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await calculateAccountHealth(id);
    const updatedAccountSnap = await db.collection('accounts').doc(id).get();
    const updatedAccount = updatedAccountSnap.exists ? updatedAccountSnap.data() : { healthScore: result.healthScore, status: result.status };
    return res.json({ success: true, ...result, account: updatedAccount });
  } catch (error) {
    console.error('Error recalculating health score:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;

