import React from 'react';
import type { Color, PieceSymbol } from 'chess.js';

interface ChessPieceProps {
  type: PieceSymbol;
  color: Color;
  className?: string;
}

export const ChessPieceSvg: React.FC<ChessPieceProps> = ({
  type,
  color,
  className = 'w-[90%] h-[108%] object-bottom',
}) => {
  const file = `${color}${type.toUpperCase()}.svg`;
  return (
    <img
      src={`/assets/chess/staunty/${file}`}
      alt={`${color === 'w' ? 'Putih' : 'Hitam'} ${type.toUpperCase()}`}
      draggable={false}
      className={`${className} object-contain drop-shadow-[0_3px_4px_rgba(0,0,0,0.42)] select-none pointer-events-none`}
    />
  );
};
