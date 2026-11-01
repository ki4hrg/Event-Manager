// Pure cores for hotel blocks and their pickup. NOT a "use server" file — see
// src/app/contacts/core.ts for the rationale.
//
// A block is scoped to its event through its proposal. Block nights are
// edited in place by id (never deleted and re-created), and every change to
// pickup writes today's HotelPickupSnapshot so the PER can report pickup at
// N days out.

import { HotelPickupMethod, type HotelAttritionBasis, type HotelChargeScope, type Prisma } from "@prisma/client";
import { z } from "zod";
import { dateKeySchema, idSchema, looseCount, looseText, nullableNumber, text, assertIds } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { MAX_STAY_NIGHTS, addDays, dateFromKey, dateKey, isAttritionBasis, labelKey, nightKeys } from "@/lib/hotels";
import { closeAwardedRfp } from "./core";
import { getDateKeyInTimezone } from "@/lib/agendaUtils";
import { blockPickup, pickupByNight } from "@/lib/hotelPickup";
import { UserFacingError } from "@/lib/userErrors";
import { reconcileGuests } from "@/lib/hotelReconcile";

const inEvent = (eventId: string) => ({ proposal: { eventId } });

async function assertBlockInEvent(blockId: string, eventId: string) {
  assertIds(blockId);
  const b = await prisma.hotelBlock.findFirst({ where: { id: blockId, ...inEvent(eventId) }, select: { id: true } });
  if (!b) throw new PermissionError("NOT_FOUND");
}

// A block's contract and guest types are the tenant's labels; ones the block
// already holds (`held`) may stay.
async function assertBlockLabels(eventId: string, args: { contractType: string | null; guestType: string | null }, held: (string | null)[]) {
  const wanted = [
    { category: "hotel_contract_type", label: args.contractType, noun: "contract type" },
    { category: "hotel_guest_type", label: args.guestType, noun: "guest type" },
  ].filter((w) => w.label && !held.includes(w.label));
  if (wanted.length === 0) return;
  const tenantId = await requireEventTenantId(eventId);
  for (const w of wanted) {
    const found = await prisma.customOption.findFirst({ where: { tenantId, category: w.category, label: w.label! }, select: { id: true } });
    if (!found) throw new Error(`Unknown ${w.noun}: ${w.label}`);
  }
}

// Today in the event's timezone, as a DATE.
const eventToday = (timezone: string) => dateFromKey(getDateKeyInTimezone(new Date(), timezone));

// Today's pickup per night, replacing any snapshot already taken today.
export async function writePickupSnapshot(tx: Prisma.TransactionClient, blockId: string) {
  const block = await tx.hotelBlock.findUniqueOrThrow({
    where: { id: blockId },
    select: {
      proposal: { select: { event: { select: { timezone: true } } } },
      nights: { select: { night: true, roomType: true, rooms: true, contractedRooms: true, otherReservations: true } },
      pickupGuests: { select: { checkIn: true, checkOut: true, roomType: true, cancelled: true } },
      pickupCounts: { select: { night: true, roomType: true, rooms: true } },
    },
  });
  const nights = pickupByNight(
    blockPickup({ nights: block.nights, guests: block.pickupGuests, counts: block.pickupCounts }),
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

// One accepted proposal can become several blocks (attendees and staff from
// one offer): each starts from the proposal's stay, terms, charges and room
// grid, with its own guest type (the proposal's unless given).
export async function createHotelBlockCore(proposalId: string, eventId: string, userId: string, opts: { guestType?: string | null } = {}) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  const tenantId = await requireEventTenantId(eventId);
  const proposal = await prisma.hotelProposal.findFirst({
    where: { id: proposalId, eventId },
    include: { nights: true, charges: true },
  });
  if (!proposal) throw new PermissionError("NOT_FOUND");
  const guestType = opts.guestType !== undefined ? opts.guestType || null : proposal.guestType;
  await assertBlockLabels(eventId, { contractType: proposal.contractType, guestType }, [proposal.contractType, proposal.guestType]);
  const status = await prisma.customOption.findFirst({
    where: { tenantId, category: "proposal_status", label: proposal.status },
    select: { group: true },
  });
  if (status?.group !== "ACCEPTED") throw new Error("Only an accepted proposal can become a block");
  const hasHq = await prisma.hotelBlock.count({ where: inEvent(eventId) });
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { timezone: true } });

  const created = await prisma.$transaction(async (tx) => {
    const block = await tx.hotelBlock.create({
      data: {
        proposalId,
        contractType: proposal.contractType,
        guestType,
        isHq: hasHq === 0,
        checkIn: proposal.checkIn,
        checkOut: proposal.checkOut,
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
        // Guest charges only: a block is what guests book (meeting space
        // stays on the proposal).
        charges: {
          create: proposal.charges
            .filter((c) => c.kind === "GUEST")
            .map((c) => ({ chargeType: c.chargeType, amount: c.amount, scope: c.scope, sortOrder: c.sortOrder })),
        },
      },
    });
    await writePickupSnapshot(tx, block.id);
    return block;
  });
  // A proposal accepted before RFPs closed on acceptance still closes its RFP.
  await closeAwardedRfp(proposal.rfpId, eventId, userId);
  return created;
}

