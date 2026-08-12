import mysql from 'mysql2/promise';
import pg from 'pg';
import mssql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const dbType = (process.env.SEC_DB_TYPE || 'mysql').toLowerCase();
const config = {
  host: process.env.SEC_DB_HOST || 'localhost',
  port: parseInt(process.env.SEC_DB_PORT) || (dbType === 'mysql' ? 3306 : dbType === 'mssql' ? 1433 : 5432),
  user: process.env.SEC_DB_USER || 'root',
  password: process.env.SEC_DB_PASSWORD || '',
  database: process.env.SEC_DB_DATABASE || 'company_employees'
};

let mysqlPool = null;
let postgresPool = null;
let mssqlPool = null;

// Initialize appropriate connection pool
async function getPool() {
  try {
    if (dbType === 'mysql') {
      if (!mysqlPool) {
        mysqlPool = mysql.createPool({
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          database: config.database,
          waitForConnections: true,
          connectionLimit: 5,
          queueLimit: 0
        });
      }
      return { type: 'mysql', client: mysqlPool };
    } 
    
    if (dbType === 'postgres') {
      if (!postgresPool) {
        postgresPool = new pg.Pool({
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          database: config.database,
          max: 5,
          idleTimeoutMillis: 30000
        });
      }
      return { type: 'postgres', client: postgresPool };
    }

    if (dbType === 'mssql') {
      if (!mssqlPool) {
        const sqlConfig = {
          user: config.user,
          password: config.password,
          server: config.host,
          port: config.port,
          database: config.database,
          options: {
            encrypt: false, // Set to true if using Azure
            trustServerCertificate: true
          },
          pool: {
            max: 5,
            min: 0,
            idleTimeoutMillis: 30000
          }
        };
        mssqlPool = await mssql.connect(sqlConfig);
      }
      return { type: 'mssql', client: mssqlPool };
    }

    throw new Error(`Unsupported secondary database type: ${dbType}`);
  } catch (err) {
    console.error(`❌ Failed to connect to secondary database (${dbType}):`, err.message);
    throw err;
  }
}

/**
 * Execute a query against the secondary database
 * @param {string} queryStr - The query string (SQL syntax should match target DB)
 * @param {Array} params - Query parameters
 */
export async function executeSecQuery(queryStr, params = []) {
  try {
    const { type, client } = await getPool();
    
    if (type === 'mysql') {
      const [rows] = await client.execute(queryStr, params);
      return rows;
    }

    if (type === 'postgres') {
      const res = await client.query(queryStr, params);
      return res.rows;
    }

    if (type === 'mssql') {
      const request = client.request();
      if (params && params.length > 0) {
        params.forEach((val, idx) => {
          request.input(`param${idx}`, val);
        });
      }
      const res = await request.query(queryStr);
      return res.recordset;
    }
  } catch (err) {
    console.error(`❌ Secondary database query error:`, err.message);
    return [];
  }
}
