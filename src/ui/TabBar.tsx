/**
 * Persistent bottom tab bar, the standard mobile-app navigation pattern —
 * always visible under the active screen (Outpost/Chronicle), not a modal.
 */
export type TabId = 'outpost' | 'chronicle';

const TABS: Array<{ id: TabId; icon: string; label: string }> = [
  { id: 'outpost', icon: '⛺', label: 'Outpost' },
  { id: 'chronicle', icon: '📜', label: 'Chronicle' },
];

interface TabBarProps {
  active: TabId;
  onSelect: (tab: TabId) => void;
}

export function TabBar({ active, onSelect }: TabBarProps) {
  return (
    <nav className="tab-bar" aria-label="Main navigation">
      {TABS.map(({ id, icon, label }) => (
        <button
          key={id}
          className={`tab-bar-button${active === id ? ' active' : ''}`}
          onClick={() => onSelect(id)}
          aria-label={label}
          aria-current={active === id ? 'page' : undefined}
        >
          <span className="tab-bar-icon">{icon}</span>
          <span className="tab-bar-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
