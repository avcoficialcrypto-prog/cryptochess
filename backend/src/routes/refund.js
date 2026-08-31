// ============================================================
// CryptoChess - Refund Route
// POST /api/refund — Refund a player who paid but rival didn't
// ============================================================

const express = require('express');
const router = express.Router();
const { authenticateWallet } = require('../middleware/auth');
const paymentPhase = require('../services/payment-phase');

router.use(authenticateWallet);

/**
 * POST /api/refund
 * Body: { gameId }
 * Refunds the player if eligible (paid but opponent didn't, no new match found)
 */
router.post('/', async (req, res) => {
  try {
    const { gameId } = req.body;

    if (!gameId) {
      return res.status(400).json({ error: 'gameId required' });
    }

    // Check eligibility
    if (!paymentPhase.isRefundEligible(req.walletAddress, gameId)) {
      return res.status(403).json({ error: 'Not eligible for refund yet' });
    }

    const result = await paymentPhase.refundPlayer(req.walletAddress, gameId);
    if (result.success) {
      res.json({ success: true, amount: result.amount });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err) {
    console.error('[REFUND] Route error:', err.message);
    res.status(500).json({ error: 'Refund failed' });
  }
});

/**
 * GET /api/refund/check/:gameId
 * Check if a player is eligible for refund on a specific game
 */
router.get('/check/:gameId', (req, res) => {
  const eligible = paymentPhase.isRefundEligible(req.walletAddress, req.params.gameId);
  res.json({ eligible });
});

module.exports = router;
