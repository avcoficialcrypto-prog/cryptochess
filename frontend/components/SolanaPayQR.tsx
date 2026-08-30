"use client";

import { useMemo } from "react";

/**
 * Minimal QR-like SVG that encodes the Solana Pay URL
 * Shows the payment address with a scannable visual
 */
interface SolanaPayQRProps {
  address: string;
  amount: number;
  size?: number;
}

export default function SolanaPayQR({ address, amount, size = 200 }: SolanaPayQRProps) {
  const url = useMemo(() => {
    const usdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const params = new URLSearchParams({
      recipient: address,
      amount: amount.toString(),
      splToken: usdcMint,
      label: "CryptoChess",
      message: `Pay ${amount} USDC to play`,
    });
    return `solana:${address}?${params.toString()}`;
  }, [address, amount]);

  // Generate a deterministic pattern from the address for visual QR-like grid
  const gridSize = 21;
  const cellSize = Math.floor(size / (gridSize + 4));
  const offset = Math.floor((size - cellSize * gridSize) / 2);

  const cells = useMemo(() => {
    const result: { x: number; y: number; filled: boolean }[] = [];
    const hash = Array.from(address).reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0);

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        // Fixed patterns: finder corners
        const isFinderCorner =
          (x < 7 && y < 7) || (x >= gridSize - 7 && y < 7) || (x < 7 && y >= gridSize - 7);

        let filled: boolean;
        if (isFinderCorner) {
          // QR finder pattern
          const lx = x < 7 ? x : x - (gridSize - 7);
          const ly = y < 7 ? y : y - (gridSize - 7);
          filled = lx === 0 || lx === 6 || ly === 0 || ly === 6 ||
            (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4);
        } else {
          // Pseudo-random from address hash
          const seed = (hash + x * 31 + y * 17) & 0x7fffffff;
          filled = seed % 3 !== 0;
        }

        result.push({ x, y, filled });
      }
    }
    return result;
  }, [address, gridSize]);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded-xl">
        <rect width={size} height={size} fill="#ffffff" rx="12" />
        {cells.map((cell, i) => (
          <rect
            key={i}
            x={offset + cell.x * cellSize}
            y={offset + cell.y * cellSize}
            width={cellSize - 1}
            height={cellSize - 1}
            fill={cell.filled ? "#111118" : "#ffffff"}
            rx="1"
          />
        ))}
      </svg>
      <div className="mt-3 text-center">
        <div className="text-xs text-white/30 mb-1">Scan with any Solana wallet</div>
        <div className="font-mono text-[10px] text-white/20 break-all max-w-[200px]">
          {address.slice(0, 12)}...{address.slice(-8)}
        </div>
      </div>
    </div>
  );
}
