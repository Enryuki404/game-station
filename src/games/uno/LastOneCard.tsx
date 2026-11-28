import React from 'react';
import type { UnoCard, UnoColor, UnoValue } from './unoEngine';

const CARD_PALETTES: Record<UnoColor | 'wild', { grad: string; corner: string }> = {
  red: {
    grad: 'from-rose-500 via-red-600 to-red-700',
    corner: 'text-white',
  },
  blue: {
    grad: 'from-sky-400 via-blue-600 to-blue-700',
    corner: 'text-white',
  },
  green: {
    grad: 'from-emerald-400 via-emerald-600 to-green-700',
    corner: 'text-white',
  },
  yellow: {
    grad: 'from-amber-300 via-yellow-400 to-amber-500',
    corner: 'text-slate-950',
  },
  wild: {
    grad: 'from-slate-800 via-slate-900 to-slate-950',
    corner: 'text-white',
  },
};

function cornerLabel(val: UnoValue): string {
  switch (val) {
    case 'skip':
      return '⊘';
    case 'skipAll':
      return '↻';
    case 'reverse':
      return '⇄';
    case 'discardAll':
      return 'ALL';
    case 'draw2':
      return '+2';
    case 'wild':
      return 'W';
    case 'wild4':
      return '+4';
    case 'wild6':
      return '+6';
    case 'wild10':
      return '+10';
    default:
      return val;
  }
}

const SkipAllIcon: React.FC<{ className?: string }> = ({ className = 'w-7 h-7 sm:w-9 sm:h-9' }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <path
      d="M 36.2 18.3 A 13.5 13.5 0 1 1 22.8 10.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="4.8"
      strokeLinecap="round"
    />
    <path d="M 22.2 4.5 L 32.5 11.4 L 21.4 16.5 Z" fill="currentColor" />
  </svg>
);

const ReverseIcon: React.FC<{ className?: string }> = ({ className = 'w-7 h-7 sm:w-9 sm:h-9' }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <g transform="rotate(-45 24 24)">
      {/* Top arrow pointing up-right after rotation */}
      <path
        d="M 9.5 22 Q 10.5 16.5 17 16.5 L 28.5 16.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.6"
        strokeLinecap="round"
      />
      <path d="M 27 10 L 38.5 16.5 L 27 23 Z" fill="currentColor" />
      {/* Bottom arrow pointing down-left after rotation (180° symmetric) */}
      <path
        d="M 38.5 26 Q 37.5 31.5 31 31.5 L 19.5 31.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.6"
        strokeLinecap="round"
      />
      <path d="M 21 38 L 9.5 31.5 L 21 25 Z" fill="currentColor" />
    </g>
  </svg>
);

