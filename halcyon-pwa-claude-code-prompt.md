# Claude Code build prompt — "HALCYON" (installable PWA)

> Paste everything below into Claude Code as your initial task. It's written as a spec for the agent, not for you. Build in the phases at the bottom — get each phase running in the browser (and installable on iPhone) before moving on.

**Balance source of truth:** A file named `halcyon-config.ts` is provided alongside this prompt with all starting balance values (rates, storage caps, build/upgrade costs, incursion strength and interval curves, sentinel horizons, loss caps, power values). Use it as the single source of truth for the economy: place it in the `config/` module, import every rate/cost/curve from it, and do NOT invent or hardcode balance numbers anywhere else. If you need a value it doesn't define, add it to that file (don't scatter it into components).

---

## Your role and goal

You are building **HALCYON**, a polished single-player, **fully offline installable PWA** (Progressive Web App) that installs to the iOS home screen from Safari and runs full-screen. The core fantasy: you command a small **colony outpost on a hostile alien frontier**. You extract salvage, ore, and biomass, generate power, mine rare exotic matter, and — crucially — **defend the outpost against telegraphed alien/raider incursions**, including ones that arrive while the app is closed.

The pillars, in priority order:

1. **Survival against threats** — rations (hunger), power management, and **incursions** that must be forecast and defended against, *including offline raids*.
2. **Base building** — extract resources to unlock and upgrade modules, which unlock deeper systems and stronger defenses.

Wrapped around both: an **AFK / idle layer** — assign colonists/drones to extraction modules, close the app, and return to collected resources AND resolved raid outcomes.

Prioritize a tight, fun core loop and clean game feel over feature count. A small game that feels great beats a big game that feels flat.

---

## Platform: installable PWA (primary target = iPhone / iOS Safari)

- Build a **web app that installs to the home screen** via Safari's "Add to Home Screen" and launches in **standalone full-screen** mode (no browser chrome).
- Ship a valid **web app manifest** (name, short_name, icons incl. 180×180 apple-touch-icon and maskable icons, `display: "standalone"`, theme/background color, portrait orientation) and the iOS-specific `apple-mobile-web-app-*` meta tags.
- Ship a **service worker** that precaches the app shell + assets so it **launches and plays with no network** after first load.
- The game must be fully playable offline and require **no backend, no server, no accounts, no network calls**.

### iOS PWA reality-check (design around these — they are real Safari limitations)

- **No background execution.** iOS will not run your code while the app is closed. This is fine: the AFK/offline system works by **timestamp-diff catch-up on reopen**, never background timers. Design strictly around that.
- **Storage can be evicted.** Call `navigator.storage.persist()` to request persistent storage, and prefer **IndexedDB** for the save. Installed (home-screen) PWAs persist far better than tabs. Keep the save small and robust; treat eviction as possible and fail gracefully.
- **Notifications:** local "a raid is incoming" notifications while the app is closed are **not reliably possible** on iOS without web-push infrastructure (which needs a server and breaks the offline/no-backend rule). So: **do NOT rely on notifications.** Surface all incoming-incursion warnings *inside the app* (the radar/threat board). If you want, note where optional web-push could slot in later, but do not build it now.

---

## Tech stack

- **Vite + React + TypeScript (strict).** (React is a suggestion for velocity; if you have a strong reason to go vanilla/other, flag it — but stay a lightweight installable PWA.)
- **PWA tooling:** `vite-plugin-pwa` (Workbox under the hood) for the manifest + service worker + precaching + auto-update.
- **State:** **Zustand**. Keep game logic OUT of React components.
- **Persistence:** **IndexedDB** (via the `idb` helper) for the save, with schema versioning + a migration hook. Request persistent storage on first run.
- **Styling:** your choice (CSS Modules / Tailwind / vanilla) — cohesive sci-fi palette (deep space blues, warning ambers, hologram cyan), large tap targets, safe-area insets respected for iPhone notch/home indicator.
- No paid assets or copyrighted IP. Emoji or inline SVG for icons; free open-license assets only if trivial.

---

## The game design

### Resources

- **Base:** Scrap 🔩 (salvage / build material), Ore ⛏️ (minerals), Rations 🥫 (colonist upkeep / "food"), Exotic Matter 🔷 (rare, advanced tech).
- **Energy ⚡ (special):** produced by Reactors; **many modules require power to run**. If supply < demand, modules throttle or go offline — a core sci-fi tension. Introduce in Phase 4 so the early loop stays simple.
- **Crafted (later):** Alloy, Components — from a Fabricator consuming base resources.
- Each resource has a **storage cap** raised by depots. Overflow is wasted — the pull to return and to upgrade storage.

### Colonists and AFK production (idle core)

- Pool of **colonists** (later, automated **drones**).
- **Assign** them to extraction modules. Production = `baseRate × assignedCount × upgradeMultiplier × (powered ? 1 : throttle)` per second.
- Colonists consume **Rations**; drones consume **Energy**. Assignment under limited population + upkeep + competing modules is the central decision.

