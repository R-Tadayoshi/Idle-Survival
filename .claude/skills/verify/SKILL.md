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
- **`-webkit-fill-available` for `height` was tried and abandoned entirely
  — do not reintroduce it.** It's the commonly-cited workaround for an
  iOS-standalone-PWA height bug (no browser chrome at all, distinct from
  the mobile-tab-toolbar case `dvh` fixes), but in practice it sizes to
  *content* rather than *viewport* in enough cases to be unsafe: applied
  unscoped to `html`/`body`/`#root` it made the whole page scroll as one
  unit; scoped behind `@media (display-mode: standalone)` (seemingly a
  fix, since it no longer touched the regular-browser-tab case) it still
  broke scrolling, because standalone is exactly the mode it's meant for —
  it ballooned the whole app chain to fit all content instead of
  constraining it to the viewport, so nothing needed to scroll internally,
  and with page-level scroll blocked by `overflow: hidden` the overflow
  just became unreachable. Two different real-device regressions from the
  same property, neither reproducible in headless Chromium (fixed,
  non-standalone viewport — this whole class of bug needs a real device to
  see at all) — not worth the risk versus plain `100dvh`, which is
  standards-track and doesn't have this failure mode. If a real
  iOS-standalone height issue resurfaces, don't reach for this property
  again without a way to verify on the actual device first.
- **The actual root cause behind both of the above: `.module-grid` (flex: 1
  inside a flex column, with its own `overflow-y: auto`) was missing
  `min-height: 0`.** Flex items default to `min-height: auto`, which
  refuses to shrink below content size — so the grid grew to fit every
  built module instead of clipping to its allotted flex space, leaving
  `overflow-y: auto` permanently inert (the box was already exactly as tall
  as its content, so there was nothing *to* scroll). Before `overflow:
  hidden` was added to `html`/`body`, this surfaced as the whole page
  scrolling as a fallback; after, as the module list being visually clipped
  with no way to reach the cards past the fold. **Verifying this with
  `el.scrollTop = el.scrollHeight` (a JS assignment) is not sufficient and
  can mask the bug** — it can still move the scroll position even when
  `min-height: auto` means the box was never actually constrained; test
  with real input instead (`page.mouse.wheel(dx, dy)` after `.hover()` on
  the scrollable region) and assert `clientHeight < scrollHeight` on the
  element to confirm it's genuinely clipped, not just nominally
  "scrollable."
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

## Phase 5 (incursions/Sentinels/raids) additions

