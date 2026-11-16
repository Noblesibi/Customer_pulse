import { db, logActivity } from '../config/database.js';
import {
  EVENT_TYPES,
  SOURCE_TYPES,
  VERIFICATION_STATUS,
  CELEBRATION_STATUS,
  createCelebration
} from './celebration.service.js';
import { matchContactEntity, matchAccountEntity } from './entityMatching.service.js';

// Milestone patterns for deep semantic matching
const MILESTONE_PATTERNS = [
  {
    type: EVENT_TYPES.PROMOTION,
    regex: /\b(promoted\s+to|promotion\s+to|appointed\s+as|stepping\s+into\s+the\s+role\s+of|new\s+leadership\s+role|taking\s+over\s+as|elevated\s+to|named\s+as\s+the\s+new)\b/i,
    label: 'Promotion / Leadership Appointment'
  },
  {
    type: EVENT_TYPES.WORK_ANNIVERSARY,
    regex: /\b(work\s+anniversary|service\s+anniversary|celebrating\s+(\d+|one|two|three|four|five|ten)\s+years\s+(at|with|of\s+service)|years\s+of\s+dedicated\s+service)\b/i,
    label: 'Work Anniversary'
  },
  {
    type: EVENT_TYPES.BIRTHDAY,
    regex: /\b(happy\s+birthday|birthday\s+wishes|celebrating\s+your\s+birthday|wonderful\s+birthday)\b/i,
    label: 'Birthday'
  },
  {
    type: EVENT_TYPES.AWARD,
    regex: /\b(award\s+for|received\s+the\s+award|honored\s+with|won\s+the|recognized\s+for\s+excellence|hall\s+of\s+fame|distinguished\s+service\s+award)\b/i,
    label: 'Award / Special Recognition'
  },
  {
    type: EVENT_TYPES.CERTIFICATION,
    regex: /\b(certified\s+in|achieved\s+(iso|pmp|aws|gcp|azure|six\s+sigma)\s+certification|received\s+certification|accreditation)\b/i,
    label: 'Professional Certification'
  },
  {
    type: EVENT_TYPES.COMPANY_ANNIVERSARY,
    regex: /\b(company\s+anniversary|celebrates\s+(\d+)\s+years\s+of\s+operation|founded\s+(\d+)\s+years\s+ago|celebrating\s+our\s+(\d+)th\s+anniversary)\b/i,
    label: 'Company Anniversary'
  },
  {
    type: EVENT_TYPES.PARTNERSHIP_MILESTONE,
    regex: /\b(strategic\s+partnership|partnered\s+with|collaboration\s+agreement|mou\s+signed|joint\s+venture)\b/i,
    label: 'Partnership Milestone'
  },
  {
    type: EVENT_TYPES.BUSINESS_MILESTONE,
    regex: /\b(expansion|new\s+facility|new\s+headquarters|opened\s+new\s+office|manufacturing\s+plant|major\s+contract\s+award)\b/i,
    label: 'Business Expansion / Milestone'
  }
];

// Operational & noise patterns to filter out
const OPERATIONAL_NOISE = /\b(out\s+of\s+office|automatic\s+reply|auto-reply|undeliverable|delivery\s+failure|meeting\s+agenda|sync\s+call|weekly\s+sync|status\s+update|calendar\s+invite|cancelled\s+event|zoom\s+link|teams\s+meeting)\b/i;

/**
 * Extracts explicit event dates mentioned inside the email body or subject.
 * Falls back to interaction date.
 */
function extractDateFromContent(text, fallbackDate) {
  if (!text) return fallbackDate || new Date().toISOString().split('T')[0];

  // Try ISO YYYY-MM-DD
  const isoMatch = text.match(/\b(202\d-[01]\d-[0-3]\d)\b/);
  if (isoMatch) return isoMatch[1];

  // Try Month DD, YYYY (e.g. October 27, 2026 or Oct 27, 2026)
  const monthMatch = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(202\d)\b/i);
  if (monthMatch) {
    const d = new Date(`${monthMatch[1]} ${monthMatch[2]}, ${monthMatch[3]}`);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }

  return fallbackDate || new Date().toISOString().split('T')[0];
}

