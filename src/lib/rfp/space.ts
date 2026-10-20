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
  day: string | null; // YYYY-MM-DD, event-local; null until scheduled
  // Last day of a row that repeats daily (same times) or, with a 24-hr hold,
  // runs straight through; null for a single day.
  endDay: string | null;
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
  setupTypes: string[]; // linked setup orders' set-ups
  defaultSetup: string | null;
  avOrders: string[]; // linked AV orders' names
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

export const DAY_TBD = "Day TBD";

const nextDay = (key: string) => new Date(Date.parse(`${key}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

// Every day a row covers, first to last.
export function spaceRowDays(r: Pick<SpaceRow, "day" | "endDay">): (string | null)[] {
  if (!r.day) return [null];
  const out = [r.day];
  while (r.endDay && out[out.length - 1] < r.endDay && out.length < 60) out.push(nextDay(out[out.length - 1]));
  return out;
}

type Slot = { day: string; endDay: string | null; startTime: string; endTime: string; spans: boolean };

// A function's times as rows: same start and end on consecutive days fold
// into one repeating row; one schedule running over several days is one
// row through its last day.
function slots(schedules: Schedule[], timezone: string): Slot[] {
  const out: Slot[] = [];
  for (const s of schedules) {
    const day = getDateKeyInTimezone(s.startTime, timezone);
    const last = getDateKeyInTimezone(s.endTime, timezone);
    const slot = { day, endDay: last > day ? last : null, startTime: localTime(s.startTime, timezone), endTime: localTime(s.endTime, timezone), spans: last > day };
    const prev = out.find((o) => !o.spans && !slot.spans && o.startTime === slot.startTime && o.endTime === slot.endTime && nextDay(o.endDay ?? o.day) === day);
    if (prev) prev.endDay = day;
    else out.push(slot);
  }
  return out;
}

// One MEETING row per scheduled time of each on-site function; a function
// with no schedule yet is one row with no day or time.
export function functionSpaceRows(functions: SpaceFunctionInput[], support: Set<string>, timezone: string, withRooms: boolean): SpaceRow[] {
  return functions
    .filter((fn) => !fn.offSiteLocation)
    .flatMap((fn) => {
      const times = slots(ownSchedules(fn.schedules, support), timezone);
      return (times.length ? times : [null]).map((s) => ({
        kind: "MEETING" as const,
        functionId: fn.id,
        cateringOrderId: null,
        day: s?.day ?? null,
        endDay: s?.endDay ?? null,
        startTime: s?.startTime ?? null,
        endTime: s?.endTime ?? null,
        functionType: fn.type,
        name: formatFunctionLabel(fn),
        attendance: fn.setForCount ?? fn.expectedAttendance,
        setup: fn.setupTypes.join(", ") || fn.defaultSetup,
        areaSqFt: null,
        hold24: fn.hold24Hour || !!s?.spans,
        av: fn.avOrders.join(", ") || null,
        room: withRooms ? fn.rooms.join(", ") || null : null,
      }));
    });
}

// One FB row per catering order, at its function's first own schedule; an
// order not scheduled yet has no day or time.
export function cateringSpaceRows(orders: SpaceCateringInput[], support: Set<string>, timezone: string, withRooms: boolean): SpaceRow[] {
  return orders.flatMap((o) => {
    const s = o.function ? ownSchedules(o.function.schedules, support)[0] : undefined;
    return [
      {
        kind: "FB" as const,
        functionId: null,
        cateringOrderId: o.id,
        day: s ? getDateKeyInTimezone(s.startTime, timezone) : null,
        endDay: null,
        startTime: s ? localTime(s.startTime, timezone) : null,
        endTime: s ? localTime(s.endTime, timezone) : null,
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

// By day (unscheduled last), then start time and name.
export function sortSpaceRows<T extends Pick<SpaceRow, "day" | "startTime" | "name">>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => (a.day ?? "9999").localeCompare(b.day ?? "9999") || (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.name.localeCompare(b.name));
}
