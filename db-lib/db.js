import pg from 'pg';

const { Pool } = pg;
const CONNECTION_STRING = process.env.DATABASE_URL;

if (!CONNECTION_STRING) {
  console.warn("WARNING: DATABASE_URL environment variable is missing!");
}

// Cache the connection pool in development to prevent connection leaks from Vite HMR
if (!globalThis._pgPool) {
  globalThis._pgPool = new Pool({
    connectionString: CONNECTION_STRING,
    max: 10,
    idleTimeoutMillis: 15000, // Close idle connections after 15s
    connectionTimeoutMillis: 5000, // Timeout connection attempts after 5s
  });

  globalThis._pgPool.on('error', (err) => {
    console.error('Unexpected database pool error:', err);
  });
}

export const pool = globalThis._pgPool;

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // console.log('[DB Query] Executed query:', { text, duration, rows: res.rowCount });
  return res;
}
