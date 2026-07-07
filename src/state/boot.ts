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

async function saveNow(): Promise<void> {
  const { game, setSaveStatus } = useGameStore.getState();
  await saveGame(game);
  setSaveStatus('saved');
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
  let timer: ReturnType<typeof setTimeout> | null = null;
  useGameStore.subscribe((state, prev) => {
    if (state.game === prev.game) return;
    state.setSaveStatus('dirty');
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void saveNow();
    }, AUTOSAVE_INTERVAL_MS);
  });

  // Stamp lastActiveAt + flush the save the moment we lose the foreground;
  // pause the live loop since iOS won't run it in the background anyway.
  const onHide = () => {
    useGameStore.getState().stampActive();
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    void saveNow();
    stopLiveLoop();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide();
    else startLiveLoop();
  });
  window.addEventListener('pagehide', onHide);

  if (document.visibilityState === 'visible') startLiveLoop();
}
