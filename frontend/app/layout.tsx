// ============================================================
// CryptoChess - Root Layout (SEO + Search Console)
// ============================================================

import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'CryptoChess - Play Chess, Win Crypto | USDC PvP',
  description: 'Decentralized chess platform with real USDC stakes. No accounts needed — connect Phantom wallet and play. Quick match or challenge friends. Zero gas fees.',
  keywords: ['chess', 'crypto', 'usdc', 'blockchain', 'pvp', 'gaming', 'solana', 'phantom', 'wallet', 'play to earn', 'chess online', 'crypto chess'],
  authors: [{ name: 'CryptoChess' }],
  creator: 'CryptoChess',
  publisher: 'CryptoChess',
  metadataBase: new URL('https://cryptochess.duckdns.org'),
  openGraph: {
    title: 'CryptoChess - Play Chess, Win Crypto',
    description: 'Decentralized chess platform with real USDC stakes. No accounts — just connect and play.',
    url: 'https://cryptochess.duckdns.org',
    siteName: 'CryptoChess',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CryptoChess - Play Chess, Win Crypto',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CryptoChess - Play Chess, Win Crypto',
    description: 'Decentralized chess platform with real USDC stakes. No accounts needed.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Google Search Console Verification */}
        <meta name="google-site-verification" content="google60f4cd5cf186200c" />
      </head>
      <body className="min-h-screen bg-dark-950 text-white">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
