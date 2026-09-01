// ============================================================
// CryptoChess - Payment Phase Manager
// Tracks matches in payment phase (60s timer per player)
// NO fake balances — refund = real USDC sent back on-chain
// ============================================================

const PAYMENT_TIMEOUT_MS = 60 * 1000; // 60 seconds to pay
const REMATCH_TIMEOUT_MS = 60 * 1000; // 60 seconds to find new match before refund eligible

// Pending payments: gameId -> { white, black, stakeAmount, whitePaid, blackPaid, createdAt, timer }
const pendingPayments = new Map();

// Refund-eligible players: walletAddress -> { gameId, stakeAmount, expiresAt }
const refundEligible = new Map();

/**
 * Start payment phase for a matched game
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

  // Timeout — if not both paid in 60s, handle expiry
  paymentData.timer = setTimeout(() => {
    handlePaymentExpiry(gameId);
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
 */
function handlePaymentExpiry(gameId) {
  const payment = pendingPayments.get(gameId);
  if (!payment) return;

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

module.exports = {
  startPaymentPhase,
  markPaid,
  handlePaymentExpiry,
  cancelPayment,
  makeRefundEligible,
  isRefundEligible,
  consumeRefundEligibility,
  getPendingPayment,
  pendingPayments,
  refundEligible,
  PAYMENT_TIMEOUT_MS,
  REMATCH_TIMEOUT_MS,
};
