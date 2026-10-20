"use server";

import { PermissionResource, type HotelContractType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadPermissionsForUser, requirePermission } from "@/lib/permissions";
import { dateKey } from "@/lib/hotels";
import { blockPickup, pickupTotals } from "@/lib/hotelPickup";

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
      contractType: true,
      guestType: true,
      event: { select: { id: true, name: true, startDate: true, timezone: true } },
    },
    orderBy: { event: { startDate: "desc" } },
  });
}

const blockPickupSelect = {
  id: true,
  isHq: true,
  cutoffDate: true,
  allowedAttrition: true,
  nights: { select: { night: true, roomType: true, rooms: true, contractedRooms: true, otherReservations: true } },
  pickupGuests: { select: { checkIn: true, checkOut: true, roomType: true, cancelled: true } },
  pickupCounts: { select: { night: true, roomType: true, rooms: true } },
  proposal: { select: { contractType: true, guestType: true, venue: { select: { id: true, name: true } } } },
} satisfies Prisma.HotelBlockSelect;

type BlockForTotals = Prisma.HotelBlockGetPayload<{ select: typeof blockPickupSelect }>;

function blockRow(b: BlockForTotals) {
  const rows = blockPickup({ nights: b.nights, guests: b.pickupGuests, counts: b.pickupCounts });
  const totals = pickupTotals(rows);
  const floor = b.allowedAttrition != null ? 100 - Number(b.allowedAttrition) : null;
  return {
    blockId: b.id,
    hotelId: b.proposal.venue.id,
    hotel: b.proposal.venue.name,
    isHq: b.isHq,
    contractType: b.proposal.contractType,
    guestType: b.proposal.guestType,
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
      startDate: dateKey(e.startDate),
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
    select: { ...blockPickupSelect, proposal: { select: { ...blockPickupSelect.proposal.select, event: { select: { id: true, name: true, startDate: true } } } } },
  });
  return blocks
    .map((b) => {
      const { byNight: _byNight, ...row } = blockRow(b);
      return { ...row, event: { id: b.proposal.event.id, name: b.proposal.event.name, startDate: dateKey(b.proposal.event.startDate) } };
    })
    .sort((a, b) => (a.cutoffDate ?? "9999").localeCompare(b.cutoffDate ?? "9999") || a.event.startDate.localeCompare(b.event.startDate));
}

export type PatternFilters = { seriesId?: string; city?: string; contractTypes: HotelContractType[]; guestTypes: string[]; from?: string; to?: string };

// A block has pickup on file when the hotel's report or a count was loaded.
// One with nothing loaded is unknown, not zero, so it stays out of the pattern.
function hasPickup(b: BlockForTotals) {
  return b.pickupGuests.length > 0 || b.pickupCounts.length > 0 || b.nights.some((n) => n.otherReservations > 0);
}

// Rooms picked up and blocked per night across ended events, with each event's dates so
// the report can line nights up by role (src/lib/hotelPattern.ts).
export async function getPickupPattern(filters: PatternFilters) {
  const { eventWhere } = await hotelSession();
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

// The tenant's guest types, for the pattern filter.
export async function getHotelGuestTypes() {
  const { tenantId } = await hotelSession();
  const rows = await prisma.customOption.findMany({
    where: { tenantId, category: "hotel_guest_type" },
    select: { label: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((r) => r.label);
}

// Cities of the tenant's lodging venues, for the pattern filter.
export async function getHotelCities() {
  const { tenantId } = await hotelSession();
  const rows = await prisma.venue.findMany({
    where: { tenantId, isLodging: true, city: { not: null } },
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
  });
  return rows.flatMap((r) => (r.city ? [r.city] : []));
}

// Events that haven't ended, soonest first, to date the proposed block.
export async function getProposalEventChoices() {
  const { eventWhere } = await hotelSession();
  const events = await prisma.event.findMany({
    where: { AND: [eventWhere, { endDate: { gte: new Date(`${dateKey(new Date())}T00:00:00Z`) } }] },
    select: { id: true, name: true, startDate: true, endDate: true, seriesId: true },
    orderBy: { startDate: "asc" },
  });
  return events.map((e) => ({ id: e.id, name: e.name, seriesId: e.seriesId, startDate: dateKey(e.startDate), endDate: dateKey(e.endDate) }));
}

export async function getSeriesChoices() {
  const { tenantId } = await hotelSession();
  return prisma.eventSeries.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}
