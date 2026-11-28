import type { GameMeta } from '../types/game';

export const GAMES: GameMeta[] = [
  {
    id: 'uno',
    title: 'LAST ONE!',
    subtitle: 'Pesta Kartu 2–6 Pemain',
    category: 'card',
    modes: ['Online 2–6P', 'vs 1–5 AI'],
    description:
      'Cocokkan warna atau angka, lempar +2/+4 dan Skip, lalu teriak LAST ONE! saat kartu tersisa satu.',
    accentFrom: 'from-rose-500',
    accentTo: 'to-amber-500',
    badgeColor: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    rewardText: '+500 Chip / Menang',
  },
  {
    id: 'chess',
    title: 'Catur Master',
    subtitle: 'Strategi Papan Klasik',
    category: 'board',
    modes: ['Online 1v1', 'vs AI (3 Level)'],
    description:
      'Aturan catur penuh termasuk Rokade, En Passant, dan Promosi Pion melawan AI Minimax atau teman secara online.',
    accentFrom: 'from-indigo-500',
    accentTo: 'to-cyan-500',
    badgeColor: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    rewardText: '+600 Chip / Menang',
  },
  {
    id: 'carrom',
    title: 'Karambol Pro',
    subtitle: 'Fisika Papan Kayu Statis',
    category: 'board',
    modes: ['Online 2–4P', '4P (2v2)', 'vs 1–3 AI'],
    description:
      'Papan statis tanpa putar! Geser striker di garis awal, tarik bidikan ketapel, dan cover Ratu Merah.',
    accentFrom: 'from-amber-500',
    accentTo: 'to-orange-600',
    badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    rewardText: '+500 Chip / Menang',
  },
  {
    id: 'billiard',
    title: 'Billiard Pro',
    subtitle: '8-Ball, 9-Ball, 15-Point & Cutthroat',
    category: 'board',
    modes: ['Online 2–4P', '4 Mode Pool', 'vs 1–3 AI'],
    description:
      'Pilih mode 8-Ball, 9-Ball Diamond, 15-Ball Point, atau Cutthroat 3P dengan panduan ghost-ball presisi.',
    accentFrom: 'from-emerald-500',
    accentTo: 'to-teal-600',
    badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    rewardText: '+600 Chip / Menang',
  },
  {
    id: 'blackjack',
    title: 'Blackjack 21',
    subtitle: 'Kasino 6-Deck Shoe',
    category: 'card',
    modes: ['Solo vs Dealer'],
    description:
      'Dekati angka 21 tanpa bust! Tersedia fitur Hit, Stand, Double Down, Split Pair, dan bayaran Blackjack 3:2.',
    accentFrom: 'from-violet-500',
    accentTo: 'to-fuchsia-600',
    badgeColor: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    rewardText: 'Bayaran hingga 3:2',
  },
  {
    id: 'poker',
    title: "Texas Hold'em Poker",
    subtitle: 'Meja 2–6 Pemain & AI',
    category: 'card',
    modes: ['vs 1–5 AI', 'Blind 25/50', 'Blind 100/200'],
    description:
      'Atur jumlah lawan AI 1–5 meja, susun kombinasi hingga Royal Flush dengan fitur Check, Call, Raise, dan All-In.',
    accentFrom: 'from-sky-500',
    accentTo: 'to-blue-600',
    badgeColor: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    rewardText: 'Pot Tanpa Batas',
  },
];
