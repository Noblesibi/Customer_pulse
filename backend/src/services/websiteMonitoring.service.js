import { db } from '../config/database.js';
import {
  EVENT_TYPES,
  SOURCE_TYPES,
  VERIFICATION_STATUS,
  CELEBRATION_STATUS,
  createCelebration
} from './celebration.service.js';

function cleanHtmlText(html) {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Common corporate news/press paths.
 */
const PRESS_PATHS = ['/news', '/press', '/press-releases', '/newsroom', '/media'];

/**
 * Milestone keywords on company website announcements.
 */
const WEBSITE_MILESTONE_PATTERNS = [
  {
    regex: /\b(celebrates?\s+(\d+|one|two|five|ten|twenty|25|50|75|100)\s+years|founded\s+(\d+)\s+years\s+ago|(\d+)th\s+anniversary)\b/i,
    type: EVENT_TYPES.COMPANY_ANNIVERSARY,
    confidence: 'High'
  },
  {
    regex: /\b(receives?\s+(iso|fda|ce\s+mark|cqi)\s+certification|awarded\s+iso|achieves?\s+accreditation)\b/i,
    type: EVENT_TYPES.CERTIFICATION,
    confidence: 'High'
  },
  {
    regex: /\b(inaugurates?\s+new\s+facility|opens?\s+new\s+(office|facility|manufacturing|plant)|expansion\s+in)\b/i,
    type: EVENT_TYPES.BUSINESS_MILESTONE,
    confidence: 'Medium'
  },
  {
    regex: /\b(strategic\s+partnership|announces?\s+partnership\s+with|signs?\s+collaboration)\b/i,
    type: EVENT_TYPES.PARTNERSHIP_MILESTONE,
    confidence: 'High'
  }
];

/**
 * Scans official customer websites and press rooms for corporate milestones.
 */
export async function monitorOfficialWebsites({ accountId = null, limitAccounts = 10, userId = 'system' } = {}) {
  const result = {
    accountsScanned: 0,
    sitesReached: 0,
    milestonesDiscovered: 0,
    created: []
  };

  let query = db.collection('accounts');
  if (accountId) {
    query = query.where('accountId', '==', accountId);
  }
  const snap = await query.get();
  let accounts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (limitAccounts && accounts.length > limitAccounts) {
    accounts = accounts.slice(0, limitAccounts);
  }

  for (const account of accounts) {
    const aId = account.accountId || account.id;
    const compName = account.companyName || account.name;
    const siteUrl = account.website;
    if (!siteUrl || !siteUrl.startsWith('http')) continue;

    result.accountsScanned++;

    // Try root URL and primary press paths
    const targetUrls = [siteUrl, `${siteUrl.replace(/\/$/, '')}/news`];

    for (const u of targetUrls) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000); // 4 second fast timeout
        const res = await fetch(u, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        clearTimeout(timer);

        if (!res.ok) continue;
        result.sitesReached++;

        const html = await res.text();
        const text = cleanHtmlText(html);

        for (const pattern of WEBSITE_MILESTONE_PATTERNS) {
          const match = text.match(pattern.regex);
          if (match) {
            // Extract the sentence containing the match
            const matchIndex = match.index || 0;
            const start = Math.max(0, matchIndex - 60);
            const end = Math.min(text.length, matchIndex + 140);
            const excerpt = text.substring(start, end).replace(/\s+/g, ' ').trim();

            const eventDate = new Date().toISOString().split('T')[0];
            const eventTitle = `${compName} – ${pattern.type.replace(/_/g, ' ')}`;
            const evidenceSummary = `Official Customer Website Announcement: "${excerpt}". URL: ${u}.`;

            try {
              const celebrationData = {
                accountId: aId,
                contactId: null, // Account-level milestone
                eventType: pattern.type,
                eventTitle,
                eventDescription: `Discovered from official customer website (${u}). ${excerpt}`,
                eventDate,
                sourceType: SOURCE_TYPES.OFFICIAL_WEBSITE,
                sourceName: 'Official Customer Website',
                sourceUrl: u,
                sourceDate: eventDate,
                evidenceSummary,
                matchedEntity: compName,
                confidence: pattern.confidence,
                verificationStatus: VERIFICATION_STATUS.PENDING_VERIFICATION,
                status: CELEBRATION_STATUS.PENDING_VERIFICATION
              };

              const created = await createCelebration(celebrationData, { uid: userId, name: 'Website Monitor' });
              result.milestonesDiscovered++;
              result.created.push({
                id: created.id,
                account: compName,
                type: pattern.type,
                url: u
              });
            } catch (err) {
              // Deduplication prevented duplicate
            }

            break; // One milestone per URL scan
          }
        }
      } catch (err) {
        // Network timeout or unreachable domain gracefully skipped
      }
    }
  }

  return result;
}

