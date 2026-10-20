// Pure cores for RFPs. NOT a "use server" file — see src/app/contacts/core.ts
// for the rationale.
//
// An RFP is event-scoped: every lookup carries eventId, children go through
// { rfp: { eventId } }. The permission resource follows the kind
// (resourceForKind). Requested blocks and concessions are updated in place
// by id on save — proposals link to blocks and answer concessions.

import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import type { HotelContractType, RfpKind, RfpSpaceKind, RfpStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser, type PermissionAction } from "@/lib/permissions";
import { addDays, CONTRACT_TYPE_LABELS, dateFromKey, dateKey } from "@/lib/hotels";
import { resourceForKind } from "@/lib/rfp/kinds";
import type { PatternBasis } from "@/lib/hotelPattern";
import { buildComparison } from "@/lib/rfp/compare";
import { FB_INCLUDES, parseSections } from "@/lib/rfp/sections";
import { getUploadDir, getUploadPath } from "@/lib/uploads";

export type RfpWriteArgs = {
  title: string;
  status: RfpStatus;
  responseDue: string | null; // YYYY-MM-DD
  decisionBy: string | null;
  sections: string[];
  introduction: string | null;
  requirements: string | null;
  contactId: string | null;
  arrivalDate: string | null; // YYYY-MM-DD
  departureDate: string | null;
  datesFlexible: boolean;
  dateNotes: string | null;
  alternateDates: { startDate: string; endDate: string }[]; // replaces the list
  peakRooms: number | null;
  historyMatching: boolean; // history shows only blocks of this RFP's contract / guest types
  reservationMethod: string | null;
  commissionNotes: string | null;
  fbMinimum: number | null;
  fbIncludes: string[];
  fbHistoricalSpend: number | null;
  amenities: string[];
  decisionMakerId: string | null; // a contact; decisionMaker is the typed fallback
  decisionMaker: string | null;
  regions: string[]; // hotel_region labels; with areas empty, the event's apply
  areas: string[]; // hotel_area labels
  siteVisitBy: string | null;
};

export type RfpSpaceArgs = {
  id?: string | null; // an existing row keeps its id
  kind: RfpSpaceKind;
  functionId?: string | null;
  cateringOrderId?: string | null;
  day: string | null; // YYYY-MM-DD; null until scheduled
  endDay: string | null; // repeats (or, with a 24-hr hold, runs) through this day
  startTime: string | null; // HH:MM, event-local
  endTime: string | null;
  functionType: string | null;
  name: string;
  attendance: number | null;
  setup: string | null;
  areaSqFt: number | null;
  av: string | null;
  hold24: boolean;
  room: string | null;
};

export type RfpBlockArgs = {
  id?: string | null; // an existing block keeps its id (and its proposals' links)
  contractType: HotelContractType;
  guestType: string | null; // hotel_guest_type option label
  targetRate: number | null;
  notes: string | null;
  nights: { roomType: string | null; night: string; rooms: number }[];
};

// Fill from history: which past blocks to draw on (null = any).
export type RfpFillArgs = {
  seriesId: string | null;
  contractType: HotelContractType | null;
  guestType: string | null;
  basis: PatternBasis;
  adjust: number;
};

export type RfpConcessionArgs = { id?: string | null; label: string; value: string | null; required: boolean };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Requested nights may run this far either side of the event (arrivals, move-in).
const NIGHT_WINDOW_DAYS = 30;

// Loads the RFP's kind and checks the caller may act on it; a foreign id
// (or another event's RFP) is a not-found.
async function authorizeRfp(id: string, eventId: string, action: PermissionAction, userId: string) {
  const rfp = await prisma.rfp.findFirst({ where: { id, eventId }, select: { kind: true, status: true } });
  if (!rfp) throw new PermissionError("NOT_FOUND", "RFP not found");
  await requirePermissionForUser(userId, resourceForKind(rfp.kind), action, eventId);
  return rfp;
}

const day = (v: string | null) => (v ? dateFromKey(v) : null);
const FB_INCLUDE_KEYS = new Set<string>(FB_INCLUDES.map((f) => f.value));
const MAX_ALTERNATE_DATES = 3;

function money(v: number | null, label: string) {
  if (v != null && (!Number.isFinite(v) || v < 0)) throw new Error(`${label} cannot be negative`);
  return v;
}

