/**
 * Outpost (home) screen: resource HUD, threat radar, and the module grid.
 * The module grid renders every built module (production or utility) plus
 * a "+ Build" tile opening the build menu when anything's left to place.
 */
import { useGameStore } from '../state/store';
import { INCURSIONS, MANUAL_TAP_YIELD, MODULES, POWER, SENTINEL, productionAtLevel } from '../config/halcyon-config';
import { BUILDABLE_MODULE_TYPES, canAfford, getModuleCost, getRepairCost } from '../engine/build';
import { computeDefense, computeDefenseAgainst } from '../engine/defense';
import { peekUpcomingIncursions } from '../engine/incursions';
import { computePower } from '../engine/power';
import { currentProductionMultiplier } from '../engine/tick';
import { formatDuration } from './format';
import { RadarGlyph } from './RadarGlyph';
import type { GameState, IncursionType, ModuleType, ResourceId } from '../engine/types';

const TYPE_LABEL: Record<IncursionType, string> = {
  swarm: 'Swarm',
  armored: 'Armored',
  raiders: 'Raiders',
};

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
  turret: '🏹',
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
  const liveBattleAlert = useGameStore((s) => s.liveBattleAlert);
  const dismissLiveBattleAlert = useGameStore((s) => s.dismissLiveBattleAlert);

  const starving = game.resources.rations.amount <= 0;
  const idleColonists = game.colonists.total - game.colonists.assigned;
  const power = computePower(game);
  const hasMoreToBuild = BUILDABLE_MODULE_TYPES.some((type) => !game.modules.some((m) => m.type === type));

  const watchtower = game.modules.find((m) => m.type === 'sentinelArray' && !m.damaged);
  const horizonHours = watchtower ? (SENTINEL.HORIZON_HOURS_BY_LEVEL[watchtower.level] ?? 0) : 0;
  const nextIncursion = watchtower
    ? peekUpcomingIncursions(game, Date.now() + horizonHours * 3600 * 1000, 1)[0]
    : undefined;
  const detailedIntel = (watchtower?.level ?? 0) >= SENTINEL.DETAILED_INTEL_LEVEL;
  const defense = nextIncursion ? computeDefenseAgainst(game, nextIncursion.type) : computeDefense(game);

  return (
    <div className="outpost">
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
          <span className={`save-pill save-${saveStatus}`}>
            {saveStatus === 'saved' ? '● saved' : saveStatus === 'dirty' ? '○ saving…' : '… loading'}
          </span>
          <button className="icon-button" onClick={onOpenSettings} aria-label="Open settings">
            ⚙️
          </button>
        </div>
      </header>

      <section className="hud">
        {HUD_RESOURCES.map(({ id, icon, label }) => {
          const { amount, cap } = game.resources[id];
          const pct = Math.min(100, Math.round((amount / cap) * 100));
          return (
            <div className="hud-cell" key={id} title={label}>
              <span className="hud-icon">{icon}</span>
              <div className="hud-values">
                <span className="hud-amount">{Math.floor(amount)}</span>
                <span className="hud-cap">/{cap}</span>
              </div>
              <div className="hud-bar">
                <div className="hud-bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </section>

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
            : `⚠ ${TYPE_LABEL[liveBattleAlert.type]} raid breached our defenses! ${liveBattleAlert.damagedModuleType ? `${MODULES[liveBattleAlert.damagedModuleType].name} damaged. ` : ''}(tap to dismiss)`}
        </p>
      )}

      <section className="radar panel" aria-label="Threat radar">
        {watchtower ? (
          <div className="radar-head">
            <RadarGlyph size={36} />
            <div>
              <div className="radar-status radar-status-online">
                <span className="radar-dot radar-dot-online" />
                WATCHTOWER ONLINE — Lv.{watchtower.level}
              </div>
              {nextIncursion ? (
                <p className="radar-hint">
                  {TYPE_LABEL[nextIncursion.type]} raid inbound — ETA{' '}
                  {formatDuration((nextIncursion.arrivalAt - Date.now()) / 1000)}, strength {nextIncursion.strength}.
                  {detailedIntel &&
                    ` Your defense: ${defense} vs incoming ${nextIncursion.strength}${defense >= nextIncursion.strength ? ' — prepared.' : ' — reinforce!'}`}
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
              <p className="radar-hint">No scan coverage — build a Watchtower to spot raiders coming.</p>
            </div>
          </div>
        )}
        <p className="radar-defense">
          🛡️ Defense rating: {defense} — assign villagers to a Training Camp, or build a Ballista, Palisade, or Ward
          Stone to arm your defenses.
        </p>
      </section>

      <main className="module-grid">
        {game.modules.map((module) => (
          <ModuleCard
            key={module.id}
            module={module}
            idleColonists={idleColonists}
            onExtract={extract}
            onAssign={(delta) => assignWorker(module.id, delta)}
            onUpgrade={() => upgradeModule(module.id)}
            onRepair={() => repairModule(module.id)}
          />
        ))}
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
  const hasWorkers = 'maxWorkers' in def;
  const maxWorkers = 'maxWorkers' in def ? def.maxWorkers : 0;
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
  } else if (hasWorkers) {
    // defense module (e.g. Training Camp): assigned villagers become defenders
    effect =
      module.assignedWorkers > 0
        ? `+${Math.round(module.assignedWorkers * INCURSIONS.DEFENDER_VALUE_PER_COLONIST * defensePowerFactor)} defense`
        : 'Idle — assign a villager';
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

      {hasWorkers && !module.damaged && (
        <div className="stepper-row">
          <span className="module-tile-sub">{hasProduction ? 'Villagers' : 'Defenders'}</span>
          <div className="stepper">
            <button
              className="stepper-btn"
              onClick={() => onAssign(-1)}
              disabled={module.assignedWorkers <= 0}
              aria-label="Unassign a villager"
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
              aria-label="Assign a villager"
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
