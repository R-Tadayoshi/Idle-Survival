/**
 * Energy is never stockpiled — it's a live supply/demand balance recomputed
 * from whatever's currently built. Reactor level drives supply; every built
 * module (regardless of worker assignment) draws its listed powerDemand.
 */
import { MODULES } from '../config/halcyon-config';
import type { GameState } from './types';

export interface PowerState {
  supply: number;
  demand: number;
  powered: boolean;
}

export function computePower(state: Pick<GameState, 'modules'>): PowerState {
  let supply = 0;
  let demand = 0;
  for (const module of state.modules) {
    const def = MODULES[module.type];
    if ('energyOutput' in def) supply += def.energyOutput * module.level;
    if ('powerDemand' in def) demand += def.powerDemand;
  }
  return { supply, demand, powered: demand <= supply };
}
