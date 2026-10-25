// The seam between the ESG / PER and housing data. ESG Part I §G and PER
// §III–IV read only HousingInput. An event with hotel blocks (the Hotels
// module) reports them — blocks by night, contracted vs final, pickup at N
// days out from snapshots, actual pickup — with source: "hotels". Without
// blocks it falls back to the Specifications page's housing fields.

import { prisma } from "@/lib/prisma";
import { dateKey } from "@/lib/hotels";
import { getDateKeyInTimezone } from "@/lib/agendaUtils";
import { blockPickup, pickupDaysOut, snapshotAsOf, type NightPickup } from "@/lib/hotelPickup";

export type HousingRoomBlock = {
  facilityName: string;
  isHq: boolean;
  nights: { dateKey: string; rooms: number | null }[];
};

// PER §IV row per hotel (HQ first, then alphabetical).
export type PerHotelRow = {
  facilityName: string;
  isHq: boolean;
  hotelType: string | null;
  singleOccupied: number | null;
  doubleOccupied: number | null;
  suites: number | null;
  compRooms: number | null;
  staffRooms: number | null;
  subBlocks: number | null;
  contractedDate: string | null;
  finalBlockDate: string | null;
  cutoffDate: string | null;
  cutoffExercised: boolean | null;
  pickupAtCutoff: number | null;
  nights: {
    dateKey: string;
    contracted: number | null;
    final: number | null;
    pickup90: number | null;
    pickup60: number | null;
    pickup30: number | null;
    pickup21: number | null;
    pickup14: number | null;
    pickup7: number | null;
    actual: number | null;
  }[];
  comments: string | null;
};

export type HousingInput = {
  source: "specification" | "hotels";
  roomBlocks: HousingRoomBlock[];
  reservationMethod: string | null;
  thirdPartyProvider: string | null;
  perHotels: PerHotelRow[];
  perSummary: {
    usedSleepingRooms: boolean | null;
    hotelCount: number | null;
    peakNightRooms: number | null;
    performedBy: string | null;
  };
};

type SpecHousingFields = {
  reservationMethod: string | null;
  thirdPartyHousing: boolean | null;
  narrative: Record<string, unknown>;
} | null;

const DAYS_OUT = [90, 60, 30, 21, 14, 7] as const;

