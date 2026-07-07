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

- **Live production tick (from Phase 2):** assign a worker
  (`.stepper-btn` with text `+`), then compare resource amounts across a real
  ~3s `page.waitForTimeout` — reading via `readSave()` (IndexedDB), not the
  DOM, since the HUD's `Math.floor()` display hides fractional gains. Expect
  ≈`ratePerWorker * workers` per second from config, not a hardcoded number.
- **Starvation throttle:** write a mutated save directly (open the save via
  `readSave()`, set `resources.rations.amount = 0`, `writeSave()`, then
  reload) rather than waiting ~8 real minutes for rations to drain — same
  IndexedDB helpers as the save check above, `put` instead of `get`.
- **Save-migration backfill:** write a save with a field reset to its
  pre-feature shape (e.g. `modules: []`) via `writeSave()`, reload, and
  confirm the app backfills it on load (`migrate()` in `db.ts`). This is the
  realistic regression case — the user's *actual* saved game on their phone
  predates whatever field you just added.

## Gotchas

- `navigator.storage.persist()` is denied in headless Chromium → the footer
  shows "⚠️ storage". Expected in verification; not a bug.
- Icons are generated, not checked-in art: `npm run icons` regenerates
  `public/icons/*` via `scripts/generate-icons.mjs` (pure Node, no deps).
- **IndexedDB reads race the autosave.** Autosave is *throttled* (fires at
  most once per ~1s window, not debounced — see boot.ts), so an action
  followed immediately by a raw `readSave()` can return stale pre-action
  data. Either wait for `.save-pill` to read "saved" first, or read the live
  DOM (HUD text) instead of IndexedDB when you just need to confirm a click
  had an effect, not that it persisted.
- Reference scripts accumulate in the session scratchpad as
  `verify-phase{N}.mjs` + `verify-settings.mjs`; recreate from the flows
  above if gone. Update a phase's script's selectors (not just add a new
  one) when a later phase changes the markup it depends on — e.g. Phase 2
  turned the whole Phase-1 tap tile into a `.module-card` with a narrower
  `.module-card-tap` button.
