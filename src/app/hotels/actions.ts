"use server";

import { PermissionResource, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadPermissionsForUser, requirePermission } from "@/lib/permissions";
import { dateKey } from "@/lib/hotels";
import { blockPickup, pickupTotals } from "@/lib/hotelPickup";
import { getDateKeyInTimezone } from "@/lib/agendaUtils";

// Events whose hotels this user may see across the tenant: every event with
// HOTELS on unassigned events, otherwise only events they staff (mirrors
// eventScopeWhere for EVENTS).
async function hotelSession() {
  const session = await requirePermission("HOTELS", "VIEW");
  const { permissions } = await loadPermissionsForUser(session.user.id, session.tenantId);
  const unassigned = permissions.find((p) => p.resource === PermissionResource.HOTELS && p.scope === "UNASSIGNED");
  const eventWhere: Prisma.EventWhereInput =
    unassigned && unassigned.level !== "NONE"
      ? { tenantId: session.tenantId }
      : { tenantId: session.tenantId, staff: { some: { userId: session.user.id } } };
  return { tenantId: session.tenantId, eventWhere };
}

// The active tenant's lodging venues with their proposal history.
export async function getHotels() {
  const { tenantId, eventWhere } = await hotelSession();
  return prisma.venue.findMany({
    where: { tenantId, isLodging: true },
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      brand: true,
      area: true,
      hotelProposals: {
        where: { event: eventWhere },
        select: { id: true, status: true, event: { select: { id: true, name: true, startDate: true } } },
        orderBy: { event: { startDate: "desc" } },
      },
    },
    orderBy: { name: "asc" },
  });
}

// One venue's proposals across events, newest event first.
export async function getVenueHotelHistory(venueId: string) {
  const { tenantId, eventWhere } = await hotelSession();
  return prisma.hotelProposal.findMany({
    where: { venueId, venue: { tenantId }, event: eventWhere },
    select: {
      id: true,
      status: true,
      revision: true,
      blockType: true,
      event: { select: { id: true, name: true, startDate: true, timezone: true } },
    },
    orderBy: { event: { startDate: "desc" } },
  });
}

const blockPickupSelect = {
  id: true,
  isHq: true,
  isRunOfHouse: true,
  cutoffDate: true,
  allowedAttrition: true,
  nights: { select: { night: true, roomType: true, rooms: true, contractedRooms: true, otherReservations: true } },
  pickupGuests: { select: { checkIn: true, checkOut: true, roomType: true, cancelled: true } },
  pickupCounts: { select: { night: true, roomType: true, rooms: true } },
  proposal: { select: { blockType: true, venue: { select: { id: true, name: true } } } },
} satisfies Prisma.HotelBlockSelect;

type BlockForTotals = Prisma.HotelBlockGetPayload<{ select: typeof blockPickupSelect }>;

function blockRow(b: BlockForTotals) {
  const rows = blockPickup({ isRunOfHouse: b.isRunOfHouse, nights: b.nights, guests: b.pickupGuests, counts: b.pickupCounts });
  const totals = pickupTotals(rows);
  const floor = b.allowedAttrition != null ? 100 - Number(b.allowedAttrition) : null;
  return {
    blockId: b.id,
    hotelId: b.proposal.venue.id,
    hotel: b.proposal.venue.name,
    isHq: b.isHq,
    blockType: b.proposal.blockType,
    cutoffDate: b.cutoffDate ? dateKey(b.cutoffDate) : null,
    floor,
    atRisk: floor != null && totals.percent != null && totals.percent < floor,
    ...totals,
    byNight: rows,
  };
}

export type HotelHistoryFilters = { seriesId?: string; from?: string; to?: string };

// Pickup per event (and per hotel) across the tenant, newest first.
export async function getHotelPickupHistory(filters: HotelHistoryFilters) {
  const { eventWhere } = await hotelSession();
  const events = await prisma.event.findMany({
    where: {
      AND: [
        eventWhere,
        { hotelProposals: { some: { block: { isNot: null } } } },
        filters.seriesId === "__blank__" ? { seriesId: null } : filters.seriesId ? { seriesId: filters.seriesId } : {},
        filters.from ? { startDate: { gte: new Date(`${filters.from}T00:00:00Z`) } } : {},
        filters.to ? { startDate: { lte: new Date(`${filters.to}T23:59:59Z`) } } : {},
      ],
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      timezone: true,
      expectedAttendance: true,
      actualAttendance: true,
      membershipCount: true,
      series: { select: { id: true, name: true } },
      hotelProposals: { where: { block: { isNot: null } }, select: { block: { select: blockPickupSelect } } },
    },
    orderBy: { startDate: "desc" },
  });
  return events.map((e) => {
    const hotels = e.hotelProposals.flatMap((p) => (p.block ? [blockRow(p.block)] : []));
    const byNight = new Map<string, number>();
    for (const h of hotels) for (const r of h.byNight) byNight.set(r.night, (byNight.get(r.night) ?? 0) + r.pickedUp);
    const blocked = hotels.reduce((s, h) => s + h.blocked, 0);
    const pickedUp = hotels.reduce((s, h) => s + h.pickedUp, 0);
    return {
      id: e.id,
      name: e.name,
      startDate: getDateKeyInTimezone(e.startDate, e.timezone),
      series: e.series,
      expectedAttendance: e.expectedAttendance,
      actualAttendance: e.actualAttendance,
      membershipCount: e.membershipCount,
      hotels: hotels.map(({ byNight: _byNight, ...h }) => h),
      blocked,
      pickedUp,
      percent: blocked > 0 ? Math.round((pickedUp / blocked) * 1000) / 10 : null,
      peakNight: Math.max(0, ...Array.from(byNight.values())),
    };
  });
}

// Blocks for events that haven't ended, soonest cut-off first.
export async function getBlockMonitoring() {
  const { eventWhere } = await hotelSession();
  const blocks = await prisma.hotelBlock.findMany({
    where: { proposal: { event: { AND: [eventWhere, { endDate: { gte: new Date() } }] } } },
    select: { ...blockPickupSelect, proposal: { select: { ...blockPickupSelect.proposal.select, event: { select: { id: true, name: true, startDate: true, timezone: true } } } } },
  });
  return blocks
    .map((b) => {
      const { byNight: _byNight, ...row } = blockRow(b);
      return { ...row, event: { id: b.proposal.event.id, name: b.proposal.event.name, startDate: getDateKeyInTimezone(b.proposal.event.startDate, b.proposal.event.timezone) } };
    })
    .sort((a, b) => (a.cutoffDate ?? "9999").localeCompare(b.cutoffDate ?? "9999") || a.event.startDate.localeCompare(b.event.startDate));
}

export async function getSeriesChoices() {
  const { tenantId } = await hotelSession();
  return prisma.eventSeries.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}
