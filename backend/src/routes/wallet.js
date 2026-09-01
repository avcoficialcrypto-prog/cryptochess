// ============================================================
// CryptoChess - Wallet Routes (On-Chain Only)
// GET  /api/wallet/balance — On-chain USDC balance
// GET  /api/wallet/transactions — Transaction history (audit trail)
// GET  /api/wallet/stats — Player statistics
// NO fake deposits — all payments happen on Solana blockchain
// ============================================================

const express = require('express');
const { authenticateWallet } = require('../middleware/auth');
const { query } = require('../db/connection');
const escrow = require('../services/escrow');

const router = express.Router();

// All routes require wallet authentication
router.use(authenticateWallet);

/**
 * GET /api/wallet/balance
 * Returns player record (stats only — real balance is on-chain)
 */
router.get('/balance', async (req, res) => {
  try {
    let result = query(
      'SELECT wallet_address, balance_usdc FROM players WHERE wallet_address = $1',
      [req.walletAddress]
    );

    if (result.rows.length === 0) {
      // Auto-create player record
      await escrow.ensurePlayer(req.walletAddress);
      result = query(
        'SELECT wallet_address, balance_usdc FROM players WHERE wallet_address = $1',
        [req.walletAddress]
      );
    }

    res.json(result.rows[0] || { wallet_address: req.walletAddress, balance_usdc: 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

/**
 * POST /api/wallet/deposit
 * DEPRECATED — All payments are on-chain via Solana Pay
 * Returns error directing users to use Solana Pay QR
 */
router.post('/deposit', async (req, res) => {
  return res.status(400).json({
    error: 'Direct deposits are not supported. Use Solana Pay QR to send USDC on-chain.',
    solanaPay: true,
  });
});

/**
 * GET /api/wallet/transactions
 * On-chain transaction audit trail
 */
router.get('/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const result = query(
      `SELECT * FROM transactions
       WHERE wallet_address = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.walletAddress, limit, offset]
    );

    const countResult = query(
      'SELECT COUNT(*) as cnt FROM transactions WHERE wallet_address = $1',
      [req.walletAddress]
    );

    res.json({
      transactions: result.rows,
      total: parseInt(countResult.rows[0]?.cnt || '0'),
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

/**
 * GET /api/wallet/stats
 * Player statistics (games played, won, earnings from on-chain payouts)
 */
router.get('/stats', async (req, res) => {
  try {
    let result = query(
      `SELECT
        total_games_played,
        total_games_won,
        total_earnings_usdc,
        total_wagered_usdc,
        CASE WHEN total_games_played > 0
          THEN ROUND(CAST(total_games_won AS REAL) / total_games_played * 100, 1)
          ELSE 0
        END as win_rate,
        total_earnings_usdc - total_wagered_usdc as net_profit_usdc
       FROM players WHERE wallet_address = $1`,
      [req.walletAddress]
    );

    if (result.rows.length === 0) {
      await escrow.ensurePlayer(req.walletAddress);
      result = query(
        `SELECT
          total_games_played, total_games_won, total_earnings_usdc,
          total_wagered_usdc, 0 as win_rate, 0 as net_profit_usdc
         FROM players WHERE wallet_address = $1`,
        [req.walletAddress]
      );
    }

    res.json(result.rows[0] || {
      total_games_played: 0,
      total_games_won: 0,
      total_earnings_usdc: 0,
      total_wagered_usdc: 0,
      win_rate: 0,
      net_profit_usdc: 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;
