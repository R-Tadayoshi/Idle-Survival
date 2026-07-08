/**
 * IndexedDB persistence via `idb`. One save slot, schema-versioned with a
 * migration switch so old saves survive updates. Storage can still be evicted
 * by iOS — we request persistence and treat a missing/corrupt save as a fresh
 * colony rather than crashing.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { firstIncursionArrival } from '../engine/incursions';
import { createStarterModules } from '../engine/newGame';
import type { GameState } from '../engine/types';
import { SAVE_VERSION } from './version';

const DB_NAME = 'halcyon';
const DB_VERSION = 1;
const STORE = 'saves';
const SLOT = 'primary';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE);
      }
    },
  });
  return dbPromise;
}

/** Walk an old save up to SAVE_VERSION; return null if unsalvageable. */
function migrate(raw: unknown): GameState | null {
  if (typeof raw !== 'object' || raw === null || !('version' in raw)) return null;
  const save = raw as GameState;
  switch (save.version) {
    case SAVE_VERSION: {
      // A save from before the military rework used Training Camp's
      // assignedWorkers as permanent flat defenders — migrate them
      // straight into trained Soldiers (already earned, not re-queued into
      // training) rather than losing their defense contribution, and zero
      // the module's assignedWorkers since it now means "currently
      // training", a fundamentally different thing.
      const modules = save.modules?.length ? save.modules : createStarterModules();
      const priorTrainingCampWorkers = save.military
        ? 0
        : (modules.find((m) => m.type === 'trainingCamp')?.assignedWorkers ?? 0);
      const migratedModules = save.military
        ? modules
        : modules.map((m) => (m.type === 'trainingCamp' ? { ...m, assignedWorkers: 0 } : m));

      // Defensively fill fields added after a save was first written, rather
      // than bumping SAVE_VERSION for every additive settings field.
      return {
        ...save,
        modules: migratedModules,
        settings: {
          hapticsEnabled: save.settings?.hapticsEnabled ?? true,
          theme: save.settings?.theme ?? 'system',
          // An existing save already has a colony under way — the onboarding
          // banner is for a genuinely fresh start, so treat any save from
          // before this field existed as already dismissed, not as "show it
          // to a returning player who's built half a dozen modules."
          onboardingDismissed: save.settings?.onboardingDismissed ?? true,
        },
        incursions: save.incursions ?? [],
        nextIncursionIndex: save.nextIncursionIndex ?? 0,
        nextIncursionArrivalAt: save.nextIncursionArrivalAt ?? firstIncursionArrival(save.createdAt ?? save.lastActiveAt),
        military: save.military ?? { soldiers: priorTrainingCampWorkers, archers: 0, training: [] },
      };
    }
    // future: case 1 → transform to 2, fall through …
    default:
      return null;
  }
}

export async function loadGame(): Promise<GameState | null> {
  try {
    const raw = await (await db()).get(STORE, SLOT);
    return migrate(raw);
  } catch (err) {
    console.error('HALCYON: failed to load save', err);
    return null;
  }
}

export async function saveGame(state: GameState): Promise<void> {
  try {
    await (await db()).put(STORE, state, SLOT);
  } catch (err) {
    console.error('HALCYON: failed to write save', err);
  }
}

export async function deleteSave(): Promise<void> {
  await (await db()).delete(STORE, SLOT);
}

/** Ask the browser not to evict our storage (best-effort; iOS may say no). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    // fall through
  }
  return false;
}
