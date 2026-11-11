import fs from 'fs';
import pg from 'pg';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({ path: 'd:/Data/customer_pulse/backend/.env' });

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'customer_pulse'
});

async function runSchema() {
  try {
    const schemaSql = fs.readFileSync('d:/Data/customer_pulse/backend/schema.postgres.sql', 'utf8');
    await pool.query(schemaSql);
    console.log('Schema executed successfully.');
  } catch (error) {
    console.error('Error executing schema:', error);
  } finally {
    await pool.end();
  }
}

runSchema();
