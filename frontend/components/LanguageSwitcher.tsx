// ============================================================
// CryptoChess - Language Switcher Component
// Toggle between English and Spanish
// ============================================================

'use client';

import { useI18n } from '@/lib/i18n';
import { Globe } from 'lucide-react';

export default function LanguageSwitcher() {
  const { lang, toggleLanguage } = useI18n();

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-700 border border-white/10
                 hover:border-white/20 transition-all text-sm"
      title={lang === 'en' ? 'Cambiar a Español' : 'Switch to English'}
    >
      <Globe className="w-4 h-4 text-white/50" />
      <span className="font-medium text-white/70">
        {lang === 'en' ? 'ES' : 'EN'}
      </span>
    </button>
  );
}
