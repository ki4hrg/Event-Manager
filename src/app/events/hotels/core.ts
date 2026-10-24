// Pure cores for hotel proposals. NOT a "use server" file — see
// src/app/contacts/core.ts for the rationale.
//
// A proposal is replaced whole on save: its nightly room grid and charges are
// rewritten in the same transaction (its function space, meal prices and
// meeting space charges too, when the save carries them). Every save also
// refreshes the HotelProposalVersion row for the current revision, so earlier
// revisions stay frozen and the current one always matches the proposal.

import type { AmenityStatus, ConcessionMet, HotelChargeKind, HotelChargeScope, HotelContractType, HotelWaiverType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { addDays, AMENITY_STATUS_LABELS, blockTypeLabel, coveredByProfile, dateFromKey, dateKey, labelKey, MET_LABELS, nightKeys, roomTypeLabel } from "@/lib/hotels";
import { requireListLabels } from "@/lib/hotelLabels";
import { rangeTouched } from "@/lib/dateRange";
import { offerOutcomes, type InboundProposal, type OfferHotel } from "@/lib/inboundParse";
import { spaceSummary } from "@/lib/rfp/proposalSpace";
import { createAndAddVenueContactCore, createVenueCore } from "@/app/venues/core";

export type ProposalNightArgs = { roomType: string | null; night: string; rate: number | null; rooms: number | null };
export type ProposalChargeArgs = { chargeType: string; amount: number | null; scope: HotelChargeScope | null };
export type ProposalConcessionArgs = { concessionId: string; offered: string | null; met: ConcessionMet | null };
// A concession the hotel offered without the RFP asking (or with no RFP).
export type ProposalOfferedConcessionArgs = { label: string; offered: string | null };
// An amenity the offer confirms or says is unavailable (hotel_amenity label).
export type ProposalAmenityArgs = { label: string; status: AmenityStatus; note: string | null };
// A room offered for one of the RFP's meeting space requests, or unasked
// (spaceRequestId null; name is then the room or function it's for).
export type ProposalSpaceArgs = {
  spaceRequestId: string | null;
  name: string;
  room: string | null;
  capacity: number | null;
  hold24: boolean | null;
  rental: number | null;
  rentalScope: HotelChargeScope | null;
  // What the rental is waived with: F&B spend, room nights or other, how
  // much, and per day / night / stay.
  waiverType?: HotelWaiverType | null;
  waiverAmount?: number | null;
  waiverScope?: HotelChargeScope | null;
  note: string | null;
};
// Average per-person price for a meal type.
export type ProposalMealArgs = { mealType: string; price: number | null };

export type ProposalWriteArgs = {
  venueId: string;
  status: string;
  // Where the lead came from: direct, or a lead-source vendor (and contact).
  leadSourceDirect: boolean;
  leadSourceVendorId: string | null;
  leadSourceContactId: string | null;
  contractType: HotelContractType | null;
  guestType: string | null; // hotel_guest_type option label
  submittedOn: string | null; // YYYY-MM-DD
  checkIn: string | null;
  checkOut: string | null;
  declinedReason: string | null;
  notes: string | null;
  revision: number;
  revisionSummary: string | null;
  allowedAttrition: number | null;
  guaranteedRevenue: number | null;
  validUntil: string | null; // YYYY-MM-DD: rates good until / contract by
  taxIncluded: boolean | null; // rates include taxes and fees; null = not stated
  // The amenities the offer states; the hotel's profile covers the rest.
  amenities: ProposalAmenityArgs[];
  nights: ProposalNightArgs[];
  // Guest charges (resort fee, parking, breakfast).
  charges: ProposalChargeArgs[];
  // Optional below: undefined leaves what the proposal has.
  // Meeting space charges (rental, AV) not tied to one room.
  meetingCharges?: ProposalChargeArgs[];
  spaces?: ProposalSpaceArgs[];
  fbMinimum?: number | null;
  fbMinimumScope?: HotelChargeScope | null;
  fbMinimumNote?: string | null; // what it applies to: "waives meeting room rental"
  fbTaxRate?: number | null; // percent
  fbServiceCharge?: number | null; // percent
  meals?: ProposalMealArgs[];
  // The requested RFP block this offer answers. On update, undefined leaves
  // the link as it is and null unlinks.
  rfpBlockId?: string | null;
  // Answers to the RFP's concessions; undefined leaves them as they are.
  concessions?: ProposalConcessionArgs[];
  // Concessions offered unasked; undefined leaves them as they are.
  offeredConcessions?: ProposalOfferedConcessionArgs[];
};

// What a version snapshot holds (and what the diff compares).
export type ProposalSnapshot = {
  venueName: string;
  status: string;
  leadSource: string | null;
  // blockTypeLabel(contractType, guestType); older snapshots hold the
  // retired CONTRACT / COURTESY / STAFF value.
  blockType: string | null;
  submittedOn: string | null;
  checkIn: string | null;
  checkOut: string | null;
  declinedReason: string | null;
  notes: string | null;
  allowedAttrition: string | null;
  guaranteedRevenue: string | null;
  // Absent from snapshots taken before these were recorded.
  validUntil?: string | null;
  taxIncluded?: boolean | null;
  // Older snapshots hold the labels ticked on the proposal (read as Confirmed).
  amenities: { label: string; status: AmenityStatus; note: string | null }[] | string[];
  // Requested and unasked concessions alike, by label. Absent from
  // snapshots taken before concessions were versioned.
  concessions?: { label: string; offered: string | null; met: ConcessionMet | null }[];
  nights: { roomType: string | null; night: string; rate: string | null; rooms: number | null }[];
  // Guest charges; snapshots taken before meeting space charges were split
  // out hold every charge here, and none of the fields below.
  charges: { chargeType: string; amount: string | null; scope: HotelChargeScope | null }[];
  meetingCharges?: { chargeType: string; amount: string | null; scope: HotelChargeScope | null }[];
  spaces?: {
    spaceRequestId: string | null;
    name: string;
    room: string | null;
    capacity: number | null;
    hold24: boolean | null;
    rental: string | null;
    rentalScope: HotelChargeScope | null;
    waiverType?: HotelWaiverType | null;
    waiverAmount?: string | null;
    waiverScope?: HotelChargeScope | null;
    note: string | null;
  }[];
  fbMinimum?: string | null;
  fbMinimumScope?: HotelChargeScope | null;
  fbMinimumNote?: string | null;
  fbTaxRate?: string | null;
  fbServiceCharge?: string | null;
  meals?: { mealType: string; price: string | null }[];
};

export type ProposalChange = { field: string; from: string | null; to: string | null };

async function assertProposalRefs(eventId: string, args: ProposalWriteArgs) {
  const tenantId = await requireEventTenantId(eventId);
  const [venue, status, leadVendor, leadContact] = await Promise.all([
    prisma.venue.findFirst({ where: { id: args.venueId, tenantId }, select: { id: true } }),
    prisma.customOption.findFirst({ where: { tenantId, category: "proposal_status", label: args.status }, select: { id: true } }),
    args.leadSourceVendorId ? prisma.vendor.findFirst({ where: { id: args.leadSourceVendorId, tenantId }, select: { id: true } }) : null,
    // The contact is one of the lead source's own.
    args.leadSourceContactId
      ? prisma.vendorContact.findFirst({ where: { contactId: args.leadSourceContactId, vendorId: args.leadSourceVendorId ?? "", vendor: { tenantId } }, select: { id: true } })
      : null,
  ]);
  if (!venue) throw new PermissionError("NOT_FOUND", "Hotel not found");
  if (!status) throw new Error(`Unknown proposal status: ${args.status}`);
  if (args.leadSourceVendorId && !leadVendor) throw new PermissionError("NOT_FOUND", "Lead source not found");
  if (args.leadSourceContactId && !leadContact) throw new PermissionError("NOT_FOUND", "Lead source contact not found");
  if (args.leadSourceDirect && args.leadSourceVendorId) throw new Error("A lead is direct or through a lead source, not both");
}

type StoredRanges = { submittedOn: Date | null; validUntil: Date | null; checkIn: Date | null; checkOut: Date | null };

// `stored` is the proposal being updated (null on create): a range it already
// holds isn't rechecked.
function validate(args: ProposalWriteArgs, stored: StoredRanges | null) {
  if (!args.venueId) throw new Error("Hotel is required");
  if (!args.status) throw new Error("Status is required");
  if (!Number.isInteger(args.revision) || args.revision < 1) throw new Error("Revision must be a whole number of 1 or more");
  if (args.allowedAttrition != null && (args.allowedAttrition < 0 || args.allowedAttrition > 100)) {
    throw new Error("Allowed attrition must be between 0 and 100");
  }
  if (args.guaranteedRevenue != null && args.guaranteedRevenue < 0) throw new Error("Guaranteed revenue cannot be negative");
  if (args.validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(args.validUntil)) throw new Error(`Invalid date: ${args.validUntil}`);
  const stay = stored && { start: stored.checkIn, end: stored.checkOut };
  if (args.checkIn && args.checkOut && args.checkOut <= args.checkIn && rangeTouched(stay, args.checkIn, args.checkOut)) {
    throw new Error("Check-out must be after check-in");
  }
  const validity = stored && { start: stored.submittedOn, end: stored.validUntil };
  if (args.submittedOn && args.validUntil && args.validUntil < args.submittedOn && rangeTouched(validity, args.submittedOn, args.validUntil)) {
    throw new Error("Valid until can't be before the submitted date");
  }
  if (args.fbMinimum != null && args.fbMinimum < 0) throw new Error("F&B minimum cannot be negative");
  for (const [v, label] of [[args.fbTaxRate, "F&B tax"], [args.fbServiceCharge, "Service charge"]] as const) {
    if (v != null && (v < 0 || v > 100)) throw new Error(`${label} must be between 0 and 100`);
  }
  for (const r of args.spaces ?? []) {
    if (r.capacity != null && (!Number.isInteger(r.capacity) || r.capacity < 0)) throw new Error("Capacity must be a whole number");
    if (r.rental != null && r.rental < 0) throw new Error("Rental cannot be negative");
    if (r.waiverAmount != null && r.waiverAmount < 0) throw new Error("A waiver amount cannot be negative");
  }
  const { checkIn, checkOut } = stayOf(args);
  nightKeys(checkIn, checkOut);
}

// Earliest check-in and latest check-out: the first night with rooms or a
// rate, and the morning after the last; the given dates only when there are
// none.
function stayOf(args: ProposalWriteArgs) {
  const nights = nightRows(args).map((n) => dateKey(n.night)).sort();
  if (!nights.length) return { checkIn: args.checkIn, checkOut: args.checkOut };
  return { checkIn: nights[0], checkOut: addDays(nights[nights.length - 1], 1) };
}

// Drops grid cells with nothing in them, so an untouched grid stores no rows.
function nightRows(args: ProposalWriteArgs) {
  return args.nights
    .filter((n) => n.rate != null || n.rooms != null)
    .map((n) => ({
      roomType: n.roomType,
      night: dateFromKey(n.night),
      rate: n.rate,
      rooms: n.rooms,
    }));
}

function chargeRows(args: ProposalWriteArgs) {
  const rows = (list: ProposalChargeArgs[], kind: HotelChargeKind) =>
    list.filter((c) => c.chargeType.trim()).map((c, i) => ({ chargeType: c.chargeType.trim(), amount: c.amount, scope: c.scope, kind, sortOrder: i }));
  return [...rows(args.charges, "GUEST"), ...rows(args.meetingCharges ?? [], "MEETING")];
}

function scalarData(args: ProposalWriteArgs) {
  const { checkIn, checkOut } = stayOf(args);
  return {
    venueId: args.venueId,
    status: args.status,
    leadSourceDirect: args.leadSourceDirect,
    leadSourceVendorId: args.leadSourceVendorId,
    leadSourceContactId: args.leadSourceVendorId ? args.leadSourceContactId : null,
    contractType: args.contractType,
    guestType: args.guestType,
    submittedOn: args.submittedOn ? dateFromKey(args.submittedOn) : null,
    checkIn: checkIn ? dateFromKey(checkIn) : null,
    checkOut: checkOut ? dateFromKey(checkOut) : null,
    declinedReason: args.declinedReason,
    notes: args.notes,
    revision: args.revision,
    allowedAttrition: args.allowedAttrition,
    guaranteedRevenue: args.guaranteedRevenue,
    validUntil: args.validUntil ? dateFromKey(args.validUntil) : null,
    taxIncluded: args.taxIncluded,
    fbMinimum: args.fbMinimum,
    fbMinimumScope: args.fbMinimumScope,
    fbMinimumNote: args.fbMinimumNote === undefined ? undefined : args.fbMinimumNote?.trim() || null,
    fbTaxRate: args.fbTaxRate,
    fbServiceCharge: args.fbServiceCharge,
  };
}

// What toProposalValues / writeArgsOf read from a proposal.
export const proposalValuesInclude = {
  venue: { select: { name: true } },
  nights: { orderBy: [{ night: "asc" }, { roomType: "asc" }] },
  charges: { orderBy: { sortOrder: "asc" } },
  amenities: { orderBy: { sortOrder: "asc" } },
  spaces: { orderBy: { sortOrder: "asc" } },
  meals: { orderBy: { sortOrder: "asc" } },
} as const satisfies Prisma.HotelProposalInclude;

const snapshotInclude = {
  ...proposalValuesInclude,
  leadSourceVendor: { select: { name: true } },
  concessions: { include: { concession: { select: { label: true } } } },
} as const satisfies Prisma.HotelProposalInclude;

type ProposalWithChildren = Prisma.HotelProposalGetPayload<{ include: typeof snapshotInclude }>;

const dec = (v: Prisma.Decimal | null) => (v == null ? null : v.toString());
const day = (v: Date | null) => (v ? dateKey(v) : null);

export function snapshotOf(p: ProposalWithChildren): ProposalSnapshot {
  return {
    venueName: p.venue.name,
    status: p.status,
    // "Direct", or the lead source's name.
    leadSource: p.leadSourceDirect ? "Direct" : (p.leadSourceVendor?.name ?? null),
    blockType: blockTypeLabel(p.contractType, p.guestType),
    submittedOn: day(p.submittedOn),
    checkIn: day(p.checkIn),
    checkOut: day(p.checkOut),
    declinedReason: p.declinedReason,
    notes: p.notes,
    allowedAttrition: dec(p.allowedAttrition),
    guaranteedRevenue: dec(p.guaranteedRevenue),
    validUntil: day(p.validUntil),
    taxIncluded: p.taxIncluded,
    amenities: [...p.amenities].sort((a, b) => a.label.localeCompare(b.label)).map((a) => ({ label: a.label, status: a.status, note: a.note })),
    concessions: p.concessions
      .map((c) => ({ label: c.concession?.label ?? c.label ?? "", offered: c.offered, met: c.met }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    nights: p.nights.map((n) => ({ roomType: n.roomType, night: dateKey(n.night), rate: dec(n.rate), rooms: n.rooms })),
    charges: chargesOf(p.charges, "GUEST"),
    meetingCharges: chargesOf(p.charges, "MEETING"),
    spaces: p.spaces.map((r) => ({
      spaceRequestId: r.spaceRequestId,
      name: r.name,
      room: r.room,
      capacity: r.capacity,
      hold24: r.hold24,
      rental: dec(r.rental),
      rentalScope: r.rentalScope,
      waiverType: r.waiverType,
      waiverAmount: dec(r.waiverAmount),
      waiverScope: r.waiverScope,
      note: r.note,
    })),
    fbMinimum: dec(p.fbMinimum),
    fbMinimumScope: p.fbMinimumScope,
    fbMinimumNote: p.fbMinimumNote,
    fbTaxRate: dec(p.fbTaxRate),
    fbServiceCharge: dec(p.fbServiceCharge),
    meals: p.meals.map((m) => ({ mealType: m.mealType, price: dec(m.price) })),
  };
}

const chargesOf = (charges: ProposalWithChildren["charges"], kind: HotelChargeKind) =>
  charges.filter((c) => c.kind === kind).map((c) => ({ chargeType: c.chargeType, amount: dec(c.amount), scope: c.scope }));

const FIELD_LABELS: [keyof ProposalSnapshot, string][] = [
  ["venueName", "Hotel"],
  ["status", "Status"],
  ["leadSource", "Lead source"],
  ["blockType", "Block type"],
  ["submittedOn", "Submitted"],
  ["checkIn", "Check-in"],
  ["checkOut", "Check-out"],
  ["declinedReason", "Declined reason"],
  ["notes", "Notes"],
  ["allowedAttrition", "Allowed attrition %"],
  ["guaranteedRevenue", "Guaranteed revenue"],
  ["validUntil", "Valid until"],
  ["taxIncluded", "Rates include taxes"],
  ["fbMinimum", "F&B minimum"],
  ["fbMinimumScope", "F&B minimum scope"],
  ["fbMinimumNote", "F&B minimum applies to"],
  ["fbTaxRate", "F&B tax %"],
  ["fbServiceCharge", "Service charge %"],
];

// Each key's from → to, over the keys either side has.
function mapChanges(prefix: string, before: Map<string, string | null>, after: Map<string, string | null>): ProposalChange[] {
  return Array.from(new Set([...Array.from(before.keys()), ...Array.from(after.keys())]))
    .sort()
    .flatMap((key) => {
      const from = before.get(key) ?? null;
      const to = after.get(key) ?? null;
      return from === to ? [] : [{ field: `${prefix}: ${key}`, from, to }];
    });
}

const show = (v: unknown): string | null => (v == null || v === "" ? null : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));

export function diffSnapshots(prev: ProposalSnapshot, next: ProposalSnapshot): ProposalChange[] {
  const changes: ProposalChange[] = [];
  for (const [key, label] of FIELD_LABELS) {
    const from = show(prev[key]);
    const to = show(next[key]);
    if (from !== to) changes.push({ field: label, from, to });
  }
  // Per amenity: Confirmed → Unavailable is the change worth seeing.
  const amenityMap = (s: ProposalSnapshot) =>
    new Map(
      s.amenities.map((a) =>
        typeof a === "string"
          ? [a, AMENITY_STATUS_LABELS.CONFIRMED]
          : [a.label, [AMENITY_STATUS_LABELS[a.status], a.note].filter(Boolean).join(": ")],
      ),
    );
  const aBefore = amenityMap(prev);
  const aAfter = amenityMap(next);
  for (const key of Array.from(new Set([...Array.from(aBefore.keys()), ...Array.from(aAfter.keys())])).sort()) {
    const from = aBefore.get(key) ?? null;
    const to = aAfter.get(key) ?? null;
    if (from !== to) changes.push({ field: `Amenity: ${key}`, from, to });
  }
  // Not against a snapshot from before concessions were versioned: every
  // answer would read as new.
  if (prev.concessions && next.concessions) {
    const concessionMap = (list: NonNullable<ProposalSnapshot["concessions"]>) =>
      new Map(list.map((c) => [c.label, [c.met ? MET_LABELS[c.met] : null, c.offered].filter(Boolean).join(": ") || "Offered"]));
    const before = concessionMap(prev.concessions);
    const after = concessionMap(next.concessions);
    for (const key of Array.from(new Set([...Array.from(before.keys()), ...Array.from(after.keys())])).sort()) {
      const from = before.get(key) ?? null;
      const to = after.get(key) ?? null;
      if (from !== to) changes.push({ field: `Concession: ${key}`, from, to });
    }
  }

  const cell = (n: ProposalSnapshot["nights"][number]) =>
    [n.rooms != null ? `${n.rooms} rooms` : null, n.rate != null ? `$${n.rate}` : null].filter(Boolean).join(" @ ") || null;
  const nightMap = (s: ProposalSnapshot) => new Map(s.nights.map((n) => [`${n.night} ${roomTypeLabel(n.roomType)}`, cell(n)]));
  const before = nightMap(prev);
  const after = nightMap(next);
  for (const key of Array.from(new Set([...Array.from(before.keys()), ...Array.from(after.keys())])).sort()) {
    const from = before.get(key) ?? null;
    const to = after.get(key) ?? null;
    if (from !== to) changes.push({ field: `Night ${key}`, from, to });
  }

  const charge = (c: ProposalSnapshot["charges"][number]) => [c.amount != null ? `$${c.amount}` : null, c.scope].filter(Boolean).join(" ") || "—";
  const chargeMap = (list: ProposalSnapshot["charges"]) => new Map(list.map((c) => [c.chargeType, charge(c)]));
  // Against a snapshot from before meeting space charges were split out,
  // every charge is compared as one list, so a moved charge isn't a change.
  if (prev.meetingCharges) {
    changes.push(...mapChanges("Charge", chargeMap(prev.charges), chargeMap(next.charges)));
    changes.push(...mapChanges("Meeting charge", chargeMap(prev.meetingCharges), chargeMap(next.meetingCharges ?? [])));
  } else {
    changes.push(...mapChanges("Charge", chargeMap(prev.charges), chargeMap([...next.charges, ...(next.meetingCharges ?? [])])));
  }
  if (prev.spaces && next.spaces) {
    const spaceMap = (list: NonNullable<ProposalSnapshot["spaces"]>) => new Map(list.map((r) => [r.name, spaceSummary(r)]));
    changes.push(...mapChanges("Space", spaceMap(prev.spaces), spaceMap(next.spaces)));
  }
  if (prev.meals && next.meals) {
    const mealMap = (list: NonNullable<ProposalSnapshot["meals"]>) => new Map(list.map((m) => [m.mealType, m.price != null ? `$${m.price}` : null]));
    changes.push(...mapChanges("Meal", mealMap(prev.meals), mealMap(next.meals)));
  }
  return changes;
}

// Refreshes the version row for the proposal's current revision: snapshot is
// the proposal now, changes are against the latest earlier revision.
async function recordVersion(tx: Prisma.TransactionClient, proposalId: string, summary: string | null, userId: string) {
  const p = await tx.hotelProposal.findUniqueOrThrow({ where: { id: proposalId }, include: snapshotInclude });
  const snapshot = snapshotOf(p);
  const prev = await tx.hotelProposalVersion.findFirst({
    where: { proposalId, revision: { lt: p.revision } },
    orderBy: { revision: "desc" },
    select: { snapshot: true },
  });
  const changes = prev ? diffSnapshots(prev.snapshot as ProposalSnapshot, snapshot) : [];
  await tx.hotelProposalVersion.upsert({
    where: { proposalId_revision: { proposalId, revision: p.revision } },
    create: { proposalId, revision: p.revision, summary, snapshot, changes, createdById: userId },
    update: { snapshot, changes, ...(summary ? { summary } : {}) },
  });
}

// Rewrites a proposal's concession answers. Every concession must belong to
// the RFP the proposal answers; rows with nothing in them aren't stored.
async function writeConcessions(tx: Prisma.TransactionClient, proposalId: string, rfpId: string | null, rows: ProposalConcessionArgs[] | undefined) {
  if (rows === undefined) return;
  const filled = rows.filter((c) => c.met || c.offered?.trim());
  if (filled.length && !rfpId) throw new Error("Only a proposal answering an RFP answers requested concessions");
  const ids = Array.from(new Set(filled.map((c) => c.concessionId)));
  if (ids.length && (await tx.rfpConcession.count({ where: { id: { in: ids }, rfpId: rfpId! } })) !== ids.length) {
    throw new PermissionError("NOT_FOUND", "Concession not found");
  }
  await tx.hotelProposalConcession.deleteMany({ where: { proposalId, concessionId: { not: null } } });
  await tx.hotelProposalConcession.createMany({
    data: filled.map((c) => ({ proposalId, concessionId: c.concessionId, offered: c.offered?.trim() || null, met: c.met })),
  });
}

// Rewrites the concessions a proposal offers unasked, in order (one per label).
async function writeOfferedConcessions(tx: Prisma.TransactionClient, proposalId: string, rows: ProposalOfferedConcessionArgs[] | undefined) {
  if (rows === undefined) return;
  const seen = new Set<string>();
  const kept = rows
    .map((c) => ({ label: c.label.trim(), offered: c.offered?.trim() || null }))
    .filter((c) => c.label && !seen.has(c.label.toLowerCase()) && seen.add(c.label.toLowerCase()));
  await tx.hotelProposalConcession.deleteMany({ where: { proposalId, concessionId: null } });
  await tx.hotelProposalConcession.createMany({ data: kept.map((c, i) => ({ proposalId, ...c, sortOrder: i })) });
}

// Rewrites a proposal's function space rows. Requested rows answer the
// meeting space requests of the RFP the proposal answers, one each.
async function writeSpaces(tx: Prisma.TransactionClient, proposalId: string, rfpId: string | null, rows: ProposalSpaceArgs[] | undefined) {
  if (rows === undefined) return;
  const kept = rows.filter((r) => r.name.trim());
  const ids = kept.flatMap((r) => (r.spaceRequestId ? [r.spaceRequestId] : []));
  if (new Set(ids).size !== ids.length) throw new Error("A meeting space request is answered once");
  if (ids.length) {
    if (!rfpId) throw new Error("Only a proposal answering an RFP answers its meeting space requests");
    if ((await tx.rfpSpaceRequest.count({ where: { id: { in: ids }, rfpId, kind: "MEETING" } })) !== ids.length) {
      throw new PermissionError("NOT_FOUND", "Meeting space request not found");
    }
  }
  await tx.hotelProposalSpace.deleteMany({ where: { proposalId } });
  await tx.hotelProposalSpace.createMany({
    data: kept.map((r, i) => ({
      proposalId,
      spaceRequestId: r.spaceRequestId,
      name: r.name.trim(),
      room: r.room?.trim() || null,
      capacity: r.capacity,
      hold24: r.hold24,
      rental: r.rental,
      rentalScope: r.rentalScope,
      waiverType: r.waiverType ?? null,
      waiverAmount: r.waiverType ? (r.waiverAmount ?? null) : null,
      waiverScope: r.waiverType ? (r.waiverScope ?? null) : null,
      note: r.note?.trim() || null,
      sortOrder: i,
    })),
  });
}

// Rewrites a proposal's meal prices, in order (one per meal type, priced only).
async function writeMeals(tx: Prisma.TransactionClient, proposalId: string, rows: ProposalMealArgs[] | undefined) {
  if (rows === undefined) return;
  const seen = new Set<string>();
  const kept = rows
    .map((m) => ({ mealType: m.mealType.trim(), price: m.price }))
    .filter((m) => m.mealType && m.price != null && !seen.has(m.mealType.toLowerCase()) && seen.add(m.mealType.toLowerCase()));
  if (kept.some((m) => m.price! < 0)) throw new Error("A meal price cannot be negative");
  await tx.hotelProposalMeal.deleteMany({ where: { proposalId } });
  await tx.hotelProposalMeal.createMany({ data: kept.map((m, i) => ({ proposalId, ...m, sortOrder: i })) });
}

// Rewrites the amenities a proposal states, in order (one per label).
async function writeAmenities(tx: Prisma.TransactionClient, proposalId: string, rows: ProposalAmenityArgs[]) {
  await tx.hotelProposalAmenity.deleteMany({ where: { proposalId } });
  await tx.hotelProposalAmenity.createMany({
    data: rows.map((a, i) => ({ proposalId, label: a.label, status: a.status, note: a.note?.trim() || null, sortOrder: i })),
  });
}

const AMENITY_STATUSES = new Set<AmenityStatus>(["CONFIRMED", "UNAVAILABLE"]);

// Amenity and unasked-concession labels as their lists spell them, once each.
// Labels the proposal already holds may stay (typed before the lists were strict).
async function listLabels(eventId: string, args: ProposalWriteArgs, proposalId?: string) {
  const tenantId = await requireEventTenantId(eventId);
  const current = proposalId
    ? await prisma.hotelProposal.findFirst({
        where: { id: proposalId, eventId },
        select: { amenities: { select: { label: true } }, concessions: { where: { concessionId: null }, select: { label: true } } },
      })
    : null;
  for (const a of args.amenities) if (!AMENITY_STATUSES.has(a.status)) throw new Error(`Unknown amenity status: ${a.status}`);
  const amenityLabels = await requireListLabels(
    tenantId,
    "hotel_amenity",
    args.amenities.map((a) => a.label),
    current?.amenities.map((a) => a.label) ?? [],
  );
  const amenities = args.amenities
    .map((a, i) => ({ ...a, label: amenityLabels[i] }))
    .filter((a, i, all) => all.findIndex((x) => x.label === a.label) === i);
  const offered = args.offeredConcessions?.filter((c) => c.label.trim());
  const offeredLabels = offered
    ? await requireListLabels(
        tenantId,
        "rfp_concession",
        offered.map((c) => c.label),
        current?.concessions.flatMap((c) => (c.label ? [c.label] : [])) ?? [],
      )
    : undefined;
  return { amenities, offeredConcessions: offered?.map((c, i) => ({ ...c, label: offeredLabels![i] })) };
}

async function findRfpBlock(eventId: string, rfpBlockId: string | null | undefined) {
  if (!rfpBlockId) return null;
  const block = await prisma.rfpHotelBlock.findFirst({ where: { id: rfpBlockId, rfp: { eventId } }, select: { id: true, rfpId: true } });
  if (!block) throw new PermissionError("NOT_FOUND", "RFP block not found");
  return block;
}

// A hotel answering an RFP is one of its recipients, listed or not.
async function addRecipient(tx: Prisma.TransactionClient, rfpId: string, venueId: string) {
  await tx.rfpRecipient.upsert({ where: { rfpId_venueId: { rfpId, venueId } }, create: { rfpId, venueId }, update: {} });
}

// A hotel RFP is decided once every block it requested has an accepted
// proposal (a proposal_status in the ACCEPTED stage): an issued one closes,
// as a vendor RFP does when its quote is accepted. Never reopens one.
export async function closeAwardedRfp(rfpId: string | null, eventId: string, userId: string) {
  if (!rfpId) return;
  const rfp = await prisma.rfp.findFirst({
    where: { id: rfpId, eventId, kind: "HOTEL", status: "ISSUED" },
    select: { hotelBlocks: { select: { proposals: { select: { status: true } } } } },
  });
  if (!rfp || rfp.hotelBlocks.length === 0) return;
  const accepted = new Set(
    (
      await prisma.customOption.findMany({
        where: { tenantId: await requireEventTenantId(eventId), category: "proposal_status", group: "ACCEPTED" },
        select: { label: true },
      })
    ).map((o) => o.label),
  );
  if (!rfp.hotelBlocks.every((b) => b.proposals.some((p) => accepted.has(p.status)))) return;
  await prisma.rfp.update({ where: { id: rfpId, eventId }, data: { status: "CLOSED", updatedById: userId } });
}

export async function createHotelProposalCore(eventId: string, args: ProposalWriteArgs, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  validate(args, null);
  await assertProposalRefs(eventId, args);
  const rfpBlock = await findRfpBlock(eventId, args.rfpBlockId);
  const { amenities, offeredConcessions } = await listLabels(eventId, args);
  const created = await prisma.$transaction(async (tx) => {
    if (rfpBlock) await addRecipient(tx, rfpBlock.rfpId, args.venueId);
    const proposal = await tx.hotelProposal.create({
      data: {
        ...scalarData(args),
        eventId,
        rfpId: rfpBlock?.rfpId ?? null,
        rfpBlockId: rfpBlock?.id ?? null,
        updatedById: userId,
        nights: { create: nightRows(args) },
        charges: { create: chargeRows(args) },
      },
    });
    await writeConcessions(tx, proposal.id, rfpBlock?.rfpId ?? null, args.concessions);
    await writeSpaces(tx, proposal.id, rfpBlock?.rfpId ?? null, args.spaces);
    await writeMeals(tx, proposal.id, args.meals);
    await writeOfferedConcessions(tx, proposal.id, offeredConcessions);
    await writeAmenities(tx, proposal.id, amenities);
    await recordVersion(tx, proposal.id, args.revisionSummary, userId);
    return proposal;
  });
  await closeAwardedRfp(created.rfpId, eventId, userId);
  return created;
}

export async function updateHotelProposalCore(id: string, eventId: string, args: ProposalWriteArgs, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  const existing = await prisma.hotelProposal.findFirst({
    where: { id, eventId },
    select: { revision: true, rfpId: true, submittedOn: true, validUntil: true, checkIn: true, checkOut: true },
  });
  if (!existing) throw new PermissionError("NOT_FOUND");
  validate(args, existing);
  await assertProposalRefs(eventId, args);
  if (args.revision < existing.revision) throw new Error(`Revision cannot go back below ${existing.revision}`);
  // Linking to an RFP block (or another one, or none) after the fact.
  const relink = args.rfpBlockId !== undefined;
  const rfpBlock = relink ? await findRfpBlock(eventId, args.rfpBlockId) : null;
  const rfpId = relink ? (rfpBlock?.rfpId ?? null) : existing.rfpId;
  const { amenities, offeredConcessions } = await listLabels(eventId, args, id);
  const updated = await prisma.$transaction(async (tx) => {
    if (rfpBlock) await addRecipient(tx, rfpBlock.rfpId, args.venueId);
    // Answers to another RFP's concessions and space requests don't carry
    // over: the answers go, the rooms stay as offered unasked.
    if (rfpId !== existing.rfpId) {
      if (args.concessions === undefined) await tx.hotelProposalConcession.deleteMany({ where: { proposalId: id, concessionId: { not: null } } });
      if (args.spaces === undefined) await tx.hotelProposalSpace.updateMany({ where: { proposalId: id }, data: { spaceRequestId: null } });
    }
    await tx.hotelProposalNight.deleteMany({ where: { proposalId: id } });
    await tx.hotelCharge.deleteMany({ where: { proposalId: id, kind: args.meetingCharges === undefined ? "GUEST" : undefined } });
    const proposal = await tx.hotelProposal.update({
      where: { id, eventId },
      data: {
        ...scalarData(args),
        ...(relink ? { rfpId, rfpBlockId: rfpBlock?.id ?? null } : {}),
        updatedById: userId,
        nights: { create: nightRows(args) },
        charges: { create: chargeRows(args) },
      },
    });
    await writeConcessions(tx, id, rfpId, args.concessions);
    await writeSpaces(tx, id, rfpId, args.spaces);
    await writeMeals(tx, id, args.meals);
    await writeOfferedConcessions(tx, id, offeredConcessions);
    await writeAmenities(tx, id, amenities);
    await recordVersion(tx, id, args.revisionSummary, userId);
    return proposal;
  });
  await closeAwardedRfp(updated.rfpId, eventId, userId);
  return updated;
}

// Links a proposal recorded without an RFP to the block it answers, from the
// RFP's side: a citywide RFP a CVB sent out brings offers from hotels never
// listed. The hotel joins the recipients; a concession it offered unasked that
// the RFP asked for becomes the answer, and other requested ones its profile
// or the offer's amenities cover start Met (as on a new proposal).
export async function linkHotelProposalCore(id: string, eventId: string, rfpBlockId: string, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  const proposal = await prisma.hotelProposal.findFirst({
    where: { id, eventId },
    select: {
      rfpId: true,
      venueId: true,
      venue: { select: { amenities: true } },
      amenities: { select: { label: true, status: true } },
      concessions: { where: { concessionId: null }, select: { id: true, label: true } },
    },
  });
  if (!proposal) throw new PermissionError("NOT_FOUND", "Proposal not found");
  if (proposal.rfpId) throw new Error("This proposal already answers an RFP");
  const block = await findRfpBlock(eventId, rfpBlockId);
  if (!block) throw new PermissionError("NOT_FOUND", "RFP block not found");
  const requested = await prisma.rfpConcession.findMany({ where: { rfpId: block.rfpId }, orderBy: { sortOrder: "asc" }, select: { id: true, label: true } });
  const unavailable = new Set(proposal.amenities.filter((a) => a.status === "UNAVAILABLE").map((a) => labelKey(a.label)));
  const covered = coveredByProfile(
    [...proposal.venue.amenities, ...proposal.amenities.filter((a) => a.status === "CONFIRMED").map((a) => a.label)].filter(
      (l) => !unavailable.has(labelKey(l)),
    ),
  );
  await prisma.$transaction(async (tx) => {
    await addRecipient(tx, block.rfpId, proposal.venueId);
    await tx.hotelProposal.update({ where: { id, eventId }, data: { rfpId: block.rfpId, rfpBlockId: block.id, updatedById: userId } });
    for (let i = 0; i < requested.length; i++) {
      const request = requested[i];
      const offered = proposal.concessions.find((c) => c.label && labelKey(c.label) === labelKey(request.label));
      if (offered) {
        await tx.hotelProposalConcession.update({ where: { id: offered.id }, data: { concessionId: request.id, label: null, sortOrder: i } });
      } else if (covered(request.label)) {
        await tx.hotelProposalConcession.create({ data: { proposalId: id, concessionId: request.id, met: "MET", sortOrder: i } });
      }
    }
  });
  await closeAwardedRfp(block.rfpId, eventId, userId);
}

export async function deleteHotelProposalCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "DELETE", eventId);
  await prisma.$transaction(async (tx) => {
    await tx.hotelProposal.delete({ where: { id, eventId } });
    await reopenInboundOffers(tx, id, eventId);
  });
}

