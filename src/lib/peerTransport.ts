import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { Chess } from 'chess.js';
import {
  applySharedUnoCall,
  applySharedUnoDraw,
  applySharedUnoPlay,
  chooseBestAiCard,
  createSharedUnoMatch,
  getSanitizedSharedUnoState,
  type SharedUnoMatch,
  type UnoVariant,
} from '../games/uno/unoEngine';
import type { MultiplayerGameId, MultiplayerRoomInfo, OnlineSession } from './multiplayer';

export interface MultiplayerClient {
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  emit(event: string, payload?: any, ack?: (res: any) => void): void;
}

const PEER_PREFIX = 'gs404-room-';
const MAX_PLAYERS: Record<MultiplayerGameId, number> = {
  chess: 2,
  carrom: 4,
  billiard: 4,
  uno: 6,
};

const PEER_OPTIONS: PeerOptions = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
  },
};

type WireMessage =
  | { kind: 'req'; reqId?: string; event: string; payload?: any }
  | { kind: 'ack'; reqId: string; data: any }
  | { kind: 'evt'; event: string; payload?: any };

interface HostPlayer {
  id: string;
  name: string;
  conn: DataConnection | null;
}

interface HostRoomState {
  code: string;
  gameId: MultiplayerGameId;
  hostId: string;
  maxPlayers: number;
  players: HostPlayer[];
  chess: Chess | null;
  uno: SharedUnoMatch | null;
  unoBotTimer: number | null;
  carromTurn: number;
  billiardTurn: number;
}

type EventListener = (...args: any[]) => void;

const listeners = new Map<string, Set<EventListener>>();
const latestSnapshots = new Map<string, any>();
const pendingAcks = new Map<string, { resolve: (data: any) => void; timer: number }>();

let activePeer: Peer | null = null;
let hostRoom: HostRoomState | null = null;
let guestConn: DataConnection | null = null;
let reqSeq = 0;
let unloadHookRegistered = false;

function codeToPeerId(code: string): string {
  return `${PEER_PREFIX}${code.trim().toLowerCase()}`;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GS';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function cleanNickname(raw: unknown, fallback = 'Tamu'): string {
  const s = String(raw || '').trim().slice(0, 18);
  return s || fallback;
}

function emitLocal(event: string, payload?: any): void {
  if (event === 'chess:state' || event === 'uno:state') {
    latestSnapshots.set(event, payload);
  }
  const set = listeners.get(event);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch {
      // Isolate listener errors
    }
  }
}

function publicRoomInfo(room: HostRoomState): MultiplayerRoomInfo {
  return {
    code: room.code,
    gameId: room.gameId,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    players: room.players.map((p, idx) => ({
      id: p.id,
      name: p.name,
      seatIdx: idx,
    })),
  };
}

function buildChessPayload(room: HostRoomState) {
  const c = room.chess!;
  const hist = c.history({ verbose: true });
  const last = hist[hist.length - 1];
  return {
    fen: c.fen(),
    lastMove: last ? { from: last.from, to: last.to } : null,
    history: hist,
    turn: c.turn(),
    inCheck: c.inCheck(),
    isCheckmate: c.isCheckmate(),
    isDraw: c.isDraw(),
    gameOver: c.isGameOver(),
  };
}

function broadcastEvent(room: HostRoomState, event: string, payload?: any, excludePeerId?: string): void {
  for (const p of room.players) {
    if (excludePeerId && p.id === excludePeerId) continue;
    if (p.id === room.hostId) {
      emitLocal(event, payload);
    } else if (p.conn?.open) {
      p.conn.send({ kind: 'evt', event, payload } satisfies WireMessage);
    }
  }
}

// ---- Host Authoritative LAST ONE! Engine (2-6 Players, 6 Variants) ----
const VALID_UNO_VARIANTS = new Set<UnoVariant>(['classic', 'stack', 'sevenzero', 'nomercy', 'allwild', 'attack']);

function normalizeUnoVariant(raw: unknown): UnoVariant {
  return typeof raw === 'string' && VALID_UNO_VARIANTS.has(raw as UnoVariant) ? (raw as UnoVariant) : 'classic';
}

function broadcastUnoState(room: HostRoomState): void {
  if (!room.uno) return;
  for (const p of room.players) {
    const sanitized = getSanitizedSharedUnoState(room.uno, p.id);
    if (p.id === room.hostId) {
      emitLocal('uno:state', sanitized);
    } else if (p.conn?.open) {
      p.conn.send({ kind: 'evt', event: 'uno:state', payload: sanitized } satisfies WireMessage);
    }
  }
}

