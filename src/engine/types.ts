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
  /** set if the breach's shortfall exceeded INCURSIONS.STRUCTURE_DAMAGE_SHORTFALL */
  damagedModuleType?: ModuleType;
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
  military: Military;
  survival: { integrity: number; dayCount: number };
  prestige: { level: number; multiplier: number };
  settings: { hapticsEnabled: boolean; theme: ThemePreference; onboardingDismissed: boolean };
}
