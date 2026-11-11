import { db, initializeDatabase } from './src/config/postgres.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await initializeDatabase();
  const res = await db.collection('users').get();
  const users = res.docs.map(d => d.data());
  const aminaUsers = users.filter(u => (u.email || '').toLowerCase().includes('amina.rashad'));
  console.log(JSON.stringify(aminaUsers, null, 2));
  process.exit(0);
}
run();
