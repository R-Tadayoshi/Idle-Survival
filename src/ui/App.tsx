import { useEffect, useState } from 'react';
import { useGameStore } from '../state/store';
import { OutpostScreen } from './OutpostScreen';
import { GameOverScreen } from './GameOverScreen';
import { ChronicleScreen } from './ChronicleScreen';
import { RadarGlyph } from './RadarGlyph';
import { SettingsScreen } from './SettingsScreen';
import { OfflineSummaryModal } from './OfflineSummaryModal';
import { BuildMenuScreen } from './BuildMenuScreen';
import { TabBar, type TabId } from './TabBar';
import { Toast } from './Toast';

export function App() {
  const ready = useGameStore((s) => s.ready);
  const theme = useGameStore((s) => s.game.settings.theme);
  const gameOver = useGameStore((s) => s.game.gameOver);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [buildMenuOpen, setBuildMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('outpost');

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
        <div className="boot-title">HEARTHOLD</div>
        <div className="boot-sub">stoking the hearth…</div>
      </div>
    );
  }
  // Terminal: no offline summary, no settings/build sheets — but the
  // Chronicle tab stays reachable so a player can actually see what led to
  // the collapse (raids, world events) instead of just "it happened,
  // no idea why." Settings/build menu still make no sense post-collapse,
  // so those icons/sheets are simply absent from GameOverScreen.
  if (gameOver) {
    return (
      <div className="app-shell">
        <div className="app-content">{activeTab === 'chronicle' ? <ChronicleScreen /> : <GameOverScreen />}</div>
        <TabBar active={activeTab} onSelect={setActiveTab} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-content">
        {activeTab === 'outpost' ? (
          <OutpostScreen onOpenSettings={() => setSettingsOpen(true)} onOpenBuildMenu={() => setBuildMenuOpen(true)} />
        ) : (
          <ChronicleScreen />
        )}
      </div>
      <TabBar active={activeTab} onSelect={setActiveTab} />
      {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
      {buildMenuOpen && <BuildMenuScreen onClose={() => setBuildMenuOpen(false)} />}
      <OfflineSummaryModal />
      <Toast />
    </div>
  );
}
