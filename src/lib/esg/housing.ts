// The seam between the ESG / PER and housing data. ESG Part I §G and PER
// §III–IV read only HousingInput. Today it carries the Specifications page's
// housing fields with no structured room blocks; when the Hotels module lands,
// only loadHousingInput changes — it fills roomBlocks and perHotels from real
// blocks (by night, per room type) and pickup, and sets source: "hotels".

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

// eventId is unused until the Hotels module supplies blocks for it.
export async function loadHousingInput(_eventId: string, spec: SpecHousingFields): Promise<HousingInput> {
  const providerName = typeof spec?.narrative.housingProviderName === "string" ? spec.narrative.housingProviderName : null;
  return {
    source: "specification",
    roomBlocks: [],
    reservationMethod: spec?.reservationMethod ?? null,
    thirdPartyProvider: spec?.thirdPartyHousing ? providerName : null,
    perHotels: [],
    perSummary: { usedSleepingRooms: null, hotelCount: null, peakNightRooms: null, performedBy: null },
  };
}
