import { Chess, type Move, type PieceSymbol } from 'chess.js';

export type ChessDifficulty = 'easy' | 'medium' | 'hard';

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece-square bonus for white (mirrored vertically for black)
const PAWN_PST = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];

const KNIGHT_PST = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];

function evaluateBoard(chess: Chess): number {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -99999 : 99999;
  }
  if (chess.isDraw()) return 0;

  let total = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const base = PIECE_VALUES[piece.type];
      let positional = 0;
      const idx = piece.color === 'w' ? r * 8 + c : (7 - r) * 8 + c;
      if (piece.type === 'p') positional = PAWN_PST[idx];
      else if (piece.type === 'n') positional = KNIGHT_PST[idx];
      else if (piece.type === 'b' || piece.type === 'q') {
        positional = (3.5 - Math.abs(3.5 - r)) * 4 + (3.5 - Math.abs(3.5 - c)) * 4;
      }

      const val = base + positional;
      total += piece.color === 'w' ? val : -val;
    }
  }
  return total;
}

function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const scoreA = (a.captured ? PIECE_VALUES[a.captured] * 10 : 0) + (a.promotion ? 800 : 0);
    const scoreB = (b.captured ? PIECE_VALUES[b.captured] * 10 : 0) + (b.promotion ? 800 : 0);
    return scoreB - scoreA;
  });
}

function minimax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizingWhite: boolean
): number {
  if (depth === 0 || chess.isGameOver()) {
    return evaluateBoard(chess);
  }

  const moves = orderMoves(chess.moves({ verbose: true }));
  if (maximizingWhite) {
    let best = -Infinity;
    for (const m of moves) {
      chess.move(m);
      const val = minimax(chess, depth - 1, alpha, beta, false);
      chess.undo();
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      chess.move(m);
      const val = minimax(chess, depth - 1, alpha, beta, true);
      chess.undo();
      if (val < best) best = val;
      if (val < beta) beta = val;
      if (beta <= alpha) break;
    }
    return best;
  }
}

export function pickChessAiMove(fen: string, difficulty: ChessDifficulty): Move | null {
  const chess = new Chess(fen);
  const moves = orderMoves(chess.moves({ verbose: true }));
  if (moves.length === 0) return null;

  const isWhite = chess.turn() === 'w';
  const depth = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;

  const scored = moves.map((m) => {
    chess.move(m);
    const score = minimax(chess, depth - 1, -Infinity, Infinity, !isWhite);
    chess.undo();
    return { move: m, score };
  });

  scored.sort((a, b) => (isWhite ? b.score - a.score : a.score - b.score));

  if (difficulty === 'easy') {
    const topSlice = scored.slice(0, Math.min(4, scored.length));
    return topSlice[Math.floor(Math.random() * topSlice.length)].move;
  }

  // Small tie-breaking jitter among equally strong top moves
  const bestScore = scored[0].score;
  const tied = scored.filter((s) => Math.abs(s.score - bestScore) <= (difficulty === 'medium' ? 15 : 3));
  return tied[Math.floor(Math.random() * tied.length)].move;
}
