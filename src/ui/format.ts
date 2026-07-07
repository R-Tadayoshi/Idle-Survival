/** e.g. 90000 -> "1d 1h", 5400 -> "1h 30m", 45 -> "45s" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.round(Math.max(0, totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
