const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const ts = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const diff = Date.now() - ts;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return `${m}m ago`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `${h}h ago`;
  }
  if (diff < 2 * DAY) return "yesterday";
  if (diff < 7 * DAY) {
    const d = Math.floor(diff / DAY);
    return `${d}d ago`;
  }
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatAbsoluteTime(date: Date | string | null | undefined, timezone?: string): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: timezone ? "short" : undefined,
  });
}

export function isRecent(date: Date | string | null | undefined, hours = 24): boolean {
  if (!date) return false;
  const ts = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  return Date.now() - ts < hours * HOUR;
}
