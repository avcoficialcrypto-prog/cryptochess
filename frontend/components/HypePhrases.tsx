// ============================================================
// CryptoChess - Hype Phrases Component
// Rotating motivational phrases to inspire players
// ============================================================

'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/lib/i18n';
import { Flame, RefreshCw } from 'lucide-react';

interface HypePhrasesProps {
  interval?: number; // ms between phrase changes
  className?: string;
  showRefresh?: boolean;
}

export default function HypePhrases({
  interval = 8000,
  className = '',
  showRefresh = false,
}: HypePhrasesProps) {
  const { randomHype } = useI18n();
  const [phrase, setPhrase] = useState('');
  const [fade, setFade] = useState(true);

  const nextPhrase = () => {
    setFade(false);
    setTimeout(() => {
      setPhrase(randomHype());
      setFade(true);
    }, 300);
  };

  useEffect(() => {
    setPhrase(randomHype());
    const timer = setInterval(nextPhrase, interval);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Flame className="w-4 h-4 text-gold-400 flex-shrink-0 animate-pulse" />
      <p
        className={`text-sm text-white/60 italic transition-opacity duration-300 ${
          fade ? 'opacity-100' : 'opacity-0'
        }`}
      >
        &ldquo;{phrase}&rdquo;
      </p>
      {showRefresh && (
        <button
          onClick={nextPhrase}
          className="text-white/20 hover:text-white/50 transition-colors flex-shrink-0"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
