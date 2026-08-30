// ============================================================
// CryptoChess - Temp Wallet Route
// Generates temporary Solana wallets for game escrow via Solana Pay
// ============================================================

const express = require('express');
const { Keypair } = require('@solana/web3.js');
const { v4: uuidv4 } = require('uuid');
const { query, saveDB } = require('../db/connection');

const router = express.Router();

/**
 * POST /api/temp-wallet/create
 * Creates a temporary Solana wallet for game escrow
 * Body: { stakeAmount: number, gameId?: string }
 */
router.post('/create', async (req, res) => {
  try {
    const { stakeAmount, gameId } = req.body;

    if (!stakeAmount || stakeAmount <= 0) {
      return res.status(400).json({ error: 'Invalid stake amount' });
    }

    // Generate a new Solana keypair
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toBase58();
    const secretKey = Buffer.from(keypair.secretKey).toString('base64');

    // Store in database
    const id = uuidv4();
    await query(
      `INSERT INTO temp_wallets (id, wallet_address, private_key, game_id, stake_amount, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [id, publicKey, secretKey, gameId || null, stakeAmount]
    );

    saveDB();

    console.log(`[TEMP-WALLET] Created: ${publicKey.slice(0, 8)}... | Stake: ${stakeAmount} USDC`);

    res.json({
      success: true,
      walletAddress: publicKey,
      stakeAmount,
      tempWalletId: id,
    });
  } catch (err) {
    console.error('[TEMP-WALLET] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create temp wallet' });
  }
});

/**
 * GET /api/temp-wallet/:walletAddress/status
 * Check deposit status for a temp wallet
 */
router.get('/:walletAddress/status', async (req, res) => {
  try {
    const { walletAddress } = req.params;

    const result = await query(
      `SELECT * FROM temp_wallets WHERE wallet_address = $1 ORDER BY created_at DESC LIMIT 1`,
      [walletAddress]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Temp wallet not found' });
    }

    const wallet = result.rows[0];

    res.json({
      walletAddress: wallet.wallet_address,
      stakeAmount: parseFloat(wallet.stake_amount),
      status: wallet.status,
      gameId: wallet.game_id,
      depositDetected: wallet.status === 'funded',
    });
  } catch (err) {
    console.error('[TEMP-WALLET] Status error:', err.message);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

/**
 * POST /api/temp-wallet/confirm-deposit
 * Called by frontend when deposit is detected on-chain
 * Body: { walletAddress, signature, amount }
 */
router.post('/confirm-deposit', async (req, res) => {
  try {
    const { walletAddress, signature, amount } = req.body;

    if (!walletAddress || !signature) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await query(
      `SELECT * FROM temp_wallets WHERE wallet_address = $1 AND status = 'pending'`,
      [walletAddress]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No pending temp wallet found' });
    }

    const wallet = result.rows[0];
    const stakeAmount = parseFloat(wallet.stake_amount);

    // Verify amount matches
    if (amount && Math.abs(amount - stakeAmount) > 0.01) {
      return res.status(400).json({ error: `Amount mismatch: expected ${stakeAmount}, got ${amount}` });
    }

    // Mark as funded
    await query(
      `UPDATE temp_wallets SET status = 'funded', deposit_detected_at = datetime('now') WHERE wallet_address = $1`,
      [walletAddress]
    );

    // Credit the player's internal balance
    const playerWallet = req.headers['x-wallet-address'];
    if (playerWallet) {
      // Ensure player exists
      await query(
        `INSERT OR IGNORE INTO players (wallet_address, balance_usdc) VALUES ($1, 0)`,
        [playerWallet]
      );

      // Add balance
      await query(
        `UPDATE players SET balance_usdc = balance_usdc + $1, updated_at = datetime('now')
         WHERE wallet_address = $2`,
        [stakeAmount, playerWallet]
      );

      // Log transaction
      await query(
        `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
         VALUES ($1, 'deposit', $2, $3, $4)`,
        [playerWallet, stakeAmount, wallet.game_id, `Deposited ${stakeAmount} USDC via Solana Pay`]
      );
    }

    saveDB();

    console.log(`[TEMP-WALLET] Deposit confirmed: ${walletAddress.slice(0, 8)}... | ${stakeAmount} USDC`);

    res.json({
      success: true,
      balance: stakeAmount,
      gameId: wallet.game_id,
    });
  } catch (err) {
    console.error('[TEMP-WALLET] Confirm deposit error:', err.message);
    res.status(500).json({ error: 'Failed to confirm deposit' });
  }
});

/**
 * GET /api/temp-wallet/config
 * Returns Solana Pay configuration
 */
router.get('/config', (req, res) => {
  res.json({
    network: 'mainnet-beta',
    usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  });
});

module.exports = router;
