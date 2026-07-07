import { useState } from 'react';
import { useGameStore } from '../state/store';
import { saveGame } from '../save/db';
import type { ThemePreference } from '../engine/types';

const THEME_OPTIONS: Array<{ id: ThemePreference; label: string }> = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

interface SettingsScreenProps {
  onClose: () => void;
}

export function SettingsScreen({ onClose }: SettingsScreenProps) {
  const theme = useGameStore((s) => s.game.settings.theme);
  const setTheme = useGameStore((s) => s.setTheme);
  const resetGame = useGameStore((s) => s.resetGame);
  const setSaveStatus = useGameStore((s) => s.setSaveStatus);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const handleReset = async () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    resetGame();
    // Save immediately rather than waiting on the throttled autosave — a
    // reset should never be lost to a crash/close before it flushes.
    await saveGame(useGameStore.getState().game);
    setSaveStatus('saved');
    onClose();
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-sheet panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span>SETTINGS</span>
          <button className="icon-button" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>
        <div className="settings-row">
          <span className="settings-label">Appearance</span>
          <div className="segmented">
            {THEME_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                className={`segmented-option${theme === id ? ' active' : ''}`}
                onClick={() => setTheme(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-label">Reset village</span>
          <button
            className={`danger-button${confirmingReset ? ' confirming' : ''}`}
            onClick={handleReset}
            onBlur={() => setConfirmingReset(false)}
          >
            {confirmingReset ? 'Tap again to confirm' : 'Reset'}
          </button>
        </div>
      </div>
    </div>
  );
}
