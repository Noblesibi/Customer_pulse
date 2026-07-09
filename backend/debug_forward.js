// Fix: remove duplicate Albert mention from the interaction
import { db } from './src/config/database.js';

const interactionId = 'int-jw7gvg8iw';
const albertUid = 'ldap-3cm36onhw';

async function fix() {
  const doc = await db.collection('interactions').doc(interactionId).get();
  if (!doc.exists) { console.log('Interaction not found'); process.exit(1); }

  let mentions = doc.data().actionMentions || [];
  console.log('Before:', JSON.stringify(mentions.map(m => ({ uid: m.uid, name: m.name, status: m.status })), null, 2));

  // Remove duplicates: keep only the first occurrence of each uid+status combo
  const seen = new Set();
  mentions = mentions.filter(m => {
    const key = `${m.uid}-${m.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log('\nAfter:', JSON.stringify(mentions.map(m => ({ uid: m.uid, name: m.name, status: m.status })), null, 2));

  await db.collection('interactions').doc(interactionId).update({ actionMentions: mentions });
  console.log('\n✅ Duplicates removed.');
  process.exit(0);
}

fix().catch(e => { console.error(e); process.exit(1); });
