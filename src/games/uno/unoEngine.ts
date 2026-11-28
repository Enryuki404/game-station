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
  | 'wild4'
  | 'wild6'
  | 'wild10'
  | 'skipAll'
  | 'discardAll'
  | 'hit2'
  | 'wildAllHit';

export type UnoVariant = 'classic' | 'stack' | 'sevenzero' | 'nomercy' | 'allwild' | 'attack';

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
  eliminated?: boolean;
}

export interface SharedUnoMatchPlayer {
  id: string;
  name: string;
  seatIdx: number;
  isBot: boolean;
  connected: boolean;
  hand: UnoCard[];
  saidUno: boolean;
  eliminated: boolean;
}

export interface SharedUnoMatch {
  variant: UnoVariant;
  started: boolean;
  players: SharedUnoMatchPlayer[];
  drawPile: UnoCard[];
  discardPile: UnoCard[];
  activeColor: UnoColor;
  currentTurn: number;
  direction: 1 | -1;
  pendingDraw: number;
  pendingDrawMin: number;
  winnerIndex: number | null;
  lastBurst: { id: number; text: string } | null;
  lastLauncherEvent?: { id: number; cards: number; actorName: string } | null;
  statusText: string;
}

export const UNO_COLORS: UnoColor[] = ['red', 'blue', 'green', 'yellow'];

export const UNO_COLOR_LABELS: Record<UnoColor, string> = {
  red: 'Merah',
  blue: 'Biru',
  green: 'Hijau',
  yellow: 'Kuning',
};

export const UNO_VARIANT_META: Record<UnoVariant, { label: string; shortDesc: string; rules: string[] }> = {
  classic: {
    label: 'Classic',
    shortDesc: 'Aturan resmi standar 108 kartu (0–9, Skip, Reverse, +2, Wild, +4).',
    rules: [
      'Mainkan kartu dengan warna, angka, atau simbol yang sama dengan kartu teratas di meja.',
      'Klik tumpukan Dek di tengah meja untuk mengambil 1 kartu jika belum ingin bermain.',
      'Saat tersisa 2 kartu sebelum giliran berakhir ke 1 kartu, klik "TERIAK LAST ONE!" dulu atau kena penalti +2!',
    ],
  },
  stack: {
    label: 'Stack',
    shortDesc: 'Kombo +2 & +4! Lempar kartu tambahannya ke pemain berikut hingga ada yang menanggung.',
    rules: [
      'Jika kena +2, kamu bisa menumpuk +2 atau +4 untuk meneruskan total penalti ke pemain berikutnya!',
      'Jika kena +4, hanya bisa di-stack dengan +4 lagi.',
      'Pemain yang tidak punya kartu stack wajib klik Dek untuk mengambil seluruh tumpukan penalti.',
    ],
  },
  sevenzero: {
    label: '7-0 Chaos',
    shortDesc: 'Stacking + Kartu 7 tukar semua kartu dengan lawan pilihan, Kartu 0 putar kartu semua pemain!',
    rules: [
      'Setiap kartu +2 / +4 bisa di-stack ke pemain berikutnya.',
      'Kartu 7: Pilih satu lawan untuk langsung BERTUKAR seluruh kartu tangan!',
      'Kartu 0: Semua pemain di meja otomatis memutar tangan mereka sesuai arah permainan!',
    ],
  },
  nomercy: {
    label: 'No Mercy',
    shortDesc: 'Brutal! Ada +6, +10, Skip All, Discard All, 7-0, Draw Until Playable & Mercy KO (25+ kartu gugur!).',
    rules: [
      'Aturan Mercy (KO): Siapa pun yang memegang 25 kartu atau lebih langsung GUGUR (KO) dari meja!',
      'Hardcore Stacking: +2, +4, +6 Wild, dan +10 Wild bisa di-stack dengan kartu draw bernilai sama atau lebih besar.',
      'Skip All melewati semua lawan sehingga giliran langsung kembali ke kamu! Discard All membuang seluruh kartu warna sama sekaligus!',
      'Kartu 7 tukar tangan, Kartu 0 putar tangan, dan klik Dek akan menarik kartu terus sampai mendapat kartu yang bisa dimainkan.',
    ],
  },
  allwild: {
    label: 'All Wild',
    shortDesc: 'Semua kartu adalah Wild! Tanpa cocokkan warna, super cepat dengan Wild Skip, +2, +4 & Skip All!',
    rules: [
      'Seluruh dek berisi kartu Wild — kamu bisa memainkan kartu APA SAJA di giliranmu tanpa perlu pilih atau cocokkan warna!',
      'Berisi Wild Biasa, Wild Skip, Wild Reverse, Wild +2, Wild +4, dan Wild Skip All.',
    ],
  },
  attack: {
    label: 'Attack!',
    shortDesc: 'Mesin Card Launcher! Tekan tombol launcher: bisa aman (0 kartu) atau meledak 1–12 kartu acak!',
    rules: [
      'Dek diganti menjadi Mesin Card Launcher! Saat menekan tombol Launcher, hasilnya acak: bisa klik AMAN (0 kartu) atau menyemburkan 1–12 kartu sekaligus!',
      'Hit 2 (⚡2): Pemain berikutnya wajib menekan tombol Launcher 2× berturut-turut!',
      'Wild All Hit (⚡ALL): Pilih warna — SEMUA lawan di meja otomatis ditembak Launcher 1×!',
      'Wild +4 (⚡4): Pilih warna dan pemain berikutnya wajib menekan tombol Launcher 4×! Tersedia juga Discard All.',
    ],
  },
};

