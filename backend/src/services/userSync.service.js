import { executeSecQuery } from '../config/secDatabase.js';
import { db } from '../config/database.js';
import { ensureNestGroupEmployees } from './nestgroup.seed.js';
import { userTypeToRole } from '../config/rbac.js';
import dotenv from 'dotenv';

dotenv.config();

const SYNC_INTERVAL = parseInt(process.env.SEC_SYNC_INTERVAL_MS) || 3600000; // default 1 hour
let syncTimer = null;

/**
 * Maps a role/position/department combination to the appropriate CRM userType
 */
export function determineUserType(role, position, department) {
  const r = (role || '').toLowerCase();
  const p = (position || '').toLowerCase();
  const d = (department || '').toLowerCase();

  if (p.includes('ceo') || p.includes('chief executive') || r.includes('ceo')) return 'CEO';
  if (r.includes('admin') || p.includes('admin') || p.includes('administrator')) return 'Admin';

  // Leadership & Functional Heads
  if (p.includes('functional head') || p.includes('vice president') || p.includes('vp') || p.includes('director') || 
      (p.includes('head') && !p.includes('bu head') && !p.includes('delivery head') && !p.includes('unit head'))) {
    return 'Functional Head';
  }

  // Delivery / Unit Heads
  if (p.includes('delivery head') || r.includes('delivery head')) return 'Delivery Head';
  if (p.includes('bu head') || r.includes('bu head') || p.includes('business unit head') || p.includes('unit head')) return 'BU Head';

  // Managers
  if (p.includes('delivery manager') || r.includes('delivery manager')) return 'Delivery Manager';
  if (p.includes('project manager') || r.includes('project manager') || p.includes('program manager')) return 'Project Manager';
  if (p.includes('sales manager') || r.includes('sales manager')) return 'Sales Manager';
  if (p.includes('account manager') || r.includes('account manager')) return 'Account Manager';
  if (p.includes('manager') || r.includes('manager') || p.includes('lead') || p.includes('team lead')) return 'Project Manager';

  return 'Employee';
}

/**
 * Runs the employee synchronization logic
 */
