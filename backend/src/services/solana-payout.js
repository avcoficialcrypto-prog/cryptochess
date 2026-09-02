// ============================================================
// CryptoChess - Solana Payout Service (Production)
// Sends REAL USDC from platform wallet to game winner
// Commission (5%) covers gas fees + platform revenue
// ============================================================

const {
  Connection, PublicKey, Keypair, Transaction, TransactionInstruction,
  SystemProgram,
} = require('@solana/web3.js');
const { query, saveDB } = require('../db/connection');

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

const COMMISSION_RATE = 0.05; // 5% — covers gas + revenue

let connection = null;
let platformKeypair = null;
let initialized = false;

/**
 * Initialize payout service with platform wallet private key
 */
function init() {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const privateKeyB64 = process.env.PLATFORM_WALLET_PRIVATE_KEY;

  if (!privateKeyB64) {
    console.warn('[PAYOUT] ⚠ PLATFORM_WALLET_PRIVATE_KEY not set — payouts DISABLED');
    console.warn('[PAYOUT] Set it in Render env vars to enable real payouts');
    return false;
  }

  try {
    const secretKey = Buffer.from(privateKeyB64, 'base64');
    platformKeypair = Keypair.fromSecretKey(secretKey);
    connection = new Connection(rpcUrl, 'confirmed');
    initialized = true;

    console.log(`[PAYOUT] ✅ Initialized`);
    console.log(`[PAYOUT] Wallet: ${platformKeypair.publicKey.toBase58()}`);
    console.log(`[PAYOUT] RPC: ${rpcUrl}`);
    console.log(`[PAYOUT] Commission: ${COMMISSION_RATE * 100}%`);

    // Check SOL balance for gas fees
    checkGasBalance();

    return true;
  } catch (err) {
    console.error('[PAYOUT] ❌ Failed to initialize:', err.message);
    return false;
  }
}

/**
 * Check platform wallet SOL balance for gas fees
 */
async function checkGasBalance() {
  if (!connection || !platformKeypair) return;

  try {
    const balance = await connection.getBalance(platformKeypair.publicKey);
    const solBalance = balance / 1e9;

    if (solBalance < 0.01) {
      console.error(`[PAYOUT] ⚠ CRITICAL: Only ${solBalance.toFixed(4)} SOL for gas!`);
      console.error(`[PAYOUT] Fund ${platformKeypair.publicKey.toBase58()} with at least 0.5 SOL`);
    } else {
      console.log(`[PAYOUT] Gas balance: ${solBalance.toFixed(4)} SOL (~${Math.floor(solBalance / 0.000005)} txs)`);
    }
  } catch (err) {
    console.error('[PAYOUT] Gas check error:', err.message);
  }
}

/**
 * Get platform wallet USDC balance
 */
async function getPlatformUSDCBalance() {
  if (!connection || !platformKeypair) return 0;

  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      platformKeypair.publicKey,
      { mint: USDC_MINT }
    );

    if (tokenAccounts.value.length === 0) return 0;

    return parseFloat(
      tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmountString
    );
  } catch (err) {
    console.error('[PAYOUT] Balance check error:', err.message);
    return 0;
  }
}

/**
 * Send USDC payout to winner's wallet
 * @param {string} winnerWallet - Winner's Solana wallet address
 * @param {number} amount - USDC amount to send
 * @param {string} gameId - Game ID for logging
 * @returns {{ success, signature?, error?, amount? }}
 */
