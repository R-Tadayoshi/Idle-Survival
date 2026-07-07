/**
 * Advance the colony by dtSeconds: rations upkeep, then production for every
 * assigned, undamaged, powered module. Incursion resolution folds into this
 * same function in Phase 5 — shaped as a pure (state, dt) -> state function
 * so the live loop and the offline catch-up both call it unchanged.
 */
import { GLOBAL, MODULES, POWER, productionAtLevel } from '../config/halcyon-config';
import { computePower } from './power';
import type { GameState, ResourceId } from './types';

export function tick(state: GameState, dtSeconds: number): GameState {
  if (dtSeconds <= 0) return state;

  const rations = state.resources.rations;
  const working = state.colonists.assigned;
  const idle = state.colonists.total - working;
  const upkeep =
    GLOBAL.RATION_UPKEEP_PER_COLONIST *
    (idle + working * GLOBAL.WORKING_RATION_UPKEEP_MULT) *
    dtSeconds;
  const rationsAmount = Math.max(0, rations.amount - upkeep);
  const hungry = rationsAmount <= 0;
  const hungerMult = hungry ? GLOBAL.HUNGRY_PRODUCTION_MULT : 1;
  const powerMult = computePower(state).powered ? 1 : POWER.UNDERPOWERED_THROTTLE;
  const productionMult = hungerMult * powerMult;

  const resources = { ...state.resources, rations: { ...rations, amount: rationsAmount } };

  for (const module of state.modules) {
    if (module.damaged || module.assignedWorkers <= 0) continue;
    const def = MODULES[module.type];
    if (!('produces' in def) || !('ratePerWorker' in def)) continue;

    const resourceId = def.produces as ResourceId;
    const ratePerWorker = productionAtLevel(def.ratePerWorker, module.level);
    const gained = ratePerWorker * module.assignedWorkers * productionMult * dtSeconds;

    const res = resources[resourceId];
    // max(...) guards a resource already above cap (e.g. a cap that shrank
    // after a structure was damaged in a later phase) — production adds,
    // it must never claw back stock that was already there.
    resources[resourceId] = { ...res, amount: Math.max(res.amount, Math.min(res.cap, res.amount + gained)) };
  }

  return { ...state, resources };
}
