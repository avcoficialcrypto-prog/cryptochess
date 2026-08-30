// ============================================================
// CryptoChess - Database Init (sql.js)
// ============================================================

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'data', 'cryptochess.db');

async function init() {
  const SQL = await initSqlJs();

  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  let db;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    try { db.run(stmt + ';'); } catch (e) { /* ignore */ }
  }

  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  console.log('✅ Database initialized at:', DB_PATH);
}

init().catch(err => { console.error('Init failed:', err); process.exit(1); });
