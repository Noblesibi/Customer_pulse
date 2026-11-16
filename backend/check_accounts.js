import { db, initializeDatabase } from './src/config/postgres.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await initializeDatabase();
  const res = await db.collection('accounts').get();
  const accounts = res.docs.map(d => d.data());
  console.log(JSON.stringify(accounts.slice(0, 2), null, 2));
  process.exit(0);
}
run();
