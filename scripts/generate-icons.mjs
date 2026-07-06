/**
 * Generates the HALCYON app icons as PNGs into public/icons/ with zero
 * image dependencies: pixels are drawn procedurally (a radar sweep over a
 * deep-space field) and encoded with a minimal PNG writer on top of zlib.
 *
 * Run: npm run icons
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// ── Minimal PNG encoder (8-bit RGBA, filter 0) ─────────────────────────────
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Icon artwork ────────────────────────────────────────────────────────────
const BG_CENTER = [16, 30, 46];
const BG_EDGE = [6, 10, 17];
const CYAN = [85, 226, 255];
const AMBER = [255, 178, 84];

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Blend color `c` onto rgb with alpha a (0..1). */
function blend(rgb, c, a) {
  return [mix(rgb[0], c[0], a), mix(rgb[1], c[1], a), mix(rgb[2], c[2], a)];
}

function drawIcon(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  const half = size / 2;
  // Maskable icons get clipped to arbitrary shapes; keep art inside the 80%
  // safe zone by shrinking the radar, but paint the background full-bleed.
  const R = half * (maskable ? 0.62 : 0.8);
  const px = size / 512; // scale line widths with resolution

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - half;
      const dy = y + 0.5 - half;
      const d = Math.hypot(dx, dy);

      // Background: radial deep-space gradient.
      const t = clamp01(d / half);
      let rgb = [mix(BG_CENTER[0], BG_EDGE[0], t), mix(BG_CENTER[1], BG_EDGE[1], t), mix(BG_CENTER[2], BG_EDGE[2], t)];

      if (d <= R + 6 * px) {
        // Radar sweep wedge: brightest at its leading edge.
        let ang = Math.atan2(dy, dx); // -PI..PI, leading edge points up-right
        ang = (ang + Math.PI * 2.25) % (Math.PI * 2); // rotate so edge sits at 45°
        const WEDGE = Math.PI * 0.55;
        if (ang < WEDGE && d < R) {
          rgb = blend(rgb, CYAN, 0.28 * (1 - ang / WEDGE) * (0.4 + 0.6 * (d / R)));
        }
        // Concentric rings.
        for (const [rr, alpha] of [
          [R * 0.33, 0.5],
          [R * 0.66, 0.5],
          [R, 0.9],
        ]) {
          const w = (rr === R ? 5 : 3) * px;
          const dist = Math.abs(d - rr);
          if (dist < w) rgb = blend(rgb, CYAN, alpha * (1 - dist / w));
        }
        // Crosshair lines.
        if (d < R) {
          const lw = 1.6 * px;
          if (Math.abs(dx) < lw || Math.abs(dy) < lw) rgb = blend(rgb, CYAN, 0.35);
        }
        // Center hub.
        if (d < 9 * px) rgb = blend(rgb, CYAN, 0.95 * (1 - d / (9 * px)) + 0.4);
        // Contact blip (amber) on the second ring, inside the sweep.
        const bd = Math.hypot(dx - R * 0.47, dy + R * 0.47);
        if (bd < 16 * px) rgb = blend(rgb, AMBER, clamp01(1.15 - bd / (16 * px)));
      }

      const i = (y * size + x) * 4;
      rgba[i] = Math.round(rgb[0]);
      rgba[i + 1] = Math.round(rgb[1]);
      rgba[i + 2] = Math.round(rgb[2]);
      rgba[i + 3] = 255; // opaque: iOS treats transparency in icons poorly
    }
  }
  return encodePng(size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
const targets = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon-180.png', 180, { maskable: false }],
];
for (const [name, size, opts] of targets) {
  writeFileSync(join(OUT_DIR, name), drawIcon(size, opts));
  console.log(`wrote public/icons/${name} (${size}x${size})`);
}
