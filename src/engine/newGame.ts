import { GLOBAL, RESOURCES } from '../config/halcyon-config';
import { firstIncursionArrival } from './incursions';
import { SAVE_VERSION } from '../save/version';
import type { GameState, Module, ResourceId, ResourceState } from './types';

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

/** Every colony starts with a hand-built Salvage Rig — the build menu
 *  (Phase 4) adds more; this is what you assign your first colonists to. */
export function createStarterModules(): Module[] {
  return [{ id: 'salvage-rig-1', type: 'salvageRig', level: 1, assignedWorkers: 0 }];
}

export function createNewGame(now = Date.now()): GameState {
  const resources = Object.fromEntries(
    (Object.keys(RESOURCES) as ResourceId[]).map((id) => [
      id,
      { amount: RESOURCES[id].startAmount, cap: RESOURCES[id].startCap },
    ]),
  ) as Record<ResourceId, ResourceState>;

  return {
    version: SAVE_VERSION,
    seed: randomSeed(),
    createdAt: now,
    lastActiveAt: now,
    resources,
    modules: createStarterModules(),
    colonists: { total: GLOBAL.STARTING_COLONISTS, assigned: 0, cap: GLOBAL.STARTING_COLONIST_CAP },
    incursions: [],
    nextIncursionIndex: 0,
    nextIncursionArrivalAt: firstIncursionArrival(now),
    military: { soldiers: 0, archers: 0, training: [] },
    survival: { dayCount: 0, morale: 100, starvingSeconds: 0, defectionProgress: 0 },
    gameOver: null,
    prestige: { level: 0, multiplier: 1 },
    settings: { hapticsEnabled: true, theme: 'system', onboardingDismissed: false },
  };
}