function secureRand(): number {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    cryptoObj.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  return Math.random();
}

function randIntInclusive(min: number, max: number): number {
  return min + Math.floor(secureRand() * (max - min + 1));
}

export function rollLauncherBurst(): number {
  const r = secureRand();
  if (r < 0.44) return 0;
  if (r < 0.70) return randIntInclusive(1, 3);
  if (r < 0.86) return randIntInclusive(4, 6);
  if (r < 0.95) return randIntInclusive(7, 9);
  return randIntInclusive(10, 12);
}

export function getDrawPower(value: UnoValue): number {
  if (value === 'draw2') return 2;
  if (value === 'wild4') return 4;
  if (value === 'wild6') return 6;
  if (value === 'wild10') return 10;
  return 0;
}

export function isStackingVariant(variant: UnoVariant): boolean {
  return variant === 'stack' || variant === 'sevenzero' || variant === 'nomercy';
}

export function isSevenZeroVariant(variant: UnoVariant): boolean {
  return variant === 'sevenzero' || variant === 'nomercy';
}

export function createUnoDeck(variant: UnoVariant = 'classic'): UnoCard[] {
  const deck: UnoCard[] = [];
  let seq = 0;

  if (variant === 'allwild') {
    const counts: Array<[UnoValue, number]> = [
      ['wild', 28],
      ['skip', 10],
      ['reverse', 10],
      ['draw2', 10],
      ['wild4', 6],
      ['skipAll', 4],
    ];
    for (const [value, qty] of counts) {
      for (let i = 0; i < qty; i++) {
        deck.push({ id: `lo-${seq++}`, color: 'wild', value });
      }
    }
    return shuffleDeck(deck);
  }

  for (const color of UNO_COLORS) {
    deck.push({ id: `lo-${seq++}`, color, value: '0' });
    const doubles: UnoValue[] =
      variant === 'attack'
        ? ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'hit2', 'discardAll']
        : ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
    for (const value of doubles) {
      deck.push({ id: `lo-${seq++}`, color, value });
      deck.push({ id: `lo-${seq++}`, color, value });
    }
    if (variant === 'nomercy') {
      for (let i = 0; i < 2; i++) {
        deck.push({ id: `lo-${seq++}`, color, value: 'skipAll' });
        deck.push({ id: `lo-${seq++}`, color, value: 'discardAll' });
      }
    }
  }

  for (let i = 0; i < 4; i++) {
    deck.push({ id: `lo-${seq++}`, color: 'wild', value: 'wild' });
    if (variant === 'attack') {
      deck.push({ id: `lo-${seq++}`, color: 'wild', value: 'wildAllHit' });
    } else {
      deck.push({ id: `lo-${seq++}`, color: 'wild', value: 'wild4' });
    }
  }

  if (variant === 'attack') {
    for (let i = 0; i < 2; i++) {
      deck.push({ id: `lo-${seq++}`, color: 'wild', value: 'wild4' });
    }
  }

  if (variant === 'nomercy') {
    for (let i = 0; i < 4; i++) {
      deck.push({ id: `lo-${seq++}`, color: 'wild', value: 'wild6' });
    }
    for (let i = 0; i < 2; i++) {
      deck.push({ id: `lo-${seq++}`, color: 'wild', value: 'wild10' });
    }
  }

  return shuffleDeck(deck);
}

