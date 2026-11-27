import React, { useState } from 'react';
import { isRedSuit, SUIT_SYMBOL, type Card, type Rank } from '../lib/cards';

interface PlayingCardProps {
  card?: Card;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
  highlighted?: boolean;
  dimmed?: boolean;
  animateDeal?: boolean;
  flipReveal?: boolean;
  dealDelayMs?: number;
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-12 h-[68px] rounded-lg text-xs',
  md: 'w-16 h-[92px] rounded-xl text-sm',
  lg: 'w-20 h-[114px] rounded-xl text-base',
};

const RANK_FILE_NAME: Record<Rank, string> = {
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'jack',
  Q: 'queen',
  K: 'king',
  A: 'ace',
};

export const PlayingCard: React.FC<PlayingCardProps> = ({
  card,
  faceDown = false,
  size = 'md',
  highlighted = false,
  dimmed = false,
  animateDeal = true,
  flipReveal = false,
  dealDelayMs = 0,
  className = '',
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const sizeCls = SIZE_CLASSES[size];
  const dealCls = flipReveal ? 'animate-card-flip' : animateDeal ? 'animate-card-deal' : '';
  const dealStyle = !flipReveal && animateDeal && dealDelayMs > 0 ? { animationDelay: `${dealDelayMs}ms` } : undefined;

  if (faceDown || !card) {
    return (
      <div
        style={dealStyle}
        className={`${sizeCls} ${dealCls} relative select-none border border-indigo-300/40 bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 shadow-lg flex items-center justify-center overflow-hidden ${
          dimmed ? 'opacity-50' : ''
        } ${className}`}
      >
        <div
          className="absolute inset-1 rounded-md border border-amber-400/35 opacity-80"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(251,191,36,0.1) 0px, rgba(251,191,36,0.1) 3px, transparent 3px, transparent 8px)',
          }}
        />
        <div className="w-5 h-5 rounded-full border border-amber-400/50 bg-indigo-950/90 flex items-center justify-center">
          <span className="text-[10px] text-amber-300 font-bold">★</span>
        </div>
      </div>
    );
  }

  const red = isRedSuit(card.suit);
  const symbol = SUIT_SYMBOL[card.suit];
  const colorClass = red ? 'text-rose-600' : 'text-slate-900';
  const svgSrc = `/assets/cards/${RANK_FILE_NAME[card.rank]}_of_${card.suit}.svg`;

  return (
    <div
      style={dealStyle}
      className={`${sizeCls} ${dealCls} relative select-none overflow-hidden bg-white border ${
        highlighted
          ? 'border-amber-400 ring-2 ring-amber-400/75 shadow-amber-500/25'
          : 'border-slate-300'
      } shadow-lg flex flex-col justify-between transition-transform duration-150 ${
        dimmed ? 'opacity-45 grayscale-[35%]' : ''
      } ${className}`}
    >
      {!imgFailed ? (
        <img
          src={svgSrc}
          alt={`${card.rank} of ${card.suit}`}
          draggable={false}
          onError={() => setImgFailed(true)}
          className="w-full h-full object-contain p-[2px] select-none pointer-events-none"
        />
      ) : (
        <div className="w-full h-full flex flex-col justify-between p-1 bg-gradient-to-br from-white via-slate-50 to-slate-200">
          <div className={`leading-none font-bold tracking-tight flex flex-col items-center w-fit ${colorClass}`}>
            <span className={size === 'sm' ? 'text-[10px]' : size === 'md' ? 'text-[11px]' : 'text-xs'}>
              {card.rank}
            </span>
            <span className={size === 'sm' ? 'text-[9px]' : 'text-[10px]'}>{symbol}</span>
          </div>

          <div className={`absolute inset-0 flex items-center justify-center pointer-events-none leading-none ${colorClass}`}>
            <span className={size === 'sm' ? 'text-base' : size === 'md' ? 'text-xl' : 'text-2xl'}>
              {symbol}
            </span>
          </div>

          <div
            className={`leading-none font-bold tracking-tight flex flex-col items-center w-fit self-end rotate-180 ${colorClass}`}
          >
            <span className={size === 'sm' ? 'text-[10px]' : size === 'md' ? 'text-[11px]' : 'text-xs'}>
              {card.rank}
            </span>
            <span className={size === 'sm' ? 'text-[9px]' : 'text-[10px]'}>{symbol}</span>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 to-white/30" />
    </div>
  );
};
