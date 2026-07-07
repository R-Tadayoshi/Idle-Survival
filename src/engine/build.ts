/**
 * Building and upgrading. Each module type is a singleton — build it once,
 * then scale it up by leveling rather than placing duplicates (matches how
 * maxWorkers/capBonusAll/etc. are defined per type, not per instance).
 */
import { INCURSIONS, MODULE_COST_MULT, MODULES, costAtLevel } from '../config/halcyon-config';
import { recalculateCaps } from './caps';
import type { GameState, Module, ModuleType, ResourceId } from './types';

/** Fabricator still needs a multi-input crafting system (RECIPES) not built
 *  yet, so it stays locked; everything else — including the Phase 5
 *  defense/intel modules now that incursions exist to justify them — is
 *  buildable. */
export const BUILDABLE_MODULE_TYPES: ModuleType[] = [
  'miningDrill',
  'hydroponics',
  'resonanceLab',
  'reactor',
  'storageDepot',
  'habitat',
  'trainingCamp',
  'sentinelArray',
  'turret',
  'perimeterWall',
  'shieldGen',
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
  if (!module || module.damaged) return state; // repair before upgrading

  const nextLevel = module.level + 1;
  const cost = getModuleCost(module.type, nextLevel);
  if (!canAfford(state, cost)) return state;

  return recalculateCaps({
    ...state,
    resources: deductCost(state, cost),
    modules: state.modules.map((m) => (m.id === moduleId ? { ...m, level: nextLevel } : m)),
  });
}

/** Repair cost is a flat fraction of the module's own level-1 build cost —
 *  level-independent (a damaged Lv.3 module doesn't cost 3x to patch up). */
export function getRepairCost(type: ModuleType): Partial<Record<ResourceId, number>> {
  const cost: Partial<Record<ResourceId, number>> = {};
  for (const [resource, amount] of Object.entries(MODULES[type].buildCost)) {
    cost[resource as ResourceId] = Math.round(amount * INCURSIONS.REPAIR_COST_MULT);
  }
  return cost;
}

export function repairModule(state: GameState, moduleId: string): GameState {
  const module = state.modules.find((m) => m.id === moduleId);
  if (!module || !module.damaged) return state;

  const cost = getRepairCost(module.type);
  if (!canAfford(state, cost)) return state;

  return recalculateCaps({
    ...state,
    resources: deductCost(state, cost),
    modules: state.modules.map((m) => (m.id === moduleId ? { ...m, damaged: false } : m)),
  });
}
