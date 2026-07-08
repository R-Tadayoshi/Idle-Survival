/**
 * Outpost (home) screen: resource HUD, threat radar, and the module grid.
 * The module grid renders every built module (production or utility) plus
 * a "+ Build" tile opening the build menu when anything's left to place.
 */
import { useEffect } from 'react';
import { useGameStore } from '../state/store';
import {
  INCURSIONS,
  MANUAL_TAP_YIELD,
  MODULES,
  MORALE,
  POWER,
  SENTINEL,
  effectiveMaxWorkers,
  productionAtLevel,
} from '../config/halcyon-config';
import { BUILDABLE_MODULE_TYPES, canAfford, getModuleCost, getRepairCost } from '../engine/build';
import { computeDefense, computeDefenseAgainst } from '../engine/defense';
import { peekUpcomingIncursions } from '../engine/incursions';
import { trainingInProgressCount } from '../engine/military';
import { computePower } from '../engine/power';
import { currentProductionMultiplier } from '../engine/tick';
import { formatDuration } from './format';
import { HAPTIC, vibrate } from './haptics';
import { RadarGlyph } from './RadarGlyph';
import { useAnimatedNumber } from './useAnimatedNumber';
import type { GameState, IncursionType, ModuleType, ResourceId, TroopType, WorldEvent, WorldEventType } from '../engine/types';

const TROOP_LABEL: Record<TroopType, string> = { soldier: 'Soldiers', archer: 'Archers' };
const TROOP_ICON: Record<TroopType, string> = { soldier: '🗡️', archer: '🏹' };

const TYPE_LABEL: Record<IncursionType, string> = {
  swarm: 'Swarm',
  armored: 'Armored',
  raiders: 'Raiders',
};

const WORLD_EVENT_ICON: Record<WorldEventType, string> = {
  blight: '🥀',
  fire: '🔥',
  plague: '🤒',
  theft: '🗡️',
  caravan: '🐎',
};

function worldEventAlertText(event: WorldEvent): string {
  switch (event.type) {
    case 'blight':
      return 'Blight ruined part of the harvest.';
    case 'fire':
      return `A fire broke out${event.damagedModuleType ? `, damaging the ${MODULES[event.damagedModuleType].name}` : ''}.`;
    case 'plague':
      return `Illness swept through the village.${event.colonistLost ? ' A villager was lost.' : ''}`;
    case 'theft':
      return 'Bandits pilfered supplies in the night.';
    case 'caravan':
      return 'A trading caravan passed through and traded generously.';
  }
}

type MatchupKey = keyof (typeof INCURSIONS.MATCHUPS)['swarm'];
const MATCHUP_LABEL: Record<MatchupKey, string> = {
  turret: 'Ballistae',
  wall: 'Palisades',
  shield: 'Ward Stones',
  soldier: 'Soldiers',
  archer: 'Archers',
};

/** Composition intel (Watchtower L3+): which defenses this warband is
 *  weakest/strongest against, read straight off INCURSIONS.MATCHUPS. */
function describeMatchup(type: IncursionType): string {
  const matchup = INCURSIONS.MATCHUPS[type];
  const entries = Object.entries(matchup) as Array<[MatchupKey, number]>;
  const weakestTo = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const strongestTo = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  return `Scouts report a ${TYPE_LABEL[type].toLowerCase()} warband — most vulnerable to ${MATCHUP_LABEL[weakestTo[0]]}, least to ${MATCHUP_LABEL[strongestTo[0]]}.`;
}

/** Rough intel (Watchtower L1): a bucketed ETA only, never exact minutes —
 *  ceil'd up to the next 3h so it reads as "roughly ~Xh away", not a precise
 *  countdown the player hasn't earned yet. */
function roughEtaLabel(arrivalAt: number): string {
  const hoursAway = (arrivalAt - Date.now()) / 3_600_000;
  const bucket = Math.max(3, Math.ceil(hoursAway / 3) * 3);
  return `~${bucket}h`;
}

const HUD_RESOURCES: Array<{ id: ResourceId; icon: string; label: string }> = [
  { id: 'scrap', icon: '🪵', label: 'Wood' },
  { id: 'ore', icon: '🪨', label: 'Stone' },
  { id: 'rations', icon: '🍞', label: 'Food' },
  { id: 'exotic', icon: '🔮', label: 'Mana' },
];

