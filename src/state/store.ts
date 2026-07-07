/**
 * Zustand store: the single owner of GameState on the UI side. Game logic
 * stays in src/engine; components only read state and call actions.
 */
import { create } from 'zustand';
import { extractResource, setAssignedWorkers } from '../engine/actions';
import {
  buildModule as buildModuleEngine,
  repairModule as repairModuleEngine,
  upgradeModule as upgradeModuleEngine,
} from '../engine/build';
import { runCatchup as runCatchupEngine, type CatchupResult } from '../engine/catchup';
import { GLOBAL } from '../config/halcyon-config';
import { createNewGame } from '../engine/newGame';
import { tick as tickEngine } from '../engine/tick';
import type { GameState, Incursion, ModuleType, ResourceId, ThemePreference } from '../engine/types';

export type SaveStatus = 'loading' | 'saved' | 'dirty';

interface GameStore {
  game: GameState;
  /** false until the IndexedDB load has resolved */
  ready: boolean;
  saveStatus: SaveStatus;
  /** whether navigator.storage.persist() was granted (null = unknown yet) */
  storagePersisted: boolean | null;
  /** set by runCatchup() when the gap since lastActiveAt is worth showing;
   *  cleared on dismiss. null = no "while you were away" summary pending. */
  offlineSummary: CatchupResult | null;
  /** an incursion resolved during a *live* tick (not offline catch-up,
   *  which has its own battle report in offlineSummary) — shown as a
   *  transient alert, then cleared. null = nothing to show. */
  liveBattleAlert: Incursion | null;

  hydrate: (game: GameState) => void;
  setSaveStatus: (s: SaveStatus) => void;
  setStoragePersisted: (v: boolean) => void;
  stampActive: (now?: number) => void;
  setTheme: (theme: ThemePreference) => void;
  extract: (resourceId: ResourceId) => void;
  assignWorker: (moduleId: string, delta: number) => void;
  tick: (dtSeconds: number) => void;
  resetGame: () => void;
  buildModule: (type: ModuleType) => void;
  upgradeModule: (moduleId: string) => void;
  repairModule: (moduleId: string) => void;
  /** Replay elapsed time since lastActiveAt through tick(), chunked. Surfaces
   *  offlineSummary only if the gap clears OFFLINE_SUMMARY_MIN_SECONDS. */
  runCatchup: (now?: number) => void;
  dismissOfflineSummary: () => void;
  dismissLiveBattleAlert: () => void;
}

export const useGameStore = create<GameStore>()((set) => ({
  game: createNewGame(),
  ready: false,
  saveStatus: 'loading',
  storagePersisted: null,
  offlineSummary: null,
  liveBattleAlert: null,

  hydrate: (game) => set({ game, ready: true }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setStoragePersisted: (storagePersisted) => set({ storagePersisted }),
  stampActive: (now = Date.now()) =>
    set((s) => ({ game: { ...s.game, lastActiveAt: now } })),
  setTheme: (theme) =>
    set((s) => ({ game: { ...s.game, settings: { ...s.game.settings, theme } } })),
  extract: (resourceId) => set((s) => ({ game: extractResource(s.game, resourceId) })),
  assignWorker: (moduleId, delta) => set((s) => ({ game: setAssignedWorkers(s.game, moduleId, delta) })),
  tick: (dtSeconds) =>
    set((s) => {
      const result = tickEngine(s.game, dtSeconds);
      const latest = result.resolvedIncursions[result.resolvedIncursions.length - 1];
      return { game: result.state, liveBattleAlert: latest ?? s.liveBattleAlert };
    }),
  resetGame: () => set({ game: createNewGame(), offlineSummary: null, liveBattleAlert: null }),
  buildModule: (type) => set((s) => ({ game: buildModuleEngine(s.game, type) })),
  upgradeModule: (moduleId) => set((s) => ({ game: upgradeModuleEngine(s.game, moduleId) })),
  repairModule: (moduleId) => set((s) => ({ game: repairModuleEngine(s.game, moduleId) })),
  runCatchup: (now = Date.now()) =>
    set((s) => {
      const result = runCatchupEngine(s.game, now);
      const showSummary = result.elapsedSeconds >= GLOBAL.OFFLINE_SUMMARY_MIN_SECONDS;
      return { game: result.state, offlineSummary: showSummary ? result : null };
    }),
  dismissOfflineSummary: () => set({ offlineSummary: null }),
  dismissLiveBattleAlert: () => set({ liveBattleAlert: null }),
}));
