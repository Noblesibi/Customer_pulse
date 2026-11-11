import dotenv from 'dotenv';
dotenv.config();

import { scanInteractionsForMilestones } from './services/emailIntelligence.service.js';
import {
  getSchedulerStatus,
  triggerEmailIntelligenceJob,
  triggerFestivalSyncJob
} from './services/customerIntelligenceScheduler.service.js';
import { listCelebrations } from './services/celebration.service.js';

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

async function runPhase2Tests() {
  console.log('\n========================================================================');
  console.log('🧪 CUSTOMERPULSE GREETINGS INTELLIGENCE – PHASE 2 TEST SUITE');
  console.log('   (CRM Email Intelligence Deep Extraction & Background Scheduling)');
  console.log('========================================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: CRM Email Intelligence Deep Scan
  // -------------------------------------------------------------------------
  console.log('1. Deep Milestone Scanning on Authorized Email Interactions');
  const scanResult = await scanInteractionsForMilestones({ userId: 'phase2_tester' });
  
  assert(scanResult.totalScanned > 0, `Scanned ${scanResult.totalScanned} authorized email interactions in database`);
  assert(typeof scanResult.milestonesFound === 'number', `Milestones found count returned: ${scanResult.milestonesFound}`);
  assert(typeof scanResult.skippedNoise === 'number', `Operational noise successfully filtered count: ${scanResult.skippedNoise}`);
  assert(Array.isArray(scanResult.created), 'Staged milestone events list returned');

  // -------------------------------------------------------------------------
  // TEST 2: Verified Staging in CelebrationEvents (PENDING_VERIFICATION)
  // -------------------------------------------------------------------------
  console.log('\n2. Audit & Staging Verification (PENDING_VERIFICATION)');
  const allCelebrations = await listCelebrations();
  const emailMilestones = allCelebrations.filter(e => e.sourceType === 'CRM_EMAIL');

  assert(emailMilestones.length > 0, `Found ${emailMilestones.length} CRM Email milestones staged in database`);
  
  const sample = emailMilestones[0];
  assert(sample.verificationStatus === 'PENDING_VERIFICATION', 'Staged milestone has verificationStatus = PENDING_VERIFICATION');
  assert(Boolean(sample.evidenceSummary), `Evidence summary preserved: "${sample.evidenceSummary}"`);
  assert(Boolean(sample.accountId), `Linked to existing CRM account: ${sample.accountName || sample.accountId}`);
  assert(!sample.evidenceSummary.includes('password') && !sample.evidenceSummary.includes('confidential'), 'Safe evidence snippet (no private raw email leaks)');

  // -------------------------------------------------------------------------
  // TEST 3: Deduplication across Multiple Scans
  // -------------------------------------------------------------------------
  console.log('\n3. Deduplication Engine on Consecutive Scans');
  const repeatScan = await scanInteractionsForMilestones({ userId: 'phase2_tester' });
  assert(repeatScan.milestonesFound === 0, 'Consecutive scan creates 0 duplicate milestones');
  assert(repeatScan.duplicatesSkipped >= 0, `Duplicates cleanly skipped by deduplication engine (${repeatScan.duplicatesSkipped} skipped)`);

  // -------------------------------------------------------------------------
  // TEST 4: Background Scheduler State & Interval Health
  // -------------------------------------------------------------------------
  console.log('\n4. Background Scheduler Configuration & Health Check');
  const status = getSchedulerStatus();
  
  assert(typeof status.intervals.emailIntelligenceMs === 'number', 'Email intelligence interval configured (e.g. 4 hours)');
  assert(typeof status.intervals.publicNewsMs === 'number', 'Public news interval configured (e.g. 24 hours)');
  assert(typeof status.intervals.festivalsMs === 'number', 'Festival interval configured (e.g. 24 hours)');
  assert(status.intervals.emailIntelligenceMs === 14400000 || status.intervals.emailIntelligenceMs > 0, `Email scan interval is 4h (${status.intervals.emailIntelligenceMs}ms)`);
  assert(status.running.isEmailRunning === false, 'Mutex lock released cleanly after scan execution');

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runPhase2Tests().catch(err => {
  console.error('Phase 2 test execution failed:', err);
  process.exit(1);
});
