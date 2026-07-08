/**
 * Deterministic incursion schedule + resolution. The schedule is a pure
 * function of (seed, index): given the same seed, online and offline
 * resolution produce byte-identical outcomes for the same wall-clock
 * window — you cannot dodge or farm a raid by toggling the app's state.
 *
 * Each incursion's arrival depends on the one before it (interval
 * tightening is a function of day-count-at-previous-arrival), so the
 * schedule is a recurrence, not independently computable per index. Rather
 * than replaying the whole chain from index 0 on every call, GameState
 * caches the recurrence's progress (nextIncursionIndex/nextIncursionArrivalAt)
 * and this module only ever steps it forward.
 *
 * Incursions only resolve (apply wins/losses) once a Sentinel Array is
 * built — before that they still occur on schedule but are silently
 * skipped, so a new player is never blindsided offline OR live. This is
 * identical logic in both cases, per the design's fairness rule.
 */
import { GLOBAL, INCURSIONS, MORALE, incursionStrength } from '../config/halcyon-config';
import { computeDefenseAgainst } from './defense';
import { removeOneColonist } from './morale';
import { pickWeighted, seededRng } from './rng';
import type { GameState, Incursion, IncursionType, ModuleType, ResourceId } from './types';

const TYPE_WEIGHTS = INCURSIONS.TYPE_WEIGHTS as Record<IncursionType, number>;

const SALT_JITTER = 1;
const SALT_TYPE = 2;
const SALT_DAMAGE = 3;

export function firstIncursionArrival(createdAt: number): number {
  return createdAt + INCURSIONS.FIRST_INCURSION_DELAY_SECONDS * 1000;
}

/** arrivalAt(index) for index > 0, given the previous arrival and the
 *  in-game day count at that previous arrival. */
function nextArrivalAfter(seed: number, index: number, prevArrivalAt: number, dayCountAtPrev: number): number {
  const jitterRoll = seededRng(seed, index * 100 + SALT_JITTER)();
  const jitter = 1 + (jitterRoll * 2 - 1) * INCURSIONS.INTERVAL_JITTER;
  const tighten = Math.max(INCURSIONS.MIN_INTERVAL_FACTOR, 1 - INCURSIONS.INTERVAL_TIGHTEN_PER_DAY * dayCountAtPrev);
  const intervalMs = INCURSIONS.BASE_INTERVAL_HOURS * 3600 * 1000 * tighten * jitter;
  return prevArrivalAt + intervalMs;
}

function dayCountAt(createdAt: number, at: number): number {
  return Math.max(0, Math.floor((at - createdAt) / (GLOBAL.DAY_LENGTH_SECONDS * 1000)));
}

export interface ScheduledIncursion {
  index: number;
  arrivalAt: number;
  strength: number;
  type: IncursionType;
}

/** strength is a pure function of raid index/time — deliberately NOT of the
 *  colony's current defense. Scaling reactively to whatever's been built
 *  punishes investment (upgrade your defense, the next raid gets harder to
 *  match) instead of rewarding it, which kills the "getting stronger"
 *  incentive a survival game needs. The escalation instead comes from a
 *  faster baseline curve and tighter raid spacing (see STRENGTH_GROWTH /
 *  BASE_INTERVAL_HOURS in config) — the world gets more dangerous on its
 *  own schedule, and racing ahead of that curve is the actual strategy. */
function rollTypeAndStrength(seed: number, index: number): { type: IncursionType; strength: number } {
  const typeRoll = seededRng(seed, index * 100 + SALT_TYPE)();
  return { type: pickWeighted(typeRoll, TYPE_WEIGHTS), strength: incursionStrength(index) };
}

/** Read-only preview of upcoming incursions within `horizonEndAt`, without
 *  resolving or mutating anything — purely for the threat-radar UI. Walks
 *  the same recurrence forward from the current cursor. */
export function peekUpcomingIncursions(state: GameState, horizonEndAt: number, maxCount = 10): ScheduledIncursion[] {
  const results: ScheduledIncursion[] = [];
  let index = state.nextIncursionIndex;
  let arrivalAt = state.nextIncursionArrivalAt;

  while (arrivalAt <= horizonEndAt && results.length < maxCount) {
    results.push({ index, arrivalAt, ...rollTypeAndStrength(state.seed, index) });
    const dayCount = dayCountAt(state.createdAt, arrivalAt);
    index += 1;
    arrivalAt = nextArrivalAfter(state.seed, index, arrivalAt, dayCount);
  }
  return results;
}

interface ResolveResult {
  state: GameState;
  record: Incursion;
}

/** A breach's severity scales continuously with shortfallRatio (how
 *  outmatched the defense was) — resource loss, how many buildings take
 *  damage, and, past CASUALTY_SHORTFALL, villagers lost outright, up to the
 *  entire population at shortfallRatio 1.0 (zero defense). This is
 *  deliberate: a raid you were braced for costs little, one you had no
 *  answer for can wipe the colony outright. Defense strictly improves the
 *  outcome at every level — this never reintroduces the rejected pattern
 *  of raid *strength* reacting to the colony (see rollTypeAndStrength). */
