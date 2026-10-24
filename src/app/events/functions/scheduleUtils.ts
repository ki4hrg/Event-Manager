import type { FunctionForTable } from "./actions";

export function getEarliestStart(fn: FunctionForTable): Date | null {
  if (fn.schedules.length === 0) return null;
  return fn.schedules.reduce((min, s) => {
    const t = new Date(s.startTime);
    return t < min ? t : min;
  }, new Date(fn.schedules[0].startTime));
}

// `mainTypes` are the schedule types grouped MAIN in Settings
// (mainScheduleTypes in src/lib/scheduleTypes.ts). A tenant that marks none
// keeps the old rule: a type whose label contains "main".
export function getMainStart(fn: FunctionForTable, mainTypes: readonly string[]): Date | null {
  if (fn.schedules.length === 0) return null;
  // schedules arrive pre-sorted by startTime asc (see getFunctionsForTable),
  // so the first main schedule is also the earliest.
  const isMain =
    mainTypes.length > 0 ? (type: string) => mainTypes.includes(type) : (type: string) => type.toLowerCase().includes("main");
  const main = fn.schedules.find((s) => isMain(s.type));
  return main ? new Date(main.startTime) : getEarliestStart(fn);
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
