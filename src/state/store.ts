/**
 * Zustand store: the single owner of GameState on the UI side. Game logic
 * stays in src/engine; components only read state and call actions.
 */
import { create } from 'zustand';
import { extractResource, setAssignedWorkers } from '../engine/actions';
import { createNewGame } from '../engine/newGame';
import { tick as tickEngine } from '../engine/tick';
import type { GameState, ResourceId, ThemePreference } from '../engine/types';

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
  setTheme: (theme: ThemePreference) => void;
  extract: (resourceId: ResourceId) => void;
  assignWorker: (moduleId: string, delta: number) => void;
  tick: (dtSeconds: number) => void;
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
  setTheme: (theme) =>
    set((s) => ({ game: { ...s.game, settings: { ...s.game.settings, theme } } })),
  extract: (resourceId) => set((s) => ({ game: extractResource(s.game, resourceId) })),
  assignWorker: (moduleId, delta) => set((s) => ({ game: setAssignedWorkers(s.game, moduleId, delta) })),
  tick: (dtSeconds) => set((s) => ({ game: tickEngine(s.game, dtSeconds) })),
}));
