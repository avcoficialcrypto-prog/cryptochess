// ============================================================
// CryptoChess - Escrow Service (sql.js + Wallet-Based)
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

async function lockWager(whiteWallet, blackWallet, stakeAmount, gameId) {
  try {
    query('BEGIN');

    const whiteResult = query(
      `UPDATE players SET balance_usdc = balance_usdc - $1, updated_at = datetime('now')
       WHERE wallet_address = $2 AND balance_usdc >= $1
       RETURNING balance_usdc`,
      [stakeAmount, whiteWallet]
    );
    if (whiteResult.rows.length === 0) {
      query('ROLLBACK');
      throw new Error('Insufficient balance for white player');
    }

    const blackResult = query(
      `UPDATE players SET balance_usdc = balance_usdc - $1, updated_at = datetime('now')
       WHERE wallet_address = $2 AND balance_usdc >= $1
       RETURNING balance_usdc`,
      [stakeAmount, blackWallet]
    );
    if (blackResult.rows.length === 0) {
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

    query(`UPDATE games SET status = 'active', updated_at = datetime('now') WHERE id = $1`, [gameId]);

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

    query(`UPDATE players SET total_wagered_usdc = total_wagered_usdc + $1 WHERE wallet_address = $2`, [stakeAmount, whiteWallet]);
    query(`UPDATE players SET total_wagered_usdc = total_wagered_usdc + $1 WHERE wallet_address = $2`, [stakeAmount, blackWallet]);

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
      query(
        `UPDATE players SET
          balance_usdc = balance_usdc + $1, updated_at = datetime('now'),
          total_games_won = total_games_won + 1,
          total_earnings_usdc = total_earnings_usdc + $1
         WHERE wallet_address = $2 RETURNING balance_usdc`,
        [payout, winnerWallet]
      );

      query(
        `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
         VALUES ($1, 'wager_win', $2, $3, 'Game win')`,
        [winnerWallet, payout, gameId]
      );
    }

    query(
      `UPDATE games SET winner_wallet = $1, status = 'completed', updated_at = datetime('now') WHERE id = $2`,
      [winnerWallet, gameId]
    );

    for (const w of [game.white_wallet, game.black_wallet]) {
      query(`UPDATE players SET total_games_played = total_games_played + 1 WHERE wallet_address = $1`, [w]);
    }

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

    for (const wallet of [game.white_wallet, game.black_wallet]) {
      query(
        `UPDATE players SET balance_usdc = balance_usdc + $1, updated_at = datetime('now')
         WHERE wallet_address = $2`,
        [refund, wallet]
      );
      query(
        `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
         VALUES ($1, 'wager_lock', $2, $3, 'Draw refund')`,
        [wallet, refund, gameId]
      );
    }

    query(`UPDATE games SET status = 'completed', updated_at = datetime('now') WHERE id = $1`, [gameId]);
    query(
      `UPDATE players SET total_games_played = total_games_played + 1
       WHERE wallet_address IN ($1, $2)`,
      [game.white_wallet, game.black_wallet]
    );

    query('COMMIT');
    saveDB();

    console.log(`[ESCROW] Draw settled: ${gameId} | Refund: ${refund} each`);
    return { refund };
  } catch (err) {
    try { query('ROLLBACK'); } catch {}
    throw err;
  }
}

module.exports = { getBalance, lockWager, settleGame, settleDraw, COMMISSION_RATE };
