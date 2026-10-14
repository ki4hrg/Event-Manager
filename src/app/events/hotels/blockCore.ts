// Pure cores for hotel blocks and their pickup. NOT a "use server" file — see
// src/app/contacts/core.ts for the rationale.
//
// A block is scoped to its event through its proposal. Block nights are
// edited in place by id (never deleted and re-created), and every change to
// pickup writes today's HotelPickupSnapshot so the PER can report pickup at
// N days out.

import type { HotelChargeScope, HotelPickupMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { dateFromKey, dateKey, nightKeys } from "@/lib/hotels";
import { getDateKeyInTimezone } from "@/lib/agendaUtils";
import { blockPickup, pickupByNight } from "@/lib/hotelPickup";

const inEvent = (eventId: string) => ({ proposal: { eventId } });

async function assertBlockInEvent(blockId: string, eventId: string) {
  const b = await prisma.hotelBlock.findFirst({ where: { id: blockId, ...inEvent(eventId) }, select: { id: true } });
  if (!b) throw new PermissionError("NOT_FOUND");
}

// Today in the event's timezone, as a DATE.
const eventToday = (timezone: string) => dateFromKey(getDateKeyInTimezone(new Date(), timezone));

// Today's pickup per night, replacing any snapshot already taken today.
export async function writePickupSnapshot(tx: Prisma.TransactionClient, blockId: string) {
  const block = await tx.hotelBlock.findUniqueOrThrow({
    where: { id: blockId },
    select: {
      proposal: { select: { event: { select: { timezone: true } } } },
      isRunOfHouse: true,
      nights: { select: { night: true, roomType: true, rooms: true, contractedRooms: true, otherReservations: true } },
      pickupGuests: { select: { checkIn: true, checkOut: true, roomType: true, cancelled: true } },
      pickupCounts: { select: { night: true, roomType: true, rooms: true } },
    },
  });
  const nights = pickupByNight(
    blockPickup({ isRunOfHouse: block.isRunOfHouse, nights: block.nights, guests: block.pickupGuests, counts: block.pickupCounts }),
  );
  const takenOn = eventToday(block.proposal.event.timezone);
  await tx.hotelPickupSnapshot.upsert({
    where: { blockId_takenOn: { blockId, takenOn } },
    create: { blockId, takenOn, nights },
    update: { nights },
  });
}

// ---------------------------------------------------------------------------
// Blocks

export async function createHotelBlockCore(proposalId: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  const tenantId = await requireEventTenantId(eventId);
  const proposal = await prisma.hotelProposal.findFirst({
    where: { id: proposalId, eventId },
    include: { nights: true, charges: true, block: { select: { id: true } } },
  });
  if (!proposal) throw new PermissionError("NOT_FOUND");
  if (proposal.block) throw new Error("This proposal already has a block");
  const status = await prisma.customOption.findFirst({
    where: { tenantId, category: "proposal_status", label: proposal.status },
    select: { group: true },
  });
  if (status?.group !== "ACCEPTED") throw new Error("Only an accepted proposal can become a block");
  const hasHq = await prisma.hotelBlock.count({ where: inEvent(eventId) });
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { timezone: true } });

  return prisma.$transaction(async (tx) => {
    const block = await tx.hotelBlock.create({
      data: {
        proposalId,
        isHq: hasHq === 0,
        checkIn: proposal.checkIn,
        checkOut: proposal.checkOut,
        isRunOfHouse: proposal.isRunOfHouse,
        allowedAttrition: proposal.allowedAttrition,
        guaranteedRevenue: proposal.guaranteedRevenue,
        contractedOn: eventToday(event.timezone),
        updatedById: userId,
        nights: {
          create: proposal.nights.map((n) => ({
            roomType: n.roomType,
            night: n.night,
            rate: n.rate,
            contractedRooms: n.rooms,
            rooms: n.rooms ?? 0,
          })),
        },
        charges: {
          create: proposal.charges.map((c) => ({ chargeType: c.chargeType, amount: c.amount, scope: c.scope, sortOrder: c.sortOrder })),
        },
      },
    });
    await writePickupSnapshot(tx, block.id);
    return block;
  });
}

export type BlockNightArgs = {
  id: string | null; // null = a new night
  roomType: string | null;
  night: string;
  rate: number | null;
  contractedRooms: number | null;
  rooms: number;
  otherReservations: number;
};

export type BlockWriteArgs = {
  isHq: boolean;
  checkIn: string | null;
  checkOut: string | null;
  reservationMethod: string | null;
  groupCode: string | null;
  bookingLink: string | null;
  bookingPhone: string | null;
  cutoffDate: string | null;
  contractedOn: string | null;
  cutoffExercised: boolean | null;
  isRunOfHouse: boolean;
  allowedAttrition: number | null;
  guaranteedRevenue: number | null;
  distanceMiles: number | null;
  driveMinutes: number | null;
  compRooms: number | null;
  staffRooms: number | null;
  notes: string | null;
  nights: BlockNightArgs[];
  charges: { chargeType: string; amount: number | null; scope: HotelChargeScope | null }[];
};

