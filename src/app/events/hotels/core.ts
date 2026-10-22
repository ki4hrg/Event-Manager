// Pure cores for hotel proposals. NOT a "use server" file — see
// src/app/contacts/core.ts for the rationale.
//
// A proposal is replaced whole on save: its nightly room grid and charges are
// rewritten in the same transaction. Every save also refreshes the
// HotelProposalVersion row for the current revision, so earlier revisions stay
// frozen and the current one always matches the proposal.

import type { AmenityStatus, ConcessionMet, HotelChargeScope, HotelContractType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { AMENITY_STATUS_LABELS, blockTypeLabel, dateFromKey, dateKey, MET_LABELS, nightKeys, roomTypeLabel } from "@/lib/hotels";
import { requireListLabels } from "@/lib/hotelLabels";
import type { OfferHotel } from "@/lib/inboundParse";
import { createAndAddVenueContactCore, createVenueCore } from "@/app/venues/core";

export type ProposalNightArgs = { roomType: string | null; night: string; rate: number | null; rooms: number | null };
export type ProposalChargeArgs = { chargeType: string; amount: number | null; scope: HotelChargeScope | null };
export type ProposalConcessionArgs = { concessionId: string; offered: string | null; met: ConcessionMet | null };
// A concession the hotel offered without the RFP asking (or with no RFP).
export type ProposalOfferedConcessionArgs = { label: string; offered: string | null };
// An amenity the offer confirms or says is unavailable (hotel_amenity label).
export type ProposalAmenityArgs = { label: string; status: AmenityStatus; note: string | null };

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
  charges: ProposalChargeArgs[];
  // Create only: the requested RFP block this offer answers.
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
  charges: { chargeType: string; amount: string | null; scope: HotelChargeScope | null }[];
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

function validate(args: ProposalWriteArgs) {
  if (!args.venueId) throw new Error("Hotel is required");
  if (!args.status) throw new Error("Status is required");
  if (!Number.isInteger(args.revision) || args.revision < 1) throw new Error("Revision must be a whole number of 1 or more");
  if (args.allowedAttrition != null && (args.allowedAttrition < 0 || args.allowedAttrition > 100)) {
    throw new Error("Allowed attrition must be between 0 and 100");
  }
  if (args.guaranteedRevenue != null && args.guaranteedRevenue < 0) throw new Error("Guaranteed revenue cannot be negative");
  if (args.validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(args.validUntil)) throw new Error(`Invalid date: ${args.validUntil}`);
  if (args.checkIn && args.checkOut && args.checkOut <= args.checkIn) throw new Error("Check-out must be after check-in");
  if (args.submittedOn && args.validUntil && args.validUntil < args.submittedOn) throw new Error("Valid until can't be before the submitted date");
  const keys = new Set(nightKeys(args.checkIn, args.checkOut));
  for (const n of args.nights) {
    if (!keys.has(n.night)) throw new Error(`Night ${n.night} is outside the stay`);
  }
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
  return args.charges
    .filter((c) => c.chargeType.trim())
    .map((c, i) => ({ chargeType: c.chargeType.trim(), amount: c.amount, scope: c.scope, sortOrder: i }));
}

function scalarData(args: ProposalWriteArgs) {
  return {
    venueId: args.venueId,
    status: args.status,
    leadSourceDirect: args.leadSourceDirect,
    leadSourceVendorId: args.leadSourceVendorId,
    leadSourceContactId: args.leadSourceVendorId ? args.leadSourceContactId : null,
    contractType: args.contractType,
    guestType: args.guestType,
    submittedOn: args.submittedOn ? dateFromKey(args.submittedOn) : null,
    checkIn: args.checkIn ? dateFromKey(args.checkIn) : null,
    checkOut: args.checkOut ? dateFromKey(args.checkOut) : null,
    declinedReason: args.declinedReason,
    notes: args.notes,
    revision: args.revision,
    allowedAttrition: args.allowedAttrition,
    guaranteedRevenue: args.guaranteedRevenue,
    validUntil: args.validUntil ? dateFromKey(args.validUntil) : null,
    taxIncluded: args.taxIncluded,
  };
}

const snapshotInclude = {
  venue: { select: { name: true } },
  leadSourceVendor: { select: { name: true } },
  nights: { orderBy: [{ night: "asc" }, { roomType: "asc" }] },
  charges: { orderBy: { sortOrder: "asc" } },
  amenities: { orderBy: { sortOrder: "asc" } },
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
    charges: p.charges.map((c) => ({ chargeType: c.chargeType, amount: dec(c.amount), scope: c.scope })),
  };
}

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
];

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
  const chargeMap = (s: ProposalSnapshot) => new Map(s.charges.map((c) => [c.chargeType, charge(c)]));
  const cBefore = chargeMap(prev);
  const cAfter = chargeMap(next);
  for (const key of Array.from(new Set([...Array.from(cBefore.keys()), ...Array.from(cAfter.keys())])).sort()) {
    const from = cBefore.get(key) ?? null;
    const to = cAfter.get(key) ?? null;
    if (from !== to) changes.push({ field: `Charge: ${key}`, from, to });
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

export async function createHotelProposalCore(eventId: string, args: ProposalWriteArgs, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  validate(args);
  await assertProposalRefs(eventId, args);
  const rfpBlock = args.rfpBlockId
    ? await prisma.rfpHotelBlock.findFirst({ where: { id: args.rfpBlockId, rfp: { eventId } }, select: { id: true, rfpId: true } })
    : null;
  if (args.rfpBlockId && !rfpBlock) throw new PermissionError("NOT_FOUND", "RFP block not found");
  const { amenities, offeredConcessions } = await listLabels(eventId, args);
  return prisma.$transaction(async (tx) => {
    // A hotel answering an RFP is one of its recipients, listed or not.
    if (rfpBlock) {
      await tx.rfpRecipient.upsert({
        where: { rfpId_venueId: { rfpId: rfpBlock.rfpId, venueId: args.venueId } },
        create: { rfpId: rfpBlock.rfpId, venueId: args.venueId },
        update: {},
      });
    }
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
    await writeOfferedConcessions(tx, proposal.id, offeredConcessions);
    await writeAmenities(tx, proposal.id, amenities);
    await recordVersion(tx, proposal.id, args.revisionSummary, userId);
    return proposal;
  });
}

export async function updateHotelProposalCore(id: string, eventId: string, args: ProposalWriteArgs, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  validate(args);
  await assertProposalRefs(eventId, args);
  const existing = await prisma.hotelProposal.findFirst({ where: { id, eventId }, select: { revision: true, rfpId: true } });
  if (!existing) throw new PermissionError("NOT_FOUND");
  if (args.revision < existing.revision) throw new Error(`Revision cannot go back below ${existing.revision}`);
  const { amenities, offeredConcessions } = await listLabels(eventId, args, id);
  return prisma.$transaction(async (tx) => {
    await tx.hotelProposalNight.deleteMany({ where: { proposalId: id } });
    await tx.hotelCharge.deleteMany({ where: { proposalId: id } });
    const proposal = await tx.hotelProposal.update({
      where: { id, eventId },
      data: {
        ...scalarData(args),
        updatedById: userId,
        nights: { create: nightRows(args) },
        charges: { create: chargeRows(args) },
      },
    });
    await writeConcessions(tx, id, existing.rfpId, args.concessions);
    await writeOfferedConcessions(tx, id, offeredConcessions);
    await writeAmenities(tx, id, amenities);
    await recordVersion(tx, id, args.revisionSummary, userId);
    return proposal;
  });
}

export async function deleteHotelProposalCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "DELETE", eventId);
  await prisma.hotelProposal.delete({ where: { id, eventId } });
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
