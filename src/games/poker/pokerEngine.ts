import { createDeck, rankNumericValue, shuffleDeck, type Card } from '../../lib/cards';
import { evaluateBestHand, type EvaluatedHand } from './pokerEvaluator';

export type PokerStreet = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface PokerPlayer {
  id: string;
  name: string;
  isHuman: boolean;
  chips: number;
  cards: Card[];
  betThisStreet: number;
  totalCommitted: number;
  folded: boolean;
  allIn: boolean;
  actedThisStreet: boolean;
  lastAction?: string;
  aggression: number; // 0..1 AI profile
  evalResult?: EvaluatedHand;
}

export interface PokerState {
  players: PokerPlayer[];
  deck: Card[];
  community: Card[];
  pot: number;
  street: PokerStreet;
  dealerIdx: number;
  turnIdx: number;
  currentBet: number;
  minRaise: number;
  smallBlind: number;
  bigBlind: number;
  winners: Array<{ playerId: string; amount: number; handName: string }>;
  status: string;
}

function nextActiveIndex(players: PokerPlayer[], fromIdx: number): number {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (fromIdx + i) % n;
    const p = players[idx];
    if (!p.folded && !p.allIn) return idx;
  }
  return -1;
}

export function createPokerHand(
  humanChips: number,
  prevPlayers: PokerPlayer[] | null,
  dealerIdx: number,
  smallBlind: number,
  bigBlind: number,
  aiCount = 3
): PokerState {
  const deck = shuffleDeck(createDeck(1));
  const aiTemplates = [
    { id: 'ai-1', name: 'Raka', aggression: 0.62 },
    { id: 'ai-2', name: 'Sinta', aggression: 0.38 },
    { id: 'ai-3', name: 'Budi', aggression: 0.75 },
    { id: 'ai-4', name: 'Dewi', aggression: 0.48 },
    { id: 'ai-5', name: 'Dimas', aggression: 0.68 },
  ];
  const activeAis = aiTemplates.slice(0, Math.max(1, Math.min(5, aiCount)));

  const players: PokerPlayer[] = [
    {
      id: 'human',
      name: 'Kamu',
      isHuman: true,
      chips: humanChips,
      cards: [deck.pop()!, deck.pop()!],
      betThisStreet: 0,
      totalCommitted: 0,
      folded: humanChips <= 0,
      allIn: false,
      actedThisStreet: false,
      aggression: 0.5,
    },
    ...activeAis.map((tpl) => {
      const prevChips = prevPlayers?.find((p) => p.id === tpl.id)?.chips ?? 10000;
      const rebuyChips = prevChips < bigBlind * 4 ? 10000 : prevChips;
      return {
        id: tpl.id,
        name: tpl.name,
        isHuman: false,
        chips: rebuyChips,
        cards: [deck.pop()!, deck.pop()!],
        betThisStreet: 0,
        totalCommitted: 0,
        folded: false,
        allIn: false,
        actedThisStreet: false,
        aggression: tpl.aggression,
      };
    }),
  ];

  const n = players.length;
  const safeDealer = ((dealerIdx % n) + n) % n;
  const sbIdx = n === 2 ? safeDealer : (safeDealer + 1) % n;
  const bbIdx = (sbIdx + 1) % n;

  const postBlind = (idx: number, amount: number, label: string): number => {
    const p = players[idx];
    const paid = Math.min(p.chips, amount);
    p.chips -= paid;
    p.betThisStreet = paid;
    p.totalCommitted = paid;
    if (p.chips === 0) p.allIn = true;
    p.lastAction = `${label} ${paid}`;
    return paid;
  };

  const sbPaid = postBlind(sbIdx, smallBlind, 'SB');
  const bbPaid = postBlind(bbIdx, bigBlind, 'BB');
  const pot = sbPaid + bbPaid;

  const firstTurn = nextActiveIndex(players, bbIdx);

  return {
    players,
    deck,
    community: [],
    pot,
    street: 'preflop',
    dealerIdx,
    turnIdx: firstTurn,
    currentBet: Math.max(sbPaid, bbPaid),
    minRaise: bigBlind,
    smallBlind,
    bigBlind,
    winners: [],
    status: `Pre-Flop — Giliran ${players[firstTurn]?.name ?? ''}`,
  };
}