/**
 * Scans authorized CRM email interactions for genuine customer milestones.
 * Strictly operates on existing Accounts and Contacts.
 * Staged events require employee verification (PENDING_VERIFICATION).
 * 
 * @param {Object} options
 * @param {string} [options.accountId] Optional account filter
 * @param {number} [options.limit=100] Max interactions to inspect
 * @param {string} [options.userId] Executing user context
 */
export async function scanInteractionsForMilestones({ accountId = null, limit = 100, userId = 'system' } = {}) {
  const result = {
    totalScanned: 0,
    milestonesFound: 0,
    skippedNoise: 0,
    duplicatesSkipped: 0,
    created: []
  };

  // 1. Fetch authorized email interactions
  let query = db.collection('interactions').where('source', '==', 'Email');
  if (accountId) {
    query = query.where('accountId', '==', accountId);
  }
  const snap = await query.get();
  const interactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  result.totalScanned = interactions.length;
  if (interactions.length === 0) return result;

  // 2. Fetch Accounts and Contacts for entity validation
  const [accSnap, conSnap] = await Promise.all([
    db.collection('accounts').get(),
    db.collection('contacts').get()
  ]);

  const accountMap = new Map();
  for (const doc of accSnap.docs) {
    const a = doc.data();
    const aid = a.accountId || a.id || doc.id;
    if (aid) accountMap.set(aid, a);
  }

  const contactMap = new Map();
  for (const doc of conSnap.docs) {
    const c = doc.data();
    const cid = c.contactId || c.id || doc.id;
    if (cid) contactMap.set(cid, c);
  }

  // 3. Process each interaction
  for (const item of interactions) {
    const aId = item.accountId;
    const cId = item.contactId;

    // Must belong to an existing CRM account
    if (!aId || !accountMap.has(aId)) continue;
    const account = accountMap.get(aId);
    const contact = cId ? contactMap.get(cId) : null;

    const subject = (item.subject || '').trim();
    const message = (item.messageText || '').trim();
    const combinedText = `${subject}\n${message}`;

    // Skip operational meetings, out of office, calendar bounces
    if (OPERATIONAL_NOISE.test(subject) || (item.is_auto_reply === true)) {
      result.skippedNoise++;
      continue;
    }

    // Match against milestone patterns
    for (const pattern of MILESTONE_PATTERNS) {
      if (pattern.regex.test(combinedText)) {
        const eventDate = extractDateFromContent(combinedText, item.date);
        const contactName = contact?.name || item.contactName || '';
        const title = contactName 
          ? `${contactName} – ${pattern.label}`
          : `${account.companyName} – ${pattern.label}`;

        // Build brief evidence summary (safe, no full raw dump)
        const snippet = subject.length > 0 ? subject : message.substring(0, 100);
        const evidenceSummary = `Authorized Email Intelligence: Subject "${subject}". Snippet: "${snippet}". Date: ${item.date || eventDate}.`;

        try {
          const celebrationData = {
            accountId: aId,
            contactId: cId || null,
            eventType: pattern.type,
            eventTitle: title,
            eventDescription: `Discovered from authorized customer email interaction. ${pattern.label} noted.`,
            eventDate,
            sourceType: SOURCE_TYPES.CRM_EMAIL,
            sourceName: 'CRM Email Intelligence',
            sourceReference: item.interactionId || item.id,
            sourceDate: item.date || eventDate,
            evidenceSummary,
            matchedEntity: contactName || account.companyName,
            confidence: 'High',
            verificationStatus: VERIFICATION_STATUS.PENDING_VERIFICATION, // Always human-reviewed
            status: CELEBRATION_STATUS.PENDING_VERIFICATION
          };

          const createdEvent = await createCelebration(celebrationData, { uid: userId, name: 'CRM Email Intelligence' });
          result.milestonesFound++;
          result.created.push({
            id: createdEvent.id,
            accountId: aId,
            contactId: cId,
            eventType: pattern.type,
            title
          });
        } catch (err) {
          // Handled if duplicate already exists
          result.duplicatesSkipped++;
        }

        // Once classified to highest priority pattern, proceed to next interaction
        break;
      }
    }
  }

  return result;
}

