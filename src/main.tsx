import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import { bootGame, flushPendingSave } from './state/boot';
import './ui/styles.css';

// 'prompt' mode: a new SW is installed and ready but waits for us. Flush any
// pending save first, then activate + reload — same automatic-update
// experience as autoUpdate, but the reload can never clip an in-flight write.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void flushPendingSave().then(() => updateSW(true));
  },
});

void bootGame();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
