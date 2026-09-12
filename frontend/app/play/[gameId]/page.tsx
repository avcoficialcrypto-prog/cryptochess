// ============================================================
// CryptoChess - Game Play Page (Wallet-Only) — PC Optimized
// Responsive chessboard, move/check highlights, real-time play
// ============================================================

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { getSocket } from '@/lib/socket';
import dynamic from 'next/dynamic';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import HypePhrases from '@/components/HypePhrases';
import WinnerCelebration from '@/components/WinnerCelebration';
import { sounds } from '@/lib/sounds';
import { Chess } from 'chess.js';

const Chessboard = dynamic(() => import('react-chessboard').then(m => m.Chessboard), {
  ssr: false,
  loading: () => (
    <div className="bg-dark-700 rounded-xl flex items-center justify-center animate-pulse" style={{ width: 560, height: 560 }}>
      <div className="text-white/30">Loading board...</div>
    </div>
  ),
});

import {
  ArrowLeft, Crown, Flag, ArrowLeftRight, Clock,
  Trophy, AlertTriangle, Loader2, Coins,
} from 'lucide-react';

/** Board square theme — premium green that fits the dark crypto UI */
const LIGHT_SQUARE = '#EBECD0';
const DARK_SQUARE = '#739552';

/** Compute responsive board size for the viewport */
function computeBoardSize(): number {
  if (typeof window === 'undefined') return 560;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w >= 1440) return Math.min(680, h - 280);
  if (w >= 1280) return Math.min(640, h - 260);
  if (w >= 1024) return Math.min(560, h - 240);
  if (w >= 768) return Math.min(520, h - 260);
  return Math.min(w - 40, 460);
}

