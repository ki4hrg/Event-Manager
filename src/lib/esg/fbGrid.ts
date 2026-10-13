// ESG Part I §M "Catered Food & Beverage Total Expected Attendance" and PER
// §V "F&B Function Schedule": day × meal grids built from catering orders.
// Orders bucket by their meal type's APEX key (CustomOption.group), so
// tenants can rename meal types freely. The day comes from the linked
// function's main schedule in the event timezone.

import { getDateKeyInTimezone } from "@/lib/agendaUtils";
import { firmestGuestCount } from "@/lib/cateringGuestCount";
import type { MealBucket } from "@/lib/esg/apex";

export type FbGridMode = "esg" | "per";

export const ESG_FB_ROWS = [
  { key: "breakfast", label: "Breakfast(s)" },
  { key: "amBreak", label: "AM Break(s)" },
  { key: "lunch", label: "Lunch(es)" },
  { key: "pmBreak", label: "PM Break(s)" },
  { key: "reception", label: "Reception(s)" },
  { key: "dinner", label: "Dinner(s)" },
] as const;

export const PER_FB_ROWS = [
  { key: "breakContinental", label: "Break(s) / Continental(s)" },
  { key: "breakfast", label: "Breakfast(s)" },
  { key: "lunch", label: "Lunch(es)" },
  { key: "reception", label: "Reception(s)" },
  { key: "dinner", label: "Dinner(s)" },
] as const;

export type FbRowKey = (typeof ESG_FB_ROWS)[number]["key"] | (typeof PER_FB_ROWS)[number]["key"];

export type FbCell = { held: number; expected: number; guaranteed: number; fed: number; hasFed: boolean };

export type FbGrid = {
  days: string[]; // date keys (YYYY-MM-DD)
  rows: { key: FbRowKey; label: string; cells: Record<string, FbCell> }[];
  // Orders that couldn't be placed (no meal type or no scheduled function).
  unplaced: { id: string; name: string; reason: "no-meal-type" | "unscheduled" }[];
};

export type FbGridOrder = {
  id: string;
  name: string;
  status: string | null;
  mealType: string | null;
  expectedCount: number | null;
  confirmedCount: number | null;
  guaranteeCount: number | null;
  actualCount?: number | null;
  // Main start of the linked function (ms), already excluding set-up rows.
  serviceStart: number | null;
  serviceLocations?: { expectedCount: number | null; serviceStart: number | null }[];
};

const HOUR_FMT_CACHE = new Map<string, Intl.DateTimeFormat>();
function hourIn(ms: number, timezone: string): number {
  let fmt = HOUR_FMT_CACHE.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false });
    HOUR_FMT_CACHE.set(timezone, fmt);
  }
  return parseInt(fmt.format(new Date(ms)), 10) % 24;
}

function rowFor(bucket: MealBucket, ms: number, timezone: string, mode: FbGridMode): FbRowKey {
  if (mode === "esg") {
    switch (bucket) {
      case "CONTINENTAL":
      case "BREAKFAST":
      case "BRUNCH":
        return "breakfast";
      case "BREAK":
        return hourIn(ms, timezone) < 12 ? "amBreak" : "pmBreak";
      case "LUNCH":
        return "lunch";
      case "RECEPTION":
      case "HOSPITALITY":
        return "reception";
      case "DINNER":
        return "dinner";
      default: {
        const _exhaustive: never = bucket;
        throw new Error(`Unhandled meal bucket: ${_exhaustive}`);
      }
    }
  }
  switch (bucket) {
    case "CONTINENTAL":
    case "BREAK":
      return "breakContinental";
    case "BREAKFAST":
    case "BRUNCH":
      return "breakfast";
    case "LUNCH":
      return "lunch";
    case "RECEPTION":
    case "HOSPITALITY":
      return "reception";
    case "DINNER":
      return "dinner";
    default: {
      const _exhaustive: never = bucket;
      throw new Error(`Unhandled meal bucket: ${_exhaustive}`);
    }
  }
}

const MEAL_BUCKET_VALUES = new Set<string>([
  "CONTINENTAL",
  "BREAKFAST",
  "BRUNCH",
  "LUNCH",
  "DINNER",
  "BREAK",
  "RECEPTION",
  "HOSPITALITY",
]);

export function buildFbAttendanceGrid(
  orders: FbGridOrder[],
  mealTypes: { label: string; group: string | null }[],
  timezone: string,
  mode: FbGridMode,
): FbGrid {
  const bucketByLabel = new Map<string, MealBucket>();
  for (const m of mealTypes) {
    if (m.group && MEAL_BUCKET_VALUES.has(m.group)) bucketByLabel.set(m.label, m.group as MealBucket);
  }
  const rowDefs = mode === "esg" ? ESG_FB_ROWS : PER_FB_ROWS;
  const rows = rowDefs.map((r) => ({ key: r.key as FbRowKey, label: r.label, cells: {} as Record<string, FbCell> }));
  const rowIndex = new Map(rows.map((r, i) => [r.key, i]));
  const days = new Set<string>();
  const unplaced: FbGrid["unplaced"] = [];

  const add = (bucket: MealBucket, ms: number, counts: Omit<FbCell, "held"> & { held?: number }) => {
    const day = getDateKeyInTimezone(new Date(ms), timezone);
    days.add(day);
    const row = rows[rowIndex.get(rowFor(bucket, ms, timezone, mode))!];
    const cell = (row.cells[day] ??= { held: 0, expected: 0, guaranteed: 0, fed: 0, hasFed: false });
    cell.held += counts.held ?? 1;
    cell.expected += counts.expected;
    cell.guaranteed += counts.guaranteed;
    cell.fed += counts.fed;
    cell.hasFed = cell.hasFed || counts.hasFed;
  };

  for (const order of orders) {
    if (order.status === "CANCELLED") continue;
    const bucket = order.mealType ? bucketByLabel.get(order.mealType) : undefined;
    if (!bucket) {
      unplaced.push({ id: order.id, name: order.name, reason: "no-meal-type" });
      continue;
    }
    if (order.serviceStart === null) {
      unplaced.push({ id: order.id, name: order.name, reason: "unscheduled" });
      continue;
    }
    add(bucket, order.serviceStart, {
      expected: firmestGuestCount(order)?.value ?? 0,
      guaranteed: order.guaranteeCount ?? 0,
      fed: order.actualCount ?? 0,
      hasFed: order.actualCount != null,
    });
    // Additional service locations are extra covers of the same meal.
    for (const loc of order.serviceLocations ?? []) {
      if (loc.serviceStart === null || !loc.expectedCount) continue;
      add(bucket, loc.serviceStart, { held: 0, expected: loc.expectedCount, guaranteed: 0, fed: 0, hasFed: false });
    }
  }

  return { days: Array.from(days).sort(), rows, unplaced };
}

export function fbGridHasData(grid: FbGrid): boolean {
  return grid.rows.some((r) => Object.keys(r.cells).length > 0);
}
