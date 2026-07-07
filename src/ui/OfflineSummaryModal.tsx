import { useGameStore } from '../state/store';
import type { ResourceId } from '../engine/types';

const RESOURCE_META: Record<ResourceId, { icon: string; label: string }> = {
  scrap: { icon: '🪵', label: 'Wood' },
  ore: { icon: '🪨', label: 'Stone' },
  rations: { icon: '🍞', label: 'Food' },
  exotic: { icon: '🔮', label: 'Mana' },
  alloy: { icon: '⚒️', label: 'Iron' },
  components: { icon: '🔧', label: 'Tools' },
};

/** e.g. 90000 -> "1d 1h", 5400 -> "1h 30m", 45 -> "45s" */
function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
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
        <button className="module-card-tap" onClick={dismiss}>
          Continue
        </button>
      </div>
    </div>
  );
}