function resolveShowdown(state: PokerState): PokerState {
  const deck = [...state.deck];
  const community = [...state.community];
  while (community.length < 5 && deck.length > 0) {
    community.push(deck.pop()!);
  }

  const players = state.players.map((p) => ({
    ...p,
    evalResult: p.folded ? undefined : evaluateBestHand([...p.cards, ...community]),
  }));

  const active = players.filter((p) => !p.folded);

  // If everyone else folded, last player takes entire pot
  if (active.length === 1) {
    const solo = active[0];
    solo.chips += state.pot;
    return {
      ...state,
      players,
      deck,
      community,
      street: 'showdown',
      turnIdx: -1,
      winners: [{ playerId: solo.id, amount: state.pot, handName: 'Lawan Fold' }],
      status: `${solo.name} memenangkan pot ${state.pot.toLocaleString('id-ID')} chip!`,
    };
  }

  // Side-pot aware payout distribution using commitment levels
  const levels = Array.from(
    new Set(players.filter((p) => p.totalCommitted > 0).map((p) => p.totalCommitted))
  ).sort((a, b) => a - b);

  const payoutMap = new Map<string, number>();
  let prevLevel = 0;

  for (const level of levels) {
    const slice = level - prevLevel;
    if (slice <= 0) continue;
    let slicePot = 0;
    for (const p of players) {
      if (p.totalCommitted >= level) slicePot += slice;
      else if (p.totalCommitted > prevLevel) slicePot += p.totalCommitted - prevLevel;
    }

    const eligible = active.filter((p) => p.totalCommitted >= level);
    if (eligible.length > 0 && slicePot > 0) {
      const bestScore = Math.max(...eligible.map((p) => p.evalResult!.score));
      const sliceWinners = eligible.filter((p) => p.evalResult!.score === bestScore);
      const share = Math.floor(slicePot / sliceWinners.length);
      let rem = slicePot - share * sliceWinners.length;
      for (const w of sliceWinners) {
        const bonus = rem > 0 ? 1 : 0;
        if (rem > 0) rem--;
        payoutMap.set(w.id, (payoutMap.get(w.id) ?? 0) + share + bonus);
      }
    }
    prevLevel = level;
  }

  const winners: PokerState['winners'] = [];
  for (const p of players) {
    const wonAmt = payoutMap.get(p.id) ?? 0;
    if (wonAmt > 0) {
      p.chips += wonAmt;
      winners.push({
        playerId: p.id,
        amount: wonAmt,
        handName: p.evalResult?.name ?? 'Showdown',
      });
    }
  }

  const summary = winners.map((w) => {
    const name = players.find((p) => p.id === w.playerId)?.name ?? '';
    return `${name} (${w.handName}, +${w.amount})`;
  });

  return {
    ...state,
    players,
    deck,
    community,
    street: 'showdown',
    turnIdx: -1,
    winners,
    status: `Showdown: ${summary.join(' & ')}`,
  };
}

function advanceStreetOrShowdown(state: PokerState): PokerState {
  const nonFolded = state.players.filter((p) => !p.folded);
  if (nonFolded.length <= 1) {
    return resolveShowdown(state);
  }

  const canActCount = nonFolded.filter((p) => !p.allIn).length;
  const everyoneMatched = nonFolded.every(
    (p) => p.allIn || (p.actedThisStreet && p.betThisStreet === state.currentBet)
  );

  if (!everyoneMatched) {
    const nextIdx = nextActiveIndex(state.players, state.turnIdx);
    if (nextIdx !== -1) {
      return {
        ...state,
        turnIdx: nextIdx,
        status: `${state.street.toUpperCase()} — Giliran ${state.players[nextIdx].name}`,
      };
    }
  }

  // If 0 or 1 players can still bet, auto-runout directly to Showdown
  if (canActCount <= 1 || state.street === 'river') {
    return resolveShowdown(state);
  }

  const deck = [...state.deck];
  const community = [...state.community];
  let nextStreet: PokerStreet = 'flop';

  if (state.street === 'preflop') {
    nextStreet = 'flop';
    community.push(deck.pop()!, deck.pop()!, deck.pop()!);
  } else if (state.street === 'flop') {
    nextStreet = 'turn';
    community.push(deck.pop()!);
  } else if (state.street === 'turn') {
    nextStreet = 'river';
    community.push(deck.pop()!);
  }

  const resetPlayers = state.players.map((p) => ({
    ...p,
    betThisStreet: 0,
    actedThisStreet: false,
    lastAction: p.folded ? 'Fold' : p.allIn ? 'All-In' : undefined,
  }));

  const firstIdx = nextActiveIndex(resetPlayers, state.dealerIdx);
  if (firstIdx === -1) {
    return resolveShowdown({ ...state, players: resetPlayers, deck, community, street: nextStreet });
  }

  return {
    ...state,
    players: resetPlayers,
    deck,
    community,
    street: nextStreet,
    currentBet: 0,
    minRaise: state.bigBlind,
    turnIdx: firstIdx,
    status: `${nextStreet.toUpperCase()} — Giliran ${resetPlayers[firstIdx].name}`,
  };
}

