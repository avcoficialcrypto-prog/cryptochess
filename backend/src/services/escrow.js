// ============================================================
// CryptoChess - Escrow Service (On-Chain Only)
// NO fake balances. Real USDC lives on Solana blockchain.
// This service ONLY tracks audit trails for internal records.
// ============================================================

const { query, saveDB } = require('../db/connection');

const COMMISSION_RATE = 0.05; // 5% — covers gas fees + platform revenue

/**
 * Record an on-chain payment for audit purposes.
 * The real money is on Solana — this just logs it internally.
 */
async function recordPayment(walletAddress, amount, gameId, signature, description) {
  try {
    await query(
      `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
       VALUES ($1, 'onchain_payment', $2, $3, $4)`,
      [walletAddress, amount, gameId, description || `On-chain payment: ${signature || 'pending'}`]
    );
    saveDB();
  } catch (err) {
    console.error('[ESCROW] recordPayment error:', err.message);
  }
}

/**
 * Record a payout for audit purposes.
 */
async function recordPayout(walletAddress, amount, gameId, signature) {
  try {
    await query(
      `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
       VALUES ($1, 'onchain_payout', $2, $3, $4)`,
      [walletAddress, amount, gameId, `Winner payout: ${signature || 'pending'}`]
    );
    saveDB();
  } catch (err) {
    console.error('[ESCROW] recordPayout error:', err.message);
  }
}

/**
 * Record a refund for audit purposes.
 */
async function recordRefund(walletAddress, amount, gameId, reason) {
  try {
    await query(
      `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
       VALUES ($1, 'onchain_refund', $2, $3, $4)`,
      [walletAddress, amount, gameId, reason || 'Refund issued']
    );
    saveDB();
  } catch (err) {
    console.error('[ESCROW] recordRefund error:', err.message);
  }
}

/**
 * Record commission earned.
 */
async function recordCommission(amount, gameId) {
  try {
    await query(
      `INSERT INTO commission_pool (amount_usdc, game_id) VALUES ($1, $2)`,
      [amount, gameId]
    );
    saveDB();
  } catch (err) {
    console.error('[ESCROW] recordCommission error:', err.message);
  }
}

/**
 * Update player stats (wins, games played) — no fake balance changes.
 */
async function updatePlayerStats(winnerWallet, loserWallet, payoutAmount) {
  try {
    if (winnerWallet) {
      await query(
        `UPDATE players SET
          total_games_won = total_games_won + 1,
          total_earnings_usdc = total_earnings_usdc + $1,
          total_games_played = total_games_played + 1,
          total_wagered_usdc = total_wagered_usdc + $1,
          updated_at = datetime('now')
         WHERE wallet_address = $2`,
        [payoutAmount, winnerWallet]
      );
    }
    if (loserWallet) {
      await query(
        `UPDATE players SET
          total_games_played = total_games_played + 1,
          total_wagered_usdc = total_wagered_usdc + $1,
          updated_at = datetime('now')
         WHERE wallet_address = $2`,
        [payoutAmount, loserWallet]
      );
    }
    saveDB();
  } catch (err) {
    console.error('[ESCROW] updatePlayerStats error:', err.message);
  }
}

/**
 * Ensure player record exists (no balance — wallet address is identity).
 */
async function ensurePlayer(walletAddress) {
  try {
    const existing = await query(
      'SELECT wallet_address FROM players WHERE wallet_address = $1',
      [walletAddress]
    );
    if (existing.rows.length === 0) {
      await query(
        'INSERT INTO players (wallet_address, balance_usdc) VALUES ($1, 0)',
        [walletAddress]
      );
      saveDB();
    }
  } catch (err) {
    console.error('[ESCROW] ensurePlayer error:', err.message);
  }
}

module.exports = {
  COMMISSION_RATE,
  recordPayment,
  recordPayout,
  recordRefund,
  recordCommission,
  updatePlayerStats,
  ensurePlayer,
};