export function isCardPlayable(
  card: UnoCard,
  topCard: UnoCard,
  activeColor: UnoColor,
  pendingDraw = 0,
  pendingDrawMin = 0,
  variant: UnoVariant = 'classic'
): boolean {
  if (pendingDraw > 0 && variant === 'attack') {
    return false;
  }
  if (pendingDraw > 0 && isStackingVariant(variant)) {
    return getDrawPower(card.value) >= Math.max(2, pendingDrawMin);
  }
  if (variant === 'allwild') return true;
  if (card.color === 'wild') return true;
  if (card.color === activeColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

export function chooseBestAiCard(
  hand: UnoCard[],
  topCard: UnoCard,
  activeColor: UnoColor,
  pendingDraw = 0,
  pendingDrawMin = 0,
  variant: UnoVariant = 'classic'
): { card: UnoCard; chosenColor: UnoColor } | null {
  const playable = hand.filter((c) =>
    isCardPlayable(c, topCard, activeColor, pendingDraw, pendingDrawMin, variant)
  );
  if (playable.length === 0) return null;

  const score = (c: UnoCard): number => {
    if (c.value === 'wildAllHit') return 58;
    if (c.value === 'discardAll') return 55;
    if (c.value === 'skipAll') return 48;
    if (c.value === 'hit2') return 44;
    if (c.value === 'wild10') return pendingDraw > 0 ? 60 : 42;
    if (c.value === 'wild6') return pendingDraw > 0 ? 52 : 38;
    if (c.value === 'draw2') return 40;
    if (c.value === 'skip' || c.value === 'reverse') return 35;
    if (c.color !== 'wild') return 20 + (Number.isNaN(Number(c.value)) ? 0 : Number(c.value));
    if (c.value === 'wild') return 10;
    return 8;
  };

  playable.sort((a, b) => score(b) - score(a));
  const chosen = playable[0];

  const counts: Record<UnoColor, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const c of hand) {
    if (c.id !== chosen.id && c.color !== 'wild') {
      counts[c.color]++;
    }
  }
  const bestColor = (Object.entries(counts) as Array<[UnoColor, number]>).sort((a, b) => b[1] - a[1])[0][0];

  return { card: chosen, chosenColor: bestColor };
}

export function formatUnoValue(value: UnoValue): string {
  switch (value) {
    case 'skip':
      return 'Skip';
    case 'skipAll':
      return 'Skip All';
    case 'reverse':
      return 'Reverse';
    case 'discardAll':
      return 'Buang Semua';
    case 'draw2':
      return '+2';
    case 'hit2':
      return 'Hit 2';
    case 'wild':
      return 'Wild';
    case 'wildAllHit':
      return 'Wild All Hit';
    case 'wild4':
      return '+4 Wild';
    case 'wild6':
      return '+6 Wild';
    case 'wild10':
      return '+10 Wild';
    default:
      return value;
  }
}

function drawFromMatchPile(
  drawPile: UnoCard[],
  discardPile: UnoCard[],
  count: number
): { drawn: UnoCard[]; nextDraw: UnoCard[]; nextDiscard: UnoCard[] } {
  let pool = [...drawPile];
  let discard = [...discardPile];
  const drawn: UnoCard[] = [];

  for (let i = 0; i < count; i++) {
    if (pool.length === 0) {
      if (discard.length <= 1) break;
      const top = discard[discard.length - 1];
      pool = shuffleDeck(discard.slice(0, -1));
      discard = [top];
    }
    const card = pool.shift();
    if (card) drawn.push(card);
  }

  return { drawn, nextDraw: pool, nextDiscard: discard };
}

function nextAliveIndex(players: SharedUnoMatchPlayer[], fromIdx: number, dir: 1 | -1, aliveSteps = 1): number {
  const total = players.length;
  let idx = fromIdx;
  let stepsLeft = aliveSteps;
  let guard = 0;
  while (stepsLeft > 0 && guard < total * 4) {
    idx = (((idx + dir) % total) + total) % total;
    if (!players[idx].eliminated) {
      stepsLeft--;
    }
    guard++;
  }
  return idx;
}

function aliveIndicesInOrder(players: SharedUnoMatchPlayer[], dir: 1 | -1): number[] {
  const res: number[] = [];
  for (let i = 0; i < players.length; i++) {
    const idx = dir === 1 ? i : players.length - 1 - i;
    if (!players[idx].eliminated) res.push(idx);
  }
  return res;
}

function checkMercyElimination(match: SharedUnoMatch, targetIdx: number): string {
  if (match.variant !== 'nomercy') return '';
  const target = match.players[targetIdx];
  if (!target || target.eliminated || target.hand.length < 25) return '';

  target.eliminated = true;
  target.saidUno = false;
  if (target.hand.length > 0) {
    match.drawPile = shuffleDeck([...match.drawPile, ...target.hand]);
    target.hand = [];
  }

  const alive = match.players.filter((p) => !p.eliminated);
  if (alive.length === 1) {
    const survivor = alive[0];
    match.winnerIndex = survivor.seatIdx;
    match.pendingDraw = 0;
    match.pendingDrawMin = 0;
    match.lastBurst = { id: Date.now(), text: `${target.name} KO! ${survivor.name} MENANG!` };
    match.statusText = `${target.name} terkena Mercy KO (25+ kartu)! ${survivor.name} bertahan terakhir & MENANG!`;
    return 'WIN';
  }

  match.lastBurst = { id: Date.now(), text: `${target.name} KO (25+ Kartu)!` };
  return ` ${target.name} KO (25+ kartu)!`;
}

export function createSharedUnoMatch(
  variant: UnoVariant,
  seats: Array<{ id: string; name: string; isBot: boolean }>
): SharedUnoMatch {
  const deck = createUnoDeck(variant);
  const players: SharedUnoMatchPlayer[] = seats.map((s, idx) => ({
    id: s.id,
    name: s.name,
    seatIdx: idx,
    isBot: s.isBot,
    connected: true,
    hand: deck.splice(0, 7),
    saidUno: false,
    eliminated: false,
  }));

  let firstIdx =
    variant === 'allwild'
      ? deck.findIndex((c) => c.value === 'wild')
      : deck.findIndex(
          (c) =>
            c.color !== 'wild' &&
            !['draw2', 'hit2', 'skip', 'reverse', 'skipAll', 'discardAll'].includes(c.value)
        );
  if (firstIdx === -1) firstIdx = 0;
  const [firstCard] = deck.splice(firstIdx, 1);

  return {
    variant,
    started: true,
    players,
    drawPile: deck,
    discardPile: [firstCard],
    activeColor: firstCard.color === 'wild' ? 'red' : firstCard.color,
    currentTurn: 0,
    direction: 1,
    pendingDraw: 0,
    pendingDrawMin: 0,
    winnerIndex: null,
    lastBurst: null,
    lastLauncherEvent: null,
    statusText: `Mode ${UNO_VARIANT_META[variant].label} dimulai! Giliran ${players[0].name}.`,
  };
}

export function applySharedUnoPlay(
  match: SharedUnoMatch,
  actorId: string,
  cardId: string,
  chosenColor?: UnoColor,
  swapTargetId?: string
): boolean {
  if (!match.started || match.winnerIndex !== null) return false;
  const actorIdx = match.currentTurn;
  const actor = match.players[actorIdx];
  if (!actor || actor.id !== actorId || actor.eliminated) return false;

  const cardIdx = actor.hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) return false;
  const card = actor.hand[cardIdx];
  const topCard = match.discardPile[match.discardPile.length - 1];

  if (!isCardPlayable(card, topCard, match.activeColor, match.pendingDraw, match.pendingDrawMin, match.variant)) {
    return false;
  }

  actor.hand.splice(cardIdx, 1);
  match.discardPile.push(card);

  // Discard All dumps every other card of the same color at once
  let dumpedCount = 0;
  if (card.value === 'discardAll' && card.color !== 'wild') {
    const keep: UnoCard[] = [];
    for (const c of actor.hand) {
      if (c.color === card.color) {
        match.discardPile.push(c);
        dumpedCount++;
      } else {
        keep.push(c);
      }
    }
    actor.hand = keep;
  }

  const validColor: UnoColor =
    match.variant === 'allwild'
      ? 'red'
      : chosenColor && UNO_COLORS.includes(chosenColor)
        ? chosenColor
        : 'red';
  match.activeColor = card.color === 'wild' ? validColor : card.color;

  let penaltyMsg = '';
  if (actor.hand.length === 1 && !actor.isBot && !actor.saidUno) {
    const pen = drawFromMatchPile(match.drawPile, match.discardPile, 2);
    actor.hand.push(...pen.drawn);
    match.drawPile = pen.nextDraw;
    match.discardPile = pen.nextDiscard;
    penaltyMsg = ' (Lupa tekan LAST ONE! +2 kartu)';
  }
  if (actor.hand.length === 1 && actor.isBot) {
    actor.saidUno = true;
  }
  if (actor.hand.length !== 1) {
    actor.saidUno = false;
  }

  // Immediate win when hand empties
  if (actor.hand.length === 0) {
    match.winnerIndex = actorIdx;
    match.pendingDraw = 0;
    match.pendingDrawMin = 0;
    match.lastBurst = { id: Date.now(), text: `${actor.name} MENANG!` };
    match.statusText = `${actor.name} menang LAST ONE!`;
    return true;
  }

  const aliveCount = match.players.filter((p) => !p.eliminated).length;
  let step = 1;
  let effectNote = '';
  match.lastBurst = null;
  match.lastLauncherEvent = null;

  // 7-0 Chaos & No Mercy: 7 Swaps with chosen opponent, 0 Rotates all alive hands
  if (isSevenZeroVariant(match.variant) && card.value === '7') {
    const aliveOpps = match.players.filter((p, idx) => idx !== actorIdx && !p.eliminated);
    const target =
      (swapTargetId && aliveOpps.find((p) => p.id === swapTargetId)) ||
      [...aliveOpps].sort((a, b) => a.hand.length - b.hand.length)[0];
    if (target) {
      const tmp = actor.hand;
      actor.hand = target.hand;
      target.hand = tmp;
      actor.saidUno = actor.hand.length === 1;
      target.saidUno = target.hand.length === 1;
      effectNote = ` — Tukar kartu dengan ${target.name}!`;
      match.lastBurst = { id: Date.now(), text: `7 SWAP ↔ ${target.name.toUpperCase()}!` };
    }
  } else if (isSevenZeroVariant(match.variant) && card.value === '0') {
    const order = aliveIndicesInOrder(match.players, match.direction);
    if (order.length >= 2) {
      const savedLast = match.players[order[order.length - 1]].hand;
      for (let i = order.length - 1; i > 0; i--) {
        match.players[order[i]].hand = match.players[order[i - 1]].hand;
      }
      match.players[order[0]].hand = savedLast;
      for (const idx of order) {
        match.players[idx].saidUno = match.players[idx].hand.length === 1;
      }
      effectNote = ' — Semua kartu berputar!';
      match.lastBurst = { id: Date.now(), text: '0 PUTAR KARTU!' };
    }
  } else if (card.value === 'skipAll') {
    step = 0;
    effectNote = ' — Skip Semua (Main lagi!)';
    match.lastBurst = { id: Date.now(), text: 'SKIP ALL!' };
  } else if (card.value === 'discardAll') {
    effectNote = dumpedCount > 0 ? ` — Buang ${dumpedCount + 1} kartu sekaligus!` : '';
    match.lastBurst = { id: Date.now(), text: `BUANG ${dumpedCount + 1} KARTU!` };
  } else if (card.value === 'reverse') {
    if (aliveCount === 2) {
      step = 0;
      effectNote = ' — Reverse (Giliran lanjut!)';
    } else {
      match.direction = (match.direction * -1) as 1 | -1;
      effectNote = ' — Arah berbalik!';
    }
    match.lastBurst = { id: Date.now(), text: 'REVERSE!' };
  } else if (card.value === 'skip') {
    const skipped = match.players[nextAliveIndex(match.players, actorIdx, match.direction, 1)];
    step = 2;
    effectNote = ` — ${skipped.name} dilewati!`;
    match.lastBurst = { id: Date.now(), text: 'SKIP!' };
  } else if (card.value === 'hit2') {
    match.pendingDraw = 2;
    match.pendingDrawMin = 0;
    step = 1;
    effectNote = ' — Wajib tekan Launcher 2×!';
    match.lastBurst = { id: Date.now(), text: 'HIT 2× LAUNCHER!' };
  } else if (card.value === 'wildAllHit') {
    let totalShot = 0;
    for (let idx = 0; idx < match.players.length; idx++) {
      if (idx === actorIdx || match.players[idx].eliminated) continue;
      const burst = rollLauncherBurst();
      if (burst > 0) {
        const res = drawFromMatchPile(match.drawPile, match.discardPile, burst);
        match.players[idx].hand.push(...res.drawn);
        match.players[idx].saidUno = false;
        match.drawPile = res.nextDraw;
        match.discardPile = res.nextDiscard;
        totalShot += res.drawn.length;
      }
    }
    match.lastLauncherEvent = { id: Date.now(), cards: totalShot, actorName: 'Semua Lawan' };
    step = 1;
    effectNote =
      totalShot > 0
        ? ` — Semua lawan ditembak Launcher (total +${totalShot} kartu)!`
        : ' — Semua lawan lolos (0 kartu)!';
    match.lastBurst = {
      id: Date.now(),
      text: totalShot > 0 ? `ALL HIT! +${totalShot} KARTU!` : 'ALL HIT! SEMUA AMAN!',
    };
  } else {
    const drawPower = getDrawPower(card.value);
    if (drawPower > 0) {
      if (match.variant === 'attack') {
        match.pendingDraw = drawPower;
        match.pendingDrawMin = 0;
        step = 1;
        effectNote = ` — Wajib tekan Launcher ${drawPower}×!`;
        match.lastBurst = { id: Date.now(), text: `EXTREME ${drawPower}× LAUNCHER!` };
      } else if (isStackingVariant(match.variant)) {
        match.pendingDraw += drawPower;
        match.pendingDrawMin = Math.max(match.pendingDrawMin, drawPower);
        step = 1;
        effectNote = ` — Stack +${match.pendingDraw}!`;
        match.lastBurst = { id: Date.now(), text: `STACK +${match.pendingDraw}!` };
      } else {
        const victimIdx = nextAliveIndex(match.players, actorIdx, match.direction, 1);
        const res = drawFromMatchPile(match.drawPile, match.discardPile, drawPower);
        match.players[victimIdx].hand.push(...res.drawn);
        match.players[victimIdx].saidUno = false;
        match.drawPile = res.nextDraw;
        match.discardPile = res.nextDiscard;
        step = 2;
        effectNote = ` — ${match.players[victimIdx].name} ambil +${drawPower}!`;
        match.lastBurst = { id: Date.now(), text: `+${drawPower} KARTU!` };
      }
    } else if (card.color === 'wild' && match.variant !== 'allwild') {
      match.lastBurst = { id: Date.now(), text: 'WILD!' };
    }
  }

  const mercyActor = checkMercyElimination(match, actorIdx);
  if (mercyActor === 'WIN') return true;

  match.currentTurn = step === 0 && !actor.eliminated ? actorIdx : nextAliveIndex(match.players, actorIdx, match.direction, Math.max(1, step));
  const nextPlayer = match.players[match.currentTurn];
  const colorNote =
    card.color === 'wild' && match.variant !== 'allwild'
      ? ` (Warna: ${UNO_COLOR_LABELS[match.activeColor]})`
      : '';
  match.statusText = `${actor.name} mainkan ${formatUnoValue(card.value)}${colorNote}${effectNote}${penaltyMsg}${mercyActor} Giliran ${nextPlayer.name}.`;
  return true;
}

