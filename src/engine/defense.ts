/**
 * Defense rating is a live sum, recomputed from scratch like power — never
 * stockpiled. Training Camp defenders are the only source until Phase 5
 * adds Turret/Wall/Shield Generator, whose defenseValue fields already
 * exist in config and fold in here unchanged once buildable.
 */
import { INCURSIONS, MODULES } from '../config/halcyon-config';
import type { GameState } from './types';

export function computeDefense(state: GameState): number {
  let defense = 0;
  for (const module of state.modules) {
    const def = MODULES[module.type];
    if ('maxWorkers' in def && !('produces' in def)) {
      defense += module.assignedWorkers * INCURSIONS.DEFENDER_VALUE_PER_COLONIST;
    }
    if ('defenseValue' in def) defense += def.defenseValue * module.level;
  }
  return defense;
}
