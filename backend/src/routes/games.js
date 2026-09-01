// ============================================================
// CryptoChess - Game Routes (Wallet-Based, On-Chain Payments)
// POST /api/games/challenge — Create friend challenge
// GET  /api/games/challenge/:code — Get challenge info
// GET  /api/games/history — Game history
// ============================================================

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticateWallet } = require('../middleware/auth');
const { query } = require('../db/connection');
const escrow = require('../services/escrow');

const router = express.Router();

// All routes require wallet authentication
router.use(authenticateWallet);

/**
 * POST /api/games/challenge
 * Create a new challenge for a friend
 * NO balance check — both players pay on-chain after match
 */
router.post('/challenge', async (req, res) => {
  try {
    const { stakeAmount, customStake } = req.body;
    const stake = customStake || stakeAmount;

    if (!stake || stake <= 0) {
      return res.status(400).json({ error: 'Invalid stake amount' });
    }

    // Ensure player record exists (no balance check)
    await escrow.ensurePlayer(req.walletAddress);

    // Generate unique invite code (6 chars)
    const inviteCode = uuidv4().slice(0, 6).toUpperCase();

    // Create game record — status is 'waiting' until opponent joins
    // Both players will pay on-chain via Solana Pay after match
    const gameId = uuidv4();
    await query(
      `INSERT INTO games (id, white_wallet, stake_amount, status, invite_code)
       VALUES ($1, $2, $3, 'waiting', $4)`,
      [gameId, req.walletAddress, stake, inviteCode]
    );

    res.json({
      gameId,
      inviteCode,
      stakeAmount: stake,
    });
  } catch (err) {
    console.error('[GAMES] Create challenge error:', err.message);
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

/**
 * GET /api/games/challenge/:code
 * Get challenge info by invite code (for joining)
 */
router.get('/challenge/:code', async (req, res) => {
  try {
    const result = await query(
      `SELECT g.*
       FROM games g
       WHERE g.invite_code = $1`,
      [req.params.code.toUpperCase()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    const game = result.rows[0];

    res.json({
      gameId: game.id,
      stakeAmount: parseFloat(game.stake_amount),
      status: game.status,
      creatorWallet: game.white_wallet?.slice(0, 6) + '...' + game.white_wallet?.slice(-4),
      isCreator: game.white_wallet === req.walletAddress,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get challenge' });
  }
});

/**
 * GET /api/games/history
 * Game history for current player
 */
router.get('/history', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT
        g.id,
        g.stake_amount,
        g.status,
        g.winner_wallet,
        g.created_at,
        g.updated_at as completed_at,
        CASE
          WHEN g.winner_wallet = $1 THEN 'won'
          WHEN g.winner_wallet IS NOT NULL THEN 'lost'
          ELSE 'pending'
        END as result,
        CASE
          WHEN g.white_wallet = $1 THEN g.black_wallet
          ELSE g.white_wallet
        END as opponent_wallet
       FROM games g
       WHERE g.white_wallet = $1 OR g.black_wallet = $1
       ORDER BY g.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.walletAddress, limit, offset]
    );

    const games = result.rows.map(g => ({
      ...g,
      opponent: g.opponent_wallet
        ? g.opponent_wallet.slice(0, 6) + '...' + g.opponent_wallet.slice(-4)
        : 'Unknown',
      stakeAmount: parseFloat(g.stake_amount),
    }));

    res.json({ games });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get game history' });
  }
});

module.exports = router;
