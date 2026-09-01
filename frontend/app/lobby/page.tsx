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
  Swords, Link2, Loader2, AlertCircle, ShieldCheck, DollarSign,
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

  // Payment phase state
  const [paymentPhase, setPaymentPhase] = useState<{
    gameId: string;
    color: string;
    stake: number;
    opponent: string;
    timeLeft: number;
  } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'paying' | 'paid' | 'waiting_rival' | 'rival_left' | 'rematching' | 'refund_available' | 'error'>('idle');
  const [paymentError, setPaymentError] = useState('');
  const [refundEligibleAt, setRefundEligibleAt] = useState<number | null>(null);
  const [refundCountdown, setRefundCountdown] = useState(0);

  // Deposit state
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositing, setDepositing] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try { const s = await api.getMatchmakingStatus(); setQueueStatus(s); } catch {}
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => () => { disconnectSocket(); }, []);

  // Payment countdown timer
  useEffect(() => {
    if (!paymentPhase || paymentStatus === 'paid' || paymentStatus === 'idle') return;
    const timer = setInterval(() => {
      setPaymentPhase(prev => {
        if (!prev || prev.timeLeft <= 1) {
          clearInterval(timer);
          return prev;
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [paymentPhase?.gameId, paymentStatus]);

  // Refund countdown timer
  useEffect(() => {
    if (!refundEligibleAt || paymentStatus !== 'refund_available') return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((refundEligibleAt - Date.now()) / 1000));
      setRefundCountdown(remaining);
      if (remaining <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [refundEligibleAt, paymentStatus]);

  // Auto-navigate when game starts (both paid)
  useEffect(() => {
    if (paymentStatus === 'paid' && paymentPhase) {
      router.push(`/play/${paymentPhase.gameId}?color=${paymentPhase.color}&stake=${paymentPhase.stake}`);
    }
  }, [paymentStatus, paymentPhase, router]);

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
    setPaymentPhase(null);
    setPaymentStatus('idle');

    try {
      const socket = getSocket(walletAddress);

      // Remove old listeners
      socket.off('payment:required');
      socket.off('payment:status');
      socket.off('payment:waiting');
      socket.off('payment:opponent_left');
      socket.off('payment:waiting_refund');
      socket.off('payment:refunded');
      socket.off('payment:error');
      socket.off('matchmaking:waiting');
      socket.off('matchmaking:error');

      // Payment required after match
      socket.on('payment:required', (data) => {
        setWaiting(false);
        setPaymentPhase({
          gameId: data.gameId,
          color: data.color,
          stake: data.stake,
          opponent: data.opponent?.wallet || '',
          timeLeft: Math.floor(data.timeLimitMs / 1000),
        });
        setPaymentStatus('idle');
      });

      // Other player confirmed payment
      socket.on('payment:status', (data) => {
        if (data.bothPaid) {
          // Both paid — game starts, navigate to game page
          if (paymentPhase) {
            router.push(`/play/${paymentPhase.gameId}?color=${paymentPhase.color}&stake=${paymentPhase.stake}`);
          }
        } else {
          setPaymentStatus('waiting_rival');
        }
      });

      // Waiting for rival confirmation
      socket.on('payment:waiting', () => {
        setPaymentStatus('waiting_rival');
      });

      // Opponent left without paying
      socket.on('payment:opponent_left', (data) => {
        setPaymentStatus('rematching');
        // Update payment phase with new game if re-matched
        if (data.gameId) {
          setPaymentPhase({
            gameId: data.gameId,
            color: 'white',
            stake: data.stakeAmount,
            opponent: '',
            timeLeft: 60,
          });
        }
      });

      // Made eligible for refund after rematch timeout
      socket.on('payment:waiting_refund', (data) => {
        setPaymentStatus('refund_available');
        setRefundEligibleAt(data.refundEligibleAt);
        if (data.gameId) {
          setPaymentPhase(prev => prev ? { ...prev, gameId: data.gameId } : null);
        }
      });

      // Refund confirmed
      socket.on('payment:refunded', (data) => {
        setPaymentStatus('idle');
        setPaymentPhase(null);
        setRefundEligibleAt(null);
        refreshBalance();
      });

      // Payment error
      socket.on('payment:error', (data) => {
        setPaymentStatus('error');
        setPaymentError(data.error);
      });

      socket.on('matchmaking:waiting', () => {});
      socket.on('matchmaking:error', (data) => { setWaiting(false); setChallengeError(data.error); });

      socket.emit('matchmaking:join', { stakeAmount: selectedStake });
    } catch (err: any) {
      setWaiting(false);
      setChallengeError(err.message);
    }
  }, [walletAddress, selectedStake, router, paymentPhase, refreshBalance]);

  // ---- Pay for matched game ----
  const handlePay = useCallback(() => {
    if (!walletAddress || !paymentPhase) return;
    setPaymentStatus('paying');
    setPaymentError('');
    const socket = getSocket(walletAddress);
    socket.emit('game:pay', { gameId: paymentPhase.gameId });
  }, [walletAddress, paymentPhase]);

  // ---- Request refund ----
  const handleRefund = useCallback(async () => {
    if (!walletAddress || !paymentPhase) return;
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(backendUrl + '/api/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-wallet-address': walletAddress },
        body: JSON.stringify({ gameId: paymentPhase.gameId }),
      });
      const data = await res.json();
      if (data.success) {
        setPaymentStatus('idle');
        setPaymentPhase(null);
        refreshBalance();
      } else {
        setPaymentError(data.error || 'Refund failed');
      }
    } catch (err: any) {
      setPaymentError('Refund failed');
    }
  }, [walletAddress, paymentPhase, refreshBalance]);

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

  // ---- PAYMENT PHASE UI ----
  if (paymentPhase) {
    const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
    const urgency = paymentPhase.timeLeft <= 15;
    return (
      <div className="min-h-screen bg-gradient-dark flex items-center justify-center px-4">
        <div className="max-w-lg w-full">
          <div className="text-center mb-8">
            <img src="/logo.png" alt="CryptoChess" className="w-14 h-14 mx-auto rounded-xl mb-4" />
            <h1 className="text-2xl font-bold mb-2">{t.payment.title}</h1>
            <p className="text-white/40">{t.payment.subtitle}</p>
          </div>

          {/* Timer */}
          <div className={`card mb-4 text-center ${urgency ? 'border-neon-red/30' : 'border-gold-400/10'}`}>
            <div className={`text-5xl font-mono font-bold mb-2 ${urgency ? 'text-neon-red animate-pulse' : 'text-gold-400'}`}>
              {fmt(paymentPhase.timeLeft)}
            </div>
            <p className="text-sm text-white/40">{t.payment.timeRemaining}</p>
          </div>

          {/* Stake info */}
          <div className="card mb-4">
            <div className="flex items-center justify-between">
              <span className="text-white/50">{t.payment.sendTo}</span>
              <span className="text-gold-400 font-bold text-lg">{paymentPhase.stake} USDC</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-white/50">{t.game.vs}</span>
              <span className="text-white/70 font-mono text-sm">
                {paymentPhase.opponent ? paymentPhase.opponent.slice(0, 6) + '...' + paymentPhase.opponent.slice(-4) : '...'}
              </span>
            </div>
          </div>

          {/* Status: idle — show Pay button */}
          {paymentStatus === 'idle' && (
            <button onClick={handlePay} className="btn-neon w-full text-lg py-4">
              💰 {t.profile.deposit} {paymentPhase.stake} USDC
            </button>
          )}

          {/* Status: paying */}
          {paymentStatus === 'paying' && (
            <div className="card text-center">
              <Loader2 className="w-8 h-8 text-gold-400 mx-auto animate-spin mb-2" />
              <p className="text-white/50">{t.payment.sending}</p>
            </div>
          )}

          {/* Status: paid — waiting for rival */}
          {paymentStatus === 'waiting_rival' && (
            <div className="card text-center">
              <div className="badge-green mb-3">✓ {t.payment.paymentSent}</div>
              <Loader2 className="w-6 h-6 text-gold-400 mx-auto animate-spin mb-2" />
              <p className="text-white/50">{t.lobby.waitingForOpponent}</p>
              <p className="text-xs text-white/30 mt-1">{t.payment.waitingConfirmation}</p>
            </div>
          )}

          {/* Status: rival left — rematching */}
          {paymentStatus === 'rematching' && (
            <div className="card text-center">
              <div className="badge-yellow mb-3">⚠ {t.lobby.opponentLeft}</div>
              <Loader2 className="w-6 h-6 text-neon-blue mx-auto animate-spin mb-2" />
              <p className="text-white/50">{t.lobby.rematching}</p>
            </div>
          )}

          {/* Status: refund available */}
          {paymentStatus === 'refund_available' && (
            <div className="space-y-3">
              <div className="card text-center border-neon-red/20">
                <AlertCircle className="w-8 h-8 text-neon-red mx-auto mb-2" />
                <p className="text-white/50 mb-1">{t.lobby.noMatchFound}</p>
                <p className="text-xs text-white/30">{t.lobby.refundAvailable}</p>
              </div>
              <button onClick={handleRefund} className="btn-danger w-full text-lg py-4">
                ↩ {t.lobby.refund} {paymentPhase.stake} USDC
              </button>
            </div>
          )}

          {/* Error */}
          {paymentStatus === 'error' && (
            <div className="card text-center border-neon-red/20">
              <AlertCircle className="w-8 h-8 text-neon-red mx-auto mb-2" />
              <p className="text-neon-red text-sm">{paymentError}</p>
              <button onClick={handlePay} className="btn-primary mt-4">{t.payment.tryAgain}</button>
            </div>
          )}

          <HypePhrases className="justify-center mt-6" />
        </div>
      </div>
    );
  }

  // ---- INLINE DEPOSIT MODAL ----
  if (showDeposit) {
    return (
      <div className="min-h-screen bg-gradient-dark flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <button onClick={() => { setShowDeposit(false); setDepositSuccess(false); }} className="flex items-center gap-2 text-white/40 hover:text-white mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /><span className="text-sm">{t.back}</span>
          </button>
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-neon-green/10 flex items-center justify-center mx-auto mb-4">
              <DollarSign className="w-8 h-8 text-neon-green" />
            </div>
            <h1 className="text-2xl font-bold mb-2">{t.lobby.deposit} USDC</h1>
            <p className="text-white/40 text-sm">{t.lobby.depositToPlay}</p>
          </div>

          {depositSuccess ? (
            <div className="card text-center">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-neon-green mb-2">{t.payment.matchConfirmed || 'Deposit Successful!'}</h2>
              <p className="text-white/40 text-sm">+{depositAmount} USDC added to your balance</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-white/40 text-center">Select deposit amount:</p>
              {[5, 10, 25, 50, 100].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setDepositAmount(amt)}
                  className={`w-full p-4 rounded-xl border transition-all text-left flex items-center justify-between ${depositAmount === amt ? 'border-neon-green/40 bg-neon-green/10' : 'border-white/10 bg-dark-700 hover:border-white/20'}`}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-2xl">💰</span>
                    <span className="font-bold text-lg">{amt} USDC</span>
                  </span>
                  {depositAmount === amt && <Check className="w-5 h-5 text-neon-green" />}
                </button>
              ))}
              <button
                onClick={async () => {
                  if (depositAmount <= 0) return;
                  setDepositing(true);
                  try {
                    await api.deposit(depositAmount);
                    setDepositSuccess(true);
                    await refreshBalance();
                    setTimeout(() => {
                      setShowDeposit(false);
                      setDepositSuccess(false);
                    }, 2000);
                  } catch (err: any) {
                    console.error('Deposit failed:', err);
                  } finally {
                    setDepositing(false);
                  }
                }}
                disabled={depositing || depositAmount <= 0}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${depositing ? 'bg-dark-700 text-white/30' : 'bg-gradient-to-r from-neon-green to-neon-blue text-white hover:scale-105'}`}
              >
                {depositing ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Processing...</span>
                ) : (
                  `💰 Deposit ${depositAmount} USDC`
                )}
              </button>
            </div>
          )}

          <HypePhrases className="justify-center mt-6" />
        </div>
      </div>
    );
  }

  // Legacy pendingGame flow (for challenges)
  if (pendingGame && !PLATFORM_WALLET) {
    router.push(`/play/${pendingGame.gameId}?color=${pendingGame.color}&stake=${pendingGame.stake}`);
    return null;
  }

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
                  <button
                    onClick={() => { if (!captchaVerified) return; setDepositAmount(selectedStake - Math.floor(player.balance_usdc)); setShowDeposit(true); }}
                    disabled={!captchaVerified}
                    className={`w-full text-center text-lg py-4 rounded-xl font-bold transition-all ${captchaVerified ? 'bg-gradient-to-r from-neon-green to-neon-blue text-white hover:scale-105' : 'bg-dark-700 text-white/30 cursor-not-allowed'}`}
                  >
                    💰 {t.lobby.deposit} {selectedStake - Math.floor(player.balance_usdc)} {t.usdc}
                  </button>
                  {!captchaVerified && <p className="text-xs text-white/30 text-center">Complete captcha to deposit</p>}
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
