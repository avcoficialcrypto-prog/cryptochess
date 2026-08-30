// CryptoChess - Global Loading State
export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950">
      <div className="text-center">
        <div className="mb-4 animate-pulse"><img src="/logo.png" alt="CryptoChess" className="w-16 h-16 mx-auto rounded-xl" /></div>
        <div className="text-white/50 text-sm">Loading CryptoChess...</div>
      </div>
    </div>
  );
}
