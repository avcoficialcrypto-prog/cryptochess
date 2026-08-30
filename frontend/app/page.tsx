// ============================================================
// CryptoChess - Landing Page (No Wallet Required)
// Users can play immediately — temp wallet auto-generated
// ============================================================

'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const { player, walletAddress, loading } = useAuth();
  const router = useRouter();

  // Auto-redirect to lobby once player is loaded
  useEffect(() => {
    if (!loading && player) {
      router.replace('/lobby');
    }
  }, [loading, player, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-dark flex items-center justify-center">
        <div className="text-center">
          <img src="/logo.png" alt="CryptoChess" className="w-16 h-16 mx-auto mb-4 animate-pulse" />
          <div className="text-white/50 text-lg">Loading CryptoChess...</div>
        </div>
      </div>
    );
  }

  // Player loaded — redirect to lobby (handled by useEffect above)
  // Show brief loading while redirecting
  return (
    <div className="min-h-screen bg-gradient-dark flex items-center justify-center">
      <div className="text-center">
        <img src="/logo.png" alt="CryptoChess" className="w-16 h-16 mx-auto mb-4 animate-pulse" />
        <div className="text-white/50">Entering lobby...</div>
      </div>
    </div>
  );
}
