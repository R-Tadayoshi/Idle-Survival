/**
 * Boot sequence: load (or create) the save, request persistent storage, and
 * wire the lifecycle events that keep IndexedDB in sync — debounced autosave
 * on state changes, immediate save + lastActiveAt stamp when the app is
 * hidden or closed (pagehide/visibilitychange are the only reliable exit
 * signals on iOS; there is no background execution after that).
 */
import { createNewGame } from '../engine/newGame';
import { loadGame, requestPersistentStorage, saveGame } from '../save/db';
import { useGameStore } from './store';

const AUTOSAVE_DEBOUNCE_MS = 1000;

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

  // Debounced autosave whenever game state changes.
  let timer: ReturnType<typeof setTimeout> | undefined;
  useGameStore.subscribe((state, prev) => {
    if (state.game === prev.game) return;
    state.setSaveStatus('dirty');
    clearTimeout(timer);
    timer = setTimeout(() => void saveNow(), AUTOSAVE_DEBOUNCE_MS);
  });

  // Stamp lastActiveAt + flush the save the moment we lose the foreground.
  const onHide = () => {
    useGameStore.getState().stampActive();
    clearTimeout(timer);
    void saveNow();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') onHide();
  });
  window.addEventListener('pagehide', onHide);
}
