// ============================================================
// CryptoChess - Database Connection (sql.js - Pure JS SQLite)
// Zero-config, no native compilation needed
// ============================================================

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'data', 'cryptochess.db');

// Ensure data directory
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;

/**
 * Initialize database (must be called once at startup)
 */
async function initDB() {
  const SQL = await initSqlJs();

  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable WAL mode and foreign keys
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  // Load and execute schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8').replace(/\r\n/g, '\n');
    // Split by semicolons but handle multi-line CREATE TABLE statements
    const statements = schema.split(';').map(s => s.trim()).filter(s => {
      if (s.length === 0) return false;
      // Skip blocks that are ONLY comments (no actual SQL)
      const nonCommentLines = s.split('\n').filter(l => l.trim().length > 0 && !l.trim().startsWith('--'));
      if (nonCommentLines.length === 0) return false;
      return true;
    });
    for (const stmt of statements) {
      try { db.run(stmt + ';'); } catch (e) { console.warn('[DB] Schema warning:', e.message.substring(0, 80)); }
    }
  }

  // Auto-save periodically
  setInterval(() => saveDB(), 5000);

  console.log('[DB] SQLite initialized at:', DB_PATH);
  return db;
}

/**
 * Save database to disk
 */
function saveDB() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('[DB] Save error:', err.message);
  }
}

/**
 * Execute a query (compatible with pg-style interface)
 * Returns { rows: [...] }
 */
function query(sql, params = []) {
  if (!db) throw new Error('Database not initialized');

  // Convert $1, $2... to ? placeholders for sql.js
  let idx = 0;
  const sqliteSQL = sql.replace(/\$\d+/g, () => {
    idx++;
    return params[idx - 1] !== undefined ? '?' : 'NULL';
  });

  const trimmed = sqliteSQL.trim().toUpperCase();
  if (trimmed.startsWith('SELECT') || trimmed.includes('RETURNING')) {
    try {
      const stmt = db.prepare(sqliteSQL);
      stmt.bind(params.slice(0, idx));
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return { rows };
    } catch (err) {
      console.error('[DB] Query error:', err.message, sqliteSQL.substring(0, 60));
      return { rows: [] };
    }
  } else {
    try {
      db.run(sqliteSQL, params.slice(0, idx));
      const lastId = db.exec('SELECT last_insert_rowid() as id');
      const changes = db.getRowsModified();
      return { rows: [], rowCount: changes, insertId: lastId[0]?.values[0]?.[0] };
    } catch (err) {
      console.error('[DB] Exec error:', err.message, sqliteSQL.substring(0, 60));
      return { rows: [], rowCount: 0 };
    }
  }
}

/**
 * Get client for transactions
 */
function getClient() {
  return {
    query: (sql, params) => query(sql, params),
    beginTransaction: () => db.run('BEGIN'),
    commit: () => { db.run('COMMIT'); saveDB(); },
    rollback: () => db.run('ROLLBACK'),
    release: () => {},
  };
}

module.exports = { db: null, query, getClient, initDB, saveDB };
