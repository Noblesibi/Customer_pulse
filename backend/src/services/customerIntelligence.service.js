/**
 * customerIntelligence.service.js
 *
 * Customer-Centric Greetings Intelligence Engine.
 * Monitored Information Sources:
 *   1. Public News Monitoring (Google News RSS - Free, no API key, targeted queries)
 *   2. Official Customer Website and Press Release Monitoring
 *   3. Existing Authorized CRM Email Intelligence (Interactions table)
 *   4. Customer-Provided and Employee-Verified Information
 *
 * Strictly operates on existing CustomerPulse CRM accounts and key contacts.
 * Zero automatic contact/account creation. External discoveries remain PENDING_VERIFICATION.
 */

import { db, logActivity } from '../config/database.js';
import {
  EVENT_TYPES,
  SOURCE_TYPES,
  VERIFICATION_STATUS,
  CELEBRATION_STATUS,
  createCelebration,
  listCelebrations
} from './celebration.service.js';

// ─── UTILITY HELPERS ──────────────────────────────────────────────────────────

/**
 * Strips HTML tags and decodes basic XML/HTML entities
 */
function cleanText(str) {
  if (!str) return '';
  return str
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
 * Extracts items from an RSS/XML string without external dependencies
 */
function parseRssItems(xmlText) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemBlock = match[1];

    const getTag = (tag) => {
      const tagRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const tagMatch = tagRegex.exec(itemBlock);
      return tagMatch ? cleanText(tagMatch[1]) : '';
    };

    const title = getTag('title');
    const link = getTag('link');
    const pubDate = getTag('pubDate');
    const description = getTag('description');
    const source = getTag('source');

    if (title) {
      items.push({ title, link, pubDate, description, source });
    }
  }

  return items;
}

/**
 * Parses a pubDate or natural date string into YYYY-MM-DD
 */
function parseDateToIso(dateStr) {
  if (!dateStr) return null;
  try {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  } catch (_) {}
  return null;
}

/**
 * Derives the primary web domain for an account
 */
