// ============================================================
// CryptoChess - Client Providers
// Wraps the app with necessary context providers
// ============================================================

'use client';

import { AuthProvider } from '@/lib/auth-context';
import { I18nProvider } from '@/lib/i18n';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </I18nProvider>
  );
}
