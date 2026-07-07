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
import { GLOBAL, INCURSIONS, incursionStrength } from '../config/halcyon-config';
import { computeDefenseAgainst } from './defense';
import type { GameState, Incursion, IncursionType, ModuleType, ResourceId } from './types';

const TYPE_WEIGHTS = INCURSIONS.TYPE_WEIGHTS as Record<IncursionType, number>;

/** Small deterministic PRNG (mulberry32) — good enough for gameplay-visible
 *  randomness, not cryptographic. Seeded per-purpose so unrelated rolls
 *  (interval jitter vs type pick vs damage pick) don't correlate. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Combine the colony seed with an integer salt into one deterministic
 *  32-bit seed, so different rolls for the same incursion index (jitter,
 *  type, damage target) draw from independent streams. */
function seededRng(seed: number, salt: number): () => number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ salt, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return mulberry32(h >>> 0);
}

const SALT_JITTER = 1;
const SALT_TYPE = 2;
const SALT_DAMAGE = 3;

function pickWeighted<T extends string>(roll: number, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as Array<[T, number]>;
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let acc = 0;
  for (const [key, w] of entries) {
    acc += w / total;
    if (roll <= acc) return key;
  }
  return entries[entries.length - 1][0];
}

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
  resources: GameState['resources'];
  modules: GameState['modules'];
  record: Incursion;
}

function resolveOne(
  state: Pick<GameState, 'resources' | 'modules' | 'seed'>,
  scheduled: ScheduledIncursion,
): ResolveResult {
  const defenseValue = computeDefenseAgainst(state, scheduled.type);
  const id = `incursion-${scheduled.index}`;

  if (defenseValue >= scheduled.strength) {
    return {
      resources: state.resources,
      modules: state.modules,
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
  let damagedModuleType: ModuleType | undefined;
  if (shortfallRatio > INCURSIONS.STRUCTURE_DAMAGE_SHORTFALL) {
    const candidates = modules.filter((m) => !m.damaged);
    if (candidates.length > 0) {
      const pickRoll = seededRng(state.seed, scheduled.index * 100 + SALT_DAMAGE)();
      const target = candidates[Math.floor(pickRoll * candidates.length)];
      damagedModuleType = target.type;
      modules = modules.map((m) => (m.id === target.id ? { ...m, damaged: true } : m));
    }
  }

  return {
    resources,
    modules,
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
      damagedModuleType,
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
  let resources = state.resources;
  let modules = state.modules;
  let incursions = state.incursions;
  const resolved: Incursion[] = [];

  while (arrivalAt <= windowEnd) {
    const scheduled: ScheduledIncursion = { index, arrivalAt, ...rollTypeAndStrength(state.seed, index) };

    if (modules.some((m) => m.type === 'sentinelArray' && !m.damaged)) {
      const outcome = resolveOne({ resources, modules, seed: state.seed }, scheduled);
      resources = outcome.resources;
      modules = outcome.modules;
      incursions = [...incursions, outcome.record].slice(-INCURSIONS.HISTORY_LIMIT);
      resolved.push(outcome.record);
    }

    const dayCount = dayCountAt(state.createdAt, arrivalAt);
    index += 1;
    arrivalAt = nextArrivalAfter(state.seed, index, arrivalAt, dayCount);
  }

  if (index === state.nextIncursionIndex) return { state, resolved };
  return {
    state: { ...state, resources, modules, incursions, nextIncursionIndex: index, nextIncursionArrivalAt: arrivalAt },
    resolved,
  };
}

