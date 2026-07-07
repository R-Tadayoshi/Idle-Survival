/**
 * Thin wrapper over the Vibration API — respects the player's haptics
 * setting and no-ops silently where unsupported (iOS Safari has never
 * implemented navigator.vibrate; this is a progressive enhancement, not a
 * dependency). Reads the store directly rather than taking hapticsEnabled
 * as a parameter so every call site (store actions, not just components)
 * can fire a haptic without threading state through.
 */
import { useGameStore } from '../state/store';

export function vibrate(pattern: number | readonly number[]): void {
  if (!useGameStore.getState().game.settings.hapticsEnabled) return;
  try {
    navigator.vibrate?.(pattern as number | number[]);
  } catch {
    // unsupported or blocked — nothing to do
  }
}

export const HAPTIC = {
  tap: 8,
  confirm: 20,
  raidRepelled: [15, 40, 15],
  raidBreached: [40, 30, 40, 30, 60],
} as const;
