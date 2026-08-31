// ============================================================
// CryptoChess - Pending Payment Manager
// Tracks matches in payment phase (60s timer per player)
// ============================================================

const { v4: uuidv4 } = require('uuid');
const { query, saveDB } = require('../db/connection');
const COMMISSION_RATE = 0.03;

// Pending payments: gameId -> { white, black, stakeAmount, whitePaid, blackPaid, createdAt, timer }
const pendingPayments = new Map();

// Refund-eligible players: walletAddress -> { gameId, stakeAmount, expiresAt }
const refundEligible = new Map();

const PAYMENT_TIMEOUT_MS = 60 * 1000; // 60 seconds
const REMATCH_TIMEOUT_MS = 60 * 1000; // 60 seconds to find new match before refund eligible

/**
 * Start payment phase for a matched game
 * Returns { gameId, white, black, stakeAmount }
 */
function startPaymentPhase(gameId, whiteWallet, blackWallet, stakeAmount) {
  const paymentData = {
    gameId,
    white: whiteWallet,
    black: blackWallet,
    stakeAmount,
    whitePaid: false,
    blackPaid: false,
    createdAt: Date.now(),
    timer: null,
  };

  pendingPayments.set(gameId, paymentData);

  // Set timeout — if not both paid in 60s, handle expiry
  paymentData.timer = setTimeout(() => {
    handlePaymentExpiry(gameId);
  }, PAYMENT_TIMEOUT_MS);

  console.log(`[PAYMENT] Phase started: ${gameId} | ${stakeAmount} USDC | 60s timer`);
  return { gameId, stakeAmount, white: whiteWallet, black: blackWallet };
}

/**
 * Mark a player as paid
 * Returns { bothPaid, gameState }
 */
function markPaid(gameId, walletAddress) {
  const payment = pendingPayments.get(gameId);
  if (!payment) return { error: 'No pending payment for this game' };

  if (walletAddress === payment.white) {
    payment.whitePaid = true;
  } else if (walletAddress === payment.black) {
    payment.blackPaid = true;
  } else {
    return { error: 'Player not in this match' };
  }

  console.log(`[PAYMENT] ${walletAddress.slice(0, 8)} paid for ${gameId} | White: ${payment.whitePaid} | Black: ${payment.blackPaid}`);

  if (payment.whitePaid && payment.blackPaid) {
    // Both paid — cancel timer and return game start data
    if (payment.timer) clearTimeout(payment.timer);
    pendingPayments.delete(gameId);
    return { bothPaid: true, gameId, stakeAmount: payment.stakeAmount, white: payment.white, black: payment.black };
  }

  return { bothPaid: false, paid: walletAddress, waitingFor: walletAddress === payment.white ? payment.black : payment.white };
}

/**
 * Handle payment expiry (60s timeout)
 * Called by timer — one or both players didn't pay
 */
function handlePaymentExpiry(gameId) {
  const payment = pendingPayments.get(gameId);
  if (!payment) return;

  const { white, black, whitePaid, blackPaid, stakeAmount } = payment;

  // Cancel timer
  if (payment.timer) clearTimeout(payment.timer);
  pendingPayments.delete(gameId);

  if (whitePaid && !blackPaid) {
    // White paid, black didn't — white goes back to queue, black is refunded/banned from queue briefly
    console.log(`[PAYMENT] Expired: ${gameId} | White paid, Black didn't | Re-queuing white`);
    return { action: 'requeue', paidWallet: white, unpaidWallet: black, stakeAmount, gameId };
  } else if (!whitePaid && blackPaid) {
    // Black paid, white didn't — black goes back to queue
    console.log(`[PAYMENT] Expired: ${gameId} | Black paid, White didn't | Re-queuing black`);
    return { action: 'requeue', paidWallet: black, unpaidWallet: white, stakeAmount, gameId };
  } else {
    // Neither paid — cancel match, both go back
    console.log(`[PAYMENT] Expired: ${gameId} | Neither paid | Both returned to queue`);
    return { action: 'cancel', stakeAmount, gameId };
  }
}

/**
 * Cancel a pending payment (player left/disconnected)
 * Returns info about what to do with the remaining player
 */
