"use client";

import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import HypePhrases from "@/components/HypePhrases";
import { Zap, Users } from "lucide-react";

export default function Dashboard({ player, walletAddress, disconnect, router }: any) {
  const { t } = useI18n();
  const shortAddr = walletAddress.slice(0, 4) + "..." + walletAddress.slice(-4);
  return (
    <div className="min-h-screen bg-gradient-dark">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-gold-400/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-96 h-96 bg-neon-purple/5 rounded-full blur-3xl" />
      </div>
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="CryptoChess" className="w-10 h-10 rounded-lg" />
            <span className="text-xl sm:text-2xl font-bold text-gradient">{t.appName}</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <button onClick={disconnect} className="text-white/40 hover:text-white text-sm transition-colors">
              <span className="hidden sm:inline">{shortAddr}</span>
            </button>
          </div>
        </header>
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2 animate-fade-in">{t.dashboard.welcome} <span className="text-gradient">{shortAddr}</span></h1>
          <p className="text-white/40 text-lg animate-fade-in-up stagger-1">{t.dashboard.readyToPlay}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10 animate-fade-in-up stagger-2">
          <div className="card text-center py-4"><div className="text-2xl font-bold text-gold-400">{player.balance_usdc?.toFixed(2)}</div><div className="text-xs text-white/40 mt-1">{t.usdc} Balance</div></div>
          <div className="card text-center py-4"><div className="text-2xl font-bold text-white">{player.total_games_played || 0}</div><div className="text-xs text-white/40 mt-1">{t.dashboard.gamesPlayed}</div></div>
          <div className="card text-center py-4"><div className="text-2xl font-bold text-neon-green">{player.total_games_played ? Math.round(((player.total_games_won || 0) / player.total_games_played) * 100) : 0}%</div><div className="text-xs text-white/40 mt-1">{t.dashboard.winRate}</div></div>
          <div className="card text-center py-4"><div className="text-2xl font-bold text-neon-green">{player.total_earnings_usdc?.toFixed(2) || "0.00"}</div><div className="text-xs text-white/40 mt-1">{t.dashboard.totalEarned}</div></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 mb-8 animate-fade-in-up stagger-3">
          <button onClick={() => router.push("/lobby?mode=quick")} className="card-glow group text-left p-8 hover:border-gold-400/30 transition-all duration-300">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gold-400/10 flex items-center justify-center flex-shrink-0 group-hover:bg-gold-400/20 transition-colors"><Zap className="w-8 h-8 text-gold-400 group-hover:scale-110 transition-transform" /></div>
              <div><h3 className="text-xl font-bold mb-1">{t.lobby.quickMatch}</h3><p className="text-sm text-white/40">{t.dashboard.quickMatchDesc}</p></div>
            </div>
          </button>
          <button onClick={() => router.push("/lobby?mode=challenge")} className="card-glow group text-left p-8 hover:border-neon-blue/30 transition-all duration-300">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-neon-blue/10 flex items-center justify-center flex-shrink-0 group-hover:bg-neon-blue/20 transition-colors"><Users className="w-8 h-8 text-neon-blue group-hover:scale-110 transition-transform" /></div>
              <div><h3 className="text-xl font-bold mb-1">{t.lobby.challengeFriend}</h3><p className="text-sm text-white/40">{t.dashboard.challengeFriendDesc}</p></div>
            </div>
          </button>
        </div>
        <div className="animate-fade-in-up stagger-4"><HypePhrases showRefresh /></div>
      </div>
    </div>
  );
}