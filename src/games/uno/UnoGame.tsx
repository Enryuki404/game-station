import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, Globe, Play, RotateCw, Trophy, Users } from 'lucide-react';
import { ConfettiBurst } from '../../components/ConfettiBurst';
import { GameShell } from '../../components/GameShell';
import { OnlineRoomModal } from '../../components/OnlineRoomModal';
import { useGameStation } from '../../context/GameStationContext';
import { shuffleDeck } from '../../lib/cards';
import {
  getSocket,
  leaveOnlineRoom,
  type MultiplayerRoomInfo,
  type OnlineSession,
} from '../../lib/multiplayer';
import {
  chooseBestAiCard,
  createUnoDeck,
  formatUnoValue,
  isCardPlayable,
  UNO_COLOR_LABELS,
  UNO_COLORS,
  type UnoCard,
  type UnoColor,
  type UnoPlayer,
} from './unoEngine';

interface UnoGameProps {
  onBack: () => void;
  initialRoomCode?: string | null;
  initialOnline?: boolean;
}

interface UnoState {
  players: UnoPlayer[];
  drawPile: UnoCard[];
  discardPile: UnoCard[];
  activeColor: UnoColor;
  currentTurn: number;
  direction: 1 | -1;
  winnerIndex: number | null;
  pendingWildCard: UnoCard | null;
  statusText: string;
}

interface OnlineUnoState {
  started: boolean;
  mySeatIdx: number;
  myHand: UnoCard[];
  players: Array<{
    id: string;
    name: string;
    seatIdx: number;
    cardCount: number;
    saidUno: boolean;
    isBot: boolean;
    connected: boolean;
  }>;
  drawCount: number;
  topCard: UnoCard;
  activeColor: UnoColor;
  currentTurn: number;
  direction: 1 | -1;
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

function createInitialState(aiCount: number): UnoState {
  const deck = createUnoDeck();
  const botNames = ['Bot Raka', 'Bot Sinta', 'Bot Budi', 'Bot Dewi', 'Bot Dimas'];
  const clampedAi = Math.max(1, Math.min(5, aiCount));
  const names = ['Kamu', ...botNames.slice(0, clampedAi)];
  const players: UnoPlayer[] = names.map((name, i) => ({
    id: `p-${i}`,
    name,
    isHuman: i === 0,
    hand: deck.splice(0, 7),
    saidUno: false,
  }));

  let firstIdx = deck.findIndex((c) => c.color !== 'wild' && !['draw2', 'skip', 'reverse'].includes(c.value));
  if (firstIdx === -1) firstIdx = 0;
  const [firstCard] = deck.splice(firstIdx, 1);

  return {
    players,
    drawPile: deck,
    discardPile: [firstCard],
    activeColor: firstCard.color === 'wild' ? 'red' : firstCard.color,
    currentTurn: 0,
    direction: 1,
    winnerIndex: null,
    pendingWildCard: null,
    statusText: 'Giliran kamu! Pilih kartu yang cocok atau ambil dari dek.',
  };
}

function drawFromPile(
  drawPile: UnoCard[],
  discardPile: UnoCard[],
  count: number
): { drawn: UnoCard[]; nextDraw: UnoCard[]; nextDiscard: UnoCard[] } {
  let pool = [...drawPile];
  let discard = [...discardPile];
  const drawn: UnoCard[] = [];

  for (let i = 0; i < count; i++) {
    if (pool.length === 0) {
      if (discard.length <= 1) break;
      const top = discard[discard.length - 1];
      const recycled = shuffleDeck(discard.slice(0, -1));
      pool = recycled;
      discard = [top];
    }
    const card = pool.shift();
    if (card) drawn.push(card);
  }

  return { drawn, nextDraw: pool, nextDiscard: discard };
}

const UnoCardView: React.FC<{
  card: UnoCard;
  playable?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
}> = ({ card, playable = false, onClick, size = 'md' }) => {
  const label = formatUnoValue(card.value);
  const isWild = card.color === 'wild';
  const colorGrad =
    card.color === 'wild'
      ? 'from-slate-800 via-slate-900 to-slate-950 border-white/40'
      : COLOR_STYLES[card.color].bg;
  const textTone = card.color === 'yellow' ? 'text-slate-950' : 'text-white';
  const dim = size === 'sm' ? 'w-14 h-20 text-base' : 'w-[54px] sm:w-20 h-[80px] sm:h-28 text-lg sm:text-2xl';

  return (
    <button
      type="button"
      disabled={!onClick || !playable}
      onClick={onClick}
      className={`${dim} animate-card-deal relative rounded-xl border-2 bg-gradient-to-br ${colorGrad} ${textTone} shadow-lg flex flex-col justify-between p-1.5 select-none transition-all duration-200 ease-out btn-tactile ${
        playable
          ? 'cursor-pointer hover:-translate-y-4 hover:scale-105 hover:shadow-2xl ring-2 ring-white/85'
          : onClick
            ? 'opacity-50 cursor-not-allowed'
            : ''
      }`}
    >
      <span className="text-[11px] font-extrabold leading-none text-left">{label}</span>
      <div className="self-center w-10 sm:w-12 h-12 sm:h-14 rounded-full border-2 border-white/50 bg-black/20 -rotate-12 flex items-center justify-center shadow-inner">
        {isWild ? (
          <div className="grid grid-cols-2 w-6 h-6 rounded-full overflow-hidden rotate-12 border border-white/70">
            <span className="bg-rose-500" />
            <span className="bg-sky-500" />
            <span className="bg-amber-400" />
            <span className="bg-emerald-500" />
          </div>
        ) : (
          <span className="font-black tracking-tight rotate-12">{label}</span>
        )}
      </div>
      <span className="text-[11px] font-extrabold leading-none text-right rotate-180">{label}</span>
    </button>
  );
};

export const UnoGame: React.FC<UnoGameProps> = ({ onBack, initialRoomCode, initialOnline }) => {
  const { addChips, recordGame, sfx } = useGameStation();
  const startInOnline = Boolean(initialRoomCode || initialOnline);
  const [mode, setMode] = useState<'ai' | 'online'>(startInOnline ? 'online' : 'ai');
  const [aiCount, setAiCount] = useState<number>(3);
  const [state, setState] = useState<UnoState>(() => createInitialState(3));
  const [actionBurst, setActionBurst] = useState<{ id: number; text: string; tone: string } | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);