function startUnoMatch(room: HostRoomState, fillBots: boolean, variantRaw?: unknown): void {
  if (room.unoBotTimer !== null) {
    window.clearTimeout(room.unoBotTimer);
    room.unoBotTimer = null;
  }

  const variant = normalizeUnoVariant(variantRaw);
  const botNames = ['Bot Raka', 'Bot Sinta', 'Bot Budi', 'Bot Dewi', 'Bot Dimas'];
  const seats: Array<{ id: string; name: string; isBot: boolean }> = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: false,
  }));

  if (fillBots) {
    let bIdx = 0;
    while (seats.length < 4 && bIdx < botNames.length) {
      seats.push({ id: `bot-${bIdx + 1}`, name: botNames[bIdx], isBot: true });
      bIdx++;
    }
  }

  room.uno = createSharedUnoMatch(variant, seats);
}

function scheduleUnoBotTurnIfNeeded(room: HostRoomState): void {
  if (room.unoBotTimer !== null) {
    window.clearTimeout(room.unoBotTimer);
    room.unoBotTimer = null;
  }
  const u = room.uno;
  if (!u || !u.started || u.winnerIndex !== null) return;
  const current = u.players[u.currentTurn];
  if (!current || !current.isBot || current.eliminated) return;

  room.unoBotTimer = window.setTimeout(() => {
    room.unoBotTimer = null;
    if (!room.uno || room.uno.winnerIndex !== null || hostRoom !== room) return;
    const active = room.uno.players[room.uno.currentTurn];
    if (!active || !active.isBot || active.eliminated) return;

    const topCard = room.uno.discardPile[room.uno.discardPile.length - 1];
    const decision = chooseBestAiCard(
      active.hand,
      topCard,
      room.uno.activeColor,
      room.uno.pendingDraw,
      room.uno.pendingDrawMin,
      room.uno.variant
    );
    if (decision) {
      applySharedUnoPlay(room.uno, active.id, decision.card.id, decision.chosenColor);
    } else {
      applySharedUnoDraw(room.uno, active.id);
    }
    broadcastUnoState(room);
    scheduleUnoBotTurnIfNeeded(room);
  }, 850);
}

// ---- Host Room Action Dispatcher ----
function handlePlayerLeave(peerId: string): void {
  if (!hostRoom) return;
  const idx = hostRoom.players.findIndex((p) => p.id === peerId);
  if (idx === -1) return;

  const [leaving] = hostRoom.players.splice(idx, 1);
  if (hostRoom.uno && hostRoom.uno.started) {
    const up = hostRoom.uno.players.find((p) => p.id === leaving.id);
    if (up) up.connected = false;
    broadcastUnoState(hostRoom);
  }
  broadcastEvent(hostRoom, 'room:update', {
    room: publicRoomInfo(hostRoom),
    notice: `${leaving.name} keluar dari room.`,
  });
}

