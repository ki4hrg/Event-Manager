export type CateringRelationship =
  | { via: "PRIMARY" }
  | { via: "ADDITIONAL_LOCATION"; locationName: string | null };

export function cateringRelationshipLabel(relationship: CateringRelationship): string {
  if (relationship.via === "PRIMARY") return "Primary catering";
  return relationship.locationName
    ? `Additional service location: ${relationship.locationName}`
    : "Additional service location";
}

type CountableLocation = { expectedCount: number | null };

export type ServiceLocationCounts = {
  sumKnown: number;
  uncountedCount: number;
  primaryRemaining: number | null;
  exceedsExpected: boolean;
  exceedsConfirmed: boolean;
};

export function computeServiceLocationCounts(
  locations: CountableLocation[],
  orderExpectedCount: number | null,
  orderConfirmedCount: number | null,
): ServiceLocationCounts {
  const counted = locations.filter((l) => l.expectedCount != null);
  const sumKnown = counted.reduce((acc, l) => acc + (l.expectedCount ?? 0), 0);
  const uncountedCount = locations.length - counted.length;
  const primaryRemaining = orderExpectedCount != null ? orderExpectedCount - sumKnown : null;
  const exceedsExpected = orderExpectedCount != null && counted.length > 0 && sumKnown > orderExpectedCount;
  const exceedsConfirmed = orderConfirmedCount != null && counted.length > 0 && sumKnown > orderConfirmedCount;
  return { sumKnown, uncountedCount, primaryRemaining, exceedsExpected, exceedsConfirmed };
}
