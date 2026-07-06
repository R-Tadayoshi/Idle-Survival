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

export interface Incursion {
  id: string;
  /** epoch ms, from the deterministic seed-based schedule */
  arrivalAt: number;
  strength: number;
  type: IncursionType;
  resolved?: boolean;
  outcome?: 'repelled' | 'breached';
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
  /** upcoming + recently resolved */
  incursions: Incursion[];
  survival: { integrity: number; dayCount: number };
  prestige: { level: number; multiplier: number };
  settings: { hapticsEnabled: boolean; theme: ThemePreference };
}