function handleRoomAction(
  senderId: string,
  event: string,
  payload: any,
  ack?: (res: any) => void,
  senderConn?: DataConnection
): void {
  const room = hostRoom;
  if (!room) {
    ack?.({ ok: false, error: 'Room tidak aktif.' });
    return;
  }

  switch (event) {
    case 'room:lookup': {
      ack?.({ ok: true, room: publicRoomInfo(room) });
      return;
    }

    case 'room:join': {
      if (payload?.gameId && room.gameId !== payload.gameId) {
        ack?.({
          ok: false,
          error: `Room ini untuk game ${room.gameId.toUpperCase()}, bukan ${String(payload.gameId).toUpperCase()}.`,
        });
        return;
      }
      if (room.uno && room.uno.started) {
        ack?.({ ok: false, error: 'Permainan LAST ONE! di room ini sudah dimulai.' });
        return;
      }
      if (room.players.length >= room.maxPlayers) {
        ack?.({ ok: false, error: 'Room sudah penuh.' });
        return;
      }

      const existingIdx = room.players.findIndex((p) => p.id === senderId);
      if (existingIdx !== -1) {
        const info = publicRoomInfo(room);
        ack?.({ ok: true, code: room.code, seatIdx: existingIdx, playerId: senderId, room: info });
        return;
      }

      const seatIdx = room.players.length;
      const name = cleanNickname(payload?.nickname, `Pemain ${seatIdx + 1}`);
      room.players.push({ id: senderId, name, conn: senderConn ?? null });

      const info = publicRoomInfo(room);
      ack?.({ ok: true, code: room.code, seatIdx, playerId: senderId, room: info });
      broadcastEvent(room, 'room:update', {
        room: info,
        notice: `${name} bergabung ke meja!`,
      });

      if (room.gameId === 'chess' && room.chess) {
        const chessPayload = buildChessPayload(room);
        if (senderConn?.open) {
          senderConn.send({ kind: 'evt', event: 'chess:state', payload: chessPayload } satisfies WireMessage);
        }
      }
      return;
    }

    case 'room:leave': {
      handlePlayerLeave(senderId);
      return;
    }

    // ---- CHESS ----
    case 'chess:move': {
      if (room.gameId !== 'chess' || !room.chess) {
        ack?.({ ok: false, error: 'Room catur tidak ditemukan.' });
        return;
      }
      const seatIdx = room.players.findIndex((p) => p.id === senderId);
      if (seatIdx === -1) {
        ack?.({ ok: false, error: 'Kamu tidak berada di room ini.' });
        return;
      }
      const expectedColor = seatIdx === 0 ? 'w' : 'b';
      if (room.chess.turn() !== expectedColor) {
        ack?.({ ok: false, error: 'Bukan giliranmu.' });
        return;
      }
      try {
        const move = room.chess.move({
          from: payload.from,
          to: payload.to,
          promotion: payload.promotion || 'q',
        });
        if (!move) {
          ack?.({ ok: false, error: 'Langkah tidak legal.' });
          return;
        }
        broadcastEvent(room, 'chess:state', buildChessPayload(room));
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, error: 'Langkah tidak valid.' });
      }
      return;
    }

    case 'chess:rematch': {
      if (room.gameId !== 'chess') return;
      if (!room.players.some((p) => p.id === senderId)) return;
      room.chess = new Chess();
      broadcastEvent(room, 'chess:state', buildChessPayload(room));
      return;
    }

    // ---- UNO ----
    case 'uno:start': {
      if (room.gameId !== 'uno') {
        ack?.({ ok: false, error: 'Room LAST ONE! tidak ditemukan.' });
        return;
      }
      if (room.hostId !== senderId) {
        ack?.({ ok: false, error: 'Hanya Host yang dapat memulai permainan.' });
        return;
      }
      const fillBots = Boolean(payload?.fillBots);
      if (!fillBots && room.players.length < 2) {
        ack?.({ ok: false, error: 'Minimal 2 pemain atau aktifkan Isi Bot.' });
        return;
      }
      startUnoMatch(room, fillBots, payload?.variant);
      broadcastUnoState(room);
      scheduleUnoBotTurnIfNeeded(room);
      ack?.({ ok: true });
      return;
    }

    case 'uno:play': {
      if (room.gameId !== 'uno' || !room.uno) return;
      const ok = applySharedUnoPlay(
        room.uno,
        senderId,
        payload.cardId,
        payload.chosenColor,
        payload.swapTargetId
      );
      if (!ok) {
        ack?.({ ok: false });
        return;
      }
      broadcastUnoState(room);
      scheduleUnoBotTurnIfNeeded(room);
      ack?.({ ok: true });
      return;
    }

    case 'uno:draw': {
      if (room.gameId !== 'uno' || !room.uno) return;
      const ok = applySharedUnoDraw(room.uno, senderId);
      if (!ok) {
        ack?.({ ok: false });
        return;
      }
      broadcastUnoState(room);
      scheduleUnoBotTurnIfNeeded(room);
      ack?.({ ok: true });
      return;
    }

    case 'uno:call': {
      if (room.gameId !== 'uno' || !room.uno) return;
      if (applySharedUnoCall(room.uno, senderId)) {
        broadcastUnoState(room);
      }
      return;
    }

    // ---- KARAMBOL ----
    case 'carrom:striker': {
      if (room.gameId !== 'carrom') return;
      const seatIdx = room.players.findIndex((p) => p.id === senderId);
      if (seatIdx === -1 || seatIdx + 1 !== room.carromTurn) return;
      broadcastEvent(room, 'carrom:striker', { x: payload.x, y: payload.y }, senderId);
      return;
    }

    case 'carrom:shoot': {
      if (room.gameId !== 'carrom') return;
      const seatIdx = room.players.findIndex((p) => p.id === senderId);
      if (seatIdx === -1 || seatIdx + 1 !== room.carromTurn) return;
      broadcastEvent(room, 'carrom:shoot', {
        strikerX: payload.strikerX,
        strikerY: payload.strikerY,
        vx: payload.vx,
        vy: payload.vy,
        shooterSeat: seatIdx,
      });
      return;
    }

    case 'carrom:sync': {
      if (room.gameId !== 'carrom') return;
      const seatIdx = room.players.findIndex((p) => p.id === senderId);
      if (seatIdx === -1 || seatIdx + 1 !== room.carromTurn) return;
      room.carromTurn = payload.turn;
      broadcastEvent(
        room,
        'carrom:sync',
        {
          bodies: payload.bodies,
          turn: payload.turn,
          queenState: payload.queenState,
          status: payload.status,
          winner: payload.winner,
          playerCount: payload.playerCount,
        },
        senderId
      );
      return;
    }

    case 'carrom:rematch': {
      if (room.gameId !== 'carrom') return;
      if (!room.players.some((p) => p.id === senderId)) return;
      room.carromTurn = 1;
      broadcastEvent(room, 'carrom:rematch', { playerCount: payload?.playerCount });
      return;
    }

    // ---- BILLIARD ----
    case 'billiard:aim': {
      if (room.gameId !== 'billiard') return;
      const seatIdx = room.players.findIndex((p) => p.id === senderId);
      if (seatIdx === -1 || seatIdx + 1 !== room.billiardTurn) return;
      broadcastEvent(room, 'billiard:aim', { active: payload.active, x: payload.x, y: payload.y }, senderId);
      return;
    }

    case 'billiard:placeCue': {
      if (room.gameId !== 'billiard') return;
      const seatIdx = room.players.findIndex((p) => p.id === senderId);
      if (seatIdx === -1 || seatIdx + 1 !== room.billiardTurn) return;
      broadcastEvent(
        room,
        'billiard:placeCue',
        { x: payload.x, y: payload.y, confirm: payload.confirm },
        senderId
      );
      return;
    }

    case 'billiard:shoot': {
      if (room.gameId !== 'billiard') return;
      const seatIdx = room.players.findIndex((p) => p.id === senderId);
      if (seatIdx === -1 || seatIdx + 1 !== room.billiardTurn) return;
      broadcastEvent(room, 'billiard:shoot', {
        vx: payload.vx,
        vy: payload.vy,
        shooterSeat: seatIdx,
      });
      return;
    }

    case 'billiard:sync': {
      if (room.gameId !== 'billiard') return;
      const seatIdx = room.players.findIndex((p) => p.id === senderId);
      if (seatIdx === -1 || seatIdx + 1 !== room.billiardTurn) return;
      room.billiardTurn = payload.turn;
      broadcastEvent(
        room,
        'billiard:sync',
        {
          balls: payload.balls,
          turn: payload.turn,
          group1: payload.group1,
          group2: payload.group2,
          ballInHand: payload.ballInHand,
          status: payload.status,
          winner: payload.winner,
          variant: payload.variant,
          scores: payload.scores,
          playerCount: payload.playerCount,
        },
        senderId
      );
      return;
    }

    case 'billiard:rematch': {
      if (room.gameId !== 'billiard') return;
      if (!room.players.some((p) => p.id === senderId)) return;
      room.billiardTurn = 1;
      broadcastEvent(room, 'billiard:rematch', {
        variant: payload?.variant,
        playerCount: payload?.playerCount,
      });
      return;
    }
  }
}

