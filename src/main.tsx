import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import { bootGame } from './state/boot';
import './ui/styles.css';

// autoUpdate mode: check for a new service worker periodically and refresh
// caches in place — never traps the user on a stale build.
registerSW({ immediate: true });

void bootGame();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
