---
name: verify
description: Build, serve, and drive the HALCYON PWA in headless Chromium to verify changes end-to-end (rendering, service worker, offline mode, IndexedDB save).
---

# Verifying HALCYON (installable PWA)

## Build + serve the production bundle

The service worker only exists in the production build — always verify
against `vite preview`, not the dev server:

```bash
npm run build                              # tsc -b && vite build (SW + manifest emitted to dist/)
npm run preview -- --port 4173 --strictPort   # run in background
```

## Drive it with Playwright

Chromium is pre-installed in remote sessions. `playwright-core` (installed in
a scratch dir, not the repo) + explicit executable path works:

```js
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', // adjust to ls /opt/pw-browsers
  args: ['--no-sandbox'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); // iPhone portrait
```

## Flows worth driving

- **Render:** `waitForSelector('.outpost')`; HUD cells (`.hud-cell`) must show
  the start values from `src/config/halcyon-config.ts`, not hardcoded numbers.
- **Manifest:** fetch `link[rel=manifest]`; expect `display: standalone`,
  `orientation: portrait`, 3 icons incl. one `purpose: maskable`; also fetch
  `link[rel=apple-touch-icon]` → 200.
- **Service worker:** `navigator.serviceWorker.ready`, then wait for
  `navigator.serviceWorker.controller` (first install may need one reload to claim).
- **Save:** open IndexedDB `halcyon` → store `saves` → key `primary` directly
  from `page.evaluate`. Wait for the `.save-pill` to read "saved" first
  (autosave is debounced ~1s). `seed` must be identical across reloads.
- **Lifecycle:** `window.dispatchEvent(new Event('pagehide'))` must bump
  `lastActiveAt` in the save (offline catch-up depends on this stamp).
- **Offline (the point of the PWA):** `context.setOffline(true)` then reload —
  app must fully render from precache; also hit a cache-busting URL
  (`/?fresh=...`) to exercise `navigateFallback`.

## Gotchas

- `navigator.storage.persist()` is denied in headless Chromium → the footer
  shows "⚠️ storage". Expected in verification; not a bug.
- Icons are generated, not checked-in art: `npm run icons` regenerates
  `public/icons/*` via `scripts/generate-icons.mjs` (pure Node, no deps).
- A working reference script lives in the session scratchpad as
  `verify-phase0.mjs`; recreate from the flows above if gone.
