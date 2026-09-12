// ============================================================
// CryptoChess - Payment Phase Manager
// Tracks matches in payment phase (60s timer per player)
// NO fake balances — refund = real USDC sent back on-chain
// ============================================================

const matchmaking = require('./matchmaking');

const PAYMENT_TIMEOUT_MS = 60 * 1000; // 60 seconds to pay
const REMATCH_TIMEOUT_MS = 60 * 1000; // 60 seconds to find new match before refund eligible

// Pending payments: gameId -> { white, black, stakeAmount, whitePaid, blackPaid, createdAt, timer }
const pendingPayments = new Map();

// Refund-eligible players: walletAddress -> { gameId, stakeAmount, expiresAt }
const refundEligible = new Map();

/**
 * Start payment phase for a matched game
 */
function startPaymentPhase(gameId, whiteWallet, blackWallet, stakeAmount, onExpiry) {
  const paymentData = {
    gameId,
    white: whiteWallet,
    black: blackWallet,
    stakeAmount,
    whitePaid: false,
    blackPaid: false,
    createdAt: Date.now(),
    timer: null,
    onExpiry: typeof onExpiry === 'function' ? onExpiry : null,
  };

  pendingPayments.set(gameId, paymentData);

  // Timeout — if not both paid in 60s, handle expiry.
  // NOTE: the return value (requeue/cancel decision) MUST be handled by the caller
  // in server.js — it owns the io instance needed to notify sockets.
  paymentData.timer = setTimeout(() => {
    const expiry = handlePaymentExpiry(gameId);
    if (expiry && onExpiry) {
      try {
        onExpiry(expiry);
      } catch (e) {
        console.error('[PAYMENT] onExpiry handler error:', e.message);
      }
    }
  }, PAYMENT_TIMEOUT_MS);

  console.log(`[PAYMENT] Phase started: ${gameId} | ${stakeAmount} USDC | 60s timer`);
  return { gameId, stakeAmount, white: whiteWallet, black: blackWallet };
}

/**
 * Mark a player as paid (on-chain payment detected)
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
    // Both paid — cancel timer
    if (payment.timer) clearTimeout(payment.timer);
    pendingPayments.delete(gameId);
    return { bothPaid: true, gameId, stakeAmount: payment.stakeAmount, white: payment.white, black: payment.black };
  }

  return { bothPaid: false, paid: walletAddress, waitingFor: walletAddress === payment.white ? payment.black : payment.white };
}

/**
 * Handle payment expiry (60s timeout)
 * Returns the decision; server.js is responsible for acting on it
 * (re-queue the paid player, make them refund-eligible, or cancel).
 */
function handlePaymentExpiry(gameId) {
  const payment = pendingPayments.get(gameId);
  if (!payment) return null;

  const { white, black, whitePaid, blackPaid, stakeAmount } = payment;

  if (payment.timer) clearTimeout(payment.timer);
  pendingPayments.delete(gameId);

  if (whitePaid && !blackPaid) {
    console.log(`[PAYMENT] Expired: ${gameId} | White paid, Black didn't | Re-queuing white`);
    return { action: 'requeue', paidWallet: white, unpaidWallet: black, stakeAmount, gameId };
  } else if (!whitePaid && blackPaid) {
    console.log(`[PAYMENT] Expired: ${gameId} | Black paid, White didn't | Re-queuing black`);
    return { action: 'requeue', paidWallet: black, unpaidWallet: white, stakeAmount, gameId };
  } else {
    console.log(`[PAYMENT] Expired: ${gameId} | Neither paid | Cancelled`);
    return { action: 'cancel', stakeAmount, gameId };
  }
}

