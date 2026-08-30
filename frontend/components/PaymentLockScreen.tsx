// ============================================================
// CryptoChess - Payment Lock Screen
// Shows when player needs to pay stake via Solana Pay
// 1-minute countdown timer — expires = back to lobby
// ============================================================

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  isPhantomInstalled,
  connectPhantom,
  getUSDCBalance,
  sendUSDCPayment,
  disconnectPhantom,
} from '@/lib/solana-pay';
import { useI18n } from '@/lib/i18n';
import {
  Wallet,
  Clock,
  CheckCircle,
  AlertTriangle,
  Copy,
  Loader2,
  Shield,
  ArrowLeft,
  ExternalLink,
  QrCode,
} from 'lucide-react';

const PAYMENT_TIMEOUT_SECONDS = 60; // 1 minute

type PaymentStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'sending'
  | 'sent'
  | 'confirming'
  | 'confirmed'
  | 'expired'
  | 'failed';

interface PaymentLockScreenProps {
  amount: number;
  recipientAddress: string;
  gameId: string;
  onPaymentConfirmed: () => void;
  onExpired: () => void;
}

export default function PaymentLockScreen({
  amount,
  recipientAddress,
  gameId,
  onPaymentConfirmed,
  onExpired,
}: PaymentLockScreenProps) {
  const { t } = useI18n();
  const router = useRouter();

  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);
  const [timeLeft, setTimeLeft] = useState(PAYMENT_TIMEOUT_SECONDS);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [txSignature, setTxSignature] = useState('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef(Date.now());

  // ---- Countdown Timer ----
  useEffect(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = PAYMENT_TIMEOUT_SECONDS - elapsed;

      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        setTimeLeft(0);
        setStatus('expired');
        setTimeout(() => onExpired(), 2000);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [onExpired]);

  // ---- Connect Phantom ----
  const handleConnect = useCallback(async () => {
    setStatus('connecting');
    setError('');

    try {
      if (!isPhantomInstalled()) {
        // Open Phantom install page
        window.open('https://phantom.app/', '_blank');
        setError('Phantom not detected. Install it first.');
        setStatus('idle');
        return;
      }

      const { publicKey, balance } = await connectPhantom();
      setWalletAddress(publicKey);
      setWalletBalance(balance);

      // Check USDC balance specifically
      const usdcBalance = await getUSDCBalance(publicKey);
      if (usdcBalance < amount) {
        setError(t.payment.insufficientBalance);
        setStatus('idle');
        return;
      }

      setStatus('connected');
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
      setStatus('idle');
    }
  }, [amount, t]);

  // ---- Send Payment ----
  const handlePay = useCallback(async () => {
    setStatus('sending');
    setError('');

    try {
      const memo = `CryptoChess-Stake-${gameId}`;
      const { signature, confirmed } = await sendUSDCPayment(
        recipientAddress,
        amount,
        memo
      );

      setTxSignature(signature);

      if (confirmed) {
        setStatus('confirmed');
        setTimeout(() => onPaymentConfirmed(), 1500);
      } else {
        // Wait for confirmation
        setStatus('confirming');
        // Poll for confirmation on backend
        const pollInterval = setInterval(async () => {
          try {
            const res = await fetch(
              `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/solana/verify`,
              {
                method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-wallet-address': localStorage.getItem('cryptochess_wallet') || '',
              },
                body: JSON.stringify({
                  signature,
                  expectedAmount: amount,
                  gameId,
                }),
              }
            );
            const data = await res.json();
            if (data.valid) {
              clearInterval(pollInterval);
              setStatus('confirmed');
              setTimeout(() => onPaymentConfirmed(), 1500);
            }
          } catch {
            // Keep polling
          }
        }, 3000);

        // Stop polling after 30s
        setTimeout(() => clearInterval(pollInterval), 30000);
      }
    } catch (err: any) {
      setError(err.message || 'Payment failed');
      setStatus('connected');
    }
  }, [amount, gameId, recipientAddress, onPaymentConfirmed]);

  // ---- Copy Address ----
  const copyAddress = async () => {
    await navigator.clipboard.writeText(recipientAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ---- Timer Color ----
  const timerColor =
    timeLeft > 30 ? 'text-neon-green' :
    timeLeft > 10 ? 'text-gold-400' :
    'text-neon-red';

  const timerPercent = (timeLeft / PAYMENT_TIMEOUT_SECONDS) * 100;

  // ---- Render ----
  return (
    <div className="fixed inset-0 bg-dark-950/95 backdrop-blur-md z-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Timer Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm text-white/50">
              <Clock className="w-4 h-4" />
              {t.payment.timeRemaining}
            </div>
            <div className={`text-2xl font-mono font-bold ${timerColor}`}>
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </div>
          </div>
          <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                timeLeft > 30 ? 'bg-neon-green' :
                timeLeft > 10 ? 'bg-gold-400' :
                'bg-neon-red'
              }`}
              style={{ width: `${timerPercent}%` }}
            />
          </div>
        </div>

        {/* Main Card */}
        <div className="card relative overflow-hidden">
          {/* Background glow */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-gold-400/5 rounded-full -translate-y-1/2 translate-x-1/2" />

          <div className="relative">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gold-400/10 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-gold-400" />
              </div>
              <h2 className="text-2xl font-bold mb-1">{t.payment.title}</h2>
              <p className="text-sm text-white/40">{t.payment.subtitle}</p>
            </div>

            {/* Amount Display */}
            <div className="bg-dark-700 rounded-xl p-4 text-center mb-6">
              <div className="text-sm text-white/40 mb-1">{t.payment.sendTo}</div>
              <div className="text-3xl font-bold text-gold-400">{amount} USDC</div>
              <div className="text-xs text-white/30 mt-1">{t.payment.toConfirm}</div>
            </div>

            {/* IDLE: Connect Wallet */}
            {status === 'idle' && (
              <div className="space-y-4">
                {error && (
                  <div className="text-neon-red text-sm bg-neon-red/10 rounded-xl px-4 py-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  onClick={handleConnect}
                  className="btn-neon w-full flex items-center justify-center gap-3"
                >
                  <Wallet className="w-5 h-5" />
                  {t.payment.connectPhantom}
                </button>

                {/* Manual Payment Option */}
                <div className="text-center">
                  <div className="text-xs text-white/30 mb-2">{t.or}</div>
                </div>

                <div className="bg-dark-700 rounded-xl p-3">
                  <div className="text-xs text-white/40 mb-2">{t.payment.orPayManually}</div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-white/60 bg-dark-600 px-2 py-1 rounded flex-1 overflow-hidden text-ellipsis">
                      {recipientAddress.slice(0, 20)}...{recipientAddress.slice(-8)}
                    </code>
                    <button onClick={copyAddress} className="text-gold-400 hover:text-gold-500">
                      {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="text-[10px] text-white/20 mt-2">{t.payment.networkFee}</div>
                </div>
              </div>
            )}

            {/* CONNECTING */}
            {status === 'connecting' && (
              <div className="text-center py-8">
                <Loader2 className="w-10 h-10 text-gold-400 mx-auto animate-spin mb-4" />
                <p className="text-white/50">{t.payment.connectingWallet}</p>
              </div>
            )}

            {/* CONNECTED: Ready to Pay */}
            {status === 'connected' && (
              <div className="space-y-4">
                {/* Wallet Info */}
                <div className="bg-dark-700 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-neon-green" />
                    <span className="text-sm text-neon-green">{t.payment.walletConnected}</span>
                  </div>
                  <span className="text-xs text-white/40">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </span>
                </div>

                {/* Balance */}
                <div className="bg-dark-700/50 rounded-lg p-2 text-center text-sm">
                  <span className="text-white/40">Balance: </span>
                  <span className={`font-bold ${walletBalance >= amount ? 'text-neon-green' : 'text-neon-red'}`}>
                    {walletBalance.toFixed(2)} USDC
                  </span>
                </div>

                {error && (
                  <div className="text-neon-red text-sm bg-neon-red/10 rounded-xl px-4 py-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  onClick={handlePay}
                  disabled={walletBalance < amount}
                  className="btn-primary w-full text-center text-lg"
                >
                  {t.payment.sendTo} {amount} USDC →
                </button>
              </div>
            )}

            {/* SENDING */}
            {status === 'sending' && (
              <div className="text-center py-8">
                <Loader2 className="w-10 h-10 text-gold-400 mx-auto animate-spin mb-4" />
                <p className="text-white/50">{t.payment.sending}</p>
                <p className="text-xs text-white/30 mt-2">Confirm in Phantom...</p>
              </div>
            )}

            {/* SENT / CONFIRMING */}
            {(status === 'sent' || status === 'confirming') && (
              <div className="text-center py-8">
                <Loader2 className="w-10 h-10 text-gold-400 mx-auto animate-spin mb-4" />
                <p className="text-white/50">{t.payment.paymentSent}</p>
                <p className="text-xs text-white/30 mt-2">{t.payment.waitingConfirmation}</p>
                {txSignature && (
                  <a
                    href={`https://solscan.io/tx/${txSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-neon-blue mt-2 inline-flex items-center gap-1"
                  >
                    View on Solscan <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}

            {/* CONFIRMED */}
            {status === 'confirmed' && (
              <div className="text-center py-8">
                <CheckCircle className="w-16 h-16 text-neon-green mx-auto mb-4" />
                <p className="text-xl font-bold text-neon-green">{t.payment.matchConfirmed}</p>
                <p className="text-sm text-white/40 mt-2">{t.payment.startingGame}</p>
              </div>
            )}

            {/* EXPIRED */}
            {status === 'expired' && (
              <div className="text-center py-8">
                <Clock className="w-16 h-16 text-neon-red mx-auto mb-4" />
                <p className="text-xl font-bold text-neon-red">{t.payment.paymentExpired}</p>
                <p className="text-sm text-white/40 mt-2">{t.payment.paymentExpiredMsg}</p>
              </div>
            )}

            {/* FAILED */}
            {status === 'failed' && (
              <div className="text-center py-8">
                <AlertTriangle className="w-16 h-16 text-neon-red mx-auto mb-4" />
                <p className="text-xl font-bold text-neon-red">{t.payment.paymentFailed}</p>
                <p className="text-sm text-white/40 mt-2">{error || t.payment.paymentFailedMsg}</p>
                <button
                  onClick={() => { setStatus('idle'); setError(''); }}
                  className="btn-primary mt-4"
                >
                  {t.payment.tryAgain}
                </button>
              </div>
            )}

            {/* Back to lobby link */}
            {(status === 'expired' || status === 'failed' || status === 'idle') && (
              <button
                onClick={() => { disconnectPhantom(); onExpired(); }}
                className="w-full mt-4 text-center text-sm text-white/30 hover:text-white/50 transition-colors"
              >
                ← {t.payment.backToLobby}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
