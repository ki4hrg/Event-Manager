// Pickup math for hotel blocks — the one place that turns a block's guests,
// counts and other-reservation figures into rooms picked up per night. Pure
// (no Prisma), so the block page, the reports and the ESG / PER all agree.
//
// Rooms on a night = active guests staying that night + entered counts for
// that night + the block night's other reservations. A block night with a
// null room type is the Run of House allotment. Guests and counts land on
// their own room type when the block names it; any other type pools into Run
// of House when the block has it, and otherwise still counts toward the
// night's total outside the block.

import { dateKey, nightKeys } from "./hotels";

export type PickupGuestInput = {
  checkIn: Date | null;
  checkOut: Date | null;
  roomType: string | null;
  cancelled: boolean;
};
export type PickupCountInput = { night: Date; roomType: string | null; rooms: number };
export type PickupNightInput = {
  night: Date;
  roomType: string | null;
  rooms: number;
  contractedRooms: number | null;
  otherReservations: number;
};

export type NightPickup = {
  night: string;
  roomType: string | null;
  blocked: number;
  contracted: number | null;
  pickedUp: number;
};

const bucket = (roomType: string | null, night: string) => `${roomType ?? ""}|${night}`;

export function guestNights(g: Pick<PickupGuestInput, "checkIn" | "checkOut">): string[] {
  return g.checkIn && g.checkOut ? nightKeys(dateKey(g.checkIn), dateKey(g.checkOut)) : [];
}

// Rooms picked up per (roomType, night), keyed by bucket().
function pickupBuckets(nights: PickupNightInput[], guests: PickupGuestInput[], counts: PickupCountInput[]): Map<string, number> {
  const out = new Map<string, number>();
  const typed = new Set(nights.flatMap((n) => (n.roomType != null ? [n.roomType] : [])));
  const pooled = nights.some((n) => n.roomType == null);
  const add = (roomType: string | null, night: string, n: number) => {
    const key = bucket(roomType != null && (typed.has(roomType) || !pooled) ? roomType : null, night);
    out.set(key, (out.get(key) ?? 0) + n);
  };
  for (const g of guests) {
    if (g.cancelled) continue;
    for (const night of guestNights(g)) add(g.roomType, night, 1);
  }
  for (const c of counts) add(c.roomType, dateKey(c.night), c.rooms);
  for (const n of nights) if (n.otherReservations) add(n.roomType, dateKey(n.night), n.otherReservations);
  return out;
}

// One row per block night, plus a row for any (roomType, night) that has
// pickup but no block night — rooms picked up outside the block.
export function blockPickup(block: {
  nights: PickupNightInput[];
  guests: PickupGuestInput[];
  counts: PickupCountInput[];
}): NightPickup[] {
  const buckets = pickupBuckets(block.nights, block.guests, block.counts);
  const rows: NightPickup[] = [];
  const seen = new Set<string>();
  for (const n of block.nights) {
    const roomType = n.roomType;
    const key = bucket(roomType, dateKey(n.night));
    if (seen.has(key)) {
      // Two block nights in one bucket (a repeated night): merge the blocked
      // numbers into the row already emitted.
      const row = rows.find((r) => bucket(r.roomType, r.night) === key)!;
      row.blocked += n.rooms;
      row.contracted = row.contracted == null && n.contractedRooms == null ? null : (row.contracted ?? 0) + (n.contractedRooms ?? 0);
      continue;
    }
    seen.add(key);
    rows.push({ night: dateKey(n.night), roomType, blocked: n.rooms, contracted: n.contractedRooms, pickedUp: buckets.get(key) ?? 0 });
  }
  buckets.forEach((pickedUp, key) => {
    if (seen.has(key)) return;
    const [roomType, night] = key.split("|");
    rows.push({ night, roomType: roomType || null, blocked: 0, contracted: null, pickedUp });
  });
  return rows.sort((a, b) => a.night.localeCompare(b.night) || (a.roomType ?? "").localeCompare(b.roomType ?? ""));
}

