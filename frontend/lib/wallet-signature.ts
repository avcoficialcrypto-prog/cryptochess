// ============================================================
// CryptoChess - Wallet Signature Auth Helper
// Proves wallet ownership: backend issues a nonce challenge,
// client signs it with Phantom, backend verifies with tweetnacl.
// Temp wallets (no keypair) fall back to address-only auth.
// ============================================================

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

interface AuthHeaders {
  'x-wallet-signature'?: string;
  'x-wallet-nonce'?: string;
}

// Cache a signed challenge for the session to avoid prompting on every request
let cachedAuth: { wallet: string; nonce: string; signature: string } | null = null;

function getPhantom(): any {
  if (typeof window === 'undefined') return null;
  const phantom = (window as any).solana;
  const phantomMobile = (window as any).phantom?.solana;
  return phantom?.isPhantom ? phantom : phantomMobile?.isPhantom ? phantomMobile : null;
}

/**
 * Returns true when the stored wallet is a real keypair-backed wallet
 * (Phantom connected). Temp wallets can't sign — they use legacy auth.
 */
export function isRealWallet(): boolean {
  if (typeof window === 'undefined') return false;
  return getPhantom()?.publicKey?.toString() === localStorage.getItem('cryptochess_wallet');
}

/**
 * Get (or reuse) a signed challenge for the current wallet.
 * Only prompts the user when there is no valid cached signature.
 */
export async function getAuthSignature(): Promise<AuthHeaders> {
  if (typeof window === 'undefined') return {};

  const wallet = localStorage.getItem('cryptochess_wallet');
  if (!wallet) return {};

  // Temp wallets have no keypair — skip signing
  if (!isRealWallet()) return {};

  // Reuse cached signature for the same wallet (backend accepts re-use window)
  if (cachedAuth && cachedAuth.wallet === wallet) {
    return { 'x-wallet-signature': cachedAuth.signature, 'x-wallet-nonce': cachedAuth.nonce };
  }

  const phantom = getPhantom();
  if (!phantom) return {};

  // 1. Ask backend for a challenge
  const res = await fetch(`${BACKEND_URL}/api/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: wallet }),
  });
  if (!res.ok) return {};
  const { message, nonce } = await res.json();
  if (!message) return {};

  // 2. Sign with Phantom (ed25519 detached)
  const encoded = new TextEncoder().encode(message);
  const signed = await phantom.signMessage(encoded, 'utf8');
  const bytes = new Uint8Array(signed.signature);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const signatureB64 = btoa(binary);

  cachedAuth = { wallet, nonce, signature: signatureB64 };
  return { 'x-wallet-signature': signatureB64, 'x-wallet-nonce': nonce };
}

/**
 * Read the cached signature without prompting (used by socket auth)
 */
export function peekCachedAuth(): { wallet: string; nonce: string; signature: string } | null {
  return cachedAuth;
}

/**
 * Clear cached signature (call on wallet switch/disconnect)
 */
export function clearAuthSignature() {
  cachedAuth = null;
}
