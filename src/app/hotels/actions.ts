"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { dateKey } from "@/lib/hotels";
import { blockPickup, pickupTotals } from "@/lib/hotelPickup";
import { blockPickupSelect, hotelEventWhere, pickupPatternCore, type BlockForTotals, type PatternFilters } from "./core";

// Events whose hotels this user may see across the tenant (hotelEventWhere).
async function hotelSession() {
  const session = await requirePermission("HOTELS", "VIEW");
  return { tenantId: session.tenantId, eventWhere: await hotelEventWhere(session.user.id, session.tenantId) };
}

// The active tenant's lodging venues with their proposal history; with
// amenities, only hotels that have every one.
export async function getHotels(amenities: string[] = []) {
  const { tenantId, eventWhere } = await hotelSession();
  return prisma.venue.findMany({
    where: { tenantId, isLodging: true, ...(amenities.length ? { amenities: { hasEvery: amenities } } : {}) },
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      brand: true,
      area: true,
      amenities: true,
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
      block: { select: { id: true } },
      event: { select: { id: true, name: true, startDate: true, timezone: true } },
    },
    orderBy: { event: { startDate: "desc" } },
  });
}

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

// Rooms picked up and blocked per night across ended events (pickupPatternCore).
export async function getPickupPattern(filters: PatternFilters) {
  const session = await requirePermission("HOTELS", "VIEW");
  return pickupPatternCore(filters, session.user.id, session.tenantId);
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