// One night of a block's grid as the block form posts it (JSON in "nights").
// No lower bound: the autosaving block form posts what was typed.
const roomCount = z.number().int().max(100_000);
export const BlockNightSchema = z.object({
  id: idSchema.nullable(), // null = a new night
  roomType: text(200).nullable(),
  night: dateKeySchema,
  rate: nullableNumber,
  contractedRooms: roomCount.nullable(),
  rooms: roomCount,
  otherReservations: roomCount,
});
export type BlockNightArgs = z.infer<typeof BlockNightSchema>;

export type BlockWriteArgs = {
  contractType: string | null; // hotel_contract_type option label
  guestType: string | null; // hotel_guest_type option label
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
  allowedAttrition: number | null;
  guaranteedRevenue: number | null;
  distanceMiles: number | null;
  driveMinutes: number | null;
  compRooms: number | null;
  attritionBasis: HotelAttritionBasis | null;
  compRatio: number | null; // one comp per this many room nights
  staffRooms: number | null;
  notes: string | null;
  nights: BlockNightArgs[];
  charges: { chargeType: string; amount: number | null; scope: HotelChargeScope | null }[];
};

const day = (v: string | null) => (v ? dateFromKey(v) : null);

export async function updateHotelBlockCore(blockId: string, eventId: string, args: BlockWriteArgs, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  await assertBlockInEvent(blockId, eventId);
  const held = await prisma.hotelBlock.findUniqueOrThrow({ where: { id: blockId }, select: { contractType: true, guestType: true } });
  await assertBlockLabels(eventId, args, [held.contractType, held.guestType]);
  if (args.checkIn && args.checkOut && args.checkOut <= args.checkIn) throw new Error("Check-out must be after check-in");
  if (args.allowedAttrition != null && (args.allowedAttrition < 0 || args.allowedAttrition > 100)) {
    throw new Error("Allowed attrition must be between 0 and 100");
  }
  if (args.attritionBasis != null && !isAttritionBasis(args.attritionBasis)) throw new Error(`Unknown attrition basis: ${args.attritionBasis}`);
  if (args.compRatio != null && (!Number.isInteger(args.compRatio) || args.compRatio < 1)) throw new Error("Comp ratio must be a whole number of room nights");
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
        roomType: n.roomType,
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
        contractType: args.contractType,
        guestType: args.guestType,
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
        allowedAttrition: args.allowedAttrition,
        guaranteedRevenue: args.guaranteedRevenue,
        distanceMiles: args.distanceMiles,
        driveMinutes: args.driveMinutes,
        compRooms: args.compRooms,
        attritionBasis: args.attritionBasis,
        compRatio: args.compRatio,
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
  bookedOn?: string | null; // YYYY-MM-DD; reports often omit it
  cancelledOn?: string | null;
};

