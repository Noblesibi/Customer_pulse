import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'customer_pulse'
});

async function clearDatabase() {
  console.log('Connecting to PostgreSQL to clear data...');
  const client = await pool.connect();
  try {
    const tables = [
      'Accounts', 'Contacts', 'Interactions', 'Replies', 'Risks', 'Notifications', 
      'HealthScores', 'AccountSignals', 'Summaries', 'ActivityLogs', 'Tasks', 
      'TaskReplies', 'EmailQueue', 'EmailTemplates', 'EmailLogs', 'NotificationPreferences', 
      'SyncHistory'
    ];

    // Truncate all tables (with CASCADE if there are foreign keys, though currently there might not be strict FK constraints)
    for (const table of tables) {
      console.log(`Truncating table: "${table}"`);
      await client.query(`TRUNCATE TABLE "${table}" CASCADE;`).catch(e => {
        // Ignore if table doesn't exist
        console.log(`Skipped missing table: "${table}"`);
      });
    }

    console.log('Data cleared successfully.');
  } catch (error) {
    console.error('Error clearing data:', error);
  } finally {
    client.release();
    pool.end();
  }
}

clearDatabase();
