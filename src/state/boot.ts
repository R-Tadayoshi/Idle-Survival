/**
 * Boot sequence: load (or create) the save, request persistent storage, and
 * wire the lifecycle events that keep IndexedDB in sync — throttled autosave
 * on state changes, immediate save + lastActiveAt stamp when the app is
 * hidden or closed (pagehide/visibilitychange are the only reliable exit
 * signals on iOS; there is no background execution after that). Also starts
 * the live production tick while the tab is visible.
 */
import { createNewGame } from '../engine/newGame';
import { loadGame, requestPersistentStorage, saveGame } from '../save/db';
import { startLiveLoop, stopLiveLoop } from './liveLoop';
import { useGameStore } from './store';

const AUTOSAVE_INTERVAL_MS = 1000;

let pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;

async function saveNow(): Promise<void> {
  const { game, setSaveStatus } = useGameStore.getState();
  await saveGame(game);
  setSaveStatus('saved');
}

/** Cancel any pending throttled save and write immediately. Call this before
 *  anything that tears down the page synchronously — an in-flight IndexedDB
 *  write started from `pagehide`/`visibilitychange` is not guaranteed to
 *  finish before an actual navigation (e.g. the SW's own reload-on-update)
 *  destroys the JS context, unlike backgrounding, where the page survives
 *  long enough for the async write to land. */
export async function flushPendingSave(): Promise<void> {
  if (pendingSaveTimer !== null) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }
  await saveNow();
}

export async function bootGame(): Promise<void> {
  const store = useGameStore.getState();

  const existing = await loadGame();
  store.hydrate(existing ?? createNewGame());
  if (!existing) await saveNow();
  else store.setSaveStatus('saved');

  void requestPersistentStorage().then((granted) =>
    useGameStore.getState().setStoragePersisted(granted),
  );

  // Throttled autosave: once the live tick runs every second, a plain
  // trailing debounce would keep getting reset by each tick and never fire.
  // A throttle guarantees a flush at most AUTOSAVE_INTERVAL_MS after the
  // first change in a burst, continuous activity or not.
  useGameStore.subscribe((state, prev) => {
    if (state.game === prev.game) return;
    state.setSaveStatus('dirty');
    if (pendingSaveTimer !== null) return;
    pendingSaveTimer = setTimeout(() => {
      pendingSaveTimer = null;
      void saveNow();
    }, AUTOSAVE_INTERVAL_MS);
  });

  // Stamp lastActiveAt + flush the save the moment we lose the foreground;
  // pause the live loop since iOS won't run it in the background anyway.
  const onHide = () => {
    useGameStore.getState().stampActive();
    void flushPendingSave();
    stopLiveLoop();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide();
    else startLiveLoop();
  });
  window.addEventListener('pagehide', onHide);

  if (document.visibilityState === 'visible') startLiveLoop();
}
