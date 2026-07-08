/**
 * Advance the colony by dtSeconds: rations upkeep, production for every
 * assigned/undamaged/powered module, then any incursions scheduled to
 * arrive within this step. Shaped as a pure (state, dt) -> result function
 * so the live loop and the offline catch-up both call it unchanged and
 * produce byte-identical outcomes for the same wall-clock window.
 *
 * lastActiveAt doubles as tick's own simulated clock, not just an "exit
 * stamp" — every call advances it by dtSeconds, which is what lets the
 * incursion scheduler (a pure function of absolute time) know what window
 * to check without a separate time parameter.
 */
import { GLOBAL, MODULES, POWER, productionAtLevel } from '../config/halcyon-config';
import { refreshCapNumbers } from './caps';
import { advanceIncursions } from './incursions';
import { advanceTraining } from './military';
import { computePower } from './power';
import type { GameState, Incursion, ResourceId } from './types';

/** Snapshot of the production multiplier for the *current* state — the same
 *  hunger/power factors tick() applies internally, but evaluated against
 *  the state as it stands right now (not post-upkeep-this-tick), so the UI
 *  can show an accurate "what am I actually producing" number without
 *  waiting for the next tick. Not used by tick() itself — that computes
 *  hunger from the post-upkeep ration amount for this specific step. */
export function currentProductionMultiplier(state: GameState): number {
  const hungry = state.resources.rations.amount <= 0;
  const hungerMult = hungry ? GLOBAL.HUNGRY_PRODUCTION_MULT : 1;
  const powerMult = computePower(state).powered ? 1 : POWER.UNDERPOWERED_THROTTLE;
  // The worse of the two, not both compounded — multiplying them (0.35 *
  // 0.4 = 0.14x) can pin a colony below its own upkeep rate forever once
  // both conditions hit at once, with no way to out-produce the drain no
  // matter how many workers are assigned. That's an unrecoverable trap,
  // which violates the game's own rule that a setback is a penalty, never
  // a dead end.
  return Math.min(hungerMult, powerMult);
}

export interface TickResult {
  state: GameState;
  /** incursions resolved during this specific call, in order (empty most of
   *  the time — the schedule averages hours between arrivals). Distinct
   *  from state.incursions, which is the capped persisted history. */
  resolvedIncursions: Incursion[];
}

export function tick(state: GameState, dtSeconds: number): TickResult {
  if (dtSeconds <= 0) return { state, resolvedIncursions: [] };

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
  // See currentProductionMultiplier's comment: the worse single penalty,
  // not both stacked — a starving AND underpowered colony must still be
  // mathematically able to claw back out via more/better-assigned workers.
  const productionMult = Math.min(hungerMult, powerMult);

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
    // after a structure was damaged by a breached incursion) — production
    // adds, it must never claw back stock that was already there.
    resources[resourceId] = { ...res, amount: Math.max(res.amount, Math.min(res.cap, res.amount + gained)) };
  }

  const windowEnd = state.lastActiveAt + dtSeconds * 1000;
  const dayCount = Math.max(0, Math.floor((windowEnd - state.createdAt) / (GLOBAL.DAY_LENGTH_SECONDS * 1000)));
  // Training completes before incursions resolve in this same window — if a
  // batch finishes training right as a raid arrives, they've already
  // graduated in time to help defend it.
  const trained = advanceTraining(
    { ...state, resources, lastActiveAt: windowEnd, survival: { ...state.survival, dayCount } },
    windowEnd,
  );
  const advanced = advanceIncursions(trained, windowEnd);

  return { state: refreshCapNumbers(advanced.state), resolvedIncursions: advanced.resolved };
}
