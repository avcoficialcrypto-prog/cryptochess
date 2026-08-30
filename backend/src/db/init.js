// ============================================================
// CryptoChess - Database Initialization Script
// Run with: npm run db:init
// ============================================================

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { pool } = require('./connection');

async function initDatabase() {
  console.log('[DB INIT] Starting database initialization...');

  try {
    // Read schema SQL file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Execute schema
    await pool.query(schema);
    console.log('[DB INIT] Schema created successfully!');

    // Verify tables exist
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('[DB INIT] Tables created:');
    tables.rows.forEach(row => console.log(`  - ${row.table_name}`));

    console.log('[DB INIT] Database initialization complete!');
  } catch (err) {
    console.error('[DB INIT] Initialization failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDatabase();
