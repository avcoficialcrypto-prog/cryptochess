// ============================================================
// CryptoChess - Matchmaking Service (Wallet-Based)
// Pairs players by exact stake amount
// Identity = wallet_address
// ============================================================

const { query } = require('../db/connection');
const { v4: uuidv4 } = require('uuid');

// In-memory queue for instant matching
// Map<stakeAmount, Map<walletAddress, {walletAddress, socketId, joinedAt}>>
const waitingPlayers = new Map();

/**
 * Join matchmaking queue
 */
async function joinQueue(walletAddress, stakeAmount, socketId) {
  const validStakes = [1, 5, 10, 50, 100];
  if (!validStakes.includes(stakeAmount)) {
    throw new Error(`Invalid stake. Allowed: ${validStakes.join(', ')} USDC`);
  }

  // Already in queue?
  if (waitingPlayers.has(stakeAmount)) {
    const queue = waitingPlayers.get(stakeAmount);
    if (queue.has(walletAddress)) {
      return { status: 'waiting' };
    }
  }

  // Try to find immediate match
  if (waitingPlayers.has(stakeAmount)) {
    const queue = waitingPlayers.get(stakeAmount);
    for (const [oppWallet, oppData] of queue) {
      if (oppWallet !== walletAddress) {
        queue.delete(oppWallet);
        if (queue.size === 0) waitingPlayers.delete(stakeAmount);

        const gameId = await createMatchedGame(walletAddress, oppWallet, stakeAmount);

        console.log(`[MATCH] Matched: ${walletAddress.slice(0, 8)} vs ${oppWallet.slice(0, 8)} | ${stakeAmount} USDC`);

        return {
          status: 'matched',
          gameId,
          opponent: { walletAddress: oppWallet, socketId: oppData.socketId }
        };
      }
    }
  }

  // No match — add to queue
  if (!waitingPlayers.has(stakeAmount)) {
    waitingPlayers.set(stakeAmount, new Map());
  }
  waitingPlayers.get(stakeAmount).set(walletAddress, {
    walletAddress, socketId, joinedAt: Date.now()
  });

  console.log(`[MATCH] ${walletAddress.slice(0, 8)} joined queue for ${stakeAmount} USDC`);
  return { status: 'waiting' };
}

/**
 * Leave queue
 */
function leaveQueue(walletAddress, stakeAmount) {
  if (waitingPlayers.has(stakeAmount)) {
    waitingPlayers.get(stakeAmount).delete(walletAddress);
    if (waitingPlayers.get(stakeAmount).size === 0) {
      waitingPlayers.delete(stakeAmount);
    }
  }
  console.log(`[MATCH] ${walletAddress.slice(0, 8)} left queue for ${stakeAmount} USDC`);
}

/**
 * Cleanup all queues for a wallet (on disconnect)
 */
function cleanupPlayer(walletAddress) {
  for (const [stake, queue] of waitingPlayers) {
    if (queue.has(walletAddress)) {
      queue.delete(walletAddress);
      if (queue.size === 0) waitingPlayers.delete(stake);
    }
  }
}

/**
 * Create a game record for matched players
 */
async function createMatchedGame(whiteWallet, blackWallet, stakeAmount) {
  const gameId = uuidv4();    await query(
      `INSERT INTO games (id, white_wallet, black_wallet, stake_amount, status)
       VALUES ($1, $2, $3, $4, 'payment_pending')`,
      [gameId, whiteWallet, blackWallet, stakeAmount]
    );
  return gameId;
}

/**
 * Get queue sizes
 */
function getQueueStatus() {
  const status = {};
  for (const stake of [1, 5, 10, 50, 100]) {
    status[stake] = waitingPlayers.has(stake) ? waitingPlayers.get(stake).size : 0;
  }
  return status;
}

module.exports = {
  joinQueue,
  leaveQueue,
  cleanupPlayer,
  createMatchedGame,
  getQueueStatus,
  waitingPlayers
};
