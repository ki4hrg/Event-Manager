// Hotels module helpers shared by server actions, pages and client forms (no
// "use server", so client components can import the labels).
//
// Dates: every hotel date is a Postgres DATE, which Prisma returns as midnight
// UTC. A night is identified by its "YYYY-MM-DD" key — the date the guest
// checks in for that night — so nights run from check-in up to, but not
// including, check-out.

import type { AmenityStatus, ConcessionMet, HotelChargeScope, HotelContractType } from "@prisma/client";

// proposal_status options carry one of these as their group.
export type ProposalStage = "REQUESTED" | "PENDING" | "ACCEPTED" | "DECLINED";

export const PROPOSAL_STAGES: { value: ProposalStage; label: string }[] = [
  { value: "REQUESTED", label: "Requested" },
  { value: "PENDING", label: "Pending" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" },
];

// A block's type is its contract type (fixed: contract carries attrition,
// courtesy doesn't) plus its guest type (a hotel_guest_type option label).
export const CONTRACT_TYPES: { value: HotelContractType; label: string }[] = [
  { value: "CONTRACT", label: "Contract" },
  { value: "COURTESY", label: "Courtesy" },
];

export const CONTRACT_TYPE_LABELS: Record<HotelContractType, string> = {
  CONTRACT: "Contract",
  COURTESY: "Courtesy",
};

// "Contract · Attendees"; either half may be missing.
export function blockTypeLabel(contractType: HotelContractType | null, guestType: string | null): string | null {
  return [contractType ? CONTRACT_TYPE_LABELS[contractType] : null, guestType].filter(Boolean).join(" · ") || null;
}

// A night's null room type is the Run of House allotment.
export const RUN_OF_HOUSE = "Run of House";
export const roomTypeLabel = (roomType: string | null) => roomType ?? RUN_OF_HOUSE;

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

// Same amenity / concession label for matching (src/lib/hotelLabels.ts): case,
// spacing and punctuation runs don't count.
export const labelKey = (label: string) => label.trim().toLowerCase().replace(/[\s\-_/]+/g, " ");

// How a proposal states one of the hotel's amenities (unset: not mentioned).
export const AMENITY_STATUS_LABELS: Record<AmenityStatus, string> = { CONFIRMED: "Confirmed", UNAVAILABLE: "Unavailable" };

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
// The date key n days after (or before, when negative) a key.
export function addDays(key: string, n: number): string {
  return dateKey(new Date(dateFromKey(key).getTime() + n * 86_400_000));
}

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

// Hotel Information's guest-type filter: "?guestTypes=Attendees,VIP", else a
// share link's stored guestTypes, else blockTypes stored before the block
// type split (CONTRACT / COURTESY → Attendees, STAFF → Staff). Labels are
// checked against the tenant's list by the report reader.
export function hotelInfoGuestTypes(param: string | undefined, stored?: { guestTypes?: string[]; blockTypes?: string[] }): string[] {
  if (param != null) return param.split(",").filter(Boolean);
  if (stored?.guestTypes) return stored.guestTypes;
  return Array.from(new Set((stored?.blockTypes ?? []).map((t) => (t === "STAFF" ? "Staff" : "Attendees"))));
}

// "CONTRACT,COURTESY" (a URL param) → validated contract-type list; unknown
// values drop out, so a stale link means no filter.
export function parseContractTypes(raw: string | undefined): HotelContractType[] {
  const valid = new Set<string>(CONTRACT_TYPES.map((t) => t.value));
  return (raw ?? "").split(",").filter((t): t is HotelContractType => valid.has(t));
}
