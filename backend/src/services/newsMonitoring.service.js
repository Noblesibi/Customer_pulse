import { db } from '../config/database.js';
import {
  EVENT_TYPES,
  SOURCE_TYPES,
  VERIFICATION_STATUS,
  CELEBRATION_STATUS,
  createCelebration
} from './celebration.service.js';
import { matchAccountEntity, matchContactEntity } from './entityMatching.service.js';

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
    const link = getTag('link') || getTag('guid');
    const pubDate = getTag('pubDate');
    const description = getTag('description');
    const source = getTag('source');

    if (title && (link || title.length > 10)) {
      items.push({ title, link, pubDate, description, source });
    }
  }
  return items;
}

/**
 * Searches Google News RSS for a specific query string with polite timeout.
 */
async function fetchGoogleNewsRss(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CustomerPulse-Intelligence-Bot/1.0 (Enterprise CRM News Monitor)'
      }
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssItems(xml);
  } catch (err) {
    return [];
  }
}

/**
 * Classifies a news headline into a CustomerPulse Celebration EventType.
 */
function classifyNewsHeadline(headline) {
  const h = (headline || '').toLowerCase();

  if (/\b(partnership|partnered|collaboration|joint\s+venture|alliance)\b/.test(h)) {
    return { eventType: EVENT_TYPES.PARTNERSHIP_MILESTONE, confidence: 'High' };
  }
  if (/\b(anniversary|years\s+in\s+business|founded\s+in)\b/.test(h)) {
    return { eventType: EVENT_TYPES.COMPANY_ANNIVERSARY, confidence: 'High' };
  }
  if (/\b(promoted|appointed|named\s+as|new\s+ceo|new\s+cto|new\s+cfo|new\s+president|joins\s+as|elevated\s+to)\b/.test(h)) {
    return { eventType: EVENT_TYPES.PROMOTION, confidence: 'High' };
  }
  if (/\b(award|won\s+the|honored|recognized\s+for|excellence\s+award|accolade)\b/.test(h)) {
    return { eventType: EVENT_TYPES.AWARD, confidence: 'High' };
  }
  if (/\b(certified|certification|accreditation|fda\s+clearance|iso\s+certification)\b/.test(h)) {
    return { eventType: EVENT_TYPES.CERTIFICATION, confidence: 'High' };
  }
  if (/\b(expansion|opens\s+new|new\s+facility|new\s+manufacturing|headquarters|inaugurated)\b/.test(h)) {
    return { eventType: EVENT_TYPES.BUSINESS_MILESTONE, confidence: 'Medium' };
  }

  return null;
}

/**
 * Executes public news monitoring across existing CRM accounts and key contacts.
 * Discovered milestones are staged as PENDING_VERIFICATION.
 */
export async function monitorPublicNews({ accountId = null, limitAccounts = 10, userId = 'system' } = {}) {
  const result = {
    accountsScanned: 0,
    articlesAnalyzed: 0,
    milestonesDiscovered: 0,
    created: []
  };

  // 1. Fetch eligible accounts
  let query = db.collection('accounts');
  if (accountId) {
    query = query.where('accountId', '==', accountId);
  }
  const snap = await query.get();
  let accounts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (limitAccounts && accounts.length > limitAccounts) {
    accounts = accounts.slice(0, limitAccounts);
  }

  // 2. Fetch key contacts
  const conSnap = await db.collection('contacts').get();
  const contacts = conSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  for (const account of accounts) {
    const aId = account.accountId || account.id;
    const compName = account.companyName || account.name;
    if (!compName) continue;

    result.accountsScanned++;

    // Determine search terms (clean company name + aliases)
    const cleanName = compName
      .replace(/\([^)]+\)/g, '')
      .replace(/\b(private\s+limited|pvt\s+ltd|pvt\.?\s*ltd\.?|limited|ltd\.?|inc\.?|incorporated|gmbh|ag|llc|corporation|corp\.?)\b/gi, '')
      .trim();

    const searchQueries = [
      `"${cleanName}" (award OR achievement OR anniversary OR partnership OR acquisition OR expansion OR certification)`
    ];

    // If key contacts exist for this account, add executive milestone query
    const accContacts = contacts.filter(c => c.accountId === aId);
    if (accContacts.length > 0 && accContacts[0].name) {
      const topContact = accContacts[0].name.trim();
      searchQueries.push(`"${topContact}" "${cleanName}" (appointed OR promoted OR CEO OR CTO OR Director OR VP)`);
    }

    for (const q of searchQueries) {
      const articles = await fetchGoogleNewsRss(q);
      result.articlesAnalyzed += articles.length;

      for (const article of articles) {
        const classification = classifyNewsHeadline(article.title);
        if (!classification) continue;

        // Disambiguation: Ensure article mentions company or contact
        const lowerTitle = article.title.toLowerCase();
        const mentionsCompany = lowerTitle.includes(cleanName.toLowerCase());
        if (!mentionsCompany && !article.description.toLowerCase().includes(cleanName.toLowerCase())) {
          continue;
        }

        // Format publication date
        let eventDate = new Date().toISOString().split('T')[0];
        if (article.pubDate) {
          const parsed = new Date(article.pubDate);
          if (!isNaN(parsed.getTime())) {
            eventDate = parsed.toISOString().split('T')[0];
          }
        }

        const sourceLabel = article.source || 'Google News Discovery';
        const evidenceSummary = `Public News Signal: "${article.title}". Source: ${sourceLabel}. Published: ${eventDate}.`;

        // Check if contact-level or account-level
        let targetContactId = null;
        for (const c of accContacts) {
          if (c.name && lowerTitle.includes(c.name.toLowerCase())) {
            targetContactId = c.contactId || c.id;
            break;
          }
        }

        try {
          const celebrationData = {
            accountId: aId,
            contactId: targetContactId,
            eventType: classification.eventType,
            eventTitle: article.title,
            eventDescription: article.description || `Discovered from public news: ${article.title}`,
            eventDate,
            sourceType: SOURCE_TYPES.PUBLIC_NEWS,
            sourceName: sourceLabel,
            sourceUrl: article.link || null,
            sourceDate: eventDate,
            evidenceSummary,
            matchedEntity: targetContactId ? 'Key Contact' : compName,
            confidence: classification.confidence,
            verificationStatus: VERIFICATION_STATUS.PENDING_VERIFICATION, // Always human-reviewed
            status: CELEBRATION_STATUS.PENDING_VERIFICATION
          };

          const created = await createCelebration(celebrationData, { uid: userId, name: 'Public News Monitor' });
          result.milestonesDiscovered++;
          result.created.push({
            id: created.id,
            account: compName,
            title: article.title,
            eventType: classification.eventType
          });
        } catch (err) {
          // Handled if duplicate already discovered
        }
      }
    }

    // Polite rate limiting (100ms pause between accounts)
    await new Promise(r => setTimeout(r, 100));
  }

  return result;
}