function resolveAccountDomain(account, contacts = []) {
  if (account.website) {
    try {
      const url = account.website.startsWith('http') ? account.website : `https://${account.website}`;
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (_) {}
  }

  if (account.email && account.email.includes('@')) {
    const d = account.email.split('@')[1].trim().toLowerCase();
    if (!d.endsWith('gmail.com') && !d.endsWith('yahoo.com') && !d.endsWith('outlook.com') && !d.endsWith('nestgroup.net')) {
      return d;
    }
  }

  for (const c of contacts) {
    if (c.email && c.email.includes('@')) {
      const d = c.email.split('@')[1].trim().toLowerCase();
      if (!d.endsWith('gmail.com') && !d.endsWith('yahoo.com') && !d.endsWith('outlook.com') && !d.endsWith('nestgroup.net')) {
        return d;
      }
    }
  }

  return null;
}

// ─── 1. PUBLIC NEWS MONITORING ────────────────────────────────────────────────

const NEWS_MILESTONE_PATTERNS = [
  { regex: /\b(appointed|promoted|named\s+as|steps\s+up\s+to|takes\s+helm|new\s+ceo|new\s+president|new\s+director)\b/i, type: EVENT_TYPES.PROMOTION },
  { regex: /\b(wins|awarded|recognized\s+as|honored\s+with|hall\s+of\s+fame|excellence\s+award)\b/i, type: EVENT_TYPES.AWARD },
  { regex: /\b(celebrates|anniversary|milestone\s+year|\d+\s*(?:st|nd|rd|th)?\s+anniversary)\b/i, type: EVENT_TYPES.COMPANY_ANNIVERSARY },
  { regex: /\b(partnership|collaborates\s+with|teams\s+up\s+with|joint\s+venture|strategic\s+alliance)\b/i, type: EVENT_TYPES.PARTNERSHIP_MILESTONE },
  { regex: /\b(expansion|expands|opens\s+new|inaugurates|launches|breaks\s+ground)\b/i, type: EVENT_TYPES.BUSINESS_MILESTONE },
  { regex: /\b(achieves|certified|certification|accredited|fda\s+clearance|iso\s+certification)\b/i, type: EVENT_TYPES.CERTIFICATION }
];

export async function monitorPublicNews(options = {}) {
  const { accountId = null, limitAccounts = 25 } = options;
  const discoveredEvents = [];

  try {
    let accountsSnap;
    if (accountId) {
      accountsSnap = await db.collection('accounts').where('accountId', '==', accountId).get();
    } else {
      accountsSnap = await db.collection('accounts').limit(limitAccounts).get();
    }

    const accounts = accountsSnap.docs.map(d => d.data());
    const contactsSnap = await db.collection('contacts').get();
    const allContacts = contactsSnap.docs.map(d => d.data());

    for (const acc of accounts) {
      const aId = acc.accountId || acc.id;
      const companyName = (acc.companyName || '').trim();
      if (!companyName || companyName.length < 3 || companyName.toLowerCase() === 'test') continue;

      const accContacts = allContacts.filter(c => (c.accountId === aId || c.account_id === aId));

      // Construct targeted search query: "{CompanyName}" ("promoted" OR "appointed" OR "award" OR "partnership" OR "acquisition" OR "anniversary")
      const query = `"${companyName}" ("promoted" OR "appointed" OR "award" OR "partnership" OR "acquisition" OR "anniversary")`;
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=US&ceid=US:en`;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(rssUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'CustomerPulse-Monitor/1.0 (+https://nestdigital.com)'
          }
        });
        clearTimeout(timeout);

        if (!res.ok) continue;

        const xmlText = await res.text();
        const items = parseRssItems(xmlText);

        for (const item of items.slice(0, 5)) {
          const title = item.title;
          const snippet = item.description || title;
          const pubDate = parseDateToIso(item.pubDate) || new Date().toISOString().split('T')[0];

          // 1. Verify entity affiliation
          const mentionsCompany = title.toLowerCase().includes(companyName.toLowerCase()) || snippet.toLowerCase().includes(companyName.toLowerCase());
          if (!mentionsCompany) continue;

          // 2. Classify milestone type
          let matchedType = null;
          for (const pattern of NEWS_MILESTONE_PATTERNS) {
            if (pattern.regex.test(title) || pattern.regex.test(snippet)) {
              matchedType = pattern.type;
              break;
            }
          }
          if (!matchedType) continue;

          // 3. Check if a key contact from this account is specifically mentioned
          let matchedContact = null;
          for (const c of accContacts) {
            const contactName = (c.name || '').trim();
            if (contactName && contactName.length > 3) {
              if (title.toLowerCase().includes(contactName.toLowerCase()) || snippet.toLowerCase().includes(contactName.toLowerCase())) {
                matchedContact = c;
                break;
              }
            }
          }

          const sourceEventId = `news:${Buffer.from(item.link || title).toString('base64').substring(0, 48)}`;
          const eventTitle = title.length > 120 ? title.substring(0, 117) + '...' : title;

          try {
            const newEvent = await createCelebration({
              accountId: aId,
              contactId: matchedContact ? (matchedContact.contactId || matchedContact.id) : null,
              eventType: matchedType,
              eventTitle,
              eventDescription: snippet,
              eventDate: pubDate,
              sourceType: SOURCE_TYPES.PUBLIC_NEWS,
              sourceName: item.source ? `Public News (${item.source})` : 'Public News Monitoring',
              sourceUrl: item.link || null,
              sourceReference: item.source || 'Public Press',
              sourceDate: pubDate,
              sourceEventId,
              evidenceSummary: `Public News Signal: "${title}". Source: ${item.source || 'Online Media'}. Published: ${pubDate}.`,
              matchedEntity: matchedContact ? `${matchedContact.name} (${companyName})` : companyName,
              confidence: matchedContact ? 'High' : 'Medium',
              verificationStatus: VERIFICATION_STATUS.PENDING_VERIFICATION,
              lastSyncStatus: 'SUCCESS',
              lastSyncedAt: new Date().toISOString()
            }, { uid: 'system-intelligence', name: 'Customer Intelligence Engine' });

            discoveredEvents.push(newEvent);
          } catch (dupErr) {
            // Deduplication prevented duplicate event
          }
        }
      } catch (newsErr) {
        // Non-fatal per-account network issue
      }

      // Polite 500ms throttle between accounts
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (err) {
    console.error('[CustomerIntelligence] Public News monitoring error:', err.message);
  }

  return discoveredEvents;
}

// ─── 2. OFFICIAL WEBSITE & PRESS RELEASE MONITORING ───────────────────────────

const WEBSITE_ANNIVERSARY_PATTERNS = [
  { regex: /celebrat(?:ing|es)\s+(\d+)\s*(?:years|th\s+anniversary|year\s+milestone)/i, type: EVENT_TYPES.COMPANY_ANNIVERSARY },
  { regex: /founded\s+in\s+(\d{4})/i, type: EVENT_TYPES.COMPANY_ANNIVERSARY },
  { regex: /proud\s+to\s+announce\s+iso\s+(\d+)\s+certification/i, type: EVENT_TYPES.CERTIFICATION },
  { regex: /awarded\s+(?:the\s+)?([^,.]+?(?:award|recognition|trophy))/i, type: EVENT_TYPES.AWARD }
];

export async function monitorOfficialWebsites(options = {}) {
  const { accountId = null, limitAccounts = 20 } = options;
  const discoveredEvents = [];

  try {
    let accountsSnap;
    if (accountId) {
      accountsSnap = await db.collection('accounts').where('accountId', '==', accountId).get();
    } else {
      accountsSnap = await db.collection('accounts').limit(limitAccounts).get();
    }

    const accounts = accountsSnap.docs.map(d => d.data());
    const contactsSnap = await db.collection('contacts').get();
    const allContacts = contactsSnap.docs.map(d => d.data());

    for (const acc of accounts) {
      const aId = acc.accountId || acc.id;
      const companyName = (acc.companyName || '').trim();
      if (!companyName || companyName.length < 3 || companyName.toLowerCase() === 'test') continue;

      const accContacts = allContacts.filter(c => (c.accountId === aId || c.account_id === aId));
      const domain = resolveAccountDomain(acc, accContacts);
      if (!domain) continue;

      // Candidate official news / about endpoints
      const candidatePaths = ['/news', '/press', '/press-releases', '/about-us'];

      for (const path of candidatePaths) {
        const targetUrl = `https://${domain}${path}`;

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 4000);

          const res = await fetch(targetUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'CustomerPulse-Monitor/1.0 (+https://nestdigital.com)'
            }
          });
          clearTimeout(timeout);

          if (!res.ok) continue;

          const html = await res.text();

          // Search for explicit anniversary or certification evidence in headlines and paragraphs
          for (const pattern of WEBSITE_ANNIVERSARY_PATTERNS) {
            const m = html.match(pattern.regex);
            if (m) {
              const matchedPhrase = m[0];
              const eventDate = new Date().toISOString().split('T')[0];
              const sourceEventId = `website:${domain}:${Buffer.from(matchedPhrase).toString('base64').substring(0, 32)}`;

              try {
                const newEvent = await createCelebration({
                  accountId: aId,
                  contactId: null, // Account-level company milestone
                  eventType: pattern.type,
                  eventTitle: `${companyName} – ${matchedPhrase}`,
                  eventDescription: `Discovered on official corporate website (${targetUrl}): "${matchedPhrase}".`,
                  eventDate,
                  sourceType: SOURCE_TYPES.OFFICIAL_WEBSITE,
                  sourceName: 'Official Customer Website',
                  sourceUrl: targetUrl,
                  sourceReference: `Official Website (${domain})`,
                  sourceDate: eventDate,
                  sourceEventId,
                  evidenceSummary: `Official Corporate Source: Discovered at ${targetUrl}. Evidence snippet: "${matchedPhrase}".`,
                  matchedEntity: companyName,
                  confidence: 'High',
                  verificationStatus: VERIFICATION_STATUS.PENDING_VERIFICATION,
                  lastSyncStatus: 'SUCCESS',
                  lastSyncedAt: new Date().toISOString()
                }, { uid: 'system-intelligence', name: 'Customer Intelligence Engine' });

                discoveredEvents.push(newEvent);
              } catch (_) {
                // Deduplication prevented duplicate
              }
              break; // Found primary milestone on this page
            }
          }
        } catch (_) {
          // Timeout or domain unreachable
        }

        // Only check 1 valid path per domain
        if (discoveredEvents.some(e => e.accountId === aId)) break;
      }

      await new Promise(r => setTimeout(r, 400));
    }
  } catch (err) {
    console.error('[CustomerIntelligence] Official Website monitoring error:', err.message);
  }

  return discoveredEvents;
}