function handleIncomingConnection(conn: DataConnection): void {
  conn.on('data', (raw) => {
    const msg = raw as WireMessage;
    if (!msg || msg.kind !== 'req') return;

    const sendAck = msg.reqId
      ? (data: any) => {
          if (conn.open) {
            conn.send({ kind: 'ack', reqId: msg.reqId!, data } satisfies WireMessage);
          }
        }
      : undefined;

    handleRoomAction(conn.peer, msg.event, msg.payload, sendAck, conn);
  });

  conn.on('close', () => {
    handlePlayerLeave(conn.peer);
  });
}

function sendGuestRequest(conn: DataConnection, event: string, payload?: any, timeoutMs = 8000): Promise<any> {
  return new Promise((resolve, reject) => {
    const reqId = `r-${++reqSeq}`;
    const timer = window.setTimeout(() => {
      pendingAcks.delete(reqId);
      reject(new Error('Koneksi ke Host timeout.'));
    }, timeoutMs);

    pendingAcks.set(reqId, {
      resolve: (data) => {
        window.clearTimeout(timer);
        pendingAcks.delete(reqId);
        resolve(data);
      },
      timer,
    });

    conn.send({ kind: 'req', reqId, event, payload } satisfies WireMessage);
  });
}

function registerBeforeUnload(): void {
  if (unloadHookRegistered || typeof window === 'undefined') return;
  unloadHookRegistered = true;
  window.addEventListener('beforeunload', () => {
    leavePeerRoom();
  });
}