- **`recalculateCaps()`'s colonist-total-growth side effect must never run
  from `tick()`.** It sets `colonists.total = Math.max(total, cap)` —
  correct when triggered by an explicit build/upgrade/repair action (a
  Habitat's bonus should land immediately), but calling it unconditionally
  from the ~1s tick loop silently grants free colonists on literally the
  first tick of a fresh game, since `STARTING_COLONISTS` (3) is below
  `STARTING_COLONIST_CAP` (5) by design. This inflated idle-colonist ration
  upkeep by ~55% and broke several Phase 2/3 assertions that assumed
  `colonists.total` stays untouched absent a real build action. Fixed by
  splitting `caps.ts` into `recalculateCaps` (full, action-triggered) and
  `refreshCapNumbers` (cap *numbers* only, no total growth — what `tick()`
  actually needs so a module damaged by a breach immediately shrinks
  displayed caps without also handing out colonists). **Any future engine
  change that calls a caps/colonist-affecting function from inside `tick()`
  needs the same scrutiny** — check what it does to `colonists.total`, not
  just the cap number.
- **After a source-only fix (no rebuild), the E2E suite can still "pass"
  against a stale `dist/` bundle if the preview server was already
  running.** The above bug's fix was verified correct via `npx tsx` unit
  tests against source directly, but the *E2E* suite kept failing until
  `npm run build` + a fresh `vite preview` restart — `pkill -f "vite
  preview"` before rebuilding, or the browser tests silently exercise old
  JS. When a fix "should" resolve an E2E failure but doesn't, check the
  bundle is actually fresh before re-diagnosing the app code.
- **Simulating an offline gap that crosses a specific scheduled event
  (e.g. "make the next incursion arrive during this catch-up") is easy to
  get backwards.** Setting `save.lastActiveAt = save.createdAt + N*60*1000`
  looks like "N minutes into the game," but since `createdAt` is already
  ~real-`Date.now()` at colony creation, adding minutes to it pushes
  `lastActiveAt` *into the future* relative to the real `Date.now()` the
  test's `runCatchup` will actually use — producing a *negative* elapsed
  window that clamps to 0, so nothing resolves. Don't touch `createdAt`
  for this; the scheduler cursor (`nextIncursionArrivalAt`) is itself a
  plain persisted field — set it directly to `Date.now() - 60_000` (due a
  minute ago) and `lastActiveAt` to something further in the past (e.g.
  `Date.now() - 10*60_000`), so the real catchup window on reload
  genuinely spans across it.
- **Pure-function tests (`npx tsx`) caught this session's only real
  regression; the E2E suite didn't (until rebuilt) and couldn't have
  caught the underlying determinism property at all.** For anything where
  "online and offline produce identical outcomes" is a hard requirement
  (the whole point of the incursion scheduler), write a direct test that
  replays the *same* window through two different chunk sizes (e.g. 1s
  steps vs 1800s steps) and asserts byte-identical resolution records —
  `JSON.stringify(resolvedA) === JSON.stringify(resolvedB)` — not just "the
  right number of incursions happened." A test that seeds `createNewGame`
  with an explicit `seed` (not the default `crypto.getRandomValues` one)
  is required for any assertion on *which* module gets damaged, since the
  damage-target RNG is seed-dependent and an unseeded game varies every
  run.
- **Defense module power rule, for future reference:** any module with
  `powerDemand > 0` throttles to `POWER.UNDERPOWERED_THROTTLE` (0.4x) when
  the colony is underpowered — same rule as production — *except* Shield
  Generator, which goes to exactly 0 (fully dead, per spec: "an unpowered
  shield is dead"). Perimeter Wall has `powerDemand: 0` and is never
  affected. This applies to Training Camp too (`powerDemand: 3`) — a
  colony that's underpowered for unrelated reasons (e.g. no Windmill yet)
  will show throttled defender contributions, which is correct, not a bug.

## Multiplicative throttles can create unrecoverable traps — check for this pattern

Found via a user report ("food stays at 0 even with 5 workers on a Lv.2
Farm"), reproduced with a direct `tick()` loop before touching the
browser: `productionMult = hungerMult * powerMult` (0.35 × 0.4 = 0.14x)
can pin a colony's rations *below its own upkeep rate* the instant it's
simultaneously starving and underpowered — production can never
out-produce the drain no matter how many workers are assigned, since
adding workers adds upkeep too. The resource visibly sits at 0 forever
(it's actually oscillating just under 1 each tick — `Math.floor()` in the
HUD hides the fractional gain), which reads as "production is broken" to
a player even though the code is doing exactly what the multiplication
says. Fixed by using `Math.min(hungerMult, powerMult)` instead of
multiplying — the single worst active penalty applies, not both stacked,
which keeps recovery mathematically possible.

**The general lesson: any time two independent throttle multipliers on
the same pure-recovery resource (rations, most obviously) can both be
active at once, check whether their product can still be beaten by the
best case production the player can realistically reach** — if not, it's
a soft-lock, not a difficulty tuning value, regardless of what the
individual config numbers "look like" in isolation. This is exactly the
kind of interaction easy to miss when reviewing each throttle
independently (both looked reasonable on their own: 0.35x hungry, 0.4x
underpowered) — reproduce the *combined* worst case with a direct
`tick()` loop (`unit-starvation-spiral.mts` pattern: build up a
compounding-risk scenario, run ~30 ticks, assert the resource actually
climbs) before trusting that two throttles compose safely.

## Phase 6 (polish/game feel) additions

- **`requestAnimationFrame` throttles in headless Chromium too, the same
  way `setInterval` does.** Added a ~450ms ease-out tween
  (`useAnimatedNumber`) so HUD resource amounts count up smoothly instead
  of jumping instantly. Any test reading `.hud-amount` shortly after a
  state change now needs to wait past that window — but a "safe" 600ms
  wait (450ms + margin) still flaked, because rAF callbacks can fire far
  less often than 60fps here, so wall-clock time to reach the animation's
  internal `t=1` threshold can stretch well past the nominal duration.
  Fixed by waiting generously (1500ms), matching the existing live-tick
  convention elsewhere in this suite — don't assume rAF-driven animations
  settle anywhere near their nominal duration in this environment.
- **A generous wait added to accommodate one thing (animation settling)
  can silently give enough real time for something *else* correct to
  happen too** — bumping a post-reset wait to 1500ms made a "rations back
  to exactly 40" assertion flake at 39, not because of animation timing,
  but because the live tick actually fired during that longer window and
  idle-colonist ration upkeep genuinely drained it by a fraction (correct
  game behavior — colonists eat whether or not they're assigned to a
  module). The fix wasn't a longer wait or a different selector, it was
  loosening the assertion to a tolerant range (`>= 38 && <= 40`) once the
  wait window was long enough that *something* was expected to move it.
  When bumping a wait to fix one flake, check whether the longer window
  now exposes an unrelated background process (live tick, autosave) and
  re-derive the assertion's tolerance accordingly, rather than assuming
  the original exact-match was still valid.
- **A component's very first render never animates — there's nothing to
  tween *from*.** Tried to verify the tick-up animation by injecting an
  offline-catchup resource gain and reloading; the HUD showed the final
  value on frame one every time, because catch-up runs during boot
  *before* the component ever mounts (`useState(target)` initializes
  straight to the post-catchup value — no prior value exists to animate
  away from). To actually observe a mid-tween value, trigger a change
  *after* the page is already interactive and settled — e.g. a build
  action's instant cost deduction — not a value that was already baked
  into the very first render.
- **A CSS class shared between two visually-similar but semantically
  different things breaks count-based assertions.** Gave a new
  "locked module" row (Fabricator, shown in the build menu with a
  greyed-out reason instead of just silently not appearing) the same
  `.build-row` class as real buildable rows for quick styling — this
  silently inflated `page.locator('.build-row').count()` in existing
  tests that meant "how many *buildable* things are listed." Fixed with a
  fully separate `.locked-row` class (own CSS, not composed with
  `.build-row`) rather than a modifier on the shared class, so "buildable"
  and "locked" stay distinguishable by selector, not just by reading
  `disabled`/`aria-disabled`.

## Post-Phase-5 balance history: raid strength must NOT react to player power

User-reported the game was far too easy (next raid strength 15, already
had 66 defense unused). First attempt: made `rollTypeAndStrength` scale
with `max(baselineCurve(index), computeDefense(currentModules) * 0.85)` —
technically fixed the "too easy" symptom, but the user immediately (and
correctly) called it out as bad design: **raids getting stronger *because*
you upgraded your defense punishes investment instead of rewarding it**,
which kills the "getting stronger" incentive a survival/idle game runs on.
Reverted in the very next turn.

**The actual fix keeps `rollTypeAndStrength` a pure function of
`(seed, index)`, unaware of the colony's current defense entirely** —
escalation instead comes from a steeper baseline curve
(`STRENGTH_GROWTH` 1.22 → 1.35) and tighter raid spacing
(`BASE_INTERVAL_HOURS` 3 → 2, `INTERVAL_TIGHTEN_PER_DAY` 0.03 → 0.04). The
world gets more dangerous on its own schedule regardless of what's built;
racing ahead of that curve — building defense *before* you need it — is
the actual strategy, and the same raid now has identical strength whether
faced by an undefended colony or one with 90+ defense (only the *outcome*
differs). `POWER_SCALING_FACTOR` config field and the defense-threading
through `peekUpcomingIncursions`/`advanceIncursions` were removed entirely,
not just left unused.

**Lesson for any future difficulty-scaling idea:** reactive scaling to the
player's *current* power (defense, resources, level, whatever) is an
anti-pattern in this genre by default — it needs a very deliberate,
explicit design reason to justify (and should probably be opt-in/telegraphed
as its own mechanic, not baked silently into the core threat curve) before
reaching for it again. Time/index/milestone-based escalation is the safe
default: it's predictable, it rewards getting ahead of it, and it doesn't
retroactively punish the player's own progress.

**Verification pattern that caught this fast:** a direct pure-function test
comparing two colonies at the *same* seed/index — one undefended, one with
~90 defense — asserting `incU.strength === incT.strength` (identical
threat) while the *outcomes* differ (`breached` vs `repelled`). This is a
stronger regression guard than checking the formula in isolation, since it
directly encodes the design invariant ("defense affects outcome, never the
threat itself") rather than just today's specific numbers — keep this
test if any future incursion-difficulty change touches this file again.

## `npx tsc --noEmit` (bare) is a silent no-op in this repo

The root `tsconfig.json` has `"files": []` with `"references"` to
`tsconfig.app.json`/`tsconfig.node.json` — it only actually typechecks
anything in **build mode**. Bare `tsc --noEmit` exits 0 having checked
nothing at all, which can hide a real compile error for an entire session
if `npm run build` isn't also run afterward. **Always use `npx tsc -b
--noEmit`** (or just `npm run build`, which runs `tsc -b && vite build`)
for a standalone typecheck — never the bare form.

## Population/Army Training system (post-Phase-6)

Villagers assigned to the Training Camp no longer contribute defense
directly (the old "defender" pattern — `MODULES.trainingCamp` had a
`defenseValue` and the module's own `assignedWorkers` counted straight
into `computeDefense`). Instead: `setTraining(state, type, delta)`
(`engine/military.ts`) opens/grows a `TrainingOrder` (soldier or archer,
fixed `count`, `completesAt` set once at creation — villagers joining an
*already-open* order just bump `count`, never reset the timer, so
queuing more up never delays the ones already in progress); the Training
Camp's `assignedWorkers` field now means "currently mid-training"
(a throughput/capacity concept capped by `maxWorkers`), not permanent
troop count. `advanceTraining` (called from `tick()`, before
`advanceIncursions` in the same window) graduates any order whose
`completesAt` has passed into `state.military.soldiers`/`archers` —
colony-wide standing-army state, decoupled from the Training Camp module
entirely (troops persist even if the Training Camp is later damaged).
`computeDefenseAgainst` (`engine/defense.ts`) now reads `state.military`
directly for troop defense contribution (`MILITARY.SOLDIER_VALUE`/
`ARCHER_VALUE` × the incursion-type matchup multiplier), not the module
loop.

**A villager mid-training contributes exactly zero defense until their
order completes** — this is the deliberate point (prepare before the
raid, not scramble during one), not a bug; any test injecting a
`TrainingOrder` should assert defense stays unchanged until
`completesAt` passes.

**`TrainingCampCard` is a separate UI component from the generic
`ModuleCard`** (`OutpostScreen.tsx`) — Training Camp doesn't fit the
worker-slot-stepper-per-module pattern (one stepper row per troop *type*,
each with its own count/countdown, not one stepper for the whole module).
The module-grid render loop conditionally picks
`module.type === 'trainingCamp' ? <TrainingCampCard> : <ModuleCard>`.

**Test the full training pipeline with a doctored save, same pattern as
offline catch-up:** `readSave()`, set
`military.training[0].completesAt = Date.now() - 1000` and
`lastActiveAt` further in the past, `writeSave()`, reload — this drives
the order through `advanceTraining` via the real offline-catchup path
without waiting out the real 15-minute `TRAINING_DURATION_SECONDS`. For
pure-function (`npx tsx`) tests, advance via two `tick()` calls at the
midpoint and past-completion instead (see `unit-incursions.mts`'s
"Training pipeline" block) — mid-training must show `military.soldiers
=== 0`, only after `completesAt` does it graduate.

**Text-content assertions on JSX with an inline double-space
(`` `${a}  ${b}` ``) will not match — HTML collapses it to a single
space at render time.** Match the rendered single-space form in
`innerText()` comparisons, not the literal template string.

### Colonist-cap tuning: raising both the base cap and a cap-bonus module's
bonus at once can flood the colony past what early production can support

`recalculateCaps()` (see Phase 5 section above) grants free colonists
*instantly*, up to whatever the new cap is, on **any** build/upgrade
action — not just a Cottage. Raising `GLOBAL.STARTING_COLONIST_CAP` alone
(even without touching Cottage's bonus) means the very first building of
*anything* jumps `colonists.total` straight to the new base cap, since
`recalculateCaps` runs unconditionally on every build. Combined with a
much bigger Cottage `colonistCapBonus`, building one early Cottage can
hand out more idle mouths than a single Lv.2 Farm (capped at 5 workers)
can feed under the worst-case combined hunger+power throttle — this
regressed the `unit-starvation-spiral.mts` invariant (never an
unrecoverable trap) from a comfortable margin down to a genuine multi-tick
deficit, caught only by re-running that test, not by the E2E suite (which
doesn't simulate worst-case starving+underpowered+overpopulated
simultaneously). **When tuning population-scale config numbers, re-run
`unit-starvation-spiral.mts` specifically** — it's the one test that
exercises the compounding worst case, and a "the game is too easy, let
population scale toward the hundreds" balance change is exactly the kind
of edit that can quietly reintroduce it. Landed at
`STARTING_COLONIST_CAP: 6` (from 5), Cottage `colonistCapBonus: 4` (from
2) — the ceiling still climbs toward "dozens/~100" over many
Cottages/levels (bonus scales `× module.level`), just without an
oversized single-build instant flood.

## Watchtower tiered intel (post-Population/Army-Training)

User-reported: "the watchtower levels have no difference." Previously
every Watchtower level showed the exact same radar-hint text (type, ETA,
strength) — only the `detailedIntel` defense-comparison sentence was
gated to L2+, and even that gate was easy to miss since the base line
looked complete on its own. Restructured into three genuinely distinct
tiers in `SENTINEL` (config) + `OutpostScreen.tsx`:

- **L1** (`roughIntelOnly`): a bucketed, ceil'd-to-next-3h ETA only —
  `roughEtaLabel()` — no type, no strength, no exact minutes. Matches the
  user's own phrasing ("the closest enemy is +/- 3h away").
- **L2** (`SENTINEL.DETAILED_INTEL_LEVEL`): exact ETA/type/strength plus
  the existing defense-vs-incoming comparison sentence.
- **L3** (`SENTINEL.COMPOSITION_INTEL_LEVEL`, new): + `describeMatchup()`
  — reads `INCURSIONS.MATCHUPS[type]` directly and names the
  strongest/weakest counters ("most vulnerable to Ballistae, least to
  Palisades"), so upgrading the Watchtower has a legible payoff beyond
  just horizon hours.

**Found and fixed a latent bug while touching this code:**
`SENTINEL.HORIZON_HOURS_BY_LEVEL[watchtower.level] ?? 0` had no clamp —
the array only has entries for levels 0–5, so a Watchtower upgraded past
L5 would index out of bounds, get `undefined`, and silently go blind
(`horizonHours` falls back to 0) despite being higher-level, not lower.
There's no level cap on module upgrades (`upgradeModule` in `build.ts`
has none), so this was reachable in real play. Fixed with
`Math.min(watchtower.level, HORIZON_HOURS_BY_LEVEL.length - 1)` — beyond
L5 the horizon just holds at the L5 value instead of collapsing to
nothing.

**Test each tier with a doctored save, same pattern as everywhere else
in this file:** build a Watchtower via the UI (starts at L1, exercising
the real build path once), then `readSave()`/mutate
`modules.find(m => m.type === 'sentinelArray').level = N`/`writeSave()`/
reload for L2 and L3 — real time-based leveling (repeated real upgrades)
isn't worth the resource cost to simulate when a direct level mutation
proves the same UI branch. Assert both what a tier *shows* and what it
does *not yet* show (e.g. L1 must not match `/raid inbound — ETA/`, L2
must not match `/most vulnerable to/`) — a positive-only assertion at
each tier can't catch a tier boundary that leaked forward (e.g. L1
accidentally showing L2 detail).

## Morale & defeat (full loss condition)

Per the user's explicit "i want the full defeat with moral and people able
to leave etc," added a real loss condition on top of the existing
soft-fail states (starving/underpowered just throttle production). Three
independent defeat triggers, checked once per tick in `checkGameOver`
(`engine/morale.ts`), most-recently-set wins (it's terminal, never
overwritten):

- **`population`**: `colonists.total <= 0` (defection whittled everyone away).
- **`morale`**: `survival.morale <= 0`.
- **`starvation`**: `survival.starvingSeconds >= MORALE.STARVATION_DEFEAT_SECONDS`
  (6 continuous hours at 0 rations) -- a distinct message even though it
  usually correlates with morale collapse too, so a player who neglected
  food reads "your colony starved," not a generic "morale collapsed".

Morale itself (`advanceMorale`) is closed-form time-based math like the
incursion scheduler and training queue -- drains while starving/underpowered
(worse case wins, not both stacked, same principle as the production
throttle), recovers passively once fed+powered, takes a breach-scaled hit
or a small repel bonus (threaded through `incursions.ts`'s `resolveOne`).
Below `MORALE.DEFECTION_THRESHOLD` villagers start leaving
(`removeOneColonist`, prefers idle -> in-progress trainee -> production
module worker) at 1 per `DEFECTION_SECONDS_PER_COLONIST` of continuous
time under threshold -- computed as a closed-form `floor(progress /
threshold)` rather than an iterative per-second loop, so a single big
offline-catchup tick produces the same departures as many small live ticks
over the same window.

**Once `state.gameOver` is set, `tick()` is a total no-op** (`if (dtSeconds
<= 0 || state.gameOver) return { state, resolvedIncursions: [] }` at the
very top) -- same object reference back out, not just "no visible
change". `App.tsx` gates on `game.gameOver` before rendering `OutpostScreen`
at all, so a defeated colony can't have its settings/build sheets or
offline-summary modal opened behind the block. `GameOverScreen`'s "Found a
New Colony" button is the existing `resetGame()` action, unchanged.

**Test gotcha specific to this system:** `advanceMorale(state, dt, hungry,
powered)` evaluates the defection threshold against morale *after* this
call's own delta is applied, not the incoming value. A test that seeds
`survival.morale` exactly at `DEFECTION_THRESHOLD` and then calls
`advanceMorale(..., hungry=false, powered=true)` will see morale *recover*
past the threshold within that same call (the positive `RECOVER_PER_SEC`
delta), silently skipping defection -- looks like a defection bug, isn't
one. Use `hungry=true` (morale draining, staying under threshold
throughout the call) to actually isolate the defection math.

**A fresh colony is underpowered by default** (no Reactor yet, per the
Phase 4 gotcha above) — its morale ticks down slightly from 100 within the
first second of the live loop. Don't assert `morale === 100` after any
real page load/reset; assert `>= 99` ("restored to full") instead.

**Doctoring a save with `gameOver` set directly** (`readSave()` /
`save.gameOver = { reason, at: Date.now() }` / `writeSave()` / reload) is
the practical way to E2E-test the terminal screen without actually playing
a colony to death -- same pattern as every other engine-state test in this
file. Assert `.outpost` has zero count while `.game-over` is showing, not
just that `.game-over` itself appeared, to catch a gate that shows both at
once.

## Worker-slot scaling + radar text trim (user feedback pass)

Two small user-reported issues, fixed together:

1. **"more villagers should be able to work a site as it upgrades or as
   population grows."** Every production/utility module's `maxWorkers` was
   a flat constant regardless of level or colony size — with the earlier
   population rebalance (cap toward "dozens/~100"), a handful of Lv.1
   5-slot sites bottlenecked hard, leaving most villagers permanently
   idle with nowhere to go. Added `effectiveMaxWorkers(baseMax, level,
   colonistsTotal)` in config: `+1 slot per module level` AND `+1 slot per
   POPULATION_SLOTS_STEP (10) total colonists` — both apply, since the
   user explicitly asked for "when it upgrades... or when you have X
   villagers" (level OR population, not either/or in the design). Threaded
   through all four places that read `maxWorkers` directly: `actions.ts`
   (assignment clamp), `military.ts` (training-order room calc), and
   `OutpostScreen.tsx`'s `ModuleCard` + `TrainingCampCard` (display +
   button-disabled logic) — grep for `maxWorkers` before adding a new
   module type/worker-slot module to make sure it goes through the shared
   helper too, not a raw `def.maxWorkers` read.
2. **"remove the line of text of explanation for the watchtower and
   defense... it takes up too much space."** Trimmed the instructional
   suffixes appended to otherwise-fine data lines: "No scan coverage —
   build a Watchtower to spot raiders coming." → "No scan coverage.";
   the L1 rough-intel line dropped its "Upgrade the Watchtower for a
   clearer picture." tail; "Defense rating: N — train villagers as
   Soldiers or Archers, or build a Ballista..." → just "Defense rating:
   N". Kept every other line (ETA, ETA-only rough intel, composition
   intel, defense-vs-incoming comparison, morale) as-is — those are
   actual data, not "how to fix this" hand-holding, which is the
   distinction the user was drawing. If trimming radar/status text again,
   preserve that distinction rather than cutting numbers/state to save
   more space.

Neither change touched hardcoded test numbers in the existing suite: the
worker-slot formula only adds a *bonus* on top of level 1 + a population
under `POPULATION_SLOTS_STEP` (10), so every existing Phase 2/reset/
training-camp assertion (all written against a fresh ~3-colonist, Lv.1
scenario) evaluates to the exact same numbers as before — verified by
re-running the full suite rather than assuming it from the math.

## Scouts: Watchtower workers reveal further into the raid schedule

Partial delivery of the user's "population become sentinels, give info
about the world" idea — scoped down deliberately (see reasoning below)
rather than building a full kingdoms/diplomacy layer. The Watchtower
(`sentinelArray`) gained `maxWorkers: 3`; villagers assigned to it are
Scouts, plumbed through the *exact same* generic worker-slot stepper
`ModuleCard` already used for production modules (`hasProduction` renamed/
generalized to `hasWorkerSlots = 'maxWorkers' in def`, stepper label
`hasProduction ? 'Villagers' : 'Scouts'`) rather than a bespoke card --
Watchtower has no `produces`/`ratePerWorker` so none of the production-
specific bits (rate calc, tap-to-extract) activate for it, just the
assign/unassign stepper. Each Scout adds `SENTINEL.PEEK_COUNT_PER_SCOUT`
(1) to `peekUpcomingIncursions`'s `maxCount` -- already a parameter on
that function, no engine change needed -- surfaced as a terse `(+N more
scouted)` suffix on the existing radar-hint line.

**Deliberately did NOT add flavor-only "what do kingdoms plan" lore
text.** The user's very next message after Watchtower tiers shipped was
"remove the line of text of explanation... it takes up too much space" --
adding a new always-visible paragraph of pure flavor with no mechanical
payoff would directly contradict that feedback. Scouts extending the
schedule preview is the mechanically real interpretation of "info about
the world" (see more of what's coming, not just flavor text about it);
skipped inventing a full kingdoms/diplomacy data model since nothing
elsewhere in the codebase hints at one and it would be pure speculation
about what the user actually wants there.

Test this by building/leveling a Watchtower via a doctored save (same
pattern as the intel-tier tests), clicking the Scouts `+` stepper, and
checking `.radar-hint` picks up the `(+N more scouted)` suffix -- and
that it's absent with 0 scouts assigned, matching every pre-existing
Phase 5 Watchtower assertion (none of which assign scouts, so none
needed updating).
