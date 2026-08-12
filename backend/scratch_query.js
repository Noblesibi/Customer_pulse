import pg from 'pg';

const config = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'customer_pulse'
};

const pool = new pg.Pool(config);

async function run() {
  try {
    const res = await pool.query('SELECT * FROM "Interactions"');
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
