/**
 * Advance the colony by dtSeconds: rations upkeep, then production for every
 * assigned, undamaged module. Power throttling and incursion resolution fold
 * into this same function in later phases — kept to production+upkeep for
 * now, but shaped as a pure (state, dt) -> state function so the live loop
 * and the offline catch-up (Phase 3) can both call it unchanged.
 */
import { GLOBAL, MODULES, productionAtLevel } from '../config/halcyon-config';
import type { GameState, ResourceId } from './types';

export function tick(state: GameState, dtSeconds: number): GameState {
  if (dtSeconds <= 0) return state;

  const rations = state.resources.rations;
  const upkeep = GLOBAL.RATION_UPKEEP_PER_COLONIST * state.colonists.total * dtSeconds;
  const rationsAmount = Math.max(0, rations.amount - upkeep);
  const hungry = rationsAmount <= 0;
  const productionMult = hungry ? GLOBAL.HUNGRY_PRODUCTION_MULT : 1;

  const resources = { ...state.resources, rations: { ...rations, amount: rationsAmount } };

  for (const module of state.modules) {
    if (module.damaged || module.assignedWorkers <= 0) continue;
    const def = MODULES[module.type];
    if (!('produces' in def) || !('ratePerWorker' in def)) continue;

    const resourceId = def.produces as ResourceId;
    const ratePerWorker = productionAtLevel(def.ratePerWorker, module.level);
    const gained = ratePerWorker * module.assignedWorkers * productionMult * dtSeconds;

    const res = resources[resourceId];
    resources[resourceId] = { ...res, amount: Math.min(res.cap, res.amount + gained) };
  }

  return { ...state, resources };
}
