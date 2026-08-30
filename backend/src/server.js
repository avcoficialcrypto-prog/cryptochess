// ============================================================
// CryptoChess - Main Server (Wallet-Only, No Accounts)
// Express + Socket.io + Chess.js
// Identity = Solana wallet address
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
const { authenticateSocket } = require('./middleware/auth');
const escrow = require('./services/escrow');
const matchmaking = require('./services/matchmaking');
const changenow = require('./services/changenow');
const { query } = require('./db/connection');

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

/**
 * GET /health or /ping — Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CryptoChess',
    mode: 'wallet-only',
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

  // --------------------------------------------------------
  // JOIN MATCHMAKING QUEUE
  // --------------------------------------------------------
  socket.on('matchmaking:join', async (data) => {
    try {
      const { stakeAmount } = data;

      // Ensure player exists and has balance
      let result = await query(
        'SELECT * FROM players WHERE wallet_address = $1',
        [socket.walletAddress]
      );

      if (result.rows.length === 0) {
        socket.emit('matchmaking:error', { error: 'Connect your wallet first' });
        return;
      }

      const player = result.rows[0];
      if (parseFloat(player.balance_usdc) < stakeAmount) {
        socket.emit('matchmaking:error', { error: 'Insufficient balance' });
        return;
      }

      const matchResult = await matchmaking.joinQueue(
        socket.walletAddress,
        stakeAmount,
        socket.id
      );

      if (matchResult.status === 'matched') {
        const gameId = matchResult.gameId;
        const opponent = matchResult.opponent;

        // Lock wagers for both players
        await escrow.lockWager(
          socket.walletAddress,
          opponent.walletAddress,
          stakeAmount,
          gameId
        );

        // Initialize chess game
        const chess = new Chess();
        activeGames.set(gameId, {
          chess,
          white: { wallet: socket.walletAddress, socketId: socket.id },
          black: { wallet: opponent.walletAddress, socketId: opponent.socketId },
          stake: stakeAmount,
          moveHistory: [],
          startTime: Date.now()
        });

        // Join game room
        socket.join(`game:${gameId}`);

        // Notify opponent (black)
        io.to(opponent.socketId).emit('game:matched', {
          gameId,
          color: 'black',
          stake: stakeAmount,
          opponent: { wallet: socket.walletAddress }
        });

        // Notify this player (white)
        socket.emit('game:matched', {
          gameId,
          color: 'white',
          stake: stakeAmount,
          opponent: { wallet: opponent.walletAddress }
        });

        // Send initial board state
        io.to(`game:${gameId}`).emit('game:state', {
          fen: chess.fen(),
          turn: chess.turn(),
          moveNumber: chess.moveNumber(),
          status: 'active',
          whitePlayer: socket.walletAddress.slice(0, 6) + '...' + socket.walletAddress.slice(-4),
          blackPlayer: opponent.walletAddress.slice(0, 6) + '...' + opponent.walletAddress.slice(-4),
        });

        console.log(`[WS] Match started: ${gameId} | ${stakeAmount} USDC`);
      } else {
        socket.emit('matchmaking:waiting', { stakeAmount });
      }
    } catch (err) {
      console.error('[WS] Matchmaking error:', err.message);
      socket.emit('matchmaking:error', { error: err.message });
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

      // Check opponent balance
      const balance = await query(
        'SELECT balance_usdc FROM players WHERE wallet_address = $1',
        [socket.walletAddress]
      );

      if (balance.rows.length === 0 || parseFloat(balance.rows[0].balance_usdc) < parseFloat(game.stake_amount)) {
        socket.emit('challenge:error', { error: 'Insufficient balance' });
        return;
      }

      // Update game
      await query(
        `UPDATE games SET black_wallet = $1, status = 'active' WHERE id = $2`,
        [socket.walletAddress, game.id]
      );

      // Lock wagers
      const stakeAmount = parseFloat(game.stake_amount);
      await escrow.lockWager(game.white_wallet, socket.walletAddress, stakeAmount, game.id);

      // Initialize chess game
      const chess = new Chess();

      // Find creator's socket
      const creatorSocketId = [...io.sockets.sockets.entries()]
        .find(([id, s]) => s.walletAddress === game.white_wallet)?.[0];

      activeGames.set(game.id, {
        chess,
        white: { wallet: game.white_wallet, socketId: creatorSocketId },
        black: { wallet: socket.walletAddress, socketId: socket.id },
        stake: stakeAmount,
        moveHistory: [],
        startTime: Date.now()
      });

      socket.join(`game:${game.id}`);

      const whiteShort = game.white_wallet.slice(0, 6) + '...' + game.white_wallet.slice(-4);
      const blackShort = socket.walletAddress.slice(0, 6) + '...' + socket.walletAddress.slice(-4);

      // Notify creator
      if (creatorSocketId) {
        io.to(creatorSocketId).emit('game:started', {
          gameId: game.id,
          color: 'white',
          stake: stakeAmount,
          opponent: { wallet: socket.walletAddress }
        });
      }

      // Notify joiner
      socket.emit('game:started', {
        gameId: game.id,
        color: 'black',
        stake: stakeAmount,
        opponent: { wallet: game.white_wallet }
      });

      // Send initial board state
      io.to(`game:${game.id}`).emit('game:state', {
        fen: chess.fen(),
        turn: chess.turn(),
        moveNumber: chess.moveNumber(),
        whitePlayer: whiteShort,
        blackPlayer: blackShort,
        status: 'active'
      });

      console.log(`[WS] Challenge started: ${game.id} | ${stakeAmount} USDC`);
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

        // Settle financially
        if (isCheckmate) {
          await escrow.settleGame(gameId, winnerWallet);
        } else {
          await escrow.settleDraw(gameId);
        }

        activeGames.delete(gameId);

        await query(
          `UPDATE games SET move_history = $1, winner_wallet = $2, status = $3, updated_at = NOW()
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

      await escrow.settleGame(gameId, winnerWallet);

      io.to(`game:${gameId}`).emit('game:state', {
        fen: gameData.chess.fen(),
        status: 'resigned',
        winnerWallet,
        winnerUsername: winnerWallet.slice(0, 6) + '...' + winnerWallet.slice(-4),
        resultMessage: 'Resigned',
        isCheck: false
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
      await escrow.settleDraw(data.gameId);
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
  // DISCONNECT
  // --------------------------------------------------------
  socket.on('disconnect', async () => {
    console.log(`[WS] Disconnected: ${socket.walletAddress.slice(0, 8)}...`);
    connectedUsers.delete(socket.id);

    matchmaking.cleanupPlayer(socket.walletAddress);

    // Handle active games — opponent wins by disconnect
    for (const [gameId, gameData] of activeGames) {
      if (gameData.white.wallet === socket.walletAddress || gameData.black.wallet === socket.walletAddress) {
        const winnerWallet = gameData.white.wallet === socket.walletAddress
          ? gameData.black.wallet : gameData.white.wallet;

        try {
          await escrow.settleGame(gameId, winnerWallet);

          io.to(`game:${gameId}`).emit('game:state', {
            fen: gameData.chess.fen(),
            status: 'disconnected',
            winnerWallet,
            resultMessage: 'Opponent disconnected',
            isCheck: false
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

server.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║       ♚ CryptoChess (Wallet-Only) ♚     ║`);
  console.log(`  ║──────────────────────────────────────────║`);
  console.log(`  ║  HTTP:    http://localhost:${PORT}          ║`);
  console.log(`  ║  WS:      ws://localhost:${PORT}            ║`);
  console.log(`  ║  Health:  http://localhost:${PORT}/ping      ║`);
  console.log(`  ║  Mode:    No accounts — wallet only     ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);

  changenow.startSweepMonitor();
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
