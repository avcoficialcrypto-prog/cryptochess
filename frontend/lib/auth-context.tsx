// ============================================================
// CryptoChess - Authentication Context (No Wallet Required)
// Auto-generates temp Solana wallets for each session
// Phantom wallet is optional — manual deposits via Solana Pay
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

/**
 * Generate a random base58-like wallet address for temp sessions
 * This is NOT a real Solana keypair — just a unique identifier
 */
function generateTempWalletId(): string {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 44; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // Auto-generate or restore wallet on mount
  useEffect(() => {
    const savedWallet = localStorage.getItem('cryptochess_wallet');
    if (savedWallet) {
      initPlayer(savedWallet);
    } else {
      // Auto-generate a temp wallet address
      const tempWallet = generateTempWalletId();
      localStorage.setItem('cryptochess_wallet', tempWallet);
      initPlayer(tempWallet);
    }
  }, []);

  const initPlayer = async (wallet: string) => {
    try {
      setWalletAddress(wallet);
      const data = await api.connectWallet(wallet);
      setPlayer(data.player);
    } catch (err) {
      console.error('Failed to init player:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Connect Phantom wallet (optional — replaces temp wallet)
   */
  const connectWallet = useCallback(async () => {
    setConnecting(true);
    try {
      const phantom = (window as any).solana;
      const phantomMobile = (window as any).phantom?.solana;

      const provider = phantom?.isPhantom ? phantom : phantomMobile?.isPhantom ? phantomMobile : null;

      if (!provider) {
        // Phantom not installed — open install page
        window.open('https://phantom.app/', '_blank', 'noopener');
        throw new Error('Please install Phantom wallet extension and reload.');
      }

      // Connect if not already connected
      if (!provider.publicKey) {
        try {
          await provider.connect();
        } catch (err: any) {
          if (err.code === 4001) throw new Error('Connection rejected. Please approve in Phantom.');
          throw err;
        }
      }

      const wallet = provider.publicKey.toString();
      localStorage.setItem('cryptochess_wallet', wallet);
      setWalletAddress(wallet);

      const data = await api.connectWallet(wallet);
      setPlayer(data.player);
    } catch (err: any) {
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    localStorage.removeItem('cryptochess_wallet');
    setWalletAddress(null);
    setPlayer(null);

    // Auto-generate new temp wallet
    const tempWallet = generateTempWalletId();
    localStorage.setItem('cryptochess_wallet', tempWallet);
    setWalletAddress(tempWallet);
    initPlayer(tempWallet);
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
