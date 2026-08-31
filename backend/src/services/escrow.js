// ============================================================
// CryptoChess - Escrow Service (sql.js + Wallet-Based)
// Fixed: SQLite compatibility, no double deduction, no RETURNING
// ============================================================

const { query, saveDB } = require('../db/connection');

const COMMISSION_RATE = 0.03;

async function getBalance(walletAddress) {
  const result = query(
    'SELECT wallet_address, balance_usdc FROM players WHERE wallet_address = $1',
    [walletAddress]
  );
  if (result.rows.length === 0) throw new Error('Player not found');
  return result.rows[0];
}

/**
 * Lock wager for matchmaking (deducts from BOTH players)
 */
async function lockSingleWager(walletAddress, stakeAmount, gameId) {
  try {
    query('BEGIN');

    const result = query(
      `UPDATE players SET balance_usdc = balance_usdc - $1, updated_at = datetime('now')
       WHERE wallet_address = $2 AND balance_usdc >= $1`,
      [stakeAmount, walletAddress]
    );
    if (result.rowCount === 0) {
      query('ROLLBACK');
      return { success: false, error: 'Insufficient balance' };
    }

    // Log transaction
    query(
      `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
       VALUES ($1, 'wager_lock', $2, $3, 'Locked wager (payment phase)')`,
      [walletAddress, -stakeAmount, gameId]
    );

    // Update wager stats
    query(`UPDATE players SET total_wagered_usdc = total_wagered_usdc + $1 WHERE wallet_address = $2`, [stakeAmount, walletAddress]);

    query('COMMIT');
    saveDB();

    console.log(`[ESCROW] Single wager locked: ${stakeAmount} USDC | ${walletAddress.slice(0, 8)} | Game: ${gameId}`);
    return { success: true };
  } catch (err) {
    try { query('ROLLBACK'); } catch {}
    console.error('[ESCROW] lockSingleWager failed:', err.message);
    return { success: false, error: err.message };
  }
}

async function lockWager(whiteWallet, blackWallet, stakeAmount, gameId) {
  try {
    query('BEGIN');

    // Deduct from white
    const whiteResult = query(
      `UPDATE players SET balance_usdc = balance_usdc - $1, updated_at = datetime('now')
       WHERE wallet_address = $2 AND balance_usdc >= $1`,
      [stakeAmount, whiteWallet]
    );
    if (whiteResult.rowCount === 0) {
      query('ROLLBACK');
      throw new Error('Insufficient balance for white player');
    }

    // Deduct from black
    const blackResult = query(
      `UPDATE players SET balance_usdc = balance_usdc - $1, updated_at = datetime('now')
       WHERE wallet_address = $2 AND balance_usdc >= $1`,
      [stakeAmount, blackWallet]
    );
    if (blackResult.rowCount === 0) {
      // Refund white
      query(
        `UPDATE players SET balance_usdc = balance_usdc + $1, updated_at = datetime('now')
         WHERE wallet_address = $2`,
        [stakeAmount, whiteWallet]
      );
      query('ROLLBACK');
      throw new Error('Insufficient balance for black player');
    }

    const totalPot = stakeAmount * 2;
    const commission = parseFloat((totalPot * COMMISSION_RATE).toFixed(6));

    // Update game status
    query(`UPDATE games SET status = 'active', updated_at = datetime('now') WHERE id = $1`, [gameId]);

    // Log transactions
    query(
      `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
       VALUES ($1, 'wager_lock', $2, $3, 'Locked wager')`,
      [whiteWallet, -stakeAmount, gameId]
    );
    query(
      `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
       VALUES ($1, 'wager_lock', $2, $3, 'Locked wager')`,
      [blackWallet, -stakeAmount, gameId]
    );

    // Update wager stats
    query(`UPDATE players SET total_wagered_usdc = total_wagered_usdc + $1 WHERE wallet_address = $2`, [stakeAmount, whiteWallet]);
    query(`UPDATE players SET total_wagered_usdc = total_wagered_usdc + $1 WHERE wallet_address = $2`, [stakeAmount, blackWallet]);

    // Commission
    query(`INSERT INTO commission_pool (amount_usdc, game_id) VALUES ($1, $2)`, [commission, gameId]);

    query('COMMIT');
    saveDB();

    console.log(`[ESCROW] Wager locked: ${stakeAmount} USDC each | Pot: ${totalPot} | Commission: ${commission}`);
    return { gameId, totalPot, commission };
  } catch (err) {
    try { query('ROLLBACK'); } catch {}
    console.error('[ESCROW] lockWager failed:', err.message);
    throw err;
  }
}

/**
 * Lock wager for challenge JOINER only (creator already paid)
 */
