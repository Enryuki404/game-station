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
import { LastOneCard, LastOneCardBack, LastOneDrawDeck } from './LastOneCard';

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
        <div className="rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-900/70 p-3 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl">
          {/* Opponents row */}
          <div
            className={`grid gap-2 sm:gap-3 ${
              opponentSeats.length === 1
                ? 'grid-cols-1 max-w-xs mx-auto'
                : opponentSeats.length === 2
                  ? 'grid-cols-2 max-w-2xl mx-auto'
                  : opponentSeats.length === 3
                    ? 'grid-cols-2 sm:grid-cols-3'
                    : opponentSeats.length === 4
                      ? 'grid-cols-2 sm:grid-cols-4'
                      : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
            }`}
          >
            {opponentSeats.map((opp) => {
              const active = currentTurnIdx === opp.seatIdx && winnerIdx === null && !opp.eliminated;
              return (
                <div
                  key={opp.id}
                  className={`rounded-xl sm:rounded-2xl border p-2 sm:p-3 flex items-center justify-between gap-1.5 sm:gap-2 overflow-hidden min-w-0 transition ${
                    opp.eliminated
                      ? 'border-rose-900/50 bg-rose-950/20 opacity-55'
                      : active
                        ? 'border-amber-400/70 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                        : 'border-slate-800 bg-slate-950/50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`w-2 h-2 sm:w-2.5 sm:h-2.5 shrink-0 rounded-full ${
                          opp.eliminated ? 'bg-rose-500' : active ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'
                        }`}
                      />
                      <span className="font-bold text-xs sm:text-sm text-white truncate">
                        {opp.name} {!opp.connected ? '(Offline)' : ''}
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">
                      {opp.eliminated ? 'KO (25+ kartu)' : `${opp.cardCount} kartu tersisa`}
                    </p>
                  </div>
                  {!opp.eliminated && (
                    <div className="flex items-center gap-1 shrink-0">
                      {Array.from({ length: Math.min(opp.cardCount, 3) }).map((_, i) => (
                        <LastOneCardBack key={i} size="mini" />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Center Table */}
          <div className="felt-surface relative rounded-3xl border border-emerald-700/40 p-4 sm:p-7 flex flex-col items-center gap-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs">
              {activeVariant !== 'allwild' ? (
                <span className={`px-3 py-1 rounded-full border font-semibold transition-colors ${COLOR_STYLES[activeColor].pill}`}>
                  Warna Aktif: {UNO_COLOR_LABELS[activeColor]}
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full border border-violet-400/40 bg-violet-500/20 text-violet-200 font-semibold">
                  Mode All Wild
                </span>
              )}
              <span className="px-3 py-1 rounded-full border border-slate-700 bg-slate-900/70 text-slate-200 inline-flex items-center gap-1.5 font-medium">
                <RotateCw className={`w-3.5 h-3.5 transition-transform duration-300 ${direction === -1 ? '-scale-x-100' : ''}`} />
                {direction === 1 ? 'Searah Jarum Jam' : 'Berlawanan Jarum Jam'}
              </span>
              {pendingDraw > 0 && (
                <span className="px-3 py-1 rounded-full border border-rose-400/60 bg-rose-500/25 text-rose-200 inline-flex items-center gap-1 font-extrabold animate-pulse">
                  <Flame className="w-3.5 h-3.5 text-amber-300" />
                  Tumpukan Penalti: +{pendingDraw}
                </span>
              )}
              {activeVariant === 'nomercy' && (
                <span className="px-2.5 py-1 rounded-full border border-amber-400/35 bg-amber-500/15 text-amber-200 inline-flex items-center gap-1 font-semibold">
                  <ShieldAlert className="w-3.5 h-3.5" /> Batas KO: 25
                </span>
              )}
            </div>

            <div className="relative flex items-center justify-center gap-6 sm:gap-10 py-2">
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
                  <LastOneCard card={topCard} size="md" />
                </div>
                {activeVariant !== 'allwild' && (
                  <div className={`absolute -bottom-2 -right-2 w-5 h-5 rounded-full border-2 border-white shadow-md transition-colors duration-300 ${COLOR_STYLES[activeColor].ring}`} />
                )}
              </div>

              {actionBurst && (
                <div
                  key={actionBurst.id}
                  className={`pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full text-xs font-black tracking-wider shadow-xl animate-banner-pop z-20 ${actionBurst.tone}`}
                >
                  {actionBurst.text}
                </div>
              )}
            </div>

            <p className="text-center text-xs sm:text-sm font-medium text-emerald-100 bg-black/30 px-4 py-1.5 rounded-full">
              {statusText}
            </p>
          </div>

          <ConfettiBurst trigger={confettiKey} />

          {/* Human Hand (Only myHand on this screen!) */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    myPlayerMeta?.eliminated ? 'bg-rose-500' : isHumanTurn ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                  }`}
                />
                <h2 className="text-sm sm:text-base font-bold text-white">
                  {myPlayerMeta?.eliminated
                    ? `${myPlayerMeta.name} (KO — Tersingkir)`
                    : `${myPlayerMeta?.name ?? 'Kartumu'} (${myHand.length}${activeVariant === 'nomercy' ? '/25' : ''} kartu)`}
                </h2>
                {myPlayerMeta?.saidUno && !myPlayerMeta?.eliminated && (
                  <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-full bg-amber-400 text-slate-950">
                    LAST ONE AKTIF
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {myHand.length <= 2 &&
                  myHand.length >= 1 &&
                  !myPlayerMeta?.saidUno &&
                  !myPlayerMeta?.eliminated &&
                  winnerIdx === null && (
                    <button
                      type="button"
                      onClick={handleCallUno}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 px-4 py-1.5 text-xs sm:text-sm font-extrabold text-slate-950 shadow-lg animate-pulse-glow cursor-pointer"
                    >
                      <BellRing className="w-4 h-4" />
                      TERIAK LAST ONE!
                    </button>
                  )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2 pb-1">
              {myHand.map((card) => {
                const playable =
                  isHumanTurn && isCardPlayable(card, topCard, activeColor, pendingDraw, pendingDrawMin, activeVariant);
                return (
                  <LastOneCard
                    key={card.id}
                    card={card}
                    playable={playable}
                    onClick={() => handleCardClick(card)}
                  />
                );
              })}
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
