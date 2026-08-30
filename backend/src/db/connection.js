// ============================================================
// CryptoChess - Database Connection (SQLite)
// Zero-config, file-based database
// ============================================================

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'data', 'cryptochess.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Execute a query (compatible wrapper for pg-style interface)
 */
function query(sql, params = []) {
  // Convert $1, $2... to ? placeholders for SQLite
  let sqliteSQL = sql;
  let idx = 0;
  sqliteSQL = sql.replace(/\$\d+/g, () => {
    idx++;
    return params[idx - 1] !== undefined ? '?' : 'NULL';
  });

  // Check if it's a SELECT or RETURNING query
  const trimmed = sqliteSQL.trim().toUpperCase();
  if (trimmed.startsWith('SELECT') || trimmed.includes('RETURNING')) {
    const rows = db.prepare(sqliteSQL).all(...params.slice(0, idx));
    return { rows };
  } else {
    const result = db.prepare(sqliteSQL).run(...params.slice(0, idx));
    return { rows: [], rowCount: result.changes };
  }
}

/**
 * Get a client for transactions (wraps SQLite transaction)
 */
function getClient() {
  return {
    query: (sql, params = []) => {
      // Convert $1, $2... to ? placeholders
      let idx = 0;
      const sqliteSQL = sql.replace(/\$\d+/g, () => {
        idx++;
        return params[idx - 1] !== undefined ? '?' : 'NULL';
      });

      const trimmed = sqliteSQL.trim().toUpperCase();
      if (trimmed.startsWith('SELECT') || trimmed.includes('RETURNING')) {
        const rows = db.prepare(sqliteSQL).all(...params.slice(0, idx));
        return { rows };
      } else {
        const result = db.prepare(sqliteSQL).run(...params.slice(0, idx));
        return { rows: [], rowCount: result.changes };
      }
    },
    beginTransaction: () => db.exec('BEGIN'),
    commit: () => db.exec('COMMIT'),
    rollback: () => db.exec('ROLLBACK'),
    release: () => {}, // no-op for SQLite
    // Support both BEGIN/COMMIT and begin()/commit() patterns
    BEGIN: () => db.exec('BEGIN'),
    COMMIT: () => db.exec('COMMIT'),
    ROLLBACK: () => db.exec('ROLLBACK'),
  };
}

// For transaction wrapping
function beginTransaction() { db.exec('BEGIN'); }
function commitTransaction() { db.exec('COMMIT'); }
function rollbackTransaction() { db.exec('ROLLBACK'); }

module.exports = { db, query, getClient, beginTransaction, commitTransaction, rollbackTransaction };
