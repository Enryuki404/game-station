const UNO_COLORS = ['red', 'blue', 'green', 'yellow'];
const COLOR_LABELS = {
  red: 'Merah',
  blue: 'Biru',
  green: 'Hijau',
  yellow: 'Kuning',
};

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createUnoDeck() {
  const deck = [];
  let seq = 0;
  for (const color of UNO_COLORS) {
    deck.push({ id: `uno-${seq++}`, color, value: '0' });
    const doubles = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
    for (const value of doubles) {
      deck.push({ id: `uno-${seq++}`, color, value });
      deck.push({ id: `uno-${seq++}`, color, value });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ id: `uno-${seq++}`, color: 'wild', value: 'wild' });
    deck.push({ id: `uno-${seq++}`, color: 'wild', value: 'wild4' });
  }
  return shuffle(deck);
}

export function isCardPlayable(card, topCard, activeColor) {
  if (!card || !topCard) return false;
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

function nextIndex(idx, dir, total, steps = 1) {
  return (((idx + dir * steps) % total) + total) % total;
}

function formatUnoVal(val) {
  if (val === 'skip') return 'Skip';
  if (val === 'reverse') return 'Reverse';
  if (val === 'draw2') return '+2';
  if (val === 'wild') return 'Wild';
  if (val === 'wild4') return '+4 Wild';
  return val;
}

function chooseBotCard(hand, topCard, activeColor) {
  const playable = hand.filter((c) => isCardPlayable(c, topCard, activeColor));
  if (playable.length === 0) return null;
  const score = (c) => {
    if (c.value === 'draw2') return 40;
    if (c.value === 'skip' || c.value === 'reverse') return 35;
    if (c.color !== 'wild') return 20 + (Number.isNaN(Number(c.value)) ? 0 : Number(c.value));
    if (c.value === 'wild') return 10;
    return 5;
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

export function startUnoMatch(room, fillBots) {
  if (room.unoBotTimer) {
    clearTimeout(room.unoBotTimer);
    room.unoBotTimer = null;
  }

  const deck = createUnoDeck();
  const botNames = ['Bot Raka', 'Bot Sinta', 'Bot Budi', 'Bot Dewi', 'Bot Dimas'];
  const players = room.players.map((p, idx) => ({
    id: p.id,
    name: p.name,
    seatIdx: idx,
    isBot: false,
    connected: true,
    hand: deck.splice(0, 7),
    saidUno: false,
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
      });
      bIdx++;
    }
  }

  let firstIdx = deck.findIndex((c) => c.color !== 'wild' && !['draw2', 'skip', 'reverse'].includes(c.value));
  if (firstIdx === -1) firstIdx = 0;
  const [firstCard] = deck.splice(firstIdx, 1);

  room.uno = {
    started: true,
    players,
    drawPile: deck,
    discardPile: [firstCard],
    activeColor: firstCard.color === 'wild' ? 'red' : firstCard.color,
    currentTurn: 0,
    direction: 1,
    winnerIndex: null,
    lastBurst: null,
    statusText: `Permainan dimulai! Giliran ${players[0].name}.`,
  };
}

export function applyUnoPlay(room, actorId, cardId, chosenColor) {
  const u = room.uno;
  if (!u || !u.started || u.winnerIndex !== null) return false;
  const actorIdx = u.currentTurn;
  const actor = u.players[actorIdx];
  if (!actor || actor.id !== actorId) return false;

  const cardIdx = actor.hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) return false;
  const card = actor.hand[cardIdx];
  const topCard = u.discardPile[u.discardPile.length - 1];
  if (!isCardPlayable(card, topCard, u.activeColor)) return false;

  actor.hand.splice(cardIdx, 1);
  u.discardPile.push(card);

  const validColor = UNO_COLORS.includes(chosenColor) ? chosenColor : 'red';
  u.activeColor = card.color === 'wild' ? validColor : card.color;

  let penaltyMsg = '';
  if (actor.hand.length === 1 && !actor.isBot && !actor.saidUno) {
    const pen = drawFromPile(u.drawPile, u.discardPile, 2);
    actor.hand.push(...pen.drawn);
    u.drawPile = pen.nextDraw;
    u.discardPile = pen.nextDiscard;
    penaltyMsg = ' (Lupa tekan UNO! +2 kartu)';
  }
  if (actor.hand.length === 1 && actor.isBot) {
    actor.saidUno = true;
  }
  if (actor.hand.length !== 1) {
    actor.saidUno = false;
  }

  if (actor.hand.length === 0) {
    u.winnerIndex = actorIdx;
    u.lastBurst = { id: Date.now(), text: `${actor.name} MENANG!` };
    u.statusText = `${actor.name} menang UNO!`;
    return true;
  }

  let step = 1;
  let effectNote = '';
  const total = u.players.length;
  u.lastBurst = null;

  if (card.value === 'reverse') {
    if (total === 2) {
      step = 2;
      effectNote = ' — Reverse (Giliran lanjut!)';
    } else {
      u.direction = u.direction * -1;
      effectNote = ' — Arah berbalik!';
    }
    u.lastBurst = { id: Date.now(), text: 'REVERSE!' };
  } else if (card.value === 'skip') {
    const skipped = u.players[nextIndex(actorIdx, u.direction, total, 1)];
    step = 2;
    effectNote = ` — ${skipped.name} dilewati!`;
    u.lastBurst = { id: Date.now(), text: 'SKIP!' };
  } else if (card.value === 'draw2' || card.value === 'wild4') {
    const amount = card.value === 'draw2' ? 2 : 4;
    const victimIdx = nextIndex(actorIdx, u.direction, total, 1);
    const res = drawFromPile(u.drawPile, u.discardPile, amount);
    u.players[victimIdx].hand.push(...res.drawn);
    u.players[victimIdx].saidUno = false;
    u.drawPile = res.nextDraw;
    u.discardPile = res.nextDiscard;
    step = 2;
    effectNote = ` — ${u.players[victimIdx].name} ambil +${amount}!`;
    u.lastBurst = { id: Date.now(), text: amount === 2 ? '+2 KARTU!' : '+4 WILD!' };
  } else if (card.value === 'wild') {
    u.lastBurst = { id: Date.now(), text: 'WILD!' };
  }

  u.currentTurn = nextIndex(actorIdx, u.direction, total, step);
  const nextPlayer = u.players[u.currentTurn];
  const colorNote = card.color === 'wild' ? ` (Warna: ${COLOR_LABELS[u.activeColor]})` : '';
  u.statusText = `${actor.name} mainkan ${formatUnoVal(card.value)}${colorNote}${effectNote}${penaltyMsg} Giliran ${nextPlayer.name}.`;
  return true;
}

export function applyUnoDraw(room, actorId) {
  const u = room.uno;
  if (!u || !u.started || u.winnerIndex !== null) return false;
  const actorIdx = u.currentTurn;
  const actor = u.players[actorIdx];
  if (!actor || actor.id !== actorId) return false;

  const res = drawFromPile(u.drawPile, u.discardPile, 1);
  actor.hand.push(...res.drawn);
  actor.saidUno = false;
  u.drawPile = res.nextDraw;
  u.discardPile = res.nextDiscard;
  u.lastBurst = null;

  u.currentTurn = nextIndex(actorIdx, u.direction, u.players.length, 1);
  u.statusText = `${actor.name} mengambil 1 kartu. Giliran ${u.players[u.currentTurn].name}.`;
  return true;
}

export function applyUnoCall(room, actorId) {
  const u = room.uno;
  if (!u || !u.started || u.winnerIndex !== null) return false;
  const player = u.players.find((p) => p.id === actorId);
  if (!player || player.hand.length > 2) return false;
  player.saidUno = true;
  u.lastBurst = { id: Date.now(), text: `${player.name}: UNO!` };
  u.statusText = `${player.name} berteriak "UNO!"`;
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
  if (!current || !current.isBot) return;

  room.unoBotTimer = setTimeout(() => {
    room.unoBotTimer = null;
    if (!room.uno || room.uno.winnerIndex !== null) return;
    const active = room.uno.players[room.uno.currentTurn];
    if (!active || !active.isBot) return;

    const topCard = room.uno.discardPile[room.uno.discardPile.length - 1];
    const decision = chooseBotCard(active.hand, topCard, room.uno.activeColor);
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
    started: u.started,
    mySeatIdx,
    myHand: me ? me.hand : [],
    players: u.players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIdx: p.seatIdx,
      cardCount: p.hand.length,
      saidUno: p.saidUno,
      isBot: p.isBot,
      connected: p.connected,
    })),
    drawCount: u.drawPile.length,
    topCard: u.discardPile[u.discardPile.length - 1],
    activeColor: u.activeColor,
    currentTurn: u.currentTurn,
    direction: u.direction,
    winnerIndex: u.winnerIndex,
    lastBurst: u.lastBurst,
    statusText: u.statusText,
  };
}
