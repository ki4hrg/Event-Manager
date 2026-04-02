import type { Function, FunctionRoom, FunctionSchedule, Room, PresentationSlot, Presentation } from "@prisma/client";

export type FunctionWithRelations = Function & {
  rooms: (FunctionRoom & { room: Room })[];
  schedules: FunctionSchedule[];
  presentationSlots?: (PresentationSlot & { presentation: Presentation })[];
};

// ── Core types ────────────────────────────────────────────────────────────────

export type AgendaEntry = {
  functionId: string;
  functionName: string;
  functionType: string;
  functionDescription: string | null;
  scheduleId: string;
  scheduleType: string;
  scheduleTypeLabel: string | null;
  scheduleNotes: string | null;
  isPublic: boolean;
  startTime: Date;
  endTime: Date;
  roomIds: string[];
  /** Presentation titles assigned to this function (for breakout blocks) */
  presentationTitles: string[];
};

export type DayAgenda = {
  dateKey: string; // "YYYY-MM-DD" in event timezone
  timeSlots: Date[];
  // roomId → slotKey (ISO string) → AgendaEntry[]
  cells: Map<string, Map<string, AgendaEntry[]>>;
};

export type AgendaData = {
  days: DayAgenda[];
  rooms: Room[];
  unscheduled: FunctionWithRelations[]; // missing a room OR a schedule
};

// ── Serialized types (for server → client prop passing) ───────────────────────
// Maps and Dates are not JSON-serializable; these plain-object equivalents are
// used as the prop type for AgendaGrid (a "use client" component).

export type SerializedAgendaEntry = Omit<AgendaEntry, "startTime" | "endTime"> & {
  startTime: string; // ISO string
  endTime: string;   // ISO string
};

export type SerializedDayAgenda = {
  dateKey: string;
  timeSlots: string[]; // ISO strings
  cells: Record<string, Record<string, SerializedAgendaEntry[]>>;
};

export type SerializedAgendaData = {
  days: SerializedDayAgenda[];
  // Room and FunctionWithRelations have Date fields (createdAt, updatedAt) that
  // become strings over the wire — they are not used in client rendering, so
  // we keep the types loose here rather than creating full serialized variants.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rooms: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unscheduled: any[];
};

export function serializeAgendaData(data: AgendaData): SerializedAgendaData {
  const days: SerializedDayAgenda[] = data.days.map((day) => {
    const cells: Record<string, Record<string, SerializedAgendaEntry[]>> = {};
    Array.from(day.cells.entries()).forEach(([roomId, slotMap]) => {
      cells[roomId] = {};
      Array.from(slotMap.entries()).forEach(([slotKey, entries]) => {
        cells[roomId][slotKey] = entries.map((e) => ({
          ...e,
          startTime: e.startTime.toISOString(),
          endTime: e.endTime.toISOString(),
        }));
      });
    });
    return {
      dateKey: day.dateKey,
      timeSlots: day.timeSlots.map((d) => d.toISOString()),
      cells,
    };
  });

  return { days, rooms: data.rooms, unscheduled: data.unscheduled };
}

export function deserializeAgendaData(data: SerializedAgendaData): AgendaData {
  const days: DayAgenda[] = data.days.map((day) => {
    const cells = new Map<string, Map<string, AgendaEntry[]>>();
    for (const roomId of Object.keys(day.cells)) {
      const slotMap = new Map<string, AgendaEntry[]>();
      for (const slotKey of Object.keys(day.cells[roomId])) {
        slotMap.set(
          slotKey,
          day.cells[roomId][slotKey].map((e: SerializedAgendaEntry) => ({
            ...e,
            startTime: new Date(e.startTime),
            endTime: new Date(e.endTime),
          }))
        );
      }
      cells.set(roomId, slotMap);
    }
    return {
      dateKey: day.dateKey,
      timeSlots: day.timeSlots.map((s: string) => new Date(s)),
      cells,
    };
  });

  return {
    days,
    rooms: data.rooms as Room[],
    unscheduled: data.unscheduled as FunctionWithRelations[],
  };
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

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

// ── Grid helpers ───────────────────────────────────────────────────────────────

/** Returns the set of roomIds that have at least one entry for a given day. */
export function getUsedRoomIds(day: DayAgenda): Set<string> {
  const used = new Set<string>();
  Array.from(day.cells.entries()).forEach(([roomId, slotMap]) => {
    const hasEntries = Array.from(slotMap.values()).some((e) => e.length > 0);
    if (hasEntries) used.add(roomId);
  });
  return used;
}

/**
 * Generates a continuous array of time slots from (floor(earliest) - buffer)
 * to (ceil(latest) + buffer) at the given interval. The buffer adds one
 * interval of empty space before the first event and after the last.
 */
export function buildContinuousSlots(
  dayEntries: AgendaEntry[],
  intervalMs: number
): Date[] {
  if (dayEntries.length === 0) return [];

  let minMs = Infinity;
  let maxMs = -Infinity;
  for (const e of dayEntries) {
    const start = e.startTime.getTime();
    const end = e.endTime.getTime();
    if (start < minMs) minMs = start;
    if (end > maxMs) maxMs = end;
  }

  // Snap to interval boundaries, then add one buffer slot on each side
  const startMs = Math.floor(minMs / intervalMs) * intervalMs - intervalMs;
  const endMs = Math.ceil(maxMs / intervalMs) * intervalMs + intervalMs;

  const slots: Date[] = [];
  for (let t = startMs; t < endMs; t += intervalMs) {
    slots.push(new Date(t));
  }
  return slots;
}

/**
 * Counts how many consecutive time slots an entry spans.
 * A slot is "spanned" if slot.startTime < entry.endTime.
 */
export function computeRowspan(entry: AgendaEntry, timeSlots: Date[]): number {
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

// ── Main data builder ──────────────────────────────────────────────────────────

export const SLOT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export function buildAgendaData(
  functions: FunctionWithRelations[],
  rooms: Room[],
  timezone: string,
  scheduleTypeLabels?: Map<string, string>
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
    const presentationTitles = (fn.presentationSlots ?? []).map(
      (ps) => ps.presentation.title
    );
    for (const schedule of fn.schedules) {
      entries.push({
        functionId: fn.id,
        functionName: fn.name,
        functionType: fn.type,
        functionDescription: fn.description,
        scheduleId: schedule.id,
        scheduleType: schedule.type,
        scheduleTypeLabel: scheduleTypeLabels?.get(schedule.type) ?? null,
        scheduleNotes: schedule.notes,
        isPublic: schedule.isPublic,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        roomIds,
        presentationTitles,
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

    // Clamp multi-day entries so the grid only covers this day's time range
    const clampedEntries = dayEntries.map((e) => {
      const endKey = getDateKeyInTimezone(e.endTime, timezone);
      if (endKey !== dateKey) {
        return { ...e, endTime: new Date(e.startTime.getTime() + SLOT_INTERVAL_MS) };
      }
      return e;
    });

    // Continuous 30-min grid with a 30-min buffer before/after
    const timeSlots = buildContinuousSlots(clampedEntries, SLOT_INTERVAL_MS);

    // Initialize cells: one column per venue room
    const cells = new Map<string, Map<string, AgendaEntry[]>>();
    for (const room of rooms) {
      cells.set(room.id, new Map());
    }

    // Place entries into cells keyed by their exact startTime ISO string.
    // Because entries start on 30-min boundaries (or not — original data is
    // preserved), we key on the entry's actual startTime. computeRowspan will
    // find the matching slot by exact ms comparison.
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
