import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { ArrowLeftRight, Cpu, Globe, Undo2, Users } from 'lucide-react';
import { ConfettiBurst } from '../../components/ConfettiBurst';
import { GameShell } from '../../components/GameShell';
import { OnlineRoomModal } from '../../components/OnlineRoomModal';
import { useGameStation } from '../../context/GameStationContext';
import {
  getSocket,
  leaveOnlineRoom,
  type MultiplayerRoomInfo,
  type OnlineSession,
} from '../../lib/multiplayer';
import { ChessPieceSvg } from './ChessPieces';
import { pickChessAiMove, type ChessDifficulty } from './chessAI';

interface ChessGameProps {
  onBack: () => void;
  initialRoomCode?: string | null;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

const PIECE_WEIGHT: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const ChessGame: React.FC<ChessGameProps> = ({ onBack, initialRoomCode }) => {
  const { addChips, recordGame, sfx } = useGameStation();
  const [fen, setFen] = useState(() => new Chess().fen());
  const [mode, setMode] = useState<'ai' | 'local' | 'online'>(initialRoomCode ? 'online' : 'ai');
  const [humanColor, setHumanColor] = useState<Color>('w');
  const [difficulty, setDifficulty] = useState<ChessDifficulty>('medium');
  const [flipped, setFlipped] = useState(false);
  const [autoFlip, setAutoFlip] = useState(true);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [history, setHistory] = useState<Move[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [glidePieces, setGlidePieces] = useState<Array<{ to: Square; dx: number; dy: number; key: number }>>([]);
  const [captureGhost, setCaptureGhost] = useState<{ sq: Square; type: PieceSymbol; color: Color; key: number } | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);

  // Online multiplayer state
  const [onlineSession, setOnlineSession] = useState<OnlineSession | null>(null);
  const [roomModalOpen, setRoomModalOpen] = useState(Boolean(initialRoomCode));
  const [roomNotice, setRoomNotice] = useState<string | null>(null);

  const moveSeqRef = useRef(0);
  const flipTimerRef = useRef<number | null>(null);
  const recordedRef = useRef(false);
  const flippedRef = useRef(flipped);
  flippedRef.current = flipped;

  const onlineMyColor: Color = onlineSession?.seatIdx === 1 ? 'b' : 'w';
  const activePlayerColor: Color = mode === 'online' ? onlineMyColor : humanColor;

  const chess = useMemo(() => new Chess(fen), [fen]);
  const board = chess.board();

  const legalTargets = useMemo(() => {
    if (!selectedSquare) return new Map<Square, Move>();
    const moves = chess.moves({ square: selectedSquare, verbose: true });
    const map = new Map<Square, Move>();
    for (const m of moves) {
      map.set(m.to, m);
    }
    return map;
  }, [chess, selectedSquare]);

  const gameOver = chess.isGameOver();

  const statusText = useMemo(() => {
    if (mode === 'online' && (!onlineSession || onlineSession.room.players.length < 2)) {
      return onlineSession ? `Menunggu lawan masuk (Kode: ${onlineSession.code})...` : 'Buat atau gabung room online.';
    }
    if (chess.isCheckmate()) {
      const winner = chess.turn() === 'w' ? 'Hitam' : 'Putih';
      return `Skakmat! ${winner} menang.`;
    }
    if (chess.isStalemate()) return 'Remis (Stalemate)!';
    if (chess.isThreefoldRepetition()) return 'Remis (Repetisi 3x)!';
    if (chess.isInsufficientMaterial()) return 'Remis (Material tidak cukup)!';
    if (chess.isDraw()) return 'Permainan berakhir Remis!';
    if (aiThinking) return 'Bot sedang berpikir...';
    const turnLabel = chess.turn() === 'w' ? 'Putih' : 'Hitam';
    return chess.inCheck() ? `SKAK! Giliran ${turnLabel}` : `Giliran ${turnLabel}`;
  }, [chess, aiThinking, mode, onlineSession]);

  const triggerMoveAnimation = useCallback((move: Move, currentFlipped: boolean) => {
    const mult = currentFlipped ? -1 : 1;
    const deltaFor = (f: Square, t: Square) => {
      const fromCol = FILES.indexOf(f[0] as (typeof FILES)[number]);
      const fromRow = RANKS.indexOf(f[1] as (typeof RANKS)[number]);
      const toCol = FILES.indexOf(t[0] as (typeof FILES)[number]);
      const toRow = RANKS.indexOf(t[1] as (typeof RANKS)[number]);
      return { dx: (fromCol - toCol) * mult, dy: (fromRow - toRow) * mult };
    };

    const seq = ++moveSeqRef.current;
    const mainDelta = deltaFor(move.from, move.to);
    const glides = [{ to: move.to, dx: mainDelta.dx, dy: mainDelta.dy, key: seq }];

    if (move.san.startsWith('O-O')) {
      const rank = move.color === 'w' ? '1' : '8';
      if (move.san.startsWith('O-O-O')) {
        const rd = deltaFor(`a${rank}` as Square, `d${rank}` as Square);
        glides.push({ to: `d${rank}` as Square, dx: rd.dx, dy: rd.dy, key: seq });
      } else {
        const rd = deltaFor(`h${rank}` as Square, `f${rank}` as Square);
        glides.push({ to: `f${rank}` as Square, dx: rd.dx, dy: rd.dy, key: seq });
      }
    }

    if (move.captured) {
      setCaptureGhost({
        sq: move.to,
        type: move.captured,
        color: move.color === 'w' ? 'b' : 'w',
        key: seq,
      });
    } else {
      setCaptureGhost(null);
    }

    setGlidePieces(glides);
  }, []);

  const resetGame = useCallback(
    (nextMode: 'ai' | 'local' | 'online' = mode, nextHumanColor: Color = humanColor) => {
      if (flipTimerRef.current !== null) {
        window.clearTimeout(flipTimerRef.current);
        flipTimerRef.current = null;
      }
      if (nextMode === 'online' && onlineSession) {
        getSocket().emit('chess:rematch', { code: onlineSession.code });
        return;
      }
      if (nextMode !== 'online' && onlineSession) {
        leaveOnlineRoom();
        setOnlineSession(null);
      }
      recordedRef.current = false;
      setFen(new Chess().fen());
      setSelectedSquare(null);
      setLastMove(null);
      setGlidePieces([]);
      setCaptureGhost(null);
      setHistory([]);
      setPendingPromotion(null);
      setAiThinking(false);
      setFlipped(nextMode === 'ai' ? nextHumanColor === 'b' : false);
    },
    [humanColor, mode, onlineSession]
  );

  useEffect(() => {
    return () => {
      if (flipTimerRef.current !== null) window.clearTimeout(flipTimerRef.current);
    };
  }, []);

  // Online socket listeners
  useEffect(() => {
    if (mode !== 'online' || !onlineSession) return;
    const socket = getSocket();

    const onRoomUpdate = (payload: { room: MultiplayerRoomInfo; notice?: string }) => {
      setOnlineSession((prev) => (prev ? { ...prev, room: payload.room } : prev));
      if (payload.notice) {
        setRoomNotice(payload.notice);
        window.setTimeout(() => setRoomNotice(null), 2600);
      }
    };

    const onChessState = (payload: {
      fen: string;
      lastMove: { from: Square; to: Square } | null;
      history: Move[];
    }) => {
      const nextHist = payload.history ?? [];
      const latest = nextHist[nextHist.length - 1];
      if (latest) {
        triggerMoveAnimation(latest, flippedRef.current);
        sfx(latest.captured ? 'chessCapture' : 'chess');
      } else {
        recordedRef.current = false;
        setGlidePieces([]);
        setCaptureGhost(null);
      }
      setFen(payload.fen);
      setLastMove(payload.lastMove);
      setHistory(nextHist);
      setSelectedSquare(null);
      setPendingPromotion(null);
    };

    socket.on('room:update', onRoomUpdate);
    socket.on('chess:state', onChessState);

    return () => {
      socket.off('room:update', onRoomUpdate);
      socket.off('chess:state', onChessState);
    };
  }, [mode, onlineSession?.code, sfx, triggerMoveAnimation]);

  const commitMove = useCallback(
    (from: Square, to: Square, promotion?: PieceSymbol) => {
      if (mode === 'online') {
        if (!onlineSession) return false;
        getSocket().emit(
          'chess:move',
          { code: onlineSession.code, from, to, promotion: promotion ?? 'q' },
          (res: { ok: boolean; error?: string }) => {
            if (!res?.ok && res?.error) {
              setRoomNotice(res.error);
            }
          }
        );
        setSelectedSquare(null);
        setPendingPromotion(null);
        return true;
      }

      const next = new Chess(fen);
      try {
        const move = next.move({ from, to, promotion: promotion ?? 'q' });
        if (!move) return false;

        triggerMoveAnimation(move, flipped);
        setFen(next.fen());
        setLastMove({ from: move.from, to: move.to });
        setHistory((prev) => [...prev, move]);
        setSelectedSquare(null);
        setPendingPromotion(null);
        sfx(move.captured ? 'chessCapture' : 'chess');

        if (mode === 'local' && autoFlip && !next.isGameOver()) {
          if (flipTimerRef.current !== null) window.clearTimeout(flipTimerRef.current);
          const nextIsBlack = next.turn() === 'b';
          flipTimerRef.current = window.setTimeout(() => {
            setFlipped(nextIsBlack);
            flipTimerRef.current = null;
          }, 280);
        }

        return true;
      } catch {
        return false;
      }
    },
    [autoFlip, fen, flipped, mode, onlineSession, sfx, triggerMoveAnimation]
  );

  useEffect(() => {
    if (glidePieces.length === 0 && !captureGhost) return;
    const clearTimer = window.setTimeout(() => {
      setGlidePieces([]);
      setCaptureGhost(null);
    }, 260);
    return () => window.clearTimeout(clearTimer);
  }, [glidePieces, captureGhost]);

  // Record win/loss
  useEffect(() => {
    if (gameOver && !recordedRef.current) {
      recordedRef.current = true;
      if (chess.isCheckmate()) {
        const humanWon = mode === 'local' || chess.turn() !== activePlayerColor;
        recordGame('chess', humanWon);
        if ((mode === 'ai' || mode === 'online') && humanWon) {
          addChips(600);
          setConfettiKey((k) => k + 1);
          sfx('win');
        } else if (mode === 'ai' || mode === 'online') {
          sfx('lose');
        } else {
          setConfettiKey((k) => k + 1);
          sfx('win');
        }
      } else {
        recordGame('chess', false);
      }
    }
  }, [gameOver, chess, mode, activePlayerColor, addChips, recordGame, sfx]);

  // AI move when it's not the human's turn
  useEffect(() => {
    if (mode !== 'ai' || gameOver || chess.turn() === humanColor) return;
    setAiThinking(true);

    const timer = window.setTimeout(() => {
      const aiMove = pickChessAiMove(fen, difficulty);
      setAiThinking(false);
      if (aiMove) {
        commitMove(aiMove.from, aiMove.to, aiMove.promotion);
      }
    }, 320);

    return () => {
      window.clearTimeout(timer);
      setAiThinking(false);
    };
  }, [mode, gameOver, chess, humanColor, fen, difficulty, commitMove]);

  const handleSquareClick = (sq: Square) => {
    if (gameOver || aiThinking || pendingPromotion) return;
    if (mode === 'ai' && chess.turn() !== humanColor) return;
    if (mode === 'online') {
      if (!onlineSession || onlineSession.room.players.length < 2) return;
      if (chess.turn() !== onlineMyColor) return;
    }

    const targetMove = legalTargets.get(sq);
    if (selectedSquare && targetMove) {
      const allForTarget = chess
        .moves({ square: selectedSquare, verbose: true })
        .filter((m) => m.to === sq && m.promotion);
      if (allForTarget.length > 0) {
        setPendingPromotion({ from: selectedSquare, to: sq });
        return;
      }
      commitMove(selectedSquare, sq);
      return;
    }

    const piece = chess.get(sq);
    if (piece && piece.color === chess.turn()) {
      sfx('click');
      setSelectedSquare(sq === selectedSquare ? null : sq);
    } else {
      setSelectedSquare(null);
    }
  };

  const handleUndo = () => {
    if (mode === 'online' || aiThinking || history.length === 0) return;
    sfx('click');
    if (flipTimerRef.current !== null) {
      window.clearTimeout(flipTimerRef.current);
      flipTimerRef.current = null;
    }
    const stepsBack = mode === 'ai' && chess.turn() === humanColor && history.length >= 2 ? 2 : 1;
    const nextHistory = history.slice(0, history.length - stepsBack);
    const replay = new Chess();
    for (const m of nextHistory) {
      replay.move({ from: m.from, to: m.to, promotion: m.promotion });
    }
    recordedRef.current = false;
    setFen(replay.fen());
    setHistory(nextHistory);
    setSelectedSquare(null);
    if (mode === 'local' && autoFlip) {
      setFlipped(replay.turn() === 'b');
    }
    const prevLast = nextHistory[nextHistory.length - 1];
    setLastMove(prevLast ? { from: prevLast.from, to: prevLast.to } : null);
  };

  // Captured pieces & material
  const capturedByWhite: PieceSymbol[] = [];
  const capturedByBlack: PieceSymbol[] = [];
  let materialDiff = 0;
  for (const m of history) {
    if (m.captured) {
      if (m.color === 'w') {
        capturedByWhite.push(m.captured);
        materialDiff += PIECE_WEIGHT[m.captured];
      } else {
        capturedByBlack.push(m.captured);
        materialDiff -= PIECE_WEIGHT[m.captured];
      }
    }
  }

  const displayRanks = flipped ? [...RANKS].reverse() : [...RANKS];
  const displayFiles = flipped ? [...FILES].reverse() : [...FILES];

  let checkedSquare: Square | null = null;
  if (chess.inCheck()) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.type === 'k' && p.color === chess.turn()) {
          checkedSquare = `${FILES[c]}${RANKS[r]}` as Square;
        }
      }
    }
  }

  const bottomColor: Color = flipped ? 'b' : 'w';
  const topColor: Color = flipped ? 'w' : 'b';

  const getPlayerHud = (color: Color) => {
    const isWhite = color === 'w';
    let label = isWhite ? 'Pemain 1 (Putih)' : 'Pemain 2 (Hitam)';
    if (mode === 'online') {
      const seat = isWhite ? onlineSession?.room.players[0] : onlineSession?.room.players[1];
      const suffix = isWhite ? 'Putih' : 'Hitam';
      label = seat ? `${seat.name} (${suffix})` : `Menunggu (${suffix})`;
    } else if (mode === 'ai') {
      label =
        color === humanColor
          ? isWhite
            ? 'Kamu (Putih)'
            : 'Kamu (Hitam)'
          : isWhite
            ? 'Bot Putih'
            : 'Bot Hitam';
    }
    const captured = isWhite ? capturedByWhite : capturedByBlack;
    const capturedColor: Color = isWhite ? 'b' : 'w';
    const adv = isWhite ? materialDiff : -materialDiff;
    return { label, captured, capturedColor, adv };
  };

  const topHud = getPlayerHud(topColor);
  const bottomHud = getPlayerHud(bottomColor);

  const handleOnlineConnected = (session: OnlineSession) => {
    recordedRef.current = false;
    setMode('online');
    setOnlineSession(session);
    // Lock perspective: P1 (White) always sees White at bottom, P2 (Black) always sees Black at bottom
    setFlipped(session.seatIdx === 1);
    setFen(new Chess().fen());
    setHistory([]);
    setLastMove(null);
    setSelectedSquare(null);
  };

  return (
    <GameShell
      title="Catur Master"
      subtitle="Aturan lengkap: Rokade, En Passant, Promosi, AI & Mabar Online"
      onBack={() => {
        leaveOnlineRoom();
        onBack();
      }}
      onRestart={() => resetGame()}
      controls={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-800/80 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => {
                sfx('click');
                setMode('ai');
                resetGame('ai', humanColor);
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer ${
                mode === 'ai' ? 'bg-indigo-600 text-white' : 'text-slate-300'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" /> vs AI
            </button>
            <button
              type="button"
              onClick={() => {
                sfx('click');
                setMode('local');
                resetGame('local', humanColor);
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer ${
                mode === 'local' ? 'bg-indigo-600 text-white' : 'text-slate-300'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> 2P Lokal
            </button>
            <button
              type="button"
              onClick={() => {
                sfx('click');
                setMode('online');
                setRoomModalOpen(true);
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer ${
                mode === 'online' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-300'
              }`}
            >
              <Globe className="w-3.5 h-3.5" /> Online
            </button>
          </div>

          {mode === 'online' ? (
            <button
              type="button"
              onClick={() => setRoomModalOpen(true)}
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer"
            >
              {onlineSession ? `Room: ${onlineSession.code} (${onlineSession.room.players.length}/2)` : 'Buat / Gabung Room'}
            </button>
          ) : mode === 'ai' ? (
            <>
              <div className="inline-flex rounded-xl border border-slate-700 bg-slate-800/80 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    sfx('click');
                    setHumanColor('w');
                    resetGame('ai', 'w');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                    humanColor === 'w' ? 'bg-slate-200 text-slate-900' : 'text-slate-300'
                  }`}
                >
                  Putih
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sfx('click');
                    setHumanColor('b');
                    resetGame('ai', 'b');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                    humanColor === 'b' ? 'bg-slate-950 text-white' : 'text-slate-300'
                  }`}
                >
                  Hitam
                </button>
              </div>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as ChessDifficulty)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none"
              >
                <option value="easy">AI: Mudah</option>
                <option value="medium">AI: Sedang</option>
                <option value="hard">AI: Sulit</option>
              </select>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                sfx('click');
                const nextAuto = !autoFlip;
                setAutoFlip(nextAuto);
                if (nextAuto) setFlipped(chess.turn() === 'b');
              }}
              className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold cursor-pointer transition ${
                autoFlip
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                  : 'border-slate-700 bg-slate-800 text-slate-300'
              }`}
            >
              Auto-Putar: {autoFlip ? 'Aktif' : 'Mati'}
            </button>
          )}
        </div>
      }
      rules={[
        'Klik bidak untuk melihat langkah legal (titik hijau = kotak kosong, cincin = tangkap bidak lawan).',
        'Mode Online (Mabar): Buat Room dan bagikan Kode / Link Invite ke temanmu. Layar P1 selalu Putih di bawah, layar P2 selalu Hitam di bawah!',
        'Mode 2P Lokal mendukung Auto-Putar 180° setiap giliran berpindah.',
        'Menang Skakmat melawan AI atau lawan Online memberikan hadiah +600 Chip.',
      ]}
    >
      {roomNotice && (
        <div className="mb-3 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-4 py-2 text-xs font-semibold text-indigo-200 text-center">
          {roomNotice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,560px)_1fr] gap-6 items-start justify-center">
        {/* Board Column */}
        <div className="mx-auto w-full max-w-[560px] space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="font-bold text-white">{topHud.label}</span>
              <div className="flex items-center gap-0.5">
                {topHud.captured.map((p, idx) => (
                  <span key={idx} className="w-4 h-4 inline-block">
                    <ChessPieceSvg type={p} color={topHud.capturedColor} className="w-full h-full" />
                  </span>
                ))}
              </div>
              {topHud.adv > 0 && (
                <span className="text-emerald-400 font-mono-num font-bold">+{topHud.adv}</span>
              )}
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border ${
                chess.inCheck() || chess.isCheckmate()
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-slate-800 text-slate-200 border-slate-700'
              }`}
            >
              {statusText}
            </span>
          </div>

          {/* 8x8 Chessboard */}
          <div className="rounded-2xl p-2 pt-3.5 sm:p-3 sm:pt-4 wood-frame border border-amber-900/50 shadow-2xl">
            <div className="grid grid-cols-8 grid-rows-8 aspect-square w-full rounded-lg overflow-visible border border-amber-950/80">
              {displayRanks.map((rank, displayRowIdx) =>
                displayFiles.map((file, displayColIdx) => {
                  const sq = `${file}${rank}` as Square;
                  const fileIdx = FILES.indexOf(file);
                  const rankIdx = RANKS.indexOf(rank);
                  const isLight = (fileIdx + rankIdx) % 2 === 0;
                  const piece = board[rankIdx][fileIdx];
                  const isSelected = selectedSquare === sq;
                  const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
                  const legal = legalTargets.get(sq);
                  const isChecked = checkedSquare === sq;

                  let bgClass = isLight ? 'bg-[#ecd7b2]' : 'bg-[#a6764c]';
                  if (isLast) bgClass = isLight ? 'bg-[#f4e285]' : 'bg-[#c5a44e]';
                  if (isSelected) bgClass = 'bg-emerald-400/80';
                  if (isChecked) bgClass = 'bg-rose-500/85';

                  const cornerRadius =
                    displayRowIdx === 0 && displayColIdx === 0
                      ? 'rounded-tl-md'
                      : displayRowIdx === 0 && displayColIdx === 7
                        ? 'rounded-tr-md'
                        : displayRowIdx === 7 && displayColIdx === 0
                          ? 'rounded-bl-md'
                          : displayRowIdx === 7 && displayColIdx === 7
                            ? 'rounded-br-md'
                            : '';

                  const glide = glidePieces.find((g) => g.to === sq);
                  const squareZ = glide || isSelected ? 30 : displayRowIdx + 1;

                  return (
                    <button
                      key={sq}
                      type="button"
                      data-square={sq}
                      onClick={() => handleSquareClick(sq)}
                      style={{
                        backgroundImage: isLight
                          ? "url('/assets/textures/plywood.jpg')"
                          : "url('/assets/textures/dark_wood.jpg')",
                        backgroundSize: '260px 260px',
                        backgroundBlendMode: 'soft-light',
                        zIndex: squareZ,
                      }}
                      className={`relative w-full h-full min-w-0 min-h-0 overflow-visible flex items-center justify-center ${cornerRadius} ${bgClass} select-none cursor-pointer transition-colors`}
                    >
                      {file === displayFiles[0] && (
                        <span
                          className={`absolute top-0.5 left-1 text-[9px] font-bold leading-none z-10 ${
                            isLight ? 'text-amber-900/70' : 'text-amber-100/75'
                          }`}
                        >
                          {rank}
                        </span>
                      )}
                      {rank === displayRanks[displayRanks.length - 1] && (
                        <span
                          className={`absolute bottom-0.5 right-1 text-[9px] font-bold leading-none z-10 ${
                            isLight ? 'text-amber-900/70' : 'text-amber-100/75'
                          }`}
                        >
                          {file}
                        </span>
                      )}

                      {captureGhost && captureGhost.sq === sq && (
                        <div
                          key={`ghost-${captureGhost.key}`}
                          className="absolute inset-0 flex items-end justify-center pb-[7%] pointer-events-none animate-capture-fade"
                        >
                          <ChessPieceSvg type={captureGhost.type} color={captureGhost.color} />
                        </div>
                      )}

                      {piece && (() => {
                        const isMovable =
                          !gameOver &&
                          !aiThinking &&
                          piece.color === chess.turn() &&
                          (mode === 'local' ||
                            (mode === 'ai' && chess.turn() === humanColor) ||
                            (mode === 'online' &&
                              Boolean(onlineSession && onlineSession.room.players.length >= 2) &&
                              chess.turn() === onlineMyColor));
                        const glideStyle = glide
                          ? ({
                              '--from-x': `${glide.dx * 100}%`,
                              '--from-y': `${glide.dy * 100}%`,
                            } as React.CSSProperties)
                          : undefined;
                        return (
                          <div
                            key={glide ? `glide-${glide.key}-${sq}` : sq}
                            style={glideStyle}
                            className={`absolute inset-0 flex items-end justify-center pb-[7%] pointer-events-none ${
                              glide ? 'animate-chess-glide' : ''
                            } ${isMovable ? 'transition-transform duration-150 hover:scale-105' : ''} ${
                              isSelected ? 'scale-110' : ''
                            }`}
                          >
                            <ChessPieceSvg type={piece.type} color={piece.color} />
                          </div>
                        );
                      })()}

                      {legal && !piece && (
                        <span className="relative z-20 w-3.5 h-3.5 rounded-full bg-emerald-950/35 ring-2 ring-emerald-400/50 transition-transform duration-150" />
                      )}
                      {legal && piece && (
                        <span className="absolute inset-1 z-20 rounded-full border-[3px] border-emerald-500/80 pointer-events-none" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="font-bold text-white">{bottomHud.label}</span>
              <div className="flex items-center gap-0.5">
                {bottomHud.captured.map((p, idx) => (
                  <span key={idx} className="w-4 h-4 inline-block">
                    <ChessPieceSvg type={p} color={bottomHud.capturedColor} className="w-full h-full" />
                  </span>
                ))}
              </div>
              {bottomHud.adv > 0 && (
                <span className="text-emerald-400 font-mono-num font-bold">+{bottomHud.adv}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {mode !== 'online' && (
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={history.length === 0 || aiThinking}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" /> Undo
                </button>
              )}
              <button
                type="button"
                onClick={() => setFlipped((f) => !f)}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" /> Putar Papan
              </button>
            </div>
          </div>
        </div>

        {/* Move History Sidebar */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Catatan Langkah</h3>
            <span className="text-xs text-slate-400 font-mono-num">{history.length} langkah</span>
          </div>

          <div className="max-h-[400px] overflow-y-auto rounded-xl border border-slate-800/90 bg-slate-950/60 p-2 space-y-1 text-xs font-mono-num">
            {history.length === 0 ? (
              <p className="text-slate-500 text-center py-8 font-sans">Belum ada langkah dimainkan.</p>
            ) : (
              Array.from({ length: Math.ceil(history.length / 2) }).map((_, rowIdx) => {
                const whiteMove = history[rowIdx * 2];
                const blackMove = history[rowIdx * 2 + 1];
                return (
                  <div key={rowIdx} className="grid grid-cols-[34px_1fr_1fr] gap-2 px-2 py-1 rounded hover:bg-slate-800/50">
                    <span className="text-slate-500">{rowIdx + 1}.</span>
                    <span className="text-slate-100 font-semibold">{whiteMove?.san}</span>
                    <span className="text-slate-300">{blackMove?.san ?? ''}</span>
                  </div>
                );
              })
            )}
          </div>

          {gameOver && (
            <button
              type="button"
              onClick={() => resetGame()}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-500 transition cursor-pointer"
            >
              {mode === 'online' ? 'Main Ulang (Rematch)' : 'Main Pertandingan Baru'}
            </button>
          )}
        </div>
      </div>

      {/* Pawn Promotion Modal */}
      {pendingPromotion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl animate-pop-in space-y-3 text-center">
            <h3 className="text-base font-bold text-white">Promosi Pion</h3>
            <div className="flex items-center gap-3">
              {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map((pieceType) => (
                <button
                  key={pieceType}
                  type="button"
                  onClick={() => commitMove(pendingPromotion.from, pendingPromotion.to, pieceType)}
                  className="w-16 h-16 rounded-xl border border-slate-700 bg-slate-800 hover:bg-indigo-600/30 hover:border-indigo-400 flex items-center justify-center cursor-pointer transition"
                >
                  <ChessPieceSvg type={pieceType} color={chess.turn()} className="w-12 h-12" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <OnlineRoomModal
        open={roomModalOpen}
        gameId="chess"
        gameTitle="Catur Master"
        initialJoinCode={initialRoomCode}
        activeSession={onlineSession}
        onConnected={handleOnlineConnected}
        onClose={() => setRoomModalOpen(false)}
      />

      <ConfettiBurst trigger={confettiKey} />
    </GameShell>
  );
};
