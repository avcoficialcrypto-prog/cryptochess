// ============================================================
// CryptoChess - Auth Middleware (Wallet-Based + Signature)
// Wallet address = identity.
// REAL wallets (Phantom) must prove ownership via signed nonce.
// Temp demo wallets (no keypair) fall back to address-only mode.
// ============================================================

const crypto = require('crypto');
const nacl = require('tweetnacl');
const { PublicKey } = require('@solana/web3.js');

// Issued challenges: nonce -> { wallet, expiresAt }
const authChallenges = new Map();

const CHALLENGE_TTL_MS = 3 * 60 * 1000;      // challenge valid 3 min
const REST_SIGNATURE_MAX_AGE_MS = 10 * 60 * 1000;  // REST signature reuse window
const SOCKET_SIGNATURE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // socket session window

const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Issue a one-time signing challenge for a wallet.
 * Message embeds timestamp so verification can enforce freshness.
 */
function issueChallenge(walletAddress) {
  // Opportunistic cleanup of expired challenges
  const now = Date.now();
  for (const [nonce, entry] of authChallenges) {
    if (entry.expiresAt < now) authChallenges.delete(nonce);
  }

  const nonce = `cryptochess-auth:v1:${walletAddress}:${now}:${crypto.randomBytes(16).toString('hex')}`;
  authChallenges.set(nonce, { wallet: walletAddress, expiresAt: now + CHALLENGE_TTL_MS });

  return { nonce, message: nonce, expiresAt: now + CHALLENGE_TTL_MS };
}

/**
 * Verify an ed25519 signature (base64) of `message` made by `walletAddress`.
 * - nonce must have been issued by us for this wallet (anti-replay of foreign messages)
 * - consume=true deletes the nonce (one-time use); consume=false allows socket re-handshakes
 */
function verifyWalletSignature(walletAddress, message, signatureB64, opts = {}) {
  const { consume = true, maxAgeMs = CHALLENGE_TTL_MS } = opts;
  try {
    if (!walletAddress || !message || !signatureB64 || typeof signatureB64 !== 'string') return false;
    if (!WALLET_RE.test(walletAddress)) return false;

    // Message must be one of our issued challenges, for this exact wallet
    const entry = authChallenges.get(message);
    if (!entry || entry.wallet !== walletAddress) return false;

    // Freshness (embedded timestamp)
    const m = message.match(/^cryptochess-auth:v1:(.+):(\d+):[0-9a-f]{32}$/);
    if (!m || m[1] !== walletAddress) return false;
    const ts = parseInt(m[2], 10);
    if (!ts || Date.now() - ts > maxAgeMs) return false;

    // Signature must be exactly 64 bytes (ed25519 detached)
    const sigBytes = Buffer.from(signatureB64, 'base64');
    if (sigBytes.length !== 64) return false;

    const pubBytes = new PublicKey(walletAddress).toBytes();
    const msgBytes = new TextEncoder().encode(message);

    const ok = nacl.sign.detached.verify(msgBytes, new Uint8Array(sigBytes), pubBytes);

    if (ok && consume) authChallenges.delete(message);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Authenticate via wallet address header.
 * If x-wallet-signature / x-wallet-nonce are present they MUST be valid.
 * If absent (temp demo wallets) the address-only legacy mode applies.
 */
function authenticateWallet(req, res, next) {
  const wallet = req.headers['x-wallet-address'];

  if (!wallet || typeof wallet !== 'string' || wallet.length < 32) {
    return res.status(401).json({ error: 'Wallet address required' });
  }

  if (!WALLET_RE.test(wallet)) {
    return res.status(401).json({ error: 'Invalid wallet address format' });
  }

  const signature = req.headers['x-wallet-signature'];
  const nonce = req.headers['x-wallet-nonce'];

  if (signature || nonce) {
    const ok = verifyWalletSignature(wallet, nonce, signature, {
      consume: false,
      maxAgeMs: REST_SIGNATURE_MAX_AGE_MS,
    });
    if (!ok) {
      return res.status(401).json({ error: 'Invalid or expired wallet signature' });
    }
  }

  req.walletAddress = wallet;
  next();
}

/**
 * Socket.io wallet auth middleware (same signature semantics as REST)
 */
function authenticateSocket(socket, next) {
  const { walletAddress, authSignature, authNonce } = socket.handshake.auth || {};

  if (!walletAddress || typeof walletAddress !== 'string') {
    return next(new Error('Wallet address required'));
  }

  if (!WALLET_RE.test(walletAddress)) {
    return next(new Error('Invalid wallet address'));
  }

  if (authSignature || authNonce) {
    const ok = verifyWalletSignature(walletAddress, authNonce, authSignature, {
      consume: false,
      maxAgeMs: SOCKET_SIGNATURE_MAX_AGE_MS,
    });
    if (!ok) {
      return next(new Error('Invalid or expired wallet signature'));
    }
  }

  socket.walletAddress = walletAddress;
  next();
}

module.exports = {
  authenticateWallet,
  authenticateSocket,
  issueChallenge,
  verifyWalletSignature,
};
