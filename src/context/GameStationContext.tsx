import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { playSfx, type SfxType } from '../lib/sound';
import {
  loadStationData,
  REFILL_TARGET_CHIPS,
  REFILL_THRESHOLD,
  saveStationData,
} from '../lib/storage';
import type { GameId, GameStats, StationSaveData } from '../types/game';

interface GameStationContextValue {
  nickname: string;
  setNickname: (name: string) => void;
  chips: number;
  soundEnabled: boolean;
  stats: Record<GameId, GameStats>;
  addChips: (amount: number) => void;
  spendChips: (amount: number) => boolean;
  refillChips: () => void;
  canRefill: boolean;
  recordGame: (gameId: GameId, won: boolean) => void;
  toggleSound: () => void;
  sfx: (type: SfxType) => void;
}

const GameStationContext = createContext<GameStationContextValue | null>(null);

export const GameStationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<StationSaveData>(() => loadStationData());

  useEffect(() => {
    saveStationData(data);
  }, [data]);

  const setNickname = useCallback((name: string) => {
    const clean = name.trim().slice(0, 18);
    if (!clean) return;
    setData((prev) => ({ ...prev, nickname: clean }));
  }, []);

  const addChips = useCallback((amount: number) => {
    if (amount <= 0) return;
    setData((prev) => ({
      ...prev,
      chips: prev.chips + Math.floor(amount),
    }));
  }, []);

  const spendChips = useCallback((amount: number): boolean => {
    const clean = Math.floor(amount);
    if (clean < 0) return false;
    let success = false;
    setData((prev) => {
      if (prev.chips < clean) return prev;
      success = true;
      return { ...prev, chips: prev.chips - clean };
    });
    return success;
  }, []);

  const refillChips = useCallback(() => {
    setData((prev) => {
      if (prev.chips >= REFILL_THRESHOLD) return prev;
      return { ...prev, chips: REFILL_TARGET_CHIPS };
    });
    playSfx('chip', data.soundEnabled);
  }, [data.soundEnabled]);

  const recordGame = useCallback((gameId: GameId, won: boolean) => {
    setData((prev) => {
      const current = prev.stats[gameId] ?? { played: 0, won: 0 };
      return {
        ...prev,
        stats: {
          ...prev.stats,
          [gameId]: {
            played: current.played + 1,
            won: current.won + (won ? 1 : 0),
          },
        },
      };
    });
  }, []);

  const toggleSound = useCallback(() => {
    setData((prev) => {
      const next = !prev.soundEnabled;
      if (next) playSfx('click', true);
      return { ...prev, soundEnabled: next };
    });
  }, []);

  const sfx = useCallback(
    (type: SfxType) => {
      playSfx(type, data.soundEnabled);
    },
    [data.soundEnabled]
  );

  return (
    <GameStationContext.Provider
      value={{
        nickname: data.nickname,
        setNickname,
        chips: data.chips,
        soundEnabled: data.soundEnabled,
        stats: data.stats,
        addChips,
        spendChips,
        refillChips,
        canRefill: data.chips < REFILL_THRESHOLD,
        recordGame,
        toggleSound,
        sfx,
      }}
    >
      {children}
    </GameStationContext.Provider>
  );
};

export function useGameStation(): GameStationContextValue {
  const ctx = useContext(GameStationContext);
  if (!ctx) {
    throw new Error('useGameStation must be used inside GameStationProvider');
  }
  return ctx;
}
