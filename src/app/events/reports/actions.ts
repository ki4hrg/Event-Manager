"use server";

import { prisma } from "@/lib/prisma";
import { optionsWhereForEvent } from "@/lib/options";
import { Prisma } from "@prisma/client";
import type { AcquisitionState, PackingStatus } from "@prisma/client";
import type { ModelType } from "@/app/vendors/actions";
import { buildPackingItems, type PackableItem } from "@/lib/packingItems";
import { ACQUISITION_OPTIONS, PACKING_STATUS_OPTIONS } from "@/lib/statusConstants";
import { resolveOptionLabel } from "@/lib/optionUtils";
import { getDateKeyInTimezone } from "@/lib/agendaUtils";
import { compareRoomsByGroup } from "@/lib/roomGroups";
import { eventVenuesOrderBy } from "@/lib/eventVenues";
import { formatBreakoutSessionName } from "@/lib/breakoutLabels";
import { compareFunctionNumbers, formatFunctionLabel } from "@/lib/functionNumbers";
import { loadEsgNarrativeData } from "@/lib/esg/narrativeData";
import { esgBoothInclude, esgFunctionInclude } from "@/lib/esg/include";
import { assembleEsgDocument, esgDayOptions } from "@/lib/esg/assemble";
import { ESG_PARTS, type EsgPart } from "@/lib/esg/types";
import { assemblePerDocument, loadPerData } from "@/lib/esg/per";
import { compareByMainFunctionTime } from "@/lib/functionSchedules";

export type EquipmentReportFilters = {
  vendorIds?: string[];
  modelTypes?: string[];
};

export type EquipmentSourceRef = {
  orderId: string;
  orderName: string;
  functionType: string;
  functionTypeLabel: string | null;
  functionGroupName: string | null;
  functionNames: string[];
  modelType: "AV_ORDER" | "CATERING_ORDER" | "SETUP_ORDER" | "SUPPLY_ORDER";
  quantity: number;
  isScheduled: boolean;
};

export type EquipmentReportRow = {
  equipmentId: string | null;
  itemName: string;
  category: string | null;
  totalQuantity: number;
  peakNeeded: number;
  peakIsExact: boolean;
  sources: EquipmentSourceRef[];
};

export type ResponsiblePartyGroup = {
  partyType: "vendor" | "contact" | "unassigned";
  partyId: string | null;
  partyName: string;
  rows: EquipmentReportRow[];
};

/** @deprecated use ResponsiblePartyGroup */
export type VendorEquipmentGroup = ResponsiblePartyGroup;


type NormalizedItem = {
  equipmentId: string | null;
  equipmentKey: string;
  itemName: string;
  category: string | null;
  attributionVendorId: string | null;
  attributionVendorName: string | null;
  attributionContactId: string | null;
  attributionContactName: string | null;
  quantity: number;
  orderId: string;
  orderName: string;
  functionType: string;
  functionGroupName: string | null;
  functionNames: string[];
  modelType: "AV_ORDER" | "CATERING_ORDER" | "SETUP_ORDER" | "SUPPLY_ORDER";
  scheduleWindows: { start: Date; end: Date }[];
};

function extractWindows(
  functions: { schedules: { startTime: Date; endTime: Date }[] }[]
): { start: Date; end: Date }[] {
  return functions.flatMap((fn) =>
    fn.schedules.map((s) => ({ start: s.startTime, end: s.endTime }))
  );
}

type FunctionRef = {
  name: string;
  functionNumber: string | null;
  type: string;
  breakoutGroup: { name: string } | null;
  schedules: { startTime: Date; endTime: Date }[];
};

type OrderRef = {
  functionLinks: Array<{ function: FunctionRef }>;
  presentationLinks?: Array<{ presentation: { slots: Array<{ function: FunctionRef }> } }>;
};

function getOrderFns(order: OrderRef): FunctionRef[] {
  const fromLinks = order.functionLinks.map((l) => l.function);
  if (fromLinks.length > 0) return fromLinks;
  return order.presentationLinks?.flatMap((pl) => pl.presentation.slots.map((s) => s.function)) ?? [];
}

// Expands one item into one NormalizedItem per linked function.
// When the same order is applied to N functions, each function is an independent
// use of the equipment — contributing to both total qty and peak scheduling.
// If no functions are linked, falls back to one unscheduled item.
function expandByFunction(
  base: Omit<NormalizedItem, "functionType" | "functionGroupName" | "functionNames" | "scheduleWindows">,
  fns: FunctionRef[]
): NormalizedItem[] {
  if (fns.length === 0) return [{ ...base, functionType: "", functionGroupName: null, functionNames: [], scheduleWindows: [] }];
  return fns.map((fn) => ({
    ...base,
    functionType: fn.type,
    functionGroupName: fn.breakoutGroup?.name ?? null,
    functionNames: [formatFunctionLabel({ name: fn.name, functionNumber: fn.functionNumber })],
    scheduleWindows: extractWindows([fn]),
  }));
}

function calculatePeak(
  sources: { quantity: number; windows: { start: Date; end: Date }[] }[]
): { peak: number; isExact: boolean } {
  const unscheduledQty = sources
    .filter((s) => s.windows.length === 0)
    .reduce((sum, s) => sum + s.quantity, 0);
  const scheduled = sources.filter((s) => s.windows.length > 0);

  if (scheduled.length === 0) {
    return { peak: sources.reduce((sum, s) => sum + s.quantity, 0), isExact: false };
  }

  const events: { time: number; delta: number }[] = [];
  for (const s of scheduled) {
    for (const w of s.windows) {
      events.push({ time: w.start.getTime(), delta: s.quantity });
      events.push({ time: w.end.getTime(), delta: -s.quantity });
    }
  }
  // Process end events before start events at the same timestamp (non-overlapping = no double-count)
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);

  let current = 0;
  let peak = 0;
  for (const e of events) {
    current += e.delta;
    peak = Math.max(peak, current);
  }

  return { peak: peak + unscheduledQty, isExact: unscheduledQty === 0 };
}