const CenterGraphic: React.FC<{ card: UnoCard }> = ({ card }) => {
  const isYellow = card.color === 'yellow';
  const strokeMain = isYellow ? '#0f172a' : '#ffffff';

  if (card.value === 'skip') {
    return (
      <svg viewBox="0 0 48 48" className="w-6 h-6 sm:w-8 sm:h-8 drop-shadow-md" aria-hidden="true">
        <circle cx="24" cy="24" r="15" fill="none" stroke={strokeMain} strokeWidth="4.5" />
        <line x1="13" y1="35" x2="35" y2="13" stroke={strokeMain} strokeWidth="4.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (card.value === 'skipAll') {
    return (
      <SkipAllIcon
        className={`w-7 h-7 sm:w-9 sm:h-9 drop-shadow-md ${isYellow ? 'text-slate-950' : 'text-white'}`}
      />
    );
  }

  if (card.value === 'discardAll') {
    return (
      <svg viewBox="0 0 48 48" className="w-7 h-7 sm:w-9 sm:h-9 drop-shadow-md" aria-hidden="true">
        <rect x="8" y="13" width="14" height="20" rx="2.5" fill="none" stroke={strokeMain} strokeWidth="2.5" opacity="0.55" transform="rotate(-10 15 23)" />
        <rect x="14" y="12" width="14" height="20" rx="2.5" fill="none" stroke={strokeMain} strokeWidth="2.5" opacity="0.8" />
        <rect x="20" y="11" width="14" height="20" rx="2.5" fill={isYellow ? '#fef08a' : 'rgba(255,255,255,0.28)'} stroke={strokeMain} strokeWidth="2.5" transform="rotate(8 27 21)" />
        <path d="M26 35 L40 35 L36 31 M40 35 L36 39" fill="none" stroke={strokeMain} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (card.value === 'reverse') {
    return (
      <ReverseIcon
        className={`w-7 h-7 sm:w-9 sm:h-9 drop-shadow-md ${isYellow ? 'text-slate-950' : 'text-white'}`}
      />
    );
  }

  if (card.value === 'draw2') {
    return (
      <svg viewBox="0 0 48 48" className="w-7 h-7 sm:w-9 sm:h-9 drop-shadow-md" aria-hidden="true">
        <rect
          x="10"
          y="14"
          width="16"
          height="22"
          rx="3"
          fill={isYellow ? '#fef08a' : 'rgba(255,255,255,0.22)'}
          stroke={strokeMain}
          strokeWidth="2.5"
          transform="rotate(-12 18 25)"
        />
        <rect
          x="21"
          y="11"
          width="16"
          height="22"
          rx="3"
          fill={isYellow ? '#fde047' : 'rgba(255,255,255,0.92)'}
          stroke={isYellow ? '#0f172a' : '#0f172a'}
          strokeOpacity="0.25"
          strokeWidth="2"
          transform="rotate(10 29 22)"
        />
        <text
          x="29"
          y="25"
          textAnchor="middle"
          fontSize="10"
          fontWeight="900"
          fill="#0f172a"
          transform="rotate(10 29 22)"
        >
          +2
        </text>
      </svg>
    );
  }

  if (card.value === 'wild') {
    return (
      <svg viewBox="0 0 48 48" className="w-7 h-7 sm:w-9 sm:h-9 drop-shadow-md" aria-hidden="true">
        <circle cx="24" cy="24" r="17" fill="#0f172a" stroke="#ffffff" strokeWidth="2.5" />
        <path d="M24 9 A15 15 0 0 0 9 24 L24 24 Z" fill="#ef4444" />
        <path d="M24 9 A15 15 0 0 1 39 24 L24 24 Z" fill="#0ea5e9" />
        <path d="M9 24 A15 15 0 0 0 24 39 L24 24 Z" fill="#facc15" />
        <path d="M39 24 A15 15 0 0 1 24 39 L24 24 Z" fill="#10b981" />
        <circle cx="24" cy="24" r="4.5" fill="#ffffff" />
      </svg>
    );
  }

  if (card.value === 'wild4') {
    return (
      <svg viewBox="0 0 48 48" className="w-7 h-7 sm:w-9 sm:h-9 drop-shadow-md" aria-hidden="true">
        <rect x="6" y="16" width="12" height="17" rx="2.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.8" transform="rotate(-18 12 24)" />
        <rect x="13" y="11" width="12" height="17" rx="2.5" fill="#0ea5e9" stroke="#ffffff" strokeWidth="1.8" transform="rotate(-6 19 19)" />
        <rect x="21" y="12" width="12" height="17" rx="2.5" fill="#facc15" stroke="#ffffff" strokeWidth="1.8" transform="rotate(8 27 20)" />
        <rect x="28" y="16" width="12" height="17" rx="2.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.8" transform="rotate(19 34 24)" />
      </svg>
    );
  }

  if (card.value === 'wild6') {
    return (
      <div className="flex flex-col items-center justify-center leading-none">
        <span className="font-black text-lg sm:text-xl tracking-tight text-violet-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
          +6
        </span>
        <div className="flex gap-0.5 mt-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        </div>
      </div>
    );
  }

  if (card.value === 'wild10') {
    return (
      <div className="flex flex-col items-center justify-center leading-none">
        <span className="font-black text-base sm:text-lg tracking-tight text-rose-400 drop-shadow-[0_2px_6px_rgba(244,63,94,0.65)]">
          +10
        </span>
        <div className="flex gap-0.5 mt-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        </div>
      </div>
    );
  }

  const needsUnderline = card.value === '6' || card.value === '9';
  return (
    <div className="flex flex-col items-center justify-center leading-none">
      <span
        className={`font-black tracking-tighter text-xl sm:text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)] ${
          isYellow ? 'text-slate-950' : 'text-white'
        }`}
      >
        {card.value}
      </span>
      {needsUnderline && (
        <span className={`mt-0.5 w-3 sm:w-3.5 h-[2px] rounded-full ${isYellow ? 'bg-slate-950' : 'bg-white'}`} />
      )}
    </div>
  );
};

export const LastOneCard: React.FC<{
  card: UnoCard;
  playable?: boolean;
  onClick?: () => void;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}> = ({ card, playable = false, onClick, size = 'md', className = '' }) => {
  const palette = CARD_PALETTES[card.color];
  const corner = cornerLabel(card.value);
  const needsUnderline = card.value === '6' || card.value === '9';

  const dim =
    size === 'xs'
      ? 'w-12 h-[68px] p-1 rounded-md border-2'
      : size === 'sm'
        ? 'w-14 h-[80px] p-1.5 rounded-md border-2'
        : 'w-16 h-[92px] sm:w-[76px] sm:h-[108px] p-1.5 rounded-lg border-2';

  const cornerCls = size === 'xs' ? 'text-[9px]' : 'text-[10px] sm:text-[11px]';
  const cornerIconCls = size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3 sm:w-3.5 sm:h-3.5';
  const cornerContent =
    card.value === 'skipAll' ? (
      <SkipAllIcon className={cornerIconCls} />
    ) : card.value === 'reverse' ? (
      <ReverseIcon className={cornerIconCls} />
    ) : (
      <span>{corner}</span>
    );

  const sharedClasses = `${dim} relative border-white/95 bg-gradient-to-br ${palette.grad} ${palette.corner} shadow-xl flex flex-col justify-between select-none overflow-hidden transition-all duration-200 ease-out ${
    onClick
      ? playable
        ? 'cursor-pointer hover:-translate-y-4 hover:scale-105 hover:shadow-2xl ring-2 ring-white/90 btn-tactile'
        : 'opacity-50 cursor-not-allowed'
      : ''
  } ${className}`;

  const content = (
    <>
      {/* Diagonal glossy surface sheen */}
      <div
        className="pointer-events-none absolute -top-6 -left-6 w-24 h-24 rounded-full bg-white/15 blur-md"
        aria-hidden="true"
      />

      {/* Top-left index */}
      <span className={`relative z-10 self-start inline-flex flex-col items-center w-fit ${cornerCls} font-black leading-none tracking-tight`}>
        {cornerContent}
        {needsUnderline && <span className="w-2 h-[1.5px] bg-current mt-[1px]" />}
      </span>

      {/* Upright classic rectangular inner frame */}
      <div className="relative z-10 self-center w-[76%] h-[58%] rounded-md border border-white/45 bg-black/20 flex items-center justify-center shadow-inner">
        <div className="flex items-center justify-center">
          <CenterGraphic card={card} />
        </div>
      </div>

      {/* Bottom-right inverted index */}
      <span className={`relative z-10 self-end inline-flex flex-col items-center w-fit rotate-180 ${cornerCls} font-black leading-none tracking-tight`}>
        {cornerContent}
        {needsUnderline && <span className="w-2 h-[1.5px] bg-current mt-[1px]" />}
      </span>
    </>
  );

  if (!onClick) {
    return <div className={sharedClasses}>{content}</div>;
  }

  return (
    <button
      type="button"
      disabled={!playable}
      onClick={onClick}
      className={`animate-card-deal ${sharedClasses}`}
    >
      {content}
    </button>
  );
};

export const LastOneCardBack: React.FC<{
  size?: 'mini' | 'sm' | 'md';
  className?: string;
}> = ({ size = 'md', className = '' }) => {
  const isMini = size === 'mini';
  const dim =
    size === 'mini'
      ? 'w-5 h-7 sm:w-6 sm:h-[34px] rounded-[4px] border-[1.5px]'
      : size === 'sm'
        ? 'w-14 h-[80px] rounded-md border-2'
        : 'w-16 h-[92px] sm:w-[76px] sm:h-[108px] rounded-lg border-2';

  return (
    <div
      className={`${dim} relative border-white/90 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 shadow-xl flex flex-col items-center justify-center overflow-hidden select-none ${className}`}
    >
      {/* Subtle geometric lattice pattern */}
      <svg viewBox="0 0 80 120" className="absolute inset-0 w-full h-full opacity-20" aria-hidden="true">
        <defs>
          <pattern id="lo-grid" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M 8 0 L 16 8 L 8 16 L 0 8 Z" fill="none" stroke="#94a3b8" strokeWidth="0.9" />
          </pattern>
        </defs>
        <rect width="80" height="120" fill="url(#lo-grid)" />
      </svg>

      {/* Inner framed border */}
      {!isMini && (
        <div className="pointer-events-none absolute inset-1 rounded-[4px] border border-white/15" aria-hidden="true" />
      )}

      {/* Custom LAST ONE! Original Emblem: 4-color arc ring + #1 crown/star mark */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-1">
        <svg
          viewBox="0 0 64 64"
          className={isMini ? 'w-3.5 h-3.5 sm:w-4 sm:h-4' : 'w-9 h-9 sm:w-12 sm:h-12 drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]'}
          aria-hidden="true"
        >
          {/* 4-color segmented ring */}
          <path d="M 32 6 A 26 26 0 0 0 6 32" fill="none" stroke="#f43f5e" strokeWidth="6.5" strokeLinecap="round" />
          <path d="M 32 6 A 26 26 0 0 1 58 32" fill="none" stroke="#38bdf8" strokeWidth="6.5" strokeLinecap="round" />
          <path d="M 6 32 A 26 26 0 0 0 32 58" fill="none" stroke="#fbbf24" strokeWidth="6.5" strokeLinecap="round" />
          <path d="M 58 32 A 26 26 0 0 1 32 58" fill="none" stroke="#10b981" strokeWidth="6.5" strokeLinecap="round" />
          {/* Dark core */}
          <circle cx="32" cy="32" r="18" fill="#0f172a" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
          {/* Minimalist crown */}
          <path
            d="M23 23 L27 17 L32 21 L37 17 L41 23 Z"
            fill="#fbbf24"
          />
          {/* Bold numeral 1 */}
          <text
            x="32"
            y="43"
            textAnchor="middle"
            fontSize="20"
            fontWeight="900"
            fill="#ffffff"
            fontFamily="system-ui, sans-serif"
          >
            1
          </text>
        </svg>

        {!isMini && (
          <span className="px-1.5 py-[1px] rounded-full bg-white/10 border border-white/20 text-[7px] sm:text-[8.5px] font-black tracking-wider text-white uppercase leading-tight">
            LAST ONE
          </span>
        )}
      </div>
    </div>
  );
};

export const LastOneDrawDeck: React.FC<{
  drawCount: number;
  canDraw: boolean;
  hasPlayableCard: boolean;
  pendingDraw?: number;
  onDraw: () => void;
}> = ({ drawCount, canDraw, hasPlayableCard, pendingDraw = 0, onDraw }) => {
  const mustDrawPenalty = canDraw && pendingDraw > 0 && !hasPlayableCard;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative pt-1.5 pr-2">
        {/* Stacked opaque card-edge layers (no inner logo to prevent bleed-through) */}
        {drawCount > 2 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1.5 left-0 translate-x-2 -translate-y-1.5 w-16 h-[92px] sm:w-[76px] sm:h-[108px] rounded-lg border-2 border-white/60 bg-slate-950 shadow-md"
          />
        )}
        {drawCount > 1 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1.5 left-0 translate-x-1 -translate-y-0.5 w-16 h-[92px] sm:w-[76px] sm:h-[108px] rounded-lg border-2 border-white/75 bg-slate-900 shadow-md"
          />
        )}

        <button
          type="button"
          disabled={!canDraw}
          onClick={onDraw}
          aria-label="Ambil kartu dari dek"
          title={canDraw ? 'Klik dek untuk mengambil kartu' : 'Tunggu giliranmu'}
          className={`relative block rounded-lg transition-all duration-200 btn-tactile ${
            canDraw
              ? mustDrawPenalty
                ? 'cursor-pointer hover:-translate-y-1.5 hover:scale-[1.04] ring-2 ring-rose-400 shadow-[0_0_24px_rgba(244,63,94,0.55)] animate-pulse-glow'
                : !hasPlayableCard
                  ? 'cursor-pointer hover:-translate-y-1.5 hover:scale-[1.04] ring-2 ring-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.45)] animate-pulse-glow'
                  : 'cursor-pointer hover:-translate-y-1.5 hover:scale-[1.04] ring-2 ring-emerald-300/70 hover:ring-amber-300 shadow-[0_0_18px_rgba(16,185,129,0.3)]'
              : 'brightness-75 saturate-75 cursor-not-allowed'
          }`}
        >
          <LastOneCardBack size="md" />
        </button>
      </div>

      <span
        className={`px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold font-mono-num border ${
          mustDrawPenalty
            ? 'bg-rose-500 text-white border-rose-200'
            : canDraw && !hasPlayableCard
              ? 'bg-amber-400 text-slate-950 border-amber-200'
              : 'bg-black/40 text-slate-200 border-white/15'
        }`}
      >
        {canDraw && pendingDraw > 0
          ? `Ambil +${pendingDraw}`
          : canDraw
            ? `Tap Dek (${drawCount})`
            : `Dek (${drawCount})`}
      </span>
    </div>
  );
};
