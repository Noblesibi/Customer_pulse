
const fs = require('fs');
let code = fs.readFileSync('backend/src/services/celebration.service.js', 'utf8');

// Fix syntax errors in the detectFromContacts function
// We'll just replace the corrupt lines directly
code = code.replace(/eventTitle: \\\\'s Birthday\\\\,/g, "eventTitle: \\'s Birthday\,");
code = code.replace(/eventTitle: \\\\'s Work Anniversary\\\\,/g, "eventTitle: \\'s Work Anniversary\,");

// Replace corrupt console.error
code = code.replace(/console\\.error\\(\\\\[CelebrationService\\] Adapter \\\\ error for contact \\\\:\\\\, err\\.message\\);/g, "console.error(\[CelebrationService] Adapter \ error for contact \:\, err.message);");

// Now let's replace the adapters
const startMatch = "export class CelebrationSourceAdapter {";
const endMatch = "// LinkedIn adapter";
const startIdx = code.indexOf(startMatch);
const endIdx = code.indexOf(endMatch);

if (startIdx !== -1 && endIdx !== -1) {
  const newAdapters = \export class CelebrationSourceAdapter {
  constructor(sourceType, sourceName) {
    this.sourceType = sourceType;
    this.sourceName = sourceName;
    this.enabled = false;
  }
  async enrichContact({ contact, account, owner }) { return []; }
}

// CustomerPulse internal adapter (always enabled)
export class CustomerPulseSourceAdapter extends CelebrationSourceAdapter {
  constructor() {
    super(SOURCE_TYPES.CUSTOMERPULSE, 'CustomerPulse');
    this.enabled = true;
  }
}

// Microsoft Graph adapter
export class MicrosoftCelebrationAdapter extends CelebrationSourceAdapter {
  constructor() {
    super(SOURCE_TYPES.MICROSOFT, 'Microsoft 365');
    this.enabled = (process.env.MICROSOFT_CELEBRATION_SOURCE_ENABLED || 'false') === 'true';
  }
  
  async enrichContact({ contact, account, owner }) {
    if (!this.enabled) return [];
    
    // TEMPORARY: Retaining TEST_MAILBOX until Phase 2 Graph restructuring
    const mailbox = process.env.MICROSOFT_TEST_MAILBOX;
    if (!mailbox) {
      console.error('[MicrosoftCelebrationAdapter] MICROSOFT_TEST_MAILBOX is not configured.');
      return [];
    }

    const events = [];
    try {
      // Future Phase 2: Query /users/owner.email/contacts?filter=emailAddresses/any(a:a/address eq 'contact.email')
      const msContacts = await fetchMicrosoftContacts(mailbox);
      
      const targetEmail = (contact.email || '').toLowerCase();
      const targetName = (contact.name || '').toLowerCase();
      
      for (const mc of msContacts) {
        if (!mc.birthday) continue;
        
        let isMatch = false;
        let matchConfidence = 0;
        let confidence = 'Low';

        if (mc.emailAddresses && mc.emailAddresses.length > 0) {
          for (const emailObj of mc.emailAddresses) {
            const email = (emailObj.address || emailObj).toLowerCase();
            if (email === targetEmail && targetEmail !== '') {
               isMatch = true;
               confidence = 'High';
               matchConfidence = 100;
               break;
            }
          }
        }
        
        if (!isMatch && mc.id === contact.microsoftId) {
            isMatch = true;
            confidence = 'High';
            matchConfidence = 100;
        }

        if (!isMatch && mc.displayName && mc.displayName.toLowerCase() === targetName && targetName !== '') {
            isMatch = true;
            confidence = 'Medium';
            matchConfidence = 70;
        }

        if (isMatch) {
          let bdayStr = mc.birthday;
          if (bdayStr.includes('T')) {
             bdayStr = bdayStr.split('T')[0];
          }

          events.push({
            eventType: EVENT_TYPES.BIRTHDAY,
            eventTitle: \\\\\\'s Birthday\\\,
            eventDate: bdayStr,
            sourceEventId: mc.id,
            confidence,
            matchConfidence
          });
        }
      }
    } catch (err) {
      console.error('[MicrosoftCelebrationAdapter] Failed to sync Microsoft contacts:', err.message);
    }
    return events;
  }
}

function mapGoogleCalendarEventToType(summary) {
  if (!summary) return null;
  const s = summary.toLowerCase();
  if (s.match(/\\\\bbirthday\\\\b|\\\\bbday\\\\b/)) return EVENT_TYPES.BIRTHDAY;
  if (s.match(/\\\\bwork anniversary\\\\b|\\\\bemployment anniversary\\\\b|\\\\bservice anniversary\\\\b/)) return EVENT_TYPES.WORK_ANNIVERSARY;
  if (s.match(/\\\\bpromotion\\\\b|\\\\bpromoted\\\\b/)) return EVENT_TYPES.PROMOTION;
  if (s.match(/\\\\baward\\\\b|\\\\bawarded\\\\b/)) return EVENT_TYPES.AWARD;
  if (s.match(/\\\\bcertification\\\\b|\\\\bcertified\\\\b/)) return EVENT_TYPES.CERTIFICATION;
  if (s.match(/\\\\bcompany anniversary\\\\b|\\\\bbusiness anniversary\\\\b|\\\\borganization anniversary\\\\b/)) return EVENT_TYPES.COMPANY_ANNIVERSARY;
  if (s.match(/\\\\bbusiness milestone\\\\b|\\\\bcompany milestone\\\\b/)) return EVENT_TYPES.BUSINESS_MILESTONE;
  return null;
}

// Google Contacts adapter
export class GoogleCelebrationAdapter extends CelebrationSourceAdapter {
  constructor() {
    super(SOURCE_TYPES.GOOGLE, 'Google Contacts');
    this.enabled = (process.env.GOOGLE_CELEBRATION_SOURCE_ENABLED || 'false') === 'true';
  }
  
  async enrichContact({ contact, account, owner }) {
    if (!this.enabled || !owner || !owner.uid) return [];
    
    const events = [];
    const targetEmail = (contact.email || '').toLowerCase();
    const targetName = (contact.name || '').toLowerCase();

    try {
      const googleContacts = await fetchGoogleContacts(owner.uid);
      
      for (const gc of googleContacts) {
        if (!gc.birthdays || gc.birthdays.length === 0) continue;
        
        let isMatch = false;
        let confidence = 'Low';
        let matchConfidence = 0;

        const emails = gc.emailAddresses ? gc.emailAddresses.map(e => e.value.toLowerCase()) : [];
        if (emails.includes(targetEmail) && targetEmail !== '') {
            isMatch = true;
            confidence = 'High';
            matchConfidence = 100;
        } else if (gc.resourceName === contact.googleId) {
            isMatch = true;
            confidence = 'High';
            matchConfidence = 100;
        } else if (gc.names && gc.names.length > 0 && gc.names[0].displayName.toLowerCase() === targetName && targetName !== '') {
            isMatch = true;
            confidence = 'Medium';
            matchConfidence = 70;
        }

        if (isMatch) {
            const bdayObj = gc.birthdays[0].date;
            if (!bdayObj || !bdayObj.month || !bdayObj.day) continue;
            
            const bdayStr = bdayObj.year 
                ? \\\\\\-\\\-\\\\\\
                : \\\\\\-\\\\\\;
            
            events.push({
               eventType: EVENT_TYPES.BIRTHDAY,
               eventTitle: \\\\\\'s Birthday\\\,
               eventDate: bdayStr,
               sourceEventId: gc.resourceName,
               confidence,
               matchConfidence
            });
        }
      }
    } catch (err) {
      console.error(\\\[GoogleCelebrationAdapter] Failed to enrich contact for user \\\:\\\, err.message);
    }
    return events;
  }
}
\;
  
  code = code.substring(0, startIdx) + newAdapters + code.substring(endIdx);
  fs.writeFileSync('backend/src/services/celebration.service.js', code);
  console.log('Successfully replaced adapters using Node.js');
} else {
  console.log('Failed to find boundaries');
}
