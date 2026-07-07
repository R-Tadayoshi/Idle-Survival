import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 450;

/** Smoothly tweens the displayed value toward `target` over DURATION_MS
 *  whenever it changes, instead of the number jumping discretely on every
 *  ~1s tick. Purely presentational — never read this for game logic. */
export function useAnimatedNumber(target: number): number {
  const [displayed, setDisplayed] = useState(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = displayed;
    const delta = target - from;
    if (Math.abs(delta) < 0.01) {
      setDisplayed(target);
      return;
    }

    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / DURATION_MS);
      const eased = 1 - (1 - t) * (1 - t); // ease-out
      setDisplayed(from + delta * eased);
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
    // excludes `displayed`: re-running this effect on its own output would
    // restart the tween every frame instead of animating toward `target`.
  }, [target]);

  return displayed;
}
