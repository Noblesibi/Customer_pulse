/**
 * test-phase2-postgres.js
 *
 * Separated PostgreSQL Integration Test Suite for CustomerPulse Phase 2.
 * Runs exclusively against the isolated PostgreSQL test database `customer_pulse_phase2_test`.
 * Strictly refuses execution if `DB_DATABASE` is `customer_pulse`.
 */

process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'postgres';
process.env.DB_DATABASE = 'customer_pulse_phase2_test';
process.env.SMTP_HOST = '';
process.env.AI_FORCE_LOCAL = 'true';
process.env.MICROSOFT_TEAMS_MOCK = 'true';
process.env.MICROSOFT_TEAMS_SOURCE_ENABLED = 'false';
process.env.GRAPH_CALENDAR_DISCOVERY_ENABLED = 'false';
process.env.TEAMS_POLICY_ADAPTER_MODE = 'mock';
process.env.OUTLOOK_RBAC_ADAPTER_MODE = 'mock';

if (process.env.DB_DATABASE === 'customer_pulse') {
  throw new Error('SECURITY ABORT: test-phase2-postgres.js must NEVER run against production customer_pulse database.');
}

const { db, initializeDatabase } = await import('./config/postgres.js');
const { ensureNestGroupEmployees } = await import('./services/nestgroup.seed.js');
const {
  setMockAutoGrantEnabled,
  resetMockTeamsPolicyState,
} = await import('./services/teamsPolicyAdapter.service.js');
const {
  OUTLOOK_STATUS,
  setMockOutlookAutoGrantEnabled,
  resetMockOutlookMailboxState,
} = await import('./services/outlookMailboxAdapter.service.js');
const {
  ORGANIZER_STATUS,
  recalculateEligibleOrganizers,
  processPolicySyncQueue,
} = await import('./services/organizerSync.service.js');
const { createInteraction } = await import('./services/interaction.service.js');
const {
  listAiRecommendations,
  reviewAiRecommendation,
  RECOMMENDATION_STATUS,
  RECOMMENDATION_CATEGORIES,
} = await import('./services/aiRecommendationReview.service.js');

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

async function cleanupTestEntities(accountIds, contactIds, interactionIds, recIds, riskIds, taskIds) {
  for (const id of taskIds) await db.collection('tasks').doc(id).delete().catch(() => {});
  for (const id of riskIds) await db.collection('risks').doc(id).delete().catch(() => {});
  for (const id of recIds) await db.collection('airecommendations').doc(id).delete().catch(() => {});
  for (const id of interactionIds) await db.collection('interactions').doc(id).delete().catch(() => {});
  for (const id of contactIds) await db.collection('contacts').doc(id).delete().catch(() => {});
  for (const id of accountIds) await db.collection('accounts').doc(id).delete().catch(() => {});
  for (const orgKey of ['pg-test-emp-1', 'pg-test-emp-2']) {
    await db.collection('authorizedorganizers').doc(orgKey).delete().catch(() => {});
    const jobsSnap = await db.collection('organizerpolicysync').where('organizerKey', '==', orgKey).get().catch(() => ({ docs: [] }));
    for (const d of jobsSnap.docs || []) {
      await db.collection('organizerpolicysync').doc(d.id).delete().catch(() => {});
    }
  }
}