async function validate(eventId: string, kind: RfpKind, args: RfpWriteArgs) {
  if (!args.title.trim()) throw new Error("Title is required");
  const alternates = args.alternateDates.filter((a) => a.startDate || a.endDate);
  const dates = [args.responseDue, args.decisionBy, args.arrivalDate, args.departureDate, args.siteVisitBy, ...alternates.flatMap((a) => [a.startDate, a.endDate])];
  for (const d of dates) if (d && !DATE_RE.test(d)) throw new Error(`Invalid date: ${d}`);
  if (args.arrivalDate && args.departureDate && args.departureDate <= args.arrivalDate) throw new Error("Departure must be after arrival");
  if (alternates.length > MAX_ALTERNATE_DATES) throw new Error(`At most ${MAX_ALTERNATE_DATES} alternate dates`);
  for (const a of alternates) {
    if (!a.startDate || !a.endDate || a.endDate <= a.startDate) throw new Error("Each alternate needs an arrival before its departure");
  }
  if (args.peakRooms != null && (!Number.isInteger(args.peakRooms) || args.peakRooms < 0)) throw new Error("Peak rooms must be a whole number");
  const contactIds = [args.contactId, args.decisionMakerId].filter((c): c is string => !!c);
  if (contactIds.length) {
    const tenantId = await requireEventTenantId(eventId);
    const found = await prisma.contact.count({ where: { id: { in: contactIds }, tenantId } });
    if (found < new Set(contactIds).size) throw new PermissionError("NOT_FOUND", "Contact not found");
  }
  return {
    title: args.title.trim(),
    status: args.status,
    responseDue: args.responseDue ? dateFromKey(args.responseDue) : null,
    decisionBy: args.decisionBy ? dateFromKey(args.decisionBy) : null,
    sections: parseSections(kind, args.sections),
    introduction: args.introduction,
    requirements: args.requirements,
    contactId: args.contactId,
    arrivalDate: day(args.arrivalDate),
    departureDate: day(args.departureDate),
    datesFlexible: args.datesFlexible,
    dateNotes: args.dateNotes?.trim() || null,
    peakRooms: args.peakRooms,
    historyMatching: args.historyMatching,
    reservationMethod: args.reservationMethod,
    commissionNotes: args.commissionNotes?.trim() || null,
    fbMinimum: money(args.fbMinimum, "F&B minimum"),
    fbIncludes: args.fbIncludes.filter((f) => FB_INCLUDE_KEYS.has(f)),
    fbHistoricalSpend: money(args.fbHistoricalSpend, "F&B historical spend"),
    amenities: Array.from(new Set(args.amenities.filter(Boolean))),
    decisionMakerId: args.decisionMakerId,
    decisionMaker: args.decisionMakerId ? null : args.decisionMaker?.trim() || null,
    regions: Array.from(new Set(args.regions.filter(Boolean))),
    areas: Array.from(new Set(args.areas.filter(Boolean))),
    siteVisitBy: day(args.siteVisitBy),
    alternateDates: {
      create: alternates.map((a, i) => ({ startDate: dateFromKey(a.startDate), endDate: dateFromKey(a.endDate), sortOrder: i })),
    },
  };
}

export async function createRfpCore(
  eventId: string,
  kind: RfpKind,
  args: RfpWriteArgs,
  blocks: RfpBlockArgs[],
  userId: string,
) {
  await requirePermissionForUser(userId, resourceForKind(kind), "WRITE", eventId);
  const data = await validate(eventId, kind, args);
  const blockRows = await validBlocks(eventId, blocks);
  return prisma.rfp.create({
    data: {
      ...data,
      eventId,
      kind,
      updatedById: userId,
      hotelBlocks: { create: blockRows.map(({ id: _id, ...b }, i) => ({ ...b, sortOrder: i, nights: { create: b.nights } })) },
    },
  });
}

export async function updateRfpCore(id: string, eventId: string, args: RfpWriteArgs, userId: string) {
  const { kind } = await authorizeRfp(id, eventId, "WRITE", userId);
  const data = await validate(eventId, kind, args);
  return prisma.$transaction(async (tx) => {
    await tx.rfpAlternateDate.deleteMany({ where: { rfpId: id } });
    return tx.rfp.update({ where: { id, eventId }, data: { ...data, updatedById: userId } });
  });
}

