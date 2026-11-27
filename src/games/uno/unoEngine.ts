import { shuffleDeck } from '../../lib/cards';

export type UnoColor = 'red' | 'blue' | 'green' | 'yellow';
export type UnoCardColor = UnoColor | 'wild';
export type UnoValue =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4';

export interface UnoCard {
  id: string;
  color: UnoCardColor;
  value: UnoValue;
}

export interface UnoPlayer {
  id: string;
  name: string;
  isHuman: boolean;
  hand: UnoCard[];
  saidUno: boolean;
}

export const UNO_COLORS: UnoColor[] = ['red', 'blue', 'green', 'yellow'];

export const UNO_COLOR_LABELS: Record<UnoColor, string> = {
  red: 'Merah',
  blue: 'Biru',
  green: 'Hijau',
  yellow: 'Kuning',
};

export function createUnoDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  let seq = 0;

  for (const color of UNO_COLORS) {
    // One '0' per color
    deck.push({ id: `uno-${seq++}`, color, value: '0' });
    // Two of 1-9 and action cards per color
    const doubles: UnoValue[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
    for (const value of doubles) {
      deck.push({ id: `uno-${seq++}`, color, value });
      deck.push({ id: `uno-${seq++}`, color, value });
    }
  }

  // Four Wild and four Wild Draw Four
  for (let i = 0; i < 4; i++) {
    deck.push({ id: `uno-${seq++}`, color: 'wild', value: 'wild' });
    deck.push({ id: `uno-${seq++}`, color: 'wild', value: 'wild4' });
  }

  return shuffleDeck(deck);
}

export function isCardPlayable(card: UnoCard, topCard: UnoCard, activeColor: UnoColor): boolean {
  if (card.color === 'wild') return true;
  if (card.color === activeColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

export function chooseBestAiCard(
  hand: UnoCard[],
  topCard: UnoCard,
  activeColor: UnoColor
): { card: UnoCard; chosenColor: UnoColor } | null {
  const playable = hand.filter((c) => isCardPlayable(c, topCard, activeColor));
  if (playable.length === 0) return null;

  // Prefer colored cards & action cards over wilds when possible
  const score = (c: UnoCard): number => {
    if (c.value === 'draw2') return 40;
    if (c.value === 'skip' || c.value === 'reverse') return 35;
    if (c.color !== 'wild') return 20 + (Number.isNaN(Number(c.value)) ? 0 : Number(c.value));
    if (c.value === 'wild') return 10;
    return 5; // save wild4 for last
  };

  playable.sort((a, b) => score(b) - score(a));
  const chosen = playable[0];

  // Count most frequent color in remaining hand for wild cards
  const counts: Record<UnoColor, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const c of hand) {
    if (c.id !== chosen.id && c.color !== 'wild') {
      counts[c.color]++;
    }
  }
  const bestColor = (Object.entries(counts) as Array<[UnoColor, number]>).sort(
    (a, b) => b[1] - a[1]
  )[0][0];

  return { card: chosen, chosenColor: bestColor };
}

export function formatUnoValue(value: UnoValue): string {
  switch (value) {
    case 'skip':
      return '⊘';
    case 'reverse':
      return '⇄';
    case 'draw2':
      return '+2';
    case 'wild':
      return 'WILD';
    case 'wild4':
      return '+4';
    default:
      return value;
  }
}
