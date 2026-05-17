// "Main" schedule mirrors the convention used in room-schedule reports: earliest public
// schedule wins; if no schedule is public, fall back to the longest one.
export function mainScheduleStart(
  schedules: { startTime: Date; endTime: Date; isPublic: boolean }[]
): number | null {
  if (schedules.length === 0) return null;
  const publicRows = schedules.filter((s) => s.isPublic);
  if (publicRows.length > 0) {
    return Math.min(...publicRows.map((s) => s.startTime.getTime()));
  }
  const longest = schedules.reduce((best, s) =>
    s.endTime.getTime() - s.startTime.getTime() >
    best.endTime.getTime() - best.startTime.getTime()
      ? s
      : best
  );
  return longest.startTime.getTime();
}

export function compareByMainFunctionTime<
  T extends {
    name: string;
    function: { schedules: { startTime: Date; endTime: Date; isPublic: boolean }[] } | null;
  },
>(a: T, b: T): number {
  const aTime = a.function ? mainScheduleStart(a.function.schedules) : null;
  const bTime = b.function ? mainScheduleStart(b.function.schedules) : null;
  if (aTime !== null && bTime !== null && aTime !== bTime) return aTime - bTime;
  if (aTime === null && bTime !== null) return 1;
  if (aTime !== null && bTime === null) return -1;
  return a.name.localeCompare(b.name);
}
