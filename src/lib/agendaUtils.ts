import type { Function, FunctionRoom, FunctionSchedule, Room } from "@prisma/client";

export type FunctionWithRelations = Function & {
  rooms: (FunctionRoom & { room: Room })[];
  schedules: FunctionSchedule[];
};

export type AgendaEntry = {
  functionId: string;
  functionName: string;
  functionType: string;
  scheduleId: string;
  scheduleType: string;
  scheduleNotes: string | null;
  startTime: Date;
  endTime: Date;
  roomIds: string[];
};

export type DayAgenda = {
  dateKey: string; // "YYYY-MM-DD" in event timezone
  timeSlots: Date[]; // ordered unique startTimes for that day
  // roomId → slotKey (ISO string) → AgendaEntry[]
  cells: Map<string, Map<string, AgendaEntry[]>>;
};

export type AgendaData = {
  days: DayAgenda[];
  rooms: Room[];
  unscheduled: FunctionWithRelations[]; // missing a room OR a schedule
};

export function getDateKeyInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDateHeading(dateKey: string, timezone: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * Given the index of an entry's startTime in timeSlots, count how many
 * consecutive slots the entry spans (until the first slot >= endTime).
 */
export function computeRowspan(
  entry: AgendaEntry,
  timeSlots: Date[]
): number {
  const startIdx = timeSlots.findIndex(
    (s) => s.getTime() === entry.startTime.getTime()
  );
  if (startIdx === -1) return 1;

  let span = 1;
  for (let i = startIdx + 1; i < timeSlots.length; i++) {
    if (timeSlots[i].getTime() < entry.endTime.getTime()) {
      span++;
    } else {
      break;
    }
  }
  return span;
}

export function buildAgendaData(
  functions: FunctionWithRelations[],
  rooms: Room[],
  timezone: string
): AgendaData {
  const roomIdSet = new Set(rooms.map((r) => r.id));

  // Split: grid-eligible = has ≥1 room AND ≥1 schedule
  const eligible: FunctionWithRelations[] = [];
  const unscheduled: FunctionWithRelations[] = [];

  for (const fn of functions) {
    if (fn.rooms.length > 0 && fn.schedules.length > 0) {
      eligible.push(fn);
    } else {
      unscheduled.push(fn);
    }
  }

  // Expand each eligible fn × each schedule → AgendaEntry
  const entries: AgendaEntry[] = [];
  for (const fn of eligible) {
    const roomIds = fn.rooms
      .map((fr) => fr.roomId)
      .filter((id) => roomIdSet.has(id));
    if (roomIds.length === 0) {
      // All assigned rooms were removed from venue — treat as unscheduled
      unscheduled.push(fn);
      continue;
    }
    for (const schedule of fn.schedules) {
      entries.push({
        functionId: fn.id,
        functionName: fn.name,
        functionType: fn.type,
        scheduleId: schedule.id,
        scheduleType: schedule.type,
        scheduleNotes: schedule.notes,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        roomIds,
      });
    }
  }

  // Group entries by date of startTime in event timezone
  const byDate = new Map<string, AgendaEntry[]>();
  for (const entry of entries) {
    const dateKey = getDateKeyInTimezone(entry.startTime, timezone);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(entry);
  }

  const sortedDates = Array.from(byDate.keys()).sort();

  const days: DayAgenda[] = sortedDates.map((dateKey) => {
    const dayEntries = byDate.get(dateKey)!;

    // Unique, sorted start times for this day
    const uniqueMs = Array.from(
      new Set(dayEntries.map((e) => e.startTime.getTime()))
    ).sort((a, b) => a - b);
    const timeSlots = uniqueMs.map((ms) => new Date(ms));

    // Initialize cells: one column per venue room
    const cells = new Map<string, Map<string, AgendaEntry[]>>();
    for (const room of rooms) {
      cells.set(room.id, new Map());
    }

    // Place entries into cells
    for (const entry of dayEntries) {
      const slotKey = entry.startTime.toISOString();
      for (const roomId of entry.roomIds) {
        const col = cells.get(roomId);
        if (!col) continue;
        if (!col.has(slotKey)) col.set(slotKey, []);
        col.get(slotKey)!.push(entry);
      }
    }

    return { dateKey, timeSlots, cells };
  });

  return { days, rooms, unscheduled };
}