export default function GamePage() {
  const { player, walletAddress } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const gameId = params.gameId as string;
  const stakeAmount = parseFloat(searchParams.get('stake') || '0');

  const [chess] = useState(() => new Chess());
  const [boardFen, setBoardFen] = useState(chess.fen());
  const [gameStatus, setGameStatus] = useState<string>('connecting');
  const [myColor, setMyColor] = useState<'white' | 'black'>(
    (searchParams.get('color') as 'white' | 'black') || 'white'
  );
  const [opponentWallet, setOpponentWallet] = useState('...');
  const [playerWallets, setPlayerWallets] = useState<{ white: string; black: string }>({ white: 'White', black: 'Black' });
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);

  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showDrawOffer, setShowDrawOffer] = useState(false);
  const [drawOffered, setDrawOffered] = useState(false);
  const [drawOfferedBy, setDrawOfferedBy] = useState('');
  const [gameResult, setGameResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isCheck, setIsCheck] = useState(false);
  const [boardSize, setBoardSize] = useState(560);
  const socketRef = useRef<any>(null);
  const movesScrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  // ---- Responsive board sizing (PC-first) ----
  useEffect(() => {
    const onResize = () => setBoardSize(computeBoardSize());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ---- Auto-scroll move list ----
  useEffect(() => {
    const el = movesScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [boardFen]);

  useEffect(() => {
    if (!walletAddress || !gameId) return;

    const socket = getSocket(walletAddress);
    socketRef.current = socket;
    socket.emit('game:join', { gameId });

    const handleGameState = (state: any) => {
      if (state.fen) { try { chess.load(state.fen); setBoardFen(state.fen); } catch {} }
      if (state.whitePlayer && state.blackPlayer) {
        setPlayerWallets({ white: state.whitePlayer, black: state.blackPlayer });
        setOpponentWallet(myColor === 'white' ? state.blackPlayer : state.whitePlayer);
      }
      if (state.lastMove) {
        setLastMove({ from: state.lastMove.from, to: state.lastMove.to });
        // Proper move sounds (previously the start chime played on every move)
        const san: string = state.lastMove.san || '';
        if (san.includes('#')) sounds.checkmate();
        else if (san.includes('+')) sounds.check();
        else if (san.includes('x')) sounds.capture();
        else sounds.move();
      }
      if (state.isCheck !== undefined) setIsCheck(state.isCheck);
      if (state.status === 'active') {
        setGameStatus('playing');
        if (!startedRef.current) {
          startedRef.current = true;
          sounds.gameStart();
        }
      }
      if (['checkmate', 'stalemate', 'draw', 'resigned', 'disconnected'].includes(state.status)) {
        setGameStatus('finished');
        const isDraw = state.status === 'stalemate' || state.status === 'draw';
        const iWon = state.winnerWallet === walletAddress;
        if (isDraw) sounds.draw();
        else if (iWon) sounds.checkmate();
        else sounds.lose();
        setGameResult({
          status: state.status,
          winnerWallet: state.winnerWallet,
          resultMessage: state.resultMessage,
          payoutResult: state.payoutResult,
          isDraw,
        });
      }
    };

    const handleGameStarted = (data: any) => {
      // Quick match sends { color }; challenge join only sends { white, black } —
      // derive color from wallets instead of clobbering the URL-derived one
      if (data.white && data.black && walletAddress) {
        if (walletAddress === data.white) setMyColor('white');
        else if (walletAddress === data.black) setMyColor('black');
      } else if (data.color === 'white' || data.color === 'black') {
        setMyColor(data.color);
      }
      setGameStatus('playing');
      startedRef.current = true;
      sounds.gameStart();
      if (data.opponent) setOpponentWallet(data.opponent.wallet.slice(0, 6) + '...' + data.opponent.wallet.slice(-4));
    };

    const handleGameMatched = (data: any) => {
      if (data.color === 'white' || data.color === 'black') setMyColor(data.color);
      setGameStatus('playing');
      if (data.opponent) setOpponentWallet(data.opponent.wallet.slice(0, 6) + '...' + data.opponent.wallet.slice(-4));
    };

    const handleMoveError = (data: any) => { setErrorMessage(data.error); sounds.error(); setTimeout(() => setErrorMessage(''), 3000); };
    const handleGameError = (data: any) => { setErrorMessage(data.error); sounds.error(); setTimeout(() => setErrorMessage(''), 5000); };
    const handleDrawOffer = (data: any) => { setDrawOffered(true); setDrawOfferedBy(data.offeredBy); };
    const handleDrawDeclined = () => { setShowDrawOffer(false); setErrorMessage(t.game.drawDeclined); setTimeout(() => setErrorMessage(''), 3000); };

    socket.on('game:state', handleGameState);
    socket.on('game:started', handleGameStarted);
    socket.on('game:matched', handleGameMatched);
    socket.on('game:error', handleGameError);
    socket.on('game:move:error', handleMoveError);
    socket.on('game:draw-offered', handleDrawOffer);
    socket.on('game:draw-declined', handleDrawDeclined);

    return () => {
      socket.off('game:state', handleGameState);
      socket.off('game:started', handleGameStarted);
      socket.off('game:matched', handleGameMatched);
      socket.off('game:error', handleGameError);
      socket.off('game:move:error', handleMoveError);
      socket.off('game:draw-offered', handleDrawOffer);
      socket.off('game:draw-declined', handleDrawDeclined);
    };
  }, [walletAddress, gameId, router, chess, myColor, t]);

  const onDrop = useCallback((sourceSquare: string, targetSquare: string) => {
    if (gameStatus !== 'playing') return false;
    const currentTurn = chess.turn();
    if ((myColor === 'white' && currentTurn !== 'w') || (myColor === 'black' && currentTurn !== 'b')) {
      setErrorMessage(t.game.notYourTurn);
      setTimeout(() => setErrorMessage(''), 2000);
      return false;
    }
    let move;
    try { move = chess.move({ from: sourceSquare, to: targetSquare, promotion: 'q' }); }
    catch { return false; }
    if (!move) return false;
    chess.undo();
    socketRef.current?.emit('game:move', { gameId, move: { from: sourceSquare, to: targetSquare, promotion: 'q' } });
    return true;
  }, [gameStatus, myColor, chess, gameId, t]);

  const resignGame = () => { socketRef.current?.emit('game:resign', { gameId }); setShowResignConfirm(false); };
  const offerDraw = () => { socketRef.current?.emit('game:draw-offer', { gameId }); setShowDrawOffer(true); };
  const acceptDraw = () => { socketRef.current?.emit('game:draw-accept', { gameId }); setDrawOffered(false); };
  const declineDraw = () => { socketRef.current?.emit('game:draw-decline', { gameId }); setDrawOffered(false); };

  const isMyTurn = chess.turn() === (myColor === 'white' ? 'w' : 'b');

  /** Square of the king in check (side to move) */
  const getCheckSquare = (): string | null => {
    if (!isCheck) return null;
    const turn = chess.turn();
    for (const row of chess.board()) {
      for (const piece of row) {
        if (piece && piece.type === 'k' && piece.color === turn) return piece.square;
      }
    }
    return null;
  };

  // ---- Square highlights: last move (gold) + check (red glow) ----
  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    const hl = { backgroundColor: 'rgba(240, 185, 11, 0.38)' };
    squareStyles[lastMove.from] = hl;
    squareStyles[lastMove.to] = hl;
  }
  const checkSquare = getCheckSquare();
  if (checkSquare) {
    squareStyles[checkSquare] = {
      backgroundColor: 'rgba(255, 51, 102, 0.5)',
      boxShadow: 'inset 0 0 14px rgba(255, 51, 102, 0.9)',
    };
  }

  const getResultMessage = () => {
    if (!gameResult) return '';
    const { status } = gameResult;
    switch (status) {
      case 'checkmate': return t.gameOver.byCheckmate;
      case 'stalemate': return t.gameOver.drawStalemate;
      case 'resigned': return t.gameOver.byResign;
      case 'disconnected': return t.gameOver.byDisconnect;
      case 'draw': return t.gameOver.drawAgreed;
      default: return gameResult.resultMessage || '';
    }
  };

  // Move list — pair white/black moves per row
  const history = chess.history();
  const moveRows: { n: number; w: string; b?: string }[] = [];
  for (let i = 0; i < history.length; i += 2) {
    moveRows.push({ n: i / 2 + 1, w: history[i], b: history[i + 1] });
  }

  const totalPot = stakeAmount * 2;
  const winnerPayout = totalPot * 0.95;

  return (
    <div className="min-h-screen bg-dark-950">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-8 py-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /><span className="text-sm">{t.game.exit}</span>
          </button>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <span className="text-sm text-white/40 hidden sm:inline">{t.game.stake}</span>
            <span className="badge-gold text-sm">{stakeAmount} {t.usdc}</span>
          </div>
        </div>

        {/* Main Layout — 3 columns on desktop, sticky side panels */}
        <div className="flex flex-col lg:flex-row gap-5 items-start justify-center">

          {/* Left: Opponent + Move list */}
          <div className="w-full lg:w-72 shrink-0 space-y-4 lg:sticky lg:top-4">
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl ${myColor === 'white' ? 'bg-dark-600' : 'bg-white/10'}`}>
                  {myColor === 'white' ? '♚' : '♔'}
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-white/40 uppercase tracking-wide">{myColor === 'white' ? 'Black' : 'White'}</div>
                  <div className="font-bold font-mono text-sm truncate">{opponentWallet}</div>
                </div>
                <div className={`ml-auto w-2.5 h-2.5 rounded-full ${gameStatus === 'playing' ? 'bg-neon-green animate-pulse' : gameStatus === 'finished' ? 'bg-gold-400' : 'bg-white/30'}`} />
              </div>
              <div className={`mt-3 text-sm font-medium flex items-center gap-2 ${isMyTurn && gameStatus === 'playing' ? 'text-neon-green' : 'text-white/50'}`}>
                {gameStatus === 'playing' && (isMyTurn ? t.game.yourTurn : t.game.opponentsTurn)}
                {gameStatus === 'connecting' && <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t.game.connecting}</>}
                {gameStatus === 'finished' && t.gameOver.backToLobby}
              </div>
              {gameStatus === 'playing' && (
                <div className="text-xs text-white/30 mt-1">
                  {chess.turn() === 'w' ? t.game.whiteToMove : t.game.blackToMove}
                  {isCheck && <span className="text-neon-red ml-1 font-bold">— {t.game.check}</span>}
                </div>
              )}
            </div>

            <div className="card p-4">
              <div className="text-sm font-medium text-white/50 mb-2 flex items-center gap-2">
                {t.game.moves}
                <span className="text-xs text-white/25 ml-auto">{moveRows.length}</span>
              </div>
              <div ref={movesScrollRef} className="max-h-64 overflow-y-auto pr-1">
                {moveRows.length === 0 ? (
                  <div className="text-white/20 text-xs py-2">{t.game.noMoves}</div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4">
                    {moveRows.map((row, i) => (
                      <div key={i} className="flex gap-1.5 font-mono text-[13px] py-0.5 leading-6">
                        <span className="text-white/30 w-6 text-right shrink-0">{row.n}.</span>
                        <span className="text-white/85 min-w-[3rem]">{row.w}</span>
                        <span className="text-white/50">{row.b || ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Center: Board */}
          <div className="flex flex-col items-center mx-auto lg:mx-0">
            <div className="w-full flex items-center justify-between mb-2" style={{ maxWidth: boardSize }}>
              <span className="text-sm text-white/40 font-mono truncate">
                {myColor === 'black' ? playerWallets.white : playerWallets.black}
              </span>
              <span className="text-xs text-white/30 font-mono shrink-0 ml-2">
                {myColor === 'black' ? '♔ White' : '♚ Black'}
              </span>
            </div>
            <div className="relative">
              <Chessboard
                position={boardFen}
                onPieceDrop={onDrop}
                boardOrientation={myColor}
                boardWidth={boardSize}
                animationDuration={200}
                arePiecesDraggable={gameStatus === 'playing' && isMyTurn}
                customDarkSquareStyle={{ backgroundColor: DARK_SQUARE }}
                customLightSquareStyle={{ backgroundColor: LIGHT_SQUARE }}
                customBoardStyle={{ borderRadius: '12px', boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)' }}
                customSquareStyles={squareStyles}
                customNotationStyle={{ fontSize: '11px', fontWeight: '600' }}
              />
              {gameStatus === 'connecting' && (
                <div className="absolute inset-0 bg-dark-950/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-10">
                  <Loader2 className="w-10 h-10 text-gold-400 animate-spin mb-3" />
                  <p className="text-white/60 text-sm">{t.game.connecting}</p>
                </div>
              )}
              {errorMessage && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-neon-red/90 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-10">
                  {errorMessage}
                </div>
              )}
            </div>
            <div className="w-full flex items-center justify-between mt-2" style={{ maxWidth: boardSize }}>
              <span className="text-sm font-mono text-gold-400 truncate">
                {myColor === 'white' ? playerWallets.white : playerWallets.black}
              </span>
              <span className="text-xs text-gold-400/60 shrink-0 ml-2">
                {myColor === 'white' ? '♔ White' : '♚ Black'} ({t.game.you})
              </span>
            </div>

            {gameStatus === 'playing' && (
              <div className="flex gap-3 mt-4">
                <button onClick={offerDraw} className="btn-secondary text-sm flex items-center gap-2" disabled={showDrawOffer}>
                  <ArrowLeftRight className="w-4 h-4" /> {t.game.draw}
                </button>
                <button onClick={() => setShowResignConfirm(true)} className="btn-danger text-sm flex items-center gap-2">
                  <Flag className="w-4 h-4" /> {t.game.resign}
                </button>
              </div>
            )}

            {gameStatus === 'playing' && (
              <div className="mt-4 max-w-md"><HypePhrases interval={10000} /></div>
            )}
          </div>

          {/* Right: Player info + Prize pool */}
          <div className="w-full lg:w-72 shrink-0 space-y-4 lg:sticky lg:top-4">
            <div className="card p-4 border-gold-400/20">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl ${myColor === 'white' ? 'bg-white/10' : 'bg-dark-600'}`}>
                  {myColor === 'white' ? '♔' : '♚'}
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-white/40 uppercase tracking-wide">{myColor === 'white' ? 'White' : 'Black'}</div>
                  <div className="font-bold font-mono text-sm text-gold-400 truncate">{walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</div>
                </div>
              </div>
              <div className="mt-3"><span className="badge-green text-xs">{t.game.you}</span></div>
            </div>

            <div className="card p-4">
              <div className="text-sm text-white/40 mb-1 flex items-center gap-2">
                <Coins className="w-4 h-4 text-gold-400" />{t.game.prizePool}
              </div>
              <div className="text-3xl font-bold text-gold-400">{totalPot.toFixed(2)} <span className="text-base text-white/40">{t.usdc}</span></div>
              <div className="text-xs text-white/30 mt-2 leading-relaxed">
                {t.game.fee} · Winner: <span className="text-neon-green font-bold">{winnerPayout.toFixed(2)} USDC</span>
              </div>
            </div>

            {gameStatus === 'playing' && (
              <div className={`card p-4 ${isMyTurn ? 'border-neon-green/30' : 'border-neon-red/30'}`}>
                <div className={`flex items-center gap-2 ${isMyTurn ? 'text-neon-green' : 'text-neon-red'}`}>
                  {isMyTurn ? (
                    <><Clock className="w-4 h-4" /><span className="text-sm font-bold">{t.game.yourTurnIndicator}</span></>
                  ) : (
                    <><Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">{t.game.waitingForOpponent}</span></>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ---- Modals ---- */}

        {drawOffered && (
          <div className="modal-overlay">
            <div className="modal-content">
              <ArrowLeftRight className="w-12 h-12 text-neon-blue mx-auto mb-4" />
              <h2 className="text-xl font-bold text-center mb-2">{t.game.drawOffered}</h2>
              <p className="text-white/40 text-center mb-6">{drawOfferedBy} {t.game.drawOfferMsg}</p>
              <div className="flex gap-3">
                <button onClick={acceptDraw} className="btn-neon flex-1 text-center">{t.game.accept}</button>
                <button onClick={declineDraw} className="btn-danger flex-1 text-center">{t.game.decline}</button>
              </div>
            </div>
          </div>
        )}

        {showResignConfirm && (
          <div className="modal-overlay">
            <div className="modal-content">
              <AlertTriangle className="w-12 h-12 text-neon-red mx-auto mb-4" />
              <h2 className="text-xl font-bold text-center mb-2">{t.game.resignConfirm}</h2>
              <p className="text-white/40 text-center mb-6">
                {t.game.resignWarning} {stakeAmount} {t.usdc}. {t.game.resignCantUndo}
              </p>
              <div className="flex gap-3">
                <button onClick={resignGame} className="btn-danger flex-1 text-center">{t.game.resign}</button>
                <button onClick={() => setShowResignConfirm(false)} className="btn-secondary flex-1 text-center">{t.cancel}</button>
              </div>
            </div>
          </div>
        )}

        {gameStatus === 'finished' && gameResult && (
          <>
            {!gameResult.isDraw && gameResult.winnerWallet === walletAddress && (
              <WinnerCelebration winner="you" payout={winnerPayout} />
            )}
            <div className="modal-overlay">
              <div className="modal-content text-center">
                {gameResult.isDraw ? (
                  <><ArrowLeftRight className="w-16 h-16 text-neon-blue mx-auto mb-4" /><h2 className="text-2xl font-bold mb-2">{t.gameOver.drawResult}</h2></>
                ) : gameResult.winnerWallet === walletAddress ? (
                  <><Trophy className="w-16 h-16 text-gold-400 mx-auto mb-4 animate-float" /><h2 className="text-2xl font-bold text-gradient mb-2">{t.gameOver.victory}</h2></>
                ) : (
                  <><Crown className="w-16 h-16 text-white/40 mx-auto mb-4" /><h2 className="text-2xl font-bold mb-2">{t.gameOver.defeat}</h2></>
                )}
                <p className="text-white/40 mb-4">{getResultMessage()}</p>
                <div className="card bg-dark-700/50 mb-6">
                  <div className="text-sm text-white/40 mb-1">{t.game.stake}</div>
                  <div className="text-xl font-bold text-gold-400">{stakeAmount} {t.usdc}</div>
                  {!gameResult.isDraw && (
                    <div className="text-xs text-white/30 mt-1">
                      {gameResult.winnerWallet === walletAddress
                        ? `+${winnerPayout.toFixed(2)} USDC sent to your wallet`
                        : `-${stakeAmount} ${t.gameOver.lost}`}
                    </div>
                  )}
                  {gameResult.payoutResult?.signature && (
                    <a
                      href={`https://solscan.io/tx/${gameResult.payoutResult.signature}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-neon-blue mt-2 inline-block hover:underline"
                    >
                      View payout on Solscan →
                    </a>
                  )}
                </div>
                <button onClick={() => router.push('/lobby')} className="btn-primary w-full text-center">
                  {t.gameOver.backToLobby}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
