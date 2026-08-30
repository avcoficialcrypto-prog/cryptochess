// ============================================================
// CryptoChess - Landing Page (Wallet-Only)
// Connect Phantom → Dashboard → Play
// No accounts, no login forms
// ============================================================

'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import HypePhrases from '@/components/HypePhrases';
import Dashboard from '@/components/Dashboard';
import {
  Shield, Zap, Users, Gamepad2, DollarSign, Wallet, Loader2,
  Download, Smartphone, Monitor,
} from 'lucide-react';

export default function HomePage() {
  const { player, walletAddress, loading, connecting, connectWallet, disconnectWallet } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [walletError, setWalletError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <img src="/logo.png" alt="" className="w-16 h-16 mx-auto mb-4 animate-pulse" />
          <div className="text-white/50">{t.loading}</div>
        </div>
      </div>
    );
  }

  if (player) {
    return <Dashboard player={player} walletAddress={walletAddress!} disconnect={disconnectWallet} router={router} />;
  }

  const handleConnect = async () => {
    setWalletError(null);
    try {
      await connectWallet();
    } catch (err: any) {
      if (err.message === 'OPENING_PHANTOM_APP') {
        setWalletError(null);
        return;
      }
      setWalletError(err.message || 'Failed to connect wallet');
    }
  };

  // Wallet Connect Screen
  return (
    <div className="min-h-screen bg-gradient-dark relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gold-400/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon-purple/5 rounded-full blur-3xl" />
        <div className="absolute top-[10%] left-[5%] text-6xl opacity-[0.04] chess-float-1 select-none pointer-events-none">♚</div>
        <div className="absolute top-[60%] right-[8%] text-5xl opacity-[0.03] chess-float-2 select-none pointer-events-none">♛</div>
        <div className="absolute bottom-[15%] left-[15%] text-4xl opacity-[0.03] chess-float-3 select-none pointer-events-none">♜</div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-12 sm:mb-16">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="CryptoChess" className="w-10 h-10 rounded-lg" />
            <span className="text-xl sm:text-2xl font-bold text-gradient">{t.appName}</span>
          </div>
          <LanguageSwitcher />
        </header>

        {/* Hero Content */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center min-h-[60vh] lg:min-h-[70vh]">
          {/* Left: Text */}
          <div className="text-center lg:text-left">
            <div className="badge-gold mb-4 sm:mb-6 animate-fade-in-down">⚡ {t.footer.noAccounts}</div>
            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black mb-4 sm:mb-6 leading-tight animate-fade-in">
              {t.tagline.split('.')[0]}.<br />
              <span className="text-gradient">{t.tagline.split('. ').slice(1).join(' ')}</span>
            </h1>
            <p className="text-lg sm:text-xl text-white/50 mb-6 sm:mb-8 max-w-lg mx-auto lg:mx-0 animate-fade-in-up stagger-1">
              {t.footer.poweredBy}. {t.footer.zeroGas}. {t.footer.realtime}. {t.footer.noAccounts}.
            </p>

            <div className="flex flex-wrap justify-center lg:justify-start gap-4 sm:gap-6 mb-8 sm:mb-12 animate-fade-in-up stagger-2">
              <div className="flex items-center gap-2 text-sm text-white/40">
                <Shield className="w-4 h-4 text-neon-green" />
                <span>{t.footer.poweredBy}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-white/40">
                <Zap className="w-4 h-4 text-gold-400" />
                <span>{t.footer.zeroGas}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-white/40">
                <Users className="w-4 h-4 text-neon-blue" />
                <span>{t.footer.realtime}</span>
              </div>
            </div>

            {/* Feature Cards */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4 animate-fade-in-up stagger-3">
              <div className="card text-center py-3 sm:py-4">
                <Gamepad2 className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1.5 sm:mb-2 text-gold-400" />
                <div className="text-[10px] sm:text-xs text-white/50">{t.lobby.quickMatch}</div>
              </div>
              <div className="card text-center py-3 sm:py-4">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1.5 sm:mb-2 text-neon-blue" />
                <div className="text-[10px] sm:text-xs text-white/50">{t.lobby.challengeFriend}</div>
              </div>
              <div className="card text-center py-3 sm:py-4">
                <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1.5 sm:mb-2 text-neon-green" />
                <div className="text-[10px] sm:text-xs text-white/50">USDC PvP</div>
              </div>
            </div>
          </div>

          {/* Right: Connect Wallet Card */}
          <div className="flex justify-center animate-fade-in-up stagger-2">
            <div className="card w-full max-w-md text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gold-400/10 flex items-center justify-center mx-auto mb-4 sm:mb-6 animate-float">
                <img src="/logo.png" alt="CryptoChess" className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl" />
              </div>

              <h2 className="text-xl sm:text-2xl font-bold mb-2">{t.connect.title}</h2>
              <p className="text-white/40 mb-6 sm:mb-8 text-sm sm:text-base">{t.connect.subtitle}</p>

              {walletError && walletError !== 'OPENING_PHANTOM_APP' && (
                <div className="mb-4 bg-neon-red/10 border border-neon-red/30 rounded-xl px-4 py-3 text-sm text-neon-red">
                  {walletError}
                </div>
              )}

              {connecting ? (
                <div className="py-6 sm:py-8">
                  <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-gold-400 mx-auto animate-spin mb-3 sm:mb-4" />
                  <p className="text-white/50 text-sm sm:text-base">{t.connect.connecting}</p>
                </div>
              ) : (
                <>
                  <button
                    onClick={handleConnect}
                    className="btn-neon w-full text-base sm:text-lg flex items-center justify-center gap-3 py-3 sm:py-4 animate-pulse-glow-green"
                  >
                    <Wallet className="w-5 h-5" />
                    {t.connect.button}
                  </button>

                  <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3 text-xs text-white/30">
                    <a href="https://phantom.app/" target="_blank" rel="noopener noreferrer"
                       className="flex items-center gap-1.5 hover:text-gold-400 transition-colors">
                      <Download className="w-3.5 h-3.5" />
                      {t.connect.installing}
                    </a>
                    <span className="hidden sm:inline">•</span>
                    <span className="flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5" /> Mobile + Desktop
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
