import React, { useEffect, useRef, useState } from 'react';
import { Check, Coins, Gamepad2, Pencil, PlusCircle, Trophy, User, Volume2, VolumeX } from 'lucide-react';
import { useGameStation } from '../context/GameStationContext';
import type { GameId } from '../types/game';
import { GAMES } from '../data/games';

interface NavbarProps {
  activeGame: GameId | null;
  onSelectHome: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeGame, onSelectHome }) => {
  const { nickname, setNickname, chips, canRefill, refillChips, stats, soundEnabled, toggleSound, sfx } =
    useGameStation();

  const [displayChips, setDisplayChips] = useState(chips);
  const [chipDelta, setChipDelta] = useState<{ id: number; amount: number } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(nickname);
  const prevChipsRef = useRef(chips);
  const displayRef = useRef(chips);

  useEffect(() => {
    setDraftName(nickname);
  }, [nickname]);

  useEffect(() => {
    const prev = prevChipsRef.current;
    if (prev === chips) return;
    const diff = chips - prev;
    prevChipsRef.current = chips;
    setChipDelta({ id: Date.now(), amount: diff });

    const startVal = displayRef.current;
    const startTime = performance.now();
    const duration = 420;
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(startVal + (chips - startVal) * eased);
      displayRef.current = next;
      setDisplayChips(next);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    const hideTimer = window.setTimeout(() => setChipDelta(null), 1300);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(hideTimer);
    };
  }, [chips]);

  const saveDraftName = () => {
    if (draftName.trim()) {
      setNickname(draftName);
      sfx('click');
    } else {
      setDraftName(nickname);
    }
    setEditingName(false);
  };

  const totalWins = Object.values(stats).reduce((sum, s) => sum + s.won, 0);
  const currentTitle = activeGame ? GAMES.find((g) => g.id === activeGame)?.title : null;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#090d16]/85 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              sfx('click');
              onSelectHome();
            }}
            className="flex items-center gap-2 sm:gap-2.5 group cursor-pointer btn-tactile"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-emerald-400 p-[1px] shadow-lg shadow-indigo-500/20 shrink-0">
              <div className="w-full h-full rounded-[11px] bg-slate-950 flex items-center justify-center">
                <Gamepad2 className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-300 group-hover:scale-110 transition-transform" />
              </div>
            </div>
            <div className="text-left min-w-0">
              <span className="font-extrabold text-xs sm:text-base tracking-tight text-white block leading-none truncate">
                GAME STATION
              </span>
              <span className="text-[11px] text-slate-400 hidden sm:block">Arcade &amp; Table Hub</span>
            </div>
          </button>

          {currentTitle && (
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 pl-2 border-l border-slate-800">
              <span>/</span>
              <span className="font-semibold text-indigo-300">{currentTitle}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Guest Nickname Pill */}
          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveDraftName();
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-indigo-500/60 bg-slate-900 px-2 py-1"
            >
              <input
                type="text"
                value={draftName}
                maxLength={18}
                autoFocus
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={saveDraftName}
                className="w-20 sm:w-28 bg-transparent text-xs font-semibold text-white focus:outline-none"
                placeholder="Nama Tamu"
              />
              <button type="submit" className="text-emerald-400 hover:text-emerald-300 cursor-pointer">
                <Check className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                sfx('click');
                setEditingName(true);
              }}
              title="Ubah nama Guest"
              className="inline-flex items-center gap-1 sm:gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-2 sm:px-2.5 py-1 sm:py-1.5 text-xs font-semibold text-slate-200 hover:border-indigo-500/50 hover:text-white transition cursor-pointer btn-tactile"
            >
              <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="max-w-[58px] sm:max-w-[110px] truncate">{nickname}</span>
              <Pencil className="w-3 h-3 text-slate-500 hidden xs:inline" />
            </button>
          )}

          <div className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-slate-200">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-mono-num">{totalWins}</span>
            <span className="text-slate-400">Menang</span>
          </div>

          <div className="relative inline-flex items-center gap-1.5 sm:gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-2 sm:px-3 py-1 sm:py-1.5">
            <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
            <span className="text-xs sm:text-sm font-extrabold font-mono-num text-amber-300">
              {displayChips.toLocaleString('id-ID')}
            </span>
            {canRefill && (
              <button
                type="button"
                onClick={refillChips}
                title="Isi ulang gratis ke 5.000 chip"
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer btn-tactile"
              >
                <PlusCircle className="w-3 h-3" /> Isi
              </button>
            )}

            {chipDelta && (
              <span
                key={chipDelta.id}
                className={`pointer-events-none absolute -bottom-5 right-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold font-mono-num shadow-md animate-chip-float ${
                  chipDelta.amount > 0 ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
                }`}
              >
                {chipDelta.amount > 0
                  ? `+${chipDelta.amount.toLocaleString('id-ID')}`
                  : chipDelta.amount.toLocaleString('id-ID')}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundEnabled ? 'Matikan suara' : 'Nyalakan suara'}
            className="rounded-xl border border-slate-800 bg-slate-900/90 p-2 text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer btn-tactile"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