const RESOURCE_ICON: Record<ResourceId, string> = {
  ...(Object.fromEntries(HUD_RESOURCES.map(({ id, icon }) => [id, icon])) as Record<ResourceId, string>),
  alloy: '⚒️',
  components: '🔧',
};

const UTILITY_ICON: Partial<Record<ModuleType, string>> = {
  reactor: '💨',
  storageDepot: '📦',
  habitat: '🏠',
  trainingCamp: '⚔️',
  sentinelArray: '🗼',
  turret: '🎯',
  perimeterWall: '🧱',
  shieldGen: '💎',
};

interface OutpostScreenProps {
  onOpenSettings: () => void;
  onOpenBuildMenu: () => void;
}

export function OutpostScreen({ onOpenSettings, onOpenBuildMenu }: OutpostScreenProps) {
  const game = useGameStore((s) => s.game);
  const saveStatus = useGameStore((s) => s.saveStatus);
  const extract = useGameStore((s) => s.extract);
  const assignWorker = useGameStore((s) => s.assignWorker);
  const upgradeModule = useGameStore((s) => s.upgradeModule);
  const repairModule = useGameStore((s) => s.repairModule);
  const setTraining = useGameStore((s) => s.setTraining);
  const liveBattleAlert = useGameStore((s) => s.liveBattleAlert);
  const dismissLiveBattleAlert = useGameStore((s) => s.dismissLiveBattleAlert);
  const liveWorldEventAlert = useGameStore((s) => s.liveWorldEventAlert);
  const dismissLiveWorldEventAlert = useGameStore((s) => s.dismissLiveWorldEventAlert);
  const dismissOnboarding = useGameStore((s) => s.dismissOnboarding);

  // Fires once per newly-resolved live incursion, not on every re-render —
  // liveBattleAlert only changes identity when tick() actually resolves a
  // new one (see store.ts), so this can't re-vibrate on an unrelated update.
  useEffect(() => {
    if (!liveBattleAlert) return;
    vibrate(liveBattleAlert.outcome === 'breached' ? HAPTIC.raidBreached : HAPTIC.raidRepelled);
  }, [liveBattleAlert]);

  useEffect(() => {
    if (!liveWorldEventAlert) return;
    vibrate(liveWorldEventAlert.type === 'caravan' ? HAPTIC.raidRepelled : HAPTIC.raidBreached);
  }, [liveWorldEventAlert]);

  const starving = game.resources.rations.amount <= 0;
  const idleColonists = game.colonists.total - game.colonists.assigned;
  const power = computePower(game);
  const hasMoreToBuild = BUILDABLE_MODULE_TYPES.some((type) => !game.modules.some((m) => m.type === type));

  const watchtower = game.modules.find((m) => m.type === 'sentinelArray' && !m.damaged);
  const watchtowerLevel = watchtower?.level ?? 0;
  const horizonHours = watchtower
    ? (SENTINEL.HORIZON_HOURS_BY_LEVEL[Math.min(watchtower.level, SENTINEL.HORIZON_HOURS_BY_LEVEL.length - 1)] ?? 0)
    : 0;
  const scoutsAssigned = watchtower?.assignedWorkers ?? 0;
  const peekCount = 1 + scoutsAssigned * SENTINEL.PEEK_COUNT_PER_SCOUT;
  const upcoming = watchtower ? peekUpcomingIncursions(game, Date.now() + horizonHours * 3600 * 1000, peekCount) : [];
  const nextIncursion = upcoming[0];
  const roughIntelOnly = watchtowerLevel >= 1 && watchtowerLevel < SENTINEL.DETAILED_INTEL_LEVEL;
  const detailedIntel = watchtowerLevel >= SENTINEL.DETAILED_INTEL_LEVEL;
  const compositionIntel = watchtowerLevel >= SENTINEL.COMPOSITION_INTEL_LEVEL;
  const defense = nextIncursion ? computeDefenseAgainst(game, nextIncursion.type) : computeDefense(game);
  const morale = game.survival.morale;

  return (
    <div className="outpost" data-save-status={saveStatus}>
      <header className="topbar">
        <div className="brand">
          <RadarGlyph size={18} dim />
          <span>HEARTHOLD</span>
        </div>
        <div className="topbar-meta">
          <span
            className={power.demand === 0 ? '' : power.powered ? 'power-ok' : 'power-warn'}
            title={`Power supply ${power.supply} / demand ${power.demand} — underpowered modules run at reduced output; future defenses like Turrets and Shields will need power too`}
          >
            ⚡ {power.supply}/{power.demand}
          </span>
          <span title={`Villager cap: ${game.colonists.cap}`}>
            👤 {game.colonists.assigned}/{game.colonists.total}
          </span>
          <button className="icon-button" onClick={onOpenSettings} aria-label="Open settings">
            ⚙️
          </button>
        </div>
      </header>

      <section className="hud">
        {HUD_RESOURCES.map(({ id, icon, label }) => (
          <HudCell key={id} icon={icon} label={label} amount={game.resources[id].amount} cap={game.resources[id].cap} />
        ))}
      </section>

      {!game.settings.onboardingDismissed && (
        <p className="onboarding-banner" onClick={dismissOnboarding}>
          Tap Wood to gather it by hand, or assign villagers to your Woodcutter's Camp to produce it automatically.
          (tap to dismiss)
        </p>
      )}

      {starving && (
        <p className="starving-banner">⚠ Villagers going hungry — production reduced. Gather or build a Farm.</p>
      )}
      {!starving && power.demand > 0 && !power.powered && (
        <p className="starving-banner">⚠ Not enough power — production reduced. Build or upgrade a Windmill.</p>
      )}

      {liveBattleAlert && (
        <p
          className={`battle-alert ${liveBattleAlert.outcome === 'breached' ? 'battle-alert-breached' : 'battle-alert-repelled'}`}
          onClick={dismissLiveBattleAlert}
        >
          {liveBattleAlert.outcome === 'repelled'
            ? `⚔ ${TYPE_LABEL[liveBattleAlert.type]} raid repelled! Defense held at ${liveBattleAlert.defenseValue}. (tap to dismiss)`
            : `⚠ ${TYPE_LABEL[liveBattleAlert.type]} raid breached our defenses! ${(liveBattleAlert.damagedModuleTypes ?? []).map((t) => MODULES[t].name).join(', ')}${liveBattleAlert.damagedModuleTypes?.length ? ' damaged. ' : ''}${liveBattleAlert.colonistsLost ? `${liveBattleAlert.colonistsLost} villager${liveBattleAlert.colonistsLost === 1 ? '' : 's'} lost. ` : ''}(tap to dismiss)`}
        </p>
      )}

      {liveWorldEventAlert && (
        <p
          className={`battle-alert ${liveWorldEventAlert.type === 'caravan' ? 'battle-alert-repelled' : 'battle-alert-breached'}`}
          onClick={dismissLiveWorldEventAlert}
        >
          {WORLD_EVENT_ICON[liveWorldEventAlert.type]} {worldEventAlertText(liveWorldEventAlert)} (tap to dismiss)
        </p>
      )}

      <section className="radar panel" aria-label="Threat radar">
        {watchtower ? (
          <div className="radar-head">
            <RadarGlyph size={36} spinning />
            <div>
              <div className="radar-status radar-status-online">
                <span className="radar-dot radar-dot-online" />
                WATCHTOWER ONLINE — Lv.{watchtower.level}
              </div>
              {nextIncursion ? (
                <p className="radar-hint">
                  {roughIntelOnly ? (
                    <>Scouts spot movement — a raid is roughly {roughEtaLabel(nextIncursion.arrivalAt)} away.</>
                  ) : (
                    <>
                      {TYPE_LABEL[nextIncursion.type]} raid inbound — ETA{' '}
                      {formatDuration((nextIncursion.arrivalAt - Date.now()) / 1000)}, strength{' '}
                      {nextIncursion.strength}.
                      {compositionIntel && ` ${describeMatchup(nextIncursion.type)}`}
                      {detailedIntel &&
                        ` Your defense: ${defense} vs incoming ${nextIncursion.strength}${defense >= nextIncursion.strength ? ' — prepared.' : ' — reinforce!'}`}
                    </>
                  )}
                  {upcoming.length > 1 && ` (+${upcoming.length - 1} more scouted)`}
                </p>
              ) : (
                <p className="radar-hint">No incursions detected within scan range ({horizonHours}h).</p>
              )}
            </div>
          </div>
        ) : (
          <div className="radar-head">
            <RadarGlyph size={36} dim />
            <div>
              <div className="radar-status">
                <span className="radar-dot" />
                WATCHTOWER OFFLINE
              </div>
              <p className="radar-hint">No scan coverage.</p>
            </div>
          </div>
        )}
        <p className="radar-defense">🛡️ Defense rating: {defense}</p>
        <p
          className={`radar-morale${
            morale <= MORALE.DEFECTION_THRESHOLD ? ' radar-morale-danger' : morale <= 50 ? ' radar-morale-warn' : ''
          }`}
        >
          💗 Morale: {Math.round(morale)}/100
          {morale <= MORALE.DEFECTION_THRESHOLD ? ' — villagers are losing hope and starting to leave!' : ''}
        </p>
      </section>

      <main className="module-grid">
        {game.modules.map((module) =>
          module.type === 'trainingCamp' ? (
            <TrainingCampCard
              key={module.id}
              module={module}
              idleColonists={idleColonists}
              onTrain={(type, delta) => {
                if (delta > 0) vibrate(HAPTIC.confirm);
                setTraining(type, delta);
              }}
              onUpgrade={() => {
                vibrate(HAPTIC.confirm);
                upgradeModule(module.id);
              }}
              onRepair={() => {
                vibrate(HAPTIC.confirm);
                repairModule(module.id);
              }}
            />
          ) : (
            <ModuleCard
              key={module.id}
              module={module}
              idleColonists={idleColonists}
              onExtract={(id) => {
                vibrate(HAPTIC.tap);
                extract(id);
              }}
              onAssign={(delta) => assignWorker(module.id, delta)}
              onUpgrade={() => {
                vibrate(HAPTIC.confirm);
                upgradeModule(module.id);
              }}
              onRepair={() => {
                vibrate(HAPTIC.confirm);
                repairModule(module.id);
              }}
            />
          ),
        )}
        {hasMoreToBuild && (
          <button className="module-tile build-tile" onClick={onOpenBuildMenu}>
            <span className="module-tile-icon">＋</span>
            <span className="module-tile-sub">Build</span>
          </button>
        )}
      </main>
    </div>
  );
}