const guestFields = {
  guestName: looseText(500),
  confirmationNumber: looseText(200),
  checkIn: looseText(10),
  checkOut: looseText(10),
  roomType: looseText(500),
  cancelled: z.boolean(),
};
// A guest row from an imported report (pickup page or inbox).
export const PickupGuestSchema = z.object({
  ...guestFields,
  rawStatus: looseText(500),
  bookedOn: looseText(10),
  cancelledOn: looseText(10),
}) satisfies z.ZodType<PickupGuestArgs>;
export const PickupGuestListSchema = z.array(PickupGuestSchema).max(20_000);

function checkGuestDates(g: Pick<PickupGuestArgs, "guestName" | "confirmationNumber" | "checkIn" | "checkOut" | "bookedOn" | "cancelledOn">) {
  const who = g.guestName ?? g.confirmationNumber ?? "A guest";
  if (g.checkIn && g.checkOut && g.checkOut <= g.checkIn) throw new UserFacingError(`${who}: check-out must be after check-in`);
  // The pickup math (nightKeys) refuses longer stays.
  if (g.checkIn && g.checkOut && g.checkOut > addDays(g.checkIn, MAX_STAY_NIGHTS)) {
    throw new UserFacingError(`${who}: stay is longer than ${MAX_STAY_NIGHTS} nights`);
  }
  if (g.bookedOn && g.cancelledOn && g.cancelledOn < g.bookedOn) throw new UserFacingError(`${who}: cancelled before it was booked`);
}

// The block's first night and today, both in the event's timezone. Dates are
// only estimated (from the import day) before the block starts, so loading
// an old report for a past event never invents them.
async function estimateDay(tx: Prisma.TransactionClient, blockId: string): Promise<string | null> {
  const b = await tx.hotelBlock.findUniqueOrThrow({
    where: { id: blockId },
    select: {
      checkIn: true,
      nights: { select: { night: true }, orderBy: { night: "asc" }, take: 1 },
      proposal: { select: { event: { select: { timezone: true } } } },
    },
  });
  const first = b.checkIn ?? b.nights[0]?.night ?? null;
  const today = getDateKeyInTimezone(new Date(), b.proposal.event.timezone);
  return first && today < dateKey(first) ? today : null;
}

type PriorGuest = { cancelled: boolean; bookedOn: Date | null; cancelledOn: Date | null };

// A guest as stored. Dates the args omit keep the prior row's. With an
// estimate day (estimateDay), a guest newly cancelled without a date was
// cancelled by then, and — when `datesNew` — a guest with no prior row and
// no booking date was booked by then.
function guestRow(g: PickupGuestArgs, was: PriorGuest | undefined, estimate: string | null, datesNew: boolean) {
  const bookedOn = day(g.bookedOn ?? null) ?? was?.bookedOn ?? (estimate && datesNew && !was ? dateFromKey(estimate) : null);
  const cancelledOn = !g.cancelled
    ? null
    : (day(g.cancelledOn ?? null) ?? was?.cancelledOn ?? (estimate && was && !was.cancelled ? dateFromKey(estimate) : null));
  return {
    guestName: g.guestName,
    confirmationNumber: g.confirmationNumber,
    checkIn: day(g.checkIn),
    checkOut: day(g.checkOut),
    roomType: g.roomType,
    cancelled: g.cancelled,
    rawStatus: g.rawStatus,
    bookedOn,
    cancelledOn,
  };
}