async function sendPayout(winnerWallet, amount, gameId) {
  // DEV MODE: Simulate payout
  if (process.env.DEV_MODE === 'true' || process.env.SKIP_PAYMENTS === 'true') {
    console.log(`[PAYOUT] DEV MODE — Simulating payout: ${amount} USDC → ${winnerWallet.slice(0, 8)}...`);
    const fakeSig = 'DEV_PAYOUT_' + Date.now().toString(36);
    return { success: true, signature: fakeSig, amount };
  }

  if (!initialized || !connection || !platformKeypair) {
    return { success: false, error: 'Payout service not initialized (missing PLATFORM_WALLET_PRIVATE_KEY)' };
  }

  try {
    const recipientPubkey = new PublicKey(winnerWallet);
    const platformPubkey = platformKeypair.publicKey;

    // Get platform's USDC token account
    const platformTokenAccounts = await connection.getParsedTokenAccountsByOwner(
      platformPubkey,
      { mint: USDC_MINT }
    );

    if (platformTokenAccounts.value.length === 0) {
      return { success: false, error: 'Platform wallet has no USDC token account' };
    }

    const platformTokenAccount = platformTokenAccounts.value[0].pubkey;
    const platformBalance = parseFloat(
      platformTokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmountString
    );

    if (platformBalance < amount) {
      console.error(`[PAYOUT] Insufficient platform USDC: ${platformBalance} < ${amount}`);
      return { success: false, error: `Platform wallet has insufficient USDC (${platformBalance.toFixed(2)} < ${amount.toFixed(2)})` };
    }

    // Get recipient's USDC token account
    const recipientTokenAccounts = await connection.getParsedTokenAccountsByOwner(
      recipientPubkey,
      { mint: USDC_MINT }
    );

    if (recipientTokenAccounts.value.length === 0) {
      // Recipient doesn't have a USDC token account yet
      // We need to create one — but this requires the recipient to have SOL for rent
      // In practice, anyone playing on Solana Pay already has an ATA
      console.error(`[PAYOUT] Recipient ${winnerWallet.slice(0, 8)} has no USDC token account`);
      return { success: false, error: 'Winner wallet has no USDC token account. They need to receive USDC once before.' };
    }

    const recipientTokenAccount = recipientTokenAccounts.value[0].pubkey;

    // Build SPL Token transfer instruction
    const transferAmount = Math.floor(amount * 1e6); // USDC has 6 decimals

    const transferInstruction = new TransactionInstruction({
      keys: [
        { pubkey: platformTokenAccount, isSigner: false, isWritable: true },
        { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
        { pubkey: platformPubkey, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_PROGRAM_ID,
      data: Buffer.from([
        3, // Transfer instruction discriminator
        ...new Uint8Array(new BigUint64Array([BigInt(transferAmount)]).buffer),
      ]),
    });

    // Memo instruction (for tracking)
    const memoInstruction = new TransactionInstruction({
      keys: [],
      programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      data: Buffer.from(`CryptoChess-Win-${gameId.slice(0, 8)}-${amount}USDC`, 'utf-8'),
    });

    const transaction = new Transaction();
    transaction.add(transferInstruction);
    transaction.add(memoInstruction);

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = platformPubkey;

    // Sign with platform wallet
    transaction.partialSign(platformKeypair);

    // Send
    const signature = await connection.sendRawTransaction(transaction.serialize());
    console.log(`[PAYOUT] 📤 Transaction sent: ${signature.slice(0, 16)}...`);

    // Confirm
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');

    if (confirmation.value.err) {
      console.error(`[PAYOUT] ❌ Transaction failed:`, confirmation.value.err);
      return { success: false, error: 'Transaction failed on-chain', signature };
    }

    console.log(`[PAYOUT] ✅ Payout confirmed: ${amount} USDC → ${winnerWallet.slice(0, 8)}...`);
    console.log(`[PAYOUT] Signature: ${signature}`);
    console.log(`[PAYOUT] https://solscan.io/tx/${signature}`);

    return { success: true, signature, amount };
  } catch (err) {
    console.error(`[PAYOUT] ❌ Error:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Settle a game: calculate commission, send payout to winner on-chain
 */
async function settleAndPayout(gameId, winnerWallet) {
  try {
    const gameResult = await query('SELECT * FROM games WHERE id = $1', [gameId]);
    if (gameResult.rows.length === 0) {
      return { success: false, error: 'Game not found' };
    }

    const game = gameResult.rows[0];
    const stakeAmount = parseFloat(game.stake_amount);
    const totalPot = stakeAmount * 2;
    const commission = parseFloat((totalPot * COMMISSION_RATE).toFixed(6));
    const payout = totalPot - commission;

    console.log(`[PAYOUT] Settling game ${gameId.slice(0, 8)}...`);
    console.log(`[PAYOUT] Pot: ${totalPot} USDC | Commission: ${commission} | Payout: ${payout}`);

    if (winnerWallet) {
      // Send real USDC payout on-chain
      const payoutResult = await sendPayout(winnerWallet, payout, gameId);

      if (payoutResult.success) {
        // Record in database for audit
        const { recordPayout, recordCommission, updatePlayerStats } = require('./escrow');
        await recordPayout(winnerWallet, payout, gameId, payoutResult.signature);
        await recordCommission(commission, gameId);

        // Find loser wallet for stats
        const loserWallet = game.white_wallet === winnerWallet ? game.black_wallet : game.white_wallet;
        await updatePlayerStats(winnerWallet, loserWallet, payout);

        // Update game record
        await query(
          `UPDATE games SET winner_wallet = $1, status = 'completed', updated_at = datetime('now') WHERE id = $2`,
          [winnerWallet, gameId]
        );
        saveDB();

        return {
          success: true,
          payout,
          commission,
          signature: payoutResult.signature,
          onChain: true,
        };
      } else {
        // Payout failed on-chain — game is still recorded but payout pending
        console.error(`[PAYOUT] ⚠ Payout failed for game ${gameId}: ${payoutResult.error}`);

        await query(
          `UPDATE games SET winner_wallet = $1, status = 'payout_pending', updated_at = datetime('now') WHERE id = $2`,
          [winnerWallet, gameId]
        );
        saveDB();

        return {
          success: false,
          payout,
          commission,
          error: payoutResult.error,
          onChain: false,
        };
      }
    } else {
      // Draw — record commission only (refunds happen via separate on-chain txs)
      const { recordCommission, updatePlayerStats } = require('./escrow');
      await recordCommission(commission, gameId);
      await updatePlayerStats(null, null, 0);

      await query(
        `UPDATE games SET status = 'completed', updated_at = datetime('now') WHERE id = $1`,
        [gameId]
      );

      // Increment games played
      await query(`UPDATE players SET total_games_played = total_games_played + 1 WHERE wallet_address = $1`, [game.white_wallet]);
      await query(`UPDATE players SET total_games_played = total_games_played + 1 WHERE wallet_address = $1`, [game.black_wallet]);

      saveDB();

      return { success: true, draw: true, commission };
    }
  } catch (err) {
    console.error('[PAYOUT] settleAndPayout error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send refund on-chain (for when opponent didn't pay)
 */
async function sendRefund(walletAddress, amount, gameId) {
  console.log(`[PAYOUT] Refunding ${amount} USDC to ${walletAddress.slice(0, 8)}...`);
  return sendPayout(walletAddress, amount, gameId);
}

module.exports = { init, sendPayout, settleAndPayout, sendRefund, getPlatformUSDCBalance, checkGasBalance };
