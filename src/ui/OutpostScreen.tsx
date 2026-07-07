/**
 * Outpost (home) screen: resource HUD, threat radar, and the module grid.
 * Modules/build menu arrive in Phase 4 — for now the grid holds the manual
 * tap-to-extract action (config-driven from MANUAL_TAP_YIELD) plus locked
 * placeholders for what's still ahead.
 */
import { useGameStore } from '../state/store';
import { MANUAL_TAP_YIELD } from '../config/halcyon-config';
import { RadarGlyph } from './RadarGlyph';
import { LockGlyph } from './LockGlyph';
import type { ResourceId } from '../engine/types';

const HUD_RESOURCES: Array<{ id: ResourceId; icon: string; label: string }> = [
  { id: 'scrap', icon: '🔩', label: 'Scrap' },
  { id: 'ore', icon: '⛏️', label: 'Ore' },
  { id: 'rations', icon: '🥫', label: 'Rations' },
  { id: 'exotic', icon: '🔷', label: 'Exotic' },
];

const TAP_RESOURCES = Object.keys(MANUAL_TAP_YIELD) as ResourceId[];
const MODULE_GRID_SLOTS = 4;

interface OutpostScreenProps {
  onOpenSettings: () => void;
}

export function OutpostScreen({ onOpenSettings }: OutpostScreenProps) {
  const game = useGameStore((s) => s.game);
  const saveStatus = useGameStore((s) => s.saveStatus);
  const storagePersisted = useGameStore((s) => s.storagePersisted);
  const extract = useGameStore((s) => s.extract);

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

      <section className="radar panel" aria-label="Threat radar">
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
        {TAP_RESOURCES.map((id) => {
          const meta = HUD_RESOURCES.find((r) => r.id === id)!;
          const { amount, cap } = game.resources[id];
          const atCap = amount >= cap;
          return (
            <button
              key={id}
              className="module-tile panel"
              onClick={() => extract(id)}
              disabled={atCap}
            >
              <span className="module-tile-icon">{meta.icon}</span>
              <span>Salvage {meta.label}</span>
              <span className="module-tile-sub">
                {atCap ? 'Storage full' : `Tap for +${MANUAL_TAP_YIELD[id as keyof typeof MANUAL_TAP_YIELD]}`}
              </span>
            </button>
          );
        })}
        {Array.from({ length: Math.max(0, MODULE_GRID_SLOTS - TAP_RESOURCES.length) }).map((_, i) => (
          <div className="module-tile empty" key={i}>
            <LockGlyph size={24} className="module-tile-icon dim" />
            <span className="module-tile-sub">Unlocks soon</span>
          </div>
        ))}
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
