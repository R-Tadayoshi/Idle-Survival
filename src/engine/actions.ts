/**
 * Manual player actions — currently just tap-to-extract, the only
 * interaction that exists before colonists/modules arrive in later phases.
 * Pure functions: given a state, return a new state, no side effects.
 */
import { MANUAL_TAP_YIELD } from '../config/halcyon-config';
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