const day = (v: string | null) => (v ? dateFromKey(v) : null);

export async function updateHotelBlockCore(blockId: string, eventId: string, args: BlockWriteArgs, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  await assertBlockInEvent(blockId, eventId);
  if (args.checkIn && args.checkOut && args.checkOut <= args.checkIn) throw new Error("Check-out must be after check-in");
  if (args.allowedAttrition != null && (args.allowedAttrition < 0 || args.allowedAttrition > 100)) {
    throw new Error("Allowed attrition must be between 0 and 100");
  }
  const stay = new Set(nightKeys(args.checkIn, args.checkOut));
  for (const n of args.nights) {
    if (!stay.has(n.night)) throw new Error(`Night ${n.night} is outside the stay`);
    if (n.rooms < 0 || n.otherReservations < 0) throw new Error("Room numbers cannot be negative");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.hotelBlockNight.findMany({ where: { blockId }, select: { id: true } });
    const keep = new Set(args.nights.map((n) => n.id).filter((id): id is string => !!id));
    const unknown = Array.from(keep).filter((id) => !existing.some((e) => e.id === id));
    if (unknown.length) throw new PermissionError("NOT_FOUND", "Block night not found");
    await tx.hotelBlockNight.deleteMany({ where: { blockId, id: { notIn: Array.from(keep) } } });
    for (const n of args.nights) {
      const data = {
        roomType: args.isRunOfHouse ? null : n.roomType,
        night: dateFromKey(n.night),
        rate: n.rate,
        contractedRooms: n.contractedRooms,
        rooms: n.rooms,
        otherReservations: n.otherReservations,
      };
      if (n.id) await tx.hotelBlockNight.update({ where: { id: n.id, blockId }, data });
      else await tx.hotelBlockNight.create({ data: { ...data, blockId } });
    }
    await tx.hotelCharge.deleteMany({ where: { blockId } });
    const block = await tx.hotelBlock.update({
      where: { id: blockId },
      data: {
        isHq: args.isHq,
        checkIn: day(args.checkIn),
        checkOut: day(args.checkOut),
        reservationMethod: args.reservationMethod,
        groupCode: args.groupCode,
        bookingLink: args.bookingLink,
        bookingPhone: args.bookingPhone,
        cutoffDate: day(args.cutoffDate),
        contractedOn: day(args.contractedOn),
        cutoffExercised: args.cutoffExercised,
        isRunOfHouse: args.isRunOfHouse,
        allowedAttrition: args.allowedAttrition,
        guaranteedRevenue: args.guaranteedRevenue,
        distanceMiles: args.distanceMiles,
        driveMinutes: args.driveMinutes,
        compRooms: args.compRooms,
        staffRooms: args.staffRooms,
        notes: args.notes,
        updatedById: userId,
        charges: {
          create: args.charges
            .filter((c) => c.chargeType.trim())
            .map((c, i) => ({ chargeType: c.chargeType.trim(), amount: c.amount, scope: c.scope, sortOrder: i })),
        },
      },
    });
    // One HQ hotel per event.
    if (args.isHq) {
      await tx.hotelBlock.updateMany({ where: { ...inEvent(eventId), id: { not: blockId } }, data: { isHq: false } });
    }
    await writePickupSnapshot(tx, blockId);
    return block;
  });
}

export async function deleteHotelBlockCore(blockId: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "DELETE", eventId);
  await assertBlockInEvent(blockId, eventId);
  await prisma.hotelBlock.delete({ where: { id: blockId } });
}

// ---------------------------------------------------------------------------
// Pickup

export type PickupGuestArgs = {
  guestName: string | null;
  confirmationNumber: string | null;
  checkIn: string | null;
  checkOut: string | null;
  roomType: string | null;
  cancelled: boolean;
  rawStatus: string | null;
};

