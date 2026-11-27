import React, { useState } from 'react';
import { Dices, Globe, Loader2, LogIn, Play, Sparkles, Trophy, X } from 'lucide-react';
import { GAMES } from '../data/games';
import { useGameStation } from '../context/GameStationContext';
import { lookupOnlineRoom } from '../lib/multiplayer';
import type { GameCategory, GameId } from '../types/game';

interface LobbyProps {
  onSelectGame: (id: GameId) => void;
  onStartOnline: (id: GameId) => void;
  onOpenRoom: (id: GameId, code: string) => void;
}

const ONLINE_GAMES = new Set<GameId>(['uno', 'chess', 'carrom', 'billiard']);

const PHOTO_COVERS: Partial<Record<GameId, string>> = {
  uno: '/assets/covers/uno.jpg',
  carrom: '/assets/covers/carrom.jpg',
  billiard: '/assets/covers/billiard.jpg',
};

const GameCoverArtwork: React.FC<{ id: GameId; title: string; subtitle: string; accentFrom: string; accentTo: string }> = ({
  id,
  title,
  subtitle,
  accentFrom,
  accentTo,
}) => {
  const photo = PHOTO_COVERS[id];

  return (
    <div className={`relative h-44 bg-gradient-to-br ${accentFrom} ${accentTo} overflow-hidden`}>
      {photo ? (
        <img
          src={photo}
          alt={title}
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
        />
      ) : id === 'chess' ? (
        <div
          className="absolute inset-0 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform duration-500 ease-out"
          style={{
            backgroundColor: '#261409',
            backgroundImage:
              "radial-gradient(circle at 60% 35%, rgba(251, 191, 36, 0.25), rgba(9, 13, 22, 0.85)), url('/assets/textures/dark_wood.jpg')",
            backgroundSize: 'cover, 240px 240px',
          }}
        >
          <div className="grid grid-cols-4 w-64 h-40 rotate-[-12deg] opacity-65 rounded-xl overflow-hidden border border-amber-400/25 shadow-2xl translate-x-10 translate-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  backgroundImage: (i + Math.floor(i / 4)) % 2 === 0 ? "url('/assets/textures/plywood.jpg')" : "url('/assets/textures/dark_wood.jpg')",
                  backgroundSize: '120px',
                }}
              />
            ))}
          </div>
          <img
            src="/assets/chess/staunty/bQ.svg"
            alt=""
            className="absolute right-16 top-5 w-16 h-16 drop-shadow-[0_10px_14px_rgba(0,0,0,0.7)] opacity-90 -rotate-6"
          />
          <img
            src="/assets/chess/staunty/wK.svg"
            alt=""
            className="absolute right-6 top-6 w-24 h-24 drop-shadow-[0_14px_20px_rgba(0,0,0,0.85)] rotate-6"
          />
          <img
            src="/assets/chess/staunty/wN.svg"
            alt=""
            className="absolute right-24 bottom-4 w-16 h-16 drop-shadow-[0_10px_14px_rgba(0,0,0,0.75)] -rotate-12"
          />
        </div>
      ) : id === 'blackjack' ? (
        <div
          className="absolute inset-0 felt-surface overflow-hidden group-hover:scale-105 transition-transform duration-500 ease-out"
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-black/55 via-transparent to-amber-400/15" />
          {/* Casino chip stacks */}
          <div className="absolute left-6 top-8 flex -space-x-2 opacity-90">
            <div className="w-10 h-10 rounded-full border-2 border-dashed border-amber-200 bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg" />
            <div className="w-10 h-10 rounded-full border-2 border-dashed border-rose-200 bg-gradient-to-br from-rose-500 to-rose-700 shadow-lg translate-y-2" />
          </div>
          {/* Real public domain cards */}
          <img
            src="/assets/cards/ace_of_spades.svg"
            alt=""
            className="absolute right-20 top-4 w-20 h-28 rounded-lg bg-white p-0.5 shadow-2xl -rotate-12 border border-slate-200"
          />
          <img
            src="/assets/cards/king_of_hearts.svg"
            alt=""
            className="absolute right-6 top-5 w-20 h-28 rounded-lg bg-white p-0.5 shadow-2xl rotate-12 border border-slate-200"
          />
        </div>
      ) : (
        <div
          className="absolute inset-0 felt-surface overflow-hidden group-hover:scale-105 transition-transform duration-500 ease-out"
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-black/60 via-transparent to-sky-400/20" />
          <img
            src="/assets/cards/10_of_hearts.svg"
            alt=""
            className="absolute right-28 top-6 w-16 h-24 rounded-lg bg-white p-0.5 shadow-2xl -rotate-15 border border-slate-200"
          />
          <img
            src="/assets/cards/jack_of_hearts.svg"
            alt=""
            className="absolute right-20 top-4 w-16 h-24 rounded-lg bg-white p-0.5 shadow-2xl -rotate-6 border border-slate-200"
          />
          <img
            src="/assets/cards/queen_of_hearts.svg"
            alt=""
            className="absolute right-12 top-3 w-16 h-24 rounded-lg bg-white p-0.5 shadow-2xl rotate-6 border border-slate-200"
          />
          <img
            src="/assets/cards/king_of_hearts.svg"
            alt=""
            className="absolute right-4 top-5 w-16 h-24 rounded-lg bg-white p-0.5 shadow-2xl rotate-15 border border-slate-200"
          />
        </div>
      )}

      {/* Cinematic bottom gradient scrim for clean readable title */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-black/15" />

      <div className="relative z-10 h-full p-4 flex flex-col justify-end">
        <span className="inline-block w-fit px-2.5 py-0.5 rounded-full bg-black/55 border border-white/15 text-[11px] font-bold text-white/95 backdrop-blur-md mb-1.5">
          {subtitle}
        </span>
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-md">{title}</h2>
      </div>
    </div>
  );
};