export async function syncEmployees() {
  console.log('🔄 [UserSyncService] Starting employee synchronization...');
  
  try {
    await ensureNestGroupEmployees(db);
    
    // Fetch existing database users to check for UID reuse
    const snap = await db.collection('users').get();
    const currentUsers = snap.docs ? snap.docs.map(doc => doc.data ? doc.data() : doc) : [];

    // Query Sentrifugo employee data using SELECT * to capture all available fields
    let employees = await executeSecQuery(`
      SELECT * 
      FROM sentrifugo.main_employees_summary 
      WHERE isactive = 1
    `);

    if (!employees || employees.length === 0) {
      employees = await executeSecQuery(`
        SELECT * 
        FROM main_employees_summary 
        WHERE isactive = 1
      `);
    }

    // Fallback query if SELECT * has schema restrictions
    if (!employees || employees.length === 0) {
      employees = await executeSecQuery(`
        SELECT 
          emprole_name, 
          userfullname, 
          emailaddress, 
          contactnumber 
        FROM sentrifugo.main_employees_summary 
        WHERE isactive = 1
      `);
    }
    
    if (!employees || employees.length === 0) {
      console.warn('⚠️ [UserSyncService] No active employees fetched from Sentrifugo database.');
      return;
    }
 
    console.log(`📥 [UserSyncService] Fetched ${employees.length} employees from secondary database. Syncing with local PostgreSQL...`);
    if (employees.length > 0) {
      console.log('📋 [UserSyncService] Available Sentrifugo columns:', Object.keys(employees[0]).join(', '));
    }
    
    let syncedCount = 0;
    const processedSyncedEmails = new Set();
    
    for (const emp of employees) {
      const email = (emp.emailaddress || emp.email || emp.user_email || emp.useremail || '').toString().toLowerCase().trim();
      const name = (emp.userfullname || emp.name || emp.employee_name || emp.fullname || emp.emp_name || '').toString().trim();
      
      if (!email || !name || processedSyncedEmails.has(email)) {
        continue;
      }
      processedSyncedEmails.add(email);

      // Extract Employee ID
      const employeeId = (emp.employee_id || emp.employeeid || emp.empid || emp.emp_id || emp.employee_code || emp.identity || emp.user_id || '').toString().trim();

      // Extract Department and Business Unit
      const rawDept = (emp.department_name || emp.department || emp.dept_name || emp.departmentname || emp.dept || '').toString().trim();
      const rawBu = (emp.businessunit_name || emp.business_unit_name || emp.businessunit || emp.business_unit || emp.bu_name || emp.unit_name || '').toString().trim();
      
      const department = rawDept || rawBu || 'Corporate';
      const bu = rawBu || rawDept || 'Corporate';

      // Extract Designation, Role, and Position
      const roleName = (emp.emprole_name || emp.role || 'Employee').toString().trim();
      const position = (emp.jobtitle_name || emp.designation || emp.job_role || emp.position || emp.emprole_name || 'Staff Member').toString().trim();
      const jobRole = (emp.job_role || emp.designation || emp.jobtitle_name || position || '').toString().trim();

      // Extract Phone
      const phone = (emp.contactnumber || emp.phone || emp.mobile || '').toString().trim();

      // Extract Reporting Manager details
      const reportingManagerName = (emp.reporting_manager_name || emp.reporting_manager || emp.reportingmanager || emp.manager_name || emp.reporting_to || '').toString().trim();
      const reportingTo = (emp.reporting_manager_email || emp.reporting_to_email || emp.manager_email || (reportingManagerName.includes('@') ? reportingManagerName : '')).toString().trim();

      // Determine userType and mapped CRM permission role
      const userType = determineUserType(roleName, position, department);
      const role = userTypeToRole(userType);
      
      // Find if user already exists in PostgreSQL and reuse UID to avoid unique constraint violations
      const existingUser = currentUsers.find(u => u && typeof u.email === 'string' && u.email.toLowerCase() === email);
      const uid = existingUser ? existingUser.uid : 'sec-' + email.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      
      // Upsert into local database with all fields
      const userData = {
        ...(existingUser || {}),
        uid,
        email,
        name: name || existingUser?.name || '',
        role: role || existingUser?.role || 'Employee',
        position: position || existingUser?.position || 'Staff Member',
        userType: userType || existingUser?.userType || 'Employee',
        department: department || existingUser?.department || 'Corporate',
        bu: bu || existingUser?.bu || department || 'Corporate',
        phone: phone || existingUser?.phone || '',
        employeeId: employeeId || existingUser?.employeeId || '',
        reportingTo: reportingTo || existingUser?.reportingTo || '',
        reportingManagerName: reportingManagerName || existingUser?.reportingManagerName || '',
        jobRole: jobRole || existingUser?.jobRole || '',
        ldap_provisioned: existingUser?.ldap_provisioned || false,
        createdAt: existingUser?.createdAt || new Date().toISOString()
      };

      delete userData.id;

      await db.collection('users').doc(uid).set(userData);
      
      syncedCount++;
    }
    
    console.log(`✅ [UserSyncService] Synchronization complete. Synced ${syncedCount} users with full profile details successfully.`);
  } catch (err) {
    console.error('❌ [UserSyncService] Error during employee synchronization:', err.message);
  }
}

/**
 * Starts the periodic synchronization scheduler
 */
export function startSyncScheduler() {
  if (syncTimer) {
    clearInterval(syncTimer);
  }
  
  // Run synchronization immediately on startup
  syncEmployees();
  
  // Set up periodic sync
  syncTimer = setInterval(() => {
    syncEmployees();
  }, SYNC_INTERVAL);
  
  console.log(`⏰ [UserSyncService] Synchronization scheduler started. Interval: ${SYNC_INTERVAL / 1000 / 60} minutes.`);
}

/**
 * Stops the scheduler
 */
export function stopSyncScheduler() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('🛑 [UserSyncService] Synchronization scheduler stopped.');
  }
}
