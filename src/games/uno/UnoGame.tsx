import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, Flame, Globe, Play, RotateCw, ShieldAlert, Trophy, Users } from 'lucide-react';
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
import {
  applySharedUnoCall,
  applySharedUnoDraw,
  applySharedUnoPlay,
  chooseBestAiCard,
  createSharedUnoMatch,
  isCardPlayable,
  isSevenZeroVariant,
  UNO_COLOR_LABELS,
  UNO_COLORS,
  UNO_VARIANT_META,
  type SharedUnoMatch,
  type UnoCard,
  type UnoColor,
  type UnoVariant,
} from './unoEngine';
import { LastOneCard, LastOneDrawDeck } from './LastOneCard';
import {
  DirectionGlowRing,
  MoveHistoryChat,
  OpponentSeat,
  SeatAvatar,
  type MoveLogEntry,
  type TableOpponent,
} from './UnoTableParts';

interface UnoGameProps {
  onBack: () => void;
  initialRoomCode?: string | null;
  initialOnline?: boolean;
}

interface OnlineUnoState {
  variant: UnoVariant;
  started: boolean;
  mySeatIdx: number;
  myHand: UnoCard[];
  players: Array<{
    id: string;
    name: string;
    seatIdx: number;
    cardCount: number;
    saidUno: boolean;
    eliminated: boolean;
    isBot: boolean;
    connected: boolean;
  }>;
  drawCount: number;
  topCard: UnoCard;
  activeColor: UnoColor;
  currentTurn: number;
  direction: 1 | -1;
  pendingDraw: number;
  pendingDrawMin: number;
  winnerIndex: number | null;
  lastBurst: { id: number; text: string } | null;
  statusText: string;
}