export const Lobby: React.FC<LobbyProps> = ({ onSelectGame, onStartOnline, onOpenRoom }) => {
  const { stats, chips, sfx } = useGameStation();
  const [category, setCategory] = useState<GameCategory>('all');
  const [joinOpen, setJoinOpen] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const filtered = category === 'all' ? GAMES : GAMES.filter((g) => g.category === category);
  const totalPlayed = Object.values(stats).reduce((sum, s) => sum + s.played, 0);
  const totalWins = Object.values(stats).reduce((sum, s) => sum + s.won, 0);

  const launchRandom = () => {
    sfx('click');
    const pick = GAMES[Math.floor(Math.random() * GAMES.length)];
    onSelectGame(pick.id);
  };

  const handleLookupRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim()) return;
    setJoinError(null);
    setJoining(true);
    try {
      const room = await lookupOnlineRoom(roomCode);
      sfx('click');
      setJoinOpen(false);
      onOpenRoom(room.gameId, room.code);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Room tidak ditemukan.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900/95 via-slate-900/80 to-indigo-950/60 p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
              <Sparkles className="w-3.5 h-3.5" /> Publik • Gratis • Tanpa Login — 6 Game Siap Dimainkan
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-tight">
              Pilih Meja Favoritmu di{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-sky-300 to-emerald-300">
                Game Station
              </span>
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Semua 6 game langsung terbuka untuk publik! Mabar P2P 2–6 pemain bareng teman (UNO, Catur, Karambol,
              Billiard multi-mode) atau atur jumlah musuh AI sesukamu — semua terhubung ke dompet chip virtual.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={launchRandom}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-indigo-500/25 hover:brightness-110 cursor-pointer btn-tactile"
              >
                <Dices className="w-5 h-5" /> Main Acak
              </button>
              <button
                type="button"
                onClick={() => {
                  sfx('click');
                  setJoinError(null);
                  setJoinOpen(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-3 text-sm font-extrabold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer btn-tactile"
              >
                <LogIn className="w-4 h-4" /> Gabung Room
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                <p className="text-[11px] text-slate-400">Main / Menang</p>
                <p className="text-sm font-bold font-mono-num text-white">
                  {totalPlayed} / {totalWins}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
                <p className="text-[11px] text-slate-400">Dompet Chip</p>
                <p className="text-sm font-bold font-mono-num text-amber-300">{chips.toLocaleString('id-ID')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-2xl border border-slate-800 bg-slate-900/80 p-1 text-xs sm:text-sm">
          {(
            [
              ['all', 'Semua Game (6)'],
              ['card', 'Permainan Kartu (3)'],
              ['board', 'Papan & Meja (3)'],
            ] as Array<[GameCategory, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                sfx('click');
                setCategory(key);
              }}
              className={`px-4 py-2 rounded-xl font-bold transition cursor-pointer ${
                category === key ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Game Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((game, idx) => {
          const st = stats[game.id] ?? { played: 0, won: 0 };
          return (
            <div
              key={game.id}
              style={{ animationDelay: `${idx * 45}ms` }}
              className="group relative rounded-3xl border border-slate-800/90 bg-slate-900/75 hover:border-slate-500/70 hover:-translate-y-1.5 hover:shadow-indigo-500/10 transition-all duration-200 overflow-hidden flex flex-col justify-between shadow-xl animate-pop-in"
            >
              <GameCoverArtwork
                id={game.id}
                title={game.title}
                subtitle={game.subtitle}
                accentFrom={game.accentFrom}
                accentTo={game.accentTo}
              />

              <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{game.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {game.modes.map((m) => (
                      <span
                        key={m}
                        className={`px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${game.badgeColor}`}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                  <div className="text-xs text-slate-400 space-y-0.5">
                    <div className="flex items-center gap-1 text-amber-300 font-semibold">
                      <Trophy className="w-3.5 h-3.5" /> {game.rewardText}
                    </div>
                    <div className="font-mono-num text-[11px]">
                      Rekor: {st.won}M / {st.played}G
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {ONLINE_GAMES.has(game.id) && (
                      <button
                        type="button"
                        onClick={() => {
                          sfx('click');
                          onStartOnline(game.id);
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-emerald-400/50 bg-emerald-500/15 px-3 py-2 text-xs font-extrabold text-emerald-200 hover:bg-emerald-500/25 btn-tactile cursor-pointer"
                      >
                        <Globe className="w-3.5 h-3.5" /> Mabar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        sfx('click');
                        onSelectGame(game.id);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs sm:text-sm font-extrabold text-slate-950 hover:bg-indigo-100 btn-tactile cursor-pointer shadow"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> {ONLINE_GAMES.has(game.id) ? 'Main' : 'Mainkan'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <footer className="pt-4 pb-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>Game Station — Siap dibagikan &amp; dimainkan di browser desktop maupun HP.</span>
        <span>Aset Publik: Poly Haven (CC0) • Vector Playing Cards (Public Domain) • Lichess Staunty &amp; Audio</span>
      </footer>

      {joinOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setJoinOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-white">Gabung Room Teman</h3>
              <button
                type="button"
                onClick={() => setJoinOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Masukkan kode room (misal <span className="font-mono-num text-slate-200">GS48K2</span>) untuk langsung masuk ke meja Catur, UNO, Karambol, atau Billiard.
            </p>
            <form onSubmit={handleLookupRoom} className="space-y-3">
              <input
                type="text"
                value={roomCode}
                maxLength={10}
                autoFocus
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Kode Room..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-center text-base font-extrabold font-mono-num tracking-widest text-white uppercase focus:border-indigo-500 focus:outline-none"
              />
              {joinError && <p className="text-xs text-rose-400">{joinError}</p>}
              <button
                type="submit"
                disabled={joining}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 cursor-pointer btn-tactile"
              >
                {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                Cari &amp; Masuk Room
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
