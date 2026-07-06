/**
 * Phase 0 placeholder outpost screen: real HUD layout fed by the real store
 * and save, with the systems that arrive in later phases shown as offline.
 */
import type { CSSProperties } from 'react';
import { useGameStore } from '../state/store';
import { RadarGlyph } from './RadarGlyph';
import type { ResourceId } from '../engine/types';

const HUD_RESOURCES: Array<{ id: ResourceId; icon: string; label: string; accent: string }> = [
  { id: 'scrap', icon: '🔩', label: 'Scrap', accent: '#c9915a' },
  { id: 'ore', icon: '⛏️', label: 'Ore', accent: '#7fa8cc' },
  { id: 'rations', icon: '🥫', label: 'Rations', accent: '#7ed9a0' },
  { id: 'exotic', icon: '🔷', label: 'Exotic', accent: '#b48cff' },
];

export function OutpostScreen() {
  const game = useGameStore((s) => s.game);
  const saveStatus = useGameStore((s) => s.saveStatus);
  const storagePersisted = useGameStore((s) => s.storagePersisted);

  return (
    <div className="outpost">
      <header className="topbar">
        <div className="brand">
          <RadarGlyph size={18} dim />
          <span>HALCYON</span>
        </div>
        <div className="topbar-meta">
          <span>☀️ Day {game.survival.dayCount + 1}</span>
          <span>
            👤 {game.colonists.total}/{game.colonists.cap}
          </span>
        </div>
      </header>

      <section className="hud">
        {HUD_RESOURCES.map(({ id, icon, label, accent }) => {
          const { amount, cap } = game.resources[id];
          const pct = Math.min(100, Math.round((amount / cap) * 100));
          return (
            <div
              className="hud-cell"
              key={id}
              title={label}
              style={{ '--accent': accent } as CSSProperties}
            >
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

      <section className="radar panel bracket" aria-label="Threat radar">
        <div className="radar-head">
          <RadarGlyph size={36} dim />
          <div>
            <div className="radar-status">
              <span className="radar-dot" />
              SENTINEL OFFLINE
            </div>
            <p className="radar-hint">No scan coverage — build a Sentinel Array to detect incursions.</p>
          </div>
        </div>
      </section>

      <main className="module-grid">
        <div className="module-tile placeholder panel bracket">
          <span className="module-tile-icon">🏗️</span>
          <span>Outpost founded</span>
          <span className="module-tile-sub">Construction systems come online in Phase 1</span>
        </div>
        <div className="module-tile empty">
          <span className="module-tile-icon dim">🔒</span>
          <span className="module-tile-sub">Unlocks soon</span>
        </div>
        <div className="module-tile empty">
          <span className="module-tile-icon dim">🔒</span>
          <span className="module-tile-sub">Unlocks soon</span>
        </div>
        <div className="module-tile empty">
          <span className="module-tile-icon dim">🔒</span>
          <span className="module-tile-sub">Unlocks soon</span>
        </div>
      </main>

      <footer className="status-bar">
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
