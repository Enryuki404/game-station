import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import type { UnoColor } from './unoEngine';
import { LastOneCardBack } from './LastOneCard';

const AVATAR_THEMES = [
  { bg: 'from-rose-500/85 to-red-800', skin: '#d99b6c', hair: '#1e1b2e', shirt: '#fb7185' },
  { bg: 'from-emerald-500/85 to-teal-800', skin: '#f3c19d', hair: '#4a3525', shirt: '#34d399' },
  { bg: 'from-violet-500/85 to-purple-900', skin: '#9b6b4c', hair: '#2e1a47', shirt: '#a78bfa' },
  { bg: 'from-amber-500/85 to-orange-800', skin: '#eab892', hair: '#8b7e74', shirt: '#fbbf24' },
  { bg: 'from-sky-500/85 to-blue-800', skin: '#c68a5e', hair: '#0f172a', shirt: '#38bdf8' },
  { bg: 'from-pink-500/85 to-fuchsia-800', skin: '#f5ccb0', hair: '#7c2d12', shirt: '#f472b6' },
];

const CharacterPortrait: React.FC<{ seatIdx: number }> = ({ seatIdx }) => {
  const theme = AVATAR_THEMES[((seatIdx % AVATAR_THEMES.length) + AVATAR_THEMES.length) % AVATAR_THEMES.length];
  const variant = ((seatIdx % 4) + 4) % 4;

  return (
    <svg viewBox="0 0 64 64" className="w-full h-full" aria-hidden="true">
      {/* Subtle inner glow */}
      <circle cx="32" cy="24" r="24" fill="rgba(255,255,255,0.12)" />
      {/* Shoulders / Shirt */}
      <path d="M12 64 C13 48, 51 48, 52 64 Z" fill={theme.shirt} />
      {/* Neck */}
      <rect x="27" y="40" width="10" height="10" rx="4" fill={theme.skin} />
      {/* Hair back for style 1 & 2 */}
      {variant === 1 && <path d="M17 28 C16 14, 48 14, 47 28 L49 44 L15 44 Z" fill={theme.hair} />}
      {variant === 2 && <ellipse cx="32" cy="27" rx="17" ry="16" fill={theme.hair} />}
      {/* Face */}
      <ellipse cx="32" cy="29" rx="13" ry="14" fill={theme.skin} />
      {/* Hair front */}
      {variant === 0 && (
        <path d="M19 25 C20 13, 44 13, 45 25 C40 19, 24 19, 19 25 Z" fill={theme.hair} />
      )}
      {variant === 1 && (
        <path d="M19 25 C21 15, 43 15, 45 25 C39 20, 32 21, 19 25 Z" fill={theme.hair} />
      )}
      {variant === 2 && (
        <path d="M18 26 C19 14, 45 14, 46 26 C40 21, 35 19, 32 22 C29 19, 24 21, 18 26 Z" fill={theme.hair} />
      )}
      {variant === 3 && (
        <path
          d="M18 26 L21 16 L27 20 L32 13 L37 20 L43 16 L46 26 C40 22, 24 22, 18 26 Z"
          fill={theme.hair}
        />
      )}
      {/* Eyes */}
      <circle cx="27" cy="29" r="2.1" fill="#0f172a" />
      <circle cx="37" cy="29" r="2.1" fill="#0f172a" />
      <circle cx="27.7" cy="28.3" r="0.7" fill="#ffffff" />
      <circle cx="37.7" cy="28.3" r="0.7" fill="#ffffff" />
      {/* Smile */}
      <path d="M27.5 35 Q32 39 36.5 35" fill="none" stroke="#451a03" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
};

export const SeatAvatar: React.FC<{
  seatIdx: number;
  name: string;
  cardCount: number;
  isActive: boolean;
  eliminated?: boolean;
  saidUno?: boolean;
  isNoMercy?: boolean;
  compact?: boolean;
}> = ({ seatIdx, name, cardCount, isActive, eliminated = false, saidUno = false, isNoMercy = false, compact = false }) => {
  const theme = AVATAR_THEMES[((seatIdx % AVATAR_THEMES.length) + AVATAR_THEMES.length) % AVATAR_THEMES.length];
  const dangerCount = isNoMercy && cardCount >= 20 && !eliminated;
  const unoAlert = cardCount === 1 && !eliminated;

  return (
    <div className="relative inline-block shrink-0" title={name}>
      <div
        className={`${
          compact ? 'w-10 h-10 rounded-lg' : 'w-11 h-11 sm:w-[52px] sm:h-[52px] rounded-xl'
        } relative overflow-hidden border-2 bg-gradient-to-br ${theme.bg} transition-all duration-300 ${
          eliminated
            ? 'grayscale opacity-50 border-rose-500/60'
            : isActive
              ? 'border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.6)] ring-2 ring-amber-400/40 scale-105'
              : saidUno
                ? 'border-amber-400/80 shadow-lg'
                : 'border-white/40 shadow-lg'
        }`}
      >
        <CharacterPortrait seatIdx={seatIdx} />
        {isActive && !eliminated && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1 left-1 w-2 h-2 rounded-full bg-amber-300 animate-ping"
          />
        )}
      </div>

      {/* Floating crisp white card-count badge */}
      <span
        className={`absolute -bottom-1.5 -right-2 min-w-[21px] h-5 sm:min-w-[23px] sm:h-6 px-1 rounded-md flex items-center justify-center font-black text-[10px] sm:text-[11px] font-mono-num shadow-lg border ${
          eliminated
            ? 'bg-rose-600 text-white border-rose-200'
            : dangerCount
              ? 'bg-rose-500 text-white border-rose-200 animate-pulse'
              : unoAlert
                ? 'bg-amber-400 text-slate-950 border-amber-100'
                : 'bg-white text-slate-950 border-slate-200'
        }`}
      >
        {eliminated ? 'KO' : cardCount}
      </span>
    </div>
  );
};

