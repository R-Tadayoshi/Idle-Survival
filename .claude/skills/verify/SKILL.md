---
name: verify
description: Build, serve, and drive the Hearthold (formerly HALCYON) PWA in headless Chromium to verify changes end-to-end (rendering, service worker, offline mode, IndexedDB save).
---

# Verifying Hearthold (installable PWA)

Renamed from HALCYON to Hearthold in a medieval-fantasy reskin (Phase 4
follow-up). This was purely a display-layer change — `MODULES[type].name`,
resource icons/labels, and UI copy — object keys (`salvageRig`, `scrap`,
etc.), balance numbers, and the IndexedDB save schema (`idb` DB name
`halcyon`, no migration) are all unchanged. Reference scripts below use the
new display names (e.g. `hasText: 'Windmill'` not `'Reactor'`); if you find
an old script using pre-reskin strings, it predates the rename — update its
`hasText` locators and any hardcoded copy assertions, not the app.

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
  `navigator.serviceWorker.controller` (first install may need one reload to
  claim — this is normal SW behavior, not specific to `autoUpdate` vs
  `prompt` registerType; give the fallback reload its own generous timeout
  rather than a shared/tight one, or a legitimate ~15s+15s wait reads as a
  hang).
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
- **Offline catch-up (Phase 3):** write a save with `lastActiveAt` shifted
  into the past (`Date.now() - N*1000`) via `writeSave()`, then reload — far
  more reliable than waiting real time, and the only practical way to test
  the `MAX_OFFLINE_SECONDS` cap (12h) at all. Check three thresholds: a gap
  under `OFFLINE_SUMMARY_MIN_SECONDS` (30s) should catch up silently with no
  modal; a longer one should show `.offline-elapsed` /
  `.offline-delta-row`; a gap past `MAX_OFFLINE_SECONDS` should clamp the
  displayed elapsed time, not show the full gap. Pick a short elapsed window
  (well under `rations / upkeepRate`) when hand-deriving an expected
  scrap/rations delta — otherwise you're implicitly asserting on the
  mid-window hunger-transition math too, which needs its own dedicated
  check (see below), not an incidental one with easy-to-flub arithmetic.
- **Chunked-vs-naive catch-up accuracy** is a pure-function property, not
  worth an E2E test — `npx tsx` a standalone `.mts` script that imports
  `runCatchup`/`tick` directly from `src/engine/*.ts` and compares a single
  big `tick(state, N)` call against `runCatchup` against a manual N×`tick(1)`
  loop across a window that crosses both a hunger transition *and* stays
  under any resource cap (a window long enough to hit a cap converges both
  approaches to the same capped value and hides the bug you're checking
  for). `tsx` isn't installed; `npx tsx <file>.mts` fetches it on first use.
- **Power/build system (Phase 4):** `buildModule`/`upgradeModule` always call
  `recalculateCaps()` regardless of module type — so an externally-injected
  `resources[id].cap` override (for giving a test enough funds) gets reset to
  the config-derived value on the *next* build of anything, not just a
  Storage Depot. Don't set `amount` above a cap you can't guarantee survives;
  top up resources fresh (to a value safely under the *current* real cap)
  right before each spending step instead of one big upfront injection — see
  the `topUp()` helper pattern in `verify-phase4.mjs`. Also: since this
  phase, a **fresh game is underpowered by default** (the starter Salvage
  Rig demands 2 power, no Reactor exists yet) — any test that assumes "full
  production rate" on a new save needs the 0.4x `UNDERPOWERED_THROTTLE`
  factored in until it explicitly builds + funds a Reactor first.
- **`.module-card-tap` is no longer unique** — Phase 4 added an "Upgrade"
  button sharing that class with the manual tap-to-extract button. Disambiguate
  by DOM order (`.first()`), not `hasText`, since the tap button's own text
  changes to "Storage full" once capped — a text filter stops matching it at
  exactly the moment a later assertion needs to find it.

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
- **A raw `page.reload()` right after an unsaved change is NOT a valid
  simulation of "close and reopen the app."** It races the throttled
  autosave and can genuinely lose data — this is real (an in-flight
  IndexedDB write from `pagehide` is not guaranteed to finish before an
  actual navigation tears down the JS context), but it's not what real
  backgrounding does. The real exit path is `visibilitychange` → `'hidden'`,
  which leaves the page alive long enough for the async write to land —
  simulate it with `document.dispatchEvent(new Event('visibilitychange'))`
  after stubbing `document.visibilityState` via
  `Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })`,
  *not* `page.reload()`. Only test a real reload for things that actually
  trigger one in production (see below).
