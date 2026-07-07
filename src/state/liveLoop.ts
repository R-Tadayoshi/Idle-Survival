/**
 * The ~1s live-tick interval (per GLOBAL.TICK_SECONDS), active only while
 * the tab is visible — iOS never runs JS in the background anyway, and
 * Phase 3's offline catch-up (timestamp-diff on reopen) is what covers the
 * time the app was hidden or closed, not this interval.
 */
import { GLOBAL } from '../config/halcyon-config';
import { useGameStore } from './store';

/** Guards against a huge dt if the interval is delayed/throttled while still
 *  technically visible (e.g. heavy main-thread work). Real offline gaps are
 *  Phase 3's job, not this loop's. */
const MAX_LIVE_DT_SECONDS = 5;

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastTickAt = 0;

function runTick(): void {
  const now = Date.now();
  const dtSeconds = Math.min(MAX_LIVE_DT_SECONDS, (now - lastTickAt) / 1000);
  lastTickAt = now;
  if (dtSeconds <= 0) return;
  useGameStore.getState().tick(dtSeconds);
}

export function startLiveLoop(): void {
  if (intervalId !== null) return;
  lastTickAt = Date.now();
  intervalId = setInterval(runTick, GLOBAL.TICK_SECONDS * 1000);
}

export function stopLiveLoop(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
