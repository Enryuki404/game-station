import { rankNumericValue, type Card } from '../../lib/cards';

export interface EvaluatedHand {
  category: number; // 0 High Card .. 9 Royal Flush
  name: string;
  tiebreakers: number[];
  score: number; // deterministic comparable integer
}

const CATEGORY_NAMES = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
  'Royal Flush',
] as const;

function encodeScore(category: number, tiebreakers: number[]): number {
  let score = category;
  for (let i = 0; i < 5; i++) {
    score = score * 15 + (tiebreakers[i] ?? 0);
  }
  return score;
}

function evaluateFiveCards(cards: Card[]): EvaluatedHand {
  const ranks = cards.map((c) => rankNumericValue(c.rank)).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);

  const uniqueRanks = Array.from(new Set(ranks));
  let isStraight = false;
  let straightHigh = 0;

  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      isStraight = true;
      straightHigh = uniqueRanks[0];
    } else if (
      uniqueRanks[0] === 14 &&
      uniqueRanks[1] === 5 &&
      uniqueRanks[2] === 4 &&
      uniqueRanks[3] === 3 &&
      uniqueRanks[4] === 2
    ) {
      // A-2-3-4-5 wheel straight
      isStraight = true;
      straightHigh = 5;
    }
  }

  // Group counts
  const counts = new Map<number, number>();
  for (const r of ranks) {
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const groups = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  if (isStraight && isFlush) {
    const category = straightHigh === 14 ? 9 : 8;
    const tb = [straightHigh];
    return { category, name: CATEGORY_NAMES[category], tiebreakers: tb, score: encodeScore(category, tb) };
  }

  if (groups[0][1] === 4) {
    const tb = [groups[0][0], groups[1][0]];
    return { category: 7, name: CATEGORY_NAMES[7], tiebreakers: tb, score: encodeScore(7, tb) };
  }

  if (groups[0][1] === 3 && groups[1][1] === 2) {
    const tb = [groups[0][0], groups[1][0]];
    return { category: 6, name: CATEGORY_NAMES[6], tiebreakers: tb, score: encodeScore(6, tb) };
  }

  if (isFlush) {
    return { category: 5, name: CATEGORY_NAMES[5], tiebreakers: ranks, score: encodeScore(5, ranks) };
  }

  if (isStraight) {
    const tb = [straightHigh];
    return { category: 4, name: CATEGORY_NAMES[4], tiebreakers: tb, score: encodeScore(4, tb) };
  }

  if (groups[0][1] === 3) {
    const tb = [groups[0][0], groups[1][0], groups[2][0]];
    return { category: 3, name: CATEGORY_NAMES[3], tiebreakers: tb, score: encodeScore(3, tb) };
  }

  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const tb = [groups[0][0], groups[1][0], groups[2][0]];
    return { category: 2, name: CATEGORY_NAMES[2], tiebreakers: tb, score: encodeScore(2, tb) };
  }

  if (groups[0][1] === 2) {
    const tb = [groups[0][0], groups[1][0], groups[2][0], groups[3][0]];
    return { category: 1, name: CATEGORY_NAMES[1], tiebreakers: tb, score: encodeScore(1, tb) };
  }

  return { category: 0, name: CATEGORY_NAMES[0], tiebreakers: ranks, score: encodeScore(0, ranks) };
}

export function evaluateBestHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5) {
    const ranks = cards.map((c) => rankNumericValue(c.rank)).sort((a, b) => b - a);
    const hasPair = ranks.length === 2 && ranks[0] === ranks[1];
    const cat = hasPair ? 1 : 0;
    const tb = hasPair ? [ranks[0]] : ranks;
    return {
      category: cat,
      name: hasPair ? 'Pocket Pair' : 'High Card',
      tiebreakers: tb,
      score: encodeScore(cat, tb),
    };
  }

  let best: EvaluatedHand | null = null;
  const n = cards.length;
  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            const ev = evaluateFiveCards([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || ev.score > best.score) {
              best = ev;
            }
          }
        }
      }
    }
  }
  return best!;
}
