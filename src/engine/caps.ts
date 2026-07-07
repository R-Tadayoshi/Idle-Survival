/**
 * Resource and colonist caps are derived from built modules (Storage Depot,
 * Habitat) rather than mutated ad hoc — recompute both from scratch after
 * any build/upgrade/repair so they can never drift out of sync with what's
 * placed and currently working.
 */
import { GLOBAL, MODULES, RESOURCES } from '../config/halcyon-config';
import type { GameState, ResourceId } from './types';

function capNumbers(state: GameState): { resources: GameState['resources']; colonistCap: number } {
  let storageBonus = 0;
  let colonistCapBonus = 0;
  for (const module of state.modules) {
    if (module.damaged) continue; // a wrecked Storehouse/Cottage doesn't hold its bonus until repaired
    const def = MODULES[module.type];
    if ('capBonusAll' in def) storageBonus += def.capBonusAll * module.level;
    if ('colonistCapBonus' in def) colonistCapBonus += def.colonistCapBonus * module.level;
  }

  const resources = { ...state.resources };
  for (const id of Object.keys(RESOURCES) as ResourceId[]) {
    resources[id] = { ...resources[id], cap: RESOURCES[id].startCap + storageBonus };
  }

  return { resources, colonistCap: GLOBAL.STARTING_COLONIST_CAP + colonistCapBonus };
}

/** Full recompute: caps AND growing colonists.total to fill any new cap.
 *  Used only by explicit player actions (build/upgrade/repair) — a
 *  Habitat's bonus takes effect immediately since there's no separate
 *  recruit mechanic, same as a Storage Depot's cap or a Reactor's output. */
export function recalculateCaps(state: GameState): GameState {
  const { resources, colonistCap } = capNumbers(state);
  return {
    ...state,
    resources,
    colonists: { ...state.colonists, cap: colonistCap, total: Math.max(state.colonists.total, colonistCap) },
  };
}

/** Caps only — never touches colonists.total. Used by tick() so a module
 *  damaged by a breached incursion immediately shrinks the displayed caps,
 *  without the side effect of also granting free colonists on every tick
 *  (recalculateCaps' total-growth is only meant to fire from an explicit
 *  build/upgrade/repair action, not passively on every ~1s tick). */
export function refreshCapNumbers(state: GameState): GameState {
  const { resources, colonistCap } = capNumbers(state);
  return { ...state, resources, colonists: { ...state.colonists, cap: colonistCap } };
}
