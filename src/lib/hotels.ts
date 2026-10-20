// Hotels module helpers shared by server actions, pages and client forms (no
// "use server", so client components can import the labels).
//
// Dates: every hotel date is a Postgres DATE, which Prisma returns as midnight
// UTC. A night is identified by its "YYYY-MM-DD" key — the date the guest
// checks in for that night — so nights run from check-in up to, but not
// including, check-out.

import type { ConcessionMet, HotelBlockType, HotelChargeScope } from "@prisma/client";

// proposal_status options carry one of these as their group.
export type ProposalStage = "REQUESTED" | "PENDING" | "ACCEPTED" | "DECLINED";

export const PROPOSAL_STAGES: { value: ProposalStage; label: string }[] = [
  { value: "REQUESTED", label: "Requested" },
  { value: "PENDING", label: "Pending" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" },
];

export const BLOCK_TYPES: { value: HotelBlockType; label: string }[] = [
  { value: "CONTRACT", label: "Contract attendee" },
  { value: "COURTESY", label: "Courtesy attendee" },
  { value: "STAFF", label: "Staff" },
];

export const BLOCK_TYPE_LABELS: Record<HotelBlockType, string> = {
  CONTRACT: "Contract attendee",
  COURTESY: "Courtesy attendee",
  STAFF: "Staff",
};

export const CHARGE_SCOPES: { value: HotelChargeScope; label: string }[] = [
  { value: "PER_NIGHT", label: "Per night" },
  { value: "PER_STAY", label: "Per stay" },
  { value: "PER_PERSON", label: "Per person" },
  { value: "PER_PERSON_PER_NIGHT", label: "Per person per night" },
];

export const CHARGE_SCOPE_LABELS: Record<HotelChargeScope, string> = {
  PER_NIGHT: "Per night",
  PER_STAY: "Per stay",
  PER_PERSON: "Per person",
  PER_PERSON_PER_NIGHT: "Per person per night",
};

// How a proposal answers one of its RFP's concessions.
export const MET_LABELS: Record<ConcessionMet, string> = { MET: "Met", PARTIAL: "Partial", NOT_MET: "Not met" };

// The stage of a proposal_status label, from the tenant's options.
export function stageOf(
  status: string,
  statusOptions: { label: string; group: string | null }[],
): ProposalStage | null {
  const group = statusOptions.find((o) => o.label === status)?.group;
  return group && PROPOSAL_STAGES.some((s) => s.value === group) ? (group as ProposalStage) : null;
}

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function dateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

// "" / null → null; anything else must be a YYYY-MM-DD key.
export function parseDateKey(value: FormDataEntryValue | string | null | undefined): Date | null {
  if (typeof value !== "string" || !value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid date: ${value}`);
  return dateFromKey(value);
}

// Night keys from check-in up to (not including) check-out.
export function nightKeys(checkIn: string | null, checkOut: string | null): string[] {
  if (!checkIn || !checkOut || checkOut <= checkIn) return [];
  const keys: string[] = [];
  for (let d = dateFromKey(checkIn); dateKey(d) < checkOut; d = new Date(d.getTime() + 86_400_000)) {
    keys.push(dateKey(d));
    if (keys.length > 60) throw new Error("Stay is longer than 60 nights");
  }
  return keys;
}

// "Mon, Mar 3" for a night key, independent of the viewer's timezone.
export function formatNight(key: string): string {
  return dateFromKey(key).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatDateKey(key: string | null): string {
  if (!key) return "—";
  return dateFromKey(key).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatMoney(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "—";
}

// "CONTRACT,STAFF" (a URL param) → validated block-type list.
export function parseBlockTypes(raw: string | undefined): HotelBlockType[] {
  const valid = new Set<string>(BLOCK_TYPES.map((t) => t.value));
  return (raw ?? "").split(",").filter((t): t is HotelBlockType => valid.has(t));
}
