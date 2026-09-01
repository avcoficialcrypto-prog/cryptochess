// ============================================================
// CryptoChess - Refund Route (Real On-Chain)
// Refunds USDC back to player's wallet via Solana transaction
// ============================================================

const express = require('express');
const solanaPayout = require('../services/solana-payout');
const paymentPhase = require('../services/payment-phase');
const escrow = require('../services/escrow');

const router = express.Router();

/**
 * POST /api/refund
 * Process a real USDC refund on-chain
 * Body: { walletAddress, gameId }
 */
router.post('/', async (req, res) => {
  try {
    const { walletAddress, gameId } = req.body;

    if (!walletAddress || !gameId) {
      return res.status(400).json({ error: 'walletAddress and gameId required' });
    }

    // Check if player is eligible for refund
    if (!paymentPhase.isRefundEligible(walletAddress, gameId)) {
      return res.status(400).json({ error: 'Not eligible for refund or expired' });
    }

    // Consume the eligibility
    const eligibility = paymentPhase.consumeRefundEligibility(walletAddress, gameId);
    if (!eligibility) {
      return res.status(400).json({ error: 'Refund eligibility expired' });
    }

    // Send real USDC refund on-chain
    const refundResult = await solanaPayout.sendPayout(
      walletAddress,
      eligibility.stakeAmount,
      gameId
    );

    if (refundResult.success) {
      // Record for audit
      await escrow.recordRefund(
        walletAddress,
        eligibility.stakeAmount,
        gameId,
        'Refund — opponent did not pay'
      );

      // Mark game as cancelled
      const { query, saveDB } = require('../db/connection');
      await query(
        `UPDATE games SET status = 'cancelled', updated_at = datetime('now') WHERE id = $1`,
        [gameId]
      );
      saveDB();

      console.log(`[REFUND] ✅ Real USDC refund: ${eligibility.stakeAmount} → ${walletAddress.slice(0, 8)} | Sig: ${refundResult.signature?.slice(0, 16)}`);

      return res.json({
        success: true,
        amount: eligibility.stakeAmount,
        signature: refundResult.signature,
        onChain: true,
      });
    } else {
      return res.status(500).json({
        error: 'Refund transaction failed on-chain',
        details: refundResult.error,
      });
    }
  } catch (err) {
    console.error('[REFUND] Error:', err.message);
    return res.status(500).json({ error: 'Refund failed' });
  }
});

/**
 * GET /api/refund/check/:gameId?wallet=...
 * Check if a player is eligible for refund
 */
router.get('/check/:gameId', (req, res) => {
  const { gameId } = req.params;
  const wallet = req.query.wallet;

  if (!wallet) {
    return res.status(400).json({ error: 'wallet query param required' });
  }

  const eligible = paymentPhase.isRefundEligible(wallet, gameId);
  const eligibility = paymentPhase.refundEligible.get(wallet);

  return res.json({
    eligible,
    gameId,
    wallet: wallet.slice(0, 8) + '...',
    stakeAmount: eligibility?.stakeAmount || 0,
    expiresAt: eligibility?.expiresAt || null,
  });
});

module.exports = router;
