/**
 * Core game-state types. The engine (pure logic, no React) operates on these;
 * the UI only reads them through the store. Balance values live exclusively
 * in src/config/halcyon-config.ts.
 */
import type { MODULES, RESOURCES } from '../config/halcyon-config';

/** Stockpiled resources. Energy is intentionally absent: it is a live
 *  supply/demand balance (reactor output vs module draw), never stored. */
export type ResourceId = keyof typeof RESOURCES;

export type ModuleType = keyof typeof MODULES;

export interface ResourceState {
  amount: number;
  cap: number;
}

/** A placed module instance. Rates, costs, power draw, and defense values are
 *  derived from config by `type` + `level` — never duplicated into the save. */
export interface Module {
  id: string;
  type: ModuleType;
  level: number;
  assignedWorkers: number;
  damaged?: boolean;
}

export type IncursionType = 'swarm' | 'armored' | 'raiders';

export type ThemePreference = 'system' | 'light' | 'dark';

export type TroopType = 'soldier' | 'archer';

/** A batch of villagers currently training as `type`. Fixed `completesAt`,
 *  set once when the order is created — additional villagers can join an
 *  already-open order (incrementing `count`) without resetting the timer,
 *  so queuing more up never delays the ones already in progress. */
export interface TrainingOrder {
  id: string;
  type: TroopType;
  count: number;
  completesAt: number;
}

export interface Military {
  soldiers: number;
  archers: number;
  training: TrainingOrder[];
}

/** Why the colony fell. Distinct reasons even though they overlap in
 *  practice (starvation drains morale too) -- a player who neglects food
 *  should read "your colony starved," not a generic "morale collapsed". */
export type DefeatReason = 'population' | 'morale' | 'starvation';

export interface GameOverState {
  reason: DefeatReason;
  /** epoch ms when the defeat condition was detected */
  at: number;
}

export interface Incursion {
  id: string;
  /** epoch ms, from the deterministic seed-based schedule; also the moment
   *  it resolved, since resolution happens exactly at arrival */
  arrivalAt: number;
  strength: number;
  type: IncursionType;
  resolved?: boolean;
  outcome?: 'repelled' | 'breached';
  /** total defense mounted against this incursion's type, after matchup and power factors */
  defenseValue?: number;
  /** fraction of each stockpile lost, only set when outcome is 'breached' */
  lossPct?: number;
  /** actual amount lost per resource, only set when outcome is 'breached' */
  resourceLosses?: Partial<Record<ResourceId, number>>;
  /** every module damaged this breach — count scales with how far the
   *  shortfall exceeded INCURSIONS.STRUCTURE_DAMAGE_SHORTFALL, up to all
   *  undamaged modules at once for a near-total shortfall */
  damagedModuleTypes?: ModuleType[];
  /** villagers lost outright — only past INCURSIONS.CASUALTY_SHORTFALL,
   *  scaling to the whole population at shortfallRatio 1.0 (zero defense) */
  colonistsLost?: number;
}

/** Random, uncontrollable happenings — mostly bad, occasionally a windfall
 *  (caravan). No building or defense prevents one; the whole point is that
 *  there's no counter-play, unlike incursions. */
export type WorldEventType = 'blight' | 'fire' | 'plague' | 'theft' | 'caravan';

export interface WorldEvent {
  id: string;
  /** epoch ms, from the deterministic seed-based schedule; also the moment
   *  it resolved, since resolution happens exactly at arrival */
  arrivalAt: number;
  type: WorldEventType;
  resourceLosses?: Partial<Record<ResourceId, number>>;
  resourceGains?: Partial<Record<ResourceId, number>>;
  moraleDelta?: number;
  /** set when a fire damages a module */
  damagedModuleType?: ModuleType;
  /** set when a plague costs a villager outright */
  colonistLost?: boolean;
}

export interface GameState {
  /** save-schema version, drives migrations on load */
  version: number;
  /** deterministic incursion-schedule seed, fixed at colony founding */
  seed: number;
  createdAt: number;
  /** epoch ms; stamped on hide/unload, diffed on reopen for offline catch-up */
  lastActiveAt: number;
  resources: Record<ResourceId, ResourceState>;
  modules: Module[];
  colonists: { total: number; assigned: number; cap: number };
  /** recently resolved (capped at INCURSIONS.HISTORY_LIMIT); upcoming ones
   *  are never stored — they're recomputed on demand from the scheduler
   *  cursor below, since they're purely a deterministic function of it */
  incursions: Incursion[];
  /** deterministic incursion-schedule cursor: the index and arrival time of
   *  the next incursion to consider. Persisted rather than recomputed from
   *  index 0 every tick because each arrival depends on the one before it
   *  (interval tightening is a function of day-count-at-previous-arrival) —
   *  this is a cache of that recurrence's progress, not new source data. */
  nextIncursionIndex: number;
  nextIncursionArrivalAt: number;
  /** same shape as the incursion history/cursor above, but for random
   *  world events -- an entirely separate deterministic schedule. */
  worldEvents: WorldEvent[];
  nextWorldEventIndex: number;
  nextWorldEventArrivalAt: number;
  military: Military;
  survival: {
    dayCount: number;
    /** 0-100 colony-wide morale. Drains while starving/underpowered, hit
     *  further by a breached raid (scaled by how bad the loss was),
     *  recovers passively once fed + powered, nudged up by a repelled raid. */
    morale: number;
    /** continuous seconds at 0 rations; resets to 0 the moment rations rise
     *  above 0 -- an independent starvation-defeat clock, not derived from
     *  morale (see MORALE.STARVATION_DEFEAT_SECONDS). */
    starvingSeconds: number;
    /** seconds accumulated while morale sits at/under MORALE.DEFECTION_THRESHOLD;
     *  every time it crosses DEFECTION_SECONDS_PER_COLONIST, one villager
     *  leaves and the counter carries its remainder (see engine/morale.ts). */
    defectionProgress: number;
  };
  /** set once a defeat condition is detected; terminal -- tick() stops
   *  simulating the colony entirely once this is non-null (see tick.ts). */
  gameOver: GameOverState | null;
  prestige: { level: number; multiplier: number };
  settings: { hapticsEnabled: boolean; theme: ThemePreference; onboardingDismissed: boolean };
}
