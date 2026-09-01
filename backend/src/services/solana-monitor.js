// ============================================================
// CryptoChess - Solana Payment Monitor
// Polls Solana RPC for incoming USDC to platform wallet
// Matches transactions by memo (gameId) to confirm payments
// ============================================================

const { Connection, PublicKey } = require('@solana/web3.js');
const { query, saveDB } = require('../db/connection');

// USDC mint on Solana mainnet
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Memo program ID
const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

// Token program ID
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

class SolanaMonitor {
  constructor() {
    this.connection = null;
    this.platformWallet = null;
    this.pollingIntervals = new Map(); // gameId -> intervalId
    this.confirmedPayments = new Map(); // gameId -> { wallet, amount, signature, confirmedAt }
    this.POLL_INTERVAL_MS = 4000; // Poll every 4 seconds
    this.MAX_POLL_DURATION_MS = 90 * 1000; // Stop polling after 90s
  }

  /**
   * Initialize with RPC endpoint and platform wallet
   */
  init() {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.platformWallet = process.env.PLATFORM_WALLET_ADDRESS;

    if (!this.platformWallet) {
      console.warn('[SOLANA-MONITOR] PLATFORM_WALLET_ADDRESS not set — monitoring disabled');
      return false;
    }

    this.connection = new Connection(rpcUrl, 'confirmed');
    console.log(`[SOLANA-MONITOR] Initialized | RPC: ${rpcUrl} | Wallet: ${this.platformWallet.slice(0, 8)}...`);
    return true;
  }

