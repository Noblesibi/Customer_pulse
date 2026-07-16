import { Router } from 'express';
import { fetchEmployeeFromHR } from '../services/hr.service.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { ensureNestGroupEmployees } from '../services/nestgroup.seed.js';
import { syncEmployees } from '../services/userSync.service.js';

const router = Router();
router.use(authenticateToken);

/**
 * GET /api/employees
 * Returns all employees and staff in the company directory.
 */
router.get('/', async (req, res) => {
  try {
    const { db } = await import('../config/database.js');
    await ensureNestGroupEmployees(db);
    const snap = await db.collection('users').get();
    const employees = snap.docs.map(doc => {
      const u = doc.data();
      return {
        ...u,
        uid:                  u.uid,
        email:                u.email,
        name:                 u.name,
        role:                 u.role,
        position:             u.position             || '',
        userType:             u.userType             || '',
        department:           u.department           || '',
        reportingTo:          u.reportingTo          || '',
        reportingManagerName: u.reportingManagerName || '',
        bu:                   u.bu                   || '',
        buHeadName:           u.buHeadName           || '',
        buHeadEmail:          u.buHeadEmail          || '',
        phone:                u.phone                || '',
        employeeId:           u.employeeId           || '',
        jobRole:              u.jobRole              || '',
        project:              u.project              || '',
        projects:             u.projects             || [],
        employees:            u.employees            || [],
        ldap_provisioned:     u.ldap_provisioned     || false,
        last_login:           u.last_login           || null,
        createdAt:            u.createdAt            || new Date().toISOString()
      };
    });
    return res.json(employees);
  } catch (error) {
    console.error('Error in GET /api/employees:', error);
    return res.status(500).json({ error: 'Failed to fetch employees list', message: error.message });
  }
});

/**
 * POST /api/employees/hr-data
 * Proxies the request payload to Nest Digital's external HR employee details API.
 * Expects the payload structure required by POST https://hrapps.nestdigital.com:8085/api/employee/GetEmployeeData
 */
router.post('/hr-data', async (req, res) => {
  try {
    const data = await fetchEmployeeFromHR(req.body);
    return res.json(data);
  } catch (error) {
    console.error('Error in /api/employees/hr-data route handler:', error.message);
    return res.status(500).json({ 
      error: 'Failed to retrieve data from external HR service', 
      message: error.message 
    });
  }
});

// Helper functions for user mapping
function determineUserType(role, position) {
  const r = (role || '').toLowerCase();
  const p = (position || '').toLowerCase();
  if (p.includes('ceo') || p.includes('chief executive')) return 'CEO';
  if (p.includes('head') || p.includes('director') || p.includes('vp')) return 'Functional Head';
  if (r.includes('manager') || p.includes('manager') || p.includes('lead')) return 'BU Head';
  if (r.includes('admin')) return 'Admin';
  return 'Employee';
}

/**
 * POST /api/employees/sync
 * Syncs all directory users and crawls their manager hierarchy recursively using a BFS queue.
 */
