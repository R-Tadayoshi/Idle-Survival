/**
 * Shared deterministic PRNG helpers. Used anywhere a schedule/outcome must
 * be a pure function of (colony seed, index) so online and offline
 * resolution produce byte-identical results for the same wall-clock window
 * (incursions, world events, ...) — not cryptographic, just good enough for
 * gameplay-visible randomness.
 */

/** mulberry32 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Combine the colony seed with an integer salt into one deterministic
 *  32-bit seed, so different rolls for the same index (jitter vs type vs
 *  target, etc.) draw from independent streams. */
export function seededRng(seed: number, salt: number): () => number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ salt, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return mulberry32(h >>> 0);
}

export function pickWeighted<T extends string>(roll: number, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as Array<[T, number]>;
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let acc = 0;
  for (const [key, w] of entries) {
    acc += w / total;
    if (roll <= acc) return key;
  }
  return entries[entries.length - 1][0];
}
