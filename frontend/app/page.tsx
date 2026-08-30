// ============================================================
// CryptoChess - Landing Page (Wallet-Only)
// Connect Phantom → Dashboard → Play
// No accounts, no login forms
// ============================================================

'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import HypePhrases from '@/components/HypePhrases';
import {
  Shield, Zap, Users, Gamepad2, LogOut, History,
  TrendingUp, DollarSign, ChevronRight, Wallet, Loader2,
} from 'lucide-react';

export default function HomePage() {
  const { player, walletAddress, loading, connecting, connectWallet, disconnectWallet } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">♚</div>
          <div className="text-white/50">{t.loading}</div>
        </div>
      </div>
    );
  }

  // Connected → Dashboard
  if (player) {
    return <Dashboard player={player} walletAddress={walletAddress!} disconnect={disconnectWallet} router={router} />;
  }

  // Wallet Connect Screen
  return (
    <div className="min-h-screen bg-gradient-dark">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gold-400/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon-purple/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-16">
          <div className="flex items-center gap-3">
            <span className="text-4xl">♚</span>
            <span className="text-2xl font-bold text-gradient">{t.appName}</span>
          </div>
          <LanguageSwitcher />
        </header>

        {/* Hero Content */}
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[70vh]">
          <div>
            <div className="badge-gold mb-6">⚡ {t.footer.noAccounts}</div>
            <h1 className="text-5xl lg:text-7xl font-black mb-6 leading-tight">
              {t.tagline.split('.')[0]}.<br />
              <span className="text-gradient">{t.tagline.split('. ').slice(1).join(' ')}</span>
            </h1>
            <p className="text-xl text-white/50 mb-8 max-w-lg">
              {t.footer.poweredBy}. {t.footer.zeroGas}. {t.footer.realtime}. {t.footer.noAccounts}.
            </p>

            <div className="flex flex-wrap gap-4 mb-12">
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
              <div className="flex items-center gap-2 text-sm text-white/40">
                <Wallet className="w-4 h-4 text-neon-purple" />
                <span>{t.footer.noAccounts}</span>
              </div>
            </div>

            {/* Feature Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="card text-center py-4">
                <Gamepad2 className="w-6 h-6 mx-auto mb-2 text-gold-400" />
                <div className="text-xs text-white/50">{t.lobby.quickMatch}</div>
              </div>
              <div className="card text-center py-4">
                <Users className="w-6 h-6 mx-auto mb-2 text-neon-blue" />
                <div className="text-xs text-white/50">{t.lobby.challengeFriend}</div>
              </div>
              <div className="card text-center py-4">
                <DollarSign className="w-6 h-6 mx-auto mb-2 text-neon-green" />
                <div className="text-xs text-white/50">USDC PvP</div>
              </div>
            </div>
          </div>

          {/* Connect Wallet Card */}
          <div className="flex justify-center">
            <div className="card w-full max-w-md text-center">
              <div className="w-20 h-20 rounded-2xl bg-gold-400/10 flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">♟</span>
              </div>

              <h2 className="text-2xl font-bold mb-2">{t.connect.title}</h2>
              <p className="text-white/40 mb-8">{t.connect.subtitle}</p>

              {connecting ? (
                <div className="py-8">
                  <Loader2 className="w-10 h-10 text-gold-400 mx-auto animate-spin mb-4" />
                  <p className="text-white/50">{t.connect.connecting}</p>
                </div>
              ) : (
                <>
                  <button
                    onClick={connectWallet}
                    className="btn-neon w-full text-lg flex items-center justify-center gap-3"
                  >
                    <Wallet className="w-5 h-5" />
                    {t.connect.button}
                  </button>

                  <div className="mt-6 bg-dark-700 rounded-xl p-4">
                    <div className="text-sm text-white/40 mb-2">🎁</div>
                    <p className="text-sm text-gold-400 font-medium">
                      {t.connect.welcomeBonus}
                    </p>
                  </div>
                </>
              )}

              {/* Feature list */}
              <div className="mt-8 space-y-3 text-left">
                {[
                  t.footer.zeroGas,
                  t.footer.realtime,
                  t.footer.noAccounts,
                ].map((feat, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-white/50">
                    <div className="w-1.5 h-1.5 rounded-full bg-neon-green" />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Hype */}
        <div className="mt-12 mb-4">
          <HypePhrases className="justify-center" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Dashboard (after wallet connected)
// ============================================================
function Dashboard({ player, walletAddress, disconnect, router }: {
  player: any;
  walletAddress: string;
  disconnect: () => void;
  router: any;
}) {
  const { t } = useI18n();
  const shortWallet = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);

  return (
    <div className="min-h-screen bg-gradient-dark">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <span className="text-3xl">♚</span>
            <span className="text-xl font-bold text-gradient">{t.appName}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="card flex items-center gap-2 py-2 px-4">
              <DollarSign className="w-4 h-4 text-gold-400" />
              <span className="text-gold-400 font-bold">{player.balance_usdc?.toFixed(2)}</span>
              <span className="text-white/40 text-sm">{t.usdc}</span>
            </div>
            <LanguageSwitcher />
            <div className="text-sm text-white/40 font-mono">{shortWallet}</div>
            <button onClick={disconnect} className="text-white/30 hover:text-white transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Welcome */}
        <div className="card mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gold-400/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <h1 className="text-3xl font-bold mb-2">
              {t.dashboard.welcome}, <span className="text-gradient font-mono">{shortWallet}</span>
            </h1>
            <p className="text-white/40 mb-6">{t.dashboard.readyToPlay}</p>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-dark-700/50 rounded-xl p-4">
                <div className="text-white/40 text-xs mb-1">{t.dashboard.gamesPlayed}</div>
                <div className="text-2xl font-bold">{player.total_games_played}</div>
              </div>
              <div className="bg-dark-700/50 rounded-xl p-4">
                <div className="text-white/40 text-xs mb-1">{t.dashboard.winRate}</div>
                <div className="text-2xl font-bold text-neon-green">
                  {player.total_games_played > 0
                    ? `${((player.total_games_won / player.total_games_played) * 100).toFixed(0)}%`
                    : '0%'}
                </div>
              </div>
              <div className="bg-dark-700/50 rounded-xl p-4">
                <div className="text-white/40 text-xs mb-1">{t.dashboard.totalEarned}</div>
                <div className="text-2xl font-bold text-gold-400">
                  {player.total_earnings_usdc?.toFixed(2)}
                </div>
              </div>
              <div className="bg-dark-700/50 rounded-xl p-4">
                <div className="text-white/40 text-xs mb-1">{t.dashboard.netProfit}</div>
                <div className={`text-2xl font-bold ${
                  (player.total_earnings_usdc - player.total_wagered_usdc) >= 0
                    ? 'text-neon-green' : 'text-neon-red'
                }`}>
                  {(player.total_earnings_usdc - player.total_wagered_usdc) >= 0 ? '+' : ''}
                  {(player.total_earnings_usdc - player.total_wagered_usdc).toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hype */}
        <div className="mb-6">
          <HypePhrases showRefresh />
        </div>

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          <button
            onClick={() => router.push('/lobby')}
            className="card-glow text-left group hover:border-gold-400/30 transition-all duration-300 cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-gold-400/10 flex items-center justify-center">
                    <Zap className="w-6 h-6 text-gold-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">{t.dashboard.quickMatch}</h3>
                    <p className="text-sm text-white/40">{t.dashboard.quickMatchDesc}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  {[1, 5, 10, 50, 100].map((amount) => (
                    <span key={amount} className="badge-gold">{amount} {t.usdc}</span>
                  ))}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-gold-400 transition-colors" />
            </div>
          </button>

          <button
            onClick={() => router.push('/lobby?mode=challenge')}
            className="card-glow text-left group hover:border-neon-blue/30 transition-all duration-300 cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-neon-blue/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-neon-blue" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">{t.dashboard.challengeFriend}</h3>
                    <p className="text-sm text-white/40">{t.dashboard.challengeFriendDesc}</p>
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-neon-blue transition-colors" />
            </div>
          </button>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <button
            onClick={() => router.push('/lobby')}
            className="btn-primary w-full text-center flex items-center justify-center gap-2"
          >
            <Gamepad2 className="w-5 h-5" />
            {t.lobby.findMatch}
          </button>
          <button
            onClick={() => router.push('/profile')}
            className="btn-secondary w-full text-center flex items-center justify-center gap-2"
          >
            <History className="w-5 h-5" />
            {t.profile.history}
          </button>
          <button
            onClick={() => router.push('/profile?tab=wallet')}
            className="btn-secondary w-full text-center flex items-center justify-center gap-2"
          >
            <DollarSign className="w-5 h-5" />
            {t.profile.wallet}
          </button>
        </div>
      </div>
    </div>
  );
}
