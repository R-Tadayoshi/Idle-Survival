/**
 * Training villagers into standing troops. A colonist assigned to the
 * Training Camp contributes ZERO defense until their training order
 * completes — the whole point is that you have to prepare before a raid
 * hits, not scramble during one. Once trained, they're a permanent
 * standing troop, no longer tied to the Training Camp's own worker slots
 * (those just cap how many can be training AT ONCE, not total army size).
 */
import { MILITARY, MODULES } from '../config/halcyon-config';
import type { GameState, TroopType } from './types';

/** How many villagers are currently occupying a training slot (mid-order),
 *  across all troop types — this is what Training Camp's maxWorkers caps. */
export function trainingInProgressCount(state: Pick<GameState, 'military'>): number {
  return state.military.training.reduce((sum, order) => sum + order.count, 0);
}

/** Assign (delta > 0) or pull back (delta < 0) villagers from training.
 *  Joins the latest open order of the given type if one exists, so
 *  queuing more people up never resets the timer on those already
 *  in progress. Mirrors setAssignedWorkers' clamping shape. */
export function setTraining(state: GameState, type: TroopType, delta: number, now = Date.now()): GameState {
  const camp = state.modules.find((m) => m.type === 'trainingCamp' && !m.damaged);
  if (!camp || delta === 0) return state;

  const maxWorkers = 'maxWorkers' in MODULES.trainingCamp ? MODULES.trainingCamp.maxWorkers : 0;
  const inProgress = trainingInProgressCount(state);
  const idle = state.colonists.total - state.colonists.assigned;

  if (delta > 0) {
    const room = Math.max(0, Math.min(maxWorkers - inProgress, idle));
    const add = Math.min(delta, room);
    if (add <= 0) return state;

    const training = [...state.military.training];
    const openIndex = training.findIndex((o) => o.type === type);
    if (openIndex >= 0) {
      training[openIndex] = { ...training[openIndex], count: training[openIndex].count + add };
    } else {
      training.push({ id: `training-${type}-${now}-${Math.random()}`, type, count: add, completesAt: now + MILITARY.TRAINING_DURATION_SECONDS * 1000 });
    }

    return {
      ...state,
      military: { ...state.military, training },
      colonists: { ...state.colonists, assigned: state.colonists.assigned + add },
    };
  }

  // delta < 0: pull villagers back out of an in-progress order for `type`
  const training = [...state.military.training];
  const openIndex = training.findIndex((o) => o.type === type);
  if (openIndex < 0) return state;

  const remove = Math.min(-delta, training[openIndex].count);
  if (remove <= 0) return state;

  if (remove === training[openIndex].count) {
    training.splice(openIndex, 1);
  } else {
    training[openIndex] = { ...training[openIndex], count: training[openIndex].count - remove };
  }

  return {
    ...state,
    military: { ...state.military, training },
    colonists: { ...state.colonists, assigned: state.colonists.assigned - remove },
  };
}

/** Complete any training orders whose completesAt has passed by
 *  `windowEnd` — called once per tick() with the tick's end time, same
 *  shape as advanceIncursions. Trained troops stay counted in
 *  colonists.assigned (they had a job before, they have one now, just a
 *  different one) — only the training->standing-troop bucket changes. */
export function advanceTraining(state: GameState, windowEnd: number): GameState {
  const due = state.military.training.filter((o) => o.completesAt <= windowEnd);
  if (due.length === 0) return state;

  let soldiers = state.military.soldiers;
  let archers = state.military.archers;
  for (const order of due) {
    if (order.type === 'soldier') soldiers += order.count;
    else archers += order.count;
  }

  return {
    ...state,
    military: {
      soldiers,
      archers,
      training: state.military.training.filter((o) => o.completesAt > windowEnd),
    },
  };
}