// append adds every row; merge updates rows whose confirmation number the
// block already has and adds the rest; replace drops the block's guests first.
export async function importPickupGuestsCore(
  blockId: string,
  eventId: string,
  args: { method: Exclude<HotelPickupMethod, "COUNTS">; fileName: string | null; guests: PickupGuestArgs[] },
  userId: string,
) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  await assertBlockInEvent(blockId, eventId);
  if (args.guests.length === 0) throw new Error("No guest rows to import");
  for (const g of args.guests) {
    if (g.checkIn && g.checkOut && g.checkOut <= g.checkIn) {
      throw new Error(`${g.guestName ?? g.confirmationNumber ?? "A guest"}: check-out must be after check-in`);
    }
  }
  const row = (g: PickupGuestArgs) => ({
    guestName: g.guestName,
    confirmationNumber: g.confirmationNumber,
    checkIn: day(g.checkIn),
    checkOut: day(g.checkOut),
    roomType: g.roomType,
    cancelled: g.cancelled,
    rawStatus: g.rawStatus,
  });

  return prisma.$transaction(async (tx) => {
    if (args.method === "REPLACE") await tx.hotelPickupGuest.deleteMany({ where: { blockId } });
    const existing = new Map<string, string>();
    if (args.method === "MERGE") {
      const confirmations = args.guests.map((g) => g.confirmationNumber).filter((c): c is string => !!c);
      const rows = await tx.hotelPickupGuest.findMany({
        where: { blockId, confirmationNumber: { in: confirmations } },
        select: { id: true, confirmationNumber: true },
      });
      for (const r of rows) if (r.confirmationNumber) existing.set(r.confirmationNumber, r.id);
    }
    const toUpdate = args.guests.filter((g) => g.confirmationNumber && existing.has(g.confirmationNumber));
    const toInsert = args.guests.filter((g) => !(g.confirmationNumber && existing.has(g.confirmationNumber)));
    const imp = await tx.hotelPickupImport.create({
      data: {
        blockId,
        method: args.method,
        fileName: args.fileName,
        inserted: toInsert.length,
        updated: toUpdate.length,
        importedById: userId,
      },
    });
    if (toInsert.length) {
      await tx.hotelPickupGuest.createMany({ data: toInsert.map((g) => ({ ...row(g), blockId, importId: imp.id })) });
    }
    for (const g of toUpdate) {
      await tx.hotelPickupGuest.update({ where: { id: existing.get(g.confirmationNumber!)! }, data: { ...row(g), importId: imp.id } });
    }
    await writePickupSnapshot(tx, blockId);
    return imp;
  });
}

export type PickupCountArgs = { night: string; roomType: string | null; rooms: number };

// Replaces the block's entered counts.
export async function savePickupCountsCore(blockId: string, eventId: string, counts: PickupCountArgs[], userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  await assertBlockInEvent(blockId, eventId);
  const rows = counts.filter((c) => c.rooms > 0);
  if (rows.some((c) => !Number.isInteger(c.rooms))) throw new Error("Counts must be whole numbers");
  return prisma.$transaction(async (tx) => {
    await tx.hotelPickupCount.deleteMany({ where: { blockId } });
    await tx.hotelPickupCount.createMany({
      data: rows.map((c) => ({ blockId, night: dateFromKey(c.night), roomType: c.roomType, rooms: c.rooms })),
    });
    await tx.hotelPickupImport.create({ data: { blockId, method: "COUNTS", inserted: rows.length, importedById: userId } });
    await writePickupSnapshot(tx, blockId);
  });
}

// Removes every guest and count (history stays).
export async function clearPickupCore(blockId: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "DELETE", eventId);
  await assertBlockInEvent(blockId, eventId);
  await prisma.$transaction(async (tx) => {
    await tx.hotelPickupGuest.deleteMany({ where: { blockId } });
    await tx.hotelPickupCount.deleteMany({ where: { blockId } });
    await writePickupSnapshot(tx, blockId);
  });
}

// Plain (client-serializable) values for BlockForm.
export function toBlockValues(b: Prisma.HotelBlockGetPayload<{ include: { nights: true; charges: true } }>) {
  const dec = (v: Prisma.Decimal | null) => (v == null ? null : v.toString());
  const d = (v: Date | null) => (v ? dateKey(v) : null);
  return {
    isHq: b.isHq,
    checkIn: d(b.checkIn),
    checkOut: d(b.checkOut),
    reservationMethod: b.reservationMethod,
    groupCode: b.groupCode,
    bookingLink: b.bookingLink,
    bookingPhone: b.bookingPhone,
    cutoffDate: d(b.cutoffDate),
    contractedOn: d(b.contractedOn),
    cutoffExercised: b.cutoffExercised,
    isRunOfHouse: b.isRunOfHouse,
    allowedAttrition: dec(b.allowedAttrition),
    guaranteedRevenue: dec(b.guaranteedRevenue),
    distanceMiles: dec(b.distanceMiles),
    driveMinutes: b.driveMinutes,
    compRooms: b.compRooms,
    staffRooms: b.staffRooms,
    notes: b.notes,
    nights: b.nights.map((n) => ({
      id: n.id,
      roomType: n.roomType,
      night: dateKey(n.night),
      rate: dec(n.rate),
      contractedRooms: n.contractedRooms,
      rooms: n.rooms,
      otherReservations: n.otherReservations,
    })),
    charges: b.charges.map((c) => ({ chargeType: c.chargeType, amount: dec(c.amount), scope: c.scope })),
  };
}
