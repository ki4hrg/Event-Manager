// Block pattern math for the RFP report. Pure (no Prisma). Events of
// different lengths line up by each night's role instead of its date:
// nights before the start count back from it, nights from the start up to
// the day before the end are the event's First / Middle / Last nights, and
// the end day's night onward count forward from the end.
//
// Event start / end are calendar dates (the UTC date, as everywhere else in
// the app); night keys are YYYY-MM-DD.

import { dateFromKey, dateKey } from "./hotels";

export type PatternRole = string; // "pre-2", "first", "middle", "last", "end+0", ...

const DAY = 86_400_000;
const addDays = (key: string, n: number) => dateKey(new Date(dateFromKey(key).getTime() + n * DAY));
const daysBetween = (a: string, b: string) => Math.round((dateFromKey(b).getTime() - dateFromKey(a).getTime()) / DAY);

export function roleLabel(role: PatternRole): string {
  if (role === "first") return "First night";
  if (role === "middle") return "Middle";
  if (role === "last") return "Last night";
  if (role.startsWith("pre-")) return `Pre −${role.slice(4)}`;
  const n = Number(role.slice(4));
  return n === 0 ? "End night" : `End +${n}`;
}

function roleOrder(role: PatternRole): number {
  if (role.startsWith("pre-")) return -Number(role.slice(4));
  if (role === "first") return 1000;
  if (role === "middle") return 1001;
  if (role === "last") return 1002;
  return 2000 + Number(role.slice(4));
}

export const sortRoles = (roles: Iterable<PatternRole>) => Array.from(new Set(roles)).sort((a, b) => roleOrder(a) - roleOrder(b));

// Rooms per role for one event. Every in-session night counts (0 when
// nothing was picked up); a one-night event's night is both First and Last;
// Middle is the average of the interior nights.
export function eventRoles(start: string, end: string, pickedUp: Record<string, number>): Map<PatternRole, number> {
  const out = new Map<PatternRole, number>();
  const sessionNights = Math.max(0, daysBetween(start, end));
  const middle: number[] = [];
  for (let i = 0; i < sessionNights; i++) {
    const rooms = pickedUp[addDays(start, i)] ?? 0;
    if (i === 0) out.set("first", rooms);
    if (i === sessionNights - 1) out.set("last", rooms);
    if (i > 0 && i < sessionNights - 1) middle.push(rooms);
  }
  if (middle.length) out.set("middle", middle.reduce((s, n) => s + n, 0) / middle.length);
  for (const [night, rooms] of Object.entries(pickedUp)) {
    if (night < start) out.set(`pre-${daysBetween(night, start)}`, rooms);
    else if (night >= end) out.set(`end+${daysBetween(end, night)}`, rooms);
  }
  return out;
}

// The role a night of a new event plays, given its start and end.
export function nightRole(start: string, end: string, night: string): PatternRole {
  if (night < start) return `pre-${daysBetween(night, start)}`;
  if (night >= end) return `end+${daysBetween(end, night)}`;
  const i = daysBetween(start, night);
  const last = daysBetween(start, end) - 1;
  return i === 0 ? "first" : i === last ? "last" : "middle";
}

// Rooms per night for a new event from per-role figures, covering the same
// pre / end nights the history has. A night with no figure for its role
// borrows: Middle from the average of First and Last; a one-night event
// takes the larger of First and Last.
export function proposeNights(start: string, end: string, byRole: Map<PatternRole, number>): { night: string; role: PatternRole; rooms: number }[] {
  const roles = Array.from(byRole.keys());
  const maxPre = Math.max(0, ...roles.filter((r) => r.startsWith("pre-")).map((r) => Number(r.slice(4))));
  const maxEnd = Math.max(-1, ...roles.filter((r) => r.startsWith("end+")).map((r) => Number(r.slice(4))));
  const first = byRole.get("first") ?? 0;
  const last = byRole.get("last") ?? 0;
  const oneNight = daysBetween(start, end) === 1;
  const out = [];
  for (let night = addDays(start, -maxPre); night <= addDays(end, maxEnd); night = addDays(night, 1)) {
    const role = nightRole(start, end, night);
    const rooms = oneNight && role === "first" ? Math.max(first, last) : role === "middle" ? (byRole.get("middle") ?? (first + last) / 2) : (byRole.get(role) ?? 0);
    out.push({ night, role, rooms });
  }
  return out;
}
