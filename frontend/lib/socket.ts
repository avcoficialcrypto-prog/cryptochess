// ============================================================
// CryptoChess - Socket.io Client (Wallet-Based)
// No JWT — connects with wallet address
// ============================================================

'use client';

import { io, Socket } from 'socket.io-client';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

let socket: Socket | null = null;

/**
 * Get or create socket connection using wallet address
 */
export function getSocket(walletAddress: string): Socket {
  if (socket && socket.connected) {
    return socket;
  }

  socket = io(BACKEND_URL, {
    auth: { walletAddress },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Error:', err.message);
  });

  return socket;
}

/**
 * Disconnect the socket
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Get current socket instance
 */
export function getSocketInstance(): Socket | null {
  return socket;
}
