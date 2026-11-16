import dotenv from 'dotenv';
dotenv.config();

import { db } from './config/database.js';
import { monitorPublicNews } from './services/newsMonitoring.service.js';
import { monitorOfficialWebsites } from './services/websiteMonitoring.service.js';
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

async function runPhase3And4Tests() {
  console.log('\n========================================================================');
  console.log('🧪 CUSTOMERPULSE GREETINGS INTELLIGENCE – PHASE 3 & 4 TEST SUITE');
  console.log('   (Public News Monitoring & Official Customer Website Monitoring)');
  console.log('========================================================================\n');

  // -------------------------------------------------------------------------
  // TEST 1: Account Websites & Aliases Population
  // -------------------------------------------------------------------------
  console.log('1. Account Websites & Aliases Verification');
  const accSnap = await db.collection('accounts').get();
  const accounts = accSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const withWebsite = accounts.filter(a => a.website && a.website.startsWith('http'));
  const withAliases = accounts.filter(a => a.aliases && a.aliases.trim().length > 0);

  assert(withWebsite.length >= 100, `Found ${withWebsite.length} accounts with official websites populated (expected >= 100)`);
  assert(withAliases.length > 0, `Found ${withAliases.length} accounts with corporate aliases populated`);
  
  const zeissAcc = accounts.find(a => /zeiss/i.test(a.companyName));
  assert(zeissAcc && zeissAcc.website.includes('zeiss.com'), `ZEISS official website verified: ${zeissAcc?.website}`);

  // -------------------------------------------------------------------------
  // TEST 2: Public News Monitoring (Google News RSS)
  // -------------------------------------------------------------------------
  console.log('\n2. Public News Monitoring (Google News RSS)');
  const newsResult = await monitorPublicNews({ limitAccounts: 5, userId: 'test_runner' });

  assert(newsResult.accountsScanned > 0, `Scanned ${newsResult.accountsScanned} CRM accounts for public news`);
  assert(typeof newsResult.articlesAnalyzed === 'number', `Analyzed ${newsResult.articlesAnalyzed} public news articles`);
  assert(typeof newsResult.milestonesDiscovered === 'number', `Milestones discovered: ${newsResult.milestonesDiscovered}`);

  // -------------------------------------------------------------------------
  // TEST 3: Staged News Verification & Audit Evidence
  // -------------------------------------------------------------------------
  console.log('\n3. News Milestone Staging & Evidence Verification');
  const allCelebrations = await listCelebrations();
  const newsMilestones = allCelebrations.filter(e => e.sourceType === 'PUBLIC_NEWS');

  assert(newsMilestones.length > 0, `Found ${newsMilestones.length} Public News occasions staged in database`);
  const newsSample = newsMilestones[0];
  assert(newsSample.verificationStatus === 'PENDING_VERIFICATION', 'News milestone has verificationStatus = PENDING_VERIFICATION');
  assert(Boolean(newsSample.evidenceSummary), `Evidence summary preserved: "${newsSample.evidenceSummary}"`);
  assert(Boolean(newsSample.sourceUrl), `Original article URL preserved: ${newsSample.sourceUrl}`);

  // -------------------------------------------------------------------------
  // TEST 4: Official Customer Website Monitoring
  // -------------------------------------------------------------------------
  console.log('\n4. Official Customer Website & Press Room Scans');
  const websiteResult = await monitorOfficialWebsites({ limitAccounts: 5, userId: 'test_runner' });

  assert(websiteResult.accountsScanned > 0, `Scanned ${websiteResult.accountsScanned} official customer websites`);
  assert(websiteResult.sitesReached >= 0, `Reachable press pages checked: ${websiteResult.sitesReached}`);

  // -------------------------------------------------------------------------
  // TEST 5: Deduplication Check on Repeat Execution
  // -------------------------------------------------------------------------
  console.log('\n5. Deduplication Verification');
  const repeatNews = await monitorPublicNews({ limitAccounts: 3, userId: 'test_runner' });
  assert(repeatNews.milestonesDiscovered === 0, 'Consecutive news scan produces 0 duplicate occasions');

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runPhase3And4Tests().catch(err => {
  console.error('Phase 3 & 4 test execution failed:', err);
  process.exit(1);
});

