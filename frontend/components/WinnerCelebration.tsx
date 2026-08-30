"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";

const COLORS = ['#f0b90b', '#fde68a', '#00ff88', '#3388ff', '#ff3366', '#9944ff', '#ffffff'];

function Confetti() {
  const [pieces, setPieces] = useState<any[]>([]);

  useEffect(() => {
    const p = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 3,
      size: 6 + Math.random() * 8,
      rotation: Math.random() * 360,
    }));
    setPieces(p);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.x}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            '--fall-duration': `${p.duration}s`,
            '--fall-delay': `${p.delay}s`,
            transform: `rotate(${p.rotation}deg)`,
          } as any}
        />
      ))}
    </div>
  );
}

interface WinnerCelebrationProps {
  winner: "you" | "opponent" | "draw";
  amount?: number;
  payout?: number;
  onClose?: () => void;
}

export default function WinnerCelebration({ winner, amount, payout, onClose }: WinnerCelebrationProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(true);
    const timer = setTimeout(() => setShow(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (winner === "draw") return null;

  return (
    <>
      {winner === "you" && <Confetti />}
      {show && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className={`animate-entrance text-center pointer-events-auto`}>
            <div className="animate-winner-glow rounded-3xl bg-dark-800/95 backdrop-blur-xl border border-gold-400/30 p-8 sm:p-12 max-w-sm mx-4">
              <div className="animate-winner-pulse mb-4">
                <Trophy className="w-20 h-20 text-gold-400 mx-auto" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-gradient mb-2">VICTORY!</h2>
              <p className="text-white/50 text-lg mb-4">You won by checkmate</p>
              {payout !== undefined && (
                <div className="bg-gold-400/10 rounded-xl p-4 border border-gold-400/20">
                  <div className="text-sm text-white/40 mb-1">Prize</div>
                  <div className="text-3xl font-black text-gold-400">+${payout.toFixed(2)} USDC</div>
                </div>
              )}
              {onClose && (
                <button onClick={onClose} className="btn-primary mt-6 w-full">Back to Lobby</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
