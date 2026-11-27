import { io, type Socket } from 'socket.io-client';
import type { GameId } from '../types/game';
import {
  createPeerRoom,
  getPeerClient,
  joinPeerRoom,
  leavePeerRoom,
  lookupPeerRoom,
  type MultiplayerClient,
} from './peerTransport';

export type { MultiplayerClient } from './peerTransport';
export type MultiplayerGameId = Extract<GameId, 'chess' | 'uno' | 'carrom' | 'billiard'>;

export interface RoomPlayerInfo {
  id: string;
  name: string;
  seatIdx: number;
}

export interface MultiplayerRoomInfo {
  code: string;
  gameId: MultiplayerGameId;
  hostId: string;
  maxPlayers: number;
  players: RoomPlayerInfo[];
}

export interface OnlineSession {
  code: string;
  seatIdx: number;
  playerId: string;
  room: MultiplayerRoomInfo;
}

const USE_SOCKET_IO = import.meta.env.VITE_MULTIPLAYER_TRANSPORT === 'socketio';

export function getMultiplayerTransport(): 'peerjs' | 'socketio' {
  return USE_SOCKET_IO ? 'socketio' : 'peerjs';
}

let socketSingleton: Socket | null = null;

function getSocketIoClient(): Socket {
  if (!socketSingleton) {
    const customUrl = import.meta.env.VITE_SOCKET_URL as string | undefined;
    socketSingleton = io(customUrl || undefined, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  if (!socketSingleton.connected) {
    socketSingleton.connect();
  }
  return socketSingleton;
}

export function getSocket(): MultiplayerClient {
  return USE_SOCKET_IO ? getSocketIoClient() : getPeerClient();
}

function ensureSocketConnected(socket: Socket, timeoutMs = 4500): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
      reject(new Error('Gagal terhubung ke server multiplayer. Pastikan server aktif (npm run server).'));
    }, timeoutMs);

    const onConnect = () => {
      window.clearTimeout(timer);
      socket.off('connect_error', onError);
      resolve();
    };
    const onError = () => {
      window.clearTimeout(timer);
      socket.off('connect', onConnect);
      reject(new Error('Server multiplayer tidak terjangkau. Jalankan "npm run server" atau cek koneksi.'));
    };

    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
    socket.connect();
  });
}

export async function createOnlineRoom(
  gameId: MultiplayerGameId,
  nickname: string
): Promise<OnlineSession> {
  if (!USE_SOCKET_IO) {
    return createPeerRoom(gameId, nickname);
  }

  const socket = getSocketIoClient();
  await ensureSocketConnected(socket);
  return new Promise((resolve, reject) => {
    socket.emit(
      'room:create',
      { gameId, nickname },
      (res: { ok: boolean; error?: string; code?: string; seatIdx?: number; playerId?: string; room?: MultiplayerRoomInfo }) => {
        if (!res?.ok || !res.code || res.seatIdx === undefined || !res.playerId || !res.room) {
          reject(new Error(res?.error || 'Gagal membuat room.'));
          return;
        }
        resolve({
          code: res.code,
          seatIdx: res.seatIdx,
          playerId: res.playerId,
          room: res.room,
        });
      }
    );
  });
}

export async function joinOnlineRoom(
  code: string,
  nickname: string,
  gameId?: MultiplayerGameId
): Promise<OnlineSession> {
  if (!USE_SOCKET_IO) {
    return joinPeerRoom(code, nickname, gameId);
  }

  const socket = getSocketIoClient();
  await ensureSocketConnected(socket);
  return new Promise((resolve, reject) => {
    socket.emit(
      'room:join',
      { code: code.trim().toUpperCase(), gameId, nickname },
      (res: { ok: boolean; error?: string; code?: string; seatIdx?: number; playerId?: string; room?: MultiplayerRoomInfo }) => {
        if (!res?.ok || !res.code || res.seatIdx === undefined || !res.playerId || !res.room) {
          reject(new Error(res?.error || 'Gagal masuk ke room.'));
          return;
        }
        resolve({
          code: res.code,
          seatIdx: res.seatIdx,
          playerId: res.playerId,
          room: res.room,
        });
      }
    );
  });
}

export async function lookupOnlineRoom(code: string): Promise<MultiplayerRoomInfo> {
  if (!USE_SOCKET_IO) {
    return lookupPeerRoom(code);
  }

  const socket = getSocketIoClient();
  await ensureSocketConnected(socket);
  return new Promise((resolve, reject) => {
    socket.emit(
      'room:lookup',
      { code: code.trim().toUpperCase() },
      (res: { ok: boolean; error?: string; room?: MultiplayerRoomInfo }) => {
        if (!res?.ok || !res.room) {
          reject(new Error(res?.error || 'Room tidak ditemukan.'));
          return;
        }
        resolve(res.room);
      }
    );
  });
}

export function leaveOnlineRoom(): void {
  if (!USE_SOCKET_IO) {
    leavePeerRoom();
    return;
  }
  if (socketSingleton?.connected) {
    socketSingleton.emit('room:leave');
  }
}

export function buildInviteUrl(gameId: MultiplayerGameId, code: string): string {
  const url = new URL(window.location.href);
  url.search = `?game=${gameId}&room=${code}`;
  return url.toString();
}