// An inbox offer saved as this proposal goes back to open, so the message can
// be saved again or re-read; an Applied message is Ready again.
async function reopenInboundOffers(tx: Prisma.TransactionClient, proposalId: string, eventId: string) {
  const items = await tx.inboundEmail.findMany({
    where: {
      eventId,
      OR: [
        { proposal: { path: ["offerOutcomes"], array_contains: [{ proposalId }] } },
        { proposal: { path: ["appliedProposalId"], equals: proposalId } },
      ],
    },
    select: { id: true, status: true, proposal: true },
  });
  for (const item of items) {
    const { appliedProposalId: _legacy, ...proposal } = item.proposal as InboundProposal;
    const outcomes = offerOutcomes(item.proposal as InboundProposal).map((o) => (o && "proposalId" in o && o.proposalId === proposalId ? null : o));
    await tx.inboundEmail.update({
      where: { id: item.id },
      data: {
        proposal: { ...proposal, offerOutcomes: outcomes },
        ...(item.status === "APPLIED" ? { status: "PARSED" as const } : {}),
      },
    });
  }
}

// Plain (client-serializable) form values for ProposalForm.
export function toProposalValues(
  p: Omit<ProposalWithChildren, "concessions" | "leadSourceVendor"> & { venueId: string; revision: number; leadSourceVendor?: { name: string } | null },
) {
  const {
    venueName: _venueName,
    blockType: _blockType,
    amenities: _amenities,
    concessions: _concessions,
    leadSource: _leadSource,
    ...rest
  } = snapshotOf({ ...p, leadSourceVendor: p.leadSourceVendor ?? null, concessions: [] });
  return {
    ...rest,
    leadSourceDirect: p.leadSourceDirect,
    leadSourceVendorId: p.leadSourceVendorId,
    leadSourceContactId: p.leadSourceContactId,
    amenities: p.amenities.map((a) => ({ label: a.label, status: a.status, note: a.note })),
    contractType: p.contractType,
    guestType: p.guestType,
    venueId: p.venueId,
    revision: p.revision,
    validUntil: day(p.validUntil),
    taxIncluded: p.taxIncluded,
  };
}

