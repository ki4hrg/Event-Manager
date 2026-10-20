// Pure cores for hotel proposals. NOT a "use server" file — see
// src/app/contacts/core.ts for the rationale.
//
// A proposal is replaced whole on save: its nightly room grid and charges are
// rewritten in the same transaction. Every save also refreshes the
// HotelProposalVersion row for the current revision, so earlier revisions stay
// frozen and the current one always matches the proposal.

import type { ConcessionMet, HotelBlockType, HotelChargeScope, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { dateFromKey, dateKey, nightKeys } from "@/lib/hotels";

export type ProposalNightArgs = { roomType: string | null; night: string; rate: number | null; rooms: number | null };
export type ProposalChargeArgs = { chargeType: string; amount: number | null; scope: HotelChargeScope | null };
export type ProposalConcessionArgs = { concessionId: string; offered: string | null; met: ConcessionMet | null };

export type ProposalWriteArgs = {
  venueId: string;
  status: string;
  leadSource: string | null;
  blockType: HotelBlockType | null;
  submittedOn: string | null; // YYYY-MM-DD
  checkIn: string | null;
  checkOut: string | null;
  declinedReason: string | null;
  notes: string | null;
  revision: number;
  revisionSummary: string | null;
  isRunOfHouse: boolean;
  allowedAttrition: number | null;
  guaranteedRevenue: number | null;
  amenities: string[];
  nights: ProposalNightArgs[];
  charges: ProposalChargeArgs[];
  // Create only: the requested RFP block this offer answers.
  rfpBlockId?: string | null;
  // Answers to the RFP's concessions; undefined leaves them as they are.
  concessions?: ProposalConcessionArgs[];
};

// What a version snapshot holds (and what the diff compares).
export type ProposalSnapshot = {
  venueName: string;
  status: string;
  leadSource: string | null;
  blockType: HotelBlockType | null;
  submittedOn: string | null;
  checkIn: string | null;
  checkOut: string | null;
  declinedReason: string | null;
  notes: string | null;
  isRunOfHouse: boolean;
  allowedAttrition: string | null;
  guaranteedRevenue: string | null;
  amenities: string[];
  nights: { roomType: string | null; night: string; rate: string | null; rooms: number | null }[];
  charges: { chargeType: string; amount: string | null; scope: HotelChargeScope | null }[];
};

export type ProposalChange = { field: string; from: string | null; to: string | null };

async function assertProposalRefs(eventId: string, args: ProposalWriteArgs) {
  const tenantId = await requireEventTenantId(eventId);
  const [venue, status] = await Promise.all([
    prisma.venue.findFirst({ where: { id: args.venueId, tenantId }, select: { id: true } }),
    prisma.customOption.findFirst({ where: { tenantId, category: "proposal_status", label: args.status }, select: { id: true } }),
  ]);
  if (!venue) throw new PermissionError("NOT_FOUND", "Hotel not found");
  if (!status) throw new Error(`Unknown proposal status: ${args.status}`);
}

function validate(args: ProposalWriteArgs) {
  if (!args.venueId) throw new Error("Hotel is required");
  if (!args.status) throw new Error("Status is required");
  if (!Number.isInteger(args.revision) || args.revision < 1) throw new Error("Revision must be a whole number of 1 or more");
  if (args.allowedAttrition != null && (args.allowedAttrition < 0 || args.allowedAttrition > 100)) {
    throw new Error("Allowed attrition must be between 0 and 100");
  }
  if (args.guaranteedRevenue != null && args.guaranteedRevenue < 0) throw new Error("Guaranteed revenue cannot be negative");
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
      roomType: args.isRunOfHouse ? null : n.roomType,
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
    leadSource: args.leadSource,
    blockType: args.blockType,
    submittedOn: args.submittedOn ? dateFromKey(args.submittedOn) : null,
    checkIn: args.checkIn ? dateFromKey(args.checkIn) : null,
    checkOut: args.checkOut ? dateFromKey(args.checkOut) : null,
    declinedReason: args.declinedReason,
    notes: args.notes,
    revision: args.revision,
    isRunOfHouse: args.isRunOfHouse,
    allowedAttrition: args.allowedAttrition,
    guaranteedRevenue: args.guaranteedRevenue,
    amenities: args.amenities,
  };
}

