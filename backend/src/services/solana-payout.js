// ============================================================
// CryptoChess - Solana Payout Service
// Sends USDC from platform wallet to game winner
// Uses @solana/web3.js with the platform wallet's private key
// ============================================================

const {
  Connection, PublicKey, Keypair, Transaction, SystemProgram,
} = require('@solana/web3.js');
const { query, saveDB } = require('../db/connection');

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

let connection = null;
let platformKeypair = null;

const COMMISSION_RATE = 0.03;

/**
 * Initialize the payout service
 */
function init() {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const privateKeyB64 = process.env.PLATFORM_WALLET_PRIVATE_KEY;

  if (!privateKeyB64) {
    console.warn('[PAYOUT] PLATFORM_WALLET_PRIVATE_KEY not set — payouts disabled');
    return false;
  }

  try {
    const secretKey = Buffer.from(privateKeyB64, 'base64');
    platformKeypair = Keypair.fromSecretKey(secretKey);
    connection = new Connection(rpcUrl, 'confirmed');
    console.log(`[PAYOUT] Initialized | Wallet: ${platformKeypair.publicKey.toBase58().slice(0, 8)}...`);
    return true;
  } catch (err) {
    console.error('[PAYOUT] Failed to initialize:', err.message);
    return false;
  }
}

/**
 * Find or create an associated token account for a wallet
 */
async function findOrCreateTokenAccount(walletAddress) {
  const wallet = new PublicKey(walletAddress);

  // Get existing token accounts
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet, {
    mint: USDC_MINT,
  });

  if (tokenAccounts.value.length > 0) {
    return tokenAccounts.value[0].pubkey;
  }

  // Create associated token account
  const { Token, TOKEN_PROGRAM_ID: TP } = require('@solana/spl-token');
  const ata = await Token.getAssociatedTokenAddress(
    new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
    TOKEN_PROGRAM_ID,
    USDC_MINT,
    wallet
  );

  // The ATA might not exist yet — the transaction will create it
  return ata;
}

/**
 * Send USDC payout to winner
 * @param {string} winnerWallet - Winner's Solana wallet address
 * @param {number} amount - USDC amount to send
 * @param {string} gameId - Game ID for logging
 * @returns {{ success, signature?, error? }}
 */
async function sendPayout(winnerWallet, amount, gameId) {
  if (!connection || !platformKeypair) {
    return { success: false, error: 'Payout service not initialized (missing private key)' };
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
      console.error(`[PAYOUT] Insufficient platform balance: ${platformBalance} < ${amount}`);
      return { success: false, error: 'Platform wallet has insufficient USDC balance for payout' };
    }

    // Get recipient's USDC token account (or create it)
    const recipientTokenAccounts = await connection.getParsedTokenAccountsByOwner(
      recipientPubkey,
      { mint: USDC_MINT }
    );

    let recipientTokenAccount;
    if (recipientTokenAccounts.value.length > 0) {
      recipientTokenAccount = recipientTokenAccounts.value[0].pubkey;
    } else {
      // Need to create the ATA — this requires the recipient to have SOL for rent
      // In practice, most players who are using Solana Pay already have ATAs
      return { success: false, error: 'Recipient wallet has no USDC token account' };
    }

    // Build SPL Token transfer instruction
    const transferAmount = Math.floor(amount * 1e6); // USDC has 6 decimals

    const transferInstruction = new (require('@solana/web3.js').TransactionInstruction)({
      keys: [
        { pubkey: platformTokenAccount, isSigner: false, isWritable: true },
        { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
        { pubkey: platformPubkey, isSigner: true, isWritable: false },
      ],
      programId: TOKEN_PROGRAM_ID,
      data: Buffer.from([
        3, // Transfer instruction
        ...new Uint8Array(new BigUint64Array([BigInt(transferAmount)]).buffer),
      ]),
    });

    // Memo instruction
    const memoInstruction = new (require('@solana/web3.js').TransactionInstruction)({
      keys: [],
      programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      data: Buffer.from(`CryptoChess-Win-${gameId.slice(0, 8)}`, 'utf-8'),
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
    console.log(`[PAYOUT] Transaction sent: ${signature.slice(0, 16)}...`);

    // Confirm
    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');

    if (confirmation.value.err) {
      console.error(`[PAYOUT] Transaction failed:`, confirmation.value.err);
      return { success: false, error: 'Transaction failed on-chain' };
    }

    console.log(`[PAYOUT] ✅ Payout confirmed: ${amount} USDC → ${winnerWallet.slice(0, 8)}... | Sig: ${signature.slice(0, 16)}...`);
    return { success: true, signature, amount };
  } catch (err) {
    console.error(`[PAYOUT] Error:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Settle a game: calculate commission and send payout to winner
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

    if (winnerWallet) {
      // Send real USDC payout
      const payoutResult = await sendPayout(winnerWallet, payout, gameId);

      // Update game record
      await query(
        `UPDATE games SET winner_wallet = $1, status = 'completed', updated_at = datetime('now') WHERE id = $2`,
        [winnerWallet, gameId]
      );

      // Record commission
      await query(
        `INSERT INTO commission_pool (amount_usdc, game_id) VALUES ($1, $2)`,
        [commission, gameId]
      );

      // Update player stats
      await query(
        `UPDATE players SET
          total_games_won = total_games_won + 1,
          total_earnings_usdc = total_earnings_usdc + $1,
          total_games_played = total_games_played + 1,
          updated_at = datetime('now')
         WHERE wallet_address = $2`,
        [payout, winnerWallet]
      );

      // Find loser wallet
      const loserWallet = game.white_wallet === winnerWallet ? game.black_wallet : game.white_wallet;
      if (loserWallet) {
        await query(
          `UPDATE players SET total_games_played = total_games_played + 1, updated_at = datetime('now')
           WHERE wallet_address = $1`,
          [loserWallet]
        );
      }

      saveDB();

      return {
        success: true,
        payout,
        commission,
        signature: payoutResult.signature,
        onChain: payoutResult.success,
      };
    } else {
      // Draw — refund both players
      const refund = stakeAmount - (commission / 2);

      await query(
        `UPDATE games SET status = 'completed', updated_at = datetime('now') WHERE id = $1`,
        [gameId]
      );

      // Increment games played
      await query(`UPDATE players SET total_games_played = total_games_played + 1 WHERE wallet_address = $1`, [game.white_wallet]);
      await query(`UPDATE players SET total_games_played = total_games_played + 1 WHERE wallet_address = $1`, [game.black_wallet]);

      // Record commission
      await query(`INSERT INTO commission_pool (amount_usdc, game_id) VALUES ($1, $2)`, [commission, gameId]);

      saveDB();

      return { success: true, draw: true, refund, commission };
    }
  } catch (err) {
    console.error('[PAYOUT] settleAndPayout error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { init, sendPayout, settleAndPayout };