  // Online multiplayer state
  const [onlineSession, setOnlineSession] = useState<OnlineSession | null>(null);
  const [onlineUno, setOnlineUno] = useState<OnlineUnoState | null>(null);
  const [onlineWildCard, setOnlineWildCard] = useState<UnoCard | null>(null);
  const [fillBots, setFillBots] = useState(true);
  const [roomModalOpen, setRoomModalOpen] = useState(startInOnline);

  const rewardGrantedRef = useRef(false);
  const lastBurstIdRef = useRef<number | null>(null);

  const triggerBurst = useCallback((text: string, tone = 'bg-amber-400 text-slate-950') => {
    setActionBurst({ id: Date.now() + Math.random(), text, tone });
  }, []);

  const resetGame = useCallback(
    (nextMode: 'ai' | 'online' = mode, nextAiCount: number = aiCount) => {
      rewardGrantedRef.current = false;
      setActionBurst(null);
      if (nextMode !== 'online') {
        if (onlineSession) {
          leaveOnlineRoom();
          setOnlineSession(null);
          setOnlineUno(null);
        }
        setState(createInitialState(nextAiCount));
      } else if (onlineSession && onlineSession.room.hostId === onlineSession.playerId) {
        getSocket().emit('uno:start', { code: onlineSession.code, fillBots });
      }
    },
    [aiCount, fillBots, mode, onlineSession]
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
      setOnlineWildCard(null);
      if (uState.lastBurst && uState.lastBurst.id !== lastBurstIdRef.current) {
        lastBurstIdRef.current = uState.lastBurst.id;
        triggerBurst(uState.lastBurst.text, 'bg-gradient-to-r from-amber-400 to-rose-500 text-slate-950');
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

  const nextIndex = (idx: number, dir: 1 | -1, total: number, steps = 1) =>
    (((idx + dir * steps) % total) + total) % total;

  const applyPlay = useCallback(
    (playerIdx: number, card: UnoCard, chosenColor?: UnoColor) => {
      setState((prev) => {
        if (prev.winnerIndex !== null) return prev;
        const players = prev.players.map((p) => ({ ...p, hand: [...p.hand] }));
        const actor = players[playerIdx];
        const cardIdx = actor.hand.findIndex((c) => c.id === card.id);
        if (cardIdx === -1) return prev;

        actor.hand.splice(cardIdx, 1);
        let drawPile = [...prev.drawPile];
        const discardPile = [...prev.discardPile, card];
        let direction = prev.direction;
        const activeColor: UnoColor = card.color === 'wild' ? chosenColor ?? 'red' : card.color;

        let penaltyMsg = '';
        let finalDiscard = discardPile;
        if (actor.hand.length === 1 && actor.isHuman && !actor.saidUno) {
          const pen = drawFromPile(drawPile, discardPile, 2);
          actor.hand.push(...pen.drawn);
          drawPile = pen.nextDraw;
          finalDiscard = pen.nextDiscard;
          penaltyMsg = ' (Lupa tekan UNO! +2 kartu)';
        }
        if (actor.hand.length === 1 && !actor.isHuman) {
          actor.saidUno = true;
        }
        if (actor.hand.length !== 1) {
          actor.saidUno = false;
        }

        if (actor.hand.length === 0) {
          return {
            ...prev,
            players,
            drawPile,
            discardPile: finalDiscard,
            activeColor,
            winnerIndex: playerIdx,
            pendingWildCard: null,
            statusText: `${actor.name} menang UNO!`,
          };
        }

        let step = 1;
        let effectNote = '';
        const total = players.length;

        if (card.value === 'reverse') {
          if (total === 2) {
            step = 2;
            effectNote = ' — Reverse (Giliran lanjut!)';
          } else {
            direction = (direction * -1) as 1 | -1;
            effectNote = ' — Arah berbalik!';
          }
        } else if (card.value === 'skip') {
          const skipped = players[nextIndex(playerIdx, direction, total, 1)];
          step = 2;
          effectNote = ` — ${skipped.name} dilewati!`;
        } else if (card.value === 'draw2' || card.value === 'wild4') {
          const amount = card.value === 'draw2' ? 2 : 4;
          const victimIdx = nextIndex(playerIdx, direction, total, 1);
          const res = drawFromPile(drawPile, finalDiscard, amount);
          players[victimIdx].hand.push(...res.drawn);
          players[victimIdx].saidUno = false;
          drawPile = res.nextDraw;
          finalDiscard = res.nextDiscard;
          step = 2;
          effectNote = ` — ${players[victimIdx].name} ambil +${amount}!`;
        }

        const nextTurn = nextIndex(playerIdx, direction, total, step);
        const nextPlayer = players[nextTurn];
        const colorNote = card.color === 'wild' ? ` (Warna: ${UNO_COLOR_LABELS[activeColor]})` : '';

        return {
          ...prev,
          players,
          drawPile,
          discardPile: finalDiscard,
          activeColor,
          direction,
          currentTurn: nextTurn,
          pendingWildCard: null,
          statusText: `${actor.name} mainkan ${formatUnoValue(card.value)}${colorNote}${effectNote}${penaltyMsg} Giliran ${nextPlayer.name}.`,
        };
      });
      sfx('card');
      if (card.value === 'skip') triggerBurst('SKIP!', 'bg-rose-500 text-white');
      else if (card.value === 'reverse') triggerBurst('REVERSE!', 'bg-sky-500 text-white');
      else if (card.value === 'draw2') triggerBurst('+2 KARTU!', 'bg-amber-400 text-slate-950');
      else if (card.value === 'wild4') triggerBurst('+4 WILD!', 'bg-gradient-to-r from-rose-500 to-amber-400 text-white');
      else if (card.value === 'wild') triggerBurst('WILD!', 'bg-indigo-500 text-white');
    },
    [sfx, triggerBurst]
  );

  const applyDraw = useCallback(
    (playerIdx: number) => {
      setState((prev) => {
        if (prev.winnerIndex !== null) return prev;
        const players = prev.players.map((p) => ({ ...p, hand: [...p.hand] }));
        const actor = players[playerIdx];
        const res = drawFromPile(prev.drawPile, prev.discardPile, 1);
        actor.hand.push(...res.drawn);
        actor.saidUno = false;

        const nextTurn = nextIndex(playerIdx, prev.direction, players.length, 1);
        return {
          ...prev,
          players,
          drawPile: res.nextDraw,
          discardPile: res.nextDiscard,
          currentTurn: nextTurn,
          statusText: `${actor.name} mengambil 1 kartu. Giliran ${players[nextTurn].name}.`,
        };
      });
      sfx('card');
    },
    [sfx]
  );

  // Winner reward & stats (offline vs Bot)
  useEffect(() => {
    if (mode !== 'online' && state.winnerIndex !== null && !rewardGrantedRef.current) {
      rewardGrantedRef.current = true;
      const humanWon = state.winnerIndex === 0;
      recordGame('uno', humanWon);
      if (humanWon) {
        addChips(500);
        setConfettiKey((k) => k + 1);
        sfx('win');
      } else {
        sfx('lose');
      }
    }
  }, [mode, state.winnerIndex, addChips, recordGame, sfx]);

  // AI Turn Loop (offline)
  useEffect(() => {
    if (mode === 'online' || state.winnerIndex !== null || state.pendingWildCard) return;
    const current = state.players[state.currentTurn];
    if (!current || current.isHuman) return;

    const timer = window.setTimeout(() => {
      const topCard = state.discardPile[state.discardPile.length - 1];
      const decision = chooseBestAiCard(current.hand, topCard, state.activeColor);
      if (decision) {
        applyPlay(state.currentTurn, decision.card, decision.chosenColor);
      } else {
        applyDraw(state.currentTurn);
      }
    }, 850);

    return () => window.clearTimeout(timer);
  }, [mode, state.currentTurn, state.winnerIndex, state.pendingWildCard, state.players, state.discardPile, state.activeColor, applyPlay, applyDraw]);

  // Derived view state for both Offline & Online (anti-cheat: only own cards shown!)
  const isOnlinePlaying = mode === 'online' && Boolean(onlineUno?.started);
  const mySeatIdx = isOnlinePlaying ? onlineUno!.mySeatIdx : 0;
  const myHand = isOnlinePlaying ? onlineUno!.myHand : state.players[0].hand;
  const myPlayerMeta = isOnlinePlaying
    ? onlineUno!.players[mySeatIdx]
    : { name: state.players[0].name, saidUno: state.players[0].saidUno };

  const opponentSeats = isOnlinePlaying
    ? onlineUno!.players.filter((p) => p.seatIdx !== mySeatIdx)
    : state.players.slice(1).map((p, idx) => ({
        id: p.id,
        name: p.name,
        seatIdx: idx + 1,
        cardCount: p.hand.length,
        saidUno: p.saidUno,
        isBot: true,
        connected: true,
      }));

  const topCard = isOnlinePlaying ? onlineUno!.topCard : state.discardPile[state.discardPile.length - 1];
  const activeColor = isOnlinePlaying ? onlineUno!.activeColor : state.activeColor;
  const direction = isOnlinePlaying ? onlineUno!.direction : state.direction;
  const drawCount = isOnlinePlaying ? onlineUno!.drawCount : state.drawPile.length;
  const currentTurnIdx = isOnlinePlaying ? onlineUno!.currentTurn : state.currentTurn;
  const winnerIdx = isOnlinePlaying ? onlineUno!.winnerIndex : state.winnerIndex;
  const statusText = isOnlinePlaying ? onlineUno!.statusText : state.statusText;
  const activeWildCard = isOnlinePlaying ? onlineWildCard : state.pendingWildCard;

  const isHumanTurn =
    (mode === 'online' ? isOnlinePlaying : true) &&
    currentTurnIdx === mySeatIdx &&
    winnerIdx === null &&
    !activeWildCard;

  const handleCardClick = (card: UnoCard) => {
    if (!isHumanTurn || !isCardPlayable(card, topCard, activeColor)) return;
    if (card.color === 'wild') {
      sfx('click');
      if (isOnlinePlaying) setOnlineWildCard(card);
      else setState((prev) => ({ ...prev, pendingWildCard: card }));
      return;
    }
    if (isOnlinePlaying && onlineSession) {
      getSocket().emit('uno:play', { code: onlineSession.code, cardId: card.id });
    } else {
      applyPlay(0, card);
    }
  };

  const handleWildSelect = (color: UnoColor) => {
    if (!activeWildCard) return;
    if (isOnlinePlaying && onlineSession) {
      getSocket().emit('uno:play', {
        code: onlineSession.code,
        cardId: activeWildCard.id,
        chosenColor: color,
      });
      setOnlineWildCard(null);
    } else {
      applyPlay(0, activeWildCard, color);
    }
  };

  const handleDrawClick = () => {
    if (!isHumanTurn) return;
    if (isOnlinePlaying && onlineSession) {
      getSocket().emit('uno:draw', { code: onlineSession.code });
    } else {
      applyDraw(0);
    }
  };

  const handleCallUno = () => {
    sfx('uno');
    if (isOnlinePlaying && onlineSession) {
      getSocket().emit('uno:call', { code: onlineSession.code });
      return;
    }
    triggerBurst('UNO!', 'bg-gradient-to-r from-amber-400 to-rose-500 text-slate-950');
    setState((prev) => {
      const players = prev.players.map((p, idx) => (idx === 0 ? { ...p, saidUno: true } : p));
      return { ...prev, players, statusText: 'Kamu berteriak "UNO!"' };
    });
  };

  const winnerName =
    winnerIdx === null
      ? ''
      : isOnlinePlaying
        ? onlineUno!.players[winnerIdx]?.name ?? ''
        : state.players[winnerIdx]?.name ?? '';

  return (
    <GameShell
      title="UNO Classic"
      subtitle="Cocokkan warna atau angka, habiskan kartumu lebih dulu!"
      onBack={() => {
        leaveOnlineRoom();
        onBack();
      }}
      onRestart={() => resetGame(mode)}
      controls={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-800/80 p-0.5 text-xs">
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
                resetGame('ai', aiCount);
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition ${
                mode === 'ai' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> vs AI
            </button>
          </div>

          {mode === 'ai' && (
            <div className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-xs">
              <span className="text-slate-400 font-semibold pr-1">Musuh AI:</span>
              {[1, 2, 3, 4, 5].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => {
                    sfx('click');
                    setAiCount(cnt);
                    resetGame('ai', cnt);
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
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer"
            >
              {onlineSession ? `Room: ${onlineSession.code}` : 'Buat / Gabung Room'}
            </button>
          )}
        </div>
      }
      rules={[
        'Mainkan kartu yang memiliki warna, angka, atau simbol yang sama dengan kartu teratas di meja.',
        'Mode Online P2P (2–6 Pemain): Setiap pemain hanya melihat kartu tangannya sendiri di bawah, sedangkan kartu lawan tertutup (anti-intip).',
        'Saat tersisa 2 kartu sebelum giliranmu berakhir ke 1 kartu, tekan tombol "UNO!" dulu agar tidak kena penalti +2 kartu!',
        'Menang memberi hadiah +500 Chip.',
      ]}
    >
      {/* Online Waiting Room Panel before Host starts */}
      {mode === 'online' && !isOnlinePlaying ? (
        <div className="max-w-lg mx-auto rounded-3xl border border-slate-800 bg-slate-900/80 p-6 space-y-5 text-center shadow-2xl">
          {!onlineSession ? (
            <div className="space-y-4">
              <h2 className="text-xl font-extrabold text-white">Mabar UNO Online (2–6 Pemain)</h2>
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
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">Kode Room UNO</span>
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
                        getSocket().emit('uno:start', { code: onlineSession.code, fillBots });
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-emerald-400 disabled:opacity-40 cursor-pointer btn-tactile"
                    >
                      <Play className="w-4 h-4 fill-current" /> Mulai Game
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-amber-300 font-semibold">Menunggu Host memulai permainan...</p>
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
              const active = currentTurnIdx === opp.seatIdx && winnerIdx === null;
              return (
                <div
                  key={opp.id}
                  className={`rounded-xl sm:rounded-2xl border p-2 sm:p-3 flex items-center justify-between gap-1.5 sm:gap-2 overflow-hidden min-w-0 transition ${
                    active
                      ? 'border-amber-400/70 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                      : 'border-slate-800 bg-slate-950/50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 shrink-0 rounded-full ${active ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
                      <span className="font-bold text-xs sm:text-sm text-white truncate">
                        {opp.name} {!opp.connected ? '(Offline)' : ''}
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1 truncate">{opp.cardCount} kartu tersisa</p>
                  </div>
                  <div className="flex -space-x-2.5 sm:-space-x-3 shrink-0">
                    {Array.from({ length: Math.min(opp.cardCount, 4) }).map((_, i) => (
                      <div
                        key={i}
                        className="w-5 h-7 sm:w-7 sm:h-10 rounded sm:rounded-md border border-rose-400/40 bg-gradient-to-br from-slate-800 to-slate-950 flex items-center justify-center text-[8px] sm:text-[9px] font-black text-rose-400 shadow"
                      >
                        U
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Center Table */}
          <div className="felt-surface relative rounded-3xl border border-emerald-700/40 p-5 sm:p-7 flex flex-col items-center gap-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
              <span className={`px-3 py-1 rounded-full border font-semibold transition-colors ${COLOR_STYLES[activeColor].pill}`}>
                Warna Aktif: {UNO_COLOR_LABELS[activeColor]}
              </span>
              <span className="px-3 py-1 rounded-full border border-slate-700 bg-slate-900/70 text-slate-200 inline-flex items-center gap-1.5 font-medium">
                <RotateCw className={`w-3.5 h-3.5 transition-transform duration-300 ${direction === -1 ? '-scale-x-100' : ''}`} />
                {direction === 1 ? 'Searah Jarum Jam' : 'Berlawanan Jarum Jam'}
              </span>
            </div>

            <div className="relative flex items-center justify-center gap-6 sm:gap-10 py-2">
              <button
                type="button"
                disabled={!isHumanTurn}
                onClick={handleDrawClick}
                className={`group relative w-20 h-28 rounded-xl border-2 border-slate-300/40 bg-gradient-to-br from-slate-800 via-slate-900 to-black shadow-xl flex flex-col items-center justify-center transition btn-tactile ${
                  isHumanTurn ? 'cursor-pointer hover:-translate-y-1 hover:border-amber-300' : 'opacity-65 cursor-not-allowed'
                }`}
              >
                <span className="text-lg font-black text-rose-500 tracking-wider -rotate-12">UNO</span>
                <span className="text-[10px] text-slate-300 mt-1">Ambil ({drawCount})</span>
              </button>

              <div className="relative">
                <div className={`absolute -inset-2 rounded-2xl blur-md opacity-45 transition-colors duration-300 ${COLOR_STYLES[activeColor].ring}`} />
                <div key={topCard.id} className="relative animate-card-throw">
                  <UnoCardView card={topCard} size="md" />
                </div>
                <div className={`absolute -bottom-2 -right-2 w-5 h-5 rounded-full border-2 border-white shadow-md transition-colors duration-300 ${COLOR_STYLES[activeColor].ring}`} />
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
                <span className={`w-2.5 h-2.5 rounded-full ${isHumanTurn ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <h2 className="text-sm sm:text-base font-bold text-white">
                  {myPlayerMeta?.name ?? 'Kartumu'} ({myHand.length} kartu)
                </h2>
                {myPlayerMeta?.saidUno && (
                  <span className="px-2 py-0.5 text-[11px] font-extrabold rounded-full bg-amber-400 text-slate-950">
                    UNO AKTIF
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {myHand.length <= 2 && myHand.length >= 1 && !myPlayerMeta?.saidUno && winnerIdx === null && (
                  <button
                    type="button"
                    onClick={handleCallUno}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 px-4 py-1.5 text-xs sm:text-sm font-extrabold text-slate-950 shadow-lg animate-pulse-glow cursor-pointer"
                  >
                    <BellRing className="w-4 h-4" />
                    TERIAK UNO!
                  </button>
                )}
                {isHumanTurn && (
                  <button
                    type="button"
                    onClick={handleDrawClick}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer"
                  >
                    Ambil Kartu
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2 pb-1">
              {myHand.map((card) => {
                const playable = isHumanTurn && isCardPlayable(card, topCard, activeColor);
                return (
                  <UnoCardView
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
                onClick={() => resetGame(mode)}
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
        gameTitle="UNO Classic"
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
