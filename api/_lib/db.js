import pg from 'pg';

const { Pool } = pg;

const CONNECTION_STRING = process.env.DATABASE_URL;

if (!CONNECTION_STRING) {
  console.warn("WARNING: DATABASE_URL environment variable is missing!");
}

export const pool = new Pool({
  connectionString: CONNECTION_STRING,
  max: 10, // reasonable pool size for serverless
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // console.log('[DB Query] Executed query:', { text, duration, rows: res.rowCount });
  return res;
}