const COLOR_STYLES: Record<UnoColor, { bg: string; ring: string; pill: string }> = {
  red: {
    bg: 'from-rose-500 to-red-700 border-rose-300/60',
    ring: 'bg-rose-500 shadow-rose-500/40',
    pill: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
  blue: {
    bg: 'from-sky-500 to-blue-700 border-sky-300/60',
    ring: 'bg-sky-500 shadow-sky-500/40',
    pill: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
  green: {
    bg: 'from-emerald-500 to-green-700 border-emerald-300/60',
    ring: 'bg-emerald-500 shadow-emerald-500/40',
    pill: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
  yellow: {
    bg: 'from-amber-400 to-yellow-600 border-amber-200/70 text-slate-950',
    ring: 'bg-amber-400 shadow-amber-400/40',
    pill: 'bg-amber-400/20 text-amber-200 border-amber-400/40',
  },
};

const ALL_VARIANTS: UnoVariant[] = ['classic', 'stack', 'sevenzero', 'nomercy', 'allwild'];

function createOfflineMatch(aiCount: number, variant: UnoVariant): SharedUnoMatch {
  const botNames = ['Bot Raka', 'Bot Sinta', 'Bot Budi', 'Bot Dewi', 'Bot Dimas'];
  const clampedAi = Math.max(1, Math.min(5, aiCount));
  const seats = [
    { id: 'human', name: 'Kamu', isBot: false },
    ...botNames.slice(0, clampedAi).map((name, i) => ({ id: `bot-${i + 1}`, name, isBot: true })),
  ];
  return createSharedUnoMatch(variant, seats);
}

function cloneMatch(m: SharedUnoMatch): SharedUnoMatch {
  return {
    ...m,
    players: m.players.map((p) => ({ ...p, hand: [...p.hand] })),
    drawPile: [...m.drawPile],
    discardPile: [...m.discardPile],
  };
}

export const UnoGame: React.FC<UnoGameProps> = ({ onBack, initialRoomCode, initialOnline }) => {
  const { addChips, recordGame, sfx } = useGameStation();
  const startInOnline = Boolean(initialRoomCode || initialOnline);
  const [mode, setMode] = useState<'ai' | 'online'>(startInOnline ? 'online' : 'ai');
  const [variant, setVariant] = useState<UnoVariant>('classic');
  const [aiCount, setAiCount] = useState<number>(3);
  const [match, setMatch] = useState<SharedUnoMatch>(() => createOfflineMatch(3, 'classic'));
  const [pendingWildCard, setPendingWildCard] = useState<UnoCard | null>(null);
  const [pendingSwapCard, setPendingSwapCard] = useState<UnoCard | null>(null);
  const [actionBurst, setActionBurst] = useState<{ id: number; text: string; tone: string } | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);
  const [moveLog, setMoveLog] = useState<MoveLogEntry[]>([]);

  // Online multiplayer state
  const [onlineSession, setOnlineSession] = useState<OnlineSession | null>(null);
  const [onlineUno, setOnlineUno] = useState<OnlineUnoState | null>(null);
  const [onlineWildCard, setOnlineWildCard] = useState<UnoCard | null>(null);
  const [onlineSwapCard, setOnlineSwapCard] = useState<UnoCard | null>(null);
  const [fillBots, setFillBots] = useState(true);
  const [roomModalOpen, setRoomModalOpen] = useState(startInOnline);

  const rewardGrantedRef = useRef(false);
  const lastBurstIdRef = useRef<number | null>(null);

  const triggerBurst = useCallback((text: string, tone = 'bg-gradient-to-r from-amber-400 to-rose-500 text-slate-950') => {
    setActionBurst({ id: Date.now() + Math.random(), text, tone });
  }, []);

  const resetGame = useCallback(
    (nextMode: 'ai' | 'online' = mode, nextAiCount: number = aiCount, nextVariant: UnoVariant = variant) => {
      rewardGrantedRef.current = false;
      setActionBurst(null);
      setMoveLog([]);
      setPendingWildCard(null);
      setPendingSwapCard(null);
      setOnlineWildCard(null);
      setOnlineSwapCard(null);
      if (nextMode !== 'online') {
        if (onlineSession) {
          leaveOnlineRoom();
          setOnlineSession(null);
          setOnlineUno(null);
        }
        setMatch(createOfflineMatch(nextAiCount, nextVariant));
      } else if (onlineSession && onlineSession.room.hostId === onlineSession.playerId) {
        getSocket().emit('uno:start', { code: onlineSession.code, fillBots, variant: nextVariant });
      }
    },
    [aiCount, fillBots, mode, onlineSession, variant]
  );

  // Online socket listeners
  useEffect(() => {
    if (mode !== 'online' || !onlineSession) return;
    const socket = getSocket();

    const onRoomUpdate = (payload: { room: MultiplayerRoomInfo }) => {
      setOnlineSession((prev) => (prev ? { ...prev, room: payload.room } : prev));
    };

    const onUnoState = (uState: OnlineUnoState) => {
      sfx('card');
      setOnlineUno(uState);
      if (uState.variant) setVariant(uState.variant);
      setOnlineWildCard(null);
      setOnlineSwapCard(null);
      if (uState.lastBurst && uState.lastBurst.id !== lastBurstIdRef.current) {
        lastBurstIdRef.current = uState.lastBurst.id;
        triggerBurst(uState.lastBurst.text);
      }
      if (uState.winnerIndex !== null && !rewardGrantedRef.current) {
        rewardGrantedRef.current = true;
        const won = uState.winnerIndex === uState.mySeatIdx;
        recordGame('uno', won);
        if (won) {
          addChips(500);
          setConfettiKey((k) => k + 1);
          sfx('win');
        } else {
          sfx('lose');
        }
      }
    };

    socket.on('room:update', onRoomUpdate);
    socket.on('uno:state', onUnoState);

    return () => {
      socket.off('room:update', onRoomUpdate);
      socket.off('uno:state', onUnoState);
    };
  }, [addChips, mode, onlineSession?.code, recordGame, sfx, triggerBurst]);

  // Burst feedback for offline AI & player actions
  useEffect(() => {
    if (mode === 'online' || !match.lastBurst) return;
    if (match.lastBurst.id !== lastBurstIdRef.current) {
      lastBurstIdRef.current = match.lastBurst.id;
      triggerBurst(match.lastBurst.text);
    }
  }, [match.lastBurst, mode, triggerBurst]);

  // Winner reward & stats (offline vs Bot)
  useEffect(() => {
    if (mode !== 'online' && match.winnerIndex !== null && !rewardGrantedRef.current) {
      rewardGrantedRef.current = true;
      const humanWon = match.winnerIndex === 0;
      recordGame('uno', humanWon);
      if (humanWon) {
        addChips(500);
        setConfettiKey((k) => k + 1);
        sfx('win');
      } else {
        sfx('lose');
      }
    }
  }, [mode, match.winnerIndex, addChips, recordGame, sfx]);

  // AI Turn Loop (offline)
  useEffect(() => {
    if (mode === 'online' || match.winnerIndex !== null || pendingWildCard || pendingSwapCard) return;
    const current = match.players[match.currentTurn];
    if (!current || !current.isBot || current.eliminated) return;

    const timer = window.setTimeout(() => {
      setMatch((prev) => {
        if (prev.winnerIndex !== null) return prev;
        const active = prev.players[prev.currentTurn];
        if (!active || !active.isBot || active.eliminated) return prev;
        const next = cloneMatch(prev);
        const top = next.discardPile[next.discardPile.length - 1];
        const decision = chooseBestAiCard(
          active.hand,
          top,
          next.activeColor,
          next.pendingDraw,
          next.pendingDrawMin,
          next.variant
        );
        if (decision) {
          applySharedUnoPlay(next, active.id, decision.card.id, decision.chosenColor);
        } else {
          applySharedUnoDraw(next, active.id);
        }
        return next;
      });
      sfx('card');
    }, 850);

    return () => window.clearTimeout(timer);
  }, [mode, match, pendingWildCard, pendingSwapCard, sfx]);

  // Derived view state for both Offline & Online
  const isOnlinePlaying = mode === 'online' && Boolean(onlineUno?.started);
  const activeVariant: UnoVariant = isOnlinePlaying ? onlineUno!.variant : variant;
  const mySeatIdx = isOnlinePlaying ? onlineUno!.mySeatIdx : 0;
  const myHand = isOnlinePlaying ? onlineUno!.myHand : match.players[0].hand;
  const myPlayerMeta = isOnlinePlaying
    ? onlineUno!.players[mySeatIdx]
    : {
        id: match.players[0].id,
        name: match.players[0].name,
        saidUno: match.players[0].saidUno,
        eliminated: match.players[0].eliminated,
      };

  const opponentSeats = isOnlinePlaying
    ? onlineUno!.players.filter((p) => p.seatIdx !== mySeatIdx)
    : match.players.slice(1).map((p) => ({
        id: p.id,
        name: p.name,
        seatIdx: p.seatIdx,
        cardCount: p.hand.length,
        saidUno: p.saidUno,
        eliminated: p.eliminated,
        isBot: p.isBot,
        connected: p.connected,
      }));

  const aliveOpponents = opponentSeats.filter((p) => !p.eliminated);
  const topCard = isOnlinePlaying ? onlineUno!.topCard : match.discardPile[match.discardPile.length - 1];
  const activeColor = isOnlinePlaying ? onlineUno!.activeColor : match.activeColor;
  const direction = isOnlinePlaying ? onlineUno!.direction : match.direction;
  const drawCount = isOnlinePlaying ? onlineUno!.drawCount : match.drawPile.length;
  const pendingDraw = isOnlinePlaying ? onlineUno!.pendingDraw : match.pendingDraw;
  const pendingDrawMin = isOnlinePlaying ? onlineUno!.pendingDrawMin : match.pendingDrawMin;
  const currentTurnIdx = isOnlinePlaying ? onlineUno!.currentTurn : match.currentTurn;
  const winnerIdx = isOnlinePlaying ? onlineUno!.winnerIndex : match.winnerIndex;
  const statusText = isOnlinePlaying ? onlineUno!.statusText : match.statusText;
  const activeWildCard = isOnlinePlaying ? onlineWildCard : pendingWildCard;
  const activeSwapCard = isOnlinePlaying ? onlineSwapCard : pendingSwapCard;

  useEffect(() => {
    const trimmed = statusText.trim();
    if (!trimmed) return;
    setMoveLog((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].text === trimmed) return prev;
      return [...prev.slice(-24), { id: Date.now() + Math.random(), text: trimmed }];
    });
  }, [statusText]);

  const isHumanTurn =
    (mode === 'online' ? isOnlinePlaying : true) &&
    currentTurnIdx === mySeatIdx &&
    winnerIdx === null &&
    !myPlayerMeta?.eliminated &&
    !activeWildCard &&
    !activeSwapCard;

  const hasPlayableCard =
    isHumanTurn &&
    myHand.some((c) => isCardPlayable(c, topCard, activeColor, pendingDraw, pendingDrawMin, activeVariant));

  const submitPlay = (card: UnoCard, chosenColor?: UnoColor, swapTargetId?: string) => {
    sfx('card');
    if (isOnlinePlaying && onlineSession) {
      getSocket().emit('uno:play', {
        code: onlineSession.code,
        cardId: card.id,
        chosenColor,
        swapTargetId,
      });
      setOnlineWildCard(null);
      setOnlineSwapCard(null);
    } else {
      setMatch((prev) => {
        const next = cloneMatch(prev);
        applySharedUnoPlay(next, 'human', card.id, chosenColor, swapTargetId);
        return next;
      });
      setPendingWildCard(null);
      setPendingSwapCard(null);
    }
  };

  const handleCardClick = (card: UnoCard) => {
    if (!isHumanTurn) return;
    if (!isCardPlayable(card, topCard, activeColor, pendingDraw, pendingDrawMin, activeVariant)) return;

    // 7-0 Chaos & No Mercy: Playing 7 with 2+ alive opponents opens Swap Target selector
    if (isSevenZeroVariant(activeVariant) && card.value === '7' && myHand.length > 1 && aliveOpponents.length >= 2) {
      sfx('click');
      if (isOnlinePlaying) setOnlineSwapCard(card);
      else setPendingSwapCard(card);
      return;
    }

    // Wild cards open Color Picker EXCEPT in All Wild mode
    if (card.color === 'wild' && activeVariant !== 'allwild') {
      sfx('click');
      if (isOnlinePlaying) setOnlineWildCard(card);
      else setPendingWildCard(card);
      return;
    }

    submitPlay(card, activeVariant === 'allwild' ? 'red' : undefined);
  };

  const handleWildSelect = (color: UnoColor) => {
    if (!activeWildCard) return;
    submitPlay(activeWildCard, color);
  };

  const handleSwapSelect = (targetId: string) => {
    if (!activeSwapCard) return;
    submitPlay(activeSwapCard, undefined, targetId);
  };

  const handleDrawClick = () => {
    if (!isHumanTurn) return;
    sfx('card');
    if (isOnlinePlaying && onlineSession) {
      getSocket().emit('uno:draw', { code: onlineSession.code });
    } else {
      setMatch((prev) => {
        const next = cloneMatch(prev);
        applySharedUnoDraw(next, 'human');
        return next;
      });
    }
  };

  const handleCallUno = () => {
    sfx('uno');
    if (isOnlinePlaying && onlineSession) {
      getSocket().emit('uno:call', { code: onlineSession.code });
      return;
    }
    setMatch((prev) => {
      const next = cloneMatch(prev);
      applySharedUnoCall(next, 'human');
      return next;
    });
  };

  const winnerName =
    winnerIdx === null
      ? ''
      : isOnlinePlaying
        ? onlineUno!.players[winnerIdx]?.name ?? ''
        : match.players[winnerIdx]?.name ?? '';

  const isHostOrOffline =
    mode !== 'online' || !onlineSession || onlineSession.room.hostId === onlineSession.playerId;

  const totalSeats = isOnlinePlaying ? onlineUno!.players.length : match.players.length;
  const orderedOpponents: TableOpponent[] = [];
  for (let offset = 1; offset < totalSeats; offset++) {
    const idx = (mySeatIdx + offset) % totalSeats;
    const opp = opponentSeats.find((p) => p.seatIdx === idx);
    if (opp) orderedOpponents.push(opp);
  }

  let leftSeat: TableOpponent | null = null;
  let rightSeat: TableOpponent | null = null;
  let topSeats: TableOpponent[] = [];
  if (orderedOpponents.length === 1) {
    topSeats = [orderedOpponents[0]];
  } else if (orderedOpponents.length === 2) {
    leftSeat = orderedOpponents[0];
    rightSeat = orderedOpponents[1];
  } else if (orderedOpponents.length >= 3) {
    leftSeat = orderedOpponents[0];
    topSeats = orderedOpponents.slice(1, orderedOpponents.length - 1);
    rightSeat = orderedOpponents[orderedOpponents.length - 1];
  }

  const fanOverlapClass =
    myHand.length <= 5
      ? '-ml-1.5 sm:-ml-2'
      : myHand.length <= 8
        ? '-ml-3.5 sm:-ml-4'
        : myHand.length <= 12
          ? '-ml-6 sm:-ml-7'
          : '-ml-8 sm:-ml-10';
  const fanMid = (myHand.length - 1) / 2;
  const fanStepDeg = myHand.length <= 7 ? 2.4 : myHand.length <= 12 ? 1.6 : 1.0;

  return (
    <GameShell
      title={`LAST ONE! — ${UNO_VARIANT_META[activeVariant].label}`}
      subtitle={UNO_VARIANT_META[activeVariant].shortDesc}
      onBack={() => {
        leaveOnlineRoom();
        onBack();
      }}
      onRestart={() => resetGame(mode, aiCount, activeVariant)}
      controls={
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Tabs: Online | vs AI */}
          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-800/80 p-0.5 text-xs shrink-0">
            <button
              type="button"
              onClick={() => {
                sfx('click');
                setMode('online');
                setRoomModalOpen(true);
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition ${
                mode === 'online' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" /> Online
            </button>
            <button
              type="button"
              onClick={() => {
                sfx('click');
                setMode('ai');
                resetGame('ai', aiCount, variant);
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition ${
                mode === 'ai' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> vs AI
            </button>
          </div>

          {/* 5 Rule Variants */}
          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-800/80 p-0.5 text-xs shrink-0">
            {ALL_VARIANTS.map((vKey) => (
              <button
                key={vKey}
                type="button"
                disabled={!isHostOrOffline || isOnlinePlaying}
                onClick={() => {
                  sfx('click');
                  setVariant(vKey);
                  if (mode === 'ai') {
                    resetGame('ai', aiCount, vKey);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap cursor-pointer transition disabled:opacity-60 ${
                  activeVariant === vKey ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                {UNO_VARIANT_META[vKey].label}
              </button>
            ))}
          </div>

          {mode === 'ai' && (
            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-xs shrink-0">
              <span className="text-slate-400 font-semibold pr-1">Musuh AI:</span>
              {[1, 2, 3, 4, 5].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => {
                    sfx('click');
                    setAiCount(cnt);
                    resetGame('ai', cnt, variant);
                  }}
                  className={`px-2 py-1 rounded-lg font-bold cursor-pointer ${
                    aiCount === cnt ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          )}

          {mode === 'online' && (
            <button
              type="button"
              onClick={() => setRoomModalOpen(true)}
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer shrink-0"
            >
              {onlineSession ? `Room: ${onlineSession.code}` : 'Buat / Gabung Room'}
            </button>
          )}
        </div>
      }
      rules={[
        ...UNO_VARIANT_META[activeVariant].rules,
        'Mode Online P2P (2–6 Pemain): Setiap pemain hanya melihat kartu tangannya sendiri (anti-intip).',
        'Menang memberi hadiah +500 Chip.',
      ]}
    >
      {/* Online Waiting Room Panel before Host starts */}
      {mode === 'online' && !isOnlinePlaying ? (
        <div className="max-w-lg mx-auto rounded-3xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6 space-y-5 text-center shadow-2xl">
          {!onlineSession ? (
            <div className="space-y-4">
              <h2 className="text-xl font-extrabold text-white">Mabar LAST ONE! Online (2–6 Pemain)</h2>
              <p className="text-sm text-slate-300">
                Buat room untuk mendapatkan kode &amp; link invite, atau gabung ke room temanmu.
              </p>
              <button
                type="button"
                onClick={() => setRoomModalOpen(true)}
                className="rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-emerald-400 cursor-pointer btn-tactile"
              >
                Buka Menu Room Online
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">Kode Room LAST ONE!</span>
                <p className="text-3xl font-black font-mono-num tracking-widest text-white mt-1">
                  {onlineSession.code}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-2 text-left">
                <p className="text-xs font-semibold text-slate-400">
                  Pemain di Ruang Tunggu ({onlineSession.room.players.length}/{onlineSession.room.maxPlayers}):
                </p>
                {onlineSession.room.players.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl bg-slate-900 px-3 py-2 text-xs">
                    <span className="font-bold text-white">
                      {p.name} {p.id === onlineSession.playerId ? '(Kamu)' : ''}
                    </span>
                    <span className="text-slate-400">
                      {p.id === onlineSession.room.hostId ? 'Host' : `Kursi ${p.seatIdx + 1}`}
                    </span>
                  </div>
                ))}
              </div>

              {onlineSession.room.hostId === onlineSession.playerId ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2 text-left">
                    <p className="text-xs font-semibold text-slate-400">Mode Permainan:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_VARIANTS.map((vKey) => (
                        <button
                          key={vKey}
                          type="button"
                          onClick={() => {
                            sfx('click');
                            setVariant(vKey);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition ${
                            variant === vKey ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          {UNO_VARIANT_META[vKey].label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400">{UNO_VARIANT_META[variant].shortDesc}</p>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fillBots}
                      onChange={(e) => setFillBots(e.target.checked)}
                      className="accent-emerald-400"
                    />
                    Isi kursi kosong dengan Bot AI (minimal 4 pemain)
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRoomModalOpen(true)}
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 cursor-pointer"
                    >
                      Bagikan Link
                    </button>
                    <button
                      type="button"
                      disabled={!fillBots && onlineSession.room.players.length < 2}
                      onClick={() => {
                        rewardGrantedRef.current = false;
                        getSocket().emit('uno:start', { code: onlineSession.code, fillBots, variant });
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-emerald-400 disabled:opacity-40 cursor-pointer btn-tactile"
                    >
                      <Play className="w-4 h-4 fill-current" /> Mulai Game
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-amber-300 font-semibold">Menunggu Host memilih mode &amp; memulai permainan...</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="uno-felt-table rounded-2xl sm:rounded-3xl border border-emerald-700/45 relative overflow-hidden min-h-[530px] sm:min-h-[600px] lg:min-h-[640px] flex flex-col justify-between p-3 sm:p-5">
          {/* Top-left compact HUD badges + Top-right Move History Chat */}
          <div className="relative z-30 flex items-start justify-between gap-2 text-[11px] sm:text-xs">
            <div className="flex flex-wrap items-center gap-1.5 max-w-[calc(100%-13.5rem)] sm:max-w-[calc(100%-16rem)]">
              {activeVariant !== 'allwild' ? (
                <span className={`px-2.5 py-1 rounded-full border backdrop-blur-sm font-semibold inline-flex items-center gap-1.5 ${COLOR_STYLES[activeColor].pill}`}>
                  <span className={`w-2 h-2 rounded-full ${COLOR_STYLES[activeColor].ring}`} />
                  {UNO_COLOR_LABELS[activeColor]}
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full border border-violet-400/40 bg-violet-500/20 text-violet-200 font-semibold backdrop-blur-sm">
                  All Wild
                </span>
              )}
              <span className="px-2.5 py-1 rounded-full border border-white/15 bg-black/45 text-emerald-50 font-mono-num font-semibold backdrop-blur-sm">
                Dek: {drawCount}
              </span>
              <span className="px-2.5 py-1 rounded-full border border-white/15 bg-black/45 text-emerald-50 inline-flex items-center gap-1.5 font-medium backdrop-blur-sm">
                <RotateCw className={`w-3.5 h-3.5 transition-transform duration-300 ${direction === -1 ? '-scale-x-100' : ''}`} />
                <span className="hidden sm:inline">{direction === 1 ? 'Searah' : 'Berlawanan'}</span>
              </span>
              {pendingDraw > 0 && (
                <span className="px-2.5 py-1 rounded-full border border-rose-400/70 bg-rose-600/80 text-white inline-flex items-center gap-1 font-extrabold animate-pulse shadow-lg">
                  <Flame className="w-3.5 h-3.5 text-amber-200" />
                  Tumpukan +{pendingDraw}
                </span>
              )}
              {activeVariant === 'nomercy' && (
                <span className="px-2.5 py-1 rounded-full border border-amber-400/35 bg-black/45 text-amber-200 inline-flex items-center gap-1 font-semibold backdrop-blur-sm">
                  <ShieldAlert className="w-3.5 h-3.5" /> Batas KO: 25
                </span>
              )}
            </div>
          </div>

          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30">
            <MoveHistoryChat entries={moveLog} />
          </div>

          {/* Mobile compact opponent bar (< md) */}
          <div className="flex md:hidden items-start justify-around flex-wrap gap-2 py-2 relative z-10">
            {orderedOpponents.map((opp) => (
              <OpponentSeat
                key={opp.id}
                player={opp}
                isActive={currentTurnIdx === opp.seatIdx && winnerIdx === null && !opp.eliminated}
                position="compact"
                isNoMercy={activeVariant === 'nomercy'}
              />
            ))}
          </div>

          {/* Desktop/Tablet Top Seat Row (>= md) */}
          <div className="hidden md:flex items-center justify-center gap-10 lg:gap-14 pt-1 relative z-10 min-h-[76px]">
            {topSeats.map((opp) => (
              <OpponentSeat
                key={opp.id}
                player={opp}
                isActive={currentTurnIdx === opp.seatIdx && winnerIdx === null && !opp.eliminated}
                position="top"
                isNoMercy={activeVariant === 'nomercy'}
              />
            ))}
          </div>

          {/* Middle Table Row: Left Seat | Center Piles + Glow Ring | Right Seat */}
          <div className="relative z-10 flex-1 grid grid-cols-1 md:grid-cols-[minmax(145px,1fr)_auto_minmax(145px,1fr)] items-center gap-2 py-2 sm:py-3">
            <div className="hidden md:flex justify-start items-center pl-1 lg:pl-3">
              {leftSeat && (
                <OpponentSeat
                  player={leftSeat}
                  isActive={currentTurnIdx === leftSeat.seatIdx && winnerIdx === null && !leftSeat.eliminated}
                  position="left"
                  isNoMercy={activeVariant === 'nomercy'}
                />
              )}
            </div>

            <div className="relative flex flex-col items-center justify-center py-6 sm:py-8">
              <DirectionGlowRing
                activeColor={activeColor}
                direction={direction}
                isAllWild={activeVariant === 'allwild'}
              />

              <div className="relative z-10 flex items-center justify-center gap-6 sm:gap-10">
                <LastOneDrawDeck
                  drawCount={drawCount}
                  canDraw={isHumanTurn}
                  hasPlayableCard={hasPlayableCard}
                  pendingDraw={pendingDraw}
                  onDraw={handleDrawClick}
                />

                <div className="relative">
                  {activeVariant !== 'allwild' && (
                    <div className={`absolute -inset-2 rounded-2xl blur-md opacity-45 transition-colors duration-300 ${COLOR_STYLES[activeColor].ring}`} />
                  )}
                  <div key={topCard.id} className="relative animate-card-throw">
                    <LastOneCard card={topCard} size="md" className="rotate-[4deg]" />
                  </div>
                </div>
              </div>

              {actionBurst && (
                <div
                  key={actionBurst.id}
                  className={`pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full text-xs font-black tracking-wider shadow-xl animate-banner-pop z-20 whitespace-nowrap ${actionBurst.tone}`}
                >
                  {actionBurst.text}
                </div>
              )}
            </div>

            <div className="hidden md:flex justify-end items-center pr-1 lg:pr-3">
              {rightSeat && (
                <OpponentSeat
                  player={rightSeat}
                  isActive={currentTurnIdx === rightSeat.seatIdx && winnerIdx === null && !rightSeat.eliminated}
                  position="right"
                  isNoMercy={activeVariant === 'nomercy'}
                />
              )}
            </div>
          </div>

          <ConfettiBurst trigger={confettiKey} />

          {/* Bottom Player Hand & Corner Controls */}
          <div className="relative z-20 pt-1">
            {/* Fanned Human Hand */}
            <div className="w-full overflow-x-auto no-scrollbar pt-7 pb-2 px-4 sm:px-6 md:px-28">
              <div className="flex items-end justify-center mx-auto w-max">
                {myHand.map((card, i) => {
                  const playable =
                    isHumanTurn && isCardPlayable(card, topCard, activeColor, pendingDraw, pendingDrawMin, activeVariant);
                  const offset = i - fanMid;
                  const angle = myHand.length > 1 ? offset * fanStepDeg : 0;
                  const archY = Math.abs(offset) * (myHand.length > 10 ? 0.9 : 1.5);
                  return (
                    <div
                      key={card.id}
                      style={{ transform: `rotate(${angle}deg) translateY(${archY}px)` }}
                      className={`relative transition-transform duration-200 hover:z-40 ${
                        i === 0 ? '' : fanOverlapClass
                      } ${playable ? 'z-20 -translate-y-2.5' : 'z-10'}`}
                    >
                      <LastOneCard
                        card={card}
                        playable={playable}
                        onClick={() => handleCardClick(card)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom-Left Player Avatar + Bottom-Right LAST ONE Button */}
            <div className="flex items-end justify-between gap-3 pt-1 md:pt-0 md:pointer-events-none">
              <div className="md:absolute md:bottom-0 md:left-0 flex flex-col items-start gap-1.5 md:pointer-events-auto">
                <span
                  className={`px-2.5 py-0.5 rounded-md text-[10px] sm:text-[11px] font-black uppercase tracking-wider shadow-md border ${
                    myPlayerMeta?.eliminated
                      ? 'bg-rose-700 text-white border-rose-300/60'
                      : isHumanTurn
                        ? 'bg-rose-600 text-white border-rose-300/70 animate-pulse'
                        : 'bg-black/55 text-slate-300 border-white/15'
                  }`}
                >
                  {myPlayerMeta?.eliminated
                    ? 'KO — Tersingkir'
                    : isHumanTurn
                      ? 'Giliranmu'
                      : 'Menunggu'}
                </span>
                <div className="flex items-end gap-2.5">
                  <SeatAvatar
                    seatIdx={mySeatIdx}
                    name={myPlayerMeta?.name ?? 'Kamu'}
                    cardCount={myHand.length}
                    isActive={isHumanTurn}
                    eliminated={Boolean(myPlayerMeta?.eliminated)}
                    saidUno={Boolean(myPlayerMeta?.saidUno)}
                    isNoMercy={activeVariant === 'nomercy'}
                  />
                  <span className="text-[11px] font-bold text-white/85 bg-black/45 border border-white/10 px-2 py-0.5 rounded-md mb-0.5">
                    {myPlayerMeta?.name ?? 'Kamu'}
                    {activeVariant === 'nomercy' ? ` (${myHand.length}/25)` : ''}
                  </span>
                </div>
              </div>

              <div className="md:absolute md:bottom-0 md:right-0 md:pointer-events-auto">
                {myHand.length <= 2 &&
                myHand.length >= 1 &&
                !myPlayerMeta?.saidUno &&
                !myPlayerMeta?.eliminated &&
                winnerIdx === null ? (
                  <button
                    type="button"
                    onClick={handleCallUno}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 px-5 py-2.5 text-xs sm:text-sm font-black uppercase tracking-wider text-slate-950 shadow-xl ring-2 ring-amber-200 animate-pulse-glow cursor-pointer btn-tactile"
                  >
                    <BellRing className="w-4 h-4" />
                    LAST ONE!
                  </button>
                ) : myPlayerMeta?.saidUno && !myPlayerMeta?.eliminated ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/60 bg-amber-400/20 px-4 py-2 text-xs font-extrabold text-amber-200 backdrop-blur-sm">
                    <BellRing className="w-3.5 h-3.5" /> LAST ONE ✓
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/45 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white/35 backdrop-blur-sm cursor-not-allowed"
                  >
                    <BellRing className="w-3.5 h-3.5" />
                    LAST ONE!
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wild Color Modal */}
      {activeWildCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl animate-pop-in space-y-4 text-center">
            <h3 className="text-lg font-bold text-white">Pilih Warna Wild</h3>
            <div className="grid grid-cols-2 gap-3">
              {UNO_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => handleWildSelect(color)}
                  className={`rounded-xl py-3 font-extrabold text-sm border bg-gradient-to-br ${COLOR_STYLES[color].bg} ${
                    color === 'yellow' ? 'text-slate-950' : 'text-white'
                  } shadow-lg hover:scale-[1.03] transition cursor-pointer`}
                >
                  {UNO_COLOR_LABELS[color]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7-Swap Target Modal */}
      {activeSwapCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl animate-pop-in space-y-4 text-center">
            <div>
              <h3 className="text-lg font-bold text-white">Kartu 7 — Tukar Kartu!</h3>
              <p className="text-xs text-slate-400 mt-1">Pilih lawan untuk bertukar seluruh kartu tangan:</p>
            </div>
            <div className="space-y-2">
              {aliveOpponents.map((opp) => (
                <button
                  key={opp.id}
                  type="button"
                  onClick={() => handleSwapSelect(opp.id)}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm font-bold text-white hover:border-amber-400 hover:bg-slate-800 cursor-pointer btn-tactile"
                >
                  <span>{opp.name}</span>
                  <span className="text-xs font-mono-num text-amber-300">{opp.cardCount} kartu</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Winner Banner Modal */}
      {winnerIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center">
              <Trophy className="w-7 h-7 text-amber-400" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-white">
                {winnerIdx === mySeatIdx ? 'Kamu Menang!' : `${winnerName} Menang`}
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                {winnerIdx === mySeatIdx ? 'Selamat! Kamu mendapat +500 Chip.' : 'Coba lagi di ronde berikutnya!'}
              </p>
            </div>
            {(mode !== 'online' || onlineSession?.room.hostId === onlineSession?.playerId) && (
              <button
                type="button"
                onClick={() => resetGame(mode, aiCount, activeVariant)}
                className="w-full rounded-xl bg-indigo-600 py-2.5 font-bold text-white hover:bg-indigo-500 transition cursor-pointer"
              >
                Main Lagi
              </button>
            )}
          </div>
        </div>
      )}

      <OnlineRoomModal
        open={roomModalOpen}
        gameId="uno"
        gameTitle="LAST ONE!"
        initialJoinCode={initialRoomCode}
        activeSession={onlineSession}
        onConnected={(session) => {
          rewardGrantedRef.current = false;
          setMode('online');
          setOnlineSession(session);
          setOnlineUno(null);
        }}
        onClose={() => setRoomModalOpen(false)}
      />
    </GameShell>
  );
};