- **The SW's own update-triggered reload is a real instance of the above
  race** — `registerType: 'prompt'` + `onNeedRefresh` in main.tsx now calls
  `flushPendingSave()` before `updateSW(true)` specifically to close this
  gap (previously `autoUpdate` would `window.location.reload()`
  unconditionally, any time a new deploy activated, mid-action or not). Full
  end-to-end SW-update simulation (two deployed versions racing a live
  session) isn't practical in this harness; verified instead by confirming
  `flushPendingSave` + reset both write synchronously via the same
  `saveGame` await chain, and that SW install/control behavior is otherwise
  unchanged (see next point).
- Reference scripts accumulate in the session scratchpad as
  `verify-phase{N}.mjs` + `verify-settings.mjs` + `verify-reset.mjs`;
  recreate from the flows above if gone. Update a phase's script's selectors
  (not just add a new one) when a later phase changes the markup it depends
  on — e.g. Phase 2 turned the whole Phase-1 tap tile into a `.module-card`
  with a narrower `.module-card-tap` button, and Phase 4 made that class
  ambiguous again (see above). Re-run the *entire* suite set after any
  engine change that affects a value another phase's test hardcoded a
  number for (production rate, upkeep rate, etc.) — Phase 4's power system
  changed the "fresh game" baseline production rate that Phases 2 and 3's
  own tests had assumed.
- **The live-tick `setInterval` is measurably throttled under headless
  Chromium** — confirmed via a fine-grained trace (reading the save every
  500ms) that it fires roughly once per ~2s instead of once per ~1s, even on
  a nominally-visible, just-loaded page with no real window manager. The
  *math* inside each tick is still exactly correct (delta-time computed from
  real `Date.now()` gaps, not an assumed fixed step — confirmed the ration
  drain per firing matched `rate * actual_elapsed_seconds` precisely), so
  this is a firing-*frequency* artifact, not a correctness bug. A short
  (~3s) observation window is too small a sample and reads as "wrong rate"
  by pure bad luck of tick timing; use a ~10s window (and proportionally
  scaled expected value/tolerance) for any assertion on live-tick production
  rate. This throttling does *not* apply to offline catch-up (`runCatchup`),
  which chunks deterministically in a plain loop, not a real timer — those
  checks can stay exact/short.
- **`height: 100%` on `html`/`body` is a mobile viewport trap.** It resolves
  against the *layout* viewport, which on mobile browsers is taller than
  what's actually visible once the address/tab bar is showing — the app's
  content (including a bottom `.status-bar`) ends up laid out for a screen
  taller than the real one, leaving a gap and clipping the footer off the
  visible bottom. Headless Chromium's fixed-viewport `newContext` won't
  reproduce this (no dynamic browser chrome), so it's invisible to the
  Playwright suite — this class of bug only shows up on a real phone. Fixed
  with a `height: 100dvh` override after the `100%` fallback (unsupported
  browsers just ignore the second declaration).
- **`-webkit-fill-available` is not a safe blanket fix, even for the
  WebKit-specific case it's meant for.** It's the documented workaround for
  a *separate* iOS-standalone-PWA height bug (no browser chrome at all,
  distinct from the mobile-tab-toolbar case `dvh` fixes) — but applied
  unscoped to `html`/`body`/`#root`, it made the whole page scroll as one
  unit instead of just the intended `.module-grid` region, because in some
  engines it sizes to *content* rather than *viewport*. Fix: scope it
  behind `@media (display-mode: standalone)` so it only ever applies to an
  actually-installed PWA, never a regular browser tab — and separately, add
  `overflow: hidden` on `html`/`body` as a hard guarantee the page itself
  can never scroll regardless of any height-calculation quirk, current or
  future, in any mode. Neither the original bug nor this regression showed
  up in headless Chromium (fixed non-standalone viewport, no real device
  chrome) — this whole class of bug needs a real device or at least
  `display-mode: standalone` emulation to actually see.
- **Emoji missing the variation selector (`️`) can render as a
  monochrome text glyph instead of the color emoji**, same root cause as the
  earlier 🔒→gold-lock bug. `🛡` (no VS16) rendered as a plain heart-outline
  glyph in this environment; `🛡️` (with VS16) rendered correctly. Screenshot
  any newly-added emoji at least once — this isn't visible from the source
  text, only from actual rendering.
- **Training Camp / defender pattern (post-Phase-4):** a module can have
  `maxWorkers` without `produces`/`ratePerWorker` — it's a worker-slot
  module whose assigned count feeds something other than resource
  production (here, `computeDefense` in `engine/defense.ts`). The UI's old
  `hasProduction` check gated the stepper row *and* implied "produces a
  resource"; a defense module needs the stepper (`hasWorkers = 'maxWorkers'
  in def`) without the production-specific bits (tap-to-extract, resource
  icon). Watch for this same shape again in Phase 5 if any new module is
  workers-in/no-resources-out.