function openPeerInstance(peerId?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = peerId ? new Peer(peerId, PEER_OPTIONS) : new Peer(PEER_OPTIONS);
    const timer = window.setTimeout(() => {
      try {
        peer.destroy();
      } catch {
        // ignore
      }
      reject(new Error('Gagal terhubung ke server signaling P2P. Cek koneksi internetmu.'));
    }, 9000);

    peer.once('open', () => {
      window.clearTimeout(timer);
      resolve(peer);
    });

    peer.once('error', (err) => {
      window.clearTimeout(timer);
      try {
        peer.destroy();
      } catch {
        // ignore
      }
      reject(err);
    });
  });
}

function connectToHostPeer(peer: Peer, hostPeerId: string, timeoutMs = 9000): Promise<DataConnection> {
  return new Promise((resolve, reject) => {
    const conn = peer.connect(hostPeerId, { reliable: true, serialization: 'json' });
    let settled = false;

    const cleanup = () => {
      peer.off('error', onPeerError);
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        conn.close();
      } catch {
        // ignore
      }
      reject(new Error('Room tidak ditemukan atau Host sedang offline.'));
    }, timeoutMs);

    const onPeerError = (err: { type?: string }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      if (err?.type === 'peer-unavailable') {
        reject(new Error('Kode room tidak ditemukan atau Host sudah menutup room.'));
      } else {
        reject(new Error('Gagal tersambung ke Host P2P.'));
      }
    };

    peer.once('error', onPeerError);

    conn.once('open', () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      resolve(conn);
    });

    conn.once('error', () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      reject(new Error('Koneksi P2P ke Host gagal.'));
    });
  });
}

export function leavePeerRoom(): void {
  if (hostRoom?.unoBotTimer !== null && hostRoom?.unoBotTimer !== undefined) {
    window.clearTimeout(hostRoom.unoBotTimer);
  }
  latestSnapshots.clear();

  for (const [, pending] of pendingAcks.entries()) {
    window.clearTimeout(pending.timer);
  }
  pendingAcks.clear();

  if (guestConn) {
    try {
      if (guestConn.open) {
        guestConn.send({ kind: 'req', event: 'room:leave' } satisfies WireMessage);
      }
      guestConn.close();
    } catch {
      // ignore
    }
    guestConn = null;
  }

  if (hostRoom) {
    for (const p of hostRoom.players) {
      if (p.conn) {
        try {
          p.conn.close();
        } catch {
          // ignore
        }
      }
    }
    hostRoom = null;
  }

  if (activePeer) {
    try {
      activePeer.destroy();
    } catch {
      // ignore
    }
    activePeer = null;
  }
}

export async function createPeerRoom(gameId: MultiplayerGameId, nickname: string): Promise<OnlineSession> {
  registerBeforeUnload();
  leavePeerRoom();

  let peer: Peer | null = null;
  let code = '';

  for (let attempt = 0; attempt < 3; attempt++) {
    code = generateRoomCode();
    try {
      peer = await openPeerInstance(codeToPeerId(code));
      break;
    } catch (err: any) {
      if (err?.type === 'unavailable-id' && attempt < 2) continue;
      throw err instanceof Error ? err : new Error('Gagal membuat room P2P.');
    }
  }

  if (!peer) {
    throw new Error('Gagal menyiapkan Host P2P.');
  }

  activePeer = peer;
  const hostName = cleanNickname(nickname, 'Pemain 1');
  hostRoom = {
    code,
    gameId,
    hostId: peer.id,
    maxPlayers: MAX_PLAYERS[gameId],
    players: [{ id: peer.id, name: hostName, conn: null }],
    chess: gameId === 'chess' ? new Chess() : null,
    uno: null,
    unoBotTimer: null,
    carromTurn: 1,
    billiardTurn: 1,
  };

  peer.on('connection', handleIncomingConnection);

  const info = publicRoomInfo(hostRoom);
  emitLocal('room:update', { room: info });
  if (gameId === 'chess') {
    emitLocal('chess:state', buildChessPayload(hostRoom));
  }

  return {
    code,
    seatIdx: 0,
    playerId: peer.id,
    room: info,
  };
}

