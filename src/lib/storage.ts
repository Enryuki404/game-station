import type { GameId, GameStats, StationSaveData } from '../types/game';

const STORAGE_KEY = 'game_station_v1';

const DEFAULT_STATS: Record<GameId, GameStats> = {
  uno: { played: 0, won: 0 },
  chess: { played: 0, won: 0 },
  carrom: { played: 0, won: 0 },
  billiard: { played: 0, won: 0 },
  blackjack: { played: 0, won: 0 },
  poker: { played: 0, won: 0 },
};

export const INITIAL_CHIPS = 10000;
export const REFILL_TARGET_CHIPS = 5000;
export const REFILL_THRESHOLD = 500;

function randomGuestName(): string {
  return `Tamu-${Math.floor(100 + Math.random() * 900)}`;
}

export function createDefaultSave(): StationSaveData {
  return {
    nickname: randomGuestName(),
    chips: INITIAL_CHIPS,
    soundEnabled: true,
    stats: structuredClone(DEFAULT_STATS),
  };
}

export function loadStationData(): StationSaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultSave();
    const parsed = JSON.parse(raw) as Partial<StationSaveData>;
    const defaults = createDefaultSave();
    const cleanName =
      typeof parsed.nickname === 'string' && parsed.nickname.trim().length > 0
        ? parsed.nickname.trim().slice(0, 18)
        : defaults.nickname;
    return {
      nickname: cleanName,
      chips:
        typeof parsed.chips === 'number' && Number.isFinite(parsed.chips) && parsed.chips >= 0
          ? Math.floor(parsed.chips)
          : defaults.chips,
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
      stats: {
        ...defaults.stats,
        ...(parsed.stats ?? {}),
      },
    };
  } catch {
    return createDefaultSave();
  }
}

export function saveStationData(data: StationSaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}
