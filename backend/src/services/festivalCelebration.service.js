import { db } from '../config/database.js';
import {
  EVENT_TYPES,
  SOURCE_TYPES,
  VERIFICATION_STATUS,
  CELEBRATION_STATUS
} from './celebration.service.js';

function newId(prefix = 'cel') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Curated Comprehensive Master Calendar of Public Celebrations, National Days, and Cultural Festivals.
 * Dates with explicit MM-DD recur annually.
 * Multi-year movable festivals (Diwali, Eid, Holi, Easter, Onam) provide exact verified dates.
 */
export const PUBLIC_FESTIVALS_CALENDAR = [
  // ── 1. National & Public Celebrations ──────────────────────────────────────
  {
    id: 'republic_day',
    name: 'Republic Day',
    category: 'PUBLIC_HOLIDAY',
    monthDay: '01-26',
    applicableRegions: ['India'],
    defaultSubject: 'Warm Republic Day Greetings from NeST Digital',
    defaultGreeting: 'Wishing you, your family, and the entire team a very Happy Republic Day! May this special day bring peace, pride, and continued prosperity to our nations and partnerships.'
  },
  {
    id: 'independence_day',
    name: 'Independence Day',
    category: 'PUBLIC_HOLIDAY',
    monthDay: '08-15',
    applicableRegions: ['India'],
    defaultSubject: 'Happy Independence Day from NeST Digital',
    defaultGreeting: 'Warmest wishes to you and your colleagues on the occasion of Independence Day. Here’s celebrating unity, progress, and our fruitful association.'
  },
  {
    id: 'gandhi_jayanti',
    name: 'Gandhi Jayanti',
    category: 'PUBLIC_HOLIDAY',
    monthDay: '10-02',
    applicableRegions: ['India'],
    defaultSubject: 'Warm Wishes on Gandhi Jayanti',
    defaultGreeting: 'Remembering the values of truth, integrity, and dedication on Gandhi Jayanti. Wishing you and your organization continued success.'
  },
  {
    id: 'new_year',
    name: "New Year's Day",
    category: 'PUBLIC_HOLIDAY',
    monthDay: '01-01',
    applicableRegions: ['All', 'Global'],
    defaultSubject: 'Happy New Year from NeST Digital!',
    defaultGreeting: 'Wishing you and everyone at your company a joyful, healthy, and prosperous New Year! We deeply appreciate your partnership and look forward to reaching greater heights together in the coming year.'
  },
  {
    id: 'labor_day',
    name: 'International Workers’ Day / May Day',
    category: 'PUBLIC_HOLIDAY',
    monthDay: '05-01',
    applicableRegions: ['All', 'Global'],
    defaultSubject: 'Happy May Day — Honoring Dedication and Excellence',
    defaultGreeting: 'Celebrating dedication, passion, and hard work this May Day. Thank you for your inspiring collaboration and commitment to excellence.'
  },

  // ── 2. Major Cultural & Religious Festivals ────────────────────────────────
  {
    id: 'pongal_sankranti',
    name: 'Makar Sankranti / Pongal / Lohri',
    category: 'CULTURAL_FESTIVAL',
    monthDay: '01-14',
    applicableRegions: ['India'],
    defaultSubject: 'Happy Pongal and Makar Sankranti Wishes',
    defaultGreeting: 'May this harvest festival usher in abundance, good fortune, and great milestones. Warm greetings on Pongal, Makar Sankranti, and Lohri!'
  },
  {
    id: 'maha_shivratri',
    name: 'Maha Shivratri',
    category: 'CULTURAL_FESTIVAL',
    datesByYear: {
      '2026': '2026-02-15',
      '2027': '2027-03-06'
    },
    monthDay: '02-15',
    applicableRegions: ['India'],
    defaultSubject: 'Warm Greetings on Maha Shivratri',
    defaultGreeting: 'Wishing you and your family peace, good health, and spiritual strength on the auspicious occasion of Maha Shivratri.'
  },
  {
    id: 'national_science_day',
    name: 'National Science Day',
    category: 'PROFESSIONAL_OBSERVANCE',
    monthDay: '02-28',
    applicableRegions: ['India'],
    defaultSubject: 'Happy National Science Day — Celebrating Scientific Discovery 🔬',
    defaultGreeting: 'Saluting the curiosity, rigor, and spirit of inquiry that drive technological breakthroughs. Wishing your engineering and research teams an inspiring National Science Day!'
  },
  {
    id: 'holi',
    name: 'Holi (Festival of Colors)',
    category: 'CULTURAL_FESTIVAL',
    datesByYear: {
      '2026': '2026-03-04',
      '2027': '2027-03-22'
    },
    monthDay: '03-04',
    applicableRegions: ['India'],
    defaultSubject: 'Happy Holi — Wishing You Vibrant Success and Joy! 🎨',
    defaultGreeting: 'May this festival of colors bring vibrant energy, happiness, and renewed enthusiasm to you and your esteemed organization. Happy Holi!'
  },
  {
    id: 'eid_al_fitr',
    name: 'Eid al-Fitr',
    category: 'CULTURAL_FESTIVAL',
    datesByYear: {
      '2026': '2026-03-20',
      '2027': '2027-03-10'
    },
    monthDay: '03-20',
    applicableRegions: ['India', 'Middle East', 'Global'],
    defaultSubject: 'Eid Mubarak — Warm Greetings from NeST Digital 🌙',
    defaultGreeting: 'Eid Mubarak to you, your family, and your team! May this joyous occasion bring happiness, harmony, and continued prosperity to your life and business.'
  },
  {
    id: 'good_friday',
    name: 'Good Friday',
    category: 'PUBLIC_HOLIDAY',
    datesByYear: {
      '2026': '2026-04-03',
      '2027': '2027-03-26'
    },
    monthDay: '04-03',
    applicableRegions: ['India', 'Europe', 'USA', 'Global', 'All'],
    defaultSubject: 'Peaceful and Blessed Good Friday Wishes from NeST Digital',
    defaultGreeting: 'Wishing you and your colleagues peace, grace, and meaningful reflection on the occasion of Good Friday.'
  },
  {
    id: 'easter',
    name: 'Easter Sunday',
    category: 'CULTURAL_FESTIVAL',
    datesByYear: {
      '2026': '2026-04-05',
      '2027': '2027-03-28'
    },
    monthDay: '04-05',
    applicableRegions: ['USA', 'Europe', 'Global', 'All'],
    defaultSubject: 'Happy Easter from NeST Digital 🐣',
    defaultGreeting: 'Wishing you and your loved ones a blessed and joyful Easter filled with hope, renewal, and happiness.'
  },
  {
    id: 'vishu_baisakhi',
    name: 'Vishu / Baisakhi / Ugadi / Puthandu',
    category: 'CULTURAL_FESTIVAL',
    monthDay: '04-14',
    applicableRegions: ['India'],
    defaultSubject: 'Warm Wishes on Vishu, Baisakhi, and the Harvest New Year! 🌾',
    defaultGreeting: 'Wishing you, your family, and your entire organization abundance, good health, and joyful new beginnings on Vishu, Baisakhi, Ugadi, and Tamil New Year. May this new season bring grand achievements to your team!'
  },
  {
    id: 'eid_al_adha',
    name: 'Eid al-Adha (Bakrid)',
    category: 'CULTURAL_FESTIVAL',
    datesByYear: {
      '2026': '2026-05-27',
      '2027': '2027-05-17'
    },
    monthDay: '05-27',
    applicableRegions: ['India', 'Middle East', 'Global'],
    defaultSubject: 'Warm Eid al-Adha Greetings from NeST Digital',
    defaultGreeting: 'Wishing you and your loved ones a blessed Eid al-Adha filled with grace, peace, and togetherness.'
  },
  {
    id: 'buddha_purnima',
    name: 'Buddha Purnima',
    category: 'PUBLIC_HOLIDAY',
    datesByYear: {
      '2026': '2026-05-31',
      '2027': '2027-05-20'
    },
    monthDay: '05-31',
    applicableRegions: ['India', 'Global'],
    defaultSubject: 'Peace and Harmony on Buddha Purnima',
    defaultGreeting: 'Wishing you, your family, and your team peace, compassion, and enlightenment on the sacred day of Buddha Purnima.'
  },
  {
    id: 'muharram',
    name: 'Muharram (Islamic New Year)',
    category: 'PUBLIC_HOLIDAY',
    datesByYear: {
      '2026': '2026-06-26',
      '2027': '2027-06-16'
    },
    monthDay: '06-26',
    applicableRegions: ['India', 'Middle East'],
    defaultSubject: 'Warm Wishes on the Islamic New Year & Muharram',
    defaultGreeting: 'Wishing you and your loved ones peace, wellness, and prosperity in this new year.'
  },
  {
    id: 'us_independence_day',
    name: '4th of July (US Independence Day)',
    category: 'PUBLIC_HOLIDAY',
    monthDay: '07-04',
    applicableRegions: ['USA'],
    defaultSubject: 'Happy 4th of July from NeST Digital! 🎆',
    defaultGreeting: 'Wishing you, your team, and your families a joyous and memorable 4th of July holiday! Thank you for your continued partnership.'
  },
  {
    id: 'onam',
    name: 'Onam (Kerala Harvest Festival)',
    category: 'CULTURAL_FESTIVAL',
    datesByYear: {
      '2026': '2026-08-26',
      '2027': '2027-09-12'
    },
    monthDay: '08-26',
    applicableRegions: ['India'],
    defaultSubject: 'Happy Onam from NeST Digital! 🌸',
    defaultGreeting: 'Wishing you a bountiful, joyful, and prosperous Onam. May the festive spirit bring immense happiness and success to your endeavors.'
  },
  {
    id: 'raksha_bandhan',
    name: 'Raksha Bandhan',
    category: 'CULTURAL_FESTIVAL',
    datesByYear: {
      '2026': '2026-08-28',
      '2027': '2027-08-17'
    },
    monthDay: '08-28',
    applicableRegions: ['India'],
    defaultSubject: 'Warm Greetings on Raksha Bandhan',
    defaultGreeting: 'Celebrating the timeless bonds of trust, protection, and mutual care. Wishing you and your colleagues a joyful Raksha Bandhan!'
  },
  {
    id: 'milad_un_nabi',
    name: 'Milad-un-Nabi / Mawlid (Eid-e-Milad)',
    category: 'CULTURAL_FESTIVAL',
    datesByYear: {
      '2026': '2026-08-26',
      '2027': '2027-08-15'
    },
    monthDay: '08-26',
    applicableRegions: ['India', 'Middle East', 'Global'],
    defaultSubject: 'Warm Greetings on Milad-un-Nabi from NeST Digital',
    defaultGreeting: 'May the blessed occasion of Milad-un-Nabi bring peace, compassion, and divine harmony to you, your family, and your team.'
  },
  {
    id: 'janmashtami',
    name: 'Krishna Janmashtami',
    category: 'CULTURAL_FESTIVAL',
    datesByYear: {
      '2026': '2026-09-04',
      '2027': '2027-08-25'
    },
    monthDay: '09-04',
    applicableRegions: ['India'],
    defaultSubject: 'Warm Wishes on Janmashtami',
    defaultGreeting: 'May this auspicious occasion bring joy, peace, and good health to you and your family. Happy Janmashtami!'
  },
  {
    id: 'ganesh_chaturthi',
    name: 'Ganesh Chaturthi',
    category: 'CULTURAL_FESTIVAL',
    datesByYear: {
      '2026': '2026-09-14',
      '2027': '2027-09-04'
    },
    monthDay: '09-14',
    applicableRegions: ['India'],
    defaultSubject: 'Happy Ganesh Chaturthi from NeST Digital 🐘',
    defaultGreeting: 'May Lord Ganesha bless you with wisdom, new beginnings, and abundant prosperity. Warm greetings on Ganesh Chaturthi!'
  },
  {
    id: 'ayudha_puja',
    name: 'Ayudha Puja / Maha Navami',
    category: 'CULTURAL_FESTIVAL',
    datesByYear: {
      '2026': '2026-10-19',
      '2027': '2027-10-09'
    },
    monthDay: '10-19',
    applicableRegions: ['India'],
    defaultSubject: 'Happy Ayudha Puja — Honoring Tools, Technology, and Craftsmanship ⚙️',
    defaultGreeting: 'On this auspicious occasion of Ayudha Puja, we honor the tools, technologies, and craft that drive our joint innovation and progress. Wishing your team continued precision and success!'
  },
  {
    id: 'dussehra',
    name: 'Dussehra / Navratri / Vijayadashami',
    category: 'CULTURAL_FESTIVAL',
    datesByYear: {
      '2026': '2026-10-20',
      '2027': '2027-10-10'
    },
    monthDay: '10-20',
    applicableRegions: ['India'],
    defaultSubject: 'Happy Dussehra & Navratri Greetings from NeST Digital 🏹',
    defaultGreeting: 'Celebrating the triumph of righteousness, courage, and excellence. Wishing you and your organization victory and continued growth this Dussehra!'
  },
  {
    id: 'diwali',
    name: 'Diwali (Festival of Lights)',
    category: 'CULTURAL_FESTIVAL',
    datesByYear: {
      '2026': '2026-11-08',
      '2027': '2027-10-29'
    },
    monthDay: '11-08',
    applicableRegions: ['India', 'Global'],
    defaultSubject: 'Wishing You and Your Team a Joyous and Prosperous Diwali! 🪔',
    defaultGreeting: 'May the divine light of Diwali illuminate your path with joy, good health, and abundant prosperity. Wishing you and everyone at your organization a very Happy Diwali!'
  },
  {
    id: 'gurpurab',
    name: 'Guru Nanak Jayanti / Gurpurab',
    category: 'CULTURAL_FESTIVAL',
    datesByYear: {
      '2026': '2026-11-24',
      '2027': '2027-11-14'
    },
    monthDay: '11-24',
    applicableRegions: ['India'],
    defaultSubject: 'Warm Wishes on Guru Nanak Jayanti',
    defaultGreeting: 'May the teachings of compassion, equality, and selfless service inspire peace and success. Wishing you a blessed Gurpurab.'
  },
  {
    id: 'thanksgiving',
    name: 'Thanksgiving',
    category: 'CULTURAL_FESTIVAL',
    datesByYear: {
      '2026': '2026-11-26',
      '2027': '2027-11-25'
    },
    monthDay: '11-26',
    applicableRegions: ['USA'],
    defaultSubject: 'Happy Thanksgiving — In Appreciation of Our Partnership 🦃',
    defaultGreeting: 'At this time of Thanksgiving, we pause to express our sincere appreciation for your partnership and trust. Wishing you and your team a wonderful holiday!'
  },
  {
    id: 'christmas',
    name: 'Christmas',
    category: 'CULTURAL_FESTIVAL',
    monthDay: '12-25',
    applicableRegions: ['All', 'Global'],
    defaultSubject: 'Merry Christmas and Warm Holiday Greetings from NeST Digital 🎄',
    defaultGreeting: 'Wishing you and your loved ones a joyous Christmas filled with peace, happiness, and good cheer. Thank you for being a valued partner throughout the year.'
  },

  // ── 3. Global Observances & Professional Days ──────────────────────────────
  {
    id: 'womens_day',
    name: 'International Women’s Day',
    category: 'PROFESSIONAL_OBSERVANCE',
    monthDay: '03-08',
    applicableRegions: ['All', 'Global'],
    defaultSubject: 'Happy International Women’s Day from NeST Digital 💜',
    defaultGreeting: 'Celebrating the leadership, innovation, and vital contributions of women across our industries. Wishing you and your team an inspiring International Women’s Day!'
  },
  {
    id: 'world_health_day',
    name: 'World Health Day',
    category: 'PROFESSIONAL_OBSERVANCE',
    monthDay: '04-07',
    applicableRegions: ['All', 'Global'],
    defaultSubject: 'World Health Day — Honoring Healthcare Innovation',
    defaultGreeting: 'On World Health Day, we salute your team’s dedication to healthcare advancement, technology, and patient care. Thank you for your impactful work!'
  },
  {
    id: 'engineers_day',
    name: 'Engineers’ Day',
    category: 'PROFESSIONAL_OBSERVANCE',
    monthDay: '09-15',
    applicableRegions: ['India', 'Global', 'All'],
    defaultSubject: 'Happy Engineers’ Day — Celebrating Innovation and Excellence',
    defaultGreeting: 'To the innovators, creators, and problem-solvers shaping tomorrow: wishing you and your engineering teams a very Happy Engineers’ Day!'
  }
];

