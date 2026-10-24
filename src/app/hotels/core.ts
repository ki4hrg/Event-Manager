// Pure cores for the cross-event Hotels pages. NOT a "use server" file — see
// src/app/contacts/core.ts for the rationale.

import { PermissionResource, type HotelContractType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadPermissionsForUser, requirePermissionForUser } from "@/lib/permissions";
import { dateKey } from "@/lib/hotels";
import { blockPickup } from "@/lib/hotelPickup";

// Events whose hotels this user may see across the tenant: every event with
// HOTELS on unassigned events, otherwise only events they staff (mirrors
// eventScopeWhere for EVENTS). The caller has checked HOTELS VIEW.
export async function hotelEventWhere(userId: string, tenantId: string): Promise<Prisma.EventWhereInput> {
  const { permissions } = await loadPermissionsForUser(userId, tenantId);
  const unassigned = permissions.find((p) => p.resource === PermissionResource.HOTELS && p.scope === "UNASSIGNED");
  return unassigned && unassigned.level !== "NONE" ? { tenantId } : { tenantId, staff: { some: { userId } } };
}

export const blockPickupSelect = {
  id: true,
  isHq: true,
  cutoffDate: true,
  allowedAttrition: true,
  nights: { select: { night: true, roomType: true, rooms: true, contractedRooms: true, otherReservations: true } },
  pickupGuests: { select: { checkIn: true, checkOut: true, roomType: true, cancelled: true } },
  pickupCounts: { select: { night: true, roomType: true, rooms: true } },
  proposal: { select: { contractType: true, guestType: true, venue: { select: { id: true, name: true } } } },
} satisfies Prisma.HotelBlockSelect;

export type BlockForTotals = Prisma.HotelBlockGetPayload<{ select: typeof blockPickupSelect }>;

export type PatternFilters = { seriesId?: string; city?: string; contractTypes: HotelContractType[]; guestTypes: string[]; from?: string; to?: string };

// A block has pickup on file when the hotel's report or a count was loaded.
// One with nothing loaded is unknown, not zero, so it stays out of the pattern.
function hasPickup(b: BlockForTotals) {
  return b.pickupGuests.length > 0 || b.pickupCounts.length > 0 || b.nights.some((n) => n.otherReservations > 0);
}

// Rooms picked up and blocked per night across ended events, with each event's dates so
// the report can line nights up by role (src/lib/hotelPattern.ts).
export async function pickupPatternCore(filters: PatternFilters, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, "HOTELS", "VIEW", { tenantId });
  const eventWhere = await hotelEventWhere(userId, tenantId);
  const proposalWhere: Prisma.HotelProposalWhereInput = {
    block: { isNot: null },
    ...(filters.contractTypes.length ? { contractType: { in: filters.contractTypes } } : {}),
    ...(filters.guestTypes.length ? { guestType: { in: filters.guestTypes } } : {}),
    ...(filters.city ? { venue: { city: filters.city } } : {}),
  };
  const events = await prisma.event.findMany({
    where: {
      AND: [
        eventWhere,
        { endDate: { lt: new Date() } },
        { hotelProposals: { some: proposalWhere } },
        filters.seriesId === "__blank__" ? { seriesId: null } : filters.seriesId ? { seriesId: filters.seriesId } : {},
        filters.from ? { startDate: { gte: new Date(`${filters.from}T00:00:00Z`) } } : {},
        filters.to ? { startDate: { lte: new Date(`${filters.to}T23:59:59Z`) } } : {},
      ],
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      actualAttendance: true,
      series: { select: { id: true, name: true } },
      venues: { orderBy: { sortOrder: "asc" }, take: 1, select: { venue: { select: { city: true, state: true } } } },
      hotelProposals: { where: proposalWhere, select: { block: { select: blockPickupSelect } } },
    },
    orderBy: { startDate: "desc" },
  });
  const withPickup = [];
  const noPickup = [];
  for (const e of events) {
    const startDate = dateKey(e.startDate);
    const blocks = e.hotelProposals.flatMap((p) => (p.block && hasPickup(p.block) ? [p.block] : []));
    if (blocks.length === 0) {
      noPickup.push({ id: e.id, name: e.name, startDate });
      continue;
    }
    const pickedUp: Record<string, number> = {};
    const blocked: Record<string, number> = {};
    for (const b of blocks) {
      for (const r of blockPickup({ nights: b.nights, guests: b.pickupGuests, counts: b.pickupCounts })) {
        pickedUp[r.night] = (pickedUp[r.night] ?? 0) + r.pickedUp;
        blocked[r.night] = (blocked[r.night] ?? 0) + r.blocked;
      }
    }
    withPickup.push({
      id: e.id,
      name: e.name,
      startDate,
      endDate: dateKey(e.endDate),
      series: e.series,
      city: [e.venues[0]?.venue.city, e.venues[0]?.venue.state].filter(Boolean).join(", ") || null,
      actualAttendance: e.actualAttendance,
      hotels: blocks.map((b) => b.proposal.venue.name),
      pickedUp,
      blocked,
    });
  }
  return { events: withPickup, noPickup };
}
