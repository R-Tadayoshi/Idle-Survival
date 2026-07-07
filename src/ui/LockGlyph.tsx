/**
 * Monochrome padlock, used wherever we mean "locked/inactive" — the 🔒 emoji
 * renders as solid gold on iOS, which reads as an unwanted color cast when
 * it shows up several times on one screen (locked module tiles, storage
 * status). Uses currentColor so it inherits the surrounding text color.
 */
interface LockGlyphProps {
  size?: number;
  className?: string;
}

export function LockGlyph({ size = 20, className }: LockGlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="15.5" r="1.4" fill="currentColor" />
    </svg>
  );
}
