import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import { bootGame, flushPendingSave } from './state/boot';
import { useGameStore } from './state/store';
import './ui/styles.css';

// 'prompt' mode: a new SW is installed and ready but waits for us. Flush any
// pending save first, then activate + reload — same automatic-update
// experience as autoUpdate, but the reload can never clip an in-flight write.
// Both callbacks fire outside the React tree, so they reach the UI via the
// store directly (useGameStore.getState()/.setState() work from anywhere).
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    useGameStore.getState().showToast('Updating to the latest version…');
    void flushPendingSave().then(() => updateSW(true));
  },
  onOfflineReady() {
    useGameStore.getState().showToast('Ready to play offline');
  },
});

void bootGame();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