export function getFestivalDateForYear(festival, targetYear) {
  if (festival.datesByYear && festival.datesByYear[String(targetYear)]) {
    return festival.datesByYear[String(targetYear)];
  }
  if (festival.monthDay) {
    return `${targetYear}-${festival.monthDay}`;
  }
  return null;
}

/**
 * Automatically detects the geographical jurisdiction of a CRM account
 * based on physical address (region), corporate TLD/domain, and enterprise entity dictionary.
 */
export function detectAccountGeography(acc) {
  if (!acc) return 'Global';
  const name = (acc.companyName || '').trim();
  const region = (acc.region || '').trim();
  const web = (acc.website || '').trim().toLowerCase();
  const text = (name + ' ' + region + ' ' + web).toLowerCase();

  // 1. Indian Aerospace / Defense / PSUs / Key Enterprises
  const indianKnown = [
    'isro', 'drdo', 'bel', 'npol', 'lrde', 'cabs', 'chess', 'iitm', 'ade',
    'mahindra', 'bharat forge', 'hero motors', 'montra', 'amararaja',
    'ultra vilolette', 'ust', 'synedyne', 'hytork', 'karnavati', 'bajaj',
    'tara aviation', 'aerokalinga', 'thriveni', 'divgi'
  ];
  if (indianKnown.some(k => text.includes(k))) return 'India';

  // 2. Latin America
  if (text.includes('latam') || text.includes('brazil') || text.includes('mexico')) return 'Latin America';

  // NeST Group / India internal accounts & Indian mobile patterns
  if (
    text.includes('@nestgroup.net') ||
    text.includes('nest digital') ||
    text.includes('nest group') ||
    /\b(\+?91|9847\d{6}|8891\d{6}|8590\d{6}|[6-9]\d{9})\b/.test(account.phone || '') ||
    account.accountId === 'acc-hh43i0629' ||
    (account.region && account.region.toLowerCase().trim() === 'test')
  ) {
    return 'India';
  }

  // 3. Middle East / Gulf
  if (/\b(uae|dubai|abu dhabi|qatar|doha|lebanon|beirut|saudi|riyadh|jeddah|kuwait|oman|muscat|bahrain|algeria|ouargla|mannai)\b/.test(text) || web.includes('.qa') || web.includes('.ae') || web.includes('.sa')) {
    return 'Middle East';
  }

  // 4. Japan / Korea / AsiaPac
  if (/\b(japan|tokyo|osaka|nagoya|kyoto|yazaki|access-eng|kanagawa|sagamihara|mst japan|hitachi hisys)\b/.test(text) || web.includes('.jp')) return 'Japan';
  if (text.includes('south korea') || text.includes('samsung') || text.includes('suwon')) return 'South Korea';
  if (text.includes('australia') || web.includes('.au') || text.includes('epping vic')) return 'Australia';
  if (text.includes('tanzania')) return 'Africa';

  // 5. Europe
  if (/\b(germany|deutschland|oberkochen|hella|zeiss|forvia)\b/.test(text) || web.includes('.de')) return 'Europe';
  if (/\b(france|meudon|paris)\b/.test(text) || web.includes('.fr')) return 'Europe';
  if (/\b(uk|united kingdom|london|eminox)\b/.test(text) || web.includes('.co.uk')) return 'Europe';
  if (/\b(switzerland|zurich|abb|schiller)\b/.test(text) || web.includes('.ch')) return 'Europe';
  if (text.includes('antolin')) return 'Europe';

  // 6. USA / North America
  if (/\b(usa|united states|texas|tx|ca|california|ny|new york|mi|michigan|nv|nevada|fl|florida|il|illinois|ma|massachusetts|nj|new jersey|wa|washington|oh|ohio|pa|pennsylvania|ga|georgia|nc|north carolina|va|virginia|co|colorado|az|arizona|san francisco|san jose|reno|tampa|kalamazoo|stryker)\b/.test(text)) {
    return 'USA';
  }

  // 7. General India detection (Cities, States, SEZ, Ltd, Pvt Ltd)
  if (/\b(india|kerala|cochin|kochi|bangalore|bengaluru|chennai|tamil nadu|mumbai|maharashtra|pune|delhi|new delhi|noida|gurgaon|gurugram|hyderabad|telangana|kolkata|gujarat|ahmedabad|karnataka|csez|sez|goa|panaji|haryana|uttar pradesh|rajasthan|jaipur)\b/.test(text) || text.includes('pvt ltd') || text.includes('private limited') || text.includes('limited')) {
    return 'India';
  }

  return 'Global';
}