export async function deleteRfpCore(id: string, eventId: string, userId: string) {
  await authorizeRfp(id, eventId, "DELETE", userId);
  await prisma.rfp.delete({ where: { id, eventId } });
}

async function validBlocks(eventId: string, blocks: RfpBlockArgs[]) {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { startDate: true, endDate: true } });
  const shift = (d: Date, days: number) => dateKey(new Date(d.getTime() + days * 86_400_000));
  const first = shift(event.startDate, -NIGHT_WINDOW_DAYS);
  const last = shift(event.endDate, NIGHT_WINDOW_DAYS);
  return blocks.map((b) => {
    if (b.targetRate != null && (!Number.isFinite(b.targetRate) || b.targetRate < 0)) throw new Error("Target rate cannot be negative");
    const seen = new Set<string>();
    const nights = b.nights
      .filter((n) => n.rooms >= 0)
      .map((n) => {
        if (!DATE_RE.test(n.night) || n.night < first || n.night > last) throw new Error(`Night ${n.night} is too far from the event`);
        if (!Number.isInteger(n.rooms)) throw new Error("Rooms must be whole numbers");
        const roomType = n.roomType || null; // null = Run of House
        const key = `${roomType ?? ""}|${n.night}`;
        if (seen.has(key)) throw new Error(`Night ${n.night} is listed twice`);
        seen.add(key);
        return { roomType, night: dateFromKey(n.night), rooms: n.rooms };
      });
    if (!CONTRACT_TYPE_LABELS[b.contractType]) throw new Error(`Unknown contract type: ${b.contractType}`);
    return { id: b.id ?? null, contractType: b.contractType, guestType: b.guestType || null, targetRate: b.targetRate, notes: b.notes?.trim() || null, nights };
  });
}

export async function saveRfpBlocksCore(id: string, eventId: string, blocks: RfpBlockArgs[], userId: string) {
  await authorizeRfp(id, eventId, "WRITE", userId);
  const rows = await validBlocks(eventId, blocks);
  const existing = new Set((await prisma.rfpHotelBlock.findMany({ where: { rfpId: id }, select: { id: true } })).map((b) => b.id));
  const kept = rows.flatMap((b) => (b.id && existing.has(b.id) ? [b.id] : []));
  await prisma.$transaction(async (tx) => {
    // Blocks are updated in place so proposals answering them stay linked; a
    // removed block's proposals keep their RFP link and lose the block (SetNull).
    await tx.rfpHotelBlock.deleteMany({ where: { rfpId: id, id: { notIn: kept } } });
    for (let i = 0; i < rows.length; i++) {
      const { id: blockId, nights, ...data } = rows[i];
      if (blockId && existing.has(blockId)) {
        await tx.rfpHotelBlockNight.deleteMany({ where: { blockId } });
        await tx.rfpHotelBlock.update({ where: { id: blockId, rfpId: id }, data: { ...data, sortOrder: i, nights: { create: nights } } });
      } else {
        await tx.rfpHotelBlock.create({ data: { ...data, rfpId: id, sortOrder: i, nights: { create: nights } } });
      }
    }
    await tx.rfp.update({ where: { id, eventId }, data: { updatedById: userId } });
  });
}