function cancelPayment(gameId, walletAddress) {
  const payment = pendingPayments.get(gameId);
  if (!payment) return null;

  if (payment.timer) clearTimeout(payment.timer);

  const isWhite = payment.white === walletAddress;
  const isBlack = payment.black === walletAddress;

  let paidWallet = null;
  let unpaidWallet = null;

  if (isWhite) {
    unpaidWallet = payment.white;
    if (payment.blackPaid) paidWallet = payment.black;
  } else if (isBlack) {
    unpaidWallet = payment.black;
    if (payment.whitePaid) paidWallet = payment.white;
  }

  pendingPayments.delete(gameId);

  if (paidWallet && !isWhite && !isBlack) {
    // The other player paid — requeue them
    return { action: 'requeue', paidWallet, unpaidWallet, stakeAmount: payment.stakeAmount, gameId };
  } else if (payment.whitePaid && payment.blackPaid) {
    // Both paid — shouldn't happen if game already started
    return null;
  } else {
    // Nobody paid or only the leaver paid — just cancel
    return { action: 'cancel', stakeAmount: payment.stakeAmount, gameId };
  }
}

/**
 * Refund a player who paid but didn't get a new match
 */
async function refundPlayer(walletAddress, gameId) {
  const eligibility = refundEligible.get(walletAddress);
  if (!eligibility) return { error: 'Not eligible for refund' };

  if (eligibility.gameId !== gameId) return { error: 'Wrong game ID' };

  try {
    query('BEGIN');

    // Refund the player
    const result = query(
      `UPDATE players SET balance_usdc = balance_usdc + $1, updated_at = datetime('now')
       WHERE wallet_address = $2`,
      [eligibility.stakeAmount, walletAddress]
    );
    if (result.rowCount === 0) {
      query('ROLLBACK');
      return { error: 'Player not found' };
    }

    // Log refund transaction
    query(
      `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
       VALUES ($1, 'refund', $2, $3, 'Match refund — opponent did not pay')`,
      [walletAddress, eligibility.stakeAmount, gameId]
    );

    // Mark game as cancelled
    query(
      `UPDATE games SET status = 'cancelled', updated_at = datetime('now') WHERE id = $1`,
      [gameId]
    );

    query('COMMIT');
    saveDB();

    refundEligible.delete(walletAddress);
    console.log(`[REFUND] ${walletAddress.slice(0, 8)} refunded ${eligibility.stakeAmount} USDC for ${gameId}`);
    return { success: true, amount: eligibility.stakeAmount };
  } catch (err) {
    try { query('ROLLBACK'); } catch {}
    console.error('[REFUND] Error:', err.message);
    return { error: 'Refund failed' };
  }
}

/**
 * Make a player eligible for refund (called after rematch timeout)
 */
function makeRefundEligible(walletAddress, gameId, stakeAmount) {
  refundEligible.set(walletAddress, {
    gameId,
    stakeAmount,
    expiresAt: Date.now() + REMATCH_TIMEOUT_MS,
  });

  // Auto-expire refund eligibility after REMATCH_TIMEOUT_MS
  setTimeout(() => {
    const current = refundEligible.get(walletAddress);
    if (current && current.gameId === gameId) {
      refundEligible.delete(walletAddress);
      console.log(`[REFUND] Eligibility expired for ${walletAddress.slice(0, 8)}`);
    }
  }, REMATCH_TIMEOUT_MS);

  console.log(`[REFUND] ${walletAddress.slice(0, 8)} made eligible for refund on ${gameId}`);
}

/**
 * Check if a player is eligible for refund
 */
function isRefundEligible(walletAddress, gameId) {
  const eligibility = refundEligible.get(walletAddress);
  if (!eligibility) return false;
  if (eligibility.gameId !== gameId) return false;
  if (Date.now() > eligibility.expiresAt) {
    refundEligible.delete(walletAddress);
    return false;
  }
  return true;
}

/**
 * Get pending payment info
 */
function getPendingPayment(gameId) {
  return pendingPayments.get(gameId) || null;
}

module.exports = {
  startPaymentPhase,
  markPaid,
  handlePaymentExpiry,
  cancelPayment,
  refundPlayer,
  makeRefundEligible,
  isRefundEligible,
  getPendingPayment,
  pendingPayments,
  refundEligible,
  PAYMENT_TIMEOUT_MS,
  REMATCH_TIMEOUT_MS,
};