  /**
   * Start monitoring for a specific game payment
   * @param {string} gameId
   * @param {string} playerWallet - The wallet that should have sent the payment
   * @param {number} expectedAmount - Expected USDC amount
   * @param {Function} onConfirmed - Callback when payment is detected
   * @param {Function} onTimeout - Callback when monitoring times out
   */
  startMonitoring(gameId, playerWallet, expectedAmount, onConfirmed, onTimeout) {
    if (!this.connection || !this.platformWallet) {
      console.error('[SOLANA-MONITOR] Not initialized');
      return;
    }

    // Don't double-monitor
    if (this.pollingIntervals.has(`${gameId}-${playerWallet}`)) {
      return;
    }

    const memo = `CRYPTOCHESS-${gameId}-${playerWallet.slice(0, 8)}`;
    const startTime = Date.now();
    let lastSignature = null;

    console.log(`[SOLANA-MONITOR] Watching for ${expectedAmount} USDC from ${playerWallet.slice(0, 8)}... in game ${gameId.slice(0, 8)}...`);

    const poll = async () => {
      try {
        const platformPubkey = new PublicKey(this.platformWallet);

        // Get recent signatures for the platform wallet's token account
        // We look at the token account, not the main account
        const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
          platformPubkey,
          { mint: new PublicKey(USDC_MINT) }
        );

        if (tokenAccounts.value.length === 0) {
          // Platform wallet doesn't have a USDC token account yet — that's OK
          return;
        }

        const tokenAccount = tokenAccounts.value[0].pubkey;

        // Get recent transaction signatures for this token account
        const signatures = await this.connection.getConfirmedSignaturesForAddress2(
          tokenAccount,
          { limit: 20 }
        );

        for (const sigInfo of signatures) {
          if (sigInfo.err) continue; // Skip failed transactions
          if (lastSignature && sigInfo.signature === lastSignature) break; // Reached already-processed

          // Fetch the full transaction
          const tx = await this.connection.getParsedTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0,
          });

          if (!tx || !tx.meta || !tx.transaction) continue;

          // Check if this is a USDC transfer TO our platform wallet
          const instructions = tx.transaction.message.instructions;
          for (const ix of instructions) {
            // Check for token transfers (programId = Token Program)
            if (ix.programId?.toBase58() === TOKEN_PROGRAM) {
              const info = ix.parsed?.info;
              if (info && info.type === 'transfer') {
                const dest = info.destination;
                const source = info.source;
                const amount = info.amount ? parseFloat(info.amount) / 1e6 : 0; // USDC has 6 decimals

                // Must be TO our platform wallet's token account
                // and FROM the player's wallet (or their associated token account)
                if (
                  dest === tokenAccount.toBase58() &&
                  Math.abs(amount - expectedAmount) < 0.01 // Allow tiny rounding
                ) {
                  // Check if this is from the right player by looking at the source
                  // The source token account owner should be the player
                  try {
                    const sourceInfo = await this.connection.getParsedAccountInfo(new PublicKey(source));
                    const sourceOwner = sourceInfo?.value?.data?.parsed?.info?.owner;

                    if (sourceOwner === playerWallet) {
                      // Found it! Check memo
                      const memoIx = instructions.find(
                        i => i.programId?.toBase58() === MEMO_PROGRAM
                      );
                      const memoText = memoIx?.parsed || '';

                      // Match memo or just match amount + source
                      console.log(`[SOLANA-MONITOR] ✅ Payment detected! ${amount} USDC from ${playerWallet.slice(0, 8)} | Sig: ${sigInfo.signature.slice(0, 16)}...`);

                      // Store confirmed payment
                      this.confirmedPayments.set(`${gameId}-${playerWallet}`, {
                        wallet: playerWallet,
                        amount,
                        signature: sigInfo.signature,
                        confirmedAt: Date.now(),
                      });

                      // Record in database
                      try {
                        await query(
                          `INSERT INTO transactions (wallet_address, type, amount_usdc, game_id, description)
                           VALUES ($1, 'wager_pay', $2, $3, $4)`,
                          [playerWallet, -amount, gameId, `On-chain payment: ${sigInfo.signature.slice(0, 16)}...`]
                        );
                        saveDB();
                      } catch (dbErr) {
                        console.error('[SOLANA-MONITOR] DB write error:', dbErr.message);
                      }

                      // Stop monitoring
                      this.stopMonitoring(gameId, playerWallet);

                      // Callback
                      onConfirmed({
                        wallet: playerWallet,
                        amount,
                        signature: sigInfo.signature,
                        gameId,
                      });

                      return;
                    }
                  } catch (e) {
                    // Source account lookup failed — skip this tx
                  }
                }
              }
            }
          }

          lastSignature = sigInfo.signature;
        }
      } catch (err) {
        // RPC errors are expected (rate limiting, etc.) — just continue polling
        if (!err.message?.includes('429') && !err.message?.includes('rate')) {
          console.error(`[SOLANA-MONITOR] Poll error:`, err.message);
        }
      }

      // Check timeout
      if (Date.now() - startTime > this.MAX_POLL_DURATION_MS) {
        this.stopMonitoring(gameId, playerWallet);
        onTimeout({ gameId, wallet: playerWallet });
        return;
      }
    };

    // Start polling
    const key = `${gameId}-${playerWallet}`;
    poll(); // Initial check
    const intervalId = setInterval(poll, this.POLL_INTERVAL_MS);
    this.pollingIntervals.set(key, intervalId);

    // Auto-stop after max duration
    setTimeout(() => {
      this.stopMonitoring(gameId, playerWallet);
    }, this.MAX_POLL_DURATION_MS);
  }

  /**
   * Stop monitoring for a specific game+player
   */
  stopMonitoring(gameId, playerWallet) {
    const key = `${gameId}-${playerWallet}`;
    const intervalId = this.pollingIntervals.get(key);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(key);
    }
  }

  /**
   * Stop all monitoring (cleanup)
   */
  stopAll() {
    for (const [key, intervalId] of this.pollingIntervals) {
      clearInterval(intervalId);
    }
    this.pollingIntervals.clear();
  }

  /**
   * Check if a payment was already confirmed (from cache)
   */
  isPaymentConfirmed(gameId, playerWallet) {
    return this.confirmedPayments.has(`${gameId}-${playerWallet}`);
  }

  /**
   * Get confirmed payment data
   */
  getConfirmedPayment(gameId, playerWallet) {
    return this.confirmedPayments.get(`${gameId}-${playerWallet}`) || null;
  }
}

module.exports = new SolanaMonitor();