// Rooms picked up per night across all room types — what a snapshot stores.
export function pickupByNight(rows: NightPickup[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.night] = (out[r.night] ?? 0) + r.pickedUp;
  return out;
}

export type PickupTotals = { blocked: number; contracted: number | null; pickedUp: number; percent: number | null; peakNight: number };

export function pickupTotals(rows: NightPickup[]): PickupTotals {
  const blocked = rows.reduce((s, r) => s + r.blocked, 0);
  const pickedUp = rows.reduce((s, r) => s + r.pickedUp, 0);
  const contractedRows = rows.filter((r) => r.contracted != null);
  const byNight = pickupByNight(rows);
  return {
    blocked,
    contracted: contractedRows.length ? contractedRows.reduce((s, r) => s + (r.contracted ?? 0), 0) : null,
    pickedUp,
    percent: blocked > 0 ? Math.round((pickedUp / blocked) * 1000) / 10 : null,
    peakNight: Math.max(0, ...Object.values(byNight)),
  };
}

type Snapshot = { takenOn: Date; nights: unknown };

// The latest snapshot taken on or before asOf — null when none exists, or
// when asOf is still in the future (today is a YYYY-MM-DD key).
export function snapshotAsOf(snapshots: Snapshot[], asOf: string, today: string): Record<string, number> | null {
  if (asOf > today) return null;
  const snap = snapshots
    .filter((s) => dateKey(s.takenOn) <= asOf)
    .sort((a, b) => b.takenOn.getTime() - a.takenOn.getTime())[0];
  return snap ? (snap.nights as Record<string, number>) : null;
}

export type DatedGuestInput = PickupGuestInput & { bookedOn: Date | null; cancelledOn: Date | null };

export type DaysOutSource = {
  snapshots: Snapshot[];
  guests: DatedGuestInput[];
  counts: PickupCountInput[];
  nights: Pick<PickupNightInput, "night" | "otherReservations">[];
};

// Rooms on a night as of a day, from the guests' own booking / cancel dates.
// null when the guest list can't say: an active guest staying that night has
// no booking date, or the night carries undated rooms (entered counts, other
// reservations). A cancelled guest with no cancel date is left out.
export function guestPickupAsOf(src: Omit<DaysOutSource, "snapshots">, night: string, asOf: string): number | null {
  if (src.counts.some((c) => dateKey(c.night) === night && c.rooms > 0)) return null;
  if (src.nights.some((n) => dateKey(n.night) === night && n.otherReservations > 0)) return null;
  const staying = src.guests.filter((g) => guestNights(g).includes(night));
  if (staying.length === 0) return src.guests.some((g) => g.bookedOn) ? 0 : null;
  if (staying.some((g) => !g.cancelled && !g.bookedOn)) return null;
  return staying.filter((g) => {
    if (!g.bookedOn || dateKey(g.bookedOn) > asOf) return false;
    if (!g.cancelled) return true;
    return !!g.cancelledOn && dateKey(g.cancelledOn) > asOf;
  }).length;
}

// Pickup on a night as it stood `daysOut` days before the block's first
// night: from booking dates when the guest list has them, otherwise the
// latest snapshot on or before that day. null for days still to come.
export function pickupDaysOut(
  src: DaysOutSource,
  firstNight: string | null,
  daysOut: number,
  night: string,
  today: string,
): number | null {
  if (!firstNight) return null;
  const asOf = dateKey(new Date(new Date(`${firstNight}T00:00:00Z`).getTime() - daysOut * 86_400_000));
  if (asOf > today) return null;
  const fromGuests = guestPickupAsOf(src, night, asOf);
  if (fromGuests != null) return fromGuests;
  const nights = snapshotAsOf(src.snapshots, asOf, today);
  if (!nights) return null;
  return typeof nights[night] === "number" ? nights[night] : 0;
}
