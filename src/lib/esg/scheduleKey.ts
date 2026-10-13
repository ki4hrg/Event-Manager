// Where a function sits in time, ignoring its set-up / tear-down rows
// (schedule types whose option group is SETUP / TEARDOWN). Pure.

import { mainScheduleStart } from "@/lib/functionSchedules";

type Sched = { type: string; startTime: Date; endTime: Date; isPublic: boolean };

export function functionStartKey(schedules: Sched[], support: Set<string>): number | null {
  const own = schedules.filter((s) => !support.has(s.type));
  return mainScheduleStart(own.length > 0 ? own : schedules);
}
