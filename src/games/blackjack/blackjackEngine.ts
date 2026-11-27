import { createDeck, shuffleDeck, type Card } from '../../lib/cards';

export interface BlackjackHand {
  cards: Card[];
  bet: number;
  stood: boolean;
  busted: boolean;
  doubled: boolean;
  isBlackjack: boolean;
  result?: 'win' | 'lose' | 'push' | 'blackjack';
  payout?: number;
}

export function createShoe(numDecks = 6): Card[] {
  return shuffleDeck(createDeck(numDecks));
}

export function cardPointValue(card: Card): number {
  if (card.rank === 'A') return 11;
  if (['K', 'Q', 'J', '10'].includes(card.rank)) return 10;
  return Number(card.rank);
}

export function evaluateBlackjackHand(cards: Card[]): {
  total: number;
  isSoft: boolean;
  isBust: boolean;
  isNaturalBlackjack: boolean;
} {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardPointValue(c);
    if (c.rank === 'A') aces++;
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return {
    total,
    isSoft: aces > 0 && total <= 21,
    isBust: total > 21,
    isNaturalBlackjack: cards.length === 2 && total === 21,
  };
}

export function canSplitHand(hand: BlackjackHand, totalHands: number, playerChips: number): boolean {
  if (totalHands >= 2) return false;
  if (hand.cards.length !== 2) return false;
  if (playerChips < hand.bet) return false;
  return cardPointValue(hand.cards[0]) === cardPointValue(hand.cards[1]);
}
