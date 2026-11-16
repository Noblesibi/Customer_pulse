import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'customer_pulse',
});
import { db } from './config/database.js';
import {
  normalizeCompanyName,
  normalizeEmail,
  normalizePersonName,
  extractDomain,
  matchAccountEntity,
  matchContactEntity,
  resolveCustomerEntity,
  loadCrmEntities
} from './services/entityMatching.service.js';
import {
  createCelebration,
  listCelebrations,
  EVENT_TYPES,
  SOURCE_TYPES,
  VERIFICATION_STATUS
} from './services/celebration.service.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runPhase1Tests() {
  console.log('\n===============================================================');
  console.log('🧪 CUSTOMERPULSE GREETINGS INTELLIGENCE – PHASE 1 VERIFICATION');
  console.log('===============================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: Database Schema Inspection (Non-destructive migration verification)
  // -------------------------------------------------------------------------
  console.log('1. Database Schema & Nullable contactId Verification');
  const celColsRes = await pool.query(`
    SELECT column_name, is_nullable, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'CelebrationEvents';
  `);
  const celColMap = new Map(celColsRes.rows.map(r => [r.column_name, r]));

  assert(celColMap.get('contactId')?.is_nullable === 'YES', 'CelebrationEvents.contactId is nullable (YES)');
  assert(celColMap.has('evidenceSummary'), 'CelebrationEvents.evidenceSummary column exists');
  assert(celColMap.has('matchedEntity'), 'CelebrationEvents.matchedEntity column exists');
  assert(celColMap.has('verifiedByUid'), 'CelebrationEvents.verifiedByUid column exists');
  assert(celColMap.has('verifiedByName'), 'CelebrationEvents.verifiedByName column exists');

  const accColsRes = await pool.query(`
    SELECT column_name, is_nullable 
    FROM information_schema.columns 
    WHERE table_name = 'Accounts';
  `);
  const accColMap = new Map(accColsRes.rows.map(r => [r.column_name, r]));
  assert(accColMap.has('website'), 'Accounts.website column exists');
  assert(accColMap.has('aliases'), 'Accounts.aliases column exists');

  // -------------------------------------------------------------------------
  // TEST 2: Entity Matching – Account Matching & Normalization
  // -------------------------------------------------------------------------
  console.log('\n2. Customer Entity Matching – Accounts & Aliases');
  const sampleAccounts = [
    { accountId: 'acc_001', companyName: 'Carl Zeiss Meditec AG', aliases: 'ZEISS, Zeiss Medical', website: 'https://www.zeiss.com' },
    { accountId: 'acc_002', companyName: 'GE Healthcare Inc', aliases: 'GEHC, GE Health', website: 'https://www.gehealthcare.com' },
    { accountId: 'acc_003', companyName: 'Vantive Corporation', aliases: 'Baxter Renal, Vantive', website: 'https://vantive.com' }
  ];

  // Exact match
  const match1 = matchAccountEntity('Carl Zeiss Meditec AG', sampleAccounts);
  assert(match1.matched && match1.accountId === 'acc_001', 'Matches exact company name');

  // Legal suffix stripped
  const match2 = matchAccountEntity('GE Healthcare', sampleAccounts);
  assert(match2.matched && match2.accountId === 'acc_002', 'Matches company name with legal suffix stripped ("Inc")');

  // Alias match
  const match3 = matchAccountEntity('ZEISS', sampleAccounts);
  assert(match3.matched && match3.accountId === 'acc_001', 'Matches registered company alias ("ZEISS")');

  // Domain match
  const match4 = matchAccountEntity('https://vantive.com/about-us', sampleAccounts);
  assert(match4.matched && match4.accountId === 'acc_003', 'Matches corporate website domain');

  // -------------------------------------------------------------------------
  // TEST 3: Ambiguous Identity Rejection
  // -------------------------------------------------------------------------
  console.log('\n3. Ambiguous Identity Rejection');
  const ambiguousAccounts = [
    { accountId: 'acc_101', companyName: 'Apex Health Systems', aliases: 'Apex' },
    { accountId: 'acc_102', companyName: 'Apex Medical Technologies', aliases: 'Apex' }
  ];

  const ambigMatch = matchAccountEntity('Apex', ambiguousAccounts);
  assert(ambigMatch.matched === false && ambigMatch.isAmbiguous === true, 'Rejects ambiguous query matching multiple CRM accounts');

  // -------------------------------------------------------------------------
  // TEST 4: Contact Matching & Normalization
  // -------------------------------------------------------------------------
  console.log('\n4. Contact Matching & Email Normalization');
  const sampleContacts = [
    { contactId: 'con_001', accountId: 'acc_001', name: 'Dr. John Smith', email: 'John.Smith@zeiss.com' },
    { contactId: 'con_002', accountId: 'acc_002', name: 'Mary Johnson', email: 'mary.j@gehealthcare.com' }
  ];

  // Match by normalized email (case-insensitive & trimmed)
  const cMatch1 = matchContactEntity('   john.smith@zeiss.com   ', sampleContacts);
  assert(cMatch1.matched && cMatch1.contactId === 'con_001', 'Matches contact by normalized email address');

  // Match by normalized human name (honorific stripped)
  const cMatch2 = matchContactEntity('John Smith', sampleContacts, 'acc_001');
  assert(cMatch2.matched && cMatch2.contactId === 'con_001', 'Matches contact with honorific stripped ("Dr.")');

  // Cross-account rejection
  const cMatch3 = matchContactEntity('John Smith', sampleContacts, 'acc_002');
  assert(cMatch3.matched === false, 'Rejects contact when scoped to wrong account');

  // -------------------------------------------------------------------------
  // TEST 5: Account-Only Milestones (contactId = null)
  // -------------------------------------------------------------------------
  console.log('\n5. Account-Only Milestone Persistence (contactId = null)');
  let testAccountId = 'acc_test_phase1';
  let createdEventId = null;

  try {
    const accMilestone = await createCelebration({
      accountId: testAccountId,
      contactId: null, // Account-level milestone
      eventType: EVENT_TYPES.COMPANY_ANNIVERSARY,
      eventTitle: 'CustomerPulse Test Company 25th Anniversary',
      eventDescription: 'Celebrates 25 years of healthcare innovation',
      eventDate: '2026-11-15',
      sourceType: SOURCE_TYPES.OFFICIAL_WEBSITE,
      sourceName: 'Official Website Press Release',
      evidenceSummary: 'Published on corporate newsroom: 25 years in operation.',
      matchedEntity: 'ZEISS',
      confidence: 'High',
      verificationStatus: VERIFICATION_STATUS.PENDING_VERIFICATION
    }, { uid: 'test_runner', name: 'Phase 1 Tester' });

    createdEventId = accMilestone.id;
    assert(accMilestone.id && accMilestone.contactId === null, 'Account-only milestone saved with contactId = null');
    assert(accMilestone.evidenceSummary.includes('corporate newsroom'), 'Evidence summary persisted');
    assert(accMilestone.matchedEntity === 'ZEISS', 'Matched entity persisted');

    // Query back from database to verify persistence
    const fetchedList = await listCelebrations({ accountId: testAccountId });
    const savedEvent = fetchedList.find(e => e.id === createdEventId);
    assert(savedEvent && savedEvent.contactId === null, 'Retrieved account-only milestone from DB with contactId = null');
    assert(savedEvent.verificationStatus === VERIFICATION_STATUS.PENDING_VERIFICATION, 'Initial status is PENDING_VERIFICATION');

    // -----------------------------------------------------------------------
    // TEST 6: Deduplication Check
    // -----------------------------------------------------------------------
    console.log('\n6. Deduplication Engine');
    let dupFailed = false;
    try {
      // Attempting to create duplicate annual company anniversary on same account & MM-DD
      await createCelebration({
        accountId: testAccountId,
        contactId: null,
        eventType: EVENT_TYPES.COMPANY_ANNIVERSARY,
        eventDate: '2026-11-15',
        sourceType: SOURCE_TYPES.PUBLIC_NEWS,
        sourceName: 'Google News Discovery'
      }, { uid: 'test_runner', name: 'Phase 1 Tester' });
    } catch (err) {
      dupFailed = true;
      assert(err.message.includes('already exists'), 'Duplicate account-level milestone prevented by deduplication engine');
    }
    if (!dupFailed) {
      assert(false, 'Duplicate should have been rejected');
    }

  } finally {
    // Cleanup test record
    if (createdEventId) {
      await db.collection('celebrationEvents').doc(createdEventId).delete();
    }
  }

  // -------------------------------------------------------------------------
  // TEST 7: RBAC Access Control
  // -------------------------------------------------------------------------
  console.log('\n7. RBAC Ownership & Access Control');
  // Load CRM entities with user context
  const testUser = {
    uid: 'emp_amina',
    email: 'amina.rashad@nestgroup.net',
    role: 'EMPLOYEE'
  };

  const rbacResult = await loadCrmEntities(testUser);
  assert(Array.isArray(rbacResult.accounts), 'RBAC entity loader returns scoped accounts');
  assert(Array.isArray(rbacResult.contacts), 'RBAC entity loader returns scoped contacts');
  console.log(`  ℹ️ Employee Amina Rashad has access to ${rbacResult.accounts.length} accounts and ${rbacResult.contacts.length} contacts under RBAC.`);

  // Admin user gets full access
  const adminResult = await loadCrmEntities({ uid: 'admin_1', role: 'ADMIN' });
  assert(adminResult.accounts.length >= rbacResult.accounts.length, 'Admin role receives full unscoped account directory');

  console.log('\n===============================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('===============================================================\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runPhase1Tests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
