import { useGameStore } from '../state/store';
import { BUILDABLE_MODULE_TYPES, canAfford, getModuleCost } from '../engine/build';
import { MODULES } from '../config/halcyon-config';
import type { ResourceId } from '../engine/types';

const RESOURCE_ICON: Record<ResourceId, string> = {
  scrap: '🔩',
  ore: '⛏️',
  rations: '🥫',
  exotic: '🔷',
  alloy: '🧱',
  components: '🔧',
};

interface BuildMenuScreenProps {
  onClose: () => void;
}

export function BuildMenuScreen({ onClose }: BuildMenuScreenProps) {
  const game = useGameStore((s) => s.game);
  const buildModule = useGameStore((s) => s.buildModule);

  const available = BUILDABLE_MODULE_TYPES.filter((type) => !game.modules.some((m) => m.type === type));

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-sheet panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span>BUILD</span>
          <button className="icon-button" onClick={onClose} aria-label="Close build menu">
            ✕
          </button>
        </div>
        <div className="build-list">
          {available.length === 0 && <p className="module-tile-sub">Everything here is built. More to come.</p>}
          {available.map((type) => {
            const def = MODULES[type];
            const cost = getModuleCost(type, 1);
            const affordable = canAfford(game, cost);
            return (
              <button
                key={type}
                className="build-row"
                disabled={!affordable}
                onClick={() => {
                  buildModule(type);
                  onClose();
                }}
              >
                <span className="build-row-name">{def.name}</span>
                <span className="build-row-cost">
                  {(Object.entries(cost) as Array<[ResourceId, number]>).map(([id, amount]) => (
                    <span key={id} className={game.resources[id].amount >= amount ? '' : 'cost-insufficient'}>
                      {RESOURCE_ICON[id]}
                      {amount}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