async function lockChallengeJoiner(joinerWallet, stakeAmount, gameId) {
  try {
    query('BEGIN');

    // Only deduct from the joiner
    const result = query(
      `UPDATE players SET balance_usdc = balance_usdc - $1, updated_at = datetime('now')
       WHERE wallet_address = $2 AND balance_usdc >= $1`,
      [stakeAmount, joinerWallet]
    );
    if (result.rowCount === 0) {
      query('ROLLBACK');
      throw new Error('Insufficient balance');
    }

    // Update game status
    query(`UPDATE games SET status = 'active', updated_at = datetime('now') WHERE id = $1`, [gameId]);

    // Log transaction
    query(
      `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
       VALUES ($1, 'wager_lock', $2, $3, 'Locked wager (challenge join)')`,
      [joinerWallet, -stakeAmount, gameId]
    );

    // Update wager stats
    query(`UPDATE players SET total_wagered_usdc = total_wagered_usdc + $1 WHERE wallet_address = $2`, [stakeAmount, joinerWallet]);

    // Commission from total pot
    const totalPot = stakeAmount * 2;
    const commission = parseFloat((totalPot * COMMISSION_RATE).toFixed(6));
    query(`INSERT INTO commission_pool (amount_usdc, game_id) VALUES ($1, $2)`, [commission, gameId]);

    query('COMMIT');
    saveDB();

    console.log(`[ESCROW] Challenge joiner wager locked: ${stakeAmount} USDC | Game: ${gameId}`);
    return { gameId, commission };
  } catch (err) {
    try { query('ROLLBACK'); } catch {}
    console.error('[ESCROW] lockChallengeJoiner failed:', err.message);
    throw err;
  }
}

async function settleGame(gameId, winnerWallet = null) {
  try {
    query('BEGIN');

    const gameResult = query(
      `SELECT * FROM games WHERE id = $1 AND status IN ('active', 'waiting')`,
      [gameId]
    );
    if (gameResult.rows.length === 0) {
      query('ROLLBACK');
      throw new Error('Game not found or already settled');
    }

    const game = gameResult.rows[0];
    const stakeAmount = parseFloat(game.stake_amount);
    const totalPot = stakeAmount * 2;
    const commission = parseFloat((totalPot * COMMISSION_RATE).toFixed(6));
    const payout = totalPot - commission;

    if (winnerWallet) {
      // Credit winner
      query(
        `UPDATE players SET
          balance_usdc = balance_usdc + $1, updated_at = datetime('now'),
          total_games_won = total_games_won + 1,
          total_earnings_usdc = total_earnings_usdc + $1
         WHERE wallet_address = $2`,
        [payout, winnerWallet]
      );

      // Log win transaction
      query(
        `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
         VALUES ($1, 'wager_win', $2, $3, 'Game win')`,
        [winnerWallet, payout, gameId]
      );
    }

    // Update game record
    query(
      `UPDATE games SET winner_wallet = $1, status = 'completed', updated_at = datetime('now') WHERE id = $2`,
      [winnerWallet, gameId]
    );

    // Increment games played for both
    query(`UPDATE players SET total_games_played = total_games_played + 1 WHERE wallet_address = $1`, [game.white_wallet]);
    query(`UPDATE players SET total_games_played = total_games_played + 1 WHERE wallet_address = $1`, [game.black_wallet]);

    query('COMMIT');
    saveDB();

    console.log(`[ESCROW] Game ${gameId} settled | Winner: ${winnerWallet?.slice(0, 8) || 'draw'} | Payout: ${payout}`);
    return { payout, commission };
  } catch (err) {
    try { query('ROLLBACK'); } catch {}
    console.error('[ESCROW] settleGame failed:', err.message);
    throw err;
  }
}

async function settleDraw(gameId) {
  try {
    query('BEGIN');

    const gameResult = query(
      `SELECT * FROM games WHERE id = $1 AND status IN ('active', 'waiting')`,
      [gameId]
    );
    if (gameResult.rows.length === 0) {
      query('ROLLBACK');
      throw new Error('Game not found');
    }

    const game = gameResult.rows[0];
    const stakeAmount = parseFloat(game.stake_amount);
    const totalPot = stakeAmount * 2;
    const commission = parseFloat((totalPot * COMMISSION_RATE).toFixed(6));
    const refund = stakeAmount - (commission / 2);

    // Refund each player
    query(
      `UPDATE players SET balance_usdc = balance_usdc + $1, updated_at = datetime('now')
       WHERE wallet_address = $2`,
      [refund, game.white_wallet]
    );
    query(
      `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
       VALUES ($1, 'draw_refund', $2, $3, 'Draw refund')`,
      [game.white_wallet, refund, gameId]
    );

    query(
      `UPDATE players SET balance_usdc = balance_usdc + $1, updated_at = datetime('now')
       WHERE wallet_address = $2`,
      [refund, game.black_wallet]
    );
    query(
      `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
       VALUES ($1, 'draw_refund', $2, $3, 'Draw refund')`,
      [game.black_wallet, refund, gameId]
    );

    // Update game record
    query(`UPDATE games SET status = 'completed', updated_at = datetime('now') WHERE id = $1`, [gameId]);

    // Increment games played
    query(`UPDATE players SET total_games_played = total_games_played + 1 WHERE wallet_address = $1`, [game.white_wallet]);
    query(`UPDATE players SET total_games_played = total_games_played + 1 WHERE wallet_address = $1`, [game.black_wallet]);

    query('COMMIT');
    saveDB();

    console.log(`[ESCROW] Draw settled: ${gameId} | Refund: ${refund} each`);
    return { refund };
  } catch (err) {
    try { query('ROLLBACK'); } catch {}
    throw err;
  }
}

module.exports = { getBalance, lockSingleWager, lockWager, lockChallengeJoiner, settleGame, settleDraw, COMMISSION_RATE };
