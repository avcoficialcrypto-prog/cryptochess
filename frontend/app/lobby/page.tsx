// ============================================================
// CryptoChess - Lobby Page
// Quick Match & Challenge Friend with REAL Solana Pay
// No fake balances — pay on-chain after match found
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
import { QRCodeSVG } from 'qrcode.react';
import {
  Zap, Users, Copy, Check, Clock, ArrowLeft,
  Swords, Link2, Loader2, AlertCircle, ShieldCheck,
  ExternalLink, Wallet,
} from 'lucide-react';

const STAKE_OPTIONS = [1, 5, 10, 50, 100];
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PLATFORM_WALLET = process.env.NEXT_PUBLIC_PLATFORM_WALLET || '';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Generate a Solana Pay URL for USDC payment
 */
function getSolanaPayUrl(recipient: string, amount: number, memo: string): string {
  const params = new URLSearchParams({
    amount: amount.toString(),
    splToken: USDC_MINT,
    memo,
    label: 'CryptoChess - Game Stake',
    message: `Pay ${amount} USDC to play chess`,
  });
  return `solana:${recipient}?${params.toString()}`;
}

export default function LobbyPage() {
  const { player, walletAddress } = useAuth();
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

  // Payment phase — after match found, both players must pay real USDC
  const [paymentPhase, setPaymentPhase] = useState<{
    gameId: string;
    color: string;
    stake: number;
    opponent: string;
    timeLeft: number;
  } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<
    'idle' | 'monitoring' | 'paid' | 'waiting_rival' | 'rival_left' | 'rematching' | 'refund_available' | 'error'
  >('idle');
  const [paymentError, setPaymentError] = useState('');
  const [paymentSignature, setPaymentSignature] = useState('');

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

  // Auto-navigate when game starts
  useEffect(() => {
    if (paymentStatus === 'paid' && paymentPhase) {
      router.push(`/play/${paymentPhase.gameId}?color=${paymentPhase.color}&stake=${paymentPhase.stake}`);
    }
  }, [paymentStatus, paymentPhase, router]);

  // ---- reCAPTCHA v2 ----
  const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || '';

  useEffect(() => {
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
              fetch(BACKEND_URL + '/api/turnstile/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
              })
                .then(r => r.json())
                .then(data => { setCaptchaVerified(data.success); if (!data.success) setCaptchaError('Verification failed.'); })
                .catch(() => { setCaptchaError('Verification error.'); setCaptchaVerified(false); })
                .finally(() => setCaptchaLoading(false));
            },
            'expired-callback': () => { setCaptchaToken(null); setCaptchaVerified(false); },
            'error-callback': () => { setCaptchaError('Captcha error.'); setCaptchaVerified(false); },
            theme: 'dark',
            size: 'normal',
          });
          setCaptchaReady(true);
        } catch (err) { console.error('reCAPTCHA render error:', err); }
      }
    }, 200);
    return () => clearInterval(checkReady);
  }, [RECAPTCHA_SITE_KEY, captchaReady]);

  // ---- Quick Match ----
  const joinMatchmaking = useCallback(async () => {
    if (!walletAddress) return;
    setWaiting(true);
    setWaitingStake(selectedStake);
    setPaymentPhase(null);
    setPaymentStatus('idle');

    try {
      const socket = getSocket(walletAddress);

      // Clean old listeners
      ['payment:required', 'payment:status', 'payment:waiting', 'payment:monitoring',
       'payment:opponent_left', 'payment:error', 'matchmaking:waiting', 'matchmaking:error'
      ].forEach(evt => socket.off(evt));

      // Match found — both players must pay real USDC on-chain
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

      // Backend confirmed payment detected on-chain
      socket.on('payment:status', (data) => {
        if (data.bothPaid) {
          setPaymentStatus('paid');
        } else {
          setPaymentStatus('waiting_rival');
          if (data.signature) setPaymentSignature(data.signature);
        }
      });

      socket.on('payment:monitoring', () => {
        setPaymentStatus('monitoring');
      });

      socket.on('payment:waiting', () => {
        setPaymentStatus('waiting_rival');
      });

      socket.on('payment:opponent_left', (data) => {
        setPaymentStatus('rematching');
      });

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
  }, [walletAddress, selectedStake, router]);

  // ---- Pay for matched game ----
  const handlePay = useCallback(() => {
    if (!walletAddress || !paymentPhase) return;
    setPaymentStatus('monitoring');
    setPaymentError('');
    const socket = getSocket(walletAddress);
    socket.emit('game:pay', { gameId: paymentPhase.gameId });
  }, [walletAddress, paymentPhase]);

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
        router.push(`/play/${data.gameId}?color=${data.color}&stake=${data.stake}`);
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

  if (!walletAddress || !player) {
    return (
      <div className="min-h-screen bg-gradient-dark flex items-center justify-center">
        <div className="text-center">
          <img src="/logo.png" alt="CryptoChess" className="w-12 h-12 mx-auto mb-4 animate-pulse" />
          <p className="text-white/50">Loading...</p>
        </div>
      </div>
    );
  }

  // ---- PAYMENT PHASE — Real Solana Pay QR ----
  if (paymentPhase) {
    const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
    const urgency = paymentPhase.timeLeft <= 15;

    const recipient = PLATFORM_WALLET || paymentPhase.opponent;
    const memo = `CRYPTOCHESS-${paymentPhase.gameId.slice(0, 16)}-${walletAddress.slice(0, 8)}`;

    // If no platform wallet configured, show warning
    if (!PLATFORM_WALLET) {
      console.warn('[LOBBY] PLATFORM_WALLET not set — QR will use opponent address (no escrow!)');
    }
    const solanaPayUrl = getSolanaPayUrl(recipient, paymentPhase.stake, memo);

    return (
      <div className="min-h-screen bg-gradient-dark flex items-center justify-center px-4">
        <div className="max-w-lg w-full">
          <div className="text-center mb-6">
            <img src="/logo.png" alt="CryptoChess" className="w-14 h-14 mx-auto rounded-xl mb-4" />
            <h1 className="text-2xl font-bold mb-2">⚡ {t.payment.title}</h1>
            <p className="text-white/40 text-sm">Pay {paymentPhase.stake} USDC via Solana Pay to start the game</p>
          </div>

          {/* Timer */}
          <div className={`card mb-4 text-center ${urgency ? 'border-neon-red/30' : 'border-gold-400/10'}`}>
            <div className={`text-5xl font-mono font-bold mb-2 ${urgency ? 'text-neon-red animate-pulse' : 'text-gold-400'}`}>
              {fmt(paymentPhase.timeLeft)}
            </div>
            <p className="text-sm text-white/40">{t.payment.timeRemaining}</p>
            <div className="w-full h-1.5 bg-dark-700 rounded-full mt-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${urgency ? 'bg-neon-red' : 'bg-gold-400'}`}
                style={{ width: `${(paymentPhase.timeLeft / 60) * 100}%` }}
              />
            </div>
          </div>

          {/* Stake Info */}
          <div className="card mb-4">
            <div className="flex items-center justify-between">
              <span className="text-white/50">Stake</span>
              <span className="text-gold-400 font-bold text-lg">{paymentPhase.stake} USDC</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-white/50">vs</span>
              <span className="text-white/70 font-mono text-sm">
                {paymentPhase.opponent ? paymentPhase.opponent.slice(0, 6) + '...' + paymentPhase.opponent.slice(-4) : '...'}
              </span>
            </div>
          </div>

          {/* STATUS: IDLE — Show QR Code + Pay Button */}
          {paymentStatus === 'idle' && (
            <div className="space-y-4">
              {/* Real Solana Pay QR Code */}
              <div className="card text-center">
                <p className="text-sm text-white/50 mb-3">Scan with Phantom or any Solana wallet</p>
                <div className="bg-white rounded-xl p-4 inline-block mx-auto mb-3">
                  <QRCodeSVG
                    value={solanaPayUrl}
                    size={200}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                </div>
                <p className="text-xs text-white/30 mb-2">or tap to open in Phantom</p>
                <a
                  href={`https://phantom.app/ul/browse/${encodeURIComponent(solanaPayUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-neon-blue text-sm hover:underline"
                >
                  Open in Phantom <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Amount to send */}
              <div className="bg-dark-700 rounded-xl p-3 flex items-center justify-between">
                <span className="text-white/40 text-sm">Send exactly:</span>
                <span className="text-gold-400 font-bold">{paymentPhase.stake} USDC</span>
              </div>

              {/* Recipient address */}
              <div className="bg-dark-700 rounded-xl p-3">
                <span className="text-white/40 text-xs block mb-1">To wallet:</span>
                <code className="text-xs text-white/60 font-mono break-all">{recipient}</code>
              </div>

              {/* I've sent it button */}
              <button onClick={handlePay} className="btn-neon w-full text-lg py-4">
                ✓ I&apos;ve sent {paymentPhase.stake} USDC — Detect Payment
              </button>
            </div>
          )}

          {/* STATUS: Monitoring blockchain */}
          {paymentStatus === 'monitoring' && (
            <div className="card text-center">
              <Loader2 className="w-10 h-10 text-gold-400 mx-auto animate-spin mb-3" />
              <p className="text-white/50 mb-2">🔍 Monitoring Solana blockchain...</p>
              <p className="text-xs text-white/30">Checking for your {paymentPhase.stake} USDC payment</p>
              <p className="text-xs text-white/20 mt-2">This usually takes 5-30 seconds</p>
              {paymentSignature && (
                <a href={`https://solscan.io/tx/${paymentSignature}`} target="_blank" rel="noopener noreferrer" className="text-xs text-neon-blue mt-3 inline-flex items-center gap-1">
                  View on Solscan <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {/* STATUS: Waiting for rival */}
          {paymentStatus === 'waiting_rival' && (
            <div className="card text-center">
              <div className="badge-green mb-3">✓ Payment detected on-chain!</div>
              <Loader2 className="w-6 h-6 text-gold-400 mx-auto animate-spin mb-2" />
              <p className="text-white/50">Waiting for opponent&apos;s payment...</p>
              <p className="text-xs text-white/30 mt-1">Game starts once both players pay</p>
            </div>
          )}

          {/* STATUS: Rival left */}
          {paymentStatus === 'rematching' && (
            <div className="card text-center">
              <div className="badge-yellow mb-3">⚠ Opponent didn&apos;t pay</div>
              <Loader2 className="w-6 h-6 text-neon-blue mx-auto animate-spin mb-2" />
              <p className="text-white/50">Searching for a new opponent...</p>
            </div>
          )}

          {/* STATUS: Error */}
          {paymentStatus === 'error' && (
            <div className="card text-center border-neon-red/20">
              <AlertCircle className="w-8 h-8 text-neon-red mx-auto mb-2" />
              <p className="text-neon-red text-sm">{paymentError}</p>
              <button onClick={handlePay} className="btn-primary mt-4">Try Again</button>
            </div>
          )}

          <HypePhrases className="justify-center mt-6" />
        </div>
      </div>
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
            <p className="text-white/40">Select your stake — pay after match found</p>
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
                <h3 className="text-sm font-medium text-white/50 mb-4">Select Stake (USDC)</h3>
                <div className="grid grid-cols-5 gap-3">
                  {STAKE_OPTIONS.map((amount) => (
                    <button key={amount} onClick={() => setSelectedStake(amount)} className={`stake-btn ${selectedStake === amount ? 'active' : ''}`}>
                      <div className="text-lg font-bold">{amount}</div>
                      <div className="text-xs text-white/40">USDC</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="card mb-4">
                <h3 className="text-sm font-medium text-white/50 mb-3">Players Waiting</h3>
                <div className="grid grid-cols-5 gap-3">
                  {STAKE_OPTIONS.map((amount) => (
                    <div key={amount} className="text-center">
                      <div className="text-lg font-bold text-white/70">{queueStatus[amount] || 0}</div>
                      <div className="text-xs text-white/30">{amount} USDC</div>
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
              {/* reCAPTCHA */}
              {!captchaVerified && (
                <div className="card mb-4 text-center">
                  <div className="flex items-center justify-center gap-2 text-sm text-white/50 mb-3">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verify you are human</span>
                  </div>
                  <div className="flex justify-center mb-3">
                    <div ref={recaptchaRef} id="recaptcha-container" />
                    {!captchaReady && <div className="text-xs text-white/30">Loading verification...</div>}
                  </div>
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
              <button onClick={joinMatchmaking} disabled={!captchaVerified} className="btn-neon w-full text-center text-lg py-4">
                <Swords className="w-5 h-5 inline mr-2" />Find Match — {selectedStake} USDC
              </button>
              <p className="text-xs text-white/20 text-center mt-3">You&apos;ll pay {selectedStake} USDC via Solana Pay after matching</p>
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
                Stake: <span className="text-gold-400 font-bold">{customStake || selectedStake} USDC</span>
              </div>
              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-white/30">
                <Clock className="w-4 h-4" />Waiting for opponent...
              </div>
            </div>
          ) : (
            <>
              <div className="card mb-4">
                <h3 className="text-sm font-medium text-white/50 mb-4">Set Stake (USDC)</h3>
                <div className="grid grid-cols-5 gap-3 mb-4">
                  {STAKE_OPTIONS.map((amount) => (
                    <button key={amount} onClick={() => { setSelectedStake(amount); setCustomStake(''); }} className={`stake-btn ${selectedStake === amount && !customStake ? 'active' : ''}`}>
                      <div className="text-lg font-bold">{amount}</div>
                      <div className="text-xs text-white/40">USDC</div>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-sm">or custom:</span>
                  <input type="number" value={customStake} onChange={(e) => setCustomStake(e.target.value)} placeholder="Amount" className="input-dark flex-1 text-sm" min="0.01" step="0.01" />
                  <span className="text-white/40 text-sm">USDC</span>
                </div>
              </div>
              {challengeError && (
                <div className="mb-4 text-neon-red text-sm bg-neon-red/10 rounded-xl px-4 py-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />{challengeError}
                </div>
              )}
              <button onClick={createChallenge} disabled={challengeLoading} className="btn-primary w-full text-center mb-6 py-4 text-lg">
                {challengeLoading ? <Loader2 className="w-5 h-5 inline animate-spin" /> : <><Link2 className="w-5 h-5 inline mr-2" /> Create Challenge</>}
              </button>
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1 h-px bg-white/10" /><span className="text-xs text-white/30">or</span><div className="flex-1 h-px bg-white/10" />
              </div>
              <div className="card">
                <h3 className="text-sm font-medium text-white/50 mb-4">Join Friend&apos;s Game</h3>
                <div className="flex gap-2">
                  <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Enter code" className="input-dark flex-1 text-center font-mono text-lg tracking-widest uppercase" maxLength={6} />
                  <button onClick={joinChallenge} disabled={challengeLoading || !joinCode.trim()} className="btn-neon">Join</button>
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
