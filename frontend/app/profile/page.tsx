// ============================================================
// CryptoChess - Profile & Wallet Page (Wallet-Only)
// ============================================================

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import {
  ArrowLeft, DollarSign, Trophy, History, TrendingUp, TrendingDown,
  Plus, Clock, Gamepad2, Target, Loader2, ArrowDownRight, ArrowUpRight,
  ArrowLeftRight, Wallet, Copy, Check, LogOut,
} from 'lucide-react';

type Tab = 'wallet' | 'history' | 'stats';

export default function ProfilePage() {
  const { player, walletAddress, refreshBalance, refreshPlayer, disconnectWallet } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('wallet');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositing, setDepositing] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [gameHistory, setGameHistory] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [copiedAddress, setCopiedAddress] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as Tab;
    if (tabParam && ['wallet', 'history', 'stats'].includes(tabParam)) setTab(tabParam);
  }, []);

  useEffect(() => { if (player) fetchData(); }, [tab, player]);
  useEffect(() => { if (!walletAddress) router.push('/'); }, [walletAddress, router]);

  const fetchData = async () => {
    setLoadingData(true);
    try {
      if (tab === 'wallet') { const r = await api.getTransactions(1, 50); setTransactions(r.transactions || []); }
      else if (tab === 'history') { const r = await api.getGameHistory(1); setGameHistory(r.games || []); }
      else if (tab === 'stats') { const r = await api.getStats(); setStats(r); }
    } catch (err) { console.error('Fetch error:', err); }
    finally { setLoadingData(false); }
  };

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return;
    setDepositing(true);
    try { await api.deposit(amount); await refreshBalance(); await refreshPlayer(); setDepositAmount(''); fetchData(); }
    catch (err: any) { alert(err.message); }
    finally { setDepositing(false); }
  };

  const quickDeposit = async (amount: number) => {
    setDepositing(true);
    try { await api.deposit(amount); await refreshBalance(); await refreshPlayer(); fetchData(); }
    catch (err: any) { alert(err.message); }
    finally { setDepositing(false); }
  };

  const copyAddress = async () => {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  if (!walletAddress || !player) return null;

  const getTxIcon = (type: string) => {
    switch (type) {
      case 'deposit': return <ArrowDownRight className="w-4 h-4 text-neon-green" />;
      case 'withdrawal': return <ArrowUpRight className="w-4 h-4 text-neon-red" />;
      case 'wager_lock': return <Target className="w-4 h-4 text-neon-blue" />;
      case 'wager_win': return <Trophy className="w-4 h-4 text-gold-400" />;
      default: return <Clock className="w-4 h-4 text-white/40" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-dark">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /><span className="text-sm">{t.back}</span>
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-gradient">{t.profile.title}</span>
            <LanguageSwitcher />
          </div>
        </div>

        {/* Wallet Card */}
        <div className="card mb-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-gold-400/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gold-400 mb-1">{player.balance_usdc?.toFixed(2)} <span className="text-lg text-white/40">{t.usdc}</span></h1>
              <div className="flex items-center gap-2 mt-1">
                <Wallet className="w-4 h-4 text-white/30" />
                <span className="text-sm text-white/40 font-mono">{walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}</span>
                <button onClick={copyAddress} className="text-white/30 hover:text-gold-400 transition-colors">
                  {copiedAddress ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button onClick={disconnectWallet} className="btn-danger text-sm flex items-center gap-2">
              <LogOut className="w-4 h-4" /> {t.profile.disconnect}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-dark-800 rounded-xl p-1 mb-6">
          {([
            { id: 'wallet' as Tab, label: t.profile.wallet, icon: DollarSign },
            { id: 'history' as Tab, label: t.profile.history, icon: History },
            { id: 'stats' as Tab, label: t.profile.stats, icon: Trophy },
          ]).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === id ? 'bg-dark-600 text-white' : 'text-white/50 hover:text-white/70'}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {/* WALLET TAB */}
        {tab === 'wallet' && (
          <div className="space-y-4">
            <div className="card">
              <h3 className="text-sm font-medium text-white/50 mb-3">{t.profile.depositUsdc}</h3>
              <div className="flex gap-2">
                <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder={t.profile.amount} className="input-dark flex-1" min="1" step="1" />
                <button onClick={handleDeposit} disabled={depositing || !depositAmount} className="btn-neon flex items-center gap-2">
                  {depositing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}{t.profile.deposit}
                </button>
              </div>
              <p className="text-xs text-white/30 mt-2">{t.profile.demoMode}</p>
            </div>
            <div className="card">
              <h3 className="text-sm font-medium text-white/50 mb-3">{t.profile.quickDeposit}</h3>
              <div className="grid grid-cols-4 gap-3">
                {[10, 25, 50, 100].map((amount) => (
                  <button key={amount} onClick={() => quickDeposit(amount)} disabled={depositing} className="stake-btn text-center">
                    <div className="text-lg font-bold">{amount}</div>
                    <div className="text-xs text-white/40">{t.usdc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="card">
              <h3 className="text-sm font-medium text-white/50 mb-3">{t.profile.transactions}</h3>
              {loadingData ? (
                <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-white/30" /></div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-8 text-white/30">{t.profile.noTransactions}</div>
              ) : (
                <div className="space-y-2">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-3">
                        {getTxIcon(tx.type)}
                        <div>
                          <div className="text-sm">{tx.description || tx.type}</div>
                          <div className="text-xs text-white/30">{new Date(tx.created_at).toLocaleString()}</div>
                        </div>
                      </div>
                      <div className={`text-sm font-bold ${tx.amount_usdc >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                        {tx.amount_usdc >= 0 ? '+' : ''}{tx.amount_usdc?.toFixed(2)} {t.usdc}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div className="space-y-4">
            {loadingData ? (
              <div className="card text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-white/30" /></div>
            ) : gameHistory.length === 0 ? (
              <div className="card text-center py-12">
                <Gamepad2 className="w-12 h-12 mx-auto text-white/20 mb-4" />
                <h3 className="text-lg font-bold mb-2">{t.profile.noGamesYet}</h3>
                <p className="text-white/40 mb-4">{t.profile.playFirst}</p>
                <button onClick={() => router.push('/lobby')} className="btn-primary">{t.lobby.findMatch}</button>
              </div>
            ) : (
              gameHistory.map((game) => (
                <div key={game.id} className={`card flex items-center justify-between ${game.result === 'won' ? 'border-neon-green/20' : game.result === 'lost' ? 'border-neon-red/20' : 'border-white/5'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${game.result === 'won' ? 'bg-neon-green/10' : game.result === 'lost' ? 'bg-neon-red/10' : 'bg-white/5'}`}>
                      {game.result === 'won' ? <Trophy className="w-6 h-6 text-neon-green" /> :
                       game.result === 'lost' ? <TrendingDown className="w-6 h-6 text-neon-red" /> :
                       <ArrowLeftRight className="w-6 h-6 text-white/40" />}
                    </div>
                    <div>
                      <div className="font-bold font-mono text-sm">{t.game.vs} {game.opponent}</div>
                      <div className="text-sm text-white/40">
                        {game.result === 'won' ? t.gameOver.victory : game.result === 'lost' ? t.gameOver.defeat : t.game.draw}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${game.result === 'won' ? 'text-neon-green' : game.result === 'lost' ? 'text-neon-red' : 'text-white/40'}`}>
                      {game.result === 'won' ? '+' : game.result === 'lost' ? '-' : ''}
                      {(game.stakeAmount * 2 * 0.97).toFixed(2)} {t.usdc}
                    </div>
                    <div className="text-xs text-white/30">{game.completedAt ? new Date(game.completedAt).toLocaleDateString() : ''}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* STATS TAB */}
        {tab === 'stats' && (
          <div className="space-y-4">
            {loadingData ? (
              <div className="card text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto text-white/30" /></div>
            ) : stats ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="card text-center">
                    <Gamepad2 className="w-8 h-8 mx-auto text-neon-blue mb-2" />
                    <div className="text-3xl font-bold">{stats.total_games_played}</div>
                    <div className="text-sm text-white/40">{t.dashboard.gamesPlayed}</div>
                  </div>
                  <div className="card text-center">
                    <Trophy className="w-8 h-8 mx-auto text-gold-400 mb-2" />
                    <div className="text-3xl font-bold text-neon-green">{stats.win_rate}%</div>
                    <div className="text-sm text-white/40">{t.dashboard.winRate}</div>
                  </div>
                  <div className="card text-center">
                    <TrendingUp className="w-8 h-8 mx-auto text-neon-green mb-2" />
                    <div className="text-3xl font-bold text-gold-400">{stats.total_earnings_usdc?.toFixed(2)}</div>
                    <div className="text-sm text-white/40">{t.dashboard.totalEarned}</div>
                  </div>
                  <div className="card text-center">
                    <DollarSign className="w-8 h-8 mx-auto text-white/40 mb-2" />
                    <div className={`text-3xl font-bold ${stats.net_profit_usdc >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>
                      {stats.net_profit_usdc >= 0 ? '+' : ''}{stats.net_profit_usdc?.toFixed(2)}
                    </div>
                    <div className="text-sm text-white/40">{t.dashboard.netProfit}</div>
                  </div>
                </div>
                <div className="card">
                  <h3 className="text-sm font-medium text-white/50 mb-4">{t.profile.detailedStats}</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-white/5">
                      <span className="text-white/50">{t.profile.totalWagered}</span>
                      <span className="font-bold">{stats.total_wagered_usdc?.toFixed(2)} {t.usdc}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-white/5">
                      <span className="text-white/50">{t.dashboard.totalEarned}</span>
                      <span className="font-bold text-neon-green">{stats.total_earnings_usdc?.toFixed(2)} {t.usdc}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-white/5">
                      <span className="text-white/50">{t.profile.gamesWon}</span>
                      <span className="font-bold">{stats.total_games_won} / {stats.total_games_played}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-white/50">{t.profile.avgStake}</span>
                      <span className="font-bold">
                        {stats.total_games_played > 0 ? `${(stats.total_wagered_usdc / stats.total_games_played).toFixed(2)}` : '0.00'} {t.usdc}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="card text-center py-8 text-white/30">No stats yet</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