export function applyPokerAction(
  state: PokerState,
  action: { type: 'fold' | 'call' | 'raise'; raiseTo?: number }
): PokerState {
  if (state.street === 'showdown' || state.turnIdx < 0) return state;

  const players = state.players.map((p) => ({ ...p }));
  const actor = players[state.turnIdx];
  let pot = state.pot;
  let currentBet = state.currentBet;
  let minRaise = state.minRaise;

  if (action.type === 'fold') {
    actor.folded = true;
    actor.actedThisStreet = true;
    actor.lastAction = 'Fold';
  } else if (action.type === 'call') {
    const toCall = Math.max(0, currentBet - actor.betThisStreet);
    const paid = Math.min(actor.chips, toCall);
    actor.chips -= paid;
    actor.betThisStreet += paid;
    actor.totalCommitted += paid;
    pot += paid;
    actor.actedThisStreet = true;
    if (actor.chips === 0) actor.allIn = true;
    actor.lastAction = paid === 0 ? 'Check' : actor.allIn ? `All-In ${actor.betThisStreet}` : `Call ${paid}`;
  } else if (action.type === 'raise') {
    const targetBet = Math.max(currentBet + minRaise, action.raiseTo ?? currentBet + minRaise);
    const needed = Math.max(0, targetBet - actor.betThisStreet);
    const paid = Math.min(actor.chips, needed);
    actor.chips -= paid;
    actor.betThisStreet += paid;
    actor.totalCommitted += paid;
    pot += paid;
    actor.actedThisStreet = true;
    if (actor.chips === 0) actor.allIn = true;

    if (actor.betThisStreet > currentBet) {
      const raiseDelta = actor.betThisStreet - currentBet;
      minRaise = Math.max(minRaise, raiseDelta);
      currentBet = actor.betThisStreet;
      for (const p of players) {
        if (p.id !== actor.id && !p.folded && !p.allIn) {
          p.actedThisStreet = false;
        }
      }
    }
    actor.lastAction = actor.allIn ? `All-In ${actor.betThisStreet}` : `Raise ${actor.betThisStreet}`;
  }

  return advanceStreetOrShowdown({
    ...state,
    players,
    pot,
    currentBet,
    minRaise,
  });
}

export function decidePokerAiAction(state: PokerState): { type: 'fold' | 'call' | 'raise'; raiseTo?: number } {
  const actor = state.players[state.turnIdx];
  const toCall = Math.max(0, state.currentBet - actor.betThisStreet);

  let strength = 0.3;
  if (state.community.length === 0) {
    const r1 = rankNumericValue(actor.cards[0].rank);
    const r2 = rankNumericValue(actor.cards[1].rank);
    const suited = actor.cards[0].suit === actor.cards[1].suit;
    const pair = r1 === r2;
    strength = (Math.max(r1, r2) / 14) * 0.45 + (pair ? 0.35 : 0) + (suited ? 0.08 : 0);
  } else {
    const ev = evaluateBestHand([...actor.cards, ...state.community]);
    strength = Math.min(0.98, 0.25 + ev.category * 0.14);
  }

  const roll = Math.random();
  const adjusted = strength + (actor.aggression - 0.5) * 0.2 + (roll - 0.5) * 0.16;

  if (toCall > actor.chips * 0.45 && adjusted < 0.52) {
    return { type: 'fold' };
  }
  if (toCall > 0 && adjusted < 0.34 && roll > 0.2) {
    return { type: 'fold' };
  }

  if (adjusted > 0.72 && actor.chips > toCall + state.minRaise && roll < 0.55) {
    const raiseAmt = Math.min(
      actor.betThisStreet + actor.chips,
      state.currentBet + state.minRaise + state.bigBlind * (roll > 0.3 ? 2 : 1)
    );
    return { type: 'raise', raiseTo: raiseAmt };
  }

  return { type: 'call' };
}