export const OpponentCardFan: React.FC<{
  cardCount: number;
  compact?: boolean;
}> = ({ cardCount, compact = false }) => {
  const shown = Math.min(cardCount, compact ? 5 : 7);
  if (shown <= 0) return null;
  const mid = (shown - 1) / 2;

  return (
    <div className="flex items-center justify-center py-1 px-0.5 select-none" aria-hidden="true">
      {Array.from({ length: shown }).map((_, i) => {
        const offset = i - mid;
        const rot = offset * (compact ? 4 : 4.5);
        const dropY = Math.abs(offset) * (compact ? 1.1 : 1.4);
        return (
          <div
            key={i}
            style={{
              marginLeft: i === 0 ? 0 : compact ? -10 : -11,
              transform: `rotate(${rot}deg) translateY(${dropY}px)`,
            }}
            className="transition-transform duration-200"
          >
            <LastOneCardBack size="mini" className="shadow-md" />
          </div>
        );
      })}
    </div>
  );
};

export interface TableOpponent {
  id: string;
  name: string;
  seatIdx: number;
  cardCount: number;
  saidUno: boolean;
  eliminated: boolean;
  connected: boolean;
}

export const OpponentSeat: React.FC<{
  player: TableOpponent;
  isActive: boolean;
  position: 'top' | 'left' | 'right' | 'compact';
  isNoMercy: boolean;
}> = ({ player, isActive, position, isNoMercy }) => {
  const isCompact = position === 'compact';

  const avatarBlock = (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <span
        className={`px-2 py-0.5 rounded-md bg-black/55 border text-[10px] sm:text-[11px] font-bold truncate max-w-[84px] sm:max-w-[96px] leading-tight ${
          player.eliminated
            ? 'border-rose-500/40 text-rose-300 line-through'
            : isActive
              ? 'border-amber-300/70 text-amber-200 shadow-sm'
              : 'border-white/15 text-white/95'
        }`}
      >
        {player.name}
        {!player.connected ? ' •' : ''}
      </span>
      <SeatAvatar
        seatIdx={player.seatIdx}
        name={player.name}
        cardCount={player.cardCount}
        isActive={isActive}
        eliminated={player.eliminated}
        saidUno={player.saidUno}
        isNoMercy={isNoMercy}
        compact={isCompact}
      />
      {player.saidUno && !player.eliminated && (
        <span className="px-1.5 py-[1px] rounded-full bg-amber-400 text-slate-950 text-[8.5px] font-black tracking-wide shadow">
          LAST ONE!
        </span>
      )}
    </div>
  );

  if (isCompact) {
    return (
      <div className="flex flex-col items-center gap-1 min-w-0">
        {avatarBlock}
        {!player.eliminated && <OpponentCardFan cardCount={player.cardCount} compact />}
      </div>
    );
  }

  const fan = !player.eliminated ? <OpponentCardFan cardCount={player.cardCount} /> : null;

  return (
    <div
      className={`flex items-center gap-3 sm:gap-3.5 ${
        position === 'left' ? 'flex-row' : 'flex-row-reverse'
      }`}
    >
      {position === 'left' ? (
        <>
          {avatarBlock}
          {fan}
        </>
      ) : (
        <>
          {avatarBlock}
          {fan}
        </>
      )}
    </div>
  );
};