// A typed room type as the block or the tenant's hotel_room_type list spells
// it (matched by labelKey, as the import wizard matches a report's values);
// an unknown one is kept as typed.
async function canonicalRoomType(blockId: string, eventId: string, roomType: string | null): Promise<string | null> {
  const typed = roomType?.trim();
  if (!typed) return null;
  const tenantId = await requireEventTenantId(eventId);
  const [nights, options] = await Promise.all([
    prisma.hotelBlockNight.findMany({ where: { blockId, roomType: { not: null } }, select: { roomType: true }, distinct: ["roomType"] }),
    prisma.customOption.findMany({ where: { tenantId, category: "hotel_room_type" }, select: { label: true } }),
  ]);
  const key = labelKey(typed);
  const known = [...nights.flatMap((n) => (n.roomType ? [n.roomType] : [])), ...options.map((o) => o.label)];
  return known.find((t) => labelKey(t) === key) ?? typed;
}

// append adds every row; merge updates rows whose confirmation number the
// block already has and adds the rest; replace drops the block's guests first.
//
// Booking and cancel dates are kept when a later report omits them. In a
// merge into a block that hasn't started, a guest new since the last import
// with no booking date gets the import day, and a guest newly cancelled with
// no cancel date gets the import day: each happened by then.
export async function importPickupGuestsCore(
  blockId: string,
  eventId: string,
  args: { method: Exclude<HotelPickupMethod, "COUNTS">; fileName: string | null; guests: PickupGuestArgs[] },
  userId: string,
) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  await assertBlockInEvent(blockId, eventId);
  if (args.guests.length === 0) throw new UserFacingError("No guest rows to import");
  args.guests.forEach(checkGuestDates);

  return prisma.$transaction(async (tx) => {
    const estimate = args.method === "MERGE" ? await estimateDay(tx, blockId) : null;
    const hadGuests = (await tx.hotelPickupGuest.count({ where: { blockId } })) > 0;
    if (args.method === "REPLACE") await tx.hotelPickupGuest.deleteMany({ where: { blockId } });
    type Existing = { id: string; cancelled: boolean; bookedOn: Date | null; cancelledOn: Date | null };
    const existing = new Map<string, Existing>();
    if (args.method === "MERGE") {
      const confirmations = args.guests.map((g) => g.confirmationNumber).filter((c): c is string => !!c);
      const rows = await tx.hotelPickupGuest.findMany({
        where: { blockId, confirmationNumber: { in: confirmations } },
        select: { id: true, confirmationNumber: true, cancelled: true, bookedOn: true, cancelledOn: true },
      });
      for (const r of rows) if (r.confirmationNumber) existing.set(r.confirmationNumber, r);
    }
    const prior = (g: PickupGuestArgs) => (g.confirmationNumber ? existing.get(g.confirmationNumber) : undefined);
    const toUpdate = args.guests.filter((g) => prior(g));
    const toInsert = args.guests.filter((g) => !prior(g));

    const row = (g: PickupGuestArgs) => guestRow(g, prior(g), estimate, hadGuests);

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
      await tx.hotelPickupGuest.update({ where: { id: prior(g)!.id }, data: { ...row(g), importId: imp.id } });
    }
    await writePickupSnapshot(tx, blockId);
    return imp;
  });
}

// One guest added by hand. Check-in and check-out are required (the import
// skips rows without them). Like a guest new in a merge, one added before the
// block starts with no booking date was booked today.
export async function createPickupGuestCore(blockId: string, eventId: string, args: PickupGuestArgs, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  await assertBlockInEvent(blockId, eventId);
  if (!args.checkIn || !args.checkOut) throw new UserFacingError("Check-in and check-out are required");
  const g: PickupGuestArgs = {
    ...args,
    roomType: await canonicalRoomType(blockId, eventId, args.roomType),
    cancelled: args.cancelled || !!args.cancelledOn,
  };
  checkGuestDates(g);
  return prisma.$transaction(async (tx) => {
    const estimate = await estimateDay(tx, blockId);
    const created = await tx.hotelPickupGuest.create({ data: { ...guestRow(g, undefined, estimate, true), blockId } });
    await writePickupSnapshot(tx, blockId);
    return created;
  });
}

