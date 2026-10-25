// Final review of a hotel block: our pickup guest list reconciled against the
// hotel's final (actualized) list. Pure, shared by the review page and MCP.
//
// A final stay is matched to one of our guests by confirmation number, then
// by name (word order and punctuation ignored) among stays that overlap. Our
// active guests are matched before cancelled ones. Each pair, and each stay
// left on either side, is one row with what differs.

import { dateKey, nightKeys } from "@/lib/hotels";

export type ReconcileFlag =
  | "NO_SHOW" // ours, active, not on the final list
  | "NOT_ON_LIST" // on the final list, not ours
  | "STAYED_AFTER_CANCEL" // ours cancelled, but on the final list
  | "LATE_ARRIVAL"
  | "EARLY_ARRIVAL"
  | "EARLY_DEPARTURE"
  | "STAYED_LONGER"
  | "ROOM_TYPE";

export const RECONCILE_FLAG_LABELS: Record<ReconcileFlag, string> = {
  NO_SHOW: "No-show",
  NOT_ON_LIST: "Not on our list",
  STAYED_AFTER_CANCEL: "Stayed after cancelling",
  LATE_ARRIVAL: "Late arrival",
  EARLY_ARRIVAL: "Early arrival",
  EARLY_DEPARTURE: "Early check-out",
  STAYED_LONGER: "Stayed longer",
  ROOM_TYPE: "Room type changed",
};

// The order flags are listed and summed in.
export const RECONCILE_FLAGS = Object.keys(RECONCILE_FLAG_LABELS) as ReconcileFlag[];

type Stay = { guestName: string | null; confirmationNumber: string | null; checkIn: Date | null; checkOut: Date | null; roomType: string | null };
export type OurGuest = Stay & { id: string; cancelled: boolean };
export type FinalGuest = Stay & { id: string };

export type ReconcileStay = { guestName: string | null; confirmationNumber: string | null; checkIn: string | null; checkOut: string | null; roomType: string | null; nights: number };

export type ReconcileRow = {
  guestId: string | null; // ours
  finalId: string | null;
  booked: ReconcileStay | null; // ours (null when not on our list)
  actual: ReconcileStay | null; // the hotel's (null for a no-show)
  cancelled: boolean; // ours was cancelled
  flags: ReconcileFlag[];
};

export type Reconciliation = {
  rows: ReconcileRow[]; // flagged first, then by name
  counts: Record<ReconcileFlag, number>;
  bookedNights: number; // our active guests' room nights
  actualNights: number; // the final list's room nights
  matched: number;
  asBooked: number; // matched with nothing different
};

const confirmationKey = (c: string | null) => (c ? c.toLowerCase().replace(/[^a-z0-9]/g, "") || null : null);
const nameKey = (n: string | null) =>
  n
    ? n
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .sort()
        .join(" ") || null
    : null;

function stay(s: Stay): ReconcileStay {
  const checkIn = s.checkIn ? dateKey(s.checkIn) : null;
  const checkOut = s.checkOut ? dateKey(s.checkOut) : null;
  return { guestName: s.guestName, confirmationNumber: s.confirmationNumber, checkIn, checkOut, roomType: s.roomType, nights: nightKeys(checkIn, checkOut).length };
}

// Stays overlap, or either has no dates to say otherwise.
function overlaps(a: ReconcileStay, b: ReconcileStay) {
  if (!a.checkIn || !a.checkOut || !b.checkIn || !b.checkOut) return true;
  return a.checkIn < b.checkOut && b.checkIn < a.checkOut;
}

function differences(booked: ReconcileStay, actual: ReconcileStay): ReconcileFlag[] {
  const flags: ReconcileFlag[] = [];
  if (booked.checkIn && actual.checkIn) {
    if (actual.checkIn > booked.checkIn) flags.push("LATE_ARRIVAL");
    if (actual.checkIn < booked.checkIn) flags.push("EARLY_ARRIVAL");
  }
  if (booked.checkOut && actual.checkOut) {
    if (actual.checkOut < booked.checkOut) flags.push("EARLY_DEPARTURE");
    if (actual.checkOut > booked.checkOut) flags.push("STAYED_LONGER");
  }
  if (booked.roomType && actual.roomType && booked.roomType.toLowerCase() !== actual.roomType.toLowerCase()) flags.push("ROOM_TYPE");
  return flags;
}

export function reconcileGuests(ours: OurGuest[], finals: FinalGuest[]): Reconciliation {
  const oursStays = new Map(ours.map((g) => [g.id, stay(g)]));
  // Active guests first, so a name shared with a cancelled booking matches the live one.
  const candidates = [...ours.filter((g) => !g.cancelled), ...ours.filter((g) => g.cancelled)];
  const taken = new Set<string>();
  const pairs = new Map<string, OurGuest>(); // final id → ours

  const byConfirmation = new Map<string, OurGuest>();
  for (const g of candidates) {
    const k = confirmationKey(g.confirmationNumber);
    if (k && !byConfirmation.has(k)) byConfirmation.set(k, g);
  }
  for (const f of finals) {
    const g = byConfirmation.get(confirmationKey(f.confirmationNumber) ?? "");
    if (g && !taken.has(g.id)) {
      pairs.set(f.id, g);
      taken.add(g.id);
    }
  }
  for (const f of finals) {
    if (pairs.has(f.id)) continue;
    const k = nameKey(f.guestName);
    if (!k) continue;
    const actual = stay(f);
    const g = candidates.find((c) => !taken.has(c.id) && nameKey(c.guestName) === k && overlaps(oursStays.get(c.id)!, actual));
    if (g) {
      pairs.set(f.id, g);
      taken.add(g.id);
    }
  }

  const rows: ReconcileRow[] = [];
  for (const f of finals) {
    const actual = stay(f);
    const g = pairs.get(f.id);
    if (!g) {
      rows.push({ guestId: null, finalId: f.id, booked: null, actual, cancelled: false, flags: ["NOT_ON_LIST"] });
      continue;
    }
    const booked = oursStays.get(g.id)!;
    rows.push({
      guestId: g.id,
      finalId: f.id,
      booked,
      actual,
      cancelled: g.cancelled,
      flags: [...(g.cancelled ? (["STAYED_AFTER_CANCEL"] as const) : []), ...differences(booked, actual)],
    });
  }
  for (const g of ours) {
    if (taken.has(g.id) || g.cancelled) continue;
    rows.push({ guestId: g.id, finalId: null, booked: oursStays.get(g.id)!, actual: null, cancelled: false, flags: ["NO_SHOW"] });
  }

  const name = (r: ReconcileRow) => (r.booked?.guestName ?? r.actual?.guestName ?? "").toLowerCase();
  rows.sort((a, b) => Number(b.flags.length > 0) - Number(a.flags.length > 0) || name(a).localeCompare(name(b)));

  const counts = Object.fromEntries(RECONCILE_FLAGS.map((f) => [f, rows.filter((r) => r.flags.includes(f)).length])) as Record<ReconcileFlag, number>;
  const matchedRows = rows.filter((r) => r.booked && r.actual);
  return {
    rows,
    counts,
    bookedNights: ours.filter((g) => !g.cancelled).reduce((s, g) => s + oursStays.get(g.id)!.nights, 0),
    actualNights: rows.reduce((s, r) => s + (r.actual?.nights ?? 0), 0),
    matched: matchedRows.length,
    asBooked: matchedRows.filter((r) => r.flags.length === 0).length,
  };
}
