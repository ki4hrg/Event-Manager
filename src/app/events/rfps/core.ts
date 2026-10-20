// Pure cores for RFPs. NOT a "use server" file — see src/app/contacts/core.ts
// for the rationale.
//
// An RFP is event-scoped: every lookup carries eventId, children go through
// { rfp: { eventId } }. The permission resource follows the kind
// (resourceForKind). Requested blocks are updated in place by id (proposals
// link to them); concessions are replaced whole on save.

import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import type { HotelBlockType, RfpKind, RfpStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser, type PermissionAction } from "@/lib/permissions";
import { dateFromKey, dateKey } from "@/lib/hotels";
import { resourceForKind } from "@/lib/rfp/kinds";
import { parseSections } from "@/lib/rfp/sections";
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
  showRoomNames: boolean;
  excludedFunctionTypes: string[];
};

export type RfpBlockArgs = {
  id?: string | null; // an existing block keeps its id (and its proposals' links)
  blockType: HotelBlockType;
  isRunOfHouse: boolean;
  targetRate: number | null;
  notes: string | null;
  nights: { roomType: string | null; night: string; rooms: number }[];
};

export type RfpConcessionArgs = { label: string; value: string | null; required: boolean };

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

async function validate(eventId: string, kind: RfpKind, args: RfpWriteArgs) {
  if (!args.title.trim()) throw new Error("Title is required");
  for (const d of [args.responseDue, args.decisionBy]) if (d && !DATE_RE.test(d)) throw new Error(`Invalid date: ${d}`);
  if (args.contactId) {
    const tenantId = await requireEventTenantId(eventId);
    const contact = await prisma.contact.findFirst({ where: { id: args.contactId, tenantId }, select: { id: true } });
    if (!contact) throw new PermissionError("NOT_FOUND", "Contact not found");
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
    showRoomNames: args.showRoomNames,
    excludedFunctionTypes: Array.from(new Set(args.excludedFunctionTypes.filter(Boolean))),
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
  return prisma.rfp.update({ where: { id, eventId }, data: { ...data, updatedById: userId } });
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
      .filter((n) => n.rooms > 0)
      .map((n) => {
        if (!DATE_RE.test(n.night) || n.night < first || n.night > last) throw new Error(`Night ${n.night} is too far from the event`);
        if (!Number.isInteger(n.rooms)) throw new Error("Rooms must be whole numbers");
        const roomType = b.isRunOfHouse ? null : n.roomType || null;
        const key = `${roomType ?? ""}|${n.night}`;
        if (seen.has(key)) throw new Error(`Night ${n.night} is listed twice`);
        seen.add(key);
        return { roomType, night: dateFromKey(n.night), rooms: n.rooms };
      });
    return { id: b.id ?? null, blockType: b.blockType, isRunOfHouse: b.isRunOfHouse, targetRate: b.targetRate, notes: b.notes?.trim() || null, nights };
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
    .map((c, i) => ({ label: c.label.trim(), value: c.value?.trim() || null, required: c.required, sortOrder: i }));
  await prisma.$transaction(async (tx) => {
    await tx.rfpConcession.deleteMany({ where: { rfpId: id, rfp: { eventId } } });
    await tx.rfpConcession.createMany({ data: rows.map((r) => ({ ...r, rfpId: id })) });
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