const RING_COLORS: Record<UnoColor | 'allwild', { stroke: string; glow: string }> = {
  red: { stroke: '#fb7185', glow: 'rgba(244, 63, 94, 0.55)' },
  blue: { stroke: '#38bdf8', glow: 'rgba(14, 165, 233, 0.55)' },
  green: { stroke: '#4ade80', glow: 'rgba(34, 197, 94, 0.55)' },
  yellow: { stroke: '#fde047', glow: 'rgba(250, 204, 21, 0.55)' },
  allwild: { stroke: '#c084fc', glow: 'rgba(168, 85, 247, 0.55)' },
};

export const DirectionGlowRing: React.FC<{
  activeColor: UnoColor;
  direction: 1 | -1;
  isAllWild?: boolean;
}> = ({ activeColor, direction, isAllWild = false }) => {
  const palette = RING_COLORS[isAllWild ? 'allwild' : activeColor];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-45"
    >
      <svg
        viewBox="0 0 560 280"
        className={`w-[320px] sm:w-[440px] md:w-[500px] h-auto transition-transform duration-500 ${
          direction === -1 ? '-scale-x-100' : 'scale-x-100'
        }`}
        style={{ filter: `drop-shadow(0 0 14px ${palette.glow})` }}
      >
        {/* Top clockwise sweeping arc */}
        <path
          d="M 92 96 C 165 16, 380 16, 452 76"
          fill="none"
          stroke={palette.stroke}
          strokeWidth="16"
          strokeLinecap="round"
          opacity="0.22"
        />
        <path
          d="M 92 96 C 165 16, 380 16, 452 76"
          fill="none"
          stroke={palette.stroke}
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.82"
        />
        <path d="M 446 56 L 482 92 L 436 86 Z" fill={palette.stroke} opacity="0.88" />

        {/* Bottom clockwise sweeping arc */}
        <path
          d="M 468 184 C 395 264, 180 264, 108 204"
          fill="none"
          stroke={palette.stroke}
          strokeWidth="16"
          strokeLinecap="round"
          opacity="0.22"
        />
        <path
          d="M 468 184 C 395 264, 180 264, 108 204"
          fill="none"
          stroke={palette.stroke}
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.82"
        />
        <path d="M 114 224 L 78 188 L 124 194 Z" fill={palette.stroke} opacity="0.88" />
      </svg>
    </div>
  );
};

export interface MoveLogEntry {
  id: number;
  text: string;
}

export const MoveHistoryChat: React.FC<{ entries: MoveLogEntry[] }> = ({ entries }) => {
  const [expanded, setExpanded] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 640 : true
  );
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (expanded && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries.length, expanded]);

  const latest = entries[entries.length - 1]?.text ?? 'Permainan dimulai.';

  return (
    <div className="w-52 sm:w-60 rounded-xl border border-white/12 bg-black/45 backdrop-blur-md shadow-lg text-left overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-emerald-200/90 hover:bg-white/5 transition cursor-pointer"
        aria-expanded={expanded}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <MessageSquare className="w-3 h-3 text-emerald-300" />
          Riwayat ({entries.length})
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-white/60" /> : <ChevronDown className="w-3.5 h-3.5 text-white/60" />}
      </button>

      {expanded ? (
        <div
          ref={listRef}
          className="max-h-[84px] overflow-y-auto no-scrollbar px-2.5 pb-2 space-y-1 border-t border-white/10 pt-1.5"
        >
          {entries.length === 0 ? (
            <p className="text-[10.5px] text-white/70 leading-snug">Menunggu giliran pertama...</p>
          ) : (
            entries.map((entry, idx) => {
              const isLatest = idx === entries.length - 1;
              return (
                <p
                  key={entry.id}
                  className={
                    isLatest
                      ? 'text-[11px] font-semibold text-white leading-snug'
                      : 'text-[10px] text-white/55 leading-snug'
                  }
                >
                  {entry.text}
                </p>
              );
            })
          )}
        </div>
      ) : (
        <p className="truncate text-[10.5px] text-white/85 px-2.5 pb-1.5">{latest}</p>
      )}
    </div>
  );
};