/**
 * Cancel a pending payment (player left/disconnected)
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

  if (paidWallet) {
    // The other player paid on-chain — requeue them (they already sent real USDC)
    return { action: 'requeue', paidWallet, unpaidWallet, stakeAmount: payment.stakeAmount, gameId };
  } else if (payment.whitePaid && payment.blackPaid) {
    return null; // Both paid — game should already be starting
  } else if (isWhite && payment.whitePaid) {
    // The LEAVER had paid and the opponent didn't — leaver gets a refund
    return { action: 'refund', paidWallet: payment.white, stakeAmount: payment.stakeAmount, gameId };
  } else if (isBlack && payment.blackPaid) {
    return { action: 'refund', paidWallet: payment.black, stakeAmount: payment.stakeAmount, gameId };
  } else {
    return { action: 'cancel', stakeAmount: payment.stakeAmount, gameId };
  }
}

/**
 * Make a player eligible for refund (after rematch timeout)
 */
function makeRefundEligible(walletAddress, gameId, stakeAmount) {
  refundEligible.set(walletAddress, {
    gameId,
    stakeAmount,
    expiresAt: Date.now() + REMATCH_TIMEOUT_MS,
  });

  // Auto-expire
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
 * Consume refund eligibility (called when refund is processed on-chain)
 */
function consumeRefundEligibility(walletAddress, gameId) {
  const eligibility = refundEligible.get(walletAddress);
  if (!eligibility || eligibility.gameId !== gameId) return null;
  refundEligible.delete(walletAddress);
  return eligibility;
}

/**
 * Get pending payment info
 */
function getPendingPayment(gameId) {
  return pendingPayments.get(gameId) || null;
}

/**
 * Shared recovery path for a player who PAID but whose opponent did not
 * (payment expiry, opponent disconnect, etc.):
 *   1. Try to re-queue them for a new match at the same stake.
 *   2. If no match is found, make them refund-eligible and notify.
 * Returns true if a new match was created, false otherwise.
 *
 * @param {object} opts
 * @param {string} opts.paidWallet
 * @param {string} opts.originalGameId - game whose payment expired
 * @param {number} opts.stakeAmount
 * @param {string} opts.socketId
 * @param {object} opts.io - Socket.io server instance
 * @param {Function} opts.startMatchFn - async (paidWallet, oppWallet, oppSocketId, stakeAmount) => void
 *   starts the payment phase + DB record + notifications for the NEW match
 */
async function recoverPaidPlayer({ paidWallet, originalGameId, stakeAmount, socketId, io, startMatchFn }) {
  if (!socketId || !io.sockets.sockets.get(socketId)) {
    console.log(`[PAYMENT] Paid player ${paidWallet.slice(0, 8)} has no socket — making refund-eligible`);
    makeRefundEligible(paidWallet, originalGameId, stakeAmount);
    return false;
  }

  const reMatch = await matchmaking.joinQueue(paidWallet, stakeAmount, socketId);

  if (reMatch.status === 'matched') {
    await startMatchFn(paidWallet, reMatch.opponent.walletAddress, reMatch.opponent.socketId, stakeAmount, reMatch.gameId);
    return true;
  }

  // No immediate match — refund path after REMATCH_TIMEOUT_MS
  makeRefundEligible(paidWallet, originalGameId, stakeAmount);
  io.to(socketId).emit('payment:waiting_refund', {
    gameId: originalGameId,
    stakeAmount,
    refundEligibleAt: Date.now() + REMATCH_TIMEOUT_MS,
  });
  console.log(`[PAYMENT] Paid player ${paidWallet.slice(0, 8)} re-queued; no match yet — refund eligible after ${REMATCH_TIMEOUT_MS / 1000}s`);
  return false;
}

module.exports = {
  startPaymentPhase,
  markPaid,
  handlePaymentExpiry,
  cancelPayment,
  makeRefundEligible,
  isRefundEligible,
  consumeRefundEligibility,
  getPendingPayment,
  recoverPaidPlayer,
  pendingPayments,
  refundEligible,
  PAYMENT_TIMEOUT_MS,
  REMATCH_TIMEOUT_MS,
};
