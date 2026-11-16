import { db } from '../config/database.js';

// Common corporate suffixes to normalize for high-precision entity resolution
const CORP_SUFFIXES = /\b(inc|incorporated|corp|corporation|llc|ltd|limited|gmbh|ag|pvt|co|plc|holdings|group|technologies|solutions)\b/gi;

/**
 * Normalizes an organization or company name by trimming, removing legal suffixes,
 * and stripping non-alphanumeric punctuation.
 */
export function normalizeCompanyName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(CORP_SUFFIXES, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes email address to lower-cased trimmed string.
 */
export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Normalizes human contact name for matching.
 */
export function normalizePersonName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|dr|prof|eng|shri|smt)\.?\s+/gi, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts normalized root domain from a website URL or email address.
 * E.g. "https://www.zeiss.com/meditec/en/home.html" -> "zeiss.com"
 * E.g. "john.smith@gehealthcare.com" -> "gehealthcare.com"
 */
export function extractDomain(input) {
  if (!input || typeof input !== 'string') return '';
  let str = input.trim().toLowerCase();
  if (str.includes('@')) {
    str = str.split('@')[1];
  }
  str = str.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return str.split('/')[0].split(':')[0].trim();
}

/**
 * Loads all CRM Accounts and Contacts in-memory for high-speed, RBAC-safe matching.
 */
export async function loadCrmEntities(user = null) {
  const [accountsSnap, contactsSnap] = await Promise.all([
    db.collection('accounts').get(),
    db.collection('contacts').get()
  ]);

  let accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  let contacts = contactsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Apply RBAC filtering if user context provided and not ADMIN
  if (user && user.role !== 'ADMIN' && user.uid) {
    const ownedAccountIds = new Set();

    accounts.forEach(a => {
      const aid = a.accountId || a.id;
      if (a.ownerId === user.uid || (a.ownerEmail && a.ownerEmail.toLowerCase() === user.email?.toLowerCase())) {
        ownedAccountIds.add(aid);
      }
    });

    contacts.forEach(c => {
      if (c.ownerId === user.uid || (c.ownerEmail && c.ownerEmail.toLowerCase() === user.email?.toLowerCase())) {
        if (c.accountId) ownedAccountIds.add(c.accountId);
      }
    });

    accounts = accounts.filter(a => ownedAccountIds.has(a.accountId || a.id));
    contacts = contacts.filter(c => ownedAccountIds.has(c.accountId));
  }

  return { accounts, contacts };
}

/**
 * Matches an input text/company candidate against CRM Accounts.
 * Supports exact name, normalized name, alias match, and domain/website match.
 * Rejects ambiguous matches where candidate matches multiple distinct accounts.
 */
export function matchAccountEntity(candidate, accounts, options = {}) {
  if (!candidate || !accounts || accounts.length === 0) {
    return { matched: false, reason: 'EMPTY_INPUT_OR_NO_ACCOUNTS' };
  }

  const rawCandidate = String(candidate).trim();
  const normCandidate = normalizeCompanyName(rawCandidate);
  const candDomain = extractDomain(rawCandidate);

  const directMatches = [];

  for (const acc of accounts) {
    const aid = acc.accountId || acc.id;
    const compName = acc.companyName || acc.name || '';
    const normComp = normalizeCompanyName(compName);
    const accDomain = extractDomain(acc.website || acc.domain || acc.email || '');

    // 1. Direct domain match (High precision)
    if (candDomain && accDomain && candDomain === accDomain) {
      directMatches.push({ account: acc, score: 100, matchType: 'DOMAIN_MATCH' });
      continue;
    }

    // 2. Exact name match (Case-insensitive)
    if (compName.toLowerCase() === rawCandidate.toLowerCase()) {
      directMatches.push({ account: acc, score: 98, matchType: 'EXACT_NAME' });
      continue;
    }

    // 3. Normalized name exact match
    if (normCandidate.length >= 3 && normComp === normCandidate) {
      directMatches.push({ account: acc, score: 95, matchType: 'NORMALIZED_NAME' });
      continue;
    }

    // 4. Aliases match
    if (acc.aliases) {
      const aliasList = Array.isArray(acc.aliases) 
        ? acc.aliases 
        : String(acc.aliases).split(',').map(s => s.trim().toLowerCase());
      
      const foundAlias = aliasList.find(al => {
        const normAlias = normalizeCompanyName(al);
        return al.toLowerCase() === rawCandidate.toLowerCase() || (normAlias && normAlias === normCandidate);
      });

      if (foundAlias) {
        directMatches.push({ account: acc, score: 92, matchType: 'ALIAS_MATCH', matchedAlias: foundAlias });
        continue;
      }
    }
  }

  if (directMatches.length === 0) {
    return { matched: false, reason: 'NO_MATCH_FOUND' };
  }

  // Ambiguity check: if multiple distinct accounts matched with high scores
  if (directMatches.length > 1) {
    const uniqueAccountIds = new Set(directMatches.map(m => m.account.accountId || m.account.id));
    if (uniqueAccountIds.size > 1) {
      return {
        matched: false,
        isAmbiguous: true,
        reason: 'AMBIGUOUS_MULTIPLE_ACCOUNTS_MATCHED',
        candidates: directMatches.map(m => ({
          accountId: m.account.accountId || m.account.id,
          companyName: m.account.companyName,
          matchType: m.matchType
        }))
      };
    }
  }

  const best = directMatches[0];
  return {
    matched: true,
    account: best.account,
    accountId: best.account.accountId || best.account.id,
    companyName: best.account.companyName,
    matchType: best.matchType,
    score: best.score
  };
}

