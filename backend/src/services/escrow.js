// ============================================================
// CryptoChess - Escrow Service (Wallet-Based)
// Manages all balance operations with full audit trail
// Identity = wallet_address
// ============================================================

const { query, getClient } = require('../db/connection');

const COMMISSION_RATE = 0.03;

/**
 * Get player's balance by wallet address
 */
async function getBalance(walletAddress) {
  const result = await query(
    'SELECT wallet_address, balance_usdc FROM players WHERE wallet_address = $1',
    [walletAddress]
  );
  if (result.rows.length === 0) throw new Error('Player not found');
  return result.rows[0];
}

/**
 * Lock funds for a game wager (atomic transaction)
 */
async function lockWager(whiteWallet, blackWallet, stakeAmount, gameId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Lock white player
    const whiteResult = await client.query(
      `UPDATE players SET balance_usdc = balance_usdc - $1, updated_at = NOW()
       WHERE wallet_address = $2 AND balance_usdc >= $1
       RETURNING balance_usdc`,
      [stakeAmount, whiteWallet]
    );
    if (whiteResult.rows.length === 0) {
      throw new Error('Insufficient balance for white player');
    }

    // Lock black player
    const blackResult = await client.query(
      `UPDATE players SET balance_usdc = balance_usdc - $1, updated_at = NOW()
       WHERE wallet_address = $2 AND balance_usdc >= $1
       RETURNING balance_usdc`,
      [stakeAmount, blackWallet]
    );
    if (blackResult.rows.length === 0) {
      // Refund white
      await client.query(
        `UPDATE players SET balance_usdc = balance_usdc + $1, updated_at = NOW()
         WHERE wallet_address = $2`,
        [stakeAmount, whiteWallet]
      );
      throw new Error('Insufficient balance for black player');
    }

    const totalPot = stakeAmount * 2;
    const commission = parseFloat((totalPot * COMMISSION_RATE).toFixed(6));

    // Update game status
    await client.query(
      `UPDATE games SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [gameId]
    );

    // Record transactions
    await client.query(
      `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
       VALUES ($1, 'wager_lock', $2, $3, 'Locked wager')`,
      [whiteWallet, -stakeAmount, gameId]
    );
    await client.query(
      `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
       VALUES ($1, 'wager_lock', $2, $3, 'Locked wager')`,
      [blackWallet, -stakeAmount, gameId]
    );

    // Update wager tracking
    await client.query(
      `UPDATE players SET total_wagered_usdc = total_wagered_usdc + $1 WHERE wallet_address = $2`,
      [stakeAmount, whiteWallet]
    );
    await client.query(
      `UPDATE players SET total_wagered_usdc = total_wagered_usdc + $1 WHERE wallet_address = $2`,
      [stakeAmount, blackWallet]
    );

    // Add commission to pool
    await client.query(
      `INSERT INTO commission_pool (amount_usdc, game_id) VALUES ($1, $2)`,
      [commission, gameId]
    );

    await client.query('COMMIT');

    console.log(`[ESCROW] Wager locked: ${stakeAmount} USDC each | Pot: ${totalPot} | Commission: ${commission}`);
    return { gameId, totalPot, commission };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ESCROW] lockWager failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Settle a game: pay winner, handle draws
 */
async function settleGame(gameId, winnerWallet = null) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const gameResult = await client.query(
      `SELECT * FROM games WHERE id = $1 AND status IN ('active', 'waiting')`,
      [gameId]
    );
    if (gameResult.rows.length === 0) throw new Error('Game not found or already settled');

    const game = gameResult.rows[0];
    const stakeAmount = parseFloat(game.stake_amount);
    const totalPot = stakeAmount * 2;
    const commission = parseFloat((totalPot * COMMISSION_RATE).toFixed(6));
    const payout = totalPot - commission;

    if (winnerWallet) {
      // Pay winner
      const winResult = await client.query(
        `UPDATE players SET
          balance_usdc = balance_usdc + $1, updated_at = NOW(),
          total_games_won = total_games_won + 1,
          total_earnings_usdc = total_earnings_usdc + $1
         WHERE wallet_address = $2 RETURNING balance_usdc`,
        [payout, winnerWallet]
      );

      await client.query(
        `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
         VALUES ($1, 'wager_win', $2, $3, 'Game win')`,
        [winnerWallet, payout, gameId]
      );
    }

    // Update game status
    await client.query(
      `UPDATE games SET winner_wallet = $1, status = 'completed', updated_at = NOW() WHERE id = $2`,
      [winnerWallet, gameId]
    );

    // Increment games played
    const wallets = [game.white_wallet, game.black_wallet];
    for (const w of wallets) {
      await client.query(
        `UPDATE players SET total_games_played = total_games_played + 1 WHERE wallet_address = $1`,
        [w]
      );
    }

    await client.query('COMMIT');

    console.log(`[ESCROW] Game ${gameId} settled | Winner: ${winnerWallet?.slice(0, 8) || 'draw'} | Payout: ${payout}`);
    return { payout, commission };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ESCROW] settleGame failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Handle a draw: refund both players minus commission
 */
async function settleDraw(gameId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const gameResult = await client.query(
      `SELECT * FROM games WHERE id = $1 AND status IN ('active', 'waiting')`,
      [gameId]
    );
    if (gameResult.rows.length === 0) throw new Error('Game not found');

    const game = gameResult.rows[0];
    const stakeAmount = parseFloat(game.stake_amount);
    const totalPot = stakeAmount * 2;
    const commission = parseFloat((totalPot * COMMISSION_RATE).toFixed(6));
    const refund = stakeAmount - (commission / 2);

    // Refund both players
    for (const wallet of [game.white_wallet, game.black_wallet]) {
      await client.query(
        `UPDATE players SET balance_usdc = balance_usdc + $1, updated_at = NOW()
         WHERE wallet_address = $2`,
        [refund, wallet]
      );
      await client.query(
        `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
         VALUES ($1, 'wager_lock', $2, $3, 'Draw refund')`,
        [wallet, refund, gameId]
      );
    }

    // Update game
    await client.query(
      `UPDATE games SET status = 'completed', updated_at = NOW() WHERE id = $1`,
      [gameId]
    );

    // Increment games played
    await client.query(
      `UPDATE players SET total_games_played = total_games_played + 1
       WHERE wallet_address IN ($1, $2)`,
      [game.white_wallet, game.black_wallet]
    );

    await client.query('COMMIT');

    console.log(`[ESCROW] Draw settled: ${gameId} | Refund: ${refund} each`);
    return { refund };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getBalance,
  lockWager,
  settleGame,
  settleDraw,
  COMMISSION_RATE,
};
