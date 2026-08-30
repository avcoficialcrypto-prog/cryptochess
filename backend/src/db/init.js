// ============================================================
// CryptoChess - Database Initialization (SQLite)
// ============================================================

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'data', 'cryptochess.db');

// Ensure data directory
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Read and execute schema
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');

// Split by semicolons and execute each statement
const statements = schema
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

for (const stmt of statements) {
  try {
    db.exec(stmt + ';');
  } catch (err) {
    console.error(`Error executing: ${stmt.substring(0, 60)}...`);
    console.error(err.message);
  }
}

console.log('✅ Database initialized successfully at:', DB_PATH);
console.log('   Tables: players, games, transactions, commission_pool, sweep_orders, matchmaking_queue');

db.close();