async function runPostgresSuite() {
  console.log('\n================================================================');
  console.log('🐘 PHASE 2 POSTGRESQL INTEGRATION TEST SUITE');
  console.log(`   Target Test Database: ${process.env.DB_DATABASE}`);
  console.log('================================================================\n');

  await initializeDatabase();
  resetMockTeamsPolicyState();
  resetMockOutlookMailboxState();

  // Seed two synthetic test employees in the isolated `customer_pulse_phase2_test` database
  // before capturing the read-only `Users` baseline snapshot.
  await db.collection('users').doc('pg-test-emp-1').set({
    uid: 'pg-test-emp-1',
    employeeId: 'EMP_PG_101',
    email: 'pg.emp1@nestgroup.net',
    name: 'PG Test Employee 1',
    role: 'Employee',
    userType: 'Employee',
    isActive: true,
    status: 'Active',
  });
  await db.collection('users').doc('pg-test-emp-2').set({
    uid: 'pg-test-emp-2',
    employeeId: 'EMP_PG_102',
    email: 'pg.emp2@nestgroup.net',
    name: 'PG Test Employee 2',
    role: 'Employee',
    userType: 'Employee',
    isActive: true,
    status: 'Active',
  });

  const usersSnapBefore = await db.collection('users').get();
  const usersBeforeJson = JSON.stringify(
    usersSnapBefore.docs.map(d => [d.id, d.data()]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  );
  const emp1 = (await db.collection('users').doc('pg-test-emp-1').get()).data();
  const emp2 = (await db.collection('users').doc('pg-test-emp-2').get()).data();

  assert(Boolean(emp1 && emp2), `Loaded synthetic test employees in ${process.env.DB_DATABASE} (${emp1?.email}, ${emp2?.email})`);

  const accId1 = 'acc-pg-suite-1';
  const accId2 = 'acc-pg-suite-2';
  const conId1 = 'con-pg-suite-1';
  const createdTaskIds = [];
  const createdRiskIds = [];
  const createdRecIds = [];
  const createdIntIds = [];

  await cleanupTestEntities([accId1, accId2], [conId1], [], [], [], []);

  // 1. Atomic PostgreSQL Transaction Rollback on Middle-Row Error
  let rollbackTriggered = false;
  try {
    await db.runInTransaction(async txDb => {
      await txDb.collection('accounts').doc(accId1).set({
        accountId: accId1,
        companyName: 'PG Suite Rollback Co',
        industry: 'Technology',
        region: 'NA',
        email: 'pgrollback@example.com',
        ownerId: emp1.uid,
        ownerEmail: emp1.email,
        ownerName: emp1.name,
        isActive: true,
      });
      await txDb.collection('contacts').doc(conId1).set({
        contactId: conId1,
        accountId: accId1,
        name: 'PG Rollback Contact',
        email: 'contact.rollback@example.com',
        keyContact: 'Yes',
        ownerId: emp2.uid,
        ownerEmail: emp2.email,
        ownerName: emp2.name,
        isActive: true,
      });
      throw new Error('SIMULATED_PG_SUITE_MIDDLE_ROW_ERROR');
    });
  } catch (_) {
    rollbackTriggered = true;
  }

  const accAfterRollback = await db.collection('accounts').doc(accId1).get();
  const conAfterRollback = await db.collection('contacts').doc(conId1).get();
  assert(
    rollbackTriggered && !accAfterRollback.exists && !conAfterRollback.exists,
    'PostgreSQL transaction rolls back all account and contact writes on middle-row failure'
  );

  // 2. Atomic PostgreSQL Transaction Commit + Organizer Identification (Pending by default)
  await db.runInTransaction(async txDb => {
    await txDb.collection('accounts').doc(accId1).set({
      accountId: accId1,
      companyName: 'PG Suite Committed Co 1',
      industry: 'Healthcare',
      region: 'Europe',
      email: 'info@pgsuite1.com',
      ownerId: emp1.uid,
      ownerEmail: emp1.email,
      ownerName: emp1.name,
      ownerEmployeeId: emp1.employeeId || 'EMP_PG_1',
      isActive: true,
    });
    await txDb.collection('contacts').doc(conId1).set({
      contactId: conId1,
      accountId: accId1,
      name: 'Customer Key Contact PG',
      email: 'keycontact@pgsuite1.com',
      keyContact: 'Yes',
      ownerId: emp2.uid,
      ownerEmail: emp2.email,
      ownerName: emp2.name,
      ownerEmployeeId: emp2.employeeId || 'EMP_PG_2',
      isActive: true,
    });
  });

  await recalculateEligibleOrganizers({ triggerSource: 'PG_TEST_IMPORT' });

  const org1Pending = (await db.collection('authorizedorganizers').doc(emp1.uid).get()).data();
  const org2Pending = (await db.collection('authorizedorganizers').doc(emp2.uid).get()).data();
  assert(
    org1Pending?.teamsStatus === ORGANIZER_STATUS.PENDING_ASSIGNMENT &&
    org1Pending?.outlookStatus === OUTLOOK_STATUS.PENDING_CONFIGURATION &&
    org2Pending?.teamsStatus === ORGANIZER_STATUS.PENDING_ASSIGNMENT &&
    org2Pending?.outlookStatus === OUTLOOK_STATUS.PENDING_CONFIGURATION,
    'PostgreSQL AuthorizedOrganizers records separate Teams (Pending Assignment) and Outlook (Pending Approval/Configuration) statuses'
  );

  // 3. Independent Teams & Outlook Grant in PostgreSQL
  setMockAutoGrantEnabled(true);
  await processPolicySyncQueue({ simulateTeamsGrant: true, simulateOutlookGrant: false });
  const org1TeamsOnly = (await db.collection('authorizedorganizers').doc(emp1.uid).get()).data();
  assert(
    org1TeamsOnly?.teamsStatus === ORGANIZER_STATUS.AUTHORIZED &&
    org1TeamsOnly?.outlookStatus === OUTLOOK_STATUS.PENDING_CONFIGURATION,
    'PostgreSQL persists independent Teams (Authorized) and Outlook (Pending Approval/Configuration) states'
  );

  setMockOutlookAutoGrantEnabled(true);
  await processPolicySyncQueue({ simulateTeamsGrant: true, simulateOutlookGrant: true });
  const org1Both = (await db.collection('authorizedorganizers').doc(emp1.uid).get()).data();
  assert(
    org1Both?.teamsStatus === ORGANIZER_STATUS.AUTHORIZED &&
    org1Both?.outlookStatus === OUTLOOK_STATUS.AUTHORIZED,
    'PostgreSQL transitions organizer to Authorized for both Teams and Outlook after verification'
  );

  // 4. Customer Intelligence AI Recommendation Staging & Employee Approve/Edit/Reject/Defer in PostgreSQL
  const intRes = await createInteraction(
    {
      accountId: accId1,
      contactId: conId1,
      source: 'Outlook Mail',
      subject: 'PG Suite Customer Escalation & Expansion',
      messageText:
        'We are frustrated with the delivery delay on the current module, need a follow up call tomorrow, and want to discuss a new project expansion.',
      internetMessageId: `<pg-suite-${Date.now()}@pgsuite1.com>`,
      isManual: false,
    },
    { uid: emp1.uid, name: emp1.name, email: emp1.email }
  );
  createdIntIds.push(intRes.interaction.interactionId);

  const recsForAcc = await listAiRecommendations({ accountId: accId1 });
  for (const r of recsForAcc) {
    createdRecIds.push(r.recommendationId);
    if (r.sourceReferences?.linkedRiskId) createdRiskIds.push(r.sourceReferences.linkedRiskId);
  }

  const pgTaskRec = recsForAcc.find(r => r.category === RECOMMENDATION_CATEGORIES.TASK);
  const pgOppRec = recsForAcc.find(r => r.category === RECOMMENDATION_CATEGORIES.OPPORTUNITY);
  const pgRiskRec = recsForAcc.find(r => r.category === RECOMMENDATION_CATEGORIES.RISK);

  assert(
    Boolean(pgTaskRec && pgOppRec && pgRiskRec) &&
    recsForAcc.every(r => r.status === RECOMMENDATION_STATUS.PENDING_REVIEW && r.interactionId === intRes.interaction.interactionId),
    'PostgreSQL AiRecommendations stores Task, Opportunity, and Risk recommendations with source provenance in PENDING_REVIEW'
  );

  const approvedTask = await reviewAiRecommendation({
    recommendationId: pgTaskRec.recommendationId,
    action: 'APPROVE',
    user: { uid: emp1.uid, name: emp1.name },
  });
  if (approvedTask.createdEntityId) createdTaskIds.push(approvedTask.createdEntityId);
  const pgTaskDoc = await db.collection('tasks').doc(approvedTask.createdEntityId).get();

  const editedOpp = await reviewAiRecommendation({
    recommendationId: pgOppRec.recommendationId,
    action: 'EDIT',
    edits: { title: 'PG Edited Expansion Opportunity', priority: 'Critical' },
    user: { uid: emp1.uid, name: emp1.name },
  });

  const rejectedRisk = await reviewAiRecommendation({
    recommendationId: pgRiskRec.recommendationId,
    action: 'REJECT',
    user: { uid: emp1.uid, name: emp1.name },
  });

  assert(
    approvedTask.status === RECOMMENDATION_STATUS.APPROVED &&
    pgTaskDoc.exists &&
    editedOpp.status === RECOMMENDATION_STATUS.EDITED &&
    rejectedRisk.status === RECOMMENDATION_STATUS.REJECTED,
    'PostgreSQL persists Employee APPROVE, EDIT, and REJECT review workflow decisions'
  );

  // Verify existing mock-generated Authorized records in PostgreSQL are rejected when live verification is absent
  const { isOrganizerAuthorizedForTeams, isMailboxAuthorizedForOutlook } = await import('./services/organizerSync.service.js');
  resetMockTeamsPolicyState();
  resetMockOutlookMailboxState();
  delete process.env.MOCK_AUTO_GRANT_ENABLED;
  const pgLegacyTeams = await isOrganizerAuthorizedForTeams(emp1.email);
  const pgLegacyOutlook = await isMailboxAuthorizedForOutlook(emp1.email);
  assert(
    pgLegacyTeams.authorized === false &&
    pgLegacyTeams.reason === 'TEAMS_LIVE_VERIFICATION_REQUIRED' &&
    pgLegacyOutlook.authorized === false &&
    pgLegacyOutlook.reason === 'OUTLOOK_LIVE_VERIFICATION_REQUIRED',
    'PostgreSQL rejects mock-generated Authorized records when livePolicyVerified / outlookLiveVerified is absent or false'
  );

  // Clean up test entities
  await cleanupTestEntities([accId1, accId2], [conId1], createdIntIds, createdRecIds, createdRiskIds, createdTaskIds);
  resetMockTeamsPolicyState();
  resetMockOutlookMailboxState();
  await recalculateEligibleOrganizers({ triggerSource: 'PG_TEST_CLEANUP' });

  // Verify Users table in customer_pulse_phase2_test remained 100% read-only
  const usersSnapAfter = await db.collection('users').get();
  const usersAfterJson = JSON.stringify(
    usersSnapAfter.docs.map(d => [d.id, d.data()]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  );
  assert(
    usersAfterJson === usersBeforeJson,
    'PostgreSQL Users table remained 100% read-only across all organizer and intelligence operations'
  );

  // Remove synthetic test employees from customer_pulse_phase2_test after read-only verification
  await db.collection('users').doc('pg-test-emp-1').delete().catch(() => {});
  await db.collection('users').doc('pg-test-emp-2').delete().catch(() => {});
  await db.collection('authorizedorganizers').doc('pg-test-emp-1').delete().catch(() => {});
  await db.collection('authorizedorganizers').doc('pg-test-emp-2').delete().catch(() => {});

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

runPostgresSuite().catch(err => {
  console.error('PostgreSQL test suite failed:', err);
  process.exit(1);
});
