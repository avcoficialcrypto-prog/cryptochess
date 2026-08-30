-- ============================================================
-- CryptoChess - PostgreSQL Schema (Wallet-Only / No Accounts)
-- Identity = Solana wallet address
-- ============================================================

-- Players identified by wallet address (no email, no password)
CREATE TABLE IF NOT EXISTS players (
  wallet_address VARCHAR(44) PRIMARY KEY,
  balance_usdc DECIMAL(12,2) DEFAULT 100.00,
  total_games_played INTEGER DEFAULT 0,
  total_games_won INTEGER DEFAULT 0,
  total_earnings_usdc DECIMAL(12,2) DEFAULT 0.00,
  total_wagered_usdc DECIMAL(12,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Games
CREATE TABLE IF NOT EXISTS games (
  id VARCHAR(36) PRIMARY KEY,
  white_wallet VARCHAR(44) REFERENCES players(wallet_address),
  black_wallet VARCHAR(44) REFERENCES players(wallet_address),
  stake_amount DECIMAL(12,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'waiting',
  winner_wallet VARCHAR(44),
  invite_code VARCHAR(10) UNIQUE,
  move_history JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Transactions log
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(44) REFERENCES players(wallet_address),
  type VARCHAR(30) NOT NULL,
  amount_usdc DECIMAL(12,2) NOT NULL,
  game_id VARCHAR(36) REFERENCES games(id),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Commission pool for auto-sweep
CREATE TABLE IF NOT EXISTS commission_pool (
  id SERIAL PRIMARY KEY,
  amount_usdc DECIMAL(12,2) DEFAULT 0.00,
  game_id VARCHAR(36),
  collected_at TIMESTAMP DEFAULT NOW()
);

-- ChangeNOW sweep orders log
CREATE TABLE IF NOT EXISTS sweep_orders (
  id SERIAL PRIMARY KEY,
  usdc_amount DECIMAL(12,2),
  xmr_amount DECIMAL(12,8),
  changenow_order_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Matchmaking queue
CREATE TABLE IF NOT EXISTS matchmaking_queue (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(44) REFERENCES players(wallet_address),
  stake_amount DECIMAL(12,2) NOT NULL,
  socket_id VARCHAR(50),
  joined_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_invite_code ON games(invite_code);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_matchmaking_stake ON matchmaking_queue(stake_amount);
CREATE INDEX IF NOT EXISTS idx_games_white ON games(white_wallet);
CREATE INDEX IF NOT EXISTS idx_games_black ON games(black_wallet);
