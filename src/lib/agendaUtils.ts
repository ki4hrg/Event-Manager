import type { Function, FunctionRoom, FunctionSchedule, Room, PresentationSlot, Presentation, BreakoutGroup, BreakoutGroupRoom, BreakoutSessionRoomOverride } from "@prisma/client";

export type FunctionWithRelations = Function & {
  rooms: (FunctionRoom & { room: Room })[];
  schedules: FunctionSchedule[];
  presentationSlots?: (PresentationSlot & { presentation: Presentation })[];
  breakoutGroup?: (BreakoutGroup & { rooms: (BreakoutGroupRoom & { room: Room })[] }) | null;
  sessionRoomOverrides?: BreakoutSessionRoomOverride[];
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
  scheduleTypeColor: string | null;
  scheduleNotes: string | null;
  isPublic: boolean;
  startTime: Date;
  endTime: Date;
  roomIds: string[];
  /** Presentation titles assigned to this function (for breakout blocks) */
  presentationTitles: string[];
  /** Breakout-specific fields */
  isBreakout: boolean;
  breakoutGroupName: string | null;
  /** Off-site location name, present only for synthetic __offsite__ entries */
  offSiteLocation: string | null;
  /** Set only on segments of multi-day entries — the full original time range */
  originalStartTime?: Date;
  originalEndTime?: Date;
  segmentPosition?: "first" | "middle" | "last";
};

export type DayAgenda = {
  dateKey: string; // "YYYY-MM-DD" in event timezone
  timeSlots: Date[];
  scrollToSlotIndex: number; // index into timeSlots for initial scroll position
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

export type SerializedAgendaEntry = Omit<AgendaEntry, "startTime" | "endTime" | "originalStartTime" | "originalEndTime"> & {
  startTime: string; // ISO string
  endTime: string;   // ISO string
  originalStartTime?: string;
  originalEndTime?: string;
};

export type SerializedDayAgenda = {
  dateKey: string;
  timeSlots: string[]; // ISO strings
  scrollToSlotIndex: number;
  cells: Record<string, Record<string, SerializedAgendaEntry[]>>;
};

export type SerializedAgendaData = {
  days: SerializedDayAgenda[];
  // Room and FunctionWithRelations have Date fields (createdAt, updatedAt) that
  // become strings over the wire — they are not used in client rendering, so
  // we keep the types loose here rather than creating full serialized variants.
  rooms: any[];
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
          originalStartTime: e.originalStartTime?.toISOString(),
          originalEndTime: e.originalEndTime?.toISOString(),
        }));
      });
    });
    return {
      dateKey: day.dateKey,
      timeSlots: day.timeSlots.map((d) => d.toISOString()),
      scrollToSlotIndex: day.scrollToSlotIndex,
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
            originalStartTime: e.originalStartTime ? new Date(e.originalStartTime) : undefined,
            originalEndTime: e.originalEndTime ? new Date(e.originalEndTime) : undefined,
          }))
        );
      }
      cells.set(roomId, slotMap);
    }
    return {
      dateKey: day.dateKey,
      timeSlots: day.timeSlots.map((s: string) => new Date(s)),
      scrollToSlotIndex: day.scrollToSlotIndex,
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

export function formatShortDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * "9:00 AM – 11:00 AM" when start/end fall on the same day in the given timezone,
 * "Wed, May 27, 3:00 PM – Sat, May 30, 3:00 PM" when end crosses into a different
 * day. Used on report schedule rows so multi-day functions don't quietly drop
 * the end date.
 */
export function formatTimeRange(start: Date, end: Date, timezone: string): string {
  if (getDateKeyInTimezone(start, timezone) !== getDateKeyInTimezone(end, timezone)) {
    return `${formatDateTime(start, timezone)} – ${formatDateTime(end, timezone)}`;
  }
  return `${formatTime(start, timezone)} – ${formatTime(end, timezone)}`;
}

// ── Grid helpers ───────────────────────────────────────────────────────────────

/** Finds the slot key under which a given schedule entry lives in a column. */
export function findSlotKeyForEntry(
  col: Map<string, AgendaEntry[]>,
  scheduleId: string
): string | null {
  const pairs = Array.from(col.entries());
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][1].some((e) => e.scheduleId === scheduleId)) return pairs[i][0];
  }
  return null;
}