export async function joinPeerRoom(
  code: string,
  nickname: string,
  gameId?: MultiplayerGameId
): Promise<OnlineSession> {
  registerBeforeUnload();
  leavePeerRoom();

  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    throw new Error('Masukkan kode room terlebih dahulu.');
  }

  const peer = await openPeerInstance();
  activePeer = peer;

  let conn: DataConnection;
  try {
    conn = await connectToHostPeer(peer, codeToPeerId(cleanCode));
  } catch (err) {
    leavePeerRoom();
    throw err;
  }

  guestConn = conn;
  conn.on('data', (raw) => {
    const msg = raw as WireMessage;
    if (!msg) return;
    if (msg.kind === 'ack') {
      const pending = pendingAcks.get(msg.reqId);
      if (pending) pending.resolve(msg.data);
      return;
    }
    if (msg.kind === 'evt') {
      emitLocal(msg.event, msg.payload);
    }
  });

  conn.on('close', () => {
    if (guestConn === conn) {
      guestConn = null;
      emitLocal('room:update', {
        room: {
          code: cleanCode,
          gameId: gameId ?? 'chess',
          hostId: '',
          maxPlayers: 2,
          players: [],
        },
        notice: 'Host menutup room.',
      });
    }
  });

  const res = await sendGuestRequest(conn, 'room:join', {
    code: cleanCode,
    gameId,
    nickname,
  });

  if (!res?.ok || !res.code || res.seatIdx === undefined || !res.playerId || !res.room) {
    leavePeerRoom();
    throw new Error(res?.error || 'Gagal bergabung ke room.');
  }

  return {
    code: res.code,
    seatIdx: res.seatIdx,
    playerId: res.playerId,
    room: res.room,
  };
}

export async function lookupPeerRoom(code: string): Promise<MultiplayerRoomInfo> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    throw new Error('Masukkan kode room terlebih dahulu.');
  }

  const tempPeer = await openPeerInstance();
  try {
    const conn = await connectToHostPeer(tempPeer, codeToPeerId(cleanCode), 8000);
    const res = await new Promise<any>((resolve, reject) => {
      const reqId = `lookup-${++reqSeq}`;
      const timer = window.setTimeout(() => reject(new Error('Timeout memeriksa room.')), 6000);
      conn.on('data', (raw) => {
        const msg = raw as WireMessage;
        if (msg?.kind === 'ack' && msg.reqId === reqId) {
          window.clearTimeout(timer);
          resolve(msg.data);
        }
      });
      conn.send({ kind: 'req', reqId, event: 'room:lookup', payload: { code: cleanCode } } satisfies WireMessage);
    });
    if (!res?.ok || !res.room) {
      throw new Error(res?.error || 'Room tidak ditemukan.');
    }
    return res.room;
  } finally {
    try {
      tempPeer.destroy();
    } catch {
      // ignore
    }
  }
}

const peerClientSingleton: MultiplayerClient = {
  on(event, listener) {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    set.add(listener);

    if ((event === 'chess:state' || event === 'uno:state') && latestSnapshots.has(event)) {
      const snap = latestSnapshots.get(event);
      queueMicrotask(() => {
        if (listeners.get(event)?.has(listener)) {
          listener(snap);
        }
      });
    }
  },

  off(event, listener) {
    listeners.get(event)?.delete(listener);
  },

  emit(event, payload, ack) {
    if (hostRoom && activePeer) {
      handleRoomAction(activePeer.id, event, payload, ack);
      return;
    }

    if (guestConn?.open) {
      if (ack) {
        sendGuestRequest(guestConn, event, payload)
          .then((res) => ack(res))
          .catch((err) => ack({ ok: false, error: err instanceof Error ? err.message : 'Koneksi gagal.' }));
      } else {
        guestConn.send({ kind: 'req', event, payload } satisfies WireMessage);
      }
      return;
    }

    ack?.({ ok: false, error: 'Belum terhubung ke room P2P.' });
  },
};

export function getPeerClient(): MultiplayerClient {
  return peerClientSingleton;
}