export async function saveRfpConcessionsCore(id: string, eventId: string, concessions: RfpConcessionArgs[], userId: string) {
  await authorizeRfp(id, eventId, "WRITE", userId);
  const rows = concessions
    .filter((c) => c.label.trim())
    .map((c, i) => ({ id: c.id ?? null, label: c.label.trim(), value: c.value?.trim() || null, required: c.required, sortOrder: i }));
  const existing = new Set((await prisma.rfpConcession.findMany({ where: { rfpId: id }, select: { id: true } })).map((c) => c.id));
  const kept = rows.flatMap((r) => (r.id && existing.has(r.id) ? [r.id] : []));
  await prisma.$transaction(async (tx) => {
    // A removed concession takes the hotels' answers to it along (cascade).
    await tx.rfpConcession.deleteMany({ where: { rfpId: id, id: { notIn: kept } } });
    for (const { id: concessionId, ...data } of rows) {
      if (concessionId && existing.has(concessionId)) await tx.rfpConcession.update({ where: { id: concessionId, rfpId: id }, data });
      else await tx.rfpConcession.create({ data: { ...data, rfpId: id } });
    }
    await tx.rfp.update({ where: { id, eventId }, data: { updatedById: userId } });
  });
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Replaces the RFP's function-space rows — only those of `kind` when given —
// updating kept ones in place by id. Rows copied from a function or catering
// order must point at this event's.
export async function saveRfpSpaceCore(id: string, eventId: string, rows: RfpSpaceArgs[], userId: string, kind?: RfpSpaceKind) {
  await authorizeRfp(id, eventId, "WRITE", userId);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { startDate: true, endDate: true } });
  const first = addDays(dateKey(event.startDate), -NIGHT_WINDOW_DAYS);
  const last = addDays(dateKey(event.endDate), NIGHT_WINDOW_DAYS);
  const functionIds = rows.flatMap((r) => (r.functionId ? [r.functionId] : []));
  const orderIds = rows.flatMap((r) => (r.cateringOrderId ? [r.cateringOrderId] : []));
  const [functions, orders] = await Promise.all([
    prisma.function.findMany({ where: { id: { in: functionIds }, eventId }, select: { id: true } }),
    prisma.cateringOrder.findMany({ where: { id: { in: orderIds }, eventId }, select: { id: true } }),
  ]);
  const ownFunctions = new Set(functions.map((f) => f.id));
  const ownOrders = new Set(orders.map((o) => o.id));
  const data = rows
    .filter((r) => r.name.trim())
    .map((r, i) => {
      if (r.kind !== "MEETING" && r.kind !== "FB") throw new Error(`Unknown space kind: ${r.kind}`);
      if (kind && r.kind !== kind) throw new Error(`${r.name}: expected a ${kind} row`);
      for (const d of [r.day, r.endDay]) if (d && (!DATE_RE.test(d) || d < first || d > last)) throw new Error(`${r.name}: day ${d} is too far from the event`);
      if (r.endDay && (!r.day || r.endDay < r.day)) throw new Error(`${r.name}: "through" must be on or after the day`);
      for (const t of [r.startTime, r.endTime]) if (t && !TIME_RE.test(t)) throw new Error(`${r.name}: time must be HH:MM`);
      for (const n of [r.attendance, r.areaSqFt]) if (n != null && (!Number.isInteger(n) || n < 0)) throw new Error(`${r.name}: numbers must be whole and not negative`);
      if (r.functionId && !ownFunctions.has(r.functionId)) throw new PermissionError("NOT_FOUND", "Function not found");
      if (r.cateringOrderId && !ownOrders.has(r.cateringOrderId)) throw new PermissionError("NOT_FOUND", "Catering order not found");
      return {
        id: r.id ?? null,
        kind: r.kind,
        functionId: r.functionId ?? null,
        cateringOrderId: r.cateringOrderId ?? null,
        day: r.day ? dateFromKey(r.day) : null,
        endDay: r.day && r.endDay && r.endDay > r.day ? dateFromKey(r.endDay) : null,
        startTime: r.startTime || null,
        endTime: r.endTime || null,
        functionType: r.functionType?.trim() || null,
        name: r.name.trim(),
        attendance: r.attendance,
        setup: r.setup?.trim() || null,
        areaSqFt: r.areaSqFt,
        av: r.av?.trim() || null,
        hold24: r.hold24,
        room: r.room?.trim() || null,
        sortOrder: i,
      };
    });
  const scope = { rfpId: id, ...(kind ? { kind } : {}) };
  const existing = new Set((await prisma.rfpSpaceRequest.findMany({ where: scope, select: { id: true } })).map((r) => r.id));
  const kept = data.flatMap((r) => (r.id && existing.has(r.id) ? [r.id] : []));
  await prisma.$transaction(async (tx) => {
    await tx.rfpSpaceRequest.deleteMany({ where: { ...scope, id: { notIn: kept } } });
    for (const { id: rowId, ...row } of data) {
      if (rowId && existing.has(rowId)) await tx.rfpSpaceRequest.update({ where: { id: rowId, rfpId: id }, data: row });
      else await tx.rfpSpaceRequest.create({ data: { ...row, rfpId: id } });
    }
    await tx.rfp.update({ where: { id, eventId }, data: { updatedById: userId } });
  });
}

