import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Coins, Layers, Plus, RotateCcw } from 'lucide-react';
import { ConfettiBurst } from '../../components/ConfettiBurst';
import { GameShell } from '../../components/GameShell';
import { PlayingCard } from '../../components/PlayingCard';
import { useGameStation } from '../../context/GameStationContext';
import type { Card } from '../../lib/cards';
import {
  canSplitHand,
  createShoe,
  evaluateBlackjackHand,
  type BlackjackHand,
} from './blackjackEngine';

interface BlackjackGameProps {
  onBack: () => void;
}

type Phase = 'betting' | 'player' | 'dealer' | 'settled';

const CHIP_DENOMS = [50, 100, 250, 500, 1000] as const;
const CHIP_COLORS: Record<number, string> = {
  50: 'from-rose-500 to-rose-700 border-rose-300',
  100: 'from-slate-700 to-slate-900 border-slate-300',
  250: 'from-emerald-500 to-emerald-700 border-emerald-300',
  500: 'from-indigo-500 to-indigo-700 border-indigo-300',
  1000: 'from-amber-400 to-amber-600 border-amber-200 text-slate-950',
};

export const BlackjackGame: React.FC<BlackjackGameProps> = ({ onBack }) => {
  const { chips, addChips, spendChips, refillChips, canRefill, recordGame, sfx } = useGameStation();
  const shoeRef = useRef<Card[]>(createShoe(6));
  const dealerTimerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>('betting');
  const [stagedBet, setStagedBet] = useState(100);
  const [lastBet, setLastBet] = useState(100);
  const [dealerCards, setDealerCards] = useState<Card[]>([]);
  const [hands, setHands] = useState<BlackjackHand[]>([]);
  const [activeHandIdx, setActiveHandIdx] = useState(0);
  const [banner, setBanner] = useState('Pasang taruhanmu lalu tekan Deal!');
  const [confettiKey, setConfettiKey] = useState(0);

  const drawCard = useCallback((): Card => {
    if (shoeRef.current.length < 78) {
      shoeRef.current = createShoe(6);
    }
    return shoeRef.current.pop()!;
  }, []);

  useEffect(() => {
    return () => {
      if (dealerTimerRef.current !== null) window.clearTimeout(dealerTimerRef.current);
    };
  }, []);

  const settleHands = useCallback(
    (finalHands: BlackjackHand[], finalDealer: Card[]) => {
      const dealerEval = evaluateBlackjackHand(finalDealer);
      let totalReturn = 0;
      let anyWin = false;

      const settled: BlackjackHand[] = finalHands.map((h) => {
        const pEval = evaluateBlackjackHand(h.cards);
        let result: BlackjackHand['result'] = 'lose';
        let payout = 0;

        if (pEval.isBust) {
          result = 'lose';
          payout = 0;
        } else if (h.isBlackjack && !dealerEval.isNaturalBlackjack) {
          result = 'blackjack';
          payout = Math.floor(h.bet * 2.5); // 3:2 payout + original bet
          anyWin = true;
        } else if (dealerEval.isNaturalBlackjack && !h.isBlackjack) {
          result = 'lose';
          payout = 0;
        } else if (dealerEval.isBust) {
          result = 'win';
          payout = h.bet * 2;
          anyWin = true;
        } else if (pEval.total > dealerEval.total) {
          result = 'win';
          payout = h.bet * 2;
          anyWin = true;
        } else if (pEval.total === dealerEval.total) {
          result = 'push';
          payout = h.bet;
        } else {
          result = 'lose';
          payout = 0;
        }

        totalReturn += payout;
        return { ...h, result, payout };
      });

      if (totalReturn > 0) addChips(totalReturn);
      recordGame('blackjack', anyWin);
      if (anyWin) {
        setConfettiKey((k) => k + 1);
        sfx('win');
      } else if (settled.every((h) => h.result === 'lose')) {
        sfx('lose');
      } else {
        sfx('chip');
      }

      setHands(settled);
      setPhase('settled');

      const totalBet = settled.reduce((s, h) => s + h.bet, 0);
      const net = totalReturn - totalBet;
      if (net > 0) setBanner(`Menang! Kamu menerima +${net.toLocaleString('id-ID')} chip bersih.`);
      else if (net === 0) setBanner('Seri (Push) — taruhan dikembalikan.');
      else setBanner(`Dealer menang ronde ini (${net.toLocaleString('id-ID')} chip).`);
    },
    [addChips, recordGame, sfx]
  );

  const runDealerTurn = useCallback(
    (currentHands: BlackjackHand[], currentDealer: Card[]) => {
      const allBusted = currentHands.every((h) => evaluateBlackjackHand(h.cards).isBust);
      if (allBusted) {
        settleHands(currentHands, currentDealer);
        return;
      }

      setPhase('dealer');
      setBanner('Giliran Dealer membuka kartu...');

      const stepDealer = (dCards: Card[]) => {
        const evalD = evaluateBlackjackHand(dCards);
        if (evalD.total < 17) {
          dealerTimerRef.current = window.setTimeout(() => {
            sfx('card');
            const nextD = [...dCards, drawCard()];
            setDealerCards(nextD);
            stepDealer(nextD);
          }, 520);
        } else {
          dealerTimerRef.current = window.setTimeout(() => {
            settleHands(currentHands, dCards);
          }, 350);
        }
      };

      stepDealer(currentDealer);
    },
    [drawCard, settleHands, sfx]
  );

  const startDeal = (betAmount = stagedBet) => {
    if (betAmount <= 0 || betAmount > chips) return;
    if (!spendChips(betAmount)) return;

    sfx('card');
    setStagedBet(betAmount);
    setLastBet(betAmount);

    const p1 = drawCard();
    const d1 = drawCard();
    const p2 = drawCard();
    const d2 = drawCard();

    const pCards = [p1, p2];
    const dCards = [d1, d2];
    const pEval = evaluateBlackjackHand(pCards);
    const dEval = evaluateBlackjackHand(dCards);

    const initialHand: BlackjackHand = {
      cards: pCards,
      bet: betAmount,
      stood: pEval.isNaturalBlackjack,
      busted: false,
      doubled: false,
      isBlackjack: pEval.isNaturalBlackjack,
    };

    setDealerCards(dCards);
    setHands([initialHand]);
    setActiveHandIdx(0);

    if (pEval.isNaturalBlackjack || dEval.isNaturalBlackjack) {
      settleHands([initialHand], dCards);
    } else {
      setPhase('player');
      setBanner('Pilih Hit, Stand, Double Down, atau Split.');
    }
  };

  const advanceOrDealer = (updatedHands: BlackjackHand[], currIdx: number) => {
    if (currIdx + 1 < updatedHands.length) {
      setActiveHandIdx(currIdx + 1);
      setBanner(`Lanjut ke Tangan #${currIdx + 2}`);
    } else {
      runDealerTurn(updatedHands, dealerCards);
    }
  };

  const handleHit = () => {
    if (phase !== 'player') return;
    sfx('card');
    const updated = hands.map((h, i) => {
      if (i !== activeHandIdx) return h;
      const nextCards = [...h.cards, drawCard()];
      const ev = evaluateBlackjackHand(nextCards);
      return {
        ...h,
        cards: nextCards,
        busted: ev.isBust,
        stood: ev.total === 21,
      };
    });
    setHands(updated);

    const active = updated[activeHandIdx];
    if (active.busted || active.stood) {
      advanceOrDealer(updated, activeHandIdx);
    }
  };

  const handleStand = () => {
    if (phase !== 'player') return;
    sfx('click');
    const updated = hands.map((h, i) => (i === activeHandIdx ? { ...h, stood: true } : h));
    setHands(updated);
    advanceOrDealer(updated, activeHandIdx);
  };

  const handleDouble = () => {
    if (phase !== 'player') return;
    const active = hands[activeHandIdx];
    if (!active || active.cards.length !== 2 || chips < active.bet) return;
    if (!spendChips(active.bet)) return;

    sfx('chip');
    const updated = hands.map((h, i) => {
      if (i !== activeHandIdx) return h;
      const nextCards = [...h.cards, drawCard()];
      const ev = evaluateBlackjackHand(nextCards);
      return {
        ...h,
        cards: nextCards,
        bet: h.bet * 2,
        doubled: true,
        stood: !ev.isBust,
        busted: ev.isBust,
      };
    });
    setHands(updated);
    advanceOrDealer(updated, activeHandIdx);
  };

  const handleSplit = () => {
    if (phase !== 'player') return;
    const active = hands[activeHandIdx];
    if (!active || !canSplitHand(active, hands.length, chips)) return;
    if (!spendChips(active.bet)) return;

    sfx('card');
    const h1: BlackjackHand = {
      cards: [active.cards[0], drawCard()],
      bet: active.bet,
      stood: false,
      busted: false,
      doubled: false,
      isBlackjack: false,
    };
    const h2: BlackjackHand = {
      cards: [active.cards[1], drawCard()],
      bet: active.bet,
      stood: false,
      busted: false,
      doubled: false,
      isBlackjack: false,
    };
    setHands([h1, h2]);
    setActiveHandIdx(0);
    setBanner('Kartu di-Split! Mainkan Tangan #1.');
  };

  const startNextRound = () => {
    sfx('click');
    setDealerCards([]);
    setHands([]);
    setPhase('betting');
    setStagedBet((prev) => Math.min(Math.max(50, lastBet || prev), Math.max(chips, 0)));
    setBanner('Pasang taruhanmu lalu tekan Deal!');
  };

  const dealerHidden = phase === 'player';
  const dealerShownCards = dealerHidden ? dealerCards.slice(0, 1) : dealerCards;
  const dealerShownEval = evaluateBlackjackHand(dealerShownCards);
  const currentHand = hands[activeHandIdx];

  return (
    <GameShell
      title="Blackjack 21"
      subtitle="Dek 6-shoe klasik — Blackjack bayar 3:2, Dealer berhenti di 17"
      onBack={onBack}
      onRestart={startNextRound}
      rules={[
        'Tujuan Blackjack adalah mendapatkan total nilai kartu sedekat mungkin dengan 21 tanpa melebihinya (Bust).',
        'Kartu 2–10 bernilai sesuai angka, J/Q/K bernilai 10, dan As (A) bernilai 1 atau 11 secara otomatis.',
        'Natural Blackjack (As + kartu bernilai 10 pada 2 kartu awal) membayar 3:2.',
        'Double Down menggandakan taruhan dan memberi tepat 1 kartu tambahan; Split memisahkan 2 kartu bernilai sama menjadi 2 tangan.',
        'Dealer wajib mengambil kartu hingga total minimal 17.',
      ]}
    >
      <div className="felt-surface rounded-2xl sm:rounded-3xl border border-emerald-700/50 p-3 sm:p-8 shadow-2xl space-y-4 sm:space-y-6">
        {/* Dealer Section */}
        <div className="flex flex-col items-center gap-3 min-h-[145px]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-200/80">Dealer</span>
            {dealerCards.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-black/40 border border-white/15 text-xs font-mono-num font-bold text-white">
                {dealerHidden ? `${dealerShownEval.total} + ?` : dealerShownEval.total}
              </span>
            )}
          </div>

          <div className="flex items-center justify-center gap-2.5 flex-wrap">
            {dealerCards.length === 0 ? (
              <div className="h-[92px] flex items-center text-sm text-emerald-200/60">Menunggu taruhan...</div>
            ) : (
              dealerCards.map((card, i) => (
                <PlayingCard
                  key={`${card.id}-${i === 1 && !dealerHidden ? 'open' : 'c'}`}
                  card={card}
                  faceDown={dealerHidden && i === 1}
                  flipReveal={i === 1 && !dealerHidden}
                  size="md"
                  dealDelayMs={i < 2 ? i * 90 : 0}
                />
              ))
            )}
          </div>
        </div>

        {/* Status Banner */}
        <div className="flex justify-center">
          <div className="rounded-full bg-black/45 border border-white/15 px-5 py-2 text-xs sm:text-sm font-semibold text-amber-200 text-center">
            {banner}
          </div>
        </div>

        {/* Player Hands */}
        {hands.length > 0 && (
          <div className={`grid gap-4 ${hands.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            {hands.map((hand, idx) => {
              const ev = evaluateBlackjackHand(hand.cards);
              const isCurrent = phase === 'player' && idx === activeHandIdx;
              return (
                <div
                  key={idx}
                  className={`rounded-2xl border p-4 flex flex-col items-center gap-3 transition ${
                    isCurrent
                      ? 'border-amber-400 bg-black/30 shadow-lg shadow-amber-500/15'
                      : 'border-white/10 bg-black/20'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold text-white">
                      {hands.length > 1 ? `Tangan #${idx + 1}` : 'Kartumu'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-900/80 text-emerald-300 font-mono-num font-bold">
                      {ev.total}
                      {ev.isSoft ? ' (Soft)' : ''}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono-num font-semibold">
                      Taruhan: {hand.bet}
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {hand.cards.map((c, cIdx) => (
                      <PlayingCard
                        key={c.id}
                        card={c}
                        size="md"
                        highlighted={isCurrent}
                        dealDelayMs={cIdx < 2 ? cIdx * 90 : 0}
                      />
                    ))}
                  </div>

                  {hand.result && (
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                        hand.result === 'win' || hand.result === 'blackjack'
                          ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/50'
                          : hand.result === 'push'
                            ? 'bg-slate-600/40 text-slate-200 border border-slate-400/40'
                            : 'bg-rose-500/25 text-rose-200 border border-rose-400/50'
                      }`}
                    >
                      {hand.result === 'blackjack'
                        ? 'BLACKJACK!'
                        : hand.result === 'win'
                          ? 'MENANG'
                          : hand.result === 'push'
                            ? 'SERI (PUSH)'
                            : hand.busted
                              ? 'BUST'
                              : 'KALAH'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Controls */}
        {phase === 'betting' && (
          <div className="rounded-2xl border border-white/10 bg-black/35 p-3 sm:p-4 space-y-3 sm:space-y-4">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
              {CHIP_DENOMS.map((denom) => (
                <button
                  key={denom}
                  type="button"
                  disabled={stagedBet + denom > chips}
                  onClick={() => {
                    sfx('chip');
                    setStagedBet((b) => Math.min(chips, b + denom));
                  }}
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-dashed bg-gradient-to-br ${CHIP_COLORS[denom]} font-mono-num text-[11px] sm:text-xs font-extrabold shadow-lg hover:scale-105 disabled:opacity-35 btn-tactile cursor-pointer`}
                >
                  +{denom}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                <span className="text-sm text-slate-300">Taruhan:</span>
                <span className="text-lg font-extrabold font-mono-num text-amber-300">
                  {stagedBet.toLocaleString('id-ID')}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canRefill && (
                  <button
                    type="button"
                    onClick={refillChips}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer"
                  >
                    + Isi Ulang Chip Gratis
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStagedBet(0)}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Reset
                </button>
                <button
                  type="button"
                  disabled={chips <= 0}
                  onClick={() => {
                    sfx('chip');
                    setStagedBet(chips);
                  }}
                  className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/25 disabled:opacity-40 cursor-pointer"
                >
                  All-In
                </button>
                <button
                  type="button"
                  disabled={stagedBet <= 0 || stagedBet > chips}
                  onClick={() => startDeal()}
                  className="rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2 text-sm font-extrabold text-slate-950 shadow-lg hover:brightness-110 disabled:opacity-40 btn-tactile cursor-pointer"
                >
                  Deal Kartu
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === 'player' && currentHand && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleHit}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-extrabold text-slate-950 shadow-lg hover:bg-emerald-400 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Hit
            </button>
            <button
              type="button"
              onClick={handleStand}
              className="rounded-xl bg-slate-200 px-5 py-2.5 text-sm font-extrabold text-slate-900 shadow-lg hover:bg-white cursor-pointer"
            >
              Stand
            </button>
            <button
              type="button"
              disabled={currentHand.cards.length !== 2 || chips < currentHand.bet}
              onClick={handleDouble}
              className="rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-extrabold text-slate-950 shadow-lg hover:bg-amber-300 disabled:opacity-35 cursor-pointer"
            >
              Double Down
            </button>
            {canSplitHand(currentHand, hands.length, chips) && (
              <button
                type="button"
                onClick={handleSplit}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-extrabold text-white shadow-lg hover:bg-indigo-400 cursor-pointer"
              >
                <Layers className="w-4 h-4" /> Split
              </button>
            )}
          </div>
        )}

        {phase === 'settled' && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {lastBet > 0 && lastBet <= chips && (
              <button
                type="button"
                onClick={() => startDeal(lastBet)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 text-sm font-extrabold text-slate-950 shadow-lg hover:brightness-110 btn-tactile cursor-pointer"
              >
                <Coins className="w-4 h-4" /> Taruhan Sama ({lastBet}) &amp; Deal
              </button>
            )}
            <button
              type="button"
              onClick={startNextRound}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-extrabold text-white shadow-lg hover:bg-indigo-500 btn-tactile cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" /> Atur Taruhan Baru
            </button>
          </div>
        )}
      </div>
      <ConfettiBurst trigger={confettiKey} />
    </GameShell>
  );
};
