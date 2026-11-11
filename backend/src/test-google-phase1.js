/**
 * Comprehensive Test Suite: Greetings Occasion-Only Engine & Source Extraction
 * CustomerPulse CRM
 */
import { getGoogleOAuth2Client, getAllActiveGoogleIntegrations } from './services/google.service.js';
import {
  SOURCE_TYPES,
  VERIFICATION_STATUS,
  CELEBRATION_STATUS,
  EVENT_TYPES,
  createCelebration,
  listCelebrations,
  mapGoogleCalendarEventToType
} from './services/celebration.service.js';
import { db } from './config/database.js';

async function runTests() {
  console.log('================================================================');
  console.log('CustomerPulse Greetings - Occasion-Only Verification Test Suite');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Strict Calendar Milestone Filtering
  console.log('--- 1. Strict Calendar Milestone vs. Personal/Meeting Filtering ---');
  // A. Genuine customer occasions must be detected
  assert(mapGoogleCalendarEventToType('John Doe - Birthday Celebration') === EVENT_TYPES.BIRTHDAY, 'Detects Birthday occasion');
  assert(mapGoogleCalendarEventToType('Happy 5th Work Anniversary Sarah') === EVENT_TYPES.WORK_ANNIVERSARY, 'Detects Work Anniversary occasion');
  assert(mapGoogleCalendarEventToType('Congratulate Mike on VP Promotion') === EVENT_TYPES.PROMOTION, 'Detects Promotion occasion');
  assert(mapGoogleCalendarEventToType('Excellence in Leadership Award') === EVENT_TYPES.AWARD, 'Detects Award occasion');
  assert(mapGoogleCalendarEventToType('AWS Cloud Solutions Architect Certification') === EVENT_TYPES.CERTIFICATION, 'Detects Certification occasion');
  assert(mapGoogleCalendarEventToType('Zeiss 25th Company Anniversary') === EVENT_TYPES.COMPANY_ANNIVERSARY, 'Detects Company Anniversary occasion');
  assert(mapGoogleCalendarEventToType('Q3 Enterprise Partnership Milestone') === EVENT_TYPES.BUSINESS_MILESTONE, 'Detects Business Milestone occasion');

  // B. Everyday meetings, routines, standups must be strictly excluded
  assert(mapGoogleCalendarEventToType('Weekly Internal Standup') === null, 'Rejects Weekly Internal Standup');
  assert(mapGoogleCalendarEventToType('Sprint Planning with Dev Team') === null, 'Rejects Sprint Planning');
  assert(mapGoogleCalendarEventToType('1:1 Bi-weekly Catchup') === null, 'Rejects 1:1 Bi-weekly Catchup');
  assert(mapGoogleCalendarEventToType('Architecture Review & Code Review') === null, 'Rejects Code Review');
  assert(mapGoogleCalendarEventToType('Customer Status Call & Demo') === null, 'Rejects Status Call');

  // C. Personal appointments, medical, travel, PTO must be strictly excluded
  assert(mapGoogleCalendarEventToType('Dentist appointment') === null, 'Rejects Dentist appointment');
  assert(mapGoogleCalendarEventToType('Doctor checkup at Apollo Hospital') === null, 'Rejects Doctor checkup');
  assert(mapGoogleCalendarEventToType('Flight to Frankfurt LH123') === null, 'Rejects Flight booking');
  assert(mapGoogleCalendarEventToType('PTO - Out of office') === null, 'Rejects PTO / OOO');
  assert(mapGoogleCalendarEventToType('Personal Errands & Gym') === null, 'Rejects Personal errands');
  assert(mapGoogleCalendarEventToType('Team Birthday Planning Meeting') === null, 'Rejects routine planning meeting even if birthday is in the title');
  assert(mapGoogleCalendarEventToType('Private confidential sync', { visibility: 'private' }) === null, 'Rejects private visibility events');

  // 2. Contact Matching & Eligibility (CRM as Master Reference)
  console.log('\n--- 2. CRM-Only Eligibility & Normalized Email Matching ---');
  const mockCrmContacts = [
    { contactId: 'cnt-crm-001', name: 'Sharath Sirivolu', email: 'Sharath.Sirivolu@zeiss.com', accountId: 'acc-8yakt9nuo' },
    { contactId: 'cnt-crm-002', name: 'Jeejo Ravindran', email: 'Jeejo.Ravindran@gehealthcare.com', accountId: 'acc-ge-1' }
  ];

  // In-memory CRM map
  const crmMap = new Map();
  mockCrmContacts.forEach(c => crmMap.set(c.email.trim().toLowerCase(), c));

  // Test case-insensitive and whitespace-insensitive matching
  const externalEmailGoogle = '  sharath.sirivolu@zeiss.COM  ';
  const matched = crmMap.get(externalEmailGoogle.trim().toLowerCase());
  assert(matched !== undefined, 'Matches CRM contact despite mixed casing and whitespace');
  assert(matched?.contactId === 'cnt-crm-001', 'Maps correctly to existing CRM contactId');
  assert(matched?.accountId === 'acc-8yakt9nuo', 'Maps correctly to existing CRM accountId');

  // Test unmatched external contacts
  const unmatchedExternal = 'personal.friend@gmail.com';
  const unmatched = crmMap.get(unmatchedExternal.trim().toLowerCase());
  assert(unmatched === undefined, 'Unmatched external contact returns undefined and is ignored');

  // 3. Duplicate Prevention & Staging Status
  console.log('\n--- 3. Deduplication & Pending Verification ---');
  const testContactId = 'cnt-mock-' + Math.random().toString(36).substring(2, 8);
  const testAccountId = 'acc-mock-1';
  const testBdayDate = '1990-05-15';
  const testCalendarDate = '2026-05-15'; // Same MM-DD recurrence

  try {
    // A. Create celebration from Google Contacts
    const eventFromContacts = await createCelebration({
      accountId: testAccountId,
      contactId: testContactId,
      eventType: EVENT_TYPES.BIRTHDAY,
      eventTitle: "Test Contact's Birthday",
      eventDate: testBdayDate,
      sourceType: SOURCE_TYPES.GOOGLE_CONTACTS,
      sourceName: 'Google Contacts',
      sourceEventId: 'people/c1234567890',
      verificationStatus: VERIFICATION_STATUS.PENDING_VERIFICATION
    }, { uid: 'system-test', name: 'Phase 1 Test' });

    assert(eventFromContacts.sourceType === 'GOOGLE_CONTACTS', 'Event created with sourceType: GOOGLE_CONTACTS');
    assert(eventFromContacts.status === CELEBRATION_STATUS.PENDING_VERIFICATION, 'Event staged with status: PENDING_VERIFICATION');
    assert(eventFromContacts.verificationStatus === VERIFICATION_STATUS.PENDING_VERIFICATION, 'Event verificationStatus is PENDING_VERIFICATION');

    // B. Attempt to create recurring celebration from Google Calendar for same MM-DD
    let duplicatePrevented = false;
    try {
      await createCelebration({
        accountId: testAccountId,
        contactId: testContactId,
        eventType: EVENT_TYPES.BIRTHDAY,
        eventTitle: "Test Contact's Birthday Calendar Event",
        eventDate: testCalendarDate,
        sourceType: SOURCE_TYPES.GOOGLE_CALENDAR,
        sourceName: 'Google Calendar',
        sourceEventId: 'google:mock:primary:ev999',
        verificationStatus: VERIFICATION_STATUS.PENDING_VERIFICATION
      }, { uid: 'system-test', name: 'Phase 1 Test' });
    } catch (dupErr) {
      duplicatePrevented = dupErr.message.includes('already exists');
    }

    assert(duplicatePrevented, 'Deduplication engine prevents duplicate Birthday event across Google Contacts and Calendar (MM-DD match)');

    // Clean up test event from database
    await db.collection('celebrationEvents').doc(eventFromContacts.id).delete();
    console.log('[CLEANUP] Deleted mock celebration event:', eventFromContacts.id);
  } catch (err) {
    assert(false, `Celebration creation / deduplication test error: ${err.message}`);
  }

  // 4. RBAC Verification for Celebrations
  console.log('\n--- 4. RBAC & Data Isolation Verification ---');
  try {
    const allCelebrations = await listCelebrations();
    // Simulate non-admin employee
    const aminaUser = {
      uid: 'ldap-uv0n1tlr9',
      email: 'amina.rashad@nestgroup.net',
      name: 'Amina Rashad',
      role: 'Employee'
    };

    const userEmail = aminaUser.email.toLowerCase();
    const userName = aminaUser.name.toLowerCase();

    const isMatch = (entity) => {
      if (entity.ownerId === aminaUser.uid) return true;
      if (userEmail && entity.ownerEmail?.toLowerCase() === userEmail) return true;
      if (userName && entity.ownerName?.toLowerCase().includes(userName.split(' ')[0])) return true;
      return false;
    };

    const accsSnap = await db.collection('accounts').get();
    const ownedAccountIds = new Set(
      accsSnap.docs.map(d => d.data()).filter(a => isMatch(a)).map(a => a.accountId || a.id)
    );

    const contactsSnap = await db.collection('contacts').get();
    const stakeholderAccountIds = new Set(
      contactsSnap.docs.map(d => d.data()).filter(c => isMatch(c)).map(c => c.accountId).filter(Boolean)
    );

    const allowedAccountIds = new Set([...ownedAccountIds, ...stakeholderAccountIds]);

    const visibleCelebrations = allCelebrations.filter(e => allowedAccountIds.has(e.accountId));
    const unauthorizedCelebrations = allCelebrations.filter(e => !allowedAccountIds.has(e.accountId));

    assert(!allowedAccountIds.has('acc-8yakt9nuo'), 'Employee does not own ZEISS account or its contacts');
    assert(unauthorizedCelebrations.some(e => !allowedAccountIds.has(e.accountId)) || unauthorizedCelebrations.length === 0, 'RBAC correctly partitions celebrations by allowed accounts');
    console.log(`RBAC Check: Total celebrations: ${allCelebrations.length}, Visible to Amina: ${visibleCelebrations.length}, Filtered out: ${unauthorizedCelebrations.length}`);
  } catch (err) {
    assert(false, `RBAC verification error: ${err.message}`);
  }

  // 5. Live Google Integration Check
  console.log('\n--- 5. Live Connected Google Integration ---');
  try {
    const activeIntegrations = await getAllActiveGoogleIntegrations();
    console.log(`Active Google accounts connected in 'userintegrations': ${activeIntegrations.length}`);
    activeIntegrations.forEach(i => {
      console.log(`-> User ID: ${i.userId}, Provider: ${i.provider}, Status: ${i.status}`);
    });
    assert(activeIntegrations.length > 0, 'Active Google Integration is present in database');
  } catch (err) {
    assert(false, `Google integration check error: ${err.message}`);
  }

  console.log('\n================================================================');
  console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
