// Where an event (or one of its hotel RFPs) looks for hotels: whole regions
// (hotel_region labels) and single areas (hotel_area labels; an area's
// option group is its region). Pure, so client pickers can import it.

export type AreaScope = { regions: string[]; areas: string[] };
export type AreaOption = { label: string; region: string | null };

export const isEmptyScope = (s: AreaScope) => s.regions.length === 0 && s.areas.length === 0;

// The RFP's own scope when it sets one, else the event's.
export const effectiveScope = (own: AreaScope, event: AreaScope): AreaScope => (isEmptyScope(own) ? event : own);

// Does a hotel in `area` fall within the scope? An empty scope takes every hotel.
export function inScope(area: string | null, scope: AreaScope, options: AreaOption[]): boolean {
  if (isEmptyScope(scope)) return true;
  if (!area) return false;
  if (scope.areas.includes(area)) return true;
  const region = options.find((o) => o.label === area)?.region;
  return region != null && scope.regions.includes(region);
}

// "North Alabama (all) · Hoover" for display.
export const scopeLabels = (s: AreaScope) => [...s.regions.map((r) => `${r} (all)`), ...s.areas];
