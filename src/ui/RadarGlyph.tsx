/**
 * Reusable radar-sweep glyph (mirrors the app icon's motif) used as the brand
 * mark and as a live status indicator — dim/static when no Sentinel is built,
 * spinning once one comes online in a later phase.
 */
interface RadarGlyphProps {
  size?: number;
  spinning?: boolean;
  dim?: boolean;
}

export function RadarGlyph({ size = 20, spinning = false, dim = false }: RadarGlyphProps) {
  const classes = ['radar-glyph', spinning && 'radar-glyph-spin', dim && 'radar-glyph-dim']
    .filter(Boolean)
    .join(' ');
  return (
    <svg className={classes} width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="8.5" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" />
      <circle cx="16" cy="16" r="4" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
      <path d="M16 3 V29 M3 16 H29" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
      <path
        className="radar-glyph-sweep"
        d="M16 16 L16 3 A13 13 0 0 1 27.25 9.5 Z"
        fill="currentColor"
        opacity="0.3"
      />
      <circle cx="16" cy="16" r="2" fill="currentColor" />
    </svg>
  );
}
