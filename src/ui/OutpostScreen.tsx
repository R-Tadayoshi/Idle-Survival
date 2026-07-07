/**
 * Outpost (home) screen: resource HUD, threat radar, and the module grid.
 * The module grid renders every built module (production or utility) plus
 * a "+ Build" tile opening the build menu when anything's left to place.
 */
import { useGameStore } from '../state/store';
import { MANUAL_TAP_YIELD, MODULES, productionAtLevel } from '../config/halcyon-config';
import { BUILDABLE_MODULE_TYPES, canAfford, getModuleCost } from '../engine/build';
import { computePower } from '../engine/power';
import { RadarGlyph } from './RadarGlyph';
import type { GameState, ModuleType, ResourceId } from '../engine/types';

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
};

interface OutpostScreenProps {
  onOpenSettings: () => void;
  onOpenBuildMenu: () => void;
}

export function OutpostScreen({ onOpenSettings, onOpenBuildMenu }: OutpostScreenProps) {
  const game = useGameStore((s) => s.game);
  const saveStatus = useGameStore((s) => s.saveStatus);
  const storagePersisted = useGameStore((s) => s.storagePersisted);
  const extract = useGameStore((s) => s.extract);
  const assignWorker = useGameStore((s) => s.assignWorker);
  const upgradeModule = useGameStore((s) => s.upgradeModule);

  const starving = game.resources.rations.amount <= 0;
  const idleColonists = game.colonists.total - game.colonists.assigned;
  const power = computePower(game);
  const hasMoreToBuild = BUILDABLE_MODULE_TYPES.some((type) => !game.modules.some((m) => m.type === type));

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
            title={`Power supply ${power.supply} / demand ${power.demand}`}
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

      <section className="radar panel" aria-label="Threat radar">
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
          />
        ))}
        {hasMoreToBuild && (
          <button className="module-tile build-tile" onClick={onOpenBuildMenu}>
            <span className="module-tile-icon">＋</span>
            <span className="module-tile-sub">Build</span>
          </button>
        )}
      </main>

      <footer className="status-bar">
        <span className={`save-pill save-${saveStatus}`}>
          {saveStatus === 'saved' ? '● saved' : saveStatus === 'dirty' ? '○ saving…' : '… loading'}
        </span>
        <span
          className={`status-pill${storagePersisted === true ? ' ok' : storagePersisted === false ? ' warn' : ''}`}
          title="Persistent storage granted by the browser"
        >
          {storagePersisted === null ? '…' : '●'} storage
        </span>
      </footer>
    </div>
  );
}

interface ModuleCardProps {
  module: GameState['modules'][number];
  idleColonists: number;
  onExtract: (resourceId: ResourceId) => void;
  onAssign: (delta: number) => void;
  onUpgrade: () => void;
}

function ModuleCard({ module, idleColonists, onExtract, onAssign, onUpgrade }: ModuleCardProps) {
  const game = useGameStore((s) => s.game);
  const def = MODULES[module.type];
  const hasProduction = 'produces' in def && 'ratePerWorker' in def;
  const maxWorkers = 'maxWorkers' in def ? def.maxWorkers : 0;
  const ratePerWorker = hasProduction ? productionAtLevel(def.ratePerWorker, module.level) : 0;
  const totalRate = ratePerWorker * module.assignedWorkers;
  const resourceId = hasProduction ? (def.produces as ResourceId) : null;
  const tapYield = resourceId ? (MANUAL_TAP_YIELD as Partial<Record<ResourceId, number>>)[resourceId] : undefined;
  const atCap = resourceId ? game.resources[resourceId].amount >= game.resources[resourceId].cap : false;

  const icon = resourceId ? RESOURCE_ICON[resourceId] : (UTILITY_ICON[module.type] ?? '🏗️');

  let effect: string;
  if (hasProduction) {
    effect = totalRate > 0 ? `+${totalRate.toFixed(2)}/s` : 'Idle — assign a villager';
  } else if ('capBonusAll' in def) {
    effect = `+${def.capBonusAll * module.level} all storage caps`;
  } else if ('colonistCapBonus' in def) {
    effect = `+${def.colonistCapBonus * module.level} villager cap`;
  } else if ('energyOutput' in def) {
    effect = `+${def.energyOutput * module.level} power supply`;
  } else {
    effect = '';
  }

  const upgradeCost = getModuleCost(module.type, module.level + 1);
  const canUpgrade = canAfford(game, upgradeCost);

  return (
    <div className="module-tile module-card panel">
      <div className="module-card-head">
        <span className="module-tile-icon">{icon}</span>
        <div className="module-card-title">
          <span>
            {def.name} <span className="module-card-level">Lv.{module.level}</span>
          </span>
          <span className="module-tile-sub">{effect}</span>
        </div>
      </div>

      {hasProduction && (
        <div className="stepper-row">
          <span className="module-tile-sub">Villagers</span>
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

      {tapYield !== undefined && resourceId && (
        <button className="module-card-tap" onClick={() => onExtract(resourceId)} disabled={atCap}>
          {atCap ? 'Storage full' : `Tap to gather +${tapYield}`}
        </button>
      )}

      <button className="module-card-tap" onClick={onUpgrade} disabled={!canUpgrade}>
        Upgrade to Lv.{module.level + 1} —{' '}
        {(Object.entries(upgradeCost) as Array<[ResourceId, number]>)
          .map(([id, amount]) => `${RESOURCE_ICON[id] ?? ''}${amount}`)
          .join(' ')}
      </button>
    </div>
  );
}
