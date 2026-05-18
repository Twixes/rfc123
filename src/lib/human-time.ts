/**
 * Render an elapsed duration in the largest sensible unit. Returns the bare
 * phrase without an "ago" suffix – callers compose ("open for X", "X ago",
 * "opened X ago", etc.).
 *
 *   5 seconds      → "less than a minute"
 *   5 minutes      → "5 minutes"
 *   1 hour         → "1 hour"
 *   11 days        → "11 days"
 *   3 weeks        → "3 weeks"
 *   2 months       → "2 months"
 *   1 year         → "1 year"
 */
export function humanTimeSince(date: Date | string | number): string {
  const ms =
    Date.now() -
    (typeof date === "number"
      ? date
      : (typeof date === "string" ? new Date(date) : date).getTime());
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (secs < 60) return "less than a minute";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  if (days < 7) return `${days} day${days === 1 ? "" : "s"}`;
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"}`;
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  return `${years} year${years === 1 ? "" : "s"}`;
}
