/**
 * HALCYON — balance & economy config (STARTING VALUES)
 * ----------------------------------------------------
 * Every tunable number lives here. These are hand-picked starting points meant
 * to be tweaked constantly — none are sacred. Rates are PER SECOND unless noted.
 *
 * Pacing intent:
 *  - First building affordable in ~1–2 min of manual + assisted gathering.
 *  - First incursion is survivable with 1 Turret once a Sentinel reveals it.
 *  - Storage caps bite within ~10–15 min, creating pull to upgrade / return.
 *  - Offline window caps at 12h so returns feel rewarding but not infinite.
 */

// ── Global ─────────────────────────────────────────────────────────────────
export const GLOBAL = {
  MAX_OFFLINE_SECONDS: 12 * 60 * 60, // offline accumulation cap (12h)
  OFFLINE_SUMMARY_MIN_SECONDS: 30,   // below this gap, catch up silently — not worth a modal
  TICK_SECONDS: 1,                   // live loop granularity
  DAY_LENGTH_SECONDS: 20 * 60,       // one day/night cycle = 20 min; night = 2nd half
  STARTING_COLONISTS: 3,
  STARTING_COLONIST_CAP: 6,
  RATION_UPKEEP_PER_COLONIST: 0.1,   // rations/sec drained by EACH colonist (idle baseline)
  WORKING_RATION_UPKEEP_MULT: 1.5,   // colonists assigned to a module drain rations at this multiple of the idle baseline
  HUNGRY_PRODUCTION_MULT: 0.35,      // production multiplier when rations hit 0
} as const;

// ── Resources ──────────────────────────────────────────────────────────────
// Power is NOT stockpiled — it's a supply/demand balance (Windmill output vs
// summed module powerDemand). If supply < demand, powered modules throttle.
// Display names/icons live in the UI layer (ResourceId keys are unchanged).
export const RESOURCES = {
  scrap:   { startAmount: 25, startCap: 200 },
  ore:     { startAmount: 0,  startCap: 200 },
  rations: { startAmount: 40, startCap: 150 },
  exotic:  { startAmount: 0,  startCap: 50  },
  // crafted (later):
  alloy:      { startAmount: 0, startCap: 100 },
  components: { startAmount: 0, startCap: 100 },
} as const;

export const MANUAL_TAP_YIELD = { scrap: 1 }; // tap-to-extract before workers

// ── Power throttle ───────────────────────────────────────────────────────────
// When energy supply < demand, powered modules run at this fraction.
export const POWER = { UNDERPOWERED_THROTTLE: 0.4 } as const;

// ── Modules ──────────────────────────────────────────────────────────────────
// buildCost: resources to place at L1.
// upgradeCostMult / productionMult applied per level above 1 (geometric).
//   costAtLevel(L)       = buildCost * upgradeCostMult^(L-1)
//   productionAtLevel(L) = ratePerWorker * productionMult^(L-1)
// powerDemand is per module (not per worker); scale ×level if you want.
export const MODULE_COST_MULT = 1.6;     // default cost growth per level
export const MODULE_PRODUCTION_MULT = 1.5; // default output growth per level

// name fields are display-only (medieval reskin) — object keys, balance
// numbers, and buildCost resource ids are unchanged, so no save migration.
export const MODULES = {
  salvageRig:   { name: "Woodcutter's Camp", buildCost: { scrap: 40 },                    produces: 'scrap',   ratePerWorker: 0.5,  powerDemand: 2, maxWorkers: 5 },
  miningDrill:  { name: 'Quarry',           buildCost: { scrap: 60, ore: 0 },            produces: 'ore',     ratePerWorker: 0.35, powerDemand: 3, maxWorkers: 5 },
  hydroponics:  { name: 'Farm',             buildCost: { scrap: 50 },                    produces: 'rations', ratePerWorker: 0.5,  powerDemand: 2, maxWorkers: 5 },
  resonanceLab: { name: 'Mystic Well',      buildCost: { scrap: 150, ore: 100 },         produces: 'exotic',  ratePerWorker: 0.05, powerDemand: 5, maxWorkers: 3 },

  reactor:      { name: 'Windmill',         buildCost: { scrap: 80, ore: 40 },           energyOutput: 15,    powerDemand: 0 }, // +15 supply per level
  storageDepot: { name: 'Storehouse',       buildCost: { scrap: 60, ore: 30 },           capBonusAll: 250,    powerDemand: 1 }, // +250 to every cap per level
  habitat:      { name: 'Cottage',          buildCost: { scrap: 70, ore: 30 },           colonistCapBonus: 4, powerDemand: 2 }, // +4 colonist cap per level — population is meant to scale toward the dozens/~100 range over many Cottages/levels, not flood in on the first build
  fabricator:   { name: 'Workshop',         buildCost: { scrap: 200, ore: 120 },         powerDemand: 6 },                       // crafts iron/tools

  // Defense & intel
  trainingCamp:  { name: 'Training Camp',   buildCost: { scrap: 90, ore: 40 },           powerDemand: 3, maxWorkers: 20 },      // throughput cap: how many villagers can be training at once (see MILITARY config)
  sentinelArray: { name: 'Watchtower',      buildCost: { scrap: 100, ore: 50 },          powerDemand: 4 },
  turret:        { name: 'Ballista',        buildCost: { scrap: 80, ore: 40 },           defenseValue: 15, powerDemand: 3 },
  perimeterWall: { name: 'Palisade',        buildCost: { scrap: 50, ore: 60 },           defenseValue: 8,  powerDemand: 0 }, // passive, never unpowered
  shieldGen:     { name: 'Ward Stone',      buildCost: { scrap: 150, ore: 80, exotic: 10 }, defenseValue: 40, powerDemand: 8 }, // dead if unpowered
} as const;

