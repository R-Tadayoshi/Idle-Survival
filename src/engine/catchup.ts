/**
 * Offline catch-up: replay the elapsed window since lastActiveAt through the
 * same tick() used live, in fixed-size chunks rather than one giant dt. This
 * matters even without incursions yet — production drops to
 * HUNGRY_PRODUCTION_MULT the instant rations hit 0, and a single big tick()
 * call would only ever see the start or end state of a long window, not the
 * moment rations actually ran out partway through. Chunking makes online and
 * offline resolution produce identical results for the same timeline, which
 * is the whole point.
 */
import { GLOBAL } from '../config/halcyon-config';
import { tick } from './tick';
import type { GameState, Incursion, ResourceId, WorldEvent } from './types';

export interface CatchupResult {
  state: GameState;
  elapsedSeconds: number;
  /** post − pre amount per resource; omits resources that didn't move */
  resourceDeltas: Partial<Record<ResourceId, number>>;
  /** every incursion resolved during the replayed window, in order — the
   *  "battle report" half of the While You Were Away summary */
  battleReport: Incursion[];
  /** every world event resolved during the replayed window, in order */
  worldEventReport: WorldEvent[];
}

export function runCatchup(state: GameState, now: number): CatchupResult {
  const elapsedSeconds = Math.max(
    0,
    Math.min((now - state.lastActiveAt) / 1000, GLOBAL.MAX_OFFLINE_SECONDS),
  );

  const before = state.resources;
  let next = state;
  let remaining = elapsedSeconds;
  const battleReport: Incursion[] = [];
  const worldEventReport: WorldEvent[] = [];
  while (remaining > 0) {
    const step = Math.min(GLOBAL.TICK_SECONDS, remaining);
    const result = tick(next, step);
    next = result.state;
    battleReport.push(...result.resolvedIncursions);
    worldEventReport.push(...result.resolvedWorldEvents);
    remaining -= step;
  }
  next = { ...next, lastActiveAt: now };

  const resourceDeltas: Partial<Record<ResourceId, number>> = {};
  for (const id of Object.keys(before) as ResourceId[]) {
    const delta = next.resources[id].amount - before[id].amount;
    if (Math.abs(delta) > 1e-6) resourceDeltas[id] = delta;
  }

  return { state: next, elapsedSeconds, resourceDeltas, battleReport, worldEventReport };
}
