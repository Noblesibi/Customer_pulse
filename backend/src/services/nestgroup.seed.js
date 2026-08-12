/**
 * Core Nest Group (@nestgroup.net) Employee Seed List
 * Ensures all staff members with @nestgroup.net emails are consistently available across directory endpoints and mock databases.
 */

export const NESTGROUP_EMPLOYEES = [];

const LEGACY_HARDCODED_UIDS = [
  'ldap-s4kicnat4',
  'nest-noble-uid',
  'nest-albert-uid',
  'nest-nitha-uid',
  'nest-anil-uid',
  'nest-ajish-uid',
  'nest-nazneen-uid',
  'nest-pradeep-uid',
  'nest-roshine-uid',
  'nest-rahul-uid',
  'nest-reshmi-uid',
  'mock-nazneen-ceo-uid',
  'mock-finance-head-uid',
  'mock-global-hr-head-uid',
  'mock-itg-head-uid',
  'mock-nda-head-uid',
  'mock-tc-head-uid',
  'mock-quality-head-uid'
];

/**
 * Clean up/remove legacy hardcoded @nestgroup.net employees from the database.
 * @param {object} db - Database provider instance
 */
export async function ensureNestGroupEmployees(db) {
  try {
    let deletedCount = 0;
    for (const uid of LEGACY_HARDCODED_UIDS) {
      const docRef = db.collection('users').doc(uid);
      const doc = await docRef.get();
      if (doc && (doc.exists || doc.email)) {
        await docRef.delete();
        deletedCount++;
      }
    }
    // Automatically purge Dileep Choyappally from database
    const snap = await db.collection('users').get();
    if (snap && snap.docs) {
      for (const doc of snap.docs) {
        const data = doc.data ? doc.data() : doc;
        if (data && (
          (data.email && data.email.toLowerCase().includes('dileep')) ||
          (data.name && data.name.toLowerCase().includes('dileep'))
        )) {
          await db.collection('users').doc(doc.id || data.uid).delete();
          deletedCount++;
        }
      }
    }
    if (deletedCount > 0) {
      console.log(`🧹 [NestGroupSeed] Cleaned up ${deletedCount} legacy hardcoded/removed users from the database.`);
    }
  } catch (error) {
    console.error('❌ [NestGroupSeed] Error cleaning up legacy employees:', error.message);
  }
}
