// Hotels module helpers shared by server actions, pages and client forms (no
// "use server", so client components can import the labels).
//
// Dates: every hotel date is a Postgres DATE, which Prisma returns as midnight
// UTC. A night is identified by its "YYYY-MM-DD" key — the date the guest
// checks in for that night — so nights run from check-in up to, but not
// including, check-out.

import type { AmenityStatus, ConcessionMet, HotelChargeScope } from "@prisma/client";

// proposal_status options carry one of these as their group.
export type ProposalStage = "REQUESTED" | "PENDING" | "ACCEPTED" | "DECLINED";

export const PROPOSAL_STAGES: { value: ProposalStage; label: string }[] = [
  { value: "REQUESTED", label: "Requested" },
  { value: "PENDING", label: "Pending" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" },
];

// A block's type is its contract type (a hotel_contract_type option label:
// Contract, Courtesy, Room block agreement, …) plus its guest type (a
// hotel_guest_type option label). A contract type's group is its kind:
// whether it carries attrition. Anything fixed (the offer reader's answer, an
// APEX field) maps from the kind, never from a label.
export type ContractKind = "CONTRACT" | "COURTESY";

export const CONTRACT_KINDS: { value: ContractKind; label: string; description: string }[] = [
  { value: "CONTRACT", label: "Carries attrition", description: "The group commits to the rooms." },
  { value: "COURTESY", label: "No attrition", description: "Rooms held without a commitment, released at cut-off." },
];

export const isContractKind = (v: string | null | undefined): v is ContractKind => v === "CONTRACT" || v === "COURTESY";

// A hotel_contract_type option: its label and kind (the option's group).
export type ContractTypeOption = { label: string; kind: ContractKind | null };

export const toContractTypeOption = (o: { label: string; group: string | null }): ContractTypeOption => ({
  label: o.label,
  kind: isContractKind(o.group) ? o.group : null,
});

export function contractKindOf(contractType: string | null, options: ContractTypeOption[]): ContractKind | null {
  return contractType ? (options.find((o) => o.label === contractType)?.kind ?? null) : null;
}

// The first contract type of a kind (the tenant's list order): what a fixed
// answer (the offer reader's CONTRACT / COURTESY) becomes.
export function contractTypeForKind(kind: ContractKind | null | undefined, options: ContractTypeOption[]): string | null {
  return kind ? (options.find((o) => o.kind === kind)?.label ?? null) : null;
}

// The contract type of an offer read as CONTRACT / COURTESY (or not said):
// the requested RFP block's when it is of that kind or the offer doesn't
// say, else the tenant's first of that kind.
export function offerContractType(kind: ContractKind | null | undefined, requested: string | null, options: ContractTypeOption[]): string | null {
  if (!kind || (requested && contractKindOf(requested, options) === kind)) return requested;
  return contractTypeForKind(kind, options) ?? requested;
}

// The allowed attrition % that applies to a block: none for a type held
// without attrition; the block's own otherwise (a type with no kind yet
// keeps it, as before contract types were configurable).
export function appliedAttrition(allowedAttrition: number | null, kind: ContractKind | null): number | null {
  if (kind == null) return allowedAttrition;
  switch (kind) {
    case "CONTRACT":
      return allowedAttrition;
    case "COURTESY":
      return null;
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled contract kind: ${_exhaustive}`);
    }
  }
}

// "Contract · Attendees"; either half may be missing.
export function blockTypeLabel(contractType: string | null, guestType: string | null): string | null {
  return [contractType, guestType].filter(Boolean).join(" · ") || null;
}

// What tells an event's blocks apart: the hotel, plus the block's type where
// the hotel has more than one ("Hilton · Contract · Staff").
export function blockNames(blocks: { id: string; hotel: string; contractType: string | null; guestType: string | null }[]): Map<string, string> {
  const perHotel = new Map<string, number>();
  for (const b of blocks) perHotel.set(b.hotel, (perHotel.get(b.hotel) ?? 0) + 1);
  return new Map(
    blocks.map((b) => [b.id, (perHotel.get(b.hotel) ?? 0) > 1 ? `${b.hotel} · ${blockTypeLabel(b.contractType, b.guestType) ?? "Block"}` : b.hotel]),
  );
}

// A night's null room type is the Run of House allotment.
export const RUN_OF_HOUSE = "Run of House";
export const roomTypeLabel = (roomType: string | null) => roomType ?? RUN_OF_HOUSE;

// What an amount is charged per. PER_NIGHT is per room per night, PER_ROOM
// once per room for the stay, ONE_TIME once for the group. Fixed (an enum,
// not an option list): each names what an amount multiplies by, which a free
// label couldn't promise. hotel_charge options store one as their group.
export const CHARGE_SCOPE_LABELS: Record<HotelChargeScope, string> = {
  PER_NIGHT: "Per night",
  PER_STAY: "Per stay",
  PER_ROOM: "Per room",
  PER_PERSON: "Per person",
  PER_PERSON_PER_NIGHT: "Per person per night",
  PER_DAY: "Per day",
  PER_PERSON_PER_DAY: "Per person per day",
  ONE_TIME: "One-time",
};

export const CHARGE_SCOPES: { value: HotelChargeScope; label: string }[] = (Object.keys(CHARGE_SCOPE_LABELS) as HotelChargeScope[]).map((value) => ({
  value,
  label: CHARGE_SCOPE_LABELS[value],
}));

export const isChargeScope = (v: unknown): v is HotelChargeScope => typeof v === "string" && Object.hasOwn(CHARGE_SCOPE_LABELS, v);

// A hotel_charge option: its label, and the scope a new charge of that type
// starts with (the option's group).
export type ChargeTypeOption = { label: string; scope: HotelChargeScope | null };

export const toChargeTypeOption = (o: { label: string; group: string | null }): ChargeTypeOption => ({
  label: o.label,
  scope: isChargeScope(o.group) ? o.group : null,
});

// Picking a charge type fills an unset scope with the type's.
export const chargeTypePatch = (
  label: string,
  row: { scope: HotelChargeScope | "" },
  types: ChargeTypeOption[],
): { chargeType: string; scope: HotelChargeScope | "" } => ({
  chargeType: label,
  scope: row.scope || (types.find((t) => t.label === label)?.scope ?? ""),
});

// How a proposal answers one of its RFP's concessions.
export const MET_LABELS: Record<ConcessionMet, string> = { MET: "Met", PARTIAL: "Partial", NOT_MET: "Not met" };

// Same amenity / concession label for matching (src/lib/hotelLabels.ts): case,
// spacing and punctuation runs don't count.
export const labelKey = (label: string) => label.trim().toLowerCase().replace(/[\s\-_/]+/g, " ");

// A requested concession the hotel's profile already covers (an amenity of
// the same label, e.g. Complimentary Breakfast) starts Met on a new proposal,
// in the form and over MCP alike.
export function coveredByProfile(profile: string[]) {
  const keys = new Set(profile.map(labelKey));
  return (concessionLabel: string) => keys.has(labelKey(concessionLabel));
}

// How a proposal states one of the hotel's amenities (unset: not mentioned).
export const AMENITY_STATUS_LABELS: Record<AmenityStatus, string> = { CONFIRMED: "Confirmed", UNAVAILABLE: "Unavailable" };

// Pickup checkpoints (hotel_days_out): each label is a whole number of days
// before a block's first night, 1–365.
export function daysOutLabelError(label: string): string | null {
  const n = Number(label.trim());
  return /^\d+$/.test(label.trim()) && n >= 1 && n <= 365 ? null : "Enter a whole number of days, 1–365";
}

// The tenant's checkpoints, furthest out first; labels that aren't valid
// day counts drop out.
export function daysOutCheckpoints(labels: string[]): number[] {
  return Array.from(new Set(labels.filter((l) => !daysOutLabelError(l)).map((l) => Number(l.trim())))).sort((a, b) => b - a);
}

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

// The date key n days after (or before, when negative) a key.
export function addDays(key: string, n: number): string {
  return dateKey(new Date(dateFromKey(key).getTime() + n * 86_400_000));
}

export const MAX_STAY_NIGHTS = 60;

// Night keys from check-in up to (not including) check-out.
export function nightKeys(checkIn: string | null, checkOut: string | null): string[] {
  if (!checkIn || !checkOut || checkOut <= checkIn) return [];
  const keys: string[] = [];
  for (let d = dateFromKey(checkIn); dateKey(d) < checkOut; d = new Date(d.getTime() + 86_400_000)) {
    keys.push(dateKey(d));
    if (keys.length > MAX_STAY_NIGHTS) throw new Error(`Stay is longer than ${MAX_STAY_NIGHTS} nights`);
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

// "Contract,Courtesy" (a URL param) → the tenant's contract-type labels it
// names; unknown values drop out, so a stale link means no filter.
export function parseContractTypes(raw: string | undefined, labels: string[]): string[] {
  const valid = new Set(labels);
  return (raw ?? "").split(",").filter((t) => valid.has(t));
}
