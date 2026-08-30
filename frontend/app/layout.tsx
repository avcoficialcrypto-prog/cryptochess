// ============================================================
// CryptoChess - Root Layout
// ============================================================

import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'CryptoChess - Play Chess, Win Crypto',
  description: 'Decentralized chess platform with real USDC stakes. Play against friends or find matches instantly.',
  keywords: ['chess', 'crypto', 'usdc', 'blockchain', 'pvp', 'gaming'],
  openGraph: {
    title: 'CryptoChess',
    description: 'Play Chess, Win Crypto',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-dark-950 text-white">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
