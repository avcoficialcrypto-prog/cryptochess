// ============================================================
// CryptoChess - Auth Routes (Wallet-Based)
// POST /api/auth/connect — Create or get player by wallet
// GET  /api/auth/me — Get player profile by wallet
// ============================================================

const express = require('express');
const { authenticateWallet } = require('../middleware/auth');
const { query } = require('../db/connection');

const router = express.Router();

/**
 * POST /api/auth/connect
 * Connect wallet — creates player if new, returns existing if known
 * Body: { walletAddress: string }
 */
router.post('/connect', async (req, res) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    // Validate Solana address format
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    // Check if player exists
    let result = await query(
      'SELECT * FROM players WHERE wallet_address = $1',
      [walletAddress]
    );

    let player;
    let isNew = false;

    if (result.rows.length === 0) {
      // New player — create with 100 USDC welcome bonus
      result = await query(
        `INSERT INTO players (wallet_address, balance_usdc)
         VALUES ($1, 100.00)
         RETURNING *`,
        [walletAddress]
      );
      player = result.rows[0];
      isNew = true;

      // Log welcome bonus transaction
      await query(
        `INSERT INTO transactions (wallet_address, type, amount_usdc, description)
         VALUES ($1, 'welcome_bonus', 100.00, 'Welcome bonus')`,
        [walletAddress]
      );

      console.log(`[AUTH] New player connected: ${walletAddress.slice(0, 8)}...`);
    } else {
      player = result.rows[0];
      console.log(`[AUTH] Player reconnected: ${walletAddress.slice(0, 8)}...`);
    }

    res.json({
      player,
      isNew,
    });
  } catch (err) {
    console.error('[AUTH] Connect error:', err.message);
    res.status(500).json({ error: 'Failed to connect wallet' });
  }
});

/**
 * GET /api/auth/me
 * Get current player profile
 */
router.get('/me', authenticateWallet, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM players WHERE wallet_address = $1',
      [req.walletAddress]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found. Connect wallet first.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[AUTH] Me error:', err.message);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

module.exports = router;
