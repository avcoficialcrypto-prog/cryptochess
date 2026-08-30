// ============================================================
// CryptoChess - i18n System
// Multi-language context provider and hook
// ============================================================

'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import en from './en';
import es from './es';
import type { TranslationKeys } from './en';

export type Language = 'en' | 'es';

const translations: Record<Language, TranslationKeys> = { en, es };

interface I18nContextType {
  lang: Language;
  t: TranslationKeys;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  /** Get a random hype phrase */
  randomHype: () => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('en');

  // Load saved language from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('crypto_chess_lang') as Language;
    if (saved && (saved === 'en' || saved === 'es')) {
      setLangState(saved);
    }
  }, []);

  const setLanguage = useCallback((newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem('crypto_chess_lang', newLang);
  }, []);

  const toggleLanguage = useCallback(() => {
    const next = lang === 'en' ? 'es' : 'en';
    setLanguage(next);
  }, [lang, setLanguage]);

  const randomHype = useCallback(() => {
    const phrases = translations[lang].hype;
    return phrases[Math.floor(Math.random() * phrases.length)];
  }, [lang]);

  const value: I18nContextType = {
    lang,
    t: translations[lang],
    setLanguage,
    toggleLanguage,
    randomHype,
  };

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
