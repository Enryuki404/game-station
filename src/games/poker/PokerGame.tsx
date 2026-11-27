import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Coins, Trophy } from 'lucide-react';
import { ConfettiBurst } from '../../components/ConfettiBurst';
import { GameShell } from '../../components/GameShell';
import { PlayingCard } from '../../components/PlayingCard';
import { useGameStation } from '../../context/GameStationContext';
import {
  applyPokerAction,
  createPokerHand,
  decidePokerAiAction,
  type PokerState,
} from './pokerEngine';
import { evaluateBestHand } from './pokerEvaluator';

interface PokerGameProps {
  onBack: () => void;
}

export const PokerGame: React.FC<PokerGameProps> = ({ onBack }) => {
  const { chips, addChips, spendChips, refillChips, canRefill, recordGame, sfx } = useGameStation();
  const [stakes, setStakes] = useState<'low' | 'high'>('low');
  const [aiCount, setAiCount] = useState<number>(3);
  const sb = stakes === 'low' ? 25 : 100;
  const bb = stakes === 'low' ? 50 : 200;

  const [state, setState] = useState<PokerState>(() =>
    createPokerHand(Math.max(chips, 0), null, 0, 25, 50, 3)
  );
  const [raiseSlider, setRaiseSlider] = useState(100);
  const [confettiKey, setConfettiKey] = useState(0);
  const syncedShowdownRef = useRef(false);
  const initialChipsRef = useRef(chips);

  const syncHumanDelta = useCallback(
    (nextState: PokerState) => {
      const human = nextState.players[0];
      const delta = human.chips - chips;
      if (delta > 0) addChips(delta);
      else if (delta < 0) spendChips(Math.abs(delta));
    },
    [addChips, chips, spendChips]
  );

  // Start new hand cleanly
  const startNewHand = useCallback(
    (nextStakes: 'low' | 'high' = stakes, nextAiCount: number = aiCount) => {
      const nextSb = nextStakes === 'low' ? 25 : 100;
      const nextBb = nextStakes === 'low' ? 50 : 200;
      const nextDealer = (state.dealerIdx + 1) % (nextAiCount + 1);
      syncedShowdownRef.current = false;
      initialChipsRef.current = chips;
      const hand = createPokerHand(chips, state.players, nextDealer, nextSb, nextBb, nextAiCount);
      setState(hand);
      setRaiseSlider(hand.currentBet + hand.minRaise);
      sfx('card');
    },
    [aiCount, chips, sfx, stakes, state.dealerIdx, state.players]
  );

  // Sync wallet & stats on showdown
  useEffect(() => {
    if (state.street === 'showdown' && !syncedShowdownRef.current) {
      syncedShowdownRef.current = true;
      syncHumanDelta(state);
      const humanWon = state.winners.some((w) => w.playerId === 'human');
      recordGame('poker', humanWon);
      if (humanWon) {
        setConfettiKey((k) => k + 1);
        sfx('win');
      } else {
        sfx('lose');
      }
    }
  }, [state, recordGame, sfx, syncHumanDelta]);

  // Keep raise slider bounded when turn returns to human
  useEffect(() => {
    if (state.turnIdx === 0) {
      const human = state.players[0];
      const minTo = Math.min(human.betThisStreet + human.chips, state.currentBet + state.minRaise);
      setRaiseSlider(minTo);
    }
  }, [state.turnIdx, state.currentBet, state.minRaise, state.players]);

  // AI Turn loop
  useEffect(() => {
    if (state.street === 'showdown' || state.turnIdx <= 0) return;

    const timer = window.setTimeout(() => {
      const decision = decidePokerAiAction(state);
      if (decision.type === 'raise') sfx('chip');
      else if (decision.type === 'call') sfx('click');
      else sfx('card');
      setState((prev) => applyPokerAction(prev, decision));
    }, 780);

    return () => window.clearTimeout(timer);
  }, [state, sfx]);

  const human = state.players[0];
  const aiPlayers = state.players.slice(1);
  const isHumanTurn = state.street !== 'showdown' && state.turnIdx === 0;
  const toCall = Math.max(0, state.currentBet - human.betThisStreet);
  const maxHumanTotal = human.betThisStreet + human.chips;
  const minRaiseTotal = Math.min(maxHumanTotal, state.currentBet + state.minRaise);

  const liveEval =
    !human.folded && human.cards.length === 2
      ? evaluateBestHand([...human.cards, ...state.community])
      : null;

  const handleHumanAction = (action: { type: 'fold' | 'call' | 'raise'; raiseTo?: number }) => {
    if (!isHumanTurn) return;
    if (action.type === 'raise') sfx('chip');
    else if (action.type === 'call') sfx('click');
    else sfx('card');

    setState((prev) => applyPokerAction(prev, action));
  };

  return (
    <GameShell
      title="Texas Hold'em Poker"
      subtitle={`Meja ${aiCount + 1} pemain melawan ${aiCount} AI — Blind ${sb}/${bb}`}
      onBack={() => {
        if (state.street !== 'showdown') syncHumanDelta(state);
        onBack();
      }}
      onRestart={() => startNewHand()}
      controls={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-700 bg-slate-800/80 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => {
                sfx('click');
                setStakes('low');
                startNewHand('low', aiCount);
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                stakes === 'low' ? 'bg-indigo-600 text-white' : 'text-slate-300'
              }`}
            >
              Blind 25/50
            </button>
            <button
              type="button"
              onClick={() => {
                sfx('click');
                setStakes('high');
                startNewHand('high', aiCount);
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                stakes === 'high' ? 'bg-indigo-600 text-white' : 'text-slate-300'
              }`}
            >
              Blind 100/200
            </button>
          </div>
          <div className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-xs">
            <span className="text-slate-400 font-semibold pr-1">Musuh AI:</span>
            {[1, 2, 3, 4, 5].map((cnt) => (
              <button
                key={cnt}
                type="button"
                onClick={() => {
                  sfx('click');
                  setAiCount(cnt);
                  startNewHand(stakes, cnt);
                }}
                className={`px-2 py-1 rounded-lg font-bold cursor-pointer ${
                  aiCount === cnt ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                {cnt}
              </button>
            ))}
          </div>
        </div>
      }
      rules={[
        'Setiap pemain mendapat 2 kartu tertutup (Hole Cards) dan berbagi 5 kartu meja (Community Cards) melalui Flop, Turn, dan River.',
        'Kombinasikan 5 kartu terbaik dari total 7 kartu (Royal Flush tertinggi hingga High Card terendah).',
        'Tombol "D" menandakan Dealer yang berputar setiap ronde; dua pemain di sebelahnya memasang Small Blind dan Big Blind.',
        'Saldo chip Poker terhubung langsung dengan Dompet Chip Game Station.',
      ]}
    >
      <div className="space-y-4">
        {/* AI Seats */}
        <div
          className={`grid gap-2 sm:gap-3 ${
            aiPlayers.length === 1
              ? 'grid-cols-1 max-w-md mx-auto'
              : aiPlayers.length === 2
                ? 'grid-cols-2'
                : aiPlayers.length === 3
                  ? 'grid-cols-2 sm:grid-cols-3'
                  : aiPlayers.length === 4
                    ? 'grid-cols-2 lg:grid-cols-4'
                    : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5'
          }`}
        >
          {aiPlayers.map((ai, i) => {
            const seatIdx = i + 1;
            const active = state.turnIdx === seatIdx && state.street !== 'showdown';
            const isWinner = state.winners.some((w) => w.playerId === ai.id);
            const showCards = state.street === 'showdown' && !ai.folded;
            return (
              <div
                key={ai.id}
                className={`rounded-xl sm:rounded-2xl border p-2.5 sm:p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 overflow-hidden min-w-0 transition ${
                  isWinner
                    ? 'border-amber-400 bg-amber-500/15'
                    : active
                      ? 'border-emerald-400/70 bg-emerald-500/10'
                      : 'border-slate-800 bg-slate-900/75'
                } ${ai.folded ? 'opacity-50' : ''}`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-white truncate">{ai.name}</span>
                    {state.dealerIdx === seatIdx && (
                      <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black flex items-center justify-center">
                        D
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono-num text-amber-300">{ai.chips.toLocaleString('id-ID')} chip</p>
                  {active ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-[11px] font-semibold text-emerald-200">
                      Berpikir
                      <span className="inline-flex gap-0.5">
                        <span className="w-1 h-1 rounded-full bg-emerald-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 rounded-full bg-emerald-300 animate-bounce" style={{ animationDelay: '120ms' }} />
                        <span className="w-1 h-1 rounded-full bg-emerald-300 animate-bounce" style={{ animationDelay: '240ms' }} />
                      </span>
                    </span>
                  ) : (
                    ai.lastAction && (
                      <span className="inline-block px-2 py-0.5 rounded-md bg-slate-800 text-[11px] font-semibold text-slate-200">
                        {ai.lastAction}
                      </span>
                    )
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {ai.cards.map((c, cIdx) => (
                    <PlayingCard
                      key={`${c.id}-${showCards ? 'show' : 'hide'}`}
                      card={c}
                      faceDown={!showCards}
                      flipReveal={showCards}
                      size="sm"
                      highlighted={isWinner}
                      dealDelayMs={cIdx * 80}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Poker Table Felt */}
        <div className="felt-surface rounded-2xl sm:rounded-3xl border border-emerald-700/50 p-3.5 sm:p-8 flex flex-col items-center gap-4 sm:gap-5 shadow-2xl">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <span
              key={state.pot}
              className="inline-flex items-center gap-2 rounded-full bg-black/45 border border-amber-400/35 px-4 py-1.5 text-sm font-extrabold font-mono-num text-amber-300 animate-pot-pulse"
            >
              <Coins className="w-4 h-4" /> POT: {state.pot.toLocaleString('id-ID')}
            </span>
            <span className="rounded-full bg-black/35 border border-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-200">
              {state.street}
            </span>
          </div>

          {/* Community Cards */}
          <div className="flex items-center justify-center gap-1.5 sm:gap-3 flex-wrap min-h-[86px] sm:min-h-[100px]">
            {Array.from({ length: 5 }).map((_, idx) => {
              const card = state.community[idx];
              return card ? (
                <PlayingCard key={card.id} card={card} size="md" dealDelayMs={idx * 75} />
              ) : (
                <div
                  key={idx}
                  className="w-12 h-[68px] sm:w-16 sm:h-[92px] rounded-xl border-2 border-dashed border-emerald-300/20 bg-black/15"
                />
              );
            })}
          </div>

          <p className="text-center text-xs sm:text-sm font-semibold text-emerald-100 bg-black/35 px-4 py-1.5 rounded-full">
            {state.status}
          </p>
        </div>

        {/* Human Seat & Controls */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {human.cards.map((c) => (
                  <PlayingCard
                    key={c.id}
                    card={c}
                    size="md"
                    dimmed={human.folded}
                    highlighted={state.winners.some((w) => w.playerId === 'human')}
                  />
                ))}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">Kamu</span>
                  {state.dealerIdx === 0 && (
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black flex items-center justify-center">
                      D
                    </span>
                  )}
                </div>
                <p className="text-sm font-mono-num font-bold text-amber-300">
                  {human.chips.toLocaleString('id-ID')} chip
                </p>
                {liveEval && (
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-xs font-bold text-indigo-200">
                    {liveEval.name}
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {isHumanTurn && (
              <div className="flex flex-col items-stretch sm:items-end gap-2.5 flex-1 w-full sm:w-auto sm:min-w-[260px]">
                <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleHumanAction({ type: 'fold' })}
                    className="rounded-xl bg-rose-600/85 px-4 py-2 text-xs sm:text-sm font-bold text-white hover:bg-rose-500 cursor-pointer"
                  >
                    Fold
                  </button>
                  <button
                    type="button"
                    onClick={() => handleHumanAction({ type: 'call' })}
                    className="rounded-xl bg-emerald-500 px-5 py-2 text-xs sm:text-sm font-extrabold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                  >
                    {toCall === 0 ? 'Check' : `Call ${Math.min(human.chips, toCall)}`}
                  </button>
                  {human.chips > toCall && (
                    <button
                      type="button"
                      onClick={() => handleHumanAction({ type: 'raise', raiseTo: raiseSlider })}
                      className="rounded-xl bg-amber-400 px-5 py-2 text-xs sm:text-sm font-extrabold text-slate-950 hover:bg-amber-300 cursor-pointer"
                    >
                      {raiseSlider >= maxHumanTotal ? `All-In ${maxHumanTotal}` : `Raise ke ${raiseSlider}`}
                    </button>
                  )}
                </div>

                {human.chips > toCall && (
                  <div className="flex flex-wrap items-center justify-end gap-2 w-full max-w-md">
                    <input
                      type="range"
                      min={minRaiseTotal}
                      max={maxHumanTotal}
                      step={25}
                      value={Math.max(minRaiseTotal, Math.min(maxHumanTotal, raiseSlider))}
                      onChange={(e) => setRaiseSlider(Number(e.target.value))}
                      className="flex-1 min-w-[120px] accent-amber-400 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => setRaiseSlider(minRaiseTotal)}
                      className="px-2 py-1 rounded-lg bg-slate-800 text-[11px] font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
                    >
                      Min
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRaiseSlider(
                          Math.min(maxHumanTotal, Math.max(minRaiseTotal, state.currentBet + Math.floor(state.pot / 2)))
                        )
                      }
                      className="px-2 py-1 rounded-lg bg-slate-800 text-[11px] font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
                    >
                      ½ Pot
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRaiseSlider(Math.min(maxHumanTotal, Math.max(minRaiseTotal, state.currentBet + state.pot)))
                      }
                      className="px-2 py-1 rounded-lg bg-slate-800 text-[11px] font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
                    >
                      Pot
                    </button>
                    <button
                      type="button"
                      onClick={() => setRaiseSlider(maxHumanTotal)}
                      className="px-2 py-1 rounded-lg bg-amber-500/20 text-[11px] font-bold text-amber-300 hover:bg-amber-500/30 cursor-pointer"
                    >
                      All-In
                    </button>
                  </div>
                )}
              </div>
            )}

            {state.street === 'showdown' && (
              <div className="flex items-center gap-2">
                {canRefill && (
                  <button
                    type="button"
                    onClick={refillChips}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer"
                  >
                    + Isi Ulang Chip Gratis
                  </button>
                )}
                <button
                  type="button"
                  disabled={chips <= 0}
                  onClick={() => startNewHand()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-indigo-500 disabled:opacity-40 cursor-pointer"
                >
                  <Trophy className="w-4 h-4" /> Ronde Berikutnya
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfettiBurst trigger={confettiKey} />
    </GameShell>
  );
};