### Incursions, Sentinels, and OFFLINE RAIDS (the signature system — get this right)

Threats are **scheduled, telegraphed, deterministic incursions** that resolve **both online and offline**, fairly, because the player sees them coming and prepares.

**Incursion schedule**
- Events on a timeline: `arrivalAt` (timestamp), `strength`, `type` (swarm / armored / raiders — different types favor different defenses).
- Generated from a **deterministic seed + colony progress**, so the schedule is identical whether online or offline. **You cannot dodge or farm a raid by toggling app state** — same incursion, same moment, regardless.
- Frequency/strength scales with colony power / day count (rolling schedule extending hours/days ahead).

**Sentinels (the fairness mechanism)**
- A **Sentinel Array / Long-Range Scanner** reveals upcoming incursions within its **detection horizon** (e.g. next 6h at L1 → 24h+ higher), showing **ETA, strength, type**.
- Higher levels see further and reveal composition/weak points. This is what makes offline raids fair: *before closing the app, the player knows what's coming and prepares.*
- **Raids only "arm" for offline resolution once a Sentinel exists** (or earliest incursions are weak/in-session only), so a new player is never blindsided.

**Defense**
- Defense value = **Turrets + Perimeter Walls + Shield Generator + assigned defenders**, modified by matchup vs incursion `type` and by **power** (an unpowered shield is dead). All defendable in advance.

**Resolution (identical logic online and offline)**
- In the offline catch-up (and live at each `arrivalAt`), resolve incursions **chronologically, interleaved with production/upkeep**:
  - `defenseValue ≥ strength` → **repelled** (optional minor wear/damage).
  - `defenseValue < strength` → **breach**: losses scale with the shortfall — lose a **percentage** of stored resources and/or **structure damage** (modules disabled until repaired). **Cap losses per raid** so no absence is ever a total wipe.
  - Track defense damage → player must **repair** afterward.
- **"While you were away…" summary**: time elapsed, resources gained, rations consumed, and **each incursion → repelled/breached + exactly what was lost/damaged.** Make the battle report feel earned and readable.

Heart of the game: *scan → assess incoming waves → build the right defense → close the app → return to a resolved battle report.*

### Base building and progression

- Modules: **Salvage Rig, Mining Drill, Hydroponics Bay, Reactor (power), Resonance Lab (exotic matter), Storage Depot (caps), Sentinel Array (scan), Turret/Wall/Shield (defense), Habitat (colonist cap), Fabricator (crafts).**
- Building/upgrading consumes resources (and possibly time). Each unlock opens a visible new decision.
- First-5-minutes funnel: extract → store → build → assign → **build a Sentinel** → see first incursion → build a Turret → survive it — no wall of text.

### Prestige (later, lowest priority)

- Soft-reset: re-found the colony, keep a permanent meta-currency/multiplier. Stub hooks now; implement last.

---

## Data model (strict TypeScript types)

```ts
type ResourceId = 'scrap' | 'ore' | 'rations' | 'exotic' | 'energy' | /* crafted... */;

interface ResourceState { amount: number; cap: number; }

interface Module {
  id: string;
  type: ModuleType;
  level: number;
  assignedWorkers: number;
  producesRatePerWorker?: number;   // per second
  producesResource?: ResourceId;
  powerDemand?: number;
  defenseValue?: number;
  damaged?: boolean;
}

interface Incursion {
  id: string;
  arrivalAt: number;        // epoch ms, from deterministic schedule
  strength: number;
  type: 'swarm' | 'armored' | 'raiders';
  resolved?: boolean;
  outcome?: 'repelled' | 'breached';
}

interface GameState {
  version: number;                    // save migrations
  seed: number;                       // deterministic incursion schedule
  lastActiveAt: number;               // epoch ms
  resources: Record<ResourceId, ResourceState>;
  modules: Module[];
  colonists: { total: number; assigned: number };
  incursions: Incursion[];            // upcoming + recent resolved
  survival: { integrity: number; dayCount: number };
  prestige: { level: number; multiplier: number };
  settings: { hapticsEnabled: boolean };
}
```

Keep ALL tunables (rates, caps, costs, upkeep, power demands, incursion curves, MAX_OFFLINE, sentinel horizons, loss caps) in a central `config/` module — balancing is one file, not scattered magic numbers.

---

## Game engine architecture

Separate the **engine** (pure logic) from the **UI** (React). Engine must be unit-testable without rendering.

- **`tick(state, dtSeconds, { applyIncursions }) → state`**: pure function applying production, upkeep, power balance, and (if an incursion `arrivalAt` falls in the step) incursion resolution. Used for both the live loop AND offline catch-up.
- **Offline catch-up = replaying the elapsed window through the same tick logic** (chunked so incursions resolve at the right moments against the defense the player had), then show the summary. `elapsedSeconds = clamp(now − lastActiveAt, 0, MAX_OFFLINE_SECONDS)`.
- **Incursion scheduler:** deterministic from `seed` + progression; identical online/offline.
- **Live loop:** ~1s interval (use `requestAnimationFrame`/`setInterval` with delta time) calling `tick`; also handle tab hidden/visible via the **`visibilitychange`** event and **`beforeunload`/`pagehide`** to stamp `lastActiveAt` + save.
- **Save/load module:** debounced autosave to IndexedDB on meaningful changes + on `pagehide`/`visibilitychange:hidden`; `version` field + migration switch. Request `navigator.storage.persist()` on first run.
- **On launch/return-to-foreground:** run catch-up + show the "While you were away" summary.

