// ============================================================
// CryptoChess - Main Server (Wallet-Only, No Accounts)
// Express + Socket.io + Chess.js
// Identity = Solana wallet address
// All payments are REAL on-chain USDC via Solana Pay
// ============================================================

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Chess } = require('chess.js');
const { v4: uuidv4 } = require('uuid');

// Import routes and services
const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const gameRoutes = require('./routes/games');
const solanaRoutes = require('./routes/solana');
const tempWalletRoutes = require('./routes/temp-wallet');
const turnstileRoutes = require('./routes/turnstile');
const refundRoutes = require('./routes/refund');
const { authenticateSocket } = require('./middleware/auth');
const escrow = require('./services/escrow');
const matchmaking = require('./services/matchmaking');
const paymentPhase = require('./services/payment-phase');
const changenow = require('./services/changenow');
const solanaMonitor = require('./services/solana-monitor');
const solanaPayout = require('./services/solana-payout');
const { query, initDB } = require('./db/connection');

// Track which games each player is in (wallet -> Set<gameId>)
const playerGames = new Map();

// ============================================================
// Initialize Express & HTTP Server
// ============================================================
const app = express();
const server = http.createServer(app);

// ============================================================
// Middleware
// ============================================================
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// ============================================================
// REST API Routes
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/solana', solanaRoutes);
app.use('/api/turnstile', turnstileRoutes);
app.use('/api/refund', refundRoutes);
app.use('/api/temp-wallet', tempWalletRoutes);

/**
 * GET /health or /ping — Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CryptoChess',
    mode: 'wallet-only-onchain',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

/**
 * GET /api/matchmaking/status — Queue sizes
 */
app.get('/api/matchmaking/status', (req, res) => {
  res.json(matchmaking.getQueueStatus());
});

/**
 * GET /api/admin/commission — Commission pool status
 */
