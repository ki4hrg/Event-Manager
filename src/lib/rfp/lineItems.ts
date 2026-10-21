// A vendor RFP's line items (RfpLineItem): what "Add from orders" offers,
// built from the event's AV, catering and print orders, and the grouping the
// editor and document share. Pure.

import type { RfpKind } from "@prisma/client";
import { getDateKeyInTimezone } from "@/lib/agendaUtils";
import { localTime, ownSchedules } from "@/lib/rfp/space";

// A row as the editor and core exchange it (RfpLineItemArgs without the id).
export type LineItemRow = {
  group: string | null; // the heading it prints under; the order's name when copied
  description: string;
  quantity: number | null;
  unit: string | null;
  day: string | null; // YYYY-MM-DD, event-local
  endDay: string | null; // through this day
  startTime: string | null; // HH:MM, event-local
  endTime: string | null;
  notes: string | null;
  avOrderId: string | null;
  cateringOrderId: string | null;
  printOrderId: string | null;
  equipmentItemId: string | null;
  printItemId: string | null;
  cateringLineItemId: string | null;
};

type Schedule = { type: string; startTime: Date; endTime: Date };

// When an order is needed: its linked functions' own schedules, first start
// to last end. Times only when it's one sitting.
function when(schedules: Schedule[], support: Set<string>, timezone: string) {
  const own = ownSchedules(schedules, support);
  if (!own.length) return { day: null, endDay: null, startTime: null, endTime: null };
  const first = own[0];
  const last = own.reduce((a, b) => (b.endTime > a.endTime ? b : a));
  const day = getDateKeyInTimezone(first.startTime, timezone);
  const endDay = getDateKeyInTimezone(last.endTime, timezone);
  const single = own.length === 1;
  return {
    day,
    endDay: endDay > day ? endDay : null,
    startTime: single ? localTime(first.startTime, timezone) : null,
    endTime: single ? localTime(first.endTime, timezone) : null,
  };
}

const blank = {
  avOrderId: null,
  cateringOrderId: null,
  printOrderId: null,
  equipmentItemId: null,
  printItemId: null,
  cateringLineItemId: null,
};

export type AvOrderInput = {
  id: string;
  name: string;
  schedules: Schedule[]; // every linked function's
  items: { id: string; item: string; quantity: number | null; notes: string | null }[];
};

// One row per piece of equipment on each AV order (the order's own list and
// its video section's).
export function avLineItems(orders: AvOrderInput[], support: Set<string>, timezone: string): LineItemRow[] {
  return orders.flatMap((o) => {
    const at = when(o.schedules, support, timezone);
    return o.items.map((i) => ({
      ...blank,
      ...at,
      group: o.name,
      description: i.item,
      quantity: i.quantity,
      unit: null,
      notes: i.notes,
      avOrderId: o.id,
      equipmentItemId: i.id,
    }));
  });
}

export type CateringOrderInput = {
  id: string;
  name: string;
  mealType: string | null;
  serviceStyle: string | null;
  expectedCount: number | null;
  confirmedCount: number | null;
  guaranteeCount: number | null;
  dietaryNotes: string | null;
  schedules: Schedule[]; // the linked function's
  lineItems: { id: string; description: string; quantity: number | null; unitType: string | null; notes: string | null }[];
};

// Each catering order as its meal (type, style, count), then its line items.
// No menus or prices: the caterer quotes those.
export function cateringLineItems(orders: CateringOrderInput[], support: Set<string>, timezone: string): LineItemRow[] {
  return orders.flatMap((o) => {
    const at = when(o.schedules, support, timezone);
    const meal = {
      ...blank,
      ...at,
      group: o.name,
      description: [o.mealType, o.serviceStyle].filter(Boolean).join(" · ") || o.name,
      quantity: o.guaranteeCount ?? o.confirmedCount ?? o.expectedCount,
      unit: "guests",
      notes: o.dietaryNotes,
      cateringOrderId: o.id,
    };
    const lines = o.lineItems.map((l) => ({
      ...blank,
      ...at,
      group: o.name,
      description: l.description,
      quantity: l.quantity,
      unit: l.unitType,
      notes: l.notes,
      cateringOrderId: o.id,
      cateringLineItemId: l.id,
    }));
    return [meal, ...lines];
  });
}

export type PrintOrderInput = {
  id: string;
  name: string;
  items: { id: string; description: string; quantity: number | null; distributionMethod: string | null; notes: string | null }[];
};

export function printLineItems(orders: PrintOrderInput[]): LineItemRow[] {
  return orders.flatMap((o) =>
    o.items.map((i) => ({
      ...blank,
      day: null,
      endDay: null,
      startTime: null,
      endTime: null,
      group: o.name,
      description: i.description,
      quantity: i.quantity,
      unit: null,
      notes: [i.distributionMethod, i.notes].filter(Boolean).join(" · ") || null,
      printOrderId: o.id,
      printItemId: i.id,
    })),
  );
}

// The order a line item was copied from, whatever its kind.
export const sourceOrderId = (r: Pick<LineItemRow, "avOrderId" | "cateringOrderId" | "printOrderId">) =>
  r.avOrderId ?? r.cateringOrderId ?? r.printOrderId;

// Which orders "Add from orders" draws on, per kind; OTHER has none.
export const ORDER_SOURCE: Record<RfpKind, string | null> = {
  HOTEL: null,
  AV: "AV orders",
  CATERING: "catering orders",
  PRINT: "print orders",
  OTHER: null,
};

// Rows under their group headings, in first-seen order; ungrouped last.
export function groupLineItems<T extends Pick<LineItemRow, "group">>(rows: T[]): { group: string | null; rows: T[] }[] {
  const out: { group: string | null; rows: T[] }[] = [];
  for (const r of rows) {
    const g = r.group?.trim() || null;
    const found = out.find((o) => o.group === g);
    if (found) found.rows.push(r);
    else out.push({ group: g, rows: [r] });
  }
  return [...out.filter((o) => o.group != null), ...out.filter((o) => o.group == null)];
}
