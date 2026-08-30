-- ============================================================
-- CryptoChess - SQLite Schema (Wallet-Only)
-- Identity = Solana wallet address
-- ============================================================

CREATE TABLE IF NOT EXISTS players (
  wallet_address TEXT PRIMARY KEY,
  balance_usdc REAL DEFAULT 0.00,
  total_games_played INTEGER DEFAULT 0,
  total_games_won INTEGER DEFAULT 0,
  total_earnings_usdc REAL DEFAULT 0.00,
  total_wagered_usdc REAL DEFAULT 0.00,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  white_wallet TEXT REFERENCES players(wallet_address),
  black_wallet TEXT REFERENCES players(wallet_address),
  stake_amount REAL NOT NULL,
  status TEXT DEFAULT 'waiting',
  winner_wallet TEXT,
  invite_code TEXT UNIQUE,
  move_history TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT REFERENCES players(wallet_address),
  type TEXT NOT NULL,
  amount_usdc REAL NOT NULL,
  game_id TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commission_pool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount_usdc REAL DEFAULT 0.00,
  game_id TEXT,
  collected_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sweep_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usdc_amount REAL,
  xmr_amount REAL,
  changenow_order_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS matchmaking_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT REFERENCES players(wallet_address),
  stake_amount REAL NOT NULL,
  socket_id TEXT,
  joined_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS temp_wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  private_key TEXT NOT NULL,
  game_id TEXT,
  stake_amount REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  deposit_detected_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_invite_code ON games(invite_code);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_matchmaking_stake ON matchmaking_queue(stake_amount);
CREATE INDEX IF NOT EXISTS idx_games_white ON games(white_wallet);
CREATE INDEX IF NOT EXISTS idx_games_black ON games(black_wallet);
