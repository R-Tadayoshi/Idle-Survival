import { useEffect, useState } from 'react';
import { useGameStore } from '../state/store';
import { OutpostScreen } from './OutpostScreen';
import { RadarGlyph } from './RadarGlyph';
import { SettingsScreen } from './SettingsScreen';

export function App() {
  const ready = useGameStore((s) => s.ready);
  const theme = useGameStore((s) => s.game.settings.theme);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 'system' means "no explicit override" — let the prefers-color-scheme
  // media query in CSS decide; otherwise stamp the choice for CSS to read.
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  if (!ready) {
    return (
      <div className="boot-screen">
        <RadarGlyph size={64} spinning />
        <div className="boot-title">HALCYON</div>
        <div className="boot-sub">establishing uplink…</div>
      </div>
    );
  }
  return (
    <>
      <OutpostScreen onOpenSettings={() => setSettingsOpen(true)} />
      {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
