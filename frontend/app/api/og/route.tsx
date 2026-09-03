// ============================================================
// CryptoChess - Dynamic OG Image (App Router)
// Generates a 1200x630 image for social sharing
// ============================================================

import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Chess pattern background */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.05,
            backgroundImage:
              'repeating-conic-gradient(#fff 0% 25%, transparent 0% 50%)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Logo */}
        <div
          style={{
            fontSize: 64,
            marginBottom: 16,
          }}
        >
          ♟️
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 'bold',
            color: '#ffffff',
            textAlign: 'center',
            letterSpacing: '-2px',
          }}
        >
          CryptoChess
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: '#d4af37',
            textAlign: 'center',
            marginTop: 8,
            fontWeight: '600',
          }}
        >
          Play Chess · Win Crypto · USDC PvP
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 20,
            color: '#888',
            textAlign: 'center',
            marginTop: 16,
            maxWidth: 800,
          }}
        >
          Decentralized chess with real USDC stakes. No accounts needed.
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 16,
              color: '#555',
            }}
          >
            cryptochess.duckdns.org
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