// ─── 3. CRM EMAIL INTELLIGENCE SCANNER ────────────────────────────────────────

const EMAIL_MILESTONE_PATTERNS = [
  { regex: /\b(?:congratulations|pleased\s+to\s+announce)\b[\s\S]{0,80}\b(?:promoted|appointment|new\s+role|taking\s+over|as\s+director|as\s+vp|as\s+head)\b/i, type: EVENT_TYPES.PROMOTION },
  { regex: /\b(?:happy\s+work\s+anniversary|celebrating\s+\d+\s+years\s+at)\b/i, type: EVENT_TYPES.WORK_ANNIVERSARY },
  { regex: /\b(?:happy\s+birthday|wishing\s+you\s+a\s+(?:very\s+)?happy\s+birthday)\b/i, type: EVENT_TYPES.BIRTHDAY },
  { regex: /\b(?:completed|cleared|passed)\b[\s\S]{0,60}\b(?:certification|exam|qualification|accreditation)\b/i, type: EVENT_TYPES.CERTIFICATION },
  { regex: /\b(?:successful\s+go-live|congratulations\s+on\s+the\s+release|project\s+milestone\s+completed)\b/i, type: EVENT_TYPES.PROJECT_MILESTONE },
  { regex: /\b(?:won\s+the\s+award|honored\s+with\s+the\s+award|received\s+the\s+recognition)\b/i, type: EVENT_TYPES.AWARD }
];

