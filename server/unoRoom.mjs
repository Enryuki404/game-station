const UNO_COLORS = ['red', 'blue', 'green', 'yellow'];
const COLOR_LABELS = {
  red: 'Merah',
  blue: 'Biru',
  green: 'Hijau',
  yellow: 'Kuning',
};

const VALID_VARIANTS = new Set(['classic', 'stack', 'sevenzero', 'nomercy', 'allwild', 'attack']);

function rollLauncherBurst() {
  const r = Math.random();
  if (r < 0.4) return 0;
  if (r < 0.65) return 2;
  if (r < 0.83) return 3;
  if (r < 0.93) return 4;
  if (r < 0.98) return 6;
  return 8;
}

function normalizeVariant(raw) {
  return typeof raw === 'string' && VALID_VARIANTS.has(raw) ? raw : 'classic';
}

function getDrawPower(val) {
  if (val === 'draw2') return 2;
  if (val === 'wild4') return 4;
  if (val === 'wild6') return 6;
  if (val === 'wild10') return 10;
  return 0;
}

function isStacking(variant) {
  return variant === 'stack' || variant === 'sevenzero' || variant === 'nomercy';
}

function isSevenZero(variant) {
  return variant === 'sevenzero' || variant === 'nomercy';
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createUnoDeck(variant = 'classic') {
  const deck = [];
  let seq = 0;

  if (variant === 'allwild') {
    const counts = [
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
    return shuffle(deck);
  }

  for (const color of UNO_COLORS) {
    deck.push({ id: `lo-${seq++}`, color, value: '0' });
    const doubles =
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
    deck.push({ id: `lo-${seq++}`, color: 'wild', value: variant === 'attack' ? 'wildAllHit' : 'wild4' });
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
  return shuffle(deck);
}

export function isCardPlayable(card, topCard, activeColor, pendingDraw = 0, pendingDrawMin = 0, variant = 'classic') {
  if (!card || !topCard) return false;
  if (pendingDraw > 0 && variant === 'attack') return false;
  if (pendingDraw > 0 && isStacking(variant)) {
    return getDrawPower(card.value) >= Math.max(2, pendingDrawMin);
  }
  if (variant === 'allwild') return true;
  if (card.color === 'wild') return true;
  if (card.color === activeColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

function drawFromPile(drawPile, discardPile, count) {
  let pool = [...drawPile];
  let discard = [...discardPile];
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) {
      if (discard.length <= 1) break;
      const top = discard[discard.length - 1];
      pool = shuffle(discard.slice(0, -1));
      discard = [top];
    }
    const c = pool.shift();
    if (c) drawn.push(c);
  }
  return { drawn, nextDraw: pool, nextDiscard: discard };
}

function nextAliveIndex(players, fromIdx, dir, aliveSteps = 1) {
  const total = players.length;
  let idx = fromIdx;
  let stepsLeft = aliveSteps;
  let guard = 0;
  while (stepsLeft > 0 && guard < total * 4) {
    idx = (((idx + dir) % total) + total) % total;
    if (!players[idx].eliminated) stepsLeft--;
    guard++;
  }
  return idx;
}

function formatUnoVal(val) {
  if (val === 'skip') return 'Skip';
  if (val === 'skipAll') return 'Skip All';
  if (val === 'reverse') return 'Reverse';
  if (val === 'discardAll') return 'Buang Semua';
  if (val === 'draw2') return '+2';
  if (val === 'hit2') return 'Hit 2';
  if (val === 'wild') return 'Wild';
  if (val === 'wildAllHit') return 'Wild All Hit';
  if (val === 'wild4') return '+4 Wild';
  if (val === 'wild6') return '+6 Wild';
  if (val === 'wild10') return '+10 Wild';
  return val;
}

function chooseBotCard(hand, topCard, activeColor, pendingDraw = 0, pendingDrawMin = 0, variant = 'classic') {
  const playable = hand.filter((c) => isCardPlayable(c, topCard, activeColor, pendingDraw, pendingDrawMin, variant));
  if (playable.length === 0) return null;
  const score = (c) => {
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
  const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const c of hand) {
    if (c.id !== chosen.id && c.color !== 'wild') counts[c.color]++;
  }
  const chosenColor = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  return { card: chosen, chosenColor };
}

function checkMercy(u, targetIdx) {
  if (u.variant !== 'nomercy') return '';
  const target = u.players[targetIdx];
  if (!target || target.eliminated || target.hand.length < 25) return '';
  target.eliminated = true;
  target.saidUno = false;
  if (target.hand.length > 0) {
    u.drawPile = shuffle([...u.drawPile, ...target.hand]);
    target.hand = [];
  }
  const alive = u.players.filter((p) => !p.eliminated);
  if (alive.length === 1) {
    const survivor = alive[0];
    u.winnerIndex = survivor.seatIdx;
    u.pendingDraw = 0;
    u.pendingDrawMin = 0;
    u.lastBurst = { id: Date.now(), text: `${target.name} KO! ${survivor.name} MENANG!` };
    u.statusText = `${target.name} terkena Mercy KO (25+ kartu)! ${survivor.name} bertahan terakhir & MENANG!`;
    return 'WIN';
  }
  u.lastBurst = { id: Date.now(), text: `${target.name} KO (25+ Kartu)!` };
  return ` ${target.name} KO (25+ kartu)!`;
}

export function startUnoMatch(room, fillBots, variantRaw = 'classic') {
  if (room.unoBotTimer) {
    clearTimeout(room.unoBotTimer);
    room.unoBotTimer = null;
  }

  const variant = normalizeVariant(variantRaw);
  const deck = createUnoDeck(variant);
  const botNames = ['Bot Raka', 'Bot Sinta', 'Bot Budi', 'Bot Dewi', 'Bot Dimas'];
  const players = room.players.map((p, idx) => ({
    id: p.id,
    name: p.name,
    seatIdx: idx,
    isBot: false,
    connected: true,
    hand: deck.splice(0, 7),
    saidUno: false,
    eliminated: false,
  }));

  if (fillBots) {
    let bIdx = 0;
    while (players.length < 4 && bIdx < botNames.length) {
      players.push({
        id: `bot-${bIdx + 1}`,
        name: botNames[bIdx],
        seatIdx: players.length,
        isBot: true,
        connected: true,
        hand: deck.splice(0, 7),
        saidUno: false,
        eliminated: false,
      });
      bIdx++;
    }
  }

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

  room.uno = {
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
    statusText: `Permainan dimulai! Giliran ${players[0].name}.`,
  };
}

export function applyUnoPlay(room, actorId, cardId, chosenColor, swapTargetId) {
  const u = room.uno;
  if (!u || !u.started || u.winnerIndex !== null) return false;
  const actorIdx = u.currentTurn;
  const actor = u.players[actorIdx];
  if (!actor || actor.id !== actorId || actor.eliminated) return false;

  const cardIdx = actor.hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) return false;
  const card = actor.hand[cardIdx];
  const topCard = u.discardPile[u.discardPile.length - 1];
  if (!isCardPlayable(card, topCard, u.activeColor, u.pendingDraw, u.pendingDrawMin, u.variant)) return false;

  actor.hand.splice(cardIdx, 1);
  u.discardPile.push(card);

  let dumpedCount = 0;
  if (card.value === 'discardAll' && card.color !== 'wild') {
    const keep = [];
    for (const c of actor.hand) {
      if (c.color === card.color) {
        u.discardPile.push(c);
        dumpedCount++;
      } else {
        keep.push(c);
      }
    }
    actor.hand = keep;
  }

  const validColor = u.variant === 'allwild' ? 'red' : UNO_COLORS.includes(chosenColor) ? chosenColor : 'red';
  u.activeColor = card.color === 'wild' ? validColor : card.color;

  let penaltyMsg = '';
  if (actor.hand.length === 1 && !actor.isBot && !actor.saidUno) {
    const pen = drawFromPile(u.drawPile, u.discardPile, 2);
    actor.hand.push(...pen.drawn);
    u.drawPile = pen.nextDraw;
    u.discardPile = pen.nextDiscard;
    penaltyMsg = ' (Lupa tekan LAST ONE! +2 kartu)';
  }
  if (actor.hand.length === 1 && actor.isBot) actor.saidUno = true;
  if (actor.hand.length !== 1) actor.saidUno = false;

  if (actor.hand.length === 0) {
    u.winnerIndex = actorIdx;
    u.pendingDraw = 0;
    u.pendingDrawMin = 0;
    u.lastBurst = { id: Date.now(), text: `${actor.name} MENANG!` };
    u.statusText = `${actor.name} menang LAST ONE!`;
    return true;
  }

  const aliveCount = u.players.filter((p) => !p.eliminated).length;
  let step = 1;
  let effectNote = '';
  u.lastBurst = null;
  u.lastLauncherEvent = null;

  if (isSevenZero(u.variant) && card.value === '7') {
    const aliveOpps = u.players.filter((p, idx) => idx !== actorIdx && !p.eliminated);
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
      u.lastBurst = { id: Date.now(), text: `7 SWAP ↔ ${target.name.toUpperCase()}!` };
    }
  } else if (isSevenZero(u.variant) && card.value === '0') {
    const order = [];
    for (let i = 0; i < u.players.length; i++) {
      const idx = u.direction === 1 ? i : u.players.length - 1 - i;
      if (!u.players[idx].eliminated) order.push(idx);
    }
    if (order.length >= 2) {
      const savedLast = u.players[order[order.length - 1]].hand;
      for (let i = order.length - 1; i > 0; i--) {
        u.players[order[i]].hand = u.players[order[i - 1]].hand;
      }
      u.players[order[0]].hand = savedLast;
      for (const idx of order) u.players[idx].saidUno = u.players[idx].hand.length === 1;
      effectNote = ' — Semua kartu berputar!';
      u.lastBurst = { id: Date.now(), text: '0 PUTAR KARTU!' };
    }
  } else if (card.value === 'skipAll') {
    step = 0;
    effectNote = ' — Skip Semua (Main lagi!)';
    u.lastBurst = { id: Date.now(), text: 'SKIP ALL!' };
  } else if (card.value === 'discardAll') {
    effectNote = dumpedCount > 0 ? ` — Buang ${dumpedCount + 1} kartu sekaligus!` : '';
    u.lastBurst = { id: Date.now(), text: `BUANG ${dumpedCount + 1} KARTU!` };
  } else if (card.value === 'reverse') {
    if (aliveCount === 2) {
      step = 0;
      effectNote = ' — Reverse (Giliran lanjut!)';
    } else {
      u.direction = u.direction * -1;
      effectNote = ' — Arah berbalik!';
    }
    u.lastBurst = { id: Date.now(), text: 'REVERSE!' };
  } else if (card.value === 'skip') {
    const skipped = u.players[nextAliveIndex(u.players, actorIdx, u.direction, 1)];
    step = 2;
    effectNote = ` — ${skipped.name} dilewati!`;
    u.lastBurst = { id: Date.now(), text: 'SKIP!' };
  } else if (card.value === 'hit2') {
    u.pendingDraw = 2;
    u.pendingDrawMin = 0;
    step = 1;
    effectNote = ' — Wajib tekan Launcher 2×!';
    u.lastBurst = { id: Date.now(), text: 'HIT 2× LAUNCHER!' };
  } else if (card.value === 'wildAllHit') {
    let totalShot = 0;
    for (let idx = 0; idx < u.players.length; idx++) {
      if (idx === actorIdx || u.players[idx].eliminated) continue;
      const burst = rollLauncherBurst();
      if (burst > 0) {
        const res = drawFromPile(u.drawPile, u.discardPile, burst);
        u.players[idx].hand.push(...res.drawn);
        u.players[idx].saidUno = false;
        u.drawPile = res.nextDraw;
        u.discardPile = res.nextDiscard;
        totalShot += res.drawn.length;
      }
    }
    u.lastLauncherEvent = { id: Date.now(), cards: totalShot, actorName: 'Semua Lawan' };
    step = 1;
    effectNote =
      totalShot > 0
        ? ` — Semua lawan ditembak Launcher (total +${totalShot} kartu)!`
        : ' — Semua lawan lolos (0 kartu)!';
    u.lastBurst = {
      id: Date.now(),
      text: totalShot > 0 ? `ALL HIT! +${totalShot} KARTU!` : 'ALL HIT! SEMUA AMAN!',
    };
  } else {
    const drawPower = getDrawPower(card.value);
    if (drawPower > 0) {
      if (u.variant === 'attack') {
        u.pendingDraw = drawPower;
        u.pendingDrawMin = 0;
        step = 1;
        effectNote = ` — Wajib tekan Launcher ${drawPower}×!`;
        u.lastBurst = { id: Date.now(), text: `EXTREME ${drawPower}× LAUNCHER!` };
      } else if (isStacking(u.variant)) {
        u.pendingDraw += drawPower;
        u.pendingDrawMin = Math.max(u.pendingDrawMin, drawPower);
        step = 1;
        effectNote = ` — Stack +${u.pendingDraw}!`;
        u.lastBurst = { id: Date.now(), text: `STACK +${u.pendingDraw}!` };
      } else {
        const victimIdx = nextAliveIndex(u.players, actorIdx, u.direction, 1);
        const res = drawFromPile(u.drawPile, u.discardPile, drawPower);
        u.players[victimIdx].hand.push(...res.drawn);
        u.players[victimIdx].saidUno = false;
        u.drawPile = res.nextDraw;
        u.discardPile = res.nextDiscard;
        step = 2;
        effectNote = ` — ${u.players[victimIdx].name} ambil +${drawPower}!`;
        u.lastBurst = { id: Date.now(), text: `+${drawPower} KARTU!` };
      }
    } else if (card.color === 'wild' && u.variant !== 'allwild') {
      u.lastBurst = { id: Date.now(), text: 'WILD!' };
    }
  }

  const mercyActor = checkMercy(u, actorIdx);
  if (mercyActor === 'WIN') return true;

  u.currentTurn = step === 0 && !actor.eliminated ? actorIdx : nextAliveIndex(u.players, actorIdx, u.direction, Math.max(1, step));
  const nextPlayer = u.players[u.currentTurn];
  const colorNote = card.color === 'wild' && u.variant !== 'allwild' ? ` (Warna: ${COLOR_LABELS[u.activeColor]})` : '';
  u.statusText = `${actor.name} mainkan ${formatUnoVal(card.value)}${colorNote}${effectNote}${penaltyMsg}${mercyActor} Giliran ${nextPlayer.name}.`;
  return true;
}

export function applyUnoDraw(room, actorId) {
  const u = room.uno;
  if (!u || !u.started || u.winnerIndex !== null) return false;
  const actorIdx = u.currentTurn;
  const actor = u.players[actorIdx];
  if (!actor || actor.id !== actorId || actor.eliminated) return false;

  if (u.variant === 'attack') {
    const burst = rollLauncherBurst();
    let pulled = 0;
    if (burst > 0) {
      const res = drawFromPile(u.drawPile, u.discardPile, burst);
      actor.hand.push(...res.drawn);
      actor.saidUno = false;
      u.drawPile = res.nextDraw;
      u.discardPile = res.nextDiscard;
      pulled = res.drawn.length;
    }

    u.lastLauncherEvent = { id: Date.now(), cards: pulled, actorName: actor.name };
    const hitNote = pulled > 0 ? `DUAR! +${pulled} kartu` : 'KLIK! Aman (0 kartu)';

    if (u.pendingDraw > 0) {
      u.pendingDraw -= 1;
      if (u.pendingDraw > 0) {
        u.lastBurst = { id: Date.now(), text: `${hitNote} • Sisa ${u.pendingDraw}×!` };
        u.statusText = `${actor.name} tekan Launcher → ${hitNote}! (Sisa wajib tekan ${u.pendingDraw}× lagi)`;
        return true;
      }
      u.lastBurst = { id: Date.now(), text: pulled > 0 ? `DUAR! +${pulled}!` : 'KLIK! AMAN!' };
      u.currentTurn = nextAliveIndex(u.players, actorIdx, u.direction, 1);
      u.statusText = `${actor.name} tekan Launcher → ${hitNote}! Giliran ${u.players[u.currentTurn].name}.`;
      return true;
    }

    u.lastBurst = { id: Date.now(), text: pulled > 0 ? `DUAR! +${pulled}!` : 'KLIK! AMAN!' };
    u.currentTurn = nextAliveIndex(u.players, actorIdx, u.direction, 1);
    u.statusText = `${actor.name} tekan Launcher → ${hitNote}! Giliran ${u.players[u.currentTurn].name}.`;
    return true;
  }

  if (u.pendingDraw > 0) {
    const amount = u.pendingDraw;
    const res = drawFromPile(u.drawPile, u.discardPile, amount);
    actor.hand.push(...res.drawn);
    actor.saidUno = false;
    u.drawPile = res.nextDraw;
    u.discardPile = res.nextDiscard;
    u.pendingDraw = 0;
    u.pendingDrawMin = 0;
    u.lastBurst = { id: Date.now(), text: `${actor.name} +${amount}!` };

    const mercyRes = checkMercy(u, actorIdx);
    if (mercyRes === 'WIN') return true;

    u.currentTurn = nextAliveIndex(u.players, actorIdx, u.direction, 1);
    u.statusText = `${actor.name} menanggung +${amount} kartu!${mercyRes} Giliran ${u.players[u.currentTurn].name}.`;
    return true;
  }

  if (u.variant === 'nomercy') {
    const topCard = u.discardPile[u.discardPile.length - 1];
    let pulledCount = 0;
    let foundPlayable = false;
    while (actor.hand.length < 25) {
      const res = drawFromPile(u.drawPile, u.discardPile, 1);
      if (res.drawn.length === 0) break;
      const pulled = res.drawn[0];
      actor.hand.push(pulled);
      actor.saidUno = false;
      u.drawPile = res.nextDraw;
      u.discardPile = res.nextDiscard;
      pulledCount++;
      if (isCardPlayable(pulled, topCard, u.activeColor, 0, 0, u.variant)) {
        foundPlayable = true;
        break;
      }
    }
    const mercyRes = checkMercy(u, actorIdx);
    if (mercyRes === 'WIN') return true;
    if (actor.eliminated || !foundPlayable) {
      u.currentTurn = nextAliveIndex(u.players, actorIdx, u.direction, 1);
      u.statusText = `${actor.name} menarik ${pulledCount} kartu.${mercyRes} Giliran ${u.players[u.currentTurn].name}.`;
    } else {
      u.lastBurst = pulledCount > 1 ? { id: Date.now(), text: `TARIK ${pulledCount} KARTU!` } : null;
      u.statusText = `${actor.name} menarik ${pulledCount} kartu hingga dapat kartu main! Mainkan sekarang.`;
    }
    return true;
  }

  const res = drawFromPile(u.drawPile, u.discardPile, 1);
  actor.hand.push(...res.drawn);
  actor.saidUno = false;
  u.drawPile = res.nextDraw;
  u.discardPile = res.nextDiscard;
  u.lastBurst = null;

  u.currentTurn = nextAliveIndex(u.players, actorIdx, u.direction, 1);
  u.statusText = `${actor.name} mengambil 1 kartu. Giliran ${u.players[u.currentTurn].name}.`;
  return true;
}

export function applyUnoCall(room, actorId) {
  const u = room.uno;
  if (!u || !u.started || u.winnerIndex !== null) return false;
  const player = u.players.find((p) => p.id === actorId);
  if (!player || player.eliminated || player.hand.length > 2) return false;
  player.saidUno = true;
  u.lastBurst = { id: Date.now(), text: `${player.name}: LAST ONE!` };
  u.statusText = `${player.name} berteriak "LAST ONE!"`;
  return true;
}

export function scheduleUnoBotTurnIfNeeded(room, onBroadcast) {
  if (room.unoBotTimer) {
    clearTimeout(room.unoBotTimer);
    room.unoBotTimer = null;
  }
  const u = room.uno;
  if (!u || !u.started || u.winnerIndex !== null) return;
  const current = u.players[u.currentTurn];
  if (!current || !current.isBot || current.eliminated) return;

  room.unoBotTimer = setTimeout(() => {
    room.unoBotTimer = null;
    if (!room.uno || room.uno.winnerIndex !== null) return;
    const active = room.uno.players[room.uno.currentTurn];
    if (!active || !active.isBot || active.eliminated) return;

    const topCard = room.uno.discardPile[room.uno.discardPile.length - 1];
    const decision = chooseBotCard(active.hand, topCard, room.uno.activeColor, room.uno.pendingDraw, room.uno.pendingDrawMin, room.uno.variant);
    if (decision) {
      applyUnoPlay(room, active.id, decision.card.id, decision.chosenColor);
    } else {
      applyUnoDraw(room, active.id);
    }
    onBroadcast();
    scheduleUnoBotTurnIfNeeded(room, onBroadcast);
  }, 850);
}

export function getSanitizedUnoState(room, viewerId) {
  const u = room.uno;
  if (!u) return null;
  const mySeatIdx = u.players.findIndex((p) => p.id === viewerId);
  const me = mySeatIdx >= 0 ? u.players[mySeatIdx] : null;
  return {
    variant: u.variant,
    started: u.started,
    mySeatIdx,
    myHand: me ? me.hand : [],
    players: u.players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIdx: p.seatIdx,
      cardCount: p.hand.length,
      saidUno: p.saidUno,
      eliminated: p.eliminated,
      isBot: p.isBot,
      connected: p.connected,
    })),
    drawCount: u.drawPile.length,
    topCard: u.discardPile[u.discardPile.length - 1],
    activeColor: u.activeColor,
    currentTurn: u.currentTurn,
    direction: u.direction,
    pendingDraw: u.pendingDraw,
    pendingDrawMin: u.pendingDrawMin,
    winnerIndex: u.winnerIndex,
    lastBurst: u.lastBurst,
    lastLauncherEvent: u.lastLauncherEvent ?? null,
    statusText: u.statusText,
  };
}