export async function loadHousingInput(eventId: string, spec: SpecHousingFields): Promise<HousingInput> {
  const providerName = typeof spec?.narrative.housingProviderName === "string" ? spec.narrative.housingProviderName : null;
  const fallback: HousingInput = {
    source: "specification",
    roomBlocks: [],
    reservationMethod: spec?.reservationMethod ?? null,
    thirdPartyProvider: spec?.thirdPartyHousing ? providerName : null,
    perHotels: [],
    perSummary: { usedSleepingRooms: null, hotelCount: null, peakNightRooms: null, performedBy: null },
  };

  const blocks = await prisma.hotelBlock.findMany({
    where: { proposal: { eventId } },
    select: {
      isHq: true,
      reservationMethod: true,
      contractedOn: true,
      cutoffDate: true,
      cutoffExercised: true,
      compRooms: true,
      staffRooms: true,
      notes: true,
      proposal: { select: { venue: { select: { id: true, name: true, brand: true } } } },
      nights: { select: { night: true, roomType: true, rooms: true, contractedRooms: true, otherReservations: true } },
      pickupGuests: { select: { checkIn: true, checkOut: true, roomType: true, cancelled: true, bookedOn: true, cancelledOn: true } },
      pickupCounts: { select: { night: true, roomType: true, rooms: true } },
      pickupSnapshots: { select: { takenOn: true, nights: true } },
    },
  });
  if (blocks.length === 0) return fallback;
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { timezone: true } });
  const today = getDateKeyInTimezone(new Date(), event?.timezone ?? "America/Chicago");

  // One row per hotel: the blocks one offer became (attendees, staff) add
  // up, and their count is the PER's sub-blocks.
  const byHotel = new Map<string, typeof blocks>();
  for (const b of blocks) byHotel.set(b.proposal.venue.id, [...(byHotel.get(b.proposal.venue.id) ?? []), b]);
  const hotels = Array.from(byHotel.values()).map((group) => ({ venue: group[0].proposal.venue, isHq: group.some((b) => b.isHq), group }));
  hotels.sort((a, b) => Number(b.isHq) - Number(a.isHq) || a.venue.name.localeCompare(b.venue.name));

  const actualByNight = new Map<string, number>();
  let anyPickup = false;
  const earliest = (dates: (Date | null)[]) => dates.filter((d): d is Date => d != null).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const total = (ns: (number | null)[]) => (ns.every((n) => n == null) ? null : ns.reduce<number>((s, n) => s + (n ?? 0), 0));

  const perHotels: PerHotelRow[] = hotels.map(({ venue, isHq, group }) => {
    const parts = group.map((b) => ({ b, rows: blockPickup({ nights: b.nights, guests: b.pickupGuests, counts: b.pickupCounts }) }));
    const nightKeysSorted = Array.from(new Set(parts.flatMap((p) => p.rows.map((r) => r.night)))).sort();
    const firstNight = nightKeysSorted[0] ?? null;
    const sum = (night: string, pick: (r: NightPickup) => number | null) => total(parts.flatMap((p) => p.rows.filter((r) => r.night === night).map(pick)));
    const nights = nightKeysSorted.map((night) => {
      const actual = sum(night, (r) => r.pickedUp) ?? 0;
      if (actual > 0) anyPickup = true;
      actualByNight.set(night, (actualByNight.get(night) ?? 0) + actual);
      // Blank when any of the hotel's blocks can't say.
      const daysOut = Object.fromEntries(
        DAYS_OUT.map((d) => {
          const vals = parts.map(({ b }) =>
            pickupDaysOut({ snapshots: b.pickupSnapshots, guests: b.pickupGuests, counts: b.pickupCounts, nights: b.nights }, firstNight, d, night, today),
          );
          return [`pickup${d}`, vals.some((v) => v == null) ? null : vals.reduce<number>((s, v) => s + (v ?? 0), 0)];
        }),
      ) as Record<`pickup${(typeof DAYS_OUT)[number]}`, number | null>;
      return { dateKey: night, contracted: sum(night, (r) => r.contracted), final: sum(night, (r) => r.blocked), ...daysOut, actual };
    });
    const cutoffDate = earliest(group.map((b) => b.cutoffDate));
    const atCutoff = group.map((b) => {
      const snap = b.cutoffDate ? snapshotAsOf(b.pickupSnapshots, dateKey(b.cutoffDate), today) : null;
      return snap ? Object.values(snap).reduce((s, n) => s + (typeof n === "number" ? n : 0), 0) : null;
    });
    const contractedOn = earliest(group.map((b) => b.contractedOn));
    return {
      facilityName: venue.name,
      isHq,
      hotelType: venue.brand,
      singleOccupied: null,
      doubleOccupied: null,
      suites: null,
      compRooms: total(group.map((b) => b.compRooms)),
      staffRooms: total(group.map((b) => b.staffRooms)),
      subBlocks: group.length > 1 ? group.length : null,
      contractedDate: contractedOn ? dateKey(contractedOn) : null,
      finalBlockDate: null,
      cutoffDate: cutoffDate ? dateKey(cutoffDate) : null,
      cutoffExercised: group.find((b) => b.cutoffExercised != null)?.cutoffExercised ?? null,
      pickupAtCutoff: total(atCutoff),
      nights,
      comments: group.map((b) => b.notes).filter(Boolean).join("\n") || null,
    };
  });

  return {
    source: "hotels",
    roomBlocks: hotels.map((h, i) => ({
      facilityName: h.venue.name,
      isHq: h.isHq,
      nights: perHotels[i].nights.map((n) => ({ dateKey: n.dateKey, rooms: n.final })),
    })),
    reservationMethod: spec?.reservationMethod ?? blocks.find((b) => b.reservationMethod)?.reservationMethod ?? null,
    thirdPartyProvider: fallback.thirdPartyProvider,
    perHotels,
    perSummary: {
      usedSleepingRooms: true,
      hotelCount: hotels.length,
      peakNightRooms: anyPickup ? Math.max(...Array.from(actualByNight.values())) : null,
      performedBy: null,
    },
  };
}
