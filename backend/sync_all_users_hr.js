import dotenv from 'dotenv';
import { db } from './src/config/database.js';
import { fetchEmployeeFromHR } from './src/services/hr.service.js';
import { userTypeToRole } from './src/config/rbac.js';
import { executeSecQuery } from './src/config/secDatabase.js';

dotenv.config();

function determineUserType(role, position) {
  const r = (role || '').toLowerCase();
  const p = (position || '').toLowerCase();

  if (p.includes('ceo') || p.includes('chief executive')) return 'CEO';
  if (p.includes('head') || p.includes('director') || p.includes('vp')) return 'Functional Head';
  if (r.includes('manager') || p.includes('manager') || p.includes('lead')) return 'BU Head';
  if (r.includes('admin')) return 'Admin';
  
  return 'Employee';
}

async function syncAll() {
  console.log('🔄 Starting full database and company directory sync with Nest Digital HR API...');
  
  setTimeout(async () => {
    try {
      let secEmployees = [];
      try {
        secEmployees = await executeSecQuery(`
          SELECT emailaddress FROM sentrifugo.main_employees_summary WHERE isactive = 1
        `);
        if (!secEmployees || secEmployees.length === 0) {
          secEmployees = await executeSecQuery(`
            SELECT emailaddress FROM main_employees_summary WHERE isactive = 1
          `);
        }
      } catch (err) {
        console.error('Error fetching from secondary database:', err.message);
      }

      const snap = await db.collection('users').get();
      const currentUsers = snap.docs ? snap.docs.map(doc => doc.data ? doc.data() : doc) : [];
      console.log(`Fetched ${currentUsers.length} existing users from database.`);

      const emailQueue = new Set();
      const processedEmails = new Set();

      if (secEmployees && secEmployees.length > 0) {
        secEmployees.forEach(emp => {
          if (emp.emailaddress) emailQueue.add(emp.emailaddress.toLowerCase().trim());
        });
      }


      currentUsers.forEach(u => {
        if (u && typeof u.email === 'string' && u.email.includes('@')) {
          emailQueue.add(u.email.toLowerCase().trim());
        }
      });

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
      } catch (colErr) {}

      let successCount = 0;

      while (emailQueue.size > 0) {
        const email = Array.from(emailQueue)[0];
        emailQueue.delete(email);
        processedEmails.add(email);

        console.log(`\nSyncing user: ${email}...`);

        try {
          const result = await fetchEmployeeFromHR({ username: email });
          if (result && result.success && result.data) {
            const hr = result.data;
            console.log(`✅ Found HR record for ${email}. Updating details...`);

            const name = typeof hr["Employee Name"] === 'string' ? hr["Employee Name"] : '';
            if (!name) continue;

            const position = typeof hr["Designation"] === 'string' ? hr["Designation"] : '';
            const department = typeof hr["Department"] === 'string' ? hr["Department"] : '';
            const bu = typeof hr["Business Unit"] === 'string' ? hr["Business Unit"] : '';
            
            const managerEmail = hr["Reporting Manager Email"] && typeof hr["Reporting Manager Email"] === 'string'
              ? hr["Reporting Manager Email"].toLowerCase().trim()
              : null;
            const buHeadEmail = hr["Business Unit Head Email"] && typeof hr["Business Unit Head Email"] === 'string'
              ? hr["Business Unit Head Email"].toLowerCase().trim()
              : null;

            if (managerEmail && !processedEmails.has(managerEmail)) {
              emailQueue.add(managerEmail);
            }
            if (buHeadEmail && !processedEmails.has(buHeadEmail)) {
              emailQueue.add(buHeadEmail);
            }

            const existingUser = currentUsers.find(u => u && typeof u.email === 'string' && u.email.toLowerCase() === email);
            const uid = existingUser ? existingUser.uid : 'hr-' + Math.random().toString(36).substring(2, 11);

            const userType = determineUserType(hr["Jobrole"] || position, position);
            const role = userTypeToRole(userType);

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
            if (!existingUser) currentUsers.push(updatedData);
            console.log(`   Updated: Name="${name}", Position="${position}", BU="${bu}", Manager="${managerEmail}"`);
            successCount++;
          } else {
            console.log(`⚠️ No HR record found for ${email} (skipped). Message: ${result?.message || 'Unknown error'}`);
          }
        } catch (err) {
          console.error(`❌ Failed to sync ${email}:`, err.message);
        }
      }

      console.log(`\n==================================================`);
      console.log(`🎉 Sync Completed! Successfully synchronized ${successCount} users.`);
    } catch (e) {
      console.error('Fatal sync error:', e.message);
    }
    process.exit(0);
  }, 1500);
}

syncAll();
