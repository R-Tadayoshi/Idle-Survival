/**
 * Zustand store: the single owner of GameState on the UI side. Game logic
 * stays in src/engine; components only read state and call actions.
 */
import { create } from 'zustand';
import { createNewGame } from '../engine/newGame';
import type { GameState } from '../engine/types';

export type SaveStatus = 'loading' | 'saved' | 'dirty';

interface GameStore {
  game: GameState;
  /** false until the IndexedDB load has resolved */
  ready: boolean;
  saveStatus: SaveStatus;
  /** whether navigator.storage.persist() was granted (null = unknown yet) */
  storagePersisted: boolean | null;

  hydrate: (game: GameState) => void;
  setSaveStatus: (s: SaveStatus) => void;
  setStoragePersisted: (v: boolean) => void;
  stampActive: (now?: number) => void;
}

export const useGameStore = create<GameStore>()((set) => ({
  game: createNewGame(),
  ready: false,
  saveStatus: 'loading',
  storagePersisted: null,

  hydrate: (game) => set({ game, ready: true }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setStoragePersisted: (storagePersisted) => set({ storagePersisted }),
  stampActive: (now = Date.now()) =>
    set((s) => ({ game: { ...s.game, lastActiveAt: now } })),
}));