// Crafting recipes (Fabricator) — consumes base, outputs crafted, per second per worker
export const RECIPES = {
  alloy:      { inputs: { ore: 0.4, scrap: 0.2 }, output: 0.15 },
  components: { inputs: { alloy: 0.2, exotic: 0.02 }, output: 0.1 },
} as const;

// ── Sentinel detection ───────────────────────────────────────────────────────
// How far ahead the Sentinel reveals incursions, by level (hours).
export const SENTINEL = {
  HORIZON_HOURS_BY_LEVEL: [0, 6, 12, 24, 36, 48], // index = level; L0 = none built
  // At >= this level, reveal exact composition/weak points, not just strength.
  DETAILED_INTEL_LEVEL: 2,
} as const;

// ── Incursions (scheduled, deterministic from seed) ──────────────────────────
export const INCURSIONS = {
  // First incursion won't resolve offline until a Sentinel exists (fairness).
  FIRST_INCURSION_DELAY_SECONDS: 8 * 60, // ~8 min into a fresh game
  BASE_INTERVAL_HOURS: 2,                // avg real-time gap between incursions
  INTERVAL_JITTER: 0.3,                  // ±30%, derived from seed (deterministic)
  INTERVAL_TIGHTEN_PER_DAY: 0.04,        // interval shrinks 4% per in-game day
  MIN_INTERVAL_FACTOR: 0.25,             // ...but never shrinks below 25% of BASE_INTERVAL_HOURS

  // How many resolved incursions to keep in the save for history/battle-report
  // display. Capped so a long-lived colony's save doesn't grow unbounded —
  // this trims the persisted log only, not the "while you were away" report
  // for the window just replayed (that always shows everything that happened).
  HISTORY_LIMIT: 20,

  // Repair cost for a damaged module = its OWN level-1 build cost × this.
  REPAIR_COST_MULT: 0.5,

  // strength(n) = BASE * GROWTH^n  (n = incursion index). Deliberately a
  // pure function of raid count/time, NOT of the colony's current defense
  // — scaling reactively to whatever's been built punishes upgrading
  // instead of rewarding it. The escalation pressure comes from this curve
  // being steep and raids being frequent (BASE_INTERVAL_HOURS above): the
  // world gets more dangerous on its own schedule, and racing ahead of it
  // — building defense BEFORE you need it — is the actual strategy.
  BASE_STRENGTH: 12,
  STRENGTH_GROWTH: 1.35,

  // Breach losses
  LOSS_FACTOR: 0.6,        // loss% = shortfallRatio * LOSS_FACTOR ...
  MAX_LOSS_PCT: 0.30,      // ... but never more than 30% of a stockpile per raid
  STRUCTURE_DAMAGE_SHORTFALL: 0.5, // if shortfallRatio > this, disable 1 module (seeded)
  // shortfallRatio = clamp((strength - defense) / strength, 0, 1)

  // Type ↔ defense effectiveness multipliers (defenseValue × factor)
  // Rows = incursion type, cols = defense source. soldier/archer are
  // trained troops (see MILITARY below), not raw Training Camp assignment.
  MATCHUPS: {
    swarm:   { turret: 1.3, wall: 0.8, shield: 1.0, soldier: 0.9, archer: 1.3 },
    armored: { turret: 1.0, wall: 0.7, shield: 1.3, soldier: 1.3, archer: 0.7 },
    raiders: { turret: 1.0, wall: 1.3, shield: 1.0, soldier: 1.0, archer: 1.1 },
  },

  // Rough type distribution as the game progresses (seeded pick).
  TYPE_WEIGHTS: { swarm: 0.5, armored: 0.3, raiders: 0.2 },
} as const;

// ── Military: training villagers into standing troops ────────────────────────
// Assigning a villager to the Training Camp starts training them as a
// specific troop type; they contribute NOTHING to defense until training
// completes (the whole point — you have to prepare before a raid hits, not
// during it). Once trained, they're a permanent standing troop (no longer
// tied to the Training Camp's own worker slots — those just gate how many
// can be training AT ONCE, not a cap on total army size).
export const MILITARY = {
  TRAINING_DURATION_SECONDS: 15 * 60, // 15 min to complete a training order
  SOLDIER_VALUE: 6,  // defense contributed per trained Soldier (before matchup)
  ARCHER_VALUE: 6,   // defense contributed per trained Archer (before matchup)
} as const;

// ── Prestige (implement last) ────────────────────────────────────────────────
export const PRESTIGE = {
  UNLOCK_DAY_COUNT: 30,          // eligible to re-found after surviving 30 days
  MULTIPLIER_PER_LEVEL: 0.1,     // +10% global production per prestige level
} as const;

// ── Derived helpers (reference implementations) ──────────────────────────────
export const costAtLevel = (base: number, level: number, mult = MODULE_COST_MULT) =>
  Math.round(base * Math.pow(mult, level - 1));

export const productionAtLevel = (rate: number, level: number, mult = MODULE_PRODUCTION_MULT) =>
  rate * Math.pow(mult, level - 1);

export const incursionStrength = (index: number) =>
  Math.round(INCURSIONS.BASE_STRENGTH * Math.pow(INCURSIONS.STRENGTH_GROWTH, index));
