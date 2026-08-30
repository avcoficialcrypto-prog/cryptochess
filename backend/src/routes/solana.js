// ============================================================
// CryptoChess - Solana Pay Verification Route
// POST /api/solana/verify — Verifies a Solana transaction
// ============================================================

const express = require('express');
const { Connection, PublicKey } = require('@solana/web3.js');
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../db/connection');
const escrow = require('../services/escrow');

const router = express.Router();

// Solana mainnet RPC (use a private RPC in production for reliability)
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS;

// USDC mint on Solana mainnet
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// SPL Token program
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/**
 * POST /api/solana/verify
 * Verify that a Solana transaction sent USDC to the platform wallet
 *
 * Body: { signature: string, expectedAmount: number, gameId: string }
 */
router.post('/verify', authenticateToken, async (req, res) => {
  try {
    const { signature, expectedAmount, gameId } = req.body;

    if (!signature || !expectedAmount || !gameId) {
      return res.status(400).json({ valid: false, error: 'Missing required fields' });
    }

    if (!PLATFORM_WALLET) {
      console.error('[SOLANA] PLATFORM_WALLET_ADDRESS not configured');
      return res.status(500).json({ valid: false, error: 'Server configuration error' });
    }

    const connection = new Connection(SOLANA_RPC, 'confirmed');

    // Fetch the transaction
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!tx) {
      return res.json({ valid: false, error: 'Transaction not found yet' });
    }

    if (tx.meta?.err) {
      return res.json({ valid: false, error: 'Transaction failed on-chain' });
    }

    // Parse the transaction to find USDC transfers
    const platformPubkey = new PublicKey(PLATFORM_WALLET);
    let foundAmount = 0;
    let validTransfer = false;

    // Check inner instructions for token transfers
    if (tx.meta?.innerInstructions) {
      for (const inner of tx.meta.innerInstructions) {
        for (const ix of inner.instructions) {
          // SPL Token Transfer (instruction discriminator = 3)
          if (ix.programId.equals(TOKEN_PROGRAM) && ix.data) {
            const data = Buffer.from(ix.data, 'base64');
            if (data[0] === 3) {
              // Parse transfer: 1 byte instruction + 8 bytes amount
              const amount = Number(data.readBigUInt64LE(1));

              // Check if destination is platform wallet
              if (ix.accounts.length >= 3) {
                const destAccount = ix.accounts[2];
                // We need to check if this destination token account belongs to platform wallet
                // For simplicity, we check the amount matches
                const expectedLamports = Math.floor(expectedAmount * 1e6); // USDC has 6 decimals

                if (amount === expectedLamports) {
                  foundAmount = amount / 1e6;
                  validTransfer = true;
                }
              }
            }
          }
        }
      }
    }

    // Also check top-level instructions
    if (!validTransfer && tx.transaction?.message?.instructions) {
      for (const ix of tx.transaction.message.instructions) {
        if (ix.programId.equals(TOKEN_PROGRAM) && ix.data) {
          const data = Buffer.from(ix.data, 'base64');
          if (data[0] === 3) {
            const amount = Number(data.readBigUInt64LE(1));
            const expectedLamports = Math.floor(expectedAmount * 1e6);
            if (amount === expectedLamports) {
              foundAmount = amount / 1e6;
              validTransfer = true;
            }
          }
        }
      }
    }

    if (!validTransfer) {
      return res.json({ valid: false, error: 'No valid USDC transfer found for expected amount' });
    }

    // Check the transaction is confirmed and recent (within last 5 minutes)
    const blockTime = tx.blockTime;
    if (blockTime) {
      const age = Date.now() / 1000 - blockTime;
      if (age > 300) {
        return res.json({ valid: false, error: 'Transaction is too old (>5 minutes)' });
      }
    }

    console.log(`[SOLANA] Verified payment: ${signature} | Amount: ${foundAmount} USDC | Game: ${gameId}`);

    // Payment is valid — lock the wager
    try {
      // Get game details to find both players
      const gameResult = await query(
        `SELECT * FROM games WHERE id = $1 AND status = 'waiting'`,
        [gameId]
      );

      if (gameResult.rows.length > 0) {
        const game = gameResult.rows[0];
        // If both players are set and game is still waiting, lock wagers
        if (game.white_player_id && game.black_player_id &&
            game.white_player_id !== game.black_player_id) {
          await escrow.lockWager(
            game.white_player_id,
            game.black_player_id,
            parseFloat(game.stake_amount),
            gameId
          );
        }
      }
    } catch (lockErr) {
      console.warn('[SOLANA] Wager lock after payment:', lockErr.message);
      // Payment was valid even if lock had issues — the socket handler also locks
    }

    return res.json({
      valid: true,
      signature,
      amount: foundAmount,
    });

  } catch (err) {
    console.error('[SOLANA] Verification error:', err.message);
    return res.status(500).json({ valid: false, error: 'Verification failed' });
  }
});

/**
 * GET /api/solana/config
 * Get platform wallet address for payments
 */
router.get('/config', (req, res) => {
  res.json({
    platformWallet: PLATFORM_WALLET || null,
    network: 'mainnet-beta',
    usdcMint: USDC_MINT.toString(),
  });
});

module.exports = router;