router.post('/sync', async (req, res) => {
  try {
    const { db } = await import('../config/database.js');
    const { userTypeToRole } = await import('../config/rbac.js');
    
    // First, sync users from secondary database (MySQL)
    try {
      console.log('[Sync] Initializing secondary database sync (Sentrifugo)...');
      await syncEmployees();
    } catch (secErr) {
      console.error('[Sync] Secondary sync error before crawl:', secErr.message);
    }

    // Clean up legacy hardcoded users
    await ensureNestGroupEmployees(db);

    // 1. Fetch current users in database to keep track of existing records
    const snap = await db.collection('users').get();
    const currentUsers = snap.docs.map(doc => doc.data ? doc.data() : doc);
    
    const emailQueue = new Set();
    const processedEmails = new Set();

    // Seed the crawl queue using all users from the secondary database and active users in local DB
    currentUsers.forEach(u => {
      if (u && typeof u.email === 'string' && u.email.includes('@')) {
        emailQueue.add(u.email.toLowerCase().trim());
      }
    });

    // Also seed any @nestgroup.net emails referenced across other CRM collections (Contacts, Accounts, Tasks)
    try {
      for (const col of ['contacts', 'accounts', 'interactions', 'tasks']) {
        const colSnap = await db.collection(col).get();
        (colSnap.docs || []).forEach(d => {
          const data = d.data ? d.data() : d;
          ['email', 'ownerEmail', 'reportingTo', 'reportingManagerEmail'].forEach(k => {
            if (typeof data[k] === 'string' && data[k].toLowerCase().includes('@nestgroup.net')) {
              emailQueue.add(data[k].toLowerCase().trim());
            }
          });
        });
      }
    } catch (colErr) {
      // Non-fatal if table query fails
    }

    let successCount = 0;

    // 2. BFS Traversal Loop
    while (emailQueue.size > 0) {
      const email = Array.from(emailQueue)[0];
      emailQueue.delete(email);
      processedEmails.add(email);

      try {
        console.log(`[HR Crawl] Querying details for: ${email}`);
        const result = await fetchEmployeeFromHR({ username: email });
        
        if (result && result.success && result.data) {
          const hr = result.data;
          
          const name = typeof hr["Employee Name"] === 'string' ? hr["Employee Name"] : '';
          if (!name) continue; // Skip empty profile payloads

          const position = typeof hr["Designation"] === 'string' ? hr["Designation"] : '';
          const department = typeof hr["Department"] === 'string' ? hr["Department"] : '';
          const bu = typeof hr["Business Unit"] === 'string' ? hr["Business Unit"] : '';
          
          const managerEmail = hr["Reporting Manager Email"] && typeof hr["Reporting Manager Email"] === 'string'
            ? hr["Reporting Manager Email"].toLowerCase().trim()
            : null;
          const buHeadEmail = hr["Business Unit Head Email"] && typeof hr["Business Unit Head Email"] === 'string'
            ? hr["Business Unit Head Email"].toLowerCase().trim()
            : null;

          // Push manager & BU Head to queue if not yet processed
          if (managerEmail && !processedEmails.has(managerEmail)) {
            emailQueue.add(managerEmail);
          }
          if (buHeadEmail && !processedEmails.has(buHeadEmail)) {
            emailQueue.add(buHeadEmail);
          }

          // Determine userType and role
          const userType = determineUserType(hr["Jobrole"] || position, position);
          const role = userTypeToRole(userType);

          // Find or create database record
          const existingUser = currentUsers.find(u => u && typeof u.email === 'string' && u.email.toLowerCase() === email);
          const uid = existingUser ? existingUser.uid : 'hr-' + Math.random().toString(36).substring(2, 11);

          const updatedData = {
            ...(existingUser || {}),
            uid,
            email,
            name:                 name || existingUser?.name || '',
            position:             position || existingUser?.position || '',
            department:           department || existingUser?.department || '',
            bu:                   bu || existingUser?.bu || '',
            reportingTo:          managerEmail || existingUser?.reportingTo || '',
            reportingManagerName: (typeof hr["Reporting Manager"] === 'string' ? hr["Reporting Manager"] : existingUser?.reportingManagerName) || '',
            buHeadName:           (typeof hr["Business Unit Head"] === 'string' ? hr["Business Unit Head"] : existingUser?.buHeadName) || '',
            buHeadEmail:          buHeadEmail || existingUser?.buHeadEmail || '',
            phone:                (typeof hr["Phone Number"] === 'string' ? hr["Phone Number"] : existingUser?.phone) || '',
            employeeId:           (typeof hr["Employee ID"] === 'string' ? hr["Employee ID"] : existingUser?.employeeId) || '',
            jobRole:              (typeof hr["Jobrole"] === 'string' ? hr["Jobrole"] : existingUser?.jobRole) || '',
            userType,
            role,
            ldap_provisioned:     existingUser?.ldap_provisioned || false,
            createdAt:            existingUser ? existingUser.createdAt : new Date().toISOString()
          };

          delete updatedData.id;

          await db.collection('users').doc(uid).set(updatedData);
          successCount++;
        }
      } catch (err) {
        console.error(`[HR Crawl] Failed to process ${email}:`, err.message);
      }
    }

    // Secondary database sync was completed at the start of the crawl

    const snapAfter = await db.collection('users').get();
    const totalUsers = snapAfter.docs?.length || successCount;

    return res.json({ success: true, message: `Successfully synchronized ${totalUsers} users across directory and secondary hierarchy.` });
  } catch (error) {
    console.error('Error in /api/employees/sync route handler:', error);
    return res.status(500).json({ error: 'Failed to sync directory hierarchy with HR API', message: error.message });
  }
});

export default router;
