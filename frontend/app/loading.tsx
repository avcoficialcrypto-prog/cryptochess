// CryptoChess - Global Loading State
export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950">
      <div className="text-center">
        <div className="text-5xl mb-4 animate-pulse">♚</div>
        <div className="text-white/50 text-sm">Loading CryptoChess...</div>
      </div>
    </div>
  );
}
