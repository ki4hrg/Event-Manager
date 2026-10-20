// Block pattern math for the RFP report. Pure (no Prisma). Events of
// different lengths line up by each night's role instead of its date. A
// night is named for the day it follows, hotel-stay style: Pre −n before the
// start; First night; Middle nights (averaged); Last night (the one before
// the closing day); Post +n from the closing day's night on. Internally
// those are pre-n / first / middle / last / end+(n−1).
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
  if (role === "middle") return "Middle nights";
  if (role === "last") return "Last night";
  if (role.startsWith("pre-")) return `Pre −${role.slice(4)}`;
  return `Post +${Number(role.slice(4)) + 1}`;
}

function roleOrder(role: PatternRole): number {
  if (role.startsWith("pre-")) return -Number(role.slice(4));
  if (role === "first") return 1000;
  if (role === "middle") return 1001;
  if (role === "last") return 1002;
  return 2000 + Number(role.slice(4));
}

// "Start", "Start −1", "Start +2" — a night's distance from the start date.
export function offsetLabel(offset: number): string {
  return offset === 0 ? "Start" : `Start ${offset > 0 ? "+" : "−"}${Math.abs(offset)}`;
}

export const sortRoles = (roles: Iterable<PatternRole>) => Array.from(new Set(roles)).sort((a, b) => roleOrder(a) - roleOrder(b));

// Interior nights an event has between its First and Last nights.
export const middleNights = (start: string, end: string) => Math.max(0, daysBetween(start, end) - 2);

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
// takes the larger of First and Last. A Middle night is an estimate when it
// borrowed, or lies past the most interior nights any past event had
// (`observedMiddle`). Pre / post nights that round to no rooms are trimmed
// from the ends.
export type ProposedNight = { night: string; offset: number; role: PatternRole; rooms: number; estimate: boolean };

export function proposeNights(start: string, end: string, byRole: Map<PatternRole, number>, observedMiddle = Infinity): ProposedNight[] {
  const roles = Array.from(byRole.keys());
  const maxPre = Math.max(0, ...roles.filter((r) => r.startsWith("pre-")).map((r) => Number(r.slice(4))));
  const maxEnd = Math.max(-1, ...roles.filter((r) => r.startsWith("end+")).map((r) => Number(r.slice(4))));
  const first = byRole.get("first") ?? 0;
  const last = byRole.get("last") ?? 0;
  const oneNight = daysBetween(start, end) === 1;
  const out: ProposedNight[] = [];
  for (let night = addDays(start, -maxPre); night <= addDays(end, maxEnd); night = addDays(night, 1)) {
    const role = nightRole(start, end, night);
    const rooms = oneNight && role === "first" ? Math.max(first, last) : role === "middle" ? (byRole.get("middle") ?? (first + last) / 2) : (byRole.get(role) ?? 0);
    const offset = daysBetween(start, night);
    const estimate = role === "middle" && (!byRole.has("middle") || offset > observedMiddle);
    out.push({ night, offset, role, rooms, estimate });
  }
  const outside = (i: number) => out[i].role.startsWith("pre-") || out[i].role.startsWith("end+");
  let from = 0;
  let to = out.length;
  while (from < to && outside(from) && Math.round(out[from].rooms) === 0) from++;
  while (to > from && outside(to - 1) && Math.round(out[to - 1].rooms) === 0) to--;
  return out.slice(from, to);
}

export type PatternBasis = "average" | "highest" | "latest";

export type PatternEvent = { startDate: string; endDate: string; pickedUp: Record<string, number>; blocked: Record<string, number> };

// Per-role figures across past events (newest first): pickup and block,
// averaged and maxed, the latest event's pickup, and each role's share of the
// average peak. Middle only counts events long enough to have one; any other
// role an event lacks had no rooms that night.
export function patternStats(events: PatternEvent[]) {
  const rows = events.map((e) => ({ roles: eventRoles(e.startDate, e.endDate, e.pickedUp), blockRoles: eventRoles(e.startDate, e.endDate, e.blocked) }));
  const roles = sortRoles(rows.flatMap((r) => Array.from(r.roles.keys())));
  const valuesFor = (role: string, of: (r: (typeof rows)[number]) => Map<string, number>) =>
    rows.flatMap((r) => (of(r).has(role) ? [of(r).get(role)!] : role === "middle" ? [] : [0]));
  const mean = (ns: number[]) => (ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : 0);
  const max = (ns: number[]) => Math.max(0, ...ns);
  const byRole = (of: (r: (typeof rows)[number]) => Map<string, number>, agg: (ns: number[]) => number) =>
    new Map(roles.map((role) => [role, agg(valuesFor(role, of))]));
  const average = byRole((r) => r.roles, mean);
  const avgPeak = Math.max(0, ...Array.from(average.values()));
  return {
    roles,
    average,
    highest: byRole((r) => r.roles, max),
    averageBlock: byRole((r) => r.blockRoles, mean),
    highestBlock: byRole((r) => r.blockRoles, max),
    latest: new Map(roles.flatMap((role) => (rows[0]?.roles.has(role) || role !== "middle" ? [[role, rows[0]?.roles.get(role) ?? 0] as const] : []))),
    shape: new Map(Array.from(average, ([role, n]) => [role, avgPeak ? Math.round((n / avgPeak) * 100) : 0])),
    observedMiddle: max(events.map((e) => middleNights(e.startDate, e.endDate))),
  };
}

// Whole rooms per role for a new block: the chosen basis, adjusted by a percentage.
export function proposedRoles(stats: ReturnType<typeof patternStats>, basis: PatternBasis, adjust: number): Map<PatternRole, number> {
  const base = basis === "highest" ? stats.highest : basis === "latest" ? stats.latest : stats.average;
  return new Map(Array.from(base, ([role, n]) => [role, Math.max(0, Math.round(n * (1 + adjust / 100)))]));
}