export async function getEquipmentResponsibilityData(
  eventId: string,
  filters?: EquipmentReportFilters
): Promise<VendorEquipmentGroup[]> {
  const [equipmentItems, inputItems, monitorMixes, setupTables, supplyOrderItems, functionTypeOptions] = await Promise.all([
    prisma.equipmentItem.findMany({
      where: {
        OR: [
          { cateringOrder: { eventId } },
          { setupOrder: { eventId } },
          { avOrder: { eventId } },
          { videoSection: { avOrder: { eventId } } },
        ],
      },
      include: {
        equipment: { select: { id: true, name: true, category: true } },
        providerVendor: { select: { id: true, name: true } },
        providerContact: { select: { id: true, firstName: true, lastName: true } },
        cateringOrder: {
          select: {
            id: true,
            name: true,
            function: { select: { name: true, functionNumber: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } },
          },
        },
        setupOrder: {
          select: {
            id: true,
            name: true,
            functionLinks: { select: { function: { select: { name: true, functionNumber: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } },
            presentationLinks: { select: { presentation: { select: { slots: { select: { function: { select: { name: true, functionNumber: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } } } },
          },
        },
        avOrder: {
          select: {
            id: true,
            name: true,
            functionLinks: { select: { function: { select: { name: true, functionNumber: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } },
            presentationLinks: { select: { presentation: { select: { slots: { select: { function: { select: { name: true, functionNumber: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } } } },
          },
        },
        videoSection: {
          select: {
            avOrder: {
              select: {
                id: true,
                name: true,
                functionLinks: { select: { function: { select: { name: true, functionNumber: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } },
                presentationLinks: { select: { presentation: { select: { slots: { select: { function: { select: { name: true, functionNumber: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } } } },
              },
            },
          },
        },
      },
    }),
    prisma.inputItem.findMany({
      where: { inputGroup: { audioSection: { avOrder: { eventId } } } },
      include: {
        equipment: { select: { id: true, name: true, category: true } },
        providerVendor: { select: { id: true, name: true } },
        providerContact: { select: { id: true, firstName: true, lastName: true } },
        inputGroup: {
          select: {
            audioSection: {
              select: {
                avOrder: {
                  select: {
                    id: true,
                    name: true,
                    functionLinks: { select: { function: { select: { name: true, functionNumber: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } },
                    presentationLinks: { select: { presentation: { select: { slots: { select: { function: { select: { name: true, functionNumber: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } } } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.monitorMix.findMany({
      where: { audioSection: { avOrder: { eventId } } },
      include: {
        equipment: { select: { id: true, name: true, category: true } },
        providerVendor: { select: { id: true, name: true } },
        providerContact: { select: { id: true, firstName: true, lastName: true } },
        audioSection: {
          select: {
            avOrder: {
              select: {
                id: true,
                name: true,
                functionLinks: { select: { function: { select: { name: true, functionNumber: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } },
                presentationLinks: { select: { presentation: { select: { slots: { select: { function: { select: { name: true, functionNumber: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } } } },
              },
            },
          },
        },
      },
    }),
    prisma.setupTable.findMany({
      where: { setupOrder: { eventId } },
      include: {
        providerVendor: { select: { id: true, name: true } },
        setupOrder: {
          select: {
            id: true,
            name: true,
            functionLinks: { select: { function: { select: { name: true, functionNumber: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } },
            presentationLinks: { select: { presentation: { select: { slots: { select: { function: { select: { name: true, functionNumber: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } } } },
          },
        },
      },
    }),
    prisma.supplyOrderItem.findMany({
      // Container lines are shipping units, not equipment — this report
      // aggregates equipment by responsible party.
      where: { supplyOrder: { eventId }, containerLocationId: null },
      include: {
        equipment: { select: { id: true, name: true, category: true } },
        providerVendor: { select: { id: true, name: true } },
        providerContact: { select: { id: true, firstName: true, lastName: true } },
        supplyOrder: {
          select: {
            id: true,
            name: true,
            providerVendor: { select: { id: true, name: true } },
            providerContact: { select: { id: true, firstName: true, lastName: true } },
            functions: { select: { function: { select: { name: true, functionNumber: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } },
            presentations: { select: { presentation: { select: { slots: { select: { function: { select: { name: true, functionNumber: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } } } },
          },
        },
      },
    }),
    prisma.customOption.findMany({
      where: optionsWhereForEvent(eventId, "function_type"),
      select: { label: true },
    }),
  ]);

  const normalized: NormalizedItem[] = [];

  for (const item of equipmentItems) {
    const attrVendor = item.providerVendor;
    const attrContact = item.providerContact;
    let orderId: string;
    let orderName: string;
    let modelType: "AV_ORDER" | "CATERING_ORDER" | "SETUP_ORDER" | "SUPPLY_ORDER";
    let fns: FunctionRef[];

    if (item.cateringOrder) {
      orderId = item.cateringOrder.id;
      orderName = item.cateringOrder.name;
      modelType = "CATERING_ORDER";
      fns = item.cateringOrder.function ? [item.cateringOrder.function] : [];
    } else if (item.setupOrder) {
      orderId = item.setupOrder.id;
      orderName = item.setupOrder.name ?? "";
      modelType = "SETUP_ORDER";
      fns = getOrderFns(item.setupOrder);
    } else if (item.avOrder) {
      orderId = item.avOrder.id;
      orderName = item.avOrder.name ?? "";
      modelType = "AV_ORDER";
      fns = getOrderFns(item.avOrder);
    } else if (item.videoSection?.avOrder) {
      orderId = item.videoSection.avOrder.id;
      orderName = item.videoSection.avOrder.name ?? "";
      modelType = "AV_ORDER";
      fns = getOrderFns(item.videoSection.avOrder);
    } else {
      continue;
    }

    const base = {
      equipmentId: item.equipmentId,
      equipmentKey: item.equipmentId ?? `item:${item.item.toLowerCase()}`,
      itemName: item.equipment?.name ?? item.item,
      category: item.equipment?.category ?? null,
      attributionVendorId: attrVendor?.id ?? null,
      attributionVendorName: attrVendor?.name ?? null,
      attributionContactId: attrVendor ? null : (attrContact?.id ?? null),
      attributionContactName: attrVendor ? null : (attrContact ? `${attrContact.firstName} ${attrContact.lastName}` : null),
      quantity: item.quantity ?? 1,
      orderId,
      orderName,
      modelType,
    };
    normalized.push(...expandByFunction(base, fns));
  }

  for (const item of inputItems) {
    const avOrder = item.inputGroup.audioSection.avOrder;
    const attrVendor = item.providerVendor;
    const attrContact = item.providerContact;
    const base = {
      equipmentId: item.equipmentId,
      equipmentKey: item.equipmentId ?? `item:${item.description.toLowerCase()}`,
      itemName: item.equipment?.name ?? item.description,
      category: item.equipment?.category ?? null,
      attributionVendorId: attrVendor?.id ?? null,
      attributionVendorName: attrVendor?.name ?? null,
      attributionContactId: attrVendor ? null : (attrContact?.id ?? null),
      attributionContactName: attrVendor ? null : (attrContact ? `${attrContact.firstName} ${attrContact.lastName}` : null),
      quantity: item.quantity,
      orderId: avOrder.id,
      orderName: avOrder.name ?? "",
      modelType: "AV_ORDER" as const,
    };
    normalized.push(...expandByFunction(base, getOrderFns(avOrder)));
  }

  for (const item of monitorMixes) {
    const avOrder = item.audioSection.avOrder;
    const attrVendor = item.providerVendor;
    const attrContact = item.providerContact;
    const base = {
      equipmentId: item.equipmentId,
      equipmentKey: item.equipmentId ?? `item:${item.description.toLowerCase()}`,
      itemName: item.equipment?.name ?? item.description,
      category: item.equipment?.category ?? null,
      attributionVendorId: attrVendor?.id ?? null,
      attributionVendorName: attrVendor?.name ?? null,
      attributionContactId: attrVendor ? null : (attrContact?.id ?? null),
      attributionContactName: attrVendor ? null : (attrContact ? `${attrContact.firstName} ${attrContact.lastName}` : null),
      quantity: 1,
      orderId: avOrder.id,
      orderName: avOrder.name ?? "",
      modelType: "AV_ORDER" as const,
    };
    normalized.push(...expandByFunction(base, getOrderFns(avOrder)));
  }

  for (const table of setupTables) {
    const attrVendor = table.providerVendor;
    const fns = getOrderFns(table.setupOrder);
    const baseAttrs = {
      attributionVendorId: attrVendor?.id ?? null,
      attributionVendorName: attrVendor?.name ?? null,
      attributionContactId: null,
      attributionContactName: null,
      orderId: table.setupOrderId,
      orderName: table.setupOrder.name ?? "",
      modelType: "SETUP_ORDER" as const,
    };

    if (table.tableType && table.quantity > 0) {
      const key = `table:${table.tableType.toLowerCase()}`;
      normalized.push(...expandByFunction({
        equipmentId: null,
        equipmentKey: key,
        itemName: table.tableType,
        category: "Tables",
        ...baseAttrs,
        quantity: table.quantity,
      }, fns));
    }

    if (table.chairCount && table.chairCount > 0) {
      const chairLabel = table.chairType || "Chairs";
      const key = `chair:${chairLabel.toLowerCase()}`;
      const totalChairs = table.quantity > 0 ? table.quantity * table.chairCount : table.chairCount;
      normalized.push(...expandByFunction({
        equipmentId: null,
        equipmentKey: key,
        itemName: chairLabel,
        category: "Chairs",
        ...baseAttrs,
        quantity: totalChairs,
      }, fns));
    }
  }

  for (const item of supplyOrderItems) {
    const order = item.supplyOrder;
    // Item-level provider overrides the order-level provider; mirrors
    // SupplyOrderItemPanel's resolveProvider precedence.
    const attrVendor = item.providerVendor ?? order.providerVendor;
    const attrContact = item.providerVendor ? null : (item.providerContact ?? order.providerContact);
    const fromFunctions = order.functions.map((l) => l.function);
    const fns: FunctionRef[] = fromFunctions.length > 0
      ? fromFunctions
      : order.presentations.flatMap((pl) => pl.presentation.slots.map((s) => s.function));
    const itemLabel = item.equipment?.name ?? item.description ?? "";
    if (!itemLabel) continue;
    const equipmentKey = item.equipmentId ?? `item:${itemLabel.toLowerCase()}`;
    const base = {
      equipmentId: item.equipmentId,
      equipmentKey,
      itemName: itemLabel,
      category: item.equipment?.category ?? null,
      attributionVendorId: attrVendor?.id ?? null,
      attributionVendorName: attrVendor?.name ?? null,
      attributionContactId: attrVendor ? null : (attrContact?.id ?? null),
      attributionContactName: attrVendor ? null : (attrContact ? `${attrContact.firstName} ${attrContact.lastName}` : null),
      quantity: item.quantity ?? 1,
      orderId: order.id,
      orderName: order.name,
      modelType: "SUPPLY_ORDER" as const,
    };
    normalized.push(...expandByFunction(base, fns));
  }

  let filtered = normalized;
  if (filters?.vendorIds?.length) {
    filtered = filtered.filter((item) =>
      filters.vendorIds!.includes(item.attributionVendorId ?? "__unassigned__")
    );
  }
  if (filters?.modelTypes?.length) {
    filtered = filtered.filter((item) => filters.modelTypes!.includes(item.modelType));
  }

  type PartyBucket = {
    partyType: "vendor" | "contact" | "unassigned";
    partyId: string | null;
    partyName: string;
    equipmentMap: Map<
      string,
      {
        equipmentId: string | null;
        itemName: string;
        category: string | null;
        sources: { quantity: number; windows: { start: Date; end: Date }[]; source: EquipmentSourceRef }[];
      }
    >;
  };

  const partyMap = new Map<string, PartyBucket>();

  for (const item of filtered) {
    let partyKey: string;
    let bucket: Omit<PartyBucket, "equipmentMap">;

    if (item.attributionVendorId) {
      partyKey = `vendor:${item.attributionVendorId}`;
      bucket = { partyType: "vendor", partyId: item.attributionVendorId, partyName: item.attributionVendorName! };
    } else if (item.attributionContactId) {
      partyKey = `contact:${item.attributionContactId}`;
      bucket = { partyType: "contact", partyId: item.attributionContactId, partyName: item.attributionContactName! };
    } else {
      partyKey = "__unassigned__";
      bucket = { partyType: "unassigned", partyId: null, partyName: "Unassigned" };
    }

    let party = partyMap.get(partyKey);
    if (!party) {
      party = { ...bucket, equipmentMap: new Map() };
      partyMap.set(partyKey, party);
    }

    if (!party.equipmentMap.has(item.equipmentKey)) {
      party.equipmentMap.set(item.equipmentKey, {
        equipmentId: item.equipmentId,
        itemName: item.itemName,
        category: item.category,
        sources: [],
      });
    }
    party.equipmentMap.get(item.equipmentKey)!.sources.push({
      quantity: item.quantity,
      windows: item.scheduleWindows,
      source: {
        orderId: item.orderId,
        orderName: item.orderName,
        functionType: item.functionType,
        functionTypeLabel: null,
        functionGroupName: item.functionGroupName,
        functionNames: item.functionNames,
        modelType: item.modelType,
        quantity: item.quantity,
        isScheduled: item.scheduleWindows.length > 0,
      },
    });
  }

  const groups: ResponsiblePartyGroup[] = [];
  for (const partyData of Array.from(partyMap.values())) {
    const rows: EquipmentReportRow[] = [];

    for (const eqData of Array.from(partyData.equipmentMap.values())) {
      // Two groupings from the same pass:
      // - displayMap (by function type+group): sum qty per type/track for display
      // - peakMap (by orderId+functionSlot): sum concurrent items within the same
      //   order+function (e.g. Secretary Mic + Bishop Mic both active at Plenary 1),
      //   then sweep-line across slots for true peak
      const displayMap = new Map<string, {
        displayQty: number;
        isScheduled: boolean;
        source: EquipmentSourceRef;
      }>();
      const peakMap = new Map<string, {
        peakQty: number;
        windowKeys: Set<string>;
        windows: { start: Date; end: Date }[];
      }>();
      let totalQuantity = 0;

      for (const s of eqData.sources) {
        totalQuantity += s.quantity;

        // Display grouping by function type + breakout group; fall back to orderId for untyped functions
        const displayKey = s.source.functionType === "BREAKOUT_BLOCK"
          ? `breakout::${s.source.functionGroupName ?? ""}`
          : s.source.functionType
            ? `type::${s.source.functionType}`
            : `order::${s.source.orderId}`;
        const disp = displayMap.get(displayKey);
        if (!disp) {
          displayMap.set(displayKey, {
            displayQty: s.quantity,
            isScheduled: s.source.isScheduled,
            source: { ...s.source },
          });
        } else {
          disp.displayQty += s.quantity;
          disp.isScheduled = disp.isScheduled || s.source.isScheduled;
        }

        // Peak grouping by (orderId, functionSlot): items from the same order running
        // at the same function are concurrent and must be summed, not maxed
        const fnSlot = s.source.functionNames[0] ?? "__none__";
        const peakKey = `${s.source.orderId}::${fnSlot}`;
        const pk = peakMap.get(peakKey);
        if (!pk) {
          const windowKeys = new Set(s.windows.map((w) => `${w.start.getTime()},${w.end.getTime()}`));
          peakMap.set(peakKey, { peakQty: s.quantity, windowKeys, windows: [...s.windows] });
        } else {
          pk.peakQty += s.quantity;
          for (const w of s.windows) {
            const wKey = `${w.start.getTime()},${w.end.getTime()}`;
            if (!pk.windowKeys.has(wKey)) {
              pk.windowKeys.add(wKey);
              pk.windows.push(w);
            }
          }
        }
      }

      const { peak, isExact } = calculatePeak(
        Array.from(peakMap.values()).map((e) => ({ quantity: e.peakQty, windows: e.windows }))
      );

      rows.push({
        equipmentId: eqData.equipmentId,
        itemName: eqData.itemName,
        category: eqData.category,
        totalQuantity,
        peakNeeded: peak,
        peakIsExact: isExact,
        sources: Array.from(displayMap.values()).map((d) => ({
          ...d.source,
          quantity: d.displayQty,
          isScheduled: d.isScheduled,
          functionTypeLabel: d.source.functionType === "BREAKOUT_BLOCK"
            ? null
            : (resolveOptionLabel(d.source.functionType, functionTypeOptions) || null),
        })),
      });
    }

    // ￿ sorts after all normal Unicode text, pushing null-category rows last
    const SORT_LAST = "￿";
    rows.sort((a, b) => {
      const catA = a.category ?? SORT_LAST;
      const catB = b.category ?? SORT_LAST;
      if (catA !== catB) return catA.localeCompare(catB);
      return a.itemName.localeCompare(b.itemName);
    });

    groups.push({ partyType: partyData.partyType, partyId: partyData.partyId, partyName: partyData.partyName, rows });
  }

  // Named vendors alphabetically → named contacts alphabetically → Unassigned last
  groups.sort((a, b) => {
    if (a.partyType === "unassigned") return 1;
    if (b.partyType === "unassigned") return -1;
    if (a.partyType !== b.partyType) {
      return a.partyType === "vendor" ? -1 : 1;
    }
    return a.partyName.localeCompare(b.partyName);
  });

  return groups;
}

// ─── Event Profile Report ─────────────────────────────────────────────────────

export type EventProfileFilters = {
  days?: string[]; // YYYY-MM-DD keys in event timezone
  types?: string[]; // FunctionSchedule.type labels to keep
};

function functionMatchesDays(
  schedules: { startTime: Date }[],
  dayKeys: Set<string>,
  timezone: string
): boolean {
  if (schedules.length === 0) return false;
  return schedules.some((s) => dayKeys.has(getDateKeyInTimezone(s.startTime, timezone)));
}

export async function getEventProfileData(
  eventId: string,
  opts: EventProfileFilters = {}
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      venues: {
        orderBy: eventVenuesOrderBy,
        include: {
          venue: {
            include: {
              contacts: {
                include: {
                  contact: {
                    select: { id: true, firstName: true, lastName: true, email: true, phone: true, organization: true },
                  },
                },
                orderBy: { id: "asc" },
              },
            },
          },
        },
      },
    },
  });
  if (!event) return null;

  const timezone = event.timezone;
  const dayKeys = opts.days && opts.days.length > 0 ? new Set(opts.days) : null;
  const typeKeys = opts.types && opts.types.length > 0 ? new Set(opts.types) : null;

  const functionScheduleInclude = {
    schedules: { orderBy: { sortOrder: "asc" as const } },
    rooms: { include: { room: { select: { id: true, name: true } } } },
    contacts: {
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, organization: true },
        },
      },
      orderBy: { id: "asc" as const },
    },
  };

  const [keyStaff, allFunctions, breakoutGroups, cateringOrders, printOrders, allScheduleItems] = await Promise.all([
    prisma.eventKeyStaff.findMany({
      where: { eventId },
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, organization: true },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.function.findMany({
      where: { eventId, type: { not: "BREAKOUT_BLOCK" } },
      include: { ...functionScheduleInclude, updatedBy: { select: { name: true, email: true } } },
    }),
    prisma.breakoutGroup.findMany({
      where: { eventId },
      include: {
        rooms: { include: { room: { select: { id: true, name: true } } } },
        functions: {
          where: { type: "BREAKOUT_BLOCK" },
          include: {
            schedules: { orderBy: { sortOrder: "asc" } },
            sessionRoomOverrides: true,
            presentationSlots: {
              include: {
                presentation: {
                  include: {
                    speakers: {
                      include: {
                        contact: {
                          select: { id: true, firstName: true, lastName: true },
                        },
                      },
                      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
                    },
                    updatedBy: { select: { name: true, email: true } },
                  },
                },
                room: { select: { id: true, name: true } },
              },
            },
            updatedBy: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.cateringOrder.findMany({
      where: { eventId },
      include: {
        function: { include: functionScheduleInclude },
        menuSections: {
          include: { responsiblePartyVendor: { select: { id: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
        additionalServiceLocations: {
          include: {
            function: { include: { schedules: { orderBy: { sortOrder: "asc" } } } },
          },
          orderBy: { sortOrder: "asc" },
        },
        vendors: {
          include: { vendor: { select: { id: true, name: true } } },
        },
        updatedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.printOrder.findMany({
      where: { eventId },
      include: {
        room: { select: { id: true, name: true } },
        vendors: { include: { vendor: { select: { id: true, name: true } } } },
        functions: { include: { function: { select: { id: true, name: true, functionNumber: true } } } },
        presentation: { select: { id: true, title: true } },
        updatedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.functionSchedule.findMany({
      where: { function: { eventId } },
      include: {
        function: {
          select: {
            id: true,
            name: true,
            functionNumber: true,
            type: true,
            status: true,
            substatus: true,
            offSiteLocation: true,
            breakoutGroup: { select: { name: true } },
            rooms: { include: { room: { select: { id: true, name: true } } } },
            updatedAt: true,
            updatedBy: { select: { name: true, email: true } },
          },
        },
      },
      orderBy: { startTime: "asc" },
    }),
  ]);

  const filteredFunctions = dayKeys
    ? allFunctions.filter((fn) => functionMatchesDays(fn.schedules, dayKeys, timezone))
    : allFunctions;

  const filteredBreakoutGroups = dayKeys
    ? breakoutGroups
        .map((g) => ({
          ...g,
          functions: g.functions.filter((fn) => functionMatchesDays(fn.schedules, dayKeys, timezone)),
        }))
        .filter((g) => g.functions.length > 0)
    : breakoutGroups.filter((g) => g.functions.length > 0);

  const filteredCateringOrders = (
    dayKeys
      ? cateringOrders.filter((c) => {
          if (c.function && functionMatchesDays(c.function.schedules, dayKeys, timezone)) return true;
          return c.additionalServiceLocations.some((loc) =>
            loc.function ? functionMatchesDays(loc.function.schedules, dayKeys, timezone) : false
          );
        })
      : cateringOrders
  ).slice().sort(compareByMainFunctionTime);

  const filteredScheduleItems = allScheduleItems.filter((item) => {
    if (dayKeys && !dayKeys.has(getDateKeyInTimezone(item.startTime, timezone))) return false;
    if (typeKeys && !typeKeys.has(item.type)) return false;
    return true;
  });

  const availableDayKeys = Array.from(
    new Set(allScheduleItems.map((item) => getDateKeyInTimezone(item.startTime, timezone)))
  ).sort();

  return {
    event,
    venues: event.venues.map((v) => v.venue),
    keyStaff,
    functions: filteredFunctions,
    breakoutGroups: filteredBreakoutGroups,
    cateringOrders: filteredCateringOrders,
    printOrders,
    scheduleItems: filteredScheduleItems,
    availableDayKeys,
    timezone,
  };
}

export type EventProfileData = NonNullable<Awaited<ReturnType<typeof getEventProfileData>>>;

export async function getOrderAssignedVendors(eventId: string) {
  const vendors = await prisma.vendor.findMany({
    where: {
      OR: [
        { cateringOrderVendors: { some: { cateringOrder: { eventId } } } },
        { avOrderVendors: { some: { avOrder: { eventId } } } },
        { setupOrderVendors: { some: { setupOrder: { eventId } } } },
        { supplyOrdersAsProvider: { some: { eventId } } },
        { supplyOrderItemsAsProvider: { some: { supplyOrder: { eventId } } } },
      ],
    },
    select: { id: true, name: true },
    distinct: ["id"],
    orderBy: { name: "asc" },
  });
  return vendors;
}

const partySelect = {
  providerVendor: { select: { id: true, name: true } },
  providerContact: { select: { id: true, firstName: true, lastName: true } },
  operatorVendor: { select: { id: true, name: true } },
  operatorContact: { select: { id: true, firstName: true, lastName: true } },
} as const;

const equipmentItemInclude = {
  equipment: { select: { id: true, name: true, category: true } },
  ...partySelect,
} as const;

const functionInclude = {
  schedules: { orderBy: { sortOrder: "asc" as const } },
  rooms: { include: { room: { select: { id: true, name: true } } } },
  breakoutGroup: { select: { name: true } },
} as const;

export async function getVendorHandoffData(eventId: string, vendorId: string) {
  const [vendor, cateringOrders, avOrders, setupOrders, supplyOrders] = await Promise.all([
    // Scoped to the event's tenant so a share link can't be pointed at another
    // tenant's vendor by swapping the id in the URL.
    prisma.vendor.findFirst({
      where: { id: vendorId, tenant: { events: { some: { id: eventId } } } },
      include: {
        contacts: {
          include: {
            contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          },
          orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
        },
      },
    }),
    prisma.cateringOrder.findMany({
      where: { eventId, vendors: { some: { vendorId } } },
      include: {
        function: { include: functionInclude },
        timelineItems: { orderBy: { sortOrder: "asc" } },
        menuSections: {
          include: { responsiblePartyVendor: { select: { id: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
        additionalServiceLocations: {
          include: {
            function: { include: functionInclude },
          },
          orderBy: { sortOrder: "asc" },
        },
        equipmentItems: { include: equipmentItemInclude, orderBy: { sortOrder: "asc" } },
        updatedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.aVOrder.findMany({
      where: { eventId, vendors: { some: { vendorId } } },
      include: {
        functionLinks: { include: { function: { include: functionInclude } } },
        presentationLinks: {
          include: {
            presentation: {
              select: {
                id: true,
                title: true,
                slots: {
                  include: {
                    function: { include: functionInclude },
                    room: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
        audioSection: {
          include: {
            inputGroups: {
              include: {
                ...partySelect,
                inputItems: {
                  include: {
                    equipment: { select: { id: true, name: true, category: true } },
                    ...partySelect,
                  },
                  orderBy: { sortOrder: "asc" },
                },
              },
              orderBy: { sortOrder: "asc" },
            },
            monitorMixes: {
              include: {
                equipment: { select: { id: true, name: true, category: true } },
                ...partySelect,
              },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
        videoSection: {
          include: {
            equipmentItems: { include: equipmentItemInclude, orderBy: { sortOrder: "asc" } },
          },
        },
        equipmentItems: { include: equipmentItemInclude, orderBy: { sortOrder: "asc" } },
        updatedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.setupOrder.findMany({
      where: { eventId, vendors: { some: { vendorId } } },
      include: {
        room: { select: { id: true, name: true } },
        functionLinks: { include: { function: { include: functionInclude } } },
        presentationLinks: {
          include: {
            presentation: {
              select: {
                id: true,
                title: true,
                slots: {
                  include: {
                    function: { include: functionInclude },
                    room: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
        tables: {
          include: { providerVendor: { select: { id: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
        details: {
          include: { responsiblePartyVendor: { select: { id: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
        equipmentItems: { include: equipmentItemInclude, orderBy: { sortOrder: "asc" } },
        updatedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.supplyOrder.findMany({
      where: {
        eventId,
        OR: [
          { providerVendorId: vendorId },
          { items: { some: { providerVendorId: vendorId } } },
        ],
      },
      include: {
        room: { select: { id: true, name: true } },
        providerVendor: { select: { id: true, name: true } },
        providerContact: { select: { id: true, firstName: true, lastName: true } },
        functions: { include: { function: { include: functionInclude } } },
        presentations: {
          include: {
            presentation: {
              select: {
                id: true,
                title: true,
                slots: {
                  include: {
                    function: { include: functionInclude },
                    room: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
        items: {
          include: {
            equipment: { select: { id: true, name: true, category: true } },
            sourceLocation: { select: { id: true, name: true } },
            providerVendor: { select: { id: true, name: true } },
            providerContact: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
        updatedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!vendor) return null;

  const relevantModelTypes: ModelType[] = [
    ...(cateringOrders.length > 0 ? (["CATERING_ORDER"] as const) : []),
    ...(avOrders.length > 0 ? (["AV_ORDER"] as const) : []),
    ...(setupOrders.length > 0 ? (["SETUP_ORDER"] as const) : []),
    ...(supplyOrders.length > 0 ? (["SUPPLY_ORDER"] as const) : []),
  ];

  const keyStaff =
    relevantModelTypes.length > 0
      ? await prisma.eventKeyStaff.findMany({
          where: { eventId, models: { hasSome: relevantModelTypes } },
          include: {
            contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          },
          orderBy: { sortOrder: "asc" },
        })
      : [];

  const avOrdersShaped = avOrders.map((o) => ({
    ...o,
    functions: o.functionLinks.map((l) => l.function),
    presentations: o.presentationLinks.map((l) => l.presentation),
  }));
  const setupOrdersShaped = setupOrders.map((o) => ({
    ...o,
    functions: o.functionLinks.map((l) => l.function),
    presentations: o.presentationLinks.map((l) => l.presentation),
  }));
  // SupplyOrder already uses `functions`/`presentations` as the relation names,
  // so reshape just the junction wrappers to match avOrders/setupOrders.
  const supplyOrdersShaped = supplyOrders.map((o) => ({
    ...o,
    functions: o.functions.map((l) => l.function),
    presentations: o.presentations.map((l) => l.presentation),
  }));

  return {
    vendor,
    cateringOrders,
    avOrders: avOrdersShaped,
    setupOrders: setupOrdersShaped,
    supplyOrders: supplyOrdersShaped,
    keyStaff,
  };
}

// ── Room Schedule report ──────────────────────────────────────────────────────

export type RoomScheduleFilters = {
  roomIds?: string[];
  days?: string[];
};

export async function getRoomScheduleData(eventId: string, opts: RoomScheduleFilters = {}) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, timezone: true },
  });
  if (!event) return null;

  const timezone = event.timezone;
  const dayKeys = opts.days && opts.days.length > 0 ? new Set(opts.days) : null;
  const roomIdFilter = opts.roomIds && opts.roomIds.length > 0 ? new Set(opts.roomIds) : null;

  const [eventVenues, rooms, allFunctions] = await Promise.all([
    prisma.eventVenue.findMany({ where: { eventId }, orderBy: eventVenuesOrderBy, select: { venueId: true } }),
    prisma.room.findMany({
      where: {
        OR: [
          { functions: { some: { function: { eventId } } } },
          { presentationSlots: { some: { function: { eventId } } } },
        ],
      },
      include: {
        venue: { select: { id: true, name: true } },
        group: { select: { id: true, name: true, sortOrder: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.function.findMany({
      where: { eventId },
      include: {
        schedules: { orderBy: { sortOrder: "asc" } },
        rooms: { include: { room: { select: { id: true, name: true } } } },
        breakoutGroup: { select: { name: true } },
        contacts: {
          include: {
            contact: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { id: "asc" },
        },
        presentationSlots: {
          include: {
            presentation: {
              include: {
                speakers: {
                  include: {
                    contact: { select: { id: true, firstName: true, lastName: true } },
                  },
                  orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
                },
                updatedBy: { select: { name: true, email: true } },
              },
            },
            room: { select: { id: true, name: true } },
          },
        },
        updatedBy: { select: { name: true, email: true } },
      },
    }),
  ]);

  const functions = dayKeys
    ? allFunctions.filter((fn) => functionMatchesDays(fn.schedules, dayKeys, timezone))
    : allFunctions;

  // Venues in event order (primary first). A room still assigned after its
  // venue was removed from the event sorts after them, by venue name.
  const venueRank = new Map(eventVenues.map((ev, i) => [ev.venueId, i]));
  rooms.sort((a, b) => {
    const ra = venueRank.get(a.venueId) ?? Number.MAX_SAFE_INTEGER;
    const rb = venueRank.get(b.venueId) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    const va = a.venue?.name ?? "";
    const vb = b.venue?.name ?? "";
    if (va !== vb) return va.localeCompare(vb);
    return compareRoomsByGroup(a, b);
  });

  const filteredRooms = roomIdFilter ? rooms.filter((r) => roomIdFilter.has(r.id)) : rooms;

  const roomBuckets = filteredRooms.map((room) => {
    const regularFunctions = functions.filter(
      (fn) => fn.type !== "BREAKOUT_BLOCK" && fn.rooms.some((r) => r.roomId === room.id)
    );

    const breakoutEntries = functions
      .filter((fn) => fn.type === "BREAKOUT_BLOCK")
      .flatMap((block) =>
        block.presentationSlots
          .filter((slot) => slot.roomId === room.id)
          .map((slot) => ({ block, slot }))
      );

    return { room, regularFunctions, breakoutEntries };
  });

  const availableDayKeys = Array.from(
    new Set(
      allFunctions.flatMap((fn) =>
        fn.schedules.map((s) => getDateKeyInTimezone(s.startTime, timezone))
      )
    )
  ).sort();

  return {
    timezone,
    rooms,
    roomBuckets,
    availableDayKeys,
  };
}

export type RoomScheduleData = NonNullable<Awaited<ReturnType<typeof getRoomScheduleData>>>;

// ── Function Detail report ───────────────────────────────────────────────────

export type FunctionDetailFilters = {
  functionIds?: string[];
};

const fdVendorSelect = { select: { id: true, name: true } } satisfies Prisma.VendorDefaultArgs;
const fdContactSelect = { select: { id: true, firstName: true, lastName: true } } satisfies Prisma.ContactDefaultArgs;

const fdPartyInclude = {
  providerVendor: fdVendorSelect,
  providerContact: fdContactSelect,
  operatorVendor: fdVendorSelect,
  operatorContact: fdContactSelect,
};

const fdEquipmentItemInclude = {
  equipment: { select: { id: true, name: true, category: true } },
  ...fdPartyInclude,
} satisfies Prisma.EquipmentItemInclude;

const fdAVOrderInclude = {
  vendors: { include: { vendor: fdVendorSelect } },
  audioSection: {
    include: {
      inputGroups: {
        include: {
          ...fdPartyInclude,
          inputItems: {
            include: {
              equipment: { select: { id: true, name: true, category: true } },
              ...fdPartyInclude,
            },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      monitorMixes: {
        include: {
          equipment: { select: { id: true, name: true, category: true } },
          ...fdPartyInclude,
          monitorOutputs: {
            include: {
              equipment: { select: { id: true, name: true, category: true } },
              ...fdPartyInclude,
            },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  },
  videoSection: {
    include: {
      equipmentItems: { include: fdEquipmentItemInclude, orderBy: { sortOrder: "asc" } },
    },
  },
  equipmentItems: { include: fdEquipmentItemInclude, orderBy: { sortOrder: "asc" } },
  updatedBy: { select: { name: true, email: true } },
} satisfies Prisma.AVOrderInclude;

const fdSetupOrderInclude = {
  room: { select: { id: true, name: true } },
  vendors: { include: { vendor: fdVendorSelect } },
  tables: {
    include: { providerVendor: fdVendorSelect },
    orderBy: { sortOrder: "asc" },
  },
  details: {
    include: { responsiblePartyVendor: fdVendorSelect },
    orderBy: { sortOrder: "asc" },
  },
  equipmentItems: { include: fdEquipmentItemInclude, orderBy: { sortOrder: "asc" } },
  updatedBy: { select: { name: true, email: true } },
} satisfies Prisma.SetupOrderInclude;

const fdPrintOrderInclude = {
  room: { select: { id: true, name: true } },
  vendors: { include: { vendor: fdVendorSelect } },
  items: {
    include: {
      designerVendor: fdVendorSelect,
      designerContact: fdContactSelect,
      printerVendor: fdVendorSelect,
      printerContact: fdContactSelect,
      sourceLocation: { select: { id: true, name: true } },
    },
    orderBy: { sortOrder: "asc" },
  },
  updatedBy: { select: { name: true, email: true } },
} satisfies Prisma.PrintOrderInclude;

const fdMediaDeliverableInclude = {
  providerVendor: fdVendorSelect,
  providerContact: fdContactSelect,
  contacts: { include: { contact: fdContactSelect }, orderBy: { id: "asc" } },
  updatedBy: { select: { name: true, email: true } },
} satisfies Prisma.MediaDeliverableInclude;

const fdSupplyOrderInclude = {
  room: { select: { id: true, name: true } },
  providerVendor: fdVendorSelect,
  providerContact: fdContactSelect,
  items: {
    include: {
      equipment: { select: { id: true, name: true, category: true } },
      providerVendor: fdVendorSelect,
      providerContact: fdContactSelect,
      sourceLocation: { select: { id: true, name: true } },
    },
    orderBy: { sortOrder: "asc" },
  },
  updatedBy: { select: { name: true, email: true } },
} satisfies Prisma.SupplyOrderInclude;

const fdCateringOrderInclude = {
  function: { select: { id: true, name: true, functionNumber: true } },
  vendors: { include: { vendor: fdVendorSelect } },
  lineItems: { orderBy: { sortOrder: "asc" } },
  menuSections: {
    include: { responsiblePartyVendor: fdVendorSelect },
    orderBy: { sortOrder: "asc" },
  },
  additionalServiceLocations: {
    include: {
      function: { select: { id: true, name: true, functionNumber: true } },
    },
    orderBy: { sortOrder: "asc" },
  },
  equipmentItems: { include: fdEquipmentItemInclude, orderBy: { sortOrder: "asc" } },
  timelineItems: { orderBy: { sortOrder: "asc" } },
  contacts: {
    include: {
      contact: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, organization: true },
      },
    },
    orderBy: { id: "asc" },
  },
  updatedBy: { select: { name: true, email: true } },
} satisfies Prisma.CateringOrderInclude;

const fdFunctionInclude = {
  breakoutGroup: { select: { id: true, name: true } },
  rooms: {
    include: {
      room: {
        select: {
          id: true,
          name: true,
          group: { select: { id: true, name: true, sortOrder: true } },
        },
      },
    },
  },
  schedules: { orderBy: { sortOrder: "asc" } },
  contacts: {
    include: {
      contact: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, organization: true },
      },
    },
    orderBy: { id: "asc" },
  },
  cateringOrder: { include: fdCateringOrderInclude },
  cateringServiceLocations: {
    include: {
      cateringOrder: { include: fdCateringOrderInclude },
    },
    orderBy: { sortOrder: "asc" },
  },
  avOrderFunctions: { include: { avOrder: { include: fdAVOrderInclude } } },
  setupOrderFunctions: { include: { setupOrder: { include: fdSetupOrderInclude } } },
  printOrderFunctions: { include: { printOrder: { include: fdPrintOrderInclude } } },
  supplyOrderLinks: { include: { supplyOrder: { include: fdSupplyOrderInclude } } },
  mediaDeliverableFunctions: { include: { mediaDeliverable: { include: fdMediaDeliverableInclude } } },
  presentationSlots: {
    include: {
      room: { select: { id: true, name: true } },
      advancerVendor: { select: { id: true, name: true } },
      advancerContact: { select: { id: true, firstName: true, lastName: true } },
      presentation: {
        include: {
          track: { select: { id: true, name: true, color: true } },
          speakers: {
            include: {
              contact: {
                select: { id: true, firstName: true, lastName: true, email: true, phone: true, organization: true },
              },
            },
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          },
          advancerVendor: { select: { id: true, name: true } },
          advancerContact: { select: { id: true, firstName: true, lastName: true } },
          avOrderLinks: { include: { avOrder: { include: fdAVOrderInclude } } },
          setupOrderLinks: { include: { setupOrder: { include: fdSetupOrderInclude } } },
          printOrder: { include: fdPrintOrderInclude },
          supplyOrderLinks: { include: { supplyOrder: { include: fdSupplyOrderInclude } } },
          mediaDeliverableLinks: { include: { mediaDeliverable: { include: fdMediaDeliverableInclude } } },
          updatedBy: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  },
  updatedBy: { select: { name: true, email: true } },
} satisfies Prisma.FunctionInclude;

function earliestScheduleTime(schedules: { startTime: Date }[]): number {
  if (schedules.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(...schedules.map((s) => s.startTime.getTime()));
}

export async function getFunctionDetailData(
  eventId: string,
  filters?: FunctionDetailFilters
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, timezone: true },
  });
  if (!event) return null;

  const idFilter = filters?.functionIds?.length ? { id: { in: filters.functionIds } } : {};

  const functions = await prisma.function.findMany({
    where: { eventId, ...idFilter },
    include: fdFunctionInclude,
  });

  functions.sort((a, b) => {
    const ea = earliestScheduleTime(a.schedules);
    const eb = earliestScheduleTime(b.schedules);
    if (ea !== eb) return ea - eb;
    return a.name.localeCompare(b.name);
  });

  const functionIds = functions.map((f) => f.id);
  const workflowInstances =
    functionIds.length > 0
      ? await prisma.workflowInstance.findMany({
          where: { entityType: "function", entityId: { in: functionIds } },
          include: {
            template: {
              include: { steps: { orderBy: { sortOrder: "asc" } } },
            },
            stepCompletions: { include: { step: true } },
            itemCompletions: { include: { item: true } },
          },
        })
      : [];

  const workflowsByFunctionId = new Map<string, typeof workflowInstances>();
  for (const wi of workflowInstances) {
    const list = workflowsByFunctionId.get(wi.entityId) ?? [];
    list.push(wi);
    workflowsByFunctionId.set(wi.entityId, list);
  }

  type FunctionWithWorkflows = (typeof functions)[number] & {
    workflowInstances: typeof workflowInstances;
  };

  const functionsWithWorkflows: FunctionWithWorkflows[] = functions.map((fn) => ({
    ...fn,
    workflowInstances: workflowsByFunctionId.get(fn.id) ?? [],
  }));

  return { event, functions: functionsWithWorkflows };
}

export type FunctionDetailData = NonNullable<Awaited<ReturnType<typeof getFunctionDetailData>>>;
export type FunctionDetailFunction = FunctionDetailData["functions"][number];

export type FunctionPickerOption = {
  value: string;
  label: string;
  functionNumber: string | null;
  typeValue: string | null;
  typeLabel: string;
  typeSortOrder: number;
  firstStart: Date | null;
};

export async function getFunctionPickerOptions(eventId: string): Promise<FunctionPickerOption[]> {
  const [functions, typeOptions] = await Promise.all([
    prisma.function.findMany({
      where: { eventId },
      select: {
        id: true,
        name: true,
        functionNumber: true,
        type: true,
        breakoutGroup: { select: { name: true } },
        schedules: { select: { startTime: true }, orderBy: { startTime: "asc" }, take: 1 },
      },
    }),
    prisma.customOption.findMany({
      where: optionsWhereForEvent(eventId, "function_type"),
      select: { label: true, sortOrder: true },
    }),
  ]);

  const typeMap = new Map(typeOptions.map((o) => [o.label, o]));

  const options = functions.map((fn) => {
    const typeValue = fn.type || null;
    const typeMeta = typeValue ? typeMap.get(typeValue) : null;
    const typeLabel = typeValue ? resolveOptionLabel(typeValue, typeOptions) || typeValue : "Untyped";
    return {
      value: fn.id,
      label: formatFunctionLabel(fn),
      functionNumber: fn.functionNumber,
      typeValue,
      typeLabel,
      typeSortOrder: typeMeta?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      firstStart: fn.schedules[0]?.startTime ?? null,
    };
  });

  options.sort((a, b) => {
    const sa = a.firstStart?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const sb = b.firstStart?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.label.localeCompare(b.label);
  });

  return options;
}

// ── Breakout Schedule reports (Grid + Assignments) ────────────────────────────

export type BreakoutScheduleFilters = {
  groupIds?: string[];
};

export async function getBreakoutScheduleData(
  eventId: string,
  opts: BreakoutScheduleFilters = {}
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, timezone: true },
  });
  if (!event) return null;

  const groupIdFilter =
    opts.groupIds && opts.groupIds.length > 0 ? { in: opts.groupIds } : undefined;

  const groups = await prisma.breakoutGroup.findMany({
    where: { eventId, ...(groupIdFilter ? { id: groupIdFilter } : {}) },
    include: {
      rooms: { include: { room: true }, orderBy: { id: "asc" } },
      functions: {
        where: { type: "BREAKOUT_BLOCK" },
        include: {
          schedules: { orderBy: { startTime: "asc" } },
          rooms: { include: { room: true }, orderBy: { id: "asc" } },
          sessionRoomOverrides: true,
          presentationSlots: {
            include: {
              presentation: {
                include: {
                  speakers: {
                    include: {
                      contact: { select: { id: true, firstName: true, lastName: true } },
                    },
                    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
                  },
                  updatedBy: { select: { name: true, email: true } },
                },
              },
              room: true,
            },
          },
          updatedBy: { select: { name: true, email: true } },
        },
      },
      presentations: {
        include: {
          slots: { include: { room: true } },
          track: true,
          speakers: {
            include: {
              contact: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          },
          updatedBy: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  for (const group of groups) {
    group.functions.sort((a, b) => {
      const aTime = a.schedules[0]?.startTime.getTime() ?? Infinity;
      const bTime = b.schedules[0]?.startTime.getTime() ?? Infinity;
      return aTime - bTime;
    });
    group.presentations.sort((a, b) => a.title.localeCompare(b.title));
  }

  return {
    timezone: event.timezone,
    groups,
  };
}

export type BreakoutScheduleData = NonNullable<
  Awaited<ReturnType<typeof getBreakoutScheduleData>>
>;
export type BreakoutScheduleGroup = BreakoutScheduleData["groups"][number];

export async function getBreakoutGroupOptions(eventId: string) {
  return prisma.breakoutGroup.findMany({
    where: { eventId },
    select: { id: true, name: true },
    orderBy: { sortOrder: "asc" },
  });
}

// ── Event Schedule report ─────────────────────────────────────────────────────

export type EventScheduleFilters = {
  types?: string[];
  includeNonPublic?: boolean;
};

export async function getEventScheduleData(
  eventId: string,
  opts: EventScheduleFilters = {}
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, timezone: true },
  });
  if (!event) return null;

  const typeKeys = opts.types && opts.types.length > 0 ? new Set(opts.types) : null;
  const includeNonPublic = opts.includeNonPublic === true;

  const items = await prisma.functionSchedule.findMany({
    where: {
      function: { eventId },
      ...(includeNonPublic ? {} : { isPublic: true }),
      ...(typeKeys ? { type: { in: Array.from(typeKeys) } } : {}),
    },
    include: {
      function: {
        select: {
          id: true,
          name: true,
          functionNumber: true,
          type: true,
          offSiteLocation: true,
          breakoutGroup: { select: { name: true } },
          rooms: {
            include: { room: { select: { id: true, name: true } } },
          },
          presentationSlots: {
            select: {
              id: true,
              presentation: { select: { id: true, title: true } },
              room: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  return {
    timezone: event.timezone,
    items,
  };
}

export type EventScheduleData = NonNullable<Awaited<ReturnType<typeof getEventScheduleData>>>;
export type EventScheduleItem = EventScheduleData["items"][number];

// ── Packing List report ───────────────────────────────────────────────────────
//
// Destination-centric counterpart to the interactive packing list at
// /events/[id]/packing. Both read the same lines through
// `buildPackingItems` (@/lib/packingItems) so they can never disagree about
// what is on the event; this one is read-only, filterable, printable and
// shareable. Auth-free like every action in this file.

// Absence sentinel, shared verbatim with the report's URL params and filter
// chips (§ Order list § Absence sentinels). Not exported: a "use server" module
// may only export async functions.
const BLANK = "__blank__";

export type PackingListFilters = {
  /** Room ids; `__blank__` selects orders with no room. */
  rooms?: string[];
  packingStatuses?: string[];
  acquisitionStates?: string[];
  /** Provider labels; `__blank__` selects items with no provider. */
  providers?: string[];
  /** Drops IN_TRANSIT and DELIVERED rows — the "what's still open" view. */
  hidePacked?: boolean;
};

export type PackingListOrderBlock = {
  anchorId: string;
  kind: "SUPPLY" | "PRINT";
  orderId: string;
  orderName: string;
  orderHref: string;
  provider: string | null;
  specificLocation: string | null;
  functionNames: string[];
  presentationNames: string[];
  items: PackableItem[];
};

export type PackingListRoomSection = {
  anchorId: string;
  roomId: string | null;
  roomName: string;
  venueName: string | null;
  orders: PackingListOrderBlock[];
  itemCount: number;
};

export type PackingProcurementRow = {
  item: PackableItem;
  roomName: string | null;
  orderName: string;
};

export type PackingProcurementGroup = {
  anchorId: string;
  provider: string | null;
  rows: PackingProcurementRow[];
};

export type PackingListSummary = {
  orderCount: number;
  itemCount: number;
  byPackingStatus: Record<PackingStatus, number>;
  byAcquisitionState: Record<AcquisitionState, number>;
  toProcureCount: number;
};

export type PackingRoomOption = {
  value: string;
  label: string;
  groupName: string | null;
  groupSortOrder: number;
};

const UNASSIGNED_ROOM_LABEL = "No room assigned";
const NO_PROVIDER_LABEL = "No provider";

const VALID_PACKING_STATUS = new Set<string>(PACKING_STATUS_OPTIONS.map((o) => o.value));
const VALID_ACQUISITION_STATE = new Set<string>(ACQUISITION_OPTIONS.map((o) => o.value));

function enumFilterSet(values: string[] | undefined, valid: Set<string>): Set<string> | null {
  if (!values || values.length === 0) return null;
  const kept = values.filter((v) => valid.has(v));
  return kept.length > 0 ? new Set(kept) : null;
}

function compareRoomSections(a: PackingListRoomSection, b: PackingListRoomSection): number {
  // Unassigned always sinks to the bottom — it's a residual bucket, not a room.
  if (a.roomId === null) return b.roomId === null ? 0 : 1;
  if (b.roomId === null) return -1;
  const av = a.venueName ?? "";
  const bv = b.venueName ?? "";
  if (av !== bv) return av.localeCompare(bv);
  return a.roomName.localeCompare(b.roomName);
}

export async function getPackingListData(
  eventId: string,
  opts: PackingListFilters = {}
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!event) return null;

  const { items: allItems } = await buildPackingItems(eventId, {
    includeDestinations: true,
  });

  // Options come off the unfiltered set so a chip never disappears because it
  // is currently deselected.
  const roomOptionMap = new Map<string, PackingRoomOption>();
  let hasUnassignedRoom = false;
  const providerLabels = new Set<string>();
  let hasBlankProvider = false;
  for (const item of allItems) {
    if (item.roomId) {
      if (!roomOptionMap.has(item.roomId)) {
        roomOptionMap.set(item.roomId, {
          value: item.roomId,
          label: item.venueName ? `${item.roomName} · ${item.venueName}` : (item.roomName ?? ""),
          groupName: item.roomGroupName,
          groupSortOrder: item.roomGroupSortOrder ?? Number.MAX_SAFE_INTEGER,
        });
      }
    } else {
      hasUnassignedRoom = true;
    }
    if (item.provider) providerLabels.add(item.provider);
    else hasBlankProvider = true;
  }

  const roomOptions: PackingRoomOption[] = Array.from(roomOptionMap.values()).sort((a, b) => {
    if (a.groupSortOrder !== b.groupSortOrder) return a.groupSortOrder - b.groupSortOrder;
    const ag = a.groupName ?? "";
    const bg = b.groupName ?? "";
    if (ag !== bg) return ag.localeCompare(bg);
    return a.label.localeCompare(b.label);
  });
  if (hasUnassignedRoom) {
    roomOptions.push({
      value: BLANK,
      label: UNASSIGNED_ROOM_LABEL,
      groupName: null,
      groupSortOrder: Number.MAX_SAFE_INTEGER,
    });
  }

  const providerOptions = Array.from(providerLabels)
    .sort((a, b) => a.localeCompare(b))
    .map((label) => ({ value: label, label }));
  if (hasBlankProvider) {
    providerOptions.push({ value: BLANK, label: NO_PROVIDER_LABEL });
  }

  const roomFilter = opts.rooms && opts.rooms.length > 0 ? new Set(opts.rooms) : null;
  // The two enum-backed filters drop values that aren't real enum members, so a
  // hand-edited `?packing=banana` reads as "no filter" instead of silently
  // emptying the report and looking like a backend bug.
  const statusFilter = enumFilterSet(opts.packingStatuses, VALID_PACKING_STATUS);
  const acquisitionFilter = enumFilterSet(opts.acquisitionStates, VALID_ACQUISITION_STATE);
  const providerFilter =
    opts.providers && opts.providers.length > 0 ? new Set(opts.providers) : null;
  const hidePacked = opts.hidePacked === true;

  const items = allItems.filter((item) => {
    if (roomFilter && !roomFilter.has(item.roomId ?? BLANK)) return false;
    if (statusFilter && !statusFilter.has(item.packingStatus)) return false;
    if (acquisitionFilter && !acquisitionFilter.has(item.acquisitionState)) return false;
    if (providerFilter && !providerFilter.has(item.provider ?? BLANK)) return false;
    if (hidePacked && item.packingStatus !== "NEEDED") return false;
    return true;
  });

  // Room → order → items. Insertion order preserves the item query's
  // sortOrder, so an order's lines read the way they do on its detail page.
  const sections = new Map<string, PackingListRoomSection>();
  const orderBlocks = new Map<string, PackingListOrderBlock>();

  for (const item of items) {
    const roomKey = item.roomId ?? BLANK;
    let section = sections.get(roomKey);
    if (!section) {
      section = {
        anchorId: item.roomId ? `room-${item.roomId}` : "room-unassigned",
        roomId: item.roomId,
        roomName: item.roomName ?? UNASSIGNED_ROOM_LABEL,
        venueName: item.venueName,
        orders: [],
        itemCount: 0,
      };
      sections.set(roomKey, section);
    }

    const orderKey = `${roomKey}|${item.kind}|${item.parentOrderId}`;
    let block = orderBlocks.get(orderKey);
    if (!block) {
      block = {
        anchorId: `${item.kind === "SUPPLY" ? "supply" : "print"}-order-${item.parentOrderId}`,
        kind: item.kind,
        orderId: item.parentOrderId,
        orderName: item.parentOrderName,
        orderHref: item.parentOrderHref,
        provider: item.orderProvider,
        specificLocation: item.orderSpecificLocation,
        functionNames: item.functionNames,
        presentationNames: item.presentationNames,
        items: [],
      };
      orderBlocks.set(orderKey, block);
      section.orders.push(block);
    }
    block.items.push(item);
    section.itemCount += 1;
  }

  const roomSections = Array.from(sections.values()).sort(compareRoomSections);
  for (const section of roomSections) {
    section.orders.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "SUPPLY" ? -1 : 1;
      return a.orderName.localeCompare(b.orderName);
    });
  }

  // Procurement rollup: the shopping list. Grouped by the item's effective
  // provider so a buyer can work one supplier at a time.
  const procurementMap = new Map<string, PackingProcurementRow[]>();
  for (const item of items) {
    if (item.acquisitionState !== "TO_PROCURE") continue;
    const key = item.provider ?? BLANK;
    const rows = procurementMap.get(key) ?? [];
    rows.push({
      item,
      roomName: item.roomName,
      orderName: item.parentOrderName,
    });
    procurementMap.set(key, rows);
  }
  const procurement: PackingProcurementGroup[] = Array.from(procurementMap.entries())
    .sort(([a], [b]) => {
      if (a === BLANK) return b === BLANK ? 0 : 1;
      if (b === BLANK) return -1;
      return a.localeCompare(b);
    })
    // Provider labels are free text, so the anchor is positional rather than
    // derived from the name — kebab-case and unique on the page.
    .map(([key, rows], i) => ({
      anchorId: `procurement-group-${i}`,
      provider: key === BLANK ? null : key,
      rows,
    }));

  const byPackingStatus: Record<PackingStatus, number> = {
    NEEDED: 0,
    IN_TRANSIT: 0,
    DELIVERED: 0,
  };
  const byAcquisitionState: Record<AcquisitionState, number> = {
    ON_HAND: 0,
    TO_PROCURE: 0,
    DROP_SHIP: 0,
  };
  for (const item of items) {
    byPackingStatus[item.packingStatus] += 1;
    byAcquisitionState[item.acquisitionState] += 1;
  }

  const summary: PackingListSummary = {
    orderCount: new Set(items.map((i) => `${i.kind}:${i.parentOrderId}`)).size,
    itemCount: items.length,
    byPackingStatus,
    byAcquisitionState,
    toProcureCount: byAcquisitionState.TO_PROCURE,
  };

  return {
    summary,
    roomSections,
    procurement,
    roomOptions,
    providerOptions,
  };
}

export type PackingListData = NonNullable<Awaited<ReturnType<typeof getPackingListData>>>;

// ─── Event Specifications Guide (APEX ESG) ──────────────────────────────────

export type EsgFilters = {
  parts?: EsgPart[];
  days?: string[];
  functionIds?: string[];
  showBlank?: boolean;
  includeBilling?: boolean;
};

export async function getEsgData(eventId: string, filters: EsgFilters = {}) {
  const narrative = await loadEsgNarrativeData(eventId);
  if (!narrative) return null;
  const [functions, booths, scheduleTypes] = await Promise.all([
    prisma.function.findMany({ where: { eventId }, include: esgFunctionInclude }),
    prisma.exhibitBooth.findMany({ where: { eventId }, include: esgBoothInclude }),
    prisma.customOption.findMany({
      where: optionsWhereForEvent(eventId, "schedule_type"),
      select: { label: true, group: true },
    }),
  ]);
  const support = new Set(scheduleTypes.filter((o) => o.group === "SETUP" || o.group === "TEARDOWN").map((o) => o.label));
  if (support.size === 0) ["Setup", "Breakdown"].forEach((l) => support.add(l));

  const dayOptions = esgDayOptions(functions, support, narrative.event.timezone);
  const functionOptions = functions
    .filter((f) => f.status !== "CANCELLED" && f.schedules.length > 0)
    .map((f) => ({ value: f.id, label: formatFunctionLabel(f), functionNumber: f.functionNumber }))
    .sort((a, b) => compareFunctionNumbers(a.functionNumber, b.functionNumber) || a.label.localeCompare(b.label));
  // Unknown days / ids would silently empty the report; drop them instead.
  const validDays = new Set(dayOptions);
  const validFns = new Set(functionOptions.map((f) => f.value));
  const applied = {
    parts: filters.parts?.length ? filters.parts : ESG_PARTS,
    days: (filters.days ?? []).filter((d) => validDays.has(d)),
    functionIds: (filters.functionIds ?? []).filter((id) => validFns.has(id)),
    showBlank: filters.showBlank ?? false,
    includeBilling: filters.includeBilling ?? true,
  };
  const document = assembleEsgDocument(narrative, functions, booths, support, applied);
  return { document, applied, dayOptions, functionOptions };
}

export type EsgData = NonNullable<Awaited<ReturnType<typeof getEsgData>>>;

// ─── Post-Event Report (APEX PER) ───────────────────────────────────────────

export async function getPostEventReportData(eventId: string, filters: { showBlank?: boolean } = {}) {
  const data = await loadPerData(eventId);
  if (!data) return null;
  return assemblePerDocument(data, { showBlank: filters.showBlank ?? false });
}
