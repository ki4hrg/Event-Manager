import { ACQUISITION_OPTIONS, PACKING_STATUS_OPTIONS } from "@/lib/statusConstants";

/**
 * URL-param parsing for the Packing List report, shared by the interactive
 * page and its /print route so the two never read the URL differently.
 *
 * The two enum-backed params are validated against their option sets — an
 * unvalidated `?packing=banana` would silently empty the report and read as a
 * backend bug. Room ids and provider labels are opaque and pass through; a
 * miss there simply matches nothing, same as the other reports.
 */
export const VALID_PACKING_STATUSES = new Set<string>(
  PACKING_STATUS_OPTIONS.map((o) => o.value)
);
export const VALID_ACQUISITION_STATES = new Set<string>(
  ACQUISITION_OPTIONS.map((o) => o.value)
);

export type PackingListSelection = {
  rooms: string[];
  packingStatuses: string[];
  acquisitionStates: string[];
  providers: string[];
  hidePacked: boolean;
};

export function parseListParam(v: string | undefined): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

export function parsePackingListParams(sp: {
  rooms?: string;
  packing?: string;
  acquisition?: string;
  providers?: string;
  hidePacked?: string;
}): PackingListSelection {
  return {
    rooms: parseListParam(sp.rooms),
    packingStatuses: parseListParam(sp.packing).filter((v) => VALID_PACKING_STATUSES.has(v)),
    acquisitionStates: parseListParam(sp.acquisition).filter((v) =>
      VALID_ACQUISITION_STATES.has(v)
    ),
    providers: parseListParam(sp.providers),
    hidePacked: sp.hidePacked === "true",
  };
}
