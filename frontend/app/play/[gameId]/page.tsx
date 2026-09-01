// ============================================================
// CryptoChess - Game Play Page (Wallet-Only)
// Interactive chessboard with real-time WebSocket gameplay
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
    <div className="w-[480px] h-[480px] bg-dark-700 rounded-xl flex items-center justify-center">
      <div className="text-white/30">Loading board...</div>
    </div>
  ),
});

import {
  ArrowLeft, Crown, Flag, ArrowLeftRight, X, Clock,
  Trophy, AlertTriangle, Loader2, Wallet,
} from 'lucide-react';

export default function GamePage() {
  const { player, walletAddress } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const gameId = params.gameId as string;
  const stakeAmount = parseInt(searchParams.get('stake') || '0');

  const [chess] = useState(() => new Chess());
  const [boardFen, setBoardFen] = useState(chess.fen());
  const [gameStatus, setGameStatus] = useState<string>('connecting');
  const [myColor, setMyColor] = useState<'white' | 'black'>(
    (searchParams.get('color') as 'white' | 'black') || 'white'
  );
  const [opponentWallet, setOpponentWallet] = useState('...');
  const [playerWallets, setPlayerWallets] = useState<{ white: string; black: string }>({ white: 'White', black: 'Black' });

  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showDrawOffer, setShowDrawOffer] = useState(false);
  const [drawOffered, setDrawOffered] = useState(false);
  const [drawOfferedBy, setDrawOfferedBy] = useState('');
  const [gameResult, setGameResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isCheck, setIsCheck] = useState(false);
  const socketRef = useRef<any>(null);

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
      if (state.isCheck !== undefined) { setIsCheck(state.isCheck); if (state.isCheck) sounds.check(); }
      if (state.status === 'active') setGameStatus('playing');
      sounds.gameStart();
      if (['checkmate', 'stalemate', 'draw', 'resigned', 'disconnected'].includes(state.status)) {
        setGameStatus('finished');
        setGameResult({
          status: state.status,
          winnerWallet: state.winnerWallet,
          resultMessage: state.resultMessage,
          isDraw: state.status === 'stalemate' || state.status === 'draw',
        });
      }
    };

    const handleGameStarted = (data: any) => {
      setMyColor(data.color);
      setGameStatus('playing');
      if (data.opponent) setOpponentWallet(data.opponent.wallet.slice(0, 6) + '...' + data.opponent.wallet.slice(-4));
    };

    const handleGameMatched = (data: any) => {
      setMyColor(data.color);
      setGameStatus('playing');
      if (data.opponent) setOpponentWallet(data.opponent.wallet.slice(0, 6) + '...' + data.opponent.wallet.slice(-4));
    };

    const handleMoveError = (data: any) => { setErrorMessage(data.error); setTimeout(() => setErrorMessage(''), 3000); };
    const handleGameError = (data: any) => { setErrorMessage(data.error); setTimeout(() => setErrorMessage(''), 5000); };
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
  }, [walletAddress, gameId, router, chess, myColor]);

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

  return (
    <div className="min-h-screen bg-dark-950">
      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /><span className="text-sm">{t.game.exit}</span>
          </button>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <span className="text-sm text-white/40">{t.game.stake}</span>
            <span className="badge-gold text-sm">{stakeAmount} {t.usdc}</span>
          </div>
        </div>

        {/* Main Layout */}
        <div className="flex flex-col lg:flex-row gap-6 items-start justify-center">
          {/* Left: Opponent */}
          <div className="w-full lg:w-64 space-y-4">
            <div className="card">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${myColor === 'white' ? 'bg-dark-600' : 'bg-white/10'}`}>
                  {<img src="/logo.png" alt="" className="w-6 h-6 rounded" />}
                </div>
                <div>
                  <div className="text-sm text-white/40">{myColor === 'white' ? 'Black' : 'White'}</div>
                  <div className="font-bold font-mono text-sm">{opponentWallet}</div>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="flex items-center gap-2 mb-2">
                {gameStatus === 'playing' && <div className="pulse-dot" />}
                {gameStatus === 'finished' && <Trophy className="w-4 h-4 text-gold-400" />}
                {gameStatus === 'connecting' && <Loader2 className="w-4 h-4 animate-spin text-white/40" />}
                <span className="text-sm font-medium">
                  {gameStatus === 'playing' && (isMyTurn ? t.game.yourTurn : t.game.opponentsTurn)}
                  {gameStatus === 'connecting' && t.game.connecting}
                  {gameStatus === 'finished' && t.gameOver.backToLobby}
                </span>
              </div>
              {gameStatus === 'playing' && (
                <div className="text-xs text-white/30">
                  {chess.turn() === 'w' ? t.game.whiteToMove : t.game.blackToMove}
                  {isCheck && <span className="text-neon-red ml-1">— {t.game.check}</span>}
                </div>
              )}
            </div>
            <div className="card max-h-60 overflow-y-auto">
              <div className="text-sm font-medium text-white/50 mb-2">{t.game.moves}</div>
              <div className="space-y-1 font-mono text-sm">
                {chess.history({ verbose: true }).length === 0 ? (
                  <div className="text-white/20 text-xs">{t.game.noMoves}</div>
                ) : (
                  chess.history({ verbose: true }).map((move: any, i: number) => {
                    if (move.color === 'w') {
                      const blackMove = chess.history({ verbose: true })[i + 1];
                      return (
                        <div key={i} className="flex gap-2">
                          <span className="text-white/30 w-6">{Math.floor(i / 2) + 1}.</span>
                          <span className="text-white/80">{move.san}</span>
                          {blackMove && <span className="text-white/50">{blackMove.san}</span>}
                        </div>
                      );
                    }
                    return null;
                  })
                )}
              </div>
            </div>
          </div>

          {/* Center: Board */}
          <div className="flex flex-col items-center">
            <div className="text-center mb-2 text-sm text-white/30 font-mono">
              {myColor === 'black' ? playerWallets.white : playerWallets.black}
            </div>
            <div className="relative">
              <Chessboard
                position={boardFen}
                onPieceDrop={onDrop}
                boardOrientation={myColor}
                boardWidth={480}
                animationDuration={200}
                arePiecesDraggable={gameStatus === 'playing' && isMyTurn}
                customDarkSquareStyle={{ backgroundColor: '#b58863' }}
                customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
                customBoardStyle={{ borderRadius: '12px', boxShadow: '0 8px 40px rgba(0, 0, 0, 0.6)' }}
                customNotationStyle={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}
              />
              {errorMessage && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-neon-red/90 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg animate-pulse z-10">
                  {errorMessage}
                </div>
              )}
            </div>
            <div className="text-center mt-2 text-sm text-white/30 font-mono">
              {myColor === 'white' ? playerWallets.white : playerWallets.black} ({t.game.you})
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

          {/* Right: Player Info */}
          <div className="w-full lg:w-64 space-y-4">
            <div className="card border-gold-400/20">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${myColor === 'white' ? 'bg-white/10' : 'bg-dark-600'}`}>
                  {myColor === 'white' ? '♔' : '♟'}
                </div>
                <div>
                  <div className="text-sm text-white/40">{myColor === 'white' ? 'White' : 'Black'}</div>
                  <div className="font-bold font-mono text-sm text-gold-400">{walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</div>
                </div>
              </div>
              <div className="badge-green text-xs">{t.game.you}</div>
            </div>

            <div className="card">
              <div className="text-sm text-white/40 mb-2">{t.game.prizePool}</div>
              <div className="text-2xl font-bold text-gold-400">{(stakeAmount * 2).toFixed(0)} {t.usdc}</div>                <div className="text-xs text-white/30 mt-1">
                Winner: {((stakeAmount * 2) * 0.95).toFixed(2)} (5% fee)
              </div>
            </div>

            {gameStatus === 'playing' && (
              <div className={`card ${isMyTurn ? 'border-neon-green/30' : 'border-neon-red/30'}`}>
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
                      ? `+${(stakeAmount * 2 * 0.95).toFixed(2)} USDC sent to your wallet`
                      : `-${stakeAmount} ${t.gameOver.lost}`}
                  </div>
                )}
              </div>
              <button onClick={() => router.push('/lobby')} className="btn-primary w-full text-center">
                {t.gameOver.backToLobby}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
