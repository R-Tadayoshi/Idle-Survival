/**
 * Defense rating is a live sum, recomputed from scratch like power — never
 * stockpiled. Two flavors:
 *  - computeDefense: a flat, type-agnostic total — used as a generic "your
 *    current defense investment" preview when no specific incursion type is
 *    known yet (e.g. nothing detected within the Watchtower's horizon).
 *  - computeDefenseAgainst: the real number incursion resolution uses —
 *    applies the type matchup multiplier per source and the power rule
 *    (an unpowered Shield Generator is dead, not just throttled; other
 *    powered defenses throttle like production does).
 *
 * Trained troops (Soldiers/Archers) are tracked separately in
 * state.military, not as module.assignedWorkers — they're a standing army
 * once trained, independent of the Training Camp's own power/damage state
 * (see engine/military.ts).
 */
import { INCURSIONS, MILITARY, MODULES, POWER } from '../config/halcyon-config';
import type { GameState, IncursionType, ModuleType, TroopType } from './types';
import { computePower } from './power';

const MATCHUP_KEY: Partial<Record<ModuleType, keyof (typeof INCURSIONS.MATCHUPS)['swarm']>> = {
  turret: 'turret',
  perimeterWall: 'wall',
  shieldGen: 'shield',
};

const TROOP_VALUE: Record<TroopType, number> = {
  soldier: MILITARY.SOLDIER_VALUE,
  archer: MILITARY.ARCHER_VALUE,
};

export function computeDefense(state: Pick<GameState, 'modules' | 'military'>): number {
  let defense = state.military.soldiers * MILITARY.SOLDIER_VALUE + state.military.archers * MILITARY.ARCHER_VALUE;
  for (const module of state.modules) {
    if (module.damaged) continue;
    const def = MODULES[module.type];
    if ('defenseValue' in def) defense += def.defenseValue * module.level;
  }
  return defense;
}

export function computeDefenseAgainst(
  state: Pick<GameState, 'modules' | 'military'>,
  type: IncursionType,
): number {
  const power = computePower(state);
  let defense = 0;

  for (const module of state.modules) {
    if (module.damaged) continue;
    const matchupKey = MATCHUP_KEY[module.type];
    if (!matchupKey) continue;

    const def = MODULES[module.type];
    const raw = 'defenseValue' in def ? def.defenseValue * module.level : 0;
    if (raw === 0) continue;

    const needsPower = 'powerDemand' in def && def.powerDemand > 0;
    const powerFactor = !needsPower || power.powered ? 1 : module.type === 'shieldGen' ? 0 : POWER.UNDERPOWERED_THROTTLE;

    defense += raw * INCURSIONS.MATCHUPS[type][matchupKey] * powerFactor;
  }

  defense += state.military.soldiers * TROOP_VALUE.soldier * INCURSIONS.MATCHUPS[type].soldier;
  defense += state.military.archers * TROOP_VALUE.archer * INCURSIONS.MATCHUPS[type].archer;

  return Math.round(defense);
}
