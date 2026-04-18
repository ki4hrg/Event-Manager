import type { FunctionForTable } from "./actions";

export function getEarliestStart(fn: FunctionForTable): Date | null {
  if (fn.schedules.length === 0) return null;
  return fn.schedules.reduce((min, s) => {
    const t = new Date(s.startTime);
    return t < min ? t : min;
  }, new Date(fn.schedules[0].startTime));
}

export function getLatestEnd(fn: FunctionForTable): Date | null {
  if (fn.schedules.length === 0) return null;
  return fn.schedules.reduce((max, s) => {
    const t = new Date(s.endTime);
    return t > max ? t : max;
  }, new Date(fn.schedules[0].endTime));
}

export function formatScheduleDateTime(date: Date | null, timezone: string): string {
  if (!date) return "—";
  return date.toLocaleString("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
