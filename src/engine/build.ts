/**
 * Building and upgrading. Each module type is a singleton — build it once,
 * then scale it up by leveling rather than placing duplicates (matches how
 * maxWorkers/capBonusAll/etc. are defined per type, not per instance).
 */
import { MODULE_COST_MULT, MODULES, costAtLevel } from '../config/halcyon-config';
import { recalculateCaps } from './caps';
import type { GameState, Module, ModuleType, ResourceId } from './types';

/** Phase 4 scope: production + utility modules. Fabricator needs a
 *  multi-input crafting system (RECIPES) not built yet; the defense/intel
 *  modules (Sentinel Array, Turret, Wall, Shield) are Phase 5's signature
 *  content and stay locked until incursions exist to justify them. */
export const BUILDABLE_MODULE_TYPES: ModuleType[] = [
  'miningDrill',
  'hydroponics',
  'resonanceLab',
  'reactor',
  'storageDepot',
  'habitat',
];

export function getModuleCost(type: ModuleType, level: number): Partial<Record<ResourceId, number>> {
  const cost: Partial<Record<ResourceId, number>> = {};
  for (const [resource, amount] of Object.entries(MODULES[type].buildCost)) {
    cost[resource as ResourceId] = costAtLevel(amount, level, MODULE_COST_MULT);
  }
  return cost;
}

export function canAfford(state: GameState, cost: Partial<Record<ResourceId, number>>): boolean {
  return Object.entries(cost).every(([id, amount]) => state.resources[id as ResourceId].amount >= (amount ?? 0));
}

function deductCost(state: GameState, cost: Partial<Record<ResourceId, number>>): GameState['resources'] {
  const resources = { ...state.resources };
  for (const [id, amount] of Object.entries(cost)) {
    const res = resources[id as ResourceId];
    resources[id as ResourceId] = { ...res, amount: res.amount - (amount ?? 0) };
  }
  return resources;
}

export function buildModule(state: GameState, type: ModuleType): GameState {
  if (state.modules.some((m) => m.type === type)) return state; // already built — upgrade instead
  const cost = getModuleCost(type, 1);
  if (!canAfford(state, cost)) return state;

  const newModule: Module = { id: `${type}-${crypto.randomUUID()}`, type, level: 1, assignedWorkers: 0 };
  return recalculateCaps({
    ...state,
    resources: deductCost(state, cost),
    modules: [...state.modules, newModule],
  });
}

export function upgradeModule(state: GameState, moduleId: string): GameState {
  const module = state.modules.find((m) => m.id === moduleId);
  if (!module) return state;

  const nextLevel = module.level + 1;
  const cost = getModuleCost(module.type, nextLevel);
  if (!canAfford(state, cost)) return state;

  return recalculateCaps({
    ...state,
    resources: deductCost(state, cost),
    modules: state.modules.map((m) => (m.id === moduleId ? { ...m, level: nextLevel } : m)),
  });
}
