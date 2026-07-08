import { MODULES } from '../config/halcyon-config';
import { useGameStore } from '../state/store';
import type { Incursion, ResourceId, WorldEvent, WorldEventType } from '../engine/types';
import { formatDuration } from './format';

const RESOURCE_META: Record<ResourceId, { icon: string; label: string }> = {
  scrap: { icon: '🪵', label: 'Wood' },
  ore: { icon: '🪨', label: 'Stone' },
  rations: { icon: '🍞', label: 'Food' },
  exotic: { icon: '🔮', label: 'Mana' },
  alloy: { icon: '⚒️', label: 'Iron' },
  components: { icon: '🔧', label: 'Tools' },
};

const TYPE_LABEL: Record<Incursion['type'], string> = {
  swarm: 'Swarm',
  armored: 'Armored',
  raiders: 'Raiders',
};

function battleLine(incursion: Incursion): string {
  const typeLabel = TYPE_LABEL[incursion.type];
  if (incursion.outcome === 'repelled') {
    return `${typeLabel} raid (strength ${incursion.strength}) — repelled, defense held at ${incursion.defenseValue}.`;
  }
  const lossParts = Object.entries(incursion.resourceLosses ?? {})
    .map(([id, amount]) => `${RESOURCE_META[id as ResourceId].icon}${Math.round(amount as number)}`)
    .join(' ');
  const damage = incursion.damagedModuleType ? `; ${MODULES[incursion.damagedModuleType].name} damaged` : '';
  return `${typeLabel} raid (strength ${incursion.strength}) — BREACHED, defense only ${incursion.defenseValue}. Lost ${lossParts || 'nothing stored'}${damage}.`;
}

const WORLD_EVENT_ICON: Record<WorldEventType, string> = {
  blight: '🥀',
  fire: '🔥',
  plague: '🤒',
  theft: '🗡️',
  caravan: '🐎',
};

function worldEventLine(event: WorldEvent): string {
  const lossParts = Object.entries(event.resourceLosses ?? {})
    .map(([id, amount]) => `${RESOURCE_META[id as ResourceId].icon}${Math.round(amount as number)}`)
    .join(' ');
  const gainParts = Object.entries(event.resourceGains ?? {})
    .map(([id, amount]) => `${RESOURCE_META[id as ResourceId].icon}${Math.round(amount as number)}`)
    .join(' ');
  switch (event.type) {
    case 'blight':
      return `Blight ruined the harvest. Lost ${lossParts || 'nothing stored'}.`;
    case 'fire':
      return `A fire broke out${event.damagedModuleType ? `, damaging the ${MODULES[event.damagedModuleType].name}` : ''}.`;
    case 'plague':
      return `Illness swept through the village.${event.colonistLost ? ' A villager was lost.' : ''}`;
    case 'theft':
      return `Bandits pilfered supplies in the night. Lost ${lossParts || 'nothing stored'}.`;
    case 'caravan':
      return `A trading caravan passed through, trading generously. Gained ${gainParts || 'nothing'}.`;
  }
}

export function OfflineSummaryModal() {
  const summary = useGameStore((s) => s.offlineSummary);
  const dismiss = useGameStore((s) => s.dismissOfflineSummary);
  if (!summary) return null;

  const deltas = Object.entries(summary.resourceDeltas) as Array<[ResourceId, number]>;

  return (
    <div className="settings-overlay" onClick={dismiss}>
      <div className="settings-sheet panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span>WHILE YOU WERE AWAY</span>
          <button className="icon-button" onClick={dismiss} aria-label="Close summary">
            ✕
          </button>
        </div>
        <p className="offline-elapsed">{formatDuration(summary.elapsedSeconds)} elapsed</p>
        <div className="offline-deltas">
          {deltas.length === 0 && <p className="module-tile-sub">Nothing changed while you were away.</p>}
          {deltas.map(([id, delta]) => (
            <div className="offline-delta-row" key={id}>
              <span>
                {RESOURCE_META[id].icon} {RESOURCE_META[id].label}
              </span>
              <span className={delta >= 0 ? 'delta-positive' : 'delta-negative'}>
                {delta >= 0 ? '+' : ''}
                {Math.round(delta)}
              </span>
            </div>
          ))}
        </div>
        {summary.battleReport.length > 0 && (
          <div className="battle-report">
            <p className="module-tile-sub">Battle report</p>
            {summary.battleReport.map((incursion) => (
              <p
                key={incursion.id}
                className={incursion.outcome === 'breached' ? 'battle-breached' : 'battle-repelled'}
              >
                {battleLine(incursion)}
              </p>
            ))}
          </div>
        )}
        {summary.worldEventReport.length > 0 && (
          <div className="battle-report">
            <p className="module-tile-sub">World events</p>
            {summary.worldEventReport.map((event) => (
              <p key={event.id} className={event.type === 'caravan' ? 'battle-repelled' : 'battle-breached'}>
                {WORLD_EVENT_ICON[event.type]} {worldEventLine(event)}
              </p>
            ))}
          </div>
        )}
        <button className="module-card-tap" onClick={dismiss}>
          Continue
        </button>
      </div>
    </div>
  );
}