export async function scanCrmEmailsForMilestones(options = {}) {
  const { accountId = null, limitInteractions = 100 } = options;
  const discoveredEvents = [];

  try {
    let query = db.collection('interactions');
    if (accountId) {
      query = query.where('accountId', '==', accountId);
    }
    const snap = await query.get();
    let interactions = snap.docs.map(d => d.data());

    // Filter to genuine customer emails
    interactions = interactions.filter(i => (i.source === 'Email' || i.source === 'Outlook') && i.accountId);
    interactions.sort((a, b) => new Date(b.timestamp || b.date || 0) - new Date(a.timestamp || a.date || 0));

    const contactsSnap = await db.collection('contacts').get();
    const contactMap = new Map();
    contactsSnap.docs.forEach(d => {
      const c = d.data();
      const cid = c.contactId || c.id || d.id;
      if (cid) contactMap.set(cid, c);
    });

    const accountsSnap = await db.collection('accounts').get();
    const accountMap = new Map();
    accountsSnap.docs.forEach(d => {
      const a = d.data();
      const aid = a.accountId || a.id || d.id;
      if (aid) accountMap.set(aid, a);
    });

    for (const inter of interactions.slice(0, limitInteractions)) {
      const subject = inter.subject || '';
      const text = inter.messageText || '';
      const combined = `${subject}\n${text}`;
      const interId = inter.interactionId || inter.id;
      const aId = inter.accountId;
      const cId = inter.contactId || null;

      const account = accountMap.get(aId);
      const contact = cId ? contactMap.get(cId) : null;
      const companyName = account?.companyName || 'Client';

      for (const pattern of EMAIL_MILESTONE_PATTERNS) {
        const m = combined.match(pattern.regex);
        if (m) {
          const matchedPhrase = m[0];
          const dateStr = inter.date || (inter.timestamp ? inter.timestamp.split('T')[0] : new Date().toISOString().split('T')[0]);
          const sourceEventId = `email:${interId}:${pattern.type}`;

          const eventTitle = contact
            ? `${contact.name} – ${pattern.type.replace(/_/g, ' ')}`
            : `${companyName} – ${pattern.type.replace(/_/g, ' ')}`;

          try {
            const newEvent = await createCelebration({
              accountId: aId,
              contactId: cId,
              eventType: pattern.type,
              eventTitle,
              eventDescription: `Discovered from authorized customer correspondence: "${subject}". Context: "${matchedPhrase.trim()}".`,
              eventDate: dateStr,
              sourceType: SOURCE_TYPES.CRM_EMAIL,
              sourceName: 'CRM Email Intelligence',
              sourceUrl: null,
              sourceReference: `Interaction ${interId} (${subject})`,
              sourceDate: dateStr,
              sourceEventId,
              evidenceSummary: `Authorized Email Intelligence: Subject "${subject}". Snippet: "${matchedPhrase.trim()}". Date: ${dateStr}.`,
              matchedEntity: contact ? `${contact.name} (${companyName})` : companyName,
              confidence: contact ? 'High' : 'Medium',
              verificationStatus: VERIFICATION_STATUS.PENDING_VERIFICATION,
              lastSyncStatus: 'SUCCESS',
              lastSyncedAt: new Date().toISOString()
            }, { uid: 'system-intelligence', name: 'Customer Intelligence Engine' });

            discoveredEvents.push(newEvent);
          } catch (_) {
            // Deduplication prevented duplicate
          }
          break; // One milestone per interaction
        }
      }
    }
  } catch (err) {
    console.error('[CustomerIntelligence] CRM Email Intelligence error:', err.message);
  }

  return discoveredEvents;
}

