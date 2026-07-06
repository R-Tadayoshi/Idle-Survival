import { GLOBAL, RESOURCES } from '../config/halcyon-config';
import { SAVE_VERSION } from '../save/db';
import type { GameState, ResourceId, ResourceState } from './types';

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
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
    modules: [],
    colonists: { total: GLOBAL.STARTING_COLONISTS, assigned: 0, cap: GLOBAL.STARTING_COLONIST_CAP },
    incursions: [],
    survival: { integrity: 100, dayCount: 0 },
    prestige: { level: 0, multiplier: 1 },
    settings: { hapticsEnabled: true },
  };
}