app.get('/api/admin/commission', async (req, res) => {
  try {
    const balance = await changenow.getCommissionBalance();
    res.json({
      accumulated_usdc: balance,
      threshold_usdc: changenow.SWEEP_THRESHOLD_USDC,
      ready_to_sweep: balance >= changenow.SWEEP_THRESHOLD_USDC
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch commission status' });
  }
});

// ============================================================
// Socket.io Server
// ============================================================
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Active games in memory: gameId -> game data
const activeGames = new Map();

// Connected users: socketId -> walletAddress
const connectedUsers = new Map();

/**
 * Helper: Start a game after both players have paid on-chain
 */
async function startGame(gameId, payment, stakeAmount) {
  const chess = new Chess();
  activeGames.set(gameId, {
    chess,
    white: { wallet: payment.white, socketId: null },
    black: { wallet: payment.black, socketId: null },
    stake: stakeAmount,
    moveHistory: [],
    startTime: Date.now()
  });

  // Find socket IDs for both players
  for (const [sid, s] of io.sockets.sockets) {
    if (s.walletAddress === payment.white) activeGames.get(gameId).white.socketId = sid;
    if (s.walletAddress === payment.black) activeGames.get(gameId).black.socketId = sid;
  }

  // Update game status
  await query(
    `UPDATE games SET status = 'active', updated_at = datetime('now') WHERE id = $1`,
    [gameId]
  );

  const whiteShort = payment.white.slice(0, 6) + '...' + payment.white.slice(-4);
  const blackShort = payment.black.slice(0, 6) + '...' + payment.black.slice(-4);

  io.to(`game:${gameId}`).emit('game:started', {
    gameId,
    stake: stakeAmount,
    white: payment.white,
    black: payment.black,
  });

  io.to(`game:${gameId}`).emit('game:state', {
    fen: chess.fen(),
    turn: chess.turn(),
    moveNumber: chess.moveNumber(),
    status: 'active',
    whitePlayer: whiteShort,
    blackPlayer: blackShort,
  });

  console.log(`[WS] ✅ Both paid on-chain, game started: ${gameId} | ${stakeAmount} USDC`);
}

// ============================================================
// Socket.io Wallet Auth Middleware
// ============================================================
io.use((socket, next) => {
  const walletAddress = socket.handshake.auth.walletAddress;

  if (!walletAddress) {
    return next(new Error('Wallet address required'));
  }

  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
    return next(new Error('Invalid wallet address'));
  }

  socket.walletAddress = walletAddress;
  next();
});

// ============================================================
// Socket.io Connection Handler
// ============================================================
io.on('connection', (socket) => {
  console.log(`[WS] Connected: ${socket.walletAddress.slice(0, 8)}... (${socket.id})`);
  connectedUsers.set(socket.id, socket.walletAddress);

  // Ensure player record exists
  escrow.ensurePlayer(socket.walletAddress);

  // --------------------------------------------------------
  // JOIN MATCHMAKING QUEUE
  // --------------------------------------------------------
  socket.on('matchmaking:join', async (data) => {
    try {
      const { stakeAmount } = data;

      const matchResult = await matchmaking.joinQueue(
        socket.walletAddress,
        stakeAmount,
        socket.id
      );

      if (matchResult.status === 'matched') {
        const gameId = matchResult.gameId;
        const opponent = matchResult.opponent;

        // Start payment phase (60s timer) — NO fake balance deduction
        paymentPhase.startPaymentPhase(
          gameId,
          socket.walletAddress,
          opponent.walletAddress,
          stakeAmount
        );

        // Create game record (status: payment_pending)
        await query(
          `INSERT INTO games (id, white_wallet, black_wallet, stake_amount, status)
           VALUES ($1, $2, $3, $4, 'payment_pending')`,
          [gameId, socket.walletAddress, opponent.walletAddress, stakeAmount]
        );

        // Join game rooms for both players
        socket.join(`game:${gameId}`);
        const oppSocket = io.sockets.sockets.get(opponent.socketId);
        if (oppSocket) oppSocket.join(`game:${gameId}`);

        // Notify opponent — payment required
        io.to(opponent.socketId).emit('payment:required', {
          gameId,
          color: 'black',
          stake: stakeAmount,
          opponent: { wallet: socket.walletAddress },
          timeLimitMs: paymentPhase.PAYMENT_TIMEOUT_MS,
        });

        // Notify this player — payment required
        socket.emit('payment:required', {
          gameId,
          color: 'white',
          stake: stakeAmount,
          opponent: { wallet: opponent.walletAddress },
          timeLimitMs: paymentPhase.PAYMENT_TIMEOUT_MS,
        });

        console.log(`[WS] Match found, payment phase started: ${gameId} | ${stakeAmount} USDC`);
      } else {
        socket.emit('matchmaking:waiting', { stakeAmount });
      }
    } catch (err) {
      console.error('[WS] Matchmaking error:', err.message);
      socket.emit('matchmaking:error', { error: err.message });
    }
  });

  // --------------------------------------------------------
  // CONFIRM PAYMENT — Player sends real USDC on-chain
  // The frontend shows Solana Pay QR → user scans → real USDC transfer
  // Backend monitors the platform wallet for incoming USDC
  // --------------------------------------------------------
  socket.on('game:pay', async (data) => {
    try {
      const { gameId } = data;
      const payment = paymentPhase.getPendingPayment(gameId);
      if (!payment) {
        socket.emit('payment:error', { error: 'No pending payment' });
        return;
      }

      const stakeAmount = payment.stakeAmount;

      // Start monitoring the platform wallet for this player's payment
      solanaMonitor.startMonitoring(
        gameId,
        socket.walletAddress,
        stakeAmount,
        // onConfirmed — real payment detected on-chain!
        async (paymentData) => {
          console.log(`[WS] ✅ On-chain payment confirmed for ${socket.walletAddress.slice(0, 8)} in game ${gameId.slice(0, 8)}`);

          // Mark as paid in payment phase
          const result = paymentPhase.markPaid(gameId, socket.walletAddress);
          if (result.error) return;

          // Record payment for audit
          await escrow.recordPayment(
            socket.walletAddress,
            stakeAmount,
            gameId,
            paymentData.signature,
            `On-chain USDC payment: ${paymentData.signature}`
          );

          // Notify both players
          io.to(`game:${gameId}`).emit('payment:status', {
            paid: socket.walletAddress,
            bothPaid: result.bothPaid,
            signature: paymentData.signature,
          });

          if (result.bothPaid) {
            // Both paid — start the game!
            await startGame(gameId, result, stakeAmount);
          } else {
            socket.emit('payment:waiting', { waitingFor: result.waitingFor });
          }
        },
        // onTimeout — 90s passed, no payment detected
        ({ gameId: gid, wallet }) => {
          console.log(`[WS] ⚠ Payment monitoring timed out for ${wallet.slice(0, 8)} in ${gid.slice(0, 8)}`);
          socket.emit('payment:error', { error: 'Payment not detected on-chain. Make sure you sent the correct USDC amount to the platform wallet.' });
        }
      );

      socket.emit('payment:monitoring', { message: 'Monitoring Solana blockchain for your payment...' });
    } catch (err) {
      console.error('[WS] Payment error:', err.message);
      socket.emit('payment:error', { error: 'Payment processing failed' });
    }
  });

  // --------------------------------------------------------
  // REQUEST REFUND — Real on-chain USDC refund
  // --------------------------------------------------------
  socket.on('game:refund', async (data) => {
    try {
      const { gameId } = data;
      const eligibility = paymentPhase.consumeRefundEligibility(socket.walletAddress, gameId);

      if (!eligibility) {
        socket.emit('payment:error', { error: 'Not eligible for refund' });
        return;
      }

      // Send real USDC back on-chain
      const refundResult = await solanaPayout.sendRefund(
        socket.walletAddress,
        eligibility.stakeAmount,
        gameId
      );

      if (refundResult.success) {
        await escrow.recordRefund(
          socket.walletAddress,
          eligibility.stakeAmount,
          gameId,
          'Refund — opponent did not pay'
        );

        // Mark game as cancelled
        await query(
          `UPDATE games SET status = 'cancelled', updated_at = datetime('now') WHERE id = $1`,
          [gameId]
        );
        saveDB();

        socket.emit('payment:refunded', {
          amount: eligibility.stakeAmount,
          signature: refundResult.signature,
          onChain: true,
        });

        console.log(`[REFUND] ✅ Real USDC refund: ${eligibility.stakeAmount} → ${socket.walletAddress.slice(0, 8)}`);
      } else {
        socket.emit('payment:error', { error: 'Refund transaction failed on-chain. Try again.' });
      }
    } catch (err) {
      console.error('[WS] Refund error:', err.message);
      socket.emit('payment:error', { error: 'Refund failed' });
    }
  });

  // --------------------------------------------------------
  // LEAVE MATCHMAKING
  // --------------------------------------------------------
  socket.on('matchmaking:leave', (data) => {
    matchmaking.leaveQueue(socket.walletAddress, data.stakeAmount);
    socket.emit('matchmaking:left');
  });

  // --------------------------------------------------------
  // JOIN FRIEND CHALLENGE
  // --------------------------------------------------------
  socket.on('challenge:join', async (data) => {
    try {
      const { inviteCode } = data;

      const gameResult = await query(
        `SELECT * FROM games WHERE invite_code = $1 AND status = 'waiting'`,
        [inviteCode.toUpperCase()]
      );

      if (gameResult.rows.length === 0) {
        socket.emit('challenge:error', { error: 'Challenge not found or already started' });
        return;
      }

      const game = gameResult.rows[0];

      // Can't join own challenge
      if (game.white_wallet === socket.walletAddress) {
        socket.emit('challenge:error', { error: 'Cannot join your own challenge' });
        return;
      }

      // Start payment phase for challenge — both must pay on-chain
      const stakeAmount = parseFloat(game.stake_amount);

      paymentPhase.startPaymentPhase(
        game.id,
        game.white_wallet,
        socket.walletAddress,
        stakeAmount
      );

      // Update game
      await query(
        `UPDATE games SET black_wallet = $1, status = 'payment_pending' WHERE id = $2`,
        [socket.walletAddress, game.id]
      );

      // Find creator's socket
      const creatorSocketId = [...io.sockets.sockets.entries()]
        .find(([id, s]) => s.walletAddress === game.white_wallet)?.[0];

      socket.join(`game:${game.id}`);

      // Notify both players — payment required
      if (creatorSocketId) {
        io.to(creatorSocketId).emit('payment:required', {
          gameId: game.id,
          color: 'white',
          stake: stakeAmount,
          opponent: { wallet: socket.walletAddress },
          timeLimitMs: paymentPhase.PAYMENT_TIMEOUT_MS,
        });
      }

      socket.emit('payment:required', {
        gameId: game.id,
        color: 'black',
        stake: stakeAmount,
        opponent: { wallet: game.white_wallet },
        timeLimitMs: paymentPhase.PAYMENT_TIMEOUT_MS,
      });

      console.log(`[WS] Challenge started, payment phase: ${game.id} | ${stakeAmount} USDC`);
    } catch (err) {
      console.error('[WS] Challenge join error:', err.message);
      socket.emit('challenge:error', { error: err.message });
    }
  });

  // --------------------------------------------------------
  // MAKE A MOVE
  // --------------------------------------------------------
  socket.on('game:move', async (data) => {
    try {
      const { gameId, move } = data;
      const gameData = activeGames.get(gameId);

      if (!gameData) {
        socket.emit('game:error', { error: 'Game not found' });
        return;
      }

      const isWhite = gameData.white.wallet === socket.walletAddress;
      const isBlack = gameData.black.wallet === socket.walletAddress;

      if (!isWhite && !isBlack) {
        socket.emit('game:error', { error: 'Not a player in this game' });
        return;
      }

      const expectedTurn = isWhite ? 'w' : 'b';
      if (gameData.chess.turn() !== expectedTurn) {
        socket.emit('game:error', { error: 'Not your turn' });
        return;
      }

      let moveResult;
      try {
        moveResult = gameData.chess.move(move);
      } catch (e) {
        socket.emit('game:error', { error: 'Invalid move' });
        return;
      }

      if (!moveResult) {
        socket.emit('game:error', { error: 'Illegal move' });
        return;
      }

      gameData.moveHistory.push(moveResult);

      const isCheckmate = gameData.chess.isCheckmate();
      const isStalemate = gameData.chess.isStalemate();
      const isDraw = gameData.chess.isDraw();
      const isGameOver = gameData.chess.isGameOver();

      let gameState = {
        fen: gameData.chess.fen(),
        turn: gameData.chess.turn(),
        lastMove: { from: moveResult.from, to: moveResult.to, san: moveResult.san },
        isCheck: gameData.chess.isCheck(),
        moveCount: gameData.moveHistory.length,
        whitePlayer: gameData.white.wallet.slice(0, 6) + '...' + gameData.white.wallet.slice(-4),
        blackPlayer: gameData.black.wallet.slice(0, 6) + '...' + gameData.black.wallet.slice(-4),
        status: 'active'
      };

      if (isGameOver) {
        let winnerWallet = null;
        let resultMessage = '';

        if (isCheckmate) {
          winnerWallet = socket.walletAddress;
          resultMessage = 'Checkmate!';
          gameState.status = 'checkmate';
        } else if (isStalemate) {
          resultMessage = 'Stalemate — Draw';
          gameState.status = 'stalemate';
        } else if (isDraw) {
          resultMessage = 'Draw';
          gameState.status = 'draw';
        }

        gameState.winnerWallet = winnerWallet;
        gameState.resultMessage = resultMessage;

        // REAL USDC payout from platform wallet to winner
        if (isCheckmate) {
          const payoutResult = await solanaPayout.settleAndPayout(gameId, winnerWallet);
          gameState.payoutResult = {
            success: payoutResult.success,
            payout: payoutResult.payout,
            signature: payoutResult.signature,
          };
        } else {
          // Draw or stalemate — record commission, no winner payout
          await solanaPayout.settleAndPayout(gameId, null);
        }

        activeGames.delete(gameId);

        await query(
          `UPDATE games SET move_history = $1, winner_wallet = $2, status = $3, updated_at = datetime('now')
           WHERE id = $4`,
          [JSON.stringify(gameData.moveHistory.map(m => m.san)), winnerWallet, gameState.status, gameId]
        ).catch(() => {});
      }

      io.to(`game:${gameId}`).emit('game:state', gameState);
    } catch (err) {
      console.error('[WS] Move error:', err.message);
      socket.emit('game:error', { error: 'Failed to process move' });
    }
  });

  // --------------------------------------------------------
  // RESIGN
  // --------------------------------------------------------
  socket.on('game:resign', async (data) => {
    try {
      const { gameId } = data;
      const gameData = activeGames.get(gameId);
      if (!gameData) return;

      const winnerWallet = gameData.white.wallet === socket.walletAddress
        ? gameData.black.wallet : gameData.white.wallet;

      // REAL USDC payout to winner
      const payoutResult = await solanaPayout.settleAndPayout(gameId, winnerWallet);

      io.to(`game:${gameId}`).emit('game:state', {
        fen: gameData.chess.fen(),
        status: 'resigned',
        winnerWallet,
        winnerUsername: winnerWallet.slice(0, 6) + '...' + winnerWallet.slice(-4),
        resultMessage: 'Resigned',
        isCheck: false,
        payoutResult: {
          success: payoutResult.success,
          payout: payoutResult.payout,
          signature: payoutResult.signature,
        },
      });

      activeGames.delete(gameId);
    } catch (err) {
      console.error('[WS] Resign error:', err.message);
    }
  });

  // --------------------------------------------------------
  // DRAW OFFER / ACCEPT / DECLINE
  // --------------------------------------------------------
  socket.on('game:draw-offer', (data) => {
    const gameData = activeGames.get(data.gameId);
    if (!gameData) return;
    const target = gameData.white.wallet === socket.walletAddress
      ? gameData.black.socketId : gameData.white.socketId;
    if (target) io.to(target).emit('game:draw-offered', { offeredBy: socket.walletAddress.slice(0, 6) + '...' + socket.walletAddress.slice(-4) });
  });

  socket.on('game:draw-accept', async (data) => {
    try {
      const gameData = activeGames.get(data.gameId);
      if (!gameData) return;
      await solanaPayout.settleAndPayout(data.gameId, null);
      io.to(`game:${data.gameId}`).emit('game:state', {
        fen: gameData.chess.fen(),
        status: 'draw',
        resultMessage: 'Draw accepted',
        isCheck: false
      });
      activeGames.delete(data.gameId);
    } catch (err) {
      console.error('[WS] Draw accept error:', err.message);
    }
  });

  socket.on('game:draw-decline', (data) => {
    const gameData = activeGames.get(data.gameId);
    if (!gameData) return;
    const target = gameData.white.wallet === socket.walletAddress
      ? gameData.black.socketId : gameData.white.socketId;
    if (target) io.to(target).emit('game:draw-declined');
  });

  // --------------------------------------------------------
  // JOIN EXISTING GAME (reconnection)
  // --------------------------------------------------------
  socket.on('game:join', (data) => {
    const { gameId } = data;
    const gameData = activeGames.get(gameId);
    if (!gameData) {
      socket.emit('game:error', { error: 'Game not found or already finished' });
      return;
    }

    if (gameData.white.wallet === socket.walletAddress) {
      gameData.white.socketId = socket.id;
    } else if (gameData.black.wallet === socket.walletAddress) {
      gameData.black.socketId = socket.id;
    } else {
      socket.emit('game:error', { error: 'Not a player in this game' });
      return;
    }

    socket.join(`game:${gameId}`);

    socket.emit('game:state', {
      fen: gameData.chess.fen(),
      turn: gameData.chess.turn(),
      moveNumber: gameData.chess.moveNumber(),
      status: 'active',
      whitePlayer: gameData.white.wallet.slice(0, 6) + '...' + gameData.white.wallet.slice(-4),
      blackPlayer: gameData.black.wallet.slice(0, 6) + '...' + gameData.black.wallet.slice(-4),
    });
  });

  // --------------------------------------------------------
  // DISCONNECT
  // --------------------------------------------------------
  socket.on('disconnect', async () => {
    console.log(`[WS] Disconnected: ${socket.walletAddress.slice(0, 8)}...`);
    connectedUsers.delete(socket.id);

    matchmaking.cleanupPlayer(socket.walletAddress);

    // Handle pending payments — if in payment phase, handle the departure
    for (const [gameId, payment] of paymentPhase.pendingPayments) {
      if (payment.white === socket.walletAddress || payment.black === socket.walletAddress) {
        const cancelResult = paymentPhase.cancelPayment(gameId, socket.walletAddress);
        if (cancelResult && cancelResult.action === 'requeue') {
          // The other player paid on-chain — requeue them
          const oppSocketId = [...io.sockets.sockets.entries()]
            .find(([id, s]) => s.walletAddress === cancelResult.paidWallet)?.[0];
          if (oppSocketId) {
            io.to(oppSocketId).emit('payment:opponent_left', {
              gameId,
              stakeAmount: cancelResult.stakeAmount,
              message: 'Your opponent did not pay. Searching for a new rival...',
            });
            // Re-queue the paid player
            matchmaking.joinQueue(cancelResult.paidWallet, cancelResult.stakeAmount, oppSocketId)
              .then(async (reMatch) => {
                if (reMatch.status === 'matched') {
                  const newPayment = paymentPhase.startPaymentPhase(
                    reMatch.gameId,
                    cancelResult.paidWallet,
                    reMatch.opponent.walletAddress,
                    cancelResult.stakeAmount
                  );
                  await query(
                    `INSERT INTO games (id, white_wallet, black_wallet, stake_amount, status)
                     VALUES ($1, $2, $3, $4, 'payment_pending')`,
                    [reMatch.gameId, cancelResult.paidWallet, reMatch.opponent.walletAddress, cancelResult.stakeAmount]
                  );
                  io.to(oppSocketId).emit('payment:required', {
                    gameId: reMatch.gameId,
                    color: 'white',
                    stake: cancelResult.stakeAmount,
                    opponent: { wallet: reMatch.opponent.walletAddress },
                    timeLimitMs: paymentPhase.PAYMENT_TIMEOUT_MS,
                  });
                } else {
                  // No immediate match — make eligible for refund after 60s
                  paymentPhase.makeRefundEligible(cancelResult.paidWallet, gameId, cancelResult.stakeAmount);
                  io.to(oppSocketId).emit('payment:waiting_refund', {
                    gameId,
                    stakeAmount: cancelResult.stakeAmount,
                    refundEligibleAt: Date.now() + paymentPhase.REMATCH_TIMEOUT_MS,
                  });
                }
              }).catch(err => console.error('[WS] Re-queue error:', err.message));
          }
        }
      }
    }

    // Handle active games — opponent wins by disconnect with REAL payout
    for (const [gameId, gameData] of activeGames) {
      if (gameData.white.wallet === socket.walletAddress || gameData.black.wallet === socket.walletAddress) {
        const winnerWallet = gameData.white.wallet === socket.walletAddress
          ? gameData.black.wallet : gameData.white.wallet;

        try {
          // REAL USDC payout to winner
          const payoutResult = await solanaPayout.settleAndPayout(gameId, winnerWallet);

          io.to(`game:${gameId}`).emit('game:state', {
            fen: gameData.chess.fen(),
            status: 'disconnected',
            winnerWallet,
            resultMessage: 'Opponent disconnected',
            isCheck: false,
            payoutResult: {
              success: payoutResult.success,
              payout: payoutResult.payout,
              signature: payoutResult.signature,
            },
          });
        } catch (err) {
          console.error(`[WS] Disconnect settlement error:`, err.message);
        }

        activeGames.delete(gameId);
      }
    }
  });
});

// ============================================================
// Start Server
// ============================================================
const PORT = process.env.PORT || 3001;

// Initialize database then start server
initDB().then(() => {
server.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║       ♚ CryptoChess (On-Chain) ♚        ║`);
  console.log(`  ║──────────────────────────────────────────║`);
  console.log(`  ║  HTTP:    http://localhost:${PORT}          ║`);
  console.log(`  ║  WS:      ws://localhost:${PORT}            ║`);
  console.log(`  ║  Health:  http://localhost:${PORT}/ping      ║`);
  console.log(`  ║  Mode:    Real USDC — No fake balances   ║`);
  console.log(`  ║  Payout:  Solana mainnet                 ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);

  changenow.startSweepMonitor();
  solanaMonitor.init();
  solanaPayout.init();
});

process.on('SIGTERM', () => {
  changenow.stopSweepMonitor();
  io.close();
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  changenow.stopSweepMonitor();
  io.close();
  server.close(() => process.exit(0));
});

module.exports = { app, server, io };
}); // end initDB().then