// ─── 4. MASTER ORCHESTRATOR: RUN ALL APPROVED SOURCES ─────────────────────────

export async function runCustomerIntelligenceSync(options = {}) {
  const summary = {
    startedAt: new Date().toISOString(),
    publicNewsDiscovered: 0,
    officialWebsiteDiscovered: 0,
    crmEmailDiscovered: 0,
    totalDiscovered: 0,
    errors: []
  };

  try {
    // Source 1: CRM Email Intelligence (fast, local DB)
    const emailEvents = await scanCrmEmailsForMilestones(options);
    summary.crmEmailDiscovered = emailEvents.length;

    // Source 2: Public News Monitoring (Google News RSS)
    const newsEvents = await monitorPublicNews(options);
    summary.publicNewsDiscovered = newsEvents.length;

    // Source 3: Official Customer Website Monitoring
    const websiteEvents = await monitorOfficialWebsites(options);
    summary.officialWebsiteDiscovered = websiteEvents.length;

    summary.totalDiscovered = summary.crmEmailDiscovered + summary.publicNewsDiscovered + summary.officialWebsiteDiscovered;
    summary.completedAt = new Date().toISOString();

    await logActivity({
      userId: 'system-intelligence',
      userName: 'Customer Intelligence Engine',
      action: 'INTELLIGENCE_SYNC_COMPLETED',
      entityType: 'CustomerIntelligence',
      details: `Discovered ${summary.totalDiscovered} occasion(s): ${summary.publicNewsDiscovered} news, ${summary.officialWebsiteDiscovered} website, ${summary.crmEmailDiscovered} CRM emails.`
    });
  } catch (err) {
    summary.errors.push(err.message);
    console.error('[CustomerIntelligence] Sync run error:', err);
  }

  return summary;
}

