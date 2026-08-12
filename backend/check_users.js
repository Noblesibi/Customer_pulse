import dotenv from 'dotenv';
import { db } from './src/config/database.js';

dotenv.config();

async function check() {
  // Give database connection a moment to initialize
  setTimeout(async () => {
    try {
      console.log('Querying users from database...');
      const snap = await db.collection('users').get();
      const docs = snap.docs || [];
      console.log(`Successfully fetched ${docs.length} users!`);
      docs.forEach((doc, i) => {
        const u = doc.data ? doc.data() : doc;
        console.log(`[User ${i + 1}] Email: ${u.email} | Name: ${u.name} | Role: ${u.role} | BU: ${u.bu}`);
      });
    } catch (e) {
      console.error('Error fetching users:', e.message);
    }
    process.exit(0);
  }, 1500);
}

check();
