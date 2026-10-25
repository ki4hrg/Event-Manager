// Which automatic workflow checks (src/lib/workflowChecks.ts) hold for each of
// a set of records, read fresh on every call. No auth guard and no event
// filter: callers pass ids they have already proven (the share-route report
// readers use it too, like src/app/events/reports/data.ts).

import type { RfpStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { WorkflowEntityType } from "@/app/events/workflows/entity-types";
import type { WorkflowCheckKey } from "@/lib/workflowChecks";

export type WorkflowCheckValues = Map<string, WorkflowCheckKey[]>;

type FunctionPlace = { type: string; offSiteLocation: string | null; _count: { schedules: number; rooms: number } };
type RfpLine = { awardedQuoteId: string | null; rfp: { status: RfpStatus }; _count: { quoteLines: number } };

const functionPlace = { select: { type: true, offSiteLocation: true, _count: { select: { schedules: true, rooms: true } } } } as const;
const rfpLines = { select: { awardedQuoteId: true, rfp: { select: { status: true } }, _count: { select: { quoteLines: true } } } } as const;
// Lines whose quantity is missing or zero.
const unfilled = () => ({ where: { OR: [{ quantity: null }, { quantity: { lte: 0 } }] }, select: { id: true }, take: 1 });

// A function has a time and a place (a room, an off-site location, or, for a
// breakout block, its sessions' rooms).
function functionScheduled(f: FunctionPlace) {
  return f._count.schedules > 0 && (f._count.rooms > 0 || !!f.offSiteLocation || f.type === "BREAKOUT_BLOCK");
}

function rfpChecks(lines: RfpLine[]): WorkflowCheckKey[] {
  const keys: WorkflowCheckKey[] = [];
  if (lines.some((l) => l.rfp.status === "ISSUED" || l.rfp.status === "CLOSED")) keys.push("RFP_ISSUED");
  if (lines.some((l) => l._count.quoteLines > 0)) keys.push("QUOTES_IN");
  if (lines.length > 0 && lines.every((l) => l.awardedQuoteId)) keys.push("AWARDED");
  return keys;
}

function common(o: { vendor: boolean; functions: FunctionPlace[]; items: boolean }): WorkflowCheckKey[] {
  const keys: WorkflowCheckKey[] = [];
  if (o.vendor) keys.push("VENDOR_ASSIGNED");
  if (o.functions.length > 0) keys.push("LINKED_TO_FUNCTION");
  if (o.functions.length > 0 && o.functions.every(functionScheduled)) keys.push("SCHEDULED");
  if (o.items) keys.push("ITEMS_ENTERED");
  return keys;
}

export async function loadWorkflowChecks(entityType: WorkflowEntityType | string, ids: string[]): Promise<WorkflowCheckValues> {
  const out: WorkflowCheckValues = new Map();
  if (ids.length === 0) return out;
  const where = { id: { in: ids } };
  switch (entityType) {
    case "function": {
      const rows = await prisma.function.findMany({ where, select: { id: true, expectedAttendance: true, ...functionPlace.select } });
      for (const f of rows) {
        const keys: WorkflowCheckKey[] = [];
        if (functionScheduled(f)) keys.push("SCHEDULED");
        if (f.expectedAttendance != null) keys.push("HEADCOUNT_SET");
        out.set(f.id, keys);
      }
      break;
    }
    case "av_order": {
      const rows = await prisma.aVOrder.findMany({
        where,
        select: {
          id: true,
          functionLinks: { select: { function: functionPlace } },
          rfpLineItems: rfpLines,
          _count: { select: { vendors: true, equipmentItems: true } },
          equipmentItems: unfilled(),
        },
      });
      for (const o of rows) {
        out.set(o.id, [
          ...common({
            vendor: o._count.vendors > 0,
            functions: o.functionLinks.map((l) => l.function),
            items: o._count.equipmentItems > 0 && o.equipmentItems.length === 0,
          }),
          ...rfpChecks(o.rfpLineItems),
        ]);
      }
      break;
    }
    case "catering_order": {
      const rows = await prisma.cateringOrder.findMany({
        where,
        select: {
          id: true,
          guaranteeCount: true,
          function: functionPlace,
          rfpLineItems: rfpLines,
          _count: { select: { vendors: true, lineItems: true, menuSections: true } },
        },
      });
      for (const o of rows) {
        const keys = common({
          vendor: o._count.vendors > 0,
          functions: o.function ? [o.function] : [],
          items: o._count.lineItems + o._count.menuSections > 0,
        });
        if (o.guaranteeCount != null) keys.push("HEADCOUNT_SET");
        out.set(o.id, [...keys, ...rfpChecks(o.rfpLineItems)]);
      }
      break;
    }
    case "setup_order": {
      const rows = await prisma.setupOrder.findMany({
        where,
        select: {
          id: true,
          functionLinks: { select: { function: functionPlace } },
          _count: { select: { vendors: true, tables: true, details: true, equipmentItems: true } },
          equipmentItems: unfilled(),
        },
      });
      for (const o of rows) {
        const lines = o._count.tables + o._count.details + o._count.equipmentItems;
        out.set(
          o.id,
          common({ vendor: o._count.vendors > 0, functions: o.functionLinks.map((l) => l.function), items: lines > 0 && o.equipmentItems.length === 0 }),
        );
      }
      break;
    }
    case "print_order": {
      const rows = await prisma.printOrder.findMany({
        where,
        select: {
          id: true,
          functions: { select: { function: functionPlace } },
          rfpLineItems: rfpLines,
          _count: { select: { vendors: true, items: true } },
          items: unfilled(),
        },
      });
      for (const o of rows) {
        out.set(o.id, [
          ...common({ vendor: o._count.vendors > 0, functions: o.functions.map((l) => l.function), items: o._count.items > 0 && o.items.length === 0 }),
          ...rfpChecks(o.rfpLineItems),
        ]);
      }
      break;
    }
    case "supply_order": {
      const rows = await prisma.supplyOrder.findMany({
        where,
        select: {
          id: true,
          providerVendorId: true,
          providerContactId: true,
          functions: { select: { function: functionPlace } },
          _count: { select: { items: true } },
          items: unfilled(),
        },
      });
      for (const o of rows) {
        out.set(
          o.id,
          common({
            vendor: !!(o.providerVendorId || o.providerContactId),
            functions: o.functions.map((l) => l.function),
            items: o._count.items > 0 && o.items.length === 0,
          }),
        );
      }
      break;
    }
    case "media_deliverable": {
      const rows = await prisma.mediaDeliverable.findMany({
        where,
        select: { id: true, providerVendorId: true, providerContactId: true, _count: { select: { functionLinks: true } } },
      });
      for (const o of rows) {
        const keys: WorkflowCheckKey[] = [];
        if (o.providerVendorId || o.providerContactId) keys.push("VENDOR_ASSIGNED");
        if (o._count.functionLinks > 0) keys.push("LINKED_TO_FUNCTION");
        out.set(o.id, keys);
      }
      break;
    }
    // Presentations and form submissions have no checks.
  }
  return out;
}

// Attaches each instance's record's check values, for workflowProgress.
export async function withWorkflowChecks<I extends { entityType: string; entityId: string }>(
  instances: I[],
): Promise<(I & { checks: WorkflowCheckKey[] })[]> {
  const byType = new Map<string, Set<string>>();
  for (const i of instances) {
    if (!byType.has(i.entityType)) byType.set(i.entityType, new Set());
    byType.get(i.entityType)!.add(i.entityId);
  }
  const values = new Map<string, WorkflowCheckValues>();
  await Promise.all(
    Array.from(byType, async ([type, ids]) => {
      values.set(type, await loadWorkflowChecks(type, Array.from(ids)));
    }),
  );
  return instances.map((i) => ({ ...i, checks: values.get(i.entityType)?.get(i.entityId) ?? [] }));
}