---

## Screens / UI

- **Outpost (home):** resource/power HUD across the top, modules as tappable tiles, colonist summary, and a prominent **incursion radar/ticker** — next detected wave (ETA, strength, type) vs your current defense rating. This tension gauge is the emotional center.
- **Module detail / assign:** assign/unassign workers, upgrade, see rate/power draw/defense contribution.
- **Build menu:** available modules + costs; locked ones show requirements.
- **Sentinel / threat board:** detected upcoming incursions with prep guidance ("defense 40 vs incoming 65 — reinforce").
- **"While you were away" + battle report modal.**
- **Live incursion moment:** clear alert + outcome when a raid hits during play.
- **Settings:** haptics toggle (via the Vibration API where supported), reset save (with confirm), version info.
- Respect iPhone **safe-area insets**, large tap targets, portrait-first layout, standalone-mode styling.

---

## Balancing / economy

- First satisfying offline return ~15–60 min early on, scaling later.
- Early incursions gentle and clearly survivable; ramp so defense investment always feels necessary but fair.
- **Always cap per-raid losses** and the offline window so no single absence wrecks a colony.
- Cost curves make upgrades feel earned, not grindy, in session one.
- Every tunable in one commented config file — assume constant tweaking. **Use the provided `halcyon-config.ts` as the balance source of truth; wire all rates, costs, and curves through it rather than inventing numbers.**

---

## Build in phases — get each running in the browser (and installable on iPhone) before the next

**Phase 0 — Scaffold + installability.** Vite + React + TS + `vite-plugin-pwa` + Zustand + `idb`. Valid manifest + icons + service worker; **verify it installs to the iPhone home screen from Safari and launches full-screen offline.** Placeholder outpost screen, dummy IndexedDB save/load. Nail installability here — don't defer it.

**Phase 1 — Resources + manual extract.** Resource state with caps, tap-to-extract, live HUD, autosave/load.

**Phase 2 — Colonists + live production.** Worker pool, assign to modules, per-second `tick`, rations upkeep.

**Phase 3 — Offline progression (production only).** `lastActiveAt`, visibility/pagehide handling, catch-up with caps/upkeep, "While you were away" summary. Test by closing the installed app / changing device time.

**Phase 4 — Building, power & progression.** Build menu, costs, upgrades, storage raises caps, habitat raises colonist cap, Reactor + power demand/throttle.

**Phase 5 — Incursions + Sentinels + OFFLINE RAIDS (signature phase).** Deterministic scheduler, Sentinel detection horizon, defense modules + matchups, chronological resolution in `tick` (online AND offline), capped losses, structure damage + repair, battle report in the summary. This is the core — give it the most care.

**Phase 6 — Polish & game feel.** Animations, haptics (Vibration API), number tick-ups, radar/alert juice, first-5-minutes onboarding, empty/locked/damaged states, offline/update toasts.

**Phase 7 — Prestige (optional).** Soft reset + permanent multiplier.

At the end of each phase: summarize what changed, how to run/preview it, and what to test.

---

## Definition of done / quality bar

- **Installs to the iPhone home screen from Safari, launches full-screen, and plays fully offline** after first load.
- State survives app close/eviction-resistant IndexedDB save; offline gains AND offline raid outcomes are correct and identical to what live resolution would produce for the same timeline.
- Core loop (extract → assign → build → scan → defend → return-to-battle-report) is complete and fun by Phase 5.
- Code typed; engine unit-testable and separated from UI; all balance numbers in config; incursion schedule deterministic from seed.
- Service worker auto-updates cleanly (no stale-cache lockout); no backend/multiplayer paths.

---

## Things to avoid

- ❌ Anything that breaks offline/installability or needs a server (no backend, accounts, ads, analytics, web-push-for-now).
- ❌ Relying on background execution or scheduled notifications on iOS — they won't run. Catch-up on reopen only.
- ❌ **Random, un-telegraphed offline losses.** Offline raids are wanted — but ONLY forecastable via Sentinels, defendable in advance, deterministic from the schedule, and capped so no absence is a wipe.
- ❌ Stale service-worker caches that lock users on an old build — get update flow right.
- ❌ Scattering balance constants through components.
- ❌ Over-scoping before the core loop is fun. Vertical slice first.

---

### Kickoff instruction to the agent

Start with **Phase 0**. Before writing code, confirm your exact dependency list and versions (Vite, vite-plugin-pwa, React, zustand, idb), outline the folder structure (engine vs. UI vs. config), and describe the manifest + service worker setup. Then scaffold and **prove it installs and launches offline on iPhone** before moving on.
