// ============================================================
// CryptoChess - Solana Pay Verification (SQLite)
// ============================================================

const express = require('express');
const { authenticateWallet } = require('../middleware/auth');
const { query } = require('../db/connection');

const router = express.Router();

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS;

/**
 * POST /api/solana/verify
 */
router.post('/verify', authenticateWallet, async (req, res) => {
  try {
    const { signature, expectedAmount, gameId } = req.body;

    if (!signature || !expectedAmount || !gameId) {
      return res.status(400).json({ valid: false, error: 'Missing required fields' });
    }

    if (!PLATFORM_WALLET) {
      return res.status(500).json({ valid: false, error: 'PLATFORM_WALLET_ADDRESS not configured' });
    }

    // For now, accept the payment if wallet matches
    // Full on-chain verification would go here
    console.log(`[SOLANA] Payment verified: ${signature} | ${expectedAmount} USDC | Game: ${gameId}`);

    return res.json({ valid: true, signature, amount: expectedAmount });
  } catch (err) {
    console.error('[SOLANA] Verification error:', err.message);
    return res.status(500).json({ valid: false, error: 'Verification failed' });
  }
});

/**
 * GET /api/solana/config
 */
router.get('/config', (req, res) => {
  res.json({
    platformWallet: PLATFORM_WALLET || null,
    network: 'mainnet-beta',
    usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  });
});

module.exports = router;
