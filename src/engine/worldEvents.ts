/**
 * Random, uncontrollable world events: their own deterministic (seed, index)
 * schedule, same shape as incursions.ts, but with one key difference — there
 * is no fairness gate. Incursions wait for a Sentinel Array so a new player
 * is never blindsided by combat they had no way to see coming; world events
 * have no counter-play at all (that's the point), so they resolve on
 * schedule regardless of what's built. Each effect is instant and one-shot,
 * not an ongoing timed multiplier — resolution is a plain state mutation,
 * not a whole duration-tracking subsystem.
 */
import { WORLD_EVENTS } from '../config/halcyon-config';
import { removeOneColonist } from './morale';
import { pickWeighted, seededRng } from './rng';
import type { GameState, ModuleType, ResourceId, WorldEvent, WorldEventType } from './types';

const TYPE_WEIGHTS = WORLD_EVENTS.TYPE_WEIGHTS as Record<WorldEventType, number>;

const SALT_JITTER = 101;
const SALT_TYPE = 102;
const SALT_TARGET = 103;
const SALT_PLAGUE_LOSS = 104;

export function firstWorldEventArrival(createdAt: number): number {
  return createdAt + WORLD_EVENTS.FIRST_EVENT_DELAY_SECONDS * 1000;
}

/** No interval-tightening-by-day like incursions — events staying on a
 *  flat, wider-jittered interval is itself part of "uncontrollable": the
 *  player can't read a curve and predict when the risk ramps up. */
function nextArrivalAfter(seed: number, index: number, prevArrivalAt: number): number {
  const jitterRoll = seededRng(seed, index * 100 + SALT_JITTER)();
  const jitter = 1 + (jitterRoll * 2 - 1) * WORLD_EVENTS.INTERVAL_JITTER;
  const intervalMs = WORLD_EVENTS.BASE_INTERVAL_HOURS * 3600 * 1000 * jitter;
  return prevArrivalAt + intervalMs;
}

function resolveOne(state: GameState, index: number, arrivalAt: number): { state: GameState; record: WorldEvent } {
  const typeRoll = seededRng(state.seed, index * 100 + SALT_TYPE)();
  const type = pickWeighted(typeRoll, TYPE_WEIGHTS);
  const id = `world-event-${index}`;

  let resources = state.resources;
  let modules = state.modules;
  let colonists = state.colonists;
  let military = state.military;
  let morale = state.survival.morale;
  const resourceLosses: Partial<Record<ResourceId, number>> = {};
  const resourceGains: Partial<Record<ResourceId, number>> = {};
  let damagedModuleType: ModuleType | undefined;
  let colonistLost = false;

  switch (type) {
    case 'blight': {
      const res = resources.rations;
      const lost = res.amount * WORLD_EVENTS.BLIGHT_RATIONS_LOSS_PCT;
      if (lost > 1e-6) {
        resourceLosses.rations = lost;
        resources = { ...resources, rations: { ...res, amount: res.amount - lost } };
      }
      break;
    }
    case 'theft': {
      resources = { ...resources };
      for (const rid of ['scrap', 'ore'] as ResourceId[]) {
        const res = resources[rid];
        const lost = res.amount * WORLD_EVENTS.THEFT_LOSS_PCT;
        if (lost > 1e-6) {
          resourceLosses[rid] = lost;
          resources[rid] = { ...res, amount: res.amount - lost };
        }
      }
      break;
    }
    case 'fire': {
      const candidates = modules.filter((m) => !m.damaged);
      if (candidates.length > 0) {
        const pickRoll = seededRng(state.seed, index * 100 + SALT_TARGET)();
        const target = candidates[Math.floor(pickRoll * candidates.length)];
        damagedModuleType = target.type;
        modules = modules.map((m) => (m.id === target.id ? { ...m, damaged: true } : m));
      }
      break;
    }
    case 'plague': {
      morale = Math.max(0, morale - WORLD_EVENTS.PLAGUE_MORALE_HIT);
      const lossRoll = seededRng(state.seed, index * 100 + SALT_PLAGUE_LOSS)();
      if (lossRoll < WORLD_EVENTS.PLAGUE_COLONIST_LOSS_CHANCE) {
        const before = colonists.total;
        const after = removeOneColonist({ ...state, resources, modules, colonists, military });
        colonists = after.colonists;
        modules = after.modules;
        military = after.military;
        colonistLost = colonists.total < before;
      }
      break;
    }
    case 'caravan': {
      resources = { ...resources };
      for (const rid of ['scrap', 'ore'] as ResourceId[]) {
        const res = resources[rid];
        const gained = Math.max(1, res.amount * WORLD_EVENTS.CARAVAN_GAIN_PCT);
        const capped = Math.min(res.cap, res.amount + gained);
        const actualGain = capped - res.amount;
        if (actualGain > 1e-6) {
          resourceGains[rid] = actualGain;
          resources[rid] = { ...res, amount: capped };
        }
      }
      break;
    }
  }

  const record: WorldEvent = {
    id,
    arrivalAt,
    type,
    ...(Object.keys(resourceLosses).length > 0 && { resourceLosses }),
    ...(Object.keys(resourceGains).length > 0 && { resourceGains }),
    ...(morale !== state.survival.morale && { moraleDelta: morale - state.survival.morale }),
    ...(damagedModuleType && { damagedModuleType }),
    ...(colonistLost && { colonistLost }),
  };

  return {
    state: { ...state, resources, modules, colonists, military, survival: { ...state.survival, morale } },
    record,
  };
}

export interface AdvanceWorldEventsResult {
  state: GameState;
  /** every event resolved during this call, in order — not trimmed by
   *  HISTORY_LIMIT, so a "while you were away" report can show the full
   *  window even if it's longer than the log. */
  resolved: WorldEvent[];
}

/** Advance the world-event schedule up to `windowEnd` (epoch ms). Called
 *  once per tick() with the tick's end time, same as advanceIncursions. */
export function advanceWorldEvents(state: GameState, windowEnd: number): AdvanceWorldEventsResult {
  let index = state.nextWorldEventIndex;
  let arrivalAt = state.nextWorldEventArrivalAt;
  let current = state;
  let worldEvents = state.worldEvents;
  const resolved: WorldEvent[] = [];

  while (arrivalAt <= windowEnd) {
    const { state: next, record } = resolveOne(current, index, arrivalAt);
    current = next;
    worldEvents = [...worldEvents, record].slice(-WORLD_EVENTS.HISTORY_LIMIT);
    resolved.push(record);

    index += 1;
    arrivalAt = nextArrivalAfter(state.seed, index, arrivalAt);
  }

  if (index === state.nextWorldEventIndex) return { state, resolved };
  return {
    state: { ...current, worldEvents, nextWorldEventIndex: index, nextWorldEventArrivalAt: arrivalAt },
    resolved,
  };
}
