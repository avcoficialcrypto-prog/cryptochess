"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import HypePhrases from "@/components/HypePhrases";
import { sounds } from "@/lib/sounds";
import {
  Zap, Users, Wallet, ArrowDownToLine, Copy, Check,
  Plus, LogOut, Link,
} from "lucide-react";

export default function Dashboard({ player, walletAddress, disconnect, router }: any) {
  const { t } = useI18n();
  const { connectWallet } = useAuth();
  const shortAddr = walletAddress
    ? walletAddress.slice(0, 4) + "..." + walletAddress.slice(-4)
    : "Guest";
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState(false);

  const handleDeposit = async (amount: number) => {
    setDepositing(true);
    sounds.click();
    try {
      await api.deposit(amount);
      setDepositSuccess(true);
      setTimeout(() => { setDepositSuccess(false); setShowDeposit(false); window.location.reload(); }, 2000);
    } catch (err) { console.error("Deposit failed:", err); }
    finally { setDepositing(false); }
  };

  const copyAddress = async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnectPhantom = async () => {
    setConnectingWallet(true);
    try {
      await connectWallet();
    } catch (err: any) {
      console.error("Phantom connect failed:", err.message);
    } finally {
      setConnectingWallet(false);
    }
  };

  return (
    <div className="min-h-screen chess-bg-subtle">
      {/* Luxury gradient overlays */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gold-400/[0.03] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neon-purple/[0.03] rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="CryptoChess" className="w-10 h-10 rounded-lg" />
            <span className="text-xl sm:text-2xl font-bold text-gradient">CryptoChess</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {/* Phantom Connect Button (optional) */}
            <button
              onClick={handleConnectPhantom}
              disabled={connectingWallet}
              className="flex items-center gap-1.5 text-sm text-white/50 hover:text-gold-400 transition-colors bg-dark-700/50 px-3 py-1.5 rounded-lg border border-white/5 hover:border-gold-400/20"
            >
              <Link className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Phantom</span>
            </button>
            <button onClick={copyAddress} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-gold-400 transition-colors bg-dark-700/50 px-3 py-1.5 rounded-lg">
              {copied ? <Check className="w-3.5 h-3.5 text-neon-green" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="font-mono text-xs">{shortAddr}</span>
            </button>
            <button onClick={disconnect} className="text-white/30 hover:text-white/60 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Welcome */}
        <div className="text-center mb-12 animate-entrance">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black mb-3">
            {t.dashboard.welcome} <span className="text-gradient">{shortAddr}</span>
          </h1>
          <p className="text-white/40 text-lg sm:text-xl">{t.dashboard.readyToPlay}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-12 animate-entrance-up">
          <div className="card text-center py-5">
            <div className="text-3xl font-bold text-gold-400">{player?.balance_usdc?.toFixed(2) || "0.00"}</div>
            <div className="text-xs text-white/40 mt-1">{t.usdc} {t.dashboard.balance}</div>
          </div>
          <div className="card text-center py-5">
            <div className="text-3xl font-bold text-white">{player?.total_games_played || 0}</div>
            <div className="text-xs text-white/40 mt-1">{t.dashboard.gamesPlayed}</div>
          </div>
          <div className="card text-center py-5">
            <div className="text-3xl font-bold text-neon-green">
              {player?.total_games_played ? Math.round(((player.total_games_won || 0) / player.total_games_played) * 100) : 0}%
            </div>
            <div className="text-xs text-white/40 mt-1">{t.dashboard.winRate}</div>
          </div>
          <div className="card text-center py-5">
            <div className="text-3xl font-bold text-neon-green">{player?.total_earnings_usdc?.toFixed(2) || "0.00"}</div>
            <div className="text-xs text-white/40 mt-1">{t.dashboard.totalEarned}</div>
          </div>
        </div>

        {/* Game Mode Buttons — DESKTOP: side by side, MOBILE: stacked */}
        <div className="grid sm:grid-cols-2 gap-4 sm:gap-6 mb-8 animate-entrance-up">
          <button onClick={() => { sounds.click(); router.push("/lobby?mode=quick"); }} className="group relative overflow-hidden rounded-2xl border border-gold-400/20 bg-gradient-to-br from-gold-400/10 to-dark-800 p-6 sm:p-8 lg:p-10 text-left transition-all duration-300 hover:border-gold-400/40 hover:shadow-[0_0_60px_rgba(250,204,21,0.12)] hover:scale-[1.02] active:scale-[0.98]">
            <div className="absolute inset-0 bg-gradient-to-br from-gold-400/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative flex items-center gap-5">
              <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-2xl bg-gold-400/20 flex items-center justify-center flex-shrink-0 group-hover:bg-gold-400/30 transition-colors">
                <Zap className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 text-gold-400 group-hover:scale-110 transition-transform" />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-1">{t.lobby.quickMatch}</h3>
                <p className="text-sm sm:text-base text-white/40">{t.dashboard.quickMatchDesc}</p>
                <div className="mt-2 text-xs text-gold-400/60 font-medium">Auto-matched in seconds</div>
              </div>
            </div>
          </button>

          <button onClick={() => { sounds.click(); router.push("/lobby?mode=challenge"); }} className="group relative overflow-hidden rounded-2xl border border-neon-blue/20 bg-gradient-to-br from-neon-blue/10 to-dark-800 p-6 sm:p-8 lg:p-10 text-left transition-all duration-300 hover:border-neon-blue/40 hover:shadow-[0_0_60px_rgba(59,130,246,0.12)] hover:scale-[1.02] active:scale-[0.98]">
            <div className="absolute inset-0 bg-gradient-to-br from-neon-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative flex items-center gap-5">
              <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-2xl bg-neon-blue/20 flex items-center justify-center flex-shrink-0 group-hover:bg-neon-blue/30 transition-colors">
                <Users className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 text-neon-blue group-hover:scale-110 transition-transform" />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-1">{t.lobby.challengeFriend}</h3>
                <p className="text-sm sm:text-base text-white/40">{t.dashboard.challengeFriendDesc}</p>
                <div className="mt-2 text-xs text-neon-blue/60 font-medium">Share a link or code</div>
              </div>
            </div>
          </button>
        </div>

        {/* Deposit */}
        <div className="animate-entrance-up mb-8">
          <button onClick={() => { sounds.click(); setShowDeposit(!showDeposit); }} className="w-full card-glow flex items-center justify-center gap-3 py-5 text-lg font-bold hover:border-neon-green/30 transition-all">
            <ArrowDownToLine className="w-5 h-5 text-neon-green" />
            {t.profile.depositUsdc}
            <Plus className="w-4 h-4 text-neon-green" />
          </button>
        </div>

        {showDeposit && (
          <div className="card mb-8 animate-scale-in">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-neon-green" />
              {t.profile.depositUsdc}
            </h3>
            <p className="text-sm text-white/40 mb-4">{t.profile.demoMode}</p>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
              {[5, 10, 25, 50, 100].map((amount) => (
                <button key={amount} onClick={() => handleDeposit(amount)} disabled={depositing} className="card text-center py-4 hover:border-neon-green/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50">
                  <div className="text-xl font-bold text-neon-green">{amount}</div>
                  <div className="text-xs text-white/40">{t.usdc}</div>
                </button>
              ))}
            </div>
            {depositSuccess && (
              <div className="text-neon-green text-sm bg-neon-green/10 rounded-xl px-4 py-3 text-center font-medium">
                Deposit successful! Balance updated.
              </div>
            )}
          </div>
        )}

        <div className="animate-entrance-up">
          <HypePhrases showRefresh />
        </div>
      </div>
    </div>
  );
}
