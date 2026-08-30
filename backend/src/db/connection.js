// ============================================================
// CryptoChess - PostgreSQL Database Connection Pool
// Uses pg module with connection pooling for production
// ============================================================

const { Pool } = require('pg');

// Create connection pool from environment variable
// Compatible with Supabase, Render Postgres, or any PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Execute a single query with optional parameters
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<QueryResult>}
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      console.warn(`[DB] Slow query (${duration}ms):`, text.substring(0, 80));
    }
    return result;
  } catch (err) {
    console.error('[DB] Query error:', err.message, '| Query:', text.substring(0, 100));
    throw err;
  }
};

/**
 * Get a client from pool for transactions (use with client.release())
 * @returns {Promise<PoolClient>}
 */
const getClient = async () => {
  const client = await pool.connect();
  return client;
};

module.exports = { pool, query, getClient };
