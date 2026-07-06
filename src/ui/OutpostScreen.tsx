/**
 * Phase 0 placeholder outpost screen: real HUD layout fed by the real store
 * and save, with the systems that arrive in later phases shown as offline.
 */
import { useGameStore } from '../state/store';
import type { ResourceId } from '../engine/types';

const HUD_RESOURCES: Array<{ id: ResourceId; icon: string; label: string }> = [
  { id: 'scrap', icon: '🔩', label: 'Scrap' },
  { id: 'ore', icon: '⛏️', label: 'Ore' },
  { id: 'rations', icon: '🥫', label: 'Rations' },
  { id: 'exotic', icon: '🔷', label: 'Exotic' },
];

export function OutpostScreen() {
  const game = useGameStore((s) => s.game);
  const saveStatus = useGameStore((s) => s.saveStatus);
  const storagePersisted = useGameStore((s) => s.storagePersisted);

  return (
    <div className="outpost">
      <header className="hud">
        {HUD_RESOURCES.map(({ id, icon, label }) => (
          <div className="hud-cell" key={id} title={label}>
            <span className="hud-icon">{icon}</span>
            <span className="hud-amount">{Math.floor(game.resources[id].amount)}</span>
            <span className="hud-cap">/{game.resources[id].cap}</span>
          </div>
        ))}
      </header>

      <section className="radar" aria-label="Threat radar">
        <div className="radar-status">
          <span className="radar-dot" />
          SENTINEL OFFLINE
        </div>
        <p className="radar-hint">No scan coverage. Build a Sentinel Array to detect incursions.</p>
      </section>

      <main className="module-grid">
        <div className="module-tile placeholder">
          <span className="module-tile-icon">🏗️</span>
          <span>Outpost founded</span>
          <span className="module-tile-sub">Construction systems come online in Phase 1</span>
        </div>
        <div className="module-tile empty" aria-hidden="true" />
        <div className="module-tile empty" aria-hidden="true" />
        <div className="module-tile empty" aria-hidden="true" />
      </main>

      <footer className="status-bar">
        <span>
          👤 {game.colonists.total}/{game.colonists.cap}
        </span>
        <span>☀️ Day {game.survival.dayCount + 1}</span>
        <span className={`save-pill save-${saveStatus}`}>
          {saveStatus === 'saved' ? '● saved' : saveStatus === 'dirty' ? '○ saving…' : '… loading'}
        </span>
        <span title="Persistent storage granted by the browser">
          {storagePersisted === null ? '⏳' : storagePersisted ? '🔒' : '⚠️'} storage
        </span>
      </footer>
    </div>
  );
}
