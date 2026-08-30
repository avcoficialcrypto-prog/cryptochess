// ============================================================
// CryptoChess - Wallet Routes (Wallet-Based)
// GET  /api/wallet/balance — Get balance
// POST /api/wallet/deposit — Deposit USDC (demo mode)
// GET  /api/wallet/transactions — Transaction history
// GET  /api/wallet/stats — Player statistics
// ============================================================

const express = require('express');
const { authenticateWallet } = require('../middleware/auth');
const { query } = require('../db/connection');

const router = express.Router();

// All routes require wallet authentication
router.use(authenticateWallet);

/**
 * GET /api/wallet/balance
 */
router.get('/balance', async (req, res) => {
  try {
    const result = await query(
      'SELECT wallet_address, balance_usdc FROM players WHERE wallet_address = $1',
      [req.walletAddress]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

/**
 * POST /api/wallet/deposit
 * Demo mode: instant balance increase
 * Production: would verify on-chain USDC deposit
 */
router.post('/deposit', async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0 || amount > 10000) {
      return res.status(400).json({ error: 'Invalid deposit amount (1-10000 USDC)' });
    }

    // Ensure player exists
    await query(
      `INSERT INTO players (wallet_address, balance_usdc)
       VALUES ($1, 0) ON CONFLICT (wallet_address) DO NOTHING`,
      [req.walletAddress]
    );

    // Add balance
    await query(
      `UPDATE players SET balance_usdc = balance_usdc + $1, updated_at = NOW()
       WHERE wallet_address = $2`,
      [amount, req.walletAddress]
    );

    // Log transaction
    await query(
      `INSERT INTO transactions (wallet_address, type, amount_usdc, description)
       VALUES ($1, 'deposit', $2, $3)`,
      [req.walletAddress, amount, `Deposited ${amount} USDC (demo)`]
    );

    // Get updated balance
    const result = await query(
      'SELECT wallet_address, balance_usdc FROM players WHERE wallet_address = $1',
      [req.walletAddress]
    );

    res.json({
      success: true,
      balance_usdc: parseFloat(result.rows[0].balance_usdc),
      deposited: amount,
    });
  } catch (err) {
    console.error('[WALLET] Deposit error:', err.message);
    res.status(500).json({ error: 'Deposit failed' });
  }
});

/**
 * GET /api/wallet/transactions
 */
router.get('/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT * FROM transactions
       WHERE wallet_address = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.walletAddress, limit, offset]
    );

    const countResult = await query(
      'SELECT COUNT(*) FROM transactions WHERE wallet_address = $1',
      [req.walletAddress]
    );

    res.json({
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

/**
 * GET /api/wallet/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await query(
      `SELECT
        total_games_played,
        total_games_won,
        total_earnings_usdc,
        total_wagered_usdc,
        CASE WHEN total_games_played > 0
          THEN ROUND((total_games_won::DECIMAL / total_games_played) * 100, 1)
          ELSE 0
        END as win_rate,
        total_earnings_usdc - total_wagered_usdc as net_profit_usdc
       FROM players WHERE wallet_address = $1`,
      [req.walletAddress]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;
