// ============================================================
// CryptoChess - Solana Pay Integration
// Generates payment requests and verifies transactions
// ============================================================

import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Backend API for Solana Pay verification
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// Platform wallet that receives USDC stakes
// In production, set this to your actual USDC receiving address
const PLATFORM_WALLET = process.env.NEXT_PUBLIC_PLATFORM_WALLET || '';

// USDC mint address on Solana mainnet
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Solana mainnet RPC (use a private RPC in production)
const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.mainnet-beta.solana.com';

/**
 * Check if Phantom wallet is installed
 */
export function isPhantomInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).solana?.isPhantom;
}

/**
 * Connect to Phantom wallet
 */
export async function connectPhantom(): Promise<{ publicKey: string; balance: number }> {
  const phantom = (window as any).solana;
  if (!phantom?.isPhantom) {
    throw new Error('Phantom wallet not installed');
  }

  const resp = await phantom.connect();
  const publicKey = resp.publicKey.toString();

  // Get SOL balance
  const connection = new Connection(SOLANA_RPC, 'confirmed');
  const balance = await connection.getBalance(resp.publicKey);

  return {
    publicKey,
    balance: balance / LAMPORTS_PER_SOL,
  };
}

/**
 * Get USDC balance for a wallet
 */
export async function getUSDCBalance(walletAddress: string): Promise<number> {
  try {
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const wallet = new PublicKey(walletAddress);

    // Get token accounts for USDC
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet, {
      mint: USDC_MINT,
    });

    if (tokenAccounts.value.length === 0) return 0;

    const amount = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
    return amount || 0;
  } catch (err) {
    console.error('Failed to get USDC balance:', err);
    return 0;
  }
}

/**
 * Create a Solana Pay payment request URL
 * This generates a URL that Phantom can process
 */
export function createSolanaPayUrl(
  recipient: string,
  amount: number,
  memo: string,
  reference?: string
): string {
  const params = new URLSearchParams({
    recipient,
    amount: amount.toString(),
    splToken: USDC_MINT.toString(),
    memo,
    ...(reference && { reference }),
  });

  return `solana:${recipient}?${params.toString()}`;
}

/**
 * Send USDC payment via Phantom wallet
 * Returns the transaction signature
 */
export async function sendUSDCPayment(
  recipientAddress: string,
  amountUSDC: number,
  memo: string
): Promise<{ signature: string; confirmed: boolean }> {
  const phantom = (window as any).solana;
  if (!phantom?.isPhantom) {
    throw new Error('Phantom wallet not connected');
  }

  const connection = new Connection(SOLANA_RPC, 'confirmed');
  const sender = phantom.publicKey;
  const recipient = new PublicKey(recipientAddress);

  // Get sender's USDC token account
  const senderAccounts = await connection.getParsedTokenAccountsByOwner(sender, {
    mint: USDC_MINT,
  });

  if (senderAccounts.value.length === 0) {
    throw new Error('No USDC token account found');
  }

  const senderTokenAccount = senderAccounts.value[0].pubkey;

  // Get or create recipient's USDC token account
  const recipientAccounts = await connection.getParsedTokenAccountsByOwner(recipient, {
    mint: USDC_MINT,
  });

  let recipientTokenAccount;
  if (recipientAccounts.value.length > 0) {
    recipientTokenAccount = recipientAccounts.value[0].pubkey;
  } else {
    // In this case, the platform wallet should already have a USDC account
    throw new Error('Recipient has no USDC token account. Use platform wallet.');
  }

  // Build the transaction
  // We use a simple transfer instruction for USDC
  const { TransactionInstruction, Keypair } = await import('@solana/web3.js');

  // Token transfer instruction (SPL Token)
  const transferAmount = Math.floor(amountUSDC * 1e6); // USDC has 6 decimals

  const transferInstruction = new TransactionInstruction({
    keys: [
      { pubkey: senderTokenAccount, isSigner: false, isWritable: true },
      { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
      { pubkey: sender, isSigner: true, isWritable: false },
    ],
    programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    data: Buffer.from(
      // Transfer instruction discriminator (3) + amount (8 bytes LE)
      [3, ...Array.from(new Uint8Array(new BigUint64Array([BigInt(transferAmount)]).buffer))]
    ),
  });

  // Add memo instruction
  const memoInstruction = new TransactionInstruction({
    keys: [],
    programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
    data: Buffer.from(memo, 'utf-8'),
  });

  const transaction = new Transaction();
  transaction.add(transferInstruction);
  transaction.add(memoInstruction);

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = sender;

  // Request signature from Phantom
  const signedTransaction = await phantom.signTransaction(transaction);

  // Send the transaction
  const signature = await connection.sendRawTransaction(signedTransaction.serialize());

  // Confirm the transaction
  const confirmation = await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  });

  return {
    signature,
    confirmed: !confirmation.value.err,
  };
}

/**
 * Verify a transaction on the backend
 */
export async function verifyPayment(
  signature: string,
  expectedAmount: number,
  gameId: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const token = localStorage.getItem('crypto_chess_token');
    const res = await fetch(`${BACKEND_URL}/api/solana/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ signature, expectedAmount, gameId }),
    });

    const data = await res.json();
    return { valid: data.valid, error: data.error };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

/**
 * Disconnect Phantom wallet
 */
export function disconnectPhantom() {
  const phantom = (window as any).solana;
  if (phantom?.isPhantom) {
    phantom.disconnect();
  }
}

/**
 * Listen for Phantom wallet events
 */
export function onPhantomAccountChange(callback: (publicKey: string | null) => void) {
  const phantom = (window as any).solana;
  if (!phantom?.isPhantom) return () => {};

  const handler = (publicKey: any) => {
    callback(publicKey ? publicKey.toString() : null);
  };

  phantom.on('accountChanged', handler);
  return () => phantom.off('accountChanged', handler);
}
