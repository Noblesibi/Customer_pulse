import { scanInteractionsForMilestones } from './emailIntelligence.service.js';
import { runCustomerIntelligenceSync } from './customerIntelligence.service.js';
import { syncFestivalOccasionsForAccounts } from './festivalCelebration.service.js';
import { logActivity } from '../config/database.js';

// Configuration intervals (in milliseconds)
const EMAIL_INTEL_INTERVAL = parseInt(process.env.CRM_EMAIL_INTEL_INTERVAL_MS, 10) || (4 * 60 * 60 * 1000); // 4 hours
const NEWS_INTEL_INTERVAL = parseInt(process.env.PUBLIC_NEWS_INTEL_INTERVAL_MS, 10) || (24 * 60 * 60 * 1000); // 24 hours
const FESTIVAL_INTEL_INTERVAL = parseInt(process.env.FESTIVAL_INTEL_INTERVAL_MS, 10) || (24 * 60 * 60 * 1000); // 24 hours

let emailTimer = null;
let newsTimer = null;
let festivalTimer = null;

let isEmailRunning = false;
let isNewsRunning = false;
let isFestivalRunning = false;

let lastEmailRun = null;
let lastNewsRun = null;
let lastFestivalRun = null;

let schedulerActive = false;

/**
 * Executes CRM Email Intelligence milestone scan.
 */
export async function triggerEmailIntelligenceJob() {
  if (isEmailRunning) {
    console.log('[Scheduler] CRM Email scan already in progress, skipping.');
    return { skipped: true };
  }
  isEmailRunning = true;
  lastEmailRun = new Date().toISOString();

  try {
    console.log('📬 [Scheduler] Starting CRM Email Intelligence background scan...');
    const result = await scanInteractionsForMilestones({ userId: 'scheduler' });
    console.log(`📬 [Scheduler] CRM Email scan complete: ${result.milestonesFound} milestone(s) staged.`);

    await logActivity({
      userId: 'system',
      userName: 'Background Scheduler',
      action: 'CRM_EMAIL_INTEL_COMPLETED',
      entityType: 'CelebrationEvent',
      details: `Scanned ${result.totalScanned} email interactions, staged ${result.milestonesFound} milestone(s).`
    }).catch(() => {});

    return result;
  } catch (err) {
    console.error('❌ [Scheduler] CRM Email Intelligence error:', err.message);
    return { error: err.message };
  } finally {
    isEmailRunning = false;
  }
}

/**
 * Executes Public News & Website Intelligence scan.
 */
export async function triggerNewsIntelligenceJob() {
  if (isNewsRunning) {
    console.log('[Scheduler] News scan already in progress, skipping.');
    return { skipped: true };
  }
  isNewsRunning = true;
  lastNewsRun = new Date().toISOString();

  try {
    console.log('📰 [Scheduler] Starting Public News & Website Intelligence background scan...');
    const result = await runCustomerIntelligenceSync({ userId: 'scheduler' });
    console.log(`📰 [Scheduler] News sync complete: ${result.totalDiscovered} milestone(s) staged.`);

    await logActivity({
      userId: 'system',
      userName: 'Background Scheduler',
      action: 'PUBLIC_NEWS_INTEL_COMPLETED',
      entityType: 'CelebrationEvent',
      details: `Discovered ${result.totalDiscovered} milestone(s) across public news and company websites.`
    }).catch(() => {});

    return result;
  } catch (err) {
    console.error('❌ [Scheduler] Public News Intelligence error:', err.message);
    return { error: err.message };
  } finally {
    isNewsRunning = false;
  }
}

/**
 * Executes Festival and Public Celebration sync.
 */
export async function triggerFestivalSyncJob() {
  if (isFestivalRunning) {
    return { skipped: true };
  }
  isFestivalRunning = true;
  lastFestivalRun = new Date().toISOString();

  try {
    console.log('🪔 [Scheduler] Synchronizing upcoming public festivals and celebrations...');
    const result = await syncFestivalOccasionsForAccounts({ lookaheadDays: 90, userId: 'scheduler' });
    console.log(`🪔 [Scheduler] Festival sync complete: ${result.created} greeting draft(s) prepared.`);
    return result;
  } catch (err) {
    console.error('❌ [Scheduler] Festival sync error:', err.message);
    return { error: err.message };
  } finally {
    isFestivalRunning = false;
  }
}

/**
 * Starts all customer intelligence background timers.
 */
export function startCustomerIntelligenceScheduler() {
  if (schedulerActive) return;
  schedulerActive = true;

  console.log('⏱️ [CustomerIntelligenceScheduler] Background scheduler initialized:');
  console.log(`   - CRM Email Intelligence: Every ${Math.round(EMAIL_INTEL_INTERVAL / 3600000)}h`);
  console.log(`   - Public News Monitoring: Every ${Math.round(NEWS_INTEL_INTERVAL / 3600000)}h`);
  console.log(`   - Festival Celebrations:  Every ${Math.round(FESTIVAL_INTEL_INTERVAL / 3600000)}h`);

  // Initial delayed startup run (after 10s to let server settle)
  setTimeout(() => {
    triggerEmailIntelligenceJob().catch(() => {});
    triggerFestivalSyncJob().catch(() => {});
  }, 10000);

  // Set recurring intervals
  emailTimer = setInterval(() => {
    triggerEmailIntelligenceJob().catch(() => {});
  }, EMAIL_INTEL_INTERVAL);

  newsTimer = setInterval(() => {
    triggerNewsIntelligenceJob().catch(() => {});
  }, NEWS_INTEL_INTERVAL);

  festivalTimer = setInterval(() => {
    triggerFestivalSyncJob().catch(() => {});
  }, FESTIVAL_INTEL_INTERVAL);
}

/**
 * Stops all background timers.
 */
export function stopCustomerIntelligenceScheduler() {
  if (emailTimer) clearInterval(emailTimer);
  if (newsTimer) clearInterval(newsTimer);
  if (festivalTimer) clearInterval(festivalTimer);
  emailTimer = null;
  newsTimer = null;
  festivalTimer = null;
  schedulerActive = false;
  console.log('🛑 [CustomerIntelligenceScheduler] Background scheduler stopped.');
}

/**
 * Diagnostics & health status of the background scheduler.
 */
export function getSchedulerStatus() {
  return {
    schedulerActive,
    intervals: {
      emailIntelligenceMs: EMAIL_INTEL_INTERVAL,
      publicNewsMs: NEWS_INTEL_INTERVAL,
      festivalsMs: FESTIVAL_INTEL_INTERVAL
    },
    running: {
      isEmailRunning,
      isNewsRunning,
      isFestivalRunning
    },
    lastRuns: {
      lastEmailRun,
      lastNewsRun,
      lastFestivalRun
    }
  };
}

