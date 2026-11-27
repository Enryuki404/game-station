import express from 'express';
import cors from 'cors';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { Chess } from 'chess.js';
import {
  applyUnoCall,
  applyUnoDraw,
  applyUnoPlay,
  getSanitizedUnoState,
  scheduleUnoBotTurnIfNeeded,
  startUnoMatch,
} from './unoRoom.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const PORT = Number(process.env.PORT || process.env.SERVER_PORT) || 3001;
const MAX_PLAYERS = {
  chess: 2,
  carrom: 2,
  billiard: 2,
  uno: 4,
};

const app = express();
app.use(cors());
app.use(express.json());

const rooms = new Map();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  app.use(express.static(DIST_DIR));
  app.get(/^(?!\/socket\.io|\/api).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = 'GS';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return `GS${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

function cleanNickname(raw, fallback = 'Tamu') {
  const s = String(raw || '').trim().slice(0, 18);
  return s || fallback;
}

function publicRoomInfo(room) {
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

function buildChessPayload(room) {
  const c = room.chess;
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

function broadcastUnoState(room) {
  if (!room.uno) return;
  for (const p of room.players) {
    io.to(p.id).emit('uno:state', getSanitizedUnoState(room, p.id));
  }
}

function removeSocketFromRooms(socket) {
  for (const [code, room] of rooms.entries()) {
    const idx = room.players.findIndex((p) => p.id === socket.id);
    if (idx === -1) continue;

    const leaving = room.players[idx];
    room.players.splice(idx, 1);
    socket.leave(code);

    if (room.players.length === 0) {
      if (room.unoBotTimer) clearTimeout(room.unoBotTimer);
      rooms.delete(code);
      continue;
    }

    if (room.hostId === socket.id) {
      room.hostId = room.players[0].id;
    }

    // In UNO, mark disconnected player if match already started
    if (room.uno && room.uno.started) {
      const up = room.uno.players.find((p) => p.id === leaving.id);
      if (up) up.connected = false;
      broadcastUnoState(room);
    }

    io.to(code).emit('room:update', {
      room: publicRoomInfo(room),
      notice: `${leaving.name} keluar dari room.`,
    });
  }
}

io.on('connection', (socket) => {
  socket.on('room:lookup', ({ code }, ack) => {
    const cleanCode = String(code || '').trim().toUpperCase();
    const room = rooms.get(cleanCode);
    if (!room) {
      ack?.({ ok: false, error: 'Room tidak ditemukan.' });
      return;
    }
    ack?.({ ok: true, room: publicRoomInfo(room) });
  });

  socket.on('room:create', ({ gameId, nickname }, ack) => {
    if (!MAX_PLAYERS[gameId]) {
      ack?.({ ok: false, error: 'Game multiplayer tidak valid.' });
      return;
    }
    removeSocketFromRooms(socket);

    const code = generateRoomCode();
    const name = cleanNickname(nickname, 'Pemain 1');
    const room = {
      code,
      gameId,
      hostId: socket.id,
      maxPlayers: MAX_PLAYERS[gameId],
      players: [{ id: socket.id, name }],
      chess: gameId === 'chess' ? new Chess() : null,
      uno: null,
      unoBotTimer: null,
      carromTurn: 1,
      billiardTurn: 1,
    };

    rooms.set(code, room);
    socket.join(code);

    const info = publicRoomInfo(room);
    ack?.({ ok: true, code, seatIdx: 0, playerId: socket.id, room: info });
    io.to(code).emit('room:update', { room: info });

    if (gameId === 'chess') {
      socket.emit('chess:state', buildChessPayload(room));
    }
  });

  socket.on('room:join', ({ code, gameId, nickname }, ack) => {
    const cleanCode = String(code || '').trim().toUpperCase();
    const room = rooms.get(cleanCode);
    if (!room) {
      ack?.({ ok: false, error: 'Kode room tidak ditemukan atau sudah berakhir.' });
      return;
    }
    if (gameId && room.gameId !== gameId) {
      ack?.({ ok: false, error: `Room ini untuk game ${room.gameId.toUpperCase()}, bukan ${gameId.toUpperCase()}.` });
      return;
    }
    if (room.uno && room.uno.started) {
      ack?.({ ok: false, error: 'Permainan UNO di room ini sudah dimulai.' });
      return;
    }
    if (room.players.length >= room.maxPlayers) {
      ack?.({ ok: false, error: 'Room sudah penuh.' });
      return;
    }

    removeSocketFromRooms(socket);

    const seatIdx = room.players.length;
    const name = cleanNickname(nickname, `Pemain ${seatIdx + 1}`);
    room.players.push({ id: socket.id, name });
    socket.join(cleanCode);

    const info = publicRoomInfo(room);
    ack?.({ ok: true, code: cleanCode, seatIdx, playerId: socket.id, room: info });
    io.to(cleanCode).emit('room:update', {
      room: info,
      notice: `${name} bergabung ke meja!`,
    });

    if (room.gameId === 'chess' && room.chess) {
      io.to(cleanCode).emit('chess:state', buildChessPayload(room));
    }
  });

  socket.on('room:leave', () => {
    removeSocketFromRooms(socket);
  });

  // ---- CHESS EVENTS ----
  socket.on('chess:move', ({ code, from, to, promotion }, ack) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.gameId !== 'chess' || !room.chess) {
      ack?.({ ok: false, error: 'Room catur tidak ditemukan.' });
      return;
    }
    const seatIdx = room.players.findIndex((p) => p.id === socket.id);
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
      const move = room.chess.move({ from, to, promotion: promotion || 'q' });
      if (!move) {
        ack?.({ ok: false, error: 'Langkah tidak legal.' });
        return;
      }
      const payload = buildChessPayload(room);
      io.to(room.code).emit('chess:state', payload);
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'Langkah tidak valid.' });
    }
  });

  socket.on('chess:rematch', ({ code }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.gameId !== 'chess') return;
    if (!room.players.some((p) => p.id === socket.id)) return;
    room.chess = new Chess();
    io.to(room.code).emit('chess:state', buildChessPayload(room));
  });

  // ---- UNO EVENTS ----
  socket.on('uno:start', ({ code, fillBots }, ack) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.gameId !== 'uno') {
      ack?.({ ok: false, error: 'Room UNO tidak ditemukan.' });
      return;
    }
    if (room.hostId !== socket.id) {
      ack?.({ ok: false, error: 'Hanya Host yang dapat memulai permainan.' });
      return;
    }
    if (!fillBots && room.players.length < 2) {
      ack?.({ ok: false, error: 'Minimal 2 pemain atau aktifkan Isi Bot.' });
      return;
    }
    startUnoMatch(room, Boolean(fillBots));
    broadcastUnoState(room);
    scheduleUnoBotTurnIfNeeded(room, () => broadcastUnoState(room));
    ack?.({ ok: true });
  });

  socket.on('uno:play', ({ code, cardId, chosenColor }, ack) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.gameId !== 'uno') return;
    const ok = applyUnoPlay(room, socket.id, cardId, chosenColor);
    if (!ok) {
      ack?.({ ok: false });
      return;
    }
    broadcastUnoState(room);
    scheduleUnoBotTurnIfNeeded(room, () => broadcastUnoState(room));
    ack?.({ ok: true });
  });

  socket.on('uno:draw', ({ code }, ack) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.gameId !== 'uno') return;
    const ok = applyUnoDraw(room, socket.id);
    if (!ok) {
      ack?.({ ok: false });
      return;
    }
    broadcastUnoState(room);
    scheduleUnoBotTurnIfNeeded(room, () => broadcastUnoState(room));
    ack?.({ ok: true });
  });

  socket.on('uno:call', ({ code }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.gameId !== 'uno') return;
    if (applyUnoCall(room, socket.id)) {
      broadcastUnoState(room);
    }
  });

  // ---- KARAMBOL EVENTS ----
  socket.on('carrom:striker', ({ code, x }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.gameId !== 'carrom') return;
    const seatIdx = room.players.findIndex((p) => p.id === socket.id);
    if (seatIdx === -1 || seatIdx + 1 !== room.carromTurn) return;
    socket.to(room.code).emit('carrom:striker', { x });
  });

  socket.on('carrom:shoot', ({ code, strikerX, vx, vy }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.gameId !== 'carrom') return;
    const seatIdx = room.players.findIndex((p) => p.id === socket.id);
    if (seatIdx === -1 || seatIdx + 1 !== room.carromTurn) return;
    io.to(room.code).emit('carrom:shoot', { strikerX, vx, vy, shooterSeat: seatIdx });
  });

  socket.on('carrom:sync', ({ code, bodies, turn, queenState, status, winner }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.gameId !== 'carrom') return;
    const seatIdx = room.players.findIndex((p) => p.id === socket.id);
    if (seatIdx === -1 || seatIdx + 1 !== room.carromTurn) return;
    room.carromTurn = turn;
    socket.to(room.code).emit('carrom:sync', { bodies, turn, queenState, status, winner });
  });

  socket.on('carrom:rematch', ({ code }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.gameId !== 'carrom') return;
    if (!room.players.some((p) => p.id === socket.id)) return;
    room.carromTurn = 1;
    io.to(room.code).emit('carrom:rematch');
  });

  // ---- BILLIARD EVENTS ----
  socket.on('billiard:aim', ({ code, active, x, y }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.gameId !== 'billiard') return;
    const seatIdx = room.players.findIndex((p) => p.id === socket.id);
    if (seatIdx === -1 || seatIdx + 1 !== room.billiardTurn) return;
    socket.to(room.code).emit('billiard:aim', { active, x, y });
  });

  socket.on('billiard:placeCue', ({ code, x, y, confirm }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.gameId !== 'billiard') return;
    const seatIdx = room.players.findIndex((p) => p.id === socket.id);
    if (seatIdx === -1 || seatIdx + 1 !== room.billiardTurn) return;
    socket.to(room.code).emit('billiard:placeCue', { x, y, confirm });
  });

  socket.on('billiard:shoot', ({ code, vx, vy }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.gameId !== 'billiard') return;
    const seatIdx = room.players.findIndex((p) => p.id === socket.id);
    if (seatIdx === -1 || seatIdx + 1 !== room.billiardTurn) return;
    io.to(room.code).emit('billiard:shoot', { vx, vy, shooterSeat: seatIdx });
  });

  socket.on('billiard:sync', ({ code, balls, turn, group1, group2, ballInHand, status, winner }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.gameId !== 'billiard') return;
    const seatIdx = room.players.findIndex((p) => p.id === socket.id);
    if (seatIdx === -1 || seatIdx + 1 !== room.billiardTurn) return;
    room.billiardTurn = turn;
    socket.to(room.code).emit('billiard:sync', { balls, turn, group1, group2, ballInHand, status, winner });
  });

  socket.on('billiard:rematch', ({ code }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || room.gameId !== 'billiard') return;
    if (!room.players.some((p) => p.id === socket.id)) return;
    room.billiardTurn = 1;
    io.to(room.code).emit('billiard:rematch');
  });

  socket.on('disconnect', () => {
    removeSocketFromRooms(socket);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Game Station Socket.IO server listening on http://0.0.0.0:${PORT}`);
});
