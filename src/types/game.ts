export type GameId = 'uno' | 'chess' | 'carrom' | 'billiard' | 'blackjack' | 'poker';

export type GameCategory = 'all' | 'card' | 'board';

export interface GameMeta {
  id: GameId;
  title: string;
  subtitle: string;
  category: Exclude<GameCategory, 'all'>;
  modes: string[];
  description: string;
  accentFrom: string;
  accentTo: string;
  badgeColor: string;
  rewardText: string;
}

export interface GameStats {
  played: number;
  won: number;
}

export interface StationSaveData {
  nickname: string;
  chips: number;
  soundEnabled: boolean;
  stats: Record<GameId, GameStats>;
}