/**
 * Validates whether a specific festival is culturally and geographically applicable to an account.
 */
export function isFestivalApplicableToAccount(festival, account) {
  const regions = festival.applicableRegions || ['Global'];
  const geo = detectAccountGeography(account);

  if (regions.includes('All') || regions.includes('*')) {
    return true;
  }
  if (regions.includes(geo)) {
    return true;
  }
  // Universal global festivals apply to all accounts
  if (regions.includes('Global')) {
    return true;
  }
  return false;
}

/**
 * High-performance, bulk synchronization of festival celebrations for CRM Accounts.
 */
export async function syncFestivalOccasionsForAccounts({ accountId = null, lookaheadDays = 365, userId = 'system' } = {}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const targetYears = [currentYear, currentYear + 1];

  // 1. Fetch eligible accounts
  let accountsQuery = db.collection('accounts');
  if (accountId) {
    accountsQuery = accountsQuery.where('accountId', '==', accountId);
  }
  const accountsSnap = await accountsQuery.get();
  const accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (accounts.length === 0) {
    return { created: 0, festivalsChecked: 0 };
  }

  // 2. Fetch primary contacts map
  const contactsSnap = await db.collection('contacts').get();
  const contactsByAccount = new Map();
  for (const doc of contactsSnap.docs) {
    const c = { id: doc.id, ...doc.data() };
    const aid = c.accountId;
    if (aid) {
      if (!contactsByAccount.has(aid)) contactsByAccount.set(aid, []);
      contactsByAccount.get(aid).push(c);
    }
  }

  // 3. Pre-load existing festivals to avoid repeated roundtrip queries
  const existingSnap = await db.collection('celebrationEvents').where('eventType', '==', EVENT_TYPES.FESTIVAL).get();
  const existingSet = new Set();
  existingSnap.docs.forEach(d => {
    const data = d.data();
    existingSet.add(`${data.accountId}_${data.eventTitle}_${data.eventDate}`);
  });

  // 4. Identify upcoming festivals in lookahead window
  const upcomingFestivals = [];
  for (const festival of PUBLIC_FESTIVALS_CALENDAR) {
    for (const yr of targetYears) {
      const dateStr = getFestivalDateForYear(festival, yr);
      if (!dateStr) continue;

      const festDate = new Date(`${dateStr}T00:00:00`);
      const diffDays = Math.round((festDate - now) / 86400000);

      if (diffDays >= -2 && diffDays <= lookaheadDays) {
        upcomingFestivals.push({
          festival,
          eventDate: dateStr,
          diffDays,
          year: yr
        });
      }
    }
  }

  let createdCount = 0;
  const createdEvents = [];
  const writes = [];

  for (const account of accounts) {
    const aId = account.accountId || account.id;
    const contacts = contactsByAccount.get(aId) || [];
    const primaryContact = contacts[0] || null;

    for (const item of upcomingFestivals) {
      const { festival, eventDate } = item;

      // Filter by cultural and geographic relevance
      if (!isFestivalApplicableToAccount(festival, account)) {
        continue;
      }

      const title = `Happy ${festival.name}`;
      const dedupKey = `${aId}_${title}_${eventDate}`;

      if (existingSet.has(dedupKey)) {
        continue;
      }
      existingSet.add(dedupKey);

      const contactGreeting = primaryContact?.name ? `Dear ${primaryContact.name},` : `Dear ${account.companyName} Team,`;
      const draftMessage = `${contactGreeting}\n\n${festival.defaultGreeting}\n\nWarm regards,\nNeST Digital Team`;
      const draftSubject = `${festival.defaultSubject} — ${account.companyName}`;
      const id = newId('cel');
      const nowIso = new Date().toISOString();

      const eventData = {
        id,
        accountId: aId,
        contactId: primaryContact?.contactId || primaryContact?.id || null,
        eventType: EVENT_TYPES.FESTIVAL,
        eventTitle: title,
        eventDescription: `Public Celebration: ${festival.name} for ${account.companyName}`,
        eventDate,
        sourceType: SOURCE_TYPES.CUSTOMERPULSE,
        sourceName: 'Public Celebration Calendar',
        evidenceSummary: `Annual Public Observance: ${festival.name} (${festival.category.replace(/_/g, ' ')}).`,
        draftSubject,
        draftMessage,
        confidence: 'High',
        verificationStatus: VERIFICATION_STATUS.AUTO_VERIFIED,
        status: CELEBRATION_STATUS.DRAFTED,
        detectedAt: nowIso,
        lastCheckedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: userId
      };

      writes.push(db.collection('celebrationEvents').doc(id).set(eventData));
      createdCount++;
      createdEvents.push({
        id,
        festival: festival.name,
        account: account.companyName,
        date: eventDate
      });
    }
  }

  // Execute in concurrent chunks
  const chunkSize = 50;
  for (let i = 0; i < writes.length; i += chunkSize) {
    await Promise.all(writes.slice(i, i + chunkSize));
  }

  return {
    festivalsConfigured: PUBLIC_FESTIVALS_CALENDAR.length,
    festivalsFoundInYear: upcomingFestivals.length,
    created: createdCount,
    events: createdEvents
  };
}