function resolveOne(state: GameState, scheduled: ScheduledIncursion): ResolveResult {
  const defenseValue = computeDefenseAgainst(state, scheduled.type);
  const id = `incursion-${scheduled.index}`;

  if (defenseValue >= scheduled.strength) {
    return {
      state: {
        ...state,
        survival: { ...state.survival, morale: Math.min(100, state.survival.morale + MORALE.REPELLED_BONUS) },
      },
      record: {
        id,
        arrivalAt: scheduled.arrivalAt,
        strength: scheduled.strength,
        type: scheduled.type,
        resolved: true,
        outcome: 'repelled',
        defenseValue,
      },
    };
  }

  const shortfallRatio = Math.min(1, Math.max(0, (scheduled.strength - defenseValue) / scheduled.strength));
  const lossPct = Math.min(shortfallRatio * INCURSIONS.LOSS_FACTOR, INCURSIONS.MAX_LOSS_PCT);

  const resources = { ...state.resources };
  const resourceLosses: Partial<Record<ResourceId, number>> = {};
  for (const rid of Object.keys(resources) as ResourceId[]) {
    const res = resources[rid];
    const lost = res.amount * lossPct;
    if (lost > 1e-6) {
      resourceLosses[rid] = lost;
      resources[rid] = { ...res, amount: res.amount - lost };
    }
  }

  let modules = state.modules;
  const damagedModuleTypes: ModuleType[] = [];
  if (shortfallRatio > INCURSIONS.STRUCTURE_DAMAGE_SHORTFALL) {
    const candidates = modules.filter((m) => !m.damaged);
    // How many buildings take damage scales with severity too -- at least
    // one, up to all of them as the shortfall approaches total.
    const damageCount = Math.min(candidates.length, Math.max(1, Math.round(shortfallRatio * candidates.length)));
    const pool = [...candidates];
    const targetIds = new Set<string>();
    for (let i = 0; i < damageCount && pool.length > 0; i++) {
      const pickRoll = seededRng(state.seed, scheduled.index * 100 + SALT_DAMAGE + i)();
      const target = pool.splice(Math.floor(pickRoll * pool.length), 1)[0];
      targetIds.add(target.id);
      damagedModuleTypes.push(target.type);
    }
    modules = modules.map((m) => (targetIds.has(m.id) ? { ...m, damaged: true } : m));
  }

  const morale = Math.max(0, state.survival.morale - MORALE.BREACH_HIT_PER_LOSS_PCT * lossPct);

  let next: GameState = { ...state, resources, modules, survival: { ...state.survival, morale } };
  let colonistsLost = 0;
  if (shortfallRatio > INCURSIONS.CASUALTY_SHORTFALL) {
    const casualtyFraction = (shortfallRatio - INCURSIONS.CASUALTY_SHORTFALL) / (1 - INCURSIONS.CASUALTY_SHORTFALL);
    const toLose = Math.round(casualtyFraction * next.colonists.total);
    const before = next.colonists.total;
    for (let i = 0; i < toLose && next.colonists.total > 0; i++) {
      next = removeOneColonist(next);
    }
    colonistsLost = before - next.colonists.total;
  }

  return {
    state: next,
    record: {
      id,
      arrivalAt: scheduled.arrivalAt,
      strength: scheduled.strength,
      type: scheduled.type,
      resolved: true,
      outcome: 'breached',
      defenseValue,
      lossPct,
      resourceLosses,
      ...(damagedModuleTypes.length > 0 && { damagedModuleTypes }),
      ...(colonistsLost > 0 && { colonistsLost }),
    },
  };
}

export interface AdvanceResult {
  state: GameState;
  /** every incursion resolved during this call, in order — not trimmed by
   *  HISTORY_LIMIT, unlike state.incursions, so a "while you were away"
   *  report can show the full window even if it's longer than the log. */
  resolved: Incursion[];
}

/** Advance the incursion schedule up to `windowEnd` (epoch ms), resolving
 *  (or, pre-Sentinel, silently skipping) any incursion whose arrival falls
 *  at or before it. Called once per tick() with the tick's end time. */
export function advanceIncursions(state: GameState, windowEnd: number): AdvanceResult {
  let index = state.nextIncursionIndex;
  let arrivalAt = state.nextIncursionArrivalAt;
  let current = state;
  let incursions = state.incursions;
  const resolved: Incursion[] = [];

  while (arrivalAt <= windowEnd) {
    const scheduled: ScheduledIncursion = { index, arrivalAt, ...rollTypeAndStrength(state.seed, index) };

    if (current.modules.some((m) => m.type === 'sentinelArray' && !m.damaged)) {
      const outcome = resolveOne(current, scheduled);
      current = outcome.state;
      incursions = [...incursions, outcome.record].slice(-INCURSIONS.HISTORY_LIMIT);
      resolved.push(outcome.record);
    }

    const dayCount = dayCountAt(state.createdAt, arrivalAt);
    index += 1;
    arrivalAt = nextArrivalAfter(state.seed, index, arrivalAt, dayCount);

    // A catastrophic breach can wipe the population outright -- nothing
    // left to raid further in this same window, so stop here rather than
    // rolling more incursions against a colony that no longer exists.
    if (current.colonists.total <= 0) break;
  }

  if (index === state.nextIncursionIndex) return { state, resolved };
  return {
    state: { ...current, incursions, nextIncursionIndex: index, nextIncursionArrivalAt: arrivalAt },
    resolved,
  };
}

