// ============================================================
// CryptoChess - Authentication Context (Wallet-Only)
// Phantom wallet connection = identity
// No accounts, no passwords, no JWT
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // Check for saved wallet connection on mount
  useEffect(() => {
    const savedWallet = localStorage.getItem('cryptochess_wallet');
    if (savedWallet) {
      // Verify Phantom is still connected
      checkPhantomConnection(savedWallet);
    } else {
      setLoading(false);
    }
  }, []);

  const checkPhantomConnection = async (savedWallet: string) => {
    try {
      const phantom = (window as any).solana;
      if (phantom?.isPhantom && phantom.publicKey) {
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
      const phantom = (window as any).solana;

      if (!phantom?.isPhantom) {
        window.open('https://phantom.app/', '_blank');
        throw new Error('Please install Phantom wallet');
      }

      const resp = await phantom.connect();
      const wallet = resp.publicKey.toString();

      setWalletAddress(wallet);
      localStorage.setItem('cryptochess_wallet', wallet);
      await fetchPlayer(wallet);
    } catch (err: any) {
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    const phantom = (window as any).solana;
    if (phantom?.isPhantom) {
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
