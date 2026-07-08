/**
 * A record of everything that's happened to the colony — raids and random
 * world events, merged into one timeline. Kept in its own screen (not the
 * main outpost view) specifically so any lore/explanation lives here
 * instead of crowding the compact panels above.
 */
import { MODULES } from '../config/halcyon-config';
import { useGameStore } from '../state/store';
import { formatDuration } from './format';
import type { Incursion, IncursionType, ResourceId, WorldEvent, WorldEventType } from '../engine/types';

const RESOURCE_ICON: Record<ResourceId, string> = {
  scrap: '🪵',
  ore: '🪨',
  rations: '🍞',
  exotic: '🔮',
  alloy: '⚒️',
  components: '🔧',
};

const INCURSION_TYPE_LABEL: Record<IncursionType, string> = {
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

const WORLD_EVENT_TITLE: Record<WorldEventType, string> = {
  blight: 'Blight',
  fire: 'Fire',
  plague: 'Plague',
  theft: 'Bandit theft',
  caravan: 'Trading caravan',
};

/** Random world events have no counter-play — no building or defense stops
 *  one from landing, unlike a raid. That's the whole point of them. */
const WORLD_EVENT_EXPLANATION: Record<WorldEventType, string> = {
  blight: 'A bad harvest ruins part of your food stock. Nothing prevents this — it just happens sometimes.',
  fire: 'An accidental fire damages a random building, same as a raid breach would.',
  plague: "Illness saps morale, and has a chance of costing a villager outright.",
  theft: 'Bandits slip in overnight and make off with some wood and stone.',
  caravan: 'A rare bit of good fortune — a passing trader leaves behind extra wood and stone.',
};

function resourceList(amounts: Partial<Record<ResourceId, number>> | undefined): string {
  return Object.entries(amounts ?? {})
    .map(([id, amount]) => `${RESOURCE_ICON[id as ResourceId]}${Math.round(amount as number)}`)
    .join(' ');
}

function incursionLine(incursion: Incursion): string {
  const label = INCURSION_TYPE_LABEL[incursion.type];
  if (incursion.outcome === 'repelled') {
    return `${label} raid (strength ${incursion.strength}) — repelled, defense held at ${incursion.defenseValue}.`;
  }
  const losses = resourceList(incursion.resourceLosses);
  const damage = incursion.damagedModuleType ? `; ${MODULES[incursion.damagedModuleType].name} damaged` : '';
  return `${label} raid (strength ${incursion.strength}) — breached, defense only ${incursion.defenseValue}. Lost ${losses || 'nothing stored'}${damage}.`;
}

function worldEventLine(event: WorldEvent): string {
  const losses = resourceList(event.resourceLosses);
  const gains = resourceList(event.resourceGains);
  switch (event.type) {
    case 'blight':
      return `Blight ruined the harvest. Lost ${losses || 'nothing stored'}.`;
    case 'fire':
      return `A fire broke out${event.damagedModuleType ? `, damaging the ${MODULES[event.damagedModuleType].name}` : ''}.`;
    case 'plague':
      return `Illness swept through the village.${event.colonistLost ? ' A villager was lost.' : ''}`;
    case 'theft':
      return `Bandits pilfered supplies in the night. Lost ${losses || 'nothing stored'}.`;
    case 'caravan':
      return `A trading caravan passed through, trading generously. Gained ${gains || 'nothing'}.`;
  }
}

type TimelineEntry =
  | { kind: 'incursion'; arrivalAt: number; id: string; incursion: Incursion }
  | { kind: 'worldEvent'; arrivalAt: number; id: string; event: WorldEvent };

interface ChronicleScreenProps {
  onClose: () => void;
}

export function ChronicleScreen({ onClose }: ChronicleScreenProps) {
  const incursions = useGameStore((s) => s.game.incursions);
  const worldEvents = useGameStore((s) => s.game.worldEvents);

  const timeline: TimelineEntry[] = [
    ...incursions.map((incursion): TimelineEntry => ({ kind: 'incursion', arrivalAt: incursion.arrivalAt, id: incursion.id, incursion })),
    ...worldEvents.map((event): TimelineEntry => ({ kind: 'worldEvent', arrivalAt: event.arrivalAt, id: event.id, event })),
  ].sort((a, b) => b.arrivalAt - a.arrivalAt);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-sheet panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span>CHRONICLE</span>
          <button className="icon-button" onClick={onClose} aria-label="Close chronicle">
            ✕
          </button>
        </div>

        <p className="chronicle-intro">
          Everything recorded to have happened to Hearthold — raids your Watchtower detected, and random world events
          that no building can prevent.
        </p>

        {timeline.length === 0 ? (
          <p className="module-tile-sub">Nothing has happened yet.</p>
        ) : (
          <div className="chronicle-list">
            {timeline.map((entry) => (
              <div className="chronicle-entry" key={entry.id}>
                <span className="chronicle-entry-icon">
                  {entry.kind === 'incursion' ? '⚔️' : WORLD_EVENT_ICON[entry.event.type]}
                </span>
                <div className="chronicle-entry-body">
                  <p
                    className={
                      entry.kind === 'incursion'
                        ? entry.incursion.outcome === 'breached'
                          ? 'battle-breached'
                          : 'battle-repelled'
                        : entry.event.type === 'caravan'
                          ? 'battle-repelled'
                          : 'battle-breached'
                    }
                  >
                    {entry.kind === 'incursion' ? incursionLine(entry.incursion) : worldEventLine(entry.event)}
                  </p>
                  <span className="chronicle-entry-time">{formatDuration((Date.now() - entry.arrivalAt) / 1000)} ago</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="chronicle-legend-title">World events explained</p>
        <div className="chronicle-legend">
          {(Object.keys(WORLD_EVENT_TITLE) as WorldEventType[]).map((type) => (
            <div className="chronicle-legend-row" key={type}>
              <span className="chronicle-entry-icon">{WORLD_EVENT_ICON[type]}</span>
              <div>
                <p className="chronicle-legend-name">{WORLD_EVENT_TITLE[type]}</p>
                <p className="module-tile-sub">{WORLD_EVENT_EXPLANATION[type]}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
