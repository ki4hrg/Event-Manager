"use server";

import { prisma } from "@/lib/prisma";
import type { ModelType } from "@/app/vendors/actions";
import { resolveOptionLabel } from "@/lib/optionUtils";

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
  modelType: "AV_ORDER" | "CATERING_ORDER" | "SETUP_ORDER";
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
  modelType: "AV_ORDER" | "CATERING_ORDER" | "SETUP_ORDER";
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
  type: string;
  breakoutGroup: { name: string } | null;
  schedules: { startTime: Date; endTime: Date }[];
};

type OrderRef = {
  functions: FunctionRef[];
  presentation?: { slots: Array<{ function: FunctionRef }> } | null;
};

function getOrderFns(order: OrderRef): FunctionRef[] {
  if (order.functions.length > 0) return order.functions;
  return order.presentation?.slots.map((s) => s.function) ?? [];
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
    functionNames: [fn.name],
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
  const [equipmentItems, inputItems, monitorMixes, setupTables, functionTypeOptions] = await Promise.all([
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
            function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } },
          },
        },
        setupOrder: {
          select: {
            id: true,
            name: true,
            functions: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } },
            presentation: { select: { slots: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } },
          },
        },
        avOrder: {
          select: {
            id: true,
            name: true,
            functions: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } },
            presentation: { select: { slots: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } },
          },
        },
        videoSection: {
          select: {
            avOrder: {
              select: {
                id: true,
                name: true,
                functions: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } },
                presentation: { select: { slots: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } },
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
                    functions: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } },
                    presentation: { select: { slots: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } },
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
                functions: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } },
                presentation: { select: { slots: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } },
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
            functions: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } },
            presentation: { select: { slots: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } },
          },
        },
      },
    }),
    prisma.customOption.findMany({ where: { category: "function_type" }, select: { label: true } }),
  ]);

  const normalized: NormalizedItem[] = [];

  for (const item of equipmentItems) {
    const attrVendor = item.providerVendor;
    const attrContact = item.providerContact;
    let orderId: string;
    let orderName: string;
    let modelType: "AV_ORDER" | "CATERING_ORDER" | "SETUP_ORDER";
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

export async function getOrderAssignedVendors(eventId: string) {
  const vendors = await prisma.vendor.findMany({
    where: {
      OR: [
        { cateringOrderVendors: { some: { cateringOrder: { eventId } } } },
        { avOrderVendors: { some: { avOrder: { eventId } } } },
        { setupOrderVendors: { some: { setupOrder: { eventId } } } },
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
} as const;

export async function getVendorHandoffData(eventId: string, vendorId: string) {
  const [vendor, cateringOrders, avOrders, setupOrders] = await Promise.all([
    prisma.vendor.findUnique({
      where: { id: vendorId },
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
        equipmentItems: { include: equipmentItemInclude, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.aVOrder.findMany({
      where: { eventId, vendors: { some: { vendorId } } },
      include: {
        functions: { include: functionInclude },
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
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.setupOrder.findMany({
      where: { eventId, vendors: { some: { vendorId } } },
      include: {
        room: { select: { id: true, name: true } },
        functions: { include: functionInclude },
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
        tables: {
          include: { providerVendor: { select: { id: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
        equipmentItems: { include: equipmentItemInclude, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!vendor) return null;

  const relevantModelTypes: ModelType[] = [
    ...(cateringOrders.length > 0 ? (["CATERING_ORDER"] as const) : []),
    ...(avOrders.length > 0 ? (["AV_ORDER"] as const) : []),
    ...(setupOrders.length > 0 ? (["SETUP_ORDER"] as const) : []),
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

  return { vendor, cateringOrders, avOrders, setupOrders, keyStaff };
}