/**
 * Matches an input person/contact candidate against CRM Contacts.
 * Can be constrained to a specific accountId.
 * Rejects ambiguous matches when the same person name exists across multiple accounts.
 */
export function matchContactEntity(candidate, contacts, targetAccountId = null) {
  if (!candidate || !contacts || contacts.length === 0) {
    return { matched: false, reason: 'EMPTY_INPUT_OR_NO_CONTACTS' };
  }

  const rawCandidate = String(candidate).trim();
  const isEmail = rawCandidate.includes('@');
  const normEmail = isEmail ? normalizeEmail(rawCandidate) : null;
  const normName = !isEmail ? normalizePersonName(rawCandidate) : null;

  const matches = [];

  for (const c of contacts) {
    // If targetAccountId is provided, filter contacts strictly to that account
    if (targetAccountId && c.accountId !== targetAccountId) {
      continue;
    }

    const cEmail = normalizeEmail(c.email);
    const cName = normalizePersonName(c.name);

    if (normEmail && cEmail && normEmail === cEmail) {
      matches.push({ contact: c, score: 100, matchType: 'EXACT_EMAIL' });
      continue;
    }

    if (normName && cName && normName === cName && normName.length >= 3) {
      matches.push({ contact: c, score: 95, matchType: 'EXACT_NAME' });
      continue;
    }
  }

  if (matches.length === 0) {
    return { matched: false, reason: 'NO_CONTACT_MATCH' };
  }

  if (matches.length > 1) {
    const uniqueContactIds = new Set(matches.map(m => m.contact.contactId || m.contact.id));
    if (uniqueContactIds.size > 1) {
      return {
        matched: false,
        isAmbiguous: true,
        reason: 'AMBIGUOUS_MULTIPLE_CONTACTS_MATCHED',
        candidates: matches.map(m => ({
          contactId: m.contact.contactId || m.contact.id,
          name: m.contact.name,
          accountId: m.contact.accountId
        }))
      };
    }
  }

  const best = matches[0];
  return {
    matched: true,
    contact: best.contact,
    contactId: best.contact.contactId || best.contact.id,
    contactName: best.contact.name,
    accountId: best.contact.accountId,
    matchType: best.matchType,
    score: best.score
  };
}

/**
 * Master entity resolver: Takes raw discovery context (company name, person name, email, website)
 * and resolves it to either an Account-level or Contact-level CRM reference with RBAC verification.
 */
export async function resolveCustomerEntity({ companyCandidate, personCandidate, websiteUrl, email, user = null }) {
  const { accounts, contacts } = await loadCrmEntities(user);

  // 1. Resolve Account
  let accountMatch = null;
  if (companyCandidate || websiteUrl) {
    accountMatch = matchAccountEntity(companyCandidate || websiteUrl, accounts);
  }

  // 2. Resolve Contact if provided
  let contactMatch = null;
  if (personCandidate || email) {
    const targetAccountId = accountMatch?.matched ? accountMatch.accountId : null;
    contactMatch = matchContactEntity(personCandidate || email, contacts, targetAccountId);

    // If contact matched by unique email but account wasn't provided, link account from contact
    if (contactMatch.matched && !accountMatch?.matched) {
      const parentAcc = accounts.find(a => (a.accountId || a.id) === contactMatch.accountId);
      if (parentAcc) {
        accountMatch = {
          matched: true,
          account: parentAcc,
          accountId: parentAcc.accountId || parentAcc.id,
          companyName: parentAcc.companyName,
          matchType: 'INFERRED_FROM_CONTACT'
        };
      }
    }
  }

  // Person-level occasion resolution
  if (contactMatch?.matched && accountMatch?.matched) {
    return {
      entityType: 'PERSON',
      accountId: accountMatch.accountId,
      accountName: accountMatch.companyName,
      contactId: contactMatch.contactId,
      contactName: contactMatch.contactName,
      matched: true,
      confidence: Math.min(accountMatch.score || 95, contactMatch.score || 95)
    };
  }

  // Account-level milestone resolution (contactId is null)
  if (accountMatch?.matched && !personCandidate) {
    return {
      entityType: 'ACCOUNT',
      accountId: accountMatch.accountId,
      accountName: accountMatch.companyName,
      contactId: null,
      contactName: null,
      matched: true,
      confidence: accountMatch.score || 95
    };
  }

  return {
    matched: false,
    reason: accountMatch?.isAmbiguous || contactMatch?.isAmbiguous
      ? 'AMBIGUOUS_ENTITY'
      : 'NO_VALID_CRM_MATCH',
    accountMatch,
    contactMatch
  };
}