// The write args that save a loaded proposal back unchanged, for callers that
// change a few fields (MCP partial updates, a contract applied to it).
export function writeArgsOf(p: Parameters<typeof toProposalValues>[0]): ProposalWriteArgs {
  const v = toProposalValues(p);
  const n = (x: string | null | undefined) => (x == null ? null : Number(x));
  const charges = (list: ProposalSnapshot["charges"]) => list.map((c) => ({ ...c, amount: n(c.amount) }));
  return {
    ...v,
    revisionSummary: null,
    allowedAttrition: n(v.allowedAttrition),
    guaranteedRevenue: n(v.guaranteedRevenue),
    nights: v.nights.map((x) => ({ ...x, rate: n(x.rate) })),
    charges: charges(v.charges),
    meetingCharges: charges(v.meetingCharges ?? []),
    spaces: (v.spaces ?? []).map((r) => ({ ...r, rental: n(r.rental), waiverAmount: n(r.waiverAmount) })),
    fbMinimum: n(v.fbMinimum),
    fbTaxRate: n(v.fbTaxRate),
    fbServiceCharge: n(v.fbServiceCharge),
    meals: (v.meals ?? []).map((m) => ({ ...m, price: n(m.price) })),
  };
}

// A hotel added in passing ("New hotel" on a proposal, prefilled from an
// emailed offer, or on an RFP's recipients): a lodging venue with its sales
// contact. A venue with the same name
// is refused, so it gets picked instead. VENUES WRITE is checked by
// createVenueCore.
export async function createNewHotelCore(eventId: string, hotel: OfferHotel, amenities: string[], userId: string) {
  const tenantId = await requireEventTenantId(eventId);
  const name = hotel.name?.trim();
  if (!name) throw new Error("The hotel needs a name");
  const same = await prisma.venue.findFirst({
    where: { tenantId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (same) throw new Error(`${name} is already in Venues; choose it as the hotel`);
  const clean = (v: string | null) => v?.trim() || null;
  const venue = await createVenueCore(
    { name, address: clean(hotel.address), city: clean(hotel.city), state: clean(hotel.state), zip: clean(hotel.zip), country: null, notes: null, isLodging: true, amenities },
    userId,
    tenantId,
  );
  const first = clean(hotel.contactFirstName);
  const last = clean(hotel.contactLastName);
  if (first || last) {
    const link = await createAndAddVenueContactCore(
      { venueId: venue.id, firstName: first ?? "", lastName: last ?? "", email: clean(hotel.contactEmail), organization: name, role: clean(hotel.contactTitle) },
      userId,
      tenantId,
    );
    const phone = clean(hotel.contactPhone);
    if (phone) await prisma.contact.update({ where: { id: link.contactId, tenantId }, data: { phone } });
  }
  return venue;
}
