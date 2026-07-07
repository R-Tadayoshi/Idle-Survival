/**
 * Resource and colonist caps are derived from built modules (Storage Depot,
 * Habitat) rather than mutated ad hoc — recompute both from scratch after
 * any build/upgrade so they can never drift out of sync with what's placed.
 */
import { GLOBAL, MODULES, RESOURCES } from '../config/halcyon-config';
import type { GameState, ResourceId } from './types';

export function recalculateCaps(state: GameState): GameState {
  let storageBonus = 0;
  let colonistCapBonus = 0;
  for (const module of state.modules) {
    const def = MODULES[module.type];
    if ('capBonusAll' in def) storageBonus += def.capBonusAll * module.level;
    if ('colonistCapBonus' in def) colonistCapBonus += def.colonistCapBonus * module.level;
  }

  const resources = { ...state.resources };
  for (const id of Object.keys(RESOURCES) as ResourceId[]) {
    resources[id] = { ...resources[id], cap: RESOURCES[id].startCap + storageBonus };
  }

  const colonistCap = GLOBAL.STARTING_COLONIST_CAP + colonistCapBonus;
  return {
    ...state,
    resources,
    colonists: {
      ...state.colonists,
      cap: colonistCap,
      // A Habitat's whole point is more colonists, and there's no separate
      // recruit mechanic — its bonus takes effect immediately, same as a
      // Storage Depot's cap bonus or a Reactor's power output.
      total: Math.max(state.colonists.total, colonistCap),
    },
  };
}
