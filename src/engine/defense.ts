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
 */
import { INCURSIONS, MODULES, POWER } from '../config/halcyon-config';
import { computePower } from './power';
import type { GameState, IncursionType, ModuleType } from './types';

const MATCHUP_KEY: Partial<Record<ModuleType, keyof (typeof INCURSIONS.MATCHUPS)['swarm']>> = {
  turret: 'turret',
  perimeterWall: 'wall',
  shieldGen: 'shield',
  trainingCamp: 'defender',
};

export function computeDefense(state: Pick<GameState, 'modules'>): number {
  let defense = 0;
  for (const module of state.modules) {
    if (module.damaged) continue;
    const def = MODULES[module.type];
    if ('maxWorkers' in def && !('produces' in def)) {
      defense += module.assignedWorkers * INCURSIONS.DEFENDER_VALUE_PER_COLONIST;
    }
    if ('defenseValue' in def) defense += def.defenseValue * module.level;
  }
  return defense;
}

export function computeDefenseAgainst(state: Pick<GameState, 'modules'>, type: IncursionType): number {
  const power = computePower(state);
  let defense = 0;

  for (const module of state.modules) {
    if (module.damaged) continue;
    const matchupKey = MATCHUP_KEY[module.type];
    if (!matchupKey) continue;

    const def = MODULES[module.type];
    const raw =
      module.type === 'trainingCamp'
        ? module.assignedWorkers * INCURSIONS.DEFENDER_VALUE_PER_COLONIST
        : 'defenseValue' in def
          ? def.defenseValue * module.level
          : 0;
    if (raw === 0) continue;

    const needsPower = 'powerDemand' in def && def.powerDemand > 0;
    const powerFactor = !needsPower || power.powered ? 1 : module.type === 'shieldGen' ? 0 : POWER.UNDERPOWERED_THROTTLE;

    defense += raw * INCURSIONS.MATCHUPS[type][matchupKey] * powerFactor;
  }

  return Math.round(defense);
}