// Partial update of one guest; omitted keys are unchanged. Un-cancelling
// clears the cancel date; cancelling with no cancel date, before the block
// starts, dates it today (as a merge does).
export async function updatePickupGuestCore(
  guestId: string,
  eventId: string,
  args: Partial<PickupGuestArgs>,
  userId: string,
) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  const guest = await prisma.hotelPickupGuest.findFirst({ where: { id: guestId, block: inEvent(eventId) } });
  if (!guest) throw new PermissionError("NOT_FOUND", "Guest not found");
  const key = (d: Date | null) => (d ? dateKey(d) : null);
  const next = {
    guestName: args.guestName !== undefined ? args.guestName : guest.guestName,
    confirmationNumber: args.confirmationNumber !== undefined ? args.confirmationNumber : guest.confirmationNumber,
    checkIn: args.checkIn !== undefined ? args.checkIn : key(guest.checkIn),
    checkOut: args.checkOut !== undefined ? args.checkOut : key(guest.checkOut),
    roomType: args.roomType !== undefined ? await canonicalRoomType(guest.blockId, eventId, args.roomType) : guest.roomType,
    cancelled: args.cancelled !== undefined ? args.cancelled : guest.cancelled,
    rawStatus: args.rawStatus !== undefined ? args.rawStatus : guest.rawStatus,
    bookedOn: args.bookedOn !== undefined ? args.bookedOn : key(guest.bookedOn),
    cancelledOn: args.cancelledOn !== undefined ? args.cancelledOn : key(guest.cancelledOn),
  };
  if (!next.cancelled) next.cancelledOn = null;
  checkGuestDates(next);
  return prisma.$transaction(async (tx) => {
    if (next.cancelled && !guest.cancelled && !next.cancelledOn) next.cancelledOn = await estimateDay(tx, guest.blockId);
    const updated = await tx.hotelPickupGuest.update({
      where: { id: guestId },
      data: {
        ...next,
        checkIn: day(next.checkIn),
        checkOut: day(next.checkOut),
        bookedOn: day(next.bookedOn),
        cancelledOn: day(next.cancelledOn),
      },
    });
    await writePickupSnapshot(tx, guest.blockId);
    return updated;
  });
}

export type PickupCountArgs = { night: string; roomType: string | null; rooms: number };

// The pickup page and the inbox pass these lists as action arguments (React's
// encoding, so NaN can arrive: a non-finite count reads as 0, which the core
// drops as before).
export const PickupCountSchema = z.object({
  night: z.string().max(10),
  roomType: looseText(500),
  rooms: looseCount,
}) satisfies z.ZodType<PickupCountArgs>;
export const PickupMethodSchema = z.enum(HotelPickupMethod).exclude(["COUNTS"]);
export const PickupCountListSchema = z.array(PickupCountSchema).max(20_000);
/** The name of the file a guest list was imported from. */
export const ImportFileNameSchema = z.string().max(1_000).nullable();


