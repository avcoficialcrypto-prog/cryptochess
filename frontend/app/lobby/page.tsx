// ============================================================
// CryptoChess - Lobby Page (No Wallet Required)
// Quick Match & Challenge Friend
// ============================================================

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { getSocket, disconnectSocket } from '@/lib/socket';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import HypePhrases from '@/components/HypePhrases';
import PaymentLockScreen from '@/components/PaymentLockScreen';
import {
  Zap, Users, Copy, Check, Clock, ArrowLeft,
  Swords, Link2, Loader2, AlertCircle, ShieldCheck,
} from 'lucide-react';

const STAKE_OPTIONS = [1, 5, 10, 50, 100];
const PLATFORM_WALLET = process.env.NEXT_PUBLIC_PLATFORM_WALLET || '';

export default function LobbyPage() {
  const { player, walletAddress, refreshBalance } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<'select' | 'quick' | 'challenge'>(
    (searchParams.get('mode') as any) || 'select'
  );
  const [selectedStake, setSelectedStake] = useState<number>(1);
  const [customStake, setCustomStake] = useState<string>('');
  const [waiting, setWaiting] = useState(false);
  const [waitingStake, setWaitingStake] = useState(0);

  const [inviteCode, setInviteCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeError, setChallengeError] = useState('');

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [captchaReady, setCaptchaReady] = useState(false);
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const recaptchaWidgetId = useRef<number | null>(null);
  const [queueStatus, setQueueStatus] = useState<Record<number, number>>({});

  const [pendingGame, setPendingGame] = useState<{
    gameId: string;
    color: string;
    stake: number;
  } | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try { const s = await api.getMatchmakingStatus(); setQueueStatus(s); } catch {}
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => () => { disconnectSocket(); }, []);

  // ---- reCAPTCHA v2 Verification ----
  const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || '';

  useEffect(() => {
    // Wait for Google reCAPTCHA script to load, then render the widget
    const checkReady = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).grecaptcha && recaptchaRef.current && !captchaReady) {
        clearInterval(checkReady);
        try {
          recaptchaWidgetId.current = (window as any).grecaptcha.render(recaptchaRef.current, {
            sitekey: RECAPTCHA_SITE_KEY || '6Let3aAtAAAAAFZPNhSUYSBsdXAKuD9LSbcgvSUa',
            callback: (token: string) => {
              setCaptchaToken(token);
              setCaptchaLoading(true);
              setCaptchaError(null);
              // Verify with backend
              const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
              fetch(backendUrl + '/api/turnstile/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
              })
                .then(r => r.json())
                .then(data => {
                  if (data.success) {
                    setCaptchaVerified(true);
                  } else {
                    setCaptchaError('Verification failed. Please try again.');
                    setCaptchaVerified(false);
                  }
                })
                .catch(() => {
                  setCaptchaError('Verification error. Please try again.');
                  setCaptchaVerified(false);
                })
                .finally(() => setCaptchaLoading(false));
            },
            'expired-callback': () => {
              setCaptchaToken(null);
              setCaptchaVerified(false);
            },
            'error-callback': () => {
              setCaptchaError('Captcha error. Please reload.');
              setCaptchaVerified(false);
            },
            theme: 'dark',
            size: 'normal',
          });
          setCaptchaReady(true);
        } catch (err) {
          console.error('reCAPTCHA render error:', err);
        }
      }
    }, 200);
    return () => clearInterval(checkReady);
  }, [RECAPTCHA_SITE_KEY, captchaReady]);

  const resetCaptcha = () => {
    if (typeof window !== 'undefined' && (window as any).grecaptcha && recaptchaWidgetId.current !== null) {
      (window as any).grecaptcha.reset(recaptchaWidgetId.current);
      setCaptchaToken(null);
      setCaptchaVerified(false);
    }
  };

  // ---- Quick Match ----
  const joinMatchmaking = useCallback(async () => {
    if (!walletAddress) return;
    setWaiting(true);
    setWaitingStake(selectedStake);

    try {
      const socket = getSocket(walletAddress);

      socket.on('game:matched', (data) => {
        setPendingGame({ gameId: data.gameId, color: data.color, stake: data.stake });
      });
      socket.on('matchmaking:waiting', () => {});
      socket.on('matchmaking:error', (data) => { setWaiting(false); setChallengeError(data.error); });

      socket.emit('matchmaking:join', { stakeAmount: selectedStake });
    } catch (err: any) {
      setWaiting(false);
      setChallengeError(err.message);
    }
  }, [walletAddress, selectedStake, router]);

  const leaveMatchmaking = useCallback(() => {
    if (walletAddress) {
      getSocket(walletAddress).emit('matchmaking:leave', { stakeAmount: waitingStake });
    }
    setWaiting(false);
  }, [walletAddress, waitingStake]);

  // ---- Challenge ----
  const createChallenge = async () => {
    if (!walletAddress) return;
    setChallengeLoading(true);
    setChallengeError('');
    try {
      const stake = customStake ? parseFloat(customStake) : selectedStake;
      if (!stake || stake <= 0) throw new Error('Invalid stake amount');
      const result = await api.createChallenge(selectedStake, customStake ? parseFloat(customStake) : undefined);
      setInviteCode(result.inviteCode);
    } catch (err: any) { setChallengeError(err.message); }
    finally { setChallengeLoading(false); }
  };

  const joinChallenge = async () => {
    if (!joinCode.trim() || !walletAddress) return;
    setChallengeLoading(true);
    setChallengeError('');
    try {
      const socket = getSocket(walletAddress);
      socket.on('game:started', (data) => {
        setPendingGame({ gameId: data.gameId, color: data.color, stake: data.stake });
      });
      socket.on('challenge:error', (data) => { setChallengeError(data.error); setChallengeLoading(false); });
      socket.emit('challenge:join', { inviteCode: joinCode.trim().toUpperCase() });
    } catch (err: any) { setChallengeError(err.message); setChallengeLoading(false); }
  };

  const copyInviteLink = async () => {
    const url = `${window.location.origin}/play/${inviteCode}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ---- Payment callbacks ----
  const handlePaymentConfirmed = useCallback(() => {
    if (!pendingGame) return;
    router.push(`/play/${pendingGame.gameId}?color=${pendingGame.color}&stake=${pendingGame.stake}`);
  }, [pendingGame, router]);

  const handlePaymentExpired = useCallback(() => {
    setPendingGame(null);
    setWaiting(false);
    if (walletAddress && waitingStake) {
      getSocket(walletAddress).emit('matchmaking:leave', { stakeAmount: waitingStake });
    }
  }, [walletAddress, waitingStake]);

  if (!walletAddress || !player) return null;

  // If matched but no platform wallet configured, go straight to game
  if (pendingGame && !PLATFORM_WALLET) {
    router.push(`/play/${pendingGame.gameId}?color=${pendingGame.color}&stake=${pendingGame.stake}`);
    return null;
  }

  // Payment Lock Screen overlay (only when platform wallet is set)
  if (pendingGame && PLATFORM_WALLET) {
    return (
      <PaymentLockScreen
        amount={pendingGame.stake}
        recipientAddress={PLATFORM_WALLET}
        gameId={pendingGame.gameId}
        onPaymentConfirmed={handlePaymentConfirmed}
        onExpired={handlePaymentExpired}
      />
    );
  }

  // ---- SELECT MODE ----
  if (mode === 'select') {
    return (
      <div className="min-h-screen bg-gradient-dark flex items-center justify-center px-4">
        <div className="max-w-lg w-full">
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => router.push('/')} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" /><span className="text-sm">{t.back}</span>
            </button>
            <LanguageSwitcher />
          </div>
          <div className="text-center mb-8">
            <img src="/logo.png" alt="CryptoChess" className="w-14 h-14 mx-auto rounded-xl mb-4" />
            <h1 className="text-3xl font-bold mb-2">{t.lobby.chooseMode}</h1>
            <p className="text-white/40">{t.lobby.selectHow}</p>
          </div>
          <HypePhrases className="justify-center mb-6" showRefresh />
          <div className="space-y-4">
            <button onClick={() => setMode('quick')} className="card-glow w-full text-left hover:border-gold-400/30 transition-all group p-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-gold-400/10 flex items-center justify-center flex-shrink-0 group-hover:bg-gold-400/20 transition-colors">
                  <Zap className="w-8 h-8 text-gold-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-1">{t.lobby.quickMatch}</h3>
                  <p className="text-sm text-white/40">{t.lobby.quickMatchDesc}</p>
                </div>
              </div>
            </button>
            <button onClick={() => setMode('challenge')} className="card-glow w-full text-left hover:border-neon-blue/30 transition-all group p-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-neon-blue/10 flex items-center justify-center flex-shrink-0 group-hover:bg-neon-blue/20 transition-colors">
                  <Users className="w-8 h-8 text-neon-blue" />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-1">{t.lobby.challengeFriend}</h3>
                  <p className="text-sm text-white/40">{t.lobby.challengeFriendDesc}</p>
                </div>
              </div>
            </button>
          </div>
          <div className="mt-6 text-center text-sm text-white/30">
            {t.dashboard.balance} <span className="text-gold-400 font-bold">{player.balance_usdc?.toFixed(2)} {t.usdc}</span>
          </div>
        </div>
      </div>
    );
  }

  // ---- QUICK MATCH ----
  if (mode === 'quick') {
    return (
      <div className="min-h-screen bg-gradient-dark flex items-center justify-center px-4">
        <div className="max-w-lg w-full">
          <button onClick={() => waiting ? leaveMatchmaking() : setMode('select')} className="flex items-center gap-2 text-white/40 hover:text-white mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /><span className="text-sm">{waiting ? t.cancel : t.back}</span>
          </button>
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gold-400/10 flex items-center justify-center mx-auto mb-4">
              <Zap className="w-8 h-8 text-gold-400" />
            </div>
            <h1 className="text-3xl font-bold mb-2">{t.lobby.quickMatch}</h1>
            <p className="text-white/40">{t.lobby.selectStake}</p>
          </div>
          {waiting ? (
            <div className="card text-center">
              <div className="animate-pulse mb-4"><Loader2 className="w-12 h-12 text-gold-400 mx-auto animate-spin" /></div>
              <h2 className="text-xl font-bold mb-2">{t.lobby.searching}</h2>
              <p className="text-white/40 mb-4">{t.lobby.stake} <span className="text-gold-400 font-bold">{waitingStake} {t.usdc}</span></p>
              <div className="flex items-center justify-center gap-2 text-sm text-white/30">
                <div className="pulse-dot" /><span>{t.lobby.waitingForPlayer}</span><div className="pulse-dot" />
              </div>
              <div className="mt-6"><HypePhrases interval={6000} /></div>
              <button onClick={leaveMatchmaking} className="btn-danger mt-6">{t.cancel}</button>
            </div>
          ) : (
            <>
              <div className="card mb-4">
                <h3 className="text-sm font-medium text-white/50 mb-4">{t.lobby.selectStake}</h3>
                <div className="grid grid-cols-5 gap-3">
                  {STAKE_OPTIONS.map((amount) => (
                    <button key={amount} onClick={() => setSelectedStake(amount)} className={`stake-btn ${selectedStake === amount ? 'active' : ''} ${player.balance_usdc >= amount ? 'border-gold-400/20' : 'border-white/5'}`}>
                      <div className="text-lg font-bold">{amount}</div>
                      <div className="text-xs text-white/40">{t.usdc}</div>
                      {player.balance_usdc < amount && <div className="text-xs text-white/20 mt-1">↓</div>}
                    </button>
                  ))}
                </div>
              </div>
              <div className="card mb-4">
                <h3 className="text-sm font-medium text-white/50 mb-3">{t.lobby.playersWaiting}</h3>
                <div className="grid grid-cols-5 gap-3">
                  {STAKE_OPTIONS.map((amount) => (
                    <div key={amount} className="text-center">
                      <div className="text-lg font-bold text-white/70">{queueStatus[amount] || 0}</div>
                      <div className="text-xs text-white/30">{amount} {t.usdc}</div>
                    </div>
                  ))}
                </div>
              </div>
              <HypePhrases className="justify-center mb-4" />
              {challengeError && (
                <div className="mb-4 text-neon-red text-sm bg-neon-red/10 rounded-xl px-4 py-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{challengeError}
                </div>
              )}
              {/* reCAPTCHA v2 Widget */}
              {!captchaVerified && (
                <div className="card mb-4 text-center">
                  <div className="flex items-center justify-center gap-2 text-sm text-white/50 mb-3">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verify you are human</span>
                  </div>
                  <div className="flex justify-center mb-3">
                    <div ref={recaptchaRef} id="recaptcha-container" />
                    {!captchaReady && (
                      <div className="text-xs text-white/30">Loading verification...</div>
                    )}
                  </div>
                  <div className="text-xs text-white/30">Complete the verification to start matchmaking</div>
                  {captchaError && (
                    <div className="mt-2 text-neon-red text-xs flex items-center justify-center gap-1">
                      <AlertCircle className="w-3 h-3" />{captchaError}
                    </div>
                  )}
                  {captchaLoading && <div className="mt-2 text-white/50 text-xs">Verifying...</div>}
                </div>
              )}
              {captchaVerified && (
                <div className="mb-3 text-center">
                  <span className="badge-green text-xs flex items-center justify-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Human Verified ✓
                  </span>
                </div>
              )}
              {player.balance_usdc < selectedStake ? (
                <div className="space-y-3">
                  <div className="bg-gold-400/5 border border-gold-400/10 rounded-xl p-4 text-center">
                    <p className="text-sm text-white/50 mb-1">{t.lobby.lowBalance}</p>
                    <p className="text-xs text-white/30">{t.lobby.depositToPlay}</p>
                  </div>
                  <button onClick={() => router.push('/')} className="btn-primary w-full text-center text-lg py-4">
                    💰 {t.lobby.deposit} {selectedStake - Math.floor(player.balance_usdc)} {t.usdc}
                  </button>
                </div>
              ) : (
                <button onClick={joinMatchmaking} disabled={!captchaVerified} className="btn-neon w-full text-center text-lg py-4">
                  <Swords className="w-5 h-5 inline mr-2" />{t.lobby.findMatch} — {selectedStake} {t.usdc}
                </button>
              )}
              <p className="text-xs text-white/20 text-center mt-3">{t.payment.toConfirm}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---- CHALLENGE FRIEND ----
  if (mode === 'challenge') {
    return (
      <div className="min-h-screen bg-gradient-dark flex items-center justify-center px-4">
        <div className="max-w-lg w-full">
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => { setInviteCode(''); setMode('select'); }} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" /><span className="text-sm">{t.back}</span>
            </button>
            <LanguageSwitcher />
          </div>
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-neon-blue/10 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-neon-blue" />
            </div>
            <h1 className="text-3xl font-bold mb-2">{t.lobby.challengeFriend}</h1>
            <p className="text-white/40">{t.lobby.challengeFriendDesc}</p>
          </div>
          <HypePhrases className="justify-center mb-6" />
          {inviteCode ? (
            <div className="card text-center">
              <div className="badge-green mb-4">{t.lobby.challengeCreated}</div>
              <h2 className="text-xl font-bold mb-4">{t.lobby.shareCode}</h2>
              <div className="bg-dark-700 rounded-xl p-4 mb-4">
                <div className="text-3xl font-mono font-bold tracking-widest text-gold-400">{inviteCode}</div>
              </div>
              <button onClick={copyInviteLink} className="btn-primary w-full mb-4 flex items-center justify-center gap-2">
                {copied ? <><Check className="w-4 h-4" /> {t.lobby.copied}</> : <><Copy className="w-4 h-4" /> {t.lobby.copyLink}</>}
              </button>
              <div className="text-sm text-white/30">
                <Link2 className="w-4 h-4 inline mr-1" />
                {typeof window !== 'undefined' && `${window.location.origin}/play/${inviteCode}`}
              </div>
              <div className="mt-4 text-sm text-white/40">
                {t.lobby.stake} <span className="text-gold-400 font-bold">{customStake || selectedStake} {t.usdc}</span>
              </div>
              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-white/30">
                <Clock className="w-4 h-4" />{t.lobby.waitingForOpponent}
              </div>
            </div>
          ) : (
            <>
              <div className="card mb-4">
                <h3 className="text-sm font-medium text-white/50 mb-4">{t.lobby.setStake}</h3>
                <div className="grid grid-cols-5 gap-3 mb-4">
                  {STAKE_OPTIONS.map((amount) => (
                    <button key={amount} onClick={() => { setSelectedStake(amount); setCustomStake(''); }} className={`stake-btn ${selectedStake === amount && !customStake ? 'active' : ''}`}>
                      <div className="text-lg font-bold">{amount}</div>
                      <div className="text-xs text-white/40">{t.usdc}</div>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-sm">{t.lobby.orCustom}</span>
                  <input type="number" value={customStake} onChange={(e) => setCustomStake(e.target.value)} placeholder="Amount" className="input-dark flex-1 text-sm" min="0.01" step="0.01" />
                  <span className="text-white/40 text-sm">{t.usdc}</span>
                </div>
              </div>
              {challengeError && (
                <div className="mb-4 text-neon-red text-sm bg-neon-red/10 rounded-xl px-4 py-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{challengeError}
                </div>
              )}
              <button onClick={createChallenge} disabled={challengeLoading || player.balance_usdc < (customStake ? parseFloat(customStake) : selectedStake)} className="btn-primary w-full text-center mb-6 py-4 text-lg">
                {challengeLoading ? <Loader2 className="w-5 h-5 inline animate-spin" /> : <><Link2 className="w-5 h-5 inline mr-2" /> {t.lobby.createChallenge}</>}
              </button>
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1 h-px bg-white/10" /><span className="text-xs text-white/30">{t.or}</span><div className="flex-1 h-px bg-white/10" />
              </div>
              <div className="card">
                <h3 className="text-sm font-medium text-white/50 mb-4">{t.lobby.joinFriendGame}</h3>
                <div className="flex gap-2">
                  <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder={t.lobby.enterCode} className="input-dark flex-1 text-center font-mono text-lg tracking-widest uppercase" maxLength={6} />
                  <button onClick={joinChallenge} disabled={challengeLoading || !joinCode.trim()} className="btn-neon">{t.lobby.join}</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}
