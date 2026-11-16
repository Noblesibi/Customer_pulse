import { db } from '../config/database.js';

/**
 * Categorize a contact into a generic persona (Executive, Business, Technical)
 * based on their hierarchyTag, influenceTag, or designation.
 */
function categorizeContact(contact) {
  const hTag = (contact.hierarchyTag || '').toUpperCase();
  const iTag = (contact.influenceTag || '').toUpperCase();
  const designation = (contact.designation || '').toLowerCase();

  // Executives
  if (['CXO', 'VP'].includes(hTag) || iTag === 'DECISION MAKER' || designation.includes('chief') || designation.includes('president') || designation.includes('head')) {
    return 'Executive';
  }
  
  // Business/Operations
  if (['DIRECTOR', 'MANAGER'].includes(hTag) || iTag === 'CHAMPION' || designation.includes('product') || designation.includes('marketing') || designation.includes('sales') || designation.includes('operations')) {
    return 'Business';
  }

  // Technical
  if (designation.includes('engineer') || designation.includes('developer') || designation.includes('architect') || designation.includes('tech') || designation.includes('it')) {
    return 'Technical';
  }

  return 'Operational';
}

/**
 * Calculates relationship gaps and stakeholder coverage for an account.
 */
export async function calculateRelationshipGaps(accountId) {
  const contactsSnap = await db.collection('contacts').where('accountId', '==', accountId).get();
  const contacts = contactsSnap.docs.map(doc => doc.data());

  const interactionsSnap = await db.collection('interactions').where('accountId', '==', accountId).get();
  const interactions = interactionsSnap.docs.map(doc => doc.data());

  const today = new Date();
  const GAP_THRESHOLD_DAYS = 30; // 30 days without interaction = gap

  const coverage = {
    Executive: { count: 0, lastEngaged: null },
    Business: { count: 0, lastEngaged: null },
    Technical: { count: 0, lastEngaged: null },
    Operational: { count: 0, lastEngaged: null }
  };

  const gaps = [];

  // Map out interaction dates per contact
  const contactInteractions = {};
  interactions.forEach(interaction => {
    if (!interaction.contactId) return;
    const date = new Date(interaction.timestamp || `${interaction.date}T${interaction.time || '00:00'}`);
    if (!contactInteractions[interaction.contactId] || date > contactInteractions[interaction.contactId]) {
      contactInteractions[interaction.contactId] = date;
    }
  });

  contacts.forEach(contact => {
    const category = categorizeContact(contact);
    coverage[category].count++;

    const lastEngaged = contactInteractions[contact.contactId];
    if (lastEngaged) {
      if (!coverage[category].lastEngaged || lastEngaged > coverage[category].lastEngaged) {
        coverage[category].lastEngaged = lastEngaged;
      }
      
      const daysSince = Math.floor((today - lastEngaged) / (1000 * 60 * 60 * 24));
      
      if (daysSince > GAP_THRESHOLD_DAYS && (category === 'Executive' || category === 'Business')) {
        gaps.push({
          type: 'Declining Engagement',
          contactId: contact.contactId,
          contactName: contact.name,
          category,
          daysSinceLastInteraction: daysSince,
          message: `${category} stakeholder (${contact.name}) hasn't been engaged in ${daysSince} days.`
        });
      }
    } else {
      if (category === 'Executive' || category === 'Business') {
        gaps.push({
          type: 'Missing Engagement',
          contactId: contact.contactId,
          contactName: contact.name,
          category,
          message: `Key ${category} stakeholder (${contact.name}) has no recorded interactions.`
        });
      }
    }
  });

  // Check for missing categories completely
  if (coverage['Executive'].count === 0) {
    gaps.push({
      type: 'Missing Relationship',
      category: 'Executive',
      message: 'No Executive stakeholders are mapped for this account.'
    });
  }
  if (coverage['Business'].count === 0) {
    gaps.push({
      type: 'Missing Relationship',
      category: 'Business',
      message: 'No Business stakeholders are mapped for this account.'
    });
  }

  return { coverage, gaps };
}