interface HudCellProps {
  icon: string;
  label: string;
  amount: number;
  cap: number;
}

function HudCell({ icon, label, amount, cap }: HudCellProps) {
  const animatedAmount = useAnimatedNumber(amount);
  const pct = Math.min(100, Math.round((animatedAmount / cap) * 100));
  return (
    <div className="hud-cell" title={label}>
      <span className="hud-icon">{icon}</span>
      <div className="hud-values">
        <span className="hud-amount">{Math.floor(animatedAmount)}</span>
        <span className="hud-cap">/{cap}</span>
      </div>
      <div className="hud-bar">
        <div className="hud-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface ModuleCardProps {
  module: GameState['modules'][number];
  idleColonists: number;
  onExtract: (resourceId: ResourceId) => void;
  onAssign: (delta: number) => void;
  onUpgrade: () => void;
  onRepair: () => void;
}

function ModuleCard({ module, idleColonists, onExtract, onAssign, onUpgrade, onRepair }: ModuleCardProps) {
  const game = useGameStore((s) => s.game);
  const def = MODULES[module.type];
  const hasProduction = 'produces' in def && 'ratePerWorker' in def;
  // Training Camp renders via TrainingCampCard instead. The Watchtower also
  // has maxWorkers but no production -- its workers are Scouts (see
  // SENTINEL.PEEK_COUNT_PER_SCOUT), still a plain assign/unassign stepper.
  const hasWorkerSlots = 'maxWorkers' in def;
  const maxWorkers = hasWorkerSlots ? effectiveMaxWorkers(def.maxWorkers, module.level, game.colonists.total) : 0;
  const ratePerWorker = hasProduction ? productionAtLevel(def.ratePerWorker, module.level) : 0;
  // Actual rate, not the nominal one — factors in the current hunger/power
  // throttle so this matches what the player is really accruing per second,
  // not an inflated best-case number (a fresh colony starts underpowered).
  const totalRate = hasProduction ? ratePerWorker * module.assignedWorkers * currentProductionMultiplier(game) : 0;
  const resourceId = hasProduction ? (def.produces as ResourceId) : null;
  const tapYield = resourceId ? (MANUAL_TAP_YIELD as Partial<Record<ResourceId, number>>)[resourceId] : undefined;
  const atCap = resourceId ? game.resources[resourceId].amount >= game.resources[resourceId].cap : false;

  const icon = resourceId ? RESOURCE_ICON[resourceId] : (UTILITY_ICON[module.type] ?? '🏗️');

  const needsPower = 'powerDemand' in def && def.powerDemand > 0;
  const powered = computePower(game).powered;
  // A Shield Generator goes fully dead when unpowered; other powered
  // defenses just throttle, same rule as production.
  const defensePowerFactor = !needsPower || powered ? 1 : module.type === 'shieldGen' ? 0 : POWER.UNDERPOWERED_THROTTLE;

  let effect: string;
  if (module.damaged) {
    effect = '⚠ Damaged — repair to restore';
  } else if (hasProduction) {
    effect = totalRate > 0 ? `+${totalRate.toFixed(2)}/s` : 'Idle — assign a villager';
  } else if ('capBonusAll' in def) {
    effect = `+${def.capBonusAll * module.level} all storage caps`;
  } else if ('colonistCapBonus' in def) {
    effect = `+${def.colonistCapBonus * module.level} villager cap`;
  } else if ('energyOutput' in def) {
    effect = `+${def.energyOutput * module.level} power supply`;
  } else if (module.type === 'sentinelArray') {
    effect =
      module.assignedWorkers > 0
        ? `${module.assignedWorkers} Scout${module.assignedWorkers === 1 ? '' : 's'} watching the horizon`
        : 'No scouts assigned';
  } else if ('defenseValue' in def) {
    // passive defense module (Ballista/Palisade/Ward Stone)
    effect =
      defensePowerFactor === 0
        ? 'Unpowered — inactive'
        : `+${Math.round(def.defenseValue * module.level * defensePowerFactor)} defense`;
  } else {
    effect = '';
  }

  const upgradeCost = getModuleCost(module.type, module.level + 1);
  const canUpgrade = canAfford(game, upgradeCost);
  const repairCost = getRepairCost(module.type);
  const canRepair = canAfford(game, repairCost);

  return (
    <div className={`module-tile module-card panel${module.damaged ? ' module-card-damaged' : ''}`}>
      <div className="module-card-head">
        <span className="module-tile-icon">{icon}</span>
        <div className="module-card-title">
          <span>
            {def.name} <span className="module-card-level">Lv.{module.level}</span>
          </span>
          <span className="module-tile-sub">{effect}</span>
        </div>
      </div>

      {hasWorkerSlots && !module.damaged && (
        <div className="stepper-row">
          <span className="module-tile-sub">{hasProduction ? 'Villagers' : 'Scouts'}</span>
          <div className="stepper">
            <button
              className="stepper-btn"
              onClick={() => onAssign(-1)}
              disabled={module.assignedWorkers <= 0}
              aria-label={hasProduction ? 'Unassign a villager' : 'Unassign a scout'}
            >
              −
            </button>
            <span className="stepper-value">
              {module.assignedWorkers}/{maxWorkers}
            </span>
            <button
              className="stepper-btn"
              onClick={() => onAssign(1)}
              disabled={module.assignedWorkers >= maxWorkers || idleColonists <= 0}
              aria-label={hasProduction ? 'Assign a villager' : 'Assign a scout'}
            >
              +
            </button>
          </div>
        </div>
      )}

      {!module.damaged && tapYield !== undefined && resourceId && (
        <button className="module-card-tap" onClick={() => onExtract(resourceId)} disabled={atCap}>
          {atCap ? 'Storage full' : `Tap to gather +${tapYield}`}
        </button>
      )}

      {module.damaged ? (
        <button className="module-card-tap" onClick={onRepair} disabled={!canRepair}>
          Repair —{' '}
          {(Object.entries(repairCost) as Array<[ResourceId, number]>)
            .map(([id, amount]) => `${RESOURCE_ICON[id] ?? ''}${amount}`)
            .join(' ')}
        </button>
      ) : (
        <button className="module-card-tap" onClick={onUpgrade} disabled={!canUpgrade}>
          Upgrade to Lv.{module.level + 1} —{' '}
          {(Object.entries(upgradeCost) as Array<[ResourceId, number]>)
            .map(([id, amount]) => `${RESOURCE_ICON[id] ?? ''}${amount}`)
            .join(' ')}
        </button>
      )}
    </div>
  );
}

interface TrainingCampCardProps {
  module: GameState['modules'][number];
  idleColonists: number;
  onTrain: (type: TroopType, delta: number) => void;
  onUpgrade: () => void;
  onRepair: () => void;
}

/** Training Camp doesn't fit the generic worker-slot card: assigning a
 *  villager here starts a timed training order (see engine/military.ts),
 *  not an instant defense contribution — they're worthless until the
 *  order completes, by design ("prepare before the raid, not during it").
 *  Once trained, they become permanent standing troops independent of
 *  this module's own slots (those just cap concurrent training). */
function TrainingCampCard({ module, idleColonists, onTrain, onUpgrade, onRepair }: TrainingCampCardProps) {
  const game = useGameStore((s) => s.game);
  const def = MODULES.trainingCamp;
  const maxWorkers = effectiveMaxWorkers(def.maxWorkers, module.level, game.colonists.total);
  const inProgress = trainingInProgressCount(game);
  const slotsLeft = maxWorkers - inProgress;

  const upgradeCost = getModuleCost('trainingCamp', module.level + 1);
  const canUpgrade = canAfford(game, upgradeCost);
  const repairCost = getRepairCost('trainingCamp');
  const canRepair = canAfford(game, repairCost);

  const orderFor = (type: TroopType) => game.military.training.find((o) => o.type === type);

  return (
    <div className={`module-tile module-card panel${module.damaged ? ' module-card-damaged' : ''}`}>
      <div className="module-card-head">
        <span className="module-tile-icon">{UTILITY_ICON.trainingCamp}</span>
        <div className="module-card-title">
          <span>
            {def.name} <span className="module-card-level">Lv.{module.level}</span>
          </span>
          <span className="module-tile-sub">
            {module.damaged
              ? '⚠ Damaged — repair to restore'
              : `${TROOP_ICON.soldier} ${game.military.soldiers} ${TROOP_LABEL.soldier}  ${TROOP_ICON.archer} ${game.military.archers} ${TROOP_LABEL.archer}`}
          </span>
        </div>
      </div>

      {!module.damaged && (
        <>
          <p className="module-tile-sub">
            Training slots: {inProgress}/{maxWorkers}
          </p>
          {(['soldier', 'archer'] as const).map((type) => {
            const order = orderFor(type);
            return (
              <div className="stepper-row" key={type}>
                <span className="module-tile-sub">
                  {TROOP_ICON[type]} Train {TROOP_LABEL[type]}
                  {order ? ` — ready in ${formatDuration((order.completesAt - Date.now()) / 1000)}` : ''}
                </span>
                <div className="stepper">
                  <button
                    className="stepper-btn"
                    onClick={() => onTrain(type, -1)}
                    disabled={!order || order.count <= 0}
                    aria-label={`Cancel a villager training as a ${type}`}
                  >
                    −
                  </button>
                  <span className="stepper-value">{order?.count ?? 0}</span>
                  <button
                    className="stepper-btn"
                    onClick={() => onTrain(type, 1)}
                    disabled={idleColonists <= 0 || slotsLeft <= 0}
                    aria-label={`Assign a villager to train as a ${type}`}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {module.damaged ? (
        <button className="module-card-tap" onClick={onRepair} disabled={!canRepair}>
          Repair —{' '}
          {(Object.entries(repairCost) as Array<[ResourceId, number]>)
            .map(([id, amount]) => `${RESOURCE_ICON[id] ?? ''}${amount}`)
            .join(' ')}
        </button>
      ) : (
        <button className="module-card-tap" onClick={onUpgrade} disabled={!canUpgrade}>
          Upgrade to Lv.{module.level + 1} —{' '}
          {(Object.entries(upgradeCost) as Array<[ResourceId, number]>)
            .map(([id, amount]) => `${RESOURCE_ICON[id] ?? ''}${amount}`)
            .join(' ')}
        </button>
      )}
    </div>
  );
}
