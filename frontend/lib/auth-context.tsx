// ============================================================
// CryptoChess - Authentication Context (Wallet-Only)
// Phantom wallet connection = identity
// Mobile deep links + Desktop extension detection
// ============================================================

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from './api';

interface Player {
  wallet_address: string;
  balance_usdc: number;
  total_games_played: number;
  total_games_won: number;
  total_earnings_usdc: number;
  total_wagered_usdc: number;
  created_at: string;
}

interface AuthContextType {
  player: Player | null;
  walletAddress: string | null;
  loading: boolean;
  connecting: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  refreshPlayer: () => Promise<void>;
  refreshBalance: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Detect if running on mobile
function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

// Detect if inside Phantom in-app browser
function isInPhantomBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).phantom?.solana?.isPhantom || 
         !!(window as any).solana?.isPhantom;
}

// Get the Phantom provider (works on both desktop and mobile)
function getPhantomProvider(): any {
  if (typeof window === 'undefined') return null;
  // Desktop extension
  if ((window as any).solana?.isPhantom) return (window as any).solana;
  // Mobile in-app browser
  if ((window as any).phantom?.solana?.isPhantom) return (window as any).phantom.solana;
  return null;
}

// Open Phantom deep link for mobile
function openPhantomDeepLink() {
  const currentUrl = encodeURIComponent(window.location.href);
  window.location.href = `https://phantom.app/ul/browse/${currentUrl}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // Check for saved wallet connection on mount
  useEffect(() => {
    const savedWallet = localStorage.getItem('cryptochess_wallet');
    if (savedWallet) {
      checkPhantomConnection(savedWallet);
    } else {
      setLoading(false);
    }
  }, []);

  const checkPhantomConnection = async (savedWallet: string) => {
    try {
      const phantom = getPhantomProvider();
      if (phantom?.publicKey) {
        const currentWallet = phantom.publicKey.toString();
        if (currentWallet === savedWallet) {
          setWalletAddress(currentWallet);
          await fetchPlayer(currentWallet);
          return;
        }
      }
      // Phantom not connected or different wallet
      localStorage.removeItem('cryptochess_wallet');
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  const fetchPlayer = async (wallet: string) => {
    try {
      const data = await api.connectWallet(wallet);
      setPlayer(data.player);
    } catch (err) {
      console.error('Failed to fetch player:', err);
    } finally {
      setLoading(false);
    }
  };

  const connectWallet = useCallback(async () => {
    setConnecting(true);
    try {
      const phantom = getPhantomProvider();

      if (!phantom) {
        // Not detected — either not installed or wrong browser
        if (isMobile()) {
          // On mobile: redirect to Phantom app via deep link
          openPhantomDeepLink();
          throw new Error('OPENING_PHANTOM_APP');
        } else {
          // On desktop: open Phantom install page in new tab
          window.open('https://phantom.app/', '_blank', 'noopener');
          throw new Error('Please install the Phantom wallet extension and reload this page.');
        }
      }

      // Phantom is available — request connection
      // If not yet connected (no publicKey), connect first
      if (!phantom.publicKey) {
        try {
          await phantom.connect();
        } catch (connectErr: any) {
          // User rejected the connection request
          if (connectErr.code === 4001 || connectErr.message?.includes('rejected')) {
            throw new Error('Connection rejected. Please approve in Phantom.');
          }
          throw connectErr;
        }
      }

      const wallet = phantom.publicKey.toString();
      setWalletAddress(wallet);
      localStorage.setItem('cryptochess_wallet', wallet);
      await fetchPlayer(wallet);
    } catch (err: any) {
      // Re-throw with proper message
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    const phantom = getPhantomProvider();
    if (phantom?.disconnect) {
      phantom.disconnect();
    }
    localStorage.removeItem('cryptochess_wallet');
    setWalletAddress(null);
    setPlayer(null);
  }, []);

  const refreshPlayer = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const data = await api.connectWallet(walletAddress);
      setPlayer(data.player);
    } catch (err) {
      console.error('Failed to refresh player:', err);
    }
  }, [walletAddress]);

  const refreshBalance = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const data = await api.getBalance();
      setPlayer(prev => prev ? { ...prev, balance_usdc: data.balance_usdc } : prev);
    } catch (err) {
      console.error('Failed to refresh balance:', err);
    }
  }, [walletAddress]);

  return (
    <AuthContext.Provider value={{
      player,
      walletAddress,
      loading,
      connecting,
      connectWallet,
      disconnectWallet,
      refreshPlayer,
      refreshBalance,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
