// ============================================================
// CryptoChess - Solana Pay Verification (SQLite)
// /verify does REAL on-chain verification of the submitted
// signature: transaction must exist, must have succeeded, and
// must contain a USDC transfer of the expected amount to the
// platform wallet with a memo matching the game.
// ============================================================

const express = require('express');
const { Connection, PublicKey } = require('@solana/web3.js');
const { authenticateWallet } = require('../middleware/auth');

const router = express.Router();

const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS;
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/**
 * POST /api/solana/verify
 * Body: { signature, expectedAmount, gameId }
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

    // Dev mode — no real blockchain to verify against
    if (process.env.DEV_MODE === 'true' || process.env.SKIP_PAYMENTS === 'true') {
      return res.json({ valid: true, signature, amount: expectedAmount, devMode: true });
    }

    const connection = new Connection(SOLANA_RPC, 'confirmed');

    let tx;
    try {
      tx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });
    } catch {
      tx = null;
    }

    if (!tx || !tx.meta || !tx.transaction) {
      return res.json({ valid: false, error: 'Transaction not found or not yet confirmed' });
    }

    if (tx.meta.err) {
      return res.json({ valid: false, error: 'Transaction failed on-chain' });
    }

    const instructions = tx.transaction.message.instructions;

    // Memo must reference this game (both frontend flows include it)
    const memoIx = instructions.find(i => i.programId?.toBase58() === MEMO_PROGRAM);
    const memoText =
      typeof memoIx?.parsed === 'string' ? memoIx.parsed : memoIx?.parsed?.memo || '';

    if (!memoText || !(memoText.includes(gameId) || memoText.includes(String(gameId).slice(0, 16)))) {
      return res.json({ valid: false, error: 'Transaction memo does not match this game' });
    }

    // Platform wallet's USDC token account(s)
    const platformAccounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(PLATFORM_WALLET),
      { mint: new PublicKey(USDC_MINT) }
    );
    const platformAccountSet = new Set(platformAccounts.value.map(a => a.pubkey.toBase58()));

    if (platformAccountSet.size === 0) {
      return res.json({ valid: false, error: 'Platform wallet has no USDC token account' });
    }

    // Look for a token transfer of expectedAmount into the platform wallet
    let matched = false;
    for (const ix of instructions) {
      if (ix.programId?.toBase58() !== TOKEN_PROGRAM) continue;
      const info = ix.parsed?.info;
      if (!info || info.type !== 'transfer') continue;

      const amount = info.amount ? parseFloat(info.amount) / 1e6 : 0; // USDC = 6 decimals
      if (
        platformAccountSet.has(info.destination) &&
        Math.abs(amount - expectedAmount) < 0.01
      ) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      return res.json({ valid: false, error: 'No matching USDC transfer to platform wallet in this transaction' });
    }

    console.log(`[SOLANA] ✅ Payment verified on-chain: ${signature.slice(0, 16)}... | ${expectedAmount} USDC | Game: ${gameId.slice(0, 8)}`);
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
    usdcMint: USDC_MINT,
  });
});

module.exports = router;
