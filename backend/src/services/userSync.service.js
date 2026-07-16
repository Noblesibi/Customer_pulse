import { executeSecQuery } from '../config/secDatabase.js';
import { db } from '../config/database.js';
import { ensureNestGroupEmployees } from './nestgroup.seed.js';
import dotenv from 'dotenv';

dotenv.config();

const SYNC_INTERVAL = parseInt(process.env.SEC_SYNC_INTERVAL_MS) || 3600000; // default 1 hour
let syncTimer = null;

/**
 * Maps a role/position combination to the appropriate CRM userType
 */
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
 * Runs the employee synchronization logic
 */
export async function syncEmployees() {
  console.log('🔄 [UserSyncService] Starting employee synchronization...');
  
  try {
    await ensureNestGroupEmployees(db);
    
    // Fetch existing database users to check for UID reuse
    const snap = await db.collection('users').get();
    const currentUsers = snap.docs ? snap.docs.map(doc => doc.data ? doc.data() : doc) : [];

    // Check sentrifugo schema first, then fallback to current database schema
    let employees = await executeSecQuery(`
      SELECT 
        emprole_name, 
        userfullname, 
        emailaddress, 
        contactnumber 
      FROM sentrifugo.main_employees_summary 
      WHERE isactive = 1
    `);

    if (!employees || employees.length === 0) {
      employees = await executeSecQuery(`
        SELECT 
          emprole_name, 
          userfullname, 
          emailaddress, 
          contactnumber 
        FROM main_employees_summary 
        WHERE isactive = 1
      `);
    }
    
    if (!employees || employees.length === 0) {
      console.warn('⚠️ [UserSyncService] No active employees fetched from Sentrifugo database.');
      return;
    }
 
    console.log(`📥 [UserSyncService] Fetched ${employees.length} employees from secondary database. Syncing with local PostgreSQL...`);
    
    let syncedCount = 0;
    const processedSyncedEmails = new Set();
    
    for (const emp of employees) {
      const email = (emp.emailaddress || emp.email || '').toLowerCase().trim();
      const name = emp.userfullname || emp.name;
      const role = emp.emprole_name || emp.role || 'Employee';
      const position = emp.emprole_name || emp.position || 'Staff Member';
      const phone = emp.contactnumber || emp.phone || '';
      
      if (!email || !name || processedSyncedEmails.has(email)) {
        continue;
      }
      processedSyncedEmails.add(email);
      
      // Find if user already exists in PostgreSQL and reuse UID to avoid unique constraint violations
      const existingUser = currentUsers.find(u => u && typeof u.email === 'string' && u.email.toLowerCase() === email);
      const uid = existingUser ? existingUser.uid : 'sec-' + email.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      
      // Determine appropriate user type
      const userType = determineUserType(role, position);
      
      // Upsert into local database
      await db.collection('users').doc(uid).set({
        uid,
        email,
        name,
        role,
        position,
        userType,
        phone,
        department: emp.department || 'Corporate',
        ldap_provisioned: existingUser?.ldap_provisioned || false
      });
      
      syncedCount++;
    }
    
    console.log(`✅ [UserSyncService] Synchronization complete. Synced ${syncedCount} users successfully.`);
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
  
  // Run synchronization on startup (with a small 5s delay to let server boot up first)
  setTimeout(() => {
    syncEmployees();
  }, 5000);
  
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