const snapshotInclude = {
  venue: { select: { name: true } },
  nights: { orderBy: [{ night: "asc" }, { roomType: "asc" }] },
  charges: { orderBy: { sortOrder: "asc" } },
} as const satisfies Prisma.HotelProposalInclude;

type ProposalWithChildren = Prisma.HotelProposalGetPayload<{ include: typeof snapshotInclude }>;

const dec = (v: Prisma.Decimal | null) => (v == null ? null : v.toString());
const day = (v: Date | null) => (v ? dateKey(v) : null);

export function snapshotOf(p: ProposalWithChildren): ProposalSnapshot {
  return {
    venueName: p.venue.name,
    status: p.status,
    leadSource: p.leadSource,
    blockType: p.blockType,
    submittedOn: day(p.submittedOn),
    checkIn: day(p.checkIn),
    checkOut: day(p.checkOut),
    declinedReason: p.declinedReason,
    notes: p.notes,
    isRunOfHouse: p.isRunOfHouse,
    allowedAttrition: dec(p.allowedAttrition),
    guaranteedRevenue: dec(p.guaranteedRevenue),
    amenities: [...p.amenities].sort(),
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
  ["isRunOfHouse", "Run of house"],
  ["allowedAttrition", "Allowed attrition %"],
  ["guaranteedRevenue", "Guaranteed revenue"],
];

const show = (v: unknown): string | null => (v == null || v === "" ? null : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));

export function diffSnapshots(prev: ProposalSnapshot, next: ProposalSnapshot): ProposalChange[] {
  const changes: ProposalChange[] = [];
  for (const [key, label] of FIELD_LABELS) {
    const from = show(prev[key]);
    const to = show(next[key]);
    if (from !== to) changes.push({ field: label, from, to });
  }
  const amenFrom = prev.amenities.join(", ") || null;
  const amenTo = next.amenities.join(", ") || null;
  if (amenFrom !== amenTo) changes.push({ field: "Amenities", from: amenFrom, to: amenTo });

  const cell = (n: ProposalSnapshot["nights"][number]) =>
    [n.rooms != null ? `${n.rooms} rooms` : null, n.rate != null ? `$${n.rate}` : null].filter(Boolean).join(" @ ") || null;
  const nightMap = (s: ProposalSnapshot) => new Map(s.nights.map((n) => [`${n.night} ${n.roomType ?? "Run of house"}`, cell(n)]));
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
  if (filled.length && !rfpId) throw new Error("Only a proposal answering an RFP has concessions");
  const ids = Array.from(new Set(filled.map((c) => c.concessionId)));
  if (ids.length && (await tx.rfpConcession.count({ where: { id: { in: ids }, rfpId: rfpId! } })) !== ids.length) {
    throw new PermissionError("NOT_FOUND", "Concession not found");
  }
  await tx.hotelProposalConcession.deleteMany({ where: { proposalId } });
  await tx.hotelProposalConcession.createMany({
    data: filled.map((c) => ({ proposalId, concessionId: c.concessionId, offered: c.offered?.trim() || null, met: c.met })),
  });
}

export async function createHotelProposalCore(eventId: string, args: ProposalWriteArgs, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  validate(args);
  await assertProposalRefs(eventId, args);
  const rfpBlock = args.rfpBlockId
    ? await prisma.rfpHotelBlock.findFirst({ where: { id: args.rfpBlockId, rfp: { eventId } }, select: { id: true, rfpId: true } })
    : null;
  if (args.rfpBlockId && !rfpBlock) throw new PermissionError("NOT_FOUND", "RFP block not found");
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
    await recordVersion(tx, id, args.revisionSummary, userId);
    return proposal;
  });
}

export async function deleteHotelProposalCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "DELETE", eventId);
  await prisma.hotelProposal.delete({ where: { id, eventId } });
}

// Plain (client-serializable) form values for ProposalForm.
export function toProposalValues(p: ProposalWithChildren & { venueId: string; revision: number }) {
  const { venueName: _venueName, ...rest } = snapshotOf(p);
  return { ...rest, venueId: p.venueId, revision: p.revision };
}
