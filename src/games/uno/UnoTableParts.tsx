import React from 'react';
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

export const TableFeltWatermark: React.FC = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none select-none absolute inset-0 flex items-center justify-center"
  >
    <svg
      viewBox="0 0 260 260"
      className="w-56 h-56 sm:w-72 sm:h-72 md:w-80 md:h-80 opacity-35 drop-shadow-[0_4px_14px_rgba(0,0,0,0.35)]"
    >
      {/* 4-color segmented LAST ONE! ring */}
      <path d="M 130 34 A 84 84 0 0 0 46 118" fill="none" stroke="#f43f5e" strokeWidth="18" strokeLinecap="round" />
      <path d="M 130 34 A 84 84 0 0 1 214 118" fill="none" stroke="#38bdf8" strokeWidth="18" strokeLinecap="round" />
      <path d="M 46 118 A 84 84 0 0 0 130 202" fill="none" stroke="#fbbf24" strokeWidth="18" strokeLinecap="round" />
      <path d="M 214 118 A 84 84 0 0 1 130 202" fill="none" stroke="#10b981" strokeWidth="18" strokeLinecap="round" />

      {/* Dark core */}
      <circle cx="130" cy="118" r="58" fill="#0f172a" stroke="rgba(255,255,255,0.28)" strokeWidth="3" />

      {/* Golden crown */}
      <path d="M 101 89 L 114 70 L 130 83 L 146 70 L 159 89 Z" fill="#fbbf24" />

      {/* Bold white #1 */}
      <text
        x="130"
        y="153"
        textAnchor="middle"
        fontSize="64"
        fontWeight="900"
        fill="#ffffff"
        fontFamily="system-ui, sans-serif"
      >
        1
      </text>

      {/* Rounded LAST ONE pill */}
      <rect x="52" y="216" width="156" height="32" rx="16" fill="rgba(15,23,42,0.75)" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
      <text
        x="130"
        y="237"
        textAnchor="middle"
        fontSize="15"
        fontWeight="900"
        letterSpacing="3.5"
        fill="#ffffff"
        fontFamily="system-ui, sans-serif"
      >
        LAST ONE
      </text>
    </svg>
  </div>
);

export interface MoveLogEntry {
  id: number;
  text: string;
}

const MOVE_OPACITIES = [1, 0.77, 0.44] as const;

export const MoveHistoryChat: React.FC<{ entries: MoveLogEntry[] }> = ({ entries }) => {
  const recent = entries.slice(-3).reverse();
  if (recent.length === 0) return null;

  return (
    <div className="pointer-events-none select-none flex flex-col items-end gap-0.5 text-right max-w-[185px] sm:max-w-[260px]">
      {recent.map((entry, idx) => (
        <p
          key={entry.id}
          style={{
            opacity: MOVE_OPACITIES[idx] ?? 0,
            textShadow: '0 1px 4px rgba(0, 0, 0, 0.92), 0 0 10px rgba(0, 0, 0, 0.55)',
          }}
          className={
            idx === 0
              ? 'text-[11px] sm:text-xs font-bold text-white leading-snug transition-opacity duration-300'
              : 'text-[10px] sm:text-[11px] font-medium text-white leading-snug transition-opacity duration-300'
          }
        >
          {entry.text}
        </p>
      ))}
    </div>
  );
};
