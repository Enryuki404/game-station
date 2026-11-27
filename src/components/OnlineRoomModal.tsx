import React, { useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, LogIn, Plus, Users, X } from 'lucide-react';
import { useGameStation } from '../context/GameStationContext';
import {
  buildInviteUrl,
  createOnlineRoom,
  joinOnlineRoom,
  type MultiplayerGameId,
  type OnlineSession,
} from '../lib/multiplayer';

interface OnlineRoomModalProps {
  open: boolean;
  gameId: MultiplayerGameId;
  gameTitle: string;
  initialJoinCode?: string | null;
  activeSession: OnlineSession | null;
  onConnected: (session: OnlineSession) => void;
  onClose: () => void;
}

export const OnlineRoomModal: React.FC<OnlineRoomModalProps> = ({
  open,
  gameId,
  gameTitle,
  initialJoinCode,
  activeSession,
  onConnected,
  onClose,
}) => {
  const { nickname, setNickname, sfx } = useGameStation();
  const [tab, setTab] = useState<'create' | 'join'>(initialJoinCode ? 'join' : 'create');
  const [nameInput, setNameInput] = useState(nickname);
  const [codeInput, setCodeInput] = useState(initialJoinCode ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);

  useEffect(() => {
    setNameInput(nickname);
  }, [nickname, open]);

  useEffect(() => {
    if (initialJoinCode) {
      setTab('join');
      setCodeInput(initialJoinCode.toUpperCase());
    }
  }, [initialJoinCode]);

  if (!open) return null;

  const commitName = () => {
    const clean = nameInput.trim().slice(0, 18) || nickname;
    setNickname(clean);
    return clean;
  };

  const handleCreate = async () => {
    setError(null);
    setLoading(true);
    sfx('click');
    try {
      const clean = commitName();
      const session = await createOnlineRoom(gameId, clean);
      onConnected(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat room.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeInput.trim()) {
      setError('Masukkan kode room terlebih dahulu.');
      return;
    }
    setError(null);
    setLoading(true);
    sfx('click');
    try {
      const clean = commitName();
      const session = await joinOnlineRoom(codeInput, clean, gameId);
      onConnected(session);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal bergabung ke room.');
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string, kind: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(kind);
      sfx('click');
      window.setTimeout(() => setCopiedType(null), 1600);
    } catch {
      // Clipboard blocked
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-slate-700/80 bg-slate-900 p-4 sm:p-6 shadow-2xl animate-pop-in space-y-4 sm:space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-white">Mabar Online — {gameTitle}</h2>
            <p className="text-xs text-slate-400">Main P2P langsung sebagai Guest (tanpa login &amp; gratis)</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {activeSession ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-indigo-500/35 bg-indigo-500/10 p-4 text-center space-y-2">
              <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Kode Room Kamu</p>
              <p className="text-3xl font-black font-mono-num tracking-widest text-white select-all">
                {activeSession.code}
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => copyText(activeSession.code, 'code')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 cursor-pointer btn-tactile"
                >
                  {copiedType === 'code' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedType === 'code' ? 'Tersalin!' : 'Salin Kode'}
                </button>
                <button
                  type="button"
                  onClick={() => copyText(buildInviteUrl(gameId, activeSession.code), 'link')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 cursor-pointer btn-tactile"
                >
                  {copiedType === 'link' ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                  {copiedType === 'link' ? 'Link Tersalin!' : 'Salin Link Invite'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-300">
                  <Users className="w-3.5 h-3.5 text-emerald-400" /> Pemain di Meja
                </span>
                <span className="font-mono-num">
                  {activeSession.room.players.length} / {activeSession.room.maxPlayers}
                </span>
              </div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {activeSession.room.players.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl bg-slate-900/90 px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-white">
                      {p.name} {p.id === activeSession.playerId ? '(Kamu)' : ''}
                    </span>
                    <span className="text-slate-400">
                      P{p.seatIdx + 1} {p.id === activeSession.room.hostId ? '• Host' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-emerald-400 cursor-pointer btn-tactile"
            >
              {activeSession.room.players.length >= 2 ? 'Masuk ke Meja' : 'Tutup & Tunggu Teman di Meja'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">Nama Guest Kamu</label>
              <input
                type="text"
                value={nameInput}
                maxLength={18}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Contoh: Agus"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-semibold text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 rounded-xl border border-slate-800 bg-slate-950/70 p-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setTab('create');
                  setError(null);
                }}
                className={`py-2 rounded-lg font-bold cursor-pointer transition ${
                  tab === 'create' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Buat Room Baru
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('join');
                  setError(null);
                }}
                className={`py-2 rounded-lg font-bold cursor-pointer transition ${
                  tab === 'join' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Gabung Pakai Kode
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
                {error}
              </div>
            )}

            {tab === 'create' ? (
              <button
                type="button"
                disabled={loading}
                onClick={handleCreate}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 py-2.5 text-sm font-extrabold text-white shadow-lg hover:brightness-110 disabled:opacity-50 cursor-pointer btn-tactile"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Buat Room &amp; Dapatkan Kode
              </button>
            ) : (
              <form onSubmit={handleJoin} className="space-y-3">
                <input
                  type="text"
                  value={codeInput}
                  maxLength={10}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  placeholder="Masukkan Kode (contoh: GS48K2)"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-center text-base font-extrabold font-mono-num tracking-widest text-white uppercase focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer btn-tactile"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                  Gabung ke Room
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