// Files the rendered document on the RFP as a record of what went out,
// stamps the issue date, and moves a draft to ISSUED.
export async function issueRfpCore(id: string, eventId: string, file: { fileName: string; buffer: Buffer }, userId: string) {
  const { status } = await authorizeRfp(id, eventId, "WRITE", userId);
  await requirePermissionForUser(userId, "FILES", "WRITE", eventId);
  const storedName = `${randomUUID()}.docx`;
  mkdirSync(getUploadDir("rfp", id), { recursive: true });
  writeFileSync(getUploadPath("rfp", id, storedName), file.buffer);
  const today = dateFromKey(dateKey(new Date()));
  await prisma.$transaction([
    prisma.fileUpload.create({
      data: {
        fileName: file.fileName,
        storedName,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileSize: file.buffer.length,
        fileType: "RFP",
        rfpId: id,
      },
    }),
    prisma.rfp.update({ where: { id, eventId }, data: { issuedOn: today, status: status === "DRAFT" ? "ISSUED" : status, updatedById: userId } }),
  ]);
}

export type RfpRecipientArgs = { sentOn: string | null; declinedToBid: boolean; notes: string | null };

// Adds hotels (the tenant's venues) to an RFP; ones already on it are skipped.
export async function addRfpRecipientsCore(id: string, eventId: string, venueIds: string[], userId: string) {
  await authorizeRfp(id, eventId, "WRITE", userId);
  const tenantId = await requireEventTenantId(eventId);
  const ids = Array.from(new Set(venueIds));
  const venues = await prisma.venue.count({ where: { id: { in: ids }, tenantId } });
  if (venues !== ids.length) throw new PermissionError("NOT_FOUND", "Hotel not found");
  await prisma.rfpRecipient.createMany({ data: ids.map((venueId) => ({ rfpId: id, venueId })), skipDuplicates: true });
}

export async function updateRfpRecipientCore(recipientId: string, id: string, eventId: string, args: RfpRecipientArgs, userId: string) {
  await authorizeRfp(id, eventId, "WRITE", userId);
  if (args.sentOn && !DATE_RE.test(args.sentOn)) throw new Error(`Invalid date: ${args.sentOn}`);
  await prisma.rfpRecipient.update({
    where: { id: recipientId, rfpId: id, rfp: { eventId } },
    data: { sentOn: args.sentOn ? dateFromKey(args.sentOn) : null, declinedToBid: args.declinedToBid, notes: args.notes?.trim() || null },
  });
}

export async function removeRfpRecipientCore(recipientId: string, id: string, eventId: string, userId: string) {
  await authorizeRfp(id, eventId, "WRITE", userId);
  await prisma.rfpRecipient.delete({ where: { id: recipientId, rfpId: id, rfp: { eventId } } });
}

// Every proposal answering the RFP against what each block asked for
// (src/lib/rfp/compare.ts). Shared by the compare page and MCP.
export async function getRfpComparisonCore(id: string, eventId: string, userId: string) {
  await authorizeRfp(id, eventId, "VIEW", userId);
  const [rfp, event, proposals] = await Promise.all([
    prisma.rfp.findFirstOrThrow({
      where: { id, eventId },
      select: {
        title: true,
        amenities: true,
        concessions: { orderBy: { sortOrder: "asc" }, select: { id: true, label: true, value: true, required: true } },
        hotelBlocks: { orderBy: { sortOrder: "asc" }, select: { id: true, contractType: true, guestType: true, targetRate: true, nights: { select: { night: true, rooms: true } } } },
      },
    }),
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true } }),
    prisma.hotelProposal.findMany({
      where: { rfpId: id, eventId },
      select: {
        id: true,
        status: true,
        revision: true,
        rfpBlockId: true,
        allowedAttrition: true,
        guaranteedRevenue: true,
        amenities: true,
        venue: { select: { name: true } },
        block: { select: { id: true } },
        nights: { select: { night: true, rooms: true, rate: true } },
        charges: { select: { chargeType: true, amount: true, scope: true }, orderBy: { sortOrder: "asc" } },
        concessions: { select: { concessionId: true, offered: true, met: true } },
      },
    }),
  ]);
  return buildComparison({
    title: rfp.title,
    eventName: event.name,
    amenities: rfp.amenities,
    blocks: rfp.hotelBlocks,
    concessions: rfp.concessions,
    proposals: proposals.map((p) => ({ ...p, hotel: p.venue.name, hasBlock: p.block != null })),
  });
}