// Replaces the block's entered counts.
export async function savePickupCountsCore(blockId: string, eventId: string, counts: PickupCountArgs[], userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  await assertBlockInEvent(blockId, eventId);
  const rows = counts.filter((c) => c.rooms > 0);
  if (rows.some((c) => !Number.isInteger(c.rooms))) throw new UserFacingError("Counts must be whole numbers");
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
// ---------------------------------------------------------------------------
// Final review

// A stay on the hotel's final list. Cancelled rows (a status mapped as
// cancelled) aren't stays and are dropped.
export type FinalGuestArgs = Pick<PickupGuestArgs, "guestName" | "confirmationNumber" | "checkIn" | "checkOut" | "roomType" | "cancelled">;
export const FinalGuestSchema = z.object(guestFields) satisfies z.ZodType<FinalGuestArgs>;
export const FinalGuestListSchema = z.array(FinalGuestSchema).max(20_000);

// Loads the hotel's final (actualized) guest list, replacing any earlier one.
export async function importFinalGuestListCore(blockId: string, eventId: string, args: { fileName: string | null; guests: FinalGuestArgs[] }, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  await assertBlockInEvent(blockId, eventId);
  const stays = args.guests.filter((g) => !g.cancelled);
  if (stays.length === 0) throw new UserFacingError("No stays to load");
  stays.forEach(checkGuestDates);
  await prisma.$transaction(async (tx) => {
    await tx.hotelFinalGuest.deleteMany({ where: { blockId } });
    await tx.hotelFinalGuest.createMany({
      data: stays.map((g) => ({
        blockId,
        guestName: g.guestName,
        confirmationNumber: g.confirmationNumber,
        checkIn: day(g.checkIn),
        checkOut: day(g.checkOut),
        roomType: g.roomType,
      })),
    });
    await tx.hotelBlock.update({ where: { id: blockId }, data: { finalListFileName: args.fileName, finalListLoadedAt: new Date(), updatedById: userId } });
  });
  return { loaded: stays.length };
}

export async function clearFinalGuestListCore(blockId: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  await assertBlockInEvent(blockId, eventId);
  await prisma.$transaction([
    prisma.hotelFinalGuest.deleteMany({ where: { blockId } }),
    prisma.hotelBlock.update({ where: { id: blockId }, data: { finalListFileName: null, finalListLoadedAt: null, updatedById: userId } }),
  ]);
}

// The sign-off: reviewedOn null reopens the review.
export async function saveBlockReviewCore(blockId: string, eventId: string, args: { reviewedOn: string | null; reviewNotes: string | null }, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  await assertBlockInEvent(blockId, eventId);
  if (args.reviewedOn && !/^\d{4}-\d{2}-\d{2}$/.test(args.reviewedOn)) throw new Error(`Invalid date: ${args.reviewedOn}`);
  return prisma.hotelBlock.update({
    where: { id: blockId },
    data: {
      reviewedOn: day(args.reviewedOn),
      reviewedById: args.reviewedOn ? userId : null,
      reviewNotes: args.reviewNotes?.trim() || null,
      updatedById: userId,
    },
    select: { id: true, reviewedOn: true, reviewNotes: true },
  });
}

// Our guest list against the hotel's final list (src/lib/hotelReconcile.ts).
export async function getBlockReviewCore(blockId: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "VIEW", eventId);
  const block = await prisma.hotelBlock.findFirst({
    where: { id: blockId, ...inEvent(eventId) },
    select: {
      id: true,
      checkIn: true,
      checkOut: true,
      contractType: true,
      guestType: true,
      finalListFileName: true,
      finalListLoadedAt: true,
      reviewedOn: true,
      reviewNotes: true,
      reviewedBy: { select: { name: true, email: true } },
      proposal: { select: { id: true, venue: { select: { id: true, name: true } } } },
      pickupGuests: { select: { id: true, guestName: true, confirmationNumber: true, checkIn: true, checkOut: true, roomType: true, cancelled: true } },
      finalGuests: { select: { id: true, guestName: true, confirmationNumber: true, checkIn: true, checkOut: true, roomType: true } },
    },
  });
  if (!block) return null;
  const { pickupGuests, finalGuests, ...rest } = block;
  return {
    ...rest,
    guestCount: pickupGuests.filter((g) => !g.cancelled).length,
    finalCount: finalGuests.length,
    reconciliation: finalGuests.length ? reconcileGuests(pickupGuests, finalGuests) : null,
  };
}

export function toBlockValues(b: Prisma.HotelBlockGetPayload<{ include: { nights: true; charges: true } }>) {
  const dec = (v: Prisma.Decimal | null) => (v == null ? null : v.toString());
  const d = (v: Date | null) => (v ? dateKey(v) : null);
  return {
    contractType: b.contractType,
    guestType: b.guestType,
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
    allowedAttrition: dec(b.allowedAttrition),
    guaranteedRevenue: dec(b.guaranteedRevenue),
    distanceMiles: dec(b.distanceMiles),
    driveMinutes: b.driveMinutes,
    compRooms: b.compRooms,
    attritionBasis: b.attritionBasis,
    compRatio: b.compRatio,
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
