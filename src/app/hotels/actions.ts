"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { appliedAttrition, contractKindOf, dateKey, daysOutCheckpoints, toContractTypeOption, type ContractTypeOption } from "@/lib/hotels";
import { blockPickup, daysOutPickup, pickupTotals } from "@/lib/hotelPickup";
import { getOptionsForTenant } from "@/lib/options";
import { getDateKeyInTimezone } from "@/lib/agendaUtils";
import { blockPickupSelect, hotelEventWhere, pickupPatternCore, type BlockForTotals, type PatternFilters } from "./core";
import { assertIds, dateKeySchema, idSchema } from "@/lib/validation";

// Events whose hotels this user may see across the tenant (hotelEventWhere).
async function hotelSession() {
  const session = await requirePermission("HOTELS", "VIEW");
  return { tenantId: session.tenantId, eventWhere: await hotelEventWhere(session.user.id, session.tenantId) };
}

// The active tenant's lodging venues with their proposal history; with
// amenities, only hotels that have every one.
// These readers take filters from the URL. A value that isn't the right shape
// means no filter (an object would be a Prisma filter), never an error.
const isText = (v: unknown): v is string => typeof v === "string" && v.length <= 1_000;
const texts = (v: unknown) => (Array.isArray(v) ? v.filter(isText).slice(0, 200) : []);
const seriesFilter = (v: unknown) => (v === "__blank__" || idSchema.safeParse(v).success ? (v as string) : undefined);
const dateFilter = (v: unknown) => (dateKeySchema.safeParse(v).success ? (v as string) : undefined);

export async function getHotels(input: string[] = []) {
  const { tenantId, eventWhere } = await hotelSession();
  const amenities = texts(input);
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
  assertIds(venueId);
  return prisma.hotelProposal.findMany({
    where: { venueId, venue: { tenantId }, event: eventWhere },
    select: {
      id: true,
      status: true,
      revision: true,
      contractType: true,
      guestType: true,
      blocks: { select: { id: true, guestType: true }, orderBy: { createdAt: "asc" } },
      event: { select: { id: true, name: true, startDate: true, timezone: true } },
    },
    orderBy: { event: { startDate: "desc" } },
  });
}

async function contractTypeOptions(tenantId: string): Promise<ContractTypeOption[]> {
  return (await getOptionsForTenant(tenantId, "hotel_contract_type")).map(toContractTypeOption);
}

// A block's totals; at risk below its attrition floor, which a contract type
// held without attrition doesn't have.
function blockRow(b: BlockForTotals, contractTypes: ContractTypeOption[]) {
  const rows = blockPickup({ nights: b.nights, guests: b.pickupGuests, counts: b.pickupCounts });
  const totals = pickupTotals(rows);
  const attrition = appliedAttrition(b.allowedAttrition != null ? Number(b.allowedAttrition) : null, contractKindOf(b.contractType, contractTypes));
  const floor = attrition != null ? 100 - attrition : null;
  return {
    blockId: b.id,
    hotelId: b.proposal.venue.id,
    hotel: b.proposal.venue.name,
    isHq: b.isHq,
    contractType: b.contractType,
    guestType: b.guestType,
    cutoffDate: b.cutoffDate ? dateKey(b.cutoffDate) : null,
    floor,
    atRisk: floor != null && totals.percent != null && totals.percent < floor,
    ...totals,
    byNight: rows,
  };
}

export type HotelHistoryFilters = { seriesId?: string; from?: string; to?: string };

// Pickup per event (and per hotel) across the tenant, newest first.
export async function getHotelPickupHistory(input: HotelHistoryFilters) {
  const { tenantId, eventWhere } = await hotelSession();
  const filters: HotelHistoryFilters = { seriesId: seriesFilter(input?.seriesId), from: dateFilter(input?.from), to: dateFilter(input?.to) };
  const contractTypes = await contractTypeOptions(tenantId);
  const events = await prisma.event.findMany({
    where: {
      AND: [
        eventWhere,
        { hotelProposals: { some: { blocks: { some: {} } } } },
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
      hotelProposals: { where: { blocks: { some: {} } }, select: { blocks: { select: blockPickupSelect } } },
    },
    orderBy: { startDate: "desc" },
  });
  return events.map((e) => {
    const hotels = e.hotelProposals.flatMap((p) => p.blocks.map((b) => blockRow(b, contractTypes)));
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

// Blocks for events that haven't ended, soonest cut-off first, with pickup at
// each of the tenant's checkpoints (hotel_days_out).
export async function getBlockMonitoring() {
  const { tenantId, eventWhere } = await hotelSession();
  const [blocks, contractTypes, checkpointOptions] = await Promise.all([
    prisma.hotelBlock.findMany({
      where: { proposal: { event: { AND: [eventWhere, { endDate: { gte: new Date() } }] } } },
      select: {
        ...blockPickupSelect,
        pickupGuests: { select: { checkIn: true, checkOut: true, roomType: true, cancelled: true, bookedOn: true, cancelledOn: true } },
        pickupSnapshots: { select: { takenOn: true, nights: true } },
        proposal: { select: { ...blockPickupSelect.proposal.select, event: { select: { id: true, name: true, startDate: true, timezone: true } } } },
      },
    }),
    contractTypeOptions(tenantId),
    getOptionsForTenant(tenantId, "hotel_days_out"),
  ]);
  const checkpoints = daysOutCheckpoints(checkpointOptions.map((o) => o.label));
  const rows = blocks
    .map((b) => {
      const { byNight: _byNight, ...row } = blockRow(b, contractTypes);
      const today = getDateKeyInTimezone(new Date(), b.proposal.event.timezone);
      return {
        ...row,
        daysOut: daysOutPickup({ nights: b.nights, guests: b.pickupGuests, counts: b.pickupCounts, snapshots: b.pickupSnapshots }, checkpoints, today),
        event: { id: b.proposal.event.id, name: b.proposal.event.name, startDate: dateKey(b.proposal.event.startDate) },
      };
    })
    .sort((a, b) => (a.cutoffDate ?? "9999").localeCompare(b.cutoffDate ?? "9999") || a.event.startDate.localeCompare(b.event.startDate));
  return { checkpoints, blocks: rows };
}

// Rooms picked up and blocked per night across ended events (pickupPatternCore).
export async function getPickupPattern(filters: PatternFilters) {
  const session = await requirePermission("HOTELS", "VIEW");
  const clean: PatternFilters = {
    seriesId: seriesFilter(filters?.seriesId),
    city: typeof filters?.city === "string" ? filters.city.slice(0, 200) : undefined,
    contractTypes: texts(filters?.contractTypes),
    guestTypes: texts(filters?.guestTypes),
    from: dateFilter(filters?.from),
    to: dateFilter(filters?.to),
  };
  return pickupPatternCore(clean, session.user.id, session.tenantId);
}

// The tenant's contract types, for the pattern filter.
export async function getHotelContractTypes() {
  const { tenantId } = await hotelSession();
  return (await getOptionsForTenant(tenantId, "hotel_contract_type")).map((o) => o.label);
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
