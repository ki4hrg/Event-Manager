// An RFP's function-space rows (RfpSpaceRequest): the candidates "Add from
// functions" offers, built from the event's functions and catering orders,
// and the time formatting the editor and document share. Pure.

import type { RfpSpaceKind } from "@prisma/client";
import { getDateKeyInTimezone } from "@/lib/agendaUtils";
import { formatFunctionLabel } from "@/lib/functionNumbers";

// A row as the editor and core exchange it (RfpSpaceArgs without the id).
export type SpaceRow = {
  kind: RfpSpaceKind;
  functionId: string | null;
  cateringOrderId: string | null;
  day: string; // YYYY-MM-DD, event-local
  startTime: string | null; // HH:MM, event-local
  endTime: string | null;
  functionType: string | null;
  name: string;
  attendance: number | null;
  setup: string | null;
  areaSqFt: number | null;
  av: string | null;
  hold24: boolean;
  room: string | null;
};

type Schedule = { type: string; startTime: Date; endTime: Date };

export type SpaceFunctionInput = {
  id: string;
  name: string;
  type: string;
  functionNumber: string | null;
  breakoutGroup: { name: string } | null;
  hold24Hour: boolean;
  expectedAttendance: number | null;
  setForCount: number | null;
  offSiteLocation: string | null;
  rooms: string[];
  setupTypes: string[];
  schedules: Schedule[];
};

export type SpaceCateringInput = {
  id: string;
  name: string;
  mealType: string | null;
  expectedCount: number | null;
  confirmedCount: number | null;
  guaranteeCount: number | null;
  function: { rooms: string[]; schedules: Schedule[] } | null;
};

// "HH:MM" on the 24-hour clock in the event's timezone.
export function localTime(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

// "HH:MM" → "8:00 AM".
export function formatClock(hhmm: string | null): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function formatClockRange(start: string | null, end: string | null): string {
  return [formatClock(start), formatClock(end)].filter(Boolean).join(" – ") || "—";
}

// A function's own schedules; set-up and tear-down only when that's all it has.
function ownSchedules(schedules: Schedule[], support: Set<string>) {
  const own = schedules.filter((s) => !support.has(s.type));
  return (own.length ? own : schedules).slice().sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

// One MEETING row per scheduled time of each on-site function.
export function functionSpaceRows(functions: SpaceFunctionInput[], support: Set<string>, timezone: string, withRooms: boolean): SpaceRow[] {
  return functions
    .filter((fn) => !fn.offSiteLocation)
    .flatMap((fn) =>
      ownSchedules(fn.schedules, support).map((s) => ({
        kind: "MEETING" as const,
        functionId: fn.id,
        cateringOrderId: null,
        day: getDateKeyInTimezone(s.startTime, timezone),
        startTime: localTime(s.startTime, timezone),
        endTime: localTime(s.endTime, timezone),
        functionType: fn.type,
        name: formatFunctionLabel(fn),
        attendance: fn.setForCount ?? fn.expectedAttendance,
        setup: fn.setupTypes.join(", ") || null,
        areaSqFt: null,
        av: null,
        hold24: fn.hold24Hour,
        room: withRooms ? fn.rooms.join(", ") || null : null,
      })),
    );
}

// One FB row per catering order, at its function's first own schedule; an
// order with no scheduled function has no day and is left out.
export function cateringSpaceRows(orders: SpaceCateringInput[], support: Set<string>, timezone: string, withRooms: boolean): SpaceRow[] {
  return orders.flatMap((o) => {
    const s = o.function ? ownSchedules(o.function.schedules, support)[0] : undefined;
    if (!s) return [];
    return [
      {
        kind: "FB" as const,
        functionId: null,
        cateringOrderId: o.id,
        day: getDateKeyInTimezone(s.startTime, timezone),
        startTime: localTime(s.startTime, timezone),
        endTime: localTime(s.endTime, timezone),
        functionType: o.mealType,
        name: o.name,
        attendance: o.guaranteeCount ?? o.confirmedCount ?? o.expectedCount,
        setup: null,
        areaSqFt: null,
        av: null,
        hold24: false,
        room: withRooms ? o.function?.rooms.join(", ") || null : null,
      },
    ];
  });
}

export function sortSpaceRows<T extends Pick<SpaceRow, "day" | "startTime" | "name">>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => a.day.localeCompare(b.day) || (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.name.localeCompare(b.name));
}