export function applySharedUnoDraw(match: SharedUnoMatch, actorId: string): boolean {
  if (!match.started || match.winnerIndex !== null) return false;
  const actorIdx = match.currentTurn;
  const actor = match.players[actorIdx];
  if (!actor || actor.id !== actorId || actor.eliminated) return false;

  // Attack! Mode: trigger Card Launcher (0 safe click or 2-8 card burst)
  if (match.variant === 'attack') {
    const burst = rollLauncherBurst();
    let pulled = 0;
    if (burst > 0) {
      const res = drawFromMatchPile(match.drawPile, match.discardPile, burst);
      actor.hand.push(...res.drawn);
      actor.saidUno = false;
      match.drawPile = res.nextDraw;
      match.discardPile = res.nextDiscard;
      pulled = res.drawn.length;
    }

    match.lastLauncherEvent = { id: Date.now(), cards: pulled, actorName: actor.name };
    const hitNote = pulled > 0 ? `DUAR! +${pulled} kartu` : 'KLIK! Aman (0 kartu)';

    if (match.pendingDraw > 0) {
      match.pendingDraw -= 1;
      if (match.pendingDraw > 0) {
        match.lastBurst = { id: Date.now(), text: `${hitNote} • Sisa ${match.pendingDraw}×!` };
        match.statusText = `${actor.name} tekan Launcher → ${hitNote}! (Sisa wajib tekan ${match.pendingDraw}× lagi)`;
        return true;
      }
      match.lastBurst = { id: Date.now(), text: pulled > 0 ? `DUAR! +${pulled}!` : 'KLIK! AMAN!' };
      match.currentTurn = nextAliveIndex(match.players, actorIdx, match.direction, 1);
      match.statusText = `${actor.name} tekan Launcher → ${hitNote}! Giliran ${match.players[match.currentTurn].name}.`;
      return true;
    }

    match.lastBurst = { id: Date.now(), text: pulled > 0 ? `DUAR! +${pulled}!` : 'KLIK! AMAN!' };
    match.currentTurn = nextAliveIndex(match.players, actorIdx, match.direction, 1);
    match.statusText = `${actor.name} tekan Launcher → ${hitNote}! Giliran ${match.players[match.currentTurn].name}.`;
    return true;
  }

  // Taking accumulated stack penalty
  if (match.pendingDraw > 0) {
    const amount = match.pendingDraw;
    const res = drawFromMatchPile(match.drawPile, match.discardPile, amount);
    actor.hand.push(...res.drawn);
    actor.saidUno = false;
    match.drawPile = res.nextDraw;
    match.discardPile = res.nextDiscard;
    match.pendingDraw = 0;
    match.pendingDrawMin = 0;
    match.lastBurst = { id: Date.now(), text: `${actor.name} +${amount}!` };

    const mercyRes = checkMercyElimination(match, actorIdx);
    if (mercyRes === 'WIN') return true;

    match.currentTurn = nextAliveIndex(match.players, actorIdx, match.direction, 1);
    match.statusText = `${actor.name} menanggung +${amount} kartu!${mercyRes} Giliran ${match.players[match.currentTurn].name}.`;
    return true;
  }

  // No Mercy: Draw Until Playable (capped by Mercy KO 25 cards)
  if (match.variant === 'nomercy') {
    const topCard = match.discardPile[match.discardPile.length - 1];
    let pulledCount = 0;
    let foundPlayable = false;

    while (actor.hand.length < 25) {
      const res = drawFromMatchPile(match.drawPile, match.discardPile, 1);
      if (res.drawn.length === 0) break;
      const pulled = res.drawn[0];
      actor.hand.push(pulled);
      actor.saidUno = false;
      match.drawPile = res.nextDraw;
      match.discardPile = res.nextDiscard;
      pulledCount++;
      if (isCardPlayable(pulled, topCard, match.activeColor, 0, 0, match.variant)) {
        foundPlayable = true;
        break;
      }
    }

    const mercyRes = checkMercyElimination(match, actorIdx);
    if (mercyRes === 'WIN') return true;

    if (actor.eliminated || !foundPlayable) {
      match.currentTurn = nextAliveIndex(match.players, actorIdx, match.direction, 1);
      match.statusText = `${actor.name} menarik ${pulledCount} kartu.${mercyRes} Giliran ${match.players[match.currentTurn].name}.`;
    } else {
      match.lastBurst = pulledCount > 1 ? { id: Date.now(), text: `TARIK ${pulledCount} KARTU!` } : null;
      match.statusText = `${actor.name} menarik ${pulledCount} kartu hingga dapat kartu main! Mainkan sekarang.`;
    }
    return true;
  }

  // Standard 1-card draw
  const res = drawFromMatchPile(match.drawPile, match.discardPile, 1);
  actor.hand.push(...res.drawn);
  actor.saidUno = false;
  match.drawPile = res.nextDraw;
  match.discardPile = res.nextDiscard;
  match.lastBurst = null;

  match.currentTurn = nextAliveIndex(match.players, actorIdx, match.direction, 1);
  match.statusText = `${actor.name} mengambil 1 kartu dari Dek. Giliran ${match.players[match.currentTurn].name}.`;
  return true;
}

