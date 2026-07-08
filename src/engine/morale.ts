/**
 * Colony morale: drains while starving/underpowered, takes a hit from a
 * breached raid (scaled by how bad the loss was), recovers passively once
 * fed + powered, and gets a small boost from repelling a raid outright.
 * Below MORALE.DEFECTION_THRESHOLD, villagers start slipping away; hitting
 * 0 (or the population hitting 0, or a long enough unbroken starvation
 * stretch) ends the game -- see checkGameOver.
 *
 * Everything here is closed-form time-based math (like the incursion
 * scheduler and training queue), not an iterative real-time loop, so a
 * long offline catch-up chunked into many small tick()s produces exactly
 * the same outcome as one giant tick() over the same window.
 */
import { MORALE } from '../config/halcyon-config';
import type { GameState } from './types';

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** One villager leaves the colony: prefer an idle one; if everyone's
 *  occupied, pull from an in-progress training order first (an
 *  unfinished trainee walking away), then a production/utility module --
 *  whoever's actually free to go. */
export function removeOneColonist(state: GameState): GameState {
  if (state.colonists.total <= 0) return state;

  const idle = state.colonists.total - state.colonists.assigned;
  if (idle > 0) {
    return { ...state, colonists: { ...state.colonists, total: state.colonists.total - 1 } };
  }

  const trainingIdx = state.military.training.findIndex((o) => o.count > 0);
  if (trainingIdx >= 0) {
    const order = state.military.training[trainingIdx];
    const training =
      order.count > 1
        ? state.military.training.map((o, i) => (i === trainingIdx ? { ...o, count: o.count - 1 } : o))
        : state.military.training.filter((_, i) => i !== trainingIdx);
    return {
      ...state,
      military: { ...state.military, training },
      colonists: { ...state.colonists, total: state.colonists.total - 1, assigned: state.colonists.assigned - 1 },
    };
  }

  const moduleIdx = state.modules.findIndex((m) => m.assignedWorkers > 0);
  if (moduleIdx >= 0) {
    const modules = state.modules.map((m, i) =>
      i === moduleIdx ? { ...m, assignedWorkers: m.assignedWorkers - 1 } : m,
    );
    return {
      ...state,
      modules,
      colonists: { ...state.colonists, total: state.colonists.total - 1, assigned: state.colonists.assigned - 1 },
    };
  }

  return { ...state, colonists: { ...state.colonists, total: state.colonists.total - 1 } };
}

/** Advance morale/starvation/defection over dtSeconds. `hungry`/`powered`
 *  are passed in rather than recomputed -- tick() already knows both from
 *  this same step's production math, and they must refer to the same
 *  instant morale is reacting to. */
export function advanceMorale(state: GameState, dtSeconds: number, hungry: boolean, powered: boolean): GameState {
  const delta = hungry
    ? -MORALE.DRAIN_PER_SEC_STARVING * dtSeconds
    : !powered
      ? -MORALE.DRAIN_PER_SEC_UNDERPOWERED * dtSeconds
      : MORALE.RECOVER_PER_SEC * dtSeconds;
  const morale = clamp(state.survival.morale + delta, 0, 100);
  const starvingSeconds = hungry ? state.survival.starvingSeconds + dtSeconds : 0;

  const rawProgress = morale <= MORALE.DEFECTION_THRESHOLD ? state.survival.defectionProgress + dtSeconds : 0;
  const leaving = Math.floor(rawProgress / MORALE.DEFECTION_SECONDS_PER_COLONIST);
  const defectionProgress = rawProgress - leaving * MORALE.DEFECTION_SECONDS_PER_COLONIST;

  let next: GameState = { ...state, survival: { ...state.survival, morale, starvingSeconds, defectionProgress } };
  for (let i = 0; i < leaving && next.colonists.total > 0; i++) {
    next = removeOneColonist(next);
  }
  return next;
}

/** Checked once per tick after every other system (incursions included --
 *  a breach can itself push morale to 0) has had its chance to move
 *  morale/population/starvingSeconds this step. Terminal: once set, tick()
 *  stops simulating the colony (see tick.ts). */
export function checkGameOver(state: GameState): GameState {
  if (state.gameOver) return state;
  if (state.colonists.total <= 0) {
    return { ...state, gameOver: { reason: 'population', at: state.lastActiveAt } };
  }
  if (state.survival.morale <= 0) {
    return { ...state, gameOver: { reason: 'morale', at: state.lastActiveAt } };
  }
  if (state.survival.starvingSeconds >= MORALE.STARVATION_DEFEAT_SECONDS) {
    return { ...state, gameOver: { reason: 'starvation', at: state.lastActiveAt } };
  }
  return state;
}
