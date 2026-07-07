/**
 * Manual player actions — tap-to-extract and worker assignment. Pure
 * functions: given a state, return a new state, no side effects.
 */
import { MANUAL_TAP_YIELD, MODULES } from '../config/halcyon-config';
import type { GameState, ResourceId } from './types';

const TAP_YIELD = MANUAL_TAP_YIELD as Partial<Record<ResourceId, number>>;

export function extractResource(state: GameState, resourceId: ResourceId): GameState {
  const yieldAmount = TAP_YIELD[resourceId];
  if (!yieldAmount) return state;

  const res = state.resources[resourceId];
  const newAmount = Math.min(res.cap, res.amount + yieldAmount);
  if (newAmount === res.amount) return state; // already at cap — no-op, skip the re-render/save

  return {
    ...state,
    resources: { ...state.resources, [resourceId]: { ...res, amount: newAmount } },
  };
}

/** Change a module's assigned-worker count by `delta`, clamped to [0, maxWorkers]
 *  and to the colonists actually idle (total − already assigned elsewhere). */
export function setAssignedWorkers(state: GameState, moduleId: string, delta: number): GameState {
  const module = state.modules.find((m) => m.id === moduleId);
  if (!module) return state;

  const def = MODULES[module.type];
  const maxWorkers = 'maxWorkers' in def ? def.maxWorkers : 0;
  const idle = state.colonists.total - state.colonists.assigned;

  const newAssigned = Math.max(0, Math.min(module.assignedWorkers + delta, maxWorkers, module.assignedWorkers + idle));
  if (newAssigned === module.assignedWorkers) return state;

  const assignedDelta = newAssigned - module.assignedWorkers;
  return {
    ...state,
    modules: state.modules.map((m) => (m.id === moduleId ? { ...m, assignedWorkers: newAssigned } : m)),
    colonists: { ...state.colonists, assigned: state.colonists.assigned + assignedDelta },
  };
}
