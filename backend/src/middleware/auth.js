// ============================================================
// CryptoChess - Auth Middleware (Wallet-Based)
// Verifies wallet address ownership via signed message
// No JWT, no passwords — wallet address = identity
// ============================================================

const nacl = require('tweetnacl');
const { naclDecode } = require('../utils/encoding');

/**
 * Authenticate via wallet address from header
 * The wallet address is sent as x-wallet-address header
 * For socket auth, it's passed in handshake auth
 */
function authenticateWallet(req, res, next) {
  const wallet = req.headers['x-wallet-address'];

  if (!wallet || typeof wallet !== 'string' || wallet.length < 32) {
    return res.status(401).json({ error: 'Wallet address required' });
  }

  // Basic Solana address validation (base58, 32-44 chars)
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    return res.status(401).json({ error: 'Invalid wallet address format' });
  }

  req.walletAddress = wallet;
  next();
}

/**
 * Socket.io wallet auth middleware
 * Expects { walletAddress } in handshake auth
 */
function authenticateSocket(socket, next) {
  const wallet = socket.handshake.auth.walletAddress;

  if (!wallet || typeof wallet !== 'string') {
    return next(new Error('Wallet address required'));
  }

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    return next(new Error('Invalid wallet address'));
  }

  socket.walletAddress = wallet;
  next();
}

module.exports = { authenticateWallet, authenticateSocket };