/** Returns room IDs where every entry spans the full day (midnight-to-midnight). */
export function getFullDayRoomIds(day: DayAgenda): Set<string> {
  const fullDay = new Set<string>();
  const dayStart = day.timeSlots[0]?.getTime();
  const dayEnd = day.timeSlots.length > 0
    ? day.timeSlots[day.timeSlots.length - 1].getTime() + SLOT_INTERVAL_MS
    : undefined;
  if (dayStart === undefined || dayEnd === undefined) return fullDay;

  Array.from(day.cells.entries()).forEach(([roomId, slotMap]) => {
    // Deduplicate entries that appear in multiple slots
    const seen = new Map<string, AgendaEntry>();
    Array.from(slotMap.values()).flat().forEach((e) => {
      if (!seen.has(e.scheduleId)) seen.set(e.scheduleId, e);
    });
    if (seen.size === 0) return;
    const allFullDay = Array.from(seen.values()).every(
      (e) => e.startTime.getTime() <= dayStart && e.endTime.getTime() >= dayEnd
    );
    if (allFullDay) fullDay.add(roomId);
  });
  return fullDay;
}

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
 * Counts how many consecutive time slots an entry spans.
 * A slot is "spanned" if slot.startTime < entry.endTime.
 */
export function computeRowspan(entry: AgendaEntry, timeSlots: Date[]): number {
  const entryMs = entry.startTime.getTime();
  const startIdx = timeSlots.findLastIndex((s) => s.getTime() <= entryMs);
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

// ── Multi-day splitting ───────────────────────────────────────────────────────

/** Returns the UTC instant of midnight for a YYYY-MM-DD in the given timezone. */
export function getStartOfDayInTimezone(dateKey: string, timezone: string): Date {
  const noon = new Date(`${dateKey}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(noon);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const s = Number(parts.find((p) => p.type === "second")?.value ?? 0);
  // noon UTC displays as h:m:s in local tz → midnight local = noon UTC - local offset
  return new Date(noon.getTime() - h * 3600000 - m * 60000 - s * 1000);
}

export function getNextDateKey(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Splits a multi-day entry into per-day segments clipped to day boundaries.
 * Single-day entries pass through unchanged.
 */
function splitEntryIntoDaySegments(
  entry: AgendaEntry,
  timezone: string
): AgendaEntry[] {
  const startDateKey = getDateKeyInTimezone(entry.startTime, timezone);
  const endDateKey = getDateKeyInTimezone(entry.endTime, timezone);

  if (startDateKey === endDateKey) return [entry];

  // If endTime is exactly midnight of endDateKey, it doesn't occupy that day
  const endDayMidnight = getStartOfDayInTimezone(endDateKey, timezone);
  if (entry.endTime.getTime() === endDayMidnight.getTime()) return [entry];

  const segments: AgendaEntry[] = [];
  let currentDateKey = startDateKey;
  let dayStart = getStartOfDayInTimezone(currentDateKey, timezone);

  while (currentDateKey <= endDateKey) {
    const nextDateKey = getNextDateKey(currentDateKey);
    const dayEnd = getStartOfDayInTimezone(nextDateKey, timezone);

    const segStart = currentDateKey === startDateKey ? entry.startTime : dayStart;
    const segEnd = currentDateKey === endDateKey ? entry.endTime : dayEnd;

    const isFirst = currentDateKey === startDateKey;
    const isLast = currentDateKey === endDateKey;

    segments.push({
      ...entry,
      startTime: segStart,
      endTime: segEnd,
      originalStartTime: entry.startTime,
      originalEndTime: entry.endTime,
      segmentPosition: isFirst ? "first" : isLast ? "last" : "middle",
    });

    currentDateKey = nextDateKey;
    dayStart = dayEnd;
  }

  return segments;
}

// ── Main data builder ──────────────────────────────────────────────────────────

export const SLOT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export function buildAgendaData(
  functions: FunctionWithRelations[],
  rooms: Room[],
  timezone: string,
  scheduleTypeAttrs?: Map<string, { label: string; color: string | null }>
): AgendaData {
  const roomIdSet = new Set(rooms.map((r) => r.id));

  // Split functions into regular eligible, breakout blocks, and unscheduled
  const eligible: FunctionWithRelations[] = [];
  const breakoutBlocks: FunctionWithRelations[] = [];
  const unscheduled: FunctionWithRelations[] = [];

  for (const fn of functions) {
    if (fn.type === "BREAKOUT_BLOCK") {
      // Breakout blocks are handled separately — never appear in unscheduled
      breakoutBlocks.push(fn);
    } else if (fn.rooms.length > 0 && fn.schedules.length > 0) {
      eligible.push(fn);
    } else if (fn.offSiteLocation && fn.schedules.length > 0) {
      eligible.push(fn);
    } else {
      unscheduled.push(fn);
    }
  }

  // Expand each eligible fn × each schedule → AgendaEntry
  const entries: AgendaEntry[] = [];
  let hasOffSiteEntries = false;
  for (const fn of eligible) {
    let roomIds: string[];
    if (fn.offSiteLocation && fn.rooms.length === 0) {
      roomIds = ["__offsite__"];
      hasOffSiteEntries = true;
    } else {
      roomIds = fn.rooms
        .map((fr) => fr.roomId)
        .filter((id) => roomIdSet.has(id));
      if (roomIds.length === 0) {
        // All assigned rooms were removed from venue — treat as unscheduled
        unscheduled.push(fn);
        continue;
      }
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
        scheduleTypeLabel: scheduleTypeAttrs?.get(schedule.type)?.label ?? null,
        scheduleTypeColor: scheduleTypeAttrs?.get(schedule.type)?.color ?? null,
        scheduleNotes: schedule.notes,
        isPublic: schedule.isPublic,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        roomIds,
        presentationTitles,
        isBreakout: false,
        breakoutGroupName: null,
        offSiteLocation: fn.offSiteLocation ?? null,
      });
    }
  }

  // Expand breakout blocks: one entry per session × effective room
  for (const fn of breakoutBlocks) {
    if (fn.schedules.length === 0) continue;
    // Compute effective rooms: group rooms − excludes + includes
    const groupRoomIds = new Set(
      (fn.breakoutGroup?.rooms ?? [])
        .map((gr) => gr.roomId)
        .filter((id) => roomIdSet.has(id))
    );
    const overrides = fn.sessionRoomOverrides ?? [];
    for (const ovr of overrides) {
      if (ovr.type === "exclude") groupRoomIds.delete(ovr.roomId);
      else if (ovr.type === "include" && roomIdSet.has(ovr.roomId)) groupRoomIds.add(ovr.roomId);
    }
    if (groupRoomIds.size === 0) continue;

    const groupName = fn.breakoutGroup?.name ?? null;
    const slotsByRoom = new Map(
      (fn.presentationSlots ?? [])
        .filter((ps) => ps.roomId)
        .map((ps) => [ps.roomId!, ps])
    );
    const effectiveRoomIds = Array.from(groupRoomIds);

    for (const schedule of fn.schedules) {
      for (const roomId of effectiveRoomIds) {
        const slotForRoom = slotsByRoom.get(roomId);
        const presentationTitles = slotForRoom ? [slotForRoom.presentation.title] : [];

        entries.push({
          functionId: fn.id,
          functionName: slotForRoom ? slotForRoom.presentation.title : fn.name,
          functionType: fn.type,
          functionDescription: fn.description,
          scheduleId: schedule.id,
          scheduleType: schedule.type,
          scheduleTypeLabel: scheduleTypeAttrs?.get(schedule.type)?.label ?? null,
          scheduleTypeColor: scheduleTypeAttrs?.get(schedule.type)?.color ?? null,
          scheduleNotes: schedule.notes,
          isPublic: schedule.isPublic,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          roomIds: [roomId],
          presentationTitles,
          isBreakout: true,
          breakoutGroupName: groupName,
          offSiteLocation: null,
        });
      }
    }
  }

  // Split multi-day entries into per-day segments
  const segmented = entries.flatMap((e) => splitEntryIntoDaySegments(e, timezone));

  // Group entries by date of startTime in event timezone
  const byDate = new Map<string, AgendaEntry[]>();
  for (const entry of segmented) {
    const dateKey = getDateKeyInTimezone(entry.startTime, timezone);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(entry);
  }

  const sortedDates = Array.from(byDate.keys()).sort();

  const days: DayAgenda[] = sortedDates.map((dateKey) => {
    const dayEntries = byDate.get(dateKey)!;

    // Full-day grid: midnight to midnight in event timezone
    const dayMidnight = getStartOfDayInTimezone(dateKey, timezone);
    const nextMidnight = getStartOfDayInTimezone(getNextDateKey(dateKey), timezone);
    const timeSlots: Date[] = [];
    for (let t = dayMidnight.getTime(); t < nextMidnight.getTime(); t += SLOT_INTERVAL_MS) {
      timeSlots.push(new Date(t));
    }

    // Initialize cells: one column per venue room (plus __offsite__ if needed)
    const cells = new Map<string, Map<string, AgendaEntry[]>>();
    for (const room of rooms) {
      cells.set(room.id, new Map());
    }
    if (hasOffSiteEntries) {
      cells.set("__offsite__", new Map());
    }

    // Place entries into cells keyed by the containing slot's ISO string.
    // Entries may not start exactly on a 30-min boundary, so we floor to the
    // nearest slot so the grid lookup always finds them.
    for (const entry of dayEntries) {
      const entryMs = entry.startTime.getTime();
      const slotIdx = timeSlots.findLastIndex((s) => s.getTime() <= entryMs);
      const slotKey = slotIdx >= 0
        ? timeSlots[slotIdx].toISOString()
        : entry.startTime.toISOString();
      for (const roomId of entry.roomIds) {
        const col = cells.get(roomId);
        if (!col) continue;
        if (!col.has(slotKey)) col.set(slotKey, []);
        col.get(slotKey)!.push(entry);
      }
    }

    // Scroll target: 1 slot before the earliest non-full-day entry
    const dayMidnightMs = dayMidnight.getTime();
    const nextMidnightMs = nextMidnight.getTime();
    let earliestNonFullDay = Infinity;
    for (const e of dayEntries) {
      const isFullDay = e.startTime.getTime() <= dayMidnightMs && e.endTime.getTime() >= nextMidnightMs;
      if (!isFullDay && e.startTime.getTime() < earliestNonFullDay) {
        earliestNonFullDay = e.startTime.getTime();
      }
    }
    let scrollToSlotIndex = 0;
    if (earliestNonFullDay < Infinity) {
      const targetMs = earliestNonFullDay - SLOT_INTERVAL_MS;
      scrollToSlotIndex = Math.max(0, timeSlots.findIndex((s) => s.getTime() >= targetMs));
    }

    return { dateKey, timeSlots, scrollToSlotIndex, cells };
  });

  const returnRooms = hasOffSiteEntries
    ? [...rooms, { id: "__offsite__", name: "Off-site", capacity: null } as Room]
    : rooms;
  return { days, rooms: returnRooms, unscheduled };
}