export function applySharedUnoCall(match: SharedUnoMatch, actorId: string): boolean {
  if (!match.started || match.winnerIndex !== null) return false;
  const player = match.players.find((p) => p.id === actorId);
  if (!player || player.eliminated || player.hand.length > 2) return false;
  player.saidUno = true;
  match.lastBurst = { id: Date.now(), text: `${player.name}: LAST ONE!` };
  match.statusText = `${player.name} berteriak "LAST ONE!"`;
  return true;
}

export function getSanitizedSharedUnoState(match: SharedUnoMatch, viewerId: string) {
  const mySeatIdx = match.players.findIndex((p) => p.id === viewerId);
  const me = mySeatIdx >= 0 ? match.players[mySeatIdx] : null;
  return {
    variant: match.variant,
    started: match.started,
    mySeatIdx,
    myHand: me ? me.hand : [],
    players: match.players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIdx: p.seatIdx,
      cardCount: p.hand.length,
      saidUno: p.saidUno,
      eliminated: p.eliminated,
      isBot: p.isBot,
      connected: p.connected,
    })),
    drawCount: match.drawPile.length,
    topCard: match.discardPile[match.discardPile.length - 1],
    activeColor: match.activeColor,
    currentTurn: match.currentTurn,
    direction: match.direction,
    pendingDraw: match.pendingDraw,
    pendingDrawMin: match.pendingDrawMin,
    winnerIndex: match.winnerIndex,
    lastBurst: match.lastBurst,
    lastLauncherEvent: match.lastLauncherEvent ?? null,
    statusText: match.statusText,
  };
}
